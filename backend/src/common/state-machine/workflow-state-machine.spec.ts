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
