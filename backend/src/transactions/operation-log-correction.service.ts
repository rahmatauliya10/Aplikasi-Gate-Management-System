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
    // Step 1: Validate Role & Action
    if (user?.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Hanya Admin yang diizinkan mengoreksi Operation Log.',
      );
    }

    if (dto.action === CorrectionAction.CORRECT_RECORDED_STATUS) {
      throw new BadRequestException(
        'Action CORRECT_RECORDED_STATUS telah dinonaktifkan. Gunakan REOPEN_WORKFLOW.',
      );
    }

    if (
      (!dto.items || dto.items.length === 0) &&
      dto.action !== CorrectionAction.REOPEN_WORKFLOW
    ) {
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
          weighbridgeRecords: { where: { isCurrent: true } },
          warehouseProcesses: { where: { isCurrent: true } },
          qcVehicleChecks: { where: { isCurrent: true } },
          incomingMaterialChecks: { where: { isCurrent: true } },
          attachments: { where: { isCurrent: true } },
        },
      });

      if (!tx) {
        throw new NotFoundException('Transaksi tidak ditemukan.');
      }

      if (!['COMPLETED', 'CANCELLED'].includes(tx.status)) {
        throw new BadRequestException(
          'Koreksi Operation Log dan REOPEN hanya diizinkan untuk transaksi berstatus terminal (COMPLETED atau CANCELLED).',
        );
      }

      if ((tx as any).revision !== dto.expectedRevision) {
        throw new ConflictException(
          'Data transaksi telah diperbarui oleh pengguna lain (Revisi Tidak Cocok). Silakan muat ulang data terbaru sebelum melakukan koreksi.',
        );
      }

      // Step 4: Create TransactionCorrection Header first to obtain correction ID
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
          oldValues: {},
          newValues: {},
          expectedRevision: dto.expectedRevision,
          ipAddress: cleanIp,
        },
      });

      // Step 5: Validate Allowlist, Ownership, and Collect Collision-Proof Diffs
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
        if (item.fieldName === 'result' && typeof item.newValue === 'string') {
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
        let replacementIdToUse: string | null = null;

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

          const superseded = await prismaTx.weighbridgeRecord.updateMany({
            where: {
              id: rec.id,
              isCurrent: true,
              revision: rec.revision,
            },
            data: {
              isCurrent: false,
              supersededAt: new Date(),
              supersededByCorrectionId: correction.id,
            },
          });

          if (superseded.count !== 1) {
            throw new ConflictException(
              'Record telah dikoreksi oleh proses lain. Muat ulang data.',
            );
          }

          const newRec = await prismaTx.weighbridgeRecord.create({
            data: {
              transactionId: rec.transactionId,
              type: rec.type,
              weight:
                item.fieldName === 'weight'
                  ? Number(item.newValue)
                  : rec.weight,
              ticketNumber:
                item.fieldName === 'ticketNumber'
                  ? String(item.newValue)
                  : rec.ticketNumber,
              operatorId: rec.operatorId,
              remarks:
                item.fieldName === 'remarks'
                  ? String(item.newValue)
                  : rec.remarks,
              revision: rec.revision + 1,
              isCurrent: true,
            },
          });
          replacementIdToUse = newRec.id;

          // Adapter auto-sync to Transaction root using processType rules
          if (item.fieldName === 'weight') {
            if (tx.processType === 'GBJ') {
              if (rec.type === 'IN') {
                txUpdateData.tareWeight = Number(item.newValue);
              } else if (rec.type === 'OUT') {
                txUpdateData.grossWeight = Number(item.newValue);
              }
            } else {
              if (rec.type === 'IN') {
                txUpdateData.grossWeight = Number(item.newValue);
              } else if (rec.type === 'OUT') {
                txUpdateData.tareWeight = Number(item.newValue);
              }
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

          const superseded = await prismaTx.warehouseProcess.updateMany({
            where: {
              id: rec.id,
              isCurrent: true,
              revision: rec.revision,
            },
            data: {
              isCurrent: false,
              supersededAt: new Date(),
              supersededByCorrectionId: correction.id,
            },
          });

          if (superseded.count !== 1) {
            throw new ConflictException(
              'Record telah dikoreksi oleh proses lain. Muat ulang data.',
            );
          }

          const newRec = await prismaTx.warehouseProcess.create({
            data: {
              transactionId: rec.transactionId,
              processType: rec.processType,
              startAt:
                item.fieldName === 'startAt'
                  ? new Date(item.newValue)
                  : rec.startAt,
              endAt:
                item.fieldName === 'endAt'
                  ? new Date(item.newValue)
                  : rec.endAt,
              startById: rec.startById,
              endById: rec.endById,
              actualWeight:
                item.fieldName === 'actualWeight'
                  ? Number(item.newValue)
                  : rec.actualWeight,
              actualQuantity:
                item.fieldName === 'actualQuantity'
                  ? Number(item.newValue)
                  : rec.actualQuantity,
              unit: item.fieldName === 'unit' ? item.newValue : rec.unit,
              palletCount:
                item.fieldName === 'palletCount'
                  ? Number(item.newValue)
                  : rec.palletCount,
              bagCount:
                item.fieldName === 'bagCount'
                  ? Number(item.newValue)
                  : rec.bagCount,
              rollCount:
                item.fieldName === 'rollCount'
                  ? Number(item.newValue)
                  : rec.rollCount,
              condition:
                item.fieldName === 'condition' ? item.newValue : rec.condition,
              remarks:
                item.fieldName === 'remarks'
                  ? String(item.newValue)
                  : rec.remarks,
              checklistItems:
                item.fieldName === 'checklistItems'
                  ? item.newValue
                  : (rec.checklistItems as any),
              revision: rec.revision + 1,
              isCurrent: true,
            },
          });
          replacementIdToUse = newRec.id;

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

          const superseded = await prismaTx.qcVehicleCheck.updateMany({
            where: {
              id: rec.id,
              isCurrent: true,
              revision: rec.revision,
            },
            data: {
              isCurrent: false,
              supersededAt: new Date(),
              supersededByCorrectionId: correction.id,
            },
          });

          if (superseded.count !== 1) {
            throw new ConflictException(
              'Record telah dikoreksi oleh proses lain. Muat ulang data.',
            );
          }

          const newRec = await prismaTx.qcVehicleCheck.create({
            data: {
              transactionId: rec.transactionId,
              result: item.fieldName === 'result' ? valueToUpdate : rec.result,
              vehicleCleanliness:
                item.fieldName === 'vehicleCleanliness'
                  ? item.newValue
                  : rec.vehicleCleanliness,
              vehicleOdor:
                item.fieldName === 'vehicleOdor'
                  ? item.newValue
                  : rec.vehicleOdor,
              pestEvidence:
                item.fieldName === 'pestEvidence'
                  ? item.newValue
                  : rec.pestEvidence,
              vehicleCondition:
                item.fieldName === 'vehicleCondition'
                  ? item.newValue
                  : rec.vehicleCondition,
              documentCompleteness:
                item.fieldName === 'documentCompleteness'
                  ? item.newValue
                  : rec.documentCompleteness,
              sealCondition:
                item.fieldName === 'sealCondition'
                  ? item.newValue
                  : rec.sealCondition,
              notes:
                item.fieldName === 'notes' ? String(item.newValue) : rec.notes,
              checklistItems:
                item.fieldName === 'checklistItems'
                  ? item.newValue
                  : (rec.checklistItems as any),
              checkedById: rec.checkedById,
              startedAt: rec.startedAt,
              completedAt: rec.completedAt,
              revision: rec.revision + 1,
              isCurrent: true,
            },
          });
          replacementIdToUse = newRec.id;
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

          const superseded = await prismaTx.incomingMaterialCheck.updateMany({
            where: {
              id: rec.id,
              isCurrent: true,
              revision: rec.revision,
            },
            data: {
              isCurrent: false,
              supersededAt: new Date(),
              supersededByCorrectionId: correction.id,
            },
          });

          if (superseded.count !== 1) {
            throw new ConflictException(
              'Record telah dikoreksi oleh proses lain. Muat ulang data.',
            );
          }

          const newRec = await prismaTx.incomingMaterialCheck.create({
            data: {
              transactionId: rec.transactionId,
              result: item.fieldName === 'result' ? valueToUpdate : rec.result,
              odor: item.fieldName === 'odor' ? item.newValue : rec.odor,
              color: item.fieldName === 'color' ? item.newValue : rec.color,
              moisture:
                item.fieldName === 'moisture'
                  ? Number(item.newValue)
                  : rec.moisture,
              foreignMatter:
                item.fieldName === 'foreignMatter'
                  ? Number(item.newValue)
                  : rec.foreignMatter,
              beanCondition:
                item.fieldName === 'beanCondition'
                  ? item.newValue
                  : rec.beanCondition,
              sampleWeight:
                item.fieldName === 'sampleWeight'
                  ? Number(item.newValue)
                  : rec.sampleWeight,
              goodBeanPercentage:
                item.fieldName === 'goodBeanPercentage'
                  ? Number(item.newValue)
                  : rec.goodBeanPercentage,
              itemCondition:
                item.fieldName === 'itemCondition'
                  ? item.newValue
                  : rec.itemCondition,
              packagingCondition:
                item.fieldName === 'packagingCondition'
                  ? item.newValue
                  : rec.packagingCondition,
              quantityCheck:
                item.fieldName === 'quantityCheck'
                  ? item.newValue
                  : rec.quantityCheck,
              documentCheck:
                item.fieldName === 'documentCheck'
                  ? item.newValue
                  : rec.documentCheck,
              visualInspection:
                item.fieldName === 'visualInspection'
                  ? item.newValue
                  : rec.visualInspection,
              defectNotes:
                item.fieldName === 'defectNotes'
                  ? String(item.newValue)
                  : rec.defectNotes,
              notes:
                item.fieldName === 'notes' ? String(item.newValue) : rec.notes,
              checklistItems:
                item.fieldName === 'checklistItems'
                  ? item.newValue
                  : (rec.checklistItems as any),
              checkedById: rec.checkedById,
              startedAt: rec.startedAt,
              completedAt: rec.completedAt,
              revision: rec.revision + 1,
              isCurrent: true,
            },
          });
          replacementIdToUse = newRec.id;
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

          const superseded = await prismaTx.attachment.updateMany({
            where: {
              id: rec.id,
              isCurrent: true,
              revision: rec.revision,
            },
            data: {
              isCurrent: false,
              supersededAt: new Date(),
              supersededByCorrectionId: correction.id,
            },
          });

          if (superseded.count !== 1) {
            throw new ConflictException(
              'Record telah dikoreksi oleh proses lain. Muat ulang data.',
            );
          }

          const newRec = await prismaTx.attachment.create({
            data: {
              transactionId: rec.transactionId,
              module: rec.module,
              attachmentType: rec.attachmentType,
              originalName:
                item.fieldName === 'originalName'
                  ? String(item.newValue)
                  : rec.originalName,
              fileName: rec.fileName,
              filePath: rec.filePath,
              mimeType: rec.mimeType,
              size: rec.size,
              description:
                item.fieldName === 'description'
                  ? String(item.newValue)
                  : rec.description,
              uploadedById: rec.uploadedById,
              sha256: rec.sha256,
              revision: rec.revision + 1,
              isCurrent: true,
            },
          });
          replacementIdToUse = newRec.id;
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
          correctionId: correction.id,
          targetModule: item.targetModule,
          targetRecordId: targetIdToUse || null,
          replacementRecordId: replacementIdToUse || null,
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

      // Step 6: Insert correction items & update header summary
      await prismaTx.transactionCorrectionItem.createMany({
        data: itemInsertPayloads,
      });

      await prismaTx.transactionCorrection.update({
        where: { id: correction.id },
        data: {
          oldValues: oldValuesSummary as any,
          newValues: newValuesSummary as any,
        },
      });

      // Step 8 & 10: Auto-recalculate Net Weight if Gross/Tare changed
      if (proposedGross !== null && proposedTare !== null) {
        txUpdateData.netWeight = proposedGross - proposedTare;
      }

      // P1-04 Fix: REOPEN_WORKFLOW explicitly resets downstream completion timestamps and clears blocking records
      if (dto.action === CorrectionAction.REOPEN_WORKFLOW) {
        const targetReopenStatus = statusUpdatedTo || 'QC_VEHICLE_PENDING';
        const allowedReopenTargets = [
          'QC_VEHICLE_PENDING',
          'WEIGH_IN_PENDING',
          'WAREHOUSE_PENDING',
          'QC_ANALYSIS_PENDING',
        ];
        if (!allowedReopenTargets.includes(targetReopenStatus)) {
          throw new BadRequestException(
            `Target status ${targetReopenStatus} tidak diizinkan untuk REOPEN_WORKFLOW. Status harus merupakan salah satu dari allowlist.`,
          );
        }
        txUpdateData.status = targetReopenStatus;
        txUpdateData.completedAt = null;
        txUpdateData.gateOutAt = null;
        txUpdateData.weighOutAt = null;
        txUpdateData.weighOutById = null;
        txUpdateData.qcEndAt = null;
        txUpdateData.warehouseStartAt = null;
        txUpdateData.warehouseEndAt = null;
        txUpdateData.qcAnalysisCompleted = false;
        txUpdateData.qcAnalysisCompletedAt = null;

        // Supersede downstream workflow records using valid correction ID FK
        await prismaTx.qcVehicleCheck.updateMany({
          where: { transactionId: id, isCurrent: true },
          data: {
            isCurrent: false,
            supersededAt: new Date(),
            supersededByCorrectionId: correction.id,
          },
        });
        await prismaTx.incomingMaterialCheck.updateMany({
          where: { transactionId: id, isCurrent: true },
          data: {
            isCurrent: false,
            supersededAt: new Date(),
            supersededByCorrectionId: correction.id,
          },
        });
        await prismaTx.warehouseProcess.updateMany({
          where: { transactionId: id, isCurrent: true },
          data: {
            isCurrent: false,
            supersededAt: new Date(),
            supersededByCorrectionId: correction.id,
          },
        });

        // Also supersede OUT weighbridge record so they can weigh out again
        await prismaTx.weighbridgeRecord.updateMany({
          where: {
            transactionId: id,
            type: 'OUT',
            isCurrent: true,
          },
          data: {
            isCurrent: false,
            supersededAt: new Date(),
            supersededByCorrectionId: correction.id,
          },
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
          where: { isCurrent: true },
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
