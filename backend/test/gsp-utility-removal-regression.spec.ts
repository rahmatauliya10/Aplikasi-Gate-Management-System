import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { QcProductAnalysisService } from '../src/qc/qc-product-analysis.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  TransactionStatus,
  ProcessType,
  Role,
  CargoCategory,
} from '@prisma/client';
import {
  evaluateCoalAnalysis,
  OPERATIONAL_COAL_SPEC_METADATA,
} from '../src/qc/constants/coal-specification';
import {
  evaluatePacAnalysis,
  OPERATIONAL_PAC_SPEC_METADATA,
} from '../src/qc/constants/chemical-pac-specification';
import {
  evaluateRapidKlenAnalysis,
  OPERATIONAL_RAPID_KLEN_SPEC_METADATA,
} from '../src/qc/constants/chemical-rapid-klen-specification';
import { SpecificationProvider } from '../src/qc/providers/specification.provider';
import { ActivityLogsService } from '../src/activity-logs/activity-logs.service';
import { AuthorizationScopeService } from '../src/auth/authorization-scope.service';

const validCoalVisual = {
  kondisi: 'Kering (Tidak Basah)',
  warna: 'Hitam',
  levelRank: 'Medium Rank Coal',
  kilap: 'Hitam Mengkilap',
  bahanPengotor: 'Tidak ada kontaminasi batuan maupun tanah',
};

