import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { QcProductAnalysisService } from './qc-product-analysis.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { TransactionStatus, ProcessType, QcResult } from '@prisma/client';
import { AnalysisDecision } from './dto/submit-product-analysis.dto';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';

import { AuthorizationScopeService } from '../auth/authorization-scope.service';
import { SpecificationProvider } from './providers/specification.provider';
import {
  TEST_FIXTURE_COAL_SPEC_METADATA,
  OPERATIONAL_COAL_SPEC_METADATA,
} from './constants/coal-specification';
import { TEST_FIXTURE_RAPID_KLEN_STRICT_GT } from './constants/chemical-specification';

describe('QcProductAnalysisService (Task 5)', () => {
  let service: QcProductAnalysisService;
  let specProvider: SpecificationProvider;
  let mockPrismaService: any;
  let mockActivityLogsService: any;
  let mockAuthScopeService: any;

  const mockAnalystUser: JwtPayloadUser = {
    id: 'user-analyst-1',
    role: 'QC',
    email: 'analyst@gms.local',
  } as unknown as JwtPayloadUser;

  beforeEach(async () => {
    mockAuthScopeService = {
      assertProcessAccess: jest.fn(),
      assertScopeNotEmpty: jest.fn(),
      getTransactionScope: jest.fn().mockReturnValue({}),
    };

    mockPrismaService = {
      $transaction: jest.fn(),
      transaction: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      qcProductAnalysis: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      transactionStatusHistory: {
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      appSetting: {
        findUnique: jest.fn(),
      },
    };

    mockActivityLogsService = {
      logAction: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QcProductAnalysisService,
        SpecificationProvider,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ActivityLogsService, useValue: mockActivityLogsService },
        {
          provide: AuthorizationScopeService,
          useValue: mockAuthScopeService,
        },
      ],
    }).compile();

    service = module.get<QcProductAnalysisService>(QcProductAnalysisService);
    specProvider = module.get<SpecificationProvider>(SpecificationProvider);
  });

  describe('submitProductAnalysis', () => {
    it('creates testRound 1 for initial test and transitions to QC_VEHICLE_PASSED when released', async () => {
      const coalTx = {
        id: 'tx-coal-1',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        revision: 2,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        qcProductAnalysis: {
          create: jest
            .fn()
            .mockResolvedValue({ id: 'analysis-1', testRound: 1 }),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );
      jest
        .spyOn(specProvider, 'getCoalSpec')
        .mockReturnValue(TEST_FIXTURE_COAL_SPEC_METADATA);

      const res = await service.submitProductAnalysis(
        'tx-coal-1',
        {
          productCategory: 'Coal',
          productName: 'Batubara',
          parameters: { visual: 'OK', moisture: 30.5 },
          result: QcResult.PASS,
          decision: AnalysisDecision.RELEASE,
          revision: 2,
        },
        mockAnalystUser,
      );

      expect(res.success).toBe(true);
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_PASSED,
          }),
        }),
      );
      expect(mockTxClient.qcProductAnalysis.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            testRound: 1,
            result: QcResult.PASS,
            status: 'RELEASE',
            testedById: mockAnalystUser.id,
          }),
        }),
      );
    });

    it('transitions to QC_RETEST_REQUIRED if moisture deviation triggers retest', async () => {
      const coalTx = {
        id: 'tx-coal-1',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        revision: 2,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        qcProductAnalysis: {
          create: jest
            .fn()
            .mockResolvedValue({ id: 'analysis-1', testRound: 1 }),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );
      jest
        .spyOn(specProvider, 'getCoalSpec')
        .mockReturnValue(TEST_FIXTURE_COAL_SPEC_METADATA);

      const res = await service.submitProductAnalysis(
        'tx-coal-1',
        {
          productCategory: 'Coal',
          productName: 'Batubara',
          parameters: { visual: 'OK', moisture: 36.0 },
          result: QcResult.REJECT,
          decision: AnalysisDecision.RETEST_REQUIRED,
          revision: 2,
        },
        mockAnalystUser,
      );

      expect(res.success).toBe(true);
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_RETEST_REQUIRED,
          }),
        }),
      );
    });

    it('transitions to QC_VEHICLE_REJECTED if retest (round 2) fails (NO Utility disposition)', async () => {
      const retestTx = {
        id: 'tx-coal-retest',
        status: TransactionStatus.QC_RETEST_REQUIRED,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        revision: 3,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(retestTx);
      mockPrismaService.qcProductAnalysis.findMany.mockResolvedValueOnce([
        { id: 'analysis-1', testRound: 1, isVoided: false },
      ]);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        qcProductAnalysis: {
          create: jest
            .fn()
            .mockResolvedValue({ id: 'analysis-2', testRound: 2 }),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );
      jest
        .spyOn(service, 'checkSpecificationApprovalStatus')
        .mockReturnValueOnce({
          approvalStatus: 'APPROVED',
          documentSource: 'Test Harness Fixture (Simulated Approved Spec)',
        });

      const res = await service.submitProductAnalysis(
        'tx-coal-retest',
        {
          productCategory: 'Coal',
          productName: 'Batubara',
          testRound: 2,
          parameters: { visual: 'OK', moisture: 35.5 },
          result: QcResult.REJECT,
          decision: AnalysisDecision.REJECT,
          revision: 3,
        },
        mockAnalystUser,
      );

      expect(res.success).toBe(true);
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_REJECTED,
          }),
        }),
      );
      expect(mockTxClient.transaction.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.WAITING_UTILITY_DISPOSITION,
          }),
        }),
      );
    });

    it('submits Round 2 successfully when status is QC_VEHICLE_IN_PROGRESS following retest start', async () => {
      const retestInProgressTx = {
        id: 'tx-coal-retest-inprogress',
        status: TransactionStatus.QC_VEHICLE_IN_PROGRESS,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        revision: 4,
        qcStartAt: new Date(),
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        retestInProgressTx,
      );
      mockPrismaService.qcProductAnalysis.findMany.mockResolvedValueOnce([
        { id: 'analysis-1', testRound: 1, isVoided: false },
      ]);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        qcProductAnalysis: {
          create: jest
            .fn()
            .mockResolvedValue({ id: 'analysis-2', testRound: 2 }),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );
      jest
        .spyOn(specProvider, 'getCoalSpec')
        .mockReturnValue(TEST_FIXTURE_COAL_SPEC_METADATA);

      const res = await service.submitProductAnalysis(
        'tx-coal-retest-inprogress',
        {
          productCategory: 'Coal',
          productName: 'Batubara',
          parameters: { visual: 'OK', moisture: 30.5 },
          result: QcResult.PASS,
          decision: AnalysisDecision.RELEASE,
          revision: 4,
        },
        mockAnalystUser,
      );

      expect(res.success).toBe(true);
      expect(mockTxClient.qcProductAnalysis.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            testRound: 2,
            result: QcResult.PASS,
            status: 'RELEASE',
          }),
        }),
      );
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_PASSED,
          }),
        }),
      );
    });

    it('resets authoritative test round to Round 1 if previous PA records were voided (after REOPEN to pre-PA stage)', async () => {
      const reopenedTx = {
        id: 'tx-coal-reopened',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        revision: 5,
        weighInAt: new Date(),
        grossWeight: 25000,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        reopenedTx,
      );
      // All previous PA records are voided (isVoided: true), so findMany({ where: { isVoided: false } }) returns []
      mockPrismaService.qcProductAnalysis.findMany.mockResolvedValueOnce([]);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        qcProductAnalysis: {
          create: jest
            .fn()
            .mockResolvedValue({ id: 'analysis-new-1', testRound: 1 }),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );
      jest
        .spyOn(specProvider, 'getCoalSpec')
        .mockReturnValue(TEST_FIXTURE_COAL_SPEC_METADATA);

      const res = await service.submitProductAnalysis(
        'tx-coal-reopened',
        {
          productCategory: 'Coal',
          productName: 'Batubara',
          testRound: 1,
          parameters: { visual: 'OK', moisture: 30.5 },
          result: QcResult.PASS,
          decision: AnalysisDecision.RELEASE,
          revision: 5,
        },
        mockAnalystUser,
      );

      expect(res.success).toBe(true);
      expect(mockTxClient.qcProductAnalysis.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            testRound: 1,
            result: QcResult.PASS,
            status: 'RELEASE',
          }),
        }),
      );
    });

    it('blocks PA analysis submission for Solar (exempt)', async () => {
      const solarTx = {
        id: 'tx-solar-1',
        status: TransactionStatus.PA_NOT_REQUIRED,
        processType: ProcessType.GSP,
        cargoType: 'Fuel',
        cargoSubType: 'Solar',
        revision: 2,
        productCatalog: {
          id: 'cat-solar-1',
          code: 'SOLAR-001',
          name: 'Solar',
          category: 'Fuel',
          subCategory: 'Solar',
          processType: 'GSP',
          isPaRequired: false,
          policyVersion: 'SOP-GSP-2026.1',
          isActive: true,
        },
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(solarTx);

      await expect(
        service.submitProductAnalysis(
          'tx-solar-1',
          {
            productCategory: 'Fuel',
            productName: 'Solar',
            parameters: {},
            result: QcResult.PASS,
            decision: AnalysisDecision.RELEASE,
            revision: 2,
          },
          mockAnalystUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects automated RELEASE if product specification is provisional/unapproved (PENDING_SIGNOFF)', async () => {
      const coalTx = {
        id: 'tx-coal-provisional',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        revision: 2,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);
      jest.spyOn(specProvider, 'getCoalSpec').mockReturnValueOnce({
        ...OPERATIONAL_COAL_SPEC_METADATA,
        approvalStatus: 'PENDING_SIGNOFF',
        documentSource: 'Provisional Benchmark (Awaiting Formal QA Signoff)',
      });

      await expect(
        service.submitProductAnalysis(
          'tx-coal-provisional',
          {
            productCategory: 'Coal',
            productName: 'Batubara GAR 4200',
            parameters: { totalMoisture: 31.0, sensoryPassed: true },
            result: QcResult.PASS,
            decision: AnalysisDecision.RELEASE, // Attempting automated RELEASE on unapproved spec!
            revision: 2,
          },
          mockAnalystUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('evaluates Rapid Klen exactly 35.0% alkalinity as failing GT 35.0% operational spec', async () => {
      const rkTx = {
        id: 'tx-rk-1',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        processType: ProcessType.GSP,
        cargoType: 'Chemical',
        cargoSubType: 'Rapid Klen',
        revision: 2,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(rkTx);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        qcProductAnalysis: {
          create: jest
            .fn()
            .mockResolvedValue({ id: 'analysis-rk-1', testRound: 1 }),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );
      jest
        .spyOn(specProvider, 'getRapidKlenSpec')
        .mockReturnValue(TEST_FIXTURE_RAPID_KLEN_STRICT_GT);

      // Under strict GT operational spec (> 35.0%), 35.0% fails spec -> REJECT
      const res = await service.submitProductAnalysis(
        'tx-rk-1',
        {
          productCategory: 'Chemical',
          productName: 'Rapid Klen',
          parameters: {
            sensory: { visual: true, packaging: true },
            alkalinityNa2O: 35.0, // Exactly at 35.0%, not > 35.0%
            ph: 13.0,
            density: 1.45,
          },
          result: QcResult.REJECT,
          decision: AnalysisDecision.REJECT,
          revision: 2,
        },
        mockAnalystUser,
      );

      expect(res.success).toBe(true);
      expect(mockTxClient.qcProductAnalysis.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            result: QcResult.REJECT,
            status: 'REJECT',
          }),
        }),
      );
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_REJECTED,
          }),
        }),
      );
      expect(mockTxClient.transaction.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.WAITING_UTILITY_DISPOSITION,
          }),
        }),
      );
    });

    it('fails closed when attempting RELEASE on Coal under unapproved operational metadata (PENDING_SIGNOFF)', async () => {
      const coalTx = {
        id: 'tx-coal-pending-signoff',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        revision: 2,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);

      // Force operational metadata (PENDING_SIGNOFF, approvedBy: null)
      jest
        .spyOn(specProvider, 'getCoalSpec')
        .mockReturnValue(OPERATIONAL_COAL_SPEC_METADATA);

      await expect(
        service.submitProductAnalysis(
          'tx-coal-pending-signoff',
          {
            productCategory: 'Coal',
            productName: 'Batubara',
            parameters: { visual: 'OK', moisture: 30.5 },
            result: QcResult.PASS,
            decision: AnalysisDecision.RELEASE,
            revision: 2,
          },
          mockAnalystUser,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'Keputusan RELEASE otomatis ditolak: Spesifikasi operasional untuk Batubara belum berstatus disahkan oleh QA (Status: PENDING_SIGNOFF).',
        ),
      );
    });
  });

  describe('Utility Disposition - Completely Removed', () => {
    it('verifies submitUtilityDisposition is not present on service', () => {
      expect((service as any).submitUtilityDisposition).toBeUndefined();
    });
  });


  describe('startProductAnalysis', () => {
    it('rejects start if transaction is not GSP', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
        id: 'tx-gbb-start',
        processType: ProcessType.GBB,
        status: TransactionStatus.QC_VEHICLE_PENDING,
      });

      await expect(
        service.startProductAnalysis('tx-gbb-start', mockAnalystUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects start for Solar / PA-exempt commodity with BadRequestException', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
        id: 'tx-solar-start',
        processType: ProcessType.GSP,
        cargoType: 'Fuel',
        cargoSubType: 'Solar B30',
        productCatalog: { name: 'Solar B30' },
        status: TransactionStatus.PA_NOT_REQUIRED,
      });

      await expect(
        service.startProductAnalysis('tx-solar-start', mockAnalystUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects start if transaction is not in QC_VEHICLE_PENDING', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
        id: 'tx-wrong-status',
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        status: TransactionStatus.WAITING_UTILITY_DISPOSITION,
        grossWeight: 15000,
        weighInAt: new Date(),
      });

      await expect(
        service.startProductAnalysis('tx-wrong-status', mockAnalystUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully starts PA, sets qcStartAt and transitions status to QC_VEHICLE_IN_PROGRESS', async () => {
      const coalTx = {
        id: 'tx-coal-start-1',
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        grossWeight: 15000,
        weighInAt: new Date(),
        revision: 2,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            ...coalTx,
            status: TransactionStatus.QC_VEHICLE_IN_PROGRESS,
            revision: 3,
            qcStartAt: new Date(),
          }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await service.startProductAnalysis(
        'tx-coal-start-1',
        mockAnalystUser,
      );

      expect(res.success).toBe(true);
      expect(res.data.id).toBe('tx-coal-start-1');
      expect(res.data.status).toBe(TransactionStatus.QC_VEHICLE_IN_PROGRESS);
      expect(res.data.revision).toBe(3);
      expect(res.data.cargoSubType).toBe('Batubara');
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_IN_PROGRESS,
            qcStartAt: expect.any(Date),
          }),
        }),
      );
    });

    it('is idempotent on repeated start and preserves initial qcStartAt without overwrite', async () => {
      const initialStartAt = new Date('2026-10-02T10:00:00Z');
      const inProgressTx = {
        id: 'tx-already-started',
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        status: TransactionStatus.QC_VEHICLE_IN_PROGRESS,
        grossWeight: 15000,
        weighInAt: new Date(),
        qcStartAt: initialStartAt,
        revision: 3,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        inProgressTx,
      );

      const res = await service.startProductAnalysis(
        'tx-already-started',
        mockAnalystUser,
      );

      expect(res.success).toBe(true);
      expect(res.message).toContain('in-progress');
      expect(res.data.qcStartAt).toEqual(initialStartAt);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('evaluates authoritatively when result and decision are omitted by client', async () => {
      const coalTx = {
        id: 'tx-coal-authoritative',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        revision: 2,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        qcProductAnalysis: {
          create: jest.fn().mockResolvedValue({ id: 'pa-auto-1' }),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementationOnce(
        async (cb: any) => await cb(mockTxClient),
      );
      jest
        .spyOn(specProvider, 'getCoalSpec')
        .mockReturnValue(TEST_FIXTURE_COAL_SPEC_METADATA);

      const res = await service.submitProductAnalysis(
        'tx-coal-authoritative',
        {
          productCategory: 'Coal',
          productName: 'Batubara',
          parameters: { visual: 'OK', moisture: 30.5 },
          // result and decision are intentionally omitted
          revision: 2,
        },
        mockAnalystUser,
      );

      expect(res.success).toBe(true);
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_PASSED,
          }),
        }),
      );
      expect(mockTxClient.qcProductAnalysis.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            result: QcResult.PASS,
            status: 'RELEASE',
          }),
        }),
      );
    });

    it('throws BadRequestException when client result tampered (sent PASS but server computes REJECT)', async () => {
      const coalTx = {
        id: 'tx-coal-tamper-result',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        revision: 2,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);
      jest
        .spyOn(specProvider, 'getCoalSpec')
        .mockReturnValue(TEST_FIXTURE_COAL_SPEC_METADATA);

      await expect(
        service.submitProductAnalysis(
          'tx-coal-tamper-result',
          {
            productCategory: 'Coal',
            productName: 'Batubara',
            // Moisture 38.0% exceeds threshold -> server computes REJECT / RETEST_REQUIRED
            parameters: { visual: 'OK', moisture: 38.0 },
            result: QcResult.PASS, // TAMPERED
            decision: AnalysisDecision.RETEST_REQUIRED,
            revision: 2,
          },
          mockAnalystUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when client decision tampered (sent RELEASE on unapproved spec)', async () => {
      const coalTx = {
        id: 'tx-coal-tamper-decision',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        revision: 2,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);
      // Unapproved spec -> server withholds automated RELEASE
      jest.spyOn(specProvider, 'getCoalSpec').mockReturnValue({
        ...OPERATIONAL_COAL_SPEC_METADATA,
        approvalStatus: 'PENDING_SIGNOFF',
      });

      await expect(
        service.submitProductAnalysis(
          'tx-coal-tamper-decision',
          {
            productCategory: 'Coal',
            productName: 'Batubara',
            parameters: { visual: 'OK', moisture: 30.0 },
            result: QcResult.PASS,
            decision: AnalysisDecision.RELEASE, // TAMPERED: client attempts automated RELEASE on unapproved spec
            revision: 2,
          },
          mockAnalystUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
