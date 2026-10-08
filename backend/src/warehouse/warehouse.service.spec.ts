import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';

import { WarehouseCondition, WarehouseUnit } from '@prisma/client';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';

describe('WarehouseService Revisioning (P1-01)', () => {
  let service: WarehouseService;

  const mockPrismaService = {
    $transaction: jest.fn(),
    transaction: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
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
  };

  const mockActivityLogsService = {
    logAction: jest.fn().mockResolvedValue({}),
  };

  const mockAuthScopeService = {
    getTransactionScope: jest.fn().mockReturnValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WarehouseService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ActivityLogsService, useValue: mockActivityLogsService },
        { provide: AuthorizationScopeService, useValue: mockAuthScopeService },
      ],
    }).compile();

    service = module.get<WarehouseService>(WarehouseService);
    jest.clearAllMocks();
  });

  it('should compute revision = max(revision) + 1 when fallback warehouseProcess creation occurs', async () => {
    const mockTx = {
      id: 'tx-wh-1',
      status: 'WAREHOUSE_IN_PROGRESS',
      processType: 'GBB',
      warehouseStartAt: new Date(),
      warehouseStartById: 'usr-1',
    };

    mockPrismaService.transaction.findUnique.mockResolvedValueOnce(mockTx);
    mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
      { processType: 'GBB' },
    ]);

    const mockTxClient = {
      transaction: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(mockTx),
        update: jest
          .fn()
          .mockResolvedValue({ ...mockTx, status: 'WAREHOUSE_DONE' }),
      },
      warehouseProcess: {
        findFirst: jest.fn().mockResolvedValue(null), // Fallback scenario!
        aggregate: jest.fn().mockResolvedValue({ _max: { revision: 2 } }),
        create: jest.fn().mockResolvedValue({ id: 'wp-new', revision: 3 }),
      },
      transactionStatusHistory: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    jest
      .spyOn(mockPrismaService, '$transaction')
      .mockImplementation(async (cb: any) => cb(mockTxClient));

    const result = await service.completeWarehouse(
      'tx-wh-1',
      {
        actualWeight: 10000,
        actualQuantity: 100,
        unit: WarehouseUnit.KG,
        condition: WarehouseCondition.GOOD,
      },
      {
        id: 'usr-1',
        role: 'WAREHOUSE',
        email: 'wh@gms.local',
      } as unknown as JwtPayloadUser,
    );

    expect(mockTxClient.warehouseProcess.aggregate).toHaveBeenCalledWith({
      where: { transactionId: 'tx-wh-1' },
      _max: { revision: true },
    });

    expect(mockTxClient.warehouseProcess.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          transactionId: 'tx-wh-1',
          revision: 3, // Calculated max (2) + 1 = 3!
        }),
      }),
    );

    expect(result.success).toBe(true);
  });

  it('should compute revision = max(revision) + 1 when incoming material check is submitted', async () => {
    const mockTx = {
      id: 'tx-wh-2',
      status: 'INCOMING_CHECK_PENDING',
      processType: 'GSP',
    };

    mockPrismaService.transaction.findUnique.mockResolvedValueOnce(mockTx);
    mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
      { processType: 'GSP' },
    ]);

    const mockTxClient = {
      transaction: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...mockTx, status: 'INCOMING_CHECK_PASSED' }),
      },
      incomingMaterialCheck: {
        aggregate: jest.fn().mockResolvedValue({ _max: { revision: 1 } }),
        create: jest.fn().mockResolvedValue({ id: 'im-new', revision: 2 }),
      },
      transactionStatusHistory: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    jest
      .spyOn(mockPrismaService, '$transaction')
      .mockImplementation(async (cb: any) => cb(mockTxClient));

    const result = await service.submitIncomingCheck(
      'tx-wh-2',
      { decision: 'passed' },
      {
        id: 'usr-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      } as unknown as JwtPayloadUser,
    );

    expect(mockTxClient.incomingMaterialCheck.aggregate).toHaveBeenCalledWith({
      where: { transactionId: 'tx-wh-2' },
      _max: { revision: true },
    });

    expect(mockTxClient.incomingMaterialCheck.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          transactionId: 'tx-wh-2',
          revision: 2, // Calculated max (1) + 1 = 2!
        }),
      }),
    );

    expect(result.success).toBe(true);
  });

  it('should throw BadRequestException if submitIncomingCheck is called on GBJ transaction', async () => {
    mockPrismaService.transaction.findUnique.mockResolvedValue({
      id: 'tx-gbj-1',
      processType: 'GBJ',
      status: 'WAREHOUSE_IN_PROGRESS',
    });
    mockPrismaService.userWarehouseAccess.findMany.mockResolvedValue([
      { processType: 'GBJ' },
    ]);

    try {
      await service.submitIncomingCheck('tx-gbj-1', { decision: 'rejected' }, {
        id: 'usr-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      } as unknown as JwtPayloadUser);
      throw new Error(
        'Expected submitIncomingCheck to throw BadRequestException',
      );
    } catch (err: any) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toContain('GBB/GSP');
    }
  });

  describe('GSP Receipt Unit & Canonical Receiving Data (P1-01 & P1-02)', () => {
    const mockWarehouseUser = {
      id: 'usr-wh-1',
      role: 'WAREHOUSE',
      email: 'wh@gms.local',
    } as unknown as JwtPayloadUser;

    it('P1-01: blocks startWarehouse on PA-required GSP transaction when receiptUnit is missing', async () => {
      const gspTxNoUom = {
        id: 'tx-gsp-no-uom',
        processType: 'GSP',
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        status: 'QC_VEHICLE_PASSED',
        weighInAt: new Date(),
        grossWeight: 20000,
        receiptUnit: null, // MISSING UOM!
        productCatalog: {
          id: 'cat-coal',
          processType: 'GSP',
          isActive: true,
          receiptUnit: 'KG',
        },
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        gspTxNoUom,
      );
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: 'GSP' },
      ]);

      await expect(
        service.startWarehouse(
          'tx-gsp-no-uom',
          {
            suratJalanNumber: 'SJ-123',
            poNumber: 'PO-123',
            preUnloadChecklist: { items: [] } as any,
          },
          mockWarehouseUser,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockActivityLogsService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'GSP_START_WAREHOUSE_BLOCKED_MISSING_UOM',
          referenceId: 'tx-gsp-no-uom',
          status: 'FAILED',
        }),
      );
      // Status unchanged and no transaction update executed
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('P1-01: blocks startWarehouse on Solar PA_NOT_REQUIRED GSP transaction when receiptUnit is missing', async () => {
      const solarTxNoUom = {
        id: 'tx-solar-no-uom',
        processType: 'GSP',
        cargoType: 'BBM',
        cargoSubType: 'Solar BBM',
        status: 'PA_NOT_REQUIRED',
        weighInAt: new Date(),
        grossWeight: 15000,
        receiptUnit: null, // MISSING UOM!
        productCatalog: {
          id: 'cat-solar',
          processType: 'GSP',
          isActive: true,
          receiptUnit: 'LITER',
        },
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        solarTxNoUom,
      );
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: 'GSP' },
      ]);

      await expect(
        service.startWarehouse(
          'tx-solar-no-uom',
          {
            suratJalanNumber: 'SJ-SOLAR-1',
            poNumber: 'PO-SOLAR-1',
            preUnloadChecklist: { items: [] } as any,
          },
          mockWarehouseUser,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockActivityLogsService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'GSP_START_WAREHOUSE_BLOCKED_MISSING_UOM',
          referenceId: 'tx-solar-no-uom',
          status: 'FAILED',
        }),
      );
    });

    it('P1-02: completeWarehouse returns canonical receiving fields without mapping receivedQuantity into actualWeight', async () => {
      const gspTx = {
        id: 'tx-gsp-complete',
        transactionNumber: 'TX-GSP-202610-001',
        plateNumber: 'B 1234 GSP',
        status: 'WAREHOUSE_IN_PROGRESS',
        processType: 'GSP',
        receiptUnit: 'LITER',
        suratJalanNumber: 'SJ-CANON-01',
        poNumber: 'PO-CANON-01',
        productCatalog: {
          id: 'cat-rk',
          code: 'RK-01',
          name: 'Rapid Klen',
        },
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(gspTx);
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: 'GSP' },
      ]);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            ...gspTx,
            status: 'WAREHOUSE_DONE',
            actualWeight: null, // NOT mapped!
            actualQuantity: null,
            warehouseUnit: null,
            receivedQuantity: 8000.25,
            receiptUnit: 'LITER',
            warehouseProcesses: [
              {
                receivedQuantity: 8000.25,
                receivedUnit: 'LITER',
                checklistItems: { items: [{ code: 'CHK-1', result: 'OK' }] },
              },
            ],
          }),
        },
        warehouseProcess: {
          findFirst: jest.fn().mockResolvedValue({ id: 'wp-1' }),
          update: jest.fn().mockResolvedValue({ id: 'wp-1' }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      jest
        .spyOn(mockPrismaService, '$transaction')
        .mockImplementation(async (cb: any) => cb(mockTxClient));

      const res = await service.completeWarehouse(
        'tx-gsp-complete',
        {
          receivedQuantity: '8000.25',
          receiptUnit: 'LITER',
        },
        mockWarehouseUser,
      );

      expect(res.success).toBe(true);
      expect(res.data.receivedQuantity).toBe('8000.250');
      expect(res.data.receiptUnit).toBe('LITER');
      expect(res.data.receivedUnit).toBe('LITER');
      expect(res.data.checklistItems).toBeDefined();
      expect(res.data.suratJalanNumber).toBe('SJ-CANON-01');
      expect(res.data.poNumber).toBe('PO-CANON-01');
      expect(res.data.materialIdentity?.code).toBe('RK-01');
      // Crucial: actualWeight must NOT be overwritten with GSP receivedQuantity
      expect(res.data.actualWeight).toBeNull();
    });

    it('P1-02: getProcessDetail returns canonical receiving fields with string decimal precision', async () => {
      const gspTx = {
        id: 'tx-gsp-detail',
        transactionNumber: 'TX-GSP-DETAIL-01',
        plateNumber: 'B 5678 GSP',
        status: 'WAREHOUSE_DONE',
        processType: 'GSP',
        actualWeight: null,
        actualQuantity: null,
        warehouseUnit: null,
        receivedQuantity: 5000.125,
        receiptUnit: 'KG',
        suratJalanNumber: 'SJ-DET-01',
        poNumber: 'PO-DET-01',
        productCatalog: {
          id: 'cat-coal',
          code: 'COAL-01',
          name: 'Batubara',
        },
        warehouseProcesses: [
          {
            receivedQuantity: 5000.125,
            receivedUnit: 'KG',
            checklistItems: { verified: true },
          },
        ],
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(gspTx);
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: 'GSP' },
      ]);

      const res = await service.getProcessDetail(
        'tx-gsp-detail',
        mockWarehouseUser,
      );

      expect(res.success).toBe(true);
      expect(res.data.receivedQuantity).toBe('5000.125');
      expect(res.data.receiptUnit).toBe('KG');
      expect(res.data.receivedUnit).toBe('KG');
      expect(res.data.checklistItems).toEqual({ verified: true });
      expect(res.data.suratJalanNumber).toBe('SJ-DET-01');
      expect(res.data.poNumber).toBe('PO-DET-01');
      expect(res.data.materialIdentity?.name).toBe('Batubara');
    });

    it('P1-01: formatGspReceivedQuantity preserves string precision for 8000.250 LITER, 5000.125 KG, and max Decimal(12,3)', async () => {
      const gspTxNearMax = {
        id: 'tx-gsp-max',
        transactionNumber: 'TX-GSP-MAX-01',
        plateNumber: 'B 9999 GSP',
        status: 'WAREHOUSE_DONE',
        processType: 'GSP',
        receivedQuantity: '999999999.999',
        receiptUnit: 'KG',
        suratJalanNumber: 'SJ-MAX-01',
        poNumber: 'PO-MAX-01',
        warehouseProcesses: [
          {
            receivedQuantity: '999999999.999',
            receivedUnit: 'KG',
          },
        ],
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        gspTxNearMax,
      );
      mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
        { processType: 'GSP' },
      ]);

      const res = await service.getProcessDetail(
        'tx-gsp-max',
        mockWarehouseUser,
      );

      expect(res.success).toBe(true);
      expect(res.data.receivedQuantity).toBe('999999999.999');
      expect(res.data.receiptUnit).toBe('KG');
    });
  });
});
