import { BadRequestException } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import { VALID_GBJ_PRODUCT_TYPES, isValidGbjProductType } from './constants/gbj-products';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';

describe('GBJ Multi Product Type Unit Tests', () => {
  let service: WarehouseService;
  let mockPrisma: any;
  let mockActivityLogs: any;

  beforeEach(() => {
    mockPrisma = {
      userWarehouseAccess: {
        findMany: jest.fn().mockResolvedValue([{ processType: 'GBJ' }]),
      },
      transaction: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    mockActivityLogs = {
      logAction: jest.fn().mockResolvedValue({}),
    };
    service = new WarehouseService(
      mockPrisma as unknown as PrismaService,
      mockActivityLogs as unknown as ActivityLogsService,
    );
  });

  describe('GBJ Product Catalog Validation', () => {
    it('should validate all catalog products correctly', () => {
      expect(VALID_GBJ_PRODUCT_TYPES.length).toBe(6);
      expect(isValidGbjProductType('SIC 18 T')).toBe(true);
      expect(isValidGbjProductType('SIC 01 PC')).toBe(true);
      expect(isValidGbjProductType('SIC 25 BR')).toBe(true);
      expect(isValidGbjProductType('SIC 8590 SD')).toBe(true);
      expect(isValidGbjProductType('SIC 9010 M3')).toBe(true);
      expect(isValidGbjProductType('SIC 18 C1')).toBe(true);
      expect(isValidGbjProductType('INVALID_CODE')).toBe(false);
      expect(isValidGbjProductType('')).toBe(false);
    });
  });

  describe('normalizeDeliveryChecklist', () => {
    it('1. should accept exactly 1 valid product in productTypes array', () => {
      const result = service.normalizeDeliveryChecklist({
        productTypes: ['SIC 18 T'],
        customerDestination: 'PT TEST JAYA',
        suratJalanNumber: 'SJ-001',
      });
      expect(result).toBeDefined();
      expect(result.productTypes).toEqual(['SIC 18 T']);
      expect(result.productType).toBe('SIC 18 T');
      expect(result.customerDestination).toBe('PT TEST JAYA');
    });

    it('2. should accept exactly 2 valid different products in productTypes array', () => {
      const result = service.normalizeDeliveryChecklist({
        productTypes: ['SIC 18 T', 'SIC 01 PC'],
        customerDestination: 'PT TEST JAYA',
        suratJalanNumber: 'SJ-002',
      });
      expect(result).toBeDefined();
      expect(result.productTypes).toEqual(['SIC 18 T', 'SIC 01 PC']);
      expect(result.productType).toBe('SIC 18 T');
    });

    it('3. should support legacy single productType string for backward compatibility', () => {
      const result = service.normalizeDeliveryChecklist({
        productType: 'SIC 25 BR',
        customer: 'PT LEGACY CUSTOMER',
      });
      expect(result).toBeDefined();
      expect(result.productTypes).toEqual(['SIC 25 BR']);
      expect(result.productType).toBe('SIC 25 BR');
      expect(result.customerDestination).toBe('PT LEGACY CUSTOMER');
    });

    it('4. should reject duplicate product types with DUPLICATE_GBJ_PRODUCT_TYPE', () => {
      expect(() => {
        service.normalizeDeliveryChecklist({
          productTypes: ['SIC 18 T', 'SIC 18 T'],
        });
      }).toThrow(BadRequestException);

      try {
        service.normalizeDeliveryChecklist({
          productTypes: ['SIC 18 T', 'SIC 18 T'],
        });
      } catch (err: any) {
        expect(err.response.errors).toContain('DUPLICATE_GBJ_PRODUCT_TYPE');
      }
    });

    it('5. should reject more than 2 products with EXCEEDED_MAX_GBJ_PRODUCT_TYPES', () => {
      expect(() => {
        service.normalizeDeliveryChecklist({
          productTypes: ['SIC 18 T', 'SIC 01 PC', 'SIC 25 BR'],
        });
      }).toThrow(BadRequestException);

      try {
        service.normalizeDeliveryChecklist({
          productTypes: ['SIC 18 T', 'SIC 01 PC', 'SIC 25 BR'],
        });
      } catch (err: any) {
        expect(err.response.errors).toContain('EXCEEDED_MAX_GBJ_PRODUCT_TYPES');
      }
    });

    it('6. should reject empty product list with MISSING_GBJ_PRODUCT_TYPE', () => {
      expect(() => {
        service.normalizeDeliveryChecklist({
          productTypes: [],
        });
      }).toThrow(BadRequestException);

      try {
        service.normalizeDeliveryChecklist({
          productTypes: [],
        });
      } catch (err: any) {
        expect(err.response.errors).toContain('MISSING_GBJ_PRODUCT_TYPE');
      }
    });

    it('7. should reject invalid product code with INVALID_GBJ_PRODUCT_TYPE', () => {
      expect(() => {
        service.normalizeDeliveryChecklist({
          productTypes: ['SIC 18 T', 'UNAPPROVED CHEMICAL'],
        });
      }).toThrow(BadRequestException);

      try {
        service.normalizeDeliveryChecklist({
          productTypes: ['SIC 18 T', 'UNAPPROVED CHEMICAL'],
        });
      } catch (err: any) {
        expect(err.response.errors).toContain('INVALID_GBJ_PRODUCT_TYPE');
      }
    });
  });

  describe('completeWarehouse with GBJ Multi Product', () => {
    it('8. should successfully complete GBJ transaction and persist deliveryChecklist', async () => {
      const mockTx = {
        id: 'tx-gbj-1',
        processType: 'GBJ',
        status: 'WAREHOUSE_IN_PROGRESS',
        revision: 1,
        warehouseEndAt: null,
        warehouseStartAt: new Date(),
        warehouseStartById: 'user-wh',
        remarks: null,
      };

      mockPrisma.transaction.findUnique.mockResolvedValue(mockTx);

      const mockTxClient = {
        transaction: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            ...mockTx,
            status: 'WAREHOUSE_DONE',
            deliveryChecklist: {
              productTypes: ['SIC 18 T', 'SIC 8590 SD'],
              productType: 'SIC 18 T',
              customerDestination: 'PT INDAH KARYA',
            },
          }),
        },
        warehouseProcess: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'wp-1',
            isCurrent: true,
            endAt: null,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        transactionStatusHistory: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockTxClient));

      const user: JwtPayloadUser = {
        id: 'user-wh',
        email: 'wh@test.com',
        role: 'WAREHOUSE',
      } as any;

      const result = await service.completeWarehouse(
        'tx-gbj-1',
        {
          actualWeight: 14500,
          suratJalanNumber: 'SJ-GBJ-20261015-001',
          deliveryChecklist: {
            productTypes: ['SIC 18 T', 'SIC 8590 SD'],
            customerDestination: 'PT INDAH KARYA',
          },
        },
        user,
      );

      expect(mockTxClient.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'WAREHOUSE_DONE',
            deliveryChecklist: expect.objectContaining({
              productTypes: ['SIC 18 T', 'SIC 8590 SD'],
            }),
          }),
        }),
      );

      expect(mockTxClient.warehouseProcess.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            checklistItems: expect.objectContaining({
              productTypes: ['SIC 18 T', 'SIC 8590 SD'],
            }),
          }),
        }),
      );
    });
  });
});
