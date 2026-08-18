import { describe, it, expect } from 'vitest';

export const VALID_STATUS_TRANSITIONS = {
  REGISTERED: ['WEIGH_IN_DONE', 'QC_VEHICLE_PENDING', 'CANCELLED'],
  WEIGH_IN_DONE: ['QC_VEHICLE_PENDING', 'CANCELLED'],
  QC_VEHICLE_PENDING: ['QC_VEHICLE_IN_PROGRESS', 'QC_VEHICLE_PASSED', 'QC_VEHICLE_REJECTED', 'CANCELLED'],
  QC_VEHICLE_IN_PROGRESS: ['QC_VEHICLE_PASSED', 'QC_VEHICLE_REJECTED', 'CANCELLED'],
  QC_VEHICLE_PASSED: ['WAREHOUSE_IN_PROGRESS', 'CANCELLED'],
  QC_VEHICLE_REJECTED: ['WEIGH_OUT_DONE', 'CANCELLED'],
  WAREHOUSE_IN_PROGRESS: ['INCOMING_CHECK_PENDING', 'WAREHOUSE_DONE', 'CANCELLED'],
  WAREHOUSE_DONE: ['WEIGH_OUT_DONE', 'CANCELLED'],
  INCOMING_CHECK_PENDING: ['INCOMING_CHECK_IN_PROGRESS', 'INCOMING_CHECK_PASSED', 'INCOMING_CHECK_REJECTED', 'CANCELLED'],
  INCOMING_CHECK_IN_PROGRESS: ['INCOMING_CHECK_PASSED', 'INCOMING_CHECK_REJECTED', 'CANCELLED'],
  INCOMING_CHECK_PASSED: ['WEIGH_OUT_DONE', 'CANCELLED'],
  INCOMING_CHECK_REJECTED: ['WEIGH_OUT_DONE', 'CANCELLED'],
  WEIGH_OUT_DONE: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: []
};

export function canTransition(currentStatus, targetStatus) {
  if (currentStatus === targetStatus) return true;
  const allowed = VALID_STATUS_TRANSITIONS[currentStatus] || [];
  return allowed.includes(targetStatus);
}

describe('Frontend Workflow State Transitions & Navigation Guard', () => {
  it('should allow normal sequential progression for GBB flow', () => {
    expect(canTransition('REGISTERED', 'WEIGH_IN_DONE')).toBe(true);
    expect(canTransition('WEIGH_IN_DONE', 'QC_VEHICLE_PENDING')).toBe(true);
    expect(canTransition('QC_VEHICLE_PENDING', 'QC_VEHICLE_PASSED')).toBe(true);
    expect(canTransition('QC_VEHICLE_PASSED', 'WAREHOUSE_IN_PROGRESS')).toBe(true);
    expect(canTransition('WAREHOUSE_IN_PROGRESS', 'WAREHOUSE_DONE')).toBe(true);
    expect(canTransition('WAREHOUSE_DONE', 'WEIGH_OUT_DONE')).toBe(true);
    expect(canTransition('WEIGH_OUT_DONE', 'COMPLETED')).toBe(true);
  });

  it('should block skipping forward steps', () => {
    expect(canTransition('REGISTERED', 'WAREHOUSE_DONE')).toBe(false);
    expect(canTransition('QC_VEHICLE_PENDING', 'COMPLETED')).toBe(false);
  });

  it('should allow cancellation from any intermediate step', () => {
    expect(canTransition('REGISTERED', 'CANCELLED')).toBe(true);
    expect(canTransition('QC_VEHICLE_PENDING', 'CANCELLED')).toBe(true);
    expect(canTransition('WAREHOUSE_IN_PROGRESS', 'CANCELLED')).toBe(true);
  });

  it('should not allow transitions out of COMPLETED or CANCELLED without explicit admin reopen', () => {
    expect(canTransition('COMPLETED', 'REGISTERED')).toBe(false);
    expect(canTransition('COMPLETED', 'WEIGH_OUT_DONE')).toBe(false);
    expect(canTransition('CANCELLED', 'REGISTERED')).toBe(false);
  });
});
