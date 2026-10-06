import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import {
  AmendActiveProductDto,
  RecordOperationalIncidentDto,
} from './dto/amend-active-transaction.dto';
import { CorrectionAction, TransactionStatus, GspAnalysisProfile } from '@prisma/client';
import { isProductPaExempt } from '../qc/constants/pa-exemption-policy';
import { assertValidGspProfileInvariant } from '../qc/constants/gsp-analysis-profile';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class ActiveTransactionAmendmentService {
  private readonly logger = new Logger(ActiveTransactionAmendmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  /**
   * Amend product details on an ACTIVE transaction before unloading has started.
   * Auto-downgrades PA_NOT_REQUIRED to QC_VEHICLE_PENDING if changed to a non-exempt product.
   * Ensures REGISTERED transactions remaining prior to weigh-in stay REGISTERED even when amended to Solar.
   */
  async amendActiveProduct(
    transactionId: string,
    dto: AmendActiveProductDto,
    user: JwtPayloadUser,
  ) {
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Hanya Admin yang berwenang melakukan koreksi produk pada transaksi aktif',
      );
    }

    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!tx) {
      throw new NotFoundException('Transaksi tidak ditemukan');
    }

    if (
      tx.status === TransactionStatus.COMPLETED ||
      tx.status === TransactionStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Transaksi sudah selesai atau dibatalkan. Gunakan OperationLogCorrectionService untuk koreksi data historis.',
      );
    }

    // Check if unloading has started or already occurred
    const postUnloadingStatuses: TransactionStatus[] = [
      TransactionStatus.WAREHOUSE_IN_PROGRESS,
      TransactionStatus.WAREHOUSE_DONE,
      TransactionStatus.INCOMING_CHECK_PENDING,
      TransactionStatus.INCOMING_CHECK_IN_PROGRESS,
      TransactionStatus.INCOMING_CHECK_PASSED,
      TransactionStatus.INCOMING_CHECK_REJECTED,
      TransactionStatus.WEIGH_OUT_DONE,
    ];

    if (tx.warehouseStartAt || postUnloadingStatuses.includes(tx.status)) {
      throw new BadRequestException(
        'Bongkar muatan di gudang sudah dimulai atau diselesaikan. Koreksi produk standar diblokir secara fisik. ' +
          'Gunakan prosedur Pencatatan Insiden Operasional.',
      );
    }

    // Look up and validate the target product's catalog
    let newCatalog: any = null;
    if (dto.productCatalogId) {
      newCatalog = await this.prisma.productCatalog.findUnique({
        where: { id: dto.productCatalogId },
      });
      if (!newCatalog) {
        throw new BadRequestException(
          'Katalog produk yang ditentukan tidak ditemukan.',
        );
      }
      if (!newCatalog.isActive) {
        throw new BadRequestException(
          'Katalog produk yang ditentukan berstatus tidak aktif.',
        );
      }
      if (newCatalog.processType !== tx.processType) {
        throw new BadRequestException(
          `Katalog produk (${newCatalog.processType}) tidak sesuai dengan tipe proses transaksi (${tx.processType}).`,
        );
      }
      if (dto.cargoSubType) {
        const sub = dto.cargoSubType.toLowerCase();
        const catName = (newCatalog.name || '').toLowerCase();
        const catSub = (newCatalog.subCategory || '').toLowerCase();
        if (
          !catName.includes(sub) &&
          !catSub.includes(sub) &&
          !sub.includes(catName)
        ) {
          throw new BadRequestException(
            'Identitas katalog produk tidak sesuai dengan kargo yang dipilih.',
          );
        }
      }
    } else if (dto.cargoSubType && tx.processType) {
      newCatalog = await this.prisma.productCatalog.findFirst({
        where: {
          processType: tx.processType,
          isActive: true,
          OR: [
            { name: { equals: dto.cargoSubType, mode: 'insensitive' } },
            { subCategory: { equals: dto.cargoSubType, mode: 'insensitive' } },
          ],
        },
      });
      if (!newCatalog) {
        throw new BadRequestException(
          `Katalog produk aktif untuk ${dto.cargoSubType} (${tx.processType}) tidak ditemukan.`,
        );
      }
    }

    let authoritativeCargoType = dto.cargoType;
    let authoritativeCargoSubType = dto.cargoSubType;
    let gspAnalysisProfile: GspAnalysisProfile | null = tx.gspAnalysisProfile;
    let paPolicyVersion = tx.paPolicyVersion;
    let paExemptionReason = tx.paExemptionReason;
    let newStatus: TransactionStatus = tx.status;
    let statusDowngraded = false;

    if (tx.processType === 'GSP') {
      if (!newCatalog) {
        throw new BadRequestException({
          success: false,
          message:
            'Katalog produk target wajib ditentukan untuk perubahan transaksi GSP.',
          errors: ['MISSING_TARGET_CATALOG'],
        });
      }

      if (newCatalog.processType !== 'GSP') {
        throw new BadRequestException({
          success: false,
          message: `Katalog produk target '${newCatalog.name}' bukan bertipe proses GSP.`,
          errors: ['PROCESS_MISMATCH'],
        });
      }

      if (!newCatalog.gspAnalysisProfile) {
        throw new BadRequestException({
          success: false,
          message: `Katalog produk target '${newCatalog.name}' belum memiliki profil analisis GSP.`,
          errors: ['MISSING_ANALYSIS_PROFILE'],
        });
      }

      assertValidGspProfileInvariant(
        newCatalog.gspAnalysisProfile,
        newCatalog.isPaRequired,
      );

      authoritativeCargoType = newCatalog.category;
      authoritativeCargoSubType = newCatalog.name;
      gspAnalysisProfile = newCatalog.gspAnalysisProfile;
      paPolicyVersion = newCatalog.policyVersion || 'SOP-GSP-2026.1';

      if (newCatalog.gspAnalysisProfile === GspAnalysisProfile.PA_EXEMPT) {
        paExemptionReason = `SOP Exemption Rule [${paPolicyVersion}]: Produk ${newCatalog.name} (${newCatalog.code}) terverifikasi dari katalog master resmi bebas analisis PA laboratorium.`;
        if (tx.status === TransactionStatus.REGISTERED) {
          newStatus = TransactionStatus.REGISTERED;
        } else {
          newStatus = TransactionStatus.PA_NOT_REQUIRED;
          if (tx.status !== TransactionStatus.PA_NOT_REQUIRED) {
            statusDowngraded = true;
          }
        }
      } else {
        paExemptionReason = null;
        if (tx.status === TransactionStatus.REGISTERED) {
          newStatus = TransactionStatus.REGISTERED;
        } else {
          newStatus = TransactionStatus.QC_VEHICLE_PENDING;
          if (tx.status !== TransactionStatus.QC_VEHICLE_PENDING) {
            statusDowngraded = true;
          }
        }
      }
    } else {
      // Determine exemption status for non-GSP product strictly via catalog
      const willBeExempt = isProductPaExempt(newCatalog, {
        processType: tx.processType,
        cargoType: dto.cargoType,
        cargoSubType: dto.cargoSubType,
      });

      if (willBeExempt) {
        if (tx.status === TransactionStatus.REGISTERED) {
          newStatus = TransactionStatus.REGISTERED;
        } else {
          newStatus = TransactionStatus.PA_NOT_REQUIRED;
          if (tx.status !== TransactionStatus.PA_NOT_REQUIRED) {
            statusDowngraded = true;
          }
        }
      } else {
        if (tx.status === TransactionStatus.REGISTERED) {
          newStatus = TransactionStatus.REGISTERED;
        } else if (
          tx.status === TransactionStatus.PA_NOT_REQUIRED ||
          tx.status === TransactionStatus.QC_VEHICLE_PASSED ||
          tx.status === TransactionStatus.QC_VEHICLE_IN_PROGRESS ||
          tx.status === TransactionStatus.QC_RETEST_REQUIRED ||
          tx.status === TransactionStatus.WAITING_UTILITY_DISPOSITION
        ) {
          newStatus = TransactionStatus.QC_VEHICLE_PENDING;
          statusDowngraded = true;
        }
      }
    }

    await this.prisma.$transaction(async (prismaTx) => {
      // Invalidate any previous QC Product Analysis records so old test results cannot be reused
      await prismaTx.qcProductAnalysis.updateMany({
        where: { transactionId, isVoided: false },
        data: {
          isVoided: true,
          voidedAt: new Date(),
          voidReason: `Dibatalkan karena perubahan produk aktif dari ${tx.cargoSubType} ke ${dto.cargoSubType}. Alasan: ${dto.reason}`,
          status: 'VOIDED',
        },
      });

      const claimed = await prismaTx.transaction.updateMany({
        where: { id: transactionId, revision: dto.revision },
        data: {
          cargoType: authoritativeCargoType,
          cargoSubType: authoritativeCargoSubType,
          productCatalogId: newCatalog
            ? newCatalog.id
            : dto.productCatalogId !== undefined
              ? dto.productCatalogId
              : tx.productCatalogId,
          gspAnalysisProfile,
          paPolicyVersion,
          paExemptionReason,
          status: newStatus,
          revision: { increment: 1 },
        },
      });

      if (claimed.count === 0) {
        throw new ConflictException(
          'Transaksi telah diperbarui oleh pengguna lain (konflik revisi konkuren)',
        );
      }

      await prismaTx.transactionCorrection.create({
        data: {
          transactionId,
          correctedById: user.id,
          action: CorrectionAction.AMEND_ACTIVE,
          reasonCode: 'PRODUCT_AMENDMENT',
          reason: dto.reason,
          remark: `Koreksi produk aktif sebelum bongkar: ${tx.cargoSubType} -> ${authoritativeCargoSubType}. Hasil PA lama dibatalkan.`,
          oldValues: {
            cargoType: tx.cargoType,
            cargoSubType: tx.cargoSubType,
            productCatalogId: tx.productCatalogId,
            gspAnalysisProfile: tx.gspAnalysisProfile,
            status: tx.status,
          },
          newValues: {
            cargoType: authoritativeCargoType,
            cargoSubType: authoritativeCargoSubType,
            productCatalogId: newCatalog ? newCatalog.id : dto.productCatalogId || null,
            gspAnalysisProfile,
            status: newStatus,
          },
          expectedRevision: dto.revision,
        },
      });

      if (statusDowngraded) {
        await prismaTx.transactionStatusHistory.create({
          data: {
            transactionId,
            oldStatus: tx.status,
            newStatus,
            changedById: user.id,
            notes: `Status otomatis disesuaikan ke ${newStatus} karena perubahan produk ke ${dto.cargoSubType}. Hasil analisis PA sebelumnya dibatalkan secara atomik. Alasan: ${dto.reason}`,
          },
        });
      }
    });

    await this.activityLogsService
      .logAction({
        userId: user.id,
        action: 'ACTIVE_TRANSACTION_AMENDED',
        module: 'TRANSACTIONS',
        referenceId: transactionId,
        description: `Koreksi produk aktif: ${tx.cargoSubType} -> ${dto.cargoSubType}. Status: ${tx.status} -> ${newStatus}`,
        status: 'SUCCESS',
      })
      .catch(() => {});

    return {
      success: true,
      message: 'Koreksi produk aktif berhasil diproses',
      data: {
        transactionId,
        newStatus,
        statusDowngraded,
      },
    };
  }

  /**
   * Record an Operational Incident for post-unloading corrections.
   * Does NOT alter physical unloading facts or change transaction status automatically.
   * Enforces:
   * 1. Actual post-unloading verification
   * 2. Evidence attachment belongs to the SAME transaction
   * 3. UUID validation on evidenceAttachmentId
   * 4. CAS revision conflict detection
   */
  async recordOperationalIncident(
    transactionId: string,
    dto: RecordOperationalIncidentDto,
    user: JwtPayloadUser,
  ) {
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Hanya Admin yang berwenang mencatat insiden operasional',
      );
    }

    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!tx) {
      throw new NotFoundException('Transaksi tidak ditemukan');
    }

    if (
      tx.status === TransactionStatus.COMPLETED ||
      tx.status === TransactionStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Transaksi sudah selesai atau dibatalkan. Insiden operasional hanya berlaku untuk transaksi aktif pasca-bongkar.',
      );
    }

    // 1. Mandatory Post-Unloading Verification
    const postUnloadingStatuses: TransactionStatus[] = [
      TransactionStatus.WAREHOUSE_IN_PROGRESS,
      TransactionStatus.WAREHOUSE_DONE,
      TransactionStatus.WEIGH_OUT_DONE,
    ];

    const isPostUnloading =
      Boolean(tx.warehouseStartAt) || postUnloadingStatuses.includes(tx.status);
    if (!isPostUnloading) {
      throw new BadRequestException(
        'Pencatatan insiden operasional hanya berlaku untuk transaksi yang sudah memulai atau menyelesaikan proses bongkar muatan.',
      );
    }

    // 2. UUID Validation on evidenceAttachmentId
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (
      !dto.evidenceAttachmentId ||
      !uuidRegex.test(dto.evidenceAttachmentId)
    ) {
      throw new BadRequestException(
        'Format evidenceAttachmentId tidak valid (harus berupa UUID).',
      );
    }

    // 3. Validate evidence attachment exists AND belongs to the SAME transaction
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: dto.evidenceAttachmentId },
    });

    if (!attachment) {
      throw new NotFoundException(
        'Dokumen bukti insiden operasional tidak ditemukan pada sistem',
      );
    }

    if (attachment.transactionId !== transactionId) {
      throw new BadRequestException(
        'Lampiran bukti insiden tidak terasosiasi dengan transaksi ini (cross-transaction evidence rejected).',
      );
    }

    // 4. Compare-And-Swap (CAS) Concurrency Enforcement
    if (dto.revision !== tx.revision) {
      throw new ConflictException(
        'Revisi transaksi tidak sesuai (Stale Revision Conflict). Transaksi telah diperbarui oleh pengguna lain.',
      );
    }

    await this.prisma.$transaction(async (prismaTx) => {
      const claimed = await prismaTx.transaction.updateMany({
        where: { id: transactionId, revision: dto.revision },
        data: { revision: { increment: 1 } },
      });

      if (claimed.count === 0) {
        throw new ConflictException(
          'Transaksi telah diperbarui oleh pengguna lain (konflik konkurensi)',
        );
      }

      await prismaTx.transactionCorrection.create({
        data: {
          transactionId,
          correctedById: user.id,
          action: CorrectionAction.OPERATIONAL_INCIDENT,
          reasonCode: 'OPERATIONAL_INCIDENT',
          reason: dto.incidentReason,
          remark: `Insiden Operasional (PIC: ${dto.supervisorPic}). Tindakan: ${dto.actionTaken || '-'}`,
          evidenceUrl: `attachment:${dto.evidenceAttachmentId}`,
          oldValues: {
            status: tx.status,
            cargoType: tx.cargoType,
            cargoSubType: tx.cargoSubType,
            warehouseStartAt: tx.warehouseStartAt,
          },
          newValues: {
            incidentReason: dto.incidentReason,
            supervisorPic: dto.supervisorPic,
            actionTaken: dto.actionTaken || null,
            evidenceAttachmentId: dto.evidenceAttachmentId,
          },
          expectedRevision: dto.revision,
        },
      });
    });

    await this.activityLogsService
      .logAction({
        userId: user.id,
        action: 'OPERATIONAL_INCIDENT_RECORDED',
        module: 'TRANSACTIONS',
        referenceId: transactionId,
        description: `Insiden operasional dicatat oleh ${user.email}. PIC: ${dto.supervisorPic}. Alasan: ${dto.incidentReason}`,
        status: 'SUCCESS',
      })
      .catch(() => {});

    return {
      success: true,
      message: 'Insiden operasional berhasil dicatat dalam audit trail',
      data: {
        transactionId,
        status: tx.status,
      },
    };
  }
}
