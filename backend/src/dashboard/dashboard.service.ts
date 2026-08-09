import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

import { AuthorizationScopeService } from '../auth/authorization-scope.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
    private authorizationScopeService: AuthorizationScopeService,
  ) {}

  async getStats(user: JwtPayloadUser) {
    this.logger.log(`Dashboard stats requested by ${user.email}`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const scope = this.authorizationScopeService.getTransactionScope(user);

    const [
      totalActive,
      totalCompleted,
      totalCancelled,
      totalToday,
      byStatus,
      byProcessType,
      recentTransactions,
      completedTx,
      fraudChecks,
    ] = await Promise.all([
      this.prisma.transaction.count({
        where: { status: { notIn: ['COMPLETED', 'CANCELLED'] }, ...scope },
      }),
      this.prisma.transaction.count({
        where: { status: 'COMPLETED', ...scope },
      }),
      this.prisma.transaction.count({
        where: { status: 'CANCELLED', ...scope },
      }),
      this.prisma.transaction.count({
        where: { createdAt: { gte: today, lt: tomorrow }, ...scope },
      }),
      this.prisma.transaction.groupBy({
        by: ['status'],
        _count: { id: true },
        where: scope,
      }),
      this.prisma.transaction.groupBy({
        by: ['processType'],
        _count: { id: true },
        where: { status: { notIn: ['COMPLETED', 'CANCELLED'] }, ...scope },
      }),
      this.prisma.transaction.findMany({
        where: { createdAt: { gte: today, lt: tomorrow }, ...scope },
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
          // 90-day rolling window to prevent unbounded query as data grows
          createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
          ...scope,
        },
        select: {
          id: true,
          processType: true,
          gateInAt: true,
          weighInAt: true,
          warehouseStartAt: true,
          warehouseEndAt: true,
          qcStartAt: true,
          qcEndAt: true,
          weighOutAt: true,
          gateOutAt: true,
          netWeight: true,
          actualWeight: true,
        },
      }),
      this.prisma.fraudCheck.findMany({
        where: {
          riskLevel: { in: ['WARNING', 'CRITICAL'] as any },
          transaction: { ...scope },
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
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Calculate Average Stage Times (SLA)
    let sumWaitingIn = 0,
      sumWarehouse = 0,
      sumQc = 0,
      sumWaitingOut = 0,
      sumTotalTat = 0;
    const getDiffMins = (start: any, end: any) =>
      start && end
        ? Math.round(
            (new Date(end).getTime() - new Date(start).getTime()) / 60000,
          )
        : 0;

    completedTx.forEach((t) => {
      sumWaitingIn += getDiffMins(t.gateInAt, t.weighInAt);
      sumWarehouse += getDiffMins(t.warehouseStartAt, t.warehouseEndAt);
      sumQc += getDiffMins(t.qcStartAt, t.qcEndAt); // This might be null if no QC, use fallback if needed
      sumWaitingOut += getDiffMins(t.warehouseEndAt, t.weighOutAt);
      sumTotalTat += getDiffMins(t.gateInAt, t.gateOutAt);
    });

    const completedCount = completedTx.length || 1;
    const avgStageTimes = {
      waitingIn: Math.round(sumWaitingIn / completedCount),
      warehouse: Math.round(sumWarehouse / completedCount),
      qc: Math.round(sumQc / completedCount),
      waitingOut: Math.round(sumWaitingOut / completedCount),
    };
    const avgTotalTAT = Math.round(sumTotalTat / completedCount);

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
      if (txKey && !seenTx.has(txKey)) {
        seenTx.add(txKey);
        activeFraudAlerts.push({
          id: f.id,
          plate: f.transaction?.plateNumber || '-',
          type: f.transaction?.processType || '-',
          net: f.transaction?.netWeight || 0,
          processed: f.transaction?.actualWeight || 0,
          diffPercent: f.deviationPercent
            ? f.deviationPercent.toFixed(2)
            : f.deviationKg
              ? (
                  (f.deviationKg /
                    Math.max(
                      f.transaction?.netWeight || 1,
                      f.transaction?.actualWeight || 1,
                    )) *
                  100
                ).toFixed(2)
              : '0.00',
          riskLevel: f.riskLevel,
        });
      }
    }

    await this.activityLogsService
      .logAction({
        userId: user.id,
        action: 'DASHBOARD_VIEW',
        module: 'DASHBOARD',
        description: 'User viewed dashboard statistics',
        status: 'SUCCESS',
      })
      .catch(() => {});

    return {
      success: true,
      message: 'Dashboard statistics retrieved successfully',
      data: {
        summary: {
          totalActive,
          totalCompleted,
          totalCancelled,
          totalToday,
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