describe('GSP Utility Removal & Two-Round Flow Regression Suite', () => {
  let service: QcProductAnalysisService;
  let mockPrismaService: any;
  let mockActivityLogsService: any;
  let mockAuthScopeService: any;
  let specProvider: SpecificationProvider;

  const mockQcAnalystUser = {
    id: 'usr-qc-analyst',
    role: Role.QC,
    name: 'QC Lab Analyst',
    department: 'QC',
    isActive: true,
  } as any;

  const originalEnv = { ...process.env };

  beforeAll(() => {
    process.env.ENABLE_TEST_SPEC_FIXTURES = 'true';
    process.env.GMS_TEST_HARNESS = 'true';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(async () => {
    mockPrismaService = {
      transaction: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
      productCatalog: {
        findUnique: jest.fn(),
      },
      qcProductAnalysis: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      transactionStatusHistory: {
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(),
    };

    mockActivityLogsService = {
      logAction: jest.fn().mockResolvedValue({}),
    };

    mockAuthScopeService = {
      assertProcessAccess: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QcProductAnalysisService,
        SpecificationProvider,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ActivityLogsService,
          useValue: mockActivityLogsService,
        },
        {
          provide: AuthorizationScopeService,
          useValue: mockAuthScopeService,
        },
      ],
    }).compile();

    service = module.get<QcProductAnalysisService>(QcProductAnalysisService);
    specProvider = module.get<SpecificationProvider>(SpecificationProvider);
    specProvider.setTestFixtureMode(true);
  });

  describe('1. Pure Function Specification Evaluator — Zero WAITING_UTILITY_DISPOSITION', () => {
    it('Coal Round 1 PASS -> result PASS, decision RELEASE', () => {
      const evalResult = evaluateCoalAnalysis({
        visual: validCoalVisual,
        calorieBand: 'COAL_5600_6000',
        totalMoisture: 31.0, // Limit is 33.0%
        testRound: 1,
      });

      expect(evalResult.result).toBe('PASS');
      expect(evalResult.decision).toBe('RELEASE');
      expect(evalResult.isWithinSpec).toBe(true);
      expect((evalResult as any).decision).not.toBe('PENDING_DISPOSITION');
    });

    it('Coal Round 1 OOS -> result REJECT, decision RETEST_REQUIRED', () => {
      const evalResult = evaluateCoalAnalysis({
        visual: validCoalVisual,
        calorieBand: 'COAL_5600_6000',
        totalMoisture: 35.5, // Exceeds 33.0%
        testRound: 1,
      });

      expect(evalResult.result).toBe('REJECT');
      expect(evalResult.decision).toBe('RETEST_REQUIRED');
      expect(evalResult.isWithinSpec).toBe(false);
      expect((evalResult as any).decision).not.toBe('PENDING_DISPOSITION');
    });

    it('Coal Round 2 PASS -> result PASS, decision RELEASE', () => {
      const evalResult = evaluateCoalAnalysis({
        visual: validCoalVisual,
        calorieBand: 'COAL_5600_6000',
        totalMoisture: 32.0, // Compliant on retest
        testRound: 2,
      });

      expect(evalResult.result).toBe('PASS');
      expect(evalResult.decision).toBe('RELEASE');
      expect(evalResult.isWithinSpec).toBe(true);
      expect((evalResult as any).decision).not.toBe('PENDING_DISPOSITION');
    });

    it('Coal Round 2 OOS -> result REJECT, decision REJECT (NO Utility Disposition)', () => {
      const evalResult = evaluateCoalAnalysis({
        visual: validCoalVisual,
        calorieBand: 'COAL_5600_6000',
        totalMoisture: 36.0, // Still exceeds 33.0% on Round 2
        testRound: 2,
      });

      expect(evalResult.result).toBe('REJECT');
      expect(evalResult.decision).toBe('REJECT');
      expect(evalResult.isWithinSpec).toBe(false);
      // Strictly verify PENDING_DISPOSITION is eliminated
      expect(evalResult.decision).not.toBe('PENDING_DISPOSITION');
      expect(evalResult.notes).toContain('Muatan ditolak');
      expect(evalResult.notes).not.toContain('Utility');
    });
  });

  describe('2. End-to-End Service Transitions for Coal (COAL_PA)', () => {
    it('CASE A: Coal Round 1 PASS transitions directly to QC_VEHICLE_PASSED', async () => {
      const coalTx = {
        id: 'tx-coal-r1-pass',
        status: TransactionStatus.QC_VEHICLE_IN_PROGRESS,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        revision: 2,
        qcStartAt: new Date(),
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);
      mockPrismaService.qcProductAnalysis.findMany.mockResolvedValueOnce([]);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        qcProductAnalysis: {
          create: jest.fn().mockResolvedValue({ id: 'pa-1', testRound: 1 }),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await service.submitProductAnalysis(
        coalTx.id,
        {
          productCategory: 'Coal',
          productName: 'Batubara',
          testRound: 1,
          parameters: {
            visual: validCoalVisual,
            calorieBand: 'COAL_5600_6000',
            totalMoisture: 31.5,
          },
          revision: 2,
        },
        mockQcAnalystUser,
      );

      expect(res.success).toBe(true);
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_PASSED,
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

    it('CASE A-FAIL-CLOSED: Coal with unconfigured calorie band fails closed with 422 SPEC_NOT_CONFIGURED', async () => {
      const coalTx = {
        id: 'tx-coal-r1-pass-pending',
        status: TransactionStatus.QC_VEHICLE_IN_PROGRESS,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        revision: 2,
        qcStartAt: new Date(),
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);
      mockPrismaService.qcProductAnalysis.findMany.mockResolvedValueOnce([]);

      await expect(
        service.submitProductAnalysis(
          coalTx.id,
          {
            productCategory: 'Coal',
            productName: 'Batubara',
            testRound: 1,
            parameters: {
              visual: validCoalVisual,
              calorieBand: 'COAL_4200_UNCONFIGURED',
              totalMoisture: 31.5,
            },
            revision: 2,
          },
          mockQcAnalystUser,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('CASE B: Coal Round 1 OOS transitions to QC_RETEST_REQUIRED', async () => {
      const coalTx = {
        id: 'tx-coal-r1-fail',
        status: TransactionStatus.QC_VEHICLE_IN_PROGRESS,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        revision: 2,
        qcStartAt: new Date(),
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);
      mockPrismaService.qcProductAnalysis.findMany.mockResolvedValueOnce([]);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        qcProductAnalysis: {
          create: jest.fn().mockResolvedValue({ id: 'pa-1', testRound: 1 }),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await service.submitProductAnalysis(
        coalTx.id,
        {
          productCategory: 'Coal',
          productName: 'Batubara',
          testRound: 1,
          parameters: {
            visual: validCoalVisual,
            calorieBand: 'COAL_5600_6000',
            totalMoisture: 36.0, // Exceeds 33.0%
          },
          revision: 2,
        },
        mockQcAnalystUser,
      );

      expect(res.success).toBe(true);
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_RETEST_REQUIRED,
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

    it('CASE C: Coal Round 2 OOS transitions strictly to QC_VEHICLE_REJECTED (NEVER enters WAITING_UTILITY_DISPOSITION)', async () => {
      const coalTxRetest = {
        id: 'tx-coal-r2-fail',
        status: TransactionStatus.QC_RETEST_REQUIRED,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        revision: 3,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        coalTxRetest,
      );
      mockPrismaService.qcProductAnalysis.findMany.mockResolvedValueOnce([
        { id: 'pa-r1', testRound: 1, isVoided: false },
      ]);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        qcProductAnalysis: {
          create: jest.fn().mockResolvedValue({ id: 'pa-2', testRound: 2 }),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await service.submitProductAnalysis(
        coalTxRetest.id,
        {
          productCategory: 'Coal',
          productName: 'Batubara',
          testRound: 2,
          parameters: {
            visual: validCoalVisual,
            calorieBand: 'COAL_5600_6000',
            totalMoisture: 35.8, // Still exceeds 33.0% on Round 2
          },
          revision: 3,
        },
        mockQcAnalystUser,
      );

      expect(res.success).toBe(true);
      // Strictly asserts QC_VEHICLE_REJECTED
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_REJECTED,
          }),
        }),
      );
      // Strictly asserts it NEVER entered WAITING_UTILITY_DISPOSITION
      expect(mockTxClient.transaction.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.WAITING_UTILITY_DISPOSITION,
          }),
        }),
      );
    });
  });

  describe('3. Solar Target Flow — PA_EXEMPT & No Utility', () => {
    it('Solar transactions are exempt from PA and can never submit PA or enter WAITING_UTILITY_DISPOSITION', async () => {
      const solarTx = {
        id: 'tx-solar-1',
        status: TransactionStatus.PA_NOT_REQUIRED,
        processType: ProcessType.GSP,
        cargoType: 'Fuel',
        cargoSubType: 'Solar',
        revision: 2,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(solarTx);

      // Attempting to submit PA for Solar in PA_NOT_REQUIRED must fail-closed
      await expect(
        service.submitProductAnalysis(
          solarTx.id,
          {
            productCategory: 'Fuel',
            productName: 'Solar',
            parameters: {},
            revision: 2,
          },
          mockQcAnalystUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('4. Chemical UTL (PAC_PA) & Chemical PROD (RAPID_KLEN_PA) — Zero Utility Disposition', () => {
    it('PAC_PA operates under ACTIVE_CONFIGURED and never routes to WAITING_UTILITY_DISPOSITION', async () => {
      const pacTx = {
        id: 'tx-pac-1',
        status: TransactionStatus.QC_VEHICLE_IN_PROGRESS,
        processType: ProcessType.GSP,
        cargoType: 'Chemicals',
        cargoSubType: 'PAC 280 AC',
        revision: 2,
        qcStartAt: new Date(),
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(pacTx);
      mockPrismaService.qcProductAnalysis.findMany.mockResolvedValueOnce([]);

      const mockTxClient = {
        transaction: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        qcProductAnalysis: {
          create: jest.fn().mockImplementation(({ data }) => data),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        transactionStatusHistory: { create: jest.fn().mockResolvedValue({}) },
      };
      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await service.submitProductAnalysis(
        pacTx.id,
        {
          productCategory: 'Chemicals',
          productName: 'PAC 280 AC',
          parameters: {
            sensory: {
              visual: 'Kuning',
              foreignMatters: 'Tidak ada kontaminasi',
              packagingLabel: 'Kemasan & label tidak rusak',
            },
            ph: 4.0,
            density: 1.2,
          },
          revision: 2,
        },
        mockQcAnalystUser,
      );

      expect(res.data.newStatus).toBe(TransactionStatus.QC_VEHICLE_PASSED);
      expect(res.data.newStatus).not.toBe(
        TransactionStatus.WAITING_UTILITY_DISPOSITION,
      );
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_PASSED,
          }),
        }),
      );
    });

    it('RAPID_KLEN_PA operates under ACTIVE_CONFIGURED and routes directly to REJECT on OOS (never WAITING_UTILITY_DISPOSITION)', async () => {
      const rapidTx = {
        id: 'tx-rapid-1',
        status: TransactionStatus.QC_VEHICLE_IN_PROGRESS,
        processType: ProcessType.GSP,
        cargoType: 'Chemicals',
        cargoSubType: 'Rapid Klen',
        revision: 2,
        qcStartAt: new Date(),
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(rapidTx);
      mockPrismaService.qcProductAnalysis.findMany.mockResolvedValueOnce([]);

      const mockTxClient = {
        transaction: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        qcProductAnalysis: {
          create: jest.fn().mockImplementation(({ data }) => data),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        transactionStatusHistory: { create: jest.fn().mockResolvedValue({}) },
      };
      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await service.submitProductAnalysis(
        rapidTx.id,
        {
          productCategory: 'Chemicals',
          productName: 'Rapid Klen',
          parameters: {
            sensory: {
              visual: 'Jernih',
              foreignMatters: 'Tidak ada kontaminasi',
              packagingLabel: 'Kemasan & label tidak rusak',
            },
            alkalinityNa2O: 30.0, // FAIL (< 35.00)
            alkalinityNaOH: 40.0,
            ph: 11.5,
            density: 1.3,
          },
          revision: 2,
        },
        mockQcAnalystUser,
      );

      expect(res.data.newStatus).toBe(TransactionStatus.QC_VEHICLE_REJECTED);
      expect(res.data.newStatus).not.toBe(
        TransactionStatus.WAITING_UTILITY_DISPOSITION,
      );
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_REJECTED,
          }),
        }),
      );
    });
  });
});
