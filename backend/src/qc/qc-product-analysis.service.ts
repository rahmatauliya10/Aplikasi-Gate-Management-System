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
import { AuthorizationScopeService } from '../auth/authorization-scope.service';
import {
  SubmitProductAnalysisDto,
  AnalysisDecision,
} from './dto/submit-product-analysis.dto';
import {
  UtilityDispositionDto,
  DispositionAction,
} from './dto/utility-disposition.dto';
import {
  QcResult,
  TransactionStatus,
  GspAnalysisProfile,
} from '@prisma/client';
import {
  OPERATIONAL_COAL_SPEC_METADATA,
  evaluateCoalAnalysis,
} from './constants/coal-specification';
import {
  OPERATIONAL_PAC_SPEC_METADATA,
  OPERATIONAL_RAPID_KLEN_SPEC_METADATA,
  evaluatePacAnalysis,
  evaluateRapidKlenAnalysis,
  PacAnalysisParameters,
  RapidKlenAnalysisParameters,
} from './constants/chemical-specification';
import { isProductPaExempt } from './constants/pa-exemption-policy';
import { assertValidStatusTransition } from '../common/state-machine/workflow-state-machine';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { SpecificationProvider } from './providers/specification.provider';

@Injectable()
export class QcProductAnalysisService {
  private readonly logger = new Logger(QcProductAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly authorizationScopeService: AuthorizationScopeService,
    private readonly specProvider: SpecificationProvider,
  ) {}

