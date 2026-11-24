import * as fs from 'fs';

jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  const mockPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);
  return {
    ...actualFs,
    existsSync: jest.fn().mockReturnValue(true),
    statSync: jest.fn().mockReturnValue({ size: 1024 }),
    writeFileSync: jest.fn(),
    unlinkSync: jest.fn(),
    mkdirSync: jest.fn(),
    readFileSync: jest.fn().mockReturnValue(mockPngBuffer),
  };
});
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
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
import { getOperationHistoryDurations } from '../reports/operation-history.util';

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

  const queuePaEvidence = (record: Record<string, unknown> | null) =>
    mockPrismaService.qcProductAnalysis.findMany.mockResolvedValueOnce(
      record ? [{ testRound: 1, revision: 1, isCurrent: true, ...record }] : [],
    );

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
        aggregate: jest.fn().mockResolvedValue({ _max: { revision: null } }),
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
    (fs.statSync as jest.Mock).mockReset();
    (fs.statSync as jest.Mock).mockReturnValue({ size: 1024 });
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
      queuePaEvidence({
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
      queuePaEvidence({
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
      queuePaEvidence({
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
      queuePaEvidence({
        id: 'pa-null-res',
        transactionId: 'tx-coal-res-null',
        productCatalogId: 'cat-coal-1',
        status: 'RELEASE',
        result: null,
        isVoided: false,
      });
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
      queuePaEvidence({
        id: 'pa-passed-res',
        transactionId: 'tx-coal-res-passed',
        productCatalogId: 'cat-coal-1',
        status: 'RELEASE',
        result: 'PASSED',
        isVoided: false,
      });
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
      queuePaEvidence({
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
      queuePaEvidence({
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
      queuePaEvidence(null);
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
      queuePaEvidence({
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
      queuePaEvidence({
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
      queuePaEvidence({
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
      queuePaEvidence({
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
      queuePaEvidence({
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
      queuePaEvidence({
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
        queuePaEvidence(mockPaRecord);
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
        queuePaEvidence(mockPaRecord);
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
        queuePaEvidence(mockPaRecord);
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
        queuePaEvidence(mockPaRecord);
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
        queuePaEvidence(mockPaRecord);
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
        queuePaEvidence(mockPaRecord);
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

    describe('COR-05: GSP Solar Catalog Rename & Authoritative ID Matching on startWarehouse (Mock Prisma Flow)', () => {
      it('permits startWarehouse for Solar PA_NOT_REQUIRED when catalog was renamed but productCatalogId matches authoritative master catalog', async () => {
        const renamedSolarTx = {
          id: 'tx-solar-renamed',
          status: TransactionStatus.PA_NOT_REQUIRED,
          processType: ProcessType.GSP,
          receiptUnit: WarehouseUnit.LITER,
          cargoType: 'Fuel',
          cargoSubType: 'Solar',
          productCatalogId: 'cat-solar-auth-1',
          grossWeight: 15000,
          weighInAt: new Date(),
          revision: 2,
          productCatalog: {
            id: 'cat-solar-auth-1',
            code: 'SOLAR-001',
            name: 'Solar Industri B35',
            category: 'Fuel',
            subCategory: 'B35',
            processType: 'GSP',
            isPaRequired: false,
            policyVersion: 'SOP-GSP-2026.1',
            isActive: true,
          },
        };

        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          renamedSolarTx,
        );
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);

        const mockTxClient = {
          transaction: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue({
              ...renamedSolarTx,
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
            create: jest.fn().mockResolvedValue({ id: 'wp-renamed-solar-1' }),
          },
          transactionStatusHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
          cb(mockTxClient),
        );

        const res = await warehouseService.startWarehouse(
          'tx-solar-renamed',
          validStartGspDto,
          mockUser,
        );

        expect(res.success).toBe(true);
        expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              id: 'tx-solar-renamed',
              status: {
                in: expect.arrayContaining([
                  'QC_VEHICLE_PASSED',
                  'PA_NOT_REQUIRED',
                ]),
              },
            }),
            data: expect.objectContaining({
              status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
            }),
          }),
        );
      });

      it('strictly blocks startWarehouse and aborts before mutative writes when productCatalogId mismatches catalog entity id', async () => {
        const idMismatchTx = {
          id: 'tx-solar-id-mismatch',
          status: TransactionStatus.PA_NOT_REQUIRED,
          processType: ProcessType.GSP,
          receiptUnit: WarehouseUnit.LITER,
          cargoType: 'Fuel',
          cargoSubType: 'Solar',
          productCatalogId: 'cat-solar-tx-id',
          grossWeight: 15000,
          weighInAt: new Date(),
          revision: 2,
          productCatalog: {
            id: 'cat-solar-different-id',
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
          idMismatchTx,
        );
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);

        const mockTxClient = {
          transaction: {
            updateMany: jest.fn(),
          },
          warehouseProcess: {
            create: jest.fn(),
          },
        };
        mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
          cb(mockTxClient),
        );

        await expect(
          warehouseService.startWarehouse(
            'tx-solar-id-mismatch',
            validStartGspDto,
            mockUser,
          ),
        ).rejects.toThrow(BadRequestException);

        expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
        expect(mockTxClient.transaction.updateMany).not.toHaveBeenCalled();
      });

      it('strictly blocks startWarehouse and aborts before mutative writes when renamed catalog is deactivated', async () => {
        const deactivatedRenamedTx = {
          id: 'tx-solar-renamed-inactive',
          status: TransactionStatus.PA_NOT_REQUIRED,
          processType: ProcessType.GSP,
          receiptUnit: WarehouseUnit.LITER,
          cargoType: 'Fuel',
          cargoSubType: 'Solar',
          productCatalogId: 'cat-solar-auth-1',
          grossWeight: 15000,
          weighInAt: new Date(),
          revision: 2,
          productCatalog: {
            id: 'cat-solar-auth-1',
            code: 'SOLAR-001',
            name: 'Solar Industri B35',
            category: 'Fuel',
            subCategory: 'B35',
            processType: 'GSP',
            isPaRequired: false,
            policyVersion: 'SOP-GSP-2026.1',
            isActive: false,
          },
        };

        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          deactivatedRenamedTx,
        );
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);

        const mockTxClient = {
          transaction: { updateMany: jest.fn() },
        };
        mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
          cb(mockTxClient),
        );

        await expect(
          warehouseService.startWarehouse(
            'tx-solar-renamed-inactive',
            validStartGspDto,
            mockUser,
          ),
        ).rejects.toThrow(BadRequestException);

        expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
        expect(mockTxClient.transaction.updateMany).not.toHaveBeenCalled();
      });

      it('strictly blocks startWarehouse and aborts before mutative writes when renamed catalog requires PA', async () => {
        const paRequiredRenamedTx = {
          id: 'tx-solar-renamed-pa-required',
          status: TransactionStatus.PA_NOT_REQUIRED,
          processType: ProcessType.GSP,
          receiptUnit: WarehouseUnit.LITER,
          cargoType: 'Fuel',
          cargoSubType: 'Solar',
          productCatalogId: 'cat-solar-auth-1',
          grossWeight: 15000,
          weighInAt: new Date(),
          revision: 2,
          productCatalog: {
            id: 'cat-solar-auth-1',
            code: 'SOLAR-001',
            name: 'Solar Industri B35',
            category: 'Fuel',
            subCategory: 'B35',
            processType: 'GSP',
            isPaRequired: true,
            policyVersion: 'SOP-GSP-2026.1',
            isActive: true,
          },
        };

        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          paRequiredRenamedTx,
        );
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);

        const mockTxClient = {
          transaction: { updateMany: jest.fn() },
        };
        mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
          cb(mockTxClient),
        );

        await expect(
          warehouseService.startWarehouse(
            'tx-solar-renamed-pa-required',
            validStartGspDto,
            mockUser,
          ),
        ).rejects.toThrow(BadRequestException);

        expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
        expect(mockTxClient.transaction.updateMany).not.toHaveBeenCalled();
      });
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
      expect(mockTxClient.warehouseProcess.findFirst).toHaveBeenCalledWith({
        where: { transactionId: 'tx-gsp-wh', isCurrent: true, endAt: null },
        orderBy: { revision: 'desc' },
      });
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
          attachment: mockPrismaService.attachment,
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
          attachment: mockPrismaService.attachment,
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

      it('COR-08: submitChecklistDisposition on ACCEPT_WITH_NOTE synchronizes Transaction.warehouseStartAt and WarehouseProcess.startAt with identical timestamp, and records decidedAt', async () => {
        const testStartTime = new Date('2026-11-18T10:00:00.000Z');
        jest.useFakeTimers().setSystemTime(testStartTime);

        try {
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
            attachment: mockPrismaService.attachment,
          };

          mockPrismaService.$transaction.mockImplementationOnce(
            async (cb: any) => cb(mockTxClient),
          );

          const res = await warehouseService.submitChecklistDisposition(
            'tx-chk-disposition-1',
            {
              action: 'ACCEPT_WITH_NOTE',
              reason: 'Disetujui bongkar dengan konsesi deviasi minor',
              revision: 4,
            },
            mockUser,
          );

          expect(res.success).toBe(true);

          const txUpdateData =
            mockTxClient.transaction.updateMany.mock.calls[0][0].data;
          const wpUpdateData =
            mockTxClient.warehouseProcess.update.mock.calls[0][0].data;

          expect(txUpdateData.warehouseStartAt).toEqual(testStartTime);
          expect(txUpdateData.warehouseStartById).toBe(mockUser.id);
          expect(wpUpdateData.startAt).toEqual(testStartTime);
          expect(wpUpdateData.startById).toBe(mockUser.id);
          expect(wpUpdateData.startAt).toEqual(txUpdateData.warehouseStartAt);
          expect(wpUpdateData.checklistItems.disposition.decidedAt).toBe(
            testStartTime.toISOString(),
          );
        } finally {
          jest.useRealTimers();
        }
      });

      it('COR-08: submitChecklistDisposition on REJECT leaves startAt and warehouseStartAt untouched', async () => {
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
          attachment: mockPrismaService.attachment,
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

        const txUpdateData =
          mockTxClient.transaction.updateMany.mock.calls[0][0].data;
        const wpUpdateData =
          mockTxClient.warehouseProcess.update.mock.calls[0][0].data;

        expect(txUpdateData).not.toHaveProperty('warehouseStartAt');
        expect(txUpdateData).not.toHaveProperty('warehouseStartById');
        expect(wpUpdateData).not.toHaveProperty('startAt');
        expect(wpUpdateData).not.toHaveProperty('startById');
        expect(wpUpdateData.checklistItems.disposition.action).toBe('REJECT');
      });

      it('COR-08: submitChecklistDisposition preserves existing tx.warehouseStartAt if already set', async () => {
        const existingStartTime = new Date('2026-11-18T09:45:00.000Z');
        const txWithExistingStart = {
          ...mockChecklistTx,
          warehouseStartAt: existingStartTime,
        };

        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          txWithExistingStart,
        );
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
          txWithExistingStart.warehouseProcesses[0],
        );
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);

        const mockTxClient = {
          transaction: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue({
              ...txWithExistingStart,
              status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
            }),
          },
          warehouseProcess: {
            findFirst: jest
              .fn()
              .mockResolvedValue(txWithExistingStart.warehouseProcesses[0]),
            update: jest.fn().mockResolvedValue({}),
          },
          transactionStatusHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
          attachment: mockPrismaService.attachment,
        };

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClient),
        );

        const res = await warehouseService.submitChecklistDisposition(
          'tx-chk-disposition-1',
          {
            action: 'ACCEPT_WITH_NOTE',
            reason: 'Disetujui bongkar dengan konsesi',
            revision: 4,
          },
          mockUser,
        );

        expect(res.success).toBe(true);

        const txUpdateData =
          mockTxClient.transaction.updateMany.mock.calls[0][0].data;
        const wpUpdateData =
          mockTxClient.warehouseProcess.update.mock.calls[0][0].data;

        expect(txUpdateData.warehouseStartAt).toEqual(existingStartTime);
        expect(wpUpdateData.startAt).toEqual(existingStartTime);
      });

      it('COR-08: deterministic full mock flow: 08:00 submission -> 10:00 concession -> 11:00 completion yields exactly 60 minutes warehouse duration', async () => {
        const tSubmission = new Date('2026-11-18T08:00:00.000Z');
        const tConcession = new Date('2026-11-18T10:00:00.000Z');
        const tCompletion = new Date('2026-11-18T11:00:00.000Z');

        jest.useFakeTimers().setSystemTime(tSubmission);

        const createdAttachments = new Map<string, any>();
        mockPrismaService.attachment.create.mockImplementation(
          async ({ data }: any) => {
            const att = {
              id: 'att-mock-created-1',
              ...data,
            };
            createdAttachments.set(att.id, att);
            return att;
          },
        );
        mockPrismaService.attachment.findFirst.mockImplementation(
          async ({ where }: any) => {
            if (where?.id && createdAttachments.has(where.id)) {
              return createdAttachments.get(where.id);
            }
            if (where?.id) {
              return {
                id: where.id,
                transactionId: where.transactionId || 'tx-deterministic-cor08',
                originalName: 'CLEAN_VEHICLE_test.png',
                revision: 1,
                filePath: 'checklist-evidence/test.png',
                isCurrent: true,
              };
            }
            return null;
          },
        );

        try {
          // --- Stage 1: Submit checklist for decision at 08:00 ---
          const initialTx = {
            id: 'tx-deterministic-cor08',
            status: TransactionStatus.QC_VEHICLE_PASSED,
            processType: ProcessType.GSP,
            receiptUnit: WarehouseUnit.LITER,
            cargoType: 'Chemical UTL',
            cargoSubType: 'PAC 280 AC',
            suratJalanNumber: 'SJ-2026-DET',
            poNumber: 'PO-2026-DET',
            revision: 1,
            weighInAt: new Date('2026-11-18T07:30:00.000Z'),
            grossWeight: 15000,
            productCatalogId: 'cat-pac-1',
            productCatalog: {
              id: 'cat-pac-1',
              code: 'CHEM-PAC',
              name: 'PAC 280 AC',
              processType: ProcessType.GSP,
              isActive: true,
              isPaRequired: true,
            },
            qcProductAnalyses: [
              {
                id: 'pa-1',
                transactionId: 'tx-deterministic-cor08',
                testRound: 1,
                productCatalogId: 'cat-pac-1',
                isCurrent: true,
                isVoided: false,
                result: QcResult.PASS,
                status: 'RELEASE',
              },
            ],
          };

          mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
            initialTx,
          );
          mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
            { processType: ProcessType.GSP },
          ]);
          mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce(
            initialTx.qcProductAnalyses[0],
          );
          mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
            _max: { revision: 0 },
          });

          let capturedCreatedProcess: any = null;
          let capturedTxAfterSubmission: any = null;

          const stage1MockTxClient = {
            warehouseProcess: {
              aggregate: jest.fn().mockResolvedValue({ _max: { revision: 0 } }),
              create: jest.fn().mockImplementation(async ({ data }: any) => {
                capturedCreatedProcess = {
                  id: 'wp-deterministic-1',
                  ...data,
                  createdAt: tSubmission,
                  isCurrent: true,
                  isVoided: false,
                };
                return capturedCreatedProcess;
              }),
            },
            transaction: {
              updateMany: jest
                .fn()
                .mockImplementation(async ({ data }: any) => {
                  capturedTxAfterSubmission = {
                    ...initialTx,
                    ...data,
                    revision: 2,
                  };
                  return { count: 1 };
                }),
              findUnique: jest
                .fn()
                .mockImplementation(async () => capturedTxAfterSubmission),
            },
            transactionStatusHistory: {
              create: jest.fn().mockResolvedValue({}),
            },
            attachment: mockPrismaService.attachment,
          };

          mockPrismaService.$transaction.mockImplementationOnce(
            async (cb: any) => cb(stage1MockTxClient),
          );

          await warehouseService.startWarehouse(
            initialTx.id,
            {
              suratJalanNumber: 'SJ-2026-DET',
              poNumber: 'PO-2026-DET',
              process: 'submit_checklist_for_decision',
              preUnloadChecklist: {
                items: createCanonical9PreunloadItems(
                  'CLEAN_VEHICLE',
                  'Temuan minor bak kotor',
                ),
              },
            },
            mockUser,
          );

          expect(capturedCreatedProcess).not.toBeNull();
          expect(capturedCreatedProcess.startAt).toEqual(tSubmission);
          expect(capturedCreatedProcess.createdAt).toEqual(tSubmission);
          expect(capturedTxAfterSubmission.status).toBe(
            TransactionStatus.WAITING_GSP_CHECKLIST_DISPOSITION,
          );

          // --- Stage 2: Concession approved at 10:00 ---
          jest.setSystemTime(tConcession);

          mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
            capturedTxAfterSubmission,
          );
          mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
            capturedCreatedProcess,
          );
          mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
            { processType: ProcessType.GSP },
          ]);

          let activeProcessAfterDisposition: any = {
            ...capturedCreatedProcess,
          };
          let activeTxAfterDisposition: any = { ...capturedTxAfterSubmission };

          const stage2MockTxClient = {
            transaction: {
              updateMany: jest
                .fn()
                .mockImplementation(async ({ data }: any) => {
                  activeTxAfterDisposition = {
                    ...activeTxAfterDisposition,
                    ...data,
                    revision: 3,
                  };
                  return { count: 1 };
                }),
              findUnique: jest
                .fn()
                .mockImplementation(async () => activeTxAfterDisposition),
            },
            warehouseProcess: {
              findFirst: jest
                .fn()
                .mockResolvedValue(activeProcessAfterDisposition),
              update: jest.fn().mockImplementation(async ({ data }: any) => {
                activeProcessAfterDisposition = {
                  ...activeProcessAfterDisposition,
                  ...data,
                };
                return activeProcessAfterDisposition;
              }),
            },
            transactionStatusHistory: {
              create: jest.fn().mockResolvedValue({}),
            },
            attachment: mockPrismaService.attachment,
          };

          mockPrismaService.$transaction.mockImplementationOnce(
            async (cb: any) => cb(stage2MockTxClient),
          );

          await warehouseService.submitChecklistDisposition(
            initialTx.id,
            {
              action: 'ACCEPT_WITH_NOTE',
              reason: 'Disetujui dengan konsesi pada pukul 10:00',
              revision: 2,
            },
            mockUser,
          );

          expect(activeTxAfterDisposition.status).toBe(
            TransactionStatus.WAREHOUSE_IN_PROGRESS,
          );
          expect(activeTxAfterDisposition.warehouseStartAt).toEqual(
            tConcession,
          );

          // --- Stage 3: Complete warehouse at 11:00 ---
          jest.setSystemTime(tCompletion);

          mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
            activeTxAfterDisposition,
          );
          mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
            { processType: ProcessType.GSP },
          ]);

          let finalProcess: any = { ...activeProcessAfterDisposition };
          let finalTx: any = { ...activeTxAfterDisposition };

          const stage3MockTxClient = {
            transaction: {
              updateMany: jest
                .fn()
                .mockImplementation(async ({ data }: any) => {
                  finalTx = {
                    ...finalTx,
                    ...data,
                    revision: 4,
                  };
                  return { count: 1 };
                }),
              findUnique: jest.fn().mockImplementation(async () => ({
                ...finalTx,
                warehouseProcesses: [finalProcess],
              })),
            },
            warehouseProcess: {
              findFirst: jest
                .fn()
                .mockResolvedValue(activeProcessAfterDisposition),
              update: jest.fn().mockImplementation(async ({ data }: any) => {
                finalProcess = {
                  ...finalProcess,
                  ...data,
                };
                return finalProcess;
              }),
            },
            transactionStatusHistory: {
              create: jest.fn().mockResolvedValue({}),
            },
          };

          mockPrismaService.$transaction.mockImplementationOnce(
            async (cb: any) => cb(stage3MockTxClient),
          );

          await warehouseService.completeWarehouse(
            initialTx.id,
            {
              receivedQuantity: '14500.000',
              condition: WarehouseCondition.GOOD,
            },
            mockUser,
          );

          // --- Stage 4: Evaluate with getOperationHistoryDurations ---
          const txForReport = {
            ...finalTx,
            gateInAt: new Date('2026-11-18T07:15:00.000Z'),
            weighInAt: new Date('2026-11-18T07:30:00.000Z'),
            warehouseProcesses: [finalProcess],
          };

          const durations = getOperationHistoryDurations(txForReport);

          // Invariant assertions:
          expect(finalTx.warehouseStartAt).toEqual(tConcession);
          expect(finalProcess.startAt).toEqual(tConcession);
          expect(finalProcess.startAt).toEqual(finalTx.warehouseStartAt);
          expect(finalProcess.endAt).toEqual(tCompletion);
          expect(finalTx.warehouseEndAt).toEqual(tCompletion);
          expect(finalProcess.createdAt).toEqual(tSubmission); // 08:00 preserved
          expect(finalProcess.checklistItems.disposition.decidedAt).toBe(
            tConcession.toISOString(),
          );

          // Operational duration must be exactly 60 minutes (10:00 to 11:00), NOT 180 minutes!
          expect(durations.warehouse).toBe(60);
          expect(durations.dataQuality).not.toContain(
            'PARTIAL_WAREHOUSE_TIMESTAMP',
          );
          expect(durations.dataQuality).not.toContain('INVERTED_TIMESTAMP');
        } finally {
          jest.useRealTimers();
        }
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
        queuePaEvidence({
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
          attachment: mockPrismaService.attachment,
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
          attachment: mockPrismaService.attachment,
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

    describe('COR-07: Consistent Checklist Revision Sourcing & Concurrency Protection', () => {
      const baseCoalTxCor07 = {
        id: 'tx-coal-cor07',
        status: TransactionStatus.QC_VEHICLE_PASSED,
        processType: ProcessType.GSP,
        receiptUnit: WarehouseUnit.KG,
        cargoType: 'Coal',
        cargoSubType: 'Batubara 5600-6000',
        weighInAt: new Date(),
        grossWeight: 25000,
        revision: 5, // Transaction counter is 5
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

      const mockPaRecordCor07 = {
        id: 'pa-coal-cor07',
        transactionId: 'tx-coal-cor07',
        productCatalogId: 'cat-coal-1',
        status: 'RELEASE',
        result: QcResult.PASS,
        isVoided: false,
      };

      it('Case A (Inconsistency Fix): tx.revision = 5, target checklist revision = 1, valid evidence with revision 1 is accepted', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTxCor07,
        );
        queuePaEvidence(mockPaRecordCor07);
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);

        // Preliminary aggregate: no existing warehouse process -> max revision is null
        mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
          _max: { revision: null },
        });

        // Attachment exists in DB matching target checklist revision 1
        mockPrismaService.attachment.findFirst.mockResolvedValue({
          id: 'att-rev-1-valid',
          transactionId: 'tx-coal-cor07',
          filePath: 'checklist-evidence/clean.png',
          originalName: 'CLEAN_VEHICLE_evidence.png',
          revision: 1, // matches target checklist revision 1
          isCurrent: true,
        });

        const mockTxClient = {
          attachment: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'att-rev-1-valid',
              transactionId: 'tx-coal-cor07',
              filePath: 'checklist-evidence/clean.png',
              originalName: 'CLEAN_VEHICLE_evidence.png',
              revision: 1,
              isCurrent: true,
            }),
          },
          warehouseProcess: {
            aggregate: jest
              .fn()
              .mockResolvedValue({ _max: { revision: null } }),
            create: jest
              .fn()
              .mockResolvedValue({ id: 'wp-new-1', revision: 1 }),
          },
          transaction: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue({
              ...baseCoalTxCor07,
              status: TransactionStatus.WAITING_GSP_CHECKLIST_DISPOSITION,
            }),
          },
          transactionStatusHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClient),
        );

        const failedChecklist = {
          items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) =>
            item.code === 'CLEAN_VEHICLE'
              ? {
                  code: item.code,
                  result: 'NOT_OK' as const,
                  notes: 'Bak kotor dengan residu oli tebal',
                  photoAttachmentId: 'att-rev-1-valid',
                }
              : {
                  code: item.code,
                  result: 'OK' as const,
                  notes: '',
                },
          ),
        };

        const res = await warehouseService.startWarehouse(
          'tx-coal-cor07',
          {
            suratJalanNumber: 'SJ-COR07-001',
            poNumber: 'PO-COR07-001',
            process: 'submit_checklist_for_decision',
            preUnloadChecklist: failedChecklist,
          },
          mockUser,
        );

        expect(res.status).toBe(
          TransactionStatus.WAITING_GSP_CHECKLIST_DISPOSITION,
        );
      });

      it('Case B (Stale Attachment Protection): target checklist revision = 2, attachment has stale revision = 1, strictly rejected', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.writeFileSync as jest.Mock).mockClear();
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTxCor07,
        );
        queuePaEvidence(mockPaRecordCor07);
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);

        // Preliminary aggregate: existing warehouse process has revision 1 -> target revision is 2
        mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
          _max: { revision: 1 },
        });

        // Attachment in DB has revision 1 (which is stale for target revision 2)
        mockPrismaService.attachment.findFirst.mockResolvedValueOnce({
          id: 'att-rev-1-stale',
          transactionId: 'tx-coal-cor07',
          filePath: 'checklist-evidence/clean.png',
          originalName: 'CLEAN_VEHICLE_evidence.png',
          revision: 1, // Stale!
          isCurrent: true,
        });

        const failedChecklist = {
          items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) =>
            item.code === 'CLEAN_VEHICLE'
              ? {
                  code: item.code,
                  result: 'NOT_OK' as const,
                  notes: 'Bak kotor dengan residu oli tebal',
                  photoAttachmentId: 'att-rev-1-stale',
                }
              : {
                  code: item.code,
                  result: 'OK' as const,
                  notes: '',
                },
          ),
        };

        await expect(
          warehouseService.startWarehouse(
            'tx-coal-cor07',
            {
              suratJalanNumber: 'SJ-COR07-002',
              poNumber: 'PO-COR07-002',
              process: 'submit_checklist_for_decision',
              preUnloadChecklist: failedChecklist,
            },
            mockUser,
          ),
        ).rejects.toThrow(
          expect.objectContaining({
            response: expect.objectContaining({
              errors: ['STALE_CHECKLIST_ATTACHMENT_REVISION'],
            }),
          }),
        );

        // Strict assertion: reject occurred in preliminary phase, 0 persistence transaction and 0 writes
        expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
        expect(fs.writeFileSync).not.toHaveBeenCalled();
        expect(mockPrismaService.attachment.create).not.toHaveBeenCalled();
        expect(
          mockPrismaService.warehouseProcess.create,
        ).not.toHaveBeenCalled();
      });

      it('Case C (Consistent Active Revision in Disposition): tx.revision = 5, active checklist revision = 1, valid evidence revision 1 accepted', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
          ...baseCoalTxCor07,
          status: TransactionStatus.WAITING_GSP_CHECKLIST_DISPOSITION,
        });
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);

        const failedChecklist = {
          items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) =>
            item.code === 'CLEAN_VEHICLE'
              ? {
                  code: item.code,
                  result: 'NOT_OK' as const,
                  notes: 'Kotoran ringan di pinggir bak',
                  photoAttachmentId: 'att-rev-1-valid',
                }
              : {
                  code: item.code,
                  result: 'OK' as const,
                  notes: '',
                },
          ),
        };

        // Active warehouseProcess has revision 1
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce({
          id: 'wp-chk-cor07',
          transactionId: 'tx-coal-cor07',
          revision: 1,
          isCurrent: true,
          checklistItems: failedChecklist,
        });

        // Attachment matches active checklist revision 1
        mockPrismaService.attachment.findFirst.mockResolvedValue({
          id: 'att-rev-1-valid',
          transactionId: 'tx-coal-cor07',
          filePath: 'checklist-evidence/clean.png',
          originalName: 'CLEAN_VEHICLE_evidence.png',
          revision: 1,
          isCurrent: true,
        });

        const mockTxClient = {
          attachment: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'att-rev-1-valid',
              transactionId: 'tx-coal-cor07',
              filePath: 'checklist-evidence/clean.png',
              originalName: 'CLEAN_VEHICLE_evidence.png',
              revision: 1,
              isCurrent: true,
            }),
          },
          transaction: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue({
              ...baseCoalTxCor07,
              status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
            }),
          },
          warehouseProcess: {
            update: jest
              .fn()
              .mockResolvedValue({ id: 'wp-chk-cor07', revision: 1 }),
          },
          transactionStatusHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClient),
        );

        const res = await warehouseService.submitChecklistDisposition(
          'tx-coal-cor07',
          {
            action: 'ACCEPT_WITH_NOTE',
            reason:
              'Diterima dengan catatan oleh PIC Gudang GSP untuk deviasi minor',
            revision: 5, // Matches tx.revision = 5
          },
          mockUser,
        );

        expect(res.success).toBe(true);
        expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              id: 'tx-coal-cor07',
              status: TransactionStatus.WAITING_GSP_CHECKLIST_DISPOSITION,
              revision: 5,
            }),
          }),
        );
      });

      it('Case D1 (Concurrency Protection in Path 1): preliminary target = 1 vs transaction target = 2 throws CONCURRENT_CHECKLIST_MODIFICATION_DETECTED with 0 writes', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.writeFileSync as jest.Mock).mockClear();
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTxCor07,
        );
        queuePaEvidence(mockPaRecordCor07);
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);

        // Preliminary aggregate: no process yet -> target is 1
        mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
          _max: { revision: null },
        });

        // Attachment matching preliminary revision 1
        mockPrismaService.attachment.findFirst.mockResolvedValue({
          id: 'att-rev-1-valid',
          transactionId: 'tx-coal-cor07',
          filePath: 'checklist-evidence/clean.png',
          originalName: 'CLEAN_VEHICLE_evidence.png',
          revision: 1,
          isCurrent: true,
        });

        // Inside $transaction, aggregate discovers another process was committed -> max revision is 1, nextRevision is 2!
        const mockTxClient = {
          attachment: {
            create: jest.fn(),
            findFirst: jest.fn(),
          },
          warehouseProcess: {
            aggregate: jest.fn().mockResolvedValue({ _max: { revision: 1 } }),
            create: jest.fn(),
          },
          transaction: {
            updateMany: jest.fn(),
            findUnique: jest.fn(),
          },
          transactionStatusHistory: {
            create: jest.fn(),
          },
        };

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClient),
        );

        const failedChecklist = {
          items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) =>
            item.code === 'CLEAN_VEHICLE'
              ? {
                  code: item.code,
                  result: 'NOT_OK' as const,
                  notes: 'Bak kotor residu oli',
                  photoAttachmentId: 'att-rev-1-valid',
                }
              : {
                  code: item.code,
                  result: 'OK' as const,
                  notes: '',
                },
          ),
        };

        await expect(
          warehouseService.startWarehouse(
            'tx-coal-cor07',
            {
              suratJalanNumber: 'SJ-COR07-003',
              poNumber: 'PO-COR07-003',
              process: 'submit_checklist_for_decision',
              preUnloadChecklist: failedChecklist,
            },
            mockUser,
          ),
        ).rejects.toThrow(
          expect.objectContaining({
            response: expect.objectContaining({
              errors: ['CONCURRENT_CHECKLIST_MODIFICATION_DETECTED'],
            }),
          }),
        );

        // Strict assertion: 0 writes occurred before abort
        expect(fs.writeFileSync).not.toHaveBeenCalled();
        expect(mockTxClient.attachment.create).not.toHaveBeenCalled();
        expect(mockTxClient.warehouseProcess.create).not.toHaveBeenCalled();
        expect(mockTxClient.transaction.updateMany).not.toHaveBeenCalled();
        expect(
          mockTxClient.transactionStatusHistory.create,
        ).not.toHaveBeenCalled();
      });

      it('Case D2 (Concurrency Protection in Path 2): direct start with all OK detects concurrent modification and aborts with 0 writes', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.writeFileSync as jest.Mock).mockClear();
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTxCor07,
        );
        queuePaEvidence(mockPaRecordCor07);
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);

        // Preliminary aggregate: no process yet -> target is 1
        mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
          _max: { revision: null },
        });

        // Inside $transaction, aggregate discovers concurrent process -> nextRevision is 2
        const mockTxClient = {
          warehouseProcess: {
            aggregate: jest.fn().mockResolvedValue({ _max: { revision: 1 } }),
            create: jest.fn(),
          },
          transaction: {
            updateMany: jest.fn(),
            findUnique: jest.fn(),
          },
          transactionStatusHistory: {
            create: jest.fn(),
          },
        };

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClient),
        );

        const allOkChecklist = {
          items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) => ({
            code: item.code,
            result: 'OK' as const,
            notes: '',
          })),
        };

        await expect(
          warehouseService.startWarehouse(
            'tx-coal-cor07',
            {
              suratJalanNumber: 'SJ-COR07-004',
              poNumber: 'PO-COR07-004',
              preUnloadChecklist: allOkChecklist,
            },
            mockUser,
          ),
        ).rejects.toThrow(
          expect.objectContaining({
            response: expect.objectContaining({
              errors: ['CONCURRENT_CHECKLIST_MODIFICATION_DETECTED'],
            }),
          }),
        );

        // Strict assertion: 0 writes occurred before abort
        expect(fs.writeFileSync).not.toHaveBeenCalled();
        expect(mockTxClient.warehouseProcess.create).not.toHaveBeenCalled();
        expect(mockTxClient.transaction.updateMany).not.toHaveBeenCalled();
        expect(
          mockTxClient.transactionStatusHistory.create,
        ).not.toHaveBeenCalled();
      });

      it('Case E1 (Path 1 Success with Data URI on High Counter tx.revision = 5): persists Data URI to filesystem and DB with target revision 1 and canonical URLs', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.writeFileSync as jest.Mock).mockClear();
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTxCor07,
        );
        queuePaEvidence(mockPaRecordCor07);
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);

        // Preliminary aggregate: no process yet -> target is 1
        mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
          _max: { revision: null },
        });

        const mockTxClient = {
          attachment: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({
              id: 'att-datauri-path1-id',
              transactionId: 'tx-coal-cor07',
              filePath: 'checklist-evidence/clean_datauri.png',
              originalName: 'CLEAN_VEHICLE_evidence.png',
              revision: 1,
              isCurrent: true,
            }),
          },
          warehouseProcess: {
            aggregate: jest
              .fn()
              .mockResolvedValue({ _max: { revision: null } }),
            create: jest
              .fn()
              .mockResolvedValue({ id: 'wp-path1-proc', revision: 1 }),
          },
          transaction: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue({
              ...baseCoalTxCor07,
              status: TransactionStatus.WAITING_GSP_CHECKLIST_DISPOSITION,
            }),
          },
          transactionStatusHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClient),
        );

        const dataUriChecklist = {
          items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) =>
            item.code === 'CLEAN_VEHICLE'
              ? {
                  code: item.code,
                  result: 'NOT_OK' as const,
                  notes: 'Kotoran oli tebal pada bak truk',
                  photoUrl: VALID_PNG_DATA_URL,
                }
              : {
                  code: item.code,
                  result: 'OK' as const,
                  notes: '',
                },
          ),
        };

        const res = await warehouseService.startWarehouse(
          'tx-coal-cor07',
          {
            suratJalanNumber: 'SJ-COR07-E1',
            poNumber: 'PO-COR07-E1',
            process: 'submit_checklist_for_decision',
            preUnloadChecklist: dataUriChecklist,
          },
          mockUser,
        );

        expect(res.status).toBe(
          TransactionStatus.WAITING_GSP_CHECKLIST_DISPOSITION,
        );

        // Verify physical file was written
        expect(fs.writeFileSync).toHaveBeenCalled();

        // Verify attachment created with target checklist revision 1
        expect(mockTxClient.attachment.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              transactionId: 'tx-coal-cor07',
              revision: 1,
              attachmentType: 'PHOTO',
              module: 'WAREHOUSE',
            }),
          }),
        );

        // Verify warehouseProcess created with canonical checklist, attachment ID, and canonical download URL
        expect(mockTxClient.warehouseProcess.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              transactionId: 'tx-coal-cor07',
              revision: 1,
              checklistItems: expect.objectContaining({
                overallResult: 'PENDING_DISPOSITION',
                items: expect.arrayContaining([
                  expect.objectContaining({
                    code: 'CLEAN_VEHICLE',
                    result: 'NOT_OK',
                    photoAttachmentId: 'att-datauri-path1-id',
                    photoUrl: '/api/attachments/att-datauri-path1-id/download',
                  }),
                ]),
              }),
            }),
          }),
        );

        // Verify CAS updateMany matched transaction counter 5
        expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              id: 'tx-coal-cor07',
              revision: 5,
              status: TransactionStatus.QC_VEHICLE_PASSED,
            }),
            data: expect.objectContaining({
              status: TransactionStatus.WAITING_GSP_CHECKLIST_DISPOSITION,
              revision: { increment: 1 },
            }),
          }),
        );
      });

      it('Case E2 (Path 2 Direct Start Success with Data URI on High Counter tx.revision = 5 via Concession): persists Data URI to filesystem and DB with target revision 1 and CONCESSION overallResult', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.writeFileSync as jest.Mock).mockClear();
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTxCor07,
        );
        queuePaEvidence(mockPaRecordCor07);
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);

        // Preliminary aggregate: no process yet -> target is 1
        mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
          _max: { revision: null },
        });

        const mockTxClient = {
          attachment: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({
              id: 'att-datauri-path2-id',
              transactionId: 'tx-coal-cor07',
              filePath: 'checklist-evidence/clean_concession.png',
              originalName: 'CLEAN_VEHICLE_evidence.png',
              revision: 1,
              isCurrent: true,
            }),
          },
          warehouseProcess: {
            aggregate: jest
              .fn()
              .mockResolvedValue({ _max: { revision: null } }),
            create: jest
              .fn()
              .mockResolvedValue({ id: 'wp-path2-proc', revision: 1 }),
          },
          transaction: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue({
              ...baseCoalTxCor07,
              status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
              warehouseStartBy: {
                id: mockUser.id,
                name: 'Admin',
                role: 'ADMIN',
              },
            }),
          },
          transactionStatusHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClient),
        );

        const dataUriChecklist = {
          items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) =>
            item.code === 'CLEAN_VEHICLE'
              ? {
                  code: item.code,
                  result: 'NOT_OK' as const,
                  notes: 'Kotoran debu luar ringan non-kritis',
                  photoUrl: VALID_PNG_DATA_URL,
                }
              : {
                  code: item.code,
                  result: 'OK' as const,
                  notes: '',
                },
          ),
        };

        const res = await warehouseService.startWarehouse(
          'tx-coal-cor07',
          {
            suratJalanNumber: 'SJ-COR07-E2',
            poNumber: 'PO-COR07-E2',
            preUnloadChecklist: dataUriChecklist,
            checklistDisposition: {
              action: 'ACCEPT_WITH_NOTE',
              reason: 'Dispensasi kotoran debu luar non-kritis disetujui PIC',
            },
          },
          mockUser,
        );

        expect(res.success).toBe(true);
        expect(res.data.status).toBe(TransactionStatus.WAREHOUSE_IN_PROGRESS);

        // Verify physical file was written
        expect(fs.writeFileSync).toHaveBeenCalled();

        // Verify attachment created with target checklist revision 1
        expect(mockTxClient.attachment.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              transactionId: 'tx-coal-cor07',
              revision: 1,
              attachmentType: 'PHOTO',
              module: 'WAREHOUSE',
            }),
          }),
        );

        // Verify warehouseProcess created with CONCESSION overallResult, canonical attachment ID, and disposition metadata
        expect(mockTxClient.warehouseProcess.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              transactionId: 'tx-coal-cor07',
              revision: 1,
              checklistItems: expect.objectContaining({
                overallResult: 'CONCESSION',
                items: expect.arrayContaining([
                  expect.objectContaining({
                    code: 'CLEAN_VEHICLE',
                    result: 'NOT_OK',
                    photoAttachmentId: 'att-datauri-path2-id',
                    photoUrl: '/api/attachments/att-datauri-path2-id/download',
                  }),
                ]),
                disposition: expect.objectContaining({
                  action: 'ACCEPT_WITH_NOTE',
                  reason:
                    'Dispensasi kotoran debu luar non-kritis disetujui PIC',
                }),
              }),
            }),
          }),
        );

        // Verify CAS updateMany matched transaction counter 5
        expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              id: 'tx-coal-cor07',
              revision: 5,
            }),
            data: expect.objectContaining({
              status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
              revision: { increment: 1 },
            }),
          }),
        );
      });

      it('Case E3 (Path 2 CAS Failure Triggers Cleanup): valid Data URI evidence triggers compensation cleanup of the exact newly written file when transaction CAS updateMany fails', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.writeFileSync as jest.Mock).mockClear();
        (fs.unlinkSync as jest.Mock).mockClear();
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTxCor07,
        );
        queuePaEvidence(mockPaRecordCor07);
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);

        // Preliminary aggregate: no process yet -> target is 1
        mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
          _max: { revision: null },
        });

        // Attachment client inside transaction creates an attachment before CAS fails
        const mockTxClient = {
          attachment: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({
              id: 'att-created-e3',
              filePath: 'checklist-evidence/new.png',
              revision: 1,
            }),
          },
          warehouseProcess: {
            aggregate: jest
              .fn()
              .mockResolvedValue({ _max: { revision: null } }),
            create: jest.fn(),
          },
          transaction: {
            // CAS fails: another transaction changed status or revision concurrently!
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            findUnique: jest.fn(),
          },
          transactionStatusHistory: {
            create: jest.fn(),
          },
        };

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClient),
        );

        const dataUriChecklist = {
          items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) =>
            item.code === 'CLEAN_VEHICLE'
              ? {
                  code: item.code,
                  result: 'NOT_OK' as const,
                  notes: 'Debu tebal pada dinding bak',
                  photoUrl: VALID_PNG_DATA_URL,
                }
              : {
                  code: item.code,
                  result: 'OK' as const,
                  notes: '',
                },
          ),
        };

        await expect(
          warehouseService.startWarehouse(
            'tx-coal-cor07',
            {
              suratJalanNumber: 'SJ-COR07-006',
              poNumber: 'PO-COR07-006',
              preUnloadChecklist: dataUriChecklist,
              checklistDisposition: {
                action: 'ACCEPT_WITH_NOTE',
                reason: 'Dispensasi debu luar non-kritis disetujui',
              },
            },
            mockUser,
          ),
        ).rejects.toThrow(ConflictException);

        // 1. Verify physical file was written
        expect(fs.writeFileSync).toHaveBeenCalled();
        const writtenCalls = (fs.writeFileSync as jest.Mock).mock.calls;
        const writtenFilePath = writtenCalls[writtenCalls.length - 1][0];

        // 2. Verify attachment record was attempted inside the transaction before CAS failed
        expect(mockTxClient.attachment.create).toHaveBeenCalled();

        // 3. Verify transaction CAS was attempted
        expect(mockTxClient.transaction.updateMany).toHaveBeenCalled();

        // 4. Verify compensation cleanup specifically requested unlinking the newly written file
        expect(fs.unlinkSync).toHaveBeenCalledWith(writtenFilePath);

        // 5. Verify warehouseProcess was NOT persisted
        expect(mockTxClient.warehouseProcess.create).not.toHaveBeenCalled();
      });

      it('Case E4 (Path 2 Direct Start with All OK on High Counter tx.revision = 5): succeeds normally with 0 photos when no concurrent modification', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.writeFileSync as jest.Mock).mockClear();
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTxCor07,
        );
        queuePaEvidence(mockPaRecordCor07);
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);

        // Preliminary aggregate: no process yet -> target is 1
        mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
          _max: { revision: null },
        });

        const mockTxClient = {
          warehouseProcess: {
            aggregate: jest
              .fn()
              .mockResolvedValue({ _max: { revision: null } }),
            create: jest.fn().mockResolvedValue({ id: 'wp-e4', revision: 1 }),
          },
          transaction: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue({
              ...baseCoalTxCor07,
              status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
              warehouseStartBy: {
                id: mockUser.id,
                name: 'Admin',
                role: 'ADMIN',
              },
            }),
          },
          transactionStatusHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClient),
        );

        const allOkChecklist = {
          items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) => ({
            code: item.code,
            result: 'OK' as const,
            notes: '',
          })),
        };

        const res = await warehouseService.startWarehouse(
          'tx-coal-cor07',
          {
            suratJalanNumber: 'SJ-COR07-005',
            poNumber: 'PO-COR07-005',
            preUnloadChecklist: allOkChecklist,
          },
          mockUser,
        );

        expect(res.success).toBe(true);
        expect(res.data.status).toBe(TransactionStatus.WAREHOUSE_IN_PROGRESS);
        expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              id: 'tx-coal-cor07',
              revision: 5,
            }),
          }),
        );
        expect(fs.writeFileSync).not.toHaveBeenCalled();
      });
    });

    describe('SEC-03: Backend Evidence Hardening & Input Confinement', () => {
      const baseCoalTxSec03 = {
        id: 'tx-coal-sec03',
        status: TransactionStatus.QC_VEHICLE_PASSED,
        processType: ProcessType.GSP,
        receiptUnit: WarehouseUnit.KG,
        cargoType: 'Coal',
        cargoSubType: 'Batubara 5600-6000',
        weighInAt: new Date(),
        grossWeight: 25000,
        revision: 5,
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

      const mockPaRecordSec03 = {
        id: 'pa-sec03-1',
        transactionId: 'tx-coal-sec03',
        status: 'RELEASE',
        result: 'PASS',
        productCatalogId: 'cat-coal-1',
        isVoided: false,
        releaseAt: new Date(),
      };

      it('SEC03-1 (Path 2 Direct Start with OK Item having Valid Data URI Photo): persists Data URI to filesystem and DB with target revision 1 and canonical URLs on all OK items', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.writeFileSync as jest.Mock).mockClear();
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTxSec03,
        );
        queuePaEvidence(mockPaRecordSec03);
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);
        mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
          _max: { revision: null },
        });

        const mockTxClient = {
          attachment: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({
              id: 'att-sec03-ok-1',
              transactionId: 'tx-coal-sec03',
              filePath: 'checklist-evidence/sec03_ok.png',
              originalName: 'CLEAN_VEHICLE_evidence.png',
              revision: 1,
            }),
          },
          warehouseProcess: {
            aggregate: jest
              .fn()
              .mockResolvedValue({ _max: { revision: null } }),
            create: jest
              .fn()
              .mockResolvedValue({ id: 'wp-sec03-1', revision: 1 }),
          },
          transaction: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue({
              ...baseCoalTxSec03,
              status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
              warehouseStartBy: {
                id: mockUser.id,
                name: 'Admin',
                role: 'ADMIN',
              },
            }),
          },
          transactionStatusHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClient),
        );

        const allOkWithPhotoChecklist = {
          items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) =>
            item.code === 'CLEAN_VEHICLE'
              ? {
                  code: item.code,
                  result: 'OK' as const,
                  notes: 'Kondisi kendaraan sangat bersih',
                  photoUrl: VALID_PNG_DATA_URL,
                }
              : {
                  code: item.code,
                  result: 'OK' as const,
                  notes: '',
                },
          ),
        };

        const res = await warehouseService.startWarehouse(
          'tx-coal-sec03',
          {
            suratJalanNumber: 'SJ-SEC03-001',
            poNumber: 'PO-SEC03-001',
            preUnloadChecklist: allOkWithPhotoChecklist,
          },
          mockUser,
        );

        expect(res.success).toBe(true);
        expect(res.data.status).toBe(TransactionStatus.WAREHOUSE_IN_PROGRESS);
        expect(fs.writeFileSync).toHaveBeenCalled();
        expect(mockTxClient.attachment.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              transactionId: 'tx-coal-sec03',
              module: 'WAREHOUSE',
              attachmentType: 'PHOTO',
              revision: 1,
            }),
          }),
        );
        expect(mockTxClient.warehouseProcess.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              checklistItems: expect.objectContaining({
                items: expect.arrayContaining([
                  expect.objectContaining({
                    code: 'CLEAN_VEHICLE',
                    result: 'OK',
                    photoAttachmentId: 'att-sec03-ok-1',
                    photoUrl: '/api/attachments/att-sec03-ok-1/download',
                  }),
                ]),
              }),
            }),
          }),
        );
      });

      it('SEC03-2 (Preliminary Rejection of OK Item with Corrupt Data URI Photo): rejects invalid magic bytes or size < 64 bytes with zero writes and no transaction', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTxSec03,
        );
        queuePaEvidence(mockPaRecordSec03);
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);
        mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
          _max: { revision: null },
        });

        (fs.writeFileSync as jest.Mock).mockClear();

        const corruptChecklist = {
          items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) =>
            item.code === 'CLEAN_VEHICLE'
              ? {
                  code: item.code,
                  result: 'OK' as const,
                  photoUrl: 'data:image/png;base64,ZmFrZWRhdGFidWZmZXI=',
                }
              : {
                  code: item.code,
                  result: 'OK' as const,
                  notes: '',
                },
          ),
        };

        await expect(
          warehouseService.startWarehouse(
            'tx-coal-sec03',
            {
              suratJalanNumber: 'SJ-SEC03-002',
              poNumber: 'PO-SEC03-002',
              preUnloadChecklist: corruptChecklist,
            },
            mockUser,
          ),
        ).rejects.toThrow(BadRequestException);

        expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
        expect(fs.writeFileSync).not.toHaveBeenCalled();
      });

      it('SEC03-3 (Preliminary Rejection of Oversized Data URI Photo > 10MB): rejects PHOTO_FILE_SIZE_EXCEEDED with zero writes and no transaction', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTxSec03,
        );
        queuePaEvidence(mockPaRecordSec03);
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);
        mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
          _max: { revision: null },
        });

        (fs.writeFileSync as jest.Mock).mockClear();

        const oversizedBuffer = Buffer.alloc(10 * 1024 * 1024 + 100);
        const oversizedDataUrl = `data:image/png;base64,${oversizedBuffer.toString('base64')}`;

        const oversizedChecklist = {
          items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) =>
            item.code === 'CLEAN_VEHICLE'
              ? {
                  code: item.code,
                  result: 'OK' as const,
                  photoUrl: oversizedDataUrl,
                }
              : {
                  code: item.code,
                  result: 'OK' as const,
                  notes: '',
                },
          ),
        };

        await expect(
          warehouseService.startWarehouse(
            'tx-coal-sec03',
            {
              suratJalanNumber: 'SJ-SEC03-003',
              poNumber: 'PO-SEC03-003',
              preUnloadChecklist: oversizedChecklist,
            },
            mockUser,
          ),
        ).rejects.toThrow(
          expect.objectContaining({
            response: expect.objectContaining({
              errors: ['PHOTO_FILE_SIZE_EXCEEDED'],
            }),
          }),
        );

        expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
        expect(fs.writeFileSync).not.toHaveBeenCalled();
      });

      it('SEC03-4 (Anti-Conflicting Reference Validation - Data URI + photoAttachmentId): rejects CONFLICTING_PHOTO_EVIDENCE when both are supplied', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTxSec03,
        );
        queuePaEvidence(mockPaRecordSec03);
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);
        mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
          _max: { revision: null },
        });

        const conflictingChecklist = {
          items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) =>
            item.code === 'CLEAN_VEHICLE'
              ? {
                  code: item.code,
                  result: 'NOT_OK' as const,
                  notes: 'Catatan temuan kerusakan bak',
                  photoAttachmentId: 'att-existing-1',
                  photoUrl: VALID_PNG_DATA_URL,
                }
              : {
                  code: item.code,
                  result: 'OK' as const,
                  notes: '',
                },
          ),
        };

        await expect(
          warehouseService.startWarehouse(
            'tx-coal-sec03',
            {
              suratJalanNumber: 'SJ-SEC03-004',
              poNumber: 'PO-SEC03-004',
              process: 'submit_checklist_for_decision',
              preUnloadChecklist: conflictingChecklist,
            },
            mockUser,
          ),
        ).rejects.toThrow(
          expect.objectContaining({
            response: expect.objectContaining({
              errors: ['CONFLICTING_PHOTO_EVIDENCE'],
            }),
          }),
        );

        expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      });

      it('SEC03-5 (Anti-Conflicting Reference Validation - ID Mismatch): rejects CONFLICTING_PHOTO_EVIDENCE when photoAttachmentId and photoUrl have different IDs', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTxSec03,
        );
        queuePaEvidence(mockPaRecordSec03);
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);
        mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
          _max: { revision: null },
        });

        const conflictingIdChecklist = {
          items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) =>
            item.code === 'CLEAN_VEHICLE'
              ? {
                  code: item.code,
                  result: 'NOT_OK' as const,
                  notes: 'Catatan temuan kerusakan bak',
                  photoAttachmentId: 'att-id-1',
                  photoUrl: '/api/attachments/att-id-2/download',
                }
              : {
                  code: item.code,
                  result: 'OK' as const,
                  notes: '',
                },
          ),
        };

        await expect(
          warehouseService.startWarehouse(
            'tx-coal-sec03',
            {
              suratJalanNumber: 'SJ-SEC03-005',
              poNumber: 'PO-SEC03-005',
              process: 'submit_checklist_for_decision',
              preUnloadChecklist: conflictingIdChecklist,
            },
            mockUser,
          ),
        ).rejects.toThrow(
          expect.objectContaining({
            response: expect.objectContaining({
              errors: ['CONFLICTING_PHOTO_EVIDENCE'],
            }),
          }),
        );

        expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      });

      it('SEC03-6 (Consistent Reference Validation - Canonical / Compat URL / Direct ID): accepts consistent references and normalizes to canonical /api/attachments/:id/download', async () => {
        const variants = [
          {
            name: 'canonical URL',
            url: '/api/attachments/att-consistent-1/download',
          },
          {
            name: 'compat URL',
            url: '/attachments/att-consistent-1/download',
          },
          { name: 'direct ID', url: 'att-consistent-1' },
        ];

        for (const variant of variants) {
          (fs.existsSync as jest.Mock).mockReturnValue(true);
          mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
            baseCoalTxSec03,
          );
          queuePaEvidence(mockPaRecordSec03);
          mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
            { processType: ProcessType.GSP },
          ]);
          mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
            _max: { revision: null },
          });

          // Preliminary lookup:
          mockPrismaService.attachment.findFirst.mockResolvedValueOnce({
            id: 'att-consistent-1',
            transactionId: 'tx-coal-sec03',
            module: 'WAREHOUSE',
            attachmentType: 'PHOTO',
            isCurrent: true,
            originalName: 'CLEAN_VEHICLE_evidence.png',
            revision: 1,
            filePath: 'checklist-evidence/consistent.png',
          });

          const mockTxClient = {
            attachment: {
              findFirst: jest.fn().mockResolvedValue({
                id: 'att-consistent-1',
                transactionId: 'tx-coal-sec03',
                module: 'WAREHOUSE',
                attachmentType: 'PHOTO',
                isCurrent: true,
                originalName: 'CLEAN_VEHICLE_evidence.png',
                revision: 1,
                filePath: 'checklist-evidence/consistent.png',
              }),
            },
            warehouseProcess: {
              aggregate: jest
                .fn()
                .mockResolvedValue({ _max: { revision: null } }),
              create: jest
                .fn()
                .mockResolvedValue({ id: 'wp-sec03-cons-1', revision: 1 }),
            },
            transaction: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              findUnique: jest.fn().mockResolvedValue({
                ...baseCoalTxSec03,
                status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
                warehouseStartBy: {
                  id: mockUser.id,
                  name: 'Admin',
                  role: 'ADMIN',
                },
              }),
            },
            transactionStatusHistory: {
              create: jest.fn().mockResolvedValue({}),
            },
          };

          mockPrismaService.$transaction.mockImplementationOnce(
            async (cb: any) => cb(mockTxClient),
          );

          const consistentChecklist = {
            items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) =>
              item.code === 'CLEAN_VEHICLE'
                ? {
                    code: item.code,
                    result: 'OK' as const,
                    notes: '',
                    photoAttachmentId: 'att-consistent-1',
                    photoUrl: variant.url,
                  }
                : {
                    code: item.code,
                    result: 'OK' as const,
                    notes: '',
                  },
            ),
          };

          const res = await warehouseService.startWarehouse(
            'tx-coal-sec03',
            {
              suratJalanNumber: 'SJ-SEC03-006',
              poNumber: 'PO-SEC03-006',
              preUnloadChecklist: consistentChecklist,
            },
            mockUser,
          );

          expect(res.success).toBe(true);
          expect(mockTxClient.warehouseProcess.create).toHaveBeenCalledWith(
            expect.objectContaining({
              data: expect.objectContaining({
                checklistItems: expect.objectContaining({
                  items: expect.arrayContaining([
                    expect.objectContaining({
                      code: 'CLEAN_VEHICLE',
                      photoAttachmentId: 'att-consistent-1',
                      photoUrl: '/api/attachments/att-consistent-1/download',
                    }),
                  ]),
                }),
              }),
            }),
          );
        }
      });

      it('SEC03-7 (Strict Format Enforcing & Rejection of Malicious/Loose URLs): table-driven rejection of external, protocol-relative, path traversal, query string, and string literals "null"/"undefined"', async () => {
        const testMatrix = [
          {
            desc: 'external URL',
            url: 'https://evil.com/api/attachments/att-1/download',
            attId: null,
            expectedError: 'INVALID_PHOTO_ATTACHMENT_FORMAT',
          },
          {
            desc: 'protocol-relative URL',
            url: '//evil.com/api/attachments/att-1/download',
            attId: null,
            expectedError: 'INVALID_PHOTO_ATTACHMENT_FORMAT',
          },
          {
            desc: 'path traversal URL',
            url: '/api/attachments/../secret/download',
            attId: null,
            expectedError: 'INVALID_PHOTO_ATTACHMENT_FORMAT',
          },
          {
            desc: 'query string URL',
            url: '/api/attachments/att-1/download?query=leak',
            attId: null,
            expectedError: 'INVALID_PHOTO_ATTACHMENT_FORMAT',
          },
          {
            desc: 'invalid chars in photoAttachmentId',
            url: null,
            attId: 'att@invalid!#',
            expectedError: 'INVALID_PHOTO_ATTACHMENT_FORMAT',
          },
          {
            desc: 'one field valid while other is invalid',
            url: 'https://evil.com',
            attId: 'att-valid-1',
            expectedError: 'INVALID_PHOTO_ATTACHMENT_FORMAT',
          },
          {
            desc: 'literal string "null"',
            url: null,
            attId: 'null',
            expectedError: 'INVALID_PHOTO_ATTACHMENT',
          },
          {
            desc: 'literal string "undefined"',
            url: null,
            attId: 'undefined',
            expectedError: 'INVALID_PHOTO_ATTACHMENT',
          },
        ];

        for (const itemCase of testMatrix) {
          mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
            baseCoalTxSec03,
          );
          queuePaEvidence(mockPaRecordSec03);
          mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
            { processType: ProcessType.GSP },
          ]);
          mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
            _max: { revision: null },
          });

          // For identifier lookup cases ("null" / "undefined"), mock returns null to simulate non-existing attachment
          mockPrismaService.attachment.findFirst.mockResolvedValueOnce(null);

          const invalidChecklist = {
            items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) =>
              item.code === 'CLEAN_VEHICLE'
                ? {
                    code: item.code,
                    result: 'OK' as const,
                    notes: '',
                    photoAttachmentId: itemCase.attId,
                    photoUrl: itemCase.url,
                  }
                : {
                    code: item.code,
                    result: 'OK' as const,
                    notes: '',
                  },
            ),
          };

          await expect(
            warehouseService.startWarehouse(
              'tx-coal-sec03',
              {
                suratJalanNumber: 'SJ-SEC03-007',
                poNumber: 'PO-SEC03-007',
                preUnloadChecklist: invalidChecklist,
              },
              mockUser,
            ),
          ).rejects.toThrow(
            expect.objectContaining({
              response: expect.objectContaining({
                errors: [itemCase.expectedError],
              }),
            }),
          );

          expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
        }
      });

      it('SEC03-8 (Scoped DB Lookup Fidelity): mock inspects where filter fields (transactionId, module: WAREHOUSE, attachmentType: PHOTO, isCurrent: true) and rejects if any scope mismatches, while positive control succeeds', async () => {
        const targetId = 'att-scoped-target-1';
        const validScopedRecord = {
          id: targetId,
          transactionId: 'tx-coal-sec03',
          module: 'WAREHOUSE',
          attachmentType: 'PHOTO',
          isCurrent: true,
          originalName: 'CLEAN_VEHICLE_scoped.png',
          revision: 1,
          filePath: 'checklist-evidence/scoped.png',
        };

        const mismatchCases = [
          {
            name: 'wrong module (SECURITY)',
            record: { ...validScopedRecord, module: 'SECURITY' },
          },
          {
            name: 'wrong attachmentType (DOCUMENT)',
            record: { ...validScopedRecord, attachmentType: 'DOCUMENT' },
          },
          {
            name: 'wrong transactionId (tx-other-999)',
            record: { ...validScopedRecord, transactionId: 'tx-other-999' },
          },
          {
            name: 'not current (isCurrent: false)',
            record: { ...validScopedRecord, isCurrent: false },
          },
        ];

        const scopedChecklist = {
          items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) =>
            item.code === 'CLEAN_VEHICLE'
              ? {
                  code: item.code,
                  result: 'OK' as const,
                  photoAttachmentId: targetId,
                }
              : {
                  code: item.code,
                  result: 'OK' as const,
                  notes: '',
                },
          ),
        };

        for (const tc of mismatchCases) {
          jest.clearAllMocks();
          mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
            baseCoalTxSec03,
          );
          queuePaEvidence(mockPaRecordSec03);
          mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
            { processType: ProcessType.GSP },
          ]);
          mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
            _max: { revision: null },
          });

          // Mock evaluates the query's where conditions against candidate record:
          // The candidate record has the requested ID, but differs in one scoped attribute.
          // If the query filters module: 'WAREHOUSE' but candidate is 'SECURITY', match fails -> null.
          // If the query were missing module filtering, match would succeed -> candidate returned.
          mockPrismaService.attachment.findFirst.mockImplementation(
            ({ where }: any) => {
              const matches =
                where?.id === tc.record.id &&
                (!where?.transactionId ||
                  where.transactionId === tc.record.transactionId) &&
                (!where?.module || where.module === tc.record.module) &&
                (!where?.attachmentType ||
                  where.attachmentType === tc.record.attachmentType) &&
                (where?.isCurrent === undefined ||
                  where.isCurrent === tc.record.isCurrent);
              return Promise.resolve(matches ? tc.record : null);
            },
          );

          await expect(
            warehouseService.startWarehouse(
              'tx-coal-sec03',
              {
                suratJalanNumber: 'SJ-SEC03-008',
                poNumber: 'PO-SEC03-008',
                preUnloadChecklist: scopedChecklist,
              },
              mockUser,
            ),
          ).rejects.toThrow(
            expect.objectContaining({
              response: expect.objectContaining({
                errors: ['INVALID_PHOTO_ATTACHMENT'],
              }),
            }),
          );

          // Assert that the query strictly required the scoped filters:
          expect(mockPrismaService.attachment.findFirst).toHaveBeenCalledWith({
            where: {
              id: targetId,
              transactionId: 'tx-coal-sec03',
              module: 'WAREHOUSE',
              attachmentType: 'PHOTO',
              isCurrent: true,
            },
          });
          expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
        }

        // Positive Control: candidate record matches all scope requirements
        jest.clearAllMocks();
        mockPrismaService.transaction.findUnique.mockResolvedValue(
          baseCoalTxSec03,
        );
        queuePaEvidence(mockPaRecordSec03);
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValue([
          { processType: ProcessType.GSP },
        ]);
        mockPrismaService.warehouseProcess.aggregate.mockResolvedValue({
          _max: { revision: null },
        });

        (fs.existsSync as jest.Mock).mockReturnValue(true);

        const mockTxClient: any = {
          warehouseProcess: {
            aggregate: jest
              .fn()
              .mockResolvedValue({ _max: { revision: null } }),
            create: jest
              .fn()
              .mockResolvedValue({ id: 'wp-sec03-ctrl', revision: 1 }),
          },
          transaction: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue({
              ...baseCoalTxSec03,
              status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
              warehouseStartBy: {
                id: mockUser.id,
                name: 'Admin',
                role: 'ADMIN',
              },
            }),
          },
          attachment: {
            findFirst: jest.fn().mockResolvedValue(validScopedRecord),
          },
          transactionStatusHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
          activityLog: {
            create: jest.fn().mockResolvedValue({ id: 'act-sec03-ctrl' }),
          },
        };
        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClient),
        );
        mockPrismaService.attachment.findFirst.mockResolvedValue(
          validScopedRecord,
        );

        const positiveResult = await warehouseService.startWarehouse(
          'tx-coal-sec03',
          {
            suratJalanNumber: 'SJ-SEC03-008',
            poNumber: 'PO-SEC03-008',
            preUnloadChecklist: scopedChecklist,
          },
          mockUser,
        );

        expect(positiveResult).toBeDefined();
        expect(mockPrismaService.attachment.findFirst).toHaveBeenCalledWith({
          where: {
            id: targetId,
            transactionId: 'tx-coal-sec03',
            module: 'WAREHOUSE',
            attachmentType: 'PHOTO',
            isCurrent: true,
          },
        });
        expect(mockTxClient.attachment.findFirst).toHaveBeenCalledWith({
          where: {
            id: targetId,
            transactionId: 'tx-coal-sec03',
            module: 'WAREHOUSE',
            attachmentType: 'PHOTO',
            isCurrent: true,
          },
        });
        expect(mockTxClient.warehouseProcess.create).toHaveBeenCalled();
      });

      it('SEC03-9 (Rejection of Missing or Invalid Metadata on Existing Attachment): table-driven rejection of missing originalName, stale revision, missing filePath, and missing disk file', async () => {
        const metadataCases = [
          {
            desc: 'missing originalName',
            record: {
              id: 'att-meta-1',
              transactionId: 'tx-coal-sec03',
              module: 'WAREHOUSE',
              attachmentType: 'PHOTO',
              isCurrent: true,
              originalName: null,
              revision: 1,
              filePath: 'checklist-evidence/file.png',
            },
            fileExists: true,
            expectedError: 'ATTACHMENT_ITEM_CODE_MISMATCH',
          },
          {
            desc: 'mismatched item code prefix in originalName',
            record: {
              id: 'att-meta-1',
              transactionId: 'tx-coal-sec03',
              module: 'WAREHOUSE',
              attachmentType: 'PHOTO',
              isCurrent: true,
              originalName: 'DOOR_SEAL_GOOD_file.png',
              revision: 1,
              filePath: 'checklist-evidence/file.png',
            },
            fileExists: true,
            expectedError: 'ATTACHMENT_ITEM_CODE_MISMATCH',
          },
          {
            desc: 'null revision',
            record: {
              id: 'att-meta-1',
              transactionId: 'tx-coal-sec03',
              module: 'WAREHOUSE',
              attachmentType: 'PHOTO',
              isCurrent: true,
              originalName: 'CLEAN_VEHICLE_file.png',
              revision: null,
              filePath: 'checklist-evidence/file.png',
            },
            fileExists: true,
            expectedError: 'STALE_CHECKLIST_ATTACHMENT_REVISION',
          },
          {
            desc: 'stale revision (rev 0 vs target 1)',
            record: {
              id: 'att-meta-1',
              transactionId: 'tx-coal-sec03',
              module: 'WAREHOUSE',
              attachmentType: 'PHOTO',
              isCurrent: true,
              originalName: 'CLEAN_VEHICLE_file.png',
              revision: 0,
              filePath: 'checklist-evidence/file.png',
            },
            fileExists: true,
            expectedError: 'STALE_CHECKLIST_ATTACHMENT_REVISION',
          },
          {
            desc: 'missing filePath',
            record: {
              id: 'att-meta-1',
              transactionId: 'tx-coal-sec03',
              module: 'WAREHOUSE',
              attachmentType: 'PHOTO',
              isCurrent: true,
              originalName: 'CLEAN_VEHICLE_file.png',
              revision: 1,
              filePath: '',
            },
            fileExists: true,
            expectedError: 'MISSING_PHYSICAL_PHOTO_FILE',
          },
          {
            desc: 'missing physical file on disk',
            record: {
              id: 'att-meta-1',
              transactionId: 'tx-coal-sec03',
              module: 'WAREHOUSE',
              attachmentType: 'PHOTO',
              isCurrent: true,
              originalName: 'CLEAN_VEHICLE_file.png',
              revision: 1,
              filePath: 'checklist-evidence/file.png',
            },
            fileExists: false,
            expectedError: 'MISSING_PHYSICAL_PHOTO_FILE',
          },
        ];

        for (const metaCase of metadataCases) {
          mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
            baseCoalTxSec03,
          );
          queuePaEvidence(mockPaRecordSec03);
          mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
            { processType: ProcessType.GSP },
          ]);
          mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
            _max: { revision: null },
          });

          (fs.existsSync as jest.Mock).mockReturnValue(metaCase.fileExists);
          mockPrismaService.attachment.findFirst.mockResolvedValueOnce(
            metaCase.record,
          );

          const metaChecklist = {
            items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) =>
              item.code === 'CLEAN_VEHICLE'
                ? {
                    code: item.code,
                    result: 'OK' as const,
                    photoAttachmentId: 'att-meta-1',
                  }
                : {
                    code: item.code,
                    result: 'OK' as const,
                    notes: '',
                  },
            ),
          };

          await expect(
            warehouseService.startWarehouse(
              'tx-coal-sec03',
              {
                suratJalanNumber: 'SJ-SEC03-009',
                poNumber: 'PO-SEC03-009',
                preUnloadChecklist: metaChecklist,
              },
              mockUser,
            ),
          ).rejects.toThrow(
            expect.objectContaining({
              response: expect.objectContaining({
                errors: [metaCase.expectedError],
              }),
            }),
          );

          expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
        }
      });

      it('SEC03-10 (Atomicity & Multi-Item Failure on Preliminary Check): Item 1 valid Data URI + Item 2 invalid notes/photo fails before transaction with zero writes', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTxSec03,
        );
        queuePaEvidence(mockPaRecordSec03);
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);
        mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
          _max: { revision: null },
        });

        (fs.writeFileSync as jest.Mock).mockClear();

        const multiItemFailChecklist = {
          items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) => {
            if (item.code === 'CLEAN_VEHICLE') {
              return {
                code: item.code,
                result: 'OK' as const,
                photoUrl: VALID_PNG_DATA_URL,
              };
            }
            if (item.code === 'DOOR_SEAL_GOOD') {
              return {
                code: item.code,
                result: 'NOT_OK' as const,
                notes: 'bad', // length 3 < 5
                photoUrl: VALID_PNG_DATA_URL,
              };
            }
            return {
              code: item.code,
              result: 'OK' as const,
              notes: '',
            };
          }),
        };

        await expect(
          warehouseService.startWarehouse(
            'tx-coal-sec03',
            {
              suratJalanNumber: 'SJ-SEC03-010',
              poNumber: 'PO-SEC03-010',
              process: 'submit_checklist_for_decision',
              preUnloadChecklist: multiItemFailChecklist,
            },
            mockUser,
          ),
        ).rejects.toThrow(
          expect.objectContaining({
            response: expect.objectContaining({
              errors: ['PREUNLOAD_CHECKLIST_MISSING_NOTES'],
            }),
          }),
        );

        expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
        expect(fs.writeFileSync).not.toHaveBeenCalled();
      });

      it('SEC03-11 (Path 1 Submit for Decision with Mixed OK & NOT_OK Items Carrying Photos): persists both photos with target revision 1 and canonical download URLs', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.writeFileSync as jest.Mock).mockClear();
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTxSec03,
        );
        queuePaEvidence(mockPaRecordSec03);
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);
        mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
          _max: { revision: null },
        });

        let createdCount = 0;
        const mockTxClient = {
          attachment: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation(async ({ data }: any) => {
              createdCount++;
              return {
                id: `att-mixed-${createdCount}`,
                transactionId: 'tx-coal-sec03',
                filePath: data.filePath,
                originalName: data.originalName,
                revision: data.revision,
              };
            }),
          },
          warehouseProcess: {
            aggregate: jest
              .fn()
              .mockResolvedValue({ _max: { revision: null } }),
            create: jest
              .fn()
              .mockResolvedValue({ id: 'wp-sec03-mixed', revision: 1 }),
          },
          transaction: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue({
              ...baseCoalTxSec03,
              status: TransactionStatus.WAITING_GSP_CHECKLIST_DISPOSITION,
            }),
          },
          transactionStatusHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClient),
        );

        const mixedChecklist = {
          items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) => {
            if (item.code === 'CLEAN_VEHICLE') {
              return {
                code: item.code,
                result: 'NOT_OK' as const,
                notes: 'Temuan oli rembes di samping tangki',
                photoUrl: VALID_PNG_DATA_URL,
              };
            }
            if (item.code === 'DOOR_SEAL_GOOD') {
              return {
                code: item.code,
                result: 'OK' as const,
                notes: 'Seal pintu dalam kondisi baik terverifikasi',
                photoUrl: VALID_PNG_DATA_URL,
              };
            }
            return {
              code: item.code,
              result: 'OK' as const,
              notes: '',
            };
          }),
        };

        const res = await warehouseService.startWarehouse(
          'tx-coal-sec03',
          {
            suratJalanNumber: 'SJ-SEC03-011',
            poNumber: 'PO-SEC03-011',
            process: 'submit_checklist_for_decision',
            preUnloadChecklist: mixedChecklist,
          },
          mockUser,
        );

        expect(res.status).toBe(
          TransactionStatus.WAITING_GSP_CHECKLIST_DISPOSITION,
        );
        expect(mockTxClient.attachment.create).toHaveBeenCalledTimes(2);
        expect(mockTxClient.warehouseProcess.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              checklistItems: expect.objectContaining({
                items: expect.arrayContaining([
                  expect.objectContaining({
                    code: 'CLEAN_VEHICLE',
                    result: 'NOT_OK',
                    photoAttachmentId: 'att-mixed-1',
                    photoUrl: '/api/attachments/att-mixed-1/download',
                  }),
                  expect.objectContaining({
                    code: 'DOOR_SEAL_GOOD',
                    result: 'OK',
                    photoAttachmentId: 'att-mixed-2',
                    photoUrl: '/api/attachments/att-mixed-2/download',
                  }),
                ]),
              }),
            }),
          }),
        );
      });

      it('SEC03-12 (Disposition with Photo on OK Item): verifies and canonicalizes photo on OK item during disposition', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        const mockWaitingTx = {
          id: 'tx-chk-disposition-sec03',
          status: TransactionStatus.WAITING_GSP_CHECKLIST_DISPOSITION,
          processType: ProcessType.GSP,
          receiptUnit: WarehouseUnit.KG,
          cargoType: 'Coal',
          cargoSubType: 'Batubara 5600-6000',
          revision: 4,
          productCatalogId: 'cat-coal-1',
          warehouseProcesses: [
            {
              id: 'wp-proc-sec03-1',
              transactionId: 'tx-chk-disposition-sec03',
              revision: 1,
              checklistItems: {
                version: GSP_PREUNLOAD_VERSION,
                overallResult: 'PENDING_DISPOSITION',
                items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) =>
                  item.code === 'CLEAN_VEHICLE'
                    ? {
                        code: item.code,
                        result: 'NOT_OK',
                        notes: 'Debu luar batubara ringan',
                        photoUrl: '/api/attachments/att-old-1/download',
                        photoAttachmentId: 'att-old-1',
                      }
                    : {
                        code: item.code,
                        result: 'OK',
                        notes: null,
                        photoUrl: null,
                        photoAttachmentId: null,
                      },
                ),
              },
            },
          ],
        };

        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          mockWaitingTx,
        );
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);
        mockPrismaService.warehouseProcess.findFirst.mockResolvedValueOnce(
          mockWaitingTx.warehouseProcesses[0],
        );

        // Preliminary check existing attachment lookup:
        mockPrismaService.attachment.findFirst.mockResolvedValueOnce({
          id: 'att-old-1',
          transactionId: 'tx-chk-disposition-sec03',
          module: 'WAREHOUSE',
          attachmentType: 'PHOTO',
          isCurrent: true,
          originalName: 'CLEAN_VEHICLE_evidence.png',
          revision: 1,
          filePath: 'checklist-evidence/old.png',
        });

        const mockTxClient = {
          attachment: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'att-old-1',
              transactionId: 'tx-chk-disposition-sec03',
              module: 'WAREHOUSE',
              attachmentType: 'PHOTO',
              isCurrent: true,
              originalName: 'CLEAN_VEHICLE_evidence.png',
              revision: 1,
              filePath: 'checklist-evidence/old.png',
            }),
            create: jest.fn().mockResolvedValue({
              id: 'att-disp-ok-new',
              filePath: 'checklist-evidence/disp_ok.png',
              originalName: 'DOOR_SEAL_GOOD_evidence.png',
              revision: 1,
            }),
          },
          transaction: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue({
              ...mockWaitingTx,
              status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
            }),
          },
          warehouseProcess: {
            findFirst: jest
              .fn()
              .mockResolvedValue(mockWaitingTx.warehouseProcesses[0]),
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
          'tx-chk-disposition-sec03',
          {
            action: 'ACCEPT_WITH_NOTE',
            reason: 'Diterima dispensasi oleh PIC Gudang',
            revision: 4,
          },
          mockUser,
        );

        expect(res.success).toBe(true);
        expect(mockTxClient.warehouseProcess.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'wp-proc-sec03-1' },
            data: expect.objectContaining({
              checklistItems: expect.objectContaining({
                overallResult: 'CONCESSION',
                disposition: expect.objectContaining({
                  action: 'ACCEPT_WITH_NOTE',
                }),
              }),
            }),
          }),
        );
      });

      it('SEC03-13 (Transaction Client Isolation): fails with ATTACHMENT_SERVICE_UNAVAILABLE without fallback to this.prisma when prismaTx.attachment is missing', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTxSec03,
        );
        queuePaEvidence(mockPaRecordSec03);
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);
        mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
          _max: { revision: null },
        });

        // Outside client this.prisma.attachment has create mock
        mockPrismaService.attachment.create.mockClear();

        const mockTxClientWithoutAttachment = {
          // prismaTx explicitly lacks attachment capability
          warehouseProcess: {
            aggregate: jest
              .fn()
              .mockResolvedValue({ _max: { revision: null } }),
            create: jest.fn().mockResolvedValue({ id: 'wp-1', revision: 1 }),
          },
          transaction: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          transactionStatusHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClientWithoutAttachment),
        );

        const allOkWithPhotoChecklist = {
          items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) =>
            item.code === 'CLEAN_VEHICLE'
              ? {
                  code: item.code,
                  result: 'OK' as const,
                  photoUrl: VALID_PNG_DATA_URL,
                }
              : {
                  code: item.code,
                  result: 'OK' as const,
                  notes: '',
                },
          ),
        };

        await expect(
          warehouseService.startWarehouse(
            'tx-coal-sec03',
            {
              suratJalanNumber: 'SJ-SEC03-013',
              poNumber: 'PO-SEC03-013',
              preUnloadChecklist: allOkWithPhotoChecklist,
            },
            mockUser,
          ),
        ).rejects.toThrow(
          expect.objectContaining({
            response: expect.objectContaining({
              errors: ['ATTACHMENT_SERVICE_UNAVAILABLE'],
            }),
          }),
        );

        // Crucial isolation assertion: this.prisma.attachment was NEVER called as fallback
        expect(mockPrismaService.attachment.create).not.toHaveBeenCalled();
      });

      it('SEC03-14 (Fail-Closed Persistence): fails with ATTACHMENT_SERVICE_UNAVAILABLE and cleans up created file when client.attachment.create is missing', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.writeFileSync as jest.Mock).mockClear();
        (fs.unlinkSync as jest.Mock).mockClear();

        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTxSec03,
        );
        queuePaEvidence(mockPaRecordSec03);
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);
        mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
          _max: { revision: null },
        });

        const mockTxClient = {
          attachment: {
            findFirst: jest.fn().mockResolvedValue(null),
            // create is undefined
          },
          warehouseProcess: {
            aggregate: jest
              .fn()
              .mockResolvedValue({ _max: { revision: null } }),
            create: jest.fn().mockResolvedValue({ id: 'wp-1', revision: 1 }),
          },
          transaction: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          transactionStatusHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClient),
        );

        const allOkWithPhotoChecklist = {
          items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) =>
            item.code === 'CLEAN_VEHICLE'
              ? {
                  code: item.code,
                  result: 'OK' as const,
                  photoUrl: VALID_PNG_DATA_URL,
                }
              : {
                  code: item.code,
                  result: 'OK' as const,
                  notes: '',
                },
          ),
        };

        await expect(
          warehouseService.startWarehouse(
            'tx-coal-sec03',
            {
              suratJalanNumber: 'SJ-SEC03-014',
              poNumber: 'PO-SEC03-014',
              preUnloadChecklist: allOkWithPhotoChecklist,
            },
            mockUser,
          ),
        ).rejects.toThrow(
          expect.objectContaining({
            response: expect.objectContaining({
              errors: ['ATTACHMENT_SERVICE_UNAVAILABLE'],
            }),
          }),
        );

        // Verify written file was cleaned up
        expect(fs.writeFileSync).toHaveBeenCalled();
        expect(fs.unlinkSync).toHaveBeenCalled();
      });

      it('SEC03-15 (Compensation Cleanup Targets ONLY Newly Created Files): compensation unlinks ONLY newly created files, leaving reused deduplicated files untouched', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.writeFileSync as jest.Mock).mockClear();
        (fs.unlinkSync as jest.Mock).mockClear();

        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTxSec03,
        );
        queuePaEvidence(mockPaRecordSec03);
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);
        mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
          _max: { revision: null },
        });

        // Deduplication returns existing attachment for Item 1
        (fs.readFileSync as jest.Mock).mockImplementation(() =>
          Buffer.from(VALID_PNG_DATA_URL.split(',')[1], 'base64'),
        );

        const mockTxClient = {
          attachment: {
            findFirst: jest
              .fn()
              .mockImplementationOnce(async () => ({
                id: 'att-reused-existing-1',
                transactionId: 'tx-coal-sec03',
                module: 'WAREHOUSE',
                attachmentType: 'PHOTO',
                originalName: 'CLEAN_VEHICLE_evidence.png',
                filePath: 'checklist-evidence/reused_existing.png',
                revision: 1,
              }))
              .mockImplementationOnce(async () => null), // Item 2 has no duplicate -> creates new
            create: jest.fn().mockResolvedValue({
              id: 'att-item2-new',
              transactionId: 'tx-coal-sec03',
              filePath: 'checklist-evidence/item2_new.png',
              originalName: 'DOOR_SEAL_GOOD_evidence.png',
              revision: 1,
            }),
          },
          warehouseProcess: {
            aggregate: jest
              .fn()
              .mockResolvedValue({ _max: { revision: null } }),
            create: jest.fn().mockResolvedValue({ id: 'wp-1', revision: 1 }),
          },
          transaction: {
            // CAS update fails!
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
          transactionStatusHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClient),
        );

        const twoPhotoChecklist = {
          items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) => {
            if (item.code === 'CLEAN_VEHICLE') {
              return {
                code: item.code,
                result: 'OK' as const,
                photoUrl: VALID_PNG_DATA_URL,
              };
            }
            if (item.code === 'DOOR_SEAL_GOOD') {
              return {
                code: item.code,
                result: 'OK' as const,
                photoUrl: VALID_PNG_DATA_URL,
              };
            }
            return {
              code: item.code,
              result: 'OK' as const,
              notes: '',
            };
          }),
        };

        await expect(
          warehouseService.startWarehouse(
            'tx-coal-sec03',
            {
              suratJalanNumber: 'SJ-SEC03-015',
              poNumber: 'PO-SEC03-015',
              preUnloadChecklist: twoPhotoChecklist,
            },
            mockUser,
          ),
        ).rejects.toThrow(ConflictException);

        // Crucial cleanup assertion: fs.writeFileSync was called only once (for Item 2)
        expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
        const writtenFilePath = (fs.writeFileSync as jest.Mock).mock
          .calls[0][0];

        // Crucial compensation assertion: fs.unlinkSync is called EXACTLY ONCE with the new file path,
        // proving that the reused file 'checklist-evidence/reused_existing.png' was NEVER targeted!
        expect(fs.unlinkSync).toHaveBeenCalledTimes(1);
        expect(fs.unlinkSync).toHaveBeenCalledWith(writtenFilePath);
        expect(fs.unlinkSync).not.toHaveBeenCalledWith(
          expect.stringContaining('reused_existing.png'),
        );
      });

      it('SEC03-16 (Preliminary Attachment Service Unavailable): rejects with ATTACHMENT_SERVICE_UNAVAILABLE and performs zero writes when attachment.findFirst is missing on preliminary check', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTxSec03,
        );
        queuePaEvidence(mockPaRecordSec03);
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);
        mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
          _max: { revision: null },
        });

        // Save original findFirst reference
        const originalFindFirst = mockPrismaService.attachment.findFirst;
        mockPrismaService.attachment.findFirst = undefined;

        const checklistPayload = {
          items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) =>
            item.code === 'CLEAN_VEHICLE'
              ? {
                  code: item.code,
                  result: 'OK' as const,
                  photoAttachmentId: 'att-prelim-unavail-1',
                }
              : {
                  code: item.code,
                  result: 'OK' as const,
                  notes: '',
                },
          ),
        };

        try {
          await expect(
            warehouseService.startWarehouse(
              'tx-coal-sec03',
              {
                suratJalanNumber: 'SJ-SEC03-016',
                poNumber: 'PO-SEC03-016',
                preUnloadChecklist: checklistPayload,
              },
              mockUser,
            ),
          ).rejects.toThrow(
            expect.objectContaining({
              response: expect.objectContaining({
                errors: ['ATTACHMENT_SERVICE_UNAVAILABLE'],
              }),
            }),
          );

          // Zero persistence guarantee
          expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
          expect(fs.writeFileSync).not.toHaveBeenCalled();
        } finally {
          mockPrismaService.attachment.findFirst = originalFindFirst;
        }
      });

      it('SEC03-17 (Transaction Client findFirst Unavailable): fails with ATTACHMENT_SERVICE_UNAVAILABLE when client.attachment.findFirst is missing inside transaction without fallback to this.prisma', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTxSec03,
        );
        queuePaEvidence(mockPaRecordSec03);
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);
        mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
          _max: { revision: null },
        });

        const validAttachment = {
          id: 'att-tx-unavail-1',
          transactionId: 'tx-coal-sec03',
          module: 'WAREHOUSE',
          attachmentType: 'PHOTO',
          isCurrent: true,
          originalName: 'CLEAN_VEHICLE_valid.png',
          revision: 1,
          filePath: 'checklist-evidence/valid.png',
        };

        // Preliminary findFirst succeeds
        mockPrismaService.attachment.findFirst.mockResolvedValueOnce(
          validAttachment,
        );

        // Transaction client has attachment object, but findFirst is missing
        const mockTxClientWithoutFindFirst = {
          attachment: {
            create: jest.fn(),
            // findFirst is undefined
          },
          warehouseProcess: {
            aggregate: jest
              .fn()
              .mockResolvedValue({ _max: { revision: null } }),
            create: jest.fn().mockResolvedValue({ id: 'wp-1', revision: 1 }),
          },
          transaction: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue({
              ...baseCoalTxSec03,
              status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
            }),
          },
          transactionStatusHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClientWithoutFindFirst),
        );

        const checklistPayload = {
          items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) =>
            item.code === 'CLEAN_VEHICLE'
              ? {
                  code: item.code,
                  result: 'OK' as const,
                  photoAttachmentId: 'att-tx-unavail-1',
                }
              : {
                  code: item.code,
                  result: 'OK' as const,
                  notes: '',
                },
          ),
        };

        await expect(
          warehouseService.startWarehouse(
            'tx-coal-sec03',
            {
              suratJalanNumber: 'SJ-SEC03-017',
              poNumber: 'PO-SEC03-017',
              preUnloadChecklist: checklistPayload,
            },
            mockUser,
          ),
        ).rejects.toThrow(
          expect.objectContaining({
            response: expect.objectContaining({
              errors: ['ATTACHMENT_SERVICE_UNAVAILABLE'],
            }),
          }),
        );

        // Preliminary called once, but this.prisma was NEVER called as fallback inside transaction
        expect(mockPrismaService.attachment.findFirst).toHaveBeenCalledTimes(1);
        expect(
          mockTxClientWithoutFindFirst.warehouseProcess.create,
        ).not.toHaveBeenCalled();
        expect(
          mockTxClientWithoutFindFirst.transaction.updateMany,
        ).not.toHaveBeenCalled();
      });

      it('SEC03-18 (Transactional Invalidation / Re-validation): preliminary check succeeds but attachment becomes invalid or deleted inside transaction, rejecting the process and rolling back', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTxSec03,
        );
        queuePaEvidence(mockPaRecordSec03);
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);
        mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
          _max: { revision: null },
        });

        const validPreliminaryAttachment = {
          id: 'att-race-1',
          transactionId: 'tx-coal-sec03',
          module: 'WAREHOUSE',
          attachmentType: 'PHOTO',
          isCurrent: true,
          originalName: 'CLEAN_VEHICLE_race.png',
          revision: 1,
          filePath: 'checklist-evidence/race.png',
        };

        // Preliminary lookup succeeds
        mockPrismaService.attachment.findFirst.mockResolvedValueOnce(
          validPreliminaryAttachment,
        );

        // But inside transaction, concurrent update deleted or changed the attachment (returns null)
        const mockTxClient = {
          attachment: {
            findFirst: jest.fn().mockResolvedValueOnce(null),
          },
          warehouseProcess: {
            aggregate: jest
              .fn()
              .mockResolvedValue({ _max: { revision: null } }),
            create: jest.fn().mockResolvedValue({ id: 'wp-1', revision: 1 }),
          },
          transaction: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue({
              ...baseCoalTxSec03,
              status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
            }),
          },
          transactionStatusHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClient),
        );

        const checklistPayload = {
          items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) =>
            item.code === 'CLEAN_VEHICLE'
              ? {
                  code: item.code,
                  result: 'OK' as const,
                  photoAttachmentId: 'att-race-1',
                }
              : {
                  code: item.code,
                  result: 'OK' as const,
                  notes: '',
                },
          ),
        };

        await expect(
          warehouseService.startWarehouse(
            'tx-coal-sec03',
            {
              suratJalanNumber: 'SJ-SEC03-018',
              poNumber: 'PO-SEC03-018',
              preUnloadChecklist: checklistPayload,
            },
            mockUser,
          ),
        ).rejects.toThrow(
          expect.objectContaining({
            response: expect.objectContaining({
              errors: ['INVALID_PHOTO_ATTACHMENT'],
            }),
          }),
        );

        // Proves transaction aborted before creating warehouseProcess or updating status
        expect(mockTxClient.warehouseProcess.create).not.toHaveBeenCalled();
        expect(mockTxClient.transaction.updateMany).not.toHaveBeenCalled();
      });

      it('SEC03-19 (Conflicting Direct IDs): rejects with CONFLICTING_PHOTO_EVIDENCE when both photoAttachmentId and photoUrl provide different direct identifiers', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTxSec03,
        );
        queuePaEvidence(mockPaRecordSec03);
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);
        mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
          _max: { revision: null },
        });

        const conflictingPayload = {
          items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) =>
            item.code === 'CLEAN_VEHICLE'
              ? {
                  code: item.code,
                  result: 'OK' as const,
                  photoAttachmentId: 'att-direct-alpha',
                  photoUrl: 'att-direct-bravo',
                }
              : {
                  code: item.code,
                  result: 'OK' as const,
                  notes: '',
                },
          ),
        };

        await expect(
          warehouseService.startWarehouse(
            'tx-coal-sec03',
            {
              suratJalanNumber: 'SJ-SEC03-019',
              poNumber: 'PO-SEC03-019',
              preUnloadChecklist: conflictingPayload,
            },
            mockUser,
          ),
        ).rejects.toThrow(
          expect.objectContaining({
            response: expect.objectContaining({
              errors: ['CONFLICTING_PHOTO_EVIDENCE'],
            }),
          }),
        );

        expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      });

      it('SEC03-20 (Invalid photoAttachmentId Format with Valid photoUrl): rejects with INVALID_PHOTO_ATTACHMENT_FORMAT when photoAttachmentId format is invalid even if paired photoUrl is valid', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          baseCoalTxSec03,
        );
        queuePaEvidence(mockPaRecordSec03);
        mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
          { processType: ProcessType.GSP },
        ]);
        mockPrismaService.warehouseProcess.aggregate.mockResolvedValueOnce({
          _max: { revision: null },
        });

        const invalidIdWithValidUrlPayload = {
          items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) =>
            item.code === 'CLEAN_VEHICLE'
              ? {
                  code: item.code,
                  result: 'OK' as const,
                  photoAttachmentId: 'invalid id with spaces!',
                  photoUrl: '/api/attachments/att-valid-1/download',
                }
              : {
                  code: item.code,
                  result: 'OK' as const,
                  notes: '',
                },
          ),
        };

        await expect(
          warehouseService.startWarehouse(
            'tx-coal-sec03',
            {
              suratJalanNumber: 'SJ-SEC03-020',
              poNumber: 'PO-SEC03-020',
              preUnloadChecklist: invalidIdWithValidUrlPayload,
            },
            mockUser,
          ),
        ).rejects.toThrow(
          expect.objectContaining({
            response: expect.objectContaining({
              errors: ['INVALID_PHOTO_ATTACHMENT_FORMAT'],
            }),
          }),
        );

        expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      });
    });
  });

  describe('COR-03: Process Confinement & Checklist Preservation on Warehouse Completion', () => {
    const validGspTx = {
      id: 'tx-cor03-gsp',
      transactionNumber: 'GMS-20261015-0001',
      status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
      processType: ProcessType.GSP,
      cargoType: 'Chemicals',
      receiptUnit: WarehouseUnit.LITER,
      revision: 1,
      warehouseEndAt: null,
      warehouseStartAt: new Date('2026-10-15T08:00:00.000Z'),
      warehouseStartById: mockUser.id,
      remarks: null,
    };

    const validGbbTx = {
      id: 'tx-cor03-gbb',
      transactionNumber: 'GMS-20261015-0002',
      status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
      processType: ProcessType.GBB,
      cargoType: 'Raw Material',
      revision: 1,
      warehouseEndAt: null,
      warehouseStartAt: new Date('2026-10-15T08:00:00.000Z'),
      warehouseStartById: mockUser.id,
      remarks: null,
    };

    const validGbjTx = {
      id: 'tx-cor03-gbj',
      transactionNumber: 'GMS-20261015-0003',
      status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
      processType: ProcessType.GBJ,
      cargoType: 'Finished Goods',
      revision: 1,
      warehouseEndAt: null,
      warehouseStartAt: new Date('2026-10-15T08:00:00.000Z'),
      warehouseStartById: mockUser.id,
      remarks: null,
    };

    it('COR03-01: rejects GSP completion with deliveryChecklist before database mutation', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        validGspTx,
      );

      await expect(
        warehouseService.completeWarehouse(
          validGspTx.id,
          {
            receivedQuantity: '25000.500',
            receivedUnit: WarehouseUnit.LITER,
            condition: WarehouseCondition.GOOD,
            deliveryChecklist: {
              productTypes: ['SIC 18 T'],
            },
          },
          mockUser,
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            success: false,
            message: 'deliveryChecklist hanya diperbolehkan untuk proses GBJ.',
            errors: ['DELIVERY_CHECKLIST_NOT_ALLOWED_FOR_PROCESS'],
          }),
        }),
      );

      // Verifies no transaction mutation was executed
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('COR03-02: rejects GBB completion with deliveryChecklist before database mutation', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        validGbbTx,
      );

      await expect(
        warehouseService.completeWarehouse(
          validGbbTx.id,
          {
            actualWeight: 15000,
            actualQuantity: 15000,
            unit: WarehouseUnit.KG,
            condition: WarehouseCondition.GOOD,
            deliveryChecklist: {
              productTypes: ['SIC 18 T'],
            },
          },
          mockUser,
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            success: false,
            message: 'deliveryChecklist hanya diperbolehkan untuk proses GBJ.',
            errors: ['DELIVERY_CHECKLIST_NOT_ALLOWED_FOR_PROCESS'],
          }),
        }),
      );

      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('COR03-03: accepts GSP completion when deliveryChecklist is null or undefined without sending checklistItems', async () => {
      for (const checklistVal of [null, undefined]) {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          validGspTx,
        );

        const mockTxClient = {
          transaction: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue({
              ...validGspTx,
              status: TransactionStatus.WAREHOUSE_DONE,
              warehouseEndBy: {
                id: mockUser.id,
                name: 'Admin',
                role: 'ADMIN',
              },
            }),
          },
          warehouseProcess: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'wp-gsp',
              revision: 1,
              checklistItems: [{ code: 'GSP-01', result: 'OK' }],
            }),
            update: jest.fn().mockResolvedValue({ id: 'wp-gsp', revision: 2 }),
          },
          transactionStatusHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClient),
        );

        const res = await warehouseService.completeWarehouse(
          validGspTx.id,
          {
            receivedQuantity: '25000.500',
            receivedUnit: WarehouseUnit.LITER,
            condition: WarehouseCondition.GOOD,
            ...(checklistVal !== undefined && {
              deliveryChecklist: checklistVal,
            }),
          },
          mockUser,
        );

        expect(res.success).toBe(true);
        const updateData =
          mockTxClient.warehouseProcess.update.mock.calls[0][0].data;
        expect(updateData).not.toHaveProperty('checklistItems');
      }
    });

    it('COR03-04: preserves 9-item GSP checklist and concessions by omitting checklistItems from update data', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        validGspTx,
      );

      const canonicalGspChecklistWithConcession = {
        version: GSP_PREUNLOAD_VERSION,
        overallResult: 'CONCESSION',
        items: GSP_PREUNLOAD_CANONICAL_ITEMS.map((item) => {
          if (item.code === 'CLEAN_VEHICLE') {
            return {
              code: item.code,
              label: item.label,
              result: 'NOT_OK' as const,
              notes: 'Bak kotor berdebu, disetujui lewat konsesi Ka. Gudang',
              photoUrl: '/api/attachments/att-gsp-photo-1/download',
              photoAttachmentId: 'att-gsp-photo-1',
            };
          }
          return {
            code: item.code,
            label: item.label,
            result: 'OK' as const,
            notes: null,
            photoUrl: null,
            photoAttachmentId: null,
          };
        }),
        disposition: {
          action: 'ACCEPT_WITH_NOTE',
          reason: 'Pembersihan eksterior dilakukan sebelum pembongkaran.',
          decidedById: mockUser.id,
          decidedByName: mockUser.name,
          decidedAt: '2026-10-15T08:15:00.000Z',
        },
      };

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            ...validGspTx,
            status: TransactionStatus.WAREHOUSE_DONE,
            warehouseEndBy: { id: mockUser.id, name: 'Admin', role: 'ADMIN' },
          }),
        },
        warehouseProcess: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'wp-gsp-active',
            revision: 1,
            checklistItems: canonicalGspChecklistWithConcession,
          }),
          update: jest
            .fn()
            .mockResolvedValue({ id: 'wp-gsp-active', revision: 2 }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await warehouseService.completeWarehouse(
        validGspTx.id,
        {
          receivedQuantity: '25000.500',
          receivedUnit: WarehouseUnit.LITER,
          condition: WarehouseCondition.GOOD,
        },
        mockUser,
      );

      expect(res.success).toBe(true);
      // Direct property absence check:
      // Parameter update Prisma terbukti tidak mengirim properti checklistItems,
      // sehingga tidak menimpa 9 item checklist GSP dan metadata disposisi konsesi.
      // Catatan: Verifikasi ini membuktikan payload panggilan Prisma pada unit test mock;
      // preservasi pada PostgreSQL nyata belum diuji dalam paket unit test ini;
      // pembuktiannya memerlukan pengujian database/E2E terisolasi.
      const updateData =
        mockTxClient.warehouseProcess.update.mock.calls[0][0].data;
      expect(updateData).not.toHaveProperty('checklistItems');
    });

    it('COR03-05: ensures fallback process creation for GSP does not inject deliveryChecklist or checklistItems', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        validGspTx,
      );

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            ...validGspTx,
            status: TransactionStatus.WAREHOUSE_DONE,
            warehouseEndBy: { id: mockUser.id, name: 'Admin', role: 'ADMIN' },
          }),
        },
        warehouseProcess: {
          findFirst: jest.fn().mockResolvedValue(null), // Active process missing
          aggregate: jest.fn().mockResolvedValue({ _max: { revision: 1 } }),
          create: jest
            .fn()
            .mockResolvedValue({ id: 'wp-gsp-fallback', revision: 2 }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await warehouseService.completeWarehouse(
        validGspTx.id,
        {
          receivedQuantity: '25000.500',
          receivedUnit: WarehouseUnit.LITER,
          condition: WarehouseCondition.GOOD,
        },
        mockUser,
      );

      expect(res.success).toBe(true);
      const createData =
        mockTxClient.warehouseProcess.create.mock.calls[0][0].data;
      expect(createData).not.toHaveProperty('checklistItems');
      expect(createData).not.toHaveProperty('deliveryChecklist');
    });

    it.each([false, 0, ''])(
      'COR03-06: rejects non-null falsy value (%p) for GBJ deliveryChecklist with INVALID_DELIVERY_CHECKLIST_FORMAT',
      async (falsyVal) => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          validGbjTx,
        );

        await expect(
          warehouseService.completeWarehouse(
            validGbjTx.id,
            {
              actualWeight: 14500,
              deliveryChecklist: falsyVal as any,
            },
            mockUser,
          ),
        ).rejects.toThrow(
          expect.objectContaining({
            response: expect.objectContaining({
              success: false,
              errors: ['INVALID_DELIVERY_CHECKLIST_FORMAT'],
            }),
          }),
        );

        expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      },
    );

    it('COR03-07: persists normalized checklist on GBJ completion and omits fallback to raw payload', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        validGbjTx,
      );

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            ...validGbjTx,
            status: TransactionStatus.WAREHOUSE_DONE,
            warehouseEndBy: { id: mockUser.id, name: 'Admin', role: 'ADMIN' },
          }),
        },
        warehouseProcess: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'wp-gbj',
            revision: 1,
            isCurrent: true,
            endAt: null,
          }),
          update: jest.fn().mockResolvedValue({ id: 'wp-gbj', revision: 2 }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
        cb(mockTxClient),
      );

      const rawInputChecklist = {
        productTypes: ['  SIC 18 T  ', '  SIC 8590 SD  '],
        customerDestination: 'PT KARYA MAJU',
        suratJalanNumber: 'SJ-GBJ-001',
        notes: 'Pengiriman prioritas',
      };

      const expectedCanonicalChecklist = {
        productTypes: ['SIC 18 T', 'SIC 8590 SD'],
        productType: 'SIC 18 T',
        customer: 'PT KARYA MAJU',
        customerDestination: 'PT KARYA MAJU',
        suratJalanNumber: 'SJ-GBJ-001',
        date: null,
        productCondition: null,
        documentAvailability: null,
        notes: 'Pengiriman prioritas',
      };

      const res = await warehouseService.completeWarehouse(
        validGbjTx.id,
        {
          actualWeight: 14500,
          suratJalanNumber: 'SJ-GBJ-001',
          deliveryChecklist: rawInputChecklist,
        },
        mockUser,
      );

      expect(res.success).toBe(true);

      const txUpdateData =
        mockTxClient.transaction.updateMany.mock.calls[0][0].data;
      expect(txUpdateData.deliveryChecklist).toEqual(
        expectedCanonicalChecklist,
      );
      expect(txUpdateData.deliveryChecklist.productTypes).not.toContain(
        '  SIC 18 T  ',
      );

      const wpUpdateData =
        mockTxClient.warehouseProcess.update.mock.calls[0][0].data;
      expect(wpUpdateData.checklistItems).toEqual(expectedCanonicalChecklist);
      expect(wpUpdateData.checklistItems.productTypes).not.toContain(
        '  SIC 18 T  ',
      );
    });

    it('COR03-08: rejects GBJ completion with empty productTypes before database mutation', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        validGbjTx,
      );

      await expect(
        warehouseService.completeWarehouse(
          validGbjTx.id,
          {
            actualWeight: 14500,
            deliveryChecklist: {
              productTypes: [],
            },
          },
          mockUser,
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            success: false,
            message:
              'Minimal satu jenis produk GBJ wajib dipilih (Product Type 1).',
            errors: ['MISSING_GBJ_PRODUCT_TYPE'],
          }),
        }),
      );

      // Verifies no database mutation was executed
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('COR03-09: accepts GBJ completion when deliveryChecklist is null or undefined without writing deliveryChecklist or checklistItems', async () => {
      for (const checklistVal of [null, undefined]) {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          validGbjTx,
        );

        const mockTxClient = {
          transaction: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findUnique: jest.fn().mockResolvedValue({
              ...validGbjTx,
              status: TransactionStatus.WAREHOUSE_DONE,
              warehouseEndBy: { id: mockUser.id, name: 'Admin', role: 'ADMIN' },
            }),
          },
          warehouseProcess: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'wp-gbj',
              revision: 1,
              isCurrent: true,
              endAt: null,
            }),
            update: jest.fn().mockResolvedValue({ id: 'wp-gbj', revision: 2 }),
          },
          transactionStatusHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
          cb(mockTxClient),
        );

        const res = await warehouseService.completeWarehouse(
          validGbjTx.id,
          {
            actualWeight: 14500,
            actualQuantity: 14500,
            unit: WarehouseUnit.KG,
            condition: WarehouseCondition.GOOD,
            ...(checklistVal !== undefined && {
              deliveryChecklist: checklistVal,
            }),
          },
          mockUser,
        );

        expect(res.success).toBe(true);

        const txUpdateData =
          mockTxClient.transaction.updateMany.mock.calls[0][0].data;
        expect(txUpdateData).not.toHaveProperty('deliveryChecklist');

        const wpUpdateData =
          mockTxClient.warehouseProcess.update.mock.calls[0][0].data;
        expect(wpUpdateData).not.toHaveProperty('checklistItems');
      }
    });
  });
});
