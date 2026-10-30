/** Current revisions are explicit per laboratory round, never inferred from array order. */
export function selectCurrentPaByRound(records = []) {
  const byRound = new Map()
  const ambiguousRounds = new Set()
  for (const record of Array.isArray(records) ? records : []) {
    if (record?.isCurrent !== true || record.isVoided !== false) continue
    const round = record.testRound
    if (!Number.isInteger(round) || round < 1 || round > 2) {
      ambiguousRounds.add(round)
      continue
    }
    const bucket = byRound.get(round) || []
    bucket.push(record)
    byRound.set(round, bucket)
  }
  const current = []
  for (const [round, rows] of byRound) {
    if (rows.length !== 1) ambiguousRounds.add(round)
    else current.push(rows[0])
  }
  current.sort((a, b) => a.testRound - b.testRound)
  return { records: current, ambiguousRounds: [...ambiguousRounds] }
}

export function selectEffectiveCurrentPa(records = []) {
  const selected = selectCurrentPaByRound(records)
  if (selected.ambiguousRounds.length) return null
  return selected.records[selected.records.length - 1] || null
}

export function sortPaHistory(records = []) {
  return [...(Array.isArray(records) ? records : [])].sort((a, b) =>
    (a.testRound - b.testRound) || (a.revision - b.revision))
}

export function resolvePaEditorProfile(record, transaction = {}) {
  const explicit = [record?.analysisProfile, record?.specSnapshot?.profile, transaction.gspAnalysisProfile, transaction.productCatalog?.gspAnalysisProfile].filter(value => value != null)
  const valid = ['COAL_PA', 'PAC_PA', 'RAPID_KLEN_PA']
  if (explicit.length) return explicit.every(value => value === explicit[0]) && valid.includes(explicit[0]) ? explicit[0] : ''
  const category = String(record?.productCategory || '').toUpperCase()
  const name = String(record?.productName || '').toUpperCase()
  const subtype = String(transaction.cargoSubType || '').toUpperCase()
  const candidates = []
  if (category.includes('COAL') || name.includes('BATUBARA') || subtype.includes('BATUBARA')) candidates.push('COAL_PA')
  if (name.includes('PAC') || name.includes('POLYCOR') || subtype.includes('PAC')) candidates.push('PAC_PA')
  if (name.includes('RAPID') || name.includes('KLEN') || name.includes('PRO-CIP') || subtype.includes('RAPID') || subtype.includes('KLEN')) candidates.push('RAPID_KLEN_PA')
  return candidates.length === 1 ? candidates[0] : ''
}
