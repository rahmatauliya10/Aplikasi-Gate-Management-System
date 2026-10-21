import { OperationHistoryBottleneck } from './dto/operation-history-query.dto';

export type OperationHistoryStatusLabel =
  'SAFE' | 'WARNING' | 'CRITICAL' | 'PENDING' | 'ERROR DATA';

export type OperationHistoryDataQualityFlag =
  | 'MISSING_TIMESTAMP'
  | 'INVALID_TIMESTAMP'
  | 'INVERTED_TIMESTAMP'
  | 'PARTIAL_QC_TIMESTAMP'
  | 'PARTIAL_WAREHOUSE_TIMESTAMP'
  | 'MISSING_WEIGHT'
  | 'INVALID_WEIGHT'
  | 'REJECTED_NOT_EVALUATED';

export interface OperationHistoryDurations {
  waitingIn: number | null;
  warehouse: number | null;
  qc: number | null;
  waitingOut: number | null;
  total: number | null;
  dataQuality: OperationHistoryDataQualityFlag[];
}

export interface OperationHistoryFraud {
  net: number | null;
  roll: number | null;
  diff: number | null;
  ratioPercent: number | null;
  deviationPercent: number | null;
  direction: '+' | '-' | '=' | null;
  status: OperationHistoryStatusLabel;
  dataQuality: OperationHistoryDataQualityFlag[];
}

// These are the existing producer thresholds. Reports must not invent a
// different classification for records that have no persisted FraudCheck.
export const FRAUD_WARNING_THRESHOLD_PERCENT = 2;
export const FRAUD_CRITICAL_THRESHOLD_PERCENT = 5;

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

const minutesBetween = (
  start: unknown,
  end: unknown,
  quality: OperationHistoryDataQualityFlag[],
): number | null => {
  const startDate = asDate(start);
  const endDate = asDate(end);
  if (!start && !end) {
    quality.push('MISSING_TIMESTAMP');
    return null;
  }
  if (!startDate || !endDate) {
    quality.push('INVALID_TIMESTAMP');
    return null;
  }
  const minutes = (endDate.getTime() - startDate.getTime()) / 60000;
  if (minutes < 0) {
    quality.push('INVERTED_TIMESTAMP');
    return null;
  }
  return Math.round(minutes);
};

const latestCurrent = (items: any[] | undefined): any | null => {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    [...items]
      .filter((item) => item?.isCurrent === true && item?.isVoided !== true)
      .sort((left, right) => {
        const revision =
          Number(right?.revision || 0) - Number(left?.revision || 0);
        if (revision !== 0) return revision;
        const rightCreated = asDate(right?.createdAt)?.getTime() || 0;
        const leftCreated = asDate(left?.createdAt)?.getTime() || 0;
        if (rightCreated !== leftCreated) return rightCreated - leftCreated;
        return String(right?.id || '').localeCompare(String(left?.id || ''));
      })[0] || null
  );
};

const latestFraudCheck = (items: any[] | undefined): any | null => {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    [...items].sort((left, right) => {
      const rightCalculated = asDate(right?.calculatedAt)?.getTime() || 0;
      const leftCalculated = asDate(left?.calculatedAt)?.getTime() || 0;
      if (rightCalculated !== leftCalculated)
        return rightCalculated - leftCalculated;
      const rightCreated = asDate(right?.createdAt)?.getTime() || 0;
      const leftCreated = asDate(left?.createdAt)?.getTime() || 0;
      if (rightCreated !== leftCreated) return rightCreated - leftCreated;
      return String(right?.id || '').localeCompare(String(left?.id || ''));
    })[0] || null
  );
};

const intervalFromPair = (
  start: unknown,
  end: unknown,
  quality: OperationHistoryDataQualityFlag[],
  partialFlag: OperationHistoryDataQualityFlag,
): number | null => {
  if ((start == null) !== (end == null)) quality.push(partialFlag);
  return durationBetween(start, end, quality);
};

const completePair = (start: unknown, end: unknown): boolean =>
  start != null && end != null;

