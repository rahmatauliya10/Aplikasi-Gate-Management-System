import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { StartWarehouseDto } from './dto/start-warehouse.dto';
import { CompleteWarehouseDto } from './dto/complete-warehouse.dto';
import { WarehouseQueryDto } from './dto/warehouse-query.dto';
import { TransactionStatus, Prisma, ProcessType } from '@prisma/client';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class WarehouseService {
  private readonly logger = new Logger(WarehouseService.name);

  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
  ) {}

  private async getWarehouseAccess(
    user: JwtPayloadUser,
  ): Promise<ProcessType[]> {
    if (user.role === 'ADMIN') {
      return [ProcessType.GBB, ProcessType.GBJ, ProcessType.GSP];
    }
    const access = await this.prisma.userWarehouseAccess.findMany({
      where: { userId: user.id },
      select: { processType: true },
    });
    return access.map((a) => a.processType);
  }

  async getQueue(query: WarehouseQueryDto, user: JwtPayloadUser) {
    const {
      page = 1,
      limit = 10,
      search,
      processType,
      status,
      startDate,
      endDate,
    } = query;
    const allowedProcessTypes = await this.getWarehouseAccess(user);

    const andConditions: Prisma.TransactionWhereInput[] = [];

    // Queue base conditions
    andConditions.push({
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
    });

    const statusConditions: Prisma.TransactionWhereInput[] = [
      { processType: 'GBB', status: 'QC_VEHICLE_PASSED' },
      { processType: 'GSP', status: 'QC_VEHICLE_PASSED' },
      { processType: 'GBJ', status: 'QC_VEHICLE_PASSED' },
    ];
    andConditions.push({ OR: statusConditions });

    if (search) {
      andConditions.push({
        OR: [
          { transactionNumber: { contains: search, mode: 'insensitive' } },
          { plateNumber: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    if (processType) {
      if (!allowedProcessTypes.includes(processType)) {
        return {
          success: true,
          message: 'Warehouse queue retrieved successfully',
          data: [],
          meta: { page, limit, total: 0, totalPages: 0 },
        };
      }
      andConditions.push({ processType });
    } else {
      andConditions.push({ processType: { in: allowedProcessTypes } });
    }

    if (status) {
      andConditions.push({ status });
    }

    if (startDate || endDate) {
      const dateCond: any = {};
      if (startDate) dateCond.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateCond.lte = end;
      }
      andConditions.push({ createdAt: dateCond });
    }

    const where: Prisma.TransactionWhereInput = { AND: andConditions };
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    await this.activityLogsService
      .logAction({
        userId: user.id,
        action: 'WAREHOUSE_QUEUE_VIEW',
        module: 'WAREHOUSE',

        description: `User ${user.email} viewed warehouse queue`,
        status: 'SUCCESS',
      })
      .catch(() => {});

    return {
      success: true,
      message: 'Warehouse queue retrieved successfully',
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async startWarehouse(
    transactionId: string,
    dto: StartWarehouseDto,
    user: JwtPayloadUser,
  ) {
    this.logger.log(
      `Warehouse start attempt for transaction ${transactionId} by ${user.email}`,
    );

    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!tx) {
      throw new NotFoundException({
        success: false,
        message: 'Transaction not found',
        errors: [],
      });
    }

    const allowedProcessTypes = await this.getWarehouseAccess(user);
    if (!allowedProcessTypes.includes(tx.processType)) {
      this.logger.warn(
        `Warehouse access denied for user ${user.email} on ${tx.processType}`,
      );
      await this.activityLogsService
        .logAction({
          userId: user.id,
          action: 'WAREHOUSE_ACCESS_DENIED',
          module: 'WAREHOUSE',

          referenceId: transactionId,
          description: `User ${user.email} attempted to start warehouse for unauthorized processType ${tx.processType}`,
          status: 'SUCCESS',
        })
        .catch(() => {});
      throw new ForbiddenException({
        success: false,
        message: 'You do not have access to process this transaction type',
        errors: [],
      });
    }

    if (tx.status === 'CANCELLED' || tx.status === 'COMPLETED') {
      await this.activityLogsService
        .logAction({
          userId: user.id,
          action: 'WAREHOUSE_FLOW_REJECTED',
          module: 'WAREHOUSE',
          referenceId: transactionId,
          description: `Warehouse start rejected: Transaction is already ${tx.status}`,
          status: 'SUCCESS',
        })
        .catch(() => {});
      throw new BadRequestException({
        success: false,
        message: `Cannot process warehouse for ${tx.status} transaction`,
        errors: [],
      });
    }

    if (tx.status === 'WAREHOUSE_IN_PROGRESS') {
      await this.activityLogsService
        .logAction({
          userId: user.id,
          action: 'WAREHOUSE_DUPLICATE_REJECTED',
          module: 'WAREHOUSE',
          referenceId: transactionId,
          description: `Warehouse start rejected: Transaction already started warehouse process`,
          status: 'SUCCESS',
        })
        .catch(() => {});
      throw new ConflictException({
        success: false,
        message:
          'Warehouse process has already been started for this transaction',
        errors: [],
      });
    }

    const expectedStatus = 'QC_VEHICLE_PASSED';
    if (tx.status !== expectedStatus) {
      await this.activityLogsService
        .logAction({
          userId: user.id,
          action: 'WAREHOUSE_FLOW_REJECTED',
          module: 'WAREHOUSE',
          referenceId: transactionId,
          description: `Warehouse start rejected: Current status is ${tx.status}, expected ${expectedStatus}`,
          status: 'SUCCESS',
        })
        .catch(() => {});
      throw new BadRequestException({
        success: false,
        message: `Transaction must be in ${expectedStatus} status to start warehouse process (current: ${tx.status})`,
        errors: [],
      });
    }

    const updated = await this.prisma.$transaction(async (prismaTx) => {
      const maxRev = await prismaTx.warehouseProcess.aggregate({
        where: { transactionId },
        _max: { revision: true },
      });
      const nextRevision = (maxRev._max.revision ?? 0) + 1;

      const claimed = await prismaTx.transaction.updateMany({
        where: {
          id: transactionId,
          status: 'QC_VEHICLE_PASSED',
        },
        data: {
          revision: { increment: 1 },
          status: 'WAREHOUSE_IN_PROGRESS',
          warehouseStartAt: tx.warehouseStartAt || new Date(),
          warehouseStartById: user.id,
          ...(dto.suratJalanNumber && {
            suratJalanNumber: dto.suratJalanNumber,
          }),
          ...(dto.poNumber && { poNumber: dto.poNumber }),
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException(
          'Warehouse process has already been started or status changed concurrently',
        );
      }

      await prismaTx.warehouseProcess.create({
        data: {
          transactionId,
          revision: nextRevision,
          processType: tx.processType,
          startAt: new Date(),
          startById: user.id,
          remarks: dto.remarks || null,
        },
      });

      await prismaTx.transactionStatusHistory.create({
        data: {
          transactionId,
          oldStatus: tx.status,
          newStatus: 'WAREHOUSE_IN_PROGRESS',
          changedById: user.id,
          notes: dto.remarks || 'Warehouse process started',
        },
      });

      return prismaTx.transaction.findUnique({
        where: { id: transactionId },
        include: {
          warehouseStartBy: { select: { id: true, name: true, role: true } },
        },
      });
    });

    if (!updated) {
      throw new NotFoundException(
        'Transaction not found after starting warehouse process',
      );
    }

    this.logger.log(
      `Warehouse started successfully: ${updated.transactionNumber}`,
    );

    await this.activityLogsService
      .logAction({
        userId: user.id,
        action: 'WAREHOUSE_START',
        module: 'WAREHOUSE',
        referenceId: transactionId,
        description: JSON.stringify({ remarks: dto.remarks }),
        status: 'SUCCESS',
      })
      .catch(() => {});

    return {
      success: true,
      message: 'Warehouse process started successfully',
      data: {
        id: updated.id,
        transactionNumber: updated.transactionNumber,
        plateNumber: updated.plateNumber,
        processType: updated.processType,
        status: updated.status,
        suratJalanNumber: updated.suratJalanNumber,
        poNumber: updated.poNumber,
        warehouseStartAt: updated.warehouseStartAt,
        warehouseStartBy: updated.warehouseStartBy
          ? {
              id: updated.warehouseStartBy.id,
              name: updated.warehouseStartBy.name,
              role: updated.warehouseStartBy.role,
            }
          : null,
      },
    };
  }

  async completeWarehouse(
    transactionId: string,
    dto: CompleteWarehouseDto,
    user: JwtPayloadUser,
  ) {
    this.logger.log(
      `Warehouse complete attempt for transaction ${transactionId} by ${user.email}`,
    );

    if (dto.actualWeight == null && dto.actualQuantity == null) {
      throw new BadRequestException({
        success: false,
        message: 'At least one of actualWeight or actualQuantity is required',
        errors: [],
      });
    }

    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { warehouseProcesses: true },
    });

    if (!tx) {
      throw new NotFoundException({
        success: false,
        message: 'Transaction not found',
        errors: [],
      });
    }

    const allowedProcessTypes = await this.getWarehouseAccess(user);
    if (!allowedProcessTypes.includes(tx.processType)) {
      this.logger.warn(
        `Warehouse access denied for user ${user.email} on ${tx.processType}`,
      );
      await this.activityLogsService
        .logAction({
          userId: user.id,
          action: 'WAREHOUSE_ACCESS_DENIED',
          module: 'WAREHOUSE',
          referenceId: transactionId,
          description: `User ${user.email} attempted to complete warehouse for unauthorized processType ${tx.processType}`,
          status: 'SUCCESS',
        })
        .catch(() => {});
      throw new ForbiddenException({
        success: false,
        message: 'You do not have access to process this transaction type',
        errors: [],
      });
    }

    if (tx.status === 'CANCELLED' || tx.status === 'COMPLETED') {
      await this.activityLogsService
        .logAction({
          userId: user.id,
          action: 'WAREHOUSE_FLOW_REJECTED',
          module: 'WAREHOUSE',
          referenceId: transactionId,
          description: `Warehouse complete rejected: Transaction is already ${tx.status}`,
          status: 'SUCCESS',
        })
        .catch(() => {});
      throw new BadRequestException({
        success: false,
        message: `Cannot process warehouse for ${tx.status} transaction`,
        errors: [],
      });
    }

    if (
      tx.status !== 'WAREHOUSE_IN_PROGRESS' &&
      tx.status !== 'QC_VEHICLE_PASSED'
    ) {
      await this.activityLogsService
        .logAction({
          userId: user.id,
          action: 'WAREHOUSE_FLOW_REJECTED',
          module: 'WAREHOUSE',
          referenceId: transactionId,
          description: `Warehouse complete rejected: Transaction is not in WAREHOUSE_IN_PROGRESS or QC_VEHICLE_PASSED status`,
          status: 'SUCCESS',
        })
        .catch(() => {});
      throw new BadRequestException({
        success: false,
        message: `Transaction must be in WAREHOUSE_IN_PROGRESS or QC_VEHICLE_PASSED status (current: ${tx.status})`,
        errors: [],
      });
    }

    if (tx.warehouseEndAt) {
      await this.activityLogsService
        .logAction({
          userId: user.id,
          action: 'WAREHOUSE_DUPLICATE_REJECTED',
          module: 'WAREHOUSE',
          referenceId: transactionId,
          description: `Warehouse complete rejected: Transaction already completed warehouse process`,
          status: 'SUCCESS',
        })
        .catch(() => {});
      throw new BadRequestException({
        success: false,
        message:
          'Warehouse process has already been completed for this transaction',
        errors: [],
      });
    }

    let nextStatus: TransactionStatus;
    if (tx.processType === 'GBB' || tx.processType === 'GSP') {
      nextStatus = 'INCOMING_CHECK_PENDING';
    } else {
      nextStatus = 'WAREHOUSE_DONE';
    }

    const updated = await this.prisma.$transaction(async (prismaTx) => {
      // Serialize deliveryChecklist if present and append to remarks
      let finalRemarks = dto.remarks || '';
      if (dto.deliveryChecklist) {
        const checklistStr =
          typeof dto.deliveryChecklist === 'object'
            ? JSON.stringify(dto.deliveryChecklist)
            : String(dto.deliveryChecklist);
        finalRemarks = finalRemarks
          ? `${finalRemarks} | Checklist: ${checklistStr}`
          : `Checklist: ${checklistStr}`;
      }

      // Find the existing active warehouse process
      const activeProcess = await prismaTx.warehouseProcess.findFirst({
        where: { transactionId, endAt: null },
      });

      // Calculate next revision before checking for active process
      const maxRev = await prismaTx.warehouseProcess.aggregate({
        where: { transactionId },
        _max: { revision: true },
      });
      const nextRevision = (maxRev._max.revision ?? 0) + 1;

      if (activeProcess) {
        await prismaTx.warehouseProcess.update({
          where: { id: activeProcess.id },
          data: {
            endAt: new Date(),
            endById: user.id,
            actualWeight: dto.actualWeight,
            actualQuantity: dto.actualQuantity,
            unit: dto.unit,
            palletCount: dto.palletCount,
            bagCount: dto.bagCount,
            rollCount: dto.rollCount,
            condition: dto.condition,
            remarks: finalRemarks || null,
          },
        });
      } else {
        // Fallback if somehow missing process record
        await prismaTx.warehouseProcess.create({
          data: {
            transactionId,
            revision: nextRevision,
            processType: tx.processType,
            startAt: tx.warehouseStartAt || new Date(),
            startById: tx.warehouseStartById || user.id,
            endAt: new Date(),
            endById: user.id,
            actualWeight: dto.actualWeight,
            actualQuantity: dto.actualQuantity,
            unit: dto.unit,
            palletCount: dto.palletCount,
            bagCount: dto.bagCount,
            rollCount: dto.rollCount,
            condition: dto.condition,
            remarks: finalRemarks || null,
          },
        });
      }

      return prismaTx.transaction.update({
        where: { id: transactionId },
        data: {
          revision: { increment: 1 },
          status: nextStatus,
          warehouseStartAt: tx.warehouseStartAt || new Date(),
          warehouseStartById: tx.warehouseStartById || user.id,
          warehouseEndAt: new Date(),
          warehouseEndById: user.id,
          actualWeight: dto.actualWeight,
          actualQuantity: dto.actualQuantity,
          warehouseUnit: dto.unit,
          remarks: tx.remarks
            ? finalRemarks
              ? `${tx.remarks} | ${finalRemarks}`
              : tx.remarks
            : finalRemarks || null,
          ...(dto.suratJalanNumber && {
            suratJalanNumber: dto.suratJalanNumber,
          }),
          statusHistory: {
            create: {
              oldStatus: tx.status,
              newStatus: nextStatus,
              changedById: user.id,
              notes: finalRemarks || 'Warehouse process completed',
            },
          },
        },
        include: {
          warehouseEndBy: { select: { id: true, name: true, role: true } },
        },
      });
    });

    this.logger.log(
      `Warehouse completed successfully: ${updated.transactionNumber}`,
    );

    await this.activityLogsService
      .logAction({
        userId: user.id,
        action: 'WAREHOUSE_COMPLETE',
        module: 'WAREHOUSE',
        referenceId: transactionId,
        description:
          `Warehouse process completed for vehicle ${updated.plateNumber}` ||
          (dto as any),
        status: 'SUCCESS',
      })
      .catch(() => {});

    return {
      success: true,
      message: 'Warehouse process completed successfully',
      data: {
        id: updated.id,
        transactionNumber: updated.transactionNumber,
        plateNumber: updated.plateNumber,
        processType: updated.processType,
        status: updated.status,
        actualWeight: updated.actualWeight,
        actualQuantity: updated.actualQuantity,
        unit: updated.warehouseUnit,
        warehouseStartAt: updated.warehouseStartAt,
        warehouseEndAt: updated.warehouseEndAt,
        warehouseEndBy: updated.warehouseEndBy
          ? {
              id: updated.warehouseEndBy.id,
              name: updated.warehouseEndBy.name,
              role: updated.warehouseEndBy.role,
            }
          : null,
      },
    };
  }

  async submitIncomingCheck(
    transactionId: string,
    dto: {
      decision: 'passed' | 'rejected';
      rejectReason?: string;
      remarks?: string;
      checklist?: any;
    },
    user: JwtPayloadUser,
  ) {
    this.logger.log(
      `Submitting incoming check from warehouse for transaction ${transactionId} by ${user.email}`,
    );

    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });
    if (!tx) {
      throw new NotFoundException({
        success: false,
        message: 'Transaction not found',
        errors: [],
      });
    }

    const allowedProcessTypes = await this.getWarehouseAccess(user);
    if (!allowedProcessTypes.includes(tx.processType)) {
      throw new ForbiddenException({
        success: false,
        message: 'You do not have access to process this transaction type',
        errors: [],
      });
    }

    if (tx.processType === 'GBB' && user.role === 'WAREHOUSE') {
      this.logger.warn(
        `SoD violation: Warehouse role attempted incoming check on GBB transaction ${transactionId}`,
      );
      await this.activityLogsService
        .logAction({
          userId: user.id,
          action: 'SOD_VIOLATION_BLOCKED',
          module: 'WAREHOUSE',
          referenceId: transactionId,
          description: `Blocked Warehouse role from executing GBB incoming check`,
          status: 'FAILED',
        })
        .catch(() => {});
      throw new ForbiddenException({
        success: false,
        message:
          'Segregation of Duties (SoD) violation: Akses ditolak! Proses pemeriksaan incoming GBB wajib dieksekusi oleh tim QC atau Admin.',
        errors: [],
      });
    }

    const allowedStatuses = ['INCOMING_CHECK_PENDING'];
    if (dto.decision === 'rejected') {
      allowedStatuses.push('WAREHOUSE_IN_PROGRESS');
    }

    if (!allowedStatuses.includes(tx.status)) {
      throw new BadRequestException({
        success: false,
        message: `Transaction must be in [${allowedStatuses.join(', ')}] status (current: ${tx.status})`,
        errors: [],
      });
    }

    const nextStatus =
      dto.decision === 'passed'
        ? 'INCOMING_CHECK_PASSED'
        : 'INCOMING_CHECK_REJECTED';

    const notesContent =
      dto.remarks ||
      dto.rejectReason ||
      'Incoming check completed via Warehouse';

    const updated = await this.prisma.$transaction(async (prismaTx) => {
      const maxRev = await prismaTx.incomingMaterialCheck.aggregate({
        where: { transactionId },
        _max: { revision: true },
      });
      const nextRevision = (maxRev._max.revision ?? 0) + 1;

      await prismaTx.incomingMaterialCheck.create({
        data: {
          transactionId,
          revision: nextRevision,
          result: dto.decision === 'passed' ? 'PASS' : 'REJECT',
          notes: notesContent,
          checkedById: user.id,
          completedAt: new Date(),
        },
      });

      return prismaTx.transaction.update({
        where: { id: transactionId },
        data: {
          revision: { increment: 1 },
          status: nextStatus,
          qcEndAt: new Date(),
          remarks: dto.remarks
            ? `${tx.remarks ? tx.remarks + ' | ' : ''}GSP Check: ${dto.remarks}`
            : tx.remarks,
          statusHistory: {
            create: {
              oldStatus: tx.status,
              newStatus: nextStatus,
              changedById: user.id,
              notes: notesContent,
            },
          },
        },
      });
    });

    return {
      success: true,
      message: `Incoming check submitted successfully (${dto.decision})`,
      data: updated,
    };
  }

  async getProcessDetail(transactionId: string, user: JwtPayloadUser) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        warehouseStartBy: { select: { id: true, name: true } },
        warehouseEndBy: { select: { id: true, name: true } },
        warehouseProcesses: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!tx) {
      throw new NotFoundException({
        success: false,
        message: 'Transaction not found',
        errors: [],
      });
    }

    const allowedProcessTypes = await this.getWarehouseAccess(user);
    if (!allowedProcessTypes.includes(tx.processType)) {
      throw new ForbiddenException({
        success: false,
        message: 'You do not have access to process this transaction type',
        errors: [],
      });
    }

    const process = tx.warehouseProcesses[0];

    await this.activityLogsService
      .logAction({
        userId: user.id,
        action: 'WAREHOUSE_PROCESS_VIEW',
        module: 'WAREHOUSE',
        referenceId: transactionId,
        description: `User ${user.email} viewed warehouse process for ${tx.transactionNumber}`,
        status: 'SUCCESS',
      })
      .catch(() => {});

    return {
      success: true,
      message: 'Warehouse process retrieved successfully',
      data: {
        transactionId: tx.id,
        transactionNumber: tx.transactionNumber,
        plateNumber: tx.plateNumber,
        processType: tx.processType,
        status: tx.status,
        actualWeight: tx.actualWeight,
        actualQuantity: tx.actualQuantity,
        unit: tx.warehouseUnit,
        palletCount: process?.palletCount || null,
        bagCount: process?.bagCount || null,
        rollCount: process?.rollCount || null,
        condition: process?.condition || null,
        warehouseStartAt: tx.warehouseStartAt,
        warehouseEndAt: tx.warehouseEndAt,
        warehouseStartBy: tx.warehouseStartBy
          ? { id: tx.warehouseStartBy.id, name: tx.warehouseStartBy.name }
          : null,
        warehouseEndBy: tx.warehouseEndBy
          ? { id: tx.warehouseEndBy.id, name: tx.warehouseEndBy.name }
          : null,
        remarks: process?.remarks || tx.remarks || null,
      },
    };
  }

  async getHistory(query: WarehouseQueryDto, user: JwtPayloadUser) {
    const {
      page = 1,
      limit = 10,
      search,
      processType,
      status,
      startDate,
      endDate,
    } = query;
    const allowedProcessTypes = await this.getWarehouseAccess(user);

    const andConditions: Prisma.TransactionWhereInput[] = [];

    // History base conditions: must have completed warehouse process
    andConditions.push({ warehouseEndAt: { not: null } });

    if (search) {
      andConditions.push({
        OR: [
          { transactionNumber: { contains: search, mode: 'insensitive' } },
          { plateNumber: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    if (processType) {
      if (!allowedProcessTypes.includes(processType)) {
        return {
          success: true,
          message: 'Warehouse history retrieved successfully',
          data: [],
          meta: { page, limit, total: 0, totalPages: 0 },
        };
      }
      andConditions.push({ processType });
    } else {
      andConditions.push({ processType: { in: allowedProcessTypes } });
    }

    if (status) {
      andConditions.push({ status });
    }

    if (startDate || endDate) {
      const dateCond: any = {};
      if (startDate) dateCond.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateCond.lte = end;
      }
      andConditions.push({ warehouseEndAt: dateCond });
    }

    const where: Prisma.TransactionWhereInput = { AND: andConditions };
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { warehouseEndAt: 'desc' },
        include: {
          warehouseStartBy: { select: { id: true, name: true } },
          warehouseEndBy: { select: { id: true, name: true } },
        },
      }),
    ]);

    await this.activityLogsService
      .logAction({
        userId: user.id,
        action: 'WAREHOUSE_HISTORY_VIEW',
        module: 'WAREHOUSE',
        description: `User ${user.email} viewed warehouse history`,
        status: 'SUCCESS',
      })
      .catch(() => {});

    return {
      success: true,
      message: 'Warehouse history retrieved successfully',
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async uploadAttachment(
    transactionId: string,
    file: any,
    dto: any,
    user: JwtPayloadUser,
  ) {
    if (!file) throw new BadRequestException('File is required');
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });
    if (!tx) throw new NotFoundException('Transaction not found');

    const allowedProcessTypes = await this.getWarehouseAccess(user);
    if (!allowedProcessTypes.includes(tx.processType)) {
      throw new ForbiddenException({
        success: false,
        message: 'You do not have access to process this transaction type',
        errors: [],
      });
    }

    const attachment = await this.prisma.attachment.create({
      data: {
        transactionId,
        module: 'WAREHOUSE',
        attachmentType: dto?.attachmentType || 'DOCUMENT',
        originalName: file.originalname,
        fileName: file.filename,
        filePath: file.path,
        mimeType: file.mimetype,
        size: file.size,
        description: dto?.description,
        uploadedById: user.id,
      },
    });

    return {
      success: true,
      message: 'Warehouse attachment uploaded successfully',
      data: attachment,
    };
  }
}
