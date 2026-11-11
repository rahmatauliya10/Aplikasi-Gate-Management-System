import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';
import {
  GetDashboardStatsDto,
  DashboardDatePreset,
} from './dto/get-dashboard-stats.dto';
import { resolveDashboardDateBounds } from './utils/dashboard-date-range.util';
import { getOperationHistoryDurations } from '../reports/operation-history.util';

const formatFraudAlertDeviation = (fraudCheck: any): string => {
  const persistedPercent = fraudCheck?.deviationPercent;
  if (
    persistedPercent !== null &&
    persistedPercent !== undefined &&
    persistedPercent !== '' &&
    Number.isFinite(Number(persistedPercent))
  ) {
    return Number(persistedPercent).toFixed(2);
  }

  const deviationKg = fraudCheck?.deviationKg;
  const netWeight = fraudCheck?.netWeight ?? fraudCheck?.transaction?.netWeight;
  const actualWeight =
    fraudCheck?.warehouseActualWeight ?? fraudCheck?.transaction?.actualWeight;
  const denominator = [netWeight, actualWeight]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .reduce((max, value) => Math.max(max, value), 0);

  if (
    deviationKg === null ||
    deviationKg === undefined ||
    deviationKg === '' ||
    !Number.isFinite(Number(deviationKg)) ||
    denominator <= 0
  ) {
    return '—';
  }

  return ((Math.abs(Number(deviationKg)) / denominator) * 100).toFixed(2);
};

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
    private authorizationScopeService: AuthorizationScopeService,
  ) {}

  async getStats(user: JwtPayloadUser, query?: GetDashboardStatsDto) {
    const { preset, startDate, endDate, timezone, formattedLabel, dateFilter } =
      resolveDashboardDateBounds(query);

    this.logger.log(
      `Dashboard stats requested by ${user.email} (preset: ${preset}, start: ${startDate || '-'}, end: ${endDate || '-'})`,
    );

    const scope = this.authorizationScopeService.getTransactionScope(user);

    const [
      totalActive,
      totalCompleted,
      totalCancelled,
      totalPeriod,
      byStatus,
      byProcessType,
      recentTransactions,
      completedTx,
      fraudChecks,
    ] = await Promise.all([
      this.prisma.transaction.count({
        where: {
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          ...scope,
        },
      }),
      this.prisma.transaction.count({
        where: { status: 'COMPLETED', ...dateFilter, ...scope },
      }),
      this.prisma.transaction.count({
        where: { status: 'CANCELLED', ...dateFilter, ...scope },
      }),
      this.prisma.transaction.count({
        where: { ...dateFilter, ...scope },
      }),
      this.prisma.transaction.groupBy({
        by: ['status'],
        _count: { id: true },
        where: { ...dateFilter, ...scope },
      }),
      this.prisma.transaction.groupBy({
        by: ['processType'],
        _count: { id: true },
        where: {
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
          ...scope,
        },
      }),
      this.prisma.transaction.findMany({
        where: { ...dateFilter, ...scope },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          transactionNumber: true,
          plateNumber: true,
          vendorName: true,
          processType: true,
          status: true,
          gateInAt: true,
          createdAt: true,
        },
      }),
      this.prisma.transaction.findMany({
        where: {
          status: 'COMPLETED',
          ...dateFilter,
          ...scope,
        },
        select: {
          id: true,
          processType: true,
          gateInAt: true,
          weighInAt: true,
          warehouseStartAt: true,
          warehouseEndAt: true,
          createdAt: true,
          qcStartAt: true,
          qcEndAt: true,
          weighOutAt: true,
          gateOutAt: true,
          netWeight: true,
          actualWeight: true,
          warehouseProcesses: {
            where: { isCurrent: true },
            select: {
              id: true,
              isCurrent: true,
              revision: true,
              createdAt: true,
              startAt: true,
              endAt: true,
            },
          },
          qcVehicleChecks: {
            where: { isCurrent: true },
            select: {
              id: true,
              isCurrent: true,
              revision: true,
              createdAt: true,
              startedAt: true,
              completedAt: true,
            },
          },
          incomingMaterialChecks: {
            where: { isCurrent: true },
            select: {
              id: true,
              isCurrent: true,
              revision: true,
              createdAt: true,
              startedAt: true,
              completedAt: true,
            },
          },
        },
      }),
      this.prisma.fraudCheck.findMany({
        where: {
          transaction: {
            ...dateFilter,
            ...scope,
          },
        },
        include: {
          transaction: {
            select: {
              id: true,
              plateNumber: true,
              processType: true,
              netWeight: true,
              actualWeight: true,
            },
          },
        },
        orderBy: [
          { calculatedAt: 'desc' },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
      }),
    ]);

    // Use the same duration contract as operation-history reports. Missing or
    // invalid stage evidence remains null and is excluded from that stage's
    // denominator; a genuine zero-minute interval remains a valid zero.
    const stageNames = ['waitingIn', 'warehouse', 'qc', 'waitingOut'] as const;
    const stageValues: Record<(typeof stageNames)[number], number[]> = {
      waitingIn: [],
      warehouse: [],
      qc: [],
      waitingOut: [],
    };
    const totalValues: number[] = [];
    completedTx.forEach((transaction) => {
      const durations = getOperationHistoryDurations(transaction);
      for (const stage of stageNames) {
        const value = durations[stage];
        if (typeof value === 'number') stageValues[stage].push(value);
      }
      if (typeof durations.total === 'number')
        totalValues.push(durations.total);
    });
    const average = (values: number[]) =>
      values.length > 0
        ? Math.round(
            values.reduce((sum, value) => sum + value, 0) / values.length,
          )
        : null;
    const avgStageTimes = {
      waitingIn: average(stageValues.waitingIn),
      warehouse: average(stageValues.warehouse),
      qc: average(stageValues.qc),
      waitingOut: average(stageValues.waitingOut),
    };
    const avgTotalTAT = average(totalValues);

    // Calculate Fraud Stats
    const fraudStats = {
      GBB: { totalNet: 0, totalProcessed: 0, avgDiscrepancy: 0 },
      GBJ: { totalNet: 0, totalProcessed: 0, avgDiscrepancy: 0 },
      GSP: { totalNet: 0, totalProcessed: 0, avgDiscrepancy: 0 },
    };
    completedTx.forEach((t) => {
      if (t.netWeight && t.actualWeight && fraudStats[t.processType]) {
        fraudStats[t.processType].totalNet += t.netWeight;
        fraudStats[t.processType].totalProcessed += t.actualWeight;
      }
    });

    ['GBB', 'GBJ', 'GSP'].forEach((type) => {
      const stats = (fraudStats as any)[type];
      if (stats.totalNet > 0) {
        const ratio = (stats.totalProcessed / stats.totalNet) * 100;
        stats.avgDiscrepancy = Math.abs(100 - ratio);
      }
    });

    // Deduplicate active fraud alerts per transaction (keep only the latest check per transaction/plate)
    const seenTx = new Set<string>();
    const activeFraudAlerts: any[] = [];

    for (const f of fraudChecks) {
      const txKey =
        f.transactionId || f.transaction?.id || f.transaction?.plateNumber;
      // The query is ordered latest-first, but severity is applied only after
      // choosing the latest record for each transaction. An older CRITICAL must
      // not survive when a newer persisted result is SAFE.
      if (txKey && !seenTx.has(txKey)) {
        seenTx.add(txKey);
        if (!['WARNING', 'CRITICAL'].includes(String(f.riskLevel))) continue;
        activeFraudAlerts.push({
          id: f.id,
          plate: f.transaction?.plateNumber || '-',
          type: f.transaction?.processType || '-',
          net: f.transaction?.netWeight || 0,
          processed: f.transaction?.actualWeight || 0,
          diffPercent: formatFraudAlertDeviation(f),
          riskLevel: f.riskLevel,
        });
      }
    }

    await this.activityLogsService
      .logAction({
        userId: user.id,
        action: 'DASHBOARD_VIEW',
        module: 'DASHBOARD',
        description: `User viewed dashboard statistics (${preset})`,
        status: 'SUCCESS',
      })
      .catch(() => {});

    return {
      success: true,
      message: 'Dashboard statistics retrieved successfully',
      data: {
        period: {
          startDate,
          endDate,
          timezone,
          preset,
          formattedLabel,
        },
        summary: {
          totalProcessed: totalPeriod,
          totalPeriod, // Backward compatibility alias
          totalToday: totalPeriod, // Backward compatibility alias
          totalActive,
          totalCompleted,
          totalCancelled,
        },
        byStatus: byStatus.map((s) => ({
          status: s.status,
          count: s._count.id,
        })),
        byProcessType: byProcessType.map((p) => ({
          processType: p.processType,
          count: p._count.id,
        })),
        recentTransactions,
        avgStageTimes,
        avgTotalTAT,
        fraudStats,
        activeFraudAlerts,
      },
    };
  }
}
