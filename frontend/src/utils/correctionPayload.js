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
