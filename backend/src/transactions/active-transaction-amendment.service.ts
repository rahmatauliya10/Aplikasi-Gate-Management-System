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
import {
  CorrectionAction,
  TransactionStatus,
} from '@prisma/client';
import { isProductPaExempt } from '../qc/constants/pa-exemption-policy';
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

    if (tx.status === TransactionStatus.COMPLETED || tx.status === TransactionStatus.CANCELLED) {
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

    // Look up the new product's catalog
    let newCatalog: any = null;
    if (dto.productCatalogId) {
      newCatalog = await this.prisma.productCatalog.findUnique({
        where: { id: dto.productCatalogId },
      });
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
    }

    // Determine exemption status for the new product strictly via catalog
    const willBeExempt = isProductPaExempt(newCatalog, {
      processType: tx.processType,
      cargoType: dto.cargoType,
      cargoSubType: dto.cargoSubType,
    });

    let newStatus: TransactionStatus = tx.status;
    let statusDowngraded = false;

    // If current status is PA_NOT_REQUIRED and new product is NOT exempt, downgrade to QC_VEHICLE_PENDING
    if (tx.status === TransactionStatus.PA_NOT_REQUIRED && !willBeExempt) {
      newStatus = TransactionStatus.QC_VEHICLE_PENDING;
      statusDowngraded = true;
    }

    await this.prisma.$transaction(async (prismaTx) => {
      const claimed = await prismaTx.transaction.updateMany({
        where: { id: transactionId, revision: dto.revision },
        data: {
          cargoType: dto.cargoType,
          cargoSubType: dto.cargoSubType,
          productCatalogId: newCatalog ? newCatalog.id : (dto.productCatalogId !== undefined ? dto.productCatalogId : tx.productCatalogId),
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
          remark: `Koreksi produk aktif sebelum bongkar: ${tx.cargoSubType} -> ${dto.cargoSubType}`,
          oldValues: {
            cargoType: tx.cargoType,
            cargoSubType: tx.cargoSubType,
            productCatalogId: tx.productCatalogId,
            status: tx.status,
          },
          newValues: {
            cargoType: dto.cargoType,
            cargoSubType: dto.cargoSubType,
            productCatalogId: dto.productCatalogId || null,
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
            notes: `Status otomatis diturunkan ke QC_VEHICLE_PENDING karena perubahan produk ke ${dto.cargoSubType} yang memerlukan analisis PA. Alasan: ${dto.reason}`,
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

    if (tx.status === TransactionStatus.COMPLETED || tx.status === TransactionStatus.CANCELLED) {
      throw new BadRequestException(
        'Transaksi sudah selesai atau dibatalkan. Insiden operasional hanya berlaku untuk transaksi aktif pasca-bongkar.',
      );
    }

    // Validate evidence attachment exists
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: dto.evidenceAttachmentId },
    });

    if (!attachment) {
      throw new NotFoundException(
        'Dokumen bukti insiden operasional tidak ditemukan pada sistem',
      );
    }

    await this.prisma.$transaction(async (prismaTx) => {
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
