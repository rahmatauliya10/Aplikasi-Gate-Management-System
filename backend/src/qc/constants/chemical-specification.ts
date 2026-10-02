/**
 * Reference Quality Specifications & Evaluation Rules for Chemicals (PAC & Rapid Klen CIP)
 * Status: Reference Benchmark / Test Fixtures (Pending Formal QA Department Signoff & Official COA Validation)
 *
 * IMPORTANT CHEMICAL & AUDIT DISTINCTIONS:
 * 1. PAC (Poly Aluminium Chloride):
 *    - "Aluminium Content" (% Al elemental, typical ~4.8% - 5.3%) is chemically distinct from
 *      "Alumina Content" (% Al2O3, typical ~9.0% - 10.5%). Molecular conversion factor: 2*Al / Al2O3 ≈ 0.529.
 *      The parameter below evaluates Al2O3 basis (Min 9.0% w/w) as a test benchmark.
 *    - Operational specifications must be verified against supplier Certificate of Analysis (COA) and QA SOP.
 * 2. Rapid Klen (Heavy-Duty Alkaline CIP):
 *    - Total Alkalinity can be expressed as % Na2O or % NaOH (conversion factor: 2*NaOH / Na2O = 80/62 ≈ 1.29).
 *    - Boundary conditions: Operator comparison is strictly governed by signed specifications (minOperator: 'GT' vs 'GTE').
 *      In provisional status, strict boundary > 35.0% is maintained to prevent unwarranted automated release.
 * 3. Governance Rule:
 *    - Any product with approvalStatus !== 'APPROVED' CANNOT produce an automated 'RELEASE'.
 */

export type SpecificationApprovalStatus =
  'APPROVED' | 'PENDING_SIGNOFF' | 'TEST_FIXTURE';

export interface ChemicalSpecificationMetadata {
  version: string;
  documentSource: string;
  approvalStatus: SpecificationApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  minOperator: 'GT' | 'GTE';
  notes: string;
}

export const OPERATIONAL_PAC_SPEC_METADATA: ChemicalSpecificationMetadata = {
  version: '1.0.0-provisional',
  documentSource:
    'Supplier Reference Datasheet (Awaiting Formal QA Head Signoff & COA Validation)',
  approvalStatus: 'PENDING_SIGNOFF',
  approvedBy: null,
  approvedAt: null,
  minOperator: 'GTE',
  notes:
    'Provisional PAC parameters. Automated decisions (RELEASE/REJECT) prohibited until formal QA validation.',
};

export const RAPID_KLEN_DOC_STRICT_GT_METADATA: ChemicalSpecificationMetadata =
  {
    version: '1.0.0-doc-strict-gt',
    documentSource:
      'Supplier CIP Technical Specification Doc #CIP-STRICT-01 (Specifies strict GT > 35.0%)',
    approvalStatus: 'PENDING_SIGNOFF',
    approvedBy: null,
    approvedAt: null,
    minOperator: 'GT',
    notes:
      'Document explicitly specifies strict greater-than (> 35.0%). Automated decisions withheld until formal QA validation.',
  };

export const RAPID_KLEN_DOC_STANDARD_GTE_METADATA: ChemicalSpecificationMetadata =
  {
    version: '1.0.0-doc-standard-gte',
    documentSource:
      'QA Harmonized CIP Technical Specification Doc #CIP-HARM-02 (Specifies standard GTE >= 35.0%)',
    approvalStatus: 'PENDING_SIGNOFF',
    approvedBy: null,
    approvedAt: null,
    minOperator: 'GTE',
    notes:
      'Document explicitly specifies greater-than-or-equal (>= 35.0%). Automated decisions withheld until formal QA validation.',
  };

export const OPERATIONAL_RAPID_KLEN_SPEC_METADATA: ChemicalSpecificationMetadata =
  RAPID_KLEN_DOC_STRICT_GT_METADATA;

export const TEST_FIXTURE_PAC_SPEC_METADATA: ChemicalSpecificationMetadata = {
  version: 'test-fixture-1.0',
  documentSource: 'QA Approved Test Fixture (Simulated)',
  approvalStatus: 'APPROVED',
  approvedBy: 'QA_HEAD_SIMULATED',
  approvedAt: '2026-09-30T00:00:00.000Z',
  minOperator: 'GTE',
  notes: 'Simulated approved spec for automated testing.',
};

export const TEST_FIXTURE_RAPID_KLEN_STRICT_GT: ChemicalSpecificationMetadata =
  {
    version: 'test-fixture-strict-gt',
    documentSource: 'QA Approved Test Fixture with strict GT (> 35.0%)',
    approvalStatus: 'APPROVED',
    approvedBy: 'QA_HEAD_SIMULATED',
    approvedAt: '2026-09-30T00:00:00.000Z',
    minOperator: 'GT',
    notes: 'Simulated approved spec specifying strict operator GT.',
  };

