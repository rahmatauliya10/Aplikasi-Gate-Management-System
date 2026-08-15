import { BadRequestException } from '@nestjs/common';
import { TransactionStatus } from '@prisma/client';

export const VALID_STATUS_TRANSITIONS: Record<
  TransactionStatus,
  TransactionStatus[]
> = {
  REGISTERED: [
    TransactionStatus.WEIGH_IN_DONE,
    TransactionStatus.QC_VEHICLE_PENDING,
    TransactionStatus.CANCELLED,
  ],
  WEIGH_IN_DONE: [
    TransactionStatus.QC_VEHICLE_PENDING,
    TransactionStatus.CANCELLED,
  ],
  QC_VEHICLE_PENDING: [
    TransactionStatus.QC_VEHICLE_IN_PROGRESS,
    TransactionStatus.QC_VEHICLE_PASSED,
    TransactionStatus.QC_VEHICLE_REJECTED,
    TransactionStatus.CANCELLED,
  ],
  QC_VEHICLE_IN_PROGRESS: [
    TransactionStatus.QC_VEHICLE_PASSED,
    TransactionStatus.QC_VEHICLE_REJECTED,
    TransactionStatus.CANCELLED,
  ],
  QC_VEHICLE_PASSED: [
    TransactionStatus.WAREHOUSE_IN_PROGRESS,
    TransactionStatus.CANCELLED,
  ],
  QC_VEHICLE_REJECTED: [
    TransactionStatus.WEIGH_OUT_DONE,
    TransactionStatus.CANCELLED,
  ],
  WAREHOUSE_IN_PROGRESS: [
    TransactionStatus.INCOMING_CHECK_PENDING,
    TransactionStatus.WAREHOUSE_DONE,
    TransactionStatus.CANCELLED,
  ],
  WAREHOUSE_DONE: [
    TransactionStatus.WEIGH_OUT_DONE,
    TransactionStatus.CANCELLED,
  ],
  INCOMING_CHECK_PENDING: [
    TransactionStatus.INCOMING_CHECK_IN_PROGRESS,
    TransactionStatus.INCOMING_CHECK_PASSED,
    TransactionStatus.INCOMING_CHECK_REJECTED,
    TransactionStatus.CANCELLED,
  ],
  INCOMING_CHECK_IN_PROGRESS: [
    TransactionStatus.INCOMING_CHECK_PASSED,
    TransactionStatus.INCOMING_CHECK_REJECTED,
    TransactionStatus.CANCELLED,
  ],
  INCOMING_CHECK_PASSED: [
    TransactionStatus.WEIGH_OUT_DONE,
    TransactionStatus.CANCELLED,
  ],
  INCOMING_CHECK_REJECTED: [
    TransactionStatus.WEIGH_OUT_DONE,
    TransactionStatus.CANCELLED,
  ],
  WEIGH_OUT_DONE: [TransactionStatus.COMPLETED, TransactionStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};

export function isValidStatusTransition(
  fromStatus: TransactionStatus,
  toStatus: TransactionStatus,
): boolean {
  if (fromStatus === toStatus) return true;
  const allowed = VALID_STATUS_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
}

export function assertValidStatusTransition(
  fromStatus: TransactionStatus,
  toStatus: TransactionStatus,
): void {
  if (fromStatus === 'CANCELLED' || fromStatus === 'COMPLETED') {
    throw new BadRequestException({
      success: false,
      message: `Transaksi dengan status ${fromStatus} sudah final dan tidak dapat diubah lagi tanpa alur koreksi resmi.`,
      errors: [],
    });
  }
  if (!isValidStatusTransition(fromStatus, toStatus)) {
    throw new BadRequestException({
      success: false,
      message: `Transisi status tidak valid dari ${fromStatus} ke ${toStatus}.`,
      errors: [],
    });
  }
}
