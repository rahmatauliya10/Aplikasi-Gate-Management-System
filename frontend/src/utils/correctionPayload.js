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
 * Builds canonical checklistItems payload object from correction form values.
 * Shape: { initialMoisture: number, items: ChecklistEntry[] }
 */
export function buildChecklistPayload(formValues) {
  const checklistEntries = [
    { label: 'Vehicle Cleanliness', ok: formValues.qcvCleanliness === 'PASS', photo: formValues.qcvCleanlinessPhoto || null },
    { label: 'Door Seal Intact', ok: formValues.qcvSeal === 'PASS', photo: formValues.qcvSealPhoto || null },
    { label: 'Odor/Smell Check', ok: formValues.qcvOdorCheck === 'PASS', photo: formValues.qcvOdorCheckPhoto || null },
    { label: 'Arrangement', ok: formValues.qcvArrangement === 'PASS', photo: formValues.qcvArrangementPhoto || null },
    { label: 'Pest/Animal Control', ok: formValues.qcvPest === 'PASS', photo: formValues.qcvPestPhoto || null },
    { label: 'Foreign Objects', ok: formValues.qcvForeignObjects === 'PASS', photo: formValues.qcvForeignObjectsPhoto || null },
    { label: 'Packaging Integrity', ok: formValues.qcvPackaging === 'PASS', photo: formValues.qcvPackagingPhoto || null },
    { label: 'CoA Validation', ok: formValues.qcvCoa === 'PASS', photo: formValues.qcvCoaPhoto || null },
    { label: 'Quantity Verification', ok: formValues.qcvQuantity === 'PASS', photo: formValues.qcvQuantityPhoto || null },
    { label: 'Leakage & Condition', ok: formValues.qcvLeakage === 'PASS', photo: formValues.qcvLeakagePhoto || null },
  ]

  return {
    initialMoisture: Number(formValues.qcvMoisture) || 0,
    items: checklistEntries,
  }
}

/**
 * Compares original checklist state with new payload to detect if any checklist values changed.
 */
export function hasChecklistChanged(originalEntries, originalMoisture, newPayload) {
  const originalPayload = {
    initialMoisture: Number(originalMoisture) || 0,
    items: (originalEntries || []).map(e => ({
      label: e.label,
      ok: Boolean(e.ok),
      photo: e.photo || null
    }))
  }

  return JSON.stringify(originalPayload) !== JSON.stringify(newPayload)
}
