import {
  COAL_CALORIE_SPECIFICATIONS,
  DEFAULT_COAL_CALORIE,
  getCoalMoistureLimit,
  evaluateCoalAnalysis,
  TEST_FIXTURE_COAL_SPEC_METADATA,
  OPERATIONAL_COAL_SPEC_METADATA,
} from './coal-specification';

describe('Coal Specification and Evaluation Policy (SOP-GSP-2026.1 - No Utility Flow)', () => {
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

  it('enforces that OPERATIONAL_COAL_SPEC_METADATA is PENDING_SIGNOFF with null approver (Provenance Audit Gate)', () => {
    expect(OPERATIONAL_COAL_SPEC_METADATA.approvalStatus).toBe(
      'PENDING_SIGNOFF',
    );
    expect(OPERATIONAL_COAL_SPEC_METADATA.approvedBy).toBeNull();
    expect(OPERATIONAL_COAL_SPEC_METADATA.approvedAt).toBeNull();
    expect(OPERATIONAL_COAL_SPEC_METADATA.version).toBe('1.0.0-provisional');
  });

  it('keeps TEST_FIXTURE_COAL_SPEC_METADATA as simulated APPROVED isolated for automated test harnesses', () => {
    expect(TEST_FIXTURE_COAL_SPEC_METADATA.approvalStatus).toBe('APPROVED');
    expect(TEST_FIXTURE_COAL_SPEC_METADATA.approvedBy).toBe('QA_MOCK_LEAD');
  });

  it('evaluates PASS / RELEASE candidate under operational specification when moisture within limit', () => {
    const evalResult = evaluateCoalAnalysis({
      targetCalorie: '4200',
      totalMoisture: 31.5,
      testRound: 1,
      sensoryPassed: true,
    });

    expect(evalResult.result).toBe('PASS');
    expect(evalResult.decision).toBe('RELEASE');
    expect(evalResult.isWithinSpec).toBe(true);
    expect(evalResult.specMetadata.approvalStatus).toBe('PENDING_SIGNOFF');
    expect(evalResult.notes).toContain('Lulus spesifikasi kadar air batubara');
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

  it('triggers RETEST_REQUIRED in Round 1 and strict REJECT in Round 2 (NO Utility disposition)', () => {
    const round1Result = evaluateCoalAnalysis({
      targetCalorie: '5500',
      totalMoisture: 28.5,
      testRound: 1,
      sensoryPassed: true,
    });

    expect(round1Result.result).toBe('REJECT');
    expect(round1Result.decision).toBe('RETEST_REQUIRED');
    expect(round1Result.maxAllowedMoisture).toBe(26.0);
    expect(round1Result.notes).toContain('Diperlukan uji ulang (Round 2)');

    const round2Result = evaluateCoalAnalysis({
      targetCalorie: '5500',
      totalMoisture: 28.5,
      testRound: 2,
      sensoryPassed: true,
    });

    expect(round2Result.result).toBe('REJECT');
    expect(round2Result.decision).toBe('REJECT');
    expect(round2Result.maxAllowedMoisture).toBe(26.0);
    expect(round2Result.notes).toContain(
      'Muatan ditolak (QC_VEHICLE_REJECTED)',
    );
    expect(round2Result.notes).not.toContain('Utility');
  });

  it('triggers RETEST_REQUIRED in Round 1 when moisture exceeds 26% on GAR 5500 under approved specification', () => {
    const evalResult = evaluateCoalAnalysis(
      {
        targetCalorie: '5500',
        totalMoisture: 28.5,
        testRound: 1,
        sensoryPassed: true,
      },
      TEST_FIXTURE_COAL_SPEC_METADATA,
    );

    expect(evalResult.result).toBe('REJECT');
    expect(evalResult.decision).toBe('RETEST_REQUIRED');
    expect(evalResult.maxAllowedMoisture).toBe(26.0);
    expect(evalResult.notes).toContain('Kadar air melebihi batas spesifikasi');
  });

  it('triggers strict REJECT in Round 2 when moisture still exceeds limit (NO Utility disposition)', () => {
    const evalResult = evaluateCoalAnalysis(
      {
        targetCalorie: '5500',
        totalMoisture: 27.2,
        testRound: 2,
        sensoryPassed: true,
      },
      TEST_FIXTURE_COAL_SPEC_METADATA,
    );

    expect(evalResult.result).toBe('REJECT');
    expect(evalResult.decision).toBe('REJECT');
    expect(evalResult.maxAllowedMoisture).toBe(26.0);
    expect(evalResult.notes).toContain('Muatan ditolak (QC_VEHICLE_REJECTED)');
  });

  it('immediately rejects if sensory check fails on approved specification', () => {
    const evalResult = evaluateCoalAnalysis(
      {
        targetCalorie: '4200',
        totalMoisture: 22.0,
        testRound: 1,
        sensoryPassed: false,
      },
      TEST_FIXTURE_COAL_SPEC_METADATA,
    );

    expect(evalResult.result).toBe('REJECT');
    expect(evalResult.decision).toBe('REJECT');
  });
});
