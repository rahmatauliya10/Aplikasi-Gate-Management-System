import {
  Injectable,
  NotFoundException,
  BadRequestException,
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

@Injectable()
export class QcService {
  private readonly logger = new Logger(QcService.name);

  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
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

  async getQueue() {
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
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      success: true,
      message: 'QC queue retrieved successfully',
      data: queue,
    };
  }

  async startQc(transactionId: string, dto: StartQcDto, userId: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });
    if (!tx) throw new NotFoundException('Transaction not found');

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

    const updated = await this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: nextStatus,
        qcStartAt: tx.qcStartAt || new Date(),
        statusHistory: {
          create: {
            newStatus: nextStatus,
            changedById: userId,
            notes: 'QC started',
          },
        },
      },
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
  ) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { qcVehicleChecks: true },
    });
    if (!tx) throw new NotFoundException('Transaction not found');
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
    if (tx.qcVehicleChecks.length > 0)
      throw new BadRequestException(
        'Result has already been submitted for this transaction',
      );

    const result = dto.result === 'PASS' ? 'PASS' : 'REJECT';
    const nextStatus =
      result === 'PASS' ? 'QC_VEHICLE_PASSED' : 'QC_VEHICLE_REJECTED';

    const updated = await this.prisma.$transaction(async (prisma) => {
      const existingCount = await prisma.qcVehicleCheck.count({
        where: { transactionId },
      });
      if (existingCount > 0) {
        throw new BadRequestException(
          'Result has already been submitted for this transaction',
        );
      }

      await prisma.qcVehicleCheck.create({
        data: {
          transactionId,
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

      return prisma.transaction.update({
        where: { id: transactionId },
        data: {
          status: nextStatus,
          qcStartAt: tx.qcStartAt || new Date(),
          qcEndAt: new Date(),
          statusHistory: {
            create: {
              newStatus: nextStatus,
              changedById: userId,
              notes: `Vehicle Check: ${result}`,
            },
          },
        },
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
  ) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { incomingMaterialChecks: true },
    });
    if (!tx) throw new NotFoundException('Transaction not found');
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
    if (tx.incomingMaterialChecks.length > 0)
      throw new BadRequestException(
        'Result has already been submitted for this transaction',
      );

    const result = dto.result === 'PASS' ? 'PASS' : 'REJECT';
    const nextStatus =
      result === 'PASS' ? 'INCOMING_CHECK_PASSED' : 'INCOMING_CHECK_REJECTED';

    const updated = await this.prisma.$transaction(async (prisma) => {
      const existingCount = await prisma.incomingMaterialCheck.count({
        where: { transactionId },
      });
      if (existingCount > 0) {
        throw new BadRequestException(
          'Result has already been submitted for this transaction',
        );
      }

      await prisma.incomingMaterialCheck.create({
        data: {
          transactionId,
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
          startedAt: tx.qcStartAt || new Date(),
          completedAt: new Date(),
        },
      });

      return prisma.transaction.update({
        where: { id: transactionId },
        data: {
          status: nextStatus,
          qcStartAt: tx.qcStartAt || new Date(),
          qcEndAt: new Date(),
          statusHistory: {
            create: {
              newStatus: nextStatus,
              changedById: userId,
              notes: `Incoming Check: ${result}`,
            },
          },
        },
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

  async getDetail(transactionId: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        qcVehicleChecks: true,
        incomingMaterialChecks: true,
        attachments: { where: { module: 'QC' } },
      },
    });

    if (!tx) throw new NotFoundException('Transaction not found');

    return {
      success: true,
      message: 'QC detail retrieved',
      data: tx,
    };
  }

  async getHistory() {
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
      },
      include: {
        qcVehicleChecks: true,
        incomingMaterialChecks: true,
      },
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
  ) {
    if (!file) throw new BadRequestException('File is required');
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });
    if (!tx) throw new NotFoundException('Transaction not found');

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
      if (remarks) {
        const activeProcess = await prismaTx.warehouseProcess.findFirst({
          where: { transactionId, endAt: null },
        });
        if (activeProcess) {
          await prismaTx.warehouseProcess.update({
            where: { id: activeProcess.id },
            data: { remarks },
          });
        }
      }

      return prismaTx.transaction.update({
        where: { id: transactionId },
        data: {
          qcAnalysisCompleted: true,
          qcAnalysisCompletedAt: new Date(),
          ...(remarks && { remarks }),
        },
        include: {
          warehouseProcesses: { orderBy: { createdAt: 'desc' }, take: 1 },
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

    return {
      success: true,
      message: 'QC analysis marked as completed',
      data: {
        ...updated,
        remarks:
          remarks ||
          updated.warehouseProcesses?.[0]?.remarks ||
          updated.remarks ||
          null,
      },
    };
  }
}
