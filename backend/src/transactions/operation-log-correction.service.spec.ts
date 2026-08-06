import { Test, TestingModule } from '@nestjs/testing';
import { OperationLogCorrectionService } from './operation-log-correction.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { CorrectionAction, CorrectionTargetModule } from '@prisma/client';

describe('OperationLogCorrectionService', () => {
  let service: OperationLogCorrectionService;
  let prismaService: PrismaService;
  let activityLogsService: ActivityLogsService;

  const mockPrismaService = {
    $transaction: jest.fn(),
    transaction: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    transactionCorrection: {
      findMany: jest.fn(),
    },
  };

  const mockActivityLogsService = {
    logAction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OperationLogCorrectionService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ActivityLogsService, useValue: mockActivityLogsService },
      ],
    }).compile();

    service = module.get<OperationLogCorrectionService>(
      OperationLogCorrectionService,
    );
    prismaService = module.get<PrismaService>(PrismaService);
    activityLogsService = module.get<ActivityLogsService>(ActivityLogsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw ForbiddenException if user is not ADMIN', async () => {
    await expect(
      service.correctOperationLog(
        'tx-1',
        { reasonCode: 'TYPO', remark: 'Koreksi typo lapangan #1234', expectedRevision: 1, items: [] } as any,
        { id: 'usr-1', role: 'SECURITY', email: 'sec@gms.local' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should throw ConflictException (HTTP 409) if expectedRevision mismatches', async () => {
    const mockTx = {
      id: 'tx-1',
      status: 'COMPLETED',
      revision: 2, // Stale revision scenario
    };

    const mockTxClient = {
      transaction: {
        findUnique: jest.fn().mockResolvedValue(mockTx),
      },
    };

    jest.spyOn(mockPrismaService, '$transaction').mockImplementation(async (cb: any) => cb(mockTxClient));

    const dto = {
      reasonCode: 'SALAH_INPUT_ANGKA',
      remark: 'Koreksi gross weight keliru dari tiket manual',
      expectedRevision: 1, // Client expected revision 1
      items: [
        {
          targetModule: CorrectionTargetModule.TRANSACTION,
          fieldName: 'grossWeight',
          newValue: 15000,
        },
      ],
    };

    await expect(
      service.correctOperationLog('tx-1', dto as any, { id: 'adm-1', role: 'ADMIN', email: 'admin@gms.local' }),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw BadRequestException if field is in Denylist / not on Allowlist', async () => {
    const mockTx = {
      id: 'tx-1',
      status: 'COMPLETED',
      revision: 1,
      createdById: 'orig-operator',
    };

    const mockTxClient = {
      transaction: {
        findUnique: jest.fn().mockResolvedValue(mockTx),
      },
    };

    jest.spyOn(mockPrismaService, '$transaction').mockImplementation(async (cb: any) => cb(mockTxClient));

    const dto = {
      reasonCode: 'LAINNYA',
      remark: 'Mencoba mengoreksi identitas penginput awal (dilarang keras)',
      expectedRevision: 1,
      items: [
        {
          targetModule: CorrectionTargetModule.TRANSACTION,
          fieldName: 'createdById', // BANNED FIELD!
          newValue: 'new-operator',
        },
      ],
    };

    await expect(
      service.correctOperationLog('tx-1', dto as any, { id: 'adm-1', role: 'ADMIN', email: 'admin@gms.local' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should successfully execute 12-step atomic correction with optional evidenceUrl (undefined)', async () => {
    const mockTx = {
      id: 'tx-1',
      status: 'COMPLETED',
      revision: 1,
      grossWeight: 10000,
      tareWeight: 3000,
      netWeight: 7000,
      actualWeight: 7050,
    };

    const mockCorrection = { id: 'cor-991', correctionNumber: 'COR-2026-10291', items: [] };
    const mockUpdatedTx = { ...mockTx, grossWeight: 11000, netWeight: 8000, revision: 2 };

    const mockTxClient = {
      transaction: {
        findUnique: jest.fn().mockResolvedValue(mockTx),
        update: jest.fn().mockResolvedValue(mockUpdatedTx),
      },
      transactionCorrection: {
        create: jest.fn().mockResolvedValue(mockCorrection),
      },
      fraudCheck: {
        create: jest.fn().mockResolvedValue({ id: 'fc-1' }),
      },
    };

    jest.spyOn(mockPrismaService, '$transaction').mockImplementation(async (cb: any) => cb(mockTxClient));
    jest.spyOn(mockActivityLogsService, 'logAction').mockResolvedValue(true as any);

    const dto = {
      action: CorrectionAction.CORRECT_DATA,
      reasonCode: 'SALAH_INPUT_ANGKA',
      remark: 'Koreksi penimbangan gross dari tiket timbang fisik nomor #9981',
      evidenceUrl: undefined, // OPTIONAL ATTACHMENT ASSURANCE
      expectedRevision: 1,
      items: [
        {
          targetModule: CorrectionTargetModule.TRANSACTION,
          fieldName: 'grossWeight',
          newValue: 11000,
        },
      ],
    };

    const res = await service.correctOperationLog('tx-1', dto as any, {
      id: 'adm-1',
      role: 'ADMIN',
      email: 'admin@gms.local',
    });

    expect(res.success).toBe(true);
    expect(mockTxClient.transactionCorrection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          evidenceUrl: null,
          items: expect.objectContaining({
            createMany: expect.objectContaining({
              data: expect.arrayContaining([
                expect.objectContaining({
                  fieldName: 'grossWeight',
                  oldValue: 10000, // AUTO EXTRACTED OLD VALUE
                  newValue: 11000,
                }),
              ]),
            }),
          }),
        }),
      }),
    );
    expect(mockTxClient.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: expect.objectContaining({
        grossWeight: 11000,
        netWeight: 8000, // RECALCULATED NET WEIGHT
        revision: 2, // INCREMENTED REVISION
      }),
    });
    expect(mockActivityLogsService.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OPERATION_LOG_CORRECTED',
        status: 'SUCCESS',
      }),
      mockTxClient,
    );
  });
});
