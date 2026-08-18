import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

describe('ReportsService', () => {
  let service: ReportsService;

  const mockPrisma = {
    transaction: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const mockActivityLogsService = {
    logAction: jest.fn().mockResolvedValue(true),
  };

  const mockUser: JwtPayloadUser = {
    id: 'usr-1',
    name: 'Admin',
    email: 'admin@gms.local',
    role: 'ADMIN',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ActivityLogsService, useValue: mockActivityLogsService },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTransactionHistory', () => {
    it('should query transaction history with pagination and filters', async () => {
      const mockData = [
        {
          id: 'trx-1',
          transactionNumber: 'TRX-001',
          plateNumber: 'B1234XYZ',
          status: 'COMPLETED',
        },
      ];

      mockPrisma.transaction.count.mockResolvedValue(1);
      mockPrisma.transaction.findMany.mockResolvedValue(mockData);

      const result = await service.getTransactionHistory(
        {
          page: 1,
          limit: 10,
          processType: 'GBB',
          search: 'B1234',
          startDate: '2026-01-01',
          endDate: '2026-01-31',
        },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockData);
      expect(result.meta.total).toBe(1);
      expect(result.meta.totalPages).toBe(1);
      expect(mockPrisma.transaction.findMany).toHaveBeenCalled();
    });
  });

  describe('exportCsv and exportCsvStream', () => {
    it('should generate and return CSV formatted string', async () => {
      const mockTrx = [
        {
          transactionNumber: 'TRX-001',
          plateNumber: 'B1234XYZ',
          vendorName: 'PT Supplier',
          processType: 'GBB',
          status: 'COMPLETED',
          gateInAt: new Date('2026-01-01T08:00:00Z'),
          gateOutAt: new Date('2026-01-01T10:00:00Z'),
          netWeight: 15000,
          actualWeight: 15000,
          fraudChecks: [{ riskLevel: 'LOW' }],
        },
      ];

      mockPrisma.transaction.findMany
        .mockResolvedValueOnce(mockTrx)
        .mockResolvedValueOnce([]);

      const csv = await service.exportCsv(
        { processType: 'GBB', search: 'Supplier' },
        mockUser,
      );

      expect(csv).toContain('TRX ID,Plate Number,Vendor');
      expect(csv).toContain('TRX-001');
      expect(csv).toContain('PT Supplier');
    });
  });
});
