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
import { DispositionAction } from './dto/utility-disposition.dto';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';

import { AuthorizationScopeService } from '../auth/authorization-scope.service';

describe('QcProductAnalysisService (Task 5)', () => {
  let service: QcProductAnalysisService;
  let mockPrismaService: any;
  let mockActivityLogsService: any;
  let mockAuthScopeService: any;

  const mockAnalystUser: JwtPayloadUser = {
    id: 'user-analyst-1',
    role: 'QC',
    email: 'analyst@gms.local',
  } as unknown as JwtPayloadUser;

  const mockUtilityUser: JwtPayloadUser = {
    id: 'user-utility-1',
    role: 'ADMIN',
    email: 'utility.lead@gms.local',
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
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ActivityLogsService, useValue: mockActivityLogsService },
        {
          provide: AuthorizationScopeService,
          useValue: mockAuthScopeService,
        },
      ],
    }).compile();

    service = module.get<QcProductAnalysisService>(QcProductAnalysisService);
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
        .spyOn(service, 'checkSpecificationApprovalStatus')
        .mockReturnValueOnce({
          approvalStatus: 'APPROVED',
          documentSource: 'Test Harness Fixture (Simulated Approved Spec)',
        });

      const res = await service.submitProductAnalysis(
        'tx-coal-1',
        {
          productCategory: 'Coal',
          productName: 'Batubara',
          parameters: { visual: 'OK', moisture: 30.5 },
          result: QcResult.PASSED,
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
            result: QcResult.PASSED,
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
        .spyOn(service, 'checkSpecificationApprovalStatus')
        .mockReturnValueOnce({
          approvalStatus: 'APPROVED',
          documentSource: 'Test Harness Fixture (Simulated Approved Spec)',
        });

      const res = await service.submitProductAnalysis(
        'tx-coal-1',
        {
          productCategory: 'Coal',
          productName: 'Batubara',
          parameters: { visual: 'OK', moisture: 36.0 },
          result: QcResult.REJECTED,
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

    it('transitions to WAITING_UTILITY_DISPOSITION if retest (round 2) fails', async () => {
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
          result: QcResult.REJECTED,
          decision: AnalysisDecision.PENDING_DISPOSITION,
          revision: 3,
        },
        mockAnalystUser,
      );

      expect(res.success).toBe(true);
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.WAITING_UTILITY_DISPOSITION,
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
            result: QcResult.PASSED,
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

      await expect(
        service.submitProductAnalysis(
          'tx-coal-provisional',
          {
            productCategory: 'Coal',
            productName: 'Batubara GAR 4200',
            parameters: { totalMoisture: 31.0, sensoryPassed: true },
            result: QcResult.PASSED,
            decision: AnalysisDecision.RELEASE, // Attempting automated RELEASE on unapproved spec!
            revision: 2,
          },
          mockAnalystUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('submitUtilityDisposition - Four-Eyes Principle', () => {
    it('approves disposition with deviation when approver is different from analyst', async () => {
      const waitingTx = {
        id: 'tx-waiting-disp',
        status: TransactionStatus.WAITING_UTILITY_DISPOSITION,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        revision: 4,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(waitingTx);

      const latestAnalysis = {
        id: 'analysis-2',
        transactionId: 'tx-waiting-disp',
        testRound: 2,
        testedById: mockAnalystUser.id, // Tested by analyst-1
      };

      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce(
        latestAnalysis,
      );
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: mockUtilityUser.id,
        role: 'ADMIN',
        department: 'UTILITY',
        isActive: true,
        isDeleted: false,
        area: 'UTILITY_DISPOSITION_AUTHORITY',
      });
      mockPrismaService.qcProductAnalysis.findMany.mockResolvedValueOnce([
        { id: 'analysis-1', testRound: 1, testedById: mockAnalystUser.id },
        { id: 'analysis-2', testRound: 2, testedById: mockAnalystUser.id },
      ]);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        qcProductAnalysis: {
          update: jest.fn().mockResolvedValue({ id: 'analysis-2' }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );

      // Approved by mockUtilityUser (user-utility-1 !== user-analyst-1)
      const res = await service.submitUtilityDisposition(
        'tx-waiting-disp',
        {
          dispositionAction: DispositionAction.ACCEPT_WITH_DEVIATION,
          dispositionReason: 'Diterima bersyarat dengan penyesuaian boiler',
          revision: 4,
        },
        mockUtilityUser,
      );

      expect(res.success).toBe(true);
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_PASSED,
          }),
        }),
      );
      expect(mockTxClient.qcProductAnalysis.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'analysis-2' },
          data: expect.objectContaining({
            dispositionAction: 'ACCEPT_WITH_DEVIATION',
            dispositionById: mockUtilityUser.id,
          }),
        }),
      );
    });

    it('strictly enforces Four-Eyes Principle: rejects disposition if user was analyst in Round 2', async () => {
      const waitingTx = {
        id: 'tx-waiting-disp',
        status: TransactionStatus.WAITING_UTILITY_DISPOSITION,
        processType: ProcessType.GSP,
        revision: 4,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(waitingTx);

      const latestAnalysis = {
        id: 'analysis-2',
        transactionId: 'tx-waiting-disp',
        testRound: 2,
        testedById: mockAnalystUser.id,
      };

      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce(
        latestAnalysis,
      );
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: mockAnalystUser.id,
        role: 'ADMIN',
        department: 'UTILITY',
        isActive: true,
        isDeleted: false,
        area: 'UTILITY_DISPOSITION_AUTHORITY',
      });
      mockPrismaService.qcProductAnalysis.findMany.mockResolvedValueOnce([
        { id: 'analysis-1', testRound: 1, testedById: 'other-analyst' },
        { id: 'analysis-2', testRound: 2, testedById: mockAnalystUser.id },
      ]);

      // Attempt self-approval by Round 2 analyst
      await expect(
        service.submitUtilityDisposition(
          'tx-waiting-disp',
          {
            dispositionAction: DispositionAction.ACCEPT_WITH_DEVIATION,
            dispositionReason: 'Self-approval attempt Round 2',
            revision: 4,
          },
          mockAnalystUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('strictly enforces Four-Eyes Principle across ALL rounds: rejects if user was analyst in Round 1', async () => {
      const waitingTx = {
        id: 'tx-waiting-disp',
        status: TransactionStatus.WAITING_UTILITY_DISPOSITION,
        processType: ProcessType.GSP,
        revision: 4,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(waitingTx);

      const latestAnalysis = {
        id: 'analysis-2',
        transactionId: 'tx-waiting-disp',
        testRound: 2,
        testedById: 'analyst-round-2', // Different from mockAnalystUser
      };

      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce(
        latestAnalysis,
      );
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: mockAnalystUser.id,
        role: 'ADMIN',
        department: 'UTILITY',
        isActive: true,
        isDeleted: false,
        area: 'UTILITY_DISPOSITION_AUTHORITY',
      });
      mockPrismaService.qcProductAnalysis.findMany.mockResolvedValueOnce([
        { id: 'analysis-1', testRound: 1, testedById: mockAnalystUser.id }, // mockAnalystUser tested round 1!
        { id: 'analysis-2', testRound: 2, testedById: 'analyst-round-2' },
      ]);

      // Attempt approval by Round 1 analyst for Round 2 result
      await expect(
        service.submitUtilityDisposition(
          'tx-waiting-disp',
          {
            dispositionAction: DispositionAction.ACCEPT_WITH_DEVIATION,
            dispositionReason: 'Round 1 analyst trying to approve Round 2',
            revision: 4,
          },
          mockAnalystUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects disposition if user lacks Utility authority (non-Admin and non-Utility department)', async () => {
      const waitingTx = {
        id: 'tx-waiting-disp',
        status: TransactionStatus.WAITING_UTILITY_DISPOSITION,
        processType: ProcessType.GSP,
        revision: 4,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(waitingTx);

      const latestAnalysis = {
        id: 'analysis-2',
        transactionId: 'tx-waiting-disp',
        testRound: 2,
        testedById: 'some-analyst',
      };

      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce(
        latestAnalysis,
      );
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: 'user-security-1',
        role: 'SECURITY',
        department: 'SECURITY',
      });

      const securityUser = {
        id: 'user-security-1',
        role: 'SECURITY',
        email: 'security@gms.local',
      } as unknown as JwtPayloadUser;

      await expect(
        service.submitUtilityDisposition(
          'tx-waiting-disp',
          {
            dispositionAction: DispositionAction.ACCEPT_WITH_DEVIATION,
            dispositionReason: 'Unauthorized role attempt',
            revision: 4,
          },
          securityUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects disposition even if user is ADMIN if department is NOT Utility (no automatic Admin bypass)', async () => {
      const waitingTx = {
        id: 'tx-waiting-disp',
        status: TransactionStatus.WAITING_UTILITY_DISPOSITION,
        processType: ProcessType.GSP,
        revision: 4,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(waitingTx);

      const latestAnalysis = {
        id: 'analysis-2',
        transactionId: 'tx-waiting-disp',
        testRound: 2,
        testedById: 'analyst-1',
      };

      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce(
        latestAnalysis,
      );
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: 'admin-it-1',
        role: 'ADMIN',
        department: 'IT', // Admin, but NOT Utility!
      });

      const adminItUser = {
        id: 'admin-it-1',
        role: 'ADMIN',
        email: 'admin.it@sja.com',
      } as unknown as JwtPayloadUser;

      await expect(
        service.submitUtilityDisposition(
          'tx-waiting-disp',
          {
            dispositionAction: DispositionAction.ACCEPT_WITH_DEVIATION,
            dispositionReason: 'Admin without Utility department attempt',
            revision: 4,
          },
          adminItUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects disposition if user is in UTILITY department but lacks explicit disposition authority', async () => {
      const waitingTx = {
        id: 'tx-waiting-disp',
        status: TransactionStatus.WAITING_UTILITY_DISPOSITION,
        processType: ProcessType.GSP,
        revision: 4,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(waitingTx);

      const latestAnalysis = {
        id: 'analysis-2',
        transactionId: 'tx-waiting-disp',
        testRound: 2,
        testedById: 'some-analyst',
      };

      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce(
        latestAnalysis,
      );
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: 'utility-staff-no-perm',
        role: 'ADMIN',
        department: 'UTILITY',
        isActive: true,
        isDeleted: false,
        area: 'GENERAL_BOILER_OPERATOR', // No UTILITY_DISPOSITION_AUTHORITY!
      });
      mockPrismaService.appSetting.findUnique.mockResolvedValueOnce(null);

      const utilityStaffUser = {
        id: 'utility-staff-no-perm',
        role: 'ADMIN',
        email: 'staff@gms.local',
      } as unknown as JwtPayloadUser;

      await expect(
        service.submitUtilityDisposition(
          'tx-waiting-disp',
          {
            dispositionAction: DispositionAction.ACCEPT_WITH_DEVIATION,
            dispositionReason:
              'Utility staff without explicit permission attempt',
            revision: 4,
          },
          utilityStaffUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects disposition if user is in UTILITY with authority but account is inactive', async () => {
      const waitingTx = {
        id: 'tx-waiting-disp',
        status: TransactionStatus.WAITING_UTILITY_DISPOSITION,
        processType: ProcessType.GSP,
        revision: 4,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(waitingTx);

      const latestAnalysis = {
        id: 'analysis-2',
        transactionId: 'tx-waiting-disp',
        testRound: 2,
        testedById: 'some-analyst',
      };

      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce(
        latestAnalysis,
      );
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: 'utility-inactive-user',
        role: 'ADMIN',
        department: 'UTILITY',
        isActive: false, // Inactive account!
        isDeleted: false,
        area: 'UTILITY_DISPOSITION_AUTHORITY',
      });

      const inactiveUser = {
        id: 'utility-inactive-user',
        role: 'ADMIN',
        email: 'inactive@gms.local',
      } as unknown as JwtPayloadUser;

      await expect(
        service.submitUtilityDisposition(
          'tx-waiting-disp',
          {
            dispositionAction: DispositionAction.ACCEPT_WITH_DEVIATION,
            dispositionReason: 'Inactive user attempt',
            revision: 4,
          },
          inactiveUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects disposition if user is in UTILITY with authority but account is marked deleted', async () => {
      const waitingTx = {
        id: 'tx-waiting-disp',
        status: TransactionStatus.WAITING_UTILITY_DISPOSITION,
        processType: ProcessType.GSP,
        revision: 4,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(waitingTx);

      const latestAnalysis = {
        id: 'analysis-2',
        transactionId: 'tx-waiting-disp',
        testRound: 2,
        testedById: 'some-analyst',
      };

      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce(
        latestAnalysis,
      );
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: 'utility-deleted-user',
        role: 'ADMIN',
        department: 'UTILITY',
        isActive: true,
        isDeleted: true, // Marked deleted!
        area: 'UTILITY_DISPOSITION_AUTHORITY',
      });

      const deletedUser = {
        id: 'utility-deleted-user',
        role: 'ADMIN',
        email: 'deleted@gms.local',
      } as unknown as JwtPayloadUser;

      await expect(
        service.submitUtilityDisposition(
          'tx-waiting-disp',
          {
            dispositionAction: DispositionAction.ACCEPT_WITH_DEVIATION,
            dispositionReason: 'Deleted user attempt',
            revision: 4,
          },
          deletedUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('successfully processes REJECT disposition and sets status to QC_VEHICLE_REJECTED', async () => {
      const waitingTx = {
        id: 'tx-waiting-disp',
        status: TransactionStatus.WAITING_UTILITY_DISPOSITION,
        processType: ProcessType.GSP,
        revision: 4,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(waitingTx);

      const latestAnalysis = {
        id: 'analysis-2',
        transactionId: 'tx-waiting-disp',
        testRound: 2,
        testedById: mockAnalystUser.id,
      };

      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce(
        latestAnalysis,
      );
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: mockUtilityUser.id,
        role: 'ADMIN',
        department: 'UTILITY',
        isActive: true,
        isDeleted: false,
        area: 'UTILITY_DISPOSITION_AUTHORITY',
      });
      mockPrismaService.qcProductAnalysis.findMany.mockResolvedValueOnce([
        { id: 'analysis-1', testRound: 1, testedById: mockAnalystUser.id },
        { id: 'analysis-2', testRound: 2, testedById: mockAnalystUser.id },
      ]);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        qcProductAnalysis: {
          update: jest.fn().mockResolvedValue({ id: 'analysis-2' }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await service.submitUtilityDisposition(
        'tx-waiting-disp',
        {
          dispositionAction: DispositionAction.REJECT,
          dispositionReason: 'Kadar air terlalu tinggi, ditolak total.',
          revision: 4,
        },
        mockUtilityUser,
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
  });
});
