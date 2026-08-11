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

  const createMockTxClient = (mockTx: any, mockUpdatedTx?: any) => ({
    transaction: {
      findUnique: mockUpdatedTx
        ? jest
            .fn()
            .mockResolvedValueOnce(mockTx)
            .mockResolvedValueOnce(mockUpdatedTx)
        : jest.fn().mockResolvedValue(mockTx),
      update: jest.fn().mockResolvedValue(mockTx),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    transactionCorrection: {
      create: jest
        .fn()
        .mockResolvedValue({ id: 'cor-1', correctionNumber: 'COR-001' }),
      update: jest.fn().mockResolvedValue({ id: 'cor-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    transactionCorrectionItem: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    transactionStatusHistory: {
      create: jest.fn().mockResolvedValue({ id: 'tsh-1' }),
    },
    weighbridgeRecord: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest
        .fn()
        .mockResolvedValue({ id: 'wb-new-1', revision: 2, isCurrent: true }),
      update: jest.fn().mockResolvedValue({ id: 'wb-1' }),
    },
    warehouseProcess: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest
        .fn()
        .mockResolvedValue({ id: 'wh-new-1', revision: 2, isCurrent: true }),
      update: jest.fn().mockResolvedValue({ id: 'wh-1' }),
    },
    qcVehicleCheck: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest
        .fn()
        .mockResolvedValue({ id: 'qcv-new-1', revision: 2, isCurrent: true }),
      update: jest.fn().mockResolvedValue({ id: 'qcv-1' }),
    },
    incomingMaterialCheck: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest
        .fn()
        .mockResolvedValue({ id: 'inc-new-1', revision: 2, isCurrent: true }),
      update: jest.fn().mockResolvedValue({ id: 'inc-1' }),
    },
    attachment: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest
        .fn()
        .mockResolvedValue({ id: 'att-new-1', revision: 2, isCurrent: true }),
      update: jest.fn().mockResolvedValue({ id: 'att-1' }),
    },
    fraudCheck: {
      create: jest.fn().mockResolvedValue({ id: 'fc-1' }),
    },
  });

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
      revision: 2,
    };

    const mockTxClient = createMockTxClient(mockTx);

    jest
      .spyOn(mockPrismaService, '$transaction')
      .mockImplementation(async (cb: any) => cb(mockTxClient));

    const dto = {
      reasonCode: 'SALAH_INPUT_ANGKA',
      remark: 'Koreksi gross weight keliru dari tiket manual',
      expectedRevision: 1,
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

    const mockTxClient = createMockTxClient(mockTx);

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
          fieldName: 'createdById',
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

    const mockTxClient = createMockTxClient(mockTx);

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
          newValue: 10000,
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

    const mockUpdatedTx = {
      ...mockTx,
      grossWeight: 11000,
      netWeight: 8000,
      revision: 2,
    };

    const mockTxClient = createMockTxClient(mockTx, mockUpdatedTx);

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
          action: CorrectionAction.CORRECT_DATA,
        }),
      }),
    );
    expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: 'tx-1', revision: 1 },
      data: expect.objectContaining({
        grossWeight: 11000,
        netWeight: 8000,
        revision: { increment: 1 },
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

    const mockTxClient = createMockTxClient(mockTx);

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

    const mockTxClient = createMockTxClient(mockTx);

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
          newValue: 5000,
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
          revision: 1,
          isCurrent: true,
        },
      ],
      warehouseStartAt: new Date('2026-08-08T10:00:00Z'),
      warehouseEndAt: new Date('2026-08-08T09:00:00Z'),
    };

    const mockTxClient = createMockTxClient(mockTx);

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

    const mockUpdatedTx = {
      ...mockTx,
      status: 'QC_VEHICLE_PENDING',
      revision: 4,
    };

    const mockTxClient = createMockTxClient(mockTx, mockUpdatedTx);

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
  });

  describe('Weighbridge ProcessType-Aware Corrections', () => {
    it('should map GBB IN correction to grossWeight and recalculate netWeight', async () => {
      const mockTx = {
        id: 'tx-gbb',
        status: 'COMPLETED',
        processType: 'GBB',
        revision: 1,
        grossWeight: 18000,
        tareWeight: 8000,
        netWeight: 10000,
        weighbridgeRecords: [
          {
            id: 'wb-in',
            type: 'IN',
            weight: 18000,
            revision: 1,
            isCurrent: true,
          },
        ],
      };

      const mockTxClient = createMockTxClient(mockTx);

      jest
        .spyOn(mockPrismaService, '$transaction')
        .mockImplementation(async (cb: any) => cb(mockTxClient));

      const dto = {
        action: CorrectionAction.CORRECT_DATA,
        reasonCode: 'SALAH_INPUT_ANGKA',
        remark: 'Koreksi Gross GBB IN',
        expectedRevision: 1,
        items: [
          {
            targetModule: CorrectionTargetModule.WEIGHBRIDGE,
            targetRecordId: 'wb-in',
            fieldName: 'weight',
            newValue: 19000,
          },
        ],
      };

      await service.correctOperationLog('tx-gbb', dto, {
        id: 'adm-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      });

      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            grossWeight: 19000,
            netWeight: 11000,
          }),
        }),
      );
    });

    it('should map GBJ IN correction to tareWeight and recalculate netWeight', async () => {
      const mockTx = {
        id: 'tx-gbj',
        status: 'COMPLETED',
        processType: 'GBJ',
        revision: 1,
        grossWeight: 18000,
        tareWeight: 8000,
        netWeight: 10000,
        weighbridgeRecords: [
          {
            id: 'wb-in-gbj',
            type: 'IN',
            weight: 8000,
            revision: 1,
            isCurrent: true,
          },
        ],
      };

      const mockTxClient = createMockTxClient(mockTx);

      jest
        .spyOn(mockPrismaService, '$transaction')
        .mockImplementation(async (cb: any) => cb(mockTxClient));

      const dto = {
        action: CorrectionAction.CORRECT_DATA,
        reasonCode: 'SALAH_INPUT_ANGKA',
        remark: 'Koreksi Tare GBJ IN',
        expectedRevision: 1,
        items: [
          {
            targetModule: CorrectionTargetModule.WEIGHBRIDGE,
            targetRecordId: 'wb-in-gbj',
            fieldName: 'weight',
            newValue: 8200,
          },
        ],
      };

      await service.correctOperationLog('tx-gbj', dto, {
        id: 'adm-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      });

      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tareWeight: 8200,
            netWeight: 9800,
          }),
        }),
      );
    });

    it('should map GBJ OUT correction to grossWeight and recalculate netWeight', async () => {
      const mockTx = {
        id: 'tx-gbj-out',
        status: 'COMPLETED',
        processType: 'GBJ',
        revision: 1,
        grossWeight: 18000,
        tareWeight: 8000,
        netWeight: 10000,
        weighbridgeRecords: [
          {
            id: 'wb-out-gbj',
            type: 'OUT',
            weight: 18000,
            revision: 1,
            isCurrent: true,
          },
        ],
      };

      const mockTxClient = createMockTxClient(mockTx);

      jest
        .spyOn(mockPrismaService, '$transaction')
        .mockImplementation(async (cb: any) => cb(mockTxClient));

      const dto = {
        action: CorrectionAction.CORRECT_DATA,
        reasonCode: 'SALAH_INPUT_ANGKA',
        remark: 'Koreksi Gross GBJ OUT',
        expectedRevision: 1,
        items: [
          {
            targetModule: CorrectionTargetModule.WEIGHBRIDGE,
            targetRecordId: 'wb-out-gbj',
            fieldName: 'weight',
            newValue: 18500,
          },
        ],
      };

      await service.correctOperationLog('tx-gbj-out', dto, {
        id: 'adm-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      });

      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            grossWeight: 18500,
            netWeight: 10500,
          }),
        }),
      );
    });

    it('should correctly map GBB/GSP OUT correction to tareWeight and recompute netWeight', async () => {
      const mockTx = {
        id: 'tx-gbb-out',
        status: 'COMPLETED',
        processType: 'GBB',
        grossWeight: 20000,
        tareWeight: 8000,
        netWeight: 12000,
        revision: 1,
        weighbridgeRecords: [
          {
            id: 'wb-out-gbb',
            type: 'OUT',
            weight: 8000,
            revision: 1,
            isCurrent: true,
          },
        ],
      };

      const mockTxClient = createMockTxClient(mockTx);

      jest
        .spyOn(mockPrismaService, '$transaction')
        .mockImplementation(async (cb: any) => cb(mockTxClient));

      const dto = {
        action: CorrectionAction.CORRECT_DATA,
        reasonCode: 'SALAH_INPUT_ANGKA',
        remark: 'Koreksi Tare GBB OUT',
        expectedRevision: 1,
        items: [
          {
            targetModule: CorrectionTargetModule.WEIGHBRIDGE,
            targetRecordId: 'wb-out-gbb',
            fieldName: 'weight',
            newValue: 7500,
          },
        ],
      };

      await service.correctOperationLog('tx-gbb-out', dto, {
        id: 'adm-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      });

      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tareWeight: 7500,
            netWeight: 12500,
          }),
        }),
      );
    });

    it('should group 5+ QC_VEHICLE fields into a single successor creation call', async () => {
      const mockTx = {
        id: 'tx-qc-batch',
        status: 'COMPLETED',
        processType: 'GBB',
        revision: 1,
        qcVehicleChecks: [
          {
            id: 'qcv-1',
            result: 'REJECT',
            vehicleCleanliness: 'REJECT',
            vehicleOdor: 'REJECT',
            pestEvidence: 'REJECT',
            vehicleCondition: 'REJECT',
            notes: 'Kondisi kotor',
            revision: 1,
            isCurrent: true,
          },
        ],
      };

      const mockTxClient = createMockTxClient(mockTx);

      jest
        .spyOn(mockPrismaService, '$transaction')
        .mockImplementation(async (cb: any) => cb(mockTxClient));

      const dto = {
        action: CorrectionAction.CORRECT_DATA,
        reasonCode: 'SALAH_INPUT_LAPANGAN',
        remark: 'Koreksi 5 field QC sekaligus dari hasil audit ulang',
        expectedRevision: 1,
        items: [
          {
            targetModule: CorrectionTargetModule.QC_VEHICLE,
            targetRecordId: 'qcv-1',
            fieldName: 'result',
            newValue: 'PASS',
          },
          {
            targetModule: CorrectionTargetModule.QC_VEHICLE,
            targetRecordId: 'qcv-1',
            fieldName: 'vehicleCleanliness',
            newValue: 'PASS',
          },
          {
            targetModule: CorrectionTargetModule.QC_VEHICLE,
            targetRecordId: 'qcv-1',
            fieldName: 'vehicleOdor',
            newValue: 'PASS',
          },
          {
            targetModule: CorrectionTargetModule.QC_VEHICLE,
            targetRecordId: 'qcv-1',
            fieldName: 'pestEvidence',
            newValue: 'PASS',
          },
          {
            targetModule: CorrectionTargetModule.QC_VEHICLE,
            targetRecordId: 'qcv-1',
            fieldName: 'vehicleCondition',
            newValue: 'PASS',
          },
        ],
      };

      await service.correctOperationLog('tx-qc-batch', dto as any, {
        id: 'adm-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      });

      // Verify ONLY ONE updateMany and ONE create occurred for the target qcVehicleCheck
      expect(mockTxClient.qcVehicleCheck.updateMany).toHaveBeenCalledTimes(1);
      expect(mockTxClient.qcVehicleCheck.create).toHaveBeenCalledTimes(1);
      expect(mockTxClient.qcVehicleCheck.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            result: 'PASS',
            vehicleCleanliness: 'PASS',
            vehicleOdor: 'PASS',
            pestEvidence: 'PASS',
            vehicleCondition: 'PASS',
            revision: 2,
            isCurrent: true,
          }),
        }),
      );
    });

    it('should reject reopenTargetStatus if action is not REOPEN_WORKFLOW', async () => {
      const dto = {
        action: CorrectionAction.CORRECT_DATA,
        reopenTargetStatus: 'QC_VEHICLE_PENDING',
        reasonCode: 'SALAH_ACTION',
        remark: 'Percobaan reopen via CORRECT_DATA (harus ditolak)',
        expectedRevision: 1,
        items: [],
      };

      await expect(
        service.correctOperationLog('tx-1', dto as any, {
          id: 'adm-1',
          role: 'ADMIN',
          email: 'admin@gms.local',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
