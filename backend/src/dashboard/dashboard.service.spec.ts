import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

describe('DashboardService KPI evidence selection', () => {
  let service: DashboardService;
  let prisma: any;
  let transactionFindMany: jest.Mock;
  let fraudCheckFindMany: jest.Mock;

  const user = {
    id: 'user-1',
    name: 'Admin',
    email: 'admin@gms.local',
    role: 'ADMIN',
  } as JwtPayloadUser;

  beforeEach(async () => {
    transactionFindMany = jest.fn();
    fraudCheckFindMany = jest.fn().mockResolvedValue([]);
    prisma = {
      transaction: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: transactionFindMany,
      },
      fraudCheck: {
        findMany: fraudCheckFindMany,
      },
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
          useValue: { getTransactionScope: jest.fn().mockReturnValue({}) },
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  const getStats = () =>
    service.getStats(user, {
      startDate: '2026-08-01',
      endDate: '2026-08-01',
    });

  it('uses current QC child evidence and excludes null stage values from averages', async () => {
    transactionFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'tx-complete',
        processType: 'GBB',
        createdAt: new Date('2026-08-01T00:00:00Z'),
        gateInAt: '2026-08-01T00:00:00Z',
        weighInAt: '2026-08-01T00:10:00Z',
        warehouseStartAt: '2026-08-01T00:10:00Z',
        warehouseEndAt: '2026-08-01T00:20:00Z',
        qcStartAt: '2026-08-01T00:20:00Z',
        qcEndAt: '2026-08-01T00:21:00Z',
        weighOutAt: '2026-08-01T00:30:00Z',
        gateOutAt: '2026-08-01T00:40:00Z',
        qcVehicleChecks: [
          {
            id: 'qc-vehicle-current',
            isCurrent: true,
            revision: 2,
            createdAt: new Date('2026-08-01T00:02:00Z'),
            startedAt: '2026-08-01T01:00:00Z',
            completedAt: '2026-08-01T01:10:00Z',
          },
        ],
        incomingMaterialChecks: [
          {
            id: 'qc-incoming-current',
            isCurrent: true,
            revision: 1,
            createdAt: new Date('2026-08-01T00:03:00Z'),
            startedAt: '2026-08-01T02:00:00Z',
            completedAt: '2026-08-01T02:20:00Z',
          },
        ],
      },
      {
        id: 'tx-partial',
        processType: 'GBB',
        createdAt: new Date('2026-08-01T00:00:00Z'),
        gateInAt: '2026-08-01T00:00:00Z',
        weighInAt: '2026-08-01T00:10:00Z',
        qcVehicleChecks: [],
        incomingMaterialChecks: [],
      },
    ]);

    const result = await getStats();

    expect(result.data.avgStageTimes.qc).toBe(30);
    expect(result.data.avgStageTimes.warehouse).toBe(10);
    expect(result.data.avgTotalTAT).toBe(40);

    const completedQuery = transactionFindMany.mock.calls[1][0];
    expect(completedQuery.select.qcVehicleChecks).toEqual({
      where: { isCurrent: true },
      select: expect.objectContaining({
        startedAt: true,
        completedAt: true,
      }),
    });
    expect(completedQuery.select.incomingMaterialChecks).toEqual({
      where: { isCurrent: true },
      select: expect.objectContaining({
        startedAt: true,
        completedAt: true,
      }),
    });
  });

  it('selects the latest FraudCheck before filtering active severity', async () => {
    transactionFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    fraudCheckFindMany.mockResolvedValue([
      {
        id: 'fraud-new-safe',
        transactionId: 'tx-1',
        riskLevel: 'SAFE',
        calculatedAt: new Date('2026-08-01T02:00:00Z'),
        createdAt: new Date('2026-08-01T02:00:00Z'),
        transaction: {
          id: 'tx-1',
          plateNumber: 'B 1234 XX',
          processType: 'GBB',
          netWeight: 100,
          actualWeight: 100,
        },
      },
      {
        id: 'fraud-old-warning',
        transactionId: 'tx-1',
        riskLevel: 'WARNING',
        calculatedAt: new Date('2026-08-01T01:00:00Z'),
        createdAt: new Date('2026-08-01T01:00:00Z'),
        transaction: {
          id: 'tx-1',
          plateNumber: 'B 1234 XX',
          processType: 'GBB',
          netWeight: 100,
          actualWeight: 97,
        },
      },
    ]);

    const result = await getStats();

    expect(result.data.activeFraudAlerts).toEqual([]);
    expect(fraudCheckFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          transaction: expect.any(Object),
        },
        orderBy: [
          { calculatedAt: 'desc' },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
      }),
    );
  });

  it('does not fabricate a percentage when fraud weights cannot provide a denominator', async () => {
    transactionFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    fraudCheckFindMany.mockResolvedValue([
      {
        id: 'fraud-no-weight',
        transactionId: 'tx-2',
        riskLevel: 'WARNING',
        deviationKg: 25,
        deviationPercent: null,
        calculatedAt: new Date('2026-08-01T01:00:00Z'),
        transaction: {
          id: 'tx-2',
          plateNumber: 'B 5678 YY',
          processType: 'GBB',
          netWeight: null,
          actualWeight: null,
        },
      },
    ]);

    const result = await getStats();

    expect(result.data.activeFraudAlerts[0].diffPercent).toBe('—');
    expect(result.data.activeFraudAlerts[0].diffPercent).not.toMatch(
      /NaN|Infinity|2500/,
    );
  });
});
