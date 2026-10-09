import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';
import {
  SubmitProductAnalysisDto,
  AnalysisDecision,
} from './dto/submit-product-analysis.dto';
import {
  QcResult,
  TransactionStatus,
  GspAnalysisProfile,
} from '@prisma/client';
import {
  OPERATIONAL_COAL_SPEC_METADATA,
  SpecificationRuleStatus,
  CoalVisualParameters,
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

/**
 * Strictly parses and validates that an input parameter is a valid finite number.
 * Explicitly rejects:
 * - null or undefined
 * - boolean values (true, false)
 * - arrays (e.g. [40], ["40"])
 * - objects (e.g. { value: 40 })
 * - hexadecimal strings (e.g. "0x28", "0x2F")
 * - octal/binary strings (e.g. "0o10", "0b101")
 * - whitespace-only or empty strings
 * - non-numeric strings
 * - non-finite strings ("Infinity", "-Infinity", "NaN")
 * - scientific/exponent notation (e.g. "1e2", "4.6e1", "1e309")
 *
 * Accepts ONLY:
 * - JavaScript finite numbers (typeof value === 'number' && Number.isFinite(value) && !Number.isNaN(value))
 * - Standard decimal strings (e.g. "40", "40.5", "0.14", ".5", "-5")
 */
export function parseStrictFiniteNumber(
  value: unknown,
  fieldName: string,
): number {
  if (value === null || value === undefined) {
    throw new BadRequestException(
      `Parameter '${fieldName}' wajib diisi dan harus berupa angka numerik finite valid.`,
    );
  }

  if (typeof value === 'boolean') {
    throw new BadRequestException(
      `Parameter '${fieldName}' tidak boleh bertipe boolean. Nilai harus berupa angka numerik finite valid.`,
    );
  }

  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new BadRequestException(
      `Parameter '${fieldName}' tidak valid (tipe data ${typeof value}). Nilai harus berupa angka numerik finite valid.`,
    );
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Number.isNaN(value)) {
      throw new BadRequestException(
        `Parameter '${fieldName}' harus berupa angka numerik finite valid (tidak boleh non-finite, NaN, atau overflow).`,
      );
    }
    return value;
  }

  // At this point, typeof value === 'string'
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new BadRequestException(
      `Parameter '${fieldName}' tidak boleh kosong dan harus berupa angka numerik finite valid.`,
    );
  }

  if (/^[+-]?infinity$/i.test(trimmed) || trimmed.toLowerCase() === 'nan') {
    throw new BadRequestException(
      `Parameter '${fieldName}' tidak valid (non-finite atau NaN). Nilai harus berupa angka finite.`,
    );
  }

  // Reject hexadecimal ("0x..."), octal ("0o..."), binary ("0b..."), scientific notation ("1e2"), and any non-decimal representations
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmed)) {
    throw new BadRequestException(
      `Parameter '${fieldName}' tidak valid ('${value}'). Format harus berupa angka desimal standar (tidak mendukung notasi ilmiah/eksponensial atau heksadesimal).`,
    );
  }

  const num = Number(trimmed);
  if (!Number.isFinite(num) || Number.isNaN(num)) {
    throw new BadRequestException(
      `Parameter '${fieldName}' harus berupa angka numerik finite valid (tidak boleh non-finite, NaN, atau overflow).`,
    );
  }

  return num;
}

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
    const specStatus = this.getSpecificationRuleStatus(
      authoritativeProductCategory,
      authoritativeProductName,
    );

    let evalResult: {
      result?: 'PASS' | 'REJECT';
      decision?:
        'RELEASE' | 'RETEST_REQUIRED' | 'PENDING_DISPOSITION' | 'REJECT';
      notes?: string;
      isConfigured?: boolean;
      error?: string;
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

      const visualInput: CoalVisualParameters | undefined =
        typeof rawParams.visual === 'object' && rawParams.visual !== null
          ? rawParams.visual
          : rawParams.kondisi ||
              rawParams.warna ||
              rawParams.levelRank ||
              rawParams.kilap ||
              rawParams.bahanPengotor
            ? {
                kondisi: rawParams.kondisi,
                warna: rawParams.warna,
                levelRank: rawParams.levelRank,
                kilap: rawParams.kilap,
                bahanPengotor: rawParams.bahanPengotor,
              }
            : undefined;

      const rawMoistureVal = rawParams.moisture ?? rawParams.totalMoisture;
      if (rawMoistureVal === undefined || rawMoistureVal === null) {
        throw new BadRequestException({
          message:
            'Kadar air (total moisture) batubara wajib diisi dan berupa angka valid antara 0% dan 100%.',
          error: 'INVALID_MOISTURE_MEASUREMENT',
        });
      }

      if (typeof rawMoistureVal === 'boolean') {
        throw new BadRequestException({
          message:
            'Kadar air (total moisture) batubara tidak boleh bertipe boolean. Nilai harus berupa angka finite antara 0% dan 100%.',
          error: 'INVALID_MOISTURE_MEASUREMENT',
        });
      }

      if (
        typeof rawMoistureVal !== 'number' &&
        typeof rawMoistureVal !== 'string'
      ) {
        throw new BadRequestException({
          message:
            'Kadar air (total moisture) batubara tidak valid. Nilai harus berupa angka finite antara 0% dan 100%.',
          error: 'INVALID_MOISTURE_MEASUREMENT',
        });
      }

      let parsedMoisture: number;

      if (typeof rawMoistureVal === 'number') {
        if (!Number.isFinite(rawMoistureVal) || Number.isNaN(rawMoistureVal)) {
          throw new BadRequestException({
            message:
              'Kadar air (total moisture) batubara harus berupa angka finite valid (tidak boleh non-finite atau NaN).',
            error: 'INVALID_MOISTURE_MEASUREMENT',
          });
        }
        parsedMoisture = rawMoistureVal;
      } else {
        const trimmed = rawMoistureVal.trim();
        if (trimmed === '') {
          throw new BadRequestException({
            message:
              'Kadar air (total moisture) batubara wajib diisi dan berupa angka valid antara 0% dan 100%.',
            error: 'INVALID_MOISTURE_MEASUREMENT',
          });
        }
        if (
          /^[+-]?infinity$/i.test(trimmed) ||
          trimmed.toLowerCase() === 'nan'
        ) {
          throw new BadRequestException({
            message:
              'Kadar air (total moisture) batubara harus berupa angka finite valid (tidak boleh non-finite atau NaN).',
            error: 'INVALID_MOISTURE_MEASUREMENT',
          });
        }

        // Reject hex ("0x..."), octal ("0o..."), binary ("0b..."), scientific notation ("1e2"), and any non-decimal representations
        if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmed)) {
          throw new BadRequestException({
            message: `Kadar air (total moisture) batubara ('${rawMoistureVal}') tidak valid. Format harus berupa angka desimal standar (tidak mendukung notasi ilmiah/eksponensial atau heksadesimal).`,
            error: 'INVALID_MOISTURE_MEASUREMENT',
          });
        }

        const num = Number(trimmed);
        if (!Number.isFinite(num) || Number.isNaN(num)) {
          throw new BadRequestException({
            message:
              'Kadar air (total moisture) batubara harus berupa angka finite valid (tidak boleh non-finite, NaN, atau overflow).',
            error: 'INVALID_MOISTURE_MEASUREMENT',
          });
        }
        parsedMoisture = num;
      }

      if (parsedMoisture < 0 || parsedMoisture > 100) {
        throw new BadRequestException({
          message: `Kadar air (total moisture) batubara (${rawMoistureVal}) tidak valid. Nilai harus berupa angka finite antara 0% dan 100%.`,
          error: 'INVALID_MOISTURE_MEASUREMENT',
        });
      }

      evalResult = evaluateCoalAnalysis(
        {
          targetCalorie: rawParams.calorieBand || undefined,
          totalMoisture: parsedMoisture,
          testRound: authoritativeTestRound,
          sensoryPassed: rawParams.sensoryPassed,
          visualPassed: rawParams.visualPassed,
          visual: visualInput,
        },
        coalSpecMeta,
      );
    } else if (targetProfile === GspAnalysisProfile.PAC_PA) {
      const pacSpecMeta = this.specProvider.getPacSpec();

      const ph = parseStrictFiniteNumber(rawParams.ph, 'ph');
      const density = parseStrictFiniteNumber(rawParams.density, 'density');
      const aluminaContent =
        rawParams.aluminaContent != null && rawParams.aluminaContent !== ''
          ? parseStrictFiniteNumber(rawParams.aluminaContent, 'aluminaContent')
          : undefined;

      evalResult = evaluatePacAnalysis(
        {
          sensory: {
            visual: rawParams.sensory?.visual,
            foreignMatters: rawParams.sensory?.foreignMatters,
            packagingLabel: rawParams.sensory?.packagingLabel,
          },
          ph,
          density,
          aluminaContent,
        },
        authoritativeProductName,
        pacSpecMeta,
      );
    } else if (targetProfile === GspAnalysisProfile.RAPID_KLEN_PA) {
      const rkSpecMeta = this.specProvider.getRapidKlenSpec();

      const alkalinityNa2O = parseStrictFiniteNumber(
        rawParams.alkalinityNa2O ?? rawParams.alkalinityNa2o,
        'alkalinityNa2O',
      );
      const alkalinityNaOH = parseStrictFiniteNumber(
        rawParams.alkalinityNaOH ?? rawParams.alkalinityNaoh,
        'alkalinityNaOH',
      );
      const ph = parseStrictFiniteNumber(rawParams.ph, 'ph');
      const density = parseStrictFiniteNumber(rawParams.density, 'density');

      evalResult = evaluateRapidKlenAnalysis(
        {
          sensory: {
            visual: rawParams.sensory?.visual,
            foreignMatters: rawParams.sensory?.foreignMatters,
            packagingLabel: rawParams.sensory?.packagingLabel,
          },
          alkalinityNa2O,
          alkalinityNaOH,
          ph,
          density,
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

    if (evalResult.error === 'INVALID_MOISTURE_MEASUREMENT') {
      throw new BadRequestException({
        message:
          evalResult.notes ||
          'Pengukuran kadar air batubara tidak valid (wajib numerik finite 0-100%).',
        error: 'INVALID_MOISTURE_MEASUREMENT',
      });
    }

    if (evalResult.isConfigured === false) {
      if (targetProfile === GspAnalysisProfile.COAL_PA) {
        await this.activityLogsService
          .logAction({
            userId: user.id,
            action: 'COAL_SPEC_NOT_CONFIGURED',
            module: 'QC',
            referenceId: transactionId,
            description: `Spesifikasi Coal tidak terkonfigurasi untuk calorieBand: '${rawParams.calorieBand || 'MISSING'}'. Operator: ${user.email}`,
            status: 'FAILED',
          })
          .catch(() => {});
      }
      throw new UnprocessableEntityException({
        error: 'SPEC_NOT_CONFIGURED',
        message:
          evalResult.notes ||
          `Spesifikasi mutu untuk produk '${authoritativeProductName}' belum dikonfigurasi.`,
      });
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
        nextStatus = TransactionStatus.QC_VEHICLE_PASSED;
        break;
      case AnalysisDecision.REJECT:
        nextStatus = TransactionStatus.QC_VEHICLE_REJECTED;
        break;
      case AnalysisDecision.RETEST_REQUIRED:
        nextStatus = TransactionStatus.QC_RETEST_REQUIRED;
        break;
      case AnalysisDecision.PENDING_DISPOSITION:
        // NEW canonical GSP transactions must NEVER enter WAITING_UTILITY_DISPOSITION
        // Fail-closed governance blocker without routing to Utility disposition
        throw new BadRequestException(
          `Pengujian laboratorium untuk ${authoritativeProductName} tidak dapat diproses rilis: Spesifikasi operasional berstatus ${specStatus.ruleStatus} (${specStatus.documentSource}). Kebijakan mutu memblokir rilis muatan tanpa spesifikasi teresahkan.`,
        );
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
   * Helper to get specification rule status.
   * Authoritative operational rules operate under ACTIVE_CONFIGURED.
   */
  getSpecificationRuleStatus(
    productCategory: string,
    productName?: string,
  ): {
    ruleStatus: SpecificationRuleStatus;
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
        ruleStatus: spec.ruleStatus,
        documentSource: spec.documentSource,
      };
    }
    if (name.includes('PAC')) {
      const spec = this.specProvider.getPacSpec();
      return {
        ruleStatus: spec.ruleStatus,
        documentSource: spec.documentSource,
      };
    }
    if (name.includes('RAPID') || name.includes('KLEN')) {
      const spec = this.specProvider.getRapidKlenSpec();
      return {
        ruleStatus: spec.ruleStatus,
        documentSource: spec.documentSource,
      };
    }
    return {
      ruleStatus: 'UNCONFIGURED',
      documentSource: 'Unverified Product Specification',
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
