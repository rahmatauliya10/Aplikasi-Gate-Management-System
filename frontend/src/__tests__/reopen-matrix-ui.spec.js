import { describe, it, expect } from 'vitest'

/**
 * P0-04 Frontend REOPEN Matrix UI Specification & Contract Test
 *
 * Validates the canonical REOPEN target options for process types (GBB/GSP vs GBJ).
 */

const REOPEN_ALLOWED_TARGETS = {
  GBB: [
    'REGISTERED',
    'QC_VEHICLE_PENDING',
    'QC_VEHICLE_PASSED',
    'INCOMING_CHECK_PENDING',
  ],
  GSP: [
    'REGISTERED',
    'QC_VEHICLE_PENDING',
    'QC_VEHICLE_PASSED',
    'INCOMING_CHECK_PENDING',
  ],
  GBJ: [
    'REGISTERED',
    'QC_VEHICLE_PENDING',
    'QC_VEHICLE_PASSED',
  ]
}

function getAllowedReopenTargets(processType) {
  const norm = (processType || 'GBB').toUpperCase()
  return REOPEN_ALLOWED_TARGETS[norm] || REOPEN_ALLOWED_TARGETS.GBB
}

describe('Frontend REOPEN Matrix Contract', () => {
  it('should include Incoming QC stage for GBB process type', () => {
    const targets = getAllowedReopenTargets('GBB')
    expect(targets).toContain('INCOMING_CHECK_PENDING')
    expect(targets).toContain('QC_VEHICLE_PASSED')
    expect(targets).toHaveLength(4)
  })

  it('should include Incoming QC stage for GSP process type', () => {
    const targets = getAllowedReopenTargets('GSP')
    expect(targets).toContain('INCOMING_CHECK_PENDING')
    expect(targets).toContain('QC_VEHICLE_PASSED')
    expect(targets).toHaveLength(4)
  })

  it('should EXCLUDE Incoming QC stage for GBJ process type', () => {
    const targets = getAllowedReopenTargets('GBJ')
    expect(targets).not.toContain('INCOMING_CHECK_PENDING')
    expect(targets).toHaveLength(3)
    expect(targets).toEqual([
      'REGISTERED',
      'QC_VEHICLE_PENDING',
      'QC_VEHICLE_PASSED'
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
