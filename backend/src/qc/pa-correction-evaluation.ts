import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import {
  CONFIGURED_COAL_CALORIE_BANDS,
  SpecificationMetadata,
} from './constants/coal-specification';
import {
  PAC_SPECIFICATION,
  RAPID_KLEN_SPECIFICATION,
  ChemicalSpecificationMetadata,
} from './constants/chemical-specification';
import type { ISpecificationProvider } from './providers/specification.provider';

export type PaProfile = 'COAL_PA' | 'PAC_PA' | 'RAPID_KLEN_PA' | 'PA_EXEMPT';
export type PaResult = 'PASS' | 'REJECT';
export type PaEvaluationStatus =
  'RELEASE' | 'RETEST_REQUIRED' | 'REJECT' | 'WAITING_DISPOSITION';
type JsonObject = Record<string, any>;
type ProviderMetadata = SpecificationMetadata | ChemicalSpecificationMetadata;

export interface PaSpecSnapshot {
  schemaVersion: 1;
  profile: PaProfile;
  provider: ProviderMetadata;
  effectiveThresholds: JsonObject;
  sensoryRules: JsonObject;
  snapshotFingerprint: string;
}
export interface PaEvaluationProvenance {
  source: 'SNAPSHOT' | 'CORRECTION_TIME_CURRENT_SPEC';
  evaluatedAt?: string;
  evaluatedById?: string;
  provider?: ProviderMetadata;
  snapshotFingerprint: string;
}
export interface PaEvaluationResult {
  profile: PaProfile;
  testRound: number;
  result: PaResult;
  status: PaEvaluationStatus;
  parameters: JsonObject;
  failures: string[];
  violations: string[];
  snapshot: PaSpecSnapshot;
  snapshotFingerprint: string;
}
export interface PaRecordLike {
  analysisProfile?: unknown | null;
  specSnapshot?: unknown | null;
  productName?: unknown;
  productCategory?: unknown;
}
export interface PaTransactionLike {
  gspAnalysisProfile?: unknown | null;
  productCatalog?: {
    gspAnalysisProfile?: unknown | null;
    name?: unknown;
    category?: unknown;
  } | null;
  cargoType?: unknown;
  cargoSubType?: unknown;
}

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as JsonObject)
        .sort()
        .map((key) => [key, canonical((value as JsonObject)[key])]),
    );
  }
  return value;
}
export function stableJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}
export function fingerprintStableJson(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}
function bad(message: string): never {
  throw new BadRequestException(message);
}
function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    bad(`${label} harus berupa object.`);
  return value;
}
function profileValue(value: unknown): PaProfile | undefined {
  return typeof value === 'string' &&
    ['COAL_PA', 'PAC_PA', 'RAPID_KLEN_PA', 'PA_EXEMPT'].includes(value)
    ? (value as PaProfile)
    : undefined;
}
function finite(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    bad(`${field} harus berupa angka finite.`);
  return value;
}
function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '')
    bad(`${field} wajib berupa string faktual non-empty.`);
  return value;
}
function present(value: unknown): boolean {
  return value !== undefined && value !== null;
}
function canonicalAlias(
  raw: JsonObject,
  canonicalName: string,
  aliases: string[],
): unknown {
  const keys = [canonicalName, ...aliases].filter((key) => present(raw[key]));
  if (
    keys.length > 1 &&
    keys.some((key) => stableJson(raw[key]) !== stableJson(raw[keys[0]]))
  ) {
    bad(`Parameter alias ${keys.join(', ')} memiliki nilai yang konflik.`);
  }
  return raw[keys[0]];
}

function inferProfile(labels: unknown[]): PaProfile | undefined {
  const values = labels.map((value) =>
    typeof value === 'string' ? value.toUpperCase() : '',
  );
  const candidates = new Set<PaProfile>();
  const category = values[0] ?? '';
  const name = values[1] ?? '';
  const subtype = values[2] ?? '';
  if (
    category === 'COAL' ||
    category.includes('BATUBARA') ||
    name.includes('BATUBARA') ||
    subtype.includes('BATUBARA')
  )
    candidates.add('COAL_PA');
  if (
    name.includes('PAC') ||
    name.includes('POLYCOR') ||
    name.includes('IPAC') ||
    subtype.includes('PAC')
  )
    candidates.add('PAC_PA');
  if (
    name.includes('RAPID') ||
    name.includes('KLEN') ||
    name.includes('PRO-CIP') ||
    subtype.includes('RAPID') ||
    subtype.includes('KLEN')
  )
    candidates.add('RAPID_KLEN_PA');
  if (candidates.size > 1)
    bad('Profil PA legacy ambigu: kandidat produk bertentangan.');
  return [...candidates][0];
}

