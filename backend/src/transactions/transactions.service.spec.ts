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

  it('should allow ADMIN to correct COMPLETED transaction fields and recalculate net weight', async () => {
    const mockTx = {
      id: 'tx-1',
      status: 'COMPLETED',
      grossWeight: 10000,
      tareWeight: 3000,
      netWeight: 7000,
      actualWeight: 6900,
      driverName: 'Pak Supri',
    };

    const mockPrismaTx = {
      transactionCorrection: { create: jest.fn().mockResolvedValue({ id: 'corr-1' }) },
      transaction: { update: jest.fn().mockResolvedValue({ ...mockTx, grossWeight: 10500, netWeight: 7500 }) },
      fraudCheck: { create: jest.fn().mockResolvedValue({ id: 'fraud-1' }) },
    };

    jest.spyOn(prismaService.transaction, 'findUnique').mockResolvedValue(mockTx as any);
    jest.spyOn(prismaService, '$transaction').mockImplementation(async (cb: any) => cb(mockPrismaTx));

    const dto = {
      reason: 'Koreksi penimbangan gross di tiket fisik timbang',
      evidenceUrl: 'https://storage.gms.local/evidence/ticket-123.pdf',
      grossWeight: 10500,
    };

    const result = await service.correctCompletedTransaction('tx-1', dto as any, { id: 'admin-1', role: 'ADMIN', email: 'admin@gms.local' } as any);

    expect(result.success).toBe(true);
    expect(mockPrismaTx.transactionCorrection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          transactionId: 'tx-1',
          reason: 'Koreksi penimbangan gross di tiket fisik timbang',
          evidenceUrl: 'https://storage.gms.local/evidence/ticket-123.pdf',
        }),
      }),
    );
  });

  it('should reject correction if evidenceUrl is missing or empty', async () => {
    const mockTx = { id: 'tx-1', status: 'COMPLETED', grossWeight: 10000, tareWeight: 3000, netWeight: 7000 };
    jest.spyOn(prismaService.transaction, 'findUnique').mockResolvedValue(mockTx as any);

    const dto = {
      reason: 'Koreksi penimbangan gross tanpa bukti',
      grossWeight: 10500,
    };

    await expect(
      service.correctCompletedTransaction('tx-1', dto as any, { id: 'admin-1', role: 'ADMIN' } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject correction if grossWeight is less than tareWeight', async () => {
    const mockTx = { id: 'tx-1', status: 'COMPLETED', grossWeight: 10000, tareWeight: 3000, netWeight: 7000 };
    jest.spyOn(prismaService.transaction, 'findUnique').mockResolvedValue(mockTx as any);

    const dto = {
      reason: 'Koreksi berat salah memasukkan nilai gross',
      evidenceUrl: 'https://storage.gms.local/evidence/doc.pdf',
      grossWeight: 2000, // < tareWeight 3000
    };

    await expect(
      service.correctCompletedTransaction('tx-1', dto as any, { id: 'admin-1', role: 'ADMIN' } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject correction if no values are different (identical submission)', async () => {
    const mockTx = { id: 'tx-1', status: 'COMPLETED', grossWeight: 10000, tareWeight: 3000, netWeight: 7000, driverName: 'Pak Supri' };
    jest.spyOn(prismaService.transaction, 'findUnique').mockResolvedValue(mockTx as any);

    const dto = {
      reason: 'Koreksi nilai yang sama persis',
      evidenceUrl: 'https://storage.gms.local/evidence/doc.pdf',
      grossWeight: 10000, // identical
      driverName: 'Pak Supri', // identical
    };

    await expect(
      service.correctCompletedTransaction('tx-1', dto as any, { id: 'admin-1', role: 'ADMIN' } as any),
    ).rejects.toThrow(BadRequestException);
  });
});
