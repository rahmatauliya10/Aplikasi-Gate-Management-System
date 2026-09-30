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
  SubmitProductAnalysisDto,
  AnalysisDecision,
} from './dto/submit-product-analysis.dto';
import {
  UtilityDispositionDto,
  DispositionAction,
} from './dto/utility-disposition.dto';
import { TransactionStatus } from '@prisma/client';
import { isProductPaExempt } from './constants/pa-exemption-policy';
import { assertValidStatusTransition } from '../common/state-machine/workflow-state-machine';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class QcProductAnalysisService {
  private readonly logger = new Logger(QcProductAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  /**
   * Submit initial or retest lab analysis for a cargo transaction.
   */
  async submitProductAnalysis(
    transactionId: string,
    dto: SubmitProductAnalysisDto,
    user: JwtPayloadUser,
  ) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { productCatalog: true },
    });

    if (!tx) {
      throw new NotFoundException('Transaksi tidak ditemukan');
    }

    // Exempt products (Solar) must never undergo lab PA analysis
    const isExempt = isProductPaExempt(tx.productCatalog, {
      processType: tx.processType,
      cargoType: tx.cargoType,
      cargoSubType: tx.cargoSubType,
    });
    if (tx.status === TransactionStatus.PA_NOT_REQUIRED || isExempt) {
      throw new BadRequestException(
        `Produk ini (${tx.cargoSubType || 'Solar'}) berizin bypass PA. Analisis PA tidak diperlukan.`,
      );
    }

    const testRound = dto.testRound || 1;

    // Validate status according to test round
    if (testRound === 1 && tx.status !== TransactionStatus.QC_VEHICLE_PENDING && tx.status !== TransactionStatus.QC_VEHICLE_IN_PROGRESS) {
      throw new BadRequestException(
        `Analisis awal (Round 1) hanya dapat diproses saat status transaksi QC_VEHICLE_PENDING (saat ini: ${tx.status})`,
      );
    }

    if (testRound > 1 && tx.status !== TransactionStatus.QC_RETEST_REQUIRED) {
      throw new BadRequestException(
        `Uji ulang (Round ${testRound}) hanya dapat diproses saat status transaksi QC_RETEST_REQUIRED (saat ini: ${tx.status})`,
      );
    }

    let nextStatus: TransactionStatus;
    switch (dto.decision) {
      case AnalysisDecision.RELEASE:
        nextStatus = TransactionStatus.QC_VEHICLE_PASSED;
        break;
      case AnalysisDecision.REJECT:
        nextStatus = TransactionStatus.QC_VEHICLE_REJECTED;
        break;
      case AnalysisDecision.RETEST_REQUIRED:
        nextStatus = TransactionStatus.QC_RETEST_REQUIRED;
        break;
      case AnalysisDecision.PENDING_DISPOSITION:
        nextStatus = TransactionStatus.WAITING_UTILITY_DISPOSITION;
        break;
      default:
        throw new BadRequestException(`Keputusan analisis tidak valid: ${dto.decision}`);
    }

    assertValidStatusTransition(tx.status, nextStatus);

    await this.prisma.$transaction(async (prismaTx) => {
      const claimed = await prismaTx.transaction.updateMany({
        where: { id: transactionId, revision: dto.revision },
        data: {
          status: nextStatus,
          revision: { increment: 1 },
        },
      });

      if (claimed.count === 0) {
        throw new ConflictException(
          'Transaksi telah diperbarui oleh pengguna lain (konflik konkurensi)',
        );
      }

      await prismaTx.qcProductAnalysis.create({
        data: {
          transactionId,
          productCatalogId: dto.productCatalogId || tx.productCatalogId,
          testRound,
          productCategory: dto.productCategory,
          productName: dto.productName,
          parameters: dto.parameters as any,
          result: dto.result,
          status: dto.decision,
          testedById: user.id,
          testedAt: new Date(),
        },
      });

      await prismaTx.transactionStatusHistory.create({
        data: {
          transactionId,
          oldStatus: tx.status,
          newStatus: nextStatus,
          changedById: user.id,
          notes: dto.notes || `Analisis PA Round ${testRound}: Keputusan ${dto.decision}`,
        },
      });
    });

    await this.activityLogsService
      .logAction({
        userId: user.id,
        action: 'QC_PRODUCT_ANALYSIS_SUBMITTED',
        module: 'QC',
        referenceId: transactionId,
        description: `Analisis PA Round ${testRound} diserahkan untuk ${tx.cargoSubType}. Hasil: ${dto.result}, Keputusan: ${dto.decision}`,
        status: 'SUCCESS',
      })
      .catch(() => {});

    return {
      success: true,
      message: `Analisis produk Round ${testRound} berhasil dicatat`,
      data: {
        transactionId,
        testRound,
        newStatus: nextStatus,
      },
    };
  }

  /**
   * Submit Four-Eyes Utility Disposition for out-of-spec products requiring management disposition.
   * Strictly enforces that the approver must NOT be the testing analyst.
   */
  async submitUtilityDisposition(
    transactionId: string,
    dto: UtilityDispositionDto,
    user: JwtPayloadUser,
  ) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!tx) {
      throw new NotFoundException('Transaksi tidak ditemukan');
    }

    if (tx.status !== TransactionStatus.WAITING_UTILITY_DISPOSITION) {
      throw new BadRequestException(
        `Disposisi Utility hanya dapat diberikan pada transaksi berstatus WAITING_UTILITY_DISPOSITION (saat ini: ${tx.status})`,
      );
    }

    const latestAnalysis = await this.prisma.qcProductAnalysis.findFirst({
      where: { transactionId },
      orderBy: { testRound: 'desc' },
    });

    if (!latestAnalysis) {
      throw new NotFoundException('Data analisis produk tidak ditemukan');
    }

    // Four-Eyes Principle: Approver must be distinct from testing analyst
    if (latestAnalysis.testedById && user.id === latestAnalysis.testedById) {
      throw new ForbiddenException(
        'Prinsip Four-Eyes: Penyetuju disposisi harus berbeda dari analis yang menguji sampel.',
      );
    }

    let nextStatus: TransactionStatus;
    if (dto.dispositionAction === DispositionAction.ACCEPT_WITH_DEVIATION) {
      nextStatus = TransactionStatus.QC_VEHICLE_PASSED;
    } else {
      nextStatus = TransactionStatus.QC_VEHICLE_REJECTED;
    }

    assertValidStatusTransition(tx.status, nextStatus);

    await this.prisma.$transaction(async (prismaTx) => {
      const claimed = await prismaTx.transaction.updateMany({
        where: { id: transactionId, revision: dto.revision },
        data: {
          status: nextStatus,
          revision: { increment: 1 },
        },
      });

      if (claimed.count === 0) {
        throw new ConflictException(
          'Transaksi telah diperbarui oleh pengguna lain (konflik konkurensi)',
        );
      }

      await prismaTx.qcProductAnalysis.update({
        where: { id: latestAnalysis.id },
        data: {
          dispositionAction: dto.dispositionAction,
          dispositionReason: dto.dispositionReason,
          dispositionById: user.id,
          dispositionAt: new Date(),
        },
      });

      await prismaTx.transactionStatusHistory.create({
        data: {
          transactionId,
          oldStatus: tx.status,
          newStatus: nextStatus,
          changedById: user.id,
          notes: `Disposisi Utility (${dto.dispositionAction}): ${dto.dispositionReason}`,
        },
      });
    });

    await this.activityLogsService
      .logAction({
        userId: user.id,
        action: 'QC_UTILITY_DISPOSITION_SUBMITTED',
        module: 'QC',
        referenceId: transactionId,
        description: `Disposisi Utility diserahkan oleh ${user.email}. Keputusan: ${dto.dispositionAction}. Alasan: ${dto.dispositionReason}`,
        status: 'SUCCESS',
      })
      .catch(() => {});

    return {
      success: true,
      message: 'Disposisi Utility berhasil diproses',
      data: {
        transactionId,
        dispositionAction: dto.dispositionAction,
        newStatus: nextStatus,
      },
    };
  }

  /**
   * Retrieve all PA Analysis rounds and history for a transaction.
   */
  async getAnalysisHistory(transactionId: string) {
    const records = await this.prisma.qcProductAnalysis.findMany({
      where: { transactionId },
      include: {
        testedBy: { select: { id: true, name: true, role: true } },
        dispositionBy: { select: { id: true, name: true, role: true } },
      },
      orderBy: { testRound: 'asc' },
    });

    return {
      success: true,
      data: records,
    };
  }
}
