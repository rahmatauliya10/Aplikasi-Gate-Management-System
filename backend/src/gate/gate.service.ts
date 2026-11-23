import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { CreateGateCheckInDto } from './dto/create-gate-check-in.dto';
import { GateQueryDto } from './dto/gate-query.dto';
import {
  TransactionStatus,
  Prisma,
  GspAnalysisProfile,
  WarehouseUnit,
} from '@prisma/client';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { assertValidGspProfileInvariant } from '../qc/constants/gsp-analysis-profile';

import { GATE_DETAIL_CURRENT_RELATIONS_INCLUDE } from '../prisma/prisma-include.helpers';
import { assertValidStatusTransition } from '../common/state-machine/workflow-state-machine';

import {
  normalizePlateNumber,
  getRawPlateNumber,
} from '../common/utils/normalize-plate.util';
import { getPlantDay } from '../common/utils/plant-day.util';

@Injectable()
export class GateService {
  private readonly logger = new Logger(GateService.name);

  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
  ) {}

  async generateTransactionNumber(
    txClient: any = this.prisma,
    now: Date = new Date(),
  ): Promise<string> {
    const { dateKey, start, end } = getPlantDay(now);
    const prefix = `GMS-${dateKey}-`;

    const count = await txClient.transaction.count({
      where: {
        createdAt: {
          gte: start,
          lt: end,
        },
      },
    });

    const sequence = count + 1;
    const sequenceStr = sequence.toString().padStart(4, '0');
    return `${prefix}${sequenceStr}`;
  }

  async checkIn(dto: CreateGateCheckInDto, user: JwtPayloadUser) {
    const normalizedPlate = normalizePlateNumber(dto.plateNumber);
    const rawPlate = getRawPlateNumber(dto.plateNumber);

    this.logger.log(
      `Gate check-in attempt for plate: ${normalizedPlate} (${rawPlate})`,
    );

    let transaction: any;
    let retries = 3;
    while (retries > 0) {
      try {
        transaction = await this.prisma.$transaction(async (tx) => {
          // Database-level concurrency lock on unspaced raw plate number hash
          try {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${rawPlate}))`;
          } catch (e: any) {
            // Fail closed in production; fallback only for unit tests
            if (process.env.NODE_ENV !== 'test') {
              this.logger.error(
                `Advisory lock failed for plate ${rawPlate}: ${e.message}. Aborting fail-closed.`,
                e.stack,
              );
              throw new InternalServerErrorException(
                'Penguncian plate number gagal; pendaftaran dibatalkan secara fail-closed.',
              );
            }
          }

          // Atomic daily arrival sequence counter for plant day (WIB) - Strictly Fail-Closed
          const plantDay = getPlantDay();

          // 2. Transaction-scoped daily advisory lock to serialize arrival sequence allocation per dateKey
          try {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'gate_arrival_counter_' + plantDay.dateKey}))`;
          } catch (lockErr: any) {
            this.logger.error(
              `Daily arrival advisory lock failed for dateKey ${plantDay.dateKey}: ${lockErr.message}. Aborting fail-closed.`,
              lockErr.stack,
            );
            throw new InternalServerErrorException(
              'Penguncian nomor urut harian gagal; pendaftaran dibatalkan secara fail-closed.',
            );
          }

          if (
            !tx.dailyArrivalCounter ||
            typeof tx.dailyArrivalCounter.findUnique !== 'function' ||
            typeof tx.dailyArrivalCounter.upsert !== 'function' ||
            !tx.transaction ||
            typeof tx.transaction.findMany !== 'function'
          ) {
            throw new InternalServerErrorException(
              'Layanan database arrival counter tidak tersedia dalam konteks transaksi.',
            );
          }

          let existingCounter: any;
          try {
            existingCounter = await tx.dailyArrivalCounter.findUnique({
              where: { dateKey: plantDay.dateKey },
            });
          } catch (err: any) {
            this.logger.error(
              `Gagal membaca dailyArrivalCounter untuk ${plantDay.dateKey}: ${err.message}`,
              err.stack,
            );
            throw new InternalServerErrorException(
              'Gagal memverifikasi counter kedatangan harian secara fail-closed.',
            );
          }

          const MAX_INT32 = 2147483647;
          let counterExisting = 0;

          if (existingCounter !== null && existingCounter !== undefined) {
            if (
              typeof existingCounter.lastSeq !== 'number' ||
              !Number.isInteger(existingCounter.lastSeq) ||
              existingCounter.lastSeq < 0 ||
              existingCounter.lastSeq > MAX_INT32
            ) {
              throw new InternalServerErrorException(
                `Nilai counter kedatangan harian di database tidak valid atau rusak (${existingCounter.lastSeq}).`,
              );
            }
            counterExisting = existingCounter.lastSeq;
          }

          const prefix = `GMS-${plantDay.dateKey}-`;
          let existingTxs: Array<{
            transactionNumber: string;
            dailySequence: number | null;
          }>;
          try {
            existingTxs = await tx.transaction.findMany({
              where: {
                transactionNumber: { startsWith: prefix },
              },
              select: {
                transactionNumber: true,
                dailySequence: true,
              },
            });
          } catch (err: any) {
            this.logger.error(
              `Gagal membaca transaksi existing untuk ${prefix}: ${err.message}`,
              err.stack,
            );
            throw new InternalServerErrorException(
              'Gagal memeriksa transaksi existing untuk alokasi nomor urut.',
            );
          }

          const CANONICAL_TX_REGEX = /^GMS-\d{8}-(\d{4,})$/;
          let highestExistingSequence = 0;

          for (const rec of existingTxs) {
            let recDailySeq: number | null = null;
            if (rec.dailySequence !== null && rec.dailySequence !== undefined) {
              if (
                typeof rec.dailySequence !== 'number' ||
                !Number.isInteger(rec.dailySequence) ||
                rec.dailySequence < 1 ||
                rec.dailySequence > MAX_INT32
              ) {
                throw new InternalServerErrorException(
                  `Data dailySequence (${rec.dailySequence}) pada transaksi ${rec.transactionNumber} tidak valid atau melampaui batas penyimpanan.`,
                );
              }
              recDailySeq = rec.dailySequence;
            }

            let recSuffixSeq: number | null = null;
            if (typeof rec.transactionNumber === 'string') {
              const match = rec.transactionNumber.match(CANONICAL_TX_REGEX);
              if (match && match[1]) {
                try {
                  const bigSuffix = BigInt(match[1]);
                  if (bigSuffix > BigInt(MAX_INT32)) {
                    throw new InternalServerErrorException(
                      `Suffix nomor transaksi ${rec.transactionNumber} melampaui batas maksimum integer 32-bit (${MAX_INT32}).`,
                    );
                  }
                  if (bigSuffix < 1n) {
                    throw new InternalServerErrorException(
                      `Suffix nomor transaksi ${rec.transactionNumber} tidak boleh kurang dari 1.`,
                    );
                  }
                  recSuffixSeq = Number(bigSuffix);
                } catch (parseErr: any) {
                  if (parseErr instanceof InternalServerErrorException) {
                    throw parseErr;
                  }
                  throw new InternalServerErrorException(
                    `Gagal memproses suffix numerik transaksi ${rec.transactionNumber}: ${parseErr.message}`,
                  );
                }
              }
              // Non-canonical suffix without dailySequence is ignored according to contract
            }

            // Reconciliation per transaction row
            let effectiveSeq: number | null = null;
            if (recDailySeq !== null && recSuffixSeq !== null) {
              effectiveSeq =
                recDailySeq > recSuffixSeq ? recDailySeq : recSuffixSeq;
            } else if (recDailySeq !== null) {
              effectiveSeq = recDailySeq;
            } else if (recSuffixSeq !== null) {
              effectiveSeq = recSuffixSeq;
            }

            if (
              effectiveSeq !== null &&
              effectiveSeq > highestExistingSequence
            ) {
              highestExistingSequence = effectiveSeq;
            }
          }

          const baseline =
            counterExisting > highestExistingSequence
              ? counterExisting
              : highestExistingSequence;

          if (baseline >= MAX_INT32) {
            throw new InternalServerErrorException(
              `Nomor urut kedatangan harian telah mencapai batas maksimum integer 32-bit (${MAX_INT32}). Alokasi baru ditolak secara fail-closed.`,
            );
          }

          const nextSequence = baseline + 1;
          let dailySequence: number;

          try {
            await tx.dailyArrivalCounter.upsert({
              where: { dateKey: plantDay.dateKey },
              create: { dateKey: plantDay.dateKey, lastSeq: nextSequence },
              update: { lastSeq: nextSequence },
            });
            dailySequence = nextSequence;
          } catch (counterErr: any) {
            this.logger.error(
              `Failed to allocate atomic dailyArrivalCounter for ${plantDay.dateKey}: ${counterErr.message}. Aborting transaction fail-closed.`,
              counterErr.stack,
            );
            throw new InternalServerErrorException(
              'Gagal mengalokasikan nomor urut kedatangan harian secara atomik. Transaksi pendaftaran dibatalkan secara aman.',
            );
          }

          const sequenceStr = dailySequence.toString().padStart(4, '0');
          const transactionNumber = `GMS-${plantDay.dateKey}-${sequenceStr}`;

          const activeTransaction = await tx.transaction.findFirst({
            where: {
              OR: [
                { plateNumber: normalizedPlate },
                { plateNumber: rawPlate },
                { plateNumber: dto.plateNumber },
              ],
              status: {
                notIn: ['COMPLETED', 'CANCELLED'],
              },
            },
          });

          if (activeTransaction) {
            this.logger.warn(
              `Check-in rejected: Active transaction found for plate ${normalizedPlate}`,
            );
            throw new ConflictException({
              success: false,
              message:
                'Kendaraan dengan pelat ini masih memiliki transaksi yang sedang aktif (Belum Gate Out). Harap selesaikan atau batalkan transaksi sebelumnya terlebih dahulu.',
              errors: [],
            });
          }

          let resolvedCatalogId: string | null = null;
          let authoritativeCargoType = dto.cargoType;
          let authoritativeCargoSubType = dto.cargoSubType;
          let gspAnalysisProfile: GspAnalysisProfile | null = null;
          let paPolicyVersion: string | null = null;
          let paExemptionReason: string | null = null;
          let receiptUnit: WarehouseUnit | null = null;

          if (dto.processType === 'GSP') {
            // Fail-closed enforcement for GSP check-in:
            if (!dto.productCatalogId) {
              throw new BadRequestException({
                success: false,
                message:
                  'productCatalogId wajib disertakan untuk registrasi transaksi proses GSP.',
                errors: ['MISSING_PRODUCT_CATALOG_ID'],
              });
            }

            const catalog = await tx.productCatalog.findUnique({
              where: { id: dto.productCatalogId },
            });

            if (!catalog) {
              throw new BadRequestException({
                success: false,
                message: `Katalog produk dengan ID '${dto.productCatalogId}' tidak ditemukan.`,
                errors: ['CATALOG_NOT_FOUND'],
              });
            }

            if (!catalog.isActive) {
              throw new BadRequestException({
                success: false,
                message: `Katalog produk '${catalog.name}' (${catalog.code}) berstatus nonaktif dan tidak dapat digunakan untuk registrasi.`,
                errors: ['CATALOG_INACTIVE'],
              });
            }

            if (catalog.processType !== 'GSP') {
              throw new BadRequestException({
                success: false,
                message: `Katalog produk '${catalog.name}' bertipe proses ${catalog.processType}, tidak sesuai dengan proses transaksi GSP.`,
                errors: ['PROCESS_MISMATCH'],
              });
            }

            if (!catalog.gspAnalysisProfile) {
              throw new BadRequestException({
                success: false,
                message: `Katalog produk '${catalog.name}' belum memiliki profil analisis PA terkonfigurasi.`,
                errors: ['MISSING_ANALYSIS_PROFILE'],
              });
            }

            if (!catalog.receiptUnit) {
              throw new BadRequestException({
                success: false,
                message: `Katalog produk '${catalog.name}' belum memiliki satuan penerimaan (receiptUnit) terkonfigurasi.`,
                errors: ['MISSING_GSP_RECEIPT_UNIT'],
              });
            }

            receiptUnit = catalog.receiptUnit;

            // Invariant verification between profile and isPaRequired
            assertValidGspProfileInvariant(
              catalog.gspAnalysisProfile,
              catalog.isPaRequired,
            );

            // Server-Authoritative Cargo Identity & Anti-tamper check (Section 18)
            if (dto.cargoType) {
              const clientCat = dto.cargoType.trim().toLowerCase();
              const canonCat = catalog.category.trim().toLowerCase();
              if (clientCat !== canonCat) {
                throw new BadRequestException({
                  success: false,
                  message: `Kategori kargo '${dto.cargoType}' tidak sesuai dengan data katalog master '${catalog.category}'.`,
                  errors: ['CARGO_IDENTITY_CONFLICT'],
                });
              }
            }

            if (dto.cargoSubType) {
              const clientSub = dto.cargoSubType.trim().toLowerCase();
              const canonName = catalog.name.trim().toLowerCase();
              const canonSub = (catalog.subCategory || '').trim().toLowerCase();
              if (clientSub !== canonName && clientSub !== canonSub) {
                throw new BadRequestException({
                  success: false,
                  message: `Subtipe kargo '${dto.cargoSubType}' tidak sesuai dengan data katalog master '${catalog.name}'.`,
                  errors: ['CARGO_IDENTITY_CONFLICT'],
                });
              }
            }

            resolvedCatalogId = catalog.id;
            authoritativeCargoType = catalog.category;
            authoritativeCargoSubType = catalog.name;
            gspAnalysisProfile = catalog.gspAnalysisProfile;
            paPolicyVersion = catalog.policyVersion || 'SOP-GSP-2026.1';
            if (catalog.gspAnalysisProfile === GspAnalysisProfile.PA_EXEMPT) {
              paExemptionReason = `SOP Exemption Rule [${paPolicyVersion}]: Produk ${catalog.name} (${catalog.code}) terverifikasi dari katalog master resmi bebas analisis PA laboratorium.`;
            }
          } else {
            // Non-GSP processes (GBB / GBJ): preserve transitional catalog resolution if present
            if (dto.productCatalogId && tx.productCatalog) {
              const cat = await tx.productCatalog.findUnique({
                where: { id: dto.productCatalogId },
              });
              if (cat) {
                if (cat.processType !== dto.processType) {
                  throw new BadRequestException({
                    success: false,
                    message: `Katalog produk '${cat.name}' bertipe proses ${cat.processType}, tidak sesuai dengan transaksi ${dto.processType}.`,
                    errors: ['PROCESS_MISMATCH'],
                  });
                }
                resolvedCatalogId = cat.id;
              }
            }
          }

          return tx.transaction.create({
            data: {
              transactionNumber,
              dailySequence,
              plateNumber: normalizedPlate,
              plateNumberNormalized: rawPlate,
              driverName: dto.driverName,
              driverPhone: dto.driverPhone,
              vendorName: dto.vendorName,
              vehicleType: dto.vehicleType,
              processType: dto.processType,
              cargoType: authoritativeCargoType,
              cargoSubType: authoritativeCargoSubType,
              productCatalogId: resolvedCatalogId,
              gspAnalysisProfile,
              paPolicyVersion,
              paExemptionReason,
              receiptUnit,
              cargoProcessType: dto.cargoProcessType,
              suratJalanNumber: dto.suratJalanNumber,
              poNumber: dto.poNumber,
              permitCardNumber: dto.permitCardNumber,
              guestIdNumber: dto.guestIdNumber,
              remarks: dto.remarks,
              status: 'REGISTERED',
              gateInAt: new Date(),
              createdById: user.id,
              statusHistory: {
                create: {
                  newStatus: 'REGISTERED',
                  changedById: user.id,
                  notes: 'Gate check-in created',
                },
              },
            },
            include: {
              statusHistory: true,
            },
          });
        });
        break;
      } catch (error: any) {
        if (
          error instanceof ConflictException ||
          error instanceof BadRequestException
        ) {
          throw error;
        }
        if (error.code === 'P2002') {
          retries--;
          if (retries === 0)
            throw new BadRequestException(
              'Sistem sedang sibuk memproses antrean. Silakan coba lagi.',
            );
          continue;
        }
        throw error;
      }
    }

    if (!transaction)
      throw new BadRequestException('System error, transaction failed');

    // Write audit log
    await this.activityLogsService.logAction({
      userId: user.id,
      action: 'GATE_CHECK_IN',
      module: 'GATE',
      referenceId: transaction.id,
      description: `Vehicle ${normalizedPlate} checked in`,
      status: 'SUCCESS',
    });

    this.logger.log(`Check-in successful: ${transaction.transactionNumber}`);

    return {
      success: true,
      message: 'Gate check-in created successfully',
      data: {
        ...transaction,
        createdBy: {
          id: user.id,
          name: user.name,
          role: user.role,
        },
      },
    };
  }

  async getQueue(query: GateQueryDto, user: JwtPayloadUser) {
    const {
      page = 1,
      limit = 10,
      search,
      processType,
      status,
      startDate,
      endDate,
    } = query;

    const where: Prisma.TransactionWhereInput = {
      status: status ? status : { notIn: ['COMPLETED', 'CANCELLED'] },
    };

    if (search) {
      where.OR = [
        { transactionNumber: { contains: search, mode: 'insensitive' } },
        { plateNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (processType) {
      where.processType = processType;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          statusHistory: {
            orderBy: { changedAt: 'desc' },
            take: 1,
          },
        },
      }),
    ]);

    await this.activityLogsService.logAction({
      userId: user.id,
      action: 'GATE_QUEUE_VIEW',
      module: 'GATE',
      description: `User viewed gate queue`,
      status: 'SUCCESS',
    });

    return {
      success: true,
      message: 'Gate queue retrieved successfully',
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getDetail(id: string, user: JwtPayloadUser) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: GATE_DETAIL_CURRENT_RELATIONS_INCLUDE,
    });

    if (!transaction) {
      throw new NotFoundException({
        success: false,
        message: 'Transaction not found',
        errors: [],
      });
    }

    let createdBy = null;
    if (transaction.createdById) {
      createdBy = await this.prisma.user.findUnique({
        where: { id: transaction.createdById },
        select: { id: true, name: true, role: true },
      });
    }

    await this.activityLogsService.logAction({
      userId: user.id,
      action: 'GATE_DETAIL_VIEW',
      module: 'GATE',
      referenceId: id,
      description: `User viewed transaction detail ${transaction.transactionNumber}`,
      status: 'SUCCESS',
    });

    return {
      success: true,
      message: 'Transaction detail retrieved successfully',
      data: {
        ...transaction,
        createdBy,
      },
    };
  }

  async checkOut(id: string, user: JwtPayloadUser) {
    this.logger.log(`Gate check-out attempt for transaction: ${id}`);

    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
    });

    if (!transaction) {
      throw new NotFoundException({
        success: false,
        message: 'Transaction not found',
        errors: [],
      });
    }

    assertValidStatusTransition(transaction.status, 'COMPLETED');

    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.transaction.updateMany({
        where: {
          id,
          status: 'WEIGH_OUT_DONE',
          revision: transaction.revision,
        },
        data: {
          revision: { increment: 1 },
          status: 'COMPLETED',
          gateOutAt: new Date(),
          completedAt: new Date(),
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

      await tx.transactionStatusHistory.create({
        data: {
          transactionId: id,
          oldStatus: transaction.status,
          newStatus: 'COMPLETED',
          changedById: user.id,
          notes: 'Gate check-out processed',
        },
      });

      return tx.transaction.findUnique({ where: { id } });
    });

    if (!updated) {
      throw new NotFoundException({
        success: false,
        message: 'Updated transaction not found',
        errors: [],
      });
    }

    await this.activityLogsService.logAction({
      userId: user.id,
      action: 'GATE_CHECK_OUT',
      module: 'GATE',
      referenceId: id,
      description: `Vehicle ${transaction.plateNumber} checked out`,
      status: 'SUCCESS',
    });

    this.logger.log(
      `Check-out successful for ${transaction.transactionNumber}`,
    );

    return {
      success: true,
      message: 'Gate check-out processed successfully',
      data: updated,
    };
  }

  async cancel(id: string, reason: string, user: JwtPayloadUser) {
    this.logger.log(`Transaction cancellation attempt for: ${id}`);

    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
    });

    if (!transaction) {
      throw new NotFoundException({
        success: false,
        message: 'Transaction not found',
        errors: [],
      });
    }

    assertValidStatusTransition(transaction.status, 'CANCELLED');

    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.transaction.updateMany({
        where: {
          id,
          status: transaction.status,
          revision: transaction.revision,
        },
        data: {
          revision: { increment: 1 },
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: reason,
          cancelledById: user.id,
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

      await tx.transactionStatusHistory.create({
        data: {
          transactionId: id,
          oldStatus: transaction.status,
          newStatus: 'CANCELLED',
          changedById: user.id,
          notes: `Cancelled: ${reason}`,
        },
      });

      return tx.transaction.findUnique({ where: { id } });
    });

    if (!updated) {
      throw new NotFoundException({
        success: false,
        message: 'Updated transaction not found',
        errors: [],
      });
    }

    await this.activityLogsService.logAction({
      userId: user.id,
      action: 'TRANSACTION_CANCELLED',
      module: 'GATE',
      referenceId: id,
      description: `Transaction ${transaction.transactionNumber} cancelled. Reason: ${reason}`,
      status: 'SUCCESS',
    });

    this.logger.warn(
      `Transaction cancelled: ${transaction.transactionNumber} by ${user.email}`,
    );

    return {
      success: true,
      message: 'Transaction cancelled successfully',
      data: updated,
    };
  }
}
