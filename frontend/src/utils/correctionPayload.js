import { GBJ_VEHICLE_CHECKLIST, GBJ_CHECKLIST_SEVERITY } from './gbjQcFlow'

/**
 * Utility functions for QC checklist parsing, payload formatting, and change detection.
 */

/**
 * Normalizes raw checklistItems which may be stored as:
 * - Canonical object: { initialMoisture: number, items: Array<{label: string, ok: boolean, photo?: string|null}> }
 * - Legacy array: Array<{label: string, ok: boolean, photo?: string|null}>
 * - JSON string of either shape
 *
 * Returns normalized object: { initialMoisture: number|null, items: Array<{label: string, ok: boolean, photo?: string|null}> }
 */
export function normalizeChecklistItems(raw) {
  if (!raw) return { initialMoisture: null, items: [] }

  let parsed = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { initialMoisture: null, items: [] }
    }
  }

  if (Array.isArray(parsed)) {
    return {
      initialMoisture: null,
      items: parsed
    }
  }

  if (typeof parsed === 'object' && parsed !== null) {
    const initialMoisture = parsed.initialMoisture !== undefined && parsed.initialMoisture !== null
      ? Number(parsed.initialMoisture)
      : null
    const items = Array.isArray(parsed.items) ? parsed.items : []
    return { initialMoisture, items }
  }

  return { initialMoisture: null, items: [] }
}

/**
 * Extracts checklist items array regardless of canonical object vs legacy array representation.
 */
export function getChecklistEntries(raw) {
  const normalized = normalizeChecklistItems(raw)
  return normalized.items
}

/**
 * Parses the persisted checklist shape without discarding unknown metadata.
 */
function parseChecklist(raw) {
  if (!raw) return null

  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  return raw
}

/**
 * Builds canonical checklistItems payload object from correction form values.
 * Known fields are updated from the form while unknown top-level and item
 * metadata is carried forward from the persisted checklist where possible.
 */
export function buildChecklistPayload(formValues, originalRaw = null) {
  const parsedOriginal = parseChecklist(originalRaw)
  const originalItems = Array.isArray(parsedOriginal)
    ? parsedOriginal
    : (parsedOriginal && typeof parsedOriginal === 'object' && Array.isArray(parsedOriginal.items)
      ? parsedOriginal.items
      : [])
  const originalByLabel = new Map(
    originalItems
      .filter(item => item && typeof item === 'object' && item.label)
      .map(item => [String(item.label).toLowerCase(), item]),
  )

  const definitions = [
    ['Vehicle Cleanliness', 'qcvCleanliness', 'qcvCleanlinessPhoto'],
    ['Door Seal Intact', 'qcvSeal', 'qcvSealPhoto'],
    ['Odor/Smell Check', 'qcvOdorCheck', 'qcvOdorCheckPhoto'],
    ['Arrangement', 'qcvArrangement', 'qcvArrangementPhoto'],
    ['Pest/Animal Control', 'qcvPest', 'qcvPestPhoto'],
    ['Foreign Objects', 'qcvForeignObjects', 'qcvForeignObjectsPhoto'],
    ['Packaging Integrity', 'qcvPackaging', 'qcvPackagingPhoto'],
    ['CoA Validation', 'qcvCoa', 'qcvCoaPhoto'],
    ['Quantity Verification', 'qcvQuantity', 'qcvQuantityPhoto'],
    ['Leakage & Condition', 'qcvLeakage', 'qcvLeakagePhoto'],
  ]

  const checklistEntries = definitions.map(([label, valueKey, photoKey]) => ({
    ...(originalByLabel.get(label.toLowerCase()) || {}),
    label,
    ok: formValues[valueKey] === 'PASS',
    photo: formValues[photoKey] || null,
  }))
  const knownLabels = new Set(definitions.map(([label]) => label.toLowerCase()))
  const unknownEntries = originalItems.filter(item => {
    const label = item && typeof item === 'object' ? String(item.label || '').toLowerCase() : ''
    return !knownLabels.has(label)
  })

  const metadata = parsedOriginal && typeof parsedOriginal === 'object' && !Array.isArray(parsedOriginal)
    ? Object.fromEntries(Object.entries(parsedOriginal).filter(([key]) => !['initialMoisture', 'items'].includes(key)))
    : {}

  return {
    ...metadata,
    initialMoisture: Number(formValues.qcvMoisture) || 0,
    items: [...checklistEntries, ...unknownEntries],
  }
}

/**
 * Compares original checklist state with new payload to detect if any checklist values changed.
 */
