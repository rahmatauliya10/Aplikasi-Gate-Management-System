import { Test, TestingModule } from '@nestjs/testing';
import { WarehouseService } from './warehouse.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { WarehouseCondition, WarehouseUnit } from '@prisma/client';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';

/**
 * P0-02 Regression: CANCELLED → REOPEN warehouse historical revision edge-case.
 *
 * Scenario:
 *   1. Warehouse rev1 created (isCurrent:true, endAt:null)
 *   2. Transaction CANCELLED → rev1 becomes isCurrent:false (endAt still null)
 *   3. Admin REOPEN → Warehouse rev2 created (isCurrent:true, endAt:null)
 *   4. completeWarehouse() must update rev2 only, NOT rev1
 *
 * Without `isCurrent: true` in the findFirst query, rev1 could be selected.
 */
describe('Warehouse CANCELLED→REOPEN Regression (P0-02)', () => {
  let service: WarehouseService;

  const mockPrismaService = {
    $transaction: jest.fn(),
    transaction: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
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
    userWarehouseAccess: {
      findMany: jest.fn(),
    },
  };

  const mockActivityLogsService = {
    logAction: jest.fn().mockResolvedValue({}),
  };

  const warehouseUser: JwtPayloadUser = {
    id: 'usr-wh-1',
    role: 'WAREHOUSE',
    email: 'wh@gms.local',
  } as unknown as JwtPayloadUser;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WarehouseService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ActivityLogsService, useValue: mockActivityLogsService },
      ],
    }).compile();

    service = module.get<WarehouseService>(WarehouseService);
    jest.clearAllMocks();
  });

  it('completeWarehouse should select isCurrent:true record, ignoring historical rev with endAt:null', async () => {
    // Setup: transaction in WAREHOUSE_IN_PROGRESS after REOPEN
    const historicalRev1 = {
      id: 'wp-rev1',
      transactionId: 'tx-reopen-1',
      revision: 1,
      isCurrent: false, // Superseded by REOPEN
      endAt: null, // Was never completed before CANCEL
      processType: 'GBB',
    };

    const currentRev2 = {
      id: 'wp-rev2',
      transactionId: 'tx-reopen-1',
      revision: 2,
      isCurrent: true,
      endAt: null,
      processType: 'GBB',
    };

    const mockTx = {
      id: 'tx-reopen-1',
      status: 'WAREHOUSE_IN_PROGRESS',
      processType: 'GBB',
      warehouseStartAt: new Date(),
      warehouseStartById: 'usr-wh-1',
      warehouseEndAt: null,
      warehouseProcesses: [historicalRev1, currentRev2],
    };

    mockPrismaService.transaction.findUnique.mockResolvedValueOnce(mockTx);
    mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
      { processType: 'GBB' },
    ]);

    const mockTxClient = {
      warehouseProcess: {
        // KEY ASSERTION: findFirst with isCurrent:true should return rev2, not rev1
        findFirst: jest.fn().mockResolvedValue(currentRev2),
        aggregate: jest.fn().mockResolvedValue({ _max: { revision: 2 } }),
        update: jest
          .fn()
          .mockResolvedValue({ ...currentRev2, endAt: new Date() }),
        create: jest.fn(),
      },
      transaction: {
        findUnique: jest.fn().mockResolvedValue({
          ...mockTx,
          status: 'INCOMING_CHECK_PENDING',
          warehouseEndBy: {
            id: 'usr-wh-1',
            name: 'WH User',
            role: 'WAREHOUSE',
          },
        }),
        update: jest.fn().mockResolvedValue({
          ...mockTx,
          status: 'INCOMING_CHECK_PENDING',
          warehouseEndBy: {
            id: 'usr-wh-1',
            name: 'WH User',
            role: 'WAREHOUSE',
          },
        }),
      },
      transactionStatusHistory: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    jest
      .spyOn(mockPrismaService, '$transaction')
      .mockImplementation(async (cb: any) => cb(mockTxClient));

    const result = await service.completeWarehouse(
      'tx-reopen-1',
      {
        actualWeight: 15000,
        actualQuantity: 150,
        unit: WarehouseUnit.KG,
        condition: WarehouseCondition.GOOD,
      },
      warehouseUser,
    );

    // ASSERT: findFirst was called with isCurrent: true
    expect(mockTxClient.warehouseProcess.findFirst).toHaveBeenCalledWith({
      where: {
        transactionId: 'tx-reopen-1',
        isCurrent: true,
        endAt: null,
      },
    });

    // ASSERT: update was called on rev2 (current), NOT rev1 (historical)
    expect(mockTxClient.warehouseProcess.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'wp-rev2' }, // Must be rev2, never rev1
      }),
    );

    // ASSERT: rev1 was never touched
    expect(mockTxClient.warehouseProcess.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'wp-rev1' },
      }),
    );

    // ASSERT: fallback create was NOT called (active process found)
    expect(mockTxClient.warehouseProcess.create).not.toHaveBeenCalled();

    expect(result.success).toBe(true);
  });

  it('completeWarehouse fallback should NOT pick up historical rev when no current process exists', async () => {
    // Edge case: both historical revisions are isCurrent:false, endAt:null
    // findFirst with isCurrent:true returns null → triggers fallback create
    const mockTx = {
      id: 'tx-edge-1',
      status: 'WAREHOUSE_IN_PROGRESS',
      processType: 'GBJ',
      warehouseStartAt: new Date(),
      warehouseStartById: 'usr-wh-1',
      warehouseEndAt: null,
      warehouseProcesses: [],
    };

    mockPrismaService.transaction.findUnique.mockResolvedValueOnce(mockTx);
    mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
      { processType: 'GBJ' },
    ]);

    const mockTxClient = {
      warehouseProcess: {
        findFirst: jest.fn().mockResolvedValue(null), // No current process
        aggregate: jest.fn().mockResolvedValue({ _max: { revision: 2 } }),
        create: jest.fn().mockResolvedValue({
          id: 'wp-fallback',
          revision: 3,
          transactionId: 'tx-edge-1',
        }),
      },
      transaction: {
        findUnique: jest.fn().mockResolvedValue({
          ...mockTx,
          status: 'WAREHOUSE_DONE',
          warehouseEndBy: {
            id: 'usr-wh-1',
            name: 'WH User',
            role: 'WAREHOUSE',
          },
        }),
        update: jest.fn().mockResolvedValue({
          ...mockTx,
          status: 'WAREHOUSE_DONE',
          warehouseEndBy: {
            id: 'usr-wh-1',
            name: 'WH User',
            role: 'WAREHOUSE',
          },
        }),
      },
      transactionStatusHistory: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    jest
      .spyOn(mockPrismaService, '$transaction')
      .mockImplementation(async (cb: any) => cb(mockTxClient));

    const result = await service.completeWarehouse(
      'tx-edge-1',
      {
        actualWeight: 8000,
        actualQuantity: 80,
        unit: WarehouseUnit.KG,
        condition: WarehouseCondition.GOOD,
      },
      warehouseUser,
    );

    // ASSERT: fallback create used revision = max(2) + 1 = 3
    expect(mockTxClient.warehouseProcess.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          transactionId: 'tx-edge-1',
          revision: 3,
        }),
      }),
    );

    expect(result.success).toBe(true);
  });
});
