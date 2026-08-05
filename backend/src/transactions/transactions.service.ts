import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { CorrectTransactionDto } from './dto/correct-transaction.dto';
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

    if (tx.status === 'COMPLETED') {
      throw new BadRequestException({
        success: false,
        message:
          'Transaksi berstatus COMPLETED tidak dapat dihapus/dibatalkan. Gunakan alur Koreksi Data Admin.',
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

    await this.activityLogsService
      .logAction({
        userId: user.id,
        action: 'TRANSACTION_DELETE',
        module: 'TRANSACTIONS',
        referenceId: id,
        description: `Transaction ${tx.transactionNumber} (${tx.plateNumber}) in status ${tx.status} was soft-deleted (status set to CANCELLED) by Admin ${user.email}`,
        status: 'SUCCESS',
      })
      .catch(() => {});

    return {
      success: true,
      message: 'Transaction deleted successfully',
      data: updated,
    };
  }

  async correctCompletedTransaction(
    id: string,
    dto: CorrectTransactionDto,
    user: JwtPayloadUser,
    ipAddress?: string,
  ) {
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException({
        success: false,
        message:
          'Akses ditolak! Koreksi data transaksi COMPLETED hanya dapat dilakukan oleh role ADMIN.',
        errors: [],
      });
    }

    const tx = await this.prisma.transaction.findUnique({
      where: { id },
      include: { fraudChecks: true },
    });

    if (!tx) {
      throw new NotFoundException({
        success: false,
        message: 'Transaction not found',
        errors: [],
      });
    }

    if (tx.status !== 'COMPLETED') {
      throw new BadRequestException({
        success: false,
        message: `Fitur koreksi data hanya berlaku untuk transaksi dengan status COMPLETED (status saat ini: ${tx.status}).`,
        errors: [],
      });
    }

    if (!dto.evidenceUrl || !dto.evidenceUrl.trim()) {
      throw new BadRequestException({
        success: false,
        message:
          'Bukti dokumen (evidenceUrl) wajib diisi untuk koreksi transaksi COMPLETED.',
        errors: [],
      });
    }

    if (dto.expectedUpdatedAt) {
      const currentTxTime = new Date(tx.updatedAt).getTime();
      const expectedTime = new Date(dto.expectedUpdatedAt).getTime();
      if (isNaN(expectedTime) || currentTxTime !== expectedTime) {
        throw new BadRequestException({
          success: false,
          message:
            'Data transaksi telah diperbarui oleh pengguna lain. Silakan muat ulang data terbaru sebelum melakukan koreksi.',
          errors: [],
        });
      }
    }

    const newGross =
      dto.grossWeight !== undefined ? dto.grossWeight : tx.grossWeight;
    const newTare =
      dto.tareWeight !== undefined ? dto.tareWeight : tx.tareWeight;

    if (newGross !== null && newTare !== null && newGross < newTare) {
      throw new BadRequestException({
        success: false,
        message:
          'Berat kotor (Gross Weight) tidak boleh lebih kecil dari berat kosong (Tare Weight).',
        errors: [],
      });
    }

    const oldValues: Record<string, any> = {};
    const newValues: Record<string, any> = {};

    const allowlist: Array<keyof CorrectTransactionDto> = [
      'grossWeight',
      'tareWeight',
      'actualWeight',
      'driverName',
      'driverPhone',
      'vendorName',
      'suratJalanNumber',
      'poNumber',
      'remarks',
    ];

    const updateData: Prisma.TransactionUpdateInput = {};

    for (const field of allowlist) {
      if (dto[field] !== undefined && dto[field] !== (tx as any)[field]) {
        oldValues[field] = (tx as any)[field];
        newValues[field] = dto[field];
        (updateData as any)[field] = dto[field];
      }
    }

    if (newGross !== null && newTare !== null) {
      const computedNet = newGross - newTare;
      if (computedNet !== tx.netWeight) {
        oldValues['netWeight'] = tx.netWeight;
        newValues['netWeight'] = computedNet;
        updateData.netWeight = computedNet;
      }
    }

    if (Object.keys(newValues).length === 0) {
      throw new BadRequestException({
        success: false,
        message:
          'Tidak ada data perubahan nilai yang berbeda dari data transaksi saat ini.',
        errors: [],
      });
    }

    const cleanIp = ipAddress ? ipAddress.split(',')[0].trim() : null;

    const result = await this.prisma.$transaction(async (prismaTx) => {
      if (dto.expectedUpdatedAt) {
        const freshTx = await prismaTx.transaction.findUnique({
          where: { id },
          select: { updatedAt: true },
        });
        if (!freshTx) {
          throw new NotFoundException({
            success: false,
            message: 'Transaksi tidak ditemukan.',
          });
        }
        const currentTxTime = new Date(freshTx.updatedAt).getTime();
        const expectedTime = new Date(dto.expectedUpdatedAt).getTime();
        if (isNaN(expectedTime) || currentTxTime !== expectedTime) {
          throw new ConflictException({
            success: false,
            message:
              'Data transaksi telah diperbarui oleh pengguna lain. Silakan muat ulang data terbaru sebelum melakukan koreksi.',
            errors: [],
          });
        }
      }

      const correction = await prismaTx.transactionCorrection.create({
        data: {
          transactionId: id,
          correctedById: user.id,
          reason: dto.reason,
          evidenceUrl: dto.evidenceUrl,
          oldValues: oldValues as any,
          newValues: newValues as any,
          ipAddress: cleanIp,
        },
      });

      const updatedTx = await prismaTx.transaction.update({
        where: { id },
        data: updateData,
      });

      const finalNet = updatedTx.netWeight;
      const finalActual = updatedTx.actualWeight;
      if (finalNet !== null && finalActual !== null && finalNet > 0) {
        const deviation = Math.abs(finalNet - finalActual);
        const deviationPercent = (deviation / finalNet) * 100;
        let riskLevel: 'SAFE' | 'WARNING' | 'CRITICAL' = 'SAFE';
        if (deviationPercent > 5) riskLevel = 'CRITICAL';
        else if (deviationPercent > 2) riskLevel = 'WARNING';

        await prismaTx.fraudCheck.create({
          data: {
            transactionId: id,
            riskLevel,
            deviationKg: deviation,
            deviationPercent,
            riskReason: `Post-correction recalculation by Admin ${user.email}. Net: ${finalNet} kg, Actual: ${finalActual} kg.`,
          },
        });
      }

      await this.activityLogsService.logAction(
        {
          userId: user.id,
          action: 'TRANSACTION_DATA_CORRECTED',
          module: 'TRANSACTIONS',
          referenceId: id,
          description: `Admin ${user.email} corrected COMPLETED transaction ${tx.transactionNumber}. Reason: ${dto.reason}`,
          status: 'SUCCESS',
          ipAddress: cleanIp || undefined,
        },
        prismaTx,
      );

      return { updatedTx, correction };
    });

    return {
      success: true,
      message: 'Data transaksi COMPLETED berhasil dikoreksi oleh Admin.',
      data: result,
    };
  }

  async getTransactionCorrections(id: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id },
    });
    if (!tx) {
      throw new NotFoundException({
        success: false,
        message: 'Transaksi tidak ditemukan.',
      });
    }

    const corrections = await this.prisma.transactionCorrection.findMany({
      where: { transactionId: id },
      include: {
        correctedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: corrections,
    };
  }
}
