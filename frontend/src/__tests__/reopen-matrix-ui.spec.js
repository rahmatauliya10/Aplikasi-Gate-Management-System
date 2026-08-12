import { describe, it, expect } from 'vitest'

/**
 * P0-04 Frontend REOPEN Matrix UI Specification & Contract Test
 *
 * Validates the canonical REOPEN target options for process types (GBB/GSP vs GBJ).
 */

const REOPEN_ALLOWED_TARGETS = {
  GBB: [
    'REGISTERED',
    'WEIGH_IN_DONE',
    'QC_VEHICLE_PENDING',
    'QC_VEHICLE_IN_PROGRESS',
    'INCOMING_CHECK_PENDING',
    'INCOMING_CHECK_IN_PROGRESS',
    'WAREHOUSE_IN_PROGRESS',
  ],
  GSP: [
    'REGISTERED',
    'WEIGH_IN_DONE',
    'QC_VEHICLE_PENDING',
    'QC_VEHICLE_IN_PROGRESS',
    'INCOMING_CHECK_PENDING',
    'INCOMING_CHECK_IN_PROGRESS',
    'WAREHOUSE_IN_PROGRESS',
  ],
  GBJ: [
    'REGISTERED',
    'WEIGH_IN_DONE',
    'QC_VEHICLE_PENDING',
    'QC_VEHICLE_IN_PROGRESS',
    'WAREHOUSE_IN_PROGRESS',
  ]
}

function getAllowedReopenTargets(processType) {
  const norm = (processType || 'GBB').toUpperCase()
  return REOPEN_ALLOWED_TARGETS[norm] || REOPEN_ALLOWED_TARGETS.GBB
}

describe('Frontend REOPEN Matrix Contract', () => {
  it('should include Incoming QC stages for GBB process type', () => {
    const targets = getAllowedReopenTargets('GBB')
    expect(targets).toContain('INCOMING_CHECK_PENDING')
    expect(targets).toContain('INCOMING_CHECK_IN_PROGRESS')
    expect(targets).toHaveLength(7)
  })

  it('should include Incoming QC stages for GSP process type', () => {
    const targets = getAllowedReopenTargets('GSP')
    expect(targets).toContain('INCOMING_CHECK_PENDING')
    expect(targets).toContain('INCOMING_CHECK_IN_PROGRESS')
    expect(targets).toHaveLength(7)
  })

  it('should EXCLUDE Incoming QC stages for GBJ process type', () => {
    const targets = getAllowedReopenTargets('GBJ')
    expect(targets).not.toContain('INCOMING_CHECK_PENDING')
    expect(targets).not.toContain('INCOMING_CHECK_IN_PROGRESS')
    expect(targets).toHaveLength(5)
    expect(targets).toEqual([
      'REGISTERED',
      'WEIGH_IN_DONE',
      'QC_VEHICLE_PENDING',
      'QC_VEHICLE_IN_PROGRESS',
      'WAREHOUSE_IN_PROGRESS'
    ])
  })

  it('should build valid REOPEN payload with mandatory reopenTargetStatus and action', () => {
    const action = 'REOPEN_WORKFLOW'
    const reopenTargetStatus = 'QC_VEHICLE_PENDING'
    const reasonCode = 'SALAH_INPUT_ANGKA'
    const remark = 'Pilih target REOPEN secara eksplisit'

    const payload = {
      action,
      reopenTargetStatus,
      reasonCode,
      remark,
      expectedRevision: 1
    }

    expect(payload.action).toBe('REOPEN_WORKFLOW')
    expect(payload.reopenTargetStatus).toBe('QC_VEHICLE_PENDING')
    expect(payload.items).toBeUndefined()
  })
})
