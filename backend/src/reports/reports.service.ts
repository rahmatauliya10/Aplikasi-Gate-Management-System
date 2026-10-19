import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ReportQueryDto } from './dto/report-query.dto';
import { Prisma } from '@prisma/client';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';
import {
  jakartaDateToUtcEndExclusive,
  jakartaDateToUtcStart,
  parseCalendarDate,
} from '../dashboard/utils/dashboard-date-range.util';
import {
  OperationHistoryBottleneck,
  OperationHistoryExportFormat,
  OperationHistoryIntegrity,
  OperationHistoryQueryDto,
  OperationHistorySort,
  OperationHistoryStatus,
} from './dto/operation-history-query.dto';
import {
  normalizeOperationHistoryTransaction,
  OperationHistoryFraud,
  OperationHistoryDurations,
} from './operation-history.util';
import { REPORTS_CURRENT_RELATIONS_INCLUDE } from '../prisma/prisma-include.helpers';

interface OperationHistoryProjection {
  id: string;
  arrival: Date | null;
  waiting_in: number;
  warehouse: number;
  qc: number;
  waiting_out: number;
  total: number;
  net: number;
  roll: number;
  diff: number;
  deviation_percent: number | null;
  fraud_status: string;
  bottleneck: string;
}

const OPERATION_HISTORY_CURRENT_INCLUDE = {
  ...REPORTS_CURRENT_RELATIONS_INCLUDE,
  warehouseProcesses: {
    where: { isCurrent: true },
    orderBy: [{ revision: 'desc' as const }, { createdAt: 'desc' as const }],
  },
  qcVehicleChecks: {
    where: { isCurrent: true },
    orderBy: [{ revision: 'desc' as const }, { createdAt: 'desc' as const }],
    include: { checkedBy: { select: { id: true, name: true } } },
  },
  incomingMaterialChecks: {
    where: { isCurrent: true },
    orderBy: [{ revision: 'desc' as const }, { createdAt: 'desc' as const }],
    include: { checkedBy: { select: { id: true, name: true } } },
  },
  fraudChecks: {
    orderBy: [
      { calculatedAt: 'desc' as const },
      { createdAt: 'desc' as const },
      { id: 'desc' as const },
    ],
    take: 1,
  },
};

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
    @Optional()
    private authorizationScopeService?: AuthorizationScopeService,
  ) {}

  /** Existing terminal report contract retained for backward compatibility. */
  async getTransactionHistory(query: ReportQueryDto, user: JwtPayloadUser) {
    const {
      page = 1,
      limit = 20,
      processType,
      startDate,
      endDate,
      search,
    } = query;

    this.logger.log(
      `Report history requested by ${user.email} | page=${page} limit=${limit}`,
    );

    const where: Prisma.TransactionWhereInput = {
      status: { in: ['COMPLETED', 'CANCELLED'] },
    };

    if (processType) where.processType = processType;
    if (search) {
      where.OR = [
        { transactionNumber: { contains: search, mode: 'insensitive' } },
        { plateNumber: { contains: search, mode: 'insensitive' } },
        { vendorName: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const skip = (page - 1) * limit;
    const [total, data] = await Promise.all([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        include: REPORTS_CURRENT_RELATIONS_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ]);

    await this.activityLogsService
      .logAction({
        userId: user.id,
        action: 'REPORT_HISTORY_VIEW',
        module: 'REPORTS',
        description: 'User viewed transaction history report',
        status: 'SUCCESS',
      })
      .catch(() => {});

    return {
      success: true,
      message: 'Transaction history retrieved successfully',
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async *exportCsvStream(
    query: ReportQueryDto,
    user: JwtPayloadUser,
  ): AsyncGenerator<string, void, unknown> {
    const { processType, startDate, endDate, search } = query;
    this.logger.log(`Export CSV stream requested by ${user.email}`);

    const where: Prisma.TransactionWhereInput = {
      status: { in: ['COMPLETED', 'CANCELLED'] },
    };
    if (processType) where.processType = processType;
    if (search) {
      where.OR = [
        { transactionNumber: { contains: search, mode: 'insensitive' } },
        { plateNumber: { contains: search, mode: 'insensitive' } },
        { vendorName: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    await this.activityLogsService
      .logAction({
        userId: user.id,
        action: 'REPORT_EXPORT_STREAM',
        module: 'REPORTS',
        description:
          'User initiated streaming CSV export of transaction history',
        status: 'SUCCESS',
      })
      .catch(() => {});

    const headers = [
      'TRX ID',
      'Plate Number',
      'Vendor',
      'Type',
      'Status',
      'Gate In',
      'Gate Out',
      'Net WB',
      'WH Scale',
      'Deviation Status',
    ];
    yield headers.join(',') + '\n';

    let skip = 0;
    const batchSize = 500;
    while (true) {
      const batch = await this.prisma.transaction.findMany({
        where,
        skip,
        take: batchSize,
        include: {
          fraudChecks: {
            orderBy: [
              { calculatedAt: 'desc' },
              { createdAt: 'desc' },
              { id: 'desc' },
            ],
            take: 1,
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      if (batch.length === 0) break;

      for (const t of batch) {
        const fraud = t.fraudChecks?.[0]?.riskLevel || 'PENDING_DATA';
        yield [
          t.transactionNumber,
          t.plateNumber,
          t.vendorName,
          t.processType,
          t.status,
          t.gateInAt?.toISOString() || '',
          t.gateOutAt?.toISOString() || '',
          t.netWeight ?? '',
          t.actualWeight ?? '',
          fraud,
        ]
          .map((value) => this.escapeCsvCell(value))
          .join(',') + '\n';
      }
      if (batch.length < batchSize) break;
      skip += batchSize;
    }
  }

  async exportCsv(
    query: ReportQueryDto,
    user: JwtPayloadUser,
  ): Promise<string> {
    let output = '';
    for await (const chunk of this.exportCsvStream(query, user))
      output += chunk;
    return output.trimEnd();
  }

  async getOperationHistory(
    query: OperationHistoryQueryDto,
    user: JwtPayloadUser,
  ) {
    const normalized = this.normalizeOperationHistoryQuery(query);
    const [projections, summary] = await Promise.all([
      this.getOperationHistoryProjections(normalized, user, true),
      this.getOperationHistorySummary(normalized, user),
    ]);

    const ids = projections.map((projection) => projection.id);
    const data = await this.loadOperationHistoryRows(
      ids,
      normalized.toleranceLimit,
    );

    await this.activityLogsService
      .logAction({
        userId: user.id,
        action: 'OPERATION_HISTORY_VIEW',
        module: 'REPORTS',
        description: 'User viewed scoped operation history',
        status: 'SUCCESS',
      })
      .catch(() => {});

    return {
      success: true,
      message: 'Operation history retrieved successfully',
      data: this.orderRowsByIds(data, ids),
      meta: {
        page: normalized.page,
        limit: normalized.limit,
        total: summary.total,
        totalPages: Math.ceil(summary.total / normalized.limit),
      },
      summary: {
        avgTatMinutes: summary.avgTatMinutes,
        totalTonnageMetric: summary.totalTonnageMetric,
        anomalyCount: summary.anomalyCount,
        majorBottleneck: summary.majorBottleneck,
      },
    };
  }

  async *exportOperationHistoryStream(
    query: OperationHistoryQueryDto & {
      format?: OperationHistoryExportFormat;
    },
    user: JwtPayloadUser,
  ): AsyncGenerator<string, void, unknown> {
    const normalized = this.normalizeOperationHistoryQuery(query);
    const projections = await this.getOperationHistoryProjections(
      normalized,
      user,
      false,
    );
    const ids = projections.map((projection) => projection.id);
    const format = query.format || OperationHistoryExportFormat.CSV;

    await this.activityLogsService
      .logAction({
        userId: user.id,
        action: 'OPERATION_HISTORY_EXPORT',
        module: 'REPORTS',
        description: `User exported scoped operation history as ${format}`,
        status: 'SUCCESS',
      })
      .catch(() => {});

    const headers = [
      'TRX ID',
      'Plate Number',
      'Driver',
      'Vendor',
      'Destination',
      'Status',
      'Gate In',
      'Gate Out',
      'Total TAT (m)',
      'Net Weighbridge (kg)',
      'Warehouse Scale (kg)',
      'Deviation (%)',
      'Verdict',
    ];

    if (format === OperationHistoryExportFormat.XLS) {
      yield this.xlsStart(headers);
    } else {
      yield headers.map((header) => this.escapeCsvCell(header)).join(',') +
        '\n';
    }

    const batchSize = 250;
    for (let offset = 0; offset < ids.length; offset += batchSize) {
      const batchIds = ids.slice(offset, offset + batchSize);
      const rows = this.orderRowsByIds(
        await this.loadOperationHistoryRows(
          batchIds,
          normalized.toleranceLimit,
        ),
        batchIds,
      );
      for (const row of rows) {
        const values = this.operationHistoryExportValues(row);
        if (format === OperationHistoryExportFormat.XLS) {
          yield `<tr>${values.map((value) => `<td>${this.escapeHtml(value)}</td>`).join('')}</tr>\n`;
        } else {
          yield values.map((value) => this.escapeCsvCell(value)).join(',') +
            '\n';
        }
      }
    }

    if (format === OperationHistoryExportFormat.XLS) yield this.xlsEnd();
  }

  private normalizeOperationHistoryQuery(query: OperationHistoryQueryDto) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 10);
    const startDate = query.startDate?.trim() || undefined;
    const endDate = query.endDate?.trim() || undefined;
    if (!!startDate !== !!endDate) {
      throw new BadRequestException(
        'startDate dan endDate harus diberikan bersamaan.',
      );
    }
    if (startDate && !parseCalendarDate(startDate)) {
      throw new BadRequestException(`Invalid startDate: ${startDate}`);
    }
    if (endDate && !parseCalendarDate(endDate)) {
      throw new BadRequestException(`Invalid endDate: ${endDate}`);
    }
    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException('startDate tidak boleh setelah endDate.');
    }

    return {
      ...query,
      page,
      limit,
      startDate,
      endDate,
      status: query.status || OperationHistoryStatus.ALL,
      bottleneck: query.bottleneck || OperationHistoryBottleneck.ALL,
      integrity: query.integrity || OperationHistoryIntegrity.ALL,
      sort: query.sort || OperationHistorySort.GATE_IN_DESC,
      toleranceLimit: 2,
    };
  }

  private operationHistoryConditions(
    query: ReturnType<ReportsService['normalizeOperationHistoryQuery']>,
    user: JwtPayloadUser,
  ): Prisma.Sql[] {
    if (!this.authorizationScopeService) {
      throw new Error('Authorization scope service is unavailable.');
    }
    this.authorizationScopeService.assertScopeNotEmpty(user);
    const conditions: Prisma.Sql[] = [Prisma.sql`1 = 1`];

    if (user.role === 'WAREHOUSE' || user.role === 'QC') {
      const allowed = user.warehouseAccess || [];
      conditions.push(
        Prisma.sql`"processType" IN (${Prisma.join(allowed.map((value) => Prisma.sql`${value}`))})`,
      );
    } else if (user.role !== 'ADMIN' && user.role !== 'SECURITY') {
      conditions.push(Prisma.sql`1 = 0`);
    }

    if (query.processType) {
      conditions.push(Prisma.sql`"processType" = ${query.processType}`);
    }
    if (query.search?.trim()) {
      const search = `%${query.search.trim()}%`;
      conditions.push(Prisma.sql`(
        "transactionNumber" ILIKE ${search} OR
        "plateNumber" ILIKE ${search} OR
        "driverName" ILIKE ${search} OR
        "vendorName" ILIKE ${search}
      )`);
    }
    if (query.status === OperationHistoryStatus.COMPLETED) {
      conditions.push(Prisma.sql`"status" = 'COMPLETED'`);
    } else if (query.status === OperationHistoryStatus.CANCELLED) {
      conditions.push(Prisma.sql`"status" = 'CANCELLED'`);
    } else if (query.status === OperationHistoryStatus.ACTIVE) {
      conditions.push(Prisma.sql`"status" NOT IN ('COMPLETED', 'CANCELLED')`);
    }
    if (query.startDate && query.endDate) {
      const start = jakartaDateToUtcStart(query.startDate);
      const end = jakartaDateToUtcEndExclusive(query.endDate);
      conditions.push(Prisma.sql`arrival >= ${start} AND arrival < ${end}`);
    }
    if (query.bottleneck !== OperationHistoryBottleneck.ALL) {
      conditions.push(Prisma.sql`bottleneck = ${query.bottleneck}`);
      const bottleneckColumn = {
        [OperationHistoryBottleneck.WAITING_IN]: 'waiting_in',
        [OperationHistoryBottleneck.WAREHOUSE]: 'warehouse',
        [OperationHistoryBottleneck.QC]: 'qc',
        [OperationHistoryBottleneck.WAITING_OUT]: 'waiting_out',
      }[query.bottleneck];
      conditions.push(Prisma.sql`${Prisma.raw(`"${bottleneckColumn}"`)} > 15`);
    }
    if (query.integrity !== OperationHistoryIntegrity.ALL) {
      conditions.push(
        Prisma.sql`fraud_status = ${query.integrity === OperationHistoryIntegrity.PENDING_DATA ? 'PENDING' : query.integrity === OperationHistoryIntegrity.INVALID_DATA ? 'ERROR DATA' : query.integrity}`,
      );
    }
    return conditions;
  }

  private operationHistoryCte(
    query: ReturnType<ReportsService['normalizeOperationHistoryQuery']>,
    user: JwtPayloadUser,
  ): Prisma.Sql {
    const conditions = this.operationHistoryConditions(query, user);
    return Prisma.sql`
      WITH latest_fraud AS (
        SELECT * FROM (
          SELECT f.*, ROW_NUMBER() OVER (
            PARTITION BY f."transactionId"
            ORDER BY f."calculatedAt" DESC NULLS LAST, f."createdAt" DESC, f."id" DESC
          ) AS row_number
          FROM "FraudCheck" f
        ) ranked_fraud
        WHERE row_number = 1
      ), current_warehouse AS (
        SELECT * FROM (
          SELECT wp.*, ROW_NUMBER() OVER (
            PARTITION BY wp."transactionId"
            ORDER BY wp."revision" DESC, wp."createdAt" DESC, wp."id" DESC
          ) AS row_number
          FROM "WarehouseProcess" wp
          WHERE wp."isCurrent" = TRUE
        ) ranked_warehouse
        WHERE row_number = 1
      ), current_vehicle AS (
        SELECT * FROM (
          SELECT qc.*, ROW_NUMBER() OVER (
            PARTITION BY qc."transactionId"
            ORDER BY qc."revision" DESC, qc."createdAt" DESC, qc."id" DESC
          ) AS row_number
          FROM "QcVehicleCheck" qc
          WHERE qc."isCurrent" = TRUE
        ) ranked_vehicle
        WHERE row_number = 1
      ), current_incoming AS (
        SELECT * FROM (
          SELECT qc.*, ROW_NUMBER() OVER (
            PARTITION BY qc."transactionId"
            ORDER BY qc."revision" DESC, qc."createdAt" DESC, qc."id" DESC
          ) AS row_number
          FROM "IncomingMaterialCheck" qc
          WHERE qc."isCurrent" = TRUE
        ) ranked_incoming
        WHERE row_number = 1
      ), current_weights AS (
        SELECT
          wr."transactionId",
          MAX(wr."weight") FILTER (WHERE wr."type" = 'IN') AS gross_weight,
          MAX(wr."weight") FILTER (WHERE wr."type" = 'OUT') AS tare_weight
        FROM "WeighbridgeRecord" wr
        WHERE wr."isCurrent" = TRUE
        GROUP BY wr."transactionId"
      ), base AS (
        SELECT
          t.*,
          COALESCE(t."gateInAt", t."createdAt") AS arrival,
          COALESCE(cw.gross_weight, t."grossWeight") AS gross_weight,
          COALESCE(cw.tare_weight, t."tareWeight") AS tare_weight,
          wp."startAt" AS wp_start,
          wp."endAt" AS wp_end,
          vehicle."startedAt" AS vehicle_start,
          vehicle."completedAt" AS vehicle_end,
          incoming."startedAt" AS incoming_start,
          incoming."completedAt" AS incoming_end,
          incoming."moisture" AS incoming_moisture,
          incoming."foreignMatter" AS incoming_foreign_matter,
          incoming."beanCondition" AS incoming_bean_condition,
          COALESCE(fraud."netWeight", t."netWeight", CASE
            WHEN COALESCE(cw.gross_weight, t."grossWeight") > COALESCE(cw.tare_weight, t."tareWeight")
            THEN COALESCE(cw.gross_weight, t."grossWeight") - COALESCE(cw.tare_weight, t."tareWeight")
            ELSE NULL END, 0) AS net,
          COALESCE(fraud."warehouseActualWeight", t."actualWeight", 0) AS roll,
          fraud."id" AS fraud_id,
          fraud."riskLevel"::text AS risk_level,
          vehicle."result" AS vehicle_result,
          incoming."result" AS incoming_result,
          fraud."deviationPercent" AS persisted_deviation
        FROM "Transaction" t
        LEFT JOIN latest_fraud fraud ON fraud."transactionId" = t."id"
        LEFT JOIN current_warehouse wp ON wp."transactionId" = t."id"
        LEFT JOIN current_vehicle vehicle ON vehicle."transactionId" = t."id"
        LEFT JOIN current_incoming incoming ON incoming."transactionId" = t."id"
        LEFT JOIN current_weights cw ON cw."transactionId" = t."id"
      ), metrics AS (
        SELECT
          base.*,
          GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (base."weighInAt" - base.arrival)) / 60)) AS waiting_in,
          GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (base.wp_end - base.wp_start)) / 60)) AS warehouse,
          CASE
            WHEN (base.vehicle_start IS NOT NULL AND base.vehicle_end IS NOT NULL)
              OR (base.incoming_start IS NOT NULL AND base.incoming_end IS NOT NULL)
            THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (base.vehicle_end - base.vehicle_start)) / 60))
              + GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (base.incoming_end - base.incoming_start)) / 60))
            ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (base."qcEndAt" - base."qcStartAt")) / 60))
          END AS qc,
          GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (base."weighOutAt" - COALESCE(base.wp_end, base."warehouseEndAt"))) / 60)) AS waiting_out,
          GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (base."gateOutAt" - base.arrival)) / 60)) AS total
        FROM base
      ), scored AS (
        SELECT
          metrics.*,
          ABS(metrics.roll - metrics.net) AS diff,
          CASE WHEN metrics.net > 0 AND metrics.roll > 0
            THEN COALESCE(metrics.persisted_deviation, ABS(100 - (metrics.roll / metrics.net * 100)))
            ELSE NULL END AS deviation_percent,
          CASE
            WHEN metrics."status" IN ('INCOMING_CHECK_REJECTED', 'QC_VEHICLE_REJECTED')
              OR metrics.vehicle_result = 'REJECT' OR metrics.incoming_result = 'REJECT'
            THEN 'SAFE'
            WHEN metrics.net <= 0 OR metrics.roll <= 0
            THEN CASE metrics.risk_level
              WHEN 'INVALID_DATA' THEN 'ERROR DATA'
              WHEN 'SAFE' THEN 'SAFE'
              WHEN 'WARNING' THEN 'WARNING'
              WHEN 'CRITICAL' THEN 'CRITICAL'
              ELSE 'PENDING' END
            WHEN metrics.risk_level IS NOT NULL
            THEN CASE metrics.risk_level
              WHEN 'INVALID_DATA' THEN 'ERROR DATA'
              WHEN 'PENDING_DATA' THEN 'PENDING'
              ELSE metrics.risk_level END
            WHEN ABS(100 - (metrics.roll / metrics.net * 100)) > ${query.toleranceLimit}
            THEN 'CRITICAL'
            WHEN ABS(100 - (metrics.roll / metrics.net * 100)) > ${query.toleranceLimit / 2}
            THEN 'WARNING'
            ELSE 'SAFE'
          END AS fraud_status,
          CASE
            WHEN metrics.waiting_in >= metrics.warehouse
              AND metrics.waiting_in >= metrics.qc
              AND metrics.waiting_in >= metrics.waiting_out THEN 'waitingIn'
            WHEN metrics.warehouse >= metrics.qc
              AND metrics.warehouse >= metrics.waiting_out THEN 'warehouse'
            WHEN metrics.qc >= metrics.waiting_out THEN 'qc'
            ELSE 'waitingOut'
          END AS bottleneck
        FROM metrics
      ), final AS (
        SELECT * FROM scored
        WHERE ${Prisma.join(conditions, ' AND ')}
      )
    `;
  }

  private historyOrderBy(sort: OperationHistorySort): Prisma.Sql {
    switch (sort) {
      case OperationHistorySort.GATE_IN_ASC:
        return Prisma.sql`arrival ASC NULLS LAST, id ASC`;
      case OperationHistorySort.TAT_DESC:
        return Prisma.sql`total DESC, id DESC`;
      case OperationHistorySort.DEVIATION_DESC:
        return Prisma.sql`deviation_percent DESC NULLS LAST, id DESC`;
      case OperationHistorySort.GATE_IN_DESC:
      default:
        return Prisma.sql`arrival DESC NULLS LAST, id DESC`;
    }
  }

  private async getOperationHistoryProjections(
    query: ReturnType<ReportsService['normalizeOperationHistoryQuery']>,
    user: JwtPayloadUser,
    paginated: boolean,
  ): Promise<OperationHistoryProjection[]> {
    const cte = this.operationHistoryCte(query, user);
    const orderBy = this.historyOrderBy(query.sort);
    const pagination = paginated
      ? Prisma.sql`LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`
      : Prisma.sql``;
    return this.prisma.$queryRaw<OperationHistoryProjection[]>(Prisma.sql`
      ${cte}
      SELECT id, arrival, waiting_in, warehouse, qc, waiting_out, total,
        net, roll, diff, deviation_percent, fraud_status, bottleneck
      FROM final
      ORDER BY ${orderBy}
      ${pagination}
    `);
  }

  private async getOperationHistorySummary(
    query: ReturnType<ReportsService['normalizeOperationHistoryQuery']>,
    user: JwtPayloadUser,
  ) {
    const cte = this.operationHistoryCte(query, user);
    const rows = await this.prisma.$queryRaw<
      Array<{
        total: bigint;
        avg_tat: number | null;
        total_net: number | null;
        anomaly_count: bigint;
        waiting_in_count: bigint;
        warehouse_count: bigint;
        qc_count: bigint;
        waiting_out_count: bigint;
      }>
    >(Prisma.sql`
      ${cte}
      SELECT
        COUNT(*)::bigint AS total,
        AVG(total)::float AS avg_tat,
        COALESCE(SUM(net), 0)::float AS total_net,
        COUNT(*) FILTER (WHERE fraud_status IN ('WARNING', 'CRITICAL'))::bigint AS anomaly_count,
        COUNT(*) FILTER (WHERE bottleneck = 'waitingIn' AND waiting_in > 15)::bigint AS waiting_in_count,
        COUNT(*) FILTER (WHERE bottleneck = 'warehouse' AND warehouse > 15)::bigint AS warehouse_count,
        COUNT(*) FILTER (WHERE bottleneck = 'qc' AND qc > 15)::bigint AS qc_count,
        COUNT(*) FILTER (WHERE bottleneck = 'waitingOut' AND waiting_out > 15)::bigint AS waiting_out_count
      FROM final
    `);
    const summary = rows[0] || ({} as any);
    const bottleneckCounts = {
      waitingIn: Number(summary.waiting_in_count || 0),
      warehouse: Number(summary.warehouse_count || 0),
      qc: Number(summary.qc_count || 0),
      waitingOut: Number(summary.waiting_out_count || 0),
    };
    const majorBottleneck = Object.entries(bottleneckCounts).reduce(
      (best, current) => (current[1] > best[1] ? current : best),
      ['waitingIn', 0] as [string, number],
    )[1]
      ? Object.entries(bottleneckCounts).reduce(
          (best, current) => (current[1] > best[1] ? current : best),
          ['waitingIn', 0] as [string, number],
        )[0]
      : null;
    return {
      total: Number(summary.total || 0),
      avgTatMinutes: Math.round(Number(summary.avg_tat || 0)),
      totalTonnageMetric: Number(summary.total_net || 0) / 1000,
      anomalyCount: Number(summary.anomaly_count || 0),
      majorBottleneck,
    };
  }

  private async loadOperationHistoryRows(
    ids: string[],
    toleranceLimit: number,
  ) {
    if (ids.length === 0) return [];
    const rows = await this.prisma.transaction.findMany({
      where: { id: { in: ids } },
      include: OPERATION_HISTORY_CURRENT_INCLUDE,
    });
    return rows.map((row) =>
      normalizeOperationHistoryTransaction(row, toleranceLimit),
    );
  }

  private orderRowsByIds(rows: any[], ids: string[]) {
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }

  private operationHistoryExportValues(
    row: any,
  ): Array<string | number | null> {
    const fraud = row.fraud as OperationHistoryFraud;
    const durations = row.durations as OperationHistoryDurations;
    return [
      row.transactionNumber,
      row.plateNumber,
      row.driverName,
      row.vendorName,
      row.processType,
      row.status,
      row.timestamps?.gateInAt || row.createdAt || '',
      row.timestamps?.gateOutAt || row.gateOutAt || '',
      durations.total,
      fraud.net,
      fraud.roll,
      fraud.deviationPercent === null ? '' : fraud.deviationPercent.toFixed(2),
      fraud.status,
    ];
  }

  private stringifyExportValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }
    if (value instanceof Date) return value.toISOString();
    return '';
  }

  private escapeCsvCell(value: unknown): string {
    let text = this.stringifyExportValue(value);
    if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  private escapeHtml(value: unknown): string {
    return this.stringifyExportValue(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private xlsStart(headers: string[]): string {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:6px;font-family:sans-serif;font-size:11px}th{background:#4A8BDF;color:#fff}</style></head><body><table><thead><tr>${headers.map((header) => `<th>${this.escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>\n`;
  }

  private xlsEnd(): string {
    return '</tbody></table></body></html>';
  }
}
