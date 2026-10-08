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
  QcResult,
  Prisma,
} from '@prisma/client';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import {
  GSP_PREUNLOAD_CANONICAL_ITEMS,
  GSP_PREUNLOAD_VERSION,
} from './constants/gsp-preunload-checklist';

const validGspChecklist = {
  items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) => ({
    code: item.code,
    result: 'OK' as const,
    notes: '',
  })),
};

const validStartGspDto = {
  suratJalanNumber: 'SJ-2026-001',
  poNumber: 'PO-2026-001',
  preUnloadChecklist: validGspChecklist,
};

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
      qcProductAnalysis: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
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
        receiptUnit: WarehouseUnit.LITER,
        cargoType: 'Fuel',
        cargoSubType: 'Solar',
        weighInAt: new Date(),
        grossWeight: 15000,
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
        validStartGspDto,
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
        receiptUnit: WarehouseUnit.KG,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        weighInAt: new Date(),
        grossWeight: 25000,
        revision: 3,
        productCatalogId: 'cat-coal-1',
        productCatalog: {
          id: 'cat-coal-1',
          code: 'COAL-001',
          name: 'Batubara',
          processType: ProcessType.GSP,
          isActive: true,
          isPaRequired: true,
        },
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);
      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce({
        id: 'pa-coal-1',
        transactionId: 'tx-coal-1',
        productCatalogId: 'cat-coal-1',
        status: 'RELEASE',
        result: QcResult.PASS,
        isVoided: false,
      });
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
        validStartGspDto,
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

    it('A: strictly blocks startWarehouse when PA has legacy ACCEPT_WITH_DEVIATION evidence (Zero Utility authorization)', async () => {
      const coalTx = {
        id: 'tx-coal-legacy-dev',
        status: TransactionStatus.QC_VEHICLE_PASSED,
        processType: ProcessType.GSP,
        receiptUnit: WarehouseUnit.KG,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        weighInAt: new Date(),
        grossWeight: 25000,
        revision: 3,
        productCatalogId: 'cat-coal-1',
        productCatalog: {
          id: 'cat-coal-1',
          code: 'COAL-001',
          name: 'Batubara',
          processType: ProcessType.GSP,
          isActive: true,
          isPaRequired: true,
        },
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);
      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce({
        id: 'pa-coal-legacy',
        transactionId: 'tx-coal-legacy-dev',
        productCatalogId: 'cat-coal-1',
        status: 'ACCEPT_WITH_DEVIATION',
        dispositionAction: 'ACCEPT_WITH_DEVIATION',
        dispositionById: 'legacy-util-user',
        isVoided: false,
      });
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: ProcessType.GSP },
      ]);

      await expect(
        warehouseService.startWarehouse('tx-coal-legacy-dev', {}, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('C: strictly blocks startWarehouse when PA is in PENDING_DISPOSITION', async () => {
      const coalTx = {
        id: 'tx-coal-pending-disp',
        status: TransactionStatus.QC_VEHICLE_PASSED,
        processType: ProcessType.GSP,
        receiptUnit: WarehouseUnit.KG,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        weighInAt: new Date(),
        grossWeight: 25000,
        revision: 3,
        productCatalogId: 'cat-coal-1',
        productCatalog: {
          id: 'cat-coal-1',
          code: 'COAL-001',
          name: 'Batubara',
          processType: ProcessType.GSP,
          isActive: true,
          isPaRequired: true,
        },
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);
      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce({
        id: 'pa-coal-pending-disp',
        transactionId: 'tx-coal-pending-disp',
        productCatalogId: 'cat-coal-1',
        status: 'PENDING_DISPOSITION',
        result: 'RETEST_REQUIRED',
        isVoided: false,
      });
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: ProcessType.GSP },
      ]);

      await expect(
        warehouseService.startWarehouse('tx-coal-pending-disp', {}, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('D: strictly blocks startWarehouse when transaction status is QC_VEHICLE_REJECTED', async () => {
      const coalRejectedTx = {
        id: 'tx-coal-rejected',
        status: TransactionStatus.QC_VEHICLE_REJECTED,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        revision: 3,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        coalRejectedTx,
      );
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: ProcessType.GSP },
      ]);

      await expect(
        warehouseService.startWarehouse('tx-coal-rejected', {}, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('A: status = RELEASE, result = null -> Warehouse Start REJECTED', async () => {
      const coalTx = {
        id: 'tx-coal-res-null',
        status: TransactionStatus.QC_VEHICLE_PASSED,
        processType: ProcessType.GSP,
        receiptUnit: WarehouseUnit.KG,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        weighInAt: new Date(),
        grossWeight: 25000,
        revision: 3,
        productCatalogId: 'cat-coal-1',
        productCatalog: {
          id: 'cat-coal-1',
          code: 'COAL-001',
          name: 'Batubara',
          processType: ProcessType.GSP,
          isActive: true,
          isPaRequired: true,
        },
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);
      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce({
        id: 'pa-null-res',
        transactionId: 'tx-coal-res-null',
        productCatalogId: 'cat-coal-1',
        status: 'RELEASE',
        result: null,
        isVoided: false,
      } as any);
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: ProcessType.GSP },
      ]);

      await expect(
        warehouseService.startWarehouse('tx-coal-res-null', {}, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('B: status = RELEASE, result = "PASSED" (legacy non-enum string) -> Warehouse Start REJECTED', async () => {
      const coalTx = {
        id: 'tx-coal-res-passed',
        status: TransactionStatus.QC_VEHICLE_PASSED,
        processType: ProcessType.GSP,
        receiptUnit: WarehouseUnit.KG,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        weighInAt: new Date(),
        grossWeight: 25000,
        revision: 3,
        productCatalogId: 'cat-coal-1',
        productCatalog: {
          id: 'cat-coal-1',
          code: 'COAL-001',
          name: 'Batubara',
          processType: ProcessType.GSP,
          isActive: true,
          isPaRequired: true,
        },
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);
      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce({
        id: 'pa-passed-res',
        transactionId: 'tx-coal-res-passed',
        productCatalogId: 'cat-coal-1',
        status: 'RELEASE',
        result: 'PASSED',
        isVoided: false,
      } as any);
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: ProcessType.GSP },
      ]);

      await expect(
        warehouseService.startWarehouse('tx-coal-res-passed', {}, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('C: status = RELEASE, result = REJECT -> Warehouse Start REJECTED', async () => {
      const coalTx = {
        id: 'tx-coal-res-reject',
        status: TransactionStatus.QC_VEHICLE_PASSED,
        processType: ProcessType.GSP,
        receiptUnit: WarehouseUnit.KG,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        weighInAt: new Date(),
        grossWeight: 25000,
        revision: 3,
        productCatalogId: 'cat-coal-1',
        productCatalog: {
          id: 'cat-coal-1',
          code: 'COAL-001',
          name: 'Batubara',
          processType: ProcessType.GSP,
          isActive: true,
          isPaRequired: true,
        },
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);
      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce({
        id: 'pa-reject-res',
        transactionId: 'tx-coal-res-reject',
        productCatalogId: 'cat-coal-1',
        status: 'RELEASE',
        result: QcResult.REJECT,
        isVoided: false,
      });
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: ProcessType.GSP },
      ]);

      await expect(
        warehouseService.startWarehouse('tx-coal-res-reject', {}, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('D: status = RELEASE, result = PASS, productCatalogId mismatch -> REJECTED', async () => {
      const coalTx = {
        id: 'tx-coal-mismatch',
        status: TransactionStatus.QC_VEHICLE_PASSED,
        processType: ProcessType.GSP,
        receiptUnit: WarehouseUnit.KG,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        weighInAt: new Date(),
        grossWeight: 25000,
        revision: 3,
        productCatalogId: 'cat-coal-1',
        productCatalog: {
          id: 'cat-coal-1',
          code: 'COAL-001',
          name: 'Batubara',
          processType: ProcessType.GSP,
          isActive: true,
          isPaRequired: true,
        },
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);
      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce({
        id: 'pa-mismatch-res',
        transactionId: 'tx-coal-mismatch',
        productCatalogId: 'cat-other-999',
        status: 'RELEASE',
        result: QcResult.PASS,
        isVoided: false,
      });
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: ProcessType.GSP },
      ]);

      await expect(
        warehouseService.startWarehouse('tx-coal-mismatch', {}, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('E: status = RELEASE, result = PASS, isVoided = true / no active PA returned -> REJECTED', async () => {
      const coalTx = {
        id: 'tx-coal-voided',
        status: TransactionStatus.QC_VEHICLE_PASSED,
        processType: ProcessType.GSP,
        receiptUnit: WarehouseUnit.KG,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        weighInAt: new Date(),
        grossWeight: 25000,
        revision: 3,
        productCatalogId: 'cat-coal-1',
        productCatalog: {
          id: 'cat-coal-1',
          code: 'COAL-001',
          name: 'Batubara',
          processType: ProcessType.GSP,
          isActive: true,
          isPaRequired: true,
        },
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);
      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce(null);
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: ProcessType.GSP },
      ]);

      await expect(
        warehouseService.startWarehouse('tx-coal-voided', {}, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('F: status = RELEASE, result = PASS, catalog matches, active non-voided -> Warehouse Start ALLOWED', async () => {
      const coalTx = {
        id: 'tx-coal-canonical-pass',
        status: TransactionStatus.QC_VEHICLE_PASSED,
        processType: ProcessType.GSP,
        receiptUnit: WarehouseUnit.KG,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        weighInAt: new Date(),
        grossWeight: 25000,
        revision: 3,
        productCatalogId: 'cat-coal-1',
        productCatalog: {
          id: 'cat-coal-1',
          code: 'COAL-001',
          name: 'Batubara',
          processType: ProcessType.GSP,
          isActive: true,
          isPaRequired: true,
        },
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);
      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce({
        id: 'pa-canonical-release',
        transactionId: 'tx-coal-canonical-pass',
        productCatalogId: 'cat-coal-1',
        status: 'RELEASE',
        result: QcResult.PASS,
        isVoided: false,
      });
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
          create: jest.fn().mockResolvedValue({ id: 'wp-canonical-1' }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await warehouseService.startWarehouse(
        'tx-coal-canonical-pass',
        validStartGspDto,
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

    describe('GSP Pre-Unloading Verification Gates & Dual-Action Audit (Task 10 & 11)', () => {
      const baseCoalTx = {
        id: 'tx-coal-preunload-gate',
        status: TransactionStatus.QC_VEHICLE_PASSED,
        processType: ProcessType.GSP,
        receiptUnit: WarehouseUnit.KG,
        cargoType: 'Coal',
        cargoSubType: 'Batubara 5600-6000',
        weighInAt: new Date(),
        grossWeight: 25000,
        revision: 3,
        productCatalogId: 'cat-coal-1',
        productCatalog: {
          id: 'cat-coal-1',
          code: 'COAL-001',
          name: 'Batubara 5600-6000',
          processType: ProcessType.GSP,
          isActive: true,
          isPaRequired: true,
        },
      };

      const mockPaRecord = {
        id: 'pa-coal-pass',
        transactionId: 'tx-coal-preunload-gate',
        productCatalogId: 'cat-coal-1',
        status: 'RELEASE',
        result: QcResult.PASS,
        isVoided: false,
      };

      it('blocks startWarehouse if suratJalanNumber is missing with MISSING_SURAT_JALAN', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTx,
        );
        mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce(
          mockPaRecord,
        );
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);

        await expect(
          warehouseService.startWarehouse(
            'tx-coal-preunload-gate',
            { poNumber: 'PO-001', preUnloadChecklist: validGspChecklist },
            mockUser,
          ),
        ).rejects.toMatchObject({
          response: { errors: expect.arrayContaining(['MISSING_SURAT_JALAN']) },
        });
      });

      it('blocks startWarehouse if poNumber is missing with MISSING_PO_NUMBER', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTx,
        );
        mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce(
          mockPaRecord,
        );
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);

        await expect(
          warehouseService.startWarehouse(
            'tx-coal-preunload-gate',
            {
              suratJalanNumber: 'SJ-001',
              preUnloadChecklist: validGspChecklist,
            },
            mockUser,
          ),
        ).rejects.toMatchObject({
          response: { errors: expect.arrayContaining(['MISSING_PO_NUMBER']) },
        });
      });

      it('blocks startWarehouse if preUnloadChecklist is missing with MISSING_PREUNLOAD_CHECKLIST and logs GSP_PREUNLOAD_CHECKLIST_INVALID', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTx,
        );
        mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce(
          mockPaRecord,
        );
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);

        await expect(
          warehouseService.startWarehouse(
            'tx-coal-preunload-gate',
            { suratJalanNumber: 'SJ-001', poNumber: 'PO-001' },
            mockUser,
          ),
        ).rejects.toMatchObject({
          response: {
            errors: expect.arrayContaining(['MISSING_PREUNLOAD_CHECKLIST']),
          },
        });

        expect(mockActivityLogsService.logAction).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'GSP_PREUNLOAD_CHECKLIST_INVALID',
            referenceId: 'tx-coal-preunload-gate',
          }),
        );
      });

      it('blocks startWarehouse on malformed checklist (unknown code, duplicates, missing codes) and logs GSP_PREUNLOAD_CHECKLIST_INVALID', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTx,
        );
        mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce(
          mockPaRecord,
        );
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);

        const malformedChecklist = {
          items: [
            ...validGspChecklist.items.slice(0, 8),
            { code: 'UNKNOWN_CODE', result: 'OK' as const, notes: '' },
          ],
        };

        await expect(
          warehouseService.startWarehouse(
            'tx-coal-preunload-gate',
            {
              suratJalanNumber: 'SJ-001',
              poNumber: 'PO-001',
              preUnloadChecklist: malformedChecklist,
            },
            mockUser,
          ),
        ).rejects.toMatchObject({
          response: {
            errors: expect.arrayContaining([
              'INVALID_PREUNLOAD_CHECKLIST_STRUCTURE',
            ]),
          },
        });

        expect(mockActivityLogsService.logAction).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'GSP_PREUNLOAD_CHECKLIST_INVALID',
            referenceId: 'tx-coal-preunload-gate',
          }),
        );
      });

      it('blocks startWarehouse if any checklist item is NOT_OK, logs GSP_PREUNLOAD_CHECKLIST_FAILED, leaves status unchanged, and creates no process', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTx,
        );
        mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce(
          mockPaRecord,
        );
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);

        const failedChecklist = {
          items: validGspChecklist.items.map((item) =>
            item.code === 'DOOR_SEAL_GOOD'
              ? {
                  code: item.code,
                  result: 'NOT_OK' as const,
                  notes: 'Segel pintu rusak dan terputus',
                }
              : item,
          ),
        };

        await expect(
          warehouseService.startWarehouse(
            'tx-coal-preunload-gate',
            {
              suratJalanNumber: 'SJ-001',
              poNumber: 'PO-001',
              preUnloadChecklist: failedChecklist,
            },
            mockUser,
          ),
        ).rejects.toThrow(
          'Pemeriksaan pra-bongkar belum memenuhi persyaratan.',
        );

        expect(mockActivityLogsService.logAction).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'GSP_PREUNLOAD_CHECKLIST_FAILED',
            referenceId: 'tx-coal-preunload-gate',
            description: expect.stringContaining('DOOR_SEAL_GOOD'),
          }),
        );

        // Verify no database mutation occurred
        expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
        expect(
          mockPrismaService.warehouseProcess.create,
        ).not.toHaveBeenCalled();
      });

      it('permits startWarehouse when all 9 items are OK, transitions to WAREHOUSE_IN_PROGRESS, and persists canonical labels and version', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTx,
        );
        mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce(
          mockPaRecord,
        );
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);

        const mockTxClient = {
          transaction: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue({
              ...baseCoalTx,
              status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
              warehouseStartBy: {
                id: mockUser.id,
                name: 'Admin',
                role: 'ADMIN',
              },
            }),
          },
          warehouseProcess: {
            aggregate: jest.fn().mockResolvedValue({ _max: { revision: 0 } }),
            create: jest.fn().mockResolvedValue({ id: 'wp-preunload-ok' }),
          },
          transactionStatusHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClient),
        );

        const res = await warehouseService.startWarehouse(
          'tx-coal-preunload-gate',
          validStartGspDto,
          mockUser,
        );

        expect(res.success).toBe(true);
        expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
              suratJalanNumber: 'SJ-2026-001',
              poNumber: 'PO-2026-001',
            }),
          }),
        );

        expect(mockTxClient.warehouseProcess.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              checklistItems: expect.objectContaining({
                version: GSP_PREUNLOAD_VERSION,
                overallResult: 'OK',
                items: expect.arrayContaining([
                  expect.objectContaining({
                    code: 'CLEAN_VEHICLE',
                    label: 'Kendaraan bersih',
                    result: 'OK',
                  }),
                  expect.objectContaining({
                    code: 'DOOR_SEAL_GOOD',
                    label: 'Seal pintu kendaraan baik',
                    result: 'OK',
                  }),
                ]),
              }),
            }),
          }),
        );
      });
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
        receiptUnit: WarehouseUnit.LITER,
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
        receiptUnit: WarehouseUnit.LITER,
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
        receiptUnit: WarehouseUnit.LITER,
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
        receiptUnit: WarehouseUnit.LITER,
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
          receivedQuantity: '25000.500',
          receivedUnit: WarehouseUnit.LITER,
          condition: WarehouseCondition.GOOD,
        },
        mockUser,
      );

      expect(res.success).toBe(true);
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.WAREHOUSE_DONE,
            receivedQuantity: new Prisma.Decimal('25000.500'),
            receiptUnit: WarehouseUnit.LITER,
          }),
        }),
      );
      expect(mockTxClient.warehouseProcess.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            receivedQuantity: new Prisma.Decimal('25000.500'),
            receivedUnit: WarehouseUnit.LITER,
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

    describe('GSP Receiving Decimal Contract & UOM Architecture (Task 12 & 13)', () => {
      const baseGspInProgress = {
        id: 'tx-gsp-receiving',
        transactionNumber: 'TRX-GSP-REC-001',
        status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
        processType: ProcessType.GSP,
        cargoType: 'Chemicals',
        cargoSubType: 'PAC 280 AC',
        receiptUnit: WarehouseUnit.LITER,
        warehouseStartAt: new Date(),
        warehouseStartById: mockUser.id,
        warehouseEndAt: null,
        revision: 3,
      };

      it('rejects GSP completion if receivedQuantity is missing', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseGspInProgress,
        );

        await expect(
          warehouseService.completeWarehouse(
            'tx-gsp-receiving',
            { receivedUnit: WarehouseUnit.LITER } as any,
            mockUser,
          ),
        ).rejects.toMatchObject({
          response: {
            errors: expect.arrayContaining(['MISSING_RECEIVED_QUANTITY']),
          },
        });
      });

      it('rejects receivedQuantity with scientific notation or non-numeric characters', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseGspInProgress,
        );

        await expect(
          warehouseService.completeWarehouse(
            'tx-gsp-receiving',
            { receivedQuantity: '1e3', receivedUnit: WarehouseUnit.LITER },
            mockUser,
          ),
        ).rejects.toMatchObject({
          response: { error: 'INVALID_RECEIVED_QUANTITY' },
        });
      });

      it('rejects receivedQuantity with scale > 3 decimal places with INVALID_RECEIVED_QUANTITY_SCALE', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseGspInProgress,
        );

        await expect(
          warehouseService.completeWarehouse(
            'tx-gsp-receiving',
            {
              receivedQuantity: '8000.2507',
              receivedUnit: WarehouseUnit.LITER,
            },
            mockUser,
          ),
        ).rejects.toMatchObject({
          response: { error: 'INVALID_RECEIVED_QUANTITY_SCALE' },
        });
      });

      it('rejects receivedQuantity with overflow > 9 integer digits', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseGspInProgress,
        );

        await expect(
          warehouseService.completeWarehouse(
            'tx-gsp-receiving',
            {
              receivedQuantity: '1234567890.123',
              receivedUnit: WarehouseUnit.LITER,
            },
            mockUser,
          ),
        ).rejects.toMatchObject({
          response: { error: 'RECEIVED_QUANTITY_OVERFLOW' },
        });
      });

      it('rejects zero or negative receivedQuantity', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseGspInProgress,
        );

        await expect(
          warehouseService.completeWarehouse(
            'tx-gsp-receiving',
            { receivedQuantity: '0', receivedUnit: WarehouseUnit.LITER },
            mockUser,
          ),
        ).rejects.toMatchObject({
          response: { error: 'INVALID_RECEIVED_QUANTITY' },
        });
      });

      it('rejects receivedUnit mismatch with transaction receiptUnit with INVALID_RECEIPT_UNIT', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseGspInProgress,
        );

        await expect(
          warehouseService.completeWarehouse(
            'tx-gsp-receiving',
            { receivedQuantity: '8000.250', receivedUnit: WarehouseUnit.KG }, // tx is LITER!
            mockUser,
          ),
        ).rejects.toMatchObject({
          response: {
            errors: expect.arrayContaining(['INVALID_RECEIPT_UNIT']),
          },
        });
      });

      it('rejects GSP completion if transaction lacks receiptUnit with MISSING_GSP_RECEIPT_UNIT', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
          ...baseGspInProgress,
          receiptUnit: null,
        });

        await expect(
          warehouseService.completeWarehouse(
            'tx-gsp-receiving',
            { receivedQuantity: '8000.250' },
            mockUser,
          ),
        ).rejects.toMatchObject({
          response: {
            errors: expect.arrayContaining(['MISSING_GSP_RECEIPT_UNIT']),
          },
        });
      });

      it('accepts valid decimal strings (e.g. "8000.250") and persists Prisma.Decimal atomically to Transaction and WarehouseProcess', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseGspInProgress,
        );

        const mockTxClient = {
          transaction: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue({
              ...baseGspInProgress,
              status: TransactionStatus.WAREHOUSE_DONE,
              receivedQuantity: new Prisma.Decimal('8000.250'),
              receiptUnit: WarehouseUnit.LITER,
            }),
          },
          warehouseProcess: {
            findFirst: jest
              .fn()
              .mockResolvedValue({ id: 'wp-rec-1', revision: 1 }),
            update: jest
              .fn()
              .mockResolvedValue({ id: 'wp-rec-1', revision: 2 }),
          },
          transactionStatusHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClient),
        );

        const res = await warehouseService.completeWarehouse(
          'tx-gsp-receiving',
          { receivedQuantity: '8000.250', receivedUnit: WarehouseUnit.LITER },
          mockUser,
        );

        expect(res.success).toBe(true);
        expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: TransactionStatus.WAREHOUSE_DONE,
              receivedQuantity: new Prisma.Decimal('8000.250'),
              receiptUnit: WarehouseUnit.LITER,
            }),
          }),
        );
        expect(mockTxClient.warehouseProcess.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              receivedQuantity: new Prisma.Decimal('8000.250'),
              receivedUnit: WarehouseUnit.LITER,
            }),
          }),
        );
      });
    });
  });
});
