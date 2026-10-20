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

  it('sums complete vehicle and incoming QC pairs without mixing endpoints', () => {
    const durations = getOperationHistoryDurations({
      qcVehicleChecks: [
        {
          id: 'vehicle-current',
          isCurrent: true,
          isVoided: false,
          revision: 2,
          startedAt: '2026-01-01T00:00:00.000Z',
          completedAt: '2026-01-01T01:00:00.000Z',
        },
      ],
      incomingMaterialChecks: [
        {
          id: 'incoming-current',
          isCurrent: true,
          isVoided: false,
          revision: 1,
          startedAt: '2026-01-01T02:00:00.000Z',
          completedAt: '2026-01-01T02:30:00.000Z',
        },
      ],
    });

    expect(durations.qc).toBe(90);
    expect(durations.dataQuality).not.toContain('PARTIAL_QC_TIMESTAMP');
  });

  it('returns null with a quality flag for partial QC instead of mixing endpoints', () => {
    const durations = getOperationHistoryDurations({
      qcVehicleChecks: [
        {
          isCurrent: true,
          isVoided: false,
          revision: 1,
          startedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      qcEndAt: '2026-01-01T01:00:00.000Z',
    });

    expect(durations.qc).toBeNull();
    expect(durations.dataQuality).toContain('PARTIAL_QC_TIMESTAMP');
  });

  it('uses a complete transaction warehouse pair only when no current child exists', () => {
    const durations = getOperationHistoryDurations({
      warehouseProcesses: [
        {
          isCurrent: true,
          isVoided: false,
          revision: 2,
          startAt: '2026-01-01T03:00:00.000Z',
        },
      ],
      warehouseStartAt: '2026-01-01T00:00:00.000Z',
      warehouseEndAt: '2026-01-01T02:00:00.000Z',
    });

    expect(durations.warehouse).toBeNull();
    expect(durations.waitingOut).toBeNull();
    expect(durations.dataQuality).toContain('PARTIAL_WAREHOUSE_TIMESTAMP');
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

  it('selects the latest FraudCheck by calculatedAt, not revision', () => {
    const fraud = getOperationHistoryFraud({
      status: 'COMPLETED',
      netWeight: 100,
      actualWeight: 95,
      fraudChecks: [
        {
          id: 'old',
          revision: 1,
          warehouseActualWeight: 80,
          calculatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'new',
          revision: 2,
          warehouseActualWeight: 105,
          calculatedAt: '2026-01-01T01:00:00.000Z',
        },
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

  it.each([
    [98, 'SAFE'],
    [97, 'WARNING'],
    [94, 'CRITICAL'],
    [98.01, 'SAFE'],
    [97.99, 'WARNING'],
  ])('uses producer fallback boundaries for roll ratio %s', (roll, status) => {
    const fraud = getOperationHistoryFraud({
      status: 'COMPLETED',
      netWeight: 100,
      actualWeight: roll,
    });

    expect(fraud.status).toBe(status);
  });

  it('preserves a persisted verdict when projection weights are unavailable', () => {
    const fraud = getOperationHistoryFraud({
      status: 'COMPLETED',
      fraudChecks: [
        {
          id: 'persisted-critical',
          riskLevel: 'CRITICAL',
          deviationPercent: 7,
          calculatedAt: '2026-01-01T01:00:00.000Z',
        },
      ],
    });

    expect(fraud.status).toBe('CRITICAL');
    expect(fraud.deviationPercent).toBe(7);
    expect(fraud.net).toBeNull();
    expect(fraud.roll).toBeNull();
  });
});
