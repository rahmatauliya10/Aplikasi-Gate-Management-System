import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { Prisma } from '@prisma/client';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';
import { TRANSACTION_CURRENT_RELATIONS_INCLUDE } from '../prisma/prisma-include.helpers';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
    private authorizationScopeService: AuthorizationScopeService,
  ) {}

  async findAll(query: TransactionQueryDto, user: JwtPayloadUser) {
    const { page = 1, limit = 10, status, processType, search } = query;

    this.logger.log(
      `Find all transactions by user ${user.email} | page=${page} limit=${limit}`,
    );

    const scope = this.authorizationScopeService.getTransactionScope(user);

    const where: Prisma.TransactionWhereInput = {
      AND: [scope],
    };

    if (status) {
      (where.AND as any[]).push({ status });
    }

    if (processType) {
      (where.AND as any[]).push({ processType });
    }

    if (search) {
      (where.AND as any[]).push({
        OR: [
          { transactionNumber: { contains: search, mode: 'insensitive' } },
          { plateNumber: { contains: search, mode: 'insensitive' } },
          { vendorName: { contains: search, mode: 'insensitive' } },
          { driverName: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    try {
      const parsedPage = Number(page) || 1;
      const parsedLimit = Number(limit) || 10;
      const skip = (parsedPage - 1) * parsedLimit;

      const [total, data] = await Promise.all([
        this.prisma.transaction.count({ where }),
        this.prisma.transaction.findMany({
          where,
          skip,
          take: parsedLimit,
          include: TRANSACTION_CURRENT_RELATIONS_INCLUDE,
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      await this.activityLogsService
        .logAction({
          userId: user.id,
          action: 'TRANSACTIONS_LIST_VIEW',
          module: 'TRANSACTIONS',
          description: 'User viewed transaction list',
          status: 'SUCCESS',
        })
        .catch(() => {});

      return {
        success: true,
        message: 'Transactions retrieved successfully',
        data,
        meta: {
          page: parsedPage,
          limit: parsedLimit,
          total,
          totalPages: Math.ceil(total / parsedLimit),
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Error retrieving transactions list: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Gagal mengambil data transaksi.');
    }
  }

  async findActive(user: JwtPayloadUser) {
    this.logger.log(`Find active transactions by user ${user.email}`);

    try {
      const scope = this.authorizationScopeService.getTransactionScope(user);
      const data = await this.prisma.transaction.findMany({
        where: { status: { notIn: ['COMPLETED', 'CANCELLED'] }, ...scope },
        include: TRANSACTION_CURRENT_RELATIONS_INCLUDE,
        orderBy: { createdAt: 'desc' },
      });

      await this.activityLogsService
        .logAction({
          userId: user.id,
          action: 'TRANSACTIONS_ACTIVE_VIEW',
          module: 'TRANSACTIONS',
          description: 'User viewed active transactions list',
          status: 'SUCCESS',
        })
        .catch(() => {});

      return {
        success: true,
        message: 'Active transactions retrieved successfully',
        data,
      };
    } catch (error: any) {
      this.logger.error(
        `Error retrieving active transactions: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'Gagal mengambil data transaksi aktif.',
      );
    }
  }

  async findOne(id: string, user: JwtPayloadUser) {
    this.logger.log(
      `Find transaction details for ID: ${id} by user ${user.email}`,
    );

    const scope = this.authorizationScopeService.getTransactionScope(user);
    const tx = await this.prisma.transaction.findFirst({
      where: { id, ...scope },
      include: {
        ...TRANSACTION_CURRENT_RELATIONS_INCLUDE,
        fraudChecks: true,
      },
    });

    if (!tx) {
      throw new NotFoundException({
        success: false,
        message: 'Transaction not found',
        errors: [],
      });
    }

    await this.activityLogsService.logAction({
      userId: user.id,
      action: 'TRANSACTION_DETAIL_VIEW',
      module: 'TRANSACTIONS',

      referenceId: id,
      description: `User viewed transaction details for ${tx.transactionNumber}`,
      status: 'SUCCESS',
    });

    return {
      success: true,
      message: 'Transaction details retrieved successfully',
      data: tx,
    };
  }

  async cancel(id: string, reason: string, user: JwtPayloadUser) {
    this.logger.warn(
      `Transaction cancellation request for ID: ${id} by user ${user.email}`,
    );

    const tx = await this.prisma.transaction.findUnique({ where: { id } });

    if (!tx) {
      throw new NotFoundException({
        success: false,
        message: 'Transaction not found',
        errors: [],
      });
    }

    if (tx.status === 'CANCELLED') {
      throw new BadRequestException({
        success: false,
        message: 'Transaction is already cancelled',
        errors: [],
      });
    }

    if (tx.status === 'COMPLETED') {
      throw new BadRequestException({
        success: false,
        message: 'Cannot cancel a completed transaction',
        errors: [],
      });
    }

    const updated = await this.prisma.$transaction(async (prismaTx) => {
      const updateRes = await prismaTx.transaction.updateMany({
        where: {
          id,
          revision: tx.revision,
          status: { notIn: ['CANCELLED', 'COMPLETED'] },
        },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: reason,
          cancelledById: user.id,
          revision: { increment: 1 },
        },
      });

      if (updateRes.count !== 1) {
        throw new ConflictException({
          success: false,
          message:
            'Transaksi gagal dibatalkan karena telah diperbarui oleh proses lain atau sudah dalam status terminal.',
        });
      }

      await prismaTx.transactionStatusHistory.create({
        data: {
          transactionId: id,
          oldStatus: tx.status,
          newStatus: 'CANCELLED',
          changedById: user.id,
          notes: `Cancelled: ${reason}`,
        },
      });

      await this.activityLogsService.logAction(
        {
          userId: user.id,
          action: 'TRANSACTION_CANCELLED',
          module: 'TRANSACTIONS',
          referenceId: id,
          description: `Transaction ${tx.transactionNumber} was cancelled by ${user.email}. Reason: ${reason}`,
          status: 'SUCCESS',
        },
        prismaTx,
      );

      return prismaTx.transaction.findUnique({
        where: { id },
        include: { statusHistory: true },
      });
    });

    return {
      success: true,
      message: 'Transaction cancelled successfully',
      data: updated,
    };
  }

  async voidTransaction(
    id: string,
    dto: import('./dto/void-transaction.dto').VoidTransactionDto,
    user: JwtPayloadUser,
  ) {
    if (user?.role !== 'ADMIN') {
      throw new ForbiddenException({
        success: false,
        message:
          'Hanya Admin yang diizinkan melakukan pembatalan administratif (Void).',
        errors: [],
      });
    }

    this.logger.warn(
      `Transaction administrative void request for ID: ${id} by user ${user.email} (Reason: [${dto.reasonCode}] ${dto.reason})`,
    );

    const tx = await this.prisma.transaction.findUnique({ where: { id } });

    if (!tx) {
      throw new NotFoundException({
        success: false,
        message: 'Transaksi tidak ditemukan.',
        errors: [],
      });
    }

    if (tx.status === 'COMPLETED') {
      throw new BadRequestException({
        success: false,
        message:
          'Transaksi berstatus COMPLETED tidak dapat di-void/dibatalkan. Gunakan alur Koreksi Data Admin.',
        errors: [],
      });
    }

    // If already administratively voided, return idempotent success
    if (tx.isVoided) {
      return {
        success: true,
        message: 'Transaksi sudah dibatalkan secara administratif (Void) sebelumnya.',
        data: tx,
      };
    }

    const updated = await this.prisma.$transaction(async (prismaTx) => {
      // Atomic DB-level Compare-And-Swap (CAS)
      const updateRes = await prismaTx.transaction.updateMany({
        where: {
          id,
          revision: dto.expectedRevision,
          status: { not: 'COMPLETED' },
          isVoided: false,
        },
        data: {
          status: 'CANCELLED',
          isVoided: true,
          voidedAt: new Date(),
          voidedById: user.id,
          voidReasonCode: dto.reasonCode,
          voidReason: dto.reason,
          cancellationReason:
            tx.cancellationReason || `[VOID: ${dto.reasonCode}] ${dto.reason}`,
          cancelledAt: tx.cancelledAt || new Date(),
          cancelledById: tx.cancelledById || user.id,
          revision: { increment: 1 },
        },
      });

      if (updateRes.count !== 1) {
        throw new ConflictException({
          success: false,
          message:
            'Konflik Konkurensi: Transaksi telah diperbarui oleh proses lain atau revisi tidak cocok. Silakan muat ulang data.',
        });
      }

      // Record status transition only if not already CANCELLED to prevent CANCELLED -> CANCELLED pseudo-transitions
      if (tx.status !== 'CANCELLED') {
        await prismaTx.transactionStatusHistory.create({
          data: {
            transactionId: id,
            oldStatus: tx.status,
            newStatus: 'CANCELLED',
            changedById: user.id,
            notes: `[ADMIN_VOID] ${dto.reasonCode}: ${dto.reason}`,
          },
        });
      }

      // Structured ActivityLog (Zero raw email in description)
      await this.activityLogsService.logAction(
        {
          userId: user.id,
          action: 'TRANSACTION_VOIDED',
          module: 'TRANSACTIONS',
          referenceId: id,
          description: JSON.stringify({
            transactionNumber: tx.transactionNumber,
            plateNumber: tx.plateNumber,
            originalStatus: tx.status,
            reasonCode: dto.reasonCode,
            reason: dto.reason,
            previousRevision: tx.revision,
            newRevision: tx.revision + 1,
          }),
          status: 'SUCCESS',
        },
        prismaTx,
      );

      return prismaTx.transaction.findUnique({ where: { id } });
    });

    return {
      success: true,
      message: 'Transaksi berhasil dibatalkan secara administratif (Void).',
      data: updated,
    };
  }
}
