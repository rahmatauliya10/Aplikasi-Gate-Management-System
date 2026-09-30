import {
  evaluatePacAnalysis,
  evaluateRapidKlenAnalysis,
  PAC_SPECIFICATION,
  RAPID_KLEN_SPECIFICATION,
  PacAnalysisParameters,
  RapidKlenAnalysisParameters,
} from './chemical-specification';

describe('Chemical Quality Specifications (SOP-GSP-2026.1)', () => {
  describe('PAC (Poly Aluminium Chloride)', () => {
    const validPacParams: PacAnalysisParameters = {
      sensory: {
        visual: true,
        odor: true,
        packaging: true,
      },
      ph: 4.20,
      density: 1.210,
      aluminaContent: 10.5,
    };

    it('approves compliant PAC with all mandatory sensory and physico-chemical parameters', () => {
      const res = evaluatePacAnalysis(validPacParams);
      expect(res.isCompliant).toBe(true);
      expect(res.result).toBe('PASS');
      expect(res.decision).toBe('RELEASE');
      expect(res.violations).toHaveLength(0);
    });

    it('accepts exact lower boundary values for PAC (pH 3.50, Density 1.170, Al2O3 9.0)', () => {
      const res = evaluatePacAnalysis({
        ...validPacParams,
        ph: PAC_SPECIFICATION.phMin, // 3.50
        density: PAC_SPECIFICATION.densityMin, // 1.170
        aluminaContent: PAC_SPECIFICATION.aluminaMin, // 9.0
      });
      expect(res.isCompliant).toBe(true);
      expect(res.result).toBe('PASS');
    });

    it('accepts exact upper boundary values for PAC (pH 5.00, Density 1.260)', () => {
      const res = evaluatePacAnalysis({
        ...validPacParams,
        ph: PAC_SPECIFICATION.phMax, // 5.00
        density: PAC_SPECIFICATION.densityMax, // 1.260
      });
      expect(res.isCompliant).toBe(true);
      expect(res.result).toBe('PASS');
    });

    it('rejects when pH is slightly below lower boundary (3.49)', () => {
      const res = evaluatePacAnalysis({
        ...validPacParams,
        ph: 3.49,
      });
      expect(res.isCompliant).toBe(false);
      expect(res.result).toBe('REJECT');
      expect(res.violations.some((v) => v.includes('pH'))).toBe(true);
    });

    it('rejects when pH is slightly above upper boundary (5.01)', () => {
      const res = evaluatePacAnalysis({
        ...validPacParams,
        ph: 5.01,
      });
      expect(res.isCompliant).toBe(false);
      expect(res.result).toBe('REJECT');
      expect(res.violations.some((v) => v.includes('pH'))).toBe(true);
    });

    it('rejects when density is slightly below boundary (1.169 g/mL)', () => {
      const res = evaluatePacAnalysis({
        ...validPacParams,
        density: 1.169,
      });
      expect(res.isCompliant).toBe(false);
      expect(res.result).toBe('REJECT');
      expect(res.violations.some((v) => v.includes('Density'))).toBe(true);
    });

    it('rejects when sensory fails: odor contamination detected', () => {
      const res = evaluatePacAnalysis({
        ...validPacParams,
        sensory: { ...validPacParams.sensory, odor: false },
      });
      expect(res.isCompliant).toBe(false);
      expect(res.result).toBe('REJECT');
      expect(res.violations.some((v) => v.includes('Bau'))).toBe(true);
    });

    it('rejects when packaging/seal is compromised', () => {
      const res = evaluatePacAnalysis({
        ...validPacParams,
        sensory: { ...validPacParams.sensory, packaging: false },
      });
      expect(res.isCompliant).toBe(false);
      expect(res.result).toBe('REJECT');
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

    it('approves compliant Rapid Klen meeting all parameters', () => {
      const res = evaluateRapidKlenAnalysis(validRapidParams);
      expect(res.isCompliant).toBe(true);
      expect(res.result).toBe('PASS');
      expect(res.decision).toBe('RELEASE');
      expect(res.violations).toHaveLength(0);
    });

    it('accepts exact minimum boundary values (Na2O 35.0%, NaOH 45.16%, pH 12.0, Density 1.400)', () => {
      const res = evaluateRapidKlenAnalysis({
        ...validRapidParams,
        alkalinityNa2O: RAPID_KLEN_SPECIFICATION.na2oMin, // 35.0
        alkalinityNaOH: RAPID_KLEN_SPECIFICATION.naohMin, // 45.16
        ph: RAPID_KLEN_SPECIFICATION.phMin, // 12.0
        density: RAPID_KLEN_SPECIFICATION.densityMin, // 1.400
      });
      expect(res.isCompliant).toBe(true);
      expect(res.result).toBe('PASS');
    });

    it('rejects at near-boundary: Na2O 34.9% (below 35.0%)', () => {
      const res = evaluateRapidKlenAnalysis({
        ...validRapidParams,
        alkalinityNa2O: 34.9,
      });
      expect(res.isCompliant).toBe(false);
      expect(res.result).toBe('REJECT');
      expect(res.violations.some((v) => v.includes('Na2O'))).toBe(true);
    });

    it('rejects at near-boundary: pH 11.9 (below 12.0)', () => {
      const res = evaluateRapidKlenAnalysis({
        ...validRapidParams,
        ph: 11.9,
      });
      expect(res.isCompliant).toBe(false);
      expect(res.result).toBe('REJECT');
      expect(res.violations.some((v) => v.includes('pH'))).toBe(true);
    });

    it('rejects at near-boundary: density 1.399 g/mL (below 1.400)', () => {
      const res = evaluateRapidKlenAnalysis({
        ...validRapidParams,
        density: 1.399,
      });
      expect(res.isCompliant).toBe(false);
      expect(res.result).toBe('REJECT');
      expect(res.violations.some((v) => v.includes('Density'))).toBe(true);
    });

    it('rejects if packaging seal is broken or visual sediment present', () => {
      const res = evaluateRapidKlenAnalysis({
        ...validRapidParams,
        sensory: { visual: false, packaging: false },
      });
      expect(res.isCompliant).toBe(false);
      expect(res.result).toBe('REJECT');
      expect(res.violations).toHaveLength(2);
    });
  });
});