export function resolvePaProfile(
  pa: PaRecordLike,
  tx: PaTransactionLike,
): PaProfile {
  const snapshotProfile = pa.specSnapshot
    ? profileValue(object(pa.specSnapshot, 'specSnapshot').profile)
    : undefined;
  if (pa.specSnapshot && !snapshotProfile)
    bad('specSnapshot tidak memiliki profil PA valid.');
  const profiles = [
    pa.analysisProfile,
    tx.gspAnalysisProfile,
    tx.productCatalog?.gspAnalysisProfile,
  ];
  for (const value of profiles)
    if (value != null && !profileValue(value))
      bad('Profil PA tersimpan tidak valid.');
  const explicitProfiles = profiles
    .map(profileValue)
    .filter((value): value is PaProfile => value !== undefined);
  if (new Set(explicitProfiles).size > 1)
    bad('Profil PA, transaksi dan katalog bertentangan.');
  const explicit = explicitProfiles[0];
  const inferred = inferProfile([
    pa.productCategory ?? tx.productCatalog?.category ?? tx.cargoType,
    pa.productName ?? tx.productCatalog?.name,
    tx.cargoSubType,
  ]);
  for (const candidate of [snapshotProfile, explicit])
    if (candidate && inferred && candidate !== inferred)
      bad('Profil PA eksplisit tidak sesuai resolver legacy produk.');
  if (snapshotProfile && explicit && snapshotProfile !== explicit)
    bad('PA profile berbeda dari specification snapshot.');
  const profile = snapshotProfile ?? explicit ?? inferred;
  if (!profile) bad('PA profile tidak dapat ditentukan secara aman.');
  return profile;
}

function providerFor(
  provider: ISpecificationProvider,
  profile: PaProfile,
): ProviderMetadata {
  if (profile === 'COAL_PA') return provider.getCoalSpec();
  if (profile === 'PAC_PA') return provider.getPacSpec();
  return provider.getRapidKlenSpec();
}

