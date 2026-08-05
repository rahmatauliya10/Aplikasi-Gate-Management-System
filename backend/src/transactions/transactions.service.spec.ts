import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { BadRequestException, ConflictException } from '@nestjs/common';

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
            transaction: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
            $transaction: jest.fn((cb) =>
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

  it('should allow ADMIN to correct COMPLETED transaction fields with matching OCC timestamp', async () => {
    const mockTx = {
      id: 'tx-1',
      status: 'COMPLETED',
      grossWeight: 10000,
      tareWeight: 3000,
      netWeight: 7000,
      actualWeight: 6900,
      driverName: 'Pak Supri',
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    };

    const mockPrismaTx = {
      transactionCorrection: {
        create: jest.fn().mockResolvedValue({ id: 'corr-1' }),
      },
      transaction: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          ...mockTx,
          grossWeight: 10500,
          netWeight: 7500,
        }),
      },
      fraudCheck: { create: jest.fn().mockResolvedValue({ id: 'fraud-1' }) },
    };

    jest
      .spyOn(prismaService.transaction, 'findUnique')
      .mockResolvedValue(mockTx as any);
    jest
      .spyOn(prismaService, '$transaction')
      .mockImplementation(async (cb: any) => cb(mockPrismaTx));

    const dto = {
      reason: 'Koreksi penimbangan gross di tiket fisik timbang',
      evidenceUrl: 'https://storage.gms.local/evidence/ticket-123.pdf',
      expectedUpdatedAt: '2026-08-01T00:00:00.000Z',
      grossWeight: 10500,
    };

    const userPayload = {
      id: 'admin-1',
      role: 'ADMIN',
      email: 'admin@gms.local',
    };

    const result = await service.correctCompletedTransaction(
      'tx-1',
      dto,
      userPayload as any,
    );

    expect(result.success).toBe(true);
    expect(mockPrismaTx.transaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'tx-1',
          status: 'COMPLETED',
        }),
      }),
    );
  });

  it('should throw ConflictException (409) on parallel correction if expectedUpdatedAt is stale', async () => {
    const mockTx = {
      id: 'tx-1',
      status: 'COMPLETED',
      grossWeight: 10000,
      tareWeight: 3000,
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    };

    const mockPrismaTx = {
      transaction: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }), // 0 updated due to concurrent update
      },
    };

    jest
      .spyOn(prismaService.transaction, 'findUnique')
      .mockResolvedValue(mockTx as any);
    jest
      .spyOn(prismaService, '$transaction')
      .mockImplementation(async (cb: any) => cb(mockPrismaTx));

    const dto = {
      reason: 'Koreksi penimbangan gross dari pembaruan ganda',
      evidenceUrl: 'https://storage.gms.local/evidence/ticket-123.pdf',
      expectedUpdatedAt: '2026-08-01T00:00:00.000Z',
      grossWeight: 10500,
    };

    await expect(
      service.correctCompletedTransaction(
        'tx-1',
        dto,
        { id: 'admin-1', role: 'ADMIN', email: 'admin@gms.local' } as any,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('should rethrow error inside transaction if activity log fails to ensure atomic rollback', async () => {
    const mockTx = {
      id: 'tx-1',
      status: 'COMPLETED',
      grossWeight: 10000,
      tareWeight: 3000,
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    };

    const mockPrismaTx = {
      transactionCorrection: {
        create: jest.fn().mockResolvedValue({ id: 'corr-1' }),
      },
      transaction: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(mockTx),
      },
    };

    jest
      .spyOn(prismaService.transaction, 'findUnique')
      .mockResolvedValue(mockTx as any);
    jest
      .spyOn(prismaService, '$transaction')
      .mockImplementation(async (cb: any) => cb(mockPrismaTx));
    jest
      .spyOn(activityLogsService, 'logAction')
      .mockRejectedValue(new Error('Audit DB disk full failure'));

    const dto = {
      reason: 'Koreksi penimbangan gross yang akan gagal audit log',
      evidenceUrl: 'https://storage.gms.local/evidence/ticket-123.pdf',
      expectedUpdatedAt: '2026-08-01T00:00:00.000Z',
      grossWeight: 10500,
    };

    await expect(
      service.correctCompletedTransaction(
        'tx-1',
        dto,
        { id: 'admin-1', role: 'ADMIN', email: 'admin@gms.local' } as any,
      ),
    ).rejects.toThrow('Audit DB disk full failure');
  });
});
