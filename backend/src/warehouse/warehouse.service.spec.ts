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
});
