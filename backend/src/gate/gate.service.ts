import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { CreateGateCheckInDto } from './dto/create-gate-check-in.dto';
import { GateQueryDto } from './dto/gate-query.dto';
import { TransactionStatus, Prisma } from '@prisma/client';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class GateService {
  private readonly logger = new Logger(GateService.name);

  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
  ) {}

  private async generateTransactionNumber(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    const prefix = `GMS-${dateStr}-`;

    const lastTransaction = await this.prisma.transaction.findFirst({
      where: {
        transactionNumber: {
          startsWith: prefix,
        },
      },
      orderBy: {
        transactionNumber: 'desc',
      },
    });

    let sequence = 1;
    if (lastTransaction) {
      const lastSeqStr = lastTransaction.transactionNumber.split('-')[2];
      sequence = parseInt(lastSeqStr, 10) + 1;
    }

    const sequenceStr = sequence.toString().padStart(4, '0');
    return `${prefix}${sequenceStr}`;
  }

  async checkIn(dto: CreateGateCheckInDto, user: JwtPayloadUser) {
    this.logger.log(`Gate check-in attempt for plate: ${dto.plateNumber}`);

    let transaction: any;
    let retries = 3;
    while (retries > 0) {
      try {
        const transactionNumber = await this.generateTransactionNumber();

        transaction = await this.prisma.$transaction(async (tx) => {
          const activeTransaction = await tx.transaction.findFirst({
            where: {
              plateNumber: dto.plateNumber,
              status: {
                notIn: ['COMPLETED', 'CANCELLED'],
              },
            },
          });

          if (activeTransaction) {
            this.logger.warn(
              `Check-in rejected: Active transaction found for plate ${dto.plateNumber}`,
            );
            throw new BadRequestException(
              'Kendaraan dengan pelat ini masih memiliki transaksi yang sedang aktif (Belum Gate Out). Harap selesaikan atau batalkan transaksi sebelumnya terlebih dahulu.',
            );
          }

          return tx.transaction.create({
            data: {
              transactionNumber,
              plateNumber: dto.plateNumber,
              driverName: dto.driverName,
              driverPhone: dto.driverPhone,
              vendorName: dto.vendorName,
              vehicleType: dto.vehicleType,
              processType: dto.processType,
              cargoType: dto.cargoType,
              cargoSubType: dto.cargoSubType,
              cargoProcessType: dto.cargoProcessType,
              suratJalanNumber: dto.suratJalanNumber,
              poNumber: dto.poNumber,
              permitCardNumber: dto.permitCardNumber,
              guestIdNumber: dto.guestIdNumber,
              remarks: dto.remarks,
              status: 'REGISTERED',
              gateInAt: new Date(),
              createdById: user.id,
              statusHistory: {
                create: {
                  newStatus: 'REGISTERED',
                  changedById: user.id,
                  notes: 'Gate check-in created',
                },
              },
            },
            include: {
              statusHistory: true,
            },
          });
        });
        break;
      } catch (error: any) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        if (error.code === 'P2002') {
          retries--;
          if (retries === 0)
            throw new BadRequestException(
              'Sistem sedang sibuk memproses antrean. Silakan coba lagi.',
            );
          continue;
        }
        throw error;
      }
    }

    if (!transaction)
      throw new BadRequestException('System error, transaction failed');

    // Write audit log
    await this.activityLogsService.logAction({
      userId: user.id,
      action: 'GATE_CHECK_IN',
      module: 'GATE',

      referenceId: transaction.id,
      description: `Vehicle ${dto.plateNumber} checked in`,
      status: 'SUCCESS',
    });

    this.logger.log(`Check-in successful: ${transaction.transactionNumber}`);

    return {
      success: true,
      message: 'Gate check-in created successfully',
      data: {
        ...transaction,
        createdBy: {
          id: user.id,
          name: user.name,
          role: user.role,
        },
      },
    };
  }

  async getQueue(query: GateQueryDto, user: JwtPayloadUser) {
    const {
      page = 1,
      limit = 10,
      search,
      processType,
      status,
      startDate,
      endDate,
    } = query;

    const where: Prisma.TransactionWhereInput = {
      status: status ? status : { notIn: ['COMPLETED', 'CANCELLED'] },
    };

    if (search) {
      where.OR = [
        { transactionNumber: { contains: search, mode: 'insensitive' } },
        { plateNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (processType) {
      where.processType = processType;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          statusHistory: {
            orderBy: { changedAt: 'desc' },
            take: 1,
          },
        },
      }),
    ]);

    await this.activityLogsService.logAction({
      userId: user.id,
      action: 'GATE_QUEUE_VIEW',
      module: 'GATE',

      description: `User viewed gate queue`,
      status: 'SUCCESS',
    });

    return {
      success: true,
      message: 'Gate queue retrieved successfully',
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getDetail(id: string, user: JwtPayloadUser) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        statusHistory: { orderBy: { changedAt: 'asc' } },
        weighbridgeRecords: true,
        warehouseProcesses: true,
        qcVehicleChecks: true,
        incomingMaterialChecks: true,
      },
    });

    if (!transaction) {
      throw new NotFoundException({
        success: false,
        message: 'Transaction not found',
        errors: [],
      });
    }

    let createdBy = null;
    if (transaction.createdById) {
      createdBy = await this.prisma.user.findUnique({
        where: { id: transaction.createdById },
        select: { id: true, name: true, role: true },
      });
    }

    await this.activityLogsService.logAction({
      userId: user.id,
      action: 'GATE_DETAIL_VIEW',
      module: 'GATE',

      referenceId: id,
      description: `User viewed transaction detail ${transaction.transactionNumber}`,
      status: 'SUCCESS',
    });

    return {
      success: true,
      message: 'Transaction detail retrieved successfully',
      data: {
        ...transaction,
        createdBy,
      },
    };
  }

  async checkOut(id: string, user: JwtPayloadUser) {
    this.logger.log(`Gate check-out attempt for transaction: ${id}`);

    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
    });

    if (!transaction) {
      throw new NotFoundException({
        success: false,
        message: 'Transaction not found',
        errors: [],
      });
    }

    if (transaction.status === 'CANCELLED') {
      throw new BadRequestException({
        success: false,
        message: 'Cannot check-out a cancelled transaction',
        errors: [],
      });
    }

    if (transaction.status === 'COMPLETED') {
      throw new BadRequestException({
        success: false,
        message: 'Transaction is already completed',
        errors: [],
      });
    }

    if (transaction.status !== 'WEIGH_OUT_DONE') {
      throw new BadRequestException({
        success: false,
        message: 'Transaction is not ready for check-out (not WEIGH_OUT_DONE)',
        errors: [],
      });
    }

    const updated = await this.prisma.transaction.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        gateOutAt: new Date(),
        completedAt: new Date(),
        statusHistory: {
          create: {
            oldStatus: transaction.status,
            newStatus: 'COMPLETED',
            changedById: user.id,
            notes: 'Gate check-out processed',
          },
        },
      },
    });

    await this.activityLogsService.logAction({
      userId: user.id,
      action: 'GATE_CHECK_OUT',
      module: 'GATE',

      referenceId: id,
      description: `Vehicle ${transaction.plateNumber} checked out`,
      status: 'SUCCESS',
    });

    this.logger.log(
      `Check-out successful for ${transaction.transactionNumber}`,
    );

    return {
      success: true,
      message: 'Gate check-out processed successfully',
      data: updated,
    };
  }

  async cancel(id: string, reason: string, user: JwtPayloadUser) {
    this.logger.log(`Transaction cancellation attempt for: ${id}`);

    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
    });

    if (!transaction) {
      throw new NotFoundException({
        success: false,
        message: 'Transaction not found',
        errors: [],
      });
    }

    if (transaction.status === 'CANCELLED') {
      throw new BadRequestException({
        success: false,
        message: 'Transaction is already cancelled',
        errors: [],
      });
    }

    if (transaction.status === 'COMPLETED') {
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
            oldStatus: transaction.status,
            newStatus: 'CANCELLED',
            changedById: user.id,
            notes: `Cancelled: ${reason}`,
          },
        },
      },
    });

    await this.activityLogsService.logAction({
      userId: user.id,
      action: 'TRANSACTION_CANCELLED',
      module: 'GATE',

      referenceId: id,
      description: `Transaction ${transaction.transactionNumber} cancelled. Reason: ${reason}`,
      status: 'SUCCESS',
    });

    this.logger.warn(
      `Transaction cancelled: ${transaction.transactionNumber} by ${user.email}`,
    );

    return {
      success: true,
      message: 'Transaction cancelled successfully',
      data: updated,
    };
  }
}
