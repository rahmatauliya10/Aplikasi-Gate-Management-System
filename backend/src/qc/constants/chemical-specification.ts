/**
 * Reference Quality Specifications & Evaluation Rules for Chemicals (PAC & Rapid Klen CIP)
 * Status: ACTIVE_CONFIGURED (Spec Rev 2.1)
 */

import { SpecificationRuleStatus } from './coal-specification';

export interface ChemicalSpecificationMetadata {
  version: string;
  documentSource: string;
  ruleStatus: SpecificationRuleStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  minOperator: 'GT' | 'GTE';
  notes: string;
}

export const OPERATIONAL_PAC_SPEC_METADATA: ChemicalSpecificationMetadata = {
  version: '2026.1-active',
  documentSource: 'Operational Lab Benchmark (Rev 2.1)',
  ruleStatus: 'ACTIVE_CONFIGURED',
  approvedBy: null,
  approvedAt: null,
  minOperator: 'GTE',
  notes:
    'Authoritative operational rule for PAC chemical testing under Spec Rev 2.1.',
};

export const RAPID_KLEN_DOC_STRICT_GT_METADATA: ChemicalSpecificationMetadata =
  {
    version: '2026.1-active',
    documentSource: 'Operational Lab Benchmark (Rev 2.1 - Strict GT)',
    ruleStatus: 'ACTIVE_CONFIGURED',
    approvedBy: null,
    approvedAt: null,
    minOperator: 'GT',
    notes:
      'Document explicitly specifies strict greater-than (>). Authoritative operational rule for Rapid Klen under Spec Rev 2.1.',
  };

export const RAPID_KLEN_DOC_STANDARD_GTE_METADATA: ChemicalSpecificationMetadata =
  {
    version: 'test-fixture-standard-gte',
    documentSource:
      'QA Harmonized CIP Technical Specification Doc #CIP-HARM-02 (Specifies standard GTE >= 35.0%)',
    ruleStatus: 'TEST_FIXTURE',
    approvedBy: 'QA_HEAD_SIMULATED',
    approvedAt: '2026-09-30T00:00:00.000Z',
    minOperator: 'GTE',
    notes: 'Document explicitly specifies greater-than-or-equal (>= 35.0%).',
  };

export const OPERATIONAL_RAPID_KLEN_SPEC_METADATA: ChemicalSpecificationMetadata =
  RAPID_KLEN_DOC_STRICT_GT_METADATA;

export const TEST_FIXTURE_PAC_SPEC_METADATA: ChemicalSpecificationMetadata = {
  version: 'test-fixture-1.0',
  documentSource: 'QA Approved Test Fixture (Simulated)',
  ruleStatus: 'TEST_FIXTURE',
  approvedBy: 'QA_HEAD_SIMULATED',
  approvedAt: '2026-09-30T00:00:00.000Z',
  minOperator: 'GTE',
  notes: 'Simulated test fixture for automated testing.',
};

export const TEST_FIXTURE_RAPID_KLEN_STRICT_GT: ChemicalSpecificationMetadata =
  {
    version: 'test-fixture-strict-gt',
    documentSource: 'QA Approved Test Fixture with strict GT (> 35.0%)',
    ruleStatus: 'TEST_FIXTURE',
    approvedBy: 'QA_HEAD_SIMULATED',
    approvedAt: '2026-09-30T00:00:00.000Z',
    minOperator: 'GT',
    notes: 'Simulated test fixture specifying strict operator GT.',
  };

export const TEST_FIXTURE_RAPID_KLEN_STANDARD_GTE: ChemicalSpecificationMetadata =
  {
    version: 'test-fixture-standard-gte',
    documentSource: 'QA Approved Test Fixture with standard GTE (>= 35.0%)',
    ruleStatus: 'TEST_FIXTURE',
    approvedBy: 'QA_HEAD_SIMULATED',
    approvedAt: '2026-09-30T00:00:00.000Z',
    minOperator: 'GTE',
    notes: 'Simulated test fixture specifying standard operator GTE.',
  };

export const TEST_FIXTURE_RAPID_KLEN_SPEC_METADATA: ChemicalSpecificationMetadata =
  TEST_FIXTURE_RAPID_KLEN_STANDARD_GTE;

export interface PacSensoryParameters {
  visual: string | boolean;
  foreignMatters?: string | boolean;
  packagingLabel?: string | boolean;
  odor?: string | boolean;
  packaging?: string | boolean;
}

export interface PacAnalysisParameters {
  sensory: PacSensoryParameters;
  ph: number;
  density: number;
  aluminaContent?: number | null;
}

export interface RapidKlenSensoryParameters {
  visual: string | boolean;
  foreignMatters?: string | boolean;
  packagingLabel?: string | boolean;
  packaging?: string | boolean;
}

