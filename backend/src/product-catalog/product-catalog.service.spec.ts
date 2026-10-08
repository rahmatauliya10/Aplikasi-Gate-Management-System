import { Test, TestingModule } from '@nestjs/testing';
import { ProductCatalogService } from './product-catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ProcessType, GspAnalysisProfile, Role, WarehouseUnit } from '@prisma/client';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';

describe('ProductCatalogService', () => {
  let service: ProductCatalogService;
  let prisma: any;
  let activityLogsService: any;

  const mockAdminUser: JwtPayloadUser = {
    id: 'user-admin-1',
    email: 'admin@plant.com',
    name: 'Admin User',
    role: Role.ADMIN,
  };

  beforeEach(async () => {
    prisma = {
      productCatalog: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    activityLogsService = {
      logAction: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductCatalogService,
        { provide: PrismaService, useValue: prisma },
        { provide: ActivityLogsService, useValue: activityLogsService },
      ],
    }).compile();

    service = module.get<ProductCatalogService>(ProductCatalogService);
  });

  describe('create', () => {
    it('1. rejects duplicate product code with ConflictException', async () => {
      prisma.productCatalog.findUnique.mockResolvedValueOnce({
        id: 'existing-id',
      });

      await expect(
        service.create(
          {
            code: 'PAC-001',
            name: 'PAC Duplicate',
            category: 'Chemical UTL',
            processType: ProcessType.GSP,
            gspAnalysisProfile: GspAnalysisProfile.PAC_PA,
            isActive: true,
          },
          mockAdminUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('2. rejects active GSP product with missing/null analysis profile', async () => {
      prisma.productCatalog.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.create(
          {
            code: 'NEW-CHEM-001',
            name: 'New Unknown Chemical',
            category: 'Chemical UTL',
            processType: ProcessType.GSP,
            gspAnalysisProfile: null,
            isActive: true,
          },
          mockAdminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('3. rejects contradictory invariant (PA_EXEMPT + isPaRequired: true)', async () => {
      prisma.productCatalog.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.create(
          {
            code: 'SOLAR-TEST',
            name: 'Solar Test',
            category: 'Fuel',
            processType: ProcessType.GSP,
            gspAnalysisProfile: GspAnalysisProfile.PA_EXEMPT,
            isPaRequired: true, // Contradictory!
            isActive: true,
          },
          mockAdminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('4. rejects contradictory invariant (PAC_PA + isPaRequired: false)', async () => {
      prisma.productCatalog.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.create(
          {
            code: 'PAC-TEST',
            name: 'PAC Test',
            category: 'Chemical UTL',
            processType: ProcessType.GSP,
            gspAnalysisProfile: GspAnalysisProfile.PAC_PA,
            isPaRequired: false, // Contradictory!
            isActive: true,
          },
          mockAdminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('5. successfully creates active GSP product when profile matches invariant', async () => {
      prisma.productCatalog.findUnique.mockResolvedValueOnce(null);
      prisma.productCatalog.create.mockImplementationOnce(({ data }: any) => ({
        id: 'new-id-1',
        ...data,
      }));

      const res = await service.create(
        {
          code: 'NEW-PAC-001',
          name: 'PAC 280 Special',
          category: 'Chemical UTL',
          processType: ProcessType.GSP,
          gspAnalysisProfile: GspAnalysisProfile.PAC_PA,
          receiptUnit: WarehouseUnit.LITER,
          isActive: true,
        },
        mockAdminUser,
      );

      expect(res.isPaRequired).toBe(true);
      expect(res.gspAnalysisProfile).toBe(GspAnalysisProfile.PAC_PA);
      expect(res.receiptUnit).toBe(WarehouseUnit.LITER);
      expect(prisma.productCatalog.create).toHaveBeenCalled();
    });

    it('6. allows inactive draft GSP product without profile', async () => {
      prisma.productCatalog.findUnique.mockResolvedValueOnce(null);
      prisma.productCatalog.create.mockImplementationOnce(({ data }: any) => ({
        id: 'draft-id-1',
        ...data,
      }));

      const res = await service.create(
        {
          code: 'DRAFT-001',
          name: 'Draft Chemical',
          category: 'Chemical UTL',
          processType: ProcessType.GSP,
          gspAnalysisProfile: null,
          isActive: false, // Inactive draft
        },
        mockAdminUser,
      );

      expect(res.isActive).toBe(false);
      expect(res.gspAnalysisProfile).toBeNull();
    });

    it('should reject creating active GSP catalog without receiptUnit with MISSING_GSP_RECEIPT_UNIT', async () => {
      prisma.productCatalog.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.create(
          {
            code: 'PAC-NEW',
            name: 'PAC New Brand',
            category: 'Chemical UTL',
            processType: ProcessType.GSP,
            gspAnalysisProfile: GspAnalysisProfile.PAC_PA,
            isActive: true,
          } as any,
          mockAdminUser,
        ),
      ).rejects.toMatchObject({
        response: { errors: expect.arrayContaining(['MISSING_GSP_RECEIPT_UNIT']) },
      });
    });

    it('should reject saving canonical code with wrong UOM (e.g. COAL-001 with LITER) with GSP_RECEIPT_UNIT_MISMATCH', async () => {
      prisma.productCatalog.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.create(
          {
            code: 'COAL-001',
            name: 'Batubara',
            category: 'Coal',
            processType: ProcessType.GSP,
            gspAnalysisProfile: GspAnalysisProfile.COAL_PA,
            receiptUnit: WarehouseUnit.LITER, // MISMATCH
            isActive: true,
          } as any,
          mockAdminUser,
        ),
      ).rejects.toMatchObject({
        response: { errors: expect.arrayContaining(['GSP_RECEIPT_UNIT_MISMATCH']) },
      });
    });
  });

  describe('update', () => {
    it('7. rejects activating GSP product if profile is null', async () => {
      prisma.productCatalog.findUnique.mockResolvedValueOnce({
        id: 'cat-draft-1',
        processType: ProcessType.GSP,
        isActive: false,
        gspAnalysisProfile: null,
      });

      await expect(
        service.update(
          'cat-draft-1',
          {
            isActive: true, // Trying to activate without setting profile!
          },
          mockAdminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('8. rejects contradictory invariant on update', async () => {
      prisma.productCatalog.findUnique.mockResolvedValueOnce({
        id: 'cat-solar-1',
        processType: ProcessType.GSP,
        isActive: true,
        gspAnalysisProfile: GspAnalysisProfile.PA_EXEMPT,
      });

      await expect(
        service.update(
          'cat-solar-1',
          {
            isPaRequired: true, // Contradictory for PA_EXEMPT!
          },
          mockAdminUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('9. updates product successfully when valid', async () => {
      prisma.productCatalog.findUnique.mockResolvedValueOnce({
        id: 'cat-pac-1',
        code: 'PAC-001',
        processType: ProcessType.GSP,
        isActive: true,
        gspAnalysisProfile: GspAnalysisProfile.PAC_PA,
        receiptUnit: WarehouseUnit.LITER,
        isPaRequired: true,
      });

      prisma.productCatalog.update.mockResolvedValueOnce({
        id: 'cat-pac-1',
        name: 'PAC 280 AC Renamed',
      });

      const res = await service.update(
        'cat-pac-1',
        { name: 'PAC 280 AC Renamed' },
        mockAdminUser,
      );
      expect(res.name).toBe('PAC 280 AC Renamed');
    });
  });

  describe('remove', () => {
    it('10. deactivates instead of deleting if referenced by transactions', async () => {
      prisma.productCatalog.findUnique.mockResolvedValueOnce({
        id: 'cat-used-1',
        code: 'PAC-001',
        _count: { transactions: 5, qcAnalyses: 2 },
      });

      prisma.productCatalog.update.mockResolvedValueOnce({
        id: 'cat-used-1',
        isActive: false,
      });

      const res = await service.remove('cat-used-1', mockAdminUser);
      expect(res.deactivated).toBe(true);
      expect(prisma.productCatalog.update).toHaveBeenCalledWith({
        where: { id: 'cat-used-1' },
        data: { isActive: false },
      });
      expect(prisma.productCatalog.delete).not.toHaveBeenCalled();
    });

    it('11. permanently deletes if not referenced by transactions or analyses', async () => {
      prisma.productCatalog.findUnique.mockResolvedValueOnce({
        id: 'cat-unused-1',
        code: 'TEST-999',
        _count: { transactions: 0, qcAnalyses: 0 },
      });

      prisma.productCatalog.delete.mockResolvedValueOnce({
        id: 'cat-unused-1',
      });

      const res = await service.remove('cat-unused-1', mockAdminUser);
      expect(res.success).toBe(true);
      expect(prisma.productCatalog.delete).toHaveBeenCalledWith({
        where: { id: 'cat-unused-1' },
      });
    });
  });
});
