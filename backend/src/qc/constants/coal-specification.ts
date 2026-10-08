/**
 * Reference Quality Specifications & Evaluation Rules for Boiler Coal (Batubara)
 * Status: ACTIVE_CONFIGURED (Spec Rev 2.1)
 */

export type SpecificationRuleStatus =
  'ACTIVE_CONFIGURED' | 'TEST_FIXTURE' | 'UNCONFIGURED';

export interface SpecificationMetadata {
  version: string;
  documentSource: string;
  ruleStatus: SpecificationRuleStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  notes: string;
}

export const OPERATIONAL_COAL_SPEC_METADATA: SpecificationMetadata = {
  version: '2026.1-active',
  documentSource: 'Operational Lab Benchmark (Rev 2.1)',
  ruleStatus: 'ACTIVE_CONFIGURED',
  approvedBy: null,
  approvedAt: null,
  notes:
    'Authoritative operational rule for boiler coal testing under Spec Rev 2.1.',
};

export const TEST_FIXTURE_COAL_SPEC_METADATA: SpecificationMetadata = {
  version: 'test-fixture-1.0',
  documentSource:
    'Test Harness Fixture (Simulated Rule for Automated Test Execution)',
  ruleStatus: 'TEST_FIXTURE',
  approvedBy: 'QA_MOCK_LEAD',
  approvedAt: '2026-09-30T00:00:00.000Z',
  notes: 'Test fixture for deterministic unit test validation.',
};

export interface CoalCalorieBandSpec {
  bandCode: string;
  name: string;
  maxTotalMoisturePct: number;
}

export const CONFIGURED_COAL_CALORIE_BANDS: Record<
  string,
  CoalCalorieBandSpec
> = {
  COAL_5600_6000: {
    bandCode: 'COAL_5600_6000',
    name: 'Batubara Kalori 5600 - 6000',
    maxTotalMoisturePct: 33.0,
  },
  COAL_GT_6000: {
    bandCode: 'COAL_GT_6000',
    name: 'Batubara Kalori > 6000',
    maxTotalMoisturePct: 25.0,
  },
};

export interface CoalVisualParameters {
  kondisi: string;
  warna: string;
  levelRank: string;
  kilap: string;
  bahanPengotor: string;
}

export function validateCoalVisual(v?: CoalVisualParameters | null): boolean {
  if (!v) return false;
  const isKondisiOk = v.kondisi === 'Kering (Tidak Basah)';
  const isWarnaOk = ['Hitam', 'Hitam Kecoklatan', 'Coklat'].includes(v.warna);
  const isRankOk = [
    'High Rank Coal',
    'Medium Rank Coal',
    'Low Rank Coal',
  ].includes(v.levelRank);
  const isKilapOk = [
    'Hitam Mengkilap',
    'Hitam Kecoklatan',
    'Mudah Lapuk',
  ].includes(v.kilap);
  const isPengotorOk =
    v.bahanPengotor === 'Tidak ada kontaminasi batuan maupun tanah';
  return isKondisiOk && isWarnaOk && isRankOk && isKilapOk && isPengotorOk;
}

export interface EvaluateCoalAnalysisParams {
  calorieBand?: string;
  targetCalorie?: string | number;
  totalMoisture: number;
  testRound: number;
  visual?: CoalVisualParameters;
  sensoryPassed?: boolean;
  visualPassed?: boolean;
}

export interface CoalEvaluationResult {
  isConfigured: boolean;
  error?: string;
  result?: 'PASS' | 'REJECT';
  decision?: 'RELEASE' | 'RETEST_REQUIRED' | 'REJECT';
  maxAllowedMoisture?: number;
  isWithinSpec?: boolean;
  visualPassed?: boolean;
  moisturePassed?: boolean;
  specMetadata?: SpecificationMetadata;
  ruleStatus?: SpecificationRuleStatus;
  documentSource?: string;
  notes?: string;
}

