import { ProcessType, TransactionStatus } from '@prisma/client';
import {
  getReopenTargets,
  isAllowedReopenTarget,
  normalizeReopenTarget,
  REOPEN_TARGETS_BY_PROCESS,
} from './reopen-policy';

describe('canonical REOPEN workflow policy', () => {
  it('defines the expected process matrices without cross-process stages', () => {
    expect(REOPEN_TARGETS_BY_PROCESS).toEqual({
      GBB: [
        TransactionStatus.REGISTERED,
        TransactionStatus.QC_VEHICLE_PENDING,
        TransactionStatus.QC_VEHICLE_PASSED,
        TransactionStatus.INCOMING_CHECK_PENDING,
      ],
      GSP: [
        TransactionStatus.REGISTERED,
        TransactionStatus.QC_VEHICLE_PENDING,
        TransactionStatus.QC_VEHICLE_PASSED,
        TransactionStatus.PA_NOT_REQUIRED,
      ],
      GBJ: [
        TransactionStatus.REGISTERED,
        TransactionStatus.QC_VEHICLE_PENDING,
        TransactionStatus.QC_VEHICLE_PASSED,
      ],
    });
  });

  it('returns a copy so callers cannot mutate the canonical matrix', () => {
    const targets = getReopenTargets(ProcessType.GSP);
    targets.push(TransactionStatus.CANCELLED);

    expect(REOPEN_TARGETS_BY_PROCESS.GSP).not.toContain(
      TransactionStatus.CANCELLED,
    );
  });

  it('normalizes legacy warehouse target and validates it through the matrix', () => {
    expect(normalizeReopenTarget(TransactionStatus.WAREHOUSE_IN_PROGRESS)).toBe(
      TransactionStatus.QC_VEHICLE_PASSED,
    );
    expect(
      isAllowedReopenTarget(
        ProcessType.GSP,
        TransactionStatus.WAREHOUSE_IN_PROGRESS,
      ),
    ).toBe(true);
  });

  it('rejects targets that belong only to another process', () => {
    expect(
      isAllowedReopenTarget(
        ProcessType.GSP,
        TransactionStatus.INCOMING_CHECK_PENDING,
      ),
    ).toBe(false);
    expect(
      isAllowedReopenTarget(ProcessType.GBJ, TransactionStatus.PA_NOT_REQUIRED),
    ).toBe(false);
  });
});
