import {
  CONFIGURED_COAL_CALORIE_BANDS,
  validateCoalVisual,
  evaluateCoalAnalysis,
  TEST_FIXTURE_COAL_SPEC_METADATA,
  OPERATIONAL_COAL_SPEC_METADATA,
  CoalVisualParameters,
} from './coal-specification';

describe('Coal Specification and Evaluation Policy (SOP-GSP-2026.1 Rev 2.1)', () => {
  const validVisual: CoalVisualParameters = {
    kondisi: 'Kering (Tidak Basah)',
    warna: 'Hitam',
    levelRank: 'Medium Rank Coal',
    kilap: 'Hitam Mengkilap',
    bahanPengotor: 'Tidak ada kontaminasi batuan maupun tanah',
  };

  it('correctly locks only the two configured calorie bands: COAL_5600_6000 (33%) and COAL_GT_6000 (25%)', () => {
    expect(
      CONFIGURED_COAL_CALORIE_BANDS['COAL_5600_6000'].maxTotalMoisturePct,
    ).toBe(33.0);
    expect(
      CONFIGURED_COAL_CALORIE_BANDS['COAL_GT_6000'].maxTotalMoisturePct,
    ).toBe(25.0);
    expect(CONFIGURED_COAL_CALORIE_BANDS['4200']).toBeUndefined();
    expect(CONFIGURED_COAL_CALORIE_BANDS['3800']).toBeUndefined();
  });

  it('enforces that OPERATIONAL_COAL_SPEC_METADATA is ACTIVE_CONFIGURED with null approver', () => {
    expect(OPERATIONAL_COAL_SPEC_METADATA.ruleStatus).toBe('ACTIVE_CONFIGURED');
    expect(OPERATIONAL_COAL_SPEC_METADATA.approvedBy).toBeNull();
    expect(OPERATIONAL_COAL_SPEC_METADATA.approvedAt).toBeNull();
    expect(OPERATIONAL_COAL_SPEC_METADATA.version).toBe('2026.1-active');
  });

  it('keeps TEST_FIXTURE_COAL_SPEC_METADATA as simulated TEST_FIXTURE for automated test harnesses', () => {
    expect(TEST_FIXTURE_COAL_SPEC_METADATA.ruleStatus).toBe('TEST_FIXTURE');
    expect(TEST_FIXTURE_COAL_SPEC_METADATA.approvedBy).toBe('QA_MOCK_LEAD');
  });

  it('validates factual visual parameters correctly', () => {
    expect(validateCoalVisual(validVisual)).toBe(true);
    expect(validateCoalVisual({ ...validVisual, kondisi: 'Basah' })).toBe(
      false,
    );
    expect(validateCoalVisual({ ...validVisual, warna: 'Merah' })).toBe(false);
    expect(
      validateCoalVisual({ ...validVisual, levelRank: 'Unknown Rank' }),
    ).toBe(false);
    expect(validateCoalVisual({ ...validVisual, kilap: 'Pudar' })).toBe(false);
    expect(
      validateCoalVisual({
        ...validVisual,
        bahanPengotor: 'Banyak batu dan tanah',
      }),
    ).toBe(false);
    expect(validateCoalVisual(null)).toBe(false);
    expect(validateCoalVisual(undefined)).toBe(false);
  });

  it('should evaluate COAL_5600_6000 with TM <= 33.0% and valid factual visual as PASS / RELEASE under ACTIVE_CONFIGURED', () => {
    const res = evaluateCoalAnalysis(
      {
        calorieBand: 'COAL_5600_6000',
        totalMoisture: 32.5,
        testRound: 1,
        visual: validVisual,
      },
      OPERATIONAL_COAL_SPEC_METADATA,
    );
    expect(res.decision).toBe('RELEASE');
    expect(res.result).toBe('PASS');
    expect(res.isWithinSpec).toBe(true);
    expect(res.maxAllowedMoisture).toBe(33.0);
    expect(res.ruleStatus).toBe('ACTIVE_CONFIGURED');
  });

  it('should evaluate COAL_GT_6000 with TM <= 25.0% and valid factual visual as PASS / RELEASE under ACTIVE_CONFIGURED', () => {
    const res = evaluateCoalAnalysis(
      {
        calorieBand: 'COAL_GT_6000',
        totalMoisture: 24.8,
        testRound: 1,
        visual: validVisual,
      },
      OPERATIONAL_COAL_SPEC_METADATA,
    );
    expect(res.decision).toBe('RELEASE');
    expect(res.result).toBe('PASS');
    expect(res.isWithinSpec).toBe(true);
    expect(res.maxAllowedMoisture).toBe(25.0);
  });

  it('ADVERSARIAL CASE A: Round 1 factual visual OOS with client visualPassed=true must RETEST_REQUIRED, not final reject', () => {
    const badVisual = { ...validVisual, kondisi: 'Basah' };
    const res = evaluateCoalAnalysis(
      {
        calorieBand: 'COAL_5600_6000',
        totalMoisture: 28.0, // TM is compliant (<= 33.0%)
        testRound: 1,
        visual: badVisual,
        visualPassed: true, // CLIENT ADVERSARIAL INJECTION
      },
      OPERATIONAL_COAL_SPEC_METADATA,
    );
    expect(res.result).toBe('REJECT');
    expect(res.decision).toBe('RETEST_REQUIRED');
  });

  it('ADVERSARIAL CASE B: Round 2 factual visual OOS with client visualPassed=true must final REJECT', () => {
    const badVisual = { ...validVisual, kondisi: 'Basah' };
    const res = evaluateCoalAnalysis(
      {
        calorieBand: 'COAL_5600_6000',
        totalMoisture: 28.0, // TM is compliant
        testRound: 2,
        visual: badVisual,
        visualPassed: true, // CLIENT ADVERSARIAL INJECTION
      },
      OPERATIONAL_COAL_SPEC_METADATA,
    );
    expect(res.result).toBe('REJECT');
    expect(res.decision).toBe('REJECT');
  });

  it('should trigger RETEST_REQUIRED on Round 1 for moisture OOS and strict REJECT on Round 2', () => {
    const r1 = evaluateCoalAnalysis(
      {
        calorieBand: 'COAL_5600_6000',
        totalMoisture: 34.5,
        testRound: 1,
        visual: validVisual,
      },
      OPERATIONAL_COAL_SPEC_METADATA,
    );
    expect(r1.result).toBe('REJECT');
    expect(r1.decision).toBe('RETEST_REQUIRED');

    const r2 = evaluateCoalAnalysis(
      {
        calorieBand: 'COAL_5600_6000',
        totalMoisture: 34.0,
        testRound: 2,
        visual: validVisual,
      },
      OPERATIONAL_COAL_SPEC_METADATA,
    );
    expect(r2.result).toBe('REJECT');
    expect(r2.decision).toBe('REJECT');
  });

  it('should trigger RETEST_REQUIRED on Round 1 for combined moisture & visual OOS and strict REJECT on Round 2', () => {
    const badVisual = { ...validVisual, kondisi: 'Basah' };
    const r1 = evaluateCoalAnalysis(
      {
        calorieBand: 'COAL_5600_6000',
        totalMoisture: 35.0,
        testRound: 1,
        visual: badVisual,
      },
      OPERATIONAL_COAL_SPEC_METADATA,
    );
    expect(r1.result).toBe('REJECT');
    expect(r1.decision).toBe('RETEST_REQUIRED');

    const r2 = evaluateCoalAnalysis(
      {
        calorieBand: 'COAL_5600_6000',
        totalMoisture: 35.0,
        testRound: 2,
        visual: badVisual,
      },
      OPERATIONAL_COAL_SPEC_METADATA,
    );
    expect(r2.result).toBe('REJECT');
    expect(r2.decision).toBe('REJECT');
  });

  it('should return isConfigured=false and error=SPEC_NOT_CONFIGURED for unknown calorie band', () => {
    const res = evaluateCoalAnalysis(
      {
        calorieBand: 'COAL_4200',
        totalMoisture: 30.0,
        testRound: 1,
        visual: validVisual,
      },
      OPERATIONAL_COAL_SPEC_METADATA,
    );
    expect(res.isConfigured).toBe(false);
    expect(res.error).toBe('SPEC_NOT_CONFIGURED');
  });

  describe('P0-03 Adversarial: Missing, negative, and invalid moisture must NEVER RELEASE even with 100% visual PASS', () => {
    it('treats missing or undefined moisture as INVALID_MOISTURE_MEASUREMENT without making PASS/REJECT decisions', () => {
      const r1 = evaluateCoalAnalysis(
        {
          calorieBand: 'COAL_5600_6000',
          totalMoisture: undefined as any,
          testRound: 1,
          visual: validVisual,
        },
        OPERATIONAL_COAL_SPEC_METADATA,
      );
      expect(r1.error).toBe('INVALID_MOISTURE_MEASUREMENT');
      expect(r1.result).toBeUndefined();
      expect(r1.decision).toBeUndefined();
      expect(r1.isWithinSpec).toBe(false);

      const r2 = evaluateCoalAnalysis(
        {
          calorieBand: 'COAL_5600_6000',
          totalMoisture: undefined as any,
          testRound: 2,
          visual: validVisual,
        },
        OPERATIONAL_COAL_SPEC_METADATA,
      );
      expect(r2.error).toBe('INVALID_MOISTURE_MEASUREMENT');
      expect(r2.result).toBeUndefined();
      expect(r2.decision).toBeUndefined();
      expect(r2.isWithinSpec).toBe(false);
    });

    it('treats moisture null or NaN as INVALID_MOISTURE_MEASUREMENT without making PASS/REJECT decisions', () => {
      const resNull = evaluateCoalAnalysis(
        {
          calorieBand: 'COAL_5600_6000',
          totalMoisture: null as any,
          testRound: 1,
          visual: validVisual,
        },
        OPERATIONAL_COAL_SPEC_METADATA,
      );
      expect(resNull.error).toBe('INVALID_MOISTURE_MEASUREMENT');
      expect(resNull.result).toBeUndefined();
      expect(resNull.decision).toBeUndefined();
      expect(resNull.isWithinSpec).toBe(false);

      const resNan = evaluateCoalAnalysis(
        {
          calorieBand: 'COAL_5600_6000',
          totalMoisture: NaN,
          testRound: 1,
          visual: validVisual,
        },
        OPERATIONAL_COAL_SPEC_METADATA,
      );
      expect(resNan.error).toBe('INVALID_MOISTURE_MEASUREMENT');
      expect(resNan.result).toBeUndefined();
      expect(resNan.decision).toBeUndefined();
    });

    it('treats negative moisture (e.g. -5.0%) as INVALID_MOISTURE_MEASUREMENT without making PASS/REJECT decisions', () => {
      const resNeg = evaluateCoalAnalysis(
        {
          calorieBand: 'COAL_5600_6000',
          totalMoisture: -5.0,
          testRound: 2, // Even on Round 2, must NOT issue material REJECT
        },
        OPERATIONAL_COAL_SPEC_METADATA,
      );
      expect(resNeg.error).toBe('INVALID_MOISTURE_MEASUREMENT');
      expect(resNeg.result).toBeUndefined();
      expect(resNeg.decision).toBeUndefined();
      expect(resNeg.isWithinSpec).toBe(false);
    });

    it('treats moisture exceeding 100% (e.g. 105.0%) as INVALID_MOISTURE_MEASUREMENT without making PASS/REJECT decisions', () => {
      const resOver = evaluateCoalAnalysis(
        {
          calorieBand: 'COAL_5600_6000',
          totalMoisture: 105.0,
          testRound: 2, // Even on Round 2, must NOT issue material REJECT
        },
        OPERATIONAL_COAL_SPEC_METADATA,
      );
      expect(resOver.error).toBe('INVALID_MOISTURE_MEASUREMENT');
      expect(resOver.result).toBeUndefined();
      expect(resOver.decision).toBeUndefined();
      expect(resOver.isWithinSpec).toBe(false);
    });
  });
});
