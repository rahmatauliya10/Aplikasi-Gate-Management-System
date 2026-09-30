/**
 * Reference Quality Specifications & Evaluation Rules for Boiler Coal (Batubara)
 * Status: Reference Benchmark / Purchase Contract Tiers (Pending Formal QA/Utility Department Signoff)
 *
 * IMPORTANT AUDIT NOTE:
 * The calorie tiers (GAR 3800 - GAR 5500+) and Total Moisture thresholds (26.0% - 36.0%)
 * represent supplier contract benchmarks and testing fixtures. They must NOT be treated as
 * permanent company-wide SOP rules without formal signoff from QA and Utility Section Heads.
 * In production, thresholds should be dynamically loaded from approved ProductCatalog records.
 */

export interface CoalCalorieTierSpec {
  tierCode: string;
  name: string;
  nominalKcal: number;
  maxTotalMoisturePct: number; // Rejection/Retest threshold
  standardTolerancePct: number; // Permissible variance before disposition
  standardMethod: string;
}

export const COAL_CALORIE_SPECIFICATIONS: Record<string, CoalCalorieTierSpec> = {
  '3800': {
    tierCode: 'GAR_3800',
    name: 'Batubara GAR 3800 (Lignite/Low)',
    nominalKcal: 3800,
    maxTotalMoisturePct: 36.0,
    standardTolerancePct: 1.0,
    standardMethod: 'ASTM D3302',
  },
  '4200': {
    tierCode: 'GAR_4200',
    name: 'Batubara GAR 4200 (Low-Mid Calorie)',
    nominalKcal: 4200,
    maxTotalMoisturePct: 33.0,
    standardTolerancePct: 1.0,
    standardMethod: 'ASTM D3302',
  },
  '4800': {
    tierCode: 'GAR_4800',
    name: 'Batubara GAR 4800 (Mid Calorie)',
    nominalKcal: 4800,
    maxTotalMoisturePct: 30.0,
    standardTolerancePct: 0.8,
    standardMethod: 'ASTM D3302',
  },
  '5000': {
    tierCode: 'GAR_5000',
    name: 'Batubara GAR 5000 (High-Mid Calorie)',
    nominalKcal: 5000,
    maxTotalMoisturePct: 28.0,
    standardTolerancePct: 0.8,
    standardMethod: 'ASTM D3302',
  },
  '5500': {
    tierCode: 'GAR_5500',
    name: 'Batubara GAR 5500+ (High Calorie Contract)',
    nominalKcal: 5500,
    maxTotalMoisturePct: 26.0,
    standardTolerancePct: 0.5,
    standardMethod: 'ASTM D3302',
  },
};

/**
 * Default standard calorie tier if not specified in supplier contract.
 */
export const DEFAULT_COAL_CALORIE = '4200';

/**
 * Get coal moisture limit for a given target calorie.
 */
export function getCoalMoistureLimit(targetCalorie?: string | number): number {
  const key = targetCalorie ? String(targetCalorie).trim() : DEFAULT_COAL_CALORIE;
  const spec = COAL_CALORIE_SPECIFICATIONS[key];
  if (spec) {
    return spec.maxTotalMoisturePct;
  }
  // Default fallback to 33.0% (GAR 4200)
  return 33.0;
}

/**
 * Evaluate coal test result against operational specifications.
 */
export function evaluateCoalAnalysis(params: {
  targetCalorie?: string | number;
  totalMoisture: number;
  testRound: number;
  sensoryPassed: boolean;
}): {
  result: 'PASS' | 'REJECT';
  decision: 'RELEASE' | 'RETEST_REQUIRED' | 'PENDING_DISPOSITION' | 'REJECT';
  maxAllowedMoisture: number;
  isWithinSpec: boolean;
  notes: string;
} {
  const maxAllowedMoisture = getCoalMoistureLimit(params.targetCalorie);
  const isWithinSpec = params.sensoryPassed && params.totalMoisture <= maxAllowedMoisture;

  if (isWithinSpec) {
    return {
      result: 'PASS',
      decision: 'RELEASE',
      maxAllowedMoisture,
      isWithinSpec: true,
      notes: `Lulus spesifikasi kadar air (Hasil: ${params.totalMoisture}% <= Max: ${maxAllowedMoisture}%)`,
    };
  }

  // If sensory failed, directly reject
  if (!params.sensoryPassed) {
    return {
      result: 'REJECT',
      decision: 'REJECT',
      maxAllowedMoisture,
      isWithinSpec: false,
      notes: 'Pemeriksaan sensori/visual batubara tidak memenuhi standar kebersihan/homogenitas.',
    };
  }

  // Moisture exceeded
  if (params.testRound === 1) {
    return {
      result: 'REJECT',
      decision: 'RETEST_REQUIRED',
      maxAllowedMoisture,
      isWithinSpec: false,
      notes: `Kadar air melebihi batas spesifikasi (${params.totalMoisture}% > ${maxAllowedMoisture}%). Diperlukan uji ulang (Round 2).`,
    };
  }

  // Round 2 or more still exceeded: escalate to Utility disposition
  return {
    result: 'REJECT',
    decision: 'PENDING_DISPOSITION',
    maxAllowedMoisture,
    isWithinSpec: false,
    notes: `Kadar air uji ulang tetap melebihi batas spesifikasi (${params.totalMoisture}% > ${maxAllowedMoisture}%). Eskalasi ke Disposisi Utility.`,
  };
}
