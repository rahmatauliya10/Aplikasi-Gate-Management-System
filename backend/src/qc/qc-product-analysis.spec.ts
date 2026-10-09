import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  QcProductAnalysisService,
  parseStrictFiniteNumber,
} from './qc-product-analysis.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import {
  TransactionStatus,
  ProcessType,
  QcResult,
  GspAnalysisProfile,
} from '@prisma/client';
import { AnalysisDecision } from './dto/submit-product-analysis.dto';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';

import { AuthorizationScopeService } from '../auth/authorization-scope.service';
import { SpecificationProvider } from './providers/specification.provider';
import {
  TEST_FIXTURE_COAL_SPEC_METADATA,
  OPERATIONAL_COAL_SPEC_METADATA,
} from './constants/coal-specification';
import {
  TEST_FIXTURE_RAPID_KLEN_STRICT_GT,
  OPERATIONAL_PAC_SPEC_METADATA,
} from './constants/chemical-specification';

describe('QcProductAnalysisService (Task 5 & Spec Rev 2.1)', () => {
  let service: QcProductAnalysisService;
  let specProvider: SpecificationProvider;
  let mockPrismaService: any;
  let mockActivityLogsService: any;
  let mockAuthScopeService: any;

  const validCoalVisual = {
    kondisi: 'Kering (Tidak Basah)',
    warna: 'Hitam',
    levelRank: 'Medium Rank Coal',
    kilap: 'Hitam Mengkilap',
    bahanPengotor: 'Tidak ada kontaminasi batuan maupun tanah',
  };

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
        cargoSubType: 'Batubara 5600-6000',
        gspAnalysisProfile: GspAnalysisProfile.COAL_PA,
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
          parameters: {
            calorieBand: 'COAL_5600_6000',
            visual: validCoalVisual,
            moisture: 30.5,
          },
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

    it('transitions to QC_RETEST_REQUIRED if moisture deviation triggers retest on Round 1', async () => {
      const coalTx = {
        id: 'tx-coal-1',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara 5600-6000',
        gspAnalysisProfile: GspAnalysisProfile.COAL_PA,
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
          parameters: {
            calorieBand: 'COAL_5600_6000',
            visual: validCoalVisual,
            moisture: 36.0,
          },
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

    it('transitions to QC_RETEST_REQUIRED if factual visual OOS triggers retest on Round 1', async () => {
      const coalTx = {
        id: 'tx-coal-visual-oos',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara 5600-6000',
        gspAnalysisProfile: GspAnalysisProfile.COAL_PA,
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
        .mockReturnValue(OPERATIONAL_COAL_SPEC_METADATA);

      const res = await service.submitProductAnalysis(
        'tx-coal-visual-oos',
        {
          productCategory: 'Coal',
          productName: 'Batubara',
          parameters: {
            calorieBand: 'COAL_5600_6000',
            visual: { ...validCoalVisual, kondisi: 'Basah Berlumpur' }, // Factual visual OOS
            moisture: 30.0,
          },
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

    it('transitions to QC_VEHICLE_REJECTED if retest (round 2) fails on factual visual OOS', async () => {
      const retestTx = {
        id: 'tx-coal-retest-visual-oos',
        status: TransactionStatus.QC_RETEST_REQUIRED,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara 5600-6000',
        gspAnalysisProfile: GspAnalysisProfile.COAL_PA,
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

      const res = await service.submitProductAnalysis(
        'tx-coal-retest-visual-oos',
        {
          productCategory: 'Coal',
          productName: 'Batubara',
          testRound: 2,
          parameters: {
            calorieBand: 'COAL_5600_6000',
            visual: { ...validCoalVisual, warna: 'Merah Bata' }, // Factual visual OOS
            moisture: 30.0,
          },
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
    });

    it('transitions to QC_VEHICLE_REJECTED if retest (round 2) fails on moisture OOS (NO Utility disposition)', async () => {
      const retestTx = {
        id: 'tx-coal-retest',
        status: TransactionStatus.QC_RETEST_REQUIRED,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara 5600-6000',
        gspAnalysisProfile: GspAnalysisProfile.COAL_PA,
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

      const res = await service.submitProductAnalysis(
        'tx-coal-retest',
        {
          productCategory: 'Coal',
          productName: 'Batubara',
          testRound: 2,
          parameters: {
            calorieBand: 'COAL_5600_6000',
            visual: validCoalVisual,
            moisture: 35.5,
          },
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
        cargoSubType: 'Batubara 5600-6000',
        gspAnalysisProfile: GspAnalysisProfile.COAL_PA,
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
          testRound: 2,
          parameters: {
            calorieBand: 'COAL_5600_6000',
            visual: validCoalVisual,
            moisture: 30.5,
          },
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
        cargoSubType: 'Batubara 5600-6000',
        gspAnalysisProfile: GspAnalysisProfile.COAL_PA,
        revision: 5,
        weighInAt: new Date(),
        grossWeight: 25000,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        reopenedTx,
      );
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
          parameters: {
            calorieBand: 'COAL_5600_6000',
            visual: validCoalVisual,
            moisture: 30.5,
          },
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
          receiptUnit: 'LITER',
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

    it('rejects unconfigured Coal calorie band with HTTP 422 SPEC_NOT_CONFIGURED', async () => {
      const coalTx = {
        id: 'tx-coal-unconfigured',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara 4200',
        gspAnalysisProfile: GspAnalysisProfile.COAL_PA,
        revision: 2,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);

      await expect(
        service.submitProductAnalysis(
          'tx-coal-unconfigured',
          {
            productCategory: 'Coal',
            productName: 'Batubara',
            parameters: {
              calorieBand: 'COAL_4200', // Unconfigured band
              visual: validCoalVisual,
              moisture: 30.0,
            },
            result: QcResult.PASS,
            decision: AnalysisDecision.RELEASE,
            revision: 2,
          },
          mockAnalystUser,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('evaluates Rapid Klen exactly 35.0% alkalinity as failing GT 35.0% operational spec', async () => {
      const rkTx = {
        id: 'tx-rk-1',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        processType: ProcessType.GSP,
        cargoType: 'Chemical',
        cargoSubType: 'Rapid Klen',
        gspAnalysisProfile: GspAnalysisProfile.RAPID_KLEN_PA,
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
            sensory: {
              visual: 'Jernih',
              foreignMatters: 'Tidak ada kontaminasi',
              packagingLabel: 'Kemasan & label tidak rusak',
            },
            alkalinityNa2O: 35.0, // Exactly at 35.0%, not > 35.0%
            alkalinityNaOH: 46.0,
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

    it('evaluates PAC PASS and transitions to QC_VEHICLE_PASSED under ACTIVE_CONFIGURED', async () => {
      const pacTx = {
        id: 'tx-pac-1',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        processType: ProcessType.GSP,
        cargoType: 'Chemical',
        cargoSubType: 'PAC 280 AC',
        gspAnalysisProfile: GspAnalysisProfile.PAC_PA,
        revision: 2,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(pacTx);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        qcProductAnalysis: {
          create: jest
            .fn()
            .mockResolvedValue({ id: 'analysis-pac-1', testRound: 1 }),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await service.submitProductAnalysis(
        'tx-pac-1',
        {
          productCategory: 'Chemical',
          productName: 'PAC 280 AC',
          parameters: {
            sensory: {
              visual: 'Kuning',
              foreignMatters: 'Tidak ada kontaminasi',
              packagingLabel: 'Kemasan & label tidak rusak',
            },
            ph: 4.2,
            density: 1.21,
          },
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
        cargoSubType: 'Batubara 5600-6000',
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
      expect(res.data.cargoSubType).toBe('Batubara 5600-6000');
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
        cargoSubType: 'Batubara 5600-6000',
        gspAnalysisProfile: GspAnalysisProfile.COAL_PA,
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
          parameters: {
            calorieBand: 'COAL_5600_6000',
            visual: validCoalVisual,
            moisture: 30.5,
          },
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
        cargoSubType: 'Batubara 5600-6000',
        gspAnalysisProfile: GspAnalysisProfile.COAL_PA,
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
            parameters: {
              calorieBand: 'COAL_5600_6000',
              visual: validCoalVisual,
              moisture: 38.0,
            },
            result: QcResult.PASS, // TAMPERED
            decision: AnalysisDecision.RETEST_REQUIRED,
            revision: 2,
          },
          mockAnalystUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when client decision tampered (sent RELEASE but server computes RETEST_REQUIRED)', async () => {
      const coalTx = {
        id: 'tx-coal-tamper-decision',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara 5600-6000',
        gspAnalysisProfile: GspAnalysisProfile.COAL_PA,
        revision: 2,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);
      jest
        .spyOn(specProvider, 'getCoalSpec')
        .mockReturnValue(OPERATIONAL_COAL_SPEC_METADATA);

      await expect(
        service.submitProductAnalysis(
          'tx-coal-tamper-decision',
          {
            productCategory: 'Coal',
            productName: 'Batubara',
            parameters: {
              calorieBand: 'COAL_5600_6000',
              visual: validCoalVisual,
              moisture: 38.0, // Exceeds 33.0% -> RETEST_REQUIRED
            },
            result: QcResult.REJECT,
            decision: AnalysisDecision.RELEASE, // TAMPERED: client attempts RELEASE when retest required
            revision: 2,
          },
          mockAnalystUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('P1-03 & P1-04: throws 422 SPEC_NOT_CONFIGURED and logs ActivityLog COAL_SPEC_NOT_CONFIGURED when calorieBand is missing or unknown (NO fallback to catalog code/cargoSubType)', async () => {
      const coalTxWithLegacyCode = {
        id: 'tx-coal-no-band',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        productCatalog: { code: 'COAL_5600_6000', name: 'Batubara' }, // catalog code that should NOT be used as fallback
        gspAnalysisProfile: GspAnalysisProfile.COAL_PA,
        revision: 1,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        coalTxWithLegacyCode,
      );
      jest
        .spyOn(specProvider, 'getCoalSpec')
        .mockReturnValue(OPERATIONAL_COAL_SPEC_METADATA);

      // Submit WITHOUT parameters.calorieBand
      await expect(
        service.submitProductAnalysis(
          'tx-coal-no-band',
          {
            productCategory: 'Coal',
            productName: 'Batubara',
            parameters: {
              // calorieBand omitted
              visual: validCoalVisual,
              moisture: 30.0,
            },
            revision: 1,
          },
          mockAnalystUser,
        ),
      ).rejects.toThrow(UnprocessableEntityException);

      // Verify ActivityLog was recorded with COAL_SPEC_NOT_CONFIGURED
      expect(mockActivityLogsService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockAnalystUser.id,
          action: 'COAL_SPEC_NOT_CONFIGURED',
          module: 'QC',
          referenceId: 'tx-coal-no-band',
          status: 'FAILED',
        }),
      );

      // Verify no QC analysis record was created and no transaction status update
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('P1-05: getSpecificationRuleStatus returns UNCONFIGURED for unknown/unverified product', () => {
      const status = service.getSpecificationRuleStatus(
        'UNKNOWN_CAT',
        'Unknown Product X',
      );
      expect(status.ruleStatus).toBe('UNCONFIGURED');
      expect(status.documentSource).toBe('Unverified Product Specification');
    });
  });

  describe('P0 & P1 Adversarial: API-level Strict Finite and Invalid Measurement Enforcement', () => {
    const validRapidSensory = {
      visual: 'Jernih',
      foreignMatters: 'Tidak ada kontaminasi',
      packagingLabel: 'Kemasan & label tidak rusak',
    };
    const validPacSensory = {
      visual: 'Kuning',
      foreignMatters: 'Tidak ada kontaminasi',
      packagingLabel: 'Kemasan & label tidak rusak',
    };
    const validCoalVisual = {
      kondisi: 'Kering (Tidak Basah)',
      warna: 'Hitam',
      levelRank: 'Medium Rank Coal',
      kilap: 'Hitam Mengkilap',
      bahanPengotor: 'Tidak ada kontaminasi batuan maupun tanah',
    };

    describe('P0 Rapid Klen: Rejects non-finite numbers ("Infinity", "-Infinity", "NaN", overflow)', () => {
      const createRapidTx = () => ({
        id: 'tx-rk-adv',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        processType: ProcessType.GSP,
        cargoType: 'Chemical',
        cargoSubType: 'Rapid Klen',
        gspAnalysisProfile: GspAnalysisProfile.RAPID_KLEN_PA,
        revision: 1,
      });

      it('rejects Rapid Klen with "Infinity" parameter with HTTP 400 BadRequestException', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          createRapidTx(),
        );

        await expect(
          service.submitProductAnalysis(
            'tx-rk-adv',
            {
              productCategory: 'Chemical',
              productName: 'Rapid Klen',
              parameters: {
                sensory: validRapidSensory,
                alkalinityNa2O: 'Infinity',
                alkalinityNaOH: 46.0,
                ph: 13.0,
                density: 1.45,
              },
              revision: 1,
            },
            mockAnalystUser,
          ),
        ).rejects.toThrow(BadRequestException);

        expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      });

      it('rejects Rapid Klen with exponent overflow ("1e309") with HTTP 400', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          createRapidTx(),
        );

        await expect(
          service.submitProductAnalysis(
            'tx-rk-adv',
            {
              productCategory: 'Chemical',
              productName: 'Rapid Klen',
              parameters: {
                sensory: validRapidSensory,
                alkalinityNa2O: 36.0,
                alkalinityNaOH: '1e309', // Overflows to Infinity
                ph: 13.0,
                density: 1.45,
              },
              revision: 1,
            },
            mockAnalystUser,
          ),
        ).rejects.toThrow(BadRequestException);

        expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      });

      it('rejects Rapid Klen with "-Infinity" or "NaN" with HTTP 400', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          createRapidTx(),
        );

        await expect(
          service.submitProductAnalysis(
            'tx-rk-adv',
            {
              productCategory: 'Chemical',
              productName: 'Rapid Klen',
              parameters: {
                sensory: validRapidSensory,
                alkalinityNa2O: 36.0,
                alkalinityNaOH: 46.0,
                ph: '-Infinity',
                density: 1.45,
              },
              revision: 1,
            },
            mockAnalystUser,
          ),
        ).rejects.toThrow(BadRequestException);

        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          createRapidTx(),
        );

        await expect(
          service.submitProductAnalysis(
            'tx-rk-adv',
            {
              productCategory: 'Chemical',
              productName: 'Rapid Klen',
              parameters: {
                sensory: validRapidSensory,
                alkalinityNa2O: 36.0,
                alkalinityNaOH: 46.0,
                ph: 13.0,
                density: 'NaN',
              },
              revision: 1,
            },
            mockAnalystUser,
          ),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('P0 PAC: Rejects non-finite numbers', () => {
      const createPacTx = () => ({
        id: 'tx-pac-adv',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        processType: ProcessType.GSP,
        cargoType: 'Chemical',
        cargoSubType: 'PAC',
        gspAnalysisProfile: GspAnalysisProfile.PAC_PA,
        revision: 1,
      });

      it('rejects PAC with "Infinity" pH with HTTP 400', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          createPacTx(),
        );

        await expect(
          service.submitProductAnalysis(
            'tx-pac-adv',
            {
              productCategory: 'Chemical',
              productName: 'PAC 280 AC',
              parameters: {
                sensory: validPacSensory,
                ph: 'Infinity',
                density: 1.2,
              },
              revision: 1,
            },
            mockAnalystUser,
          ),
        ).rejects.toThrow(BadRequestException);

        expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      });

      it('rejects PAC with "Infinity" density with HTTP 400', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          createPacTx(),
        );

        await expect(
          service.submitProductAnalysis(
            'tx-pac-adv',
            {
              productCategory: 'Chemical',
              productName: 'PAC 280 AC',
              parameters: {
                sensory: validPacSensory,
                ph: 4.2,
                density: 'Infinity',
              },
              revision: 1,
            },
            mockAnalystUser,
          ),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('P1 Coal: Separates invalid measurements from genuine OOS', () => {
      const createCoalRound2Tx = () => ({
        id: 'tx-coal-r2',
        status: TransactionStatus.QC_RETEST_REQUIRED,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        gspAnalysisProfile: GspAnalysisProfile.COAL_PA,
        revision: 3,
      });

      beforeEach(() => {
        jest
          .spyOn(specProvider, 'getCoalSpec')
          .mockReturnValue(OPERATIONAL_COAL_SPEC_METADATA);
      });

      it('Round 2: rejects missing moisture with HTTP 400 INVALID_MOISTURE_MEASUREMENT without changing status or creating record', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          createCoalRound2Tx(),
        );
        mockPrismaService.qcProductAnalysis.findMany.mockResolvedValueOnce([
          { id: 'pa-r1', testRound: 1, isVoided: false },
        ]);

        try {
          await service.submitProductAnalysis(
            'tx-coal-r2',
            {
              productCategory: 'Coal',
              productName: 'Batubara',
              parameters: {
                calorieBand: 'COAL_5600_6000',
                visual: validCoalVisual,
                // moisture is omitted
              },
              revision: 3,
            },
            mockAnalystUser,
          );
          fail('Expected BadRequestException');
        } catch (err: any) {
          expect(err).toBeInstanceOf(BadRequestException);
          expect(err.getResponse()).toEqual(
            expect.objectContaining({
              error: 'INVALID_MOISTURE_MEASUREMENT',
            }),
          );
        }

        // Crucial: no $transaction executed -> status NOT changed to QC_VEHICLE_REJECTED!
        expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      });

      it('Round 2: rejects negative moisture with HTTP 400 INVALID_MOISTURE_MEASUREMENT without changing status', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          createCoalRound2Tx(),
        );
        mockPrismaService.qcProductAnalysis.findMany.mockResolvedValueOnce([
          { id: 'pa-r1', testRound: 1, isVoided: false },
        ]);

        try {
          await service.submitProductAnalysis(
            'tx-coal-r2',
            {
              productCategory: 'Coal',
              productName: 'Batubara',
              parameters: {
                calorieBand: 'COAL_5600_6000',
                visual: validCoalVisual,
                moisture: -5.0,
              },
              revision: 3,
            },
            mockAnalystUser,
          );
          fail('Expected BadRequestException');
        } catch (err: any) {
          expect(err).toBeInstanceOf(BadRequestException);
          expect(err.getResponse()).toEqual(
            expect.objectContaining({
              error: 'INVALID_MOISTURE_MEASUREMENT',
            }),
          );
        }

        expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      });

      it('Round 2: rejects moisture > 100% with HTTP 400 INVALID_MOISTURE_MEASUREMENT without changing status', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          createCoalRound2Tx(),
        );
        mockPrismaService.qcProductAnalysis.findMany.mockResolvedValueOnce([
          { id: 'pa-r1', testRound: 1, isVoided: false },
        ]);

        try {
          await service.submitProductAnalysis(
            'tx-coal-r2',
            {
              productCategory: 'Coal',
              productName: 'Batubara',
              parameters: {
                calorieBand: 'COAL_5600_6000',
                visual: validCoalVisual,
                moisture: 105.0,
              },
              revision: 3,
            },
            mockAnalystUser,
          );
          fail('Expected BadRequestException');
        } catch (err: any) {
          expect(err).toBeInstanceOf(BadRequestException);
          expect(err.getResponse()).toEqual(
            expect.objectContaining({
              error: 'INVALID_MOISTURE_MEASUREMENT',
            }),
          );
        }

        expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      });

      it('Round 2: genuine OOS (moisture: 35.0% > 33.0%) creates PA record and updates status to QC_VEHICLE_REJECTED', async () => {
        mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
          createCoalRound2Tx(),
        );
        mockPrismaService.qcProductAnalysis.findMany.mockResolvedValueOnce([
          { id: 'pa-r1', testRound: 1, isVoided: false },
        ]);

        const mockTxClient = {
          transaction: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          qcProductAnalysis: {
            create: jest.fn().mockResolvedValue({ id: 'pa-r2', testRound: 2 }),
            findFirst: jest.fn().mockResolvedValue(null),
          },
          transactionStatusHistory: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
          cb(mockTxClient),
        );

        const res = await service.submitProductAnalysis(
          'tx-coal-r2',
          {
            productCategory: 'Coal',
            productName: 'Batubara',
            parameters: {
              calorieBand: 'COAL_5600_6000',
              visual: validCoalVisual,
              moisture: 35.0, // Valid measurement, genuine OOS
            },
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
        expect(mockTxClient.qcProductAnalysis.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              result: QcResult.REJECT,
              status: 'REJECT',
              testRound: 2,
            }),
          }),
        );
      });
    });

    describe('parseStrictFiniteNumber - Type and Format Strictness', () => {
      it('accepts valid JS finite numbers and decimal strings', () => {
        expect(parseStrictFiniteNumber(40, 'param')).toBe(40);
        expect(parseStrictFiniteNumber('40', 'param')).toBe(40);
        expect(parseStrictFiniteNumber(40.5, 'param')).toBe(40.5);
        expect(parseStrictFiniteNumber('40.5', 'param')).toBe(40.5);
        expect(parseStrictFiniteNumber(0.14, 'param')).toBe(0.14);
        expect(parseStrictFiniteNumber('0.14', 'param')).toBe(0.14);
        expect(parseStrictFiniteNumber('.5', 'param')).toBe(0.5);
        expect(parseStrictFiniteNumber('-5', 'param')).toBe(-5);
        expect(parseStrictFiniteNumber('+12.5', 'param')).toBe(12.5);
      });

      it('rejects boolean values (true, false) to prevent implicit coercion', () => {
        expect(() => parseStrictFiniteNumber(true, 'param')).toThrow(
          BadRequestException,
        );
        expect(() => parseStrictFiniteNumber(false, 'param')).toThrow(
          BadRequestException,
        );
      });

      it('rejects arrays (e.g. [40], ["40"]) to prevent implicit array coercion', () => {
        expect(() => parseStrictFiniteNumber([40], 'param')).toThrow(
          BadRequestException,
        );
        expect(() => parseStrictFiniteNumber(['40'], 'param')).toThrow(
          BadRequestException,
        );
      });

      it('rejects objects to prevent implicit object coercion', () => {
        expect(() => parseStrictFiniteNumber({}, 'param')).toThrow(
          BadRequestException,
        );
        expect(() => parseStrictFiniteNumber({ value: 40 }, 'param')).toThrow(
          BadRequestException,
        );
      });

      it('rejects hexadecimal strings (e.g. "0x28", "0x2F")', () => {
        expect(() => parseStrictFiniteNumber('0x28', 'param')).toThrow(
          BadRequestException,
        );
        expect(() => parseStrictFiniteNumber('0x2F', 'param')).toThrow(
          BadRequestException,
        );
      });

      it('rejects octal and binary formatted strings', () => {
        expect(() => parseStrictFiniteNumber('0o10', 'param')).toThrow(
          BadRequestException,
        );
        expect(() => parseStrictFiniteNumber('0b101', 'param')).toThrow(
          BadRequestException,
        );
      });

      it('rejects empty, whitespace-only, and non-numeric strings', () => {
        expect(() => parseStrictFiniteNumber('', 'param')).toThrow(
          BadRequestException,
        );
        expect(() => parseStrictFiniteNumber('   ', 'param')).toThrow(
          BadRequestException,
        );
        expect(() => parseStrictFiniteNumber('abc', 'param')).toThrow(
          BadRequestException,
        );
      });

      it('rejects scientific/exponent notation strings (e.g. "1e2", "4.6e1", "1e309")', () => {
        expect(() => parseStrictFiniteNumber('1e2', 'param')).toThrow(
          BadRequestException,
        );
        expect(() => parseStrictFiniteNumber('4.6e1', 'param')).toThrow(
          BadRequestException,
        );
        expect(() => parseStrictFiniteNumber('1e309', 'param')).toThrow(
          BadRequestException,
        );
        expect(() => parseStrictFiniteNumber('-2.5e3', 'param')).toThrow(
          BadRequestException,
        );
      });

      it('accepts ordinary finite decimal strings and valid frontend numeric payloads', () => {
        expect(parseStrictFiniteNumber('40', 'param')).toBe(40);
        expect(parseStrictFiniteNumber('40.5', 'param')).toBe(40.5);
        expect(parseStrictFiniteNumber('.5', 'param')).toBe(0.5);
        expect(parseStrictFiniteNumber('0.14', 'param')).toBe(0.14);
        expect(parseStrictFiniteNumber('-5.2', 'param')).toBe(-5.2);
        expect(parseStrictFiniteNumber('+12.3', 'param')).toBe(12.3);
        expect(parseStrictFiniteNumber(40, 'param')).toBe(40);
        expect(parseStrictFiniteNumber(40.5, 'param')).toBe(40.5);
        expect(parseStrictFiniteNumber(0, 'param')).toBe(0);
      });

      it('rejects Infinity, -Infinity, NaN strings and values, and exponent overflow', () => {
        expect(() => parseStrictFiniteNumber('Infinity', 'param')).toThrow(
          BadRequestException,
        );
        expect(() => parseStrictFiniteNumber('-Infinity', 'param')).toThrow(
          BadRequestException,
        );
        expect(() => parseStrictFiniteNumber('NaN', 'param')).toThrow(
          BadRequestException,
        );
        expect(() => parseStrictFiniteNumber('1e309', 'param')).toThrow(
          BadRequestException,
        );
        expect(() => parseStrictFiniteNumber(Infinity, 'param')).toThrow(
          BadRequestException,
        );
        expect(() => parseStrictFiniteNumber(-Infinity, 'param')).toThrow(
          BadRequestException,
        );
        expect(() => parseStrictFiniteNumber(NaN, 'param')).toThrow(
          BadRequestException,
        );
      });
    });

    describe('Adversarial API-level submissions with coerced types', () => {
      const validRapidSensory = {
        visual: 'Jernih',
        foreignMatters: 'Tidak ada kontaminasi',
        packagingLabel: 'Kemasan & label tidak rusak',
      };

      const createRapidTx = () => ({
        id: 'tx-rapid-adv',
        status: TransactionStatus.QC_VEHICLE_IN_PROGRESS,
        processType: ProcessType.GSP,
        cargoType: 'Chemical',
        cargoSubType: 'Rapid Klen',
        gspAnalysisProfile: GspAnalysisProfile.RAPID_KLEN_PA,
        revision: 1,
      });

      it.each([
        ['boolean true', true],
        ['boolean false', false],
        ['array [40]', [40]],
        ['array ["40"]', ['40']],
        ['object', { val: 40 }],
        ['hex string "0x28"', '0x28'],
        ['scientific notation "1e2"', '1e2'],
        ['scientific notation "4.6e1"', '4.6e1'],
        ['whitespace string', '   '],
        ['exponent overflow string "1e309"', '1e309'],
        ['Infinity string', 'Infinity'],
        ['NaN string', 'NaN'],
      ])(
        'Rapid Klen rejects %s in alkalinityNa2O with HTTP 400 without mutating transaction',
        async (_, invalidVal) => {
          mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
            createRapidTx(),
          );
          mockPrismaService.qcProductAnalysis.findMany.mockResolvedValueOnce(
            [],
          );

          await expect(
            service.submitProductAnalysis(
              'tx-rapid-adv',
              {
                productCategory: 'Chemical',
                productName: 'Rapid Klen',
                parameters: {
                  sensory: validRapidSensory,
                  alkalinityNa2O: invalidVal as any,
                  alkalinityNaOH: 46.0,
                  ph: 13.0,
                  density: 1.45,
                },
                revision: 1,
              },
              mockAnalystUser,
            ),
          ).rejects.toThrow(BadRequestException);

          expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
        },
      );

      it.each([
        ['boolean true', true],
        ['boolean false', false],
        ['array [30]', [30]],
        ['array ["30"]', ['30']],
        ['object', { moisture: 30 }],
        ['hex string "0x28"', '0x28'],
        ['scientific notation "1e2"', '1e2'],
        ['scientific notation "4.6e1"', '4.6e1'],
        ['whitespace string', '   '],
        ['exponent overflow string "1e309"', '1e309'],
        ['Infinity string', 'Infinity'],
        ['NaN string', 'NaN'],
      ])(
        'Coal rejects %s in moisture with HTTP 400 INVALID_MOISTURE_MEASUREMENT without mutating transaction',
        async (_, invalidMoisture) => {
          mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
            id: 'tx-coal-adv',
            status: TransactionStatus.QC_VEHICLE_IN_PROGRESS,
            processType: ProcessType.GSP,
            cargoType: 'Coal',
            cargoSubType: 'Batubara',
            gspAnalysisProfile: GspAnalysisProfile.COAL_PA,
            revision: 1,
          });
          mockPrismaService.qcProductAnalysis.findMany.mockResolvedValueOnce(
            [],
          );

          try {
            await service.submitProductAnalysis(
              'tx-coal-adv',
              {
                productCategory: 'Coal',
                productName: 'Batubara',
                parameters: {
                  calorieBand: 'COAL_5600_6000',
                  visual: validCoalVisual,
                  moisture: invalidMoisture as any,
                },
                revision: 1,
              },
              mockAnalystUser,
            );
            fail('Expected BadRequestException');
          } catch (err: any) {
            expect(err).toBeInstanceOf(BadRequestException);
            expect(err.getResponse()).toEqual(
              expect.objectContaining({
                error: 'INVALID_MOISTURE_MEASUREMENT',
              }),
            );
          }

          expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
        },
      );
    });
  });
});
