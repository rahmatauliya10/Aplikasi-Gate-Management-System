import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { WeighbridgeService } from '../weighbridge/weighbridge.service';
import { QcProductAnalysisService } from './qc-product-analysis.service';
import { ActiveTransactionAmendmentService } from '../transactions/active-transaction-amendment.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';
import { SpecificationProvider } from './providers/specification.provider';
import {
  GspAnalysisProfile,
  ProcessType,
  TransactionStatus,
  CorrectionAction,
} from '@prisma/client';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';

describe('GSP Workflow Routing by Locked Analysis Profile (Section 31 vectors 18-26)', () => {
  let weighbridgeService: WeighbridgeService;
  let qcAnalysisService: QcProductAnalysisService;
  let amendmentService: ActiveTransactionAmendmentService;

  const mockPrismaService: any = {
    transaction: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn().mockResolvedValue(1),
    },
    weighbridgeRecord: {
      findFirst: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _max: { revision: 0 } }),
      create: jest.fn(),
    },
    qcProductAnalysis: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    transactionCorrection: {
      create: jest.fn(),
    },
    transactionStatusHistory: {
      create: jest.fn(),
    },
    productCatalog: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockActivityLogs = {
    logAction: jest.fn().mockResolvedValue({}),
  };

  const mockAuthScope = {
    assertProcessAccess: jest.fn(),
  };

  const mockSpecProvider = {
    getCoalSpec: jest.fn().mockReturnValue({}),
    getPacSpec: jest.fn().mockReturnValue({}),
    getRapidKlenSpec: jest.fn().mockReturnValue({}),
  };

  const testUser: JwtPayloadUser = {
    id: 'user-ops-1',
    email: 'ops@gms.local',
    role: 'ADMIN',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeighbridgeService,
        QcProductAnalysisService,
        ActiveTransactionAmendmentService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ActivityLogsService, useValue: mockActivityLogs },
        { provide: AuthorizationScopeService, useValue: mockAuthScope },
        { provide: SpecificationProvider, useValue: mockSpecProvider },
      ],
    }).compile();

    weighbridgeService = module.get<WeighbridgeService>(WeighbridgeService);
    qcAnalysisService = module.get<QcProductAnalysisService>(
      QcProductAnalysisService,
    );
    amendmentService = module.get<ActiveTransactionAmendmentService>(
      ActiveTransactionAmendmentService,
    );

    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation((cb: any) =>
      cb(mockPrismaService),
    );
  });

  describe('Weigh-In Routing based on Snapshot Profile', () => {
    it('18. Solar weigh-in with PA_EXEMPT profile routes to PA_NOT_REQUIRED', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-solar-wb',
        status: TransactionStatus.REGISTERED,
        processType: ProcessType.GSP,
        cargoType: 'Fuel',
        cargoSubType: 'Solar',
        gspAnalysisProfile: GspAnalysisProfile.PA_EXEMPT,
        paPolicyVersion: 'SOP-GSP-2026.1',
        revision: 1,
        weighbridgeRecords: [],
        productCatalog: {
          id: 'cat-solar-1',
          code: 'SOLAR-001',
          name: 'Solar',
          category: 'Fuel',
          processType: 'GSP',
          isPaRequired: false,
          isActive: true,
          gspAnalysisProfile: GspAnalysisProfile.PA_EXEMPT,
        },
      });

      mockPrismaService.weighbridgeRecord.findFirst.mockResolvedValueOnce(null);
      mockPrismaService.transaction.updateMany.mockResolvedValueOnce({
        count: 1,
      });

      await weighbridgeService.submitWeighIn(
        'tx-solar-wb',
        { weight: 15000, ticketNumber: 'TKT-001' },
        testUser,
      );

      expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.PA_NOT_REQUIRED,
            grossWeight: 15000,
          }),
        }),
      );
    });

    it('19. Coal weigh-in with COAL_PA profile routes to QC_VEHICLE_PENDING', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-coal-wb',
        status: TransactionStatus.REGISTERED,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        gspAnalysisProfile: GspAnalysisProfile.COAL_PA,
        paPolicyVersion: 'SOP-GSP-2026.1',
        revision: 1,
        weighbridgeRecords: [],
        productCatalog: {
          id: 'cat-coal-1',
          code: 'COAL-001',
          name: 'Batubara',
          category: 'Coal',
          processType: 'GSP',
          isPaRequired: true,
          isActive: true,
          gspAnalysisProfile: GspAnalysisProfile.COAL_PA,
        },
      });

      mockPrismaService.weighbridgeRecord.findFirst.mockResolvedValueOnce(null);
      mockPrismaService.transaction.updateMany.mockResolvedValueOnce({
        count: 1,
      });

      await weighbridgeService.submitWeighIn(
        'tx-coal-wb',
        { weight: 24000, ticketNumber: 'TKT-002' },
        testUser,
      );

      expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_PENDING,
            grossWeight: 24000,
          }),
        }),
      );
    });

    it('20. PAC weigh-in with PAC_PA profile routes to QC_VEHICLE_PENDING', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-pac-wb',
        status: TransactionStatus.REGISTERED,
        processType: ProcessType.GSP,
        cargoType: 'Chemical UTL',
        cargoSubType: 'PAC 280 AC',
        gspAnalysisProfile: GspAnalysisProfile.PAC_PA,
        paPolicyVersion: 'SOP-GSP-2026.1',
        revision: 1,
        weighbridgeRecords: [],
        productCatalog: {
          id: 'cat-pac-1',
          code: 'PAC-001',
          name: 'PAC 280 AC',
          category: 'Chemical UTL',
          processType: 'GSP',
          isPaRequired: true,
          isActive: true,
          gspAnalysisProfile: GspAnalysisProfile.PAC_PA,
        },
      });

      mockPrismaService.weighbridgeRecord.findFirst.mockResolvedValueOnce(null);
      mockPrismaService.transaction.updateMany.mockResolvedValueOnce({
        count: 1,
      });

      await weighbridgeService.submitWeighIn(
        'tx-pac-wb',
        { weight: 12000 },
        testUser,
      );

      expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_PENDING,
          }),
        }),
      );
    });

    it('21. Rapid Klen weigh-in with RAPID_KLEN_PA profile routes to QC_VEHICLE_PENDING', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-rpd-wb',
        status: TransactionStatus.REGISTERED,
        processType: ProcessType.GSP,
        cargoType: 'Chemical PROD',
        cargoSubType: 'Rapid Klen',
        gspAnalysisProfile: GspAnalysisProfile.RAPID_KLEN_PA,
        paPolicyVersion: 'SOP-GSP-2026.1',
        revision: 1,
        weighbridgeRecords: [],
        productCatalog: {
          id: 'cat-rpd-1',
          code: 'RPD-001',
          name: 'Rapid Klen',
          category: 'Chemical PROD',
          processType: 'GSP',
          isPaRequired: true,
          isActive: true,
          gspAnalysisProfile: GspAnalysisProfile.RAPID_KLEN_PA,
        },
      });

      mockPrismaService.weighbridgeRecord.findFirst.mockResolvedValueOnce(null);
      mockPrismaService.transaction.updateMany.mockResolvedValueOnce({
        count: 1,
      });

      await weighbridgeService.submitWeighIn(
        'tx-rpd-wb',
        { weight: 14000 },
        testUser,
      );

      expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_PENDING,
          }),
        }),
      );
    });
  });

  describe('PA Execution Profile Governance & Tamper Prevention', () => {
    it('22. PA_EXEMPT transaction cannot start PA (throws 400)', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-solar-pa',
        status: TransactionStatus.PA_NOT_REQUIRED,
        processType: 'GSP',
        cargoType: 'Fuel',
        cargoSubType: 'Solar',
        gspAnalysisProfile: GspAnalysisProfile.PA_EXEMPT,
        productCatalog: {
          id: 'cat-solar-1',
          isPaRequired: false,
          isActive: true,
          processType: 'GSP',
        },
      });

      await expect(
        qcAnalysisService.startProductAnalysis('tx-solar-pa', testUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('23. PA_EXEMPT transaction cannot submit PA analysis (throws 400)', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-solar-pa',
        status: TransactionStatus.PA_NOT_REQUIRED,
        processType: 'GSP',
        cargoType: 'Fuel',
        cargoSubType: 'Solar',
        gspAnalysisProfile: GspAnalysisProfile.PA_EXEMPT,
        productCatalog: {
          id: 'cat-solar-1',
          isPaRequired: false,
          isActive: true,
          processType: 'GSP',
        },
      });

      await expect(
        qcAnalysisService.submitProductAnalysis(
          'tx-solar-pa',
          { parameters: {} } as any,
          testUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Active Transaction Amendment Profile Snapshot & Invalidation', () => {
    it('24 & 25. Amendment updates profile snapshot and voids stale PA evidence', async () => {
      const activeTx = {
        id: 'tx-amend-target',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        processType: ProcessType.GSP,
        cargoType: 'Chemical UTL',
        cargoSubType: 'PAC 280 AC',
        gspAnalysisProfile: GspAnalysisProfile.PAC_PA,
        paPolicyVersion: 'SOP-GSP-2026.1',
        warehouseStartAt: null,
        revision: 3,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(activeTx);
      // New target product: Rapid Klen (Chemical PROD, RAPID_KLEN_PA)
      mockPrismaService.productCatalog.findUnique.mockResolvedValueOnce({
        id: 'cat-rpd-1',
        code: 'RPD-001',
        name: 'Rapid Klen',
        category: 'Chemical PROD',
        processType: ProcessType.GSP,
        gspAnalysisProfile: GspAnalysisProfile.RAPID_KLEN_PA,
        isPaRequired: true,
        isActive: true,
        policyVersion: 'SOP-GSP-2026.1',
        receiptUnit: 'LITER',
      });

      mockPrismaService.transaction.updateMany.mockResolvedValueOnce({
        count: 1,
      });
      mockPrismaService.qcProductAnalysis.updateMany.mockResolvedValueOnce({
        count: 1,
      });
      mockPrismaService.transactionCorrection.create.mockResolvedValueOnce({
        id: 'corr-1',
      });

      await amendmentService.amendActiveProduct(
        'tx-amend-target',
        {
          productCatalogId: 'cat-rpd-1',
          cargoType: 'Chemical PROD',
          cargoSubType: 'Rapid Klen',
          reason: 'Salah pilih material saat registrasi',
          revision: 3,
        },
        testUser,
      );

      // Verify stale QC PA evidence was voided
      expect(
        mockPrismaService.qcProductAnalysis.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { transactionId: 'tx-amend-target', isVoided: false },
          data: expect.objectContaining({ isVoided: true, status: 'VOIDED' }),
        }),
      );

      // Verify profile snapshot was updated to RAPID_KLEN_PA
      expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tx-amend-target', revision: 3 },
          data: expect.objectContaining({
            cargoType: 'Chemical PROD',
            cargoSubType: 'Rapid Klen',
            productCatalogId: 'cat-rpd-1',
            gspAnalysisProfile: GspAnalysisProfile.RAPID_KLEN_PA,
            status: TransactionStatus.QC_VEHICLE_PENDING,
          }),
        }),
      );
    });
  });

  describe('Historical Compatibility', () => {
    it('26. Historical null-profile transactions fall back gracefully in weigh-in', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-legacy-coal',
        status: TransactionStatus.REGISTERED,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        gspAnalysisProfile: null, // Historical record with null profile
        revision: 1,
        weighbridgeRecords: [],
        productCatalog: {
          id: 'cat-coal-1',
          code: 'COAL-001',
          name: 'Batubara',
          category: 'Coal',
          processType: 'GSP',
          isPaRequired: true,
          isActive: true,
          gspAnalysisProfile: GspAnalysisProfile.COAL_PA,
        },
      });

      mockPrismaService.weighbridgeRecord.findFirst.mockResolvedValueOnce(null);
      mockPrismaService.transaction.updateMany.mockResolvedValueOnce({
        count: 1,
      });

      await weighbridgeService.submitWeighIn(
        'tx-legacy-coal',
        { weight: 20000 },
        testUser,
      );

      expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_PENDING,
          }),
        }),
      );
    });
  });
});