export interface RapidKlenAnalysisParameters {
  sensory: RapidKlenSensoryParameters;
  alkalinityNa2O: number;
  alkalinityNaOH: number;
  ph: number;
  density: number;
}

export interface ChemicalEvaluationResult {
  productName: string;
  isCompliant: boolean;
  result: 'PASS' | 'REJECT';
  decision: 'RELEASE' | 'REJECT' | 'PENDING_DISPOSITION';
  specMetadata: ChemicalSpecificationMetadata;
  violations: string[];
  summary: string;
}

/**
 * PAC Specification Thresholds (SOP-GSP-2026.1):
 * - pH: 3.50 - 5.00 (inclusive)
 * - Density: 1.170 - 1.260 g/mL (inclusive)
 * - Al2O3: Informational only (not participating in compliance)
 * - Sensory: Visual Kuning/Coklat Jernih, Foreign Matters Tidak ada kontaminasi, Kemasan & label tidak rusak
 */
export const PAC_SPECIFICATION = {
  phMin: 3.5,
  phMax: 5.0,
  densityMin: 1.17,
  densityMax: 1.26,
  aluminaMin: 9.0, // Retained for informational/historical display
};

export function validatePacSensory(s?: PacSensoryParameters | null): {
  isValid: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  if (!s) {
    violations.push('Parameter pemeriksaan sensori PAC wajib diisi');
    return { isValid: false, violations };
  }

  const isVisualOk = s.visual === 'Kuning' || s.visual === 'Coklat Jernih';
  if (!isVisualOk) {
    violations.push(
      'Pemeriksaan visual tidak sesuai standar (harus faktual "Kuning" atau "Coklat Jernih")',
    );
  }

  const foreignVal = s.foreignMatters ?? s.odor;
  const isForeignOk = foreignVal === 'Tidak ada kontaminasi';
  if (!isForeignOk) {
    violations.push(
      'Pemeriksaan foreign matters/benda asing wajib diisi faktual "Tidak ada kontaminasi"',
    );
  }

  const packagingVal = s.packagingLabel ?? s.packaging;
  const isPackagingOk = packagingVal === 'Kemasan & label tidak rusak';
  if (!isPackagingOk) {
    violations.push(
      'Pemeriksaan kemasan & label wajib diisi faktual "Kemasan & label tidak rusak"',
    );
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}

export function evaluatePacAnalysis(
  params: PacAnalysisParameters,
  productName = 'PAC 280 AC',
  specMetadata: ChemicalSpecificationMetadata = OPERATIONAL_PAC_SPEC_METADATA,
): ChemicalEvaluationResult {
  const violations: string[] = [];

  // 1. Mandatory Sensory checks (Visual, Foreign Matters, Kemasan & Label)
  const sensoryCheck = validatePacSensory(params.sensory);
  violations.push(...sensoryCheck.violations);

  // 2. pH verification (3.50 - 5.00 inclusive)
  if (params.ph == null || isNaN(params.ph)) {
    violations.push('Parameter pH wajib diisi');
  } else if (
    params.ph < PAC_SPECIFICATION.phMin ||
    params.ph > PAC_SPECIFICATION.phMax
  ) {
    violations.push(
      `pH (${params.ph}) di luar batas spesifikasi (${PAC_SPECIFICATION.phMin} - ${PAC_SPECIFICATION.phMax})`,
    );
  }

  // 3. Density verification (1.170 - 1.260 inclusive)
  if (params.density == null || isNaN(params.density)) {
    violations.push('Parameter Density wajib diisi');
  } else if (
    params.density < PAC_SPECIFICATION.densityMin ||
    params.density > PAC_SPECIFICATION.densityMax
  ) {
    violations.push(
      `Density (${params.density} g/mL) di luar batas spesifikasi (${PAC_SPECIFICATION.densityMin} - ${PAC_SPECIFICATION.densityMax})`,
    );
  }

  // Note: Al2O3 (aluminaContent) is purely informational / historical per authoritative operational sheet.
  // It does NOT participate in compliance or cause violations.

  const isCompliant = violations.length === 0;
  const decision = isCompliant ? 'RELEASE' : 'REJECT';
  const summary = isCompliant
    ? `PAC memenuhi seluruh parameter wajib (pH: ${params.ph}, Density: ${params.density}, Sensori OK). Disetujui RELEASE berdasarkan spesifikasi ${specMetadata.version}.`
    : `PAC ditolak karena melanggar ${violations.length} parameter spesifikasi: ${violations.join('; ')}`;

  return {
    productName,
    isCompliant,
    result: isCompliant ? 'PASS' : 'REJECT',
    decision,
    specMetadata,
    violations,
    summary,
  };
}

/**
 * Rapid Klen CIP Specification Thresholds (SOP-GSP-2026.1):
 * - Alkalinity Na2O: > 35.00% (Strict greater than)
 * - Alkalinity NaOH: > 45.16% (Strict greater than, mandatory)
 * - pH: > 12.000 (Strict greater than)
 * - Density: > 1.400 g/mL (Strict greater than)
 * - Sensory: Visual Jernih, Foreign Matters Tidak ada kontaminasi, Kemasan & label tidak rusak
 */
export const RAPID_KLEN_SPECIFICATION = {
  na2oMin: 35.0,
  naohMin: 45.16,
  phMin: 12.0,
  densityMin: 1.4,
};

export function validateRapidKlenSensory(
  s?: RapidKlenSensoryParameters | null,
): {
  isValid: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  if (!s) {
    violations.push('Parameter pemeriksaan sensori Rapid Klen wajib diisi');
    return { isValid: false, violations };
  }

  const isVisualOk = s.visual === 'Jernih';
  if (!isVisualOk) {
    violations.push(
      'Pemeriksaan visual tidak sesuai standar (harus faktual "Jernih")',
    );
  }

  const isForeignOk = s.foreignMatters === 'Tidak ada kontaminasi';
  if (!isForeignOk) {
    violations.push(
      'Pemeriksaan foreign matters wajib diisi faktual "Tidak ada kontaminasi"',
    );
  }

  const packagingVal = s.packagingLabel ?? s.packaging;
  const isPackagingOk = packagingVal === 'Kemasan & label tidak rusak';
  if (!isPackagingOk) {
    violations.push(
      'Pemeriksaan kemasan & label wajib diisi faktual "Kemasan & label tidak rusak"',
    );
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}

export function evaluateRapidKlenAnalysis(
  params: RapidKlenAnalysisParameters,
  productName = 'Rapid Klen',
  specMetadata: ChemicalSpecificationMetadata = OPERATIONAL_RAPID_KLEN_SPEC_METADATA,
): ChemicalEvaluationResult {
  const violations: string[] = [];

  // 1. Mandatory Sensory & packaging checks
  const sensoryCheck = validateRapidKlenSensory(params.sensory);
  violations.push(...sensoryCheck.violations);

  // 2. Na2O Alkalinity: Strict greater-than (> 35.00)
  if (params.alkalinityNa2O == null || isNaN(params.alkalinityNa2O)) {
    violations.push('Kadar Alkalinitas Na2O wajib diisi');
  } else if (params.alkalinityNa2O <= RAPID_KLEN_SPECIFICATION.na2oMin) {
    violations.push(
      `Alkalinitas Na2O (${params.alkalinityNa2O}%) tidak memenuhi batas spesifikasi (> ${RAPID_KLEN_SPECIFICATION.na2oMin}%)`,
    );
  }

  // 3. NaOH Alkalinity: Strict greater-than (> 45.16) - MANDATORY
  if (params.alkalinityNaOH == null || isNaN(params.alkalinityNaOH)) {
    violations.push('Kadar Alkalinitas NaOH wajib diisi');
  } else if (params.alkalinityNaOH <= RAPID_KLEN_SPECIFICATION.naohMin) {
    violations.push(
      `Alkalinitas NaOH (${params.alkalinityNaOH}%) tidak memenuhi batas spesifikasi (> ${RAPID_KLEN_SPECIFICATION.naohMin}%)`,
    );
  }

  // 4. pH: Strict greater-than (> 12.000)
  if (params.ph == null || isNaN(params.ph)) {
    violations.push('Parameter pH wajib diisi');
  } else if (params.ph <= RAPID_KLEN_SPECIFICATION.phMin) {
    violations.push(
      `pH (${params.ph}) tidak memenuhi batas spesifikasi (> ${RAPID_KLEN_SPECIFICATION.phMin})`,
    );
  }

  // 5. Density: Strict greater-than (> 1.400 g/mL)
  if (params.density == null || isNaN(params.density)) {
    violations.push('Parameter Density wajib diisi');
  } else if (params.density <= RAPID_KLEN_SPECIFICATION.densityMin) {
    violations.push(
      `Density (${params.density} g/mL) tidak memenuhi batas spesifikasi (> ${RAPID_KLEN_SPECIFICATION.densityMin})`,
    );
  }

  const isCompliant = violations.length === 0;
  const decision = isCompliant ? 'RELEASE' : 'REJECT';
  const summary = isCompliant
    ? `Rapid Klen memenuhi seluruh parameter (Na2O: ${params.alkalinityNa2O}%, NaOH: ${params.alkalinityNaOH}%, pH: ${params.ph}, Density: ${params.density}, Kemasan OK). Disetujui RELEASE berdasarkan spesifikasi ${specMetadata.version}.`
    : `Rapid Klen ditolak karena melanggar spesifikasi: ${violations.join('; ')}`;

  return {
    productName,
    isCompliant,
    result: isCompliant ? 'PASS' : 'REJECT',
    decision,
    specMetadata,
    violations,
    summary,
  };
}
