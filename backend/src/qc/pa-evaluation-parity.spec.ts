import {
  createPaSpecSnapshot,
  evaluatePaParameters,
  fingerprintStableJson,
} from './pa-correction-evaluation';
import { SpecificationProvider } from './providers/specification.provider';
import { evaluateCoalAnalysis } from './constants/coal-specification';
import {
  evaluatePacAnalysis,
  evaluateRapidKlenAnalysis,
} from './constants/chemical-specification';

const provider = new SpecificationProvider();
const coalVisual = {
  kondisi: 'Kering (Tidak Basah)',
  warna: 'Hitam',
  levelRank: 'High Rank Coal',
  kilap: 'Hitam Mengkilap',
  bahanPengotor: 'Tidak ada kontaminasi batuan maupun tanah',
};
const sensory = {
  visual: 'Kuning',
  foreignMatters: 'Tidak ada kontaminasi',
  packagingLabel: 'Kemasan & label tidak rusak',
};
describe('Frozen PA evaluation parity', () => {
  it.each([
    ['COAL_5600_6000', 33],
    ['COAL_GT_6000', 25],
  ] as const)(
    'matches coal %s threshold %s and laboratory rounds',
    (calorieBand, maximum) => {
      for (const testRound of [1, 2])
        for (const totalMoisture of [maximum, maximum + 0.01])
          for (const visual of [
            coalVisual,
            { ...coalVisual, warna: 'Lainnya' },
          ]) {
            const parameters = { calorieBand, totalMoisture, visual };
            const normal = evaluateCoalAnalysis({ ...parameters, testRound });
            expect(
              evaluatePaParameters(
                'COAL_PA',
                parameters,
                testRound,
                createPaSpecSnapshot('COAL_PA', provider),
              ),
            ).toMatchObject({ result: normal.result, status: normal.decision });
          }
    },
  );
  it.each([
    [3.5, 1.17],
    [3.5, 1.26],
    [5, 1.17],
    [5, 1.26],
    [5.01, 1.26],
    [4, 1.16],
  ])('matches PAC inclusive pH %s/density %s', (ph, density) => {
    const parameters = { ph, density, sensory };
    const normal = evaluatePacAnalysis(parameters);
    expect(
      evaluatePaParameters(
        'PAC_PA',
        parameters,
        1,
        createPaSpecSnapshot('PAC_PA', provider),
      ),
    ).toMatchObject({ result: normal.result, status: normal.decision });
  });
  it('matches all Rapid strict equality boundaries independently', () => {
    const pass = {
      alkalinityNa2O: 35.01,
      alkalinityNaOH: 45.17,
      ph: 12.01,
      density: 1.401,
      sensory: { ...sensory, visual: 'Jernih' },
    };
    for (const patch of [
      {},
      { alkalinityNa2O: 35 },
      { alkalinityNaOH: 45.16 },
      { ph: 12 },
      { density: 1.4 },
    ]) {
      const parameters = { ...pass, ...patch };
      const normal = evaluateRapidKlenAnalysis(parameters);
      expect(
        evaluatePaParameters(
          'RAPID_KLEN_PA',
          parameters,
          1,
          createPaSpecSnapshot('RAPID_KLEN_PA', provider),
        ),
      ).toMatchObject({ result: normal.result, status: normal.decision });
    }
  });
  it('uses historical snapshot rules even if current evaluator would PASS', () => {
    const snapshot = createPaSpecSnapshot('PAC_PA', provider);
    snapshot.effectiveThresholds.phMax = 4;
    const { snapshotFingerprint: _, ...payload } = snapshot;
    snapshot.snapshotFingerprint = fingerprintStableJson(payload);
    const parameters = { ph: 4.5, density: 1.2, sensory };
    expect(evaluatePacAnalysis(parameters).result).toBe('PASS');
    expect(
      evaluatePaParameters('PAC_PA', parameters, 1, snapshot),
    ).toMatchObject({ result: 'REJECT', status: 'WAITING_DISPOSITION' });
  });
  it.each([null, true, '4.5', Infinity, NaN, undefined])(
    'rejects malformed measurement %s',
    (ph) => {
      expect(() =>
        evaluatePaParameters(
          'PAC_PA',
          { ph, density: 1.2, sensory },
          1,
          createPaSpecSnapshot('PAC_PA', provider),
        ),
      ).toThrow();
    },
  );
  it('rejects incomplete frozen rules even when their fingerprint matches', () => {
    const snapshot = createPaSpecSnapshot('PAC_PA', provider);
    delete snapshot.effectiveThresholds.phMin;
    const { snapshotFingerprint: _, ...payload } = snapshot;
    snapshot.snapshotFingerprint = fingerprintStableJson(payload);
    expect(() =>
      evaluatePaParameters(
        'PAC_PA',
        { ph: 4, density: 1.2, sensory },
        1,
        snapshot,
      ),
    ).toThrow(/snapshot/i);
  });
  it('rejects snapshot corruption', () => {
    const snapshot = createPaSpecSnapshot('PAC_PA', provider);
    snapshot.effectiveThresholds.phMax = 99;
    expect(() =>
      evaluatePaParameters(
        'PAC_PA',
        { ph: 4, density: 1.2, sensory },
        1,
        snapshot,
      ),
    ).toThrow(/fingerprint/);
  });
});