export function createPaSpecSnapshot(
  profile: PaProfile,
  provider: ISpecificationProvider,
  options: { allowTestFixture?: boolean } = {},
): PaSpecSnapshot {
  if (profile === 'PA_EXEMPT')
    bad('PA_EXEMPT tidak memiliki snapshot spesifikasi.');
  const providerMetadata = providerFor(provider, profile);
  if (
    providerMetadata.ruleStatus !== 'ACTIVE_CONFIGURED' &&
    !options.allowTestFixture &&
    process.env.NODE_ENV !== 'test'
  ) {
    bad('Spesifikasi PA bukan ACTIVE_CONFIGURED; basis koreksi ditolak.');
  }
  const effectiveThresholds =
    profile === 'COAL_PA'
      ? { calorieBands: structuredClone(CONFIGURED_COAL_CALORIE_BANDS) }
      : profile === 'PAC_PA'
        ? { ...PAC_SPECIFICATION }
        : { ...RAPID_KLEN_SPECIFICATION };
  const sensoryRules =
    profile === 'COAL_PA'
      ? {
          kondisi: 'Kering (Tidak Basah)',
          warna: ['Hitam', 'Hitam Kecoklatan', 'Coklat'],
          levelRank: ['High Rank Coal', 'Medium Rank Coal', 'Low Rank Coal'],
          kilap: ['Hitam Mengkilap', 'Hitam Kecoklatan', 'Mudah Lapuk'],
          bahanPengotor: 'Tidak ada kontaminasi batuan maupun tanah',
        }
      : profile === 'PAC_PA'
        ? {
            visual: ['Kuning', 'Coklat Jernih'],
            foreignMatters: 'Tidak ada kontaminasi',
            packagingLabel: 'Kemasan & label tidak rusak',
          }
        : {
            visual: 'Jernih',
            foreignMatters: 'Tidak ada kontaminasi',
            packagingLabel: 'Kemasan & label tidak rusak',
          };
  const payload = {
    schemaVersion: 1 as const,
    profile,
    provider: providerMetadata,
    effectiveThresholds,
    sensoryRules,
  };
  return { ...payload, snapshotFingerprint: fingerprintStableJson(payload) };
}
function checkSnapshot(snapshot: PaSpecSnapshot, profile: PaProfile): void {
  object(snapshot, 'PA snapshot');
  if (snapshot.schemaVersion !== 1 || snapshot.profile !== profile)
    bad('PA snapshot tidak cocok dengan profile.');
  const { snapshotFingerprint, ...payload } = snapshot;
  if (fingerprintStableJson(payload) !== snapshotFingerprint)
    bad('PA snapshot fingerprint tidak valid.');
  const provider = object(snapshot.provider, 'PA snapshot provider');
  requiredText(provider.version, 'PA snapshot provider.version');
  requiredText(provider.documentSource, 'PA snapshot provider.documentSource');
  if (!['ACTIVE_CONFIGURED', 'TEST_FIXTURE'].includes(provider.ruleStatus))
    bad('PA snapshot provider tidak memiliki aturan evaluasi aktif.');
  const thresholds = object(
    snapshot.effectiveThresholds,
    'PA snapshot thresholds',
  );
  const rules = object(snapshot.sensoryRules, 'PA snapshot sensoryRules');
  const rule = (field: string, list = false) => {
    const value = rules[field];
    if (list) {
      if (!Array.isArray(value) || !value.length)
        bad(`PA snapshot sensoryRules.${field} harus berupa daftar non-empty.`);
      for (const entry of value)
        requiredText(entry, `PA snapshot sensoryRules.${field}`);
    } else requiredText(value, `PA snapshot sensoryRules.${field}`);
  };
  if (profile === 'COAL_PA') {
    const bands = object(thresholds.calorieBands, 'PA snapshot calorieBands');
    if (!Object.keys(bands).length) bad('PA snapshot calorieBands kosong.');
    for (const band of Object.values(bands)) {
      const value = object(band, 'PA snapshot calorieBand');
      const maximum = finite(
        value.maxTotalMoisturePct,
        'PA snapshot maxTotalMoisturePct',
      );
      if (maximum < 0 || maximum > 100)
        bad('PA snapshot moisture di luar rentang 0..100.');
    }
    rule('kondisi');
    for (const field of ['warna', 'levelRank', 'kilap']) rule(field, true);
    rule('bahanPengotor');
  } else if (profile === 'PAC_PA' || profile === 'RAPID_KLEN_PA') {
    const fields =
      profile === 'PAC_PA'
        ? ['phMin', 'phMax', 'densityMin', 'densityMax']
        : ['na2oMin', 'naohMin', 'phMin', 'densityMin'];
    for (const field of fields)
      finite(thresholds[field], `PA snapshot ${field}`);
    if (
      profile === 'PAC_PA' &&
      (thresholds.phMin > thresholds.phMax ||
        thresholds.densityMin > thresholds.densityMax)
    )
      bad('PA snapshot rentang minimum/maximum tidak valid.');
    rule('visual', profile === 'PAC_PA');
    rule('foreignMatters');
    rule('packagingLabel');
  } else bad('PA_EXEMPT tidak memiliki snapshot evaluasi.');
}
function coalVisualFailures(raw: JsonObject, rules: JsonObject): string[] {
  const v = object(
    raw.visual ?? {
      kondisi: raw.kondisi,
      warna: raw.warna,
      levelRank: raw.levelRank,
      kilap: raw.kilap,
      bahanPengotor: raw.bahanPengotor,
    },
    'visual',
  );
  for (const field of [
    'kondisi',
    'warna',
    'levelRank',
    'kilap',
    'bahanPengotor',
  ])
    requiredText(v[field], `visual.${field}`);
  const failures: string[] = [];
  if (v.kondisi !== rules.kondisi) failures.push('visual.kondisi');
  if (!rules.warna.includes(v.warna)) failures.push('visual.warna');
  if (!rules.levelRank.includes(v.levelRank)) failures.push('visual.levelRank');
  if (!rules.kilap.includes(v.kilap)) failures.push('visual.kilap');
  if (v.bahanPengotor !== rules.bahanPengotor)
    failures.push('visual.bahanPengotor');
  return failures;
}
function chemicalSensoryFailures(raw: JsonObject, rules: JsonObject): string[] {
  const s = object(raw.sensory, 'sensory');
  for (const field of ['visual', 'foreignMatters', 'packagingLabel'])
    requiredText(s[field], `sensory.${field}`);
  const failures: string[] = [];
  for (const field of ['visual', 'foreignMatters', 'packagingLabel']) {
    const expected = rules[field];
    if (
      Array.isArray(expected)
        ? !expected.includes(s[field])
        : s[field] !== expected
    )
      failures.push(`sensory.${field}`);
  }
  return failures;
}

