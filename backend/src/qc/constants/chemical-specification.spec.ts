import {
  evaluatePacAnalysis,
  evaluateRapidKlenAnalysis,
  PAC_SPECIFICATION,
  RAPID_KLEN_SPECIFICATION,
  PacAnalysisParameters,
  RapidKlenAnalysisParameters,
  OPERATIONAL_PAC_SPEC_METADATA,
  TEST_FIXTURE_PAC_SPEC_METADATA,
  OPERATIONAL_RAPID_KLEN_SPEC_METADATA,
  TEST_FIXTURE_RAPID_KLEN_SPEC_METADATA,
  TEST_FIXTURE_RAPID_KLEN_STRICT_GT,
  TEST_FIXTURE_RAPID_KLEN_STANDARD_GTE,
} from './chemical-specification';

describe('Chemical Quality Specifications (SOP-GSP-2026.1)', () => {
  describe('PAC (Poly Aluminium Chloride)', () => {
    const validPacParams: PacAnalysisParameters = {
      sensory: {
        visual: true,
        odor: true,
        packaging: true,
      },
      ph: 4.2,
      density: 1.21,
      aluminaContent: 10.5,
    };

    it('withholds automated RELEASE (returns PENDING_DISPOSITION) when operational spec is PENDING_SIGNOFF', () => {
      const res = evaluatePacAnalysis(validPacParams);
      expect(res.isCompliant).toBe(true);
      expect(res.result).toBe('PASS');
      expect(res.decision).toBe('PENDING_DISPOSITION');
      expect(res.specMetadata.approvalStatus).toBe('PENDING_SIGNOFF');
      expect(res.summary).toContain('Keputusan RELEASE otomatis ditahan');
      expect(res.violations).toHaveLength(0);
    });

    it('approves compliant PAC and grants RELEASE when using approved fixture specification', () => {
      const res = evaluatePacAnalysis(
        validPacParams,
        'PAC 280 AC',
        TEST_FIXTURE_PAC_SPEC_METADATA,
      );
      expect(res.isCompliant).toBe(true);
      expect(res.result).toBe('PASS');
      expect(res.decision).toBe('RELEASE');
      expect(res.specMetadata.approvalStatus).toBe('APPROVED');
      expect(res.violations).toHaveLength(0);
    });

    it('accepts exact lower boundary values for PAC (pH 3.50, Density 1.170, Al2O3 9.0) with approved fixture', () => {
      const res = evaluatePacAnalysis(
        {
          ...validPacParams,
          ph: PAC_SPECIFICATION.phMin, // 3.50
          density: PAC_SPECIFICATION.densityMin, // 1.170
          aluminaContent: PAC_SPECIFICATION.aluminaMin, // 9.0
        },
        'PAC 280 AC',
        TEST_FIXTURE_PAC_SPEC_METADATA,
      );
      expect(res.isCompliant).toBe(true);
      expect(res.result).toBe('PASS');
      expect(res.decision).toBe('RELEASE');
    });

    it('accepts exact upper boundary values for PAC (pH 5.00, Density 1.260) with approved fixture', () => {
      const res = evaluatePacAnalysis(
        {
          ...validPacParams,
          ph: PAC_SPECIFICATION.phMax, // 5.00
          density: PAC_SPECIFICATION.densityMax, // 1.260
        },
        'PAC 280 AC',
        TEST_FIXTURE_PAC_SPEC_METADATA,
      );
      expect(res.isCompliant).toBe(true);
      expect(res.result).toBe('PASS');
      expect(res.decision).toBe('RELEASE');
    });

    it('withholds automated REJECT (returns PENDING_DISPOSITION) when operational spec is PENDING_SIGNOFF and pH is below limit', () => {
      const res = evaluatePacAnalysis({
        ...validPacParams,
        ph: 3.49,
      });
      expect(res.isCompliant).toBe(false);
      expect(res.result).toBe('REJECT');
      expect(res.decision).toBe('PENDING_DISPOSITION');
      expect(res.summary).toContain('Penolakan mutu otomatis ditahan');
      expect(res.summary).toContain('spesifikasi belum disahkan');
    });

    it('rejects when pH is slightly below lower boundary (3.49) under approved specification', () => {
      const res = evaluatePacAnalysis(
        {
          ...validPacParams,
          ph: 3.49,
        },
        'PAC 280 AC',
        TEST_FIXTURE_PAC_SPEC_METADATA,
      );
      expect(res.isCompliant).toBe(false);
      expect(res.result).toBe('REJECT');
      expect(res.decision).toBe('REJECT');
      expect(res.violations.some((v) => v.includes('pH'))).toBe(true);
    });

    it('rejects when pH is slightly above upper boundary (5.01) under approved specification', () => {
      const res = evaluatePacAnalysis(
        {
          ...validPacParams,
          ph: 5.01,
        },
        'PAC 280 AC',
        TEST_FIXTURE_PAC_SPEC_METADATA,
      );
      expect(res.isCompliant).toBe(false);
      expect(res.result).toBe('REJECT');
      expect(res.decision).toBe('REJECT');
      expect(res.violations.some((v) => v.includes('pH'))).toBe(true);
    });

    it('rejects when density is slightly below boundary (1.169 g/mL) under approved specification', () => {
      const res = evaluatePacAnalysis(
        {
          ...validPacParams,
          density: 1.169,
        },
        'PAC 280 AC',
        TEST_FIXTURE_PAC_SPEC_METADATA,
      );
      expect(res.isCompliant).toBe(false);
      expect(res.result).toBe('REJECT');
      expect(res.decision).toBe('REJECT');
      expect(res.violations.some((v) => v.includes('Density'))).toBe(true);
    });

    it('rejects when sensory fails: odor contamination detected under approved specification', () => {
      const res = evaluatePacAnalysis(
        {
          ...validPacParams,
          sensory: { ...validPacParams.sensory, odor: false },
        },
        'PAC 280 AC',
        TEST_FIXTURE_PAC_SPEC_METADATA,
      );
      expect(res.isCompliant).toBe(false);
      expect(res.result).toBe('REJECT');
      expect(res.decision).toBe('REJECT');
      expect(res.violations.some((v) => v.includes('Bau'))).toBe(true);
    });

    it('rejects when packaging/seal is compromised under approved specification', () => {
      const res = evaluatePacAnalysis(
        {
          ...validPacParams,
          sensory: { ...validPacParams.sensory, packaging: false },
        },
        'PAC 280 AC',
        TEST_FIXTURE_PAC_SPEC_METADATA,
      );
      expect(res.isCompliant).toBe(false);
      expect(res.result).toBe('REJECT');
      expect(res.decision).toBe('REJECT');
      expect(res.violations.some((v) => v.includes('kemasan'))).toBe(true);
    });
  });

  describe('Rapid Klen / PRO-CIP B++ (Alkaline CIP)', () => {
    const validRapidParams: RapidKlenAnalysisParameters = {
      sensory: {
        visual: true,
        packaging: true,
      },
      alkalinityNa2O: 36.2,
      alkalinityNaOH: 46.5,
      ph: 13.0,
      density: 1.425,
    };

    it('withholds automated RELEASE (returns PENDING_DISPOSITION) when operational spec is PENDING_SIGNOFF', () => {
      const res = evaluateRapidKlenAnalysis(validRapidParams);
      expect(res.isCompliant).toBe(true);
      expect(res.result).toBe('PASS');
      expect(res.decision).toBe('PENDING_DISPOSITION');
      expect(res.specMetadata.approvalStatus).toBe('PENDING_SIGNOFF');
      expect(res.summary).toContain('Keputusan RELEASE otomatis ditahan');
      expect(res.summary).toContain('spesifikasi belum disahkan');
      expect(res.violations).toHaveLength(0);
    });

    it('withholds automated REJECT (returns PENDING_DISPOSITION) when operational spec is PENDING_SIGNOFF and parameters fail', () => {
      const res = evaluateRapidKlenAnalysis({
        ...validRapidParams,
        ph: 11.0,
      });
      expect(res.isCompliant).toBe(false);
      expect(res.result).toBe('REJECT');
      expect(res.decision).toBe('PENDING_DISPOSITION');
      expect(res.summary).toContain('Penolakan mutu otomatis ditahan');
      expect(res.summary).toContain('spesifikasi belum disahkan');
    });

    it('approves compliant Rapid Klen and grants RELEASE when using approved fixture specification', () => {
      const res = evaluateRapidKlenAnalysis(
        validRapidParams,
        'Rapid Klen',
        TEST_FIXTURE_RAPID_KLEN_STANDARD_GTE,
      );
      expect(res.isCompliant).toBe(true);
      expect(res.result).toBe('PASS');
      expect(res.decision).toBe('RELEASE');
      expect(res.specMetadata.approvalStatus).toBe('APPROVED');
      expect(res.violations).toHaveLength(0);
    });

    it('evaluates document specifying strict GT (> 35.0%): rejects exact 35.0% and passes 35.1%', () => {
      const resExact = evaluateRapidKlenAnalysis(
        {
          ...validRapidParams,
          alkalinityNa2O: 35.0,
        },
        'Rapid Klen',
        TEST_FIXTURE_RAPID_KLEN_STRICT_GT,
      );
      expect(resExact.isCompliant).toBe(false);
      expect(resExact.result).toBe('REJECT');
      expect(resExact.decision).toBe('REJECT');
      expect(
        resExact.violations.some(
          (v) => v.includes('Na2O') && v.includes('> 35%'),
        ),
      ).toBe(true);

      const resAbove = evaluateRapidKlenAnalysis(
        {
          ...validRapidParams,
          alkalinityNa2O: 35.1,
        },
        'Rapid Klen',
        TEST_FIXTURE_RAPID_KLEN_STRICT_GT,
      );
      expect(resAbove.isCompliant).toBe(true);
      expect(resAbove.decision).toBe('RELEASE');
    });

    it('evaluates document specifying standard GTE (>= 35.0%): accepts exact 35.0% and rejects 34.9%', () => {
      const resExact = evaluateRapidKlenAnalysis(
        {
          ...validRapidParams,
          alkalinityNa2O: 35.0,
          alkalinityNaOH: RAPID_KLEN_SPECIFICATION.naohMin, // 45.16
          ph: RAPID_KLEN_SPECIFICATION.phMin, // 12.0
          density: RAPID_KLEN_SPECIFICATION.densityMin, // 1.400
        },
        'Rapid Klen',
        TEST_FIXTURE_RAPID_KLEN_STANDARD_GTE,
      );
      expect(resExact.isCompliant).toBe(true);
      expect(resExact.result).toBe('PASS');
      expect(resExact.decision).toBe('RELEASE');

      const resBelow = evaluateRapidKlenAnalysis(
        {
          ...validRapidParams,
          alkalinityNa2O: 34.9,
        },
        'Rapid Klen',
        TEST_FIXTURE_RAPID_KLEN_STANDARD_GTE,
      );
      expect(resBelow.isCompliant).toBe(false);
      expect(resBelow.result).toBe('REJECT');
      expect(resBelow.decision).toBe('REJECT');
      expect(resBelow.violations.some((v) => v.includes('Na2O'))).toBe(true);
    });

    it('rejects at near-boundary: pH 11.9 (below 12.0) under approved specification', () => {
      const res = evaluateRapidKlenAnalysis(
        {
          ...validRapidParams,
          ph: 11.9,
        },
        'Rapid Klen',
        TEST_FIXTURE_RAPID_KLEN_STANDARD_GTE,
      );
      expect(res.isCompliant).toBe(false);
      expect(res.result).toBe('REJECT');
      expect(res.decision).toBe('REJECT');
      expect(res.violations.some((v) => v.includes('pH'))).toBe(true);
    });

    it('rejects at near-boundary: density 1.399 g/mL (below 1.400) under approved specification', () => {
      const res = evaluateRapidKlenAnalysis(
        {
          ...validRapidParams,
          density: 1.399,
        },
        'Rapid Klen',
        TEST_FIXTURE_RAPID_KLEN_STANDARD_GTE,
      );
      expect(res.isCompliant).toBe(false);
      expect(res.result).toBe('REJECT');
      expect(res.decision).toBe('REJECT');
      expect(res.violations.some((v) => v.includes('Density'))).toBe(true);
    });

    it('rejects if packaging seal is broken or visual sediment present under approved specification', () => {
      const res = evaluateRapidKlenAnalysis(
        {
          ...validRapidParams,
          sensory: { visual: false, packaging: false },
        },
        'Rapid Klen',
        TEST_FIXTURE_RAPID_KLEN_STANDARD_GTE,
      );
      expect(res.isCompliant).toBe(false);
      expect(res.result).toBe('REJECT');
      expect(res.decision).toBe('REJECT');
      expect(res.violations).toHaveLength(2);
    });
  });
});
