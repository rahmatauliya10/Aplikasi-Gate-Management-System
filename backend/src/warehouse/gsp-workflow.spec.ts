import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import { WeighbridgeService } from '../weighbridge/weighbridge.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';
import {
  TransactionStatus,
  ProcessType,
  WarehouseCondition,
  WarehouseUnit,
} from '@prisma/client';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';

describe('GSP 4-Group Workflow Integration Tests (Task 3)', () => {
  let warehouseService: WarehouseService;
  let weighbridgeService: WeighbridgeService;

  let mockPrismaService: any;
  let mockActivityLogsService: any;
  let mockAuthScopeService: any;

  const mockUser: JwtPayloadUser = {
    id: 'user-wh-1',
    role: 'ADMIN',
    email: 'admin@gms.local',
  } as unknown as JwtPayloadUser;

  beforeEach(async () => {
    mockPrismaService = {
      $transaction: jest.fn(),
      transaction: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      warehouseProcess: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn(),
      },
      incomingMaterialCheck: {
        create: jest.fn(),
        aggregate: jest.fn(),
      },
      userWarehouseAccess: {
        findMany: jest.fn(),
      },
      weighbridgeRecord: {
        findFirst: jest.fn(),
        create: jest.fn(),
        aggregate: jest.fn(),
      },
      transactionStatusHistory: {
        create: jest.fn(),
      },
    };

    mockActivityLogsService = {
      logAction: jest.fn().mockResolvedValue({}),
    };

    mockAuthScopeService = {
      getTransactionScope: jest.fn().mockReturnValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WarehouseService,
        WeighbridgeService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ActivityLogsService, useValue: mockActivityLogsService },
        { provide: AuthorizationScopeService, useValue: mockAuthScopeService },
      ],
    }).compile();

    warehouseService = module.get<WarehouseService>(WarehouseService);
    weighbridgeService = module.get<WeighbridgeService>(WeighbridgeService);
  });

  describe('Weighbridge In - GSP 4-Group Status Assignment', () => {
    it('assigns PA_NOT_REQUIRED to GSP Solar with verified active catalog and logs PA_EXEMPTION_APPLIED', async () => {
      const solarTx = {
        id: 'tx-solar-1',
        status: TransactionStatus.REGISTERED,
        processType: ProcessType.GSP,
        cargoType: 'Fuel',
        cargoSubType: 'Solar',
        revision: 1,
        productCatalog: {
          id: 'cat-solar-1',
          code: 'SOLAR-001',
          name: 'Solar',
          category: 'Fuel',
          subCategory: 'Solar',
          processType: 'GSP',
          isPaRequired: false,
          policyVersion: 'SOP-GSP-2026.1',
          isActive: true,
        },
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(solarTx);
      mockPrismaService.weighbridgeRecord.findFirst.mockResolvedValueOnce(null);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            ...solarTx,
            status: TransactionStatus.PA_NOT_REQUIRED,
            grossWeight: 25000,
            weighInBy: { id: mockUser.id, name: 'Admin', role: 'ADMIN' },
          }),
        },
        weighbridgeRecord: {
          findFirst: jest.fn().mockResolvedValue(null),
          aggregate: jest.fn().mockResolvedValue({ _max: { revision: 0 } }),
          create: jest.fn().mockResolvedValue({ id: 'wb-rec-1' }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await weighbridgeService.submitWeighIn(
        'tx-solar-1',
        { weight: 25000 },
        mockUser,
      );

      expect(res.success).toBe(true);
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.PA_NOT_REQUIRED,
            grossWeight: 25000,
            paPolicyVersion: 'SOP-GSP-2026.1',
          }),
        }),
      );
      expect(mockActivityLogsService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PA_EXEMPTION_APPLIED',
          referenceId: 'tx-solar-1',
        }),
      );
    });

    it('assigns QC_VEHICLE_PENDING to Solar if productCatalog is missing (NO free-text fallback)', async () => {
      const unlinkedSolarTx = {
        id: 'tx-solar-nocat',
        status: TransactionStatus.REGISTERED,
        processType: ProcessType.GSP,
        cargoType: 'Fuel',
        cargoSubType: 'Solar',
        productCatalogId: null,
        productCatalog: null, // No master catalog link!
        revision: 1,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        unlinkedSolarTx,
      );
      mockPrismaService.weighbridgeRecord.findFirst.mockResolvedValueOnce(null);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            ...unlinkedSolarTx,
            status: TransactionStatus.QC_VEHICLE_PENDING,
            grossWeight: 25000,
            weighInBy: { id: mockUser.id, name: 'Admin', role: 'ADMIN' },
          }),
        },
        weighbridgeRecord: {
          findFirst: jest.fn().mockResolvedValue(null),
          aggregate: jest.fn().mockResolvedValue({ _max: { revision: 0 } }),
          create: jest.fn().mockResolvedValue({ id: 'wb-rec-1' }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await weighbridgeService.submitWeighIn(
        'tx-solar-nocat',
        { weight: 25000 },
        mockUser,
      );

      expect(res.success).toBe(true);
      // MUST NOT assign PA_NOT_REQUIRED without catalog!
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_PENDING,
          }),
        }),
      );
    });

    it('assigns QC_VEHICLE_PENDING to GSP Batubara (non-exempt)', async () => {
      const coalTx = {
        id: 'tx-coal-1',
        status: TransactionStatus.REGISTERED,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        revision: 1,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);
      mockPrismaService.weighbridgeRecord.findFirst.mockResolvedValueOnce(null);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            ...coalTx,
            status: TransactionStatus.QC_VEHICLE_PENDING,
            grossWeight: 30000,
            weighInBy: { id: mockUser.id, name: 'Admin', role: 'ADMIN' },
          }),
        },
        weighbridgeRecord: {
          findFirst: jest.fn().mockResolvedValue(null),
          aggregate: jest.fn().mockResolvedValue({ _max: { revision: 0 } }),
          create: jest.fn().mockResolvedValue({ id: 'wb-rec-2' }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await weighbridgeService.submitWeighIn(
        'tx-coal-1',
        { weight: 30000 },
        mockUser,
      );

      expect(res.success).toBe(true);
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_PENDING,
            grossWeight: 30000,
          }),
        }),
      );
    });

    it('assigns QC_VEHICLE_PENDING to GSP PAC (non-exempt)', async () => {
      const pacTx = {
        id: 'tx-pac-1',
        status: TransactionStatus.REGISTERED,
        processType: ProcessType.GSP,
        cargoType: 'Chemicals',
        cargoSubType: 'PAC 280 AC',
        revision: 1,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(pacTx);
      mockPrismaService.weighbridgeRecord.findFirst.mockResolvedValueOnce(null);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            ...pacTx,
            status: TransactionStatus.QC_VEHICLE_PENDING,
            grossWeight: 22000,
            weighInBy: { id: mockUser.id, name: 'Admin', role: 'ADMIN' },
          }),
        },
        weighbridgeRecord: {
          findFirst: jest.fn().mockResolvedValue(null),
          aggregate: jest.fn().mockResolvedValue({ _max: { revision: 0 } }),
          create: jest.fn().mockResolvedValue({ id: 'wb-rec-3' }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await weighbridgeService.submitWeighIn(
        'tx-pac-1',
        { weight: 22000 },
        mockUser,
      );

      expect(res.success).toBe(true);
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_PENDING,
            grossWeight: 22000,
          }),
        }),
      );
    });
  });

  describe('Warehouse Start - GSP 4-Group Guards', () => {
    it('permits GSP Solar to start warehouse when status is PA_NOT_REQUIRED and catalog is verified', async () => {
      const solarTx = {
        id: 'tx-solar-1',
        status: TransactionStatus.PA_NOT_REQUIRED,
        processType: ProcessType.GSP,
        cargoType: 'Fuel',
        cargoSubType: 'Solar',
        revision: 2,
        productCatalog: {
          id: 'cat-solar-1',
          code: 'SOLAR-001',
          name: 'Solar',
          category: 'Fuel',
          subCategory: 'Solar',
          processType: 'GSP',
          isPaRequired: false,
          policyVersion: 'SOP-GSP-2026.1',
          isActive: true,
        },
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(solarTx);
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: ProcessType.GSP },
      ]);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            ...solarTx,
            status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
            warehouseStartBy: { id: mockUser.id, name: 'Admin', role: 'ADMIN' },
          }),
        },
        warehouseProcess: {
          aggregate: jest.fn().mockResolvedValue({ _max: { revision: 0 } }),
          create: jest.fn().mockResolvedValue({ id: 'wp-1' }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await warehouseService.startWarehouse(
        'tx-solar-1',
        {},
        mockUser,
      );

      expect(res.success).toBe(true);
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'tx-solar-1',
            status: { in: ['QC_VEHICLE_PASSED', 'PA_NOT_REQUIRED'] },
          }),
          data: expect.objectContaining({
            status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
          }),
        }),
      );
    });

    it('permits GSP Batubara to start warehouse when status is QC_VEHICLE_PASSED', async () => {
      const coalTx = {
        id: 'tx-coal-1',
        status: TransactionStatus.QC_VEHICLE_PASSED,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        revision: 3,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: ProcessType.GSP },
      ]);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            ...coalTx,
            status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
            warehouseStartBy: { id: mockUser.id, name: 'Admin', role: 'ADMIN' },
          }),
        },
        warehouseProcess: {
          aggregate: jest.fn().mockResolvedValue({ _max: { revision: 0 } }),
          create: jest.fn().mockResolvedValue({ id: 'wp-2' }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await warehouseService.startWarehouse(
        'tx-coal-1',
        {},
        mockUser,
      );

      expect(res.success).toBe(true);
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
          }),
        }),
      );
    });

    it('strictly blocks startWarehouse when GSP Batubara is still QC_VEHICLE_PENDING', async () => {
      const coalTx = {
        id: 'tx-coal-1',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        revision: 2,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: ProcessType.GSP },
      ]);

      await expect(
        warehouseService.startWarehouse('tx-coal-1', {}, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('strictly blocks startWarehouse when status is QC_RETEST_REQUIRED or WAITING_UTILITY_DISPOSITION', async () => {
      const retestTx = {
        id: 'tx-coal-retest',
        status: TransactionStatus.QC_RETEST_REQUIRED,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        revision: 2,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(retestTx);
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: ProcessType.GSP },
      ]);

      await expect(
        warehouseService.startWarehouse('tx-coal-retest', {}, mockUser),
      ).rejects.toThrow(BadRequestException);

      const waitingTx = {
        id: 'tx-coal-waiting',
        status: TransactionStatus.WAITING_UTILITY_DISPOSITION,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        revision: 3,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(waitingTx);
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: ProcessType.GSP },
      ]);

      await expect(
        warehouseService.startWarehouse('tx-coal-waiting', {}, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('strictly blocks startWarehouse from REGISTERED status (must weigh-in first for all 4 groups)', async () => {
      const regTx = {
        id: 'tx-registered',
        status: TransactionStatus.REGISTERED,
        processType: ProcessType.GSP,
        cargoType: 'Fuel',
        cargoSubType: 'Solar',
        revision: 1,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(regTx);
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: ProcessType.GSP },
      ]);

      await expect(
        warehouseService.startWarehouse('tx-registered', {}, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('strictly blocks startWarehouse for Solar PA_NOT_REQUIRED if productCatalog is missing', async () => {
      const unlinkedTx = {
        id: 'tx-solar-unlinked',
        status: TransactionStatus.PA_NOT_REQUIRED,
        processType: ProcessType.GSP,
        cargoType: 'Fuel',
        cargoSubType: 'Solar',
        productCatalogId: null,
        productCatalog: null,
        revision: 2,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        unlinkedTx,
      );
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: ProcessType.GSP },
      ]);

      await expect(
        warehouseService.startWarehouse('tx-solar-unlinked', {}, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('strictly blocks startWarehouse for Solar PA_NOT_REQUIRED if productCatalog is deactivated', async () => {
      const inactiveCatTx = {
        id: 'tx-solar-inactive',
        status: TransactionStatus.PA_NOT_REQUIRED,
        processType: ProcessType.GSP,
        cargoType: 'Fuel',
        cargoSubType: 'Solar',
        revision: 2,
        productCatalog: {
          id: 'cat-solar-inactive',
          code: 'SOLAR-001',
          name: 'Solar',
          category: 'Fuel',
          subCategory: 'Solar',
          processType: 'GSP',
          isPaRequired: false,
          policyVersion: 'SOP-GSP-2026.1',
          isActive: false, // Inactive!
        },
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        inactiveCatTx,
      );
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: ProcessType.GSP },
      ]);

      await expect(
        warehouseService.startWarehouse('tx-solar-inactive', {}, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('strictly blocks startWarehouse for Solar PA_NOT_REQUIRED if cargoSubType mismatches catalog', async () => {
      const mismatchedTx = {
        id: 'tx-solar-mismatch',
        status: TransactionStatus.PA_NOT_REQUIRED,
        processType: ProcessType.GSP,
        cargoType: 'Fuel',
        cargoSubType: 'Batubara', // Mismatched text!
        revision: 2,
        productCatalog: {
          id: 'cat-solar-1',
          code: 'SOLAR-001',
          name: 'Solar',
          category: 'Fuel',
          subCategory: 'Solar',
          processType: 'GSP',
          isPaRequired: false,
          policyVersion: 'SOP-GSP-2026.1',
          isActive: true,
        },
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        mismatchedTx,
      );
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: ProcessType.GSP },
      ]);

      await expect(
        warehouseService.startWarehouse('tx-solar-mismatch', {}, mockUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Warehouse Complete - Routing Logic', () => {
    it('routes GSP completion directly to WAREHOUSE_DONE without incoming check', async () => {
      const gspTx = {
        id: 'tx-gsp-wh',
        transactionNumber: 'TRX-GSP-001',
        status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
        processType: ProcessType.GSP,
        cargoType: 'Fuel',
        cargoSubType: 'Solar',
        warehouseStartAt: new Date(),
        warehouseStartById: mockUser.id,
        warehouseEndAt: null,
        revision: 2,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(gspTx);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            ...gspTx,
            status: TransactionStatus.WAREHOUSE_DONE,
            warehouseEndBy: { id: mockUser.id, name: 'Admin', role: 'ADMIN' },
          }),
        },
        warehouseProcess: {
          findFirst: jest.fn().mockResolvedValue({ id: 'wp-gsp', revision: 1 }),
          update: jest.fn().mockResolvedValue({ id: 'wp-gsp', revision: 2 }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await warehouseService.completeWarehouse(
        'tx-gsp-wh',
        {
          actualWeight: 25000,
          actualQuantity: 1,
          unit: WarehouseUnit.TRIP,
          condition: WarehouseCondition.GOOD,
        },
        mockUser,
      );

      expect(res.success).toBe(true);
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.WAREHOUSE_DONE,
          }),
        }),
      );
    });

    it('routes GBB completion to INCOMING_CHECK_PENDING (preserving GBB flow)', async () => {
      const gbbTx = {
        id: 'tx-gbb-wh',
        transactionNumber: 'TRX-GBB-001',
        status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
        processType: ProcessType.GBB,
        cargoType: 'Raw Materials',
        cargoSubType: 'Wheat',
        warehouseStartAt: new Date(),
        warehouseStartById: mockUser.id,
        warehouseEndAt: null,
        revision: 2,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(gbbTx);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            ...gbbTx,
            status: TransactionStatus.INCOMING_CHECK_PENDING,
            warehouseEndBy: { id: mockUser.id, name: 'Admin', role: 'ADMIN' },
          }),
        },
        warehouseProcess: {
          findFirst: jest.fn().mockResolvedValue({ id: 'wp-gbb', revision: 1 }),
          update: jest.fn().mockResolvedValue({ id: 'wp-gbb', revision: 2 }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await warehouseService.completeWarehouse(
        'tx-gbb-wh',
        {
          actualWeight: 18000,
          actualQuantity: 300,
          unit: WarehouseUnit.BAG,
          condition: WarehouseCondition.GOOD,
        },
        mockUser,
      );

      expect(res.success).toBe(true);
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.INCOMING_CHECK_PENDING,
          }),
        }),
      );
    });
  });
});
