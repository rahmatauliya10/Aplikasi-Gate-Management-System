import { Test, TestingModule } from '@nestjs/testing';
import { OperationLogCorrectionService } from './operation-log-correction.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ConflictException } from '@nestjs/common';
import { CorrectionTargetModule } from '@prisma/client';

describe('OperationLogCorrectionService PostgreSQL OCC & Audit Integration', () => {
  let service: OperationLogCorrectionService;
  let prismaService: PrismaService;
  let activityLogsService: ActivityLogsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OperationLogCorrectionService,
        {
          provide: PrismaService,
          useValue: {
            transaction: {
              findUnique: jest.fn(),
              update: jest.fn(),
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

    service = module.get<OperationLogCorrectionService>(
      OperationLogCorrectionService,
    );
    prismaService = module.get<PrismaService>(PrismaService);
    activityLogsService = module.get<ActivityLogsService>(ActivityLogsService);
  });

  it('should reject stale OCC update with ConflictException 409', async () => {
    const initialTx = {
      id: 'tx-occ-101',
      status: 'COMPLETED',
      revision: 2,
    };

    const mockTxScope = {
      transaction: {
        findUnique: jest.fn().mockResolvedValue(initialTx),
      },
    };

    jest
      .spyOn(prismaService, '$transaction')
      .mockImplementation(async (cb: any) => cb(mockTxScope));

    const staleDto = {
      reasonCode: 'SALAH_INPUT_ANGKA',
      remark: 'Parallel update attempt with stale revision',
      expectedRevision: 1,
      items: [
        {
          targetModule: CorrectionTargetModule.TRANSACTION,
          fieldName: 'grossWeight',
          newValue: 12500,
        },
      ],
    };

    const adminUser = {
      id: 'admin-occ',
      role: 'ADMIN',
      email: 'admin@gms.local',
    };

    await expect(
      service.correctOperationLog(
        'tx-occ-101',
        staleDto as any,
        adminUser as any,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('should ensure database rollback when audit step fails', async () => {
    const initialTx = {
      id: 'tx-audit-202',
      status: 'COMPLETED',
      revision: 1,
      grossWeight: 15000,
    };

    const mockTxScope = {
      transaction: {
        findUnique: jest.fn().mockResolvedValue(initialTx),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest
          .fn()
          .mockResolvedValue({ ...initialTx, grossWeight: 15500, revision: 2 }),
      },
      transactionCorrection: {
        create: jest.fn().mockResolvedValue({ id: 'corr-1' }),
      },
    };

    jest
      .spyOn(prismaService, '$transaction')
      .mockImplementation(async (cb: any) => {
        return await cb(mockTxScope);
      });

    jest
      .spyOn(activityLogsService, 'logAction')
      .mockRejectedValue(
        new Error('Audit log insertion failed - Disk I/O error'),
      );

    const dto = {
      reasonCode: 'SALAH_INPUT_ANGKA',
      remark: 'Validation of transaction rollback on audit log failure',
      expectedRevision: 1,
      items: [
        {
          targetModule: CorrectionTargetModule.TRANSACTION,
          fieldName: 'grossWeight',
          newValue: 15500,
        },
      ],
    };

    const adminUser = {
      id: 'admin-audit',
      role: 'ADMIN',
      email: 'admin@gms.local',
    };

    await expect(
      service.correctOperationLog('tx-audit-202', dto as any, adminUser as any),
    ).rejects.toThrow('Audit log insertion failed - Disk I/O error');
  });
});
