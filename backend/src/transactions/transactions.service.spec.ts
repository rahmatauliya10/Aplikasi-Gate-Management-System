import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { BadRequestException } from '@nestjs/common';

describe('TransactionsService State Machine', () => {
  let service: TransactionsService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        {
          provide: PrismaService,
          useValue: {
            transaction: { findUnique: jest.fn(), update: jest.fn() },
            $transaction: jest.fn((cb) =>
              cb({
                transaction: { update: jest.fn() },
                transactionStatusHistory: { create: jest.fn() },
              }),
            ),
          },
        },
        {
          provide: ActivityLogsService,
          useValue: { logAction: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
    prismaService = module.get<PrismaService>(PrismaService);
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
});
