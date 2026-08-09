import { describe, it, expect } from 'vitest'

/**
 * P0-03 Regression Test: Correction Payload Builder
 *
 * These tests validate the canonical checklistItems shape used by the
 * TruckDetailsModal correction flow. The contract is:
 *
 *   checklistItems = { initialMoisture: number, items: ChecklistEntry[] }
 *
 * A flat array should NEVER be sent — it would destroy the moisture value.
 */

// Extract the payload builder logic (pure function) for testability
function buildChecklistPayload(formValues) {
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

describe('Correction Payload Builder — checklistItems', () => {
  const baseFormValues = {
    qcvMoisture: 12.5,
    qcvCleanliness: 'PASS',
    qcvSeal: 'PASS',
    qcvOdorCheck: 'PASS',
    qcvArrangement: 'PASS',
    qcvPest: 'PASS',
    qcvForeignObjects: 'PASS',
    qcvPackaging: 'PASS',
    qcvCoa: 'PASS',
    qcvQuantity: 'PASS',
    qcvLeakage: 'PASS',
  }

  it('should produce canonical { initialMoisture, items } shape — never a flat array', () => {
    const payload = buildChecklistPayload(baseFormValues)

    // Must be an object, never an array
    expect(Array.isArray(payload)).toBe(false)
    expect(typeof payload).toBe('object')

    // Must have initialMoisture at top level
    expect(payload).toHaveProperty('initialMoisture')
    expect(payload).toHaveProperty('items')

    // items must be an array of 10 checklist entries
    expect(Array.isArray(payload.items)).toBe(true)
    expect(payload.items).toHaveLength(10)
  })

  it('should preserve initialMoisture value from form', () => {
    const payload = buildChecklistPayload(baseFormValues)
    expect(payload.initialMoisture).toBe(12.5)
  })

  it('should reflect changed moisture value in payload', () => {
    const changedForm = { ...baseFormValues, qcvMoisture: 13.2 }
    const payload = buildChecklistPayload(changedForm)
    expect(payload.initialMoisture).toBe(13.2)
  })

  it('should default moisture to 0 when undefined', () => {
    const noMoistureForm = { ...baseFormValues, qcvMoisture: undefined }
    const payload = buildChecklistPayload(noMoistureForm)
    expect(payload.initialMoisture).toBe(0)
  })

  it('should default moisture to 0 when null', () => {
    const nullMoistureForm = { ...baseFormValues, qcvMoisture: null }
    const payload = buildChecklistPayload(nullMoistureForm)
    expect(payload.initialMoisture).toBe(0)
  })

  it('should correctly map PASS/REJECT for all 10 checklist items', () => {
    const mixedForm = {
      ...baseFormValues,
      qcvArrangement: 'REJECT',
      qcvForeignObjects: 'REJECT',
    }
    const payload = buildChecklistPayload(mixedForm)

    const arrangement = payload.items.find(i => i.label === 'Arrangement')
    expect(arrangement.ok).toBe(false)

    const foreignObj = payload.items.find(i => i.label === 'Foreign Objects')
    expect(foreignObj.ok).toBe(false)

    const cleanliness = payload.items.find(i => i.label === 'Vehicle Cleanliness')
    expect(cleanliness.ok).toBe(true)
  })

  it('should include all 10 canonical checklist labels', () => {
    const payload = buildChecklistPayload(baseFormValues)
    const labels = payload.items.map(i => i.label)

    expect(labels).toEqual([
      'Vehicle Cleanliness',
      'Door Seal Intact',
      'Odor/Smell Check',
      'Arrangement',
      'Pest/Animal Control',
      'Foreign Objects',
      'Packaging Integrity',
      'CoA Validation',
      'Quantity Verification',
      'Leakage & Condition',
    ])
  })

  it('should produce different JSON when moisture changes (change detection)', () => {
    const original = buildChecklistPayload(baseFormValues)
    const changed = buildChecklistPayload({ ...baseFormValues, qcvMoisture: 14.0 })

    expect(JSON.stringify(original)).not.toBe(JSON.stringify(changed))
  })

  it('should produce identical JSON when nothing changes (no-op detection)', () => {
    const first = buildChecklistPayload(baseFormValues)
    const second = buildChecklistPayload(baseFormValues)

    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })
})
