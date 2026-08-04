import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { WeighInDto } from './dto/weigh-in.dto';
import { WeighOutDto } from './dto/weigh-out.dto';
import { WeighbridgeQueryDto } from './dto/weighbridge-query.dto';
import { TransactionStatus, Prisma } from '@prisma/client';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class WeighbridgeService {
  private readonly logger = new Logger(WeighbridgeService.name);

  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
  ) {}

  async getQueue(query: WeighbridgeQueryDto, user: JwtPayloadUser) {
    const {
      page = 1,
      limit = 10,
      search,
      processType,
      type,
      startDate,
      endDate,
    } = query;

    const andConditions: Prisma.TransactionWhereInput[] = [];

    // Exclude completed or cancelled transactions
    andConditions.push({
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
    });

    if (search) {
      andConditions.push({
        OR: [
          { transactionNumber: { contains: search, mode: 'insensitive' } },
          { plateNumber: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    if (processType) {
      andConditions.push({ processType });
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

    // Filter by type (IN or OUT) queue status conditions
    const statusConditions: Prisma.TransactionWhereInput[] = [];
    if (type === 'IN') {
      statusConditions.push({ status: 'REGISTERED' });
    } else if (type === 'OUT') {
      statusConditions.push(
        { processType: 'GBB', status: 'INCOMING_CHECK_PASSED' },
        { processType: 'GBB', status: 'INCOMING_CHECK_REJECTED' },
        { processType: 'GBB', status: 'QC_VEHICLE_REJECTED' },
        { processType: 'GSP', status: 'INCOMING_CHECK_PASSED' },
        { processType: 'GSP', status: 'INCOMING_CHECK_REJECTED' },
        { processType: 'GSP', status: 'QC_VEHICLE_REJECTED' },
        { processType: 'GBJ', status: 'WAREHOUSE_DONE' },
        { processType: 'GBJ', status: 'QC_VEHICLE_REJECTED' },
      );
    } else {
      // Show both queue types
      statusConditions.push(
        { status: 'REGISTERED' },
        { processType: 'GBB', status: 'INCOMING_CHECK_PASSED' },
        { processType: 'GBB', status: 'INCOMING_CHECK_REJECTED' },
        { processType: 'GBB', status: 'QC_VEHICLE_REJECTED' },
        { processType: 'GSP', status: 'INCOMING_CHECK_PASSED' },
        { processType: 'GSP', status: 'INCOMING_CHECK_REJECTED' },
        { processType: 'GSP', status: 'QC_VEHICLE_REJECTED' },
        { processType: 'GBJ', status: 'WAREHOUSE_DONE' },
        { processType: 'GBJ', status: 'QC_VEHICLE_REJECTED' },
      );
    }

    andConditions.push({ OR: statusConditions });

    const where: Prisma.TransactionWhereInput = { AND: andConditions };
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          weighbridgeRecords: true,
        },
      }),
    ]);

    await this.activityLogsService
      .logAction({
        userId: user.id,
        action: 'WEIGHBRIDGE_QUEUE_VIEW',
        module: 'WEIGHBRIDGE',

        description: `User ${user.email} viewed weighbridge queue`,
        status: 'SUCCESS',
      })
      .catch(() => {});

    return {
      success: true,
      message: 'Weighbridge queue retrieved successfully',
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async submitWeighIn(
    transactionId: string,
    dto: WeighInDto,
    user: JwtPayloadUser,
  ) {
    this.logger.log(
      `Weigh-in attempt for transaction ${transactionId} by ${user.email}`,
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

    // 1. Flow checks
    if (tx.status === 'CANCELLED' || tx.status === 'COMPLETED') {
      await this.activityLogsService
        .logAction({
          userId: user.id,
          action: 'WEIGHBRIDGE_FLOW_REJECTED',
          module: 'WEIGHBRIDGE',

          referenceId: transactionId,
          description: `Weigh-in rejected: Transaction is already ${tx.status}`,
          status: 'SUCCESS',
        })
        .catch(() => {});

      throw new BadRequestException({
        success: false,
        message: `Cannot process weigh-in for ${tx.status} transaction`,
        errors: [],
      });
    }

    if (tx.status !== 'REGISTERED') {
      await this.activityLogsService
        .logAction({
          userId: user.id,
          action: 'WEIGHBRIDGE_FLOW_REJECTED',
          module: 'WEIGHBRIDGE',

          referenceId: transactionId,
          description: `Weigh-in rejected: Current status is ${tx.status}, expected REGISTERED`,
          status: 'SUCCESS',
        })
        .catch(() => {});

      throw new BadRequestException({
        success: false,
        message: `Transaction must be in REGISTERED status for weigh-in (current status: ${tx.status})`,
        errors: [],
      });
    }

    // 2. Duplicate prevention
    const duplicateRecord = await this.prisma.weighbridgeRecord.findFirst({
      where: { transactionId, type: 'IN' },
    });

    if (duplicateRecord) {
      this.logger.warn(
        `Duplicate weigh-in attempt rejected for transaction ${transactionId}`,
      );

      await this.activityLogsService
        .logAction({
          userId: user.id,
          action: 'WEIGHBRIDGE_DUPLICATE_REJECTED',
          module: 'WEIGHBRIDGE',

          referenceId: transactionId,
          description: `Duplicate weigh-in attempt rejected for transaction ${transactionId}`,
          status: 'SUCCESS',
        })
        .catch(() => {});

      throw new BadRequestException({
        success: false,
        message: 'Weigh-in has already been processed for this transaction',
        errors: [],
      });
    }

    // 3. Process weights and status
    let grossWeight: number | null = null;
    let tareWeight: number | null = null;
    let nextStatus: TransactionStatus;

    if (tx.processType === 'GBB' || tx.processType === 'GSP') {
      grossWeight = dto.weight;
      nextStatus = 'QC_VEHICLE_PENDING';
    } else if (tx.processType === 'GBJ') {
      tareWeight = dto.weight;
      nextStatus = 'QC_VEHICLE_PENDING';
    } else {
      throw new BadRequestException({
        success: false,
        message: `Invalid process type: ${tx.processType}`,
        errors: [],
      });
    }

    // 4. Update data in transaction
    const updated = await this.prisma.$transaction(async (prismaTx) => {
      const existingIn = await prismaTx.weighbridgeRecord.findFirst({
        where: { transactionId, type: 'IN' },
      });
      if (existingIn) {
        throw new BadRequestException({
          success: false,
          message: 'Weigh-in has already been processed for this transaction (concurrency lock)',
          errors: [],
        });
      }

      await prismaTx.weighbridgeRecord.create({
        data: {
          transactionId,
          type: 'IN',
          weight: dto.weight,
          ticketNumber: dto.ticketNumber || null,
          operatorId: user.id,
          remarks: dto.remarks || null,
        },
      });

      const updateData: Prisma.TransactionUpdateInput = {
        status: nextStatus,
        weighInAt: new Date(),
        weighInBy: { connect: { id: user.id } },
        statusHistory: {
          create: {
            oldStatus: tx.status,
            newStatus: nextStatus,
            changedById: user.id,
            notes: dto.remarks || 'Weigh-in processed successfully',
          },
        },
      };

      if (grossWeight !== null) updateData.grossWeight = grossWeight;
      if (tareWeight !== null) updateData.tareWeight = tareWeight;

      return prismaTx.transaction.update({
        where: { id: transactionId },
        data: updateData,
        include: {
          weighInBy: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
        },
      });
    });

    this.logger.log(
      `Weigh-in successful: ${updated.transactionNumber}, weight: ${dto.weight}`,
    );

    await this.activityLogsService
      .logAction({
        userId: user.id,
        action: 'WEIGHBRIDGE_IN',
        module: 'WEIGHBRIDGE',

        referenceId: transactionId,
        description: {
          weight: dto.weight,
          ticketNumber: dto.ticketNumber,
          remarks: dto.remarks,
        },
        status: 'SUCCESS',
      })
      .catch(() => {});

    return {
      success: true,
      message: 'Weighbridge in completed successfully',
      data: {
        id: updated.id,
        transactionNumber: updated.transactionNumber,
        plateNumber: updated.plateNumber,
        processType: updated.processType,
        status: updated.status,
        grossWeight: updated.grossWeight,
        tareWeight: updated.tareWeight,
        netWeight: updated.netWeight,
        weighInAt: updated.weighInAt,
        weighInBy: updated.weighInBy
          ? {
              id: updated.weighInBy.id,
              name: updated.weighInBy.name,
              role: updated.weighInBy.role,
            }
          : null,
      },
    };
  }

  async submitWeighOut(
    transactionId: string,
    dto: WeighOutDto,
    user: JwtPayloadUser,
  ) {
    this.logger.log(
      `Weigh-out attempt for transaction ${transactionId} by ${user.email}`,
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

    // 1. Flow checks
    if (tx.status === 'CANCELLED' || tx.status === 'COMPLETED') {
      await this.activityLogsService
        .logAction({
          userId: user.id,
          action: 'WEIGHBRIDGE_FLOW_REJECTED',
          module: 'WEIGHBRIDGE',

          referenceId: transactionId,
          description: `Weigh-out rejected: Transaction is already ${tx.status}`,
          status: 'SUCCESS',
        })
        .catch(() => {});

      throw new BadRequestException({
        success: false,
        message: `Cannot process weigh-out for ${tx.status} transaction`,
        errors: [],
      });
    }

    let allowedStatuses: string[];
    if (tx.processType === 'GBB' || tx.processType === 'GSP') {
      allowedStatuses = ['INCOMING_CHECK_PASSED', 'INCOMING_CHECK_REJECTED', 'QC_VEHICLE_REJECTED'];
    } else if (tx.processType === 'GBJ') {
      allowedStatuses = ['WAREHOUSE_DONE', 'QC_VEHICLE_REJECTED'];
    } else {
      allowedStatuses = [];
    }

    if (!allowedStatuses.includes(tx.status)) {
      await this.activityLogsService
        .logAction({
          userId: user.id,
          action: 'WEIGHBRIDGE_FLOW_REJECTED',
          module: 'WEIGHBRIDGE',

          referenceId: transactionId,
          description: `Weigh-out rejected: Current status is ${tx.status}, expected one of ${allowedStatuses.join(', ')}`,
          status: 'SUCCESS',
        })
        .catch(() => {});

      throw new BadRequestException({
        success: false,
        message: `Transaction must be in one of [${allowedStatuses.join(', ')}] status for weigh-out (current status: ${tx.status})`,
        errors: [],
      });
    }

    // 2. Duplicate prevention
    const duplicateRecord = await this.prisma.weighbridgeRecord.findFirst({
      where: { transactionId, type: 'OUT' },
    });

    if (duplicateRecord) {
      this.logger.warn(
        `Duplicate weigh-out attempt rejected for transaction ${transactionId}`,
      );

      await this.activityLogsService
        .logAction({
          userId: user.id,
          action: 'WEIGHBRIDGE_DUPLICATE_REJECTED',
          module: 'WEIGHBRIDGE',

          referenceId: transactionId,
          description: `Duplicate weigh-out attempt rejected for transaction ${transactionId}`,
          status: 'SUCCESS',
        })
        .catch(() => {});

      throw new BadRequestException({
        success: false,
        message: 'Weigh-out has already been processed for this transaction',
        errors: [],
      });
    }

    // 3. Weight calculations
    let finalGrossWeight: number;
    let finalTareWeight: number;

    if (tx.processType === 'GBB' || tx.processType === 'GSP') {
      if (tx.grossWeight === null || tx.grossWeight === undefined) {
        throw new BadRequestException({
          success: false,
          message:
            'Gross weight is not available for this transaction. Cannot calculate net weight.',
          errors: [],
        });
      }
      finalGrossWeight = tx.grossWeight;
      finalTareWeight = dto.weight;
    } else if (tx.processType === 'GBJ') {
      if (tx.tareWeight === null || tx.tareWeight === undefined) {
        throw new BadRequestException({
          success: false,
          message:
            'Tare weight is not available for this transaction. Cannot calculate net weight.',
          errors: [],
        });
      }
      finalGrossWeight = dto.weight;
      finalTareWeight = tx.tareWeight;
    } else {
      throw new BadRequestException({
        success: false,
        message: `Invalid process type: ${tx.processType}`,
        errors: [],
      });
    }

    const isRejected =
      tx.status === 'INCOMING_CHECK_REJECTED' ||
      tx.status === 'QC_VEHICLE_REJECTED';

    if (!isRejected && finalTareWeight >= finalGrossWeight) {
      throw new BadRequestException({
        success: false,
        message: `Invalid weights: Tare weight (${finalTareWeight} kg) must be less than Gross weight (${finalGrossWeight} kg). Please verify the scale reading.`,
        errors: [],
      });
    }

    const netWeight = isRejected
      ? Math.max(0, finalGrossWeight - finalTareWeight)
      : finalGrossWeight - finalTareWeight;

    // 4. Update data in transaction
    const updated = await this.prisma.$transaction(async (prismaTx) => {
      const existingOut = await prismaTx.weighbridgeRecord.findFirst({
        where: { transactionId, type: 'OUT' },
      });
      if (existingOut) {
        throw new BadRequestException({
          success: false,
          message: 'Weigh-out has already been processed for this transaction (concurrency lock)',
          errors: [],
        });
      }

      await prismaTx.weighbridgeRecord.create({
        data: {
          transactionId,
          type: 'OUT',
          weight: dto.weight,
          ticketNumber: dto.ticketNumber || null,
          operatorId: user.id,
          remarks: dto.remarks || null,
        },
      });

      const txUpdate = await prismaTx.transaction.update({
        where: { id: transactionId },
        data: {
          status: 'WEIGH_OUT_DONE',
          weighOutAt: new Date(),
          weighOutBy: { connect: { id: user.id } },
          grossWeight: finalGrossWeight,
          tareWeight: finalTareWeight,
          netWeight: netWeight,
          statusHistory: {
            create: {
              oldStatus: tx.status,
              newStatus: 'WEIGH_OUT_DONE',
              changedById: user.id,
              notes: dto.remarks || 'Weigh-out processed successfully',
            },
          },
        },
        include: {
          weighOutBy: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
        },
      });

      // Fraud Detection Logic
      if (tx.actualWeight !== null && tx.actualWeight !== undefined) {
        const deviation = Math.abs(netWeight - tx.actualWeight);
        const deviationPercent =
          netWeight > 0 ? (deviation / netWeight) * 100 : 0;

        let riskLevel: 'SAFE' | 'WARNING' | 'CRITICAL' = 'SAFE';
        if (deviationPercent > 5) {
          riskLevel = 'CRITICAL';
        } else if (deviationPercent > 2) {
          riskLevel = 'WARNING';
        }

        const fraudNotes = `Deviation: ${deviationPercent.toFixed(2)}% (${deviation} kg). Net Weight: ${netWeight} kg, Actual Weight: ${tx.actualWeight} kg.`;

        await prismaTx.fraudCheck.create({
          data: {
            transactionId: transactionId,
            riskLevel: riskLevel,
            deviationKg: deviation,
            deviationPercent: deviationPercent,
            riskReason: fraudNotes,
          },
        });

        // Add an audit log specifically for fraud detection if risk is warning or critical
        if (riskLevel !== 'SAFE') {
          await this.activityLogsService
            .logAction({
              userId: user.id,
              action: 'FRAUD_DETECTED',
              module: 'SECURITY',

              referenceId: transactionId,
              description: JSON.stringify({
                riskLevel,
                deviationPercent,
                deviation,
                netWeight,
                actualWeight: tx.actualWeight,
              }),
              status: 'SUCCESS',
            })
            .catch(() => {});
        }
      }

      return txUpdate;
    });

    this.logger.log(
      `Weigh-out successful: ${updated.transactionNumber}, weight: ${dto.weight}, netWeight: ${netWeight}`,
    );

    await this.activityLogsService
      .logAction({
        userId: user.id,
        action: 'WEIGHBRIDGE_OUT',
        module: 'WEIGHBRIDGE',

        referenceId: transactionId,
        description: {
          weight: dto.weight,
          ticketNumber: dto.ticketNumber,
          remarks: dto.remarks,
          netWeight,
        },
        status: 'SUCCESS',
      })
      .catch(() => {});

    return {
      success: true,
      message: 'Weighbridge out completed successfully',
      data: {
        id: updated.id,
        transactionNumber: updated.transactionNumber,
        plateNumber: updated.plateNumber,
        processType: updated.processType,
        status: updated.status,
        grossWeight: updated.grossWeight,
        tareWeight: updated.tareWeight,
        netWeight: updated.netWeight,
        weighOutAt: updated.weighOutAt,
        weighOutBy: updated.weighOutBy
          ? {
              id: updated.weighOutBy.id,
              name: updated.weighOutBy.name,
              role: updated.weighOutBy.role,
            }
          : null,
      },
    };
  }

  async getRecordDetail(transactionId: string, user: JwtPayloadUser) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        weighInBy: { select: { id: true, name: true, role: true } },
        weighOutBy: { select: { id: true, name: true, role: true } },
        weighbridgeRecords: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!tx) {
      throw new NotFoundException({
        success: false,
        message: 'Transaction not found',
        errors: [],
      });
    }

    const weighInRecord = tx.weighbridgeRecords.find((r) => r.type === 'IN');
    const weighOutRecord = tx.weighbridgeRecords.find((r) => r.type === 'OUT');

    await this.activityLogsService
      .logAction({
        userId: user.id,
        action: 'WEIGHBRIDGE_RECORD_VIEW',
        module: 'WEIGHBRIDGE',
        referenceId: transactionId,
        description: `User ${user.email} viewed weighbridge record for ${tx.transactionNumber}`,
        status: 'SUCCESS',
      })
      .catch(() => {});

    return {
      success: true,
      message: 'Weighbridge record retrieved successfully',
      data: {
        transactionId: tx.id,
        transactionNumber: tx.transactionNumber,
        plateNumber: tx.plateNumber,
        processType: tx.processType,
        status: tx.status,
        grossWeight: tx.grossWeight,
        tareWeight: tx.tareWeight,
        netWeight: tx.netWeight,
        weighInTicketNumber: weighInRecord?.ticketNumber || null,
        weighOutTicketNumber: weighOutRecord?.ticketNumber || null,
        weighInAt: tx.weighInAt,
        weighOutAt: tx.weighOutAt,
        weighInBy: tx.weighInBy
          ? {
              id: tx.weighInBy.id,
              name: tx.weighInBy.name,
            }
          : null,
        weighOutBy: tx.weighOutBy
          ? {
              id: tx.weighOutBy.id,
              name: tx.weighOutBy.name,
            }
          : null,
        remarks:
          weighOutRecord?.remarks ||
          weighInRecord?.remarks ||
          tx.remarks ||
          null,
      },
    };
  }
}
