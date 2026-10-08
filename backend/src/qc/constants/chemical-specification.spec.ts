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
} from './chemical-specification';

describe('Chemical Quality Specifications (SOP-GSP-2026.1 Rev 2.1)', () => {
  describe('PAC (Poly Aluminium Chloride)', () => {
    const validPacSensory = {
      visual: 'Kuning',
      foreignMatters: 'Tidak ada kontaminasi',
      packagingLabel: 'Kemasan & label tidak rusak',
    };

    it('evaluates PAC with valid parameters as PASS / RELEASE under ACTIVE_CONFIGURED', () => {
      const res = evaluatePacAnalysis(
        {
          sensory: validPacSensory,
          ph: 4.2,
          density: 1.21,
        },
        'PAC 280 AC',
        OPERATIONAL_PAC_SPEC_METADATA,
      );
      expect(res.isCompliant).toBe(true);
      expect(res.result).toBe('PASS');
      expect(res.decision).toBe('RELEASE');
      expect(res.specMetadata.ruleStatus).toBe('ACTIVE_CONFIGURED');
      expect(res.violations).toHaveLength(0);
    });

    it('accepts both Kuning and Coklat Jernih visual for PAC', () => {
      const resKuning = evaluatePacAnalysis({
        sensory: { ...validPacSensory, visual: 'Kuning' },
        ph: 4.0,
        density: 1.2,
      });
      expect(resKuning.result).toBe('PASS');

      const resCoklat = evaluatePacAnalysis({
        sensory: { ...validPacSensory, visual: 'Coklat Jernih' },
        ph: 4.0,
        density: 1.2,
      });
      expect(resCoklat.result).toBe('PASS');

      const resKeruh = evaluatePacAnalysis({
        sensory: { ...validPacSensory, visual: 'Keruh' },
        ph: 4.0,
        density: 1.2,
      });
      expect(resKeruh.result).toBe('REJECT');
    });

    it('should evaluate PAC boundaries inclusively without requiring Al2O3 under ACTIVE_CONFIGURED', () => {
      const res1 = evaluatePacAnalysis(
        {
          sensory: {
            visual: 'Kuning',
            foreignMatters: 'Tidak ada kontaminasi',
            packagingLabel: 'Kemasan & label tidak rusak',
          },
          ph: 3.5, // exact lower limit
          density: 1.17, // exact lower limit
        },
        'PAC 280 AC',
        OPERATIONAL_PAC_SPEC_METADATA,
      );
      expect(res1.decision).toBe('RELEASE');
      expect(res1.result).toBe('PASS');

      const res2 = evaluatePacAnalysis(
        {
          sensory: {
            visual: 'Coklat Jernih',
            foreignMatters: 'Tidak ada kontaminasi',
            packagingLabel: 'Kemasan & label tidak rusak',
          },
          ph: 5.0, // exact upper limit
          density: 1.26, // exact upper limit
        },
        'PAC 280 AC',
        OPERATIONAL_PAC_SPEC_METADATA,
      );
      expect(res2.decision).toBe('RELEASE');
      expect(res2.result).toBe('PASS');
    });

    it('should fail PAC when pH or density are outside inclusive boundaries', () => {
      const resLowPh = evaluatePacAnalysis(
        { sensory: validPacSensory, ph: 3.49, density: 1.2 },
        'PAC 280 AC',
        OPERATIONAL_PAC_SPEC_METADATA,
      );
      expect(resLowPh.result).toBe('REJECT');
      expect(resLowPh.decision).toBe('REJECT');

      const resHighPh = evaluatePacAnalysis(
        { sensory: validPacSensory, ph: 5.01, density: 1.2 },
        'PAC 280 AC',
        OPERATIONAL_PAC_SPEC_METADATA,
      );
      expect(resHighPh.result).toBe('REJECT');

      const resLowDens = evaluatePacAnalysis(
        { sensory: validPacSensory, ph: 4.0, density: 1.169 },
        'PAC 280 AC',
        OPERATIONAL_PAC_SPEC_METADATA,
      );
      expect(resLowDens.result).toBe('REJECT');

      const resHighDens = evaluatePacAnalysis(
        { sensory: validPacSensory, ph: 4.0, density: 1.261 },
        'PAC 280 AC',
        OPERATIONAL_PAC_SPEC_METADATA,
      );
      expect(resHighDens.result).toBe('REJECT');
    });

    it('rejects when packaging is compromised', () => {
      const res = evaluatePacAnalysis({
        sensory: { ...validPacSensory, packagingLabel: 'Kemasan rusak' },
        ph: 4.2,
        density: 1.21,
      });
      expect(res.result).toBe('REJECT');
      expect(res.decision).toBe('REJECT');
    });

    it('ADVERSARIAL: rejects PAC when visual is boolean true or foreign matters/packaging omitted', () => {
      // visual = true (legacy boolean) must not authorize PASS
      const resBooleanVisual = evaluatePacAnalysis({
        sensory: {
          visual: true,
          foreignMatters: 'Tidak ada kontaminasi',
          packagingLabel: 'Kemasan & label tidak rusak',
        },
        ph: 4.2,
        density: 1.21,
      });
      expect(resBooleanVisual.result).toBe('REJECT');
      expect(resBooleanVisual.decision).toBe('REJECT');

      // foreignMatters omitted must not PASS
      const resOmittedForeign = evaluatePacAnalysis({
        sensory: { visual: 'Kuning' },
        ph: 4.2,
        density: 1.21,
      });
      expect(resOmittedForeign.result).toBe('REJECT');
      expect(resOmittedForeign.decision).toBe('REJECT');

      // packaging omitted must not PASS
      const resOmittedPkg = evaluatePacAnalysis({
        sensory: {
          visual: 'Kuning',
          foreignMatters: 'Tidak ada kontaminasi',
        },
        ph: 4.2,
        density: 1.21,
      });
      expect(resOmittedPkg.result).toBe('REJECT');
      expect(resOmittedPkg.decision).toBe('REJECT');
    });

    it('P0-04: Al2O3 does NOT participate in compliance decision (arbitrary/low Al2O3 still PASSES)', () => {
      const resLowAlumina = evaluatePacAnalysis({
        sensory: validPacSensory,
        ph: 4.2,
        density: 1.21,
        aluminaContent: 3.5, // Well below old 9.0 threshold
      });
      expect(resLowAlumina.result).toBe('PASS');
      expect(resLowAlumina.decision).toBe('RELEASE');
      expect(resLowAlumina.violations).toHaveLength(0);
    });
  });

  describe('Rapid Klen / PRO-CIP B++ (Alkaline CIP)', () => {
    const validRapidSensory = {
      visual: 'Jernih',
      foreignMatters: 'Tidak ada kontaminasi',
      packagingLabel: 'Kemasan & label tidak rusak',
    };

    it('should enforce strict greater-than limits for Rapid Klen (exact boundary fails)', () => {
      // Exact boundary on Na2O fails
      expect(
        evaluateRapidKlenAnalysis(
          {
            sensory: validRapidSensory,
            alkalinityNa2O: 35.0,
            alkalinityNaOH: 45.17,
            ph: 12.001,
            density: 1.401,
          },
          'Rapid Klen',
          OPERATIONAL_RAPID_KLEN_SPEC_METADATA,
        ).result,
      ).toBe('REJECT');

      // Exact boundary on NaOH fails
      expect(
        evaluateRapidKlenAnalysis(
          {
            sensory: validRapidSensory,
            alkalinityNa2O: 35.01,
            alkalinityNaOH: 45.16,
            ph: 12.001,
            density: 1.401,
          },
          'Rapid Klen',
          OPERATIONAL_RAPID_KLEN_SPEC_METADATA,
        ).result,
      ).toBe('REJECT');

      // Exact boundary on pH fails
      expect(
        evaluateRapidKlenAnalysis(
          {
            sensory: validRapidSensory,
            alkalinityNa2O: 35.01,
            alkalinityNaOH: 45.17,
            ph: 12.0,
            density: 1.401,
          },
          'Rapid Klen',
          OPERATIONAL_RAPID_KLEN_SPEC_METADATA,
        ).result,
      ).toBe('REJECT');

      // Exact boundary on Density fails
      expect(
        evaluateRapidKlenAnalysis(
          {
            sensory: validRapidSensory,
            alkalinityNa2O: 35.01,
            alkalinityNaOH: 45.17,
            ph: 12.001,
            density: 1.4,
          },
          'Rapid Klen',
          OPERATIONAL_RAPID_KLEN_SPEC_METADATA,
        ).result,
      ).toBe('REJECT');

      // Strictly greater passes
      const passRes = evaluateRapidKlenAnalysis(
        {
          sensory: validRapidSensory,
          alkalinityNa2O: 35.01,
          alkalinityNaOH: 45.17,
          ph: 12.001,
          density: 1.401,
        },
        'Rapid Klen',
        OPERATIONAL_RAPID_KLEN_SPEC_METADATA,
      );
      expect(passRes.decision).toBe('RELEASE');
      expect(passRes.result).toBe('PASS');
    });

    it('rejects when Rapid Klen visual is not Jernih', () => {
      const res = evaluateRapidKlenAnalysis({
        sensory: { ...validRapidSensory, visual: 'Keruh' },
        alkalinityNa2O: 36.0,
        alkalinityNaOH: 46.0,
        ph: 13.0,
        density: 1.45,
      });
      expect(res.result).toBe('REJECT');
      expect(res.decision).toBe('REJECT');
    });

    it('P0-05 ADVERSARIAL: Rapid Klen requires NaOH (omitted NaOH must NOT RELEASE)', () => {
      const resNoNaOH = evaluateRapidKlenAnalysis({
        sensory: validRapidSensory,
        alkalinityNa2O: 36.0,
        alkalinityNaOH: undefined as any,
        ph: 13.0,
        density: 1.45,
      });
      expect(resNoNaOH.result).toBe('REJECT');
      expect(resNoNaOH.decision).toBe('REJECT');
      expect(resNoNaOH.violations).toContain(
        'Kadar Alkalinitas NaOH wajib diisi',
      );
    });

    it('P0-06 ADVERSARIAL: Rapid Klen sensory mandatory (boolean true or omitted sensory fields must NOT RELEASE)', () => {
      // visual = true must not authorize PASS
      const resBoolVisual = evaluateRapidKlenAnalysis({
        sensory: {
          visual: true,
          foreignMatters: 'Tidak ada kontaminasi',
          packagingLabel: 'Kemasan & label tidak rusak',
        },
        alkalinityNa2O: 36.0,
        alkalinityNaOH: 46.0,
        ph: 13.0,
        density: 1.45,
      });
      expect(resBoolVisual.result).toBe('REJECT');
      expect(resBoolVisual.decision).toBe('REJECT');

      // foreignMatters omitted
      const resNoForeign = evaluateRapidKlenAnalysis({
        sensory: { visual: 'Jernih' },
        alkalinityNa2O: 36.0,
        alkalinityNaOH: 46.0,
        ph: 13.0,
        density: 1.45,
      });
      expect(resNoForeign.result).toBe('REJECT');
      expect(resNoForeign.decision).toBe('REJECT');

      // packaging omitted
      const resNoPkg = evaluateRapidKlenAnalysis({
        sensory: {
          visual: 'Jernih',
          foreignMatters: 'Tidak ada kontaminasi',
        },
        alkalinityNa2O: 36.0,
        alkalinityNaOH: 46.0,
        ph: 13.0,
        density: 1.45,
      });
      expect(resNoPkg.result).toBe('REJECT');
      expect(resNoPkg.decision).toBe('REJECT');
    });
  });
});
