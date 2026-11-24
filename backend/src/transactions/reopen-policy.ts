import { ProcessType, TransactionStatus } from '@prisma/client';

export const REOPEN_TARGETS_BY_PROCESS: Readonly<
  Record<ProcessType, readonly TransactionStatus[]>
> = {
  [ProcessType.GBB]: [
    TransactionStatus.REGISTERED,
    TransactionStatus.QC_VEHICLE_PENDING,
    TransactionStatus.QC_VEHICLE_PASSED,
    TransactionStatus.INCOMING_CHECK_PENDING,
  ],
  [ProcessType.GSP]: [
    TransactionStatus.REGISTERED,
    TransactionStatus.QC_VEHICLE_PENDING,
    TransactionStatus.QC_VEHICLE_PASSED,
    TransactionStatus.PA_NOT_REQUIRED,
  ],
  [ProcessType.GBJ]: [
    TransactionStatus.REGISTERED,
    TransactionStatus.QC_VEHICLE_PENDING,
    TransactionStatus.QC_VEHICLE_PASSED,
  ],
};

export function getReopenTargets(
  processType: ProcessType,
): TransactionStatus[] {
  return [...(REOPEN_TARGETS_BY_PROCESS[processType] || [])];
}

export function normalizeReopenTarget(
  target: TransactionStatus,
): TransactionStatus {
  return target === TransactionStatus.WAREHOUSE_IN_PROGRESS
    ? TransactionStatus.QC_VEHICLE_PASSED
    : target;
}

export function isAllowedReopenTarget(
  processType: ProcessType,
  target: TransactionStatus,
): boolean {
  const normalized = normalizeReopenTarget(target);
  return (
    target === TransactionStatus.WAREHOUSE_IN_PROGRESS ||
    REOPEN_TARGETS_BY_PROCESS[processType]?.includes(normalized) === true
  );
}
