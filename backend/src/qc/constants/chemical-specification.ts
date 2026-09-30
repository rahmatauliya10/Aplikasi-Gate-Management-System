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
 *    - Boundary conditions: Exact 35.00% Na2O is evaluated as compliant (non-strict inequality >= 35.0%).
 *    - These numerical limits are reference thresholds for testing and require formal QA validation.
 */

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
  decision: 'RELEASE' | 'REJECT';
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
  phMin: 3.50,
  phMax: 5.00,
  densityMin: 1.170,
  densityMax: 1.260,
  aluminaMin: 9.0,
};

export function evaluatePacAnalysis(
  params: PacAnalysisParameters,
  productName = 'PAC 280 AC',
): ChemicalEvaluationResult {
  const violations: string[] = [];

  // 1. Sensory checks
  if (!params.sensory?.visual) {
    violations.push('Visual tidak homogen atau keruh (harus cairan jernih kekuningan)');
  }
  if (!params.sensory?.odor) {
    violations.push('Bau terdeteksi kontaminasi asing (harus bau khas PAC normal)');
  }
  if (!params.sensory?.packaging) {
    violations.push('Segel tangki/drum rusak atau kemasan bocor');
  }

  // 2. pH verification (3.50 - 5.00)
  if (params.ph == null || isNaN(params.ph)) {
    violations.push('Parameter pH wajib diisi');
  } else if (params.ph < PAC_SPECIFICATION.phMin || params.ph > PAC_SPECIFICATION.phMax) {
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
  return {
    productName,
    isCompliant,
    result: isCompliant ? 'PASS' : 'REJECT',
    decision: isCompliant ? 'RELEASE' : 'REJECT',
    violations,
    summary: isCompliant
      ? `PAC memenuhi seluruh parameter wajib (pH: ${params.ph}, Density: ${params.density}, Sensori OK). Disetujui RELEASE.`
      : `PAC ditolak karena melanggar ${violations.length} parameter spesifikasi: ${violations.join('; ')}`,
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
  densityMin: 1.400,
};

export function evaluateRapidKlenAnalysis(
  params: RapidKlenAnalysisParameters,
  productName = 'Rapid Klen',
): ChemicalEvaluationResult {
  const violations: string[] = [];

  // 1. Sensory & packaging checks
  if (!params.sensory?.visual) {
    violations.push('Cairan mengandung endapan kasar atau suspensi keruh');
  }
  if (!params.sensory?.packaging) {
    violations.push('Integritas kemasan/segel pabrik rusak');
  }

  // 2. Na2O Alkalinity (>= 35.0%)
  if (params.alkalinityNa2O == null || isNaN(params.alkalinityNa2O)) {
    violations.push('Kadar Alkalinitas Na2O wajib diisi');
  } else if (params.alkalinityNa2O < RAPID_KLEN_SPECIFICATION.na2oMin) {
    violations.push(
      `Alkalinitas Na2O (${params.alkalinityNa2O}%) di bawah batas minimal (${RAPID_KLEN_SPECIFICATION.na2oMin}%)`,
    );
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
  return {
    productName,
    isCompliant,
    result: isCompliant ? 'PASS' : 'REJECT',
    decision: isCompliant ? 'RELEASE' : 'REJECT',
    violations,
    summary: isCompliant
      ? `Rapid Klen memenuhi seluruh parameter (Na2O: ${params.alkalinityNa2O}%, pH: ${params.ph}, Density: ${params.density}, Kemasan OK). Disetujui RELEASE.`
      : `Rapid Klen ditolak karena melanggar spesifikasi: ${violations.join('; ')}`,
  };
}
