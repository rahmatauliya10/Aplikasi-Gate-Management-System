import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ActiveTransactionAmendmentService } from './active-transaction-amendment.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import {
  TransactionStatus,
  ProcessType,
  CorrectionAction,
} from '@prisma/client';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';

describe('ActiveTransactionAmendmentService (Task 4)', () => {
  let service: ActiveTransactionAmendmentService;
  let mockPrismaService: any;
  let mockActivityLogsService: any;

  const mockAdminUser: JwtPayloadUser = {
    id: 'admin-1',
    role: 'ADMIN',
    email: 'admin@gms.local',
  } as unknown as JwtPayloadUser;

  const mockNonAdminUser: JwtPayloadUser = {
    id: 'user-wh',
    role: 'WAREHOUSE',
    email: 'wh@gms.local',
  } as unknown as JwtPayloadUser;

  beforeEach(async () => {
    mockPrismaService = {
      $transaction: jest.fn(),
      transaction: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      attachment: {
        findUnique: jest.fn(),
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

    service = module.get<ActiveTransactionAmendmentService>(
      ActiveTransactionAmendmentService,
    );
  });

  describe('amendActiveProduct', () => {
    it('auto-downgrades PA_NOT_REQUIRED to QC_VEHICLE_PENDING if product changed to Batubara before unloading', async () => {
      const solarTx = {
        id: 'tx-solar-active',
        status: TransactionStatus.PA_NOT_REQUIRED,
        processType: ProcessType.GSP,
        cargoType: 'Fuel',
        cargoSubType: 'Solar',
        warehouseStartAt: null,
        revision: 2,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(solarTx);
      mockPrismaService.productCatalog.findFirst.mockResolvedValueOnce({
        id: 'cat-coal-1',
        code: 'COAL-001',
        name: 'Batubara',
        subCategory: 'Batubara',
        category: 'Coal',
        processType: ProcessType.GSP,
        isActive: true,
        isPaRequired: true,
      });

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        transactionCorrection: {
          create: jest.fn().mockResolvedValue({ id: 'corr-1' }),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
        qcProductAnalysis: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await service.amendActiveProduct(
        'tx-solar-active',
        {
          cargoType: 'Coal',
          cargoSubType: 'Batubara',
          reason: 'Koreksi kesalahan input jenis muatan dari surat jalan',
          revision: 2,
        },
        mockAdminUser,
      );

      expect(res.success).toBe(true);
      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tx-solar-active', revision: 2 },
          data: expect.objectContaining({
            cargoType: 'Coal',
            cargoSubType: 'Batubara',
            status: TransactionStatus.QC_VEHICLE_PENDING,
          }),
        }),
      );
      expect(mockTxClient.transactionCorrection.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: CorrectionAction.AMEND_ACTIVE,
            transactionId: 'tx-solar-active',
          }),
        }),
      );
    });

    it('hard-blocks standard product amendment once warehouse unloading has started', async () => {
      const unloadingTx = {
        id: 'tx-unloading',
        status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
        processType: ProcessType.GSP,
        cargoType: 'Fuel',
        cargoSubType: 'Solar',
        warehouseStartAt: new Date(),
        revision: 3,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        unloadingTx,
      );

      await expect(
        service.amendActiveProduct(
          'tx-unloading',
          {
            cargoType: 'Coal',
            cargoSubType: 'Batubara',
            reason: 'Salah pilih produk di awal',
            revision: 3,
          },
          mockAdminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects amendment for non-ADMIN users', async () => {
      await expect(
        service.amendActiveProduct(
          'tx-any',
          {
            cargoType: 'Coal',
            cargoSubType: 'Batubara',
            reason: 'Percobaan ubah produk',
            revision: 1,
          },
          mockNonAdminUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects amendment for COMPLETED or CANCELLED transactions', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
        id: 'tx-completed',
        status: TransactionStatus.COMPLETED,
        revision: 5,
      });

      await expect(
        service.amendActiveProduct(
          'tx-completed',
          {
            cargoType: 'Coal',
            cargoSubType: 'Batubara',
            reason: 'Koreksi transaksi selesai',
            revision: 5,
          },
          mockAdminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('recordOperationalIncident', () => {
    it('permits recording operational incident with verified evidence for post-unloading corrections', async () => {
      const inProgressTx = {
        id: 'tx-incident-target',
        status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
        processType: ProcessType.GSP,
        cargoType: 'Fuel',
        cargoSubType: 'Solar',
        warehouseStartAt: new Date(),
        revision: 4,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        inProgressTx,
      );
      mockPrismaService.attachment.findUnique.mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        transactionId: 'tx-incident-target',
        fileName: 'berita-acara-solar.pdf',
      });

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        transactionCorrection: {
          create: jest.fn().mockResolvedValue({ id: 'corr-incident-1' }),
        },
      };

      mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await service.recordOperationalIncident(
        'tx-incident-target',
        {
          incidentReason:
            'Muatan solar terindikasi bercampur air saat bongkar berjalan',
          evidenceAttachmentId: '11111111-1111-4111-8111-111111111111',
          supervisorPic: 'Pak Bambang (Supervisor)',
          actionTaken: 'Pompa dihentikan dan sampel dikirim ke laboratorium',
          revision: 4,
        },
        mockAdminUser,
      );

      expect(res.success).toBe(true);
      expect(mockTxClient.transactionCorrection.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: CorrectionAction.OPERATIONAL_INCIDENT,
            transactionId: 'tx-incident-target',
          }),
        }),
      );
    });

    it('rejects incident recording if evidence attachment is not found', async () => {
      const inProgressTx = {
        id: 'tx-incident-target',
        status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
        revision: 4,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValueOnce(
        inProgressTx,
      );
      mockPrismaService.attachment.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.recordOperationalIncident(
          'tx-incident-target',
          {
            incidentReason: 'Insiden operasional tanpa bukti',
            evidenceAttachmentId: '22222222-2222-4222-8222-222222222222',
            supervisorPic: 'Supervisor',
            revision: 4,
          },
          mockAdminUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
