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
} from './constants/gsp-preunload-checklist';

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
        // Canonical active PA release evidence: status === 'RELEASE' and result === QcResult.PASS
        const isDirectRelease =
          activePa.status === 'RELEASE' && activePa.result === QcResult.PASS;

        if (!isDirectRelease) {
          throw new BadRequestException({
            success: false,
            message: `Gudang menolak memulai proses: Analisis PA terakhir belum memperoleh keputusan rilis yang sah (Status PA: ${activePa.status}, Hasil: ${activePa.result || 'NONE'}). Tidak ada izin bongkar.`,
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

        try {
          await this.activityLogsService.logAction({
            userId: user.id,
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
            status: 'FAILED',
          });
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

    const canonicalChecklistPayload =
      tx.processType === 'GSP' && dto.preUnloadChecklist
        ? {
            version: GSP_PREUNLOAD_VERSION,
            overallResult: 'OK',
            items: dto.preUnloadChecklist.items.map((item) => ({
              code: item.code,
              label: GSP_PREUNLOAD_LABEL_MAP[item.code] || item.code,
              result: 'OK',
              notes: item.notes || null,
            })),
          }
        : undefined;

    const updated = await this.prisma.$transaction(async (prismaTx) => {
      const maxRev = await prismaTx.warehouseProcess.aggregate({
        where: { transactionId },
        _max: { revision: true },
      });
      const nextRevision = (maxRev._max.revision ?? 0) + 1;

      const claimed = await prismaTx.transaction.updateMany({
        where: {
          id: transactionId,
          status: { in: ['QC_VEHICLE_PASSED', 'PA_NOT_REQUIRED'] },
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
            ? `${tx.remarks ? tx.remarks + ' | ' : ''}GSP Check: ${dto.remarks}`
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
}
