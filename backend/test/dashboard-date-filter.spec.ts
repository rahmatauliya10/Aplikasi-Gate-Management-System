import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from '../src/dashboard/dashboard.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ActivityLogsService } from '../src/activity-logs/activity-logs.service';
import { AuthorizationScopeService } from '../src/auth/authorization-scope.service';
import { DashboardDatePreset } from '../src/dashboard/dto/get-dashboard-stats.dto';

describe('DashboardService Date Range Filter', () => {
  let service: DashboardService;
  let prisma: any;

  const mockUser: any = {
    id: 'usr-1',
    email: 'admin@gms.local',
    role: 'SUPER_ADMIN',
  };

  beforeEach(async () => {
    prisma = {
      transaction: {
        count: jest.fn().mockResolvedValue(10),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'tx-1',
            processType: 'GBB',
            gateInAt: new Date('2026-08-19T08:00:00Z'),
            weighInAt: new Date('2026-08-19T08:15:00Z'),
            warehouseStartAt: new Date('2026-08-19T08:20:00Z'),
            warehouseEndAt: new Date('2026-08-19T09:00:00Z'),
            qcStartAt: new Date('2026-08-19T09:05:00Z'),
            qcEndAt: new Date('2026-08-19T09:20:00Z'),
            weighOutAt: new Date('2026-08-19T09:30:00Z'),
            gateOutAt: new Date('2026-08-19T09:35:00Z'),
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

  it('should default to TODAY preset with Asia/Jakarta date bounds and period metadata', async () => {
    const result = await service.getStats(mockUser);
    expect(result.success).toBe(true);
    expect(result.data.period).toBeDefined();
    expect(result.data.period.preset).toBe('TODAY');
    expect(result.data.period.timezone).toBe('Asia/Jakarta');
    expect(result.data.period.startDate).toBeDefined();
    expect(result.data.period.endDate).toBeDefined();
    expect(prisma.transaction.count).toHaveBeenCalled();
  });

  it('should handle custom date range with inclusive endDate', async () => {
    const result = await service.getStats(mockUser, {
      startDate: '2026-08-01',
      endDate: '2026-08-19',
      preset: DashboardDatePreset.CUSTOM,
    });
    expect(result.success).toBe(true);
    expect(result.data.period.startDate).toBe('2026-08-01');
    expect(result.data.period.endDate).toBe('2026-08-19');
    expect(result.data.period.preset).toBe('CUSTOM');
  });

  it('should handle THIS_WEEK and THIS_MONTH presets', async () => {
    const weekResult = await service.getStats(mockUser, {
      preset: DashboardDatePreset.THIS_WEEK,
    });
    expect(weekResult.success).toBe(true);
    expect(weekResult.data.period.preset).toBe('THIS_WEEK');

    const monthResult = await service.getStats(mockUser, {
      preset: DashboardDatePreset.THIS_MONTH,
    });
    expect(monthResult.success).toBe(true);
    expect(monthResult.data.period.preset).toBe('THIS_MONTH');
  });

  it('should handle ALL preset without date restriction', async () => {
    const result = await service.getStats(mockUser, {
      preset: DashboardDatePreset.ALL,
    });
    expect(result.success).toBe(true);
    expect(result.data.period.preset).toBe('ALL');
    expect(result.data.period.startDate).toBeNull();
    expect(result.data.period.endDate).toBeNull();
  });
});
