import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DashboardService } from '../src/dashboard/dashboard.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ActivityLogsService } from '../src/activity-logs/activity-logs.service';
import { AuthorizationScopeService } from '../src/auth/authorization-scope.service';
import {
  parseCalendarDate,
  getJakartaTodayString,
  getJakartaCurrentYearStartString,
  jakartaDateToUtcStart,
  jakartaDateToUtcEndExclusive,
  resolveDashboardDateBounds,
} from '../src/dashboard/utils/dashboard-date-range.util';

describe('Dashboard Date Range Filter & Validation Suite', () => {
  let service: DashboardService;
  let prisma: any;
  let authorizationScopeService: any;

  const mockUser: any = {
    id: 'usr-admin-1',
    email: 'admin@gms.local',
    role: 'ADMIN',
  };

  const mockScope = {
    processType: { in: ['GBB', 'GBJ'] },
  };

  beforeEach(async () => {
    prisma = {
      transaction: {
        count: jest.fn().mockResolvedValue(15),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'tx-1',
            processType: 'GBB',
            gateInAt: new Date('2026-08-10T08:00:00Z'),
            weighInAt: new Date('2026-08-10T08:15:00Z'),
            warehouseStartAt: new Date('2026-08-10T08:20:00Z'),
            warehouseEndAt: new Date('2026-08-10T09:00:00Z'),
            qcStartAt: new Date('2026-08-10T09:05:00Z'),
            qcEndAt: new Date('2026-08-10T09:20:00Z'),
            weighOutAt: new Date('2026-08-10T09:30:00Z'),
            gateOutAt: new Date('2026-08-10T09:35:00Z'),
            netWeight: 20000,
            actualWeight: 19980,
            qcVehicleChecks: [],
            incomingMaterialChecks: [],
          },
        ]),
      },
      fraudCheck: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    authorizationScopeService = {
      getTransactionScope: jest.fn().mockReturnValue(mockScope),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ActivityLogsService,
          useValue: { logAction: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: AuthorizationScopeService,
          useValue: authorizationScopeService,
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  describe('Pure Date Range Utility (dashboard-date-range.util)', () => {
    it('should correctly return Jakarta current year start string (YYYY-01-01)', () => {
      const yearStart = getJakartaCurrentYearStartString();
      expect(yearStart).toMatch(/^\d{4}-01-01$/);
    });

    it('should correctly validate real calendar dates and reject impossible dates', () => {
      expect(parseCalendarDate('2026-08-01')).toEqual({
        year: 2026,
        month: 8,
        day: 1,
      });
      expect(parseCalendarDate('2024-02-29')).toEqual({
        year: 2024,
        month: 2,
        day: 29,
      }); // leap year
      expect(parseCalendarDate('2026-02-28')).toEqual({
        year: 2026,
        month: 2,
        day: 28,
      }); // non-leap year

      // Invalid / impossible calendar dates
      expect(parseCalendarDate('2026-02-29')).toBeNull(); // 2026 is not leap year
      expect(parseCalendarDate('2026-02-30')).toBeNull();
      expect(parseCalendarDate('2026-02-31')).toBeNull();
      expect(parseCalendarDate('2026-13-01')).toBeNull();
      expect(parseCalendarDate('2026-00-20')).toBeNull();
      expect(parseCalendarDate('2026-08-32')).toBeNull();
      expect(parseCalendarDate('2026-04-31')).toBeNull(); // April has 30 days
      expect(parseCalendarDate('abcd-ef-gh')).toBeNull();
      expect(parseCalendarDate('')).toBeNull();
    });

    it('should compute exact Asia/Jakarta (UTC+7) start and exclusive next-day end timestamps in UTC', () => {
      // 2026-08-01 00:00:00+07:00 is 2026-07-31 17:00:00.000 UTC
      const start = jakartaDateToUtcStart('2026-08-01');
      expect(start.toISOString()).toBe('2026-07-31T17:00:00.000Z');

      // 2026-08-19 23:59:59.999+07:00 inclusive is 2026-08-20 00:00:00+07:00 exclusive -> 2026-08-19 17:00:00.000 UTC
      const endExclusive = jakartaDateToUtcEndExclusive('2026-08-19');
      expect(endExclusive.toISOString()).toBe('2026-08-19T17:00:00.000Z');
    });

    it('should reject when only startDate is provided', () => {
      expect(() =>
        resolveDashboardDateBounds({ startDate: '2026-08-01' } as any),
      ).toThrow(BadRequestException);
    });

    it('should reject when only endDate is provided', () => {
      expect(() =>
        resolveDashboardDateBounds({ endDate: '2026-08-10' } as any),
      ).toThrow(BadRequestException);
    });

    it('should reject when startDate is greater than endDate', () => {
      expect(() =>
        resolveDashboardDateBounds({
          startDate: '2026-08-15',
          endDate: '2026-08-10',
        }),
      ).toThrow(BadRequestException);
    });

    it('should reject impossible dates in resolveDashboardDateBounds', () => {
      expect(() =>
        resolveDashboardDateBounds({
          startDate: '2026-02-30',
          endDate: '2026-02-30',
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('DashboardService.getStats with Date Range Filtering & Scope', () => {
    it('should default to YEAR_TO_DATE preset with Jan 1 to Today Asia/Jakarta bounds when no date range provided', async () => {
      const todayStr = getJakartaTodayString();
      const yearStartStr = getJakartaCurrentYearStartString();
      const result = await service.getStats(mockUser);

      expect(result.success).toBe(true);
      expect(result.data.period.preset).toBe('YEAR_TO_DATE');
      expect(result.data.period.timezone).toBe('Asia/Jakarta');
      expect(result.data.period.startDate).toBe(yearStartStr);
      expect(result.data.period.endDate).toBe(todayStr);
      expect(result.data.summary.totalProcessed).toBe(15);
      expect(result.data.summary.totalPeriod).toBe(15);
      expect(result.data.summary.totalToday).toBe(15);

      // Verify Prisma call for totalPeriod received exact UTC boundaries and authorization scope
      expect(prisma.transaction.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              gte: jakartaDateToUtcStart(yearStartStr),
              lt: jakartaDateToUtcEndExclusive(todayStr),
            }),
            ...mockScope,
          }),
        }),
      );

      // Verify totalActive (Active Inside) query DOES NOT contain createdAt filter
      expect(prisma.transaction.count).toHaveBeenCalledWith({
        where: {
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          ...mockScope,
        },
      });

      // Verify byProcessType active fleet breakdown DOES NOT contain createdAt filter
      expect(prisma.transaction.groupBy).toHaveBeenCalledWith({
        by: ['processType'],
        _count: { id: true },
        where: {
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          ...mockScope,
        },
      });
    });

    it('should apply exact multi-day custom date range and verify exact Prisma query arguments', async () => {
      const result = await service.getStats(mockUser, {
        startDate: '2026-08-01',
        endDate: '2026-08-19',
      });

      expect(result.success).toBe(true);
      expect(result.data.period.preset).toBe('CUSTOM');
      expect(result.data.period.startDate).toBe('2026-08-01');
      expect(result.data.period.endDate).toBe('2026-08-19');

      const expectedGte = new Date('2026-07-31T17:00:00.000Z');
      const expectedLt = new Date('2026-08-19T17:00:00.000Z');

      // Verify transaction.count for totalPeriod
      expect(prisma.transaction.count).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: expectedGte,
            lt: expectedLt,
          },
          ...mockScope,
        },
      });

      // Verify transaction.findMany for completedTx (used for TAT & deviation)
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'COMPLETED',
            createdAt: {
              gte: expectedGte,
              lt: expectedLt,
            },
            ...mockScope,
          },
        }),
      );

      // Verify fraudCheck.findMany retains date filter on transaction relation & scope
      expect(prisma.fraudCheck.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            riskLevel: { in: ['WARNING', 'CRITICAL'] },
            transaction: {
              createdAt: {
                gte: expectedGte,
                lt: expectedLt,
              },
              ...mockScope,
            },
          },
        }),
      );
    });

    it('should reject start date greater than end date', async () => {
      await expect(
        service.getStats(mockUser, {
          startDate: '2026-08-19',
          endDate: '2026-08-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject malformed date input', async () => {
      await expect(
        service.getStats(mockUser, {
          startDate: '2026-08-01',
          endDate: 'invalid-date',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
