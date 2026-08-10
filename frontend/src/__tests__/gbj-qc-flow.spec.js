import { describe, it, expect } from 'vitest'
import {
  requiresVehicleQc,
  requiresIncomingCheck,
  canStartWarehouse,
  canStartIncomingCheck,
  canStartWeighOut
} from '../utils/statusFlow'
import {
  GBJ_VEHICLE_CHECKLIST,
  getQcStage1Mode,
  evaluateGbjChecklist,
  buildGbjQcPayload
} from '../utils/gbjQcFlow'

/**
 * GBJ QC Vehicle Flow & Checklist Evaluation — Regression Unit Tests
 * Tests production utilities shared by QCVerification view and test suite.
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

describe('GBJ Stage 1 QC Modal Mode Dispatcher', () => {
  it('should dispatch GBJ transactions to GBJ_VEHICLE_CHECK mode', () => {
    expect(getQcStage1Mode({ processType: 'GBJ' })).toBe('GBJ_VEHICLE_CHECK')
    expect(getQcStage1Mode({ process_type: 'GBJ' })).toBe('GBJ_VEHICLE_CHECK')
  })

  it('should dispatch GBB and GSP transactions to SAMPLING_AWAL mode', () => {
    expect(getQcStage1Mode({ processType: 'GBB' })).toBe('SAMPLING_AWAL')
    expect(getQcStage1Mode({ processType: 'GSP' })).toBe('SAMPLING_AWAL')
  })

  it('should return UNKNOWN for null, missing, or invalid processType (fail-closed)', () => {
    expect(getQcStage1Mode(null)).toBe('UNKNOWN')
    expect(getQcStage1Mode({})).toBe('UNKNOWN')
    expect(getQcStage1Mode({ poNumber: 'PO-GBJ-2026-001' })).toBe('UNKNOWN')
    expect(getQcStage1Mode({ processType: 'OTHER' })).toBe('UNKNOWN')
  })
})

describe('GBJ Checklist Decision Production Evaluator (gbjQcFlow.js)', () => {
  it('should evaluate to PASS when all 5 items are OK', () => {
    const states = [
      { status: 'ok', photo: null },
      { status: 'ok', photo: null },
      { status: 'ok', photo: null },
      { status: 'ok', photo: null },
      { status: 'ok', photo: null }
    ]
    const res = evaluateGbjChecklist(states, GBJ_VEHICLE_CHECKLIST)
    expect(res.isComplete).toBe(true)
    expect(res.passed).toBe(true)
    expect(res.result).toBe('PASS')
    expect(res.notOkLabels).toHaveLength(0)
    expect(res.defaultNotes).toContain('Lolos QC Vehicle Checklist GBJ')
  })

  it('should evaluate to REJECT when 1 or more items are NOT OK (with photo attached)', () => {
    const states = [
      { status: 'ok', photo: null },
      { status: 'not_ok', photo: 'data:image/jpeg;base64,mockphoto' },
      { status: 'ok', photo: null },
      { status: 'ok', photo: null },
      { status: 'not_ok', photo: 'data:image/jpeg;base64,mockphoto' }
    ]
    const res = evaluateGbjChecklist(states, GBJ_VEHICLE_CHECKLIST)
    expect(res.isComplete).toBe(true)
    expect(res.passed).toBe(false)
    expect(res.result).toBe('REJECT')
    expect(res.notOkLabels).toHaveLength(2)
    expect(res.defaultNotes).toContain('[REJECT QC VEHICLE GBJ]')
    expect(res.defaultNotes).toContain('Free of haram and najis material')
    expect(res.defaultNotes).toContain('There is a cover if the floor is holey or dirty')
  })

  it('should evaluate isComplete to false if any item is incomplete', () => {
    const states = [
      { status: 'ok', photo: null },
      { status: null, photo: null },
      { status: 'ok', photo: null },
      { status: 'ok', photo: null },
      { status: 'ok', photo: null }
    ]
    const res = evaluateGbjChecklist(states, GBJ_VEHICLE_CHECKLIST)
    expect(res.isComplete).toBe(false)
  })
})

describe('GBJ QC Payload Builder Semantics (buildGbjQcPayload)', () => {
  it('should build payload with correct typed fields for GBJ and omit non-applicable fields', () => {
    const states = [
      { status: 'ok', photo: null },                              // 0. No pest found
      { status: 'ok', photo: null },                              // 1. Free of haram/najis
      { status: 'ok', photo: null },                              // 2. Clean & odour free
      { status: 'ok', photo: null },                              // 3. No chemicals
      { status: 'ok', photo: null }                               // 4. Floor cover
    ]
    const payload = buildGbjQcPayload(states, GBJ_VEHICLE_CHECKLIST)

    expect(payload.result).toBe('PASS')
    expect(payload.pestEvidence).toBe(true)
    expect(payload.vehicleCleanliness).toBe(true)
    expect(payload.vehicleOdor).toBe(true)
    expect(payload.vehicleCondition).toBe(true)
    expect(payload.documentCompleteness).toBeUndefined()
    expect(payload.sealCondition).toBeUndefined()
    expect(payload.checklistItems.items).toHaveLength(5)
  })
})
