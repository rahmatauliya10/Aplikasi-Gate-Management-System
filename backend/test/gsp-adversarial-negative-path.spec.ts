import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  TransactionStatus,
  ProcessType,
  QcResult,
  Role,
  CorrectionAction,
} from '@prisma/client';
import { QcService } from '../src/qc/qc.service';
import { WarehouseService } from '../src/warehouse/warehouse.service';
import { QcProductAnalysisService } from '../src/qc/qc-product-analysis.service';
import { ActiveTransactionAmendmentService } from '../src/transactions/active-transaction-amendment.service';
import { OperationLogCorrectionService } from '../src/transactions/operation-log-correction.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ActivityLogsService } from '../src/activity-logs/activity-logs.service';
import { AuthorizationScopeService } from '../src/auth/authorization-scope.service';
import { AnalysisDecision } from '../src/qc/dto/submit-product-analysis.dto';
import { SpecificationProvider } from '../src/qc/providers/specification.provider';
import { TEST_FIXTURE_RAPID_KLEN_STRICT_GT } from '../src/qc/constants/chemical-specification';

describe('GSP Adversarial Negative-Path & Anti-Bypass Test Suite (P0 Remediation)', () => {
  let qcService: QcService;
  let warehouseService: WarehouseService;
  let qcAnalysisService: QcProductAnalysisService;
  let amendmentService: ActiveTransactionAmendmentService;
  let correctionService: OperationLogCorrectionService;
  let specProvider: SpecificationProvider;

  let mockPrismaService: any;
  let mockActivityLogsService: any;
  let mockAuthScopeService: any;

  // Actors
  const qcAnalystUser: JwtPayloadUser = {
    id: 'analyst-uuid-1',
    role: Role.QC,
    email: 'qc.analyst@gms.local',
  } as any;

  const warehouseUser: JwtPayloadUser = {
    id: 'wh-uuid-1',
    role: Role.WAREHOUSE,
    email: 'wh.operator@gms.local',
  } as any;

  const adminNonUtilityUser: JwtPayloadUser = {
    id: 'admin-non-util',
    role: Role.ADMIN,
    department: 'OPERATIONS',
    email: 'admin.ops@gms.local',
  } as any;

  beforeEach(async () => {
    mockPrismaService = {
      $transaction: jest.fn().mockImplementation(async (cb: any) => {
        if (typeof cb === 'function') {
          return cb(mockPrismaService);
        }
        return cb;
      }),
      transaction: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      warehouseProcess: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        aggregate: jest.fn(),
      },
      incomingMaterialCheck: {
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      weighbridgeRecord: {
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        aggregate: jest.fn(),
      },
      qcVehicleCheck: {
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      qcProductAnalysis: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      transactionCorrection: {
        create: jest.fn(),
      },
      transactionCorrectionItem: {
        createMany: jest.fn(),
      },
      transactionStatusHistory: {
        create: jest.fn(),
      },
      attachment: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      userWarehouseAccess: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { processType: ProcessType.GSP },
            { processType: ProcessType.GBB },
            { processType: ProcessType.GBJ },
          ]),
      },
      productCatalog: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      appSetting: {
        findUnique: jest.fn(),
      },
    };

    mockActivityLogsService = {
      logAction: jest.fn().mockResolvedValue({}),
    };

    mockAuthScopeService = {
      getTransactionScope: jest.fn().mockReturnValue({}),
      assertProcessAccess: jest.fn(),
      assertScopeNotEmpty: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QcService,
        WarehouseService,
        QcProductAnalysisService,
        SpecificationProvider,
        ActiveTransactionAmendmentService,
        OperationLogCorrectionService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ActivityLogsService, useValue: mockActivityLogsService },
        { provide: AuthorizationScopeService, useValue: mockAuthScopeService },
      ],
    }).compile();

    qcService = module.get<QcService>(QcService);
    warehouseService = module.get<WarehouseService>(WarehouseService);
    qcAnalysisService = module.get<QcProductAnalysisService>(
      QcProductAnalysisService,
    );
    amendmentService = module.get<ActiveTransactionAmendmentService>(
      ActiveTransactionAmendmentService,
    );
    correctionService = module.get<OperationLogCorrectionService>(
      OperationLogCorrectionService,
    );
    specProvider = module.get<SpecificationProvider>(SpecificationProvider);
  });

  // =========================================================================
  // Category A: Block Legacy QC Bypass Endpoints on GSP Transactions
  // =========================================================================
  describe('Category A: Legacy QC Bypass Prevention on GSP', () => {
    const baseGspTx: any = {
      id: 'tx-gsp-adv-1',
      processType: ProcessType.GSP,
      cargoType: 'Coal',
      cargoSubType: 'Batubara',
      status: TransactionStatus.QC_VEHICLE_PENDING,
      revision: 1,
    };

    it('Vector 1: startQc fails closed with HTTP 400 for GSP transaction', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(baseGspTx);
      await expect(
        qcService.startQc(
          'tx-gsp-adv-1',
          { revision: 1 } as any,
          qcAnalystUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('Vector 2: submitVehicleCheck fails closed with HTTP 400 for GSP transaction', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(baseGspTx);
      await expect(
        qcService.submitVehicleCheck(
          'tx-gsp-adv-1',
          { result: QcResult.PASSED, revision: 1 } as any,
          qcAnalystUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('Vector 3: submitIncomingCheck fails closed with HTTP 400 for GSP transaction', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(baseGspTx);
      await expect(
        qcService.submitIncomingCheck(
          'tx-gsp-adv-1',
          { result: QcResult.PASSED, revision: 1 } as any,
          qcAnalystUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // Category B: Warehouse Unloading Defense-in-Depth Proof-of-PA Gates
  // =========================================================================
  describe('Category B: Warehouse Unloading Defense-in-Depth Gates', () => {
    const activeGspCatalog = {
      id: 'cat-coal-1',
      code: 'COAL-001',
      name: 'Batubara',
      processType: ProcessType.GSP,
      isActive: true,
      isPaRequired: true,
    };

    it('Vector 4: Warehouse start rejected when weighInAt is null (pre-weighin attempt)', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
        id: 'tx-no-wb',
        processType: ProcessType.GSP,
        status: TransactionStatus.QC_VEHICLE_PASSED,
        weighInAt: null,
        grossWeight: 25000,
        productCatalog: activeGspCatalog,
      });

      await expect(
        warehouseService.startWarehouse('tx-no-wb', {}, warehouseUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('Vector 5: Warehouse start rejected when grossWeight is zero or negative', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
        id: 'tx-zero-weight',
        processType: ProcessType.GSP,
        status: TransactionStatus.QC_VEHICLE_PASSED,
        weighInAt: new Date(),
        grossWeight: 0,
        productCatalog: activeGspCatalog,
      });

      await expect(
        warehouseService.startWarehouse('tx-zero-weight', {}, warehouseUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('Vector 6: Warehouse start rejected when ProductCatalog is inactive', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
        id: 'tx-inactive-cat',
        processType: ProcessType.GSP,
        status: TransactionStatus.QC_VEHICLE_PASSED,
        weighInAt: new Date(),
        grossWeight: 25000,
        productCatalog: { ...activeGspCatalog, isActive: false },
      });

      await expect(
        warehouseService.startWarehouse('tx-inactive-cat', {}, warehouseUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('Vector 7: Warehouse start rejected when ProductCatalog is not GSP processType', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
        id: 'tx-wrong-scope-cat',
        processType: ProcessType.GSP,
        status: TransactionStatus.QC_VEHICLE_PASSED,
        weighInAt: new Date(),
        grossWeight: 25000,
        productCatalog: { ...activeGspCatalog, processType: ProcessType.GBB },
      });

      await expect(
        warehouseService.startWarehouse(
          'tx-wrong-scope-cat',
          {},
          warehouseUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('Vector 8: Warehouse start rejected when active non-voided PA record is missing', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
        id: 'tx-missing-pa',
        processType: ProcessType.GSP,
        status: TransactionStatus.QC_VEHICLE_PASSED,
        weighInAt: new Date(),
        grossWeight: 25000,
        productCatalog: activeGspCatalog,
      });
      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce(null);

      await expect(
        warehouseService.startWarehouse('tx-missing-pa', {}, warehouseUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('Vector 9: Warehouse start rejected when PA record is marked isVoided: true', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
        id: 'tx-voided-pa',
        processType: ProcessType.GSP,
        status: TransactionStatus.QC_VEHICLE_PASSED,
        weighInAt: new Date(),
        grossWeight: 25000,
        productCatalog: activeGspCatalog,
      });
      // findFirst queries with where: { isVoided: false }, returning null if only voided exists
      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce(null);

      await expect(
        warehouseService.startWarehouse('tx-voided-pa', {}, warehouseUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('Vector 10: Warehouse start rejected when PA catalog does not match transaction catalog', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
        id: 'tx-mismatch-cat',
        processType: ProcessType.GSP,
        status: TransactionStatus.QC_VEHICLE_PASSED,
        weighInAt: new Date(),
        grossWeight: 25000,
        productCatalogId: 'cat-coal-1',
        productCatalog: activeGspCatalog,
      });
      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce({
        id: 'pa-other-product',
        transactionId: 'tx-mismatch-cat',
        productCatalogId: 'cat-pac-999', // Mismatched!
        status: 'RELEASE',
        result: 'PASSED',
        isVoided: false,
      });

      await expect(
        warehouseService.startWarehouse('tx-mismatch-cat', {}, warehouseUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('Vector 11: Warehouse start rejected when PA is REJECT or PENDING_DISPOSITION without disposition', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
        id: 'tx-pending-disp',
        processType: ProcessType.GSP,
        status: TransactionStatus.QC_VEHICLE_PASSED,
        weighInAt: new Date(),
        grossWeight: 25000,
        productCatalogId: 'cat-coal-1',
        productCatalog: activeGspCatalog,
      });
      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce({
        id: 'pa-no-disp',
        transactionId: 'tx-pending-disp',
        productCatalogId: 'cat-coal-1',
        status: 'PENDING_DISPOSITION',
        dispositionAction: null,
        dispositionById: null,
        isVoided: false,
      });

      await expect(
        warehouseService.startWarehouse('tx-pending-disp', {}, warehouseUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('Vector 11b: Legacy ACCEPT_WITH_DEVIATION evidence rejects warehouse start (Zero Utility authorization)', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
        id: 'tx-legacy-disp',
        processType: ProcessType.GSP,
        status: TransactionStatus.QC_VEHICLE_PASSED,
        weighInAt: new Date(),
        grossWeight: 25000,
        productCatalogId: 'cat-coal-1',
        productCatalog: activeGspCatalog,
      });
      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce({
        id: 'pa-legacy-disp',
        transactionId: 'tx-legacy-disp',
        productCatalogId: 'cat-coal-1',
        status: 'ACCEPT_WITH_DEVIATION',
        dispositionAction: 'ACCEPT_WITH_DEVIATION',
        dispositionById: 'legacy-util-user',
        isVoided: false,
      });

      await expect(
        warehouseService.startWarehouse('tx-legacy-disp', {}, warehouseUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // Category C: Process Scope & Four-Eyes Authorization Enforcement
  // =========================================================================
  describe('Category C: Process Scope & Four-Eyes Authorization', () => {
    it('Vector 12: assertProcessAccess rejects user lacking GSP scope for PA analysis', async () => {
      mockAuthScopeService.assertProcessAccess.mockImplementationOnce(() => {
        throw new ForbiddenException(
          'Akses ditolak: Pengguna tidak memiliki otorisasi untuk tipe proses GSP',
        );
      });

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
        id: 'tx-scope-check',
        processType: ProcessType.GSP,
      });

      await expect(
        qcAnalysisService.submitProductAnalysis(
          'tx-scope-check',
          { revision: 1 } as any,
          qcAnalystUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Vector 13-16: Utility disposition method is completely removed from service (Zero Utility API surface)', () => {
      expect(
        (qcAnalysisService as any).submitUtilityDisposition,
      ).toBeUndefined();
    });
  });

  // =========================================================================
  // Category D: Server-Authoritative Evaluation & Operational Safeguards
  // =========================================================================
  describe('Category D: Server-Authoritative Evaluation & Anti-Tamper', () => {
    it('Vector 17: Client-forged PASS/RELEASE claim is overridden by server evaluators', async () => {
      const coalTx: any = {
        id: 'tx-coal-forged',
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        weighInAt: new Date(),
        grossWeight: 30000,
        revision: 1,
        productCatalog: {
          id: 'cat-coal-1',
          processType: ProcessType.GSP,
          isActive: true,
          isPaRequired: true,
        },
      };
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);
      jest
        .spyOn(qcAnalysisService, 'checkSpecificationApprovalStatus')
        .mockReturnValue({
          approvalStatus: 'APPROVED',
          documentSource: 'SOP-GSP-2026.1',
        });

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

      // Client maliciously claims PASS & RELEASE despite moisture = 36% (Max is 33%)
      // Server authoritative check rejects client claim with BadRequestException
      await expect(
        qcAnalysisService.submitProductAnalysis(
          coalTx.id,
          {
            productCategory: 'Coal',
            productName: 'Batubara',
            sampleCode: 'COAL-SMP-FORGED',
            analysisDate: new Date().toISOString(),
            testRound: 1,
            parameters: {
              moisture: 36, // OUT OF SPEC (> 33%)
              caloriValue: 4200,
              ashContent: 8,
              sulfurContent: 0.8,
            },
            result: QcResult.PASSED, // FORGED CLAIM
            decision: AnalysisDecision.RELEASE, // FORGED CLAIM
            revision: 1,
          },
          qcAnalystUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('Vector 18: Active transaction amendment to inactive or non-existent catalog fails closed', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
        id: 'tx-amend-fail',
        processType: ProcessType.GSP,
        status: TransactionStatus.REGISTERED,
        weighInAt: null,
        revision: 1,
      });
      mockPrismaService.productCatalog.findUnique.mockResolvedValueOnce(null);

      await expect(
        amendmentService.amendActiveProduct(
          'tx-amend-fail',
          {
            productCatalogId: 'non-existent-cat-uuid',
            amendmentReason: 'Salah pilih katalog',
            revision: 1,
          },
          adminNonUtilityUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('Vector 19: Operational incident rejects non-UUID or mismatched evidenceAttachmentId', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
        id: 'tx-inc-fail',
        processType: ProcessType.GSP,
        status: TransactionStatus.WAREHOUSE_DONE,
        weighInAt: new Date(),
        warehouseStartAt: new Date(),
        warehouseEndAt: new Date(),
        revision: 3,
      });

      // Invalid non-UUID format
      await expect(
        amendmentService.recordOperationalIncident(
          'tx-inc-fail',
          {
            incidentType: 'MATERIAL_CONTAMINATION',
            investigationSummary: 'Valid summary with more than 10 characters',
            correctiveAction: 'Valid action with more than 10 characters',
            evidenceAttachmentId: 'invalid-non-uuid-string',
            revision: 3,
          },
          adminNonUtilityUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('Vector 20: Operational incident with outdated revision triggers HTTP 409 Conflict', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
        id: 'tx-inc-rev-conflict',
        processType: ProcessType.GSP,
        status: TransactionStatus.WAREHOUSE_DONE,
        weighInAt: new Date(),
        warehouseStartAt: new Date(),
        warehouseEndAt: new Date(),
        revision: 5, // DB is at 5
      });
      mockPrismaService.attachment.findUnique.mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        transactionId: 'tx-inc-rev-conflict',
      });

      // User sends revision 4 (Conflict)
      await expect(
        amendmentService.recordOperationalIncident(
          'tx-inc-rev-conflict',
          {
            incidentType: 'MATERIAL_CONTAMINATION',
            investigationSummary: 'Valid summary with more than 10 characters',
            correctiveAction: 'Valid action with more than 10 characters',
            evidenceAttachmentId: '11111111-1111-4111-8111-111111111111',
            revision: 4, // Outdated
          },
          adminNonUtilityUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('Vector 21: Operation log correction rejects REOPEN_WORKFLOW to INCOMING_CHECK_PENDING on GSP', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
        id: 'tx-gsp-reopen-reject',
        processType: ProcessType.GSP,
        status: TransactionStatus.COMPLETED,
        revision: 6,
        isVoided: false,
      });

      await expect(
        correctionService.correctOperationLog(
          'tx-gsp-reopen-reject',
          {
            action: CorrectionAction.REOPEN_WORKFLOW,
            reasonCode: 'SALAH_INPUT_ANGKA',
            remark: 'Adversarial attempt to reopen GSP to GBB stage',
            expectedRevision: 6,
            reopenTargetStatus: TransactionStatus.INCOMING_CHECK_PENDING,
          },
          adminNonUtilityUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // Category F: Phase 3 Invariants & Canonical Lifecycle Hardening (Vectors 22-29)
  // =========================================================================
  describe('Category F: Phase 3 Invariants & Canonical Lifecycle Hardening', () => {
    it('Vector 22: WarehouseService rejects GSP Solar with forged QC_VEHICLE_PASSED status', async () => {
      const solarTxForged = {
        id: 'tx-solar-forged-passed',
        processType: ProcessType.GSP,
        cargoType: 'Fuel',
        cargoSubType: 'Solar B30',
        status: TransactionStatus.QC_VEHICLE_PASSED, // FORGED / INVALID for Solar!
        weighInAt: new Date(),
        grossWeight: 15000,
        revision: 3,
        productCatalog: {
          id: 'cat-solar',
          code: 'SOLAR-001',
          name: 'Solar B30',
          category: 'Fuel',
          subCategory: 'Solar',
          processType: 'GSP',
          isPaRequired: false,
          policyVersion: 'SOP-GSP-2026.1',
          isActive: true,
        },
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        solarTxForged,
      );

      await expect(
        warehouseService.startWarehouse(
          'tx-solar-forged-passed',
          {},
          warehouseUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('Vector 23: PA start endpoint rejects Solar / PA-exempt commodity with BadRequestException', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
        id: 'tx-solar-pa-start',
        processType: ProcessType.GSP,
        cargoType: 'Fuel',
        cargoSubType: 'Solar B30',
        status: TransactionStatus.PA_NOT_REQUIRED,
        productCatalog: {
          name: 'Solar B30',
          isPaRequired: false,
          isActive: true,
        },
      });

      await expect(
        qcAnalysisService.startProductAnalysis(
          'tx-solar-pa-start',
          qcAnalystUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('Vector 24: PA start transitions QC_VEHICLE_PENDING to QC_VEHICLE_IN_PROGRESS and sets qcStartAt', async () => {
      const coalTx = {
        id: 'tx-coal-start-adv',
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        grossWeight: 18000,
        weighInAt: new Date(),
        revision: 2,
      };

      mockPrismaService.transaction.findUnique
        .mockResolvedValueOnce(coalTx)
        .mockResolvedValueOnce({
          ...coalTx,
          status: TransactionStatus.QC_VEHICLE_IN_PROGRESS,
          revision: 3,
          qcStartAt: new Date(),
        });

      const res = await qcAnalysisService.startProductAnalysis(
        'tx-coal-start-adv',
        qcAnalystUser,
      );

      expect(res.success).toBe(true);
      expect(res.data.id).toBe('tx-coal-start-adv');
      expect(res.data.status).toBe(TransactionStatus.QC_VEHICLE_IN_PROGRESS);
      expect(res.data.revision).toBe(3);
      expect(res.data.cargoSubType).toBe('Batubara');
      expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_IN_PROGRESS,
            qcStartAt: expect.any(Date),
          }),
        }),
      );
    });

    it('Vector 25: PA start is idempotent and preserves initial qcStartAt without overwrite', async () => {
      const initialStartAt = new Date('2026-10-02T08:00:00.000Z');
      const inProgressTx = {
        id: 'tx-coal-already-adv',
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        status: TransactionStatus.QC_VEHICLE_IN_PROGRESS,
        grossWeight: 18000,
        weighInAt: new Date(),
        qcStartAt: initialStartAt,
        revision: 3,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        inProgressTx,
      );

      const res = await qcAnalysisService.startProductAnalysis(
        'tx-coal-already-adv',
        qcAnalystUser,
      );

      expect(res.success).toBe(true);
      expect(res.data.qcStartAt).toEqual(initialStartAt);
      expect(mockPrismaService.transaction.updateMany).not.toHaveBeenCalled();
    });

    it('Vector 26: Utility disposition method is completely removed from service', () => {
      expect(
        (qcAnalysisService as any).submitUtilityDisposition,
      ).toBeUndefined();
    });

    it('Vector 27: Rapid Klen exact 35.0% alkalinity fails GT 35.0% operational spec', async () => {
      const rkTx = {
        id: 'tx-rk-adv',
        processType: ProcessType.GSP,
        cargoType: 'Chemical',
        cargoSubType: 'Rapid Klen',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        revision: 2,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(rkTx);
      mockPrismaService.qcProductAnalysis.create.mockResolvedValueOnce({
        id: 'pa-rk-1',
        testRound: 1,
      });
      jest
        .spyOn(specProvider, 'getRapidKlenSpec')
        .mockReturnValue(TEST_FIXTURE_RAPID_KLEN_STRICT_GT);

      const res = await qcAnalysisService.submitProductAnalysis(
        'tx-rk-adv',
        {
          productCategory: 'Chemical',
          productName: 'Rapid Klen',
          parameters: {
            sensory: { visual: true, packaging: true },
            alkalinityNa2O: 35.0, // Exactly 35.0%
            ph: 13.0,
            density: 1.45,
          },
          result: QcResult.REJECT,
          decision: AnalysisDecision.REJECT,
          revision: 2,
        },
        qcAnalystUser,
      );

      expect(res.success).toBe(true);
      expect(mockPrismaService.qcProductAnalysis.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            result: QcResult.REJECT,
            status: 'REJECT',
          }),
        }),
      );
      expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_REJECTED,
          }),
        }),
      );
    });

    it('Vector 28: Solar REOPEN with target QC_VEHICLE_PASSED normalizes to PA_NOT_REQUIRED', async () => {
      const solarCompletedTx = {
        id: 'tx-solar-reopen-adv',
        processType: ProcessType.GSP,
        cargoType: 'Fuel',
        cargoSubType: 'Solar B30',
        status: TransactionStatus.COMPLETED,
        grossWeight: 15000,
        tareWeight: 5000,
        netWeight: 10000,
        weighInAt: new Date(),
        revision: 5,
        isVoided: false,
        productCatalog: {
          id: 'cat-solar-adv',
          name: 'Solar B30',
          category: 'Fuel',
          subCategory: 'Solar',
          processType: 'GSP',
          isPaRequired: false,
          policyVersion: 'SOP-GSP-2026.1',
          isActive: true,
        },
        weighbridgeRecords: [],
        warehouseProcesses: [],
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        solarCompletedTx,
      );
      mockPrismaService.transactionCorrection.create.mockResolvedValueOnce({
        id: 'corr-solar-1',
      });

      const res = await correctionService.correctOperationLog(
        'tx-solar-reopen-adv',
        {
          action: CorrectionAction.REOPEN_WORKFLOW,
          reasonCode: 'SALAH_INPUT_ANGKA',
          remark: 'Reopen Solar completed workflow',
          expectedRevision: 5,
          reopenTargetStatus: TransactionStatus.QC_VEHICLE_PASSED, // Requested QC_VEHICLE_PASSED
        },
        adminNonUtilityUser,
      );

      expect(res.success).toBe(true);
      // Persisted status MUST be PA_NOT_REQUIRED, NOT QC_VEHICLE_PASSED
      expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.PA_NOT_REQUIRED,
          }),
        }),
      );
    });

    it('Vector 29: Non-exempt GSP REOPEN with target QC_VEHICLE_PASSED downgrades to QC_VEHICLE_PENDING without active PA release evidence', async () => {
      const coalCompletedTx = {
        id: 'tx-coal-reopen-adv',
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        status: TransactionStatus.COMPLETED,
        grossWeight: 18000,
        tareWeight: 6000,
        netWeight: 12000,
        weighInAt: new Date(),
        revision: 6,
        isVoided: false,
        productCatalog: {
          id: 'cat-coal-adv',
          name: 'Batubara GAR 4200',
          category: 'Coal',
          processType: 'GSP',
          isPaRequired: true,
          isActive: true,
        },
        weighbridgeRecords: [],
        warehouseProcesses: [],
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        coalCompletedTx,
      );
      mockPrismaService.transactionCorrection.create.mockResolvedValueOnce({
        id: 'corr-coal-1',
      });
      // Active PA not found or voided
      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce(null);

      const res = await correctionService.correctOperationLog(
        'tx-coal-reopen-adv',
        {
          action: CorrectionAction.REOPEN_WORKFLOW,
          reasonCode: 'SALAH_INPUT_ANGKA',
          remark: 'Reopen Coal completed workflow without PA release evidence',
          expectedRevision: 6,
          reopenTargetStatus: TransactionStatus.QC_VEHICLE_PASSED,
        },
        adminNonUtilityUser,
      );

      expect(res.success).toBe(true);
      // Because active PA release evidence was absent, downgraded to QC_VEHICLE_PENDING
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
