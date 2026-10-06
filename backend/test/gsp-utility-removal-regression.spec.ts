import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
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
  });

  describe('1. Pure Function Specification Evaluator — Zero WAITING_UTILITY_DISPOSITION', () => {
    it('Coal Round 1 PASS -> result PASS, decision RELEASE', () => {
      const evalResult = evaluateCoalAnalysis({
        sensoryPassed: true,
        targetCalorie: 4200,
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
        sensoryPassed: true,
        targetCalorie: 4200,
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
        sensoryPassed: true,
        targetCalorie: 4200,
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
        sensoryPassed: true,
        targetCalorie: 4200,
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
            sensory: {
              visual: true,
              odor: true,
              foreignMatter: true,
              sizeConsistency: true,
              moistureCondition: true,
            },
            targetCalorie: '4200',
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
            sensory: {
              visual: true,
              odor: true,
              foreignMatter: true,
              sizeConsistency: true,
              moistureCondition: true,
            },
            targetCalorie: '4200',
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
            sensory: {
              visual: true,
              odor: true,
              foreignMatter: true,
              sizeConsistency: true,
              moistureCondition: true,
            },
            targetCalorie: '4200',
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
    it('PAC_PA never routes to WAITING_UTILITY_DISPOSITION and fails-closed if spec is PENDING_SIGNOFF', async () => {
      const pacTx = {
        id: 'tx-pac-1',
        status: TransactionStatus.QC_VEHICLE_IN_PROGRESS,
        processType: ProcessType.GSP,
        cargoType: 'Chemical UTL',
        cargoSubType: 'PAC 280 AC',
        revision: 2,
        qcStartAt: new Date(),
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(pacTx);
      mockPrismaService.qcProductAnalysis.findMany.mockResolvedValueOnce([]);

      // PENDING_SIGNOFF metadata is preserved as governance blocker and must NOT route to Utility
      await expect(
        service.submitProductAnalysis(
          pacTx.id,
          {
            productCategory: 'Chemical UTL',
            productName: 'PAC 280 AC',
            parameters: {
              al2o3: 29.5,
              basicity: 50.0,
              density: 1.25,
              pH: 4.0,
              insoluble: 0.2,
            },
            revision: 2,
          },
          mockQcAnalystUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('RAPID_KLEN_PA never routes to WAITING_UTILITY_DISPOSITION and fails-closed if spec is PENDING_SIGNOFF', async () => {
      const rapidTx = {
        id: 'tx-rapid-1',
        status: TransactionStatus.QC_VEHICLE_IN_PROGRESS,
        processType: ProcessType.GSP,
        cargoType: 'Chemical PROD',
        cargoSubType: 'Rapid Klen',
        revision: 2,
        qcStartAt: new Date(),
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(rapidTx);
      mockPrismaService.qcProductAnalysis.findMany.mockResolvedValueOnce([]);

      // PENDING_SIGNOFF metadata is preserved as governance blocker and must NOT route to Utility
      await expect(
        service.submitProductAnalysis(
          rapidTx.id,
          {
            productCategory: 'Chemical PROD',
            productName: 'Rapid Klen',
            parameters: {
              activeIngredient: 31.0,
              pH: 11.5,
              density: 1.15,
            },
            revision: 2,
          },
          mockQcAnalystUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
