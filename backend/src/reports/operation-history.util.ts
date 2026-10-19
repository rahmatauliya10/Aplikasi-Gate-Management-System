import { OperationHistoryBottleneck } from './dto/operation-history-query.dto';

export type OperationHistoryStatusLabel =
  'SAFE' | 'WARNING' | 'CRITICAL' | 'PENDING' | 'ERROR DATA';

export interface OperationHistoryDurations {
  waitingIn: number;
  warehouse: number;
  qc: number;
  waitingOut: number;
  total: number;
}

export interface OperationHistoryFraud {
  net: number;
  roll: number;
  diff: number;
  ratioPercent: number;
  deviationPercent: number | null;
  direction: '+' | '-' | '=';
  status: OperationHistoryStatusLabel;
}

const asNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const asDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const minutesBetween = (start: unknown, end: unknown): number => {
  const startDate = asDate(start);
  const endDate = asDate(end);
  if (!startDate || !endDate) return 0;
  return Math.max(
    0,
    Math.round((endDate.getTime() - startDate.getTime()) / 60000),
  );
};

const latestCurrent = (items: any[] | undefined): any | null => {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items[0] || null;
};

function getQcDuration(tx: any): number {
  const vehicle = latestCurrent(tx.qcVehicleChecks);
  const incoming = latestCurrent(tx.incomingMaterialChecks);
  const relationDuration =
    minutesBetween(vehicle?.startedAt, vehicle?.completedAt) +
    minutesBetween(incoming?.startedAt, incoming?.completedAt);

  const hasCompleteRelation =
    !!(vehicle?.startedAt && vehicle?.completedAt) ||
    !!(incoming?.startedAt && incoming?.completedAt);

  return hasCompleteRelation
    ? relationDuration
    : minutesBetween(tx.qcStartAt, tx.qcEndAt);
}

export function getOperationHistoryDurations(
  tx: any,
): OperationHistoryDurations {
  const gateIn = tx.gateInAt || tx.createdAt;
  const warehouse = latestCurrent(tx.warehouseProcesses);
  const durations = {
    waitingIn: minutesBetween(gateIn, tx.weighInAt),
    warehouse: minutesBetween(
      warehouse?.startAt || tx.warehouseStartAt,
      warehouse?.endAt || tx.warehouseEndAt,
    ),
    qc: getQcDuration(tx),
    waitingOut: minutesBetween(
      warehouse?.endAt || tx.warehouseEndAt,
      tx.weighOutAt,
    ),
    total: minutesBetween(gateIn, tx.gateOutAt),
  };
  return durations;
}

export function getOperationHistoryBottleneck(
  durations: OperationHistoryDurations,
): OperationHistoryBottleneck {
  const stages = [
    OperationHistoryBottleneck.WAITING_IN,
    OperationHistoryBottleneck.WAREHOUSE,
    OperationHistoryBottleneck.QC,
    OperationHistoryBottleneck.WAITING_OUT,
  ] as const;
  return stages.reduce((longest, stage) =>
    durations[stage] > durations[longest] ? stage : longest,
  );
}

function getWeighbridgeWeight(tx: any, type: 'IN' | 'OUT'): number | null {
  const records = Array.isArray(tx.weighbridgeRecords)
    ? tx.weighbridgeRecords
    : [];
  const record = records.find((item: any) => item.type === type);
  if (record) return asNumber(record.weight);
  return type === 'IN' ? asNumber(tx.grossWeight) : asNumber(tx.tareWeight);
}

function getNetWeight(tx: any): number | null {
  const persistedNet = asNumber(tx.netWeight);
  if (persistedNet !== null && persistedNet > 0) return persistedNet;
  const gross = getWeighbridgeWeight(tx, 'IN');
  const tare = getWeighbridgeWeight(tx, 'OUT');
  if (gross === null || tare === null || gross <= tare) return null;
  return gross - tare;
}

function mapFraudStatus(riskLevel: unknown): OperationHistoryStatusLabel {
  switch (riskLevel) {
    case 'SAFE':
      return 'SAFE';
    case 'WARNING':
      return 'WARNING';
    case 'CRITICAL':
      return 'CRITICAL';
    case 'INVALID_DATA':
      return 'ERROR DATA';
    case 'PENDING_DATA':
    default:
      return 'PENDING';
  }
}