/**
 * Evaluate coal test result against specifications and approval governance.
 * Canonical GSP Coal flow:
 * - Visual OK + Moisture OK -> PASS / RELEASE -> QC_VEHICLE_PASSED
 * - ANY OOS Round 1 (Visual OOS, Moisture OOS, or both) -> REJECT / RETEST_REQUIRED -> QC_RETEST_REQUIRED
 * - ANY OOS Round 2 -> REJECT / REJECT -> QC_VEHICLE_REJECTED
 * Client-supplied visualPassed / sensoryPassed NEVER authorizes PASS.
 */
export function evaluateCoalAnalysis(
  params: EvaluateCoalAnalysisParams,
  specMetadata: SpecificationMetadata = OPERATIONAL_COAL_SPEC_METADATA,
): CoalEvaluationResult {
  const bandKey = (
    params.calorieBand ||
    (params.targetCalorie ? String(params.targetCalorie) : '')
  ).trim();
  const configuredBand = CONFIGURED_COAL_CALORIE_BANDS[bandKey];

  if (!configuredBand) {
    return {
      isConfigured: false,
      error: 'SPEC_NOT_CONFIGURED',
      maxAllowedMoisture: 0,
      isWithinSpec: false,
      specMetadata,
      ruleStatus: specMetadata.ruleStatus,
      documentSource: specMetadata.documentSource,
      notes: `Batas spesifikasi untuk kalori '${bandKey}' tidak terkonfigurasi.`,
    };
  }

  const maxAllowedMoisture = configuredBand.maxTotalMoisturePct;
  const visualPassed = validateCoalVisual(params.visual);
  const moisturePassed = params.totalMoisture <= maxAllowedMoisture;
  const isWithinSpec = visualPassed && moisturePassed;

  if (isWithinSpec) {
    return {
      isConfigured: true,
      result: 'PASS',
      decision: 'RELEASE',
      maxAllowedMoisture,
      isWithinSpec: true,
      visualPassed: true,
      moisturePassed: true,
      specMetadata,
      ruleStatus: specMetadata.ruleStatus,
      documentSource: specMetadata.documentSource,
      notes: `Lulus spesifikasi kadar air batubara (${params.totalMoisture}% <= Max: ${maxAllowedMoisture}%) dan parameter visual memenuhi standar faktual pada Round ${params.testRound}.`,
    };
  }

  if (params.testRound === 1) {
    return {
      isConfigured: true,
      result: 'REJECT',
      decision: 'RETEST_REQUIRED',
      maxAllowedMoisture,
      isWithinSpec: false,
      visualPassed,
      moisturePassed,
      specMetadata,
      ruleStatus: specMetadata.ruleStatus,
      documentSource: specMetadata.documentSource,
      notes:
        !visualPassed && !moisturePassed
          ? `Kadar air (${params.totalMoisture}% > ${maxAllowedMoisture}%) dan pemeriksaan visual tidak memenuhi spesifikasi. Diperlukan uji ulang (Round 2).`
          : !visualPassed
            ? 'Pemeriksaan visual/sensori batubara tidak memenuhi standar faktual. Diperlukan uji ulang (Round 2).'
            : `Kadar air melebihi batas spesifikasi (${params.totalMoisture}% > ${maxAllowedMoisture}%). Diperlukan uji ulang (Round 2).`,
    };
  }

  return {
    isConfigured: true,
    result: 'REJECT',
    decision: 'REJECT',
    maxAllowedMoisture,
    isWithinSpec: false,
    visualPassed,
    moisturePassed,
    specMetadata,
    ruleStatus: specMetadata.ruleStatus,
    documentSource: specMetadata.documentSource,
    notes:
      !visualPassed && !moisturePassed
        ? `Kadar air (${params.totalMoisture}% > ${maxAllowedMoisture}%) dan pemeriksaan visual pada uji ulang Round ${params.testRound} tetap tidak memenuhi spesifikasi. Muatan ditolak (QC_VEHICLE_REJECTED).`
        : !visualPassed
          ? `Pemeriksaan visual/sensori batubara pada uji ulang Round ${params.testRound} tetap tidak memenuhi standar. Muatan ditolak (QC_VEHICLE_REJECTED).`
          : `Kadar air uji ulang Round ${params.testRound} tetap melebihi batas spesifikasi (${params.totalMoisture}% > ${maxAllowedMoisture}%). Muatan ditolak (QC_VEHICLE_REJECTED).`,
  };
}
