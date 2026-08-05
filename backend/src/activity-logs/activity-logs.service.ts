import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogQueryDto } from './dto/activity-log-query.dto';
import { Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

export interface CreateActivityLogDto {
  userId?: string;
  userName?: string;
  role?: string;
  action: string;
  module: string;
  description?: any;
  referenceId?: string;
  status: 'SUCCESS' | 'FAILED' | 'WARNING';
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class ActivityLogsService {
  private readonly logger = new Logger(ActivityLogsService.name);
  private readonly fallbackLogPath = path.resolve(
    process.cwd(),
    'logs',
    'audit-fallback.jsonl',
  );

  constructor(private prisma: PrismaService) {
    this.ensureFallbackDirectory();
  }

  private ensureFallbackDirectory() {
    try {
      const dir = path.dirname(this.fallbackLogPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (err) {
      this.logger.error(
        `Unable to create audit log fallback directory: ${err.message}`,
      );
    }
  }

  private writeFallbackLog(logData: any, dbError: string) {
    try {
      const payload = {
        timestamp: new Date().toISOString(),
        fallbackReason: dbError,
        data: logData,
      };
      fs.appendFileSync(this.fallbackLogPath, JSON.stringify(payload) + '\n', {
        mode: 0o600,
      });
      this.logger.warn(
        `Audit log securely buffered to durable file sink: ${this.fallbackLogPath}`,
      );
    } catch (fileErr) {
      this.logger.error(
        `CRITICAL AUDIT LOSS: Failed DB write and failed fallback sink write: ${fileErr.message}`,
        fileErr.stack,
      );
    }
  }

  async logAction(
    data: CreateActivityLogDto,
    prismaTx?: Prisma.TransactionClient,
  ) {
    let logData: any = { ...data };
    try {
      let desc = data.description;
      if (typeof desc === 'object') {
        desc = JSON.stringify(desc);
      }

      let userName = data.userName;
      let role = data.role;

      const client = prismaTx || this.prisma;

      if (data.userId && (!userName || !role)) {
        const user = await client.user.findFirst({
          where: { id: data.userId },
        });
        if (user) {
          userName = userName || user.name;
          role = role || user.role;
        }
      }

      logData = {
        ...data,
        description: desc,
        userName,
        role,
      };

      await client.activityLog.create({
        data: logData,
      });
    } catch (error: any) {
      if (prismaTx) {
        throw error;
      }
      this.logger.error(
        `Failed to save activity log to database: ${error.message}. Routing to durable append-only fallback sink.`,
        error.stack,
      );
      this.writeFallbackLog(logData, error.message || 'Unknown database error');
    }
  }

  async findAll(query: ActivityLogQueryDto) {
    const {
      page = 1,
      limit = 50,
      module,
      action,
      status,
      userId,
      startDate,
      endDate,
      search,
    } = query;

    this.logger.log(`Activity logs requested | page=${page} limit=${limit}`);

    const where: Prisma.ActivityLogWhereInput = {};

    if (module) where.module = module;
    if (action) where.action = action;
    if (status) where.status = status;
    if (userId) where.userId = userId;

    if (search) {
      where.OR = [
        { userName: { contains: search, mode: 'insensitive' } },
        { action: { contains: search, mode: 'insensitive' } },
        { module: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.prisma.activityLog.count({ where }),
      this.prisma.activityLog.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      success: true,
      message: 'Activity logs retrieved successfully',
      data,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