/** Uses only frozen snapshot rules; current constants are not consulted. */
export function evaluatePaParameters(
  profile: PaProfile,
  parameters: unknown,
  testRound: number,
  snapshot: PaSpecSnapshot,
): PaEvaluationResult {
  if (!Number.isInteger(testRound) || testRound < 1 || testRound > 2)
    bad('testRound harus integer 1 atau 2.');
  checkSnapshot(snapshot, profile);
  const raw = object(parameters, 'parameters');
  const failures: string[] = [];
  let status: PaEvaluationStatus;
  if (profile === 'COAL_PA') {
    const band = canonicalAlias(raw, 'calorieBand', ['targetCalorie']);
    requiredText(band, 'calorieBand');
    const bandSpec = snapshot.effectiveThresholds.calorieBands[String(band)];
    if (!bandSpec)
      bad('Calorie band tidak terkonfigurasi pada snapshot spesifikasi.');
    const moisture = finite(
      canonicalAlias(raw, 'moisture', ['totalMoisture']),
      'moisture',
    );
    if (moisture < 0 || moisture > 100)
      bad('moisture harus berada pada rentang 0..100.');
    if (bandSpec && moisture > bandSpec.maxTotalMoisturePct)
      failures.push('moisture');
    failures.push(...coalVisualFailures(raw, snapshot.sensoryRules));
    status =
      failures.length === 0
        ? 'RELEASE'
        : testRound === 1
          ? 'RETEST_REQUIRED'
          : 'REJECT';
  } else if (profile === 'PAC_PA') {
    failures.push(...chemicalSensoryFailures(raw, snapshot.sensoryRules));
    const ph = finite(raw.ph, 'ph');
    const density = finite(raw.density, 'density');
    const t = snapshot.effectiveThresholds;
    if (ph < t.phMin || ph > t.phMax) failures.push('ph');
    if (density < t.densityMin || density > t.densityMax)
      failures.push('density');
    status = failures.length === 0 ? 'RELEASE' : 'WAITING_DISPOSITION';
  } else if (profile === 'RAPID_KLEN_PA') {
    failures.push(...chemicalSensoryFailures(raw, snapshot.sensoryRules));
    const na2o = finite(
      canonicalAlias(raw, 'alkalinityNa2O', ['alkalinityNa2o']),
      'alkalinityNa2O',
    );
    const naoh = finite(
      canonicalAlias(raw, 'alkalinityNaOH', ['alkalinityNaoh']),
      'alkalinityNaOH',
    );
    const ph = finite(raw.ph, 'ph');
    const density = finite(raw.density, 'density');
    const t = snapshot.effectiveThresholds;
    if (na2o <= t.na2oMin) failures.push('alkalinityNa2O');
    if (naoh <= t.naohMin) failures.push('alkalinityNaOH');
    if (ph <= t.phMin) failures.push('ph');
    if (density <= t.densityMin) failures.push('density');
    status = failures.length === 0 ? 'RELEASE' : 'WAITING_DISPOSITION';
  } else bad('PA_EXEMPT tidak memiliki parameter evaluasi.');
  const violations = [...new Set(failures)];
  return {
    profile,
    testRound,
    result: status === 'RELEASE' ? 'PASS' : 'REJECT',
    status,
    parameters: raw,
    failures: violations,
    violations,
    snapshot,
    snapshotFingerprint: snapshot.snapshotFingerprint,
  };
}

