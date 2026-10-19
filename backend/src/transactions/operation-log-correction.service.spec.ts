import { Test, TestingModule } from '@nestjs/testing';
import { OperationLogCorrectionService } from './operation-log-correction.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  CorrectionAction,
  CorrectionTargetModule,
  TransactionStatus,
  QcResult,
} from '@prisma/client';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';

describe('OperationLogCorrectionService', () => {
  let service: OperationLogCorrectionService;
  let prismaService: PrismaService;
  let activityLogsService: ActivityLogsService;
  let authorizationScopeService: AuthorizationScopeService;

  const mockPrismaService = {
    $transaction: jest.fn(),
    transaction: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    transactionCorrection: {
      findMany: jest.fn(),
    },
    transactionStatusHistory: {
      findMany: jest.fn(),
    },
    activityLog: {
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
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'att-1', transactionId: 'tx-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest
        .fn()
        .mockResolvedValue({ id: 'att-new-1', revision: 2, isCurrent: true }),
      update: jest.fn().mockResolvedValue({ id: 'att-1' }),
    },
    fraudCheck: {
      create: jest.fn().mockResolvedValue({ id: 'fc-1' }),
    },
    qcProductAnalysis: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OperationLogCorrectionService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ActivityLogsService, useValue: mockActivityLogsService },
        {
          provide: AuthorizationScopeService,
          useValue: {
            getTransactionScope: jest.fn().mockReturnValue({}),
          },
        },
      ],
    }).compile();

    service = module.get<OperationLogCorrectionService>(
      OperationLogCorrectionService,
    );
    prismaService = module.get<PrismaService>(PrismaService);
    activityLogsService = module.get<ActivityLogsService>(ActivityLogsService);
    authorizationScopeService = module.get<AuthorizationScopeService>(
      AuthorizationScopeService,
    );
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

  it('should preserve warehouse received quantity and unit during copy-on-write correction', async () => {
    const receivedQuantity = { toString: () => '100.000' };
    const mockTx = {
      id: 'tx-warehouse-receipt',
      status: 'COMPLETED',
      revision: 4,
      warehouseProcesses: [
        {
          id: 'wh-receipt-1',
          transactionId: 'tx-warehouse-receipt',
          processType: 'GSP',
          startAt: new Date('2026-10-01T01:00:00Z'),
          endAt: new Date('2026-10-01T02:00:00Z'),
          startById: 'usr-start',
          endById: 'usr-end',
          actualWeight: 100,
          actualQuantity: 100,
          receivedQuantity,
          receivedUnit: 'KG',
          unit: 'KG',
          palletCount: null,
          bagCount: null,
          rollCount: null,
          condition: 'GOOD',
          remarks: 'original remarks',
          checklistItems: [],
          revision: 2,
          isCurrent: true,
        },
      ],
    };
    const mockTxClient = createMockTxClient(mockTx);
    jest
      .spyOn(mockPrismaService, '$transaction')
      .mockImplementation(async (cb: any) => cb(mockTxClient));

    await service.correctOperationLog(
      'tx-warehouse-receipt',
      {
        action: CorrectionAction.CORRECT_DATA,
        reasonCode: 'SALAH_INPUT',
        remark: 'Koreksi catatan tanpa mengubah data penerimaan',
        expectedRevision: 4,
        items: [
          {
            targetModule: CorrectionTargetModule.WAREHOUSE,
            targetRecordId: 'wh-receipt-1',
            fieldName: 'remarks',
            newValue: 'corrected remarks',
          },
        ],
      },
      {
        id: 'adm-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      },
    );

    expect(mockTxClient.warehouseProcess.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        receivedQuantity,
        receivedUnit: 'KG',
        remarks: 'corrected remarks',
        revision: 3,
      }),
    });
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
      reopenTargetStatus: 'QC_VEHICLE_PENDING' as any,
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

      await service.correctOperationLog('tx-qc-batch', dto, {
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

    it('should preserve attachmentLineageId when correcting an ATTACHMENT record (P0-03)', async () => {
      const mockTx = {
        id: 'tx-att-1',
        revision: 1,
        status: 'COMPLETED',
        attachments: [
          {
            id: 'att-1',
            attachmentLineageId: 'lineage-uuid-12345',
            transactionId: 'tx-att-1',
            module: 'QC',
            attachmentType: 'PHOTO',
            originalName: 'foto_lama.jpg',
            fileName: 'file-1.jpg',
            filePath: 'qc/file-1.jpg',
            mimeType: 'image/jpeg',
            size: 1024,
            description: 'Deskripsi lama',
            uploadedById: 'user-1',
            sha256: 'abc123sha',
            revision: 1,
            isCurrent: true,
          },
        ],
      };

      const mockTxClient = createMockTxClient(mockTx);
      mockPrismaService.$transaction.mockImplementation((cb: any) =>
        cb(mockTxClient),
      );

      const dto = {
        action: CorrectionAction.CORRECT_DATA,
        reasonCode: 'SALAH_DESKRIPSI',
        remark: 'Koreksi deskripsi foto',
        expectedRevision: 1,
        items: [
          {
            targetModule: CorrectionTargetModule.ATTACHMENT,
            targetRecordId: 'att-1',
            fieldName: 'description',
            newValue: 'Deskripsi baru revisi 2',
          },
        ],
      };

      await service.correctOperationLog('tx-att-1', dto, {
        id: 'adm-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      });

      expect(mockTxClient.attachment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attachmentLineageId: 'lineage-uuid-12345',
            description: 'Deskripsi baru revisi 2',
            revision: 2,
            isCurrent: true,
          }),
        }),
      );
    });

    it('should clear cancellation fields and supersede IN weighbridge when reopening CANCELLED to REGISTERED (P0-04)', async () => {
      const mockTx = {
        id: 'tx-cancel-1',
        status: 'CANCELLED',
        processType: 'GBB',
        cancelledAt: new Date(),
        cancelledById: 'usr-1',
        cancellationReason: 'Salah input vendor',
        revision: 1,
      };

      const mockTxClient = createMockTxClient(mockTx);
      mockPrismaService.$transaction.mockImplementation((cb: any) =>
        cb(mockTxClient),
      );

      const dto = {
        action: CorrectionAction.REOPEN_WORKFLOW,
        reopenTargetStatus: 'REGISTERED' as any,
        reasonCode: 'REOPEN_CANCELLED',
        remark: 'Buka kembali transaksi batal',
        expectedRevision: 1,
        items: [],
      };

      await service.correctOperationLog('tx-cancel-1', dto, {
        id: 'adm-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      });

      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'REGISTERED',
            cancelledAt: null,
            cancelledById: null,
            cancellationReason: null,
            weighInAt: null,
          }),
        }),
      );

      // Verify IN weighbridge record was superseded for REGISTERED reopen
      expect(mockTxClient.weighbridgeRecord.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'IN', isCurrent: true }),
        }),
      );
    });

    it('should retain upstream Vehicle QC and Warehouse processes when reopening GBB to INCOMING_CHECK_PENDING (P0-04)', async () => {
      const mockTx = {
        id: 'tx-gbb-comp',
        status: 'COMPLETED',
        processType: 'GBB',
        revision: 1,
      };

      const mockTxClient = createMockTxClient(mockTx);
      mockPrismaService.$transaction.mockImplementation((cb: any) =>
        cb(mockTxClient),
      );

      const dto = {
        action: CorrectionAction.REOPEN_WORKFLOW,
        reopenTargetStatus: 'INCOMING_CHECK_PENDING' as any,
        reasonCode: 'REOPEN_INCOMING',
        remark: 'Uji ulang sampel QC incoming GBB',
        expectedRevision: 1,
        items: [],
      };

      await service.correctOperationLog('tx-gbb-comp', dto, {
        id: 'adm-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      });

      // Incoming check should be superseded
      expect(
        mockTxClient.incomingMaterialCheck.updateMany,
      ).toHaveBeenCalledTimes(1);
      // Vehicle QC and Warehouse should NOT be superseded for INCOMING_CHECK_PENDING
      expect(mockTxClient.qcVehicleCheck.updateMany).not.toHaveBeenCalled();
      expect(mockTxClient.warehouseProcess.updateMany).not.toHaveBeenCalled();
    });

    it('should reject reopenTargetStatus if action is not REOPEN_WORKFLOW', async () => {
      const dto = {
        action: CorrectionAction.CORRECT_DATA,
        reopenTargetStatus: 'QC_VEHICLE_PENDING' as any,
        reasonCode: 'SALAH_ACTION',
        remark: 'Percobaan reopen via CORRECT_DATA (harus ditolak)',
        expectedRevision: 1,
        items: [
          {
            targetModule: 'WEIGHBRIDGE' as any,
            targetRecordId: 'wb-1',
            fieldName: 'weight',
            newValue: 1000,
          },
        ],
      };

      await expect(
        service.correctOperationLog('tx-1', dto, {
          id: 'adm-1',
          role: 'ADMIN',
          email: 'admin@gms.local',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject REOPEN_WORKFLOW if reopenTargetStatus is missing', async () => {
      const dto = {
        action: CorrectionAction.REOPEN_WORKFLOW,
        reasonCode: 'SALAH_INPUT',
        remark: 'Reopen tanpa target status',
        expectedRevision: 1,
      };

      await expect(
        service.correctOperationLog('tx-1', dto, {
          id: 'adm-1',
          role: 'ADMIN',
          email: 'admin@gms.local',
        }),
      ).rejects.toThrow('reopenTargetStatus wajib diisi');
    });

    it('should reject REOPEN_WORKFLOW if combined with field correction items', async () => {
      const dto = {
        action: CorrectionAction.REOPEN_WORKFLOW,
        reopenTargetStatus: 'QC_VEHICLE_PENDING' as any,
        reasonCode: 'SALAH_INPUT',
        remark: 'Reopen digabung dengan item koreksi',
        expectedRevision: 1,
        items: [
          {
            targetModule: 'WEIGHBRIDGE' as any,
            targetRecordId: 'wb-1',
            fieldName: 'weight',
            newValue: 1000,
          },
        ],
      };

      await expect(
        service.correctOperationLog('tx-1', dto, {
          id: 'adm-1',
          role: 'ADMIN',
          email: 'admin@gms.local',
        }),
      ).rejects.toThrow(
        'REOPEN_WORKFLOW tidak boleh digabung dengan items koreksi data',
      );
    });

    it('should reject REOPEN_WORKFLOW to INCOMING_CHECK_PENDING for GBJ transaction', async () => {
      const mockTx = {
        id: 'tx-gbj-1',
        status: 'COMPLETED',
        processType: 'GBJ',
        revision: 1,
      };
      const mockTxClient = createMockTxClient(mockTx);
      mockPrismaService.$transaction.mockImplementation((cb: any) =>
        cb(mockTxClient),
      );

      const dto = {
        action: CorrectionAction.REOPEN_WORKFLOW,
        reopenTargetStatus: 'INCOMING_CHECK_PENDING' as any,
        reasonCode: 'SALAH_INPUT',
        remark: 'Percobaan reopen GBJ ke incoming check',
        expectedRevision: 1,
      };

      await expect(
        service.correctOperationLog('tx-gbj-1', dto, {
          id: 'adm-1',
          role: 'ADMIN',
          email: 'admin@gms.local',
        }),
      ).rejects.toThrow(
        'Target status INCOMING_CHECK_PENDING tidak diizinkan untuk REOPEN_WORKFLOW transaksi tipe GBJ',
      );
    });

    it('should reject REOPEN_WORKFLOW if processType is unknown or unsupported', async () => {
      const mockTx = {
        id: 'tx-unknown-1',
        status: 'COMPLETED',
        processType: 'UNKNOWN_TYPE',
        revision: 1,
      };
      const mockTxClient = createMockTxClient(mockTx);
      mockPrismaService.$transaction.mockImplementation((cb: any) =>
        cb(mockTxClient),
      );

      const dto = {
        action: CorrectionAction.REOPEN_WORKFLOW,
        reopenTargetStatus: 'REGISTERED' as any,
        reasonCode: 'SALAH_INPUT',
        remark: 'Percobaan reopen processType tidak dikenal',
        expectedRevision: 1,
      };

      await expect(
        service.correctOperationLog('tx-unknown-1', dto, {
          id: 'adm-1',
          role: 'ADMIN',
          email: 'admin@gms.local',
        }),
      ).rejects.toThrow(
        'Unsupported processType for REOPEN_WORKFLOW: UNKNOWN_TYPE',
      );
    });

    it('should set status to QC_VEHICLE_PASSED and supersede warehouse processes when reopening to warehouse ready stage', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        status: 'COMPLETED',
        processType: 'GBB',
        revision: 1,
        weighbridgeRecords: [],
        warehouseProcesses: [{ id: 'wh-1', processType: 'GBB', revision: 1 }],
        qcVehicleChecks: [],
        incomingMaterialChecks: [],
        attachments: [],
      });

      const mockTxClient = {
        transactionCorrection: {
          create: jest.fn().mockResolvedValue({ id: 'cor-99' }),
          update: jest.fn().mockResolvedValue({ id: 'cor-99' }),
        },
        transactionCorrectionItem: { createMany: jest.fn() },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({ id: 'tsh-1' }),
        },
        weighbridgeRecord: { updateMany: jest.fn() },
        qcVehicleCheck: { updateMany: jest.fn() },
        incomingMaterialCheck: { updateMany: jest.fn() },
        warehouseProcess: {
          updateMany: jest.fn(),
          findFirst: jest.fn().mockResolvedValue({
            id: 'wh-1',
            processType: 'GBB',
            revision: 1,
          }),
          create: jest.fn().mockResolvedValue({ id: 'wh-2' }),
        },
        attachment: { updateMany: jest.fn() },
        transaction: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'tx-1',
            status: 'COMPLETED',
            processType: 'GBB',
            revision: 1,
            weighbridgeRecords: [],
            warehouseProcesses: [
              { id: 'wh-1', processType: 'GBB', revision: 1 },
            ],
            qcVehicleChecks: [],
            incomingMaterialChecks: [],
            attachments: [],
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      mockPrismaService.$transaction.mockImplementation((cb: any) =>
        cb(mockTxClient),
      );

      const dto = {
        action: CorrectionAction.REOPEN_WORKFLOW,
        reopenTargetStatus: 'QC_VEHICLE_PASSED' as any,
        reasonCode: 'REOPEN_GUDANG',
        remark: 'Reopen ke proses gudang',
        expectedRevision: 1,
      };

      await service.correctOperationLog('tx-1', dto, {
        id: 'adm-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      });

      expect(mockTxClient.warehouseProcess.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { transactionId: 'tx-1', isCurrent: true },
          data: expect.objectContaining({ isCurrent: false }),
        }),
      );
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tx-1', revision: 1 },
          data: expect.objectContaining({ status: 'QC_VEHICLE_PASSED' }),
        }),
      );
    });

    it('should reject correction if evidenceAttachmentId does not belong to the transaction (P1-08)', async () => {
      const mockTx = {
        id: 'tx-1',
        status: 'COMPLETED',
        revision: 1,
        commodityType: 'GBB',
      };
      const mockTxClient = createMockTxClient(mockTx);
      mockTxClient.attachment.findFirst = jest.fn().mockResolvedValue(null);

      mockPrismaService.$transaction.mockImplementation((cb: any) =>
        cb(mockTxClient),
      );

      const dto = {
        action: CorrectionAction.CORRECT_DATA,
        reasonCode: 'SALAH_INPUT_ANGKA',
        remark: 'Evidence test',
        expectedRevision: 1,
        evidenceAttachmentId: 'invalid-or-cross-tx-att-id',
        items: [
          {
            targetModule: CorrectionTargetModule.WEIGHBRIDGE,
            fieldName: 'grossWeight',
            newValue: 15000,
            targetRecordId: 'wb-1',
          },
        ],
      };

      await expect(
        service.correctOperationLog('tx-1', dto, {
          id: 'adm-1',
          role: 'ADMIN',
          email: 'admin@gms.local',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject correction if evidence attachment is not current (isCurrent=false) (P1-08)', async () => {
      const mockTx = {
        id: 'tx-1',
        status: 'COMPLETED',
        revision: 1,
        commodityType: 'GBB',
      };
      const mockTxClient = createMockTxClient(mockTx);
      // findFirst returns null because query filters for isCurrent: true
      mockTxClient.attachment.findFirst = jest
        .fn()
        .mockImplementation(({ where }) => {
          if (where?.isCurrent === true) return Promise.resolve(null);
          return Promise.resolve({
            id: 'att-stale',
            transactionId: 'tx-1',
            isCurrent: false,
            sha256: 'some-hash',
          });
        });

      mockPrismaService.$transaction.mockImplementation((cb: any) =>
        cb(mockTxClient),
      );

      const dto = {
        action: CorrectionAction.CORRECT_DATA,
        reasonCode: 'SALAH_INPUT_ANGKA',
        remark: 'Evidence test stale attachment',
        expectedRevision: 1,
        evidenceAttachmentId: 'att-stale',
        items: [
          {
            targetModule: CorrectionTargetModule.WEIGHBRIDGE,
            fieldName: 'grossWeight',
            newValue: 15000,
            targetRecordId: 'wb-1',
          },
        ],
      };

      await expect(
        service.correctOperationLog('tx-1', dto, {
          id: 'adm-1',
          role: 'ADMIN',
          email: 'admin@gms.local',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject correction if evidenceAttachmentId lacks verified sha256 checksum (P1-08)', async () => {
      const mockTx = {
        id: 'tx-1',
        status: 'COMPLETED',
        revision: 1,
      };
      const mockTxClient = createMockTxClient(mockTx);
      mockTxClient.attachment.findFirst = jest.fn().mockResolvedValue({
        id: 'att-no-hash',
        transactionId: 'tx-1',
        isCurrent: true,
        sha256: null,
      });

      mockPrismaService.$transaction.mockImplementation((cb: any) =>
        cb(mockTxClient),
      );

      const dto = {
        action: CorrectionAction.CORRECT_DATA,
        reasonCode: 'SALAH_INPUT_ANGKA',
        remark: 'Evidence test no hash',
        expectedRevision: 1,
        evidenceAttachmentId: 'att-no-hash',
        items: [
          {
            targetModule: CorrectionTargetModule.WEIGHBRIDGE,
            fieldName: 'grossWeight',
            newValue: 15000,
            targetRecordId: 'wb-1',
          },
        ],
      };

      await expect(
        service.correctOperationLog('tx-1', dto, {
          id: 'adm-1',
          role: 'ADMIN',
          email: 'admin@gms.local',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should correctly attribute originalCreatedBy to Transaction.createdBy (P1-08)', async () => {
      (mockPrismaService.transaction.findUnique as any) = jest
        .fn()
        .mockResolvedValue({
          id: 'tx-1',
          createdBy: { id: 'u-1', name: 'John Doe', role: 'SECURITY' },
          weighInBy: { id: 'u-2', name: 'Weigh Operator', role: 'TIMBANGAN' },
          warehouseStartBy: null,
          qcVehicleChecks: [],
        });
      (mockPrismaService.transactionCorrection.findMany as any) = jest
        .fn()
        .mockResolvedValue([]);

      const result = await service.getOperationLogCorrections('tx-1');
      expect(result.success).toBe(true);
      expect(result.attribution.originalCreatedBy).toBe('SECURITY — John Doe');
    });
  });

  describe('getUnifiedAuditHistory()', () => {
    it('should throw NotFoundException if transaction is outside authorization scope or not found', async () => {
      (
        authorizationScopeService.getTransactionScope as jest.Mock
      ).mockReturnValue({
        processType: { in: ['GBB'] },
      });
      mockPrismaService.transaction.findFirst.mockResolvedValue(null);

      await expect(
        service.getUnifiedAuditHistory('tx-outside-scope', {
          id: 'qc-user-1',
          role: 'QC',
          email: 'qc@plant03.com',
          warehouseAccess: ['GBB'],
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should assemble unified timeline from statusHistory, corrections, and activityLogs', async () => {
      (
        authorizationScopeService.getTransactionScope as jest.Mock
      ).mockReturnValue({});

      const mockTx = {
        id: 'tx-1',
        status: 'CANCELLED',
        revision: 3,
        isVoided: true,
        voidedAt: new Date('2026-08-21T09:00:00Z'),
        voidReasonCode: 'DUPLICATE_TRANSACTION',
        voidReason: 'Double registration by driver',
        createdBy: { id: 'sec-1', name: 'Budi', role: 'SECURITY' },
        voidedBy: { id: 'adm-1', name: 'Admin Alpha', role: 'ADMIN' },
      };

      mockPrismaService.transaction.findFirst.mockResolvedValue(mockTx);

      mockPrismaService.transactionStatusHistory.findMany.mockResolvedValue([
        {
          id: 'tsh-1',
          changedAt: new Date('2026-08-21T08:00:00Z'),
          oldStatus: null,
          newStatus: 'REGISTERED',
          notes: 'Initial check-in',
          changedBy: { id: 'sec-1', name: 'Budi', role: 'SECURITY' },
        },
      ]);

      mockPrismaService.transactionCorrection.findMany.mockResolvedValue([
        {
          id: 'cor-1',
          correctionNumber: 'COR-20260821-001',
          createdAt: new Date('2026-08-21T08:30:00Z'),
          reasonCode: 'TYPO_CORRECTION',
          remark: 'Corrected driver contact',
          correctedBy: { id: 'adm-1', name: 'Admin Alpha', role: 'ADMIN' },
          items: [
            {
              targetModule: 'TRANSACTION',
              fieldName: 'driverPhone',
              oldValue: '08123456789',
              newValue: '08129876543',
            },
          ],
        },
      ]);

      mockPrismaService.activityLog.findMany.mockResolvedValue([
        {
          id: 'act-1',
          createdAt: new Date('2026-08-21T09:00:00Z'),
          action: 'TRANSACTION_VOIDED',
          role: 'ADMIN',
          userName: 'Admin Alpha',
          description: JSON.stringify({
            reasonCode: 'DUPLICATE_TRANSACTION',
            reason: 'Double registration by driver',
            originalStatus: 'REGISTERED',
          }),
        },
      ]);

      const result = await service.getUnifiedAuditHistory('tx-1', {
        id: 'sec-1',
        role: 'SECURITY',
        email: 'sec@plant03.com',
      } as any);

      expect(result.success).toBe(true);
      expect(result.attribution.isVoided).toBe(true);
      expect(result.attribution.voidMetadata.voidReasonCode).toBe(
        'DUPLICATE_TRANSACTION',
      );
      expect(result.attribution.originalCreatedBy).toBe('SECURITY — Budi');
      expect(result.attribution.lastCorrectedBy).toBe('ADMIN — Admin Alpha');

      expect(result.timeline).toHaveLength(3);
      // Chronological sort check
      expect(result.timeline[0].eventType).toBe('STATUS_TRANSITION');
      expect(result.timeline[1].eventType).toBe('DATA_CORRECTION');
      expect(result.timeline[2].eventType).toBe('ADMIN_VOID');

      // Fail-closed PII masking check for SECURITY role
      expect(result.timeline[1].oldValue).toBe('0812****789');
      expect(result.timeline[1].newValue).toBe('0812****543');
    });

    it('should keep unmasked PII for ADMIN role in unified audit history', async () => {
      (
        authorizationScopeService.getTransactionScope as jest.Mock
      ).mockReturnValue({});

      const mockTx = {
        id: 'tx-2',
        status: 'IN_PROGRESS',
        revision: 2,
        isVoided: false,
        createdBy: { id: 'sec-1', name: 'Budi', role: 'SECURITY' },
      };

      mockPrismaService.transaction.findFirst.mockResolvedValue(mockTx);
      mockPrismaService.transactionStatusHistory.findMany.mockResolvedValue([]);
      mockPrismaService.transactionCorrection.findMany.mockResolvedValue([
        {
          id: 'cor-2',
          correctionNumber: 'COR-20260821-002',
          createdAt: new Date('2026-08-21T08:45:00Z'),
          reasonCode: 'PHONE_UPDATE',
          remark: 'Update driver phone',
          correctedBy: { id: 'adm-1', name: 'Admin Alpha', role: 'ADMIN' },
          items: [
            {
              targetModule: 'TRANSACTION',
              fieldName: 'driverPhone',
              oldValue: '08123456789',
              newValue: '08129876543',
            },
          ],
        },
      ]);
      mockPrismaService.activityLog.findMany.mockResolvedValue([]);

      const result = await service.getUnifiedAuditHistory('tx-2', {
        id: 'adm-1',
        role: 'ADMIN',
        email: 'admin@plant03.com',
      } as any);

      expect(result.success).toBe(true);
      expect(result.timeline[0].oldValue).toBe('08123456789');
      expect(result.timeline[0].newValue).toBe('08129876543');
    });

    it('should handle creator fallback branches and legacy activity log formats', async () => {
      (
        authorizationScopeService.getTransactionScope as jest.Mock
      ).mockReturnValue({});

      const mockTxWeighIn = {
        id: 'tx-fallback-1',
        status: 'CANCELLED',
        revision: 1,
        isVoided: true,
        voidedAt: new Date('2026-08-21T10:00:00Z'),
        voidedById: 'adm-1',
        voidReasonCode: 'OTHER',
        voidReason: 'Manual operator void',
        voidedBy: { id: 'adm-1', name: 'Super Admin', role: 'ADMIN' },
        weighInBy: { id: 'wb-1', name: 'Timbang User', role: 'WEIGHBRIDGE' },
      };

      mockPrismaService.transaction.findFirst.mockResolvedValue(mockTxWeighIn);
      mockPrismaService.transactionStatusHistory.findMany.mockResolvedValue([]);
      mockPrismaService.transactionCorrection.findMany.mockResolvedValue([
        {
          id: 'cor-reopen',
          action: 'REOPEN_WORKFLOW',
          correctionNumber: 'COR-20260821-003',
          createdAt: new Date('2026-08-21T08:30:00Z'),
          reasonCode: 'REOPEN_TEST',
          remark: 'Reopening to gate in',
          correctedBy: null,
          items: [],
        },
        {
          id: 'cor-legacy-status',
          action: 'CORRECT_RECORDED_STATUS',
          correctionNumber: 'COR-20260821-004',
          createdAt: new Date('2026-08-21T08:40:00Z'),
          reasonCode: 'STATUS_FIX',
          remark: 'Legacy status fix',
          correctedBy: { id: 'adm-1', name: 'Admin Alpha', role: 'ADMIN' },
          items: [],
        },
      ]);
      mockPrismaService.activityLog.findMany.mockResolvedValue([
        {
          id: 'act-legacy-del',
          createdAt: new Date('2026-08-21T09:30:00Z'),
          action: 'TRANSACTION_DELETE',
          role: 'ADMIN',
          userName: 'Legacy Admin',
          description: 'Deleted transaction manually without JSON',
        },
      ]);

      const result = await service.getUnifiedAuditHistory('tx-fallback-1', {
        id: 'adm-1',
        role: 'ADMIN',
        email: 'admin@plant03.com',
      } as any);

      expect(result.success).toBe(true);
      expect(result.attribution.originalCreatedBy).toBe(
        'WEIGHBRIDGE — Timbang User',
      );
      expect(result.attribution.voidMetadata.voidedBy).toBe(
        'ADMIN — Super Admin',
      );
      expect(result.timeline).toHaveLength(3);
      expect(result.timeline[0].eventType).toBe('WORKFLOW_REOPEN');
      expect(result.timeline[1].eventType).toBe('STATUS_CORRECTION');
      expect(result.timeline[2].eventType).toBe('ADMIN_VOID');
    });

    it('should test warehouse and qc creator fallbacks', async () => {
      (
        authorizationScopeService.getTransactionScope as jest.Mock
      ).mockReturnValue({});

      const mockTxWarehouse = {
        id: 'tx-fallback-wh',
        status: 'IN_PROGRESS',
        revision: 1,
        isVoided: false,
        warehouseStartBy: {
          id: 'wh-1',
          name: 'Gudang User',
          role: 'WAREHOUSE',
        },
      };

      mockPrismaService.transaction.findFirst.mockResolvedValue(
        mockTxWarehouse,
      );
      mockPrismaService.transactionStatusHistory.findMany.mockResolvedValue([]);
      mockPrismaService.transactionCorrection.findMany.mockResolvedValue([]);
      mockPrismaService.activityLog.findMany.mockResolvedValue([]);

      const resultWh = await service.getUnifiedAuditHistory('tx-fallback-wh', {
        id: 'adm-1',
        role: 'ADMIN',
        email: 'admin@plant03.com',
      } as any);
      expect(resultWh.attribution.originalCreatedBy).toBe(
        'WAREHOUSE — Gudang User',
      );

      const mockTxQc = {
        id: 'tx-fallback-qc',
        status: 'IN_PROGRESS',
        revision: 1,
        isVoided: false,
        qcVehicleChecks: [
          { checkedBy: { id: 'qc-1', name: 'QC User', role: 'QC' } },
        ],
      };

      mockPrismaService.transaction.findFirst.mockResolvedValue(mockTxQc);
      const resultQc = await service.getUnifiedAuditHistory('tx-fallback-qc', {
        id: 'adm-1',
        role: 'ADMIN',
        email: 'admin@plant03.com',
      } as any);
      expect(resultQc.attribution.originalCreatedBy).toBe('QC — QC User');

      const mockTxDefault = {
        id: 'tx-fallback-def',
        status: 'IN_PROGRESS',
        revision: 1,
        isVoided: false,
      };

      mockPrismaService.transaction.findFirst.mockResolvedValue(mockTxDefault);
      const resultDef = await service.getUnifiedAuditHistory(
        'tx-fallback-def',
        {
          id: 'adm-1',
          role: 'ADMIN',
          email: 'admin@plant03.com',
        } as any,
      );
      expect(resultDef.attribution.originalCreatedBy).toBe(
        'Operator Awal / QC Lapangan',
      );
    });

    it('should throw NotFoundException if transaction does not exist or out of scope', async () => {
      (
        authorizationScopeService.getTransactionScope as jest.Mock
      ).mockReturnValue({});

      mockPrismaService.transaction.findFirst.mockResolvedValue(null);

      await expect(
        service.getUnifiedAuditHistory('tx-not-found', {
          id: 'adm-1',
          role: 'ADMIN',
          email: 'admin@plant03.com',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw InternalServerErrorException on unexpected database failure', async () => {
      (
        authorizationScopeService.getTransactionScope as jest.Mock
      ).mockReturnValue({});

      mockPrismaService.transaction.findFirst.mockRejectedValue(
        new Error('DB Connection Dropped'),
      );

      await expect(
        service.getUnifiedAuditHistory('tx-err', {
          id: 'adm-1',
          role: 'ADMIN',
          email: 'admin@plant03.com',
        } as any),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('correctOperationLog - Invariants & Validations', () => {
    it('should reject CORRECT_RECORDED_STATUS with BadRequestException', async () => {
      await expect(
        service.correctOperationLog(
          'tx-1',
          {
            action: CorrectionAction.CORRECT_RECORDED_STATUS,
            reasonCode: 'DATA_ENTRY_ERROR',
            remark: 'Test fix',
            expectedRevision: 1,
          } as any,
          { id: 'adm-1', role: 'ADMIN' } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject REOPEN_WORKFLOW if reopenTargetStatus is missing', async () => {
      await expect(
        service.correctOperationLog(
          'tx-1',
          {
            action: CorrectionAction.REOPEN_WORKFLOW,
            reasonCode: 'OTHER',
            remark: 'Reopen without target status',
            expectedRevision: 1,
          } as any,
          { id: 'adm-1', role: 'ADMIN' } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject REOPEN_WORKFLOW if items are combined with REOPEN_WORKFLOW', async () => {
      await expect(
        service.correctOperationLog(
          'tx-1',
          {
            action: CorrectionAction.REOPEN_WORKFLOW,
            reopenTargetStatus: 'GATE_IN',
            items: [{ targetModule: 'TRANSACTION', fieldName: 'plateNumber' }],
            reasonCode: 'OTHER',
            remark: 'Reopen with items',
            expectedRevision: 1,
          } as any,
          { id: 'adm-1', role: 'ADMIN' } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if reopenTargetStatus provided with non-REOPEN action', async () => {
      await expect(
        service.correctOperationLog(
          'tx-1',
          {
            action: CorrectionAction.UPDATE_VALUES,
            reopenTargetStatus: 'GATE_IN',
            items: [{ targetModule: 'TRANSACTION', fieldName: 'plateNumber' }],
            reasonCode: 'OTHER',
            remark: 'Invalid combo',
            expectedRevision: 1,
          } as any,
          { id: 'adm-1', role: 'ADMIN' } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if items are empty for non-REOPEN action', async () => {
      await expect(
        service.correctOperationLog(
          'tx-1',
          {
            action: CorrectionAction.UPDATE_VALUES,
            items: [],
            reasonCode: 'OTHER',
            remark: 'Empty items',
            expectedRevision: 1,
          } as any,
          { id: 'adm-1', role: 'ADMIN' } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject REOPEN_WORKFLOW on administratively voided transaction (tx.isVoided === true)', async () => {
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          transaction: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'tx-voided',
              status: 'CANCELLED',
              isVoided: true,
              revision: 1,
            }),
          },
        });
      });

      await expect(
        service.correctOperationLog(
          'tx-voided',
          {
            action: CorrectionAction.REOPEN_WORKFLOW,
            reopenTargetStatus: 'GATE_IN',
            reasonCode: 'OTHER',
            remark: 'Attempting to reopen voided transaction',
            expectedRevision: 1,
          } as any,
          { id: 'adm-1', role: 'ADMIN' } as any,
        ),
      ).rejects.toThrow(
        'Transaksi yang telah di-void secara administratif tidak dapat di-reopen',
      );
    });

    it('invalidates active GSP PA records when REOPEN_WORKFLOW targets REGISTERED', async () => {
      const mockTx = {
        id: 'tx-gsp-coal-comp',
        status: 'COMPLETED',
        processType: 'GSP',
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        revision: 3,
        productCatalog: {
          id: 'cat-coal-1',
          name: 'Batubara',
          isPaRequired: true,
        },
      };

      const mockTxClient = createMockTxClient(mockTx);
      mockPrismaService.$transaction.mockImplementation((cb: any) =>
        cb(mockTxClient),
      );

      const dto = {
        action: CorrectionAction.REOPEN_WORKFLOW,
        reopenTargetStatus: 'REGISTERED' as any,
        reasonCode: 'REOPEN_WORKFLOW',
        remark: 'Reopen Batubara to REGISTERED for re-entry cycle',
        expectedRevision: 3,
        items: [],
      };

      const res = await service.correctOperationLog('tx-gsp-coal-comp', dto, {
        id: 'adm-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      });

      expect(res.success).toBe(true);
      expect(mockTxClient.qcProductAnalysis.updateMany).toHaveBeenCalledWith({
        where: { transactionId: 'tx-gsp-coal-comp', isVoided: false },
        data: expect.objectContaining({
          isVoided: true,
          status: 'VOIDED',
          voidReason: expect.stringContaining('REGISTERED'),
        }),
      });
    });

    it('invalidates active GSP PA records when REOPEN_WORKFLOW targets QC_VEHICLE_PENDING', async () => {
      const mockTx = {
        id: 'tx-gsp-coal-qc',
        status: 'COMPLETED',
        processType: 'GSP',
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        revision: 3,
        productCatalog: {
          id: 'cat-coal-1',
          name: 'Batubara',
          isPaRequired: true,
        },
      };

      const mockTxClient = createMockTxClient(mockTx);
      mockPrismaService.$transaction.mockImplementation((cb: any) =>
        cb(mockTxClient),
      );

      const dto = {
        action: CorrectionAction.REOPEN_WORKFLOW,
        reopenTargetStatus: 'QC_VEHICLE_PENDING' as any,
        reasonCode: 'REOPEN_WORKFLOW',
        remark: 'Reopen Batubara to QC_VEHICLE_PENDING for re-analysis',
        expectedRevision: 3,
        items: [],
      };

      const res = await service.correctOperationLog('tx-gsp-coal-qc', dto, {
        id: 'adm-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      });

      expect(res.success).toBe(true);
      expect(mockTxClient.qcProductAnalysis.updateMany).toHaveBeenCalledWith({
        where: { transactionId: 'tx-gsp-coal-qc', isVoided: false },
        data: expect.objectContaining({
          isVoided: true,
          status: 'VOIDED',
          voidReason: expect.stringContaining('QC_VEHICLE_PENDING'),
        }),
      });
    });

    it('rejects non-exempt PA_NOT_REQUIRED before transaction or child writes', async () => {
      const tx = createMockTxClient({
        id: 'tx-required-pa',
        status: 'COMPLETED',
        processType: 'GSP',
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        revision: 3,
        productCatalogId: 'cat-coal-1',
        productCatalog: {
          id: 'cat-coal-1',
          name: 'Batubara',
          isPaRequired: true,
        },
      });
      mockPrismaService.$transaction.mockImplementation((cb: any) => cb(tx));
      await expect(
        service.correctOperationLog(
          'tx-required-pa',
          {
            action: CorrectionAction.REOPEN_WORKFLOW,
            reopenTargetStatus: TransactionStatus.PA_NOT_REQUIRED,
            reasonCode: 'REOPEN_WORKFLOW',
            remark: 'Reopen requires legitimate product exemption',
            expectedRevision: 3,
            items: [],
          },
          { id: 'adm-1', role: 'ADMIN', email: 'admin@gms.local' },
        ),
      ).rejects.toThrow('PA_NOT_REQUIRED');
      expect(tx.transaction.updateMany).not.toHaveBeenCalled();
      expect(tx.qcProductAnalysis.updateMany).not.toHaveBeenCalled();
      expect(tx.transactionCorrection.create).not.toHaveBeenCalled();
    });

    it.each(['RELEASE', 'ACCEPT_WITH_NOTE'])(
      'preserves active GSP PA with valid %s evidence on reopen',
      async (paStatus) => {
        const mockTx = {
          id: 'tx-gsp-coal-pass',
          status: 'COMPLETED',
          processType: 'GSP',
          cargoType: 'Coal',
          cargoSubType: 'Batubara',
          productCatalogId: 'cat-coal-1',
          revision: 3,
          productCatalog: {
            id: 'cat-coal-1',
            name: 'Batubara',
            isPaRequired: true,
          },
        };

        const mockTxClient = createMockTxClient(mockTx);
        mockTxClient.qcProductAnalysis.findFirst.mockResolvedValue({
          id: 'pa-1',
          transactionId: 'tx-gsp-coal-pass',
          testRound: 1,
          productCatalogId: 'cat-coal-1',
          status: paStatus,
          result: paStatus === 'RELEASE' ? QcResult.PASS : QcResult.REJECT,
          dispositionAction: 'ACCEPT_WITH_NOTE',
          dispositionReason: 'Approved documented concession',
          dispositionById: 'qc-supervisor',
          dispositionAt: new Date('2026-10-19T00:00:00Z'),
          isVoided: false,
        });

        mockPrismaService.$transaction.mockImplementation((cb: any) =>
          cb(mockTxClient),
        );

        const dto = {
          action: CorrectionAction.REOPEN_WORKFLOW,
          reopenTargetStatus: TransactionStatus.QC_VEHICLE_PASSED,
          reasonCode: 'REOPEN_WORKFLOW',
          remark: 'Reopen Batubara to Warehouse stage with valid PA',
          expectedRevision: 3,
          items: [],
        };

        const res = await service.correctOperationLog('tx-gsp-coal-pass', dto, {
          id: 'adm-1',
          role: 'ADMIN',
          email: 'admin@gms.local',
        });

        expect(res.success).toBe(true);
        expect(
          mockTxClient.qcProductAnalysis.updateMany,
        ).not.toHaveBeenCalled();
        expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: TransactionStatus.QC_VEHICLE_PASSED,
            }),
          }),
        );
      },
    );

    it('downgrades to QC_VEHICLE_PENDING when REOPEN target QC_VEHICLE_PASSED has PA result = null', async () => {
      const mockTx = {
        id: 'tx-gsp-coal-null-res',
        status: 'COMPLETED',
        processType: 'GSP',
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        productCatalogId: 'cat-coal-1',
        revision: 3,
        productCatalog: {
          id: 'cat-coal-1',
          name: 'Batubara',
          isPaRequired: true,
        },
      };

      const mockTxClient = createMockTxClient(mockTx);
      mockTxClient.qcProductAnalysis.findFirst.mockResolvedValue({
        id: 'pa-null',
        testRound: 1,
        productCatalogId: 'cat-coal-1',
        status: 'RELEASE',
        result: null,
        isVoided: false,
      });

      mockPrismaService.$transaction.mockImplementation((cb: any) =>
        cb(mockTxClient),
      );

      const res = await service.correctOperationLog(
        mockTx.id,
        {
          action: CorrectionAction.REOPEN_WORKFLOW,
          reopenTargetStatus: TransactionStatus.QC_VEHICLE_PASSED,
          reasonCode: 'REOPEN_WORKFLOW',
          remark: 'Reopen Batubara with null PA result',
          expectedRevision: 3,
          items: [],
        },
        { id: 'adm-1', role: 'ADMIN', email: 'admin@gms.local' },
      );

      expect(res.success).toBe(true);
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_PENDING,
          }),
        }),
      );
    });

    it('downgrades to QC_VEHICLE_PENDING when REOPEN target QC_VEHICLE_PASSED has PA result = "PASSED"', async () => {
      const mockTx = {
        id: 'tx-gsp-coal-passed-res',
        status: 'COMPLETED',
        processType: 'GSP',
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        productCatalogId: 'cat-coal-1',
        revision: 3,
        productCatalog: {
          id: 'cat-coal-1',
          name: 'Batubara',
          isPaRequired: true,
        },
      };

      const mockTxClient = createMockTxClient(mockTx);
      mockTxClient.qcProductAnalysis.findFirst.mockResolvedValue({
        id: 'pa-passed',
        testRound: 1,
        productCatalogId: 'cat-coal-1',
        status: 'RELEASE',
        result: 'PASSED',
        isVoided: false,
      });

      mockPrismaService.$transaction.mockImplementation((cb: any) =>
        cb(mockTxClient),
      );

      const res = await service.correctOperationLog(
        mockTx.id,
        {
          action: CorrectionAction.REOPEN_WORKFLOW,
          reopenTargetStatus: TransactionStatus.QC_VEHICLE_PASSED,
          reasonCode: 'REOPEN_WORKFLOW',
          remark: 'Reopen Batubara with non-enum PASSED result',
          expectedRevision: 3,
          items: [],
        },
        { id: 'adm-1', role: 'ADMIN', email: 'admin@gms.local' },
      );

      expect(res.success).toBe(true);
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_PENDING,
          }),
        }),
      );
    });

    it('downgrades to QC_VEHICLE_PENDING when REOPEN target QC_VEHICLE_PASSED has PA result = REJECT', async () => {
      const mockTx = {
        id: 'tx-gsp-coal-reject-res',
        status: 'COMPLETED',
        processType: 'GSP',
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        productCatalogId: 'cat-coal-1',
        revision: 3,
        productCatalog: {
          id: 'cat-coal-1',
          name: 'Batubara',
          isPaRequired: true,
        },
      };

      const mockTxClient = createMockTxClient(mockTx);
      mockTxClient.qcProductAnalysis.findFirst.mockResolvedValue({
        id: 'pa-reject',
        testRound: 1,
        productCatalogId: 'cat-coal-1',
        status: 'RELEASE',
        result: QcResult.REJECT,
        isVoided: false,
      });

      mockPrismaService.$transaction.mockImplementation((cb: any) =>
        cb(mockTxClient),
      );

      const res = await service.correctOperationLog(
        mockTx.id,
        {
          action: CorrectionAction.REOPEN_WORKFLOW,
          reopenTargetStatus: TransactionStatus.QC_VEHICLE_PASSED,
          reasonCode: 'REOPEN_WORKFLOW',
          remark: 'Reopen Batubara with REJECT result',
          expectedRevision: 3,
          items: [],
        },
        { id: 'adm-1', role: 'ADMIN', email: 'admin@gms.local' },
      );

      expect(res.success).toBe(true);
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_PENDING,
          }),
        }),
      );
    });

    describe('Defensive Field Validators & Normalizers', () => {
      const mockAdminUser = {
        id: 'adm-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      } as any;

      let mockDefaultTx: any;
      let mockTxClient: any;

      beforeEach(() => {
        mockDefaultTx = {
          id: 'tx-1',
          plateNumber: 'B 1234 XYZ',
          status: 'COMPLETED',
          isVoided: false,
          processType: 'GBB',
          cargoType: 'Raw Material',
          cargoSubType: 'Cocoa',
          revision: 1,
          productCatalogId: 'cat-1',
          productCatalog: {
            id: 'cat-1',
            name: 'Cocoa Beans',
            isPaRequired: false,
          },
          weighbridgeRecords: [
            { id: 'wb-1', isCurrent: true, grossWeight: 1000 },
          ],
          qcVehicleChecks: [
            { id: 'qcv-1', isCurrent: true, checklistItems: {} },
          ],
          incomingMaterialChecks: [
            { id: 'inc-1', isCurrent: true, moisture: 10 },
          ],
          warehouseProcesses: [
            {
              id: 'wh-1',
              isCurrent: true,
              palletCount: 10,
              receivedUnit: 'BAG',
            },
          ],
          attachments: [],
        };
        mockTxClient = createMockTxClient(mockDefaultTx);
        mockPrismaService.transaction.findFirst.mockResolvedValue(
          mockDefaultTx,
        );
        mockPrismaService.$transaction.mockImplementation((cb: any) =>
          cb(mockTxClient),
        );
      });

      it('should reject empty or whitespace plateNumber', async () => {
        await expect(
          service.correctOperationLog(
            'tx-1',
            {
              action: CorrectionAction.CORRECT_DATA,
              reasonCode: 'DATA_ENTRY_ERROR',
              remark: 'Invalid plate',
              expectedRevision: 1,
              items: [
                {
                  targetModule: CorrectionTargetModule.TRANSACTION,
                  fieldName: 'plateNumber',
                  newValue: '   ',
                },
              ],
            } as any,
            mockAdminUser,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('should reject invalid plate format', async () => {
        await expect(
          service.correctOperationLog(
            'tx-1',
            {
              action: CorrectionAction.CORRECT_DATA,
              reasonCode: 'DATA_ENTRY_ERROR',
              remark: 'Invalid plate format',
              expectedRevision: 1,
              items: [
                {
                  targetModule: CorrectionTargetModule.TRANSACTION,
                  fieldName: 'plateNumber',
                  newValue: '###---',
                },
              ],
            } as any,
            mockAdminUser,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('should reject non-positive or non-finite weight numbers', async () => {
        await expect(
          service.correctOperationLog(
            'tx-1',
            {
              action: CorrectionAction.CORRECT_DATA,
              reasonCode: 'DATA_ENTRY_ERROR',
              remark: 'Invalid weight',
              expectedRevision: 1,
              items: [
                {
                  targetModule: CorrectionTargetModule.TRANSACTION,
                  fieldName: 'grossWeight',
                  newValue: -500,
                },
              ],
            } as any,
            mockAdminUser,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('should reject non-scalar value on scalar field', async () => {
        await expect(
          service.correctOperationLog(
            'tx-1',
            {
              action: CorrectionAction.CORRECT_DATA,
              reasonCode: 'DATA_ENTRY_ERROR',
              remark: 'Non-scalar remarks',
              expectedRevision: 1,
              items: [
                {
                  targetModule: CorrectionTargetModule.TRANSACTION,
                  fieldName: 'remarks',
                  newValue: { nested: 'object' },
                },
              ],
            } as any,
            mockAdminUser,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('should reject invalid percentage on moisture field', async () => {
        await expect(
          service.correctOperationLog(
            'tx-1',
            {
              action: CorrectionAction.CORRECT_DATA,
              reasonCode: 'DATA_ENTRY_ERROR',
              remark: 'Invalid moisture percentage',
              expectedRevision: 1,
              items: [
                {
                  targetModule: CorrectionTargetModule.QC_MATERIAL,
                  fieldName: 'moisture',
                  newValue: 150,
                },
              ],
            } as any,
            mockAdminUser,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('should reject negative integers on warehouse counts', async () => {
        await expect(
          service.correctOperationLog(
            'tx-1',
            {
              action: CorrectionAction.CORRECT_DATA,
              reasonCode: 'DATA_ENTRY_ERROR',
              remark: 'Negative pallet count',
              expectedRevision: 1,
              items: [
                {
                  targetModule: CorrectionTargetModule.WAREHOUSE,
                  fieldName: 'palletCount',
                  newValue: -5,
                },
              ],
            } as any,
            mockAdminUser,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('should reject circular JSON in checklistItems', async () => {
        const circular: any = { name: 'test' };
        circular.self = circular;

        await expect(
          service.correctOperationLog(
            'tx-1',
            {
              action: CorrectionAction.CORRECT_DATA,
              reasonCode: 'DATA_ENTRY_ERROR',
              remark: 'Circular checklist',
              expectedRevision: 1,
              items: [
                {
                  targetModule: CorrectionTargetModule.QC_VEHICLE,
                  fieldName: 'checklistItems',
                  newValue: circular,
                },
              ],
            } as any,
            mockAdminUser,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('should reject prohibited prototype keys in checklistItems JSON', async () => {
        await expect(
          service.correctOperationLog(
            'tx-1',
            {
              action: CorrectionAction.CORRECT_DATA,
              reasonCode: 'DATA_ENTRY_ERROR',
              remark: 'Prohibited key',
              expectedRevision: 1,
              items: [
                {
                  targetModule: CorrectionTargetModule.QC_VEHICLE,
                  fieldName: 'checklistItems',
                  newValue: { __proto__: { evil: true } },
                },
              ],
            } as any,
            mockAdminUser,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('should reject invalid receivedUnit enum values in WAREHOUSE', async () => {
        await expect(
          service.correctOperationLog(
            'tx-1',
            {
              action: CorrectionAction.CORRECT_DATA,
              reasonCode: 'DATA_ENTRY_ERROR',
              remark: 'Invalid receivedUnit',
              expectedRevision: 1,
              items: [
                {
                  targetModule: CorrectionTargetModule.WAREHOUSE,
                  fieldName: 'receivedUnit',
                  newValue: 'NON_EXISTENT_UNIT',
                },
              ],
            } as any,
            mockAdminUser,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('should reject direct status field alteration in items', async () => {
        await expect(
          service.correctOperationLog(
            'tx-1',
            {
              action: CorrectionAction.CORRECT_DATA,
              reasonCode: 'DATA_ENTRY_ERROR',
              remark: 'Direct status change',
              expectedRevision: 1,
              items: [
                {
                  targetModule: CorrectionTargetModule.TRANSACTION,
                  fieldName: 'status',
                  newValue: 'COMPLETED',
                },
              ],
            } as any,
            mockAdminUser,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('should reject non-string receivedQuantity', async () => {
        await expect(
          service.correctOperationLog(
            'tx-1',
            {
              action: CorrectionAction.CORRECT_DATA,
              reasonCode: 'DATA_ENTRY_ERROR',
              remark: 'Invalid receivedQuantity type',
              expectedRevision: 1,
              items: [
                {
                  targetModule: CorrectionTargetModule.WAREHOUSE,
                  fieldName: 'receivedQuantity',
                  newValue: 1234,
                },
              ],
            } as any,
            mockAdminUser,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('should reject invalid ISO date in startAt', async () => {
        await expect(
          service.correctOperationLog(
            'tx-1',
            {
              action: CorrectionAction.CORRECT_DATA,
              reasonCode: 'DATA_ENTRY_ERROR',
              remark: 'Invalid startAt date',
              expectedRevision: 1,
              items: [
                {
                  targetModule: CorrectionTargetModule.WAREHOUSE,
                  fieldName: 'startAt',
                  newValue: 'not-a-valid-date',
                },
              ],
            } as any,
            mockAdminUser,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('should reject invalid QC result enum', async () => {
        await expect(
          service.correctOperationLog(
            'tx-1',
            {
              action: CorrectionAction.CORRECT_DATA,
              reasonCode: 'DATA_ENTRY_ERROR',
              remark: 'Invalid result enum',
              expectedRevision: 1,
              items: [
                {
                  targetModule: CorrectionTargetModule.QC_VEHICLE,
                  fieldName: 'result',
                  newValue: 'INVALID_RESULT_ENUM',
                },
              ],
            } as any,
            mockAdminUser,
          ),
        ).rejects.toThrow(BadRequestException);
      });
    });
  });
});