  /**
   * Canonical Start Product Analysis event.
   * Transitions QC_VEHICLE_PENDING -> QC_VEHICLE_IN_PROGRESS and records actual qcStartAt.
   * Enforces:
   * 1. GSP process-scope authorization
   * 2. Transaction must be GSP processType
   * 3. Solar/PA-exempt commodities are rejected (HTTP 400)
   * 4. Initial start: QC_VEHICLE_PENDING -> QC_VEHICLE_IN_PROGRESS
   * 5. Idempotent: repeated start on QC_VEHICLE_IN_PROGRESS does not overwrite original qcStartAt
   * 6. Requires valid weigh-in (weighInAt != null, grossWeight > 0)
   */
  async startProductAnalysis(transactionId: string, user: JwtPayloadUser) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { productCatalog: true },
    });

    if (!tx) {
      throw new NotFoundException('Transaksi tidak ditemukan');
    }

    if (tx.processType !== 'GSP') {
      throw new BadRequestException(
        'Analisis PA laboratorium hanya berlaku untuk transaksi proses GSP.',
      );
    }

    this.authorizationScopeService.assertProcessAccess(user, tx.processType);

    const isExempt = isProductPaExempt(tx.productCatalog, {
      processType: tx.processType,
      cargoType: tx.cargoType,
      cargoSubType: tx.cargoSubType,
    });
    if (
      tx.gspAnalysisProfile === GspAnalysisProfile.PA_EXEMPT ||
      tx.status === TransactionStatus.PA_NOT_REQUIRED ||
      isExempt
    ) {
      throw new BadRequestException(
        `Komoditas bebas PA (${tx.cargoSubType || 'Solar'}) tidak memerlukan proses analisis laboratorium.`,
      );
    }

    // Idempotent check: if already in progress, safely return existing authoritative state without overwriting qcStartAt
    if (tx.status === TransactionStatus.QC_VEHICLE_IN_PROGRESS) {
      return {
        success: true,
        message: 'Proses analisis laboratorium sudah berjalan (in-progress).',
        data: tx,
      };
    }

    if (
      tx.status !== TransactionStatus.QC_VEHICLE_PENDING &&
      tx.status !== TransactionStatus.QC_RETEST_REQUIRED
    ) {
      throw new BadRequestException(
        `Tidak dapat memulai analisis produk pada transaksi dengan status ${tx.status}. Wajib berstatus QC_VEHICLE_PENDING atau QC_RETEST_REQUIRED.`,
      );
    }

    if (
      !tx.weighInAt ||
      tx.grossWeight == null ||
      Number(tx.grossWeight) <= 0
    ) {
      throw new BadRequestException(
        'Penimbangan masuk (weigh-in) belum selesai atau berat kotor (gross weight) tidak valid.',
      );
    }

    const now = new Date();
    const nextStatus = TransactionStatus.QC_VEHICLE_IN_PROGRESS;

    assertValidStatusTransition(tx.status, nextStatus);

    const updated = await this.prisma.$transaction(async (prismaTx) => {
      const claimed = await prismaTx.transaction.updateMany({
        where: { id: transactionId, revision: tx.revision },
        data: {
          status: nextStatus,
          revision: { increment: 1 },
          qcStartAt: tx.qcStartAt || now, // Never overwrite existing qcStartAt
        },
      });

      if (claimed.count === 0) {
        throw new ConflictException(
          'Transaksi telah diperbarui oleh pengguna lain (konflik konkurensi).',
        );
      }

      await prismaTx.transactionStatusHistory.create({
        data: {
          transactionId,
          oldStatus: tx.status,
          newStatus: nextStatus,
          changedById: user.id,
          notes:
            'Analis memulai pemeriksaan dan pengujian laboratorium (PA Start)',
        },
      });

      return prismaTx.transaction.findUnique({
        where: { id: transactionId },
        include: { productCatalog: true },
      });
    });

    await this.activityLogsService
      .logAction({
        userId: user.id,
        action: 'QC_PA_STARTED',
        module: 'QC',
        referenceId: transactionId,
        description: `Proses analisis laboratorium dimulai oleh ${user.email}`,
        status: 'SUCCESS',
      })
      .catch(() => {});

    return {
      success: true,
      message: 'Proses analisis laboratorium berhasil dimulai',
      data: updated || {
        ...tx,
        status: nextStatus,
        revision: tx.revision + 1,
        qcStartAt: tx.qcStartAt || now,
      },
    };
  }

  /**
   * Submit initial or retest lab analysis for a cargo transaction.
   * Server-authoritative evaluation:
   * 1. Product identity resolved from Transaction + ProductCatalog
   * 2. Test round derived from active analysis history
   * 3. Result and decision evaluated by server specifications
   * 4. Enforces process-scope authorization (GSP scope)
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

    if (tx.processType !== 'GSP') {
      throw new BadRequestException(
        'Analisis PA laboratorium hanya berlaku untuk transaksi proses GSP.',
      );
    }

    this.authorizationScopeService.assertProcessAccess(user, tx.processType);

    // Exempt products (Solar) must never undergo lab PA analysis
    const isExempt = isProductPaExempt(tx.productCatalog, {
      processType: tx.processType,
      cargoType: tx.cargoType,
      cargoSubType: tx.cargoSubType,
    });
    // Exempt products (Solar) must never undergo lab PA analysis (Section 23)
    if (
      tx.gspAnalysisProfile === GspAnalysisProfile.PA_EXEMPT ||
      tx.status === TransactionStatus.PA_NOT_REQUIRED ||
      isExempt
    ) {
      throw new BadRequestException(
        `Produk ini (${tx.cargoSubType || 'Solar'}) berizin bypass PA. Analisis PA tidak diperlukan.`,
      );
    }

    // ─── 1. Authoritative Product Identity ───
    const authoritativeCatalogId = tx.productCatalogId;
    if (
      dto.productCatalogId &&
      dto.productCatalogId !== authoritativeCatalogId
    ) {
      throw new BadRequestException(
        'Katalog produk pada payload tidak sesuai dengan transaksi aktif.',
      );
    }

    const authoritativeProductName =
      tx.productCatalog?.name || tx.cargoSubType || 'Unknown Product';
    const authoritativeProductCategory =
      tx.productCatalog?.category || tx.cargoType || 'Unknown Category';

    // Validate client-provided product identity if sent (reject mismatch)
    if (dto.productCategory) {
      const clientCat = dto.productCategory.toUpperCase();
      const authCat = authoritativeProductCategory.toUpperCase();
      const authSub = (tx.cargoSubType || '').toUpperCase();
      if (
        !authCat.includes(clientCat) &&
        !clientCat.includes(authCat) &&
        !authSub.includes(clientCat)
      ) {
        throw new BadRequestException(
          `Kategori produk (${dto.productCategory}) tidak sesuai dengan transaksi (${authoritativeProductCategory}).`,
        );
      }
    }

    if (dto.productName) {
      const clientName = dto.productName.toUpperCase().replace(/\s+/g, '');
      const authName = authoritativeProductName
        .toUpperCase()
        .replace(/\s+/g, '');
      const authSub = (tx.cargoSubType || '').toUpperCase().replace(/\s+/g, '');
      const normClient = clientName.replace(/EE/g, 'E');
      const normAuth = authName.replace(/EE/g, 'E');
      const normSub = authSub.replace(/EE/g, 'E');
      if (
        !normAuth.includes(normClient) &&
        !normClient.includes(normAuth) &&
        !normSub.includes(normClient) &&
        !normClient.includes(normSub)
      ) {
        throw new BadRequestException(
          `Nama produk (${dto.productName}) tidak sesuai dengan transaksi (${authoritativeProductName}).`,
        );
      }
    }

    // ─── 2. Authoritative Test Round Determination ───
    const activeHistory = await this.prisma.qcProductAnalysis.findMany({
      where: { transactionId, isVoided: false },
      orderBy: { testRound: 'desc' },
    });
    const historyList = activeHistory || [];
    const currentMaxRound =
      historyList.length > 0 ? historyList[0].testRound : 0;
    const authoritativeTestRound = currentMaxRound + 1;

    if (dto.testRound != null && dto.testRound !== authoritativeTestRound) {
      throw new BadRequestException(
        `Nomor ronde uji tidak valid (${dto.testRound}). Ronde yang diharapkan oleh sistem: ${authoritativeTestRound}`,
      );
    }

    // Validate status according to authoritative test round
    if (
      authoritativeTestRound === 1 &&
      tx.status !== TransactionStatus.QC_VEHICLE_PENDING &&
      tx.status !== TransactionStatus.QC_VEHICLE_IN_PROGRESS
    ) {
      throw new BadRequestException(
        `Analisis awal (Round 1) hanya dapat diproses saat status transaksi QC_VEHICLE_PENDING (saat ini: ${tx.status})`,
      );
    }

    if (
      authoritativeTestRound > 1 &&
      tx.status !== TransactionStatus.QC_RETEST_REQUIRED &&
      tx.status !== TransactionStatus.QC_VEHICLE_IN_PROGRESS
    ) {
      throw new BadRequestException(
        `Uji ulang (Round ${authoritativeTestRound}) hanya dapat diproses saat status transaksi QC_RETEST_REQUIRED atau QC_VEHICLE_IN_PROGRESS (saat ini: ${tx.status})`,
      );
    }

    // ─── 3. Server-Authoritative Result & Decision Evaluation ───
    const specStatus = this.checkSpecificationApprovalStatus(
      authoritativeProductCategory,
      authoritativeProductName,
    );

    let evalResult: {
      result: 'PASS' | 'REJECT';
      decision:
        'RELEASE' | 'RETEST_REQUIRED' | 'PENDING_DISPOSITION' | 'REJECT';
      notes?: string;
    };

    // ─── 3. Determine Evaluator by Snapshot Profile (Section 23) ───
    let targetProfile = tx.gspAnalysisProfile;

    // LEGACY COMPATIBILITY FALLBACK: for historical transactions where gspAnalysisProfile == null
    if (!targetProfile) {
      const isCoalLegacy =
        authoritativeProductCategory.toUpperCase().includes('COAL') ||
        authoritativeProductName.toUpperCase().includes('BATUBARA') ||
        (tx.cargoSubType || '').toUpperCase().includes('BATUBARA');

      const isPacLegacy =
        authoritativeProductName.toUpperCase().includes('PAC') ||
        authoritativeProductName.toUpperCase().includes('POLYCOR') ||
        authoritativeProductName.toUpperCase().includes('IPAC') ||
        (tx.cargoSubType || '').toUpperCase().includes('PAC');

      const isRapidKlenLegacy =
        authoritativeProductName.toUpperCase().includes('RAPID') ||
        authoritativeProductName.toUpperCase().includes('KLEN') ||
        authoritativeProductName.toUpperCase().includes('PRO-CIP') ||
        (tx.cargoSubType || '').toUpperCase().includes('RAPID') ||
        (tx.cargoSubType || '').toUpperCase().includes('KLEN');

      if (isCoalLegacy) targetProfile = GspAnalysisProfile.COAL_PA;
      else if (isPacLegacy) targetProfile = GspAnalysisProfile.PAC_PA;
      else if (isRapidKlenLegacy)
        targetProfile = GspAnalysisProfile.RAPID_KLEN_PA;
    }

    if (!targetProfile) {
      throw new BadRequestException(
        `Tidak dapat menentukan profil analisis laboratorium untuk produk '${authoritativeProductName}'.`,
      );
    }

    if ((targetProfile as any) === GspAnalysisProfile.PA_EXEMPT) {
      throw new BadRequestException(
        'Produk dengan profil PA_EXEMPT tidak dapat menjalankan analisis PA laboratorium.',
      );
    }

    const rawParams = (dto.parameters || {}) as any;

    if (targetProfile === GspAnalysisProfile.COAL_PA) {
      const coalSpecMeta = this.specProvider.getCoalSpec();

      evalResult = evaluateCoalAnalysis(
        {
          targetCalorie:
            tx.productCatalog?.code || tx.cargoSubType || undefined,
          totalMoisture: Number(
            rawParams.moisture ?? rawParams.totalMoisture ?? 0,
          ),
          testRound: authoritativeTestRound,
          sensoryPassed:
            rawParams.sensory === 'OK' ||
            rawParams.sensory === true ||
            rawParams.visual === 'OK' ||
            rawParams.sensoryPassed === true ||
            rawParams.sensory?.visual === true,
        },
        coalSpecMeta,
      );
    } else if (targetProfile === GspAnalysisProfile.PAC_PA) {
      const pacSpecMeta = this.specProvider.getPacSpec();

      evalResult = evaluatePacAnalysis(
        {
          sensory: {
            visual:
              rawParams.sensory?.visual ??
              (rawParams.visualAppearance
                ? !rawParams.visualAppearance.toLowerCase().includes('keruh')
                : rawParams.visual === 'OK' || rawParams.visual === true),
            odor:
              rawParams.sensory?.odor ??
              (rawParams.foreignMatters === 'NIL' ||
                rawParams.odor === 'OK' ||
                rawParams.odor === true ||
                rawParams.odor == null),
            packaging:
              rawParams.sensory?.packaging ??
              (rawParams.packagingCondition
                ? !rawParams.packagingCondition.toLowerCase().includes('rusak')
                : rawParams.packaging === 'OK' || rawParams.packaging === true),
          },
          ph: Number(rawParams.ph),
          density: Number(rawParams.density),
          aluminaContent:
            rawParams.aluminaContent != null
              ? Number(rawParams.aluminaContent)
              : rawParams.al2o3Content != null
                ? Number(rawParams.al2o3Content)
                : undefined,
        },
        authoritativeProductName,
        pacSpecMeta,
      );
    } else if (targetProfile === GspAnalysisProfile.RAPID_KLEN_PA) {
      const rkSpecMeta = this.specProvider.getRapidKlenSpec();

      evalResult = evaluateRapidKlenAnalysis(
        {
          sensory: {
            visual:
              rawParams.sensory?.visual ??
              (rawParams.visualAppearance
                ? !rawParams.visualAppearance.toLowerCase().includes('keruh')
                : rawParams.visual === 'OK' || rawParams.visual === true),
            packaging:
              rawParams.sensory?.packaging ??
              (rawParams.packagingCondition
                ? !rawParams.packagingCondition.toLowerCase().includes('rusak')
                : rawParams.packaging === 'OK' || rawParams.packaging === true),
          },
          alkalinityNa2O: Number(
            rawParams.alkalinityNa2O ?? rawParams.alkalinity ?? 0,
          ),
          alkalinityNaOH:
            rawParams.alkalinityNaOH != null
              ? Number(rawParams.alkalinityNaOH)
              : undefined,
          ph: Number(rawParams.ph),
          density: Number(rawParams.density),
        },
        authoritativeProductName,
        rkSpecMeta,
      );
    } else {
      // Fallback: Unverified product specification
      evalResult = {
        result: 'PASS',
        decision: 'PENDING_DISPOSITION',
        notes: `Produk ${authoritativeProductName} belum memiliki spesifikasi operasional teresahkan. Dialihkan ke PENDING_DISPOSITION.`,
      };
    }

    const serverQcResult: QcResult =
      evalResult.result === 'PASS' ? QcResult.PASS : QcResult.REJECT;

    const normalizedClientResult =
      dto.result === (QcResult.PASS as any) ||
      (dto.result as string) === 'PASSED'
        ? QcResult.PASS
        : dto.result === (QcResult.REJECT as any) ||
            (dto.result as string) === 'REJECTED'
          ? QcResult.REJECT
          : null;

    // Validate client submitted values if sent (reject forging/tampering)
    if (dto.result && normalizedClientResult !== serverQcResult) {
      throw new BadRequestException(
        `Hasil analisis client (${dto.result}) tidak sesuai dengan hasil evaluasi server (${serverQcResult}). Keputusan server bersifat otoritatif.`,
      );
    }

    if (
      dto.decision &&
      (dto.decision as string) !== (evalResult.decision as string)
    ) {
      throw new BadRequestException(
        `Keputusan analisis client (${dto.decision}) tidak sesuai dengan evaluasi spesifikasi server (${evalResult.decision}). Keputusan server bersifat otoritatif.`,
      );
    }

    const authoritativeDecision = evalResult.decision as AnalysisDecision;

    let nextStatus: TransactionStatus;
    switch (authoritativeDecision) {
      case AnalysisDecision.RELEASE:
        if (specStatus.approvalStatus !== 'APPROVED') {
          throw new BadRequestException(
            `Keputusan RELEASE otomatis ditolak: Spesifikasi operasional untuk ${authoritativeProductName} belum berstatus disahkan oleh QA/Utility (Status: ${specStatus.approvalStatus}).`,
          );
        }
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
        throw new BadRequestException(
          `Keputusan analisis tidak valid: ${authoritativeDecision}`,
        );
    }

    assertValidStatusTransition(tx.status, nextStatus);

    const now = new Date();
    await this.prisma.$transaction(async (prismaTx) => {
      // 1. Guard against duplicate active test rounds (Concurrency defense)
      const duplicateRound = await prismaTx.qcProductAnalysis.findFirst({
        where: {
          transactionId,
          testRound: authoritativeTestRound,
          isVoided: false,
        },
      });
      if (duplicateRound) {
        throw new ConflictException(
          `Ronde uji ${authoritativeTestRound} aktif sudah pernah dicatat untuk transaksi ini.`,
        );
      }

      if (!tx.qcStartAt) {
        this.logger.warn(
          `[submitProductAnalysis] Transaction ${transactionId} submitted without preceding startProductAnalysis event. Falling back qcStartAt to submission time.`,
        );
      }

      // 2. CAS claim on Transaction (Preserve existing qcStartAt if recorded at start event)
      const claimed = await prismaTx.transaction.updateMany({
        where: { id: transactionId, revision: dto.revision },
        data: {
          status: nextStatus,
          revision: { increment: 1 },
          qcStartAt: tx.qcStartAt || now,
          qcEndAt: now,
        },
      });

      if (claimed.count === 0) {
        throw new ConflictException(
          'Transaksi telah diperbarui oleh pengguna lain (konflik konkurensi)',
        );
      }

      // 3. Create authoritative QcProductAnalysis
      await prismaTx.qcProductAnalysis.create({
        data: {
          transactionId,
          productCatalogId: authoritativeCatalogId,
          testRound: authoritativeTestRound,
          productCategory: authoritativeProductCategory,
          productName: authoritativeProductName,
          parameters: dto.parameters as any,
          result: serverQcResult,
          status: authoritativeDecision,
          testedById: user.id,
          testedAt: now,
        },
      });

      await prismaTx.transactionStatusHistory.create({
        data: {
          transactionId,
          oldStatus: tx.status,
          newStatus: nextStatus,
          changedById: user.id,
          notes:
            dto.notes ||
            `Analisis PA Round ${authoritativeTestRound}: Evaluasi Otoritatif Server ${authoritativeDecision} (${serverQcResult})`,
        },
      });
    });

    await this.activityLogsService
      .logAction({
        userId: user.id,
        action: 'QC_PRODUCT_ANALYSIS_SUBMITTED',
        module: 'QC',
        referenceId: transactionId,
        description: `Analisis PA Round ${authoritativeTestRound} dievaluasi untuk ${authoritativeProductName}. Hasil: ${serverQcResult}, Keputusan: ${authoritativeDecision}`,
        status: 'SUCCESS',
      })
      .catch(() => {});

    return {
      success: true,
      message: `Analisis produk Round ${authoritativeTestRound} berhasil dicatat`,
      data: {
        transactionId,
        testRound: authoritativeTestRound,
        newStatus: nextStatus,
      },
    };
  }

  /**
   * Helper to check specification approval status.
   * Products without formal QA/Utility approval status CANNOT be automatically RELEASED.
   */
  checkSpecificationApprovalStatus(
    productCategory: string,
    productName?: string,
  ): {
    approvalStatus: string;
    documentSource: string;
  } {
    const cat = (productCategory || '').toUpperCase();
    const name = (productName || '').toUpperCase();

    if (
      cat === 'COAL' ||
      cat.includes('BATUBARA') ||
      name.includes('BATUBARA')
    ) {
      const spec = this.specProvider.getCoalSpec();
      return {
        approvalStatus: spec.approvalStatus,
        documentSource: spec.documentSource,
      };
    }
    if (name.includes('PAC')) {
      const spec = this.specProvider.getPacSpec();
      return {
        approvalStatus: spec.approvalStatus,
        documentSource: spec.documentSource,
      };
    }
    if (name.includes('RAPID') || name.includes('KLEN')) {
      const spec = this.specProvider.getRapidKlenSpec();
      return {
        approvalStatus: spec.approvalStatus,
        documentSource: spec.documentSource,
      };
    }
    return {
      approvalStatus: 'PENDING_SIGNOFF',
      documentSource: 'Unverified Product Specification',
    };
  }

  /**
   * Submit Four-Eyes Utility Disposition for out-of-spec products requiring management disposition.
   * Strictly enforces:
   * 1. Account must be active and not deleted
   * 2. Department must be UTILITY
   * 3. Explicit disposition authority (UTILITY_DISPOSITION_AUTHORITY)
   * 4. Multi-round Four-Eyes: Approver must NOT be any analyst on this transaction
   * 5. Target analysis must be active (isVoided: false) and in PENDING_DISPOSITION state
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

    if (tx.processType !== 'GSP') {
      throw new BadRequestException(
        'Disposisi Utility hanya berlaku untuk transaksi proses GSP.',
      );
    }

    this.authorizationScopeService.assertProcessAccess(user, tx.processType);

    if (tx.status !== TransactionStatus.WAITING_UTILITY_DISPOSITION) {
      throw new BadRequestException(
        `Disposisi Utility hanya dapat diberikan pada transaksi berstatus WAITING_UTILITY_DISPOSITION (saat ini: ${tx.status})`,
      );
    }

    // Only query active, non-voided analysis records
    const latestAnalysis = await this.prisma.qcProductAnalysis.findFirst({
      where: { transactionId, isVoided: false },
      orderBy: { testRound: 'desc' },
    });

    if (!latestAnalysis) {
      throw new NotFoundException(
        'Data analisis produk aktif tidak ditemukan untuk transaksi ini',
      );
    }

    if (
      latestAnalysis.status &&
      latestAnalysis.status !== 'PENDING_DISPOSITION'
    ) {
      throw new BadRequestException(
        `Disposisi Utility hanya dapat diproses jika status analisis PA terakhir adalah PENDING_DISPOSITION (saat ini: ${latestAnalysis.status})`,
      );
    }

    if (
      tx.productCatalogId &&
      latestAnalysis.productCatalogId &&
      latestAnalysis.productCatalogId !== tx.productCatalogId
    ) {
      throw new BadRequestException(
        'Katalog produk pada analisis PA tidak sesuai dengan transaksi aktif.',
      );
    }

    // 0. Commodity Scope Verification: Utility disposition is SOLELY authorized for Coal
    const isCoal =
      (tx.cargoType || '').toUpperCase().includes('COAL') ||
      (tx.cargoSubType || '').toUpperCase().includes('BATUBARA') ||
      (latestAnalysis.productCategory || '').toUpperCase().includes('COAL') ||
      (latestAnalysis.productName || '').toUpperCase().includes('BATUBARA');

    if (!isCoal) {
      throw new ForbiddenException(
        `Disposisi Utility hanya berwenang untuk komoditas Batubara. Komoditas kimia (${latestAnalysis.productName || tx.cargoSubType || 'Bahan Kimia'}) memerlukan pengesahan kewenangan terpisah (QA/QC Supervisor) yang saat ini berstatus PENDING_SIGNOFF (Open Governance Dependency).`,
      );
    }

    // 1. Verify user status and department
    const userRecord = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        role: true,
        department: true,
        area: true,
        isActive: true,
        isDeleted: true,
      },
    });

    if (!userRecord || !userRecord.isActive || userRecord.isDeleted) {
      throw new ForbiddenException(
        'Otoritas tidak memadai: Akun pengguna tidak aktif, tidak ditemukan, atau telah dinonaktifkan.',
      );
    }

    const isAuthorizedUtility =
      userRecord.department?.trim().toUpperCase() === 'UTILITY';

    if (!isAuthorizedUtility) {
      throw new ForbiddenException(
        'Otoritas tidak memadai: Akun tanpa kewenangan operasional Departemen Utility ditolak untuk memberikan disposisi teknis. Role Admin sistem tidak otomatis memiliki wewenang pejabat Utility.',
      );
    }

    // 2. Verify explicit disposition authority
    let hasExplicitPermission =
      Boolean(userRecord.area?.includes('UTILITY_DISPOSITION_AUTHORITY')) ||
      Boolean(userRecord.area?.includes('DISPOSITION_APPROVER')) ||
      Boolean(userRecord.area?.includes('SECTION_HEAD'));

    if (!hasExplicitPermission) {
      const setting = await this.prisma.appSetting.findUnique({
        where: { key: 'UTILITY_DISPOSITION_AUTHORIZED_USERS' },
      });
      if (setting && setting.value) {
        const authorizedList = setting.value
          .split(',')
          .map((s) => s.trim().toLowerCase());
        if (
          authorizedList.includes(userRecord.id.toLowerCase()) ||
          (user.email && authorizedList.includes(user.email.toLowerCase()))
        ) {
          hasExplicitPermission = true;
        }
      }
    }

    if (!hasExplicitPermission) {
      throw new ForbiddenException(
        'Otoritas tidak memadai: Akun Departemen Utility tidak memiliki izin disposisi teknis yang ditetapkan secara eksplisit (memerlukan hak UTILITY_DISPOSITION_AUTHORITY).',
      );
    }

    // 3. Four-Eyes Principle: Approver must NOT be any analyst who tested on any active round of this tx
    const allAnalyses = await this.prisma.qcProductAnalysis.findMany({
      where: { transactionId, isVoided: false },
      select: { id: true, testRound: true, testedById: true },
    });

    const wasAnalystInAnyRound = allAnalyses.some(
      (a) => a.testedById && a.testedById === user.id,
    );
    if (wasAnalystInAnyRound) {
      throw new ForbiddenException(
        'Prinsip Four-Eyes: Penyetuju disposisi tidak boleh merupakan analis yang pernah menguji sampel pada ronde mana pun dalam transaksi ini.',
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
   * Enforces role and process scope authorization.
   */
  async getAnalysisHistory(transactionId: string, user: JwtPayloadUser) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      select: { id: true, processType: true },
    });

    if (!tx) {
      throw new NotFoundException('Transaksi tidak ditemukan');
    }

    if (tx.processType !== 'GSP') {
      throw new BadRequestException(
        'Analisis PA laboratorium hanya berlaku untuk transaksi proses GSP.',
      );
    }

    this.authorizationScopeService.assertProcessAccess(user, tx.processType);

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
