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

    if (dto.action === CorrectionAction.REOPEN_WORKFLOW) {
      if (!dto.reopenTargetStatus) {
        throw new BadRequestException(
          'reopenTargetStatus wajib diisi apabila action adalah REOPEN_WORKFLOW.',
        );
      }
      if (dto.items && dto.items.length > 0) {
        throw new BadRequestException(
          'REOPEN_WORKFLOW tidak boleh digabung dengan items koreksi data. Kirim transaksi REOPEN_WORKFLOW secara terpisah.',
        );
      }
    }

    if (
      dto.reopenTargetStatus &&
      dto.action !== CorrectionAction.REOPEN_WORKFLOW
    ) {
      throw new BadRequestException(
        'reopenTargetStatus hanya boleh diberikan apabila action adalah REOPEN_WORKFLOW.',
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
      const tx: any = await prismaTx.transaction.findUnique({
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

      if (tx.revision !== dto.expectedRevision) {
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

      // Step 5: Validate Allowlist, Ownership, and Group Items by Target Record
      const oldValuesSummary: Record<string, any> = {};
      const newValuesSummary: Record<string, any> = {};
      const itemInsertPayloads: any[] = [];
      const txUpdateData: Record<string, any> = {};
      let statusUpdatedTo: string | null = null;
      let hasActualChanges = false;

      // Grouping buckets
      const rootItems: any[] = [];
      const recordGroups = new Map<
        string,
        {
          targetModule: CorrectionTargetModule;
          targetRecord: any;
          items: any[];
        }
      >();

      for (const item of dto.items || []) {
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

        if (
          item.targetModule === CorrectionTargetModule.TRANSACTION ||
          item.targetModule === CorrectionTargetModule.STATUS ||
          item.targetModule === CorrectionTargetModule.REMARK
        ) {
          rootItems.push(item);
        } else if (item.targetModule === CorrectionTargetModule.WEIGHBRIDGE) {
          if (!tx.weighbridgeRecords || tx.weighbridgeRecords.length === 0) {
            throw new BadRequestException(
              'Tidak ada data timbangan (WeighbridgeRecord) pada transaksi ini.',
            );
          }
          const rec = item.targetRecordId
            ? tx.weighbridgeRecords.find(
                (r: any) => r.id === item.targetRecordId,
              )
            : tx.weighbridgeRecords[tx.weighbridgeRecords.length - 1];

          if (!rec) {
            throw new BadRequestException(
              `Record timbangan ID ${item.targetRecordId} tidak ditemukan pada transaksi ini (Ownership Verification Gagal).`,
            );
          }

          const groupKey = `WEIGHBRIDGE:${rec.id}`;
          if (!recordGroups.has(groupKey)) {
            recordGroups.set(groupKey, {
              targetModule: CorrectionTargetModule.WEIGHBRIDGE,
              targetRecord: rec,
              items: [],
            });
          }
          recordGroups.get(groupKey)!.items.push(item);
        } else if (item.targetModule === CorrectionTargetModule.WAREHOUSE) {
          const rec = item.targetRecordId
            ? tx.warehouseProcesses?.find(
                (r: any) => r.id === item.targetRecordId,
              )
            : tx.warehouseProcesses?.[tx.warehouseProcesses.length - 1] || null;

          if (!rec) {
            throw new ConflictException(
              'Original Warehouse record does not exist and cannot be corrected',
            );
          }

          const groupKey = `WAREHOUSE:${rec.id}`;
          if (!recordGroups.has(groupKey)) {
            recordGroups.set(groupKey, {
              targetModule: CorrectionTargetModule.WAREHOUSE,
              targetRecord: rec,
              items: [],
            });
          }
          recordGroups.get(groupKey)!.items.push(item);
        } else if (item.targetModule === CorrectionTargetModule.QC_VEHICLE) {
          const rec = item.targetRecordId
            ? tx.qcVehicleChecks?.find((r: any) => r.id === item.targetRecordId)
            : tx.qcVehicleChecks?.[tx.qcVehicleChecks.length - 1] || null;

          if (!rec) {
            throw new ConflictException(
              'Original QC Vehicle record does not exist and cannot be corrected',
            );
          }

          const groupKey = `QC_VEHICLE:${rec.id}`;
          if (!recordGroups.has(groupKey)) {
            recordGroups.set(groupKey, {
              targetModule: CorrectionTargetModule.QC_VEHICLE,
              targetRecord: rec,
              items: [],
            });
          }
          recordGroups.get(groupKey)!.items.push(item);
        } else if (
          item.targetModule === CorrectionTargetModule.INCOMING_MATERIAL ||
          item.targetModule === CorrectionTargetModule.QC_MATERIAL
        ) {
          const rec = item.targetRecordId
            ? tx.incomingMaterialChecks?.find(
                (r: any) => r.id === item.targetRecordId,
              )
            : tx.incomingMaterialChecks?.[
                tx.incomingMaterialChecks.length - 1
              ] || null;

          if (!rec) {
            throw new ConflictException(
              'Original QC/Incoming Material record does not exist and cannot be corrected',
            );
          }

          const groupKey = `${item.targetModule}:${rec.id}`;
          if (!recordGroups.has(groupKey)) {
            recordGroups.set(groupKey, {
              targetModule: item.targetModule,
              targetRecord: rec,
              items: [],
            });
          }
          recordGroups.get(groupKey)!.items.push(item);
        } else if (item.targetModule === CorrectionTargetModule.ATTACHMENT) {
          if (!tx.attachments || tx.attachments.length === 0) {
            throw new BadRequestException(
              'Tidak ada lampiran pada transaksi ini.',
            );
          }
          const rec = item.targetRecordId
            ? tx.attachments.find((r: any) => r.id === item.targetRecordId)
            : tx.attachments[tx.attachments.length - 1];

          if (!rec) {
            throw new BadRequestException(
              `Record lampiran ID ${item.targetRecordId} tidak ditemukan pada transaksi ini (Ownership Verification Gagal).`,
            );
          }

          const groupKey = `ATTACHMENT:${rec.id}`;
          if (!recordGroups.has(groupKey)) {
            recordGroups.set(groupKey, {
              targetModule: CorrectionTargetModule.ATTACHMENT,
              targetRecord: rec,
              items: [],
            });
          }
          recordGroups.get(groupKey)!.items.push(item);
        }
      }

      // Process Root items (TRANSACTION, STATUS, REMARK)
      for (const item of rootItems) {
        const extractedOldValue = tx[item.fieldName];
        txUpdateData[item.fieldName] = item.newValue;
        if (item.fieldName === 'status') {
          statusUpdatedTo = item.newValue as string;
        }
        if (
          JSON.stringify(extractedOldValue) !== JSON.stringify(item.newValue)
        ) {
          hasActualChanges = true;
        }

        const summaryKey = `${item.targetModule}.${tx.id}.${item.fieldName}`;
        oldValuesSummary[summaryKey] = extractedOldValue;
        newValuesSummary[summaryKey] = item.newValue;

        itemInsertPayloads.push({
          correctionId: correction.id,
          targetModule: item.targetModule,
          targetRecordId: tx.id,
          replacementRecordId: null,
          fieldName: item.fieldName,
          oldValue: extractedOldValue !== undefined ? extractedOldValue : null,
          newValue: item.newValue !== undefined ? item.newValue : null,
          itemRemark: item.itemRemark || null,
        });
      }

      // Process Record-level Groups (WEIGHBRIDGE, WAREHOUSE, QC_VEHICLE, INCOMING_MATERIAL, ATTACHMENT)
      for (const [, group] of recordGroups) {
        const { targetModule, targetRecord: rec, items } = group;

        if (targetModule === CorrectionTargetModule.WEIGHBRIDGE) {
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

          let updatedWeight = rec.weight;
          let updatedTicketNumber = rec.ticketNumber;
          let updatedRemarks = rec.remarks;

          for (const item of items) {
            const extractedOldValue = rec[item.fieldName];
            if (item.fieldName === 'weight') {
              updatedWeight = Number(item.newValue);
              // GBJ vs GBB/GSP mapping rules:
              // GBJ: OUT -> grossWeight, IN -> tareWeight
              // GBB/GSP: IN -> grossWeight, OUT -> tareWeight
              if (tx.processType === 'GBJ') {
                if (rec.type === 'IN') {
                  txUpdateData.tareWeight = updatedWeight;
                } else if (rec.type === 'OUT') {
                  txUpdateData.grossWeight = updatedWeight;
                }
              } else {
                if (rec.type === 'IN') {
                  txUpdateData.grossWeight = updatedWeight;
                } else if (rec.type === 'OUT') {
                  txUpdateData.tareWeight = updatedWeight;
                }
              }
            } else if (item.fieldName === 'ticketNumber') {
              updatedTicketNumber = String(item.newValue);
            } else if (item.fieldName === 'remarks') {
              updatedRemarks = String(item.newValue);
            }

            if (
              JSON.stringify(extractedOldValue) !==
              JSON.stringify(item.newValue)
            ) {
              hasActualChanges = true;
            }
            const summaryKey = `WEIGHBRIDGE.${rec.id}.${item.fieldName}`;
            oldValuesSummary[summaryKey] = extractedOldValue;
            newValuesSummary[summaryKey] = item.newValue;
          }

          const newRec = await prismaTx.weighbridgeRecord.create({
            data: {
              transactionId: rec.transactionId,
              type: rec.type,
              weight: updatedWeight,
              ticketNumber: updatedTicketNumber,
              operatorId: rec.operatorId,
              remarks: updatedRemarks,
              revision: rec.revision + 1,
              isCurrent: true,
            },
          });

          for (const item of items) {
            itemInsertPayloads.push({
              correctionId: correction.id,
              targetModule: item.targetModule,
              targetRecordId: rec.id,
              replacementRecordId: newRec.id,
              fieldName: item.fieldName,
              oldValue: rec[item.fieldName] ?? null,
              newValue: item.newValue ?? null,
              itemRemark: item.itemRemark || null,
            });
          }
        } else if (targetModule === CorrectionTargetModule.WAREHOUSE) {
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

          const updatedFields: any = {
            startAt: rec.startAt,
            endAt: rec.endAt,
            actualWeight: rec.actualWeight,
            actualQuantity: rec.actualQuantity,
            unit: rec.unit,
            palletCount: rec.palletCount,
            bagCount: rec.bagCount,
            rollCount: rec.rollCount,
            condition: rec.condition,
            remarks: rec.remarks,
            checklistItems: rec.checklistItems,
          };

          for (const item of items) {
            const extractedOldValue = rec[item.fieldName];
            if (['startAt', 'endAt'].includes(item.fieldName)) {
              updatedFields[item.fieldName] = new Date(item.newValue);
            } else if (
              [
                'actualWeight',
                'actualQuantity',
                'palletCount',
                'bagCount',
                'rollCount',
              ].includes(item.fieldName)
            ) {
              updatedFields[item.fieldName] = Number(item.newValue);
            } else if (item.fieldName === 'remarks') {
              updatedFields[item.fieldName] = String(item.newValue);
            } else {
              updatedFields[item.fieldName] = item.newValue;
            }

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

            if (
              JSON.stringify(extractedOldValue) !==
              JSON.stringify(item.newValue)
            ) {
              hasActualChanges = true;
            }
            const summaryKey = `WAREHOUSE.${rec.id}.${item.fieldName}`;
            oldValuesSummary[summaryKey] = extractedOldValue;
            newValuesSummary[summaryKey] = item.newValue;
          }

          const newRec = await prismaTx.warehouseProcess.create({
            data: {
              transactionId: rec.transactionId,
              processType: rec.processType,
              startAt: updatedFields.startAt,
              endAt: updatedFields.endAt,
              startById: rec.startById,
              endById: rec.endById,
              actualWeight: updatedFields.actualWeight,
              actualQuantity: updatedFields.actualQuantity,
              unit: updatedFields.unit,
              palletCount: updatedFields.palletCount,
              bagCount: updatedFields.bagCount,
              rollCount: updatedFields.rollCount,
              condition: updatedFields.condition,
              remarks: updatedFields.remarks,
              checklistItems: updatedFields.checklistItems,
              revision: rec.revision + 1,
              isCurrent: true,
            },
          });

          for (const item of items) {
            itemInsertPayloads.push({
              correctionId: correction.id,
              targetModule: item.targetModule,
              targetRecordId: rec.id,
              replacementRecordId: newRec.id,
              fieldName: item.fieldName,
              oldValue: rec[item.fieldName] ?? null,
              newValue: item.newValue ?? null,
              itemRemark: item.itemRemark || null,
            });
          }
        } else if (targetModule === CorrectionTargetModule.QC_VEHICLE) {
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

          const updatedFields: any = {
            result: rec.result,
            vehicleCleanliness: rec.vehicleCleanliness,
            vehicleOdor: rec.vehicleOdor,
            pestEvidence: rec.pestEvidence,
            vehicleCondition: rec.vehicleCondition,
            documentCompleteness: rec.documentCompleteness,
            sealCondition: rec.sealCondition,
            notes: rec.notes,
            checklistItems: rec.checklistItems,
          };

          for (const item of items) {
            const extractedOldValue = rec[item.fieldName];
            if (item.fieldName === 'notes') {
              updatedFields[item.fieldName] = String(item.newValue);
            } else {
              updatedFields[item.fieldName] = item.newValue;
            }

            if (
              JSON.stringify(extractedOldValue) !==
              JSON.stringify(item.newValue)
            ) {
              hasActualChanges = true;
            }
            const summaryKey = `QC_VEHICLE.${rec.id}.${item.fieldName}`;
            oldValuesSummary[summaryKey] = extractedOldValue;
            newValuesSummary[summaryKey] = item.newValue;
          }

          const newRec = await prismaTx.qcVehicleCheck.create({
            data: {
              transactionId: rec.transactionId,
              result: updatedFields.result,
              vehicleCleanliness: updatedFields.vehicleCleanliness,
              vehicleOdor: updatedFields.vehicleOdor,
              pestEvidence: updatedFields.pestEvidence,
              vehicleCondition: updatedFields.vehicleCondition,
              documentCompleteness: updatedFields.documentCompleteness,
              sealCondition: updatedFields.sealCondition,
              notes: updatedFields.notes,
              checklistItems: updatedFields.checklistItems,
              checkedById: rec.checkedById,
              startedAt: rec.startedAt,
              completedAt: rec.completedAt,
              revision: rec.revision + 1,
              isCurrent: true,
            },
          });

          for (const item of items) {
            itemInsertPayloads.push({
              correctionId: correction.id,
              targetModule: item.targetModule,
              targetRecordId: rec.id,
              replacementRecordId: newRec.id,
              fieldName: item.fieldName,
              oldValue: rec[item.fieldName] ?? null,
              newValue: item.newValue ?? null,
              itemRemark: item.itemRemark || null,
            });
          }
        } else if (
          targetModule === CorrectionTargetModule.INCOMING_MATERIAL ||
          targetModule === CorrectionTargetModule.QC_MATERIAL
        ) {
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

          const updatedFields: any = {
            result: rec.result,
            odor: rec.odor,
            color: rec.color,
            moisture: rec.moisture,
            foreignMatter: rec.foreignMatter,
            beanCondition: rec.beanCondition,
            sampleWeight: rec.sampleWeight,
            goodBeanPercentage: rec.goodBeanPercentage,
            itemCondition: rec.itemCondition,
            packagingCondition: rec.packagingCondition,
            quantityCheck: rec.quantityCheck,
            documentCheck: rec.documentCheck,
            visualInspection: rec.visualInspection,
            defectNotes: rec.defectNotes,
            notes: rec.notes,
            checklistItems: rec.checklistItems,
          };

          for (const item of items) {
            const extractedOldValue = rec[item.fieldName];
            if (
              [
                'moisture',
                'foreignMatter',
                'sampleWeight',
                'goodBeanPercentage',
              ].includes(item.fieldName)
            ) {
              updatedFields[item.fieldName] = Number(item.newValue);
            } else if (['defectNotes', 'notes'].includes(item.fieldName)) {
              updatedFields[item.fieldName] = String(item.newValue);
            } else {
              updatedFields[item.fieldName] = item.newValue;
            }

            if (
              JSON.stringify(extractedOldValue) !==
              JSON.stringify(item.newValue)
            ) {
              hasActualChanges = true;
            }
            const summaryKey = `${targetModule}.${rec.id}.${item.fieldName}`;
            oldValuesSummary[summaryKey] = extractedOldValue;
            newValuesSummary[summaryKey] = item.newValue;
          }

          const newRec = await prismaTx.incomingMaterialCheck.create({
            data: {
              transactionId: rec.transactionId,
              result: updatedFields.result,
              odor: updatedFields.odor,
              color: updatedFields.color,
              moisture: updatedFields.moisture,
              foreignMatter: updatedFields.foreignMatter,
              beanCondition: updatedFields.beanCondition,
              sampleWeight: updatedFields.sampleWeight,
              goodBeanPercentage: updatedFields.goodBeanPercentage,
              itemCondition: updatedFields.itemCondition,
              packagingCondition: updatedFields.packagingCondition,
              quantityCheck: updatedFields.quantityCheck,
              documentCheck: updatedFields.documentCheck,
              visualInspection: updatedFields.visualInspection,
              defectNotes: updatedFields.defectNotes,
              notes: updatedFields.notes,
              checklistItems: updatedFields.checklistItems,
              checkedById: rec.checkedById,
              startedAt: rec.startedAt,
              completedAt: rec.completedAt,
              revision: rec.revision + 1,
              isCurrent: true,
            },
          });

          for (const item of items) {
            itemInsertPayloads.push({
              correctionId: correction.id,
              targetModule: item.targetModule,
              targetRecordId: rec.id,
              replacementRecordId: newRec.id,
              fieldName: item.fieldName,
              oldValue: rec[item.fieldName] ?? null,
              newValue: item.newValue ?? null,
              itemRemark: item.itemRemark || null,
            });
          }
        } else if (targetModule === CorrectionTargetModule.ATTACHMENT) {
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

          const updatedFields: any = {
            originalName: rec.originalName,
            description: rec.description,
          };

          for (const item of items) {
            const extractedOldValue = rec[item.fieldName];
            updatedFields[item.fieldName] = String(item.newValue);

            if (
              JSON.stringify(extractedOldValue) !==
              JSON.stringify(item.newValue)
            ) {
              hasActualChanges = true;
            }
            const summaryKey = `ATTACHMENT.${rec.id}.${item.fieldName}`;
            oldValuesSummary[summaryKey] = extractedOldValue;
            newValuesSummary[summaryKey] = item.newValue;
          }

          const newRec = await prismaTx.attachment.create({
            data: {
              attachmentLineageId: rec.attachmentLineageId,
              transactionId: rec.transactionId,
              module: rec.module,
              attachmentType: rec.attachmentType,
              originalName: updatedFields.originalName,
              fileName: rec.fileName,
              filePath: rec.filePath,
              mimeType: rec.mimeType,
              size: rec.size,
              description: updatedFields.description,
              uploadedById: rec.uploadedById,
              sha256: rec.sha256,
              revision: rec.revision + 1,
              isCurrent: true,
            },
          });

          for (const item of items) {
            itemInsertPayloads.push({
              correctionId: correction.id,
              targetModule: item.targetModule,
              targetRecordId: rec.id,
              replacementRecordId: newRec.id,
              fieldName: item.fieldName,
              oldValue: rec[item.fieldName] ?? null,
              newValue: item.newValue ?? null,
              itemRemark: item.itemRemark || null,
            });
          }
        }
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

      // REOPEN_WORKFLOW explicitly resets downstream completion timestamps and clears blocking records based on Stage Matrix
      if (dto.action === CorrectionAction.REOPEN_WORKFLOW) {
        const targetReopenStatus =
          dto.reopenTargetStatus ||
          (statusUpdatedTo as TransactionStatus) ||
          TransactionStatus.QC_VEHICLE_PENDING;
        const processType = (tx.processType || 'GBB').toUpperCase();
        const REOPEN_ALLOWED_TARGETS: Record<string, TransactionStatus[]> = {
          GBB: [
            TransactionStatus.REGISTERED,
            TransactionStatus.WEIGH_IN_DONE,
            TransactionStatus.QC_VEHICLE_PENDING,
            TransactionStatus.QC_VEHICLE_IN_PROGRESS,
            TransactionStatus.INCOMING_CHECK_PENDING,
            TransactionStatus.INCOMING_CHECK_IN_PROGRESS,
            TransactionStatus.WAREHOUSE_IN_PROGRESS,
          ],
          GSP: [
            TransactionStatus.REGISTERED,
            TransactionStatus.WEIGH_IN_DONE,
            TransactionStatus.QC_VEHICLE_PENDING,
            TransactionStatus.QC_VEHICLE_IN_PROGRESS,
            TransactionStatus.INCOMING_CHECK_PENDING,
            TransactionStatus.INCOMING_CHECK_IN_PROGRESS,
            TransactionStatus.WAREHOUSE_IN_PROGRESS,
          ],
          GBJ: [
            TransactionStatus.REGISTERED,
            TransactionStatus.WEIGH_IN_DONE,
            TransactionStatus.QC_VEHICLE_PENDING,
            TransactionStatus.QC_VEHICLE_IN_PROGRESS,
            TransactionStatus.WAREHOUSE_IN_PROGRESS,
          ],
        };

        const allowedReopenTargets = REOPEN_ALLOWED_TARGETS[processType];

        if (!allowedReopenTargets) {
          throw new BadRequestException(
            `Unsupported processType for REOPEN_WORKFLOW: ${tx.processType || 'null'}`,
          );
        }

        if (!allowedReopenTargets.includes(targetReopenStatus)) {
          throw new BadRequestException(
            `Target status ${targetReopenStatus} tidak diizinkan untuk REOPEN_WORKFLOW transaksi tipe ${processType}. Target status harus sesuai dengan workflow matriks tipe proses.`,
          );
        }
        statusUpdatedTo = targetReopenStatus;
        txUpdateData.status = targetReopenStatus;

        // 1. Always clear cancellation and terminal completion fields on REOPEN
        txUpdateData.cancelledAt = null;
        txUpdateData.cancelledById = null;
        txUpdateData.cancellationReason = null;
        txUpdateData.completedAt = null;
        txUpdateData.gateOutAt = null;
        txUpdateData.weighOutAt = null;
        txUpdateData.weighOutById = null;

        // 2. Always supersede OUT weighbridge record on REOPEN
        await prismaTx.weighbridgeRecord.updateMany({
          where: { transactionId: id, type: 'OUT', isCurrent: true },
          data: {
            isCurrent: false,
            supersededAt: new Date(),
            supersededByCorrectionId: correction.id,
          },
        });

        // 3. Stage Matrix based on targetReopenStatus & processType
        if (targetReopenStatus === TransactionStatus.REGISTERED) {
          // Reset back to before weigh-in
          txUpdateData.weighInAt = null;
          txUpdateData.weighInById = null;
          txUpdateData.grossWeight = null;
          txUpdateData.tareWeight = null;
          txUpdateData.netWeight = null;
          txUpdateData.qcStartAt = null;
          txUpdateData.qcEndAt = null;
          txUpdateData.incomingQcStartAt = null;
          txUpdateData.qcAnalysisCompleted = false;
          txUpdateData.qcAnalysisCompletedAt = null;
          txUpdateData.warehouseStartAt = null;
          txUpdateData.warehouseEndAt = null;
          txUpdateData.warehouseStartById = null;
          txUpdateData.warehouseEndById = null;
          txUpdateData.actualWeight = null;
          txUpdateData.actualQuantity = null;
          txUpdateData.warehouseUnit = null;

          // Supersede IN weighbridge and all downstream checks
          await prismaTx.weighbridgeRecord.updateMany({
            where: { transactionId: id, type: 'IN', isCurrent: true },
            data: {
              isCurrent: false,
              supersededAt: new Date(),
              supersededByCorrectionId: correction.id,
            },
          });
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
        } else if (
          targetReopenStatus === TransactionStatus.WEIGH_IN_DONE ||
          targetReopenStatus === TransactionStatus.QC_VEHICLE_PENDING ||
          targetReopenStatus === TransactionStatus.QC_VEHICLE_IN_PROGRESS
        ) {
          // Weigh-in completed, reopening to QC Vehicle stage
          txUpdateData.qcEndAt = null;
          txUpdateData.incomingQcStartAt = null;
          txUpdateData.qcAnalysisCompleted = false;
          txUpdateData.qcAnalysisCompletedAt = null;
          txUpdateData.warehouseStartAt = null;
          txUpdateData.warehouseEndAt = null;
          txUpdateData.warehouseStartById = null;
          txUpdateData.warehouseEndById = null;
          txUpdateData.actualWeight = null;
          txUpdateData.actualQuantity = null;
          txUpdateData.warehouseUnit = null;

          if (targetReopenStatus === TransactionStatus.QC_VEHICLE_IN_PROGRESS) {
            txUpdateData.qcStartAt = tx.qcStartAt || new Date();
          } else {
            txUpdateData.qcStartAt = null;
          }

          if (targetReopenStatus !== TransactionStatus.QC_VEHICLE_IN_PROGRESS) {
            await prismaTx.qcVehicleCheck.updateMany({
              where: { transactionId: id, isCurrent: true },
              data: {
                isCurrent: false,
                supersededAt: new Date(),
                supersededByCorrectionId: correction.id,
              },
            });
          }
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
        } else if (
          targetReopenStatus === TransactionStatus.WAREHOUSE_IN_PROGRESS
        ) {
          // Reopen to Warehouse process stage
          txUpdateData.warehouseStartAt = tx.warehouseStartAt || new Date();
          txUpdateData.warehouseEndAt = null;
          txUpdateData.warehouseEndById = null;
          txUpdateData.actualWeight = null;
          txUpdateData.actualQuantity = null;
          txUpdateData.warehouseUnit = null;
          txUpdateData.incomingQcStartAt = null;
          txUpdateData.qcAnalysisCompleted = false;
          txUpdateData.qcAnalysisCompletedAt = null;

          await prismaTx.warehouseProcess.updateMany({
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

          // For GBJ, Vehicle QC is downstream, so supersede it; for GBB/GSP, Vehicle QC is upstream, so retain it.
          if (tx.processType === 'GBJ') {
            await prismaTx.qcVehicleCheck.updateMany({
              where: { transactionId: id, isCurrent: true },
              data: {
                isCurrent: false,
                supersededAt: new Date(),
                supersededByCorrectionId: correction.id,
              },
            });
          }

          const latestWh = await prismaTx.warehouseProcess.findFirst({
            where: { transactionId: id },
            orderBy: { revision: 'desc' },
          });
          const nextRevision = (latestWh?.revision || 0) + 1;

          await prismaTx.warehouseProcess.create({
            data: {
              transactionId: id,
              processType: tx.processType,
              revision: nextRevision,
              isCurrent: true,
              startById: user?.id,
              startAt: txUpdateData.warehouseStartAt || new Date(),
            },
          });
        } else if (
          targetReopenStatus === TransactionStatus.INCOMING_CHECK_PENDING ||
          targetReopenStatus === TransactionStatus.INCOMING_CHECK_IN_PROGRESS
        ) {
          // Reopen to Incoming QC stage (GBB / GSP)
          txUpdateData.incomingQcStartAt =
            targetReopenStatus === TransactionStatus.INCOMING_CHECK_IN_PROGRESS
              ? tx.incomingQcStartAt || new Date()
              : null;
          txUpdateData.qcAnalysisCompleted = false;
          txUpdateData.qcAnalysisCompletedAt = null;

          // Retain upstream QcVehicleCheck & WarehouseProcess! Only supersede IncomingMaterialCheck.
          await prismaTx.incomingMaterialCheck.updateMany({
            where: { transactionId: id, isCurrent: true },
            data: {
              isCurrent: false,
              supersededAt: new Date(),
              supersededByCorrectionId: correction.id,
            },
          });
        }
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
