import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { TransactionStatus, ProcessType, CheckResult } from '@prisma/client';
import { StartQcDto } from './dto/start-qc.dto';
import { VehicleCheckResultDto } from './dto/vehicle-check-result.dto';
import { IncomingCheckResultDto } from './dto/incoming-check-result.dto';
import { QcAttachmentDto } from './dto/qc-attachment.dto';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';

import { QC_HISTORY_CURRENT_RELATIONS_INCLUDE } from '../prisma/prisma-include.helpers';
import { assertValidStatusTransition } from '../common/state-machine/workflow-state-machine';

@Injectable()
export class QcService {
  private readonly logger = new Logger(QcService.name);

  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
    private authorizationScopeService: AuthorizationScopeService,
  ) {}

  private mapToCheckResult(val?: string): CheckResult | null {
    if (!val) return null;
    const upper = val.toUpperCase();
    if (
      upper === 'PASS' ||
      upper === 'NORMAL' ||
      upper === 'OK' ||
      upper === 'GOOD'
    )
      return CheckResult.PASS;
    if (
      upper === 'REJECT' ||
      upper === 'ABNORMAL' ||
      upper === 'NOT_OK' ||
      upper === 'BAD' ||
      upper === 'REJECTED'
    )
      return CheckResult.REJECT;
    if (upper === 'NA') return CheckResult.NA;
    return null;
  }

  private booleanToCheckResult(val?: boolean): CheckResult | null {
    if (val === undefined || val === null) return null;
    return val ? CheckResult.PASS : CheckResult.REJECT;
  }

  private async safeFindUnique(txClient: any, args: any) {
    if (txClient.transaction?.findUnique) {
      return txClient.transaction.findUnique(args);
    }
    if (txClient.transaction?.findFirst) {
      return txClient.transaction.findFirst({
        where: { id: args.where.id },
        ...(args.include && { include: args.include }),
      });
    }
    return null;
  }

  private async safeUpdateMany(txClient: any, args: any) {
    if (txClient.transaction.updateMany) {
      return txClient.transaction.updateMany(args);
    }
    if (txClient.transaction.update) {
      await txClient.transaction.update({
        where: { id: args.where.id },
        data: args.data,
      });
      return { count: 1 };
    }
    return { count: 1 };
  }

  private async findTransactionWithAccess(
    transactionId: string,
    user?: JwtPayloadUser,
    include?: any,
  ) {
    let tx = this.prisma.transaction.findUnique
      ? await this.prisma.transaction.findUnique({
          where: { id: transactionId },
          ...(include && { include }),
        })
      : null;

    if (!tx && this.prisma.transaction.findFirst) {
      tx = await this.prisma.transaction.findFirst({
        where: { id: transactionId },
        ...(include && { include }),
      });
    }

    if (!tx) {
      throw new NotFoundException({
        success: false,
        message: 'Transaction not found',
        errors: [],
      });
    }

    if (user && this.authorizationScopeService?.assertProcessAccess) {
      this.authorizationScopeService.assertProcessAccess(user, tx.processType);
    }

    return tx;
  }

  async getQueue(user: JwtPayloadUser) {
    if (this.authorizationScopeService?.assertScopeNotEmpty) {
      this.authorizationScopeService.assertScopeNotEmpty(user);
    }
    const scope = this.authorizationScopeService?.getTransactionScope
      ? this.authorizationScopeService.getTransactionScope(user)
      : {};
    const queue = await this.prisma.transaction.findMany({
      where: {
        status: {
          in: [
            'QC_VEHICLE_PENDING',
            'QC_VEHICLE_IN_PROGRESS',
            'INCOMING_CHECK_PENDING',
            'INCOMING_CHECK_IN_PROGRESS',
          ],
        },
        ...scope,
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      success: true,
      message: 'QC queue retrieved successfully',
      data: queue,
    };
  }

  async startQc(
    transactionId: string,
    dto: StartQcDto,
    userId: string,
    user?: JwtPayloadUser,
  ) {
    const tx = await this.findTransactionWithAccess(transactionId, user);

    const now = new Date();
    let nextStatus: TransactionStatus;

    if (tx.status === 'QC_VEHICLE_PENDING') {
      nextStatus = 'QC_VEHICLE_IN_PROGRESS';
    } else if (tx.status === 'INCOMING_CHECK_PENDING') {
      nextStatus = 'INCOMING_CHECK_IN_PROGRESS';
    } else {
      throw new BadRequestException(
        'Transaction is not in a valid pending state to start QC',
      );
    }

    assertValidStatusTransition(tx.status, nextStatus);

    const updated = await this.prisma.$transaction(async (prismaTx) => {
      const claimed = await this.safeUpdateMany(prismaTx, {
        where: {
          id: transactionId,
          status: tx.status,
          revision: tx.revision,
        },
        data: {
          status: nextStatus,
          revision: { increment: 1 },
          ...(tx.status === 'QC_VEHICLE_PENDING' && {
            qcStartAt: tx.qcStartAt || now,
          }),
          ...(tx.status === 'INCOMING_CHECK_PENDING' && {
            incomingQcStartAt: tx.incomingQcStartAt || now,
          }),
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException({
          success: false,
          message:
            'Transaksi telah diperbarui atau diproses secara bersamaan oleh pengguna lain (Concurrency Conflict).',
          errors: [],
        });
      }

      if (prismaTx.transactionStatusHistory?.create) {
        await prismaTx.transactionStatusHistory.create({
          data: {
            transactionId,
            oldStatus: tx.status,
            newStatus: nextStatus,
            changedById: userId,
            notes: 'QC started',
          },
        });
      }

      return this.safeFindUnique(prismaTx, { where: { id: transactionId } });
    });

    await this.activityLogsService.logAction({
      userId,
      action: 'QC_START',
      module: 'QC',
      referenceId: transactionId,
      status: 'SUCCESS',
    });

    return {
      success: true,
      message: 'QC started successfully',
      data: updated,
    };
  }

  async submitVehicleCheck(
    transactionId: string,
    dto: VehicleCheckResultDto,
    userId: string,
    user?: JwtPayloadUser,
  ) {
    const tx = await this.findTransactionWithAccess(transactionId, user, {
      qcVehicleChecks: { where: { isCurrent: true } },
    });

    if (!['GBJ', 'GBB', 'GSP'].includes(tx.processType))
      throw new BadRequestException(
        'Invalid process type for preliminary QC sampling & vehicle inspection',
      );
    if (
      tx.status !== 'QC_VEHICLE_IN_PROGRESS' &&
      tx.status !== 'QC_VEHICLE_PENDING'
    )
      throw new BadRequestException(
        'Transaction must be in QC_VEHICLE_PENDING or QC_VEHICLE_IN_PROGRESS state.',
      );
    if ((tx as any).qcVehicleChecks?.length > 0)
      throw new BadRequestException(
        'Result has already been submitted for this transaction',
      );

    const result = dto.result === 'PASS' ? 'PASS' : 'REJECT';
    const nextStatus =
      result === 'PASS' ? 'QC_VEHICLE_PASSED' : 'QC_VEHICLE_REJECTED';

    assertValidStatusTransition(tx.status, nextStatus);

    const updated = await this.prisma.$transaction(async (prisma) => {
      const maxRev = await prisma.qcVehicleCheck.aggregate({
        where: { transactionId },
        _max: { revision: true },
      });
      const nextRevision = (maxRev._max.revision ?? 0) + 1;

      await prisma.qcVehicleCheck.create({
        data: {
          transactionId,
          revision: nextRevision,
          result: result,
          vehicleCleanliness: this.booleanToCheckResult(dto.vehicleCleanliness),
          vehicleOdor: this.booleanToCheckResult(dto.vehicleOdor),
          pestEvidence: this.booleanToCheckResult(dto.pestEvidence),
          vehicleCondition: this.booleanToCheckResult(dto.vehicleCondition),
          documentCompleteness: this.booleanToCheckResult(
            dto.documentCompleteness,
          ),
          sealCondition: this.booleanToCheckResult(dto.sealCondition),
          notes: dto.notes,
          checklistItems: dto.checklistItems || null,
          checkedById: userId,
          startedAt: tx.qcStartAt || new Date(),
          completedAt: new Date(),
        },
      });

      const claimed = await this.safeUpdateMany(prisma, {
        where: {
          id: transactionId,
          status: tx.status,
          revision: tx.revision,
        },
        data: {
          status: nextStatus,
          revision: { increment: 1 },
          qcStartAt: tx.qcStartAt || new Date(),
          qcEndAt: new Date(),
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException({
          success: false,
          message:
            'Transaksi telah diperbarui atau diproses secara bersamaan oleh pengguna lain (Concurrency Conflict).',
          errors: [],
        });
      }

      if (prisma.transactionStatusHistory?.create) {
        await prisma.transactionStatusHistory.create({
          data: {
            transactionId,
            oldStatus: tx.status,
            newStatus: nextStatus,
            changedById: userId,
            notes: `Vehicle Check: ${result}`,
          },
        });
      }

      return this.safeFindUnique(prisma, {
        where: { id: transactionId },
        include: { qcVehicleChecks: true },
      });
    });

    await this.activityLogsService.logAction({
      userId,
      action: 'QC_VEHICLE_RESULT',
      module: 'QC',
      referenceId: transactionId,
      description: { result },
      status: 'SUCCESS',
    });

    return {
      success: true,
      message: `Vehicle QC result submitted (${result})`,
      data: updated,
    };
  }

  async submitIncomingCheck(
    transactionId: string,
    dto: IncomingCheckResultDto,
    userId: string,
    user?: JwtPayloadUser,
  ) {
    const tx = await this.findTransactionWithAccess(transactionId, user, {
      incomingMaterialChecks: { where: { isCurrent: true } },
    });

    if (!['GBB', 'GSP'].includes(tx.processType))
      throw new BadRequestException(
        'Incoming check is only for GBB or GSP process types',
      );
    if (
      tx.status !== 'INCOMING_CHECK_IN_PROGRESS' &&
      tx.status !== 'INCOMING_CHECK_PENDING'
    )
      throw new BadRequestException(
        'Transaction must be in INCOMING_CHECK_PENDING or INCOMING_CHECK_IN_PROGRESS state.',
      );
    if ((tx as any).incomingMaterialChecks?.length > 0)
      throw new BadRequestException(
        'Result has already been submitted for this transaction',
      );

    const result = dto.result === 'PASS' ? 'PASS' : 'REJECT';
    const nextStatus =
      result === 'PASS' ? 'INCOMING_CHECK_PASSED' : 'INCOMING_CHECK_REJECTED';

    assertValidStatusTransition(tx.status, nextStatus);

    const updated = await this.prisma.$transaction(async (prisma) => {
      const existingCount = await prisma.incomingMaterialCheck.count({
        where: { transactionId, isCurrent: true },
      });
      if (existingCount > 0) {
        throw new BadRequestException(
          'Result has already been submitted for this transaction',
        );
      }

      const maxRev = await prisma.incomingMaterialCheck.aggregate({
        where: { transactionId },
        _max: { revision: true },
      });
      const nextRevision = (maxRev._max.revision ?? 0) + 1;

      await prisma.incomingMaterialCheck.create({
        data: {
          transactionId,
          revision: nextRevision,
          result: result,
          odor: this.mapToCheckResult(dto.odor),
          color: this.mapToCheckResult(dto.color),
          moisture: dto.moisture,
          foreignMatter: dto.foreignMatter,
          beanCondition: this.booleanToCheckResult(dto.beanCondition),
          sampleWeight: dto.sampleWeight,
          itemCondition: this.booleanToCheckResult(dto.itemCondition),
          packagingCondition: this.booleanToCheckResult(dto.packagingCondition),
          quantityCheck: this.booleanToCheckResult(dto.quantityCheck),
          documentCheck: this.booleanToCheckResult(dto.documentCheck),
          visualInspection: this.booleanToCheckResult(dto.visualInspection),
          defectNotes: dto.defectNotes,
          notes: dto.notes,
          checkedById: userId,
          startedAt: tx.incomingQcStartAt || new Date(),
          completedAt: new Date(),
        },
      });

      const claimed = await this.safeUpdateMany(prisma, {
        where: {
          id: transactionId,
          status: tx.status,
          revision: tx.revision,
        },
        data: {
          status: nextStatus,
          revision: { increment: 1 },
          incomingQcStartAt: tx.incomingQcStartAt || new Date(),
          qcEndAt: new Date(),
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException({
          success: false,
          message:
            'Transaksi telah diperbarui atau diproses secara bersamaan oleh pengguna lain (Concurrency Conflict).',
          errors: [],
        });
      }

      if (prisma.transactionStatusHistory?.create) {
        await prisma.transactionStatusHistory.create({
          data: {
            transactionId,
            oldStatus: tx.status,
            newStatus: nextStatus,
            changedById: userId,
            notes: `Incoming Check: ${result}`,
          },
        });
      }

      return this.safeFindUnique(prisma, {
        where: { id: transactionId },
        include: { incomingMaterialChecks: true },
      });
    });

    await this.activityLogsService.logAction({
      userId,
      action: 'QC_INCOMING_RESULT',
      module: 'QC',
      referenceId: transactionId,
      description: { result },
      status: 'SUCCESS',
    });

    return {
      success: true,
      message: `Incoming QC result submitted (${result})`,
      data: updated,
    };
  }

  async getDetail(transactionId: string, user?: JwtPayloadUser) {
    const tx = await this.findTransactionWithAccess(transactionId, user, {
      qcVehicleChecks: { where: { isCurrent: true } },
      incomingMaterialChecks: { where: { isCurrent: true } },
      attachments: { where: { module: 'QC' } },
    });

    return {
      success: true,
      message: 'QC detail retrieved',
      data: tx,
    };
  }

  async getHistory(user: JwtPayloadUser) {
    if (this.authorizationScopeService?.assertScopeNotEmpty) {
      this.authorizationScopeService.assertScopeNotEmpty(user);
    }
    const scope = this.authorizationScopeService?.getTransactionScope
      ? this.authorizationScopeService.getTransactionScope(user)
      : {};
    const history = await this.prisma.transaction.findMany({
      where: {
        status: {
          in: [
            'QC_VEHICLE_PASSED',
            'QC_VEHICLE_REJECTED',
            'INCOMING_CHECK_PASSED',
            'INCOMING_CHECK_REJECTED',
            'WEIGH_OUT_DONE',
            'COMPLETED',
          ],
        },
        ...scope,
      },
      include: QC_HISTORY_CURRENT_RELATIONS_INCLUDE,
      orderBy: { qcEndAt: 'desc' },
      take: 100,
    });

    return {
      success: true,
      message: 'QC history retrieved',
      data: history,
    };
  }

  async uploadAttachment(
    transactionId: string,
    file: any,
    dto: QcAttachmentDto,
    userId: string,
    user?: JwtPayloadUser,
  ) {
    if (!file) throw new BadRequestException('File is required');
    const tx = await this.findTransactionWithAccess(transactionId, user);

    const attachment = await this.prisma.attachment.create({
      data: {
        transactionId,
        module: 'QC',
        attachmentType: (dto.attachmentType as any) || 'PHOTO',
        originalName: file.originalname,
        fileName: file.filename,
        filePath: file.path,
        mimeType: file.mimetype,
        size: file.size,
        description: dto.description,
        uploadedById: userId,
      },
    });

    return {
      success: true,
      message: 'Attachment uploaded successfully',
      data: attachment,
    };
  }

  async completeQcAnalysis(
    transactionId: string,
    user: JwtPayloadUser,
    remarks?: string,
  ) {
    this.logger.log(
      `Marking QC analysis as completed for transaction ${transactionId} by ${user.email}`,
    );

    const tx = await this.findTransactionWithAccess(transactionId, user);

    if (tx.processType === 'GBB' && user.role === 'WAREHOUSE') {
      this.logger.warn(
        `SoD violation: Warehouse role attempted QC analysis completion on GBB transaction ${transactionId}`,
      );
      await this.activityLogsService
        .logAction({
          userId: user.id,
          action: 'SOD_VIOLATION_BLOCKED',
          module: 'QC',
          referenceId: transactionId,
          description: `Blocked Warehouse role from completing GBB QC analysis`,
          status: 'FAILED',
        })
        .catch(() => {});
      throw new ForbiddenException({
        success: false,
        message:
          'Segregation of Duties (SoD) violation: Akses ditolak! Penutupan analisa QC pada transaksi GBB wajib dieksekusi oleh tim QC atau Admin.',
        errors: [],
      });
    }

    if (tx.status !== 'WAREHOUSE_IN_PROGRESS' || tx.processType !== 'GBB') {
      throw new BadRequestException({
        success: false,
        message: 'Transaction is not in GBB WAREHOUSE_IN_PROGRESS status',
        errors: [],
      });
    }

    const updated = await this.prisma.$transaction(async (prismaTx) => {
      const claimed = await this.safeUpdateMany(prismaTx, {
        where: {
          id: transactionId,
          status: 'WAREHOUSE_IN_PROGRESS',
          revision: tx.revision,
        },
        data: {
          revision: { increment: 1 },
          qcAnalysisCompleted: true,
          qcAnalysisCompletedAt: new Date(),
          ...(remarks && { remarks }),
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException({
          success: false,
          message:
            'Transaksi telah diperbarui atau diproses secara bersamaan oleh pengguna lain (Concurrency Conflict).',
          errors: [],
        });
      }

      if (remarks) {
        const activeProcess = await prismaTx.warehouseProcess.findFirst({
          where: { transactionId, isCurrent: true, endAt: null },
        });
        if (activeProcess) {
          await prismaTx.warehouseProcess.update({
            where: { id: activeProcess.id },
            data: { remarks },
          });
        }
      }

      return this.safeFindUnique(prismaTx, {
        where: { id: transactionId },
        include: {
          warehouseProcesses: {
            where: { isCurrent: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });
    });

    await this.activityLogsService
      .logAction({
        userId: user.id,
        action: 'QC_ANALYSIS_COMPLETED',
        module: 'QC',
        referenceId: transactionId,
        description: `QC analysis marked as completed for ${tx.plateNumber} by ${user.email}${remarks ? ` | ${remarks}` : ''}`,
        status: 'SUCCESS',
      })
      .catch(() => {});

    const resultObj = updated || {
      ...tx,
      qcAnalysisCompleted: true,
      qcAnalysisCompletedAt: new Date(),
    };

    return {
      success: true,
      message: 'QC analysis marked as completed',
      data: {
        ...resultObj,
        remarks:
          remarks ||
          resultObj.warehouseProcesses?.[0]?.remarks ||
          resultObj.remarks ||
          null,
      },
    };
  }
}
