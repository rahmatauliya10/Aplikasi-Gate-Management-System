import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { CreateOperationLogCorrectionDto } from './dto/create-operation-log-correction.dto';
import { CorrectionAction, CorrectionTargetModule, TransactionStatus } from '@prisma/client';

const FIELD_ALLOWLIST: Record<CorrectionTargetModule, string[]> = {
  TRANSACTION: [
    'driverName',
    'driverPhone',
    'vendorName',
    'vehicleType',
    'cargoType',
    'cargoSubType',
    'suratJalanNumber',
    'poNumber',
    'remarks',
    'grossWeight',
    'tareWeight',
    'actualWeight',
    'actualQuantity',
    'permitCardNumber',
    'guestIdNumber',
  ],
  WEIGHBRIDGE: ['grossWeight', 'tareWeight', 'weighbridgeTicket', 'remarks'],
  QC_VEHICLE: ['result', 'remarks', 'vehicleCondition', 'cleanliness'],
  QC_MATERIAL: [
    'moistureContent',
    'dirtContent',
    'brokenRatio',
    'foreignMaterial',
    'remarks',
    'result',
  ],
  INCOMING_MATERIAL: ['remarks', 'actualQuantity', 'result'],
  WAREHOUSE: [
    'warehouseUnit',
    'warehouseStartAt',
    'warehouseEndAt',
    'remarks',
    'actualQuantity',
    'actualWeight',
  ],
  STATUS: ['status'],
  ATTACHMENT: ['evidenceUrl', 'fileUrl', 'remarks'],
  REMARK: ['remarks', 'description', 'cancellationReason'],
};