export const TEST_FIXTURE_RAPID_KLEN_STANDARD_GTE: ChemicalSpecificationMetadata =
  {
    version: 'test-fixture-standard-gte',
    documentSource: 'QA Approved Test Fixture with standard GTE (>= 35.0%)',
    approvalStatus: 'APPROVED',
    approvedBy: 'QA_HEAD_SIMULATED',
    approvedAt: '2026-09-30T00:00:00.000Z',
    minOperator: 'GTE',
    notes: 'Simulated approved spec specifying standard operator GTE.',
  };

export const TEST_FIXTURE_RAPID_KLEN_SPEC_METADATA: ChemicalSpecificationMetadata =
  TEST_FIXTURE_RAPID_KLEN_STANDARD_GTE;

export interface PacAnalysisParameters {
  sensory: {
    visual: boolean;
    odor: boolean;
    packaging: boolean;
  };
  ph: number;
  density: number;
  aluminaContent?: number | null;
}

export interface RapidKlenAnalysisParameters {
  sensory: {
    visual: boolean;
    packaging: boolean;
  };
  alkalinityNa2O: number;
  alkalinityNaOH?: number | null;
  ph: number;
  density: number;
}

export interface ChemicalEvaluationResult {
  productName: string;
  isCompliant: boolean;
  result: 'PASS' | 'REJECT';
  decision: 'RELEASE' | 'PENDING_DISPOSITION' | 'REJECT';
  specMetadata: ChemicalSpecificationMetadata;
  violations: string[];
  summary: string;
}

/**
 * PAC Specification Thresholds (SOP-GSP-2026.1):
 * - pH: 3.50 - 5.00
 * - Density: 1.170 - 1.260 g/mL
 * - Al2O3: Min 9.0% (if tested)
 * - Sensory: All 3 mandatory checks must be true
 */
export const PAC_SPECIFICATION = {
  phMin: 3.5,
  phMax: 5.0,
  densityMin: 1.17,
  densityMax: 1.26,
  aluminaMin: 9.0,
};

