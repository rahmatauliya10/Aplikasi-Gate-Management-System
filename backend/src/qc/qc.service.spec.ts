import { Test, TestingModule } from '@nestjs/testing';
import { QcService } from './qc.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';

describe('QcService - Segregation of Duties (SoD)', () => {
  let service: QcService;
  let prismaService: PrismaService;
  let activityLogsService: ActivityLogsService;

  const mockPrismaService = {
    transaction: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockActivityLogsService = {
    logAction: jest.fn().mockResolvedValue({}),
  };

  const warehouseUser = {
    id: 'user-wh-1',
    role: 'WAREHOUSE',
    email: 'gudang@test.com',
  };

  const qcUser = {
    id: 'user-qc-1',
    role: 'QC',
    email: 'qc@test.com',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QcService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ActivityLogsService, useValue: mockActivityLogsService },
        {
          provide: AuthorizationScopeService,
          useValue: {
            assertProcessAccess: jest.fn(),
            assertScopeNotEmpty: jest.fn(),
            getTransactionScope: jest.fn().mockReturnValue({}),
          },
        },
      ],
    }).compile();

    service = module.get<QcService>(QcService);
    prismaService = module.get<PrismaService>(PrismaService);
    activityLogsService = module.get<ActivityLogsService>(ActivityLogsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should THROW ForbiddenException (403) when WAREHOUSE role calls completeQcAnalysis on GBB transaction', async () => {
    mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
      id: 'tx-124',
      processType: 'GBB',
      status: 'INCOMING_CHECK_PENDING',
    });

    await expect(
      service.completeQcAnalysis(
        'tx-124',
        warehouseUser as any,
        'Catatan aman',
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(mockActivityLogsService.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SOD_VIOLATION_BLOCKED',
        module: 'QC',
        status: 'FAILED',
      }),
    );
  });

  it('should ALLOW QC role to complete completeQcAnalysis on GBB transaction', async () => {
    const mockTx = {
      id: 'tx-124',
      processType: 'GBB',
      status: 'WAREHOUSE_IN_PROGRESS',
      revision: 1,
    };

    mockPrismaService.transaction.findUnique.mockResolvedValue(mockTx);
    mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
      cb({
        transaction: {
          findUnique: jest.fn().mockResolvedValue({
            ...mockTx,
            status: 'COMPLETED',
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({ id: 'tsh-1' }),
        },
        warehouseProcess: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      }),
    );

    const result = await service.completeQcAnalysis(
      'tx-124',
      qcUser as any,
      'Catatan aman',
    );

    expect(result.success).toBe(true);
  });

  it('should store goodBeanPercentage in incomingMaterialCheck.create (P1 Data Accuracy)', async () => {
    const mockTx = {
      id: 'tx-inc-1',
      processType: 'GBB',
      status: 'INCOMING_CHECK_PENDING',
      revision: 1,
    };

    const mockCreateIncoming = jest.fn().mockResolvedValue({ id: 'inc-chk-1' });

    mockPrismaService.transaction.findUnique.mockResolvedValue(mockTx);
    mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
      cb({
        incomingMaterialCheck: {
          count: jest.fn().mockResolvedValue(0),
          aggregate: jest.fn().mockResolvedValue({ _max: { revision: 1 } }),
          create: mockCreateIncoming,
        },
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest
            .fn()
            .mockResolvedValue({ ...mockTx, status: 'INCOMING_CHECK_PASSED' }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({ id: 'tsh-1' }),
        },
      }),
    );

    const dto = {
      result: 'PASS' as const,
      odor: 'Normal',
      color: 'Normal',
      moisture: 12.5,
      foreignMatter: 0.5,
      goodBeanPercentage: 89.5,
      sampleWeight: 250,
    };

    await service.submitIncomingCheck(
      'tx-inc-1',
      dto,
      'user-qc-1',
      qcUser as any,
    );

    expect(mockCreateIncoming).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          goodBeanPercentage: 89.5,
          sampleWeight: 250,
        }),
      }),
    );
  });

  describe('GBJ Vehicle Check — Decision Mode & Policy Enforcement', () => {
    const validPhoto = 'data:image/jpeg;base64,' + Buffer.from('mockphoto').toString('base64');
    const makeChecklist = (states: boolean[], withPhotos = true) => ({
      items: states.map((ok, idx) => ({
        label: `Item ${idx + 1}`,
        ok,
        photo: ok ? null : (withPhotos ? validPhoto : null),
      })),
    });

    const mockGbjTx = {
      id: 'tx-gbj-1',
      plateNumber: 'B 1234 GBJ',
      processType: 'GBJ',
      status: 'QC_VEHICLE_IN_PROGRESS',
      revision: 1,
      qcStartAt: new Date(),
      qcVehicleChecks: [],
    };

    let mockTxClient: any;

    beforeEach(() => {
      mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({ ...mockGbjTx, status: 'QC_VEHICLE_PASSED' }),
        },
        qcVehicleCheck: {
          aggregate: jest.fn().mockResolvedValue({ _max: { revision: 1 } }),
          create: jest.fn().mockResolvedValue({ id: 'qcv-1' }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({ id: 'tsh-1' }),
        },
      };

      mockPrismaService.transaction.findUnique.mockResolvedValue(mockGbjTx);
      mockPrismaService.$transaction.mockImplementation(async (cb: any) => cb(mockTxClient));
    });

    it('1. should REJECT (400) when CRITICAL item is NOT OK with APPROVED_WITH_DEVIATION', async () => {
      // Index 0 is Hama (CRITICAL)
      const dto = {
        result: 'PASS' as const,
        decisionMode: 'APPROVED_WITH_DEVIATION' as const,
        deviationReason: 'Alasan deviasi yang cukup panjang dan valid',
        checklistItems: makeChecklist([false, true, true, true, true]),
      };

      await expect(
        service.submitVehicleCheck('tx-gbj-1', dto, 'user-qc-1', qcUser as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('2. should REJECT (400) when Conditional NOT OK has deviationReason < 10 chars', async () => {
      // Index 2 is Bersih (CONDITIONAL)
      const dto = {
        result: 'PASS' as const,
        decisionMode: 'APPROVED_WITH_DEVIATION' as const,
        deviationReason: 'pendek',
        checklistItems: makeChecklist([true, true, false, true, true]),
      };

      await expect(
        service.submitVehicleCheck('tx-gbj-1', dto, 'user-qc-1', qcUser as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('3. should PASS when Conditional NOT OK has APPROVED_WITH_DEVIATION and reason >= 10 chars', async () => {
      // Index 2 & 4 are CONDITIONAL
      const dto = {
        result: 'REJECT' as const, // Client might send REJECT, server must override
        decisionMode: 'APPROVED_WITH_DEVIATION' as const,
        deviationReason: 'Truk dibersihkan di lokasi dan telah dipasang alas terpal bersih',
        checklistItems: makeChecklist([true, true, false, true, false]),
      };

      const res = await service.submitVehicleCheck('tx-gbj-1', dto, 'user-qc-1', qcUser as any);

      expect(res.success).toBe(true);
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'QC_VEHICLE_PASSED' }),
        }),
      );
      expect(mockTxClient.qcVehicleCheck.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            result: 'PASS',
            decisionMode: 'APPROVED_WITH_DEVIATION',
            hasDeviation: true,
            deviationReason: 'Truk dibersihkan di lokasi dan telah dipasang alas terpal bersih',
          }),
        }),
      );
      expect(mockActivityLogsService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QC_VEHICLE_APPROVED_WITH_DEVIATION',
          status: 'SUCCESS',
        }),
        mockTxClient,
      );
    });

    it('4. should REJECT (400) when All OK with APPROVED_WITH_DEVIATION', async () => {
      const dto = {
        result: 'PASS' as const,
        decisionMode: 'APPROVED_WITH_DEVIATION' as const,
        deviationReason: 'Alasan deviasi yang cukup panjang dan valid',
        checklistItems: makeChecklist([true, true, true, true, true]),
      };

      await expect(
        service.submitVehicleCheck('tx-gbj-1', dto, 'user-qc-1', qcUser as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('5. should PASS when All OK with NORMAL_PASS', async () => {
      const dto = {
        result: 'PASS' as const,
        decisionMode: 'NORMAL_PASS' as const,
        checklistItems: makeChecklist([true, true, true, true, true]),
      };

      const res = await service.submitVehicleCheck('tx-gbj-1', dto, 'user-qc-1', qcUser as any);

      expect(res.success).toBe(true);
      expect(mockTxClient.qcVehicleCheck.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            result: 'PASS',
            decisionMode: 'NORMAL_PASS',
            hasDeviation: false,
          }),
        }),
      );
      expect(mockActivityLogsService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QC_VEHICLE_APPROVED',
        }),
        mockTxClient,
      );
    });

    it('6. should REJECT (400) when NOT OK with NORMAL_PASS', async () => {
      const dto = {
        result: 'PASS' as const,
        decisionMode: 'NORMAL_PASS' as const,
        checklistItems: makeChecklist([true, true, false, true, true]),
      };

      await expect(
        service.submitVehicleCheck('tx-gbj-1', dto, 'user-qc-1', qcUser as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('7. should REJECT (400) when NOT OK item has no photo evidence', async () => {
      const dto = {
        result: 'PASS' as const,
        decisionMode: 'APPROVED_WITH_DEVIATION' as const,
        deviationReason: 'Alasan deviasi yang valid minimal 10 karakter',
        checklistItems: makeChecklist([true, true, false, true, true], false), // no photos
      };

      await expect(
        service.submitVehicleCheck('tx-gbj-1', dto, 'user-qc-1', qcUser as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('8. should override client result when decisionMode is REJECTED', async () => {
      const dto = {
        result: 'PASS' as const, // Spoofed PASS
        decisionMode: 'REJECTED' as const,
        checklistItems: makeChecklist([false, true, true, true, true]),
      };

      mockTxClient.transaction.findUnique.mockResolvedValueOnce({
        ...mockGbjTx,
        status: 'QC_VEHICLE_REJECTED',
      });

      const res = await service.submitVehicleCheck('tx-gbj-1', dto, 'user-qc-1', qcUser as any);

      expect(res.success).toBe(true);
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'QC_VEHICLE_REJECTED' }),
        }),
      );
      expect(mockTxClient.qcVehicleCheck.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            result: 'REJECT',
            decisionMode: 'REJECTED',
            hasDeviation: true,
          }),
        }),
      );
    });

    it('9. should safely derive NORMAL_PASS for legacy request with all OK and result=PASS', async () => {
      const dto = {
        result: 'PASS' as const,
        checklistItems: makeChecklist([true, true, true, true, true]),
      };

      const res = await service.submitVehicleCheck('tx-gbj-1', dto, 'user-qc-1', qcUser as any);

      expect(res.success).toBe(true);
      expect(mockTxClient.qcVehicleCheck.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            result: 'PASS',
            decisionMode: 'NORMAL_PASS',
            hasDeviation: false,
          }),
        }),
      );
    });

    it('10. should REJECT (400) legacy request when NOT OK is sent with result=PASS', async () => {
      const dto = {
        result: 'PASS' as const,
        checklistItems: makeChecklist([true, true, false, true, true]),
      };

      await expect(
        service.submitVehicleCheck('tx-gbj-1', dto, 'user-qc-1', qcUser as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('11. should THROW ConflictException (409) on OCC collision (updateMany claimed.count === 0)', async () => {
      mockTxClient.transaction.updateMany.mockResolvedValueOnce({ count: 0 });

      const dto = {
        result: 'PASS' as const,
        decisionMode: 'NORMAL_PASS' as const,
        checklistItems: makeChecklist([true, true, true, true, true]),
      };

      await expect(
        service.submitVehicleCheck('tx-gbj-1', dto, 'user-qc-1', qcUser as any),
      ).rejects.toThrow(ConflictException);
    });

    it('12. should REJECT (400) when All OK with REJECTED', async () => {
      const dto = {
        result: 'REJECT' as const,
        decisionMode: 'REJECTED' as const,
        checklistItems: makeChecklist([true, true, true, true, true]),
      };

      await expect(
        service.submitVehicleCheck('tx-gbj-1', dto, 'user-qc-1', qcUser as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('13. should REJECT (400) when checklistItems.items is not an array', async () => {
      const dto = {
        result: 'PASS' as const,
        decisionMode: 'NORMAL_PASS' as const,
        checklistItems: { items: 'invalid_items_string' } as any,
      };

      await expect(
        service.submitVehicleCheck('tx-gbj-1', dto, 'user-qc-1', qcUser as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('14. should REJECT (400) when checklistItems.items length is not 5', async () => {
      const dto = {
        result: 'PASS' as const,
        decisionMode: 'NORMAL_PASS' as const,
        checklistItems: { items: [{ ok: true }, { ok: true }] },
      };

      await expect(
        service.submitVehicleCheck('tx-gbj-1', dto, 'user-qc-1', qcUser as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('15. should REJECT (400) when item.ok is not boolean (strict boolean check)', async () => {
      const dto = {
        result: 'PASS' as const,
        decisionMode: 'NORMAL_PASS' as const,
        checklistItems: {
          items: [
            { label: 'Item 1', ok: 'false' as any, photo: null },
            { label: 'Item 2', ok: true, photo: null },
            { label: 'Item 3', ok: true, photo: null },
            { label: 'Item 4', ok: true, photo: null },
            { label: 'Item 5', ok: true, photo: null },
          ],
        },
      };

      await expect(
        service.submitVehicleCheck('tx-gbj-1', dto, 'user-qc-1', qcUser as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('16. should REJECT (400) when photo has invalid MIME type', async () => {
      const dto = {
        result: 'PASS' as const,
        decisionMode: 'APPROVED_WITH_DEVIATION' as const,
        deviationReason: 'Alasan deviasi yang valid minimal 10 karakter',
        checklistItems: {
          items: [
            { label: 'Item 1', ok: true, photo: null },
            { label: 'Item 2', ok: true, photo: null },
            { label: 'Item 3', ok: false, photo: 'data:application/pdf;base64,mockpdf' },
            { label: 'Item 4', ok: true, photo: null },
            { label: 'Item 5', ok: true, photo: null },
          ],
        },
      };

      await expect(
        service.submitVehicleCheck('tx-gbj-1', dto, 'user-qc-1', qcUser as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('17. should REJECT (400) when photo size exceeds 2MB limit', async () => {
      // 3MB buffer in base64
      const largeData = Buffer.alloc(3 * 1024 * 1024).toString('base64');
      const dto = {
        result: 'PASS' as const,
        decisionMode: 'APPROVED_WITH_DEVIATION' as const,
        deviationReason: 'Alasan deviasi yang valid minimal 10 karakter',
        checklistItems: {
          items: [
            { label: 'Item 1', ok: true, photo: null },
            { label: 'Item 2', ok: true, photo: null },
            { label: 'Item 3', ok: false, photo: `data:image/jpeg;base64,${largeData}` },
            { label: 'Item 4', ok: true, photo: null },
            { label: 'Item 5', ok: true, photo: null },
          ],
        },
      };

      await expect(
        service.submitVehicleCheck('tx-gbj-1', dto, 'user-qc-1', qcUser as any),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
