import { Test, TestingModule } from '@nestjs/testing';
import { GateService } from '../src/gate/gate.service';
import { WeighbridgeService } from '../src/weighbridge/weighbridge.service';
import { WarehouseService } from '../src/warehouse/warehouse.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ActivityLogsService } from '../src/activity-logs/activity-logs.service';
import { JwtPayloadUser } from '../src/common/decorators/current-user.decorator';
import {
  ProcessType,
  TransactionStatus,
  CargoProcessType,
} from '@prisma/client';

describe('GBB & GBJ Full Lifecycle Regression Suite (Explicit Isolation)', () => {
  let gateService: GateService;
  let weighbridgeService: WeighbridgeService;
  let warehouseService: WarehouseService;

  const mockPrismaService: any = {
    $transaction: jest.fn((cb) => cb(mockPrismaService)),
    transaction: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    productCatalog: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    weighbridgeRecord: {
      findFirst: jest.fn(),
      create: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _max: { revision: 0 } }),
    },
    warehouseProcess: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _max: { revision: 0 } }),
    },
    transactionStatusHistory: {
      create: jest.fn(),
    },
    userWarehouseAccess: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { processType: ProcessType.GBB },
          { processType: ProcessType.GBJ },
        ]),
    },
    fraudCheck: {
      create: jest.fn(),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };

  const mockActivityLogsService = {
    logAction: jest.fn().mockResolvedValue(true),
  };

  const securityUser: JwtPayloadUser = {
    id: 'user-sec-1',
    email: 'security@gms.local',
    role: 'SECURITY',
  };

  const weighbridgeUser: JwtPayloadUser = {
    id: 'user-wb-1',
    email: 'weighbridge@gms.local',
    role: 'WEIGHBRIDGE',
  };

  const warehouseUser: JwtPayloadUser = {
    id: 'user-wh-1',
    email: 'warehouse@gms.local',
    role: 'WAREHOUSE',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GateService,
        WeighbridgeService,
        WarehouseService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ActivityLogsService, useValue: mockActivityLogsService },
      ],
    }).compile();

    gateService = module.get<GateService>(GateService);
    weighbridgeService = module.get<WeighbridgeService>(WeighbridgeService);
    warehouseService = module.get<WarehouseService>(WarehouseService);

    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation((cb: any) =>
      cb(mockPrismaService),
    );
    mockPrismaService.userWarehouseAccess.findMany.mockResolvedValue([
      { processType: ProcessType.GBB },
      { processType: ProcessType.GBJ },
    ]);
  });

  describe('GBB (Gudang Bahan Baku) Inbound Lifecycle & Multi-Subtype Support', () => {
    it('1. GBB Check-In accepts multiple cargo sub-types without requiring productCatalogId or GSP profile', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(null);
      mockPrismaService.transaction.create.mockImplementation(
        ({ data }: any) => ({
          id: 'tx-gbb-101',
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const gbbPayload = {
        processType: ProcessType.GBB,
        cargoType: 'Coffee Beans',
        cargoSubType: 'Kopi Robusta Lampung, Kopi Arabika Mandheling',
        cargoSubTypes: ['Kopi Robusta Lampung', 'Kopi Arabika Mandheling'],
        plateNumber: 'B 1111 GBB',
        driverName: 'Pak Supir Kopi',
        driverPhone: '081234567891',
        vendorName: 'PT Perkebunan Kopi Nusantara',
        vehicleType: 'TRUCK',
        cargoProcessType: CargoProcessType.INBOUND,
      };

      const result = await gateService.checkIn(gbbPayload, securityUser);

      expect(result.success).toBe(true);
      expect(result.data.processType).toBe(ProcessType.GBB);
      expect(result.data.cargoSubType).toBe(
        'Kopi Robusta Lampung, Kopi Arabika Mandheling',
      );
      expect(result.data.gspAnalysisProfile).toBeNull();
      expect(result.data.status).toBe(TransactionStatus.REGISTERED);
    });

    it('2. GBB Weigh-In: Gross weight recorded, routes to QC_VEHICLE_PENDING without GSP PA requirement', async () => {
      const gbbTx = {
        id: 'tx-gbb-101',
        transactionNumber: 'TRX-GBB-001',
        processType: ProcessType.GBB,
        cargoType: 'Coffee Beans',
        cargoSubType: 'Kopi Robusta Lampung, Kopi Arabika Mandheling',
        status: TransactionStatus.REGISTERED,
        gspAnalysisProfile: null,
        productCatalog: null,
        revision: 1,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValue(gbbTx);
      mockPrismaService.weighbridgeRecord.findFirst.mockResolvedValue(null);
      mockPrismaService.transaction.updateMany.mockResolvedValue({ count: 1 });

      const wbResult = await weighbridgeService.submitWeighIn(
        'tx-gbb-101',
        { weight: 22500 },
        weighbridgeUser,
      );

      expect(wbResult.success).toBe(true);
      expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            grossWeight: 22500,
            status: TransactionStatus.QC_VEHICLE_PENDING,
          }),
        }),
      );
    });

    it('3. GBB Warehouse Unloading: records unloading process and transitions to WAREHOUSE_IN_PROGRESS', async () => {
      const gbbUnloadingTx = {
        id: 'tx-gbb-101',
        transactionNumber: 'TRX-GBB-001',
        processType: ProcessType.GBB,
        cargoType: 'Coffee Beans',
        cargoSubType: 'Kopi Robusta Lampung, Kopi Arabika Mandheling',
        status: TransactionStatus.QC_VEHICLE_PASSED,
        gspAnalysisProfile: null,
        productCatalog: null,
        revision: 2,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValue(
        gbbUnloadingTx,
      );
      mockPrismaService.warehouseProcess.findFirst.mockResolvedValue(null);
      mockPrismaService.warehouseProcess.create.mockResolvedValue({
        id: 'wh-proc-1',
        transactionId: 'tx-gbb-101',
        warehouseUnit: 'GBB',
        isCurrent: true,
      });
      mockPrismaService.transaction.update.mockResolvedValue({
        ...gbbUnloadingTx,
        status: TransactionStatus.WAREHOUSE_IN_PROGRESS,
      });

      const startResult = await warehouseService.startWarehouse(
        'tx-gbb-101',
        { warehouseUnit: 'GBB' as any },
        warehouseUser,
      );
      expect(startResult.success).toBe(true);
    });

    it('4. GBB Weigh-Out: Tare weight recorded, netWeight calculated, status WEIGH_OUT_DONE', async () => {
      const gbbWeighOutTx = {
        id: 'tx-gbb-101',
        transactionNumber: 'TRX-GBB-001',
        processType: ProcessType.GBB,
        cargoType: 'Coffee Beans',
        cargoSubType: 'Kopi Robusta Lampung, Kopi Arabika Mandheling',
        grossWeight: 22500,
        status: TransactionStatus.WAREHOUSE_DONE,
        gspAnalysisProfile: null,
        productCatalog: null,
        revision: 3,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValue(gbbWeighOutTx);
      mockPrismaService.weighbridgeRecord.findFirst.mockResolvedValue(null);
      mockPrismaService.transaction.updateMany.mockResolvedValue({ count: 1 });

      const wbOutResult = await weighbridgeService.submitWeighOut(
        'tx-gbb-101',
        { weight: 7500 },
        weighbridgeUser,
      );

      expect(wbOutResult.success).toBe(true);
      expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tareWeight: 7500,
            netWeight: 15000,
            status: TransactionStatus.WEIGH_OUT_DONE,
          }),
        }),
      );
    });

    it('5. GBB Gate Out Check-Out: transitions WEIGH_OUT_DONE to COMPLETED', async () => {
      const gbbGateOutTx = {
        id: 'tx-gbb-101',
        transactionNumber: 'TRX-GBB-001',
        processType: ProcessType.GBB,
        cargoType: 'Coffee Beans',
        cargoSubType: 'Kopi Robusta Lampung, Kopi Arabika Mandheling',
        status: TransactionStatus.WEIGH_OUT_DONE,
        gspAnalysisProfile: null,
        revision: 4,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValue(gbbGateOutTx);
      mockPrismaService.transaction.updateMany.mockResolvedValue({ count: 1 });

      const checkOutResult = await gateService.checkOut(
        'tx-gbb-101',
        securityUser,
      );

      expect(checkOutResult.success).toBe(true);
      expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'tx-gbb-101',
            status: 'WEIGH_OUT_DONE',
            revision: 4,
          }),
          data: expect.objectContaining({
            status: TransactionStatus.COMPLETED,
          }),
        }),
      );
    });
  });

  describe('GBJ (Gudang Barang Jadi) Independent Lifecycle', () => {
    it('1. GBJ Check-In: creates outbound transaction without requiring GSP catalog ID', async () => {
      mockPrismaService.transaction.findFirst.mockResolvedValue(null);
      mockPrismaService.transaction.create.mockImplementation(
        ({ data }: any) => ({
          id: 'tx-gbj-201',
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const gbjPayload = {
        processType: ProcessType.GBJ,
        cargoType: 'Finished Goods',
        cargoSubType: 'Kopi Kapal Api Special Mix 20x10',
        plateNumber: 'B 2222 GBJ',
        driverName: 'Pak Supir Distribusi',
        driverPhone: '081234567892',
        vendorName: 'PT Logistik Distribusi Nasional',
        vehicleType: 'CONTAINER 40FT',
        cargoProcessType: CargoProcessType.OUTBOUND,
      };

      const result = await gateService.checkIn(gbjPayload, securityUser);

      expect(result.success).toBe(true);
      expect(result.data.processType).toBe(ProcessType.GBJ);
      expect(result.data.gspAnalysisProfile).toBeNull();
      expect(result.data.status).toBe(TransactionStatus.REGISTERED);
    });

    it('2. GBJ Weigh-In: Tare-first recorded, routes to QC_VEHICLE_PENDING', async () => {
      const gbjTx = {
        id: 'tx-gbj-201',
        transactionNumber: 'TRX-GBJ-001',
        processType: ProcessType.GBJ,
        cargoType: 'Finished Goods',
        cargoSubType: 'Kopi Kapal Api Special Mix 20x10',
        status: TransactionStatus.REGISTERED,
        gspAnalysisProfile: null,
        productCatalog: null,
        revision: 1,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValue(gbjTx);
      mockPrismaService.weighbridgeRecord.findFirst.mockResolvedValue(null);
      mockPrismaService.transaction.updateMany.mockResolvedValue({ count: 1 });

      const wbResult = await weighbridgeService.submitWeighIn(
        'tx-gbj-201',
        { weight: 8200 },
        weighbridgeUser,
      );

      expect(wbResult.success).toBe(true);
      expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tareWeight: 8200,
            status: TransactionStatus.QC_VEHICLE_PENDING,
          }),
        }),
      );
    });

    it('3. GBJ Weigh-Out: Gross recorded after loading, transitions to WEIGH_OUT_DONE', async () => {
      const gbjWeighOutTx = {
        id: 'tx-gbj-201',
        transactionNumber: 'TRX-GBJ-001',
        processType: ProcessType.GBJ,
        cargoType: 'Finished Goods',
        cargoSubType: 'Kopi Kapal Api Special Mix 20x10',
        tareWeight: 8200,
        status: TransactionStatus.WAREHOUSE_DONE,
        gspAnalysisProfile: null,
        productCatalog: null,
        revision: 2,
      };

      mockPrismaService.transaction.findUnique.mockResolvedValue(gbjWeighOutTx);
      mockPrismaService.weighbridgeRecord.findFirst.mockResolvedValue(null);
      mockPrismaService.transaction.updateMany.mockResolvedValue({ count: 1 });

      const wbOutResult = await weighbridgeService.submitWeighOut(
        'tx-gbj-201',
        { weight: 24200 },
        weighbridgeUser,
      );

      expect(wbOutResult.success).toBe(true);
      expect(mockPrismaService.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            grossWeight: 24200,
            netWeight: 16000,
            status: TransactionStatus.WEIGH_OUT_DONE,
          }),
        }),
      );
    });
  });
});
