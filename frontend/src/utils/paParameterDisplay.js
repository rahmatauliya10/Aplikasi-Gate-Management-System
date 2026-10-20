/** Display persisted facts against their own frozen specification, never current frontend rules. */
export function formatPaParameters(record) {
  if (!record?.parameters) return []
  const snapshot = record.specSnapshot
  const thresholds = snapshot?.effectiveThresholds || {}
  const rules = snapshot?.sensoryRules || {}
  const result = []
  const add = (label, value, expected, test) => {
    if (value === undefined || value === null) return
    const known = snapshot && expected !== undefined
    result.push({ label, value: typeof value === 'object' ? JSON.stringify(value) : String(value), specText: known ? String(expected) : 'Referensi spesifikasi historis tidak tersedia', isOk: known && test ? test(value) : null })
  }
  const p = record.parameters
  const profile = snapshot?.profile || record.analysisProfile
  const sensory = profile === 'COAL_PA' ? p.visual || p : p.sensory || {}
  for (const [key, value] of Object.entries(sensory)) {
    const expected = rules[key]
    add(key, value, Array.isArray(expected) ? expected.join(' / ') : expected, v => Array.isArray(expected) ? expected.includes(v) : v === expected)
  }
  const numeric = (key, value, min, max, strict = false) => {
    const hasMin = typeof min === 'number'
    const hasMax = typeof max === 'number'
    const text = hasMin && hasMax ? `${min} – ${max}` : hasMin ? `${strict ? '>' : '≥'} ${min}` : hasMax ? `≤ ${max}` : undefined
    add(key, value, text, v => typeof v === 'number' && Number.isFinite(v) && (!hasMin || (strict ? v > min : v >= min)) && (!hasMax || v <= max))
  }
  if (profile === 'COAL_PA') {
    const band = p.calorieBand ?? p.targetCalorie
    add('Target kalori', band, undefined)
    numeric('Total moisture (%)', p.moisture ?? p.totalMoisture, undefined, thresholds.calorieBands?.[band]?.maxTotalMoisturePct)
  } else {
    numeric('pH', p.ph, thresholds.phMin, thresholds.phMax, profile === 'RAPID_KLEN_PA')
    numeric('Density (g/mL)', p.density, thresholds.densityMin, thresholds.densityMax, profile === 'RAPID_KLEN_PA')
    if (profile === 'RAPID_KLEN_PA') {
      numeric('Alkalinity Na₂O (%)', p.alkalinityNa2O ?? p.alkalinityNa2o, thresholds.na2oMin, undefined, true)
      numeric('Alkalinity NaOH (%)', p.alkalinityNaOH ?? p.alkalinityNaoh, thresholds.naohMin, undefined, true)
    }
    add('Alumina (%) — informasi', p.aluminaContent, undefined)
  }
  if (!snapshot) {
    return Object.entries(p).filter(([key]) => key !== 'notes').map(([label, value]) => ({ label, value: typeof value === 'object' ? JSON.stringify(value) : String(value), specText: 'Referensi spesifikasi historis tidak tersedia', isOk: null }))
  }
  return result
}
