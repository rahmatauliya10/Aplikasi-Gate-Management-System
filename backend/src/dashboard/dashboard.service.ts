import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private prisma: PrismaService, private activityLogsService: ActivityLogsService) {}

  async getStats(user: JwtPayloadUser) {
    this.logger.log(`Dashboard stats requested by ${user.email}`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [totalActive, totalCompleted, totalCancelled, totalToday, byStatus, byProcessType, recentTransactions, completedTx, fraudChecks] = await Promise.all([
      this.prisma.transaction.count({ where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
      this.prisma.transaction.count({ where: { status: 'COMPLETED' } }),
      this.prisma.transaction.count({ where: { status: 'CANCELLED' } }),
      this.prisma.transaction.count({ where: { createdAt: { gte: today, lt: tomorrow } } }),
      this.prisma.transaction.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.transaction.groupBy({ by: ['processType'], _count: { id: true }, where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
      this.prisma.transaction.findMany({
        where: { createdAt: { gte: today, lt: tomorrow } },
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
        where: { status: 'COMPLETED' },
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
        }
      }),
      this.prisma.fraudCheck.findMany({
        where: { riskLevel: { in: ['WARNING', 'CRITICAL'] as any } },
        include: { transaction: { select: { plateNumber: true, processType: true, netWeight: true, actualWeight: true } } },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    // Calculate Average Stage Times (SLA)
    let sumWaitingIn = 0, sumWarehouse = 0, sumQc = 0, sumWaitingOut = 0, sumTotalTat = 0;
    const getDiffMins = (start: any, end: any) => (start && end) ? Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000) : 0;
    
    completedTx.forEach(t => {
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
      waitingOut: Math.round(sumWaitingOut / completedCount)
    };
    const avgTotalTAT = Math.round(sumTotalTat / completedCount);

    // Calculate Fraud Stats
    let fraudStats = { GBB: { totalNet: 0, totalProcessed: 0, avgDiscrepancy: 0 }, GBJ: { totalNet: 0, totalProcessed: 0, avgDiscrepancy: 0 }, GSP: { totalNet: 0, totalProcessed: 0, avgDiscrepancy: 0 } };
    completedTx.forEach(t => {
      if (t.netWeight && t.actualWeight && fraudStats[t.processType]) {
        fraudStats[t.processType].totalNet += t.netWeight;
        fraudStats[t.processType].totalProcessed += t.actualWeight;
      }
    });

    ['GBB', 'GBJ', 'GSP'].forEach(type => {
      const stats = (fraudStats as any)[type];
      if (stats.totalNet > 0) {
        const ratio = (stats.totalProcessed / stats.totalNet) * 100;
        stats.avgDiscrepancy = Math.abs(100 - ratio);
      }
    });

    const activeFraudAlerts = fraudChecks.map((f: any) => ({
      id: f.id,
      plate: f.transaction.plateNumber,
      type: f.transaction.processType,
      net: f.transaction.netWeight,
      processed: f.transaction.actualWeight,
      diffPercent: f.deviationPercent ? f.deviationPercent.toFixed(2) : (f.deviationKg ? ((f.deviationKg / Math.max(f.transaction.netWeight || 1, f.transaction.actualWeight || 1)) * 100).toFixed(2) : '0.00'),
      riskLevel: f.riskLevel
    }));

    await this.activityLogsService.logAction({
        userId: user.id,
        action: 'DASHBOARD_VIEW',
        module: 'DASHBOARD',
        description: 'User viewed dashboard statistics',
        status: 'SUCCESS'
      }).catch(() => {});

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
        byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.id })),
        byProcessType: byProcessType.map((p) => ({ processType: p.processType, count: p._count.id })),
        recentTransactions,
        avgStageTimes,
        avgTotalTAT,
        fraudStats,
        activeFraudAlerts
      },
    };
  }
}
