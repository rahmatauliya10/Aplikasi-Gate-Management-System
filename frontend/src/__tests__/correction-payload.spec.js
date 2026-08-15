import { describe, it, expect } from 'vitest'
import {
  normalizeChecklistItems,
  buildChecklistPayload,
  hasChecklistChanged
} from '../utils/correctionPayload'

/**
 * P0-03 Regression Test: Correction Payload Builder & Checklist Normalizer
 *
 * Validates production code from src/utils/correctionPayload.js used by
 * TruckDetailsModal and QCVerification.
 */

describe('Checklist Normalizer — normalizeChecklistItems', () => {
  it('should parse legacy array format into normalized object', () => {
    const legacyArray = [
      { label: 'Arrangement', ok: true },
      { label: 'Foreign Objects', ok: false }
    ]
    const normalized = normalizeChecklistItems(legacyArray)
    expect(normalized.initialMoisture).toBeNull()
    expect(normalized.items).toHaveLength(2)
    expect(normalized.items[0].label).toBe('Arrangement')
  })

  it('should parse canonical object format containing initialMoisture and items', () => {
    const canonicalObj = {
      initialMoisture: 12.5,
      items: [
        { label: 'Arrangement', ok: true },
        { label: 'Foreign Objects', ok: true }
      ]
    }
    const normalized = normalizeChecklistItems(canonicalObj)
    expect(normalized.initialMoisture).toBe(12.5)
    expect(normalized.items).toHaveLength(2)
  })

  it('should parse JSON string of canonical object', () => {
    const jsonStr = JSON.stringify({
      initialMoisture: 11.8,
      items: [{ label: 'Door Seal Intact', ok: true }]
    })
    const normalized = normalizeChecklistItems(jsonStr)
    expect(normalized.initialMoisture).toBe(11.8)
    expect(normalized.items).toHaveLength(1)
  })

  it('should safely handle null or undefined input', () => {
    expect(normalizeChecklistItems(null)).toEqual({ initialMoisture: null, items: [] })
    expect(normalizeChecklistItems(undefined)).toEqual({ initialMoisture: null, items: [] })
  })
})

describe('Correction Payload Builder — buildChecklistPayload', () => {
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

    expect(Array.isArray(payload)).toBe(false)
    expect(typeof payload).toBe('object')
    expect(payload).toHaveProperty('initialMoisture')
    expect(payload).toHaveProperty('items')
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

  it('should default moisture to 0 when undefined or null', () => {
    expect(buildChecklistPayload({ ...baseFormValues, qcvMoisture: undefined }).initialMoisture).toBe(0)
    expect(buildChecklistPayload({ ...baseFormValues, qcvMoisture: null }).initialMoisture).toBe(0)
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
})

describe('Checklist Change Detector — hasChecklistChanged', () => {
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

  it('should return false when original array entries match new payload', () => {
    const payload = buildChecklistPayload(baseFormValues)
    const origEntries = payload.items.map(i => ({ label: i.label, ok: i.ok }))

    const changed = hasChecklistChanged(origEntries, 12.5, payload)
    expect(changed).toBe(false)
  })

  it('should return true when an item status changes', () => {
    const payload = buildChecklistPayload(baseFormValues)
    const origEntries = payload.items.map(i => ({ label: i.label, ok: i.ok }))
    // Change one item in original
    origEntries[3].ok = false

    const changed = hasChecklistChanged(origEntries, 12.5, payload)
    expect(changed).toBe(true)
  })

  it('should return true when moisture value changes', () => {
    const payload = buildChecklistPayload(baseFormValues)
    const origEntries = payload.items.map(i => ({ label: i.label, ok: i.ok }))

    const changed = hasChecklistChanged(origEntries, 10.0, payload)
    expect(changed).toBe(true)
  })
})
