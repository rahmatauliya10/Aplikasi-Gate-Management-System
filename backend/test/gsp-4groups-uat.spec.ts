import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TransactionStatus, ProcessType, QcResult, WarehouseUnit, WarehouseCondition, Role, CorrectionAction, WeighbridgeType } from '@prisma/client';
import { WeighbridgeService } from '../src/weighbridge/weighbridge.service';
import { WarehouseService } from '../src/warehouse/warehouse.service';
import { QcProductAnalysisService } from '../src/qc/qc-product-analysis.service';
import { ActiveTransactionAmendmentService } from '../src/transactions/active-transaction-amendment.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ActivityLogsService } from '../src/activity-logs/activity-logs.service';
import { AuthorizationScopeService } from '../src/auth/authorization-scope.service';
import { AnalysisDecision } from '../src/qc/dto/submit-product-analysis.dto';
import { DispositionAction } from '../src/qc/dto/utility-disposition.dto';
import { JwtPayloadUser } from '../src/common/decorators/current-user.decorator';
import { isValidStatusTransition } from '../src/common/state-machine/workflow-state-machine';

describe('GSP 4-Group Comprehensive UAT Protocol (Task 9 Scenarios)', () => {
  let weighbridgeService: WeighbridgeService;
  let warehouseService: WarehouseService;
  let qcAnalysisService: QcProductAnalysisService;
  let amendmentService: ActiveTransactionAmendmentService;

  let mockPrismaService: any;
  let mockActivityLogsService: any;
  let mockAuthScopeService: any;

  // Actors
  const securityUser: JwtPayloadUser = { id: 'sec-1', role: Role.SECURITY, email: 'security@gms.local' } as any;
  const weighbridgeUser: JwtPayloadUser = { id: 'wb-1', role: Role.SECURITY, email: 'weighbridge@gms.local' } as any;
  const qcAnalystUser: JwtPayloadUser = { id: 'qc-analyst-1', role: Role.QC, email: 'analyst@gms.local' } as any;
  const utilityOfficerUser: JwtPayloadUser = { id: 'util-officer-1', role: Role.ADMIN, email: 'utility@gms.local' } as any;
  const warehouseUser: JwtPayloadUser = { id: 'wh-1', role: Role.WAREHOUSE, email: 'warehouse@gms.local' } as any;
  const adminUser: JwtPayloadUser = { id: 'admin-1', role: Role.ADMIN, email: 'admin@gms.local' } as any;

  beforeEach(async () => {
    mockPrismaService = {
      $transaction: jest.fn(),
      transaction: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      warehouseProcess: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn(),
      },
      incomingMaterialCheck: {
        create: jest.fn(),
      },
      weighbridgeRecord: {
        findFirst: jest.fn(),
        create: jest.fn(),
        aggregate: jest.fn(),
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
      transactionStatusHistory: {
        create: jest.fn(),
      },
      attachment: {
        findUnique: jest.fn(),
      },
      userWarehouseAccess: {
        findMany: jest.fn().mockResolvedValue([
          { processType: ProcessType.GSP },
          { processType: ProcessType.GBB },
          { processType: ProcessType.GBJ },
        ]),
      },
      productCatalog: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    mockActivityLogsService = {
      logAction: jest.fn().mockResolvedValue({}),
    };

    mockAuthScopeService = {
      getTransactionScope: jest.fn().mockReturnValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeighbridgeService,
        WarehouseService,
        QcProductAnalysisService,
        ActiveTransactionAmendmentService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ActivityLogsService, useValue: mockActivityLogsService },
        { provide: AuthorizationScopeService, useValue: mockAuthScopeService },
      ],
    }).compile();

    weighbridgeService = module.get<WeighbridgeService>(WeighbridgeService);
    warehouseService = module.get<WarehouseService>(WarehouseService);
    qcAnalysisService = module.get<QcProductAnalysisService>(QcProductAnalysisService);
    amendmentService = module.get<ActiveTransactionAmendmentService>(ActiveTransactionAmendmentService);
  });

  // =========================================================================
  // Skenario 1: Solar — Happy Path Bypass PA
  // Gate → WB In → PA_NOT_REQUIRED → GSP Bongkar → WAREHOUSE_DONE → WB Out → Gate Out
  // =========================================================================
  describe('Skenario 1: Solar — Happy Path Bypass PA', () => {
    it('executes full solar delivery lifecycle bypassing PA without false pass record', async () => {
      // 1. Initial registered truck state
      const solarTx: any = {
        id: 'tx-solar-uat',
        transactionNumber: 'GMS-20260930-0001',
        licensePlate: 'B9301SLR',
        processType: ProcessType.GSP,
        cargoType: 'Fuel',
        cargoSubType: 'Solar',
        status: TransactionStatus.REGISTERED,
        grossWeight: null,
        tareWeight: null,
        netWeight: null,
        warehouseStartAt: null,
        warehouseEndAt: null,
        revision: 1,
        productCatalog: {
          id: 'cat-solar-uat',
          code: 'SOLAR-001',
          name: 'Solar',
          category: 'Fuel',
          subCategory: 'Solar',
          processType: ProcessType.GSP,
          isPaRequired: false,
          policyVersion: 'SOP-GSP-2026.1',
          isActive: true,
        },
      };

      // 2. Weighbridge IN: Gross 25,000 kg
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(solarTx);
      mockPrismaService.weighbridgeRecord.findFirst.mockResolvedValueOnce(null);

      const mockTxClientWbIn = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            ...solarTx,
            status: TransactionStatus.PA_NOT_REQUIRED,
            grossWeight: 25000,
            revision: 2,
          }),
        },
        weighbridgeRecord: {
          findFirst: jest.fn().mockResolvedValue(null),
          aggregate: jest.fn().mockResolvedValue({ _max: { revision: 0 } }),
          create: jest.fn().mockResolvedValue({ id: 'wb-rec-solar-in' }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };
      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) => cb(mockTxClientWbIn));

      const wbInRes = await weighbridgeService.submitWeighIn(solarTx.id, { weight: 25000 }, weighbridgeUser);
      expect(wbInRes.success).toBe(true);

      // Verify status is PA_NOT_REQUIRED (never QC_VEHICLE_PASSED!)
      expect(mockTxClientWbIn.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.PA_NOT_REQUIRED,
            grossWeight: 25000,
          }),
        }),
      );
      // Verify audit log has PA_EXEMPTION_APPLIED
      expect(mockActivityLogsService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PA_EXEMPTION_APPLIED',
          referenceId: solarTx.id,
        }),
      );

      // State machine validity check
      expect(isValidStatusTransition(TransactionStatus.REGISTERED, TransactionStatus.PA_NOT_REQUIRED)).toBe(true);
      expect(isValidStatusTransition(TransactionStatus.PA_NOT_REQUIRED, TransactionStatus.WAREHOUSE_IN_PROGRESS)).toBe(true);

      // 3. GSP Warehouse: Start Unloading
      const solarPostWbIn = {
        ...solarTx,
        status: TransactionStatus.PA_NOT_REQUIRED,
        grossWeight: 25000,
        revision: 2,
      };
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(solarPostWbIn);

      const mockTxClientWhStart = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            ...solarPostWbIn,
            status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
            warehouseStartAt: new Date(),
            revision: 3,
          }),
        },
        warehouseProcess: {
          aggregate: jest.fn().mockResolvedValue({ _max: { revision: 0 } }),
          create: jest.fn().mockResolvedValue({ id: 'wp-solar-1' }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };
      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) => cb(mockTxClientWhStart));

      const whStartRes = await warehouseService.startWarehouse(solarTx.id, {}, warehouseUser);
      expect(whStartRes.success).toBe(true);
      expect(mockTxClientWhStart.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
          }),
        }),
      );

      // 4. GSP Warehouse: Complete Unloading -> direct to WAREHOUSE_DONE (NO INCOMING_CHECK_PENDING)
      const solarUnloading = {
        ...solarPostWbIn,
        status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
        warehouseStartAt: new Date(),
        revision: 3,
      };
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(solarUnloading);

      const mockTxClientWhComplete = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            ...solarUnloading,
            status: TransactionStatus.WAREHOUSE_DONE,
            warehouseEndAt: new Date(),
            actualWeight: 25000,
            revision: 4,
          }),
        },
        warehouseProcess: {
          findFirst: jest.fn().mockResolvedValue({ id: 'wp-solar-1', revision: 1 }),
          update: jest.fn().mockResolvedValue({ id: 'wp-solar-1', revision: 2 }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };
      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) => cb(mockTxClientWhComplete));

      const whCompleteRes = await warehouseService.completeWarehouse(
        solarTx.id,
        {
          actualWeight: 25000,
          actualQuantity: 1,
          unit: WarehouseUnit.TRIP,
          condition: WarehouseCondition.GOOD,
        },
        warehouseUser,
      );
      expect(whCompleteRes.success).toBe(true);

      // CRITICAL: verify GSP routes strictly to WAREHOUSE_DONE
      expect(mockTxClientWhComplete.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.WAREHOUSE_DONE,
            actualWeight: 25000,
          }),
        }),
      );

      // 5. Weighbridge OUT: Tare 10,000 kg -> WEIGH_OUT_DONE
      expect(isValidStatusTransition(TransactionStatus.WAREHOUSE_DONE, TransactionStatus.WEIGH_OUT_DONE)).toBe(true);
      expect(isValidStatusTransition(TransactionStatus.WEIGH_OUT_DONE, TransactionStatus.COMPLETED)).toBe(true);
    });
  });

  // =========================================================================
  // Skenario 2: PAC 280 AC — Happy Path Lolos QC/PA
  // Gate → WB In → QC_VEHICLE_PENDING → (Blocked GSP) → QC/PA Release → WAREHOUSE_IN_PROGRESS → WAREHOUSE_DONE
  // =========================================================================
  describe('Skenario 2: PAC 280 AC — Happy Path Lolos QC/PA', () => {
    it('enforces mandatory pre-unloading PA analysis gate before permitting warehouse start', async () => {
      const pacTx: any = {
        id: 'tx-pac-uat',
        transactionNumber: 'GMS-20260930-0002',
        licensePlate: 'B9302PAC',
        processType: ProcessType.GSP,
        cargoType: 'Chemicals',
        cargoSubType: 'PAC 280 AC',
        status: TransactionStatus.REGISTERED,
        grossWeight: null,
        revision: 1,
      };

      // 1. Weighbridge IN: Gross 22,000 kg -> Must assign QC_VEHICLE_PENDING
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(pacTx);
      mockPrismaService.weighbridgeRecord.findFirst.mockResolvedValueOnce(null);

      const mockTxClientWbIn = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            ...pacTx,
            status: TransactionStatus.QC_VEHICLE_PENDING,
            grossWeight: 22000,
            revision: 2,
          }),
        },
        weighbridgeRecord: {
          findFirst: jest.fn().mockResolvedValue(null),
          aggregate: jest.fn().mockResolvedValue({ _max: { revision: 0 } }),
          create: jest.fn().mockResolvedValue({ id: 'wb-rec-pac-in' }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };
      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) => cb(mockTxClientWbIn));

      const wbInRes = await weighbridgeService.submitWeighIn(pacTx.id, { weight: 22000 }, weighbridgeUser);
      expect(wbInRes.success).toBe(true);
      expect(mockTxClientWbIn.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_PENDING,
          }),
        }),
      );

      // 2. GSP Warehouse: Attempt to start while QC_VEHICLE_PENDING -> MUST FAIL
      const pacPending = {
        ...pacTx,
        status: TransactionStatus.QC_VEHICLE_PENDING,
        grossWeight: 22000,
        revision: 2,
      };
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(pacPending);

      await expect(warehouseService.startWarehouse(pacTx.id, {}, warehouseUser)).rejects.toThrow(BadRequestException);

      // 3. QC Lab: Submit PA Analysis with Decision: RELEASE
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(pacPending);

      const mockTxClientQc = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        qcProductAnalysis: {
          create: jest.fn().mockResolvedValue({ id: 'analysis-pac-1', testRound: 1 }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };
      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) => cb(mockTxClientQc));

      const qcRes = await qcAnalysisService.submitProductAnalysis(
        pacTx.id,
        {
          productCategory: 'Chemicals',
          productName: 'PAC 280 AC',
          parameters: {
            visualAppearance: 'Cairan Kuning Jernih',
            foreignMatters: 'NIL',
            packagingCondition: 'Drum Segel Baik',
            ph: 4.25,
            density: 1.22,
            al2o3Content: 10.5,
          },
          result: QcResult.PASSED,
          decision: AnalysisDecision.RELEASE,
          revision: 2,
        },
        qcAnalystUser,
      );
      expect(qcRes.success).toBe(true);

      // Status transitioned to QC_VEHICLE_PASSED
      expect(mockTxClientQc.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_PASSED,
          }),
        }),
      );

      // 4. GSP Warehouse: Start Unloading NOW SUCCEEDS
      const pacPassed = {
        ...pacPending,
        status: TransactionStatus.QC_VEHICLE_PASSED,
        revision: 3,
      };
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(pacPassed);

      const mockTxClientWhStart = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            ...pacPassed,
            status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
            warehouseStartAt: new Date(),
            revision: 4,
          }),
        },
        warehouseProcess: {
          aggregate: jest.fn().mockResolvedValue({ _max: { revision: 0 } }),
          create: jest.fn().mockResolvedValue({ id: 'wp-pac-1' }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };
      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) => cb(mockTxClientWhStart));

      const whStartRes = await warehouseService.startWarehouse(pacTx.id, {}, warehouseUser);
      expect(whStartRes.success).toBe(true);
      expect(mockTxClientWhStart.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
          }),
        }),
      );
    });
  });

  // =========================================================================
  // Skenario 3: Rapid Klen — Penolakan QC/PA
  // Gate → WB In → QC_VEHICLE_PENDING → QC/PA Reject → QC_VEHICLE_REJECTED → GSP Blocked Permanently
  // =========================================================================
  describe('Skenario 3: Rapid Klen — Penolakan QC/PA', () => {
    it('permanently blocks warehouse unloading when rejected by QC/PA', async () => {
      const rpdTx: any = {
        id: 'tx-rpd-uat',
        transactionNumber: 'GMS-20260930-0003',
        licensePlate: 'B9303RPD',
        processType: ProcessType.GSP,
        cargoType: 'Chemicals',
        cargoSubType: 'RAPID KLEEN',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        grossWeight: 20000,
        revision: 2,
      };

      // 1. QC Lab: Submit PA with out-of-spec Alkalinity -> Decision: REJECT
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(rpdTx);

      const mockTxClientQc = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        qcProductAnalysis: {
          create: jest.fn().mockResolvedValue({ id: 'analysis-rpd-1', testRound: 1 }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };
      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) => cb(mockTxClientQc));

      const qcRes = await qcAnalysisService.submitProductAnalysis(
        rpdTx.id,
        {
          productCategory: 'Chemicals',
          productName: 'Rapid Klen',
          parameters: {
            alkalinityNa2o: 28.0, // Out of spec: < 35%
            ph: 11.2,
          },
          result: QcResult.REJECTED,
          decision: AnalysisDecision.REJECT,
          notes: 'Alkalinitas Na2O di bawah batas minimal SOP (28% < 35%)',
          revision: 2,
        },
        qcAnalystUser,
      );
      expect(qcRes.success).toBe(true);

      // Verify status transitioned to QC_VEHICLE_REJECTED
      expect(mockTxClientQc.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_REJECTED,
          }),
        }),
      );

      // 2. GSP Warehouse: Attempt to start unloading -> MUST BE STRICTLY BLOCKED
      const rpdRejected = {
        ...rpdTx,
        status: TransactionStatus.QC_VEHICLE_REJECTED,
        revision: 3,
      };
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(rpdRejected);

      await expect(warehouseService.startWarehouse(rpdTx.id, {}, warehouseUser)).rejects.toThrow(BadRequestException);

      // 3. State Machine confirms rejected truck can only route to WEIGH_OUT_DONE -> COMPLETED
      expect(isValidStatusTransition(TransactionStatus.QC_VEHICLE_REJECTED, TransactionStatus.WAREHOUSE_IN_PROGRESS)).toBe(false);
      expect(isValidStatusTransition(TransactionStatus.QC_VEHICLE_REJECTED, TransactionStatus.WEIGH_OUT_DONE)).toBe(true);
    });
  });

  // =========================================================================
  // Skenario 4: Batubara — Deviasi Kadar Air → Uji Ulang → Disposisi Utility (Four-Eyes)
  // QC_VEHICLE_PENDING → (Round 1 Fail) → QC_RETEST_REQUIRED → (Round 2 Fail) →
  // WAITING_UTILITY_DISPOSITION → Four-Eyes Approval → QC_VEHICLE_PASSED → GSP Bongkar
  // =========================================================================
  describe('Skenario 4: Batubara — Deviasi Kadar Air → Uji Ulang → Disposisi Utility', () => {
    it('executes multi-round retest and strictly enforces Four-Eyes disposition control', async () => {
      const coalTx: any = {
        id: 'tx-coal-uat',
        transactionNumber: 'GMS-20260930-0004',
        licensePlate: 'B9304COAL',
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        grossWeight: 30000,
        revision: 2,
      };

      // 1. Round 1 Test: Moisture 36% (> 33%) -> Decision: RETEST_REQUIRED
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalTx);

      const mockTxClientRound1 = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        qcProductAnalysis: {
          create: jest.fn().mockResolvedValue({ id: 'analysis-coal-1', testRound: 1 }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };
      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) => cb(mockTxClientRound1));

      const r1Res = await qcAnalysisService.submitProductAnalysis(
        coalTx.id,
        {
          productCategory: 'Coal',
          productName: 'Batubara',
          parameters: { sensory: 'OK', moisture: 36.0 },
          result: QcResult.REJECTED,
          decision: AnalysisDecision.RETEST_REQUIRED,
          notes: 'Total moisture melewati batas normal (36.0% > 33.0%). Wajib uji ulang.',
          revision: 2,
        },
        qcAnalystUser,
      );
      expect(r1Res.success).toBe(true);
      expect(mockTxClientRound1.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_RETEST_REQUIRED,
          }),
        }),
      );

      // Verify unloading is blocked during QC_RETEST_REQUIRED
      const coalRetest = { ...coalTx, status: TransactionStatus.QC_RETEST_REQUIRED, revision: 3 };
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalRetest);
      await expect(warehouseService.startWarehouse(coalTx.id, {}, warehouseUser)).rejects.toThrow(BadRequestException);

      // 2. Round 2 Test: Moisture 35.5% (still > 33%) -> Decision: PENDING_DISPOSITION
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalRetest);

      const mockTxClientRound2 = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        qcProductAnalysis: {
          create: jest.fn().mockResolvedValue({ id: 'analysis-coal-2', testRound: 2 }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };
      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) => cb(mockTxClientRound2));

      const r2Res = await qcAnalysisService.submitProductAnalysis(
        coalTx.id,
        {
          productCategory: 'Coal',
          productName: 'Batubara',
          testRound: 2,
          parameters: { sensory: 'OK', moisture: 35.5 },
          result: QcResult.REJECTED,
          decision: AnalysisDecision.PENDING_DISPOSITION,
          notes: 'Hasil uji ulang tetap melewati batas (35.5%). Menunggu disposisi Utility.',
          revision: 3,
        },
        qcAnalystUser,
      );
      expect(r2Res.success).toBe(true);
      expect(mockTxClientRound2.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.WAITING_UTILITY_DISPOSITION,
          }),
        }),
      );

      // Verify unloading is blocked during WAITING_UTILITY_DISPOSITION
      const coalWaiting = { ...coalTx, status: TransactionStatus.WAITING_UTILITY_DISPOSITION, revision: 4 };
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalWaiting);
      await expect(warehouseService.startWarehouse(coalTx.id, {}, warehouseUser)).rejects.toThrow(BadRequestException);

      // 3. Four-Eyes Enforcement across ALL rounds:
      // Case 3a: Round 2 analyst attempts self-approval -> MUST BE FORBIDDEN
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalWaiting);
      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce({
        id: 'analysis-coal-2',
        transactionId: coalTx.id,
        testRound: 2,
        testedById: qcAnalystUser.id,
      });
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: qcAnalystUser.id,
        role: 'ADMIN',
        department: 'UTILITY',
      });
      mockPrismaService.qcProductAnalysis.findMany.mockResolvedValueOnce([
        { id: 'analysis-coal-1', testRound: 1, testedById: 'round1-analyst-id' },
        { id: 'analysis-coal-2', testRound: 2, testedById: qcAnalystUser.id },
      ]);

      await expect(
        qcAnalysisService.submitUtilityDisposition(
          coalTx.id,
          {
            dispositionAction: DispositionAction.ACCEPT_WITH_DEVIATION,
            dispositionReason: 'Self-approval attempt by Round 2 analyst',
            revision: 4,
          },
          qcAnalystUser, // Round 2 analyst!
        ),
      ).rejects.toThrow(ForbiddenException);

      // Case 3b: Round 1 analyst attempts approval of Round 2 disposition -> MUST BE FORBIDDEN
      const round1Analyst = { id: 'round1-analyst-id', role: 'ADMIN', department: 'UTILITY' } as any;
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalWaiting);
      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce({
        id: 'analysis-coal-2',
        transactionId: coalTx.id,
        testRound: 2,
        testedById: qcAnalystUser.id,
      });
      mockPrismaService.user.findUnique.mockResolvedValueOnce(round1Analyst);
      mockPrismaService.qcProductAnalysis.findMany.mockResolvedValueOnce([
        { id: 'analysis-coal-1', testRound: 1, testedById: 'round1-analyst-id' },
        { id: 'analysis-coal-2', testRound: 2, testedById: qcAnalystUser.id },
      ]);

      await expect(
        qcAnalysisService.submitUtilityDisposition(
          coalTx.id,
          {
            dispositionAction: DispositionAction.ACCEPT_WITH_DEVIATION,
            dispositionReason: 'Self-approval attempt by Round 1 analyst',
            revision: 4,
          },
          round1Analyst, // Round 1 analyst!
        ),
      ).rejects.toThrow(ForbiddenException);

      // Case 3c: Account without Utility authority (e.g. Security) -> MUST BE FORBIDDEN
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalWaiting);
      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce({
        id: 'analysis-coal-2',
        transactionId: coalTx.id,
        testRound: 2,
        testedById: qcAnalystUser.id,
      });
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: 'sec-user',
        role: 'SECURITY',
        department: 'SECURITY',
      });
      await expect(
        qcAnalysisService.submitUtilityDisposition(
          coalTx.id,
          {
            dispositionAction: DispositionAction.ACCEPT_WITH_DEVIATION,
            dispositionReason: 'Unauthorized role attempt',
            revision: 4,
          },
          { id: 'sec-user', role: 'SECURITY' } as any,
        ),
      ).rejects.toThrow(ForbiddenException);

      // 4. Authorized Utility Officer (Independent of all rounds) approves disposition -> SUCCEEDS
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalWaiting);
      mockPrismaService.qcProductAnalysis.findFirst.mockResolvedValueOnce({
        id: 'analysis-coal-2',
        transactionId: coalTx.id,
        testRound: 2,
        testedById: qcAnalystUser.id, // Tested by analyst
      });
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: utilityOfficerUser.id,
        role: 'ADMIN',
        department: 'UTILITY',
      });
      mockPrismaService.qcProductAnalysis.findMany.mockResolvedValueOnce([
        { id: 'analysis-coal-1', testRound: 1, testedById: 'round1-analyst-id' },
        { id: 'analysis-coal-2', testRound: 2, testedById: qcAnalystUser.id },
      ]);

      const mockTxClientDisp = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        qcProductAnalysis: {
          update: jest.fn().mockResolvedValue({ id: 'analysis-coal-2' }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };
      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) => cb(mockTxClientDisp));

      const dispRes = await qcAnalysisService.submitUtilityDisposition(
        coalTx.id,
        {
          dispositionAction: DispositionAction.ACCEPT_WITH_DEVIATION,
          dispositionReason: 'Disetujui bersyarat oleh Kepala Bagian Utility untuk pencampuran boiler silo #2',
          revision: 4,
        },
        utilityOfficerUser, // Different user!
      );
      expect(dispRes.success).toBe(true);

      // Transaction is now QC_VEHICLE_PASSED
      expect(mockTxClientDisp.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_PASSED,
          }),
        }),
      );

      // 5. GSP Warehouse: Start Unloading NOW PERMITTED
      const coalPassed = { ...coalWaiting, status: TransactionStatus.QC_VEHICLE_PASSED, revision: 5 };
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(coalPassed);

      const mockTxClientWhStart = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            ...coalPassed,
            status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
            warehouseStartAt: new Date(),
            revision: 6,
          }),
        },
        warehouseProcess: {
          aggregate: jest.fn().mockResolvedValue({ _max: { revision: 0 } }),
          create: jest.fn().mockResolvedValue({ id: 'wp-coal-1' }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };
      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) => cb(mockTxClientWhStart));

      const whStartRes = await warehouseService.startWarehouse(coalTx.id, {}, warehouseUser);
      expect(whStartRes.success).toBe(true);
    });
  });

  // =========================================================================
  // Skenario 5: Anti-Tamper Product Correction
  // PA_NOT_REQUIRED → Amend to Batubara → Auto-downgrades to QC_VEHICLE_PENDING
  // Once warehouseStartAt is set → Blocks product amendment & mandates operational incident
  // =========================================================================
  describe('Skenario 5: Anti-Tamper Product Correction', () => {
    it('auto-downgrades status to QC_VEHICLE_PENDING when switching from Solar to Batubara pre-unloading', async () => {
      const solarActiveTx: any = {
        id: 'tx-tamper-test',
        transactionNumber: 'GMS-20260930-0005',
        licensePlate: 'B9305TAMPER',
        processType: ProcessType.GSP,
        cargoType: 'Fuel',
        cargoSubType: 'Solar',
        status: TransactionStatus.PA_NOT_REQUIRED,
        warehouseStartAt: null,
        revision: 2,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(solarActiveTx);

      const mockTxClientAmend = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        qcProductAnalysis: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        transactionCorrection: {
          create: jest.fn().mockResolvedValue({ id: 'corr-amend-1' }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };
      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) => cb(mockTxClientAmend));

      const amendRes = await amendmentService.amendActiveProduct(
        solarActiveTx.id,
        {
          cargoType: 'Coal',
          cargoSubType: 'Batubara',
          reason: 'Koreksi manifest: muatan fisik adalah batubara bukan solar',
          revision: 2,
        },
        adminUser,
      );

      expect(amendRes.success).toBe(true);
      expect(amendRes.data?.statusDowngraded).toBe(true);
      // Status MUST be downgraded to QC_VEHICLE_PENDING
      expect(mockTxClientAmend.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cargoType: 'Coal',
            cargoSubType: 'Batubara',
            status: TransactionStatus.QC_VEHICLE_PENDING,
          }),
        }),
      );
    });

    it('strictly forbids normal product amendment once unloading has started and requires operational incident', async () => {
      const unloadedTx: any = {
        id: 'tx-unloaded',
        transactionNumber: 'GMS-20260930-0006',
        status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
        processType: ProcessType.GSP,
        cargoType: 'Fuel',
        cargoSubType: 'Solar',
        warehouseStartAt: new Date(Date.now() - 3600000), // Unloading started 1 hr ago
        revision: 3,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(unloadedTx);

      // Attempt standard product amendment -> MUST BE BLOCKED
      await expect(
        amendmentService.amendActiveProduct(
          unloadedTx.id,
          {
            cargoType: 'Coal',
            cargoSubType: 'Batubara',
            reason: 'Salah pilih produk',
            revision: 3,
          },
          adminUser,
        ),
      ).rejects.toThrow(BadRequestException);

      // Must be handled via recordOperationalIncident with mandatory attachment and supervisor PIC
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(unloadedTx);
      mockPrismaService.attachment.findUnique.mockResolvedValueOnce({ id: 'att-evidence-1' });

      const mockTxClientIncident = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        transactionCorrection: {
          create: jest.fn().mockResolvedValue({ id: 'corr-incident-1' }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };
      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) => cb(mockTxClientIncident));

      const incidentRes = await amendmentService.recordOperationalIncident(
        unloadedTx.id,
        {
          incidentReason: 'Muatan solar sudah tertuang ke tangki penampungan sebelum ketidaksesuaian DO terdeteksi',
          supervisorPic: 'Bpk. Hendro - SPV Utility',
          evidenceAttachmentId: 'att-evidence-1',
          actionTaken: 'Isolasi kompartemen tangki #3 dan pengambilan sampel uji darurat',
          revision: 3,
        },
        adminUser,
      );

      expect(incidentRes.success).toBe(true);
      expect(mockTxClientIncident.transactionCorrection.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: CorrectionAction.OPERATIONAL_INCIDENT,
            transactionId: unloadedTx.id,
            reason: expect.stringContaining('Muatan solar sudah tertuang'),
          }),
        }),
      );
    });
  });

  // =========================================================================
  // Skenario 7: Chemical Rejection -> Jalur Keluar Tanpa Bongkar
  // WB In (Gross) -> QC_VEHICLE_REJECTED -> Block Bongkar -> WB Out (Tare=Gross, Net=0)
  // =========================================================================
  describe('Skenario 7: Penolakan Mutu Kimia (REJECT) — Jalur Keluar Tanpa Bongkar', () => {
    it('blocks warehouse unloading on REJECT decision and routes truck directly to exit with zero net weight', async () => {
      const chemRejectTx: any = {
        id: 'tx-chem-reject',
        transactionNumber: 'GMS-20260930-0007',
        licensePlate: 'L9907REJ',
        processType: ProcessType.GSP,
        cargoType: 'Chemicals',
        cargoSubType: 'Rapid Klen',
        status: TransactionStatus.QC_VEHICLE_PENDING,
        grossWeight: 22000,
        tareWeight: null,
        netWeight: null,
        revision: 2,
      };

      // 1. Submit out-of-spec chemical analysis -> REJECT
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(chemRejectTx);

      const mockTxClientReject = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        qcProductAnalysis: {
          create: jest.fn().mockResolvedValue({ id: 'analysis-chem-rej-1' }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };
      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) => cb(mockTxClientReject));

      const rejectRes = await qcAnalysisService.submitProductAnalysis(
        chemRejectTx.id,
        {
          productCategory: 'Chemicals',
          productName: 'Rapid Klen',
          parameters: {
            sensory: { visual: false, packaging: true },
            alkalinityNa2O: 31.5, // Below 35.0% min
            ph: 11.2, // Below 12.0 min
            density: 1.35, // Below 1.400 min
          },
          result: QcResult.REJECTED,
          decision: AnalysisDecision.REJECT,
          notes: 'Mutu tidak memenuhi standar operasional. Ditolak bongkar.',
          revision: 2,
        },
        qcAnalystUser,
      );

      expect(rejectRes.success).toBe(true);
      expect(mockTxClientReject.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_REJECTED,
          }),
        }),
      );

      // 2. Warehouse operator attempts to start unloading -> BLOCKED
      const rejectedState = { ...chemRejectTx, status: TransactionStatus.QC_VEHICLE_REJECTED, revision: 3 };
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(rejectedState);

      await expect(
        warehouseService.startWarehouse(chemRejectTx.id, {}, warehouseUser),
      ).rejects.toThrow(BadRequestException);

      // 3. Truck routes directly to Weighbridge Out (Tare Weight = Gross Weight, Net = 0)
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(rejectedState);
      mockPrismaService.weighbridgeRecord.findFirst
        .mockResolvedValueOnce(null) // 1. Duplicate OUT check -> null
        .mockResolvedValueOnce({     // 2. Lookup IN record for gross -> 22000
          id: 'wb-in-rej-rec',
          type: WeighbridgeType.IN,
          weight: 22000,
          revision: 1,
        });

      const mockTxClientWbOut = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            ...chemRejectTx,
            status: TransactionStatus.WEIGH_OUT_DONE,
            tareWeight: 22000,
            netWeight: 0,
            weighOutBy: { id: weighbridgeUser.id, name: 'Weighbridge Operator', role: 'SECURITY' },
          }),
        },
        weighbridgeRecord: {
          findFirst: jest.fn().mockResolvedValue(null),
          aggregate: jest.fn().mockResolvedValue({ _max: { revision: 0 } }),
          create: jest.fn().mockResolvedValue({
            id: 'wb-out-rej-rec',
            type: WeighbridgeType.OUT,
            weight: 22000,
            revision: 1,
          }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };
      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) => cb(mockTxClientWbOut));

      const wbOutRes = await weighbridgeService.submitWeighOut(
        chemRejectTx.id,
        {
          weight: 22000, // No cargo unloaded: Tare equals Gross
          weighbridgeNumber: 'WB-02',
          revision: 3,
        },
        weighbridgeUser,
      );

      expect(wbOutRes.success).toBe(true);
      expect(mockTxClientWbOut.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.WEIGH_OUT_DONE,
            tareWeight: 22000,
            netWeight: 0, // Zero cargo delivered
          }),
        }),
      );
    });
  });

  // =========================================================================
  // Skenario 8: Perubahan Produk Sebelum/Sesudah PA Lulus & Pembatalan PA Lama
  // =========================================================================
  describe('Skenario 8: Pembatalan Keberlakuan Hasil PA Lama pada Perubahan Produk', () => {
    it('invalidates passed PA analysis and forces new QC evaluation when product changes before unloading', async () => {
      const batubaraPassedTx: any = {
        id: 'tx-batubara-passed',
        transactionNumber: 'GMS-20260930-0008',
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        status: TransactionStatus.QC_VEHICLE_PASSED,
        warehouseStartAt: null,
        revision: 3,
      };

      const pacCatalog = {
        id: 'cat-pac-8',
        code: 'CHEM-PAC-08',
        name: 'PAC 280 AC',
        category: 'Chemicals',
        subCategory: 'PAC 280 AC',
        processType: ProcessType.GSP,
        isPaRequired: true,
        isActive: true,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(batubaraPassedTx);
      mockPrismaService.productCatalog.findUnique.mockResolvedValueOnce(pacCatalog);

      const mockTxClientAmend = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        qcProductAnalysis: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }), // Old PA analysis voided
        },
        transactionCorrection: {
          create: jest.fn().mockResolvedValue({ id: 'corr-amend-8' }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };
      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) => cb(mockTxClientAmend));

      const res = await amendmentService.amendActiveProduct(
        batubaraPassedTx.id,
        {
          cargoType: 'Chemicals',
          cargoSubType: 'PAC 280 AC',
          productCatalogId: pacCatalog.id,
          reason: 'Perubahan pesanan operasional: dialihkan dari Batubara ke PAC',
          revision: 3,
        },
        adminUser,
      );

      expect(res.success).toBe(true);
      expect(res.data?.newStatus).toBe(TransactionStatus.QC_VEHICLE_PENDING);

      // Verify old PA was marked VOIDED
      expect(mockTxClientAmend.qcProductAnalysis.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { transactionId: batubaraPassedTx.id, isVoided: false },
          data: expect.objectContaining({
            isVoided: true,
            status: 'VOIDED',
          }),
        }),
      );

      // Verify status reset to QC_VEHICLE_PENDING
      expect(mockTxClientAmend.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TransactionStatus.QC_VEHICLE_PENDING,
            cargoSubType: 'PAC 280 AC',
          }),
        }),
      );
    });
  });
});
