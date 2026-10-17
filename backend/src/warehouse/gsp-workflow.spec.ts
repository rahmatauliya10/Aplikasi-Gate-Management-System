import * as fs from 'fs';

jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    existsSync: jest.fn().mockReturnValue(true),
    writeFileSync: jest.fn(),
    unlinkSync: jest.fn(),
    mkdirSync: jest.fn(),
    readFileSync: jest.fn(),
  };
});
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
  GSP_PREUNLOAD_CODES,
  GSP_PREUNLOAD_LABEL_MAP,
} from './constants/gsp-preunload-checklist';

const VALID_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

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
      $transaction: jest.fn().mockImplementation(async (cb: any) => {
        if (typeof cb === 'function') {
          return cb(mockPrismaService);
        }
        return Promise.resolve(cb);
      }),
      transaction: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      warehouseProcess: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
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
      attachment: {
        findFirst: jest.fn().mockImplementation(({ where }: any) => {
          if (where?.id) {
            return Promise.resolve({
              id: where.id,
              transactionId: where.transactionId || 'tx-chk-disposition-1',
              filePath: 'checklist-evidence/test.png',
              isCurrent: true,
            });
          }
          return Promise.resolve(null);
        }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
          id: 'att-mock-created-1',
          filePath: 'checklist-evidence/test.png',
        }),
      },
    };

    mockActivityLogsService = {
      logAction: jest.fn().mockResolvedValue({}),
      logActionStrict: jest
        .fn()
        .mockImplementation((dto, prismaTx) =>
          prismaTx !== undefined
            ? mockActivityLogsService.logAction(dto, prismaTx)
            : mockActivityLogsService.logAction(dto),
        ),
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

    (fs.existsSync as jest.Mock).mockReset();
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.writeFileSync as jest.Mock).mockReset();
    (fs.unlinkSync as jest.Mock).mockReset();
    (fs.mkdirSync as jest.Mock).mockReset();
    (fs.readFileSync as jest.Mock).mockReset();
    (fs.readFileSync as jest.Mock).mockReturnValue(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      ),
    );
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
            status: {
              in: [
                'QC_VEHICLE_PASSED',
                'PA_NOT_REQUIRED',
                'WAITING_GSP_CHECKLIST_DISPOSITION',
              ],
            },
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

    it('G: status = ACCEPT_WITH_NOTE, result = REJECT, valid dispositionById and dispositionAction -> Warehouse Start ALLOWED (Approved Concession)', async () => {
      const chemTx = {
        id: 'tx-chem-concession-pass',
        status: TransactionStatus.QC_VEHICLE_PASSED,
        processType: ProcessType.GSP,
        receiptUnit: WarehouseUnit.LITER,
        cargoType: 'Chemical UTL',
        cargoSubType: 'PAC 280 AC',
        weighInAt: new Date(),
        grossWeight: 20000,
        revision: 3,
        productCatalogId: 'cat-pac-1',
        productCatalog: {
          id: 'cat-pac-1',
          code: 'PAC-001',
          name: 'PAC 280 AC',
          processType: ProcessType.GSP,
          isActive: true,
          isPaRequired: true,
        },
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(chemTx);
      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce({
        id: 'pa-concession-release',
        transactionId: 'tx-chem-concession-pass',
        productCatalogId: 'cat-pac-1',
        status: 'ACCEPT_WITH_NOTE',
        result: QcResult.REJECT, // Lab result remains factual OOS!
        dispositionAction: 'ACCEPT_WITH_NOTE',
        dispositionReason:
          'Penyimpangan pH diterima PIC Gudang GSP dengan catatan',
        dispositionById: 'usr-wh-gsp',
        dispositionAt: new Date(),
        parameters: {
          ph: 5.2,
          density: 1.2,
          sensory: {
            visual: 'Kuning',
            foreignMatters: 'Tidak ada kontaminasi',
            packagingLabel: 'Kemasan & label tidak rusak',
          },
        },
        isVoided: false,
      });
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: ProcessType.GSP },
      ]);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            ...chemTx,
            status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
            warehouseStartBy: { id: mockUser.id, name: 'Admin', role: 'ADMIN' },
          }),
        },
        warehouseProcess: {
          aggregate: jest.fn().mockResolvedValue({ _max: { revision: 0 } }),
          create: jest.fn().mockResolvedValue({ id: 'wp-chem-1' }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await warehouseService.startWarehouse(
        'tx-chem-concession-pass',
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

    it('P0-01: blocks startWarehouse if concession activePa.result was falsified to PASS (factual lab must be REJECT)', async () => {
      const chemTx = {
        id: 'tx-chem-falsified-pass',
        status: TransactionStatus.QC_VEHICLE_PASSED,
        processType: ProcessType.GSP,
        receiptUnit: WarehouseUnit.LITER,
        cargoType: 'Chemical UTL',
        cargoSubType: 'PAC 280 AC',
        weighInAt: new Date(),
        grossWeight: 20000,
        revision: 3,
        productCatalogId: 'cat-pac-1',
        productCatalog: {
          id: 'cat-pac-1',
          code: 'PAC-001',
          name: 'PAC 280 AC',
          processType: ProcessType.GSP,
          isActive: true,
          isPaRequired: true,
        },
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(chemTx);
      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce({
        id: 'pa-concession-falsified',
        transactionId: 'tx-chem-falsified-pass',
        productCatalogId: 'cat-pac-1',
        status: 'ACCEPT_WITH_NOTE',
        result: QcResult.PASS, // Tampered/falsified! Must be REJECT for concession
        dispositionAction: 'ACCEPT_WITH_NOTE',
        dispositionReason: 'Alasan manipulasi',
        dispositionById: 'usr-wh-gsp',
        dispositionAt: new Date(),
        isVoided: false,
      });
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: ProcessType.GSP },
      ]);

      await expect(
        warehouseService.startWarehouse(
          'tx-chem-falsified-pass',
          validStartGspDto,
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('P0-01: blocks startWarehouse if concession dispositionReason is missing or < 5 characters', async () => {
      const chemTx = {
        id: 'tx-chem-missing-reason',
        status: TransactionStatus.QC_VEHICLE_PASSED,
        processType: ProcessType.GSP,
        receiptUnit: WarehouseUnit.LITER,
        cargoType: 'Chemical UTL',
        cargoSubType: 'PAC 280 AC',
        weighInAt: new Date(),
        grossWeight: 20000,
        revision: 3,
        productCatalogId: 'cat-pac-1',
        productCatalog: {
          id: 'cat-pac-1',
          code: 'PAC-001',
          name: 'PAC 280 AC',
          processType: ProcessType.GSP,
          isActive: true,
          isPaRequired: true,
        },
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(chemTx);
      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce({
        id: 'pa-concession-no-reason',
        transactionId: 'tx-chem-missing-reason',
        productCatalogId: 'cat-pac-1',
        status: 'ACCEPT_WITH_NOTE',
        result: QcResult.REJECT,
        dispositionAction: 'ACCEPT_WITH_NOTE',
        dispositionReason: 'ok', // < 5 chars
        dispositionById: 'usr-wh-gsp',
        dispositionAt: new Date(),
        isVoided: false,
      });
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: ProcessType.GSP },
      ]);

      await expect(
        warehouseService.startWarehouse(
          'tx-chem-missing-reason',
          validStartGspDto,
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('P0-01: blocks startWarehouse if concession dispositionById is missing', async () => {
      const chemTx = {
        id: 'tx-chem-missing-actor',
        status: TransactionStatus.QC_VEHICLE_PASSED,
        processType: ProcessType.GSP,
        receiptUnit: WarehouseUnit.LITER,
        cargoType: 'Chemical UTL',
        cargoSubType: 'PAC 280 AC',
        weighInAt: new Date(),
        grossWeight: 20000,
        revision: 3,
        productCatalogId: 'cat-pac-1',
        productCatalog: {
          id: 'cat-pac-1',
          code: 'PAC-001',
          name: 'PAC 280 AC',
          processType: ProcessType.GSP,
          isActive: true,
          isPaRequired: true,
        },
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(chemTx);
      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce({
        id: 'pa-concession-no-actor',
        transactionId: 'tx-chem-missing-actor',
        productCatalogId: 'cat-pac-1',
        status: 'ACCEPT_WITH_NOTE',
        result: QcResult.REJECT,
        dispositionAction: 'ACCEPT_WITH_NOTE',
        dispositionReason: 'Alasan lengkap tapi tanpa aktor disposisi',
        dispositionById: null, // missing!
        dispositionAt: new Date(),
        isVoided: false,
      });
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: ProcessType.GSP },
      ]);

      await expect(
        warehouseService.startWarehouse(
          'tx-chem-missing-actor',
          validStartGspDto,
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('P0-01: blocks startWarehouse if concession contains non-waivable critical contamination', async () => {
      const chemTx = {
        id: 'tx-chem-critical-defect',
        status: TransactionStatus.QC_VEHICLE_PASSED,
        processType: ProcessType.GSP,
        receiptUnit: WarehouseUnit.LITER,
        cargoType: 'Chemical UTL',
        cargoSubType: 'PAC 280 AC',
        weighInAt: new Date(),
        grossWeight: 20000,
        revision: 3,
        productCatalogId: 'cat-pac-1',
        productCatalog: {
          id: 'cat-pac-1',
          code: 'PAC-001',
          name: 'PAC 280 AC',
          processType: ProcessType.GSP,
          isActive: true,
          isPaRequired: true,
        },
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(chemTx);
      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce({
        id: 'pa-concession-critical',
        transactionId: 'tx-chem-critical-defect',
        productCatalogId: 'cat-pac-1',
        status: 'ACCEPT_WITH_NOTE',
        result: QcResult.REJECT,
        dispositionAction: 'ACCEPT_WITH_NOTE',
        dispositionReason: 'Alasan lengkap tapi ada kontaminasi fisik',
        dispositionById: 'usr-wh-gsp',
        dispositionAt: new Date(),
        parameters: {
          sensory: {
            foreignMatters: 'Ditemukan serpihan kaca', // CRITICAL!
            packagingLabel: 'Kemasan & label tidak rusak',
          },
        },
        isVoided: false,
      });
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: ProcessType.GSP },
      ]);

      await expect(
        warehouseService.startWarehouse(
          'tx-chem-critical-defect',
          validStartGspDto,
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
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
                  photoUrl: VALID_PNG_DATA_URL,
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

    it('strictly blocks startWarehouse when status is QC_RETEST_REQUIRED, WAITING_GSP_DISPOSITION, or WAITING_UTILITY_DISPOSITION', async () => {
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

      const waitingGspTx = {
        id: 'tx-chem-waiting-gsp',
        status: TransactionStatus.WAITING_GSP_DISPOSITION,
        processType: ProcessType.GSP,
        cargoType: 'Chemical UTL',
        cargoSubType: 'PAC 280 AC',
        revision: 2,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        waitingGspTx,
      );
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: ProcessType.GSP },
      ]);

      await expect(
        warehouseService.startWarehouse('tx-chem-waiting-gsp', {}, mockUser),
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

    describe('GSP Pre-Unloading Checklist Concession & Disposition (GSP-CHECKLIST-CONCESSION-2026)', () => {
      const VALID_PNG_DATA_URL =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const createCanonical9PreunloadItems = (
        notOkCode?: string,
        notOkNotes = 'Temuan ketidaksesuaian pra-bongkar',
        photoUrl: string | null = VALID_PNG_DATA_URL,
      ) => {
        return GSP_PREUNLOAD_CODES.map((code) => ({
          code,
          result: code === notOkCode ? ('NOT_OK' as const) : ('OK' as const),
          label: GSP_PREUNLOAD_LABEL_MAP[code] || code,
          ...(code === notOkCode
            ? {
                notes: notOkNotes,
                photoUrl: photoUrl ?? undefined,
              }
            : {}),
        }));
      };

      const createFreshMockChecklistTx = () => ({
        id: 'tx-chk-disposition-1',
        status: TransactionStatus.WAITING_GSP_CHECKLIST_DISPOSITION,
        processType: ProcessType.GSP,
        receiptUnit: WarehouseUnit.LITER,
        cargoType: 'Chemical UTL',
        cargoSubType: 'PAC 280 AC',
        suratJalanNumber: 'SJ-2026-CHK',
        poNumber: 'PO-2026-CHK',
        revision: 4,
        productCatalogId: 'cat-pac-1',
        productCatalog: {
          id: 'cat-pac-1',
          code: 'CHEM-PAC',
          name: 'PAC 280 AC',
          processType: ProcessType.GSP,
          isActive: true,
          isPaRequired: true,
        },
        warehouseProcesses: [
          {
            id: 'wp-chk-1',
            status: 'IN_PROGRESS',
            revision: 1,
            isCurrent: true,
            checklistItems: {
              version: 'GSP-PREUNLOAD-2026.1',
              items: createCanonical9PreunloadItems(
                'CLEAN_VEHICLE',
                'Bak kotor',
              ),
            },
          },
        ],
      });

      let mockChecklistTx: ReturnType<typeof createFreshMockChecklistTx>;

      beforeEach(() => {
        mockChecklistTx = createFreshMockChecklistTx();
      });

      it('permits ACCEPT_WITH_NOTE concession: transitions to WAREHOUSE_IN_PROGRESS and records concession metadata', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          mockChecklistTx,
        );
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
          mockChecklistTx.warehouseProcesses[0],
        );
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);

        const mockTxClient = {
          transaction: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue({
              ...mockChecklistTx,
              status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
            }),
          },
          warehouseProcess: {
            findFirst: jest
              .fn()
              .mockResolvedValue(mockChecklistTx.warehouseProcesses[0]),
            update: jest.fn().mockResolvedValue({}),
          },
          transactionStatusHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClient),
        );

        const res = await warehouseService.submitChecklistDisposition(
          'tx-chk-disposition-1',
          {
            action: 'ACCEPT_WITH_NOTE',
            reason:
              'Diterima dengan catatan oleh PIC Gudang GSP karena deviasi minor fisik luar',
            revision: 4,
          },
          mockUser,
        );

        expect(res.success).toBe(true);
        expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              id: 'tx-chk-disposition-1',
              status: TransactionStatus.WAITING_GSP_CHECKLIST_DISPOSITION,
            }),
            data: expect.objectContaining({
              status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
            }),
          }),
        );
        expect(mockTxClient.warehouseProcess.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'wp-chk-1' },
            data: expect.objectContaining({
              checklistItems: expect.objectContaining({
                disposition: expect.objectContaining({
                  action: 'ACCEPT_WITH_NOTE',
                  decidedById: mockUser.id,
                }),
              }),
            }),
          }),
        );
      });

      it('permits REJECT decision: transitions to QC_VEHICLE_REJECTED', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          mockChecklistTx,
        );
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
          mockChecklistTx.warehouseProcesses[0],
        );
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);

        const mockTxClient = {
          transaction: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue({
              ...mockChecklistTx,
              status: TransactionStatus.QC_VEHICLE_REJECTED,
            }),
          },
          warehouseProcess: {
            findFirst: jest
              .fn()
              .mockResolvedValue(mockChecklistTx.warehouseProcesses[0]),
            update: jest.fn().mockResolvedValue({}),
          },
          transactionStatusHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClient),
        );

        const res = await warehouseService.submitChecklistDisposition(
          'tx-chk-disposition-1',
          {
            action: 'REJECT',
            reason: 'Muatan ditolak karena kondisi fisik tangki bocor parah',
            revision: 4,
          },
          mockUser,
        );

        expect(res.success).toBe(true);
        expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              id: 'tx-chk-disposition-1',
              status: TransactionStatus.WAITING_GSP_CHECKLIST_DISPOSITION,
            }),
            data: expect.objectContaining({
              status: TransactionStatus.QC_VEHICLE_REJECTED,
            }),
          }),
        );
      });

      it('rejects disposition submission if reason is shorter than 5 characters', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          mockChecklistTx,
        );
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
          mockChecklistTx.warehouseProcesses[0],
        );
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);

        await expect(
          warehouseService.submitChecklistDisposition(
            'tx-chk-disposition-1',
            {
              action: 'ACCEPT_WITH_NOTE',
              reason: 'Acc', // < 5 chars
              revision: 4,
            },
            mockUser,
          ),
        ).rejects.toThrow(
          'Alasan keputusan disposisi checklist wajib diisi (minimal 5 karakter).',
        );
      });

      it('rejects ACCEPT_WITH_NOTE if checklist contains non-concessible critical safety defect (e.g. NO_EXPIRED_GAS_CYLINDER or NO_PEST_OR_ANIMAL_TRACE)', async () => {
        const criticalTx = {
          ...mockChecklistTx,
          warehouseProcesses: [
            {
              id: 'wp-crit-1',
              revision: 1,
              isCurrent: true,
              checklistItems: {
                version: 'GSP-PREUNLOAD-2026.1',
                items: createCanonical9PreunloadItems(
                  'NO_PEST_OR_ANIMAL_TRACE',
                  'Ditemukan hama / binatang di armada',
                ),
              },
            },
          ],
        };

        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          criticalTx,
        );
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
          criticalTx.warehouseProcesses[0],
        );

        await expect(
          warehouseService.submitChecklistDisposition(
            'tx-chk-disposition-1',
            {
              action: 'ACCEPT_WITH_NOTE',
              reason: 'Diterima oleh supervisor dengan dispensasi khusus',
              revision: 4,
            },
            mockUser,
          ),
        ).rejects.toThrow(
          'dilarang dikonsesi menurut kebijakan K3. Muatan harus DITOLAK (REJECT).',
        );
      });

      it('rejects ACCEPT_WITH_NOTE for vehicle leak (VEHICLE_NO_LEAK_GOOD)', async () => {
        const leakTx = {
          ...mockChecklistTx,
          warehouseProcesses: [
            {
              id: 'wp-leak-1',
              revision: 1,
              isCurrent: true,
              checklistItems: {
                version: 'GSP-PREUNLOAD-2026.1',
                items: createCanonical9PreunloadItems(
                  'VEHICLE_NO_LEAK_GOOD',
                  'Tangki armada mengalami kebocoran tetes',
                ),
              },
            },
          ],
        };

        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(leakTx);
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
          leakTx.warehouseProcesses[0],
        );

        await expect(
          warehouseService.submitChecklistDisposition(
            'tx-chk-disposition-1',
            {
              action: 'ACCEPT_WITH_NOTE',
              reason: 'Mencoba dispensasi kebocoran tangki',
              revision: 4,
            },
            mockUser,
          ),
        ).rejects.toThrow(
          'dilarang dikonsesi menurut kebijakan K3. Muatan harus DITOLAK (REJECT).',
        );
      });

      it('rejects ACCEPT_WITH_NOTE for broken seal (DOOR_SEAL_GOOD)', async () => {
        const sealTx = {
          ...mockChecklistTx,
          warehouseProcesses: [
            {
              id: 'wp-seal-1',
              revision: 1,
              isCurrent: true,
              checklistItems: {
                version: 'GSP-PREUNLOAD-2026.1',
                items: createCanonical9PreunloadItems(
                  'DOOR_SEAL_GOOD',
                  'Segel pintu putus sebelum pembongkaran',
                ),
              },
            },
          ],
        };

        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(sealTx);
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
          sealTx.warehouseProcesses[0],
        );

        await expect(
          warehouseService.submitChecklistDisposition(
            'tx-chk-disposition-1',
            {
              action: 'ACCEPT_WITH_NOTE',
              reason: 'Mencoba dispensasi segel putus',
              revision: 4,
            },
            mockUser,
          ),
        ).rejects.toThrow(
          'dilarang dikonsesi menurut kebijakan K3. Muatan harus DITOLAK (REJECT).',
        );
      });

      it('rejects ACCEPT_WITH_NOTE for CoA mismatch (COA_MATCHES_BATCH)', async () => {
        const coaTx = {
          ...mockChecklistTx,
          warehouseProcesses: [
            {
              id: 'wp-coa-1',
              revision: 1,
              isCurrent: true,
              checklistItems: {
                version: 'GSP-PREUNLOAD-2026.1',
                items: createCanonical9PreunloadItems(
                  'COA_MATCHES_BATCH',
                  'Nomor batch CoA tidak cocok dengan fisik',
                ),
              },
            },
          ],
        };

        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coaTx);
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
          coaTx.warehouseProcesses[0],
        );

        await expect(
          warehouseService.submitChecklistDisposition(
            'tx-chk-disposition-1',
            {
              action: 'ACCEPT_WITH_NOTE',
              reason: 'Mencoba dispensasi ketidaksesuaian CoA',
              revision: 4,
            },
            mockUser,
          ),
        ).rejects.toThrow(
          'dilarang dikonsesi menurut kebijakan K3. Muatan harus DITOLAK (REJECT).',
        );
      });

      it('rejects disposition submission if processType is NOT GSP', async () => {
        const gbbTx = {
          ...mockChecklistTx,
          processType: ProcessType.GBB,
        };
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(gbbTx);

        await expect(
          warehouseService.submitChecklistDisposition(
            'tx-gbb-1',
            { action: 'REJECT', reason: 'Alasan penolakan', revision: 4 },
            mockUser,
          ),
        ).rejects.toThrow('hanya berlaku untuk transaksi muatan GSP');
      });

      it('rejects disposition submission if status is NOT WAITING_GSP_CHECKLIST_DISPOSITION (e.g. QC_VEHICLE_PASSED)', async () => {
        const passedTx = {
          ...mockChecklistTx,
          status: TransactionStatus.QC_VEHICLE_PASSED,
        };
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          passedTx,
        );

        await expect(
          warehouseService.submitChecklistDisposition(
            'tx-passed-1',
            {
              action: 'ACCEPT_WITH_NOTE',
              reason: 'Alasan disposisi',
              revision: 4,
            },
            mockUser,
          ),
        ).rejects.toThrow('bukan WAITING_GSP_CHECKLIST_DISPOSITION');
      });

      it('rejects disposition submission if NOT_OK item is missing photo evidence', async () => {
        const noPhotoTx = {
          ...mockChecklistTx,
          warehouseProcesses: [
            {
              id: 'wp-nophoto-1',
              revision: 1,
              isCurrent: true,
              checklistItems: {
                version: 'GSP-PREUNLOAD-2026.1',
                items: createCanonical9PreunloadItems(
                  'CLEAN_VEHICLE',
                  'Bak kotor berdebu tebal',
                  null,
                ),
              },
            },
          ],
        };
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          noPhotoTx,
        );
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
          noPhotoTx.warehouseProcesses[0],
        );

        await expect(
          warehouseService.submitChecklistDisposition(
            'tx-chk-disposition-1',
            {
              action: 'ACCEPT_WITH_NOTE',
              reason: 'Disposisi dengan catatan',
              revision: 4,
            },
            mockUser,
          ),
        ).rejects.toThrow('wajib menyertakan bukti foto lampiran');
      });

      it('rejects startWarehouse if direct ACCEPT_WITH_NOTE attempts to bypass non-concessible safety rules', async () => {
        const startTx = {
          ...mockChecklistTx,
          status: TransactionStatus.QC_VEHICLE_PASSED,
          weighInAt: new Date(),
          grossWeight: 25000,
          warehouseProcesses: [],
        };
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(startTx);
        mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce({
          id: 'pa-valid-1',
          transactionId: 'tx-start-bypass',
          productCatalogId: 'cat-pac-1',
          status: 'RELEASE',
          result: QcResult.PASS,
          isVoided: false,
        });
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);

        await expect(
          warehouseService.startWarehouse(
            'tx-start-bypass',
            {
              suratJalanNumber: 'SJ-BYPASS-01',
              poNumber: 'PO-BYPASS-01',
              preUnloadChecklist: {
                items: validGspChecklist.items.map((i) =>
                  i.code === 'VEHICLE_NO_LEAK_GOOD'
                    ? {
                        code: i.code,
                        result: 'NOT_OK' as const,
                        notes: 'Tangki armada bocor',
                        photoUrl: VALID_PNG_DATA_URL,
                      }
                    : i,
                ),
              },
              checklistDisposition: {
                action: 'ACCEPT_WITH_NOTE',
                reason: 'Mencoba bypass via startWarehouse endpoint',
              },
            },
            mockUser,
          ),
        ).rejects.toThrow('dilarang dikonsesi menurut kebijakan K3');
      });

      it('P0-01: strictly blocks disposition if WAREHOUSE user has NO GSP access in database', async () => {
        const warehouseUserNoGsp: JwtPayloadUser = {
          id: 'user-wh-nogsp',
          role: 'WAREHOUSE',
          email: 'wh-gbb@gms.local',
        } as unknown as JwtPayloadUser;

        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          mockChecklistTx,
        );
        // DB access list is empty or only has GBB/GBJ (no GSP)
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GBB },
        ]);

        await expect(
          warehouseService.submitChecklistDisposition(
            'tx-chk-disposition-1',
            {
              action: 'ACCEPT_WITH_NOTE',
              reason: 'Diterima oleh operator gudang non-GSP',
              revision: 4,
            },
            warehouseUserNoGsp,
          ),
        ).rejects.toThrow('Akses gudang pengguna tidak mencakup proses GSP.');
      });

      it('P0-01: strictly blocks disposition if WAREHOUSE user has empty access list in database (fail-closed)', async () => {
        const warehouseUserEmpty: JwtPayloadUser = {
          id: 'user-wh-empty',
          role: 'WAREHOUSE',
          email: 'wh-empty@gms.local',
        } as unknown as JwtPayloadUser;

        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          mockChecklistTx,
        );
        // DB access list returns empty array
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce(
          [],
        );

        await expect(
          warehouseService.submitChecklistDisposition(
            'tx-chk-disposition-1',
            {
              action: 'ACCEPT_WITH_NOTE',
              reason: 'Diterima oleh operator gudang tanpa scope',
              revision: 4,
            },
            warehouseUserEmpty,
          ),
        ).rejects.toThrow('Akses gudang pengguna tidak mencakup proses GSP.');
      });

      it('P0-02: strictly rejects disposition if NOT_OK photo is a fake string or invalid magic bytes', async () => {
        const fakePhotoTx = {
          ...mockChecklistTx,
          warehouseProcesses: [
            {
              id: 'wp-fakephoto-1',
              revision: 1,
              isCurrent: true,
              checklistItems: {
                version: 'GSP-PREUNLOAD-2026.1',
                items: createCanonical9PreunloadItems(
                  'CLEAN_VEHICLE',
                  'Bak kotor berdebu',
                  'data:image/png;base64,fake', // invalid base64 / length < 64 bytes
                ),
              },
            },
          ],
        };

        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          fakePhotoTx,
        );
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
          fakePhotoTx.warehouseProcesses[0],
        );

        await expect(
          warehouseService.submitChecklistDisposition(
            'tx-chk-disposition-1',
            {
              action: 'ACCEPT_WITH_NOTE',
              reason: 'Diterima dengan foto palsu',
              revision: 4,
            },
            mockUser,
          ),
        ).rejects.toThrow(
          'Ukuran berkas foto bukti item CLEAN_VEHICLE terlalu kecil',
        );
      });

      it('P1-01: strictly rejects disposition if expected revision is missing or mismatched', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          mockChecklistTx,
        );

        await expect(
          warehouseService.submitChecklistDisposition(
            'tx-chk-disposition-1',
            {
              action: 'ACCEPT_WITH_NOTE',
              reason: 'Revisi salah',
              revision: 999, // Mismatched (tx.revision is 4)
            },
            mockUser,
          ),
        ).rejects.toThrow('versi revisi tidak cocok');
      });

      it('P1-02: strictly rejects disposition if pre-unload checklist has missing or malformed canonical items', async () => {
        const malformedTx = {
          ...mockChecklistTx,
          warehouseProcesses: [
            {
              id: 'wp-malformed-1',
              revision: 1,
              isCurrent: true,
              checklistItems: {
                version: 'GSP-PREUNLOAD-2026.1',
                items: [
                  {
                    code: 'CLEAN_VEHICLE',
                    result: 'NOT_OK',
                    notes: 'Hanya 1 item',
                  },
                ],
              },
            },
          ],
        };

        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          malformedTx,
        );
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
          malformedTx.warehouseProcesses[0],
        );

        await expect(
          warehouseService.submitChecklistDisposition(
            'tx-chk-disposition-1',
            {
              action: 'ACCEPT_WITH_NOTE',
              reason: 'Checklist tidak lengkap 9 item',
              revision: 4,
            },
            mockUser,
          ),
        ).rejects.toThrow('wajib tepat 9 item kanonikal');
      });

      it('P0: fail-closed photo persistence - rejects if filesystem write fails', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          mockChecklistTx,
        );
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
          mockChecklistTx.warehouseProcesses[0],
        );

        // Simulate disk write failure (e.g. disk full / EACCES)
        (fs.writeFileSync as jest.Mock).mockImplementationOnce(() => {
          throw new Error('ENOSPC: no space left on device');
        });

        await expect(
          warehouseService.submitChecklistDisposition(
            'tx-chk-disposition-1',
            {
              action: 'ACCEPT_WITH_NOTE',
              reason: 'Gagal tulis disk',
              revision: 4,
            },
            mockUser,
          ),
        ).rejects.toThrow('Gagal menyimpan berkas bukti foto ke server');
      });

      it('P0: fail-closed photo persistence - rejects and cleans up file if attachment DB record fails', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          mockChecklistTx,
        );
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
          mockChecklistTx.warehouseProcesses[0],
        );

        // Attachment DB create rejects
        mockPrismaService.attachment.create.mockRejectedValueOnce(
          new Error('DB connection drop during attachment insert'),
        );

        await expect(
          warehouseService.submitChecklistDisposition(
            'tx-chk-disposition-1',
            {
              action: 'ACCEPT_WITH_NOTE',
              reason: 'Gagal insert DB',
              revision: 4,
            },
            mockUser,
          ),
        ).rejects.toThrow('Gagal mencatat data lampiran bukti foto');
      });

      it('P0: de-duplication - reuses existing attachment when identical sha256 photo is already stored', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          mockChecklistTx,
        );
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
          mockChecklistTx.warehouseProcesses[0],
        );

        // Existing attachment with identical sha256, matching item code and revision
        mockPrismaService.attachment.findFirst.mockResolvedValueOnce({
          id: 'att-existing-sha256-1',
          transactionId: 'tx-chk-disposition-1',
          filePath: 'checklist-evidence/existing.png',
          originalName: 'CLEAN_VEHICLE_evidence.png',
          revision: 1,
        });

        const mockTxClient = {
          transaction: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue({
              ...mockChecklistTx,
              status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
            }),
          },
          warehouseProcess: {
            update: jest.fn().mockResolvedValue({}),
          },
          transactionStatusHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        };
        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClient),
        );

        const res = await warehouseService.submitChecklistDisposition(
          'tx-chk-disposition-1',
          {
            action: 'ACCEPT_WITH_NOTE',
            reason: 'Diterima dengan foto reuse',
            revision: 4,
          },
          mockUser,
        );

        expect(res.success).toBe(true);
        // create should NOT be called because deduplication found existing attachment
        expect(mockPrismaService.attachment.create).not.toHaveBeenCalled();
        // verify photoAttachmentId is saved to checklist
        const updateCall =
          mockTxClient.warehouseProcess.update.mock.calls[0][0];
        const savedItems = updateCall.data.checklistItems.items;
        const failedItem = savedItems.find(
          (i: any) => i.code === 'CLEAN_VEHICLE',
        );
        expect(failedItem.photoAttachmentId).toBe('att-existing-sha256-1');
        expect(failedItem.photoUrl).toBe(
          '/api/attachments/att-existing-sha256-1/download',
        );
      });

      it('P0: de-duplication - rejects reuse and creates fresh attachment if physical file is missing on disk', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          mockChecklistTx,
        );
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
          mockChecklistTx.warehouseProcesses[0],
        );

        // Existing attachment in DB, but file missing on disk
        mockPrismaService.attachment.findFirst.mockResolvedValueOnce({
          id: 'att-missing-file-1',
          transactionId: 'tx-chk-disposition-1',
          filePath: 'checklist-evidence/missing.png',
          originalName: 'CLEAN_VEHICLE_evidence.png',
          revision: 1,
        });

        // Simulate file missing on disk
        (fs.existsSync as jest.Mock).mockReturnValueOnce(false);

        const res = await warehouseService.submitChecklistDisposition(
          'tx-chk-disposition-1',
          {
            action: 'ACCEPT_WITH_NOTE',
            reason: 'Diterima - fallback tulis baru karena file fisik hilang',
            revision: 4,
          },
          mockUser,
        );

        expect(res.success).toBe(true);
        // fresh attachment MUST be created because physical file was missing
        expect(mockPrismaService.attachment.create).toHaveBeenCalled();
        expect(fs.writeFileSync).toHaveBeenCalled();
      });

      it('P0: de-duplication - rejects reuse if existing attachment item code does not match', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          mockChecklistTx,
        );
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
          mockChecklistTx.warehouseProcesses[0],
        );

        // Existing attachment with different item code (e.g. CONTAINER_SEAL_GOOD instead of CLEAN_VEHICLE)
        mockPrismaService.attachment.findFirst.mockResolvedValueOnce({
          id: 'att-different-item-1',
          transactionId: 'tx-chk-disposition-1',
          filePath: 'checklist-evidence/different.png',
          originalName: 'CONTAINER_SEAL_GOOD_evidence.png',
          revision: 1,
        });

        const res = await warehouseService.submitChecklistDisposition(
          'tx-chk-disposition-1',
          {
            action: 'ACCEPT_WITH_NOTE',
            reason: 'Diterima - buat bukti baru karena beda item code',
            revision: 4,
          },
          mockUser,
        );

        expect(res.success).toBe(true);
        expect(mockPrismaService.attachment.create).toHaveBeenCalled();
      });

      it('P0: de-duplication - rejects reuse if existing attachment revision does not match current checklist revision', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          mockChecklistTx,
        );
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
          mockChecklistTx.warehouseProcesses[0],
        );

        // Existing attachment with stale revision (e.g. 0 vs 1)
        mockPrismaService.attachment.findFirst.mockResolvedValueOnce({
          id: 'att-stale-rev-1',
          transactionId: 'tx-chk-disposition-1',
          filePath: 'checklist-evidence/stale.png',
          originalName: 'CLEAN_VEHICLE_evidence.png',
          revision: 0,
        });

        const res = await warehouseService.submitChecklistDisposition(
          'tx-chk-disposition-1',
          {
            action: 'ACCEPT_WITH_NOTE',
            reason: 'Diterima - buat bukti baru karena beda revisi',
            revision: 4,
          },
          mockUser,
        );

        expect(res.success).toBe(true);
        expect(mockPrismaService.attachment.create).toHaveBeenCalled();
      });

      it('P0: atomic transaction rollback - cleans up physical file when transaction fails after attachment created', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          mockChecklistTx,
        );
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
          mockChecklistTx.warehouseProcesses[0],
        );

        const mockTxClient = {
          attachment: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({
              id: 'att-rolled-back-1',
              filePath: 'checklist-evidence/test.png',
            }),
          },
          transaction: {
            updateMany: jest
              .fn()
              .mockRejectedValue(
                new Error(
                  'PostgreSQL foreign key / disk failure after attachment created',
                ),
              ),
          },
          warehouseProcess: {
            update: jest.fn(),
          },
          transactionStatusHistory: {
            create: jest.fn(),
          },
        };

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClient),
        );

        await expect(
          warehouseService.submitChecklistDisposition(
            'tx-chk-disposition-1',
            {
              action: 'ACCEPT_WITH_NOTE',
              reason:
                'Simulasi kegagalan transaksi setelah record Attachment dibuat',
              revision: 4,
            },
            mockUser,
          ),
        ).rejects.toThrow(
          'PostgreSQL foreign key / disk failure after attachment created',
        );

        // Verify physical file compensation cleanup was executed!
        expect(fs.unlinkSync).toHaveBeenCalled();
      });

      it('P0: retry after rollback - successfully creates fresh valid evidence without orphan conflict', async () => {
        // Step 1: Failed attempt cleans up physical file
        const txAttempt1 = createFreshMockChecklistTx();
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          txAttempt1,
        );
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
          txAttempt1.warehouseProcesses[0],
        );

        const failingTxClient = {
          attachment: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({
              id: 'att-first-attempt-rolled-back',
              filePath: 'checklist-evidence/first.png',
            }),
          },
          transaction: {
            updateMany: jest
              .fn()
              .mockRejectedValue(new Error('Simulated transient DB abort')),
          },
        };

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(failingTxClient),
        );

        await expect(
          warehouseService.submitChecklistDisposition(
            'tx-chk-disposition-1',
            {
              action: 'ACCEPT_WITH_NOTE',
              reason: 'Percobaan 1 yang gagal',
              revision: 4,
            },
            mockUser,
          ),
        ).rejects.toThrow('Simulated transient DB abort');

        expect(fs.unlinkSync).toHaveBeenCalled();

        // Step 2: Retry with identical photo succeeds and creates fresh valid attachment
        const txAttempt2 = createFreshMockChecklistTx();
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          txAttempt2,
        );
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
          txAttempt2.warehouseProcesses[0],
        );

        const successTxClient = {
          attachment: {
            findFirst: jest.fn().mockResolvedValue(null), // no orphan row exists because previous transaction rolled back
            create: jest.fn().mockResolvedValue({
              id: 'att-retry-success-1',
              filePath: 'checklist-evidence/retry.png',
            }),
          },
          transaction: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue({
              ...mockChecklistTx,
              status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
            }),
          },
          warehouseProcess: {
            update: jest.fn().mockResolvedValue({}),
          },
          transactionStatusHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(successTxClient),
        );

        const retryRes = await warehouseService.submitChecklistDisposition(
          'tx-chk-disposition-1',
          {
            action: 'ACCEPT_WITH_NOTE',
            reason: 'Percobaan 2 (retry) berhasil penuh',
            revision: 4,
          },
          mockUser,
        );

        expect(retryRes.success).toBe(true);
        expect(successTxClient.attachment.create).toHaveBeenCalled();
      });

      it('P0: validates existing attachment ID - strictly rejects if physical file is missing on disk', async () => {
        const existingAttTx = {
          ...mockChecklistTx,
          warehouseProcesses: [
            {
              id: 'wp-attid-1',
              revision: 1,
              isCurrent: true,
              checklistItems: {
                version: 'GSP-PREUNLOAD-2026.1',
                items: createCanonical9PreunloadItems(
                  'CLEAN_VEHICLE',
                  'Bak kotor dengan ID lampiran',
                  'att-existing-id-1',
                ),
              },
            },
          ],
        };

        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          existingAttTx,
        );
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
          existingAttTx.warehouseProcesses[0],
        );

        mockPrismaService.attachment.findFirst.mockResolvedValueOnce({
          id: 'att-existing-id-1',
          transactionId: 'tx-chk-disposition-1',
          filePath: 'checklist-evidence/ghost.png',
          originalName: 'CLEAN_VEHICLE_evidence.png',
          revision: 1,
        });

        // Simulate physical file missing
        (fs.existsSync as jest.Mock).mockReturnValue(false);

        await expect(
          warehouseService.submitChecklistDisposition(
            'tx-chk-disposition-1',
            {
              action: 'ACCEPT_WITH_NOTE',
              reason:
                'Disposisi dengan attachment ID yang filenya hilang di disk',
              revision: 4,
            },
            mockUser,
          ),
        ).rejects.toThrow('tidak ditemukan pada penyimpanan server');
      });

      it('P0: validates existing attachment ID - strictly rejects if item code mismatches', async () => {
        const existingAttTx = {
          ...mockChecklistTx,
          warehouseProcesses: [
            {
              id: 'wp-attid-2',
              revision: 1,
              isCurrent: true,
              checklistItems: {
                version: 'GSP-PREUNLOAD-2026.1',
                items: createCanonical9PreunloadItems(
                  'CLEAN_VEHICLE',
                  'Bak kotor dengan ID lampiran',
                  'att-wrong-item-1',
                ),
              },
            },
          ],
        };

        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          existingAttTx,
        );
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
          existingAttTx.warehouseProcesses[0],
        );

        mockPrismaService.attachment.findFirst.mockResolvedValueOnce({
          id: 'att-wrong-item-1',
          transactionId: 'tx-chk-disposition-1',
          filePath: 'checklist-evidence/seal.png',
          originalName: 'CONTAINER_SEAL_GOOD_evidence.png', // Mismatched item code
          revision: 1,
        });

        (fs.existsSync as jest.Mock).mockReturnValue(true);

        await expect(
          warehouseService.submitChecklistDisposition(
            'tx-chk-disposition-1',
            {
              action: 'ACCEPT_WITH_NOTE',
              reason: 'Disposisi dengan attachment ID dari item lain',
              revision: 4,
            },
            mockUser,
          ),
        ).rejects.toThrow('terikat pada item lain');
      });

      it('P0: validates existing attachment ID - strictly rejects if attachment revision is stale', async () => {
        const existingAttTx = {
          ...mockChecklistTx,
          warehouseProcesses: [
            {
              id: 'wp-attid-3',
              revision: 1,
              isCurrent: true,
              checklistItems: {
                version: 'GSP-PREUNLOAD-2026.1',
                items: createCanonical9PreunloadItems(
                  'CLEAN_VEHICLE',
                  'Bak kotor dengan ID lampiran',
                  'att-stale-rev-1',
                ),
              },
            },
          ],
        };

        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          existingAttTx,
        );
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
          existingAttTx.warehouseProcesses[0],
        );

        mockPrismaService.attachment.findFirst.mockResolvedValueOnce({
          id: 'att-stale-rev-1',
          transactionId: 'tx-chk-disposition-1',
          filePath: 'checklist-evidence/old.png',
          originalName: 'CLEAN_VEHICLE_evidence.png',
          revision: 0, // Stale revision (expected 1)
        });

        (fs.existsSync as jest.Mock).mockReturnValue(true);

        await expect(
          warehouseService.submitChecklistDisposition(
            'tx-chk-disposition-1',
            {
              action: 'ACCEPT_WITH_NOTE',
              reason: 'Disposisi dengan attachment ID dari revisi lama',
              revision: 4,
            },
            mockUser,
          ),
        ).rejects.toThrow('berasal dari revisi lama');
      });

      it('H-02: atomic audit log - uses prismaTx inside transaction and fails whole transaction if audit fails', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          mockChecklistTx,
        );
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
          mockChecklistTx.warehouseProcesses[0],
        );

        const mockTxClient = {
          transaction: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue({
              ...mockChecklistTx,
              status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
            }),
          },
          warehouseProcess: {
            update: jest.fn().mockResolvedValue({}),
          },
          transactionStatusHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        mockActivityLogsService.logActionStrict.mockRejectedValueOnce(
          new Error('Audit log DB failure inside transaction'),
        );

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClient),
        );

        await expect(
          warehouseService.submitChecklistDisposition(
            'tx-chk-disposition-1',
            {
              action: 'ACCEPT_WITH_NOTE',
              reason: 'Audit log fail test',
              revision: 4,
            },
            mockUser,
          ),
        ).rejects.toThrow('Audit log DB failure inside transaction');

        // Audit was invoked with prismaTx client for atomicity
        expect(mockActivityLogsService.logActionStrict).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'GSP_CHECKLIST_DISPOSITION_ACCEPT_WITH_NOTE',
          }),
          mockTxClient,
        );
      });
    });
  });
});
