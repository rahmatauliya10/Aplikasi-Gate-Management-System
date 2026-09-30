import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { ActiveTransactionAmendmentService } from './active-transaction-amendment.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { TransactionStatus, ProcessType, CorrectionAction } from '@prisma/client';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';

describe('ActiveTransactionAmendmentService (Product Amendment & Anti-Tamper)', () => {
  let service: ActiveTransactionAmendmentService;
  let mockPrismaService: any;
  let mockActivityLogsService: any;

  const mockAdminUser: JwtPayloadUser = {
    id: 'user-admin-1',
    role: 'ADMIN',
    email: 'admin@gms.local',
  } as unknown as JwtPayloadUser;

  const mockOperatorUser: JwtPayloadUser = {
    id: 'user-op-1',
    role: 'WAREHOUSE',
    email: 'operator@gms.local',
  } as unknown as JwtPayloadUser;

  const solarCatalog = {
    id: 'cat-solar-1',
    code: 'FUEL-SOLAR-01',
    name: 'Solar B35',
    category: 'Fuel',
    subCategory: 'Solar',
    processType: ProcessType.GSP,
    isPaRequired: false,
    exemptionReason: 'SOP Exemption Rule v1.0: Komoditas Solar BBM tidak memerlukan uji laboratorium pra-bongkar.',
    policyVersion: 'SOP-GSP-2026.1',
    isActive: true,
  };

  const coalCatalog = {
    id: 'cat-coal-1',
    code: 'COAL-GAR4200-01',
    name: 'Batubara GAR 4200',
    category: 'Coal',
    subCategory: 'Batubara',
    processType: ProcessType.GSP,
    isPaRequired: true,
    isActive: true,
  };

  beforeEach(async () => {
    mockPrismaService = {
      $transaction: jest.fn(),
      transaction: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      productCatalog: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      qcProductAnalysis: {
        updateMany: jest.fn(),
      },
      transactionCorrection: {
        create: jest.fn(),
      },
      transactionStatusHistory: {
        create: jest.fn(),
      },
    };

    mockActivityLogsService = {
      logAction: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActiveTransactionAmendmentService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ActivityLogsService, useValue: mockActivityLogsService },
      ],
    }).compile();

    service = module.get<ActiveTransactionAmendmentService>(ActiveTransactionAmendmentService);
  });

  describe('amendActiveProduct', () => {
    it('rejects if called by non-admin role (ForbiddenException)', async () => {
      await expect(
        service.amendActiveProduct(
          'tx-1',
          { cargoType: 'Coal', cargoSubType: 'Batubara', reason: 'Attempt by operator', revision: 1 },
          mockOperatorUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects product change if unloading has already started (BadRequestException)', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
        id: 'tx-unloading',
        status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
        warehouseStartAt: new Date(),
        cargoType: 'Fuel',
        cargoSubType: 'Solar',
        revision: 2,
      });

      await expect(
        service.amendActiveProduct(
          'tx-unloading',
          { cargoType: 'Coal', cargoSubType: 'Batubara', reason: 'Change after start', revision: 2 },
          mockAdminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully amends Solar -> Batubara before unloading: downgrades status to QC_VEHICLE_PENDING and clears exemption snapshot', async () => {
      const initialTx = {
        id: 'tx-solar-to-coal',
        status: TransactionStatus.PA_NOT_REQUIRED,
        warehouseStartAt: null,
        processType: ProcessType.GSP,
        cargoType: 'Fuel',
        cargoSubType: 'Solar',
        productCatalogId: solarCatalog.id,
        paExemptionReason: solarCatalog.exemptionReason,
        paPolicyVersion: solarCatalog.policyVersion,
        revision: 2,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(initialTx);
      mockPrismaService.productCatalog.findUnique.mockResolvedValueOnce(coalCatalog);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        qcProductAnalysis: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        transactionCorrection: {
          create: jest.fn().mockResolvedValue({}),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) => cb(mockTxClient));

      const res = await service.amendActiveProduct(
        'tx-solar-to-coal',
        {
          cargoType: 'Coal',
          cargoSubType: 'Batubara',
          productCatalogId: coalCatalog.id,
          reason: 'Koreksi salah input PO: muatan fisik adalah batubara',
          revision: 2,
        },
        mockAdminUser,
      );

      expect(res.success).toBe(true);
      expect(res.data.newStatus).toBe(TransactionStatus.QC_VEHICLE_PENDING);
      expect(res.data.statusDowngraded).toBe(true);

      // Verify transaction updated with new status and cleared exemption metadata
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tx-solar-to-coal', revision: 2 },
          data: expect.objectContaining({
            cargoType: 'Coal',
            cargoSubType: 'Batubara',
            productCatalogId: coalCatalog.id,
            status: TransactionStatus.QC_VEHICLE_PENDING,
            paExemptionReason: null,
            paPolicyVersion: null,
            revision: { increment: 1 },
          }),
        }),
      );

      // Verify audit correction created
      expect(mockTxClient.transactionCorrection.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: CorrectionAction.AMEND_ACTIVE,
            reasonCode: 'PRODUCT_AMENDMENT',
            newValues: expect.objectContaining({
              cargoSubType: 'Batubara',
              status: TransactionStatus.QC_VEHICLE_PENDING,
            }),
          }),
        }),
      );
    });

    it('amends product after PA passed: resets status to QC_VEHICLE_PENDING and voids past PA results without deleting records', async () => {
      const initialTx = {
        id: 'tx-pa-passed',
        status: TransactionStatus.QC_VEHICLE_PASSED,
        warehouseStartAt: null,
        processType: ProcessType.GSP,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        productCatalogId: coalCatalog.id,
        revision: 4,
      };

      const pacCatalog = {
        id: 'cat-pac-1',
        code: 'CHEM-PAC-01',
        name: 'PAC 280 AC',
        category: 'Chemicals',
        subCategory: 'PAC 280 AC',
        processType: ProcessType.GSP,
        isPaRequired: true,
        isActive: true,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(initialTx);
      mockPrismaService.productCatalog.findUnique.mockResolvedValueOnce(pacCatalog);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        qcProductAnalysis: {
          updateMany: jest.fn().mockResolvedValue({ count: 2 }), // 2 previous PA rounds
        },
        transactionCorrection: {
          create: jest.fn().mockResolvedValue({}),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) => cb(mockTxClient));

      const res = await service.amendActiveProduct(
        'tx-pa-passed',
        {
          cargoType: 'Chemicals',
          cargoSubType: 'PAC 280 AC',
          productCatalogId: pacCatalog.id,
          reason: 'Perubahan produk sebelum bongkar: truk dialihkan ke PAC',
          revision: 4,
        },
        mockAdminUser,
      );

      expect(res.success).toBe(true);
      expect(res.data.newStatus).toBe(TransactionStatus.QC_VEHICLE_PENDING);

      // Verify previous PA analyses were marked VOIDED
      expect(mockTxClient.qcProductAnalysis.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { transactionId: 'tx-pa-passed', isVoided: false },
          data: expect.objectContaining({
            isVoided: true,
            status: 'VOIDED',
            voidReason: expect.stringContaining('Dibatalkan karena perubahan produk aktif'),
          }),
        }),
      );

      // Verify status history recorded the reset
      expect(mockTxClient.transactionStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            oldStatus: TransactionStatus.QC_VEHICLE_PASSED,
            newStatus: TransactionStatus.QC_VEHICLE_PENDING,
          }),
        }),
      );
    });

    it('throws ConflictException on concurrent revision mismatch', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
        id: 'tx-conflict',
        status: TransactionStatus.PA_NOT_REQUIRED,
        warehouseStartAt: null,
        processType: ProcessType.GSP,
        revision: 2,
      });
      mockPrismaService.productCatalog.findUnique.mockResolvedValueOnce(coalCatalog);

      const mockTxClient = {
        qcProductAnalysis: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }), // Concurrency conflict
        },
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) => cb(mockTxClient));

      await expect(
        service.amendActiveProduct(
          'tx-conflict',
          { cargoType: 'Coal', cargoSubType: 'Batubara', productCatalogId: coalCatalog.id, reason: 'Stale revision', revision: 1 },
          mockAdminUser,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });
});
