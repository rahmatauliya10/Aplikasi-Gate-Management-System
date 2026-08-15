import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { GateService } from '../gate/gate.service';
import { WeighbridgeService } from '../weighbridge/weighbridge.service';
import { QcService } from '../qc/qc.service';
import { WarehouseService } from '../warehouse/warehouse.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ConfigService } from '@nestjs/config';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';
import {
  assertValidStatusTransition,
  isValidStatusTransition,
} from '../common/state-machine/workflow-state-machine';

describe('PR-02: Atomic Workflow State Machine & Concurrency Controls', () => {
  let gateService: GateService;

  const mockPrismaService = {
    transaction: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    weighbridgeRecord: {
      findFirst: jest.fn(),
      create: jest.fn(),
      aggregate: jest.fn(),
    },
    qcVehicleCheck: {
      findFirst: jest.fn(),
      create: jest.fn(),
      aggregate: jest.fn(),
    },
    incomingMaterialCheck: {
      findFirst: jest.fn(),
      create: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
    },
    warehouseProcess: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    transactionStatusHistory: {
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    userWarehouseAccess: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { processType: 'GBB' },
          { processType: 'GBJ' },
          { processType: 'GSP' },
        ]),
    },
    $transaction: jest.fn((cb) => cb(mockPrismaService)),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };

  const mockActivityLogsService = {
    logAction: jest.fn().mockResolvedValue(true),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GateService,
        WeighbridgeService,
        QcService,
        WarehouseService,
        AuthorizationScopeService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ActivityLogsService, useValue: mockActivityLogsService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    gateService = module.get<GateService>(GateService);
  });

  describe('Centralized State Transition Machine Unit Tests', () => {
    it('should allow valid workflow status transitions', () => {
      expect(isValidStatusTransition('REGISTERED', 'WEIGH_IN_DONE')).toBe(true);
      expect(isValidStatusTransition('REGISTERED', 'QC_VEHICLE_PENDING')).toBe(
        true,
      );
      expect(
        isValidStatusTransition('WEIGH_IN_DONE', 'QC_VEHICLE_PENDING'),
      ).toBe(true);
      expect(
        isValidStatusTransition('QC_VEHICLE_PENDING', 'QC_VEHICLE_IN_PROGRESS'),
      ).toBe(true);
      expect(
        isValidStatusTransition('QC_VEHICLE_IN_PROGRESS', 'QC_VEHICLE_PASSED'),
      ).toBe(true);
      expect(
        isValidStatusTransition('QC_VEHICLE_PASSED', 'WAREHOUSE_IN_PROGRESS'),
      ).toBe(true);
      expect(
        isValidStatusTransition(
          'WAREHOUSE_IN_PROGRESS',
          'INCOMING_CHECK_PENDING',
        ),
      ).toBe(true);
      expect(
        isValidStatusTransition('INCOMING_CHECK_PASSED', 'WEIGH_OUT_DONE'),
      ).toBe(true);
      expect(isValidStatusTransition('WEIGH_OUT_DONE', 'COMPLETED')).toBe(true);
    });

    it('should reject invalid status transitions (e.g. REGISTERED directly to COMPLETED)', () => {
      expect(() =>
        assertValidStatusTransition('REGISTERED', 'COMPLETED'),
      ).toThrow(BadRequestException);
    });

    it('should reject transitions out of terminal states (CANCELLED, COMPLETED)', () => {
      expect(() =>
        assertValidStatusTransition('CANCELLED', 'REGISTERED'),
      ).toThrow(BadRequestException);
      expect(() =>
        assertValidStatusTransition('COMPLETED', 'WEIGH_OUT_DONE'),
      ).toThrow(BadRequestException);
    });
  });

  describe('Compare-And-Swap (CAS) Concurrency & Atomicity Tests', () => {
    it('should return 409 Conflict when concurrent gate check-out attempts race', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        transactionNumber: 'GMS-20260811-0001',
        plateNumber: 'B 1234 ABC',
        status: 'WEIGH_OUT_DONE',
        revision: 5,
      });

      // CAS updateMany returns count: 0 simulating that another worker modified revision/status concurrently
      mockPrismaService.transaction.updateMany.mockResolvedValue({ count: 0 });

      const user: any = {
        id: 'admin-1',
        email: 'admin@gms.local',
        role: 'ADMIN',
      };

      await expect(gateService.checkOut('tx-1', user)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should return 409 Conflict when concurrent cancel attempt races with state change', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        transactionNumber: 'GMS-20260811-0001',
        plateNumber: 'B 1234 ABC',
        status: 'WEIGH_IN_DONE',
        revision: 2,
      });

      mockPrismaService.transaction.updateMany.mockResolvedValue({ count: 0 });

      const user: any = {
        id: 'admin-1',
        email: 'admin@gms.local',
        role: 'ADMIN',
      };

      await expect(
        gateService.cancel('tx-1', 'Cancelled by operator', user),
      ).rejects.toThrow(ConflictException);
    });

    it('should prevent CANCELLED transaction from being checked out or completed', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-cancelled',
        transactionNumber: 'GMS-20260811-0002',
        plateNumber: 'B 9999 XYZ',
        status: 'CANCELLED',
        revision: 3,
      });

      const user: any = {
        id: 'admin-1',
        email: 'admin@gms.local',
        role: 'ADMIN',
      };

      await expect(gateService.checkOut('tx-cancelled', user)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should execute root update, status history, and audit log in a single atomic database transaction', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        transactionNumber: 'GMS-20260811-0001',
        plateNumber: 'B 1234 ABC',
        status: 'WEIGH_OUT_DONE',
        revision: 5,
      });

      mockPrismaService.transaction.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.transaction.update.mockResolvedValue({
        id: 'tx-1',
        transactionNumber: 'GMS-20260811-0001',
        status: 'COMPLETED',
        revision: 6,
      });

      const user: any = {
        id: 'admin-1',
        email: 'admin@gms.local',
        role: 'ADMIN',
      };

      const result = await gateService.checkOut('tx-1', user);
      expect(result.success).toBe(true);
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });

    it('should throw ConflictException (409) when updating with stale revision', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-stale',
        transactionNumber: 'GMS-20260811-0003',
        plateNumber: 'B 5555 STALE',
        status: 'WEIGH_OUT_DONE',
        revision: 1, // Stale revision
      });

      // CAS updateMany returns count: 0 simulating revision mismatch in DB
      mockPrismaService.transaction.updateMany.mockResolvedValue({ count: 0 });

      const user: any = {
        id: 'admin-1',
        email: 'admin@gms.local',
        role: 'ADMIN',
      };

      await expect(gateService.checkOut('tx-stale', user)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException when status mismatch occurs', () => {
      expect(() =>
        assertValidStatusTransition('WEIGH_IN_DONE', 'COMPLETED'),
      ).toThrow(BadRequestException);
    });
  });
});
