/**
 * Helper constants and functions for Prisma queries to enforce
 * current-revision filtering (`isCurrent: true`) across operational views.
 */

export const IS_CURRENT_FILTER = { isCurrent: true };

export const WHERE_IS_CURRENT = { where: IS_CURRENT_FILTER };

export const TRANSACTION_CURRENT_RELATIONS_INCLUDE = {
  weighbridgeRecords: WHERE_IS_CURRENT,
  warehouseProcesses: WHERE_IS_CURRENT,
  qcVehicleChecks: {
    ...WHERE_IS_CURRENT,
    include: { checkedBy: { select: { id: true, name: true } } },
  },
  incomingMaterialChecks: {
    ...WHERE_IS_CURRENT,
    include: { checkedBy: { select: { id: true, name: true } } },
  },
  statusHistory: { orderBy: { changedAt: 'desc' as const } },
  weighInBy: { select: { id: true, name: true } },
  weighOutBy: { select: { id: true, name: true } },
  warehouseStartBy: { select: { id: true, name: true } },
  warehouseEndBy: { select: { id: true, name: true } },
};

export const GATE_DETAIL_CURRENT_RELATIONS_INCLUDE = {
  statusHistory: { orderBy: { changedAt: 'asc' as const } },
  weighbridgeRecords: WHERE_IS_CURRENT,
  warehouseProcesses: WHERE_IS_CURRENT,
  qcVehicleChecks: WHERE_IS_CURRENT,
  incomingMaterialChecks: WHERE_IS_CURRENT,
};

export const QC_HISTORY_CURRENT_RELATIONS_INCLUDE = {
  qcVehicleChecks: WHERE_IS_CURRENT,
  incomingMaterialChecks: WHERE_IS_CURRENT,
};