export function getOperationHistoryFraud(
  tx: any,
  toleranceLimit = 2,
): OperationHistoryFraud {
  const latestFraud = latestCurrent(tx.fraudChecks);
  const net = asNumber(latestFraud?.netWeight) ?? getNetWeight(tx) ?? 0;
  const roll =
    asNumber(latestFraud?.warehouseActualWeight) ??
    asNumber(tx.actualWeight) ??
    0;
  const rejected =
    ['INCOMING_CHECK_REJECTED', 'QC_VEHICLE_REJECTED'].includes(tx.status) ||
    tx.incomingMaterialChecks?.some(
      (check: any) => check.result === 'REJECT',
    ) ||
    tx.qcVehicleChecks?.some((check: any) => check.result === 'REJECT');

  if (rejected) {
    return {
      net,
      roll: 0,
      diff: 0,
      ratioPercent: 100,
      deviationPercent: 0,
      direction: '=',
      status: 'SAFE',
    };
  }

  const fraudDeviation = asNumber(latestFraud?.deviationPercent);
  const calculatedNet = net > 0 ? net : null;
  const calculatedRoll = roll > 0 ? roll : null;
  if (!calculatedNet || !calculatedRoll) {
    return {
      net,
      roll,
      diff: 0,
      ratioPercent: 0,
      deviationPercent: null,
      direction: '=',
      status: latestFraud ? mapFraudStatus(latestFraud.riskLevel) : 'PENDING',
    };
  }

  const rawDiff = calculatedRoll - calculatedNet;
  const deviationPercent =
    fraudDeviation ?? Math.abs(100 - (calculatedRoll / calculatedNet) * 100);
  const status = latestFraud
    ? mapFraudStatus(latestFraud.riskLevel)
    : deviationPercent > toleranceLimit
      ? 'CRITICAL'
      : deviationPercent > toleranceLimit / 2
        ? 'WARNING'
        : 'SAFE';

  return {
    net: calculatedNet,
    roll: calculatedRoll,
    diff: Math.abs(rawDiff),
    ratioPercent: (calculatedRoll / calculatedNet) * 100,
    deviationPercent,
    direction: rawDiff > 0 ? '+' : rawDiff < 0 ? '-' : '=',
    status,
  };
}

export function normalizeOperationHistoryTransaction(
  tx: any,
  toleranceLimit = 2,
): any {
  const durations = getOperationHistoryDurations(tx);
  const fraud = getOperationHistoryFraud(tx, toleranceLimit);
  const vehicle = latestCurrent(tx.qcVehicleChecks);
  const incoming = latestCurrent(tx.incomingMaterialChecks);
  const warehouse = latestCurrent(tx.warehouseProcesses);
  const qc = incoming || vehicle;

  return {
    ...tx,
    permitCard: tx.permitCardNumber ?? null,
    correctionCount: Array.isArray(tx.corrections) ? tx.corrections.length : 0,
    durations,
    bottleneck: getOperationHistoryBottleneck(durations),
    fraud,
    qcDetails: qc
      ? {
          status: qc.result ?? null,
          note: qc.notes || qc.defectNotes || '',
          kadarAir: asNumber(qc.moisture),
          totalFM: asNumber(qc.foreignMatter),
          bijiOK: qc.beanCondition === 'PASS' || qc.result === 'PASS' ? 100 : 0,
          pic: qc.checkedBy?.name || 'N/A',
          vehicleCleanliness: vehicle?.vehicleCleanliness ?? null,
          vehicleOdor: vehicle?.vehicleOdor ?? null,
          pestEvidence: vehicle?.pestEvidence ?? null,
          vehicleCondition: vehicle?.vehicleCondition ?? null,
          documentCompleteness: vehicle?.documentCompleteness ?? null,
          sealCondition: vehicle?.sealCondition ?? null,
        }
      : null,
    timestamps: {
      gateInAt: tx.gateInAt || tx.createdAt || null,
      weighInAt: tx.weighInAt || null,
      warehouseStartAt: warehouse?.startAt || tx.warehouseStartAt || null,
      warehouseEndAt: warehouse?.endAt || tx.warehouseEndAt || null,
      qcVehicleStartAt: vehicle?.startedAt || null,
      qcVehicleEndAt: vehicle?.completedAt || null,
      incomingCheckStartAt: incoming?.startedAt || tx.incomingQcStartAt || null,
      incomingCheckEndAt: incoming?.completedAt || null,
      qcStartAt: tx.qcStartAt || null,
      qcEndAt: tx.qcEndAt || null,
      weighOutAt: tx.weighOutAt || null,
      gateOutAt: tx.gateOutAt || null,
      completedAt: tx.completedAt || null,
      cancelledAt: tx.cancelledAt || null,
    },
    weights: {
      gross: getWeighbridgeWeight(tx, 'IN'),
      tare: getWeighbridgeWeight(tx, 'OUT'),
      net: fraud.net,
      rollWeight: fraud.roll,
    },
  };
}
