import { Test, TestingModule } from '@nestjs/testing';
import { OperationLogCorrectionService } from './operation-log-correction.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
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
      updateMany: jest.fn(),
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
        {
          reasonCode: 'TYPO',
          remark: 'Koreksi typo lapangan #1234',
          expectedRevision: 1,
          items: [],
        } as any,
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

    jest
      .spyOn(mockPrismaService, '$transaction')
      .mockImplementation(async (cb: any) => cb(mockTxClient));

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
      service.correctOperationLog('tx-1', dto as any, {
        id: 'adm-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      }),
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

    jest
      .spyOn(mockPrismaService, '$transaction')
      .mockImplementation(async (cb: any) => cb(mockTxClient));

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
      service.correctOperationLog('tx-1', dto as any, {
        id: 'adm-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException if all items are identical (No-Op guard)', async () => {
    const mockTx = {
      id: 'tx-1',
      status: 'COMPLETED',
      revision: 1,
      grossWeight: 10000,
    };

    const mockTxClient = {
      transaction: {
        findUnique: jest.fn().mockResolvedValue(mockTx),
      },
    };

    jest
      .spyOn(mockPrismaService, '$transaction')
      .mockImplementation(async (cb: any) => cb(mockTxClient));

    const dto = {
      action: CorrectionAction.CORRECT_DATA,
      reasonCode: 'TYPO',
      remark: 'Mencoba submit nilai yang sama persis',
      expectedRevision: 1,
      items: [
        {
          targetModule: CorrectionTargetModule.TRANSACTION,
          fieldName: 'grossWeight',
          newValue: 10000, // IDENTICAL VALUE!
        },
      ],
    };

    await expect(
      service.correctOperationLog('tx-1', dto as any, {
        id: 'adm-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should successfully execute atomic correction with updateMany OCC check', async () => {
    const mockTx = {
      id: 'tx-1',
      status: 'COMPLETED',
      revision: 1,
      grossWeight: 10000,
      tareWeight: 3000,
      netWeight: 7000,
      actualWeight: 7050,
    };

    const mockCorrection = {
      id: 'cor-991',
      correctionNumber: 'COR-2026-10291',
      items: [],
    };
    const mockUpdatedTx = {
      ...mockTx,
      grossWeight: 11000,
      netWeight: 8000,
      revision: 2,
    };

    const mockTxClient = {
      transaction: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(mockTx)
          .mockResolvedValueOnce(mockUpdatedTx),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      transactionCorrection: {
        create: jest.fn().mockResolvedValue(mockCorrection),
      },
      fraudCheck: {
        create: jest.fn().mockResolvedValue({ id: 'fc-1' }),
      },
    };

    jest
      .spyOn(mockPrismaService, '$transaction')
      .mockImplementation(async (cb: any) => cb(mockTxClient));
    jest
      .spyOn(mockActivityLogsService, 'logAction')
      .mockResolvedValue(true as any);

    const dto = {
      action: CorrectionAction.CORRECT_DATA,
      reasonCode: 'SALAH_INPUT_ANGKA',
      remark: 'Koreksi penimbangan gross dari tiket timbang fisik nomor #9981',
      evidenceUrl: undefined,
      expectedRevision: 1,
      items: [
        {
          targetModule: CorrectionTargetModule.TRANSACTION,
          fieldName: 'grossWeight',
          newValue: 11000,
        },
      ],
    };

    const res = await service.correctOperationLog('tx-1', dto, {
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
                  oldValue: 10000,
                  newValue: 11000,
                }),
              ]),
            }),
          }),
        }),
      }),
    );
    expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: 'tx-1', revision: 1 },
      data: expect.objectContaining({
        grossWeight: 11000,
        netWeight: 8000, // RECALCULATED NET WEIGHT
        revision: { increment: 1 }, // ATOMIC OCC INCREMENT
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

  it('should throw BadRequestException if transaction status is non-terminal (e.g. REGISTERED)', async () => {
    const mockTx = {
      id: 'tx-active',
      status: 'REGISTERED',
      revision: 1,
    };

    const mockTxClient = {
      transaction: {
        findUnique: jest.fn().mockResolvedValue(mockTx),
      },
    };

    jest
      .spyOn(mockPrismaService, '$transaction')
      .mockImplementation(async (cb: any) => cb(mockTxClient));

    const dto = {
      reasonCode: 'TYPO',
      remark: 'Koreksi transaksi aktif',
      expectedRevision: 1,
      items: [
        {
          targetModule: CorrectionTargetModule.TRANSACTION,
          fieldName: 'driverName',
          newValue: 'John Doe',
        },
      ],
    };

    await expect(
      service.correctOperationLog('tx-active', dto as any, {
        id: 'adm-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException if proposed grossWeight < tareWeight', async () => {
    const mockTx = {
      id: 'tx-1',
      status: 'COMPLETED',
      revision: 1,
      grossWeight: 10000,
      tareWeight: 12000,
    };

    const mockTxClient = {
      transaction: {
        findUnique: jest.fn().mockResolvedValue(mockTx),
      },
    };

    jest
      .spyOn(mockPrismaService, '$transaction')
      .mockImplementation(async (cb: any) => cb(mockTxClient));

    const dto = {
      reasonCode: 'SALAH_INPUT',
      remark: 'Koreksi berat gross lebih kecil dari tare',
      expectedRevision: 1,
      items: [
        {
          targetModule: CorrectionTargetModule.TRANSACTION,
          fieldName: 'grossWeight',
          newValue: 5000, // Proposed Gross 5000 < Tare 12000!
        },
      ],
    };

    await expect(
      service.correctOperationLog('tx-1', dto as any, {
        id: 'adm-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException if proposed warehouseStartAt > warehouseEndAt', async () => {
    const mockTx = {
      id: 'tx-1',
      status: 'COMPLETED',
      revision: 1,
      warehouseProcesses: [
        {
          id: 'wh-1',
          startAt: new Date('2026-08-08T10:00:00Z'),
          endAt: new Date('2026-08-08T09:00:00Z'),
        },
      ],
      warehouseStartAt: new Date('2026-08-08T10:00:00Z'),
      warehouseEndAt: new Date('2026-08-08T09:00:00Z'), // Start > End!
    };

    const mockTxClient = {
      transaction: {
        findUnique: jest.fn().mockResolvedValue(mockTx),
      },
      warehouseProcess: {
        update: jest.fn().mockResolvedValue({}),
      },
    };

    jest
      .spyOn(mockPrismaService, '$transaction')
      .mockImplementation(async (cb: any) => cb(mockTxClient));

    const dto = {
      reasonCode: 'SALAH_INPUT',
      remark: 'Koreksi waktu gudang invalid',
      expectedRevision: 1,
      items: [
        {
          targetModule: CorrectionTargetModule.WAREHOUSE,
          targetRecordId: 'wh-1',
          fieldName: 'startAt',
          newValue: '2026-08-08T12:00:00Z',
        },
      ],
    };

    await expect(
      service.correctOperationLog('tx-1', dto as any, {
        id: 'adm-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should execute REOPEN_WORKFLOW and supersede downstream current records', async () => {
    const mockTx = {
      id: 'tx-reopen',
      status: 'COMPLETED',
      revision: 3,
    };

    const mockCorrection = {
      id: 'cor-reopen',
      correctionNumber: 'COR-2026-REOPEN01',
      items: [],
    };

    const mockTxClient = {
      transaction: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(mockTx)
          .mockResolvedValueOnce({
            ...mockTx,
            status: 'QC_VEHICLE_PENDING',
            revision: 4,
          }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      transactionCorrection: {
        create: jest.fn().mockResolvedValue(mockCorrection),
      },
      transactionStatusHistory: {
        create: jest.fn().mockResolvedValue({ id: 'tsh-1' }),
      },
      qcVehicleCheck: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      incomingMaterialCheck: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      warehouseProcess: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      weighbridgeRecord: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    jest
      .spyOn(mockPrismaService, '$transaction')
      .mockImplementation(async (cb: any) => cb(mockTxClient));
    jest
      .spyOn(mockActivityLogsService, 'logAction')
      .mockResolvedValue(true as any);

    const dto = {
      action: CorrectionAction.REOPEN_WORKFLOW,
      reasonCode: 'REOPEN_REQUESTED',
      remark: 'Membalikkan status transaksi untuk pemeriksaan ulang QC',
      expectedRevision: 3,
      items: [],
    };

    const res = await service.correctOperationLog('tx-reopen', dto, {
      id: 'adm-1',
      role: 'ADMIN',
      email: 'admin@gms.local',
    });

    expect(res.success).toBe(true);
    expect(mockTxClient.qcVehicleCheck.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { transactionId: 'tx-reopen', isCurrent: true },
        data: expect.objectContaining({ isCurrent: false }),
      }),
    );
    expect(mockTxClient.incomingMaterialCheck.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { transactionId: 'tx-reopen', isCurrent: true },
        data: expect.objectContaining({ isCurrent: false }),
      }),
    );
    expect(mockTxClient.warehouseProcess.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { transactionId: 'tx-reopen', isCurrent: true },
        data: expect.objectContaining({ isCurrent: false }),
      }),
    );
    expect(mockTxClient.weighbridgeRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { transactionId: 'tx-reopen', type: 'OUT', isCurrent: true },
        data: expect.objectContaining({ isCurrent: false }),
      }),
    );
  });
});