const durationBetween = (
  start: unknown,
  end: unknown,
  quality: OperationHistoryDataQualityFlag[],
): number | null => minutesBetween(start, end, quality);

export function getOperationHistoryDurations(
  tx: any,
): OperationHistoryDurations {
  const quality: OperationHistoryDataQualityFlag[] = [];
  const gateIn = tx.gateInAt || tx.createdAt;
  const warehouse = latestCurrent(tx.warehouseProcesses);
  const vehicle = latestCurrent(tx.qcVehicleChecks);
  const incoming = latestCurrent(tx.incomingMaterialChecks);

  const warehouseStart = warehouse ? warehouse.startAt : tx.warehouseStartAt;
  const warehouseEnd = warehouse ? warehouse.endAt : tx.warehouseEndAt;
  const warehouseDuration = intervalFromPair(
    warehouseStart,
    warehouseEnd,
    quality,
    'PARTIAL_WAREHOUSE_TIMESTAMP',
  );

  const qcPairs = [
    { start: vehicle?.startedAt, end: vehicle?.completedAt },
    { start: incoming?.startedAt, end: incoming?.completedAt },
  ];
  const hasQcChild = Boolean(vehicle || incoming);
  const completeQcPairs = qcPairs.filter((pair) =>
    completePair(pair.start, pair.end),
  );
  const qcDurations = completeQcPairs.map((pair) =>
    durationBetween(pair.start, pair.end, quality),
  );
  for (const pair of qcPairs) {
    if (
      !completePair(pair.start, pair.end) &&
      (pair.start != null || pair.end != null)
    )
      quality.push('PARTIAL_QC_TIMESTAMP');
  }
  const qc =
    completeQcPairs.length > 0
      ? qcDurations.reduce<number | null>(
          (total, duration) =>
            duration === null ? total : (total ?? 0) + duration,
          null,
        )
      : hasQcChild
        ? null
        : intervalFromPair(
            tx.qcStartAt,
            tx.qcEndAt,
            quality,
            'PARTIAL_QC_TIMESTAMP',
          );

  const durations = {
    waitingIn: durationBetween(gateIn, tx.weighInAt, quality),
    warehouse: warehouseDuration,
    qc,
    waitingOut: durationBetween(warehouseEnd, tx.weighOutAt, quality),
    total: durationBetween(gateIn, tx.gateOutAt, quality),
    dataQuality: [...new Set(quality)],
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
  const available = stages.filter(
    (stage) => typeof durations[stage] === 'number',
  );
  if (available.length === 0) return OperationHistoryBottleneck.ALL;
  return available.reduce((longest, stage) =>
    (durations[stage] ?? -1) > (durations[longest] ?? -1) ? stage : longest,
  );
}

function getWeighbridgeWeight(
  tx: any,
  logicalWeight: 'gross' | 'tare',
  quality: OperationHistoryDataQualityFlag[] = [],
): number | null {
  const processType = String(tx.processType || '');
  const recordType =
    processType === 'GBJ'
      ? logicalWeight === 'gross'
        ? 'OUT'
        : 'IN'
      : logicalWeight === 'gross'
        ? 'IN'
        : 'OUT';
  const rootWeight = logicalWeight === 'gross' ? tx.grossWeight : tx.tareWeight;
  const records = Array.isArray(tx.weighbridgeRecords)
    ? tx.weighbridgeRecords
        .filter(
          (item: any) => item.type === recordType && item.isCurrent !== false,
        )
        .sort((left: any, right: any) => {
          const revision =
            Number(right?.revision || 0) - Number(left?.revision || 0);
          if (revision !== 0) return revision;
          const rightCreated = asDate(right?.createdAt)?.getTime() || 0;
          const leftCreated = asDate(left?.createdAt)?.getTime() || 0;
          if (rightCreated !== leftCreated) return rightCreated - leftCreated;
          return String(right?.id || '').localeCompare(String(left?.id || ''));
        })
    : [];
  const raw = records[0]?.weight ?? rootWeight;
  const value = asNumber(raw);
  if (raw !== null && raw !== undefined && value === null)
    quality.push('INVALID_WEIGHT');
  if (value === null) quality.push('MISSING_WEIGHT');
  return value;
}

function getNetWeight(
  tx: any,
  quality: OperationHistoryDataQualityFlag[],
): number | null {
  const persistedNet = asNumber(tx.netWeight);
  if (
    tx.netWeight !== null &&
    tx.netWeight !== undefined &&
    persistedNet === null
  ) {
    quality.push('INVALID_WEIGHT');
  }
  if (persistedNet !== null && persistedNet > 0) return persistedNet;
  const gross = getWeighbridgeWeight(tx, 'gross', quality);
  const tare = getWeighbridgeWeight(tx, 'tare', quality);
  if (gross === null || tare === null) return null;
  if (gross <= tare) {
    quality.push('INVALID_WEIGHT');
    return null;
  }
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
  _toleranceLimit = FRAUD_WARNING_THRESHOLD_PERCENT,
): OperationHistoryFraud {
  const quality: OperationHistoryDataQualityFlag[] = [];
  const latestFraud = latestFraudCheck(tx.fraudChecks);
  const fraudNet = asNumber(latestFraud?.netWeight);
  const fraudRoll = asNumber(latestFraud?.warehouseActualWeight);
  const net = fraudNet ?? getNetWeight(tx, quality);
  const rawRoll = fraudRoll ?? asNumber(tx.actualWeight);
  const roll = rawRoll !== null && rawRoll > 0 ? rawRoll : null;
  if (rawRoll !== null && rawRoll <= 0) quality.push('INVALID_WEIGHT');
  if (rawRoll === null) quality.push('MISSING_WEIGHT');
  const rejected =
    ['INCOMING_CHECK_REJECTED', 'QC_VEHICLE_REJECTED'].includes(tx.status) ||
    tx.incomingMaterialChecks?.some(
      (check: any) => check.result === 'REJECT',
    ) ||
    tx.qcVehicleChecks?.some((check: any) => check.result === 'REJECT');

  if (rejected) {
    quality.push('REJECTED_NOT_EVALUATED');
    return {
      net,
      roll,
      diff: null,
      ratioPercent: null,
      deviationPercent: null,
      direction: null,
      status: 'PENDING',
      dataQuality: [...new Set(quality)],
    };
  }

  const fraudDeviation = asNumber(latestFraud?.deviationPercent);
  if (net === null || roll === null) {
    // A persisted FraudCheck is historical evidence even when its numeric
    // inputs are unavailable to this projection. Preserve its verdict and
    // expose the missing evidence through dataQuality rather than silently
    // replacing it with a newly derived PENDING status.
    return {
      net,
      roll,
      diff: null,
      ratioPercent: null,
      deviationPercent: fraudDeviation,
      direction: null,
      status: latestFraud ? mapFraudStatus(latestFraud.riskLevel) : 'PENDING',
      dataQuality: [...new Set(quality)],
    };
  }

  const rawDiff = roll - net;
  const deviationPercent = fraudDeviation ?? Math.abs(100 - (roll / net) * 100);
  const status = latestFraud
    ? mapFraudStatus(latestFraud.riskLevel)
    : deviationPercent > FRAUD_CRITICAL_THRESHOLD_PERCENT
      ? 'CRITICAL'
      : deviationPercent > FRAUD_WARNING_THRESHOLD_PERCENT
        ? 'WARNING'
        : 'SAFE';

  return {
    net,
    roll,
    diff: Math.abs(rawDiff),
    ratioPercent: (roll / net) * 100,
    deviationPercent,
    direction: rawDiff > 0 ? '+' : rawDiff < 0 ? '-' : '=',
    status,
    dataQuality: [...new Set(quality)],
  };
}

export function normalizeOperationHistoryTransaction(
  tx: any,
  _toleranceLimit = FRAUD_WARNING_THRESHOLD_PERCENT,
): any {
  const durations = getOperationHistoryDurations(tx);
  const fraud = getOperationHistoryFraud(tx);
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
      gross: getWeighbridgeWeight(tx, 'gross'),
      tare: getWeighbridgeWeight(tx, 'tare'),
      net: fraud.net,
      rollWeight: fraud.roll,
    },
  };
}
