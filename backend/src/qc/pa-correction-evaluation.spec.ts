import {
  createPaSpecSnapshot,
  evaluatePaParameters,
  fingerprintStableJson,
  patchPaParameters,
  resolvePaProfile,
} from './pa-correction-evaluation';
import { SpecificationProvider } from './providers/specification.provider';

describe('PA correction evaluation', () => {
  const provider = new SpecificationProvider();
  it('resolves explicit transaction profile and rejects ambiguity', () => {
    expect(resolvePaProfile({}, { gspAnalysisProfile: 'PAC_PA' })).toBe(
      'PAC_PA',
    );
    expect(() =>
      resolvePaProfile({}, { cargoType: 'unknown', cargoSubType: 'unknown' }),
    ).toThrow(/tidak dapat ditentukan/);
    expect(() =>
      resolvePaProfile(
        { analysisProfile: 'COAL_PA' },
        { gspAnalysisProfile: 'PAC_PA' },
      ),
    ).toThrow(/bertentangan/);
    expect(() =>
      resolvePaProfile(
        {},
        {
          gspAnalysisProfile: 'PAC_PA',
          productCatalog: { gspAnalysisProfile: 'RAPID_KLEN_PA' },
        },
      ),
    ).toThrow(/bertentangan/);
    expect(() =>
      resolvePaProfile({ productCategory: 'COAL', productName: 'PAC' }, {}),
    ).toThrow(/ambigu/);
  });
  it('fingerprints factual JSON independent of key order and binds timestamps', () => {
    expect(fingerprintStableJson({ b: 2, a: { d: 4, c: 3 } })).toBe(
      fingerprintStableJson({ a: { c: 3, d: 4 }, b: 2 }),
    );
    expect(fingerprintStableJson({ at: new Date('2026-10-01') })).not.toBe(
      fingerprintStableJson({ at: new Date('2026-10-02') }),
    );
  });
  it('snapshots actual provider metadata and frozen rules', () => {
    const snapshot = createPaSpecSnapshot('PAC_PA', provider);
    expect(snapshot.provider).toEqual(provider.getPacSpec());
    expect(snapshot.effectiveThresholds).toMatchObject({
      phMin: 3.5,
      phMax: 5,
      densityMin: 1.17,
      densityMax: 1.26,
    });
    expect(snapshot.snapshotFingerprint).toBe(
      fingerprintStableJson({
        schemaVersion: 1,
        profile: snapshot.profile,
        provider: snapshot.provider,
        effectiveThresholds: snapshot.effectiveThresholds,
        sensoryRules: snapshot.sensoryRules,
      }),
    );
  });
  it('preserves actual decision semantics, including coal round 2', () => {
    const snapshot = createPaSpecSnapshot('COAL_PA', provider);
    const base = {
      calorieBand: 'COAL_5600_6000',
      totalMoisture: 33,
      visual: {
        kondisi: 'Kering (Tidak Basah)',
        warna: 'Hitam',
        levelRank: 'High Rank Coal',
        kilap: 'Hitam Mengkilap',
        bahanPengotor: 'Tidak ada kontaminasi batuan maupun tanah',
      },
    };
    expect(evaluatePaParameters('COAL_PA', base, 1, snapshot).status).toBe(
      'RELEASE',
    );
    expect(
      evaluatePaParameters(
        'COAL_PA',
        { ...base, totalMoisture: 33.1 },
        1,
        snapshot,
      ).status,
    ).toBe('RETEST_REQUIRED');
    expect(
      evaluatePaParameters(
        'COAL_PA',
        { ...base, totalMoisture: 33.1 },
        2,
        snapshot,
      ).status,
    ).toBe('REJECT');
    expect(() =>
      evaluatePaParameters(
        'COAL_PA',
        { ...base, visual: { ...base.visual, warna: '' } },
        1,
        snapshot,
      ),
    ).toThrow();
    expect(() =>
      evaluatePaParameters(
        'COAL_PA',
        { ...base, moisture: 1, totalMoisture: 2 },
        1,
        snapshot,
      ),
    ).toThrow(/konflik/);
  });
  it('synchronizes persisted factual aliases without silently ignoring an edit', () => {
    const coal = {
      moisture: 30,
      totalMoisture: 30,
      kondisi: 'Basah',
      visual: { kondisi: 'Basah', metadata: 'retained' },
    };
    expect(
      patchPaParameters(
        coal,
        { moisture: 25, visual: { kondisi: 'Kering (Tidak Basah)' } },
        'COAL_PA',
      ),
    ).toMatchObject({
      moisture: 25,
      totalMoisture: 25,
      kondisi: 'Kering (Tidak Basah)',
      visual: { kondisi: 'Kering (Tidak Basah)', metadata: 'retained' },
    });
    expect(() =>
      patchPaParameters(coal, { moisture: 20, totalMoisture: 25 }, 'COAL_PA'),
    ).toThrow(/konflik/);
    expect(() =>
      patchPaParameters(
        coal,
        { kondisi: 'A', visual: { kondisi: 'B' } },
        'COAL_PA',
      ),
    ).toThrow(/konflik/);
  });
  it('preserves legacy flat coal facts when editing nested visual measurements', () => {
    const original = {
      calorieBand: 'COAL_5600_6000',
      totalMoisture: 30,
      kondisi: 'Basah',
      warna: 'Hitam',
      levelRank: 'High Rank Coal',
      kilap: 'Hitam Mengkilap',
      bahanPengotor: 'Tidak ada kontaminasi batuan maupun tanah',
      metadata: { source: 'legacy lab' },
    };
    expect(
      fingerprintStableJson(
        patchPaParameters(
          original,
          { visual: { kondisi: original.kondisi } },
          'COAL_PA',
        ),
      ),
    ).toBe(fingerprintStableJson(original));
    const corrected = patchPaParameters(
      original,
      { visual: { kondisi: 'Kering (Tidak Basah)' } },
      'COAL_PA',
    );
    expect(corrected.visual).toEqual({
      kondisi: 'Kering (Tidak Basah)',
      warna: original.warna,
      levelRank: original.levelRank,
      kilap: original.kilap,
      bahanPengotor: original.bahanPengotor,
    });
    expect(corrected.kondisi).toBe('Kering (Tidak Basah)');
    expect(corrected.metadata).toEqual(original.metadata);
    expect(original.kondisi).toBe('Basah');
    expect(
      evaluatePaParameters(
        'COAL_PA',
        corrected,
        1,
        createPaSpecSnapshot('COAL_PA', provider),
      ).result,
    ).toBe('PASS');
  });
  it('patches allowlisted factual parameters and preserves unknown metadata', () => {
    const current = {
      ph: 4,
      density: 1.2,
      sensory: { visual: 'Kuning' },
      aluminaContent: 30,
      metadata: { source: 'lab' },
    };
    expect(
      patchPaParameters(
        current,
        { ph: 4.5, sensory: { visual: 'Coklat Jernih' } },
        'PAC_PA',
      ),
    ).toMatchObject({
      ph: 4.5,
      density: 1.2,
      aluminaContent: 30,
      metadata: { source: 'lab' },
      sensory: { visual: 'Coklat Jernih' },
    });
    expect(() =>
      patchPaParameters(current, { result: 'PASS' }, 'PAC_PA'),
    ).toThrow(/tidak boleh diubah/);
    expect(() =>
      patchPaParameters(current, { sensory: { metadata: 'unsafe' } }, 'PAC_PA'),
    ).toThrow(/nested/);
  });
});
