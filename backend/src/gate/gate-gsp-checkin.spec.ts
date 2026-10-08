import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { GateService } from './gate.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { GspAnalysisProfile, ProcessType, WarehouseUnit } from '@prisma/client';

describe('GateService — GSP Canonical Registration & Flow Lock', () => {
  let gateService: GateService;

  const mockPrismaService: any = {
    transaction: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    productCatalog: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };

  const mockActivityLogsService = {
    logAction: jest.fn().mockResolvedValue({}),
  };

  const securityUser: JwtPayloadUser = {
    id: 'user-sec-1',
    email: 'security@gms.local',
    role: 'SECURITY',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GateService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ActivityLogsService, useValue: mockActivityLogsService },
      ],
    }).compile();

    gateService = module.get<GateService>(GateService);
    jest.clearAllMocks();

    mockPrismaService.$transaction.mockImplementation((cb: any) =>
      cb(mockPrismaService),
    );
    mockPrismaService.transaction.findFirst.mockResolvedValue(null); // No duplicate active truck
  });

  const baseGspDto = {
    plateNumber: 'B1234XYZ',
    driverName: 'Budi Driver',
    driverPhone: '081234567890',
    vendorName: 'PT Vendor GSP',
    vehicleType: 'TRONTON BOX',
    processType: 'GSP' as ProcessType,
    cargoProcessType: 'INBOUND',
  };

  it('1. GSP check-in without productCatalogId throws BadRequestException (400)', async () => {
    await expect(
      gateService.checkIn(
        {
          ...baseGspDto,
          cargoType: 'Coal',
          cargoSubType: 'Batubara',
          productCatalogId: undefined,
        } as any,
        securityUser,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('2. GSP check-in with inactive product throws BadRequestException (400)', async () => {
    mockPrismaService.productCatalog.findUnique.mockResolvedValueOnce({
      id: 'cat-inactive-1',
      code: 'INA-001',
      name: 'Batubara Inactive',
      category: 'Coal',
      processType: 'GSP',
      gspAnalysisProfile: GspAnalysisProfile.COAL_PA,
      isPaRequired: true,
      isActive: false,
    });

    await expect(
      gateService.checkIn(
        {
          ...baseGspDto,
          cargoType: 'Coal',
          cargoSubType: 'Batubara Inactive',
          productCatalogId: 'cat-inactive-1',
        } as any,
        securityUser,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('3. GSP check-in using GBB product catalog throws BadRequestException (400)', async () => {
    mockPrismaService.productCatalog.findUnique.mockResolvedValueOnce({
      id: 'cat-gbb-1',
      code: 'GBB-001',
      name: 'Green Coffee Bean',
      category: 'Coffee Beans',
      processType: 'GBB',
      gspAnalysisProfile: null,
      isPaRequired: false,
      isActive: true,
    });

    await expect(
      gateService.checkIn(
        {
          ...baseGspDto,
          cargoType: 'Coffee Beans',
          cargoSubType: 'Green Coffee Bean',
          productCatalogId: 'cat-gbb-1',
        } as any,
        securityUser,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('4. GSP check-in with product having null analysis profile throws BadRequestException (400)', async () => {
    mockPrismaService.productCatalog.findUnique.mockResolvedValueOnce({
      id: 'cat-null-prof',
      code: 'GSP-999',
      name: 'Unconfigured Chem',
      category: 'Chemical UTL',
      processType: 'GSP',
      gspAnalysisProfile: null,
      isPaRequired: true,
      isActive: true,
    });

    await expect(
      gateService.checkIn(
        {
          ...baseGspDto,
          cargoType: 'Chemical UTL',
          cargoSubType: 'Unconfigured Chem',
          productCatalogId: 'cat-null-prof',
        } as any,
        securityUser,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('5. Invariant mismatch: PA_EXEMPT but isPaRequired=true throws BadRequestException (400)', async () => {
    mockPrismaService.productCatalog.findUnique.mockResolvedValueOnce({
      id: 'cat-inv-1',
      code: 'SOL-INV',
      name: 'Solar Corrupt',
      category: 'Fuel',
      processType: 'GSP',
      gspAnalysisProfile: GspAnalysisProfile.PA_EXEMPT,
      isPaRequired: true, // Contradictory!
      isActive: true,
    });

    await expect(
      gateService.checkIn(
        {
          ...baseGspDto,
          cargoType: 'Fuel',
          cargoSubType: 'Solar Corrupt',
          productCatalogId: 'cat-inv-1',
        } as any,
        securityUser,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('6. Client cargoType conflicts with canonical catalog category throws BadRequestException (400)', async () => {
    mockPrismaService.productCatalog.findUnique.mockResolvedValueOnce({
      id: 'cat-pac-1',
      code: 'PAC-001',
      name: 'PAC 280 AC',
      category: 'Chemical UTL',
      processType: 'GSP',
      gspAnalysisProfile: GspAnalysisProfile.PAC_PA,
      receiptUnit: WarehouseUnit.LITER,
      isPaRequired: true,
      isActive: true,
    });

    await expect(
      gateService.checkIn(
        {
          ...baseGspDto,
          cargoType: 'Coal', // Tampered!
          cargoSubType: 'PAC 280 AC',
          productCatalogId: 'cat-pac-1',
        } as any,
        securityUser,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('7. Client cargoSubType conflicts with canonical catalog name throws BadRequestException (400)', async () => {
    mockPrismaService.productCatalog.findUnique.mockResolvedValueOnce({
      id: 'cat-pac-1',
      code: 'PAC-001',
      name: 'PAC 280 AC',
      category: 'Chemical UTL',
      processType: 'GSP',
      gspAnalysisProfile: GspAnalysisProfile.PAC_PA,
      receiptUnit: WarehouseUnit.LITER,
      isPaRequired: true,
      isActive: true,
    });

    await expect(
      gateService.checkIn(
        {
          ...baseGspDto,
          cargoType: 'Chemical UTL',
          cargoSubType: 'Rapid Klen', // Tampered!
          productCatalogId: 'cat-pac-1',
        } as any,
        securityUser,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('8. GSP Batubara check-in creates transaction with canonical identity and COAL_PA snapshot', async () => {
    mockPrismaService.productCatalog.findUnique.mockResolvedValueOnce({
      id: 'cat-coal-1',
      code: 'COAL-001',
      name: 'Batubara',
      category: 'Coal',
      processType: 'GSP',
      gspAnalysisProfile: GspAnalysisProfile.COAL_PA,
      receiptUnit: WarehouseUnit.KG,
      isPaRequired: true,
      policyVersion: 'SOP-GSP-2026.1',
      isActive: true,
    });

    mockPrismaService.transaction.create.mockImplementation((args: any) => ({
      id: 'tx-coal-1',
      transactionNumber: 'GMS-20261006-0001',
      ...args.data,
    }));

    const result = await gateService.checkIn(
      {
        ...baseGspDto,
        cargoType: 'Coal',
        cargoSubType: 'Batubara',
        productCatalogId: 'cat-coal-1',
      } as any,
      securityUser,
    );

    expect(result.success).toBe(true);
    expect(mockPrismaService.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          processType: 'GSP',
          cargoType: 'Coal',
          cargoSubType: 'Batubara',
          productCatalogId: 'cat-coal-1',
          gspAnalysisProfile: GspAnalysisProfile.COAL_PA,
          receiptUnit: WarehouseUnit.KG,
          paPolicyVersion: 'SOP-GSP-2026.1',
        }),
      }),
    );
  });

  it('9. GSP Solar check-in snapshots PA_EXEMPT and exemption reason', async () => {
    mockPrismaService.productCatalog.findUnique.mockResolvedValueOnce({
      id: 'cat-solar-1',
      code: 'SOL-001',
      name: 'Solar',
      category: 'Fuel',
      processType: 'GSP',
      gspAnalysisProfile: GspAnalysisProfile.PA_EXEMPT,
      receiptUnit: WarehouseUnit.LITER,
      isPaRequired: false,
      policyVersion: 'SOP-GSP-2026.1',
      isActive: true,
    });

    mockPrismaService.transaction.create.mockImplementation((args: any) => ({
      id: 'tx-solar-1',
      transactionNumber: 'GMS-20261006-0002',
      ...args.data,
    }));

    const result = await gateService.checkIn(
      {
        ...baseGspDto,
        cargoType: 'Fuel',
        cargoSubType: 'Solar',
        productCatalogId: 'cat-solar-1',
      } as any,
      securityUser,
    );

    expect(result.success).toBe(true);
    expect(mockPrismaService.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          processType: 'GSP',
          cargoType: 'Fuel',
          cargoSubType: 'Solar',
          productCatalogId: 'cat-solar-1',
          gspAnalysisProfile: GspAnalysisProfile.PA_EXEMPT,
          receiptUnit: WarehouseUnit.LITER,
          paPolicyVersion: 'SOP-GSP-2026.1',
          paExemptionReason: expect.stringContaining('SOP Exemption Rule'),
        }),
      }),
    );
  });

  it('10. GSP PAC 280 AC check-in snapshots PAC_PA', async () => {
    mockPrismaService.productCatalog.findUnique.mockResolvedValueOnce({
      id: 'cat-pac-1',
      code: 'PAC-001',
      name: 'PAC 280 AC',
      category: 'Chemical UTL',
      processType: 'GSP',
      gspAnalysisProfile: GspAnalysisProfile.PAC_PA,
      receiptUnit: WarehouseUnit.LITER,
      isPaRequired: true,
      policyVersion: 'SOP-GSP-2026.1',
      isActive: true,
    });

    mockPrismaService.transaction.create.mockImplementation((args: any) => ({
      id: 'tx-pac-1',
      ...args.data,
    }));

    await gateService.checkIn(
      {
        ...baseGspDto,
        cargoType: 'Chemical UTL',
        cargoSubType: 'PAC 280 AC',
        productCatalogId: 'cat-pac-1',
      } as any,
      securityUser,
    );

    expect(mockPrismaService.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gspAnalysisProfile: GspAnalysisProfile.PAC_PA,
          receiptUnit: WarehouseUnit.LITER,
          productCatalogId: 'cat-pac-1',
        }),
      }),
    );
  });

  it('11. GSP Rapid Klen check-in snapshots RAPID_KLEN_PA', async () => {
    mockPrismaService.productCatalog.findUnique.mockResolvedValueOnce({
      id: 'cat-rpd-1',
      code: 'RPD-001',
      name: 'Rapid Klen',
      category: 'Chemical PROD',
      processType: 'GSP',
      gspAnalysisProfile: GspAnalysisProfile.RAPID_KLEN_PA,
      receiptUnit: WarehouseUnit.LITER,
      isPaRequired: true,
      policyVersion: 'SOP-GSP-2026.1',
      isActive: true,
    });

    mockPrismaService.transaction.create.mockImplementation((args: any) => ({
      id: 'tx-rpd-1',
      ...args.data,
    }));

    await gateService.checkIn(
      {
        ...baseGspDto,
        cargoType: 'Chemical PROD',
        cargoSubType: 'Rapid Klen',
        productCatalogId: 'cat-rpd-1',
      } as any,
      securityUser,
    );

    expect(mockPrismaService.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gspAnalysisProfile: GspAnalysisProfile.RAPID_KLEN_PA,
          receiptUnit: WarehouseUnit.LITER,
          productCatalogId: 'cat-rpd-1',
        }),
      }),
    );
  });

  it('12. should fail check-in if GSP catalog lacks receiptUnit with MISSING_GSP_RECEIPT_UNIT', async () => {
    mockPrismaService.productCatalog.findUnique.mockResolvedValueOnce({
      id: 'cat-no-uom',
      code: 'PAC-001',
      name: 'PAC 280 AC',
      category: 'Chemical UTL',
      processType: 'GSP',
      gspAnalysisProfile: GspAnalysisProfile.PAC_PA,
      receiptUnit: null,
      isPaRequired: true,
      isActive: true,
    });

    await expect(
      gateService.checkIn(
        {
          ...baseGspDto,
          cargoType: 'Chemical UTL',
          cargoSubType: 'PAC 280 AC',
          productCatalogId: 'cat-no-uom',
        } as any,
        securityUser,
      ),
    ).rejects.toMatchObject({
      response: {
        errors: expect.arrayContaining(['MISSING_GSP_RECEIPT_UNIT']),
      },
    });
  });

  it('13. should snapshot receiptUnit from catalog to transaction on gate check-in', async () => {
    mockPrismaService.productCatalog.findUnique.mockResolvedValueOnce({
      id: 'cat-pac-1',
      code: 'PAC-001',
      name: 'PAC 280 AC',
      category: 'Chemical UTL',
      processType: 'GSP',
      gspAnalysisProfile: GspAnalysisProfile.PAC_PA,
      receiptUnit: WarehouseUnit.LITER,
      isPaRequired: true,
      isActive: true,
    });

    mockPrismaService.transaction.create.mockImplementation((args: any) => ({
      id: 'tx-pac-uom',
      ...args.data,
    }));

    const result = await gateService.checkIn(
      {
        ...baseGspDto,
        cargoType: 'Chemical UTL',
        cargoSubType: 'PAC 280 AC',
        productCatalogId: 'cat-pac-1',
      } as any,
      securityUser,
    );

    expect(result.data.receiptUnit).toBe(WarehouseUnit.LITER);
    expect(mockPrismaService.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          receiptUnit: WarehouseUnit.LITER,
        }),
      }),
    );
  });
});
