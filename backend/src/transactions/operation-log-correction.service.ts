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
import {
  CorrectionAction,
  CorrectionTargetModule,
  TransactionStatus,
} from '@prisma/client';
import * as crypto from 'crypto';

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
  WEIGHBRIDGE: ['weight', 'ticketNumber', 'remarks'],
  QC_VEHICLE: [
    'result',
    'vehicleCleanliness',
    'vehicleOdor',
    'pestEvidence',
    'vehicleCondition',
    'documentCompleteness',
    'sealCondition',
    'notes',
    'checklistItems',
  ],
  QC_MATERIAL: [
    'result',
    'odor',
    'color',
    'moisture',
    'foreignMatter',
    'beanCondition',
    'sampleWeight',
    'goodBeanPercentage',
    'itemCondition',
    'packagingCondition',
    'quantityCheck',
    'documentCheck',
    'visualInspection',
    'defectNotes',
    'notes',
    'checklistItems',
  ],
  INCOMING_MATERIAL: [
    'result',
    'odor',
    'color',
    'moisture',
    'foreignMatter',
    'beanCondition',
    'sampleWeight',
    'goodBeanPercentage',
    'itemCondition',
    'packagingCondition',
    'quantityCheck',
    'documentCheck',
    'visualInspection',
    'defectNotes',
    'notes',
    'checklistItems',
  ],
  WAREHOUSE: [
    'startAt',
    'endAt',
    'actualWeight',
    'actualQuantity',
    'unit',
    'palletCount',
    'bagCount',
    'rollCount',
    'condition',
    'remarks',
    'checklistItems',
  ],
  STATUS: ['status'],
  ATTACHMENT: ['originalName', 'description'],
  REMARK: ['remarks', 'cancellationReason', 'notes', 'description'],
};