export function evaluatePacAnalysis(
  params: PacAnalysisParameters,
  productName = 'PAC 280 AC',
  specMetadata: ChemicalSpecificationMetadata = OPERATIONAL_PAC_SPEC_METADATA,
): ChemicalEvaluationResult {
  const violations: string[] = [];

  // 1. Sensory checks
  if (!params.sensory?.visual) {
    violations.push(
      'Visual tidak homogen atau keruh (harus cairan jernih kekuningan)',
    );
  }
  if (!params.sensory?.odor) {
    violations.push(
      'Bau terdeteksi kontaminasi asing (harus bau khas PAC normal)',
    );
  }
  if (!params.sensory?.packaging) {
    violations.push('Segel tangki/drum rusak atau kemasan bocor');
  }

  // 2. pH verification (3.50 - 5.00)
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

  // 3. Density verification (1.170 - 1.260 g/mL)
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

  // 4. Optional Alumina Al2O3 check
  if (params.aluminaContent != null && !isNaN(params.aluminaContent)) {
    if (params.aluminaContent < PAC_SPECIFICATION.aluminaMin) {
      violations.push(
        `Kadar Al2O3 (${params.aluminaContent}%) di bawah batas minimal (${PAC_SPECIFICATION.aluminaMin}%)`,
      );
    }
  }

  const isCompliant = violations.length === 0;

  // Audit Rule: Specifications that are NOT formally 'APPROVED' CANNOT produce automated decisions.
  // Both automated RELEASE and automated REJECT based on provisional spec limits are withheld
  // and routed to manual review (PENDING_DISPOSITION) with reason: "spesifikasi belum disahkan".
  let decision: 'RELEASE' | 'PENDING_DISPOSITION' | 'REJECT';
  let summary: string;

  if (specMetadata.approvalStatus !== 'APPROVED') {
    decision = 'PENDING_DISPOSITION';
    if (!isCompliant) {
      summary = `PAC tidak memenuhi parameter acuan sementara (${violations.join('; ')}), namun spesifikasi berstatus ${specMetadata.approvalStatus} (${specMetadata.documentSource}). Penolakan mutu otomatis ditahan; dialihkan ke peninjauan dengan alasan: spesifikasi belum disahkan.`;
    } else {
      summary = `PAC memenuhi parameter acuan teknis (pH: ${params.ph}, Density: ${params.density}), namun spesifikasi berstatus ${specMetadata.approvalStatus} (${specMetadata.documentSource}). Keputusan RELEASE otomatis ditahan; dialihkan ke peninjauan dengan alasan: spesifikasi belum disahkan.`;
    }
  } else if (!isCompliant) {
    decision = 'REJECT';
    summary = `PAC ditolak karena melanggar ${violations.length} parameter spesifikasi teresahkan: ${violations.join('; ')}`;
  } else {
    decision = 'RELEASE';
    summary = `PAC memenuhi seluruh parameter wajib (pH: ${params.ph}, Density: ${params.density}, Sensori OK). Disetujui RELEASE berdasarkan spesifikasi teresahkan v${specMetadata.version}.`;
  }

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
 * - Alkalinity Na2O: Min 35.0%
 * - Alkalinity NaOH: Min 45.16% (if tested)
 * - pH: Min 12.0
 * - Density: Min 1.400 g/mL
 * - Sensory: All mandatory checks must be true
 */
export const RAPID_KLEN_SPECIFICATION = {
  na2oMin: 35.0,
  naohMin: 45.16,
  phMin: 12.0,
  densityMin: 1.4,
};

export function evaluateRapidKlenAnalysis(
  params: RapidKlenAnalysisParameters,
  productName = 'Rapid Klen',
  specMetadata: ChemicalSpecificationMetadata = OPERATIONAL_RAPID_KLEN_SPEC_METADATA,
): ChemicalEvaluationResult {
  const violations: string[] = [];

  // 1. Sensory & packaging checks
  if (!params.sensory?.visual) {
    violations.push('Cairan mengandung endapan kasar atau suspensi keruh');
  }
  if (!params.sensory?.packaging) {
    violations.push('Integritas kemasan/segel pabrik rusak');
  }

  // 2. Na2O Alkalinity (Operator governed by specMetadata: GT vs GTE)
  if (params.alkalinityNa2O == null || isNaN(params.alkalinityNa2O)) {
    violations.push('Kadar Alkalinitas Na2O wajib diisi');
  } else {
    const isAlkalinityBelow =
      specMetadata.minOperator === 'GT'
        ? params.alkalinityNa2O <= RAPID_KLEN_SPECIFICATION.na2oMin
        : params.alkalinityNa2O < RAPID_KLEN_SPECIFICATION.na2oMin;

    if (isAlkalinityBelow) {
      const opText = specMetadata.minOperator === 'GT' ? '>' : '>=';
      violations.push(
        `Alkalinitas Na2O (${params.alkalinityNa2O}%) tidak memenuhi batas spesifikasi (${opText} ${RAPID_KLEN_SPECIFICATION.na2oMin}%)`,
      );
    }
  }

  // 3. Optional NaOH Alkalinity (>= 45.16%)
  if (params.alkalinityNaOH != null && !isNaN(params.alkalinityNaOH)) {
    if (params.alkalinityNaOH < RAPID_KLEN_SPECIFICATION.naohMin) {
      violations.push(
        `Alkalinitas NaOH (${params.alkalinityNaOH}%) di bawah batas minimal (${RAPID_KLEN_SPECIFICATION.naohMin}%)`,
      );
    }
  }

  // 4. pH (>= 12.0)
  if (params.ph == null || isNaN(params.ph)) {
    violations.push('Parameter pH wajib diisi');
  } else if (params.ph < RAPID_KLEN_SPECIFICATION.phMin) {
    violations.push(
      `pH (${params.ph}) di bawah batas minimal kebasaan CIP (${RAPID_KLEN_SPECIFICATION.phMin})`,
    );
  }

  // 5. Density (>= 1.400 g/mL)
  if (params.density == null || isNaN(params.density)) {
    violations.push('Parameter Density wajib diisi');
  } else if (params.density < RAPID_KLEN_SPECIFICATION.densityMin) {
    violations.push(
      `Density (${params.density} g/mL) di bawah batas minimal (${RAPID_KLEN_SPECIFICATION.densityMin})`,
    );
  }

  const isCompliant = violations.length === 0;

  // Audit Rule: Specifications that are NOT formally 'APPROVED' CANNOT produce automated decisions.
  // Both automated RELEASE and automated REJECT based on provisional spec limits are withheld
  // and routed to manual review (PENDING_DISPOSITION) with reason: "spesifikasi belum disahkan".
  let decision: 'RELEASE' | 'PENDING_DISPOSITION' | 'REJECT';
  let summary: string;

  if (specMetadata.approvalStatus !== 'APPROVED') {
    decision = 'PENDING_DISPOSITION';
    if (!isCompliant) {
      summary = `Rapid Klen tidak memenuhi parameter acuan sementara (${violations.join('; ')}), namun spesifikasi berstatus ${specMetadata.approvalStatus} (${specMetadata.documentSource}). Penolakan mutu otomatis ditahan; dialihkan ke peninjauan dengan alasan: spesifikasi belum disahkan.`;
    } else {
      summary = `Rapid Klen memenuhi parameter acuan teknis (Na2O: ${params.alkalinityNa2O}%, pH: ${params.ph}), namun spesifikasi berstatus ${specMetadata.approvalStatus} (${specMetadata.documentSource}). Keputusan RELEASE otomatis ditahan; dialihkan ke peninjauan dengan alasan: spesifikasi belum disahkan.`;
    }
  } else if (!isCompliant) {
    decision = 'REJECT';
    summary = `Rapid Klen ditolak karena melanggar spesifikasi teresahkan: ${violations.join('; ')}`;
  } else {
    decision = 'RELEASE';
    summary = `Rapid Klen memenuhi seluruh parameter (Na2O: ${params.alkalinityNa2O}%, pH: ${params.ph}, Density: ${params.density}, Kemasan OK). Disetujui RELEASE berdasarkan spesifikasi teresahkan v${specMetadata.version}.`;
  }

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
