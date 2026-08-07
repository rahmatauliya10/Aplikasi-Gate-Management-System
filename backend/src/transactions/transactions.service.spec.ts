import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';

describe('TransactionsService State Machine & OCC', () => {
  let service: TransactionsService;
  let prismaService: PrismaService;
  let activityLogsService: ActivityLogsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        {
          provide: PrismaService,
          useValue: {
            transaction: {
              findUnique: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
            },
            $transaction: jest.fn((cb: any) =>
              cb({
                transaction: { update: jest.fn(), updateMany: jest.fn() },
                transactionStatusHistory: { create: jest.fn() },
              }),
            ),
          },
        },
        {
          provide: ActivityLogsService,
          useValue: { logAction: jest.fn() },
        },
        {
          provide: AuthorizationScopeService,
          useValue: { getTransactionScope: jest.fn().mockReturnValue({}) },
        },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
    prismaService = module.get<PrismaService>(PrismaService);
    activityLogsService = module.get<ActivityLogsService>(ActivityLogsService);
  });

  it('should deny cancel if status is COMPLETED', async () => {
    const mockTx = {
      id: 'tx-1',
      status: 'COMPLETED',
    };

    jest
      .spyOn(prismaService.transaction, 'findUnique')
      .mockResolvedValue(mockTx as any);

    await expect(
      service.cancel('tx-1', 'Test', { id: 'admin' } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('should deny delete (remove) if status is COMPLETED', async () => {
    const mockTx = {
      id: 'tx-1',
      status: 'COMPLETED',
    };

    jest
      .spyOn(prismaService.transaction, 'findUnique')
      .mockResolvedValue(mockTx as any);

    await expect(
      service.remove('tx-1', { id: 'admin', role: 'ADMIN' } as any),
    ).rejects.toThrow(BadRequestException);
  });
});
