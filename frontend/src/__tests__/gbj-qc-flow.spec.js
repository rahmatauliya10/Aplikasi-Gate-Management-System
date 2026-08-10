import { describe, it, expect } from 'vitest'
import {
  requiresVehicleQc,
  requiresIncomingCheck,
  canStartWarehouse,
  canStartIncomingCheck,
  canStartWeighOut
} from '../utils/statusFlow'

/**
 * GBJ QC Vehicle Flow & Checklist Evaluation — Regression Unit Tests
 */

describe('GBJ Process Status Flow Rules', () => {
  it('should require vehicle QC for GBJ, GBB, and GSP transactions', () => {
    expect(requiresVehicleQc({ processType: 'GBJ' })).toBe(true)
    expect(requiresVehicleQc({ processType: 'GBB' })).toBe(true)
    expect(requiresVehicleQc({ processType: 'GSP' })).toBe(true)
  })

  it('should NOT require incoming check (QC Lab) for GBJ transactions', () => {
    expect(requiresIncomingCheck({ processType: 'GBJ' })).toBe(false)
    expect(requiresIncomingCheck({ processType: 'GBB' })).toBe(true)
    expect(requiresIncomingCheck({ processType: 'GSP' })).toBe(true)
  })

  it('should allow warehouse loading for GBJ only after QC_VEHICLE_PASSED', () => {
    expect(canStartWarehouse('QC_VEHICLE_PASSED', { processType: 'GBJ' })).toBe(true)
    expect(canStartWarehouse('QC_VEHICLE_PENDING', { processType: 'GBJ' })).toBe(false)
  })

  it('should NOT allow incoming check for GBJ under any status', () => {
    expect(canStartIncomingCheck('WAREHOUSE_DONE', { processType: 'GBJ' })).toBe(false)
    expect(canStartIncomingCheck('INCOMING_CHECK_PENDING', { processType: 'GBJ' })).toBe(false)
  })

  it('should allow GBJ to proceed directly to Weigh Out after WAREHOUSE_DONE or if QC_VEHICLE_REJECTED', () => {
    expect(canStartWeighOut('WAREHOUSE_DONE', { processType: 'GBJ' })).toBe(true)
    expect(canStartWeighOut('QC_VEHICLE_REJECTED', { processType: 'GBJ' })).toBe(true)
    expect(canStartWeighOut('QC_VEHICLE_PASSED', { processType: 'GBJ' })).toBe(false)
  })
})

describe('GBJ Checklist Decision Evaluation Logic', () => {
  const vehicleChecklist = [
    "Tidak ditemukan hama / No pest found",
    "Bebas dari barang haram dan najis / Free of haram and najis material",
    "Truk dalam kondisi bersih dan tidak berbau / Truck in clean condition and odour free",
    "Tidak ditemukan bahan kimia atau kontaminan lain / No chemical or other contaminent found",
    "Terdapat alas jika lantai truk kotor atau berlubang / There is a cover if the floor is holey or dirty"
  ]

  function evaluateChecklist(states) {
    const isComplete = states.length === vehicleChecklist.length &&
      states.every(s => s.status === 'ok' || (s.status === 'not_ok' && s.photo))
    
    const hasNotOk = states.some(s => s.status === 'not_ok')
    const passed = isComplete && !hasNotOk

    const notOkLabels = states
      .map((s, idx) => s.status === 'not_ok' ? `${idx + 1}. ${vehicleChecklist[idx]}` : null)
      .filter(Boolean)

    return {
      isComplete,
      result: passed ? 'PASS' : 'REJECT',
      notOkLabels,
      notes: passed 
        ? 'Lolos QC Vehicle Checklist GBJ' 
        : `[REJECT QC VEHICLE GBJ] Temuan NOT OK (${notOkLabels.length} item): ${notOkLabels.join('; ')}`
    }
  }

  it('should evaluate to PASS when all 5 items are OK', () => {
    const states = [
      { status: 'ok', photo: null },
      { status: 'ok', photo: null },
      { status: 'ok', photo: null },
      { status: 'ok', photo: null },
      { status: 'ok', photo: null }
    ]
    const res = evaluateChecklist(states)
    expect(res.isComplete).toBe(true)
    expect(res.result).toBe('PASS')
    expect(res.notOkLabels).toHaveLength(0)
    expect(res.notes).toContain('Lolos QC Vehicle Checklist GBJ')
  })

  it('should evaluate to REJECT when 1 or more items are NOT OK (with photo attached)', () => {
    const states = [
      { status: 'ok', photo: null },
      { status: 'not_ok', photo: 'data:image/jpeg;base64,mockphoto' },
      { status: 'ok', photo: null },
      { status: 'ok', photo: null },
      { status: 'not_ok', photo: 'data:image/jpeg;base64,mockphoto' }
    ]
    const res = evaluateChecklist(states)
    expect(res.isComplete).toBe(true)
    expect(res.result).toBe('REJECT')
    expect(res.notOkLabels).toHaveLength(2)
    expect(res.notes).toContain('[REJECT QC VEHICLE GBJ]')
    expect(res.notes).toContain('Free of haram and najis material')
    expect(res.notes).toContain('There is a cover if the floor is holey or dirty')
  })

  it('should evaluate isComplete to false if any item is incomplete', () => {
    const states = [
      { status: 'ok', photo: null },
      { status: null, photo: null },
      { status: 'ok', photo: null },
      { status: 'ok', photo: null },
      { status: 'ok', photo: null }
    ]
    const res = evaluateChecklist(states)
    expect(res.isComplete).toBe(false)
  })
})
