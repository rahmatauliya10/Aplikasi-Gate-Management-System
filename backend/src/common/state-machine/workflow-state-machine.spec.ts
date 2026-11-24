import { BadRequestException } from '@nestjs/common';
import { TransactionStatus } from '@prisma/client';
import {
  VALID_STATUS_TRANSITIONS,
  isValidStatusTransition,
  assertValidStatusTransition,
} from './workflow-state-machine';

describe('WorkflowStateMachine Specification & Transition Matrix', () => {
  describe('isValidStatusTransition', () => {
    it('should return true for identical from and to status (self-transition)', () => {
      expect(
        isValidStatusTransition(
          TransactionStatus.REGISTERED,
          TransactionStatus.REGISTERED,
        ),
      ).toBe(true);
      expect(
        isValidStatusTransition(
          TransactionStatus.COMPLETED,
          TransactionStatus.COMPLETED,
        ),
      ).toBe(true);
    });

    it('should allow valid GBB forward transitions', () => {
      expect(
        isValidStatusTransition(
          TransactionStatus.REGISTERED,
          TransactionStatus.WEIGH_IN_DONE,
        ),
      ).toBe(true);
      expect(
        isValidStatusTransition(
          TransactionStatus.WEIGH_IN_DONE,
          TransactionStatus.QC_VEHICLE_PENDING,
        ),
      ).toBe(true);
      expect(
        isValidStatusTransition(
          TransactionStatus.QC_VEHICLE_PENDING,
          TransactionStatus.QC_VEHICLE_PASSED,
        ),
      ).toBe(true);
      expect(
        isValidStatusTransition(
          TransactionStatus.QC_VEHICLE_PASSED,
          TransactionStatus.WAREHOUSE_IN_PROGRESS,
        ),
      ).toBe(true);
      expect(
        isValidStatusTransition(
          TransactionStatus.WAREHOUSE_IN_PROGRESS,
          TransactionStatus.WAREHOUSE_DONE,
        ),
      ).toBe(true);
      expect(
        isValidStatusTransition(
          TransactionStatus.WAREHOUSE_DONE,
          TransactionStatus.WEIGH_OUT_DONE,
        ),
      ).toBe(true);
      expect(
        isValidStatusTransition(
          TransactionStatus.WEIGH_OUT_DONE,
          TransactionStatus.COMPLETED,
        ),
      ).toBe(true);
    });

    it('should allow QC vehicle rejection flow to WEIGH_OUT_DONE or CANCELLED', () => {
      expect(
        isValidStatusTransition(
          TransactionStatus.QC_VEHICLE_PENDING,
          TransactionStatus.QC_VEHICLE_REJECTED,
        ),
      ).toBe(true);
      expect(
        isValidStatusTransition(
          TransactionStatus.QC_VEHICLE_REJECTED,
          TransactionStatus.WEIGH_OUT_DONE,
        ),
      ).toBe(true);
      expect(
        isValidStatusTransition(
          TransactionStatus.QC_VEHICLE_REJECTED,
          TransactionStatus.CANCELLED,
        ),
      ).toBe(true);
    });

    it('should allow cancellation from all non-final statuses', () => {
      const nonFinalStatuses = Object.keys(VALID_STATUS_TRANSITIONS).filter(
        (s) => s !== 'COMPLETED' && s !== 'CANCELLED',
      ) as TransactionStatus[];

      for (const status of nonFinalStatuses) {
        expect(
          isValidStatusTransition(status, TransactionStatus.CANCELLED),
        ).toBe(true);
      }
    });

    it('should disallow any transition out of COMPLETED or CANCELLED', () => {
      const allStatuses = Object.values(TransactionStatus);
      for (const target of allStatuses) {
        if (target !== TransactionStatus.COMPLETED) {
          expect(
            isValidStatusTransition(TransactionStatus.COMPLETED, target),
          ).toBe(false);
        }
        if (target !== TransactionStatus.CANCELLED) {
          expect(
            isValidStatusTransition(TransactionStatus.CANCELLED, target),
          ).toBe(false);
        }
      }
    });

    it('should reject invalid backward jumps without reopen', () => {
      expect(
        isValidStatusTransition(
          TransactionStatus.WAREHOUSE_DONE,
          TransactionStatus.REGISTERED,
        ),
      ).toBe(false);
      expect(
        isValidStatusTransition(
          TransactionStatus.WEIGH_OUT_DONE,
          TransactionStatus.QC_VEHICLE_PENDING,
        ),
      ).toBe(false);
    });

    it('should allow Solar bypass via PA_NOT_REQUIRED', () => {
      // REGISTERED → PA_NOT_REQUIRED (assigned at weigh-in for exempt products)
      expect(
        isValidStatusTransition(
          TransactionStatus.REGISTERED,
          TransactionStatus.PA_NOT_REQUIRED,
        ),
      ).toBe(true);
      // WEIGH_IN_DONE → PA_NOT_REQUIRED
      expect(
        isValidStatusTransition(
          TransactionStatus.WEIGH_IN_DONE,
          TransactionStatus.PA_NOT_REQUIRED,
        ),
      ).toBe(true);
      // PA_NOT_REQUIRED → WAREHOUSE_IN_PROGRESS (direct start)
      expect(
        isValidStatusTransition(
          TransactionStatus.PA_NOT_REQUIRED,
          TransactionStatus.WAREHOUSE_IN_PROGRESS,
        ),
      ).toBe(true);
      // PA_NOT_REQUIRED → CANCELLED
      expect(
        isValidStatusTransition(
          TransactionStatus.PA_NOT_REQUIRED,
          TransactionStatus.CANCELLED,
        ),
      ).toBe(true);
    });

    it('should block PA_NOT_REQUIRED from going to QC_VEHICLE_PASSED', () => {
      expect(
        isValidStatusTransition(
          TransactionStatus.PA_NOT_REQUIRED,
          TransactionStatus.QC_VEHICLE_PASSED,
        ),
      ).toBe(false);
    });

    it('should allow Coal multi-round retest and Utility disposition flow', () => {
      // QC_VEHICLE_PENDING → QC_RETEST_REQUIRED
      expect(
        isValidStatusTransition(
          TransactionStatus.QC_VEHICLE_PENDING,
          TransactionStatus.QC_RETEST_REQUIRED,
        ),
      ).toBe(true);
      // QC_VEHICLE_IN_PROGRESS → QC_RETEST_REQUIRED
      expect(
        isValidStatusTransition(
          TransactionStatus.QC_VEHICLE_IN_PROGRESS,
          TransactionStatus.QC_RETEST_REQUIRED,
        ),
      ).toBe(true);
      // QC_RETEST_REQUIRED → WAITING_UTILITY_DISPOSITION
      expect(
        isValidStatusTransition(
          TransactionStatus.QC_RETEST_REQUIRED,
          TransactionStatus.WAITING_UTILITY_DISPOSITION,
        ),
      ).toBe(true);
      // QC_RETEST_REQUIRED → QC_VEHICLE_PASSED (retest passed)
      expect(
        isValidStatusTransition(
          TransactionStatus.QC_RETEST_REQUIRED,
          TransactionStatus.QC_VEHICLE_PASSED,
        ),
      ).toBe(true);
      // WAITING_UTILITY_DISPOSITION → QC_VEHICLE_PASSED
      expect(
        isValidStatusTransition(
          TransactionStatus.WAITING_UTILITY_DISPOSITION,
          TransactionStatus.QC_VEHICLE_PASSED,
        ),
      ).toBe(true);
      // WAITING_UTILITY_DISPOSITION → QC_VEHICLE_REJECTED
      expect(
        isValidStatusTransition(
          TransactionStatus.WAITING_UTILITY_DISPOSITION,
          TransactionStatus.QC_VEHICLE_REJECTED,
        ),
      ).toBe(true);
    });

    it('should block illegal transitions for retest/disposition statuses', () => {
      // QC_RETEST_REQUIRED cannot skip to WAREHOUSE_IN_PROGRESS
      expect(
        isValidStatusTransition(
          TransactionStatus.QC_RETEST_REQUIRED,
          TransactionStatus.WAREHOUSE_IN_PROGRESS,
        ),
      ).toBe(false);
      // WAITING_UTILITY_DISPOSITION cannot skip to WAREHOUSE_IN_PROGRESS
      expect(
        isValidStatusTransition(
          TransactionStatus.WAITING_UTILITY_DISPOSITION,
          TransactionStatus.WAREHOUSE_IN_PROGRESS,
        ),
      ).toBe(false);
    });
  });

  describe('assertValidStatusTransition', () => {
    it('should not throw for valid transitions', () => {
      expect(() =>
        assertValidStatusTransition(
          TransactionStatus.REGISTERED,
          TransactionStatus.WEIGH_IN_DONE,
        ),
      ).not.toThrow();
      expect(() =>
        assertValidStatusTransition(
          TransactionStatus.WEIGH_OUT_DONE,
          TransactionStatus.COMPLETED,
        ),
      ).not.toThrow();
    });

    it('should throw BadRequestException for transitions starting from COMPLETED or CANCELLED', () => {
      expect(() =>
        assertValidStatusTransition(
          TransactionStatus.COMPLETED,
          TransactionStatus.REGISTERED,
        ),
      ).toThrow(BadRequestException);

      expect(() =>
        assertValidStatusTransition(
          TransactionStatus.CANCELLED,
          TransactionStatus.REGISTERED,
        ),
      ).toThrow(BadRequestException);
    });

    it('should throw BadRequestException with clear error message for disallowed transitions', () => {
      expect(() =>
        assertValidStatusTransition(
          TransactionStatus.REGISTERED,
          TransactionStatus.COMPLETED,
        ),
      ).toThrow(BadRequestException);
    });
  });
});
