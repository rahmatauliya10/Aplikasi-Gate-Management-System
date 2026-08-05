import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ConflictException } from '@nestjs/common';

describe('TransactionsService PostgreSQL OCC & Audit Integration', () => {
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
              updateMany: jest.fn(),
            },
            transactionCorrection: {
              create: jest.fn(),
            },
            fraudCheck: {
              create: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
        {
          provide: ActivityLogsService,
          useValue: {
            logAction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
    prismaService = module.get<PrismaService>(PrismaService);
    activityLogsService =
      module.get<ActivityLogsService>(ActivityLogsService);
  });

  it('should reject stale OCC update with ConflictException 409', async () => {
    const initialTx = {
      id: 'tx-occ-101',
      status: 'COMPLETED',
      grossWeight: 12000,
      tareWeight: 4000,
      netWeight: 8000,
      updatedAt: new Date('2026-08-05T01:00:00.000Z'),
    };

    jest
      .spyOn(prismaService.transaction, 'findUnique')
      .mockResolvedValue(initialTx as any);

    // Simulate parallel race: updateMany returns count: 0 because another worker updated the timestamp
    const mockTxScope = {
      transaction: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    jest
      .spyOn(prismaService, '$transaction')
      .mockImplementation(async (cb: any) => cb(mockTxScope));

    const staleDto = {
      reason: 'Parallel update attempt with stale timestamp',
      evidenceUrl: 'https://storage.gms.local/evidence/ticket-occ.pdf',
      expectedUpdatedAt: '2026-08-05T01:00:00.000Z',
      grossWeight: 12500,
    };

    const adminUser = {
      id: 'admin-occ',
      role: 'ADMIN',
      email: 'admin@gms.local',
    };

    await expect(
      service.correctCompletedTransaction(
        'tx-occ-101',
        staleDto,
        adminUser as any,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('should ensure database rollback when audit step fails', async () => {
    const initialTx = {
      id: 'tx-audit-202',
      status: 'COMPLETED',
      grossWeight: 15000,
      tareWeight: 5000,
      netWeight: 10000,
      updatedAt: new Date('2026-08-05T01:00:00.000Z'),
    };

    const createdCorrection = { id: 'corr-audit-202' };

    let correctionCreatedInTx = false;
    let transactionUpdatedInTx = false;

    const mockTxScope = {
      transactionCorrection: {
        create: jest.fn().mockImplementation(async () => {
          correctionCreatedInTx = true;
          return createdCorrection;
        }),
      },
      transaction: {
        updateMany: jest.fn().mockImplementation(async () => {
          transactionUpdatedInTx = true;
          return { count: 1 };
        }),
        findUnique: jest.fn().mockResolvedValue(initialTx),
      },
      fraudCheck: {
        create: jest.fn().mockResolvedValue({ id: 'fc-1' }),
      },
    };

    jest
      .spyOn(prismaService.transaction, 'findUnique')
      .mockResolvedValue(initialTx as any);

    // Simulated $transaction callback throwing error when logAction fails inside scope
    jest
      .spyOn(prismaService, '$transaction')
      .mockImplementation(async (cb: any) => {
        try {
          return cb(mockTxScope);
        } catch (err) {
          // Reset mock transaction state simulating DB rollback
          correctionCreatedInTx = false;
          transactionUpdatedInTx = false;
          throw err;
        }
      });

    jest
      .spyOn(activityLogsService, 'logAction')
      .mockRejectedValue(
        new Error('Audit log insertion failed - Disk I/O error'),
      );

    const dto = {
      reason: 'Validation of transaction rollback on audit log failure',
      evidenceUrl: 'https://storage.gms.local/evidence/ticket-audit.pdf',
      expectedUpdatedAt: '2026-08-05T01:00:00.000Z',
      grossWeight: 15500,
    };

    const adminUser = {
      id: 'admin-audit',
      role: 'ADMIN',
      email: 'admin@gms.local',
    };

    await expect(
      service.correctCompletedTransaction(
        'tx-audit-202',
        dto,
        adminUser as any,
      ),
    ).rejects.toThrow('Audit log insertion failed - Disk I/O error');

    // Confirm that due to transaction rollback, state remained clean
    expect(correctionCreatedInTx).toBe(false);
    expect(transactionUpdatedInTx).toBe(false);
  });
});
