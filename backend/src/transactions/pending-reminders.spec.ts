import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';

describe('Pending Transaction Reminders Unit Tests', () => {
  let service: TransactionsService;
  let mockPrisma: any;
  let mockActivityLogs: any;
  let authScopeService: AuthorizationScopeService;

  beforeEach(() => {
    mockPrisma = {
      transaction: {
        findMany: jest.fn(),
      },
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };
    mockActivityLogs = {
      logAction: jest.fn().mockResolvedValue({}),
    };
    authScopeService = new AuthorizationScopeService();
    service = new TransactionsService(
      mockPrisma,
      mockActivityLogs,
      authScopeService,
    );
  });

  it('1. should categorize WEIGHBRIDGE actions as NEED_ACTION for weighbridge user', async () => {
    const mockTxs = [
      {
        id: 'tx-1',
        transactionNumber: 'GMS-20261015-0001',
        plateNumber: 'B 1111 AA',
        dailySequence: 1,
        processType: 'GBB',
        status: 'REGISTERED',
        createdAt: new Date(),
        updatedAt: new Date(),
        statusHistory: [{ changedAt: new Date() }],
      },
      {
        id: 'tx-2',
        transactionNumber: 'GMS-20261015-0002',
        plateNumber: 'B 2222 BB',
        dailySequence: 2,
        processType: 'GBB',
        status: 'QC_VEHICLE_PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
        statusHistory: [{ changedAt: new Date() }],
      },
    ];

    mockPrisma.transaction.findMany.mockResolvedValue(mockTxs);

    const wbUser: JwtPayloadUser = {
      id: 'wb-1',
      email: 'wb@gms.local',
      role: 'WEIGHBRIDGE',
    } as any;

    const res = await service.getPendingReminders(wbUser);

    expect(res.success).toBe(true);
    expect(res.data.reminders.length).toBe(2);

    const tx1 = res.data.reminders.find((r: any) => r.transactionId === 'tx-1');
    expect(tx1.assignedRole).toBe('WEIGHBRIDGE');
    expect(tx1.category).toBe('NEED_ACTION');
    expect(tx1.isMyAction).toBe(true);
    expect(tx1.targetRoute).toBe('/weighbridge');

    const tx2 = res.data.reminders.find((r: any) => r.transactionId === 'tx-2');
    expect(tx2.assignedRole).toBe('QC');
    expect(tx2.category).toBe('WAITING_OTHER_PROCESS');
    expect(tx2.isMyAction).toBe(false);

    expect(res.data.summary.needActionCount).toBe(1);
    expect(res.data.summary.waitingOtherCount).toBe(1);
  });

  it('2. should enforce warehouse access scope for WAREHOUSE users', async () => {
    mockPrisma.transaction.findMany.mockImplementation(({ where }: any) => {
      // Prisma where should include processType: { in: ['GSP'] }
      expect(where.processType).toEqual({ in: ['GSP'] });
      return Promise.resolve([
        {
          id: 'tx-gsp-1',
          transactionNumber: 'GMS-20261015-0003',
          plateNumber: 'L 3333 CC',
          dailySequence: 3,
          processType: 'GSP',
          status: 'WAITING_GSP_DISPOSITION',
          createdAt: new Date(),
          updatedAt: new Date(),
          statusHistory: [{ changedAt: new Date() }],
        },
      ]);
    });

    const gspUser: JwtPayloadUser = {
      id: 'gsp-wh-1',
      email: 'gsp@gms.local',
      role: 'WAREHOUSE',
      warehouseAccess: ['GSP'],
    } as any;

    const res = await service.getPendingReminders(gspUser);

    expect(res.data.reminders.length).toBe(1);
    const item = res.data.reminders[0];
    expect(item.assignedRole).toBe('WAREHOUSE');
    expect(item.category).toBe('NEED_ACTION');
    expect(item.pendingTask).toContain('Disposisi Mutu Chemical');
  });

  it('3. should mark transactions as OVERDUE only when approved SLA is exceeded', async () => {
    const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000);
    const mockTxs = [
      {
        id: 'tx-overdue',
        transactionNumber: 'GMS-20261015-0004',
        plateNumber: 'D 4444 DD',
        dailySequence: 4,
        processType: 'GBJ',
        status: 'QC_VEHICLE_PENDING',
        createdAt: twoHoursAgo,
        updatedAt: twoHoursAgo,
        statusHistory: [{ changedAt: twoHoursAgo }],
      },
    ];

    mockPrisma.transaction.findMany.mockResolvedValue(mockTxs);

    const qcUser: JwtPayloadUser = {
      id: 'qc-1',
      email: 'qc@gms.local',
      role: 'QC',
      warehouseAccess: ['GBJ'],
    } as any;

    const res = await service.getPendingReminders(qcUser);

    expect(res.data.reminders.length).toBe(1);
    const item = res.data.reminders[0];
    expect(item.category).toBe('OVERDUE');
    expect(item.isOverdue).toBe(true);
    expect(item.slaMinutes).toBe(60);
    expect(item.waitingDurationMin).toBeGreaterThanOrEqual(120);
    expect(res.data.summary.overdueCount).toBe(1);
    expect(res.data.summary.needActionCount).toBe(1);
  });

  it('3b. should NOT mark as OVERDUE when no official SLA threshold is configured', async () => {
    // Stage with no official SLA
    const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000);
    const mockTxs = [
      {
        id: 'tx-nosla',
        transactionNumber: 'GMS-20261015-0005',
        plateNumber: 'E 5555 EE',
        dailySequence: 5,
        processType: 'GBB',
        status: 'SOME_UNCONFIGURED_STAGE' as any,
        createdAt: twoHoursAgo,
        updatedAt: twoHoursAgo,
        statusHistory: [{ changedAt: twoHoursAgo }],
      },
    ];

    mockPrisma.transaction.findMany.mockResolvedValue(mockTxs);

    const adminUser: JwtPayloadUser = {
      id: 'adm-1',
      email: 'admin@gms.local',
      role: 'ADMIN',
    } as any;

    const res = await service.getPendingReminders(adminUser);

    expect(res.data.reminders.length).toBe(1);
    const item = res.data.reminders[0];
    // Must remain NEED_ACTION, not OVERDUE based on assumptions!
    expect(item.category).toBe('NEED_ACTION');
    expect(item.isOverdue).toBe(false);
    expect(item.slaMinutes).toBeNull();
    expect(item.waitingDurationMin).toBeGreaterThanOrEqual(120);
    expect(res.data.summary.overdueCount).toBe(0);
    expect(res.data.summary.needActionCount).toBe(1);
  });

  it('3c. should respect environment SLA override via GMS_STAGE_SLA_JSON', async () => {
    process.env.GMS_STAGE_SLA_JSON = JSON.stringify({ REGISTERED: 10 });
    try {
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
      const mockTxs = [
        {
          id: 'tx-custom-sla',
          transactionNumber: 'GMS-20261015-0006',
          plateNumber: 'F 6666 FF',
          dailySequence: 6,
          processType: 'GBB',
          status: 'REGISTERED',
          createdAt: fifteenMinsAgo,
          updatedAt: fifteenMinsAgo,
          statusHistory: [{ changedAt: fifteenMinsAgo }],
        },
      ];

      mockPrisma.transaction.findMany.mockResolvedValue(mockTxs);

      const wbUser: JwtPayloadUser = {
        id: 'wb-1',
        email: 'wb@gms.local',
        role: 'WEIGHBRIDGE',
      } as any;

      const res = await service.getPendingReminders(wbUser);
      const item = res.data.reminders[0];
      expect(item.slaMinutes).toBe(10);
      expect(item.isOverdue).toBe(true);
      expect(item.category).toBe('OVERDUE');
      expect(res.data.summary.overdueCount).toBe(1);
    } finally {
      delete process.env.GMS_STAGE_SLA_JSON;
    }
  });

  it('4. should give ADMIN full operational oversight across all transactions', async () => {
    const mockTxs = [
      {
        id: 'tx-1',
        transactionNumber: 'GMS-01',
        plateNumber: 'A 1',
        dailySequence: 1,
        processType: 'GBB',
        status: 'REGISTERED',
        createdAt: new Date(),
        updatedAt: new Date(),
        statusHistory: [{ changedAt: new Date() }],
      },
      {
        id: 'tx-2',
        transactionNumber: 'GMS-02',
        plateNumber: 'A 2',
        dailySequence: 2,
        processType: 'GSP',
        status: 'WAITING_GSP_CHECKLIST_DISPOSITION',
        createdAt: new Date(),
        updatedAt: new Date(),
        statusHistory: [{ changedAt: new Date() }],
      },
    ];

    mockPrisma.transaction.findMany.mockResolvedValue(mockTxs);

    const adminUser: JwtPayloadUser = {
      id: 'adm-1',
      email: 'admin@gms.local',
      role: 'ADMIN',
    } as any;

    const res = await service.getPendingReminders(adminUser);

    expect(res.data.reminders.length).toBe(2);
    expect(res.data.reminders.every((r: any) => r.isMyAction === true)).toBe(
      true,
    );
    expect(res.data.summary.needActionCount).toBe(2);
  });

  it('5. should enforce per-user snooze isolation (User A snoozes, User B does NOT see it snoozed)', async () => {
    const mockTxs = [
      {
        id: 'tx-snooze-test',
        transactionNumber: 'GMS-SNZ-01',
        plateNumber: 'B 9999 ZZ',
        dailySequence: 99,
        processType: 'GBB',
        status: 'REGISTERED',
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        statusHistory: [{ changedAt: new Date() }],
      },
    ];

    mockPrisma.transaction.findMany.mockResolvedValue(mockTxs);

    const userShiftA: JwtPayloadUser = {
      id: 'operator-shift-a',
      email: 'shiftA@gms.local',
      role: 'ADMIN',
    } as any;

    const userShiftB: JwtPayloadUser = {
      id: 'operator-shift-b',
      email: 'shiftB@gms.local',
      role: 'ADMIN',
    } as any;

    const reminderId = 'tx-snooze-test-REGISTERED-1';

    // Shift A snoozes the reminder
    const snoozeRes = await service.snoozeReminder(
      userShiftA.id,
      reminderId,
      30,
    );
    expect(snoozeRes.success).toBe(true);

    // When Shift A fetches reminders: item is snoozed
    const resA = await service.getPendingReminders(userShiftA);
    const itemA = resA.data.reminders[0];
    expect(itemA.isSnoozed).toBe(true);
    expect(resA.data.summary.unsnoozedNeedActionCount).toBe(0);

    // When Shift B fetches reminders: item is NOT snoozed! Still needs action!
    const resB = await service.getPendingReminders(userShiftB);
    const itemB = resB.data.reminders[0];
    expect(itemB.isSnoozed).toBe(false);
    expect(resB.data.summary.unsnoozedNeedActionCount).toBe(1);
  });

  it('6. should allow unsnooze and track markReminderRead per user', async () => {
    const userId = 'operator-test-user';
    const reminderId = 'rem-test-01';

    await service.snoozeReminder(userId, reminderId, 45);
    const unsnoozeRes = await service.unsnoozeReminder(userId, reminderId);
    expect(unsnoozeRes.success).toBe(true);

    const readRes = await service.markReminderRead(userId, reminderId);
    expect(readRes.success).toBe(true);

    const readAllRes = await service.markAllRemindersRead(userId, [
      reminderId,
      'rem-test-02',
    ]);
    expect(readAllRes.success).toBe(true);
    expect(readAllRes.data.count).toBe(2);
  });
});
