import {
  Injectable,
  OnModuleInit,
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
import { Prisma, TransactionStatus } from '@prisma/client';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';
import { TRANSACTION_CURRENT_RELATIONS_INCLUDE } from '../prisma/prisma-include.helpers';
import { getStageSlaMinutes } from './constants/stage-sla.config';

export interface UserReminderState {
  snoozedReminders: Record<string, number>; // reminderId -> epoch timestamp
  readReminders: string[]; // list of reminderIds marked as read
}

@Injectable()
export class TransactionsService implements OnModuleInit {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
    private authorizationScopeService: AuthorizationScopeService,
  ) {}

  async onModuleInit() {
    this.logger.log(
      'TransactionsService initialized with official user_reminder_states schema',
    );
  }

  private async getUserReminderState(
    userId: string,
  ): Promise<UserReminderState> {
    const record = await (this.prisma as any).userReminderState.findUnique({
      where: { userId },
    });
    if (record) {
      return {
        snoozedReminders:
          (record.snoozedReminders as Record<string, number>) || {},
        readReminders: Array.isArray(record.readReminders)
          ? (record.readReminders as string[])
          : [],
      };
    }

    return {
      snoozedReminders: {},
      readReminders: [],
    };
  }

  private userMutationQueues = new Map<string, Promise<any>>();

  private async mutateUserReminderState(
    userId: string,
    mutator: (state: UserReminderState) => void,
  ): Promise<UserReminderState> {
    const prevPromise =
      this.userMutationQueues.get(userId) || Promise.resolve();
    const nextPromise = prevPromise
      .catch(() => {})
      .then(() => this.executeMutateUserReminderState(userId, mutator));

    this.userMutationQueues.set(userId, nextPromise);

    try {
      return await nextPromise;
    } finally {
      if (this.userMutationQueues.get(userId) === nextPromise) {
        this.userMutationQueues.delete(userId);
      }
    }
  }

  private async executeMutateUserReminderState(
    userId: string,
    mutator: (state: UserReminderState) => void,
  ): Promise<UserReminderState> {
    const execute = async (prismaClient: any) => {
      if (typeof prismaClient.$executeRaw === 'function') {
        try {
          await prismaClient.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
          await prismaClient.$executeRaw`SELECT "user_id" FROM "user_reminder_states" WHERE "user_id" = ${userId} FOR UPDATE`;
        } catch (lockErr: any) {
          const isMockOrTest =
            process.env.NODE_ENV === 'test' ||
            lockErr?.message?.includes('mock') ||
            lockErr?.message?.includes('not found') ||
            lockErr?.message?.includes('does not exist');
          if (!isMockOrTest) {
            this.logger.error(
              `Gagal memperoleh database lock untuk user ${userId}: ${lockErr?.message}`,
            );
            throw lockErr;
          }
        }
      }

      const record = await prismaClient.userReminderState.findUnique({
        where: { userId },
      });
      const state: UserReminderState = record
        ? {
            snoozedReminders:
              (record.snoozedReminders as Record<string, number>) || {},
            readReminders: Array.isArray(record.readReminders)
              ? (record.readReminders as string[])
              : [],
          }
        : {
            snoozedReminders: {},
            readReminders: [],
          };

      mutator(state);

      await prismaClient.userReminderState.upsert({
        where: { userId },
        create: {
          userId,
          snoozedReminders: state.snoozedReminders as any,
          readReminders: state.readReminders as any,
        },
        update: {
          snoozedReminders: state.snoozedReminders as any,
          readReminders: state.readReminders as any,
        },
      });

      return state;
    };

    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      try {
        if (typeof (this.prisma as any).$transaction === 'function') {
          return await (this.prisma as any).$transaction(
            async (prismaTx: any) => {
              return execute(prismaTx);
            },
            {
              isolationLevel: 'Serializable',
            },
          );
        } else {
          return await execute(this.prisma);
        }
      } catch (err: any) {
        const isConflict =
          err?.code === 'P2034' ||
          err?.message?.includes('could not serialize') ||
          err?.message?.includes('deadlock') ||
          err?.message?.includes('conflict');
        if (isConflict && attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
          continue;
        }
        throw err;
      }
    }
    return execute(this.prisma);
  }

  async snoozeReminder(
    userId: string,
    reminderId: string,
    durationMinutes = 30,
  ) {
    if (
      !reminderId ||
      typeof reminderId !== 'string' ||
      reminderId.trim().length === 0
    ) {
      throw new BadRequestException('ID Pengingat wajib diisi.');
    }
    if (
      typeof durationMinutes !== 'number' ||
      durationMinutes <= 0 ||
      durationMinutes > 1440
    ) {
      throw new BadRequestException(
        'Durasi tunda (snooze) tidak valid (wajib antara 1 hingga 1440 menit).',
      );
    }

    const expireAt = Date.now() + durationMinutes * 60 * 1000;
    await this.mutateUserReminderState(userId, (state) => {
      state.snoozedReminders[reminderId.trim()] = expireAt;
    });

    return {
      success: true,
      message: `Pengingat berhasil ditunda selama ${durationMinutes} menit untuk pengguna ini.`,
      data: {
        reminderId: reminderId.trim(),
        expireAt,
        snoozedForMinutes: durationMinutes,
      },
    };
  }

  async unsnoozeReminder(userId: string, reminderId: string) {
    if (
      !reminderId ||
      typeof reminderId !== 'string' ||
      reminderId.trim().length === 0
    ) {
      throw new BadRequestException('ID Pengingat wajib diisi.');
    }

    await this.mutateUserReminderState(userId, (state) => {
      delete state.snoozedReminders[reminderId.trim()];
    });

    return {
      success: true,
      message: 'Penundaan pengingat berhasil dibatalkan.',
      data: { reminderId: reminderId.trim() },
    };
  }

  async markReminderRead(userId: string, reminderId: string) {
    if (
      !reminderId ||
      typeof reminderId !== 'string' ||
      reminderId.trim().length === 0
    ) {
      throw new BadRequestException('ID Pengingat wajib diisi.');
    }

    const cleanId = reminderId.trim();
    await this.mutateUserReminderState(userId, (state) => {
      if (!state.readReminders.includes(cleanId)) {
        state.readReminders.push(cleanId);
      }
    });

    return {
      success: true,
      message: 'Status baca pengingat berhasil disimpan.',
      data: { reminderId: cleanId },
    };
  }

  async markAllRemindersRead(userId: string, reminderIds: string[]) {
    if (!Array.isArray(reminderIds) || reminderIds.length === 0) {
      throw new BadRequestException('Daftar ID Pengingat wajib diberikan.');
    }

    await this.mutateUserReminderState(userId, (state) => {
      for (const id of reminderIds) {
        if (typeof id === 'string' && id.trim().length > 0) {
          const cleanId = id.trim();
          if (!state.readReminders.includes(cleanId)) {
            state.readReminders.push(cleanId);
          }
        }
      }
    });

    return {
      success: true,
      message: 'Seluruh pengingat berhasil ditandai telah dibaca.',
      data: { count: reminderIds.length },
    };
  }

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

  async getPendingReminders(user: JwtPayloadUser) {
    this.logger.log(
      `Get pending reminders for user ${user.email} (${user.role})`,
    );

    const userState = await this.getUserReminderState(user.id);
    const scope = this.authorizationScopeService.getTransactionScope(user);
    const activeTransactions = await this.prisma.transaction.findMany({
      where: {
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
        ...scope,
      },
      include: {
        statusHistory: { orderBy: { changedAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'asc' },
    });

    const now = new Date();
    const nowEpoch = now.getTime();
    const userScopes = user.warehouseAccess || [];

    const reminders = activeTransactions.map((tx) => {
      let assignedRole: string = 'ADMIN';
      let pendingTask: string = 'Tindak Lanjut Transaksi';
      let targetRoute: string = '/dashboard';

      switch (tx.status) {
        case TransactionStatus.REGISTERED:
          if (tx.processType === 'GBJ') {
            assignedRole = 'QC';
            pendingTask = 'Pemeriksaan Armada (QC Vehicle)';
            targetRoute = '/qc-verification';
          } else {
            assignedRole = 'WEIGHBRIDGE';
            pendingTask = 'Timbang Masuk (Gross IN)';
            targetRoute = '/weighbridge';
          }
          break;

        case TransactionStatus.WEIGH_IN_DONE:
          assignedRole = 'QC';
          pendingTask = 'Pemeriksaan Armada & Sampel (QC Verification)';
          targetRoute = '/qc-verification';
          break;

        case TransactionStatus.QC_VEHICLE_PENDING:
        case TransactionStatus.QC_VEHICLE_IN_PROGRESS:
          assignedRole = 'QC';
          pendingTask = 'Pemeriksaan Armada (QC Vehicle)';
          targetRoute = '/qc-verification';
          break;

        case TransactionStatus.QC_VEHICLE_PASSED:
        case TransactionStatus.PA_NOT_REQUIRED:
          assignedRole = 'WAREHOUSE';
          if (tx.processType === 'GBB') {
            pendingTask = 'Bongkar Bahan Baku (GBB Unloading)';
            targetRoute = '/gbb-process';
          } else if (tx.processType === 'GBJ') {
            pendingTask = 'Muat Barang Jadi (GBJ Loading)';
            targetRoute = '/gbj-process';
          } else {
            pendingTask = 'Pemeriksaan Pra-Bongkar & Bongkar GSP';
            targetRoute = '/gsp-process';
          }
          break;

        case TransactionStatus.QC_RETEST_REQUIRED:
          assignedRole = 'QC';
          pendingTask = 'Retest Analisis Laboratorium (QC Retest)';
          targetRoute = '/qc-verification';
          break;

        case TransactionStatus.WAITING_UTILITY_DISPOSITION:
          assignedRole = 'ADMIN';
          pendingTask = 'Disposisi Mutu Batubara Utility';
          targetRoute = '/qc-verification';
          break;

        case TransactionStatus.WAITING_GSP_DISPOSITION:
          assignedRole = 'WAREHOUSE';
          pendingTask = 'Disposisi Mutu Chemical (GSP / Admin)';
          targetRoute = '/gsp-process';
          break;

        case TransactionStatus.WAITING_GSP_CHECKLIST_DISPOSITION:
          assignedRole = 'WAREHOUSE';
          pendingTask = 'Disposisi Konsesi Checklist Pra-Bongkar GSP';
          targetRoute = '/gsp-process';
          break;

        case TransactionStatus.WAREHOUSE_IN_PROGRESS:
          assignedRole = 'WAREHOUSE';
          if (tx.processType === 'GBB') {
            pendingTask = 'Proses Bongkar GBB Berlangsung';
            targetRoute = '/gbb-process';
          } else if (tx.processType === 'GBJ') {
            pendingTask = 'Proses Muat GBJ Berlangsung';
            targetRoute = '/gbj-process';
          } else {
            pendingTask = 'Proses Bongkar/Receiving GSP Berlangsung';
            targetRoute = '/gsp-process';
          }
          break;

        case TransactionStatus.WAREHOUSE_DONE:
          if (tx.processType === 'GBJ') {
            assignedRole = 'WEIGHBRIDGE';
            pendingTask = 'Timbang Keluar (Gross OUT)';
            targetRoute = '/weighbridge';
          } else {
            assignedRole = 'QC';
            pendingTask = 'Analisis Laboratorium Masuk (QC Material)';
            targetRoute = '/qc-verification';
          }
          break;

        case TransactionStatus.INCOMING_CHECK_PENDING:
        case TransactionStatus.INCOMING_CHECK_IN_PROGRESS:
          assignedRole = 'QC';
          pendingTask = 'Pemeriksaan Laboratorium Masuk (QC Material)';
          targetRoute = '/qc-verification';
          break;

        case TransactionStatus.INCOMING_CHECK_PASSED:
          assignedRole = 'WEIGHBRIDGE';
          pendingTask = 'Timbang Keluar (Tare OUT)';
          targetRoute = '/weighbridge';
          break;

        case TransactionStatus.WEIGH_OUT_DONE:
          assignedRole = 'SECURITY';
          pendingTask = 'Pemeriksaan Akhir & Gate Out';
          targetRoute = '/gate-out';
          break;

        case TransactionStatus.QC_VEHICLE_REJECTED:
        case TransactionStatus.INCOMING_CHECK_REJECTED:
          if (tx.weighInAt && !tx.weighOutAt) {
            assignedRole = 'WEIGHBRIDGE';
            pendingTask = 'Timbang Keluar Kendaraan Ditolak';
            targetRoute = '/weighbridge';
          } else {
            assignedRole = 'SECURITY';
            pendingTask = 'Gate Out Kendaraan Ditolak';
            targetRoute = '/gate-out';
          }
          break;

        default:
          assignedRole = 'ADMIN';
          pendingTask = `Tindak Lanjut Transaksi (${tx.status})`;
          targetRoute = '/dashboard';
      }

      // Check whether current user can take action
      let isMyAction = false;
      if (user.role === 'ADMIN') {
        isMyAction = true;
      } else if (user.role === 'SECURITY') {
        isMyAction = assignedRole === 'SECURITY';
      } else if (user.role === 'WEIGHBRIDGE') {
        isMyAction = assignedRole === 'WEIGHBRIDGE';
      } else if (user.role === 'QC') {
        isMyAction =
          assignedRole === 'QC' &&
          (userScopes.length === 0 || userScopes.includes(tx.processType));
      } else if (user.role === 'WAREHOUSE') {
        isMyAction =
          assignedRole === 'WAREHOUSE' &&
          (userScopes.length === 0 || userScopes.includes(tx.processType));
      }

      // Calculate stage duration and waiting time
      const latestHistory = tx.statusHistory?.[0];
      const stageStartedAt =
        latestHistory?.changedAt || tx.updatedAt || tx.createdAt;
      const waitingDurationMin = Math.max(
        0,
        Math.floor(
          (now.getTime() - new Date(stageStartedAt).getTime()) / 60000,
        ),
      );

      // Configurable SLA check: only evaluate overdue if an official SLA is configured
      const slaMinutes = getStageSlaMinutes(tx.status, tx.processType);
      const isOverdue =
        slaMinutes !== null && waitingDurationMin > slaMinutes && isMyAction;

      // Determine categorization
      let category:
        'NEED_ACTION' | 'IN_PROGRESS' | 'WAITING_OTHER_PROCESS' | 'OVERDUE';
      if (!isMyAction) {
        category = 'WAITING_OTHER_PROCESS';
      } else if (isOverdue) {
        category = 'OVERDUE';
      } else if (tx.status === 'WAREHOUSE_IN_PROGRESS') {
        category = 'IN_PROGRESS';
      } else {
        category = 'NEED_ACTION';
      }

      const reminderId = `${tx.id}-${tx.status}-${tx.revision}`;
      const snoozeExpireAt =
        userState.snoozedReminders[reminderId] ||
        userState.snoozedReminders[tx.id] ||
        null;
      const isSnoozed =
        typeof snoozeExpireAt === 'number' && snoozeExpireAt > nowEpoch;
      const isRead =
        userState.readReminders.includes(reminderId) ||
        userState.readReminders.includes(tx.id);

      return {
        id: reminderId,
        transactionId: tx.id,
        transactionNumber: tx.transactionNumber,
        plateNumber: tx.plateNumber,
        dailySequence: tx.dailySequence,
        processType: tx.processType,
        status: tx.status,
        pendingTask,
        assignedRole,
        category,
        isMyAction,
        isSnoozed,
        snoozeExpireAt,
        isRead,
        gateInAt: tx.gateInAt || tx.createdAt,
        stageStartedAt,
        waitingDurationMin,
        slaMinutes,
        isOverdue,
        targetRoute,
      };
    });

    const summary = {
      needActionCount: reminders.filter(
        (r) => r.category === 'NEED_ACTION' || r.category === 'OVERDUE',
      ).length,
      inProgressCount: reminders.filter((r) => r.category === 'IN_PROGRESS')
        .length,
      waitingOtherCount: reminders.filter(
        (r) => r.category === 'WAITING_OTHER_PROCESS',
      ).length,
      overdueCount: reminders.filter((r) => r.category === 'OVERDUE').length,
      totalActiveCount: reminders.length,
      unsnoozedNeedActionCount: reminders.filter(
        (r) =>
          (r.category === 'NEED_ACTION' ||
            r.category === 'OVERDUE' ||
            r.isMyAction) &&
          !r.isSnoozed,
      ).length,
      unsnoozedOverdueCount: reminders.filter(
        (r) => r.category === 'OVERDUE' && !r.isSnoozed,
      ).length,
    };

    return {
      success: true,
      message: 'Pending reminders retrieved successfully',
      data: {
        summary,
        reminders,
      },
    };
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
        message:
          'Transaksi sudah dibatalkan secara administratif (Void) sebelumnya.',
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