@Injectable()
export class OperationLogCorrectionService {
  private readonly logger = new Logger(OperationLogCorrectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  async correctOperationLog(
    id: string,
    dto: CreateOperationLogCorrectionDto,
    user: any,
    ipAddress?: string,
  ) {
    // Step 1: Validate Role
    if (user?.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Hanya Admin yang diizinkan mengoreksi Operation Log.',
      );
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException(
        'Daftar item koreksi (items) tidak boleh kosong.',
      );
    }

    const cleanIp = ipAddress ? ipAddress.replace(/^.*:/, '') : null;
    const correctionNumber = `COR-${new Date().getFullYear()}-${Math.floor(
      10000 + Math.random() * 90000,
    )}`;

    const result = await this.prisma.$transaction(async (prismaTx) => {
      // Step 2 & 3: Validate Terminal Status and OCC Revision
      const tx = await prismaTx.transaction.findUnique({
        where: { id },
        include: {
          weighbridgeRecords: true,
          warehouseProcesses: true,
          qcVehicleChecks: true,
          incomingMaterialChecks: true,
        },
      });

      if (!tx) {
        throw new NotFoundException('Transaksi tidak ditemukan.');
      }

      if (
        !['COMPLETED', 'CANCELLED'].includes(tx.status as string) &&
        dto.action !== CorrectionAction.REOPEN_WORKFLOW
      ) {
        throw new BadRequestException(
          'Koreksi Operation Log hanya berlaku untuk transaksi berstatus terminal (COMPLETED atau CANCELLED).',
        );
      }

      if ((tx as any).revision !== dto.expectedRevision) {
        throw new ConflictException(
          'Data transaksi telah diperbarui oleh pengguna lain (Revisi Tidak Cocok). Silakan muat ulang data terbaru sebelum melakukan koreksi.',
        );
      }

      // Step 4: Validate Allowlist and Collect Old/New Diffs
      const oldValuesSummary: Record<string, any> = {};
      const newValuesSummary: Record<string, any> = {};
      const itemInsertPayloads: any[] = [];
      const txUpdateData: Record<string, any> = {};
      let statusUpdatedTo: string | null = null;

      for (const item of dto.items) {
        const allowedFields = FIELD_ALLOWLIST[item.targetModule] || [];
        if (!allowedFields.includes(item.fieldName)) {
          throw new BadRequestException(
            `Field ${item.fieldName} pada modul ${item.targetModule} masuk dalam Denylist / Protected dan tidak boleh dikoreksi.`,
          );
        }

        let extractedOldValue: any = null;
        if (item.targetModule === CorrectionTargetModule.TRANSACTION || item.targetModule === CorrectionTargetModule.STATUS || item.targetModule === CorrectionTargetModule.REMARK) {
          extractedOldValue = (tx as any)[item.fieldName];
          txUpdateData[item.fieldName] = item.newValue;
          if (item.fieldName === 'status') {
            statusUpdatedTo = item.newValue as string;
          }
        } else if (item.targetModule === CorrectionTargetModule.WEIGHBRIDGE && tx.weighbridgeRecords?.length > 0) {
          const rec = tx.weighbridgeRecords[tx.weighbridgeRecords.length - 1];
          extractedOldValue = (rec as any)[item.fieldName];
          await prismaTx.weighbridgeRecord.update({
            where: { id: item.targetRecordId || rec.id },
            data: { [item.fieldName]: item.newValue },
          });
        } else if (item.targetModule === CorrectionTargetModule.WAREHOUSE && tx.warehouseProcesses?.length > 0) {
          const rec = tx.warehouseProcesses[tx.warehouseProcesses.length - 1];
          extractedOldValue = (rec as any)[item.fieldName];
          await prismaTx.warehouseProcess.update({
            where: { id: item.targetRecordId || rec.id },
            data: { [item.fieldName]: item.newValue },
          });
        } else if (item.targetModule === CorrectionTargetModule.QC_VEHICLE && tx.qcVehicleChecks?.length > 0) {
          const rec = tx.qcVehicleChecks[tx.qcVehicleChecks.length - 1];
          extractedOldValue = (rec as any)[item.fieldName];
          await prismaTx.qcVehicleCheck.update({
            where: { id: item.targetRecordId || rec.id },
            data: { [item.fieldName]: item.newValue },
          });
        } else if (item.targetModule === CorrectionTargetModule.INCOMING_MATERIAL && tx.incomingMaterialChecks?.length > 0) {
          const rec = tx.incomingMaterialChecks[tx.incomingMaterialChecks.length - 1];
          extractedOldValue = (rec as any)[item.fieldName];
          await prismaTx.incomingMaterialCheck.update({
            where: { id: item.targetRecordId || rec.id },
            data: { [item.fieldName]: item.newValue },
          });
        }

        oldValuesSummary[item.fieldName] = extractedOldValue;
        newValuesSummary[item.fieldName] = item.newValue;

        itemInsertPayloads.push({
          targetModule: item.targetModule,
          targetRecordId: item.targetRecordId || null,
          fieldName: item.fieldName,
          oldValue: extractedOldValue !== undefined ? extractedOldValue : null,
          newValue: item.newValue !== undefined ? item.newValue : null,
          itemRemark: item.itemRemark || null,
        });
      }

      // Step 5: Validate Business Rules (Gross >= Tare, warehouse start <= end)
      const proposedGross =
        txUpdateData.grossWeight !== undefined
          ? Number(txUpdateData.grossWeight)
          : tx.grossWeight;
      const proposedTare =
        txUpdateData.tareWeight !== undefined
          ? Number(txUpdateData.tareWeight)
          : tx.tareWeight;

      if (
        proposedGross !== null &&
        proposedTare !== null &&
        proposedGross < proposedTare
      ) {
        throw new BadRequestException(
          'Gross weight tidak boleh lebih kecil dari Tare weight.',
        );
      }

      const proposedStart =
        txUpdateData.warehouseStartAt !== undefined
          ? new Date(txUpdateData.warehouseStartAt)
          : tx.warehouseStartAt;
      const proposedEnd =
        txUpdateData.warehouseEndAt !== undefined
          ? new Date(txUpdateData.warehouseEndAt)
          : tx.warehouseEndAt;

      if (
        proposedStart &&
        proposedEnd &&
        new Date(proposedStart).getTime() > new Date(proposedEnd).getTime()
      ) {
        throw new BadRequestException(
          'Waktu mulai proses gudang tidak boleh melebihi waktu selesai.',
        );
      }

      // Step 6 & 7: Insert TransactionCorrection header & Items (Fail-Closed)
      const correction = await prismaTx.transactionCorrection.create({
        data: {
          transactionId: id,
          correctedById: user.id,
          correctionNumber,
          action: dto.action || CorrectionAction.CORRECT_DATA,
          reasonCode: dto.reasonCode,
          reason: dto.reasonCode,
          remark: dto.remark,
          evidenceUrl: dto.evidenceUrl || null,
          oldValues: oldValuesSummary as any,
          newValues: newValuesSummary as any,
          expectedRevision: dto.expectedRevision,
          ipAddress: cleanIp,
          items: {
            createMany: {
              data: itemInsertPayloads,
            },
          },
        } as any,
        include: {
          items: true,
        } as any,
      });

      // Step 8: Update Active Records in Transaction
      if (proposedGross !== null && proposedTare !== null) {
        txUpdateData.netWeight = proposedGross - proposedTare;
      }

      // Step 12: Increment Revision & Apply Updates
      txUpdateData.revision = (tx as any).revision ? (tx as any).revision + 1 : 2;

      const updatedTx = await prismaTx.transaction.update({
        where: { id },
        data: txUpdateData,
      });

      // Step 9: Append Status History if Status Changed or Reopened
      if (statusUpdatedTo || dto.action === CorrectionAction.CORRECT_RECORDED_STATUS || dto.action === CorrectionAction.REOPEN_WORKFLOW) {
        const targetStatus = statusUpdatedTo || (dto.action === CorrectionAction.REOPEN_WORKFLOW ? 'QC_VEHICLE_PENDING' : tx.status);
        await prismaTx.transactionStatusHistory.create({
          data: {
            transactionId: id,
            oldStatus: tx.status as TransactionStatus,
            newStatus: targetStatus as TransactionStatus,
            notes: `ADMIN_CORRECTION: ${dto.remark} (Correction: ${correctionNumber})`,
            changedById: user?.id || null,
          },
        });
      }

      // Step 10: Recalculate Derived Weights and generate FraudCheck
      const finalNet = updatedTx.netWeight;
      const finalActual = updatedTx.actualWeight;
      if (finalNet !== null && finalActual !== null && finalNet > 0) {
        const deviation = Math.abs(finalNet - finalActual);
        const deviationPercent = (deviation / finalNet) * 100;
        let riskLevel: 'SAFE' | 'WARNING' | 'CRITICAL' = 'SAFE';
        if (deviationPercent > 5) riskLevel = 'CRITICAL';
        else if (deviationPercent > 2) riskLevel = 'WARNING';

        await prismaTx.fraudCheck.create({
          data: {
            transactionId: id,
            riskLevel,
            deviationKg: deviation,
            deviationPercent,
            riskReason: `Post-correction operation log recalc by Admin ${user.email}. Net: ${finalNet} kg, Actual: ${finalActual} kg.`,
          },
        });
      }

      // Step 11: Insert Atomic ActivityLog
      await this.activityLogsService.logAction(
        {
          userId: user.id,
          action: 'OPERATION_LOG_CORRECTED',
          module: 'TRANSACTIONS',
          referenceId: id,
          description: `Admin mengoreksi Operation Log. Correction: ${correctionNumber}`,
          status: 'SUCCESS',
          ipAddress: cleanIp || undefined,
        },
        prismaTx,
      );

      return { updatedTx, correction };
    });

    return {
      success: true,
      message: 'Operation Log berhasil dikoreksi dan dicatat secara atomik oleh Admin.',
      data: result,
    };
  }

  async getOperationLogCorrections(transactionId: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        weighInBy: {
          select: { id: true, name: true, role: true },
        },
      },
    });

    if (!tx) {
      throw new NotFoundException({
        success: false,
        message: 'Transaksi tidak ditemukan.',
      });
    }

    try {
      const corrections = await (this.prisma.transactionCorrection as any).findMany({
        where: { transactionId },
        include: {
          correctedBy: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          items: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return {
        success: true,
        attribution: {
          originalCreatedBy: tx.weighInBy
            ? `${tx.weighInBy.role} — ${tx.weighInBy.name}`
            : 'Operator Awal / QC Lapangan',
          lastCorrectedBy:
            corrections.length > 0 && corrections[0]?.correctedBy
              ? `ADMIN — ${corrections[0].correctedBy.name}`
              : null,
        },
        data: corrections,
      };
    } catch (err: any) {
      this.logger.error(`Failed to fetch operation log corrections: ${err.message}`);
      throw new InternalServerErrorException(
        'Gagal mengambil riwayat koreksi Operation Log (Layanan Audit Tidak Bersedia).',
      );
    }
  }
}
