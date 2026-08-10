import { Test, TestingModule } from '@nestjs/testing';
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
      warehouseStartById: 'user-1',
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

  it('should compute revision = max(revision) + 1 when warehouse submits incoming material check', async () => {
    const mockTx = {
      id: 'tx-wh-2',
      status: 'INCOMING_CHECK_PENDING',
      processType: 'GBJ',
    };

    mockPrismaService.transaction.findUnique.mockResolvedValueOnce(mockTx);
    mockPrismaService.userWarehouseAccess.findMany.mockResolvedValueOnce([
      { processType: 'GBJ' },
    ]);

    const mockTxClient = {
      transaction: {
        findFirst: jest.fn().mockResolvedValue(mockTx),
        update: jest
          .fn()
          .mockResolvedValue({ ...mockTx, status: 'INCOMING_CHECK_PASSED' }),
      },
      incomingMaterialCheck: {
        aggregate: jest.fn().mockResolvedValue({ _max: { revision: 1 } }),
        create: jest.fn().mockResolvedValue({ id: 'im-new', revision: 2 }),
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
        role: 'WAREHOUSE',
        email: 'wh@gms.local',
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
});
