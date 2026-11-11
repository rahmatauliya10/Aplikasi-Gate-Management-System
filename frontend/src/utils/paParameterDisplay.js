const LEGACY_SPEC = 'Referensi spesifikasi historis tidak tersedia'
const INFORMATION = 'Informasi / tidak dievaluasi'
const isObject = value => value !== null && typeof value === 'object'
const present = value => value !== undefined && value !== null
const readableKey = key => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, c => c.toUpperCase())
const calorieLabels = { COAL_5600_6000: '5.600–6.000', COAL_GT_6000: '> 6.000' }

/** Display persisted facts against their own frozen specification, never current frontend rules. */
export function formatPaParameters(record) {
  const p = record?.parameters
  if (!isObject(p) || Array.isArray(p)) return []
  const snapshot = record.specSnapshot
  const thresholds = snapshot?.effectiveThresholds || {}
  const rules = snapshot?.sensoryRules || {}
  const profile = snapshot?.profile || record.analysisProfile
  const result = []
  const consumed = new Set(['notes'])
  const get = path => path.split('.').reduce((value, key) => value?.[key], p)
  const addAliases = (key, label, paths, group, expected, test, display = String, informational = false) => {
    const entries = paths.filter(path => present(get(path)) && !isObject(get(path))).map(path => ({ path, value: get(path) }))
    entries.forEach(entry => consumed.add(entry.path))
    const unique = entries.filter((entry, index) => entries.findIndex(other => Object.is(other.value, entry.value)) === index)
    const conflict = unique.length > 1
    for (const entry of unique) {
      const known = !!snapshot && expected !== undefined && !conflict
      result.push({
        key: conflict ? entry.path : key, label, group, source: entry.path, conflict,
        value: display(entry.value),
        specText: conflict ? 'Nilai tersimpan berbeda — perlu pemeriksaan' : known ? String(expected) : informational ? INFORMATION : snapshot ? 'Aturan parameter tidak tersedia pada snapshot' : LEGACY_SPEC,
        isOk: known && test ? test(entry.value) : null,
      })
    }
  }
  const numeric = (key, label, paths, min, max, strict = false) => {
    const hasMin = typeof min === 'number' && Number.isFinite(min)
    const hasMax = typeof max === 'number' && Number.isFinite(max)
    const expected = hasMin && hasMax ? `${min} – ${max}` : hasMin ? `${strict ? '>' : '≥'} ${min}` : hasMax ? `≤ ${max}` : undefined
    addAliases(key, label, paths, 'measurements', expected, value => typeof value === 'number' && Number.isFinite(value) && (!hasMin || (strict ? value > min : value >= min)) && (!hasMax || value <= max))
  }
  addAliases('calorieBand', 'Target kalori', ['calorieBand', 'targetCalorie'], 'measurements', undefined, null, value => calorieLabels[value] || String(value), true)
  const bands = ['calorieBand', 'targetCalorie'].map(get).filter(present)
  const bandConflict = bands.some(value => value !== bands[0])
  numeric('totalMoisture', 'Total moisture (%)', ['moisture', 'totalMoisture'], undefined, bandConflict ? undefined : thresholds.calorieBands?.[bands[0]]?.maxTotalMoisturePct)
  numeric('ph', 'pH', ['ph'], thresholds.phMin, thresholds.phMax, profile === 'RAPID_KLEN_PA')
  numeric('density', 'Densitas (g/mL)', ['density'], thresholds.densityMin, thresholds.densityMax, profile === 'RAPID_KLEN_PA')
  numeric('alkalinityNa2O', 'Alkalinitas Na₂O (%)', ['alkalinityNa2O', 'alkalinityNa2o'], thresholds.na2oMin, undefined, true)
  numeric('alkalinityNaOH', 'Alkalinitas NaOH (%)', ['alkalinityNaOH', 'alkalinityNaoh'], thresholds.naohMin, undefined, true)
  addAliases('aluminaContent', 'Alumina (%) — informasi', ['aluminaContent'], 'measurements', undefined, null, String, true)
  const sensoryFields = [
    ['kondisi', 'Kondisi', ['visual.kondisi', 'kondisi']],
    ['warna', 'Warna', ['visual.warna', 'warna']],
    ['levelRank', 'Peringkat batubara', ['visual.levelRank', 'levelRank']],
    ['kilap', 'Kilap', ['visual.kilap', 'kilap']],
    ['bahanPengotor', 'Bahan pengotor', ['visual.bahanPengotor', 'bahanPengotor']],
    ['visual', 'Kondisi visual', ['sensory.visual']],
    ['foreignMatters', 'Benda asing / kontaminasi', ['sensory.foreignMatters']],
    ['packagingLabel', 'Kemasan & label', ['sensory.packagingLabel']],
  ]
  for (const [key, label, paths] of sensoryFields) {
    const rule = rules[key]
    const expected = Array.isArray(rule) ? rule.join(' / ') : rule
    addAliases(key, label, paths, 'sensory', expected, value => Array.isArray(rule) ? rule.includes(value) : value === rule)
  }
  const additional = (value, path, label) => {
    if (consumed.has(path)) return
    if (isObject(value) && Object.keys(value).length) {
      for (const [key, child] of Object.entries(value)) additional(child, path ? `${path}.${key}` : key, label ? `${label} · ${readableKey(key)}` : readableKey(key))
      return
    }
    result.push({ key: path, label, value: value == null ? '—' : isObject(value) ? (Array.isArray(value) ? 'Daftar kosong' : 'Tidak ada rincian') : String(value), group: 'additional', isOk: null, specText: INFORMATION })
  }
  for (const [key, value] of Object.entries(p)) {
    additional(value, key, key === 'maxAllowedMoisture' ? 'Batas moisture tersimpan (%) — referensi lama' : readableKey(key))
  }
  return result
}
