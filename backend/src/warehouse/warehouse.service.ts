import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { StartWarehouseDto } from './dto/start-warehouse.dto';
import { SubmitChecklistDispositionDto } from './dto/submit-checklist-disposition.dto';
import {
  CompleteWarehouseDto,
  validateReceivedQuantityString,
} from './dto/complete-warehouse.dto';
import { WarehouseQueryDto } from './dto/warehouse-query.dto';
import {
  TransactionStatus,
  Prisma,
  ProcessType,
  QcResult,
} from '@prisma/client';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { evaluatePaExemption } from '../qc/constants/pa-exemption-policy';
import { assertValidStatusTransition } from '../common/state-machine/workflow-state-machine';
import {
  GSP_PREUNLOAD_VERSION,
  GSP_PREUNLOAD_CODES,
  GSP_PREUNLOAD_LABEL_MAP,
  NON_CONCESSIBLE_CHECKLIST_CODES,
} from './constants/gsp-preunload-checklist';
import { isValidGbjProductType } from './constants/gbj-products';

export function formatGspReceivedQuantity(val: any): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object' && typeof val.toFixed === 'function') {
    return val.toFixed(3);
  }
  const str = String(val).trim();
  if (!str) return null;
  if (str.includes('.')) {
    const [intPart, decPart] = str.split('.');
    return `${intPart}.${decPart.padEnd(3, '0').slice(0, 3)}`;
  }
  return `${str}.000`;
}

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
    if (user.role === 'WAREHOUSE' && allowedProcessTypes.length === 0) {
      throw new ForbiddenException({
        success: false,
        message:
          'Akses ditolak: Akun Warehouse Anda belum memiliki scope proses/gudang yang valid.',
        errors: [],
      });
    }

    const andConditions: Prisma.TransactionWhereInput[] = [];

    // Queue base conditions
    andConditions.push({
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
    });

    const statusConditions: Prisma.TransactionWhereInput[] = [
      { processType: 'GBB', status: 'QC_VEHICLE_PASSED' },
      { processType: 'GSP', status: 'QC_VEHICLE_PASSED' },
      { processType: 'GSP', status: 'PA_NOT_REQUIRED' },
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
      include: { productCatalog: true },
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

    // ─── Guard: GSP vs Non-GSP Verification (Defense-in-Depth Proof-of-PA Gate) ───
    if (tx.processType === 'GSP') {
      // P1-01: Hard Gate - Snapshot receiptUnit is mandatory before starting GSP unloading
      if (!tx.receiptUnit || !tx.receiptUnit.trim()) {
        await this.activityLogsService
          .logAction({
            userId: user.id,
            action: 'GSP_START_WAREHOUSE_BLOCKED_MISSING_UOM',
            module: 'WAREHOUSE',
            referenceId: transactionId,
            description: `GSP start warehouse blocked: Transaction ${transactionId} is missing canonical receiptUnit / UoM snapshot.`,
            status: 'FAILED',
          })
          .catch(() => {});
        throw new BadRequestException({
          success: false,
          message:
            'Gudang menolak memulai proses GSP: Satuan penerimaan (receiptUnit) tidak ditemukan pada transaksi. Unit penerimaan wajib ada sebelum bongkar dimulai.',
          errors: ['MISSING_GSP_RECEIPT_UNIT'],
        });
      }

      const exemptionEval = evaluatePaExemption(tx.productCatalog, {
        processType: tx.processType,
        cargoType: tx.cargoType,
        cargoSubType: tx.cargoSubType,
      });

      if (exemptionEval.isExempt) {
        // Solar BBM exemption branch: CANONICAL invariant: Solar MUST NEVER generate or use QC_VEHICLE_PASSED.
        // Post-weighin status for Solar is strictly PA_NOT_REQUIRED.
        if (tx.status === TransactionStatus.QC_VEHICLE_PASSED) {
          await this.activityLogsService
            .logAction({
              userId: user.id,
              action: 'WAREHOUSE_FLOW_REJECTED',
              module: 'WAREHOUSE',
              referenceId: transactionId,
              description: `Warehouse start rejected for GSP Solar: Invalid state QC_VEHICLE_PASSED. Solar is PA-exempt and must only have status PA_NOT_REQUIRED.`,
              status: 'FAILED',
            })
            .catch(() => {});
          throw new BadRequestException({
            success: false,
            message:
              'Gudang menolak memulai proses GSP Solar: Transaksi Solar tidak boleh berstatus QC_VEHICLE_PASSED. Status sah untuk Solar adalah PA_NOT_REQUIRED.',
            errors: [],
          });
        }

        const isSolarValid =
          tx.status === TransactionStatus.PA_NOT_REQUIRED &&
          tx.weighInAt != null &&
          tx.grossWeight != null &&
          Number(tx.grossWeight) > 0 &&
          tx.productCatalog != null &&
          tx.productCatalog.isActive === true &&
          tx.productCatalog.processType === 'GSP';

        if (!isSolarValid) {
          await this.activityLogsService
            .logAction({
              userId: user.id,
              action: 'WAREHOUSE_FLOW_REJECTED',
              module: 'WAREHOUSE',
              referenceId: transactionId,
              description: `Warehouse start rejected for GSP Solar: Incomplete weigh-in, non-exempt status (${tx.status}), or invalid exemption catalog.`,
              status: 'FAILED',
            })
            .catch(() => {});
          throw new BadRequestException({
            success: false,
            message:
              'Gudang menolak memulai proses GSP Solar: Transaksi wajib berstatus PA_NOT_REQUIRED, memiliki bukti weigh-in yang sah, gross weight valid, dan katalog produk aktif.',
            errors: [],
          });
        }
      } else {
        // Non-Solar GSP (Batubara, PAC, Rapid Klen) - Mandatory Proof-of-PA
        if (tx.status !== TransactionStatus.QC_VEHICLE_PASSED) {
          await this.activityLogsService
            .logAction({
              userId: user.id,
              action: 'WAREHOUSE_FLOW_REJECTED',
              module: 'WAREHOUSE',
              referenceId: transactionId,
              description: `Warehouse start rejected: GSP cargo ${tx.cargoSubType} has status ${tx.status}, expected QC_VEHICLE_PASSED.`,
              status: 'FAILED',
            })
            .catch(() => {});
          throw new BadRequestException({
            success: false,
            message: `Gudang tidak dapat memulai proses: Transaksi GSP ${tx.cargoSubType} berstatus ${tx.status}. Wajib berstatus QC_VEHICLE_PASSED dari rilis PA yang sah.`,
            errors: [],
          });
        }

        if (
          !tx.weighInAt ||
          tx.grossWeight == null ||
          Number(tx.grossWeight) <= 0
        ) {
          throw new BadRequestException({
            success: false,
            message:
              'Gudang menolak memulai proses GSP: Transaksi belum melalui penimbangan masuk (weigh-in) atau berat kotor (gross weight) tidak valid.',
            errors: [],
          });
        }

        if (
          !tx.productCatalog ||
          tx.productCatalog.processType !== 'GSP' ||
          !tx.productCatalog.isActive
        ) {
          throw new BadRequestException({
            success: false,
            message:
              'Gudang menolak memulai proses GSP: Katalog produk tidak terdaftar, tidak aktif, atau bukan scope proses GSP.',
            errors: [],
          });
        }

        // Query current active (non-voided) PA record
        const activePa = await this.prisma.qcProductAnalysis.findFirst({
          where: {
            transactionId,
            isVoided: false,
          },
          orderBy: { testRound: 'desc' },
        });

        if (!activePa) {
          await this.activityLogsService
            .logAction({
              userId: user.id,
              action: 'WAREHOUSE_FLOW_REJECTED',
              module: 'WAREHOUSE',
              referenceId: transactionId,
              description: `Security violation: Attempted warehouse start on GSP transaction with forged/missing PA record.`,
              status: 'FAILED',
            })
            .catch(() => {});
          throw new BadRequestException({
            success: false,
            message:
              'Gudang menolak memulai proses: Bukti analisis laboratorium (PA) aktif tidak ditemukan. Status QC_VEHICLE_PASSED tidak sah tanpa rekaman PA.',
            errors: [],
          });
        }

        if (activePa.productCatalogId !== tx.productCatalogId) {
          throw new BadRequestException({
            success: false,
            message:
              'Gudang menolak memulai proses: Katalog produk pada analisis PA tidak sesuai dengan katalog produk transaksi aktif.',
            errors: [],
          });
        }

        // Validate workflow release evidence:
        // 1. Direct compliant release: status === 'RELEASE' and result === QcResult.PASS
        // 2. Approved GSP concession (P0-01): status === 'ACCEPT_WITH_NOTE' with exhaustive audit trail
        const isDirectRelease =
          activePa.status === 'RELEASE' && activePa.result === QcResult.PASS;

        const isConcessionReasonValid = Boolean(
          activePa.dispositionReason &&
          activePa.dispositionReason.trim().length >= 5,
        );
        const isConcessionActorValid = Boolean(
          activePa.dispositionById &&
          activePa.dispositionById.trim().length > 0,
        );
        const isConcessionTimestampValid = Boolean(activePa.dispositionAt);
        const isLabFactualOos = activePa.result === QcResult.REJECT;

        const isApprovedConcession =
          activePa.status === 'ACCEPT_WITH_NOTE' &&
          activePa.dispositionAction === 'ACCEPT_WITH_NOTE' &&
          isLabFactualOos &&
          isConcessionReasonValid &&
          isConcessionActorValid &&
          isConcessionTimestampValid &&
          !activePa.isVoided;

        if (activePa.status === 'ACCEPT_WITH_NOTE' && isApprovedConcession) {
          // Defense-in-depth: Verify non-waivable critical defects
          const rawParams = activePa.parameters as any;
          const sensory = rawParams?.sensory;
          const hasCriticalDefect = sensory
            ? Boolean(
                (sensory.foreignMatters &&
                  sensory.foreignMatters !== 'Tidak ada kontaminasi') ||
                (sensory.packagingLabel &&
                  sensory.packagingLabel !== 'Kemasan & label tidak rusak'),
              )
            : false;

          if (hasCriticalDefect) {
            await this.activityLogsService
              .logAction({
                userId: user.id,
                action: 'WAREHOUSE_START_BLOCKED_CRITICAL_DEFECT',
                module: 'WAREHOUSE',
                referenceId: transactionId,
                description: `Warehouse start blocked: Forged or invalid concession on critical sensory defects for ${tx.cargoSubType}.`,
                status: 'FAILED',
              })
              .catch(() => {});
            throw new BadRequestException({
              success: false,
              message:
                'Gudang menolak memulai proses: Analisis PA memiliki cacat kritis (kontaminasi benda asing atau kerusakan kemasan/label) yang tidak dapat dimaafkan.',
              errors: ['CRITICAL_DEFECT_NOT_WAIVABLE'],
            });
          }
        }

        if (!isDirectRelease && !isApprovedConcession) {
          throw new BadRequestException({
            success: false,
            message: `Gudang menolak memulai proses: Analisis PA terakhir belum memperoleh keputusan rilis atau disposisi sah (Status PA: ${activePa.status}, Hasil: ${activePa.result || 'NONE'}). Tidak ada izin bongkar.`,
            errors: [],
          });
        }
      }

      // ─── GSP Hard Gates: Surat Jalan & PO Number ───
      const effectiveSj = dto.suratJalanNumber || tx.suratJalanNumber;
      const effectivePo = dto.poNumber || tx.poNumber;

      if (!effectiveSj || !effectiveSj.trim()) {
        throw new BadRequestException({
          success: false,
          message:
            'Nomor Surat Jalan wajib diisi sebelum memulai proses bongkar muat GSP.',
          errors: ['MISSING_SURAT_JALAN'],
        });
      }

      if (!effectivePo || !effectivePo.trim()) {
        throw new BadRequestException({
          success: false,
          message:
            'Nomor PO (Purchase Order) wajib diisi sebelum memulai proses bongkar muat GSP.',
          errors: ['MISSING_PO_NUMBER'],
        });
      }

      // ─── GSP Hard Gates: Pre-Unloading Verification Checklist ───
      if (
        !dto.preUnloadChecklist ||
        !Array.isArray(dto.preUnloadChecklist.items)
      ) {
        await this.activityLogsService
          .logAction({
            userId: user.id,
            action: 'GSP_PREUNLOAD_CHECKLIST_INVALID',
            module: 'WAREHOUSE',
            referenceId: transactionId,
            description:
              'Pre-unload checklist payload is missing or not an array.',
            status: 'FAILED',
          })
          .catch(() => {});
        throw new BadRequestException({
          success: false,
          message:
            'Pemeriksaan pra-bongkar (pre-unload checklist) wajib diisi untuk transaksi GSP.',
          errors: ['MISSING_PREUNLOAD_CHECKLIST'],
        });
      }

      const submittedItems = dto.preUnloadChecklist.items;
      const submittedCodes = submittedItems.map((item) => item.code);
      const uniqueCodes = new Set(submittedCodes);

      const hasUnknownCodes = submittedCodes.some(
        (code) => !GSP_PREUNLOAD_CODES.includes(code),
      );
      const hasDuplicates = uniqueCodes.size !== submittedCodes.length;
      const isMissingCodes =
        submittedCodes.length !== 9 ||
        GSP_PREUNLOAD_CODES.some((c) => !uniqueCodes.has(c));

      if (hasUnknownCodes || hasDuplicates || isMissingCodes) {
        await this.activityLogsService
          .logAction({
            userId: user.id,
            action: 'GSP_PREUNLOAD_CHECKLIST_INVALID',
            module: 'WAREHOUSE',
            referenceId: transactionId,
            description: `Malformed pre-unload checklist: count=${submittedItems.length}, unique=${uniqueCodes.size}, hasUnknown=${hasUnknownCodes}, hasDuplicates=${hasDuplicates}, isMissing=${isMissingCodes}`,
            status: 'FAILED',
          })
          .catch(() => {});
        throw new BadRequestException({
          success: false,
          message:
            'Struktur pemeriksaan pra-bongkar tidak valid (wajib memuat tepat 9 item kanonikal unik).',
          errors: ['INVALID_PREUNLOAD_CHECKLIST_STRUCTURE'],
        });
      }

      const failedItems = submittedItems.filter(
        (item) => item.result === 'NOT_OK',
      );

      if (failedItems.length > 0) {
        const failedItemCodes = failedItems.map((item) => item.code);
        const failedItemNotes: Record<string, string> = {};
        failedItems.forEach((item) => {
          if (item.notes) failedItemNotes[item.code] = item.notes;
        });

        // Strict preliminary input validation (notes >= 5 chars, valid photo data URI / attachment ID format, magic bytes) without persisting files/DB yet
        await this.validateNotOkItemEvidences(
          transactionId,
          submittedItems,
          tx.revision,
          this.prisma,
          { validateOnly: true },
        );

        // 1. Direct concession / rejection decision provided in payload
        if (dto.checklistDisposition) {
          // Unified safety validation: reject non-waivable items on ACCEPT_WITH_NOTE
          this.validateConcessionSafetyRules(
            submittedItems,
            dto.checklistDisposition.action,
            dto.checklistDisposition.reason,
          );

          if (dto.checklistDisposition.action === 'REJECT') {
            // Rejection is deliberately handled by the disposition endpoint after
            // the checklist has entered WAITING_GSP_CHECKLIST_DISPOSITION.
            // This prevents a direct invalid state-machine transition and keeps
            // the checklist revision/audit trail in one legal transition.
            throw new BadRequestException({
              success: false,
              message:
                'Penolakan checklist GSP wajib diawali pengajuan untuk keputusan (submit_checklist_for_decision), lalu diselesaikan melalui disposisi.',
              errors: ['CHECKLIST_DISPOSITION_REQUIRED'],
            });
          }
          // If action is ACCEPT_WITH_NOTE: continue to start warehouse with CONCESSION
        } else if (dto.process === 'submit_checklist_for_decision') {
          // 2. Submit checklist with findings -> enters WAITING_GSP_CHECKLIST_DISPOSITION (no auto-reject)
          const missingDetails = failedItems.some(
            (item) => !item.notes?.trim(),
          );
          if (missingDetails) {
            throw new BadRequestException({
              success: false,
              message:
                'Setiap item pemeriksaan NOT_OK wajib mencantumkan catatan temuan ketidaksesuaian.',
              errors: ['PREUNLOAD_CHECKLIST_MISSING_NOTES'],
              failedItemCodes,
            });
          }

          assertValidStatusTransition(
            tx.status,
            'WAITING_GSP_CHECKLIST_DISPOSITION',
          );

          let photoEvidencesResult: {
            createdFiles: string[];
            cleanupFiles: () => void;
          } | null = null;
          try {
            const updated = await this.prisma.$transaction(async (prismaTx) => {
              const claimed = await prismaTx.transaction.updateMany({
                where: {
                  id: transactionId,
                  status: tx.status,
                  revision: tx.revision,
                },
                data: {
                  status: TransactionStatus.WAITING_GSP_CHECKLIST_DISPOSITION,
                  revision: { increment: 1 },
                  ...(effectiveSj && { suratJalanNumber: effectiveSj }),
                  ...(effectivePo && { poNumber: effectivePo }),
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

              const maxRevision = await prismaTx.warehouseProcess.aggregate({
                where: { transactionId },
                _max: { revision: true },
              });
              const nextRevision = (maxRevision._max.revision ?? 0) + 1;

              photoEvidencesResult = await this.validateNotOkItemEvidences(
                transactionId,
                submittedItems,
                nextRevision,
                prismaTx,
              );

              await prismaTx.warehouseProcess.create({
                data: {
                  transactionId,
                  revision: nextRevision,
                  processType: tx.processType,
                  startAt: new Date(),
                  startById: user.id,
                  remarks:
                    dto.remarks ||
                    'Pemeriksaan pra-bongkar dengan temuan NOT_OK',
                  checklistItems: {
                    version: GSP_PREUNLOAD_VERSION,
                    overallResult: 'PENDING_DISPOSITION',
                    items: submittedItems.map((item) => ({
                      code: item.code,
                      label: GSP_PREUNLOAD_LABEL_MAP[item.code] || item.code,
                      result: item.result,
                      notes: item.notes || null,
                      photoUrl: item.photoUrl || null,
                      photoAttachmentId: item.photoAttachmentId || null,
                    })),
                  } as any,
                },
              });

              await prismaTx.transactionStatusHistory.create({
                data: {
                  transactionId,
                  oldStatus: tx.status,
                  newStatus:
                    TransactionStatus.WAITING_GSP_CHECKLIST_DISPOSITION,
                  changedById: user.id,
                  notes:
                    'Pemeriksaan pra-bongkar tercatat dengan temuan NOT_OK. Menunggu keputusan penerimaan GSP.',
                },
              });

              if (
                typeof this.activityLogsService.logActionStrict === 'function'
              ) {
                await this.activityLogsService.logActionStrict(
                  {
                    userId: user.id,
                    userName: user.name || user.email,
                    role: user.role,
                    action: 'GSP_PREUNLOAD_CHECKLIST_PENDING_DISPOSITION',
                    module: 'WAREHOUSE',
                    referenceId: transactionId,
                    description: `Pemeriksaan pra-bongkar memiliki ${failedItems.length} item NOT_OK. Menunggu keputusan penerimaan.`,
                    status: 'SUCCESS',
                  },
                  prismaTx,
                );
              } else {
                await this.activityLogsService.logAction(
                  {
                    userId: user.id,
                    userName: user.name || user.email,
                    role: user.role,
                    action: 'GSP_PREUNLOAD_CHECKLIST_PENDING_DISPOSITION',
                    module: 'WAREHOUSE',
                    referenceId: transactionId,
                    description: `Pemeriksaan pra-bongkar memiliki ${failedItems.length} item NOT_OK. Menunggu keputusan penerimaan.`,
                    status: 'SUCCESS',
                  },
                  prismaTx,
                  { requireDb: true },
                );
              }

              return prismaTx.transaction.findUnique({
                where: { id: transactionId },
              });
            });

            return updated;
          } catch (err) {
            (photoEvidencesResult as any)?.cleanupFiles();
            throw err;
          }
        } else {
          // 3. Plain start attempt with NOT_OK items (audit logged, blocked)
          const auditPayload = {
            userId: user.id,
            userName: user.name || user.email,
            role: user.role,
            action: 'GSP_PREUNLOAD_CHECKLIST_FAILED',
            module: 'WAREHOUSE',
            referenceId: transactionId,
            description: JSON.stringify({
              checklistVersion: GSP_PREUNLOAD_VERSION,
              submittedItems: submittedItems.map((item) => ({
                code: item.code,
                result: item.result,
              })),
              failedItemCodes,
              failedItemNotes,
              operatorId: user.id,
              timestamp: new Date().toISOString(),
            }),
            status: 'FAILED' as const,
          };

          try {
            if (
              typeof this.activityLogsService.logActionStrict === 'function'
            ) {
              await this.activityLogsService.logActionStrict(auditPayload);
            } else {
              await this.activityLogsService.logAction(
                auditPayload,
                undefined,
                {
                  requireDb: true,
                },
              );
            }
          } catch (auditError: any) {
            this.logger.error(
              `Gagal mencatat ActivityLog audit untuk GSP_PREUNLOAD_CHECKLIST_FAILED: ${auditError?.message || auditError}`,
            );
            throw new BadRequestException({
              success: false,
              message:
                'Gagal mencatat audit log pemeriksaan pra-bongkar ke sistem. Proses bongkar tetap diblokir.',
              errors: ['PREUNLOAD_CHECKLIST_AUDIT_LOG_FAILED'],
              failedItemCodes,
            });
          }

          throw new BadRequestException({
            success: false,
            message: 'Pemeriksaan pra-bongkar belum memenuhi persyaratan.',
            errors: ['PREUNLOAD_CHECKLIST_ITEMS_NOT_OK'],
            failedItemCodes,
          });
        }
      }
    } else {
      // Non-GSP (GBB, GBJ)
      const isQcPassed = tx.status === TransactionStatus.QC_VEHICLE_PASSED;
      if (!isQcPassed) {
        await this.activityLogsService
          .logAction({
            userId: user.id,
            action: 'WAREHOUSE_FLOW_REJECTED',
            module: 'WAREHOUSE',
            referenceId: transactionId,
            description: `Warehouse start rejected: Current status is ${tx.status}. Required: QC_VEHICLE_PASSED.`,
            status: 'SUCCESS',
          })
          .catch(() => {});
        throw new BadRequestException({
          success: false,
          message: `Gudang tidak dapat memulai proses: Transaksi berstatus ${tx.status} belum lulus QC pemeriksaan kendaraan.`,
          errors: [],
        });
      }
    }

    assertValidStatusTransition(tx.status, 'WAREHOUSE_IN_PROGRESS');

    const effectiveSj = dto.suratJalanNumber || tx.suratJalanNumber;
    const effectivePo = dto.poNumber || tx.poNumber;

    let photoEvidencesResult: {
      createdFiles: string[];
      cleanupFiles: () => void;
    } | null = null;
    let updated: any;
    try {
      updated = await this.prisma.$transaction(async (prismaTx) => {
        const maxRev = await prismaTx.warehouseProcess.aggregate({
          where: { transactionId },
          _max: { revision: true },
        });
        const nextRevision = (maxRev._max.revision ?? 0) + 1;

        if (tx.processType === 'GSP' && dto.preUnloadChecklist) {
          photoEvidencesResult = await this.validateNotOkItemEvidences(
            transactionId,
            dto.preUnloadChecklist.items,
            nextRevision,
            prismaTx,
          );
        }

        const canonicalChecklistPayload =
          tx.processType === 'GSP' && dto.preUnloadChecklist
            ? {
                version: GSP_PREUNLOAD_VERSION,
                overallResult:
                  dto.checklistDisposition?.action === 'ACCEPT_WITH_NOTE'
                    ? 'CONCESSION'
                    : 'OK',
                items: dto.preUnloadChecklist.items.map((item) => ({
                  code: item.code,
                  label: GSP_PREUNLOAD_LABEL_MAP[item.code] || item.code,
                  result: item.result,
                  notes: item.notes || null,
                  photoUrl: item.photoUrl || null,
                  photoAttachmentId: item.photoAttachmentId || null,
                })),
                ...(dto.checklistDisposition && {
                  disposition: {
                    action: dto.checklistDisposition.action,
                    reason: dto.checklistDisposition.reason,
                    decidedById: user.id,
                    decidedByName: user.name || user.email,
                    decidedAt: new Date().toISOString(),
                  },
                }),
              }
            : undefined;

        const claimed = await prismaTx.transaction.updateMany({
          where: {
            id: transactionId,
            status: {
              in: [
                'QC_VEHICLE_PASSED',
                'PA_NOT_REQUIRED',
                'WAITING_GSP_CHECKLIST_DISPOSITION',
              ],
            },
            revision: tx.revision,
          },
          data: {
            revision: { increment: 1 },
            status: 'WAREHOUSE_IN_PROGRESS',
            warehouseStartAt: tx.warehouseStartAt || new Date(),
            warehouseStartById: user.id,
            ...(effectiveSj && {
              suratJalanNumber: effectiveSj,
            }),
            ...(effectivePo && { poNumber: effectivePo }),
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
            checklistItems: canonicalChecklistPayload as any,
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
    } catch (startErr) {
      (photoEvidencesResult as any)?.cleanupFiles();
      throw startErr;
    }

    if (!updated) {
      throw new NotFoundException({
        success: false,
        message: 'Transaction not found after starting warehouse process',
        errors: [],
      });
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

  normalizeDeliveryChecklist(rawChecklist: any): any {
    if (!rawChecklist) return null;
    let checklist = rawChecklist;
    if (typeof checklist === 'string') {
      try {
        checklist = JSON.parse(checklist);
      } catch {
        throw new BadRequestException({
          success: false,
          message: 'Format deliveryChecklist tidak valid (gagal parse JSON).',
          errors: ['INVALID_DELIVERY_CHECKLIST_FORMAT'],
        });
      }
    }
    if (typeof checklist !== 'object' || checklist === null) {
      throw new BadRequestException({
        success: false,
        message: 'deliveryChecklist harus berupa objek valid.',
        errors: ['INVALID_DELIVERY_CHECKLIST_FORMAT'],
      });
    }

    // Support both productTypes array and legacy productType string
    let productTypes: string[] = [];
    if (Array.isArray(checklist.productTypes)) {
      productTypes = checklist.productTypes
        .map((p: any) => String(p).trim())
        .filter(Boolean);
    } else if (
      typeof checklist.productType === 'string' &&
      checklist.productType.trim()
    ) {
      productTypes = [checklist.productType.trim()];
    }

    if (productTypes.length === 0) {
      throw new BadRequestException({
        success: false,
        message:
          'Minimal satu jenis produk GBJ wajib dipilih (Product Type 1).',
        errors: ['MISSING_GBJ_PRODUCT_TYPE'],
      });
    }

    if (productTypes.length > 2) {
      throw new BadRequestException({
        success: false,
        message: 'Maksimal dua jenis produk GBJ diperbolehkan per transaksi.',
        errors: ['EXCEEDED_MAX_GBJ_PRODUCT_TYPES'],
      });
    }

    // Check duplicates
    if (new Set(productTypes).size !== productTypes.length) {
      throw new BadRequestException({
        success: false,
        message: 'Jenis produk GBJ tidak boleh duplikat.',
        errors: ['DUPLICATE_GBJ_PRODUCT_TYPE'],
      });
    }

    // Validate against catalog
    for (const pt of productTypes) {
      if (!isValidGbjProductType(pt)) {
        throw new BadRequestException({
          success: false,
          message: `Jenis produk '${pt}' tidak terdaftar dalam katalog produk GBJ valid.`,
          errors: ['INVALID_GBJ_PRODUCT_TYPE'],
        });
      }
    }

    return {
      productTypes,
      productType: productTypes[0], // backward compatibility
      customer: checklist.customer || checklist.customerDestination || null,
      customerDestination:
        checklist.customerDestination || checklist.customer || null,
      suratJalanNumber: checklist.suratJalanNumber || null,
      date: checklist.date || null,
      productCondition: checklist.productCondition ?? null,
      documentAvailability: checklist.documentAvailability ?? null,
      notes: checklist.notes || null,
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

    let decimalReceivedQty: Prisma.Decimal | undefined;
    if (tx.processType === 'GSP') {
      if (!dto.receivedQuantity) {
        throw new BadRequestException({
          success: false,
          message:
            'Jumlah diterima (receivedQuantity) wajib diisi untuk transaksi GSP.',
          errors: ['MISSING_RECEIVED_QUANTITY'],
        });
      }
      decimalReceivedQty = validateReceivedQuantityString(dto.receivedQuantity);

      if (!tx.receiptUnit) {
        throw new BadRequestException({
          success: false,
          message:
            'Satuan penerimaan (receiptUnit) transaksi GSP belum terkonfigurasi.',
          errors: ['MISSING_GSP_RECEIPT_UNIT'],
        });
      }

      if (dto.receivedUnit && dto.receivedUnit !== tx.receiptUnit) {
        throw new BadRequestException({
          success: false,
          message: `Satuan diterima (${dto.receivedUnit}) tidak sesuai dengan satuan penerimaan transaksi (${tx.receiptUnit}).`,
          errors: ['INVALID_RECEIPT_UNIT'],
        });
      }
    } else {
      if (dto.actualWeight == null && dto.actualQuantity == null) {
        throw new BadRequestException({
          success: false,
          message: 'At least one of actualWeight or actualQuantity is required',
          errors: [],
        });
      }
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

    if (tx.status !== 'WAREHOUSE_IN_PROGRESS') {
      await this.activityLogsService
        .logAction({
          userId: user.id,
          action: 'WAREHOUSE_FLOW_REJECTED',
          module: 'WAREHOUSE',
          referenceId: transactionId,
          description: `Warehouse complete rejected: Transaction is not in WAREHOUSE_IN_PROGRESS status (current: ${tx.status})`,
          status: 'SUCCESS',
        })
        .catch(() => {});
      throw new BadRequestException({
        success: false,
        message: `Warehouse process must be started before completion (current status: ${tx.status})`,
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
    if (tx.processType === 'GBB') {
      // GBB goes through incoming material check after warehouse
      nextStatus = 'INCOMING_CHECK_PENDING';
    } else {
      // GSP and GBJ go directly to WAREHOUSE_DONE
      nextStatus = 'WAREHOUSE_DONE';
    }

    assertValidStatusTransition(tx.status, nextStatus);

    let normalizedDeliveryChecklist: any = null;
    if (dto.deliveryChecklist) {
      normalizedDeliveryChecklist = this.normalizeDeliveryChecklist(
        dto.deliveryChecklist,
      );
    }

    const updated = await this.prisma.$transaction(async (prismaTx) => {
      // Serialize deliveryChecklist if present and append to remarks
      let finalRemarks = dto.remarks || '';
      if (normalizedDeliveryChecklist) {
        const prodSummary =
          normalizedDeliveryChecklist.productTypes.join(' & ');
        finalRemarks = finalRemarks
          ? `${finalRemarks} | Products: [${prodSummary}]`
          : `Products: [${prodSummary}]`;
      } else if (dto.deliveryChecklist) {
        const checklistStr =
          typeof dto.deliveryChecklist === 'object'
            ? JSON.stringify(dto.deliveryChecklist)
            : String(dto.deliveryChecklist);
        finalRemarks = finalRemarks
          ? `${finalRemarks} | Checklist: ${checklistStr}`
          : `Checklist: ${checklistStr}`;
      }

      const claimed = await prismaTx.transaction.updateMany({
        where: {
          id: transactionId,
          status: 'WAREHOUSE_IN_PROGRESS',
          revision: tx.revision,
          warehouseEndAt: null,
        },
        data: {
          status: nextStatus,
          warehouseStartAt: tx.warehouseStartAt || new Date(),
          warehouseStartById: tx.warehouseStartById || user.id,
          warehouseEndAt: new Date(),
          warehouseEndById: user.id,
          revision: { increment: 1 },
          ...(tx.processType === 'GSP'
            ? {
                receivedQuantity: decimalReceivedQty,
                receiptUnit: tx.receiptUnit,
              }
            : {
                actualWeight: dto.actualWeight,
                actualQuantity: dto.actualQuantity,
                warehouseUnit: dto.unit,
              }),
          ...(dto.suratJalanNumber && {
            suratJalanNumber: dto.suratJalanNumber,
          }),
          ...(normalizedDeliveryChecklist && {
            deliveryChecklist: normalizedDeliveryChecklist,
          }),
          remarks: tx.remarks
            ? finalRemarks
              ? `${tx.remarks} | ${finalRemarks}`
              : tx.remarks
            : finalRemarks || null,
        },
      });

      if (claimed && claimed.count !== undefined && claimed.count !== 1) {
        throw new ConflictException({
          success: false,
          message:
            'Warehouse process already completed or changed concurrently by another user',
          errors: [],
        });
      }

      const activeProcess = await prismaTx.warehouseProcess.findFirst({
        where: { transactionId, isCurrent: true, endAt: null },
      });

      if (activeProcess) {
        await prismaTx.warehouseProcess.update({
          where: { id: activeProcess.id },
          data: {
            endAt: new Date(),
            endById: user.id,
            ...(tx.processType === 'GSP'
              ? {
                  receivedQuantity: decimalReceivedQty,
                  receivedUnit: tx.receiptUnit,
                }
              : {
                  actualWeight: dto.actualWeight,
                  actualQuantity: dto.actualQuantity,
                  unit: dto.unit,
                }),
            palletCount: dto.palletCount,
            bagCount: dto.bagCount,
            rollCount: dto.rollCount,
            condition: dto.condition,
            checklistItems:
              normalizedDeliveryChecklist ||
              dto.deliveryChecklist ||
              activeProcess.checklistItems ||
              undefined,
            remarks: finalRemarks || null,
          },
        });
      } else {
        this.logger.warn(
          `[Warehouse Invariant Warning] Active warehouse process missing for transaction ${transactionId} in WAREHOUSE_IN_PROGRESS state. Creating fallback process revision.`,
        );
        const maxRev = await prismaTx.warehouseProcess.aggregate({
          where: { transactionId },
          _max: { revision: true },
        });
        const nextRevision = (maxRev._max.revision ?? 0) + 1;

        await prismaTx.warehouseProcess.create({
          data: {
            transactionId,
            revision: nextRevision,
            processType: tx.processType,
            startAt: tx.warehouseStartAt || new Date(),
            startById: tx.warehouseStartById || user.id,
            endAt: new Date(),
            endById: user.id,
            ...(tx.processType === 'GSP'
              ? {
                  receivedQuantity: decimalReceivedQty,
                  receivedUnit: tx.receiptUnit,
                }
              : {
                  actualWeight: dto.actualWeight,
                  actualQuantity: dto.actualQuantity,
                  unit: dto.unit,
                }),
            palletCount: dto.palletCount,
            bagCount: dto.bagCount,
            rollCount: dto.rollCount,
            condition: dto.condition,
            checklistItems:
              normalizedDeliveryChecklist || dto.deliveryChecklist || undefined,
            remarks: finalRemarks || null,
          },
        });
      }

      await prismaTx.transactionStatusHistory.create({
        data: {
          transactionId,
          oldStatus: tx.status,
          newStatus: nextStatus,
          changedById: user.id,
          notes: finalRemarks || 'Warehouse process completed',
        },
      });

      return prismaTx.transaction.findUnique({
        where: { id: transactionId },
        include: {
          warehouseStartBy: { select: { id: true, name: true, role: true } },
          warehouseEndBy: { select: { id: true, name: true, role: true } },
          productCatalog: true,
          warehouseProcesses: {
            where: { isCurrent: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });
    });

    if (!updated) {
      throw new NotFoundException({
        success: false,
        message: 'Transaction not found after completing warehouse process',
        errors: [],
      });
    }

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
        receivedQuantity: formatGspReceivedQuantity(
          updated.receivedQuantity ??
            updated.warehouseProcesses?.[0]?.receivedQuantity,
        ),
        receiptUnit: updated.receiptUnit || null,
        receivedUnit:
          updated.warehouseProcesses?.[0]?.receivedUnit ||
          updated.receiptUnit ||
          null,
        checklistItems: updated.warehouseProcesses?.[0]?.checklistItems || null,
        suratJalanNumber: updated.suratJalanNumber || null,
        poNumber: updated.poNumber || null,
        materialIdentity: updated.productCatalog
          ? {
              id: updated.productCatalog.id,
              code: updated.productCatalog.code,
              name: updated.productCatalog.name,
            }
          : null,
        productCatalog: updated.productCatalog || null,
        warehouseStartAt: updated.warehouseStartAt,
        warehouseStartBy: updated.warehouseStartBy
          ? {
              id: updated.warehouseStartBy.id,
              name: updated.warehouseStartBy.name,
              role: updated.warehouseStartBy.role,
            }
          : null,
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

    if (!['GBB', 'GSP'].includes(tx.processType)) {
      throw new BadRequestException(
        'Incoming check only applies to GBB/GSP process types',
      );
    }

    if (['GBB', 'GSP'].includes(tx.processType) && user.role === 'WAREHOUSE') {
      this.logger.warn(
        `SoD violation: Warehouse role attempted incoming check on ${tx.processType} transaction ${transactionId}`,
      );
      await this.activityLogsService
        .logAction({
          userId: user.id,
          action: 'SOD_VIOLATION_BLOCKED',
          module: 'WAREHOUSE',
          referenceId: transactionId,
          description: `Blocked Warehouse role from executing ${tx.processType} incoming check`,
          status: 'FAILED',
        })
        .catch(() => {});
      throw new ForbiddenException({
        success: false,
        message:
          'Segregation of Duties (SoD) violation: Akses ditolak! Proses pemeriksaan incoming GBB atau GSP wajib dieksekusi oleh tim QC atau Admin.',
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

    assertValidStatusTransition(tx.status, nextStatus);

    const updated = await this.prisma.$transaction(async (prismaTx) => {
      const maxRev = await prismaTx.incomingMaterialCheck.aggregate({
        where: { transactionId },
        _max: { revision: true },
      });
      const nextRevision = (maxRev._max.revision ?? 0) + 1;

      const claimed = await prismaTx.transaction.updateMany({
        where: {
          id: transactionId,
          status: tx.status,
          revision: tx.revision,
        },
        data: {
          revision: { increment: 1 },
          status: nextStatus,
          qcEndAt: new Date(),
          remarks: dto.remarks
            ? `${tx.remarks ? tx.remarks + ' | ' : ''}Incoming Check: ${dto.remarks}`
            : tx.remarks,
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

      await prismaTx.transactionStatusHistory.create({
        data: {
          transactionId,
          oldStatus: tx.status,
          newStatus: nextStatus,
          changedById: user.id,
          notes: notesContent,
        },
      });

      return prismaTx.transaction.findUnique({ where: { id: transactionId } });
    });

    if (!updated) {
      throw new NotFoundException({
        success: false,
        message: 'Updated transaction not found',
        errors: [],
      });
    }

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
        productCatalog: true,
        warehouseProcesses: {
          where: { isCurrent: true },
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
        receivedQuantity: formatGspReceivedQuantity(
          tx.receivedQuantity ?? process?.receivedQuantity,
        ),
        receiptUnit: tx.receiptUnit || null,
        receivedUnit: process?.receivedUnit || tx.receiptUnit || null,
        checklistItems: process?.checklistItems || null,
        suratJalanNumber: tx.suratJalanNumber || null,
        poNumber: tx.poNumber || null,
        materialIdentity: tx.productCatalog
          ? {
              id: tx.productCatalog.id,
              code: tx.productCatalog.code,
              name: tx.productCatalog.name,
            }
          : null,
        productCatalog: tx.productCatalog || null,
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
          productCatalog: true,
          warehouseProcesses: {
            where: { isCurrent: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
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

    const historyData = data.map((t) => {
      const process = t.warehouseProcesses?.[0];
      return {
        ...t,
        receivedQuantity: formatGspReceivedQuantity(
          t.receivedQuantity ?? process?.receivedQuantity,
        ),
        receiptUnit: t.receiptUnit || null,
        receivedUnit: process?.receivedUnit || t.receiptUnit || null,
        checklistItems: process?.checklistItems || null,
        suratJalanNumber: t.suratJalanNumber || null,
        poNumber: t.poNumber || null,
        materialIdentity: t.productCatalog
          ? {
              id: t.productCatalog.id,
              code: t.productCatalog.code,
              name: t.productCatalog.name,
            }
          : null,
      };
    });

    return {
      success: true,
      message: 'Warehouse history retrieved successfully',
      data: historyData,
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

  /**
   * Validate that all NOT_OK items have notes (>= 5 chars) and verified photo evidence.
   * Fail-closed persistence: enforces storage write, attachment creation, de-duplication,
   * size, magic bytes verification, and compensation cleanup on transaction failure.
   */
  private async validateNotOkItemEvidences(
    transactionId: string,
    items: Array<{
      code: string;
      result: string;
      notes?: string | null;
      photoUrl?: string | null;
      photoAttachmentId?: string | null;
    }>,
    checklistRevision = 1,
    client: any = this.prisma,
    options?: { validateOnly?: boolean },
  ): Promise<{ createdFiles: string[]; cleanupFiles: () => void }> {
    const failedItems = items.filter((item) => item.result === 'NOT_OK');
    const createdFiles: string[] = [];

    const cleanupFiles = () => {
      for (const filePath of createdFiles) {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch {
          // ignore cleanup errors during rollback
        }
      }
    };

    try {
      for (const item of failedItems) {
        if (!item.notes || item.notes.trim().length < 5) {
          throw new BadRequestException({
            success: false,
            message: `Setiap item pemeriksaan NOT_OK (${item.code}) wajib mencantumkan catatan temuan ketidaksesuaian (minimal 5 karakter).`,
            errors: ['PREUNLOAD_CHECKLIST_MISSING_NOTES'],
          });
        }

        const photoRef = item.photoAttachmentId || item.photoUrl;
        if (
          !photoRef ||
          typeof photoRef !== 'string' ||
          photoRef.trim().length === 0
        ) {
          throw new BadRequestException({
            success: false,
            message: `Setiap item pemeriksaan NOT_OK (${item.code}) wajib menyertakan bukti foto lampiran yang valid dan terverifikasi pada sistem.`,
            errors: ['PREUNLOAD_CHECKLIST_MISSING_PHOTO'],
          });
        }

        // If photoRef is data URL, validate format, decode base64, validate magic bytes and size, and persist as attachment
        if (photoRef.startsWith('data:image/')) {
          const matches = photoRef.match(
            /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/,
          );
          if (!matches || !matches[2]) {
            throw new BadRequestException({
              success: false,
              message: `Format data URI bukti foto item ${item.code} tidak valid atau rusak.`,
              errors: ['INVALID_PHOTO_DATA_URI_FORMAT'],
            });
          }

          let buffer: Buffer;
          try {
            buffer = Buffer.from(matches[2], 'base64');
          } catch {
            throw new BadRequestException({
              success: false,
              message: `Decoding data base64 foto item ${item.code} gagal.`,
              errors: ['INVALID_PHOTO_BASE64_DECODING'],
            });
          }

          // Validate buffer size: min 64 bytes (prevent mock/fake strings), max 10MB
          if (buffer.length < 64) {
            throw new BadRequestException({
              success: false,
              message: `Ukuran berkas foto bukti item ${item.code} terlalu kecil (${buffer.length} bytes, minimum 64 bytes). Bukti foto tidak valid.`,
              errors: ['INVALID_PHOTO_FILE_SIZE_TOO_SMALL'],
            });
          }
          if (buffer.length > 10 * 1024 * 1024) {
            throw new BadRequestException({
              success: false,
              message: `Ukuran berkas foto bukti item ${item.code} melebihi batas maksimum 10MB.`,
              errors: ['PHOTO_FILE_SIZE_EXCEEDED'],
            });
          }

          // Validate magic bytes
          const isPng =
            buffer.length >= 8 &&
            buffer[0] === 0x89 &&
            buffer[1] === 0x50 &&
            buffer[2] === 0x4e &&
            buffer[3] === 0x47 &&
            buffer[4] === 0x0d &&
            buffer[5] === 0x0a &&
            buffer[6] === 0x1a &&
            buffer[7] === 0x0a;
          const isJpeg =
            buffer.length >= 3 &&
            buffer[0] === 0xff &&
            buffer[1] === 0xd8 &&
            buffer[2] === 0xff;
          const isWebp =
            buffer.length >= 12 &&
            buffer.toString('ascii', 0, 4) === 'RIFF' &&
            buffer.toString('ascii', 8, 12) === 'WEBP';

          if (!isPng && !isJpeg && !isWebp) {
            throw new BadRequestException({
              success: false,
              message: `Format biner foto item ${item.code} tidak sesuai dengan header gambar yang valid (PNG, JPEG, WebP).`,
              errors: ['INVALID_PHOTO_MAGIC_BYTES'],
            });
          }

          // If validateOnly is requested (e.g. preliminary check before entering rejection gate), do not persist files/DB
          if (options?.validateOnly) {
            continue;
          }

          const sha256 = crypto
            .createHash('sha256')
            .update(buffer)
            .digest('hex');

          const uploadBase = process.env.UPLOAD_DIR || './uploads';
          const ext = isPng ? 'png' : isJpeg ? 'jpg' : 'webp';

          // De-duplication check: if identical evidence already exists on this transaction,
          // rigorously verify:
          // 1) File physically exists on disk
          // 2) SHA-256 hash matches buffer
          // 3) Checklist item code matches
          // 4) Revision matches
          const attachmentClient =
            client?.attachment ?? (this.prisma as any)?.attachment;
          let reusableAttachment: any = null;
          if (attachmentClient?.findFirst) {
            const existingAtt = await attachmentClient.findFirst({
              where: {
                transactionId,
                module: 'WAREHOUSE',
                attachmentType: 'PHOTO',
                sha256,
                isCurrent: true,
              },
            });

            if (existingAtt && existingAtt.filePath) {
              const existingFullPath = path.resolve(
                uploadBase,
                existingAtt.filePath,
              );
              const fileExistsOnDisk = fs.existsSync(existingFullPath);
              const isSameItemCode =
                existingAtt.originalName &&
                existingAtt.originalName.startsWith(`${item.code}_`);
              const isSameRevision = existingAtt.revision === checklistRevision;

              if (fileExistsOnDisk && isSameItemCode && isSameRevision) {
                try {
                  const existingBuffer = fs.readFileSync(existingFullPath);
                  const existingSha = crypto
                    .createHash('sha256')
                    .update(existingBuffer)
                    .digest('hex');
                  if (existingSha === sha256) {
                    reusableAttachment = existingAtt;
                  }
                } catch {
                  // File read error -> do not reuse, fall through to write fresh file
                }
              }
            }
          }

          if (reusableAttachment) {
            item.photoAttachmentId = reusableAttachment.id;
            item.photoUrl = `/api/attachments/${reusableAttachment.id}/download`;
            continue;
          }

          // Persist to filesystem with fail-closed guarantee
          const evidenceDir = path.resolve(uploadBase, 'checklist-evidence');
          const fileName = `${transactionId}_${item.code}_${Date.now()}_${Math.floor(
            Math.random() * 1000,
          )}.${ext}`;
          const fullPath = path.join(evidenceDir, fileName);

          try {
            if (!fs.existsSync(evidenceDir)) {
              fs.mkdirSync(evidenceDir, { recursive: true });
            }
            fs.writeFileSync(fullPath, buffer);
            createdFiles.push(fullPath);
          } catch (storageErr: any) {
            throw new InternalServerErrorException({
              success: false,
              message: `Gagal menyimpan berkas bukti foto ke server (${item.code}): ${storageErr?.message}`,
              errors: ['PHOTO_STORAGE_WRITE_FAILED'],
            });
          }

          // Persist Attachment record to DB with fail-closed guarantee (using client / prismaTx)
          if (attachmentClient?.create) {
            try {
              const att = await attachmentClient.create({
                data: {
                  transactionId,
                  module: 'WAREHOUSE',
                  attachmentType: 'PHOTO',
                  originalName: `${item.code}_evidence.${ext}`,
                  fileName,
                  filePath: path.relative(uploadBase, fullPath),
                  mimeType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
                  size: buffer.length,
                  description: `Bukti foto temuan pra-bongkar GSP ${item.code} (Rev ${checklistRevision})`,
                  revision: checklistRevision,
                  isCurrent: true,
                  sha256,
                },
              });
              item.photoAttachmentId = att.id;
              item.photoUrl = `/api/attachments/${att.id}/download`;
            } catch (dbErr: any) {
              cleanupFiles();
              throw new InternalServerErrorException({
                success: false,
                message: `Gagal mencatat data lampiran bukti foto (${item.code}) ke database: ${dbErr?.message}`,
                errors: ['PHOTO_ATTACHMENT_RECORD_FAILED'],
              });
            }
          } else {
            cleanupFiles();
            throw new InternalServerErrorException({
              success: false,
              message:
                'Layanan database Attachment tidak tersedia untuk menyimpan bukti foto.',
              errors: ['ATTACHMENT_SERVICE_UNAVAILABLE'],
            });
          }

          continue;
        }

        // Resolve attachment ID from item or photoRef
        let attachmentId = item.photoAttachmentId;
        if (!attachmentId) {
          const apiMatch = photoRef.match(
            /\/api\/attachments\/([a-zA-Z0-9_-]+)/i,
          );
          if (apiMatch) {
            attachmentId = apiMatch[1];
          } else {
            const uuidMatch = photoRef.match(
              /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
            );
            const attPrefixMatch = photoRef.match(/^att-[a-z0-9_-]+$/i);
            attachmentId = uuidMatch
              ? uuidMatch[0]
              : attPrefixMatch
                ? attPrefixMatch[0]
                : null;
          }
        }

        const existingAttachmentClient =
          client?.attachment ?? (this.prisma as any)?.attachment;

        if (attachmentId && existingAttachmentClient?.findFirst) {
          const att = await existingAttachmentClient.findFirst({
            where: {
              id: attachmentId,
              transactionId,
              isCurrent: true,
            },
          });

          if (!att) {
            throw new BadRequestException({
              success: false,
              message: `Bukti foto lampiran untuk item ${item.code} tidak ditemukan atau tidak terikat pada transaksi ${transactionId}.`,
              errors: ['INVALID_PHOTO_ATTACHMENT'],
            });
          }

          // Verify item code alignment
          if (
            att.originalName &&
            !att.originalName.startsWith(`${item.code}_`)
          ) {
            throw new BadRequestException({
              success: false,
              message: `Bukti foto lampiran ${att.id} terikat pada item lain (${att.originalName}), bukan item ${item.code}.`,
              errors: ['ATTACHMENT_ITEM_CODE_MISMATCH'],
            });
          }

          // Verify revision compatibility (must match current checklist revision)
          if (
            att.revision !== undefined &&
            att.revision !== null &&
            att.revision !== checklistRevision
          ) {
            throw new BadRequestException({
              success: false,
              message: `Bukti foto lampiran ${att.id} berasal dari revisi lama (Rev ${att.revision}) dan tidak sah untuk revisi saat ini (Rev ${checklistRevision}).`,
              errors: ['STALE_CHECKLIST_ATTACHMENT_REVISION'],
            });
          }

          if (att.filePath) {
            const uploadBase = process.env.UPLOAD_DIR || './uploads';
            const fullPath = path.resolve(uploadBase, att.filePath);
            if (!fs.existsSync(fullPath)) {
              throw new BadRequestException({
                success: false,
                message: `Berkas fisik foto lampiran untuk item ${item.code} tidak ditemukan pada penyimpanan server.`,
                errors: ['MISSING_PHYSICAL_PHOTO_FILE'],
              });
            }
          }

          item.photoAttachmentId = att.id;
          item.photoUrl = `/api/attachments/${att.id}/download`;
        } else if (!attachmentId) {
          throw new BadRequestException({
            success: false,
            message: `Format bukti foto lampiran untuk item ${item.code} tidak valid. Wajib menyertakan ID lampiran terverifikasi.`,
            errors: ['INVALID_PHOTO_ATTACHMENT_FORMAT'],
          });
        }
      }

      return { createdFiles, cleanupFiles };
    } catch (err) {
      cleanupFiles();
      throw err;
    }
  }

  /**
   * Unified validator for checklist concession safety rules.
   * Prohibits concession (ACCEPT_WITH_NOTE) on any critical safety defect.
   */
  private validateConcessionSafetyRules(
    items: Array<{
      code: string;
      result?: string;
      ok?: boolean;
      label?: string;
    }>,
    action: 'ACCEPT_WITH_NOTE' | 'REJECT',
    reason: string,
  ): void {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException({
        success: false,
        message:
          'Alasan keputusan disposisi checklist wajib diisi (minimal 5 karakter).',
        errors: ['INVALID_DISPOSITION_REASON'],
      });
    }

    if (action === 'ACCEPT_WITH_NOTE') {
      const failedItems = items.filter(
        (i) => i.result === 'NOT_OK' || i.ok === false,
      );
      const criticalViolations = failedItems.filter((i) =>
        NON_CONCESSIBLE_CHECKLIST_CODES.includes(i.code),
      );

      if (criticalViolations.length > 0) {
        const labels = criticalViolations
          .map((v) => v.label || GSP_PREUNLOAD_LABEL_MAP[v.code] || v.code)
          .join(', ');
        throw new BadRequestException({
          success: false,
          message: `Disposisi konsesi ditolak: Temuan keselamatan kritis (${labels}) dilarang dikonsesi menurut kebijakan K3. Muatan harus DITOLAK (REJECT).`,
          errors: ['CRITICAL_SAFETY_DEFECT_NOT_CONCESSIBLE'],
        });
      }
    }
  }

  async submitChecklistDisposition(
    transactionId: string,
    dto: SubmitChecklistDispositionDto,
    user: JwtPayloadUser,
  ) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!tx) {
      throw new NotFoundException({
        success: false,
        message: 'Transaksi tidak ditemukan.',
        errors: [],
      });
    }

    if (tx.processType !== ProcessType.GSP) {
      throw new BadRequestException({
        success: false,
        message:
          'Disposisi checklist pra-bongkar hanya berlaku untuk transaksi muatan GSP.',
        errors: ['INVALID_PROCESS_TYPE'],
      });
    }

    // Role & Warehouse Scope Authorization check
    const isAdmin = user.role === 'ADMIN';
    const isWarehouse = user.role === 'WAREHOUSE';

    if (!isAdmin && !isWarehouse) {
      throw new ForbiddenException({
        success: false,
        message:
          'Pengguna tidak memiliki wewenang untuk memberikan disposisi checklist GSP.',
        errors: ['FORBIDDEN_SCOPE'],
      });
    }

    if (isWarehouse) {
      const allowedAccess = await this.getWarehouseAccess(user);
      if (!allowedAccess.includes(ProcessType.GSP)) {
        throw new ForbiddenException({
          success: false,
          message: 'Akses gudang pengguna tidak mencakup proses GSP.',
          errors: ['FORBIDDEN_SCOPE'],
        });
      }
    }

    // Strictly WAITING_GSP_CHECKLIST_DISPOSITION only
    if (tx.status !== TransactionStatus.WAITING_GSP_CHECKLIST_DISPOSITION) {
      throw new BadRequestException({
        success: false,
        message: `Disposisi checklist ditolak: Status transaksi adalah ${tx.status}, bukan WAITING_GSP_CHECKLIST_DISPOSITION.`,
        errors: ['INVALID_TRANSACTION_STATUS'],
      });
    }

    // Optimistic Concurrency Check (Revision) - Mandatory
    if (dto.revision === undefined || dto.revision === null) {
      throw new BadRequestException({
        success: false,
        message: 'Revisi transaksi wajib disertakan untuk kontrol konkurensi.',
        errors: ['MISSING_TRANSACTION_REVISION'],
      });
    }

    if (tx.revision !== dto.revision) {
      throw new ConflictException({
        success: false,
        message:
          'Transaksi telah diperbarui oleh pengguna lain (versi revisi tidak cocok). Silakan refresh halaman.',
        errors: ['OPTIMISTIC_LOCK_CONFLICT'],
      });
    }

    // Active Preunload Checklist retrieval & validation (strictly isCurrent: true)
    const latestProc = await this.prisma.warehouseProcess.findFirst({
      where: {
        transactionId,
        isCurrent: true,
      },
      orderBy: { revision: 'desc' },
    });

    if (!latestProc || !latestProc.checklistItems) {
      throw new BadRequestException({
        success: false,
        message:
          'Disposisi checklist ditolak: Bukti pemeriksaan pra-bongkar aktif tidak ditemukan pada sistem.',
        errors: ['MISSING_ACTIVE_CHECKLIST'],
      });
    }

    const rawChecklist: any = latestProc.checklistItems;
    const items = Array.isArray(rawChecklist?.items)
      ? JSON.parse(JSON.stringify(rawChecklist.items))
      : [];
    if (items.length === 0) {
      throw new BadRequestException({
        success: false,
        message:
          'Disposisi checklist ditolak: Daftar butir checklist pra-bongkar kosong.',
        errors: ['EMPTY_CHECKLIST_ITEMS'],
      });
    }

    // Canonical 9 Items validation for disposition
    const submittedCodes = items.map((i: any) => i.code);
    const uniqueCodes = new Set(submittedCodes);
    const hasUnknownCodes = submittedCodes.some(
      (code: string) => !GSP_PREUNLOAD_CODES.includes(code),
    );
    const hasDuplicates = uniqueCodes.size !== submittedCodes.length;
    const isMissingCodes =
      submittedCodes.length !== 9 ||
      GSP_PREUNLOAD_CODES.some((c) => !uniqueCodes.has(c));

    if (hasUnknownCodes || hasDuplicates || isMissingCodes) {
      throw new BadRequestException({
        success: false,
        message:
          'Disposisi checklist ditolak: Struktur checklist pra-bongkar aktif tidak valid (wajib tepat 9 item kanonikal).',
        errors: ['INVALID_PREUNLOAD_CHECKLIST_STRUCTURE'],
      });
    }

    const notOkItems = items.filter(
      (i: any) => i.result === 'NOT_OK' || i.ok === false,
    );
    if (notOkItems.length === 0) {
      throw new BadRequestException({
        success: false,
        message:
          'Disposisi checklist ditolak: Tidak ditemukan temuan NOT_OK pada checklist aktif.',
        errors: ['NO_NOT_OK_FINDINGS'],
      });
    }

    // Single unified safety check for concession
    this.validateConcessionSafetyRules(items, dto.action, dto.reason);

    const nextStatus =
      dto.action === 'ACCEPT_WITH_NOTE'
        ? TransactionStatus.WAREHOUSE_IN_PROGRESS
        : TransactionStatus.QC_VEHICLE_REJECTED;

    assertValidStatusTransition(tx.status, nextStatus);

    // Strict preliminary input validation (notes >= 5 chars, valid photo data URI / attachment ID format, magic bytes) without persisting files/DB yet
    await this.validateNotOkItemEvidences(
      transactionId,
      items,
      latestProc.revision,
      this.prisma,
      { validateOnly: true },
    );

    let photoEvidencesResult: {
      createdFiles: string[];
      cleanupFiles: () => void;
    } | null = null;
    let updated: any;
    try {
      updated = await this.prisma.$transaction(async (prismaTx) => {
        // Validate and persist photo evidences inside the atomic transaction client (prismaTx)
        photoEvidencesResult = await this.validateNotOkItemEvidences(
          transactionId,
          items,
          latestProc.revision,
          prismaTx,
        );

        // Atomic Conditional Update (CAS)
        const updateResult = await prismaTx.transaction.updateMany({
          where: {
            id: transactionId,
            status: TransactionStatus.WAITING_GSP_CHECKLIST_DISPOSITION,
            revision: tx.revision,
          },
          data: {
            status: nextStatus,
            revision: { increment: 1 },
            ...(dto.action === 'ACCEPT_WITH_NOTE' && {
              warehouseStartAt: tx.warehouseStartAt || new Date(),
              warehouseStartById: user.id,
            }),
          },
        });

        if (updateResult.count === 0) {
          throw new ConflictException({
            success: false,
            message:
              'Gagal memperbarui status transaksi: Transaksi telah diubah bersamaan oleh proses lain.',
            errors: ['CONCURRENT_MODIFICATION_DETECTED'],
          });
        }

        const updatedTx = await prismaTx.transaction.findUnique({
          where: { id: transactionId },
        });

        const updatedChecklist = {
          ...rawChecklist,
          overallResult:
            dto.action === 'ACCEPT_WITH_NOTE' ? 'CONCESSION' : 'REJECTED',
          items: items.map((i: any) => ({
            code: i.code,
            label: GSP_PREUNLOAD_LABEL_MAP[i.code] || i.code,
            result: i.result,
            notes: i.notes || null,
            photoUrl: i.photoUrl || null,
            photoAttachmentId: i.photoAttachmentId || null,
          })),
          disposition: {
            action: dto.action,
            reason: dto.reason,
            remarks: dto.remarks || null,
            decidedById: user.id,
            decidedByName: user.name || user.email,
            decidedAt: new Date().toISOString(),
          },
        };

        await prismaTx.warehouseProcess.update({
          where: { id: latestProc.id },
          data: {
            checklistItems: updatedChecklist,
          },
        });

        await prismaTx.transactionStatusHistory.create({
          data: {
            transactionId,
            oldStatus: tx.status,
            newStatus: nextStatus,
            changedById: user.id,
            notes: `Disposisi Pemeriksaan Pra-Bongkar GSP (${dto.action}): ${dto.reason}`,
          },
        });

        if (typeof this.activityLogsService.logActionStrict === 'function') {
          await this.activityLogsService.logActionStrict(
            {
              userId: user.id,
              userName: user.name || user.email,
              role: user.role,
              action: `GSP_CHECKLIST_DISPOSITION_${dto.action}`,
              module: 'WAREHOUSE',
              referenceId: transactionId,
              description: `Disposisi checklist GSP: ${dto.action}. Alasan: ${dto.reason}.`,
              status: 'SUCCESS',
            },
            prismaTx,
          );
        } else {
          await this.activityLogsService.logAction(
            {
              userId: user.id,
              userName: user.name || user.email,
              role: user.role,
              action: `GSP_CHECKLIST_DISPOSITION_${dto.action}`,
              module: 'WAREHOUSE',
              referenceId: transactionId,
              description: `Disposisi checklist GSP: ${dto.action}. Alasan: ${dto.reason}.`,
              status: 'SUCCESS',
            },
            prismaTx,
            { requireDb: true },
          );
        }

        return updatedTx;
      });
    } catch (txErr) {
      (photoEvidencesResult as any)?.cleanupFiles();
      throw txErr;
    }

    return {
      success: true,
      message: `Disposisi pra-bongkar GSP berhasil dicatat (${dto.action}).`,
      data: updated,
    };
  }
}