export function hasChecklistChanged(originalEntries, originalMoisture, newPayload, originalRaw = null) {
  const parsedOriginal = parseChecklist(originalRaw)
  const originalItems = originalRaw
    ? (Array.isArray(parsedOriginal) ? parsedOriginal : parsedOriginal?.items || [])
    : (originalEntries || []).map(e => ({
      label: e.label,
      ok: Boolean(e.ok),
      photo: e.photo || null
    }))
  const metadata = parsedOriginal && typeof parsedOriginal === 'object' && !Array.isArray(parsedOriginal)
    ? Object.fromEntries(Object.entries(parsedOriginal).filter(([key]) => !['initialMoisture', 'items'].includes(key)))
    : {}
  const originalPayload = {
    ...metadata,
    initialMoisture: Number(originalRaw ? parsedOriginal?.initialMoisture : originalMoisture) || 0,
    items: originalItems,
  }

  return JSON.stringify(originalPayload) !== JSON.stringify(newPayload)
}

/**
 * Updates only the three sampling entries produced by the GBB initial-QC flow.
 * It never creates a checklist entry that was not persisted and carries all
 * unknown item/top-level metadata forward unchanged.
 */
export function hasSamplingChanged(originalRaw, next) {
  const original = parseChecklist(originalRaw)
  const snapshot = Array.isArray(original) ? { items: original } : original
  return JSON.stringify(snapshot) !== JSON.stringify(next)
}

export function isCanonicalGbjChecklist(raw) {
  return raw && typeof raw === 'object' && !Array.isArray(raw) &&
    Array.isArray(raw.items) && raw.items.length === GBJ_VEHICLE_CHECKLIST.length &&
    raw.items.every((item, index) => item?.label === GBJ_VEHICLE_CHECKLIST[index] &&
      typeof item.ok === 'boolean' && (item.severity === undefined || item.severity === GBJ_CHECKLIST_SEVERITY[index]))
}

export function buildGbjCorrectionItems(record, form) {
  if (!record?.id) return []
  const original = record.checklistItems
  const persisted = normalizeChecklistItems(original).items
  const statuses = form.gbjChecklist || []
  const photos = form.gbjPhotos || persisted.map(item => item.photo ?? null)
  const checklistChanged = JSON.stringify(statuses) !== JSON.stringify(persisted.map(item => item.ok)) ||
    JSON.stringify(photos) !== JSON.stringify(persisted.map(item => item.photo ?? null))
  const decisionChanged = form.gbjDecisionMode !== (record.decisionMode ?? null) ||
    String(form.gbjDeviationReason ?? '') !== String(record.deviationReason ?? '')
  if (!checklistChanged && !decisionChanged) return []
  if (!isCanonicalGbjChecklist(original) || statuses.length !== persisted.length || statuses.some(value => typeof value !== 'boolean')) {
    throw new Error('Checklist GBJ current tidak canonical; item kosong/historis tidak boleh direkonstruksi.')
  }
  if (!['NORMAL_PASS', 'APPROVED_WITH_DEVIATION', 'REJECTED'].includes(form.gbjDecisionMode)) {
    throw new Error('Pilih keputusan QC GBJ secara eksplisit sebelum menyimpan perubahan QC.')
  }
  const items = persisted.map((item, index) => ({ ...item, ok: statuses[index], ...(photos[index] !== (item.photo ?? null) ? { photo: photos[index] } : {}) }))
  const changed = []
  const add = (fieldName, newValue) => changed.push({ targetModule: 'QC_VEHICLE', targetRecordId: record.id, fieldName, newValue })
  if (checklistChanged) add('checklistItems', { ...original, items })
  const hasDeviation = statuses.some(value => value === false)
  const critical = statuses.some((ok, index) => !ok && GBJ_CHECKLIST_SEVERITY[index] === 'CRITICAL')
  if ((form.gbjDecisionMode === 'NORMAL_PASS' && hasDeviation) ||
      (form.gbjDecisionMode === 'REJECTED' && !hasDeviation) ||
      (form.gbjDecisionMode === 'APPROVED_WITH_DEVIATION' && (!hasDeviation || critical || String(form.gbjDeviationReason ?? '').trim().length < 10))) {
    throw new Error('Keputusan GBJ tidak konsisten dengan temuan dan alasan deviation.')
  }
  for (const item of items.filter(item => !item.ok)) {
    const match = typeof item.photo === 'string' && item.photo.match(/^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/)
    if (!match) throw new Error('Item GBJ NOT OK wajib memiliki bukti foto valid.')
    let decoded
    try { decoded = atob(match[1]) } catch { throw new Error('Base64 bukti GBJ tidak valid.') }
    if (!decoded.length || btoa(decoded) !== match[1] || decoded.length > 2 * 1024 * 1024) throw new Error('Bukti GBJ harus valid dan maksimal 2 MB.')
  }
  const effective = { decisionMode: form.gbjDecisionMode, result: form.gbjDecisionMode === 'REJECTED' ? 'REJECT' : 'PASS', hasDeviation, deviationReason: form.gbjDeviationReason || null }
  for (const [key, value] of Object.entries(effective)) {
    if (value !== record[key]) add(key, value)
  }
  return changed
}

