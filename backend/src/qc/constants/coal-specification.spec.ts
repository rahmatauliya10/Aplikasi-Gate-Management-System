import {
  COAL_CALORIE_SPECIFICATIONS,
  DEFAULT_COAL_CALORIE,
  getCoalMoistureLimit,
  evaluateCoalAnalysis,
  TEST_FIXTURE_COAL_SPEC_METADATA,
  OPERATIONAL_COAL_SPEC_METADATA,
} from './coal-specification';

describe('Coal Specification and Evaluation Policy (SOP-GSP-2026.1)', () => {
  it('correctly maps all calorie tiers to their specified moisture thresholds', () => {
    expect(COAL_CALORIE_SPECIFICATIONS['3800'].maxTotalMoisturePct).toBe(36.0);
    expect(COAL_CALORIE_SPECIFICATIONS['4200'].maxTotalMoisturePct).toBe(33.0);
    expect(COAL_CALORIE_SPECIFICATIONS['4800'].maxTotalMoisturePct).toBe(30.0);
    expect(COAL_CALORIE_SPECIFICATIONS['5000'].maxTotalMoisturePct).toBe(28.0);
    expect(COAL_CALORIE_SPECIFICATIONS['5500'].maxTotalMoisturePct).toBe(26.0);
    expect(DEFAULT_COAL_CALORIE).toBe('4200');
  });

  it('resolves moisture limits with fallback for unknown or missing calorie', () => {
    expect(getCoalMoistureLimit('4200')).toBe(33.0);
    expect(getCoalMoistureLimit('5500')).toBe(26.0);
    expect(getCoalMoistureLimit(undefined)).toBe(33.0);
    expect(getCoalMoistureLimit('9999')).toBe(33.0);
  });

  it('withholds automated RELEASE (returns PENDING_DISPOSITION) when operational spec is PENDING_SIGNOFF', () => {
    const evalResult = evaluateCoalAnalysis({
      targetCalorie: '4200',
      totalMoisture: 31.5,
      testRound: 1,
      sensoryPassed: true,
    });

    expect(evalResult.result).toBe('PASS');
    expect(evalResult.decision).toBe('PENDING_DISPOSITION');
    expect(evalResult.isWithinSpec).toBe(true);
    expect(evalResult.specMetadata.approvalStatus).toBe('PENDING_SIGNOFF');
    expect(evalResult.notes).toContain('Keputusan RELEASE otomatis ditahan');
  });

  it('evaluates PASS / RELEASE when within limit for standard GAR 4200 using approved fixture specification', () => {
    const evalResult = evaluateCoalAnalysis(
      {
        targetCalorie: '4200',
        totalMoisture: 31.5,
        testRound: 1,
        sensoryPassed: true,
      },
      TEST_FIXTURE_COAL_SPEC_METADATA,
    );

    expect(evalResult.result).toBe('PASS');
    expect(evalResult.decision).toBe('RELEASE');
    expect(evalResult.isWithinSpec).toBe(true);
    expect(evalResult.maxAllowedMoisture).toBe(33.0);
  });

  it('evaluates PASS / RELEASE for high-calorie GAR 5500 tier when <= 26% with approved fixture', () => {
    const evalResult = evaluateCoalAnalysis(
      {
        targetCalorie: '5500',
        totalMoisture: 25.4,
        testRound: 1,
        sensoryPassed: true,
      },
      TEST_FIXTURE_COAL_SPEC_METADATA,
    );

    expect(evalResult.result).toBe('PASS');
    expect(evalResult.decision).toBe('RELEASE');
    expect(evalResult.maxAllowedMoisture).toBe(26.0);
  });

  it('triggers RETEST_REQUIRED in Round 1 when moisture exceeds 26% on GAR 5500', () => {
    const evalResult = evaluateCoalAnalysis({
      targetCalorie: '5500',
      totalMoisture: 28.5,
      testRound: 1,
      sensoryPassed: true,
    });

    expect(evalResult.result).toBe('REJECT');
    expect(evalResult.decision).toBe('RETEST_REQUIRED');
    expect(evalResult.maxAllowedMoisture).toBe(26.0);
  });

  it('triggers PENDING_DISPOSITION in Round 2 when moisture still exceeds limit', () => {
    const evalResult = evaluateCoalAnalysis({
      targetCalorie: '5500',
      totalMoisture: 27.2,
      testRound: 2,
      sensoryPassed: true,
    });

    expect(evalResult.result).toBe('REJECT');
    expect(evalResult.decision).toBe('PENDING_DISPOSITION');
    expect(evalResult.maxAllowedMoisture).toBe(26.0);
  });

  it('immediately rejects if sensory check fails regardless of moisture', () => {
    const evalResult = evaluateCoalAnalysis({
      targetCalorie: '4200',
      totalMoisture: 22.0,
      testRound: 1,
      sensoryPassed: false,
    });

    expect(evalResult.result).toBe('REJECT');
    expect(evalResult.decision).toBe('REJECT');
  });
});
