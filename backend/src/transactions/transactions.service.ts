import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { Prisma } from '@prisma/client';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
  ) {}

  async findAll(query: TransactionQueryDto, user: JwtPayloadUser) {
    const { page = 1, limit = 10, status, processType, search } = query;

    this.logger.log(
      `Find all transactions by user ${user.email} | page=${page} limit=${limit}`,
    );

    const where: Prisma.TransactionWhereInput = {};

    if (status) {
      where.status = status;
    }

    if (processType) {
      where.processType = processType;
    }

    if (search) {
      where.OR = [
        { transactionNumber: { contains: search, mode: 'insensitive' } },
        { plateNumber: { contains: search, mode: 'insensitive' } },
        { vendorName: { contains: search, mode: 'insensitive' } },
        { driverName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        include: {
          statusHistory: { orderBy: { changedAt: 'desc' } },
          weighbridgeRecords: true,
          warehouseProcesses: true,
          qcVehicleChecks: {
            include: { checkedBy: { select: { id: true, name: true } } },
          },
          incomingMaterialChecks: {
            include: { checkedBy: { select: { id: true, name: true } } },
          },
          weighInBy: { select: { id: true, name: true } },
          weighOutBy: { select: { id: true, name: true } },
          warehouseStartBy: { select: { id: true, name: true } },
          warehouseEndBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    await this.activityLogsService.logAction({
      userId: user.id,
      action: 'TRANSACTIONS_LIST_VIEW',
      module: 'TRANSACTIONS',

      description: 'User viewed transaction list',
      status: 'SUCCESS',
    });

    return {
      success: true,
      message: 'Transactions retrieved successfully',
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findActive(user: JwtPayloadUser) {
    this.logger.log(`Find active transactions by user ${user.email}`);

    const data = await this.prisma.transaction.findMany({
      where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      include: {
        statusHistory: { orderBy: { changedAt: 'desc' } },
        weighbridgeRecords: true,
        warehouseProcesses: true,
        qcVehicleChecks: {
          include: { checkedBy: { select: { id: true, name: true } } },
        },
        incomingMaterialChecks: {
          include: { checkedBy: { select: { id: true, name: true } } },
        },
        weighInBy: { select: { id: true, name: true } },
        weighOutBy: { select: { id: true, name: true } },
        warehouseStartBy: { select: { id: true, name: true } },
        warehouseEndBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    await this.activityLogsService.logAction({
      userId: user.id,
      action: 'TRANSACTIONS_ACTIVE_VIEW',
      module: 'TRANSACTIONS',

      description: 'User viewed active transactions list',
      status: 'SUCCESS',
    });

    return {
      success: true,
      message: 'Active transactions retrieved successfully',
      data,
    };
  }

  async findOne(id: string, user: JwtPayloadUser) {
    this.logger.log(
      `Find transaction details for ID: ${id} by user ${user.email}`,
    );

    const tx = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        statusHistory: { orderBy: { changedAt: 'desc' } },
        weighbridgeRecords: true,
        warehouseProcesses: true,
        qcVehicleChecks: {
          include: { checkedBy: { select: { id: true, name: true } } },
        },
        incomingMaterialChecks: {
          include: { checkedBy: { select: { id: true, name: true } } },
        },
        fraudChecks: true,
        weighInBy: { select: { id: true, name: true } },
        weighOutBy: { select: { id: true, name: true } },
        warehouseStartBy: { select: { id: true, name: true } },
        warehouseEndBy: { select: { id: true, name: true } },
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

    const updated = await this.prisma.transaction.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: reason,
        cancelledById: user.id,
        statusHistory: {
          create: {
            oldStatus: tx.status,
            newStatus: 'CANCELLED',
            changedById: user.id,
            notes: `Cancelled: ${reason}`,
          },
        },
      },
      include: { statusHistory: true },
    });

    await this.activityLogsService.logAction({
      userId: user.id,
      action: 'TRANSACTION_CANCELLED',
      module: 'TRANSACTIONS',

      referenceId: id,
      description: `Transaction ${tx.transactionNumber} was cancelled by ${user.email}. Reason: ${reason}`,
      status: 'SUCCESS',
    });

    return {
      success: true,
      message: 'Transaction cancelled successfully',
      data: updated,
    };
  }

  async remove(id: string, user: JwtPayloadUser) {
    this.logger.warn(
      `Transaction deletion request for ID: ${id} by user ${user.email}`,
    );

    const tx = await this.prisma.transaction.findUnique({ where: { id } });

    if (!tx) {
      throw new NotFoundException({
        success: false,
        message: 'Transaction not found',
        errors: [],
      });
    }

    // If already cancelled (soft-deleted), just return success
    if (tx.status === 'CANCELLED') {
      return {
        success: true,
        message: 'Transaction is already deleted/cancelled (soft-delete)',
        data: tx,
      };
    }

    // Perform soft delete by setting status to CANCELLED to preserve audit trail
    const updated = await this.prisma.transaction.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledById: user.id,
        cancellationReason: 'Transaction deleted via API (soft-delete)',
      },
    });

    await this.prisma.transactionStatusHistory.create({
      data: {
        transactionId: id,
        oldStatus: tx.status,
        newStatus: 'CANCELLED',
        changedById: user.id,
        notes: 'Deleted via API (soft-delete)',
      },
    });

    await this.activityLogsService.logAction({
      userId: user.id,
      action: 'TRANSACTION_DELETE',
      module: 'TRANSACTIONS',
      referenceId: id,
      description: `Transaction ${tx.transactionNumber} (${tx.plateNumber}) in status ${tx.status} was soft-deleted (status set to CANCELLED) by Admin ${user.email}`,
      status: 'SUCCESS',
    }).catch(() => {});

    return {
      success: true,
      message: 'Transaction deleted successfully',
      data: updated,
    };
  }
}
