import 'reflect-metadata';
import {
  getOperationHistoryDurations,
  getOperationHistoryFraud,
} from './operation-history.util';

describe('operation history normalization', () => {
  it('distinguishes missing timestamps from zero duration', () => {
    const durations = getOperationHistoryDurations({
      createdAt: '2026-01-01T00:00:00.000Z',
      gateInAt: '2026-01-01T00:00:00.000Z',
      weighInAt: '2026-01-01T00:00:00.000Z',
    });

    expect(durations.waitingIn).toBe(0);
    expect(durations.total).toBeNull();
    expect(durations.dataQuality).toContain('MISSING_TIMESTAMP');
  });

  it('marks inverted timestamps as invalid rather than clamping them to zero', () => {
    const durations = getOperationHistoryDurations({
      createdAt: '2026-01-01T01:00:00.000Z',
      gateInAt: '2026-01-01T01:00:00.000Z',
      weighInAt: '2026-01-01T00:00:00.000Z',
    });

    expect(durations.waitingIn).toBeNull();
    expect(durations.dataQuality).toContain('INVERTED_TIMESTAMP');
  });

  it('selects the highest current revision deterministically', () => {
    const fraud = getOperationHistoryFraud({
      status: 'COMPLETED',
      netWeight: 100,
      actualWeight: 95,
      fraudChecks: [
        { id: 'old', revision: 1, warehouseActualWeight: 80 },
        { id: 'new', revision: 2, warehouseActualWeight: 105 },
      ],
    });

    expect(fraud.roll).toBe(105);
  });

  it('does not present rejected transactions as SAFE or as zero deviation', () => {
    const fraud = getOperationHistoryFraud({
      status: 'QC_VEHICLE_REJECTED',
      netWeight: 100,
      actualWeight: 100,
      fraudChecks: [],
    });

    expect(fraud.status).toBe('PENDING');
    expect(fraud.deviationPercent).toBeNull();
    expect(fraud.diff).toBeNull();
    expect(fraud.dataQuality).toContain('REJECTED_NOT_EVALUATED');
  });

  it('preserves true zero values without converting missing values to zero', () => {
    const missing = getOperationHistoryFraud({ status: 'COMPLETED' });
    expect(missing.net).toBeNull();
    expect(missing.roll).toBeNull();
    expect(missing.deviationPercent).toBeNull();

    const zero = getOperationHistoryFraud({
      status: 'COMPLETED',
      netWeight: 0,
      actualWeight: 0,
    });
    expect(zero.net).toBeNull();
    expect(zero.roll).toBeNull();
    expect(zero.dataQuality).toContain('INVALID_WEIGHT');
  });
});
