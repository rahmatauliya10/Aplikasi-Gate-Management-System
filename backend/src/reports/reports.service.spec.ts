import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';
import {
  OperationHistoryBottleneck,
  OperationHistoryExportFormat,
  OperationHistoryIntegrity,
  OperationHistorySort,
  OperationHistoryStatus,
} from './dto/operation-history-query.dto';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

describe('ReportsService', () => {
  let service: ReportsService;

  const mockPrisma = {
    transaction: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  const mockActivityLogsService = {
    logAction: jest.fn().mockResolvedValue(true),
  };

  const mockAuthorizationScopeService = {
    assertScopeNotEmpty: jest.fn(),
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
        {
          provide: AuthorizationScopeService,
          useValue: mockAuthorizationScopeService,
        },
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

  describe('getOperationHistory', () => {
    const projection = {
      id: 'trx-1',
      arrival: new Date('2026-01-01T01:00:00Z'),
      waiting_in: 20,
      warehouse: 10,
      qc: 5,
      waiting_out: 2,
      total: 37,
      net: 1000,
      roll: 990,
      diff: 10,
      deviation_percent: 1,
      fraud_status: 'SAFE',
      bottleneck: 'waitingIn',
    };

    beforeEach(() => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([projection])
        .mockResolvedValueOnce([
          {
            total: BigInt(1),
            avg_tat: 37,
            total_net: 1000,
            anomaly_count: BigInt(0),
            waiting_in_count: BigInt(1),
            warehouse_count: BigInt(0),
            qc_count: BigInt(0),
            waiting_out_count: BigInt(0),
          },
        ]);
      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          id: 'trx-1',
          transactionNumber: 'TRX-001',
          gateInAt: projection.arrival,
          gateOutAt: new Date('2026-01-01T01:37:00Z'),
        },
      ]);
    });

    it('casts the PostgreSQL RiskLevel enum before using it in text CASE branches', async () => {
      await service.getOperationHistory(
        {
          page: 1,
          limit: 10,
          status: OperationHistoryStatus.ALL,
          bottleneck: OperationHistoryBottleneck.ALL,
          integrity: OperationHistoryIntegrity.ALL,
        },
        mockUser,
      );

      const projectionQuery = mockPrisma.$queryRaw.mock.calls[0][0];
      const sqlText = projectionQuery.strings.join('?');
      expect(sqlText).toContain('fraud."riskLevel"::text AS risk_level');
    });

    it.each(Object.values(OperationHistorySort))(
      'keeps the paginated projection predicate valid for sort %s',
      async (sort) => {
        await service.getOperationHistory(
          { page: 2, limit: 10, sort },
          mockUser,
        );

        const projectionQuery = mockPrisma.$queryRaw.mock.calls[0][0];
        const sqlText = projectionQuery.strings.join('?');
        expect(sqlText).toMatch(/FROM final\s+WHERE 1 = 1\s+ORDER BY/);
        expect(sqlText).not.toMatch(/WHERE\s+ORDER BY/);
        expect(sqlText).toMatch(/LIMIT \? OFFSET \?/);
        expect(projectionQuery.values.slice(-2)).toEqual([10, 10]);
      },
    );

    it('closes the waiting-out ROUND expression in both projection and summary SQL', async () => {
      await service.getOperationHistory({}, mockUser);

      for (const [query] of mockPrisma.$queryRaw.mock.calls) {
        const sqlText = query.strings.join('?');
        expect(sqlText).toMatch(
          /ELSE ROUND\(EXTRACT\(EPOCH FROM \(base\."weighOutAt" - base\.wp_end\)\) \/ 60\)\s+END AS waiting_out/,
        );
        // Both endpoints share this CTE; neither may emit unmatched SQL groups.
        expect((sqlText.match(/\(/g) || []).length).toBe(
          (sqlText.match(/\)/g) || []).length,
        );
      }
    });

    it('uses process-aware gross/tare mapping for GBJ in the SQL projection', async () => {
      await service.getOperationHistory({}, mockUser);

      const sqlText = mockPrisma.$queryRaw.mock.calls[0][0].strings.join('?');
      expect(sqlText).toContain(
        'ranked."processType" = \'GBJ\' AND ranked.type = \'OUT\'',
      );
      expect(sqlText).toContain(
        'ranked."processType" = \'GBJ\' AND ranked.type = \'IN\'',
      );
      expect(sqlText).toContain('INNER JOIN "Transaction" t');
    });

    it('preserves a persisted FraudCheck verdict when projection weights are unavailable', async () => {
      mockPrisma.$queryRaw.mockReset();
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([
          {
            id: 'trx-persisted-verdict',
            net: null,
            roll: null,
            deviation_percent: 7,
            fraud_status: 'CRITICAL',
            bottleneck: 'ALL',
          },
        ])
        .mockResolvedValueOnce([
          {
            total: BigInt(1),
            avg_tat: null,
            total_net: null,
            anomaly_count: BigInt(1),
            waiting_in_count: BigInt(0),
            warehouse_count: BigInt(0),
            qc_count: BigInt(0),
            waiting_out_count: BigInt(0),
          },
        ]);
      mockPrisma.transaction.findMany.mockResolvedValueOnce([
        {
          id: 'trx-persisted-verdict',
          processType: 'GBB',
          status: 'COMPLETED',
          fraudChecks: [
            {
              id: 'fraud-persisted-critical',
              riskLevel: 'CRITICAL',
              deviationPercent: 7,
              calculatedAt: new Date('2026-01-01T01:00:00Z'),
            },
          ],
          weighbridgeRecords: [],
          warehouseProcesses: [],
          qcVehicleChecks: [],
          incomingMaterialChecks: [],
        },
      ]);

      const result = await service.getOperationHistory({}, mockUser);

      expect(result.data[0]).toEqual(
        expect.objectContaining({
          id: 'trx-persisted-verdict',
          fraud: expect.objectContaining({
            status: 'CRITICAL',
            deviationPercent: 7,
            net: null,
            roll: null,
          }),
        }),
      );
      const sqlText = mockPrisma.$queryRaw.mock.calls[0][0].strings.join('?');
      expect(sqlText).toContain("WHEN metrics.risk_level IS NOT NULL");
      expect(sqlText).toContain("WHEN metrics.net IS NULL OR metrics.roll IS NULL");
    });

    it('uses the longest positive stage descriptively without an unapproved 15-minute SLA', async () => {
      await service.getOperationHistory(
        { bottleneck: OperationHistoryBottleneck.WAREHOUSE },
        mockUser,
      );
      const projectionSql =
        mockPrisma.$queryRaw.mock.calls[0][0].strings.join('?');
      const summarySql =
        mockPrisma.$queryRaw.mock.calls[1][0].strings.join('?');
      expect(projectionSql).toContain('"warehouse" > 0');
      expect(summarySql).toContain(
        "bottleneck = 'warehouse' AND warehouse > 0",
      );
      expect(projectionSql).not.toContain('> 15');
      expect(summarySql).not.toContain('> 15');
    });

    it('returns paginated data and full filtered summary', async () => {
      const result = await service.getOperationHistory(
        {
          page: 1,
          limit: 10,
          status: OperationHistoryStatus.ALL,
          bottleneck: OperationHistoryBottleneck.ALL,
          integrity: OperationHistoryIntegrity.ALL,
        },
        mockUser,
      );

      expect(result.meta).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
      expect(result.summary).toEqual({
        avgTatMinutes: 37,
        totalTonnageMetric: 1,
        anomalyCount: 0,
        majorBottleneck: 'waitingIn',
      });
      expect(result.data[0].id).toBe('trx-1');
      expect(
        mockAuthorizationScopeService.assertScopeNotEmpty,
      ).toHaveBeenCalledWith(mockUser);
    });

    it('fails closed when an operational scope is empty', async () => {
      mockAuthorizationScopeService.assertScopeNotEmpty.mockImplementationOnce(
        () => {
          throw new Error('scope denied');
        },
      );

      await expect(service.getOperationHistory({}, mockUser)).rejects.toThrow(
        'scope denied',
      );
      expect(
        mockAuthorizationScopeService.assertScopeNotEmpty,
      ).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('exportOperationHistoryStream', () => {
    it('exports formula-safe CSV and HTML-escaped XLS values', async () => {
      mockPrisma.$queryRaw.mockReset();
      mockPrisma.transaction.findMany.mockReset();
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'trx-1',
          arrival: new Date('2026-01-01T01:00:00Z'),
          waiting_in: 0,
          warehouse: 0,
          qc: 0,
          waiting_out: 0,
          total: 0,
          net: 1000,
          roll: 990,
          diff: 10,
          deviation_percent: 1,
          fraud_status: 'SAFE',
          bottleneck: 'waitingIn',
        },
      ]);
      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          id: 'trx-1',
          transactionNumber: '=FORMULA',
          plateNumber: 'B1234<XYZ',
          driverName: '+Driver',
          vendorName: 'Vendor & Co',
          processType: 'GBB',
          status: 'COMPLETED',
          gateInAt: new Date('2026-01-01T01:00:00Z'),
          gateOutAt: null,
          warehouseProcesses: [],
          qcVehicleChecks: [],
          incomingMaterialChecks: [],
          fraudChecks: [],
        },
      ]);

      const csvChunks: string[] = [];
      for await (const chunk of service.exportOperationHistoryStream(
        { format: OperationHistoryExportFormat.CSV },
        mockUser,
      ))
        csvChunks.push(chunk);
      const csv = csvChunks.join('');
      expect(csv).toContain('"\'=FORMULA"');
      expect(csv).toContain('"B1234<XYZ"');

      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'trx-1',
          arrival: new Date('2026-01-01T01:00:00Z'),
          waiting_in: 0,
          warehouse: 0,
          qc: 0,
          waiting_out: 0,
          total: 0,
          net: 1000,
          roll: 990,
          diff: 10,
          deviation_percent: 1,
          fraud_status: 'SAFE',
          bottleneck: 'waitingIn',
        },
      ]);
      const xlsChunks: string[] = [];
      for await (const chunk of service.exportOperationHistoryStream(
        { format: OperationHistoryExportFormat.XLS },
        mockUser,
      ))
        xlsChunks.push(chunk);
      expect(xlsChunks.join('')).toContain('&lt;XYZ');
      expect(xlsChunks.join('')).toContain('Vendor &amp; Co');
    });

    it('uses bounded keyset batches instead of materializing all export ids', async () => {
      mockPrisma.$queryRaw.mockReset();
      mockPrisma.transaction.findMany.mockReset();
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([
          {
            id: 'trx-1',
            arrival: new Date('2026-01-01T01:00:00Z'),
            waiting_in: 0,
            warehouse: 0,
            qc: 0,
            waiting_out: 0,
            total: 1,
            net: 1000,
            roll: 990,
            diff: 10,
            deviation_percent: 1,
            fraud_status: 'SAFE',
            bottleneck: 'waitingIn',
          },
        ])
        .mockResolvedValueOnce([]);
      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          id: 'trx-1',
          transactionNumber: 'TRX-001',
          plateNumber: 'B1234XYZ',
          driverName: 'Driver',
          vendorName: 'Vendor',
          processType: 'GBB',
          status: 'COMPLETED',
          gateInAt: new Date('2026-01-01T01:00:00Z'),
          gateOutAt: new Date('2026-01-01T01:01:00Z'),
          warehouseProcesses: [],
          qcVehicleChecks: [],
          incomingMaterialChecks: [],
          fraudChecks: [],
        },
      ]);

      const chunks: string[] = [];
      for await (const chunk of service.exportOperationHistoryStream(
        { format: OperationHistoryExportFormat.CSV },
        mockUser,
      )) {
        chunks.push(chunk);
      }

      expect(chunks.join('')).toContain('TRX-001');
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      const projectionQuery = mockPrisma.$queryRaw.mock.calls[0][0];
      expect(projectionQuery.strings.join('?')).toContain('LIMIT');
      expect(mockPrisma.transaction.findMany).toHaveBeenCalledTimes(1);
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
