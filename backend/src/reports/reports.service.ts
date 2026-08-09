import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ReportQueryDto } from './dto/report-query.dto';
import { Prisma } from '@prisma/client';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

import { REPORTS_CURRENT_RELATIONS_INCLUDE } from '../prisma/prisma-include.helpers';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
  ) {}

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

    if (processType) {
      where.processType = processType;
    }

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
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    await this.activityLogsService
      .logAction({
        userId: user.id,
        action: 'REPORT_HISTORY_VIEW',
        module: 'REPORTS',

        description: `User viewed transaction history report`,
        status: 'SUCCESS',
      })
      .catch(() => {});

    return {
      success: true,
      message: 'Transaction history retrieved successfully',
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
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
        description: `User initiated streaming CSV export of transaction history`,
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

    const escapeCsv = (val: any) => {
      let str = String(val).replace(/"/g, '""');
      if (str.match(/^[=\-+@]/)) {
        str = "'" + str;
      }
      return `"${str}"`;
    };

    let skip = 0;
    const batchSize = 500;
    while (true) {
      const batch = await this.prisma.transaction.findMany({
        where,
        skip,
        take: batchSize,
        include: { fraudChecks: true },
        orderBy: { createdAt: 'desc' },
      });

      if (batch.length === 0) break;

      for (const t of batch) {
        const fraud =
          t.fraudChecks && t.fraudChecks.length > 0
            ? t.fraudChecks[0].riskLevel
            : 'SAFE';
        const row =
          [
            t.transactionNumber,
            t.plateNumber,
            t.vendorName,
            t.processType,
            t.status,
            t.gateInAt ? t.gateInAt.toISOString() : '',
            t.gateOutAt ? t.gateOutAt.toISOString() : '',
            t.netWeight || 0,
            t.actualWeight || 0,
            fraud,
          ]
            .map(escapeCsv)
            .join(',') + '\n';
        yield row;
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
    for await (const chunk of this.exportCsvStream(query, user)) {
      output += chunk;
    }
    return output.trimEnd();
  }
}