const NESTED_FIELDS: Record<PaProfile, Set<string>> = {
  COAL_PA: new Set(['kondisi', 'warna', 'levelRank', 'kilap', 'bahanPengotor']),
  PAC_PA: new Set(['visual', 'foreignMatters', 'packagingLabel']),
  RAPID_KLEN_PA: new Set(['visual', 'foreignMatters', 'packagingLabel']),
  PA_EXEMPT: new Set(),
};
export function patchPaParameters(
  parameters: unknown,
  patch: unknown,
  profile: PaProfile,
): JsonObject {
  const current = structuredClone(object(parameters, 'parameters'));
  const changes = object(patch, 'parameter patch');
  const allowed =
    profile === 'COAL_PA'
      ? new Set([
          'calorieBand',
          'targetCalorie',
          'moisture',
          'totalMoisture',
          'visual',
          'kondisi',
          'warna',
          'levelRank',
          'kilap',
          'bahanPengotor',
        ])
      : profile === 'PAC_PA'
        ? new Set(['sensory', 'ph', 'density', 'aluminaContent'])
        : profile === 'RAPID_KLEN_PA'
          ? new Set([
              'sensory',
              'alkalinityNa2O',
              'alkalinityNaOH',
              'alkalinityNa2o',
              'alkalinityNaoh',
              'ph',
              'density',
            ])
          : new Set<string>();
  for (const key of Object.keys(changes)) {
    if (!allowed.has(key))
      bad(`parameter tidak boleh diubah untuk ${profile}: ${key}`);
    if (key === 'sensory' || key === 'visual') {
      const nested = object(changes[key], key);
      for (const nestedKey of Object.keys(nested))
        if (!NESTED_FIELDS[profile].has(nestedKey))
          bad(`field nested tidak boleh diubah: ${key}.${nestedKey}`);
      if (profile === 'COAL_PA' && key === 'visual' && !current.visual) {
        for (const [field, value] of Object.entries(nested))
          requiredText(value, `visual.${field}`);
        if (
          Object.entries(nested).every(
            ([field, value]) => current[field] === value,
          )
        )
          continue;
      }
      const legacyVisual =
        profile === 'COAL_PA' && key === 'visual' && !current.visual
          ? Object.fromEntries(
              [...NESTED_FIELDS.COAL_PA]
                .filter((field) => Object.hasOwn(current, field))
                .map((field) => [field, current[field]]),
            )
          : {};
      current[key] = {
        ...legacyVisual,
        ...object(current[key] ?? {}, key),
        ...nested,
      };
    } else {
      if (
        [
          'calorieBand',
          'targetCalorie',
          'kondisi',
          'warna',
          'levelRank',
          'kilap',
          'bahanPengotor',
        ].includes(key)
      )
        requiredText(changes[key], key);
      else finite(changes[key], key);
      current[key] = changes[key];
    }
  }
  const aliasGroups =
    profile === 'COAL_PA'
      ? [
          ['calorieBand', 'targetCalorie'],
          ['moisture', 'totalMoisture'],
        ]
      : profile === 'RAPID_KLEN_PA'
        ? [
            ['alkalinityNa2O', 'alkalinityNa2o'],
            ['alkalinityNaOH', 'alkalinityNaoh'],
          ]
        : [];
  for (const aliases of aliasGroups) {
    const edited = aliases.filter((key) => Object.hasOwn(changes, key));
    if (!edited.length) continue;
    const value = changes[edited[0]];
    if (edited.some((key) => changes[key] !== value))
      bad('Parameter alias memiliki nilai yang konflik.');
    for (const key of aliases)
      if (Object.hasOwn(current, key)) current[key] = value;
  }
  if (profile === 'COAL_PA') {
    for (const key of NESTED_FIELDS.COAL_PA) {
      const flatEdited = Object.hasOwn(changes, key);
      const nestedEdited = changes.visual && Object.hasOwn(changes.visual, key);
      if (!flatEdited && !nestedEdited) continue;
      if (flatEdited && nestedEdited && changes[key] !== changes.visual[key])
        bad('Parameter visual alias memiliki nilai yang konflik.');
      const value = nestedEdited ? changes.visual[key] : changes[key];
      requiredText(value, `visual.${key}`);
      if (Object.hasOwn(current, key)) current[key] = value;
      if (current.visual) current.visual[key] = value;
    }
  }
  return current;
}
export function assertPaParametersAreWellFormed(
  parameters: unknown,
  profile: PaProfile,
): void {
  const p = object(parameters, 'parameters');
  if (profile === 'PA_EXEMPT') bad('PA_EXEMPT tidak dapat diedit.');
  for (const [key, value] of Object.entries(p)) {
    if (typeof value === 'boolean' && key !== 'sensory' && key !== 'visual')
      bad(`${key} tidak boleh boolean.`);
    if (typeof value === 'number' && !Number.isFinite(value))
      bad(`${key} harus finite.`);
  }
}