export function buildGspCorrectionChecklist(original, values) {
  if (!original || !Array.isArray(original.items) || !Array.isArray(values) || values.length !== original.items.length || values.some(value => typeof value !== 'boolean')) {
    throw new Error('Checklist GSP current tidak lengkap; nilai tidak boleh dibuat otomatis.')
  }
  const items = original.items.map((item, index) => ({ ...item, result: values[index] ? 'OK' : 'NOT_OK' }))
  if (items.every((item, index) => item.result === original.items[index].result)) return null
  return { ...original, items }
}

export function buildGbbSamplingPayload(formValues, originalRaw = null) {
  const parsedOriginal = parseChecklist(originalRaw)
  const originalItems = Array.isArray(parsedOriginal)
    ? parsedOriginal
    : (parsedOriginal && typeof parsedOriginal === 'object' && Array.isArray(parsedOriginal.items)
      ? parsedOriginal.items
      : [])
  const updates = new Map()
  if (formValues.qcvVisual === 'PASS' || formValues.qcvVisual === 'REJECT') {
    updates.set('sampling visual', formValues.qcvVisual === 'PASS')
  }
  if (formValues.qcvOdor === 'PASS' || formValues.qcvOdor === 'REJECT') {
    updates.set('sampling bau', formValues.qcvOdor === 'PASS')
  }
  if (formValues.qcvMoisture !== null && formValues.qcvMoisture !== undefined && formValues.qcvMoisture !== '') {
    updates.set('estimasi moisture', formValues.qcvMoisture)
  }
  const updatedItems = originalItems.map(item => {
    if (!item || typeof item !== 'object') return item
    const key = String(item.label || '').toLowerCase()
    if (!updates.has(key)) return item
    if (key === 'estimasi moisture') {
      return formValues.qcvMoisture === null || formValues.qcvMoisture === undefined
        ? item
        : { ...item, value: Number(formValues.qcvMoisture) }
    }
    return { ...item, ok: updates.get(key) }
  })
  if (updatedItems.length === 0 || updates.size === 0) return null

  const result = Array.isArray(parsedOriginal)
    ? { items: updatedItems }
    : { ...(parsedOriginal || {}), items: updatedItems }
  if (Object.prototype.hasOwnProperty.call(result, 'initialMoisture') &&
      formValues.qcvMoisture !== null && formValues.qcvMoisture !== undefined && formValues.qcvMoisture !== '') {
    result.initialMoisture = Number(formValues.qcvMoisture)
  }
  return result
}

/** A sparse factual PA patch; unknown persisted metadata is not sent back as an edit. */
export function buildPaCorrectionPatch(profile, original = {}, next = {}) {
  const nested = profile === 'COAL_PA' ? 'visual' : 'sensory'
  const nestedFields = profile === 'COAL_PA'
    ? ['kondisi', 'warna', 'levelRank', 'kilap', 'bahanPengotor']
    : ['visual', 'foreignMatters', 'packagingLabel']
  const scalar = {
    COAL_PA: ['calorieBand', 'targetCalorie', 'moisture', 'totalMoisture'],
    PAC_PA: ['ph', 'density', 'aluminaContent'],
    RAPID_KLEN_PA: ['ph', 'density', 'alkalinityNa2O', 'alkalinityNaOH', 'alkalinityNa2o', 'alkalinityNaoh'],
  }[profile]
  if (!scalar) throw new Error('Profil PA tidak didukung untuk koreksi.')
  const patch = {}
  for (const [key, value] of Object.entries(next)) {
    if (key === nested) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Parameter sensory/visual tidak valid.')
      const changes = {}
      for (const [field, text] of Object.entries(value)) {
        if (!nestedFields.includes(field) || typeof text !== 'string' || !text.trim()) throw new Error('Field sensory/visual tidak valid.')
        if (text !== original[key]?.[field]) changes[field] = text
      }
      if (Object.keys(changes).length) patch[key] = changes
    } else {
      if (!scalar.includes(key)) throw new Error(`Parameter PA tidak diizinkan: ${key}`)
      if (['calorieBand', 'targetCalorie'].includes(key)) {
        if (typeof value !== 'string' || !value.trim()) throw new Error('Target kalori wajib diisi.')
      } else if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Pengukuran PA harus angka finite.')
      if (value !== original[key]) patch[key] = value
    }
  }
  return Object.keys(patch).length ? patch : null
}
