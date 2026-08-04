import { Test, TestingModule } from '@nestjs/testing';
import { WarehouseService } from './warehouse.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ForbiddenException } from '@nestjs/common';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

describe('WarehouseService - Segregation of Duties (SoD) Enforcement (P0-06)', () => {
  let service: WarehouseService;
  let prisma: PrismaService;
  let activityLogs: ActivityLogsService;

  const mockPrismaService = {
    transaction: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    userWarehouseAccess: {
      findMany: jest.fn().mockResolvedValue([{ processType: 'GBB' }]),
    },
  };

  const mockActivityLogsService = {
    logAction: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WarehouseService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ActivityLogsService, useValue: mockActivityLogsService },
      ],
    }).compile();

    service = module.get<WarehouseService>(WarehouseService);
    prisma = module.get<PrismaService>(PrismaService);
    activityLogs = module.get<ActivityLogsService>(ActivityLogsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const warehouseUser: JwtPayloadUser = {
    id: 'user-wh-1',
    email: 'operator.wh@gms.local',
    role: 'WAREHOUSE',
    name: 'Operator WH',
    warehouseAccess: ['GBB'],
  } as any;

  const adminUser: JwtPayloadUser = {
    id: 'user-admin-1',
    email: 'admin@gms.local',
    role: 'ADMIN',
    name: 'Admin User',
    warehouseAccess: ['GBB', 'GBJ', 'GSP'],
  } as any;

  it('should THROW ForbiddenException (403) when WAREHOUSE role calls submitIncomingCheck on GBB transaction', async () => {
    mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
      id: 'tx-123',
      processType: 'GBB',
      status: 'INCOMING_CHECK_PENDING',
    });

    await expect(
      service.submitIncomingCheck('tx-123', { decision: 'passed' }, warehouseUser),
    ).rejects.toThrow(ForbiddenException);

    expect(mockActivityLogsService.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SOD_VIOLATION_BLOCKED',
        module: 'WAREHOUSE',
        status: 'FAILED',
      }),
    );
  });

  it('should THROW ForbiddenException (403) when WAREHOUSE role calls completeQcAnalysis on GBB transaction', async () => {
    mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
      id: 'tx-124',
      processType: 'GBB',
      status: 'WAREHOUSE_IN_PROGRESS',
    });

    await expect(
      service.completeQcAnalysis('tx-124', warehouseUser, 'Catatan aman'),
    ).rejects.toThrow(ForbiddenException);

    expect(mockActivityLogsService.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SOD_VIOLATION_BLOCKED',
        module: 'WAREHOUSE',
        status: 'FAILED',
      }),
    );
  });
});