const validateDomain = (
  fieldName: string,
  newValue: any,
  targetModule: CorrectionTargetModule,
) => {
  if (
    [
      'grossWeight',
      'tareWeight',
      'actualWeight',
      'sampleWeight',
      'weight',
    ].includes(fieldName)
  ) {
    const num = Number(newValue);
    if (isNaN(num) || num < 0)
      throw new BadRequestException(
        `Field ${fieldName} harus berupa angka positif.`,
      );
  }
  if (['startAt', 'endAt'].includes(fieldName)) {
    const d = new Date(newValue);
    if (isNaN(d.getTime()))
      throw new BadRequestException(
        `Field ${fieldName} harus berupa tanggal yang valid.`,
      );
  }
  if (
    ['actualQuantity', 'palletCount', 'bagCount', 'rollCount'].includes(
      fieldName,
    )
  ) {
    const num = Number(newValue);
    if (isNaN(num) || num < 0 || !Number.isInteger(num))
      throw new BadRequestException(
        `Field ${fieldName} harus berupa angka bulat positif.`,
      );
  }
  if (fieldName === 'status') {
    throw new BadRequestException(
      'Status tidak boleh diubah secara langsung melalui koreksi field. Gunakan action REOPEN_WORKFLOW.',
    );
  }
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

    if ((!dto.items || dto.items.length === 0) && dto.action !== CorrectionAction.REOPEN_WORKFLOW) {
      throw new BadRequestException(
        'Daftar item koreksi (items) tidak boleh kosong kecuali untuk REOPEN_WORKFLOW.',
      );
    }

    const cleanIp = ipAddress ? ipAddress.replace(/^.*:/, '') : null;
    const correctionNumber = `COR-${new Date().getFullYear()}-${crypto
      .randomBytes(4)
      .toString('hex')
      .toUpperCase()}`;

    const result = await this.prisma.$transaction(async (prismaTx) => {
      // Step 2 & 3: Validate Terminal Status and OCC Revision
      const tx = await prismaTx.transaction.findUnique({
        where: { id },
        include: {
          weighbridgeRecords: true,
          warehouseProcesses: true,
          qcVehicleChecks: true,
          incomingMaterialChecks: true,
          attachments: true,
        },
      });

      if (!tx) {
        throw new NotFoundException('Transaksi tidak ditemukan.');
      }

      if (
        !['COMPLETED', 'CANCELLED'].includes(tx.status) &&
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

      // Step 4: Validate Allowlist, Ownership, and Collect Collision-Proof Diffs
      const oldValuesSummary: Record<string, any> = {};
      const newValuesSummary: Record<string, any> = {};
      const itemInsertPayloads: any[] = [];
      const txUpdateData: Record<string, any> = {};
      let statusUpdatedTo: string | null = null;
      let hasActualChanges = false;

      for (const item of dto.items) {
        const allowedFields = FIELD_ALLOWLIST[item.targetModule] || [];
        if (!allowedFields.includes(item.fieldName)) {
          throw new BadRequestException(
            `Field ${item.fieldName} pada modul ${item.targetModule} masuk dalam Denylist / Protected dan tidak boleh dikoreksi.`,
          );
        }

        validateDomain(item.fieldName, item.newValue, item.targetModule);

        let valueToUpdate = item.newValue;
        if (
          item.fieldName === 'result' &&
          typeof item.newValue === 'string'
        ) {
          const upperVal = item.newValue.toUpperCase();
          if (['APPROVED', 'PASS', 'APPROVED_WITH_NOTE'].includes(upperVal)) {
            valueToUpdate = 'PASS';
          } else if (['REJECTED', 'REJECT'].includes(upperVal)) {
            valueToUpdate = 'REJECT';
          }
        }
        item.newValue = valueToUpdate;

        let extractedOldValue: any = null;
        let targetIdToUse = item.targetRecordId || null;

        if (
          item.targetModule === CorrectionTargetModule.TRANSACTION ||
          item.targetModule === CorrectionTargetModule.STATUS ||
          item.targetModule === CorrectionTargetModule.REMARK
        ) {
          extractedOldValue = (tx as any)[item.fieldName];
          txUpdateData[item.fieldName] = item.newValue;
          targetIdToUse = tx.id;
          if (item.fieldName === 'status') {
            statusUpdatedTo = item.newValue as string;
          }
        } else if (item.targetModule === CorrectionTargetModule.WEIGHBRIDGE) {
          if (!tx.weighbridgeRecords || tx.weighbridgeRecords.length === 0) {
            throw new BadRequestException(
              'Tidak ada data timbangan (WeighbridgeRecord) pada transaksi ini.',
            );
          }
          const rec = item.targetRecordId
            ? tx.weighbridgeRecords.find((r) => r.id === item.targetRecordId)
            : tx.weighbridgeRecords[tx.weighbridgeRecords.length - 1];

          if (!rec) {
            throw new BadRequestException(
              `Record timbangan ID ${item.targetRecordId} tidak ditemukan pada transaksi ini (Ownership Verification Gagal).`,
            );
          }
          targetIdToUse = rec.id;
          extractedOldValue = (rec as any)[item.fieldName];
          await prismaTx.weighbridgeRecord.update({
            where: { id: rec.id },
            data: { [item.fieldName]: item.newValue },
          });

          // Adapter auto-sync to Transaction root
          if (item.fieldName === 'weight') {
            if (rec.type === 'IN') {
              txUpdateData.grossWeight = Number(item.newValue);
            } else if (rec.type === 'OUT') {
              txUpdateData.tareWeight = Number(item.newValue);
            }
          }
        } else if (item.targetModule === CorrectionTargetModule.WAREHOUSE) {
          const rec = item.targetRecordId
            ? tx.warehouseProcesses?.find((r) => r.id === item.targetRecordId)
            : tx.warehouseProcesses?.[tx.warehouseProcesses.length - 1] || null;

          if (!rec) {
            throw new ConflictException(
              'Original Warehouse record does not exist and cannot be corrected',
            );
          }

          targetIdToUse = rec.id;
          extractedOldValue = (rec as any)[item.fieldName];
          await prismaTx.warehouseProcess.update({
            where: { id: rec.id },
            data: { [item.fieldName]: item.newValue },
          });

          // Adapter auto-sync to Transaction root
          if (item.fieldName === 'actualWeight') {
            txUpdateData.actualWeight = Number(item.newValue);
          } else if (item.fieldName === 'actualQuantity') {
            txUpdateData.actualQuantity = Number(item.newValue);
          } else if (item.fieldName === 'unit') {
            txUpdateData.warehouseUnit = item.newValue;
          } else if (item.fieldName === 'startAt') {
            txUpdateData.warehouseStartAt = new Date(item.newValue);
          } else if (item.fieldName === 'endAt') {
            txUpdateData.warehouseEndAt = new Date(item.newValue);
          }
        } else if (item.targetModule === CorrectionTargetModule.QC_VEHICLE) {
          const rec = item.targetRecordId
            ? tx.qcVehicleChecks?.find((r) => r.id === item.targetRecordId)
            : tx.qcVehicleChecks?.[tx.qcVehicleChecks.length - 1] || null;

          if (!rec) {
            throw new ConflictException(
              'Original QC Vehicle record does not exist and cannot be corrected',
            );
          }

          targetIdToUse = rec.id;
          extractedOldValue = (rec as any)[item.fieldName];
          if (
            item.fieldName === 'result' &&
            typeof item.newValue === 'string'
          ) {
            const upperVal = item.newValue.toUpperCase();
            if (['APPROVED', 'PASS', 'APPROVED_WITH_NOTE'].includes(upperVal)) {
              valueToUpdate = 'PASS';
            } else if (['REJECTED', 'REJECT'].includes(upperVal)) {
              valueToUpdate = 'REJECT';
            }
            item.newValue = valueToUpdate;
          }
          await prismaTx.qcVehicleCheck.update({
            where: { id: rec.id },
            data: { [item.fieldName]: valueToUpdate },
          });
        } else if (
          item.targetModule === CorrectionTargetModule.INCOMING_MATERIAL ||
          item.targetModule === CorrectionTargetModule.QC_MATERIAL
        ) {
          const rec = item.targetRecordId
            ? tx.incomingMaterialChecks?.find(
                (r) => r.id === item.targetRecordId,
              )
            : tx.incomingMaterialChecks?.[
                tx.incomingMaterialChecks.length - 1
              ] || null;

          if (!rec) {
            throw new ConflictException(
              'Original QC/Incoming Material record does not exist and cannot be corrected',
            );
          }

          targetIdToUse = rec.id;
          extractedOldValue = (rec as any)[item.fieldName];
          if (
            item.fieldName === 'result' &&
            typeof item.newValue === 'string'
          ) {
            const upperVal = item.newValue.toUpperCase();
            if (['APPROVED', 'PASS', 'APPROVED_WITH_NOTE'].includes(upperVal)) {
              valueToUpdate = 'PASS';
            } else if (['REJECTED', 'REJECT'].includes(upperVal)) {
              valueToUpdate = 'REJECT';
            }
            item.newValue = valueToUpdate;
          }
          await prismaTx.incomingMaterialCheck.update({
            where: { id: rec.id },
            data: { [item.fieldName]: valueToUpdate },
          });
        } else if (item.targetModule === CorrectionTargetModule.ATTACHMENT) {
          if (!tx.attachments || tx.attachments.length === 0) {
            throw new BadRequestException(
              'Tidak ada lampiran pada transaksi ini.',
            );
          }
          const rec = item.targetRecordId
            ? tx.attachments.find((r) => r.id === item.targetRecordId)
            : tx.attachments[tx.attachments.length - 1];

          if (!rec) {
            throw new BadRequestException(
              `Record lampiran ID ${item.targetRecordId} tidak ditemukan pada transaksi ini (Ownership Verification Gagal).`,
            );
          }
          targetIdToUse = rec.id;
          extractedOldValue = (rec as any)[item.fieldName];
          await prismaTx.attachment.update({
            where: { id: rec.id },
            data: { [item.fieldName]: item.newValue },
          });
        }

        if (
          JSON.stringify(extractedOldValue) !== JSON.stringify(item.newValue)
        ) {
          hasActualChanges = true;
        }

        const summaryKey = `${item.targetModule}.${
          targetIdToUse || 'root'
        }.${item.fieldName}`;
        oldValuesSummary[summaryKey] = extractedOldValue;
        newValuesSummary[summaryKey] = item.newValue;

        itemInsertPayloads.push({
          targetModule: item.targetModule,
          targetRecordId: targetIdToUse || null,
          fieldName: item.fieldName,
          oldValue: extractedOldValue !== undefined ? extractedOldValue : null,
          newValue: item.newValue !== undefined ? item.newValue : null,
          itemRemark: item.itemRemark || null,
        });
      }

      if (
        !hasActualChanges &&
        !statusUpdatedTo &&
        dto.action === CorrectionAction.CORRECT_DATA
      ) {
        throw new BadRequestException(
          'Tidak ada perubahan nilai (No-Op). Seluruh nilai baru identik dengan nilai di database.',
        );
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

      // Step 8 & 10: Auto-recalculate Net Weight if Gross/Tare changed
      if (proposedGross !== null && proposedTare !== null) {
        txUpdateData.netWeight = proposedGross - proposedTare;
      }

      // P1-04 Fix: REOPEN_WORKFLOW explicitly resets downstream completion timestamps and clears blocking records
      if (dto.action === CorrectionAction.REOPEN_WORKFLOW) {
        txUpdateData.status = 'QC_VEHICLE_PENDING';
        txUpdateData.completedAt = null;
        txUpdateData.gateOutAt = null;
        txUpdateData.weighOutAt = null;
        txUpdateData.weighOutById = null;
        txUpdateData.qcEndAt = null;
        txUpdateData.warehouseStartAt = null;
        txUpdateData.warehouseEndAt = null;
        txUpdateData.qcAnalysisCompleted = false;
        txUpdateData.qcAnalysisCompletedAt = null;

        // Supersede downstream workflow records instead of deleting them.
        await prismaTx.qcVehicleCheck.updateMany({
          where: { transactionId: id, isCurrent: true },
          data: { isCurrent: false, supersededAt: new Date(), supersededByCorrectionId: correctionNumber },
        });
        await prismaTx.incomingMaterialCheck.updateMany({
          where: { transactionId: id, isCurrent: true },
          data: { isCurrent: false, supersededAt: new Date(), supersededByCorrectionId: correctionNumber },
        });
        await prismaTx.warehouseProcess.updateMany({
          where: { transactionId: id, isCurrent: true },
          data: { isCurrent: false, supersededAt: new Date(), supersededByCorrectionId: correctionNumber },
        });

        // Also supersede OUT weighbridge record so they can weigh out again
        await prismaTx.weighbridgeRecord.updateMany({
          where: {
            transactionId: id,
            type: 'OUT',
            isCurrent: true
          },
          data: { isCurrent: false, supersededAt: new Date(), supersededByCorrectionId: correctionNumber },
        });
      }

      // Step 12: Atomic OCC Update on Transaction
      txUpdateData.revision = { increment: 1 };
      const updateRes = await prismaTx.transaction.updateMany({
        where: {
          id,
          revision: dto.expectedRevision,
        },
        data: txUpdateData as any,
      });

      if (updateRes.count === 0) {
        throw new ConflictException(
          'Data transaksi gagal dikoreksi karena telah diperbarui proses lain (Stale Revision) atau status tidak sesuai.',
        );
      }

      const updatedTx = await prismaTx.transaction.findUnique({
        where: { id },
        include: {
          weighbridgeRecords: true,
          incomingMaterialChecks: true,
          qcVehicleChecks: true,
          warehouseProcesses: true,
        },
      });

      // Step 9: Append Status History if Status Changed or Reopened
      if (
        statusUpdatedTo ||
        dto.action === CorrectionAction.CORRECT_RECORDED_STATUS ||
        dto.action === CorrectionAction.REOPEN_WORKFLOW
      ) {
        const targetStatus =
          statusUpdatedTo ||
          (dto.action === CorrectionAction.REOPEN_WORKFLOW
            ? 'QC_VEHICLE_PENDING'
            : tx.status);
        await prismaTx.transactionStatusHistory.create({
          data: {
            transactionId: id,
            oldStatus: tx.status,
            newStatus: targetStatus as TransactionStatus,
            notes: `ADMIN_CORRECTION: ${dto.remark} (Correction: ${correctionNumber})`,
            changedById: user?.id || null,
          },
        });
      }

      // Recalculate Derived Weights and generate FraudCheck if weights present
      const finalNet = updatedTx?.netWeight ?? null;
      const finalActual = updatedTx?.actualWeight ?? null;
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
      message:
        'Operation Log berhasil dikoreksi dan dicatat secara atomik oleh Admin.',
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
        warehouseStartBy: {
          select: { id: true, name: true, role: true },
        },
        qcVehicleChecks: {
          include: {
            checkedBy: {
              select: { id: true, name: true, role: true },
            },
          },
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
      const corrections = await (
        this.prisma.transactionCorrection as any
      ).findMany({
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

      let origCreator = 'Operator Awal / QC Lapangan';
      if (tx.weighInBy) {
        origCreator = `${tx.weighInBy.role} — ${tx.weighInBy.name}`;
      } else if (tx.warehouseStartBy) {
        origCreator = `${tx.warehouseStartBy.role} — ${tx.warehouseStartBy.name}`;
      } else if (tx.qcVehicleChecks?.[0]?.checkedBy) {
        origCreator = `${tx.qcVehicleChecks[0].checkedBy.role} — ${tx.qcVehicleChecks[0].checkedBy.name}`;
      }

      return {
        success: true,
        attribution: {
          originalCreatedBy: origCreator,
          lastCorrectedBy:
            corrections.length > 0 && corrections[0]?.correctedBy
              ? `ADMIN — ${corrections[0].correctedBy.name}`
              : null,
        },
        data: corrections,
      };
    } catch (err: any) {
      this.logger.error(
        `Failed to fetch operation log corrections: ${err.message}`,
      );
      throw new InternalServerErrorException(
        'Gagal mengambil riwayat koreksi Operation Log (Layanan Audit Tidak Bersedia).',
      );
    }
  }
}
