import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import {
  TransactionStatus,
  ProcessType,
  CheckResult,
  QcVehicleDecisionMode,
} from '@prisma/client';
import { StartQcDto } from './dto/start-qc.dto';
import { VehicleCheckResultDto } from './dto/vehicle-check-result.dto';
import { IncomingCheckResultDto } from './dto/incoming-check-result.dto';
import { QcAttachmentDto } from './dto/qc-attachment.dto';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';

import { QC_HISTORY_CURRENT_RELATIONS_INCLUDE } from '../prisma/prisma-include.helpers';
import { assertValidStatusTransition } from '../common/state-machine/workflow-state-machine';
import {
  GBJ_CHECKLIST_ITEMS,
  GBJ_CHECKLIST_SEVERITY,
  GBJ_CHECKLIST_COUNT,
  MAX_PHOTO_DECODED_BYTES,
  ALLOWED_PHOTO_MIMES,
  MIN_DEVIATION_REASON_LENGTH,
} from './constants/gbj-checklist-policy';

@Injectable()
export class QcService {
  private readonly logger = new Logger(QcService.name);

  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
    private authorizationScopeService: AuthorizationScopeService,
  ) {}

  private mapToCheckResult(val?: string): CheckResult | null {
    if (!val) return null;
    const upper = val.toUpperCase();
    if (
      upper === 'PASS' ||
      upper === 'NORMAL' ||
      upper === 'OK' ||
      upper === 'GOOD'
    )
      return CheckResult.PASS;
    if (
      upper === 'REJECT' ||
      upper === 'ABNORMAL' ||
      upper === 'NOT_OK' ||
      upper === 'BAD' ||
      upper === 'REJECTED'
    )
      return CheckResult.REJECT;
    if (upper === 'NA') return CheckResult.NA;
    return null;
  }

  private booleanToCheckResult(val?: boolean): CheckResult | null {
    if (val === undefined || val === null) return null;
    return val ? CheckResult.PASS : CheckResult.REJECT;
  }

  private async findTransactionWithAccess(
    transactionId: string,
    user?: JwtPayloadUser,
    include?: any,
  ) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      ...(include && { include }),
    });

    if (!tx) {
      throw new NotFoundException({
        success: false,
        message: 'Transaction not found',
        errors: [],
      });
    }

    if (user) {
      this.authorizationScopeService.assertProcessAccess(user, tx.processType);
    }

    return tx;
  }

  async getQueue(user: JwtPayloadUser) {
    this.authorizationScopeService.assertScopeNotEmpty(user);
    const scope = this.authorizationScopeService.getTransactionScope(user);
    const queue = await this.prisma.transaction.findMany({
      where: {
        status: {
          in: [
            'QC_VEHICLE_PENDING',
            'QC_VEHICLE_IN_PROGRESS',
            'INCOMING_CHECK_PENDING',
            'INCOMING_CHECK_IN_PROGRESS',
          ],
        },
        ...scope,
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      success: true,
      message: 'QC queue retrieved successfully',
      data: queue,
    };
  }

  async startQc(
    transactionId: string,
    dto: StartQcDto,
    userId: string,
    user?: JwtPayloadUser,
  ) {
    const tx = await this.findTransactionWithAccess(transactionId, user);

    const now = new Date();
    let nextStatus: TransactionStatus;

    if (tx.status === 'QC_VEHICLE_PENDING') {
      nextStatus = 'QC_VEHICLE_IN_PROGRESS';
    } else if (tx.status === 'INCOMING_CHECK_PENDING') {
      nextStatus = 'INCOMING_CHECK_IN_PROGRESS';
    } else {
      throw new BadRequestException(
        'Transaction is not in a valid pending state to start QC',
      );
    }

    assertValidStatusTransition(tx.status, nextStatus);

    const updated = await this.prisma.$transaction(async (prismaTx) => {
      const claimed = await prismaTx.transaction.updateMany({
        where: {
          id: transactionId,
          status: tx.status,
          revision: tx.revision,
        },
        data: {
          status: nextStatus,
          revision: { increment: 1 },
          ...(tx.status === 'QC_VEHICLE_PENDING' && {
            qcStartAt: tx.qcStartAt || now,
          }),
          ...(tx.status === 'INCOMING_CHECK_PENDING' && {
            incomingQcStartAt: tx.incomingQcStartAt || now,
          }),
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException({
          success: false,
          message:
            'Transaksi telah diperbarui atau diproses secara bersamaan oleh pengguna lain (Concurrency Conflict).',
          errors: [],
        });
      }

      await prismaTx.transactionStatusHistory.create({
        data: {
          transactionId,
          oldStatus: tx.status,
          newStatus: nextStatus,
          changedById: userId,
          notes: 'QC started',
        },
      });

      return prismaTx.transaction.findUnique({ where: { id: transactionId } });
    });

    await this.activityLogsService.logAction({
      userId,
      action: 'QC_START',
      module: 'QC',
      referenceId: transactionId,
      status: 'SUCCESS',
    });

    return {
      success: true,
      message: 'QC started successfully',
      data: updated,
    };
  }

  async submitVehicleCheck(
    transactionId: string,
    dto: VehicleCheckResultDto,
    userId: string,
    user?: JwtPayloadUser,
  ) {
    const tx = await this.findTransactionWithAccess(transactionId, user, {
      qcVehicleChecks: { where: { isCurrent: true } },
    });

    if (!['GBJ', 'GBB', 'GSP'].includes(tx.processType))
      throw new BadRequestException(
        'Invalid process type for preliminary QC sampling & vehicle inspection',
      );
    if (
      tx.status !== 'QC_VEHICLE_IN_PROGRESS' &&
      tx.status !== 'QC_VEHICLE_PENDING'
    )
      throw new BadRequestException(
        'Transaction must be in QC_VEHICLE_PENDING or QC_VEHICLE_IN_PROGRESS state.',
      );
    if ((tx as any).qcVehicleChecks?.length > 0)
      throw new BadRequestException(
        'Result has already been submitted for this transaction',
      );

    // If GBJ, route to authoritative submitGbjVehicleCheck
    if (tx.processType === 'GBJ') {
      return this.submitGbjVehicleCheck(tx as any, dto, userId);
    }

    // ─── GBB/GSP legacy path (CAS-first, atomic ActivityLog) ───
    const result = dto.result === 'PASS' ? 'PASS' : 'REJECT';
    const nextStatus =
      result === 'PASS' ? 'QC_VEHICLE_PASSED' : 'QC_VEHICLE_REJECTED';

    assertValidStatusTransition(tx.status, nextStatus);

    const now = new Date();
    const updated = await this.prisma.$transaction(async (prisma) => {
      // 1. CAS claim FIRST
      const claimed = await prisma.transaction.updateMany({
        where: {
          id: transactionId,
          status: tx.status,
          revision: tx.revision,
        },
        data: {
          status: nextStatus,
          revision: { increment: 1 },
          qcStartAt: tx.qcStartAt || now,
          qcEndAt: now,
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException({
          success: false,
          message:
            'Transaksi telah diperbarui atau diproses secara bersamaan oleh pengguna lain (Concurrency Conflict).',
          errors: [],
        });
      }

      // 2. Create QcVehicleCheck
      const maxRev = await prisma.qcVehicleCheck.aggregate({
        where: { transactionId },
        _max: { revision: true },
      });
      const nextRevision = (maxRev._max.revision ?? 0) + 1;

      await prisma.qcVehicleCheck.create({
        data: {
          transactionId,
          revision: nextRevision,
          result: result,
          vehicleCleanliness: this.booleanToCheckResult(dto.vehicleCleanliness),
          vehicleOdor: this.booleanToCheckResult(dto.vehicleOdor),
          pestEvidence: this.booleanToCheckResult(dto.pestEvidence),
          vehicleCondition: this.booleanToCheckResult(dto.vehicleCondition),
          documentCompleteness: this.booleanToCheckResult(
            dto.documentCompleteness,
          ),
          sealCondition: this.booleanToCheckResult(dto.sealCondition),
          notes: dto.notes,
          checklistItems: dto.checklistItems || null,
          checkedById: userId,
          startedAt: tx.qcStartAt || now,
          completedAt: now,
        },
      });

      // 3. Status history
      await prisma.transactionStatusHistory.create({
        data: {
          transactionId,
          oldStatus: tx.status,
          newStatus: nextStatus,
          changedById: userId,
          notes: `Vehicle Check: ${result}`,
        },
      });

      // 4. Activity log (atomic)
      await this.activityLogsService.logAction(
        {
          userId,
          action: 'QC_VEHICLE_RESULT',
          module: 'QC',
          referenceId: transactionId,
          description: { result },
          status: 'SUCCESS',
        },
        prisma,
      );

      return prisma.transaction.findUnique({
        where: { id: transactionId },
        include: { qcVehicleChecks: true },
      });
    });

    return {
      success: true,
      message: `Vehicle QC result submitted (${result})`,
      data: updated,
    };
  }

  private async submitGbjVehicleCheck(
    tx: any,
    dto: VehicleCheckResultDto,
    userId: string,
  ) {
    // ═══════════════════════════════════════════
    // STEP 1: Structural Validation of Checklist
    // ═══════════════════════════════════════════
    const rawItems: unknown[] = (dto.checklistItems as any)?.items;

    if (!Array.isArray(rawItems)) {
      throw new BadRequestException({
        success: false,
        message: 'checklistItems.items harus berupa array.',
        errors: [],
      });
    }

    if (rawItems.length !== GBJ_CHECKLIST_COUNT) {
      throw new BadRequestException({
        success: false,
        message: `Checklist GBJ harus ${GBJ_CHECKLIST_COUNT} item, diterima ${rawItems.length}.`,
        errors: [],
      });
    }

    // Strict boolean validation — "false" string = truthy, would bypass
    const validatedItems: Array<{ ok: boolean; photo: string | null }> = [];

    for (let i = 0; i < rawItems.length; i++) {
      const raw = rawItems[i] as any;

      if (typeof raw?.ok !== 'boolean') {
        throw new BadRequestException({
          success: false,
          message: `checklistItems.items[${i}].ok harus bertipe boolean, diterima ${typeof raw?.ok} ("${raw?.ok}").`,
          errors: [],
        });
      }

      let photo: string | null = null;

      if (!raw.ok) {
        // NOT OK item — photo evidence required
        if (!raw.photo || typeof raw.photo !== 'string') {
          throw new BadRequestException({
            success: false,
            message: `Item ${i + 1} ("${GBJ_CHECKLIST_ITEMS[i]}") ditandai NOT OK tetapi tidak memiliki bukti foto.`,
            errors: [],
          });
        }

        // Photo MIME validation
        const mimeMatch = raw.photo.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
        if (!mimeMatch) {
          throw new BadRequestException({
            success: false,
            message: `Foto item ${i + 1} bukan format data URI base64 yang valid.`,
            errors: [],
          });
        }

        const detectedMime = mimeMatch[1].toLowerCase();
        if (!ALLOWED_PHOTO_MIMES.includes(detectedMime)) {
          throw new BadRequestException({
            success: false,
            message: `Foto item ${i + 1} MIME "${detectedMime}" tidak diizinkan. Hanya ${ALLOWED_PHOTO_MIMES.join(', ')} yang diterima.`,
            errors: [],
          });
        }

        // Base64 decoded size estimation (base64 is ~4/3 of raw)
        const base64Data = raw.photo.substring(raw.photo.indexOf(',') + 1);
        const estimatedBytes = Math.ceil((base64Data.length * 3) / 4);
        if (estimatedBytes > MAX_PHOTO_DECODED_BYTES) {
          throw new BadRequestException({
            success: false,
            message: `Foto item ${i + 1} terlalu besar (${Math.round(estimatedBytes / 1024)}KB). Maksimum ${MAX_PHOTO_DECODED_BYTES / 1024}KB.`,
            errors: [],
          });
        }

        photo = raw.photo;
      }

      validatedItems.push({ ok: raw.ok, photo });
    }

    // ═══════════════════════════════════════════
    // STEP 2: Server Computes Checklist State
    // ═══════════════════════════════════════════
    const notOkIndices = validatedItems
      .map((item, idx) => (!item.ok ? idx : -1))
      .filter((idx) => idx >= 0);

    const serverHasDeviation = notOkIndices.length > 0;

    const hasCriticalNotOk = notOkIndices.some(
      (idx) => GBJ_CHECKLIST_SEVERITY[idx] === 'CRITICAL',
    );

    // ═══════════════════════════════════════════
    // STEP 3: Determine Effective Decision Mode
    // ═══════════════════════════════════════════
    let effectiveDecisionMode: QcVehicleDecisionMode;

    if (dto.decisionMode) {
      effectiveDecisionMode = dto.decisionMode as QcVehicleDecisionMode;
    } else {
      // Safe legacy derivation — NOT a bypass
      if (dto.result === 'PASS' && !serverHasDeviation) {
        effectiveDecisionMode = 'NORMAL_PASS';
      } else if (dto.result === 'REJECT' && serverHasDeviation) {
        effectiveDecisionMode = 'REJECTED';
      } else {
        throw new BadRequestException({
          success: false,
          message: `Kombinasi result="${dto.result}" tidak valid dengan kondisi checklist (hasDeviation=${serverHasDeviation}). Gunakan field decisionMode untuk kontrol eksplisit.`,
          errors: [],
        });
      }
    }

    // ═══════════════════════════════════════════
    // STEP 4: Validate Decision Matrix
    // ═══════════════════════════════════════════
    if (effectiveDecisionMode === 'NORMAL_PASS') {
      if (serverHasDeviation) {
        throw new BadRequestException({
          success: false,
          message:
            'NORMAL_PASS tidak diperbolehkan jika terdapat item NOT OK pada checklist.',
          errors: [],
        });
      }
    }

    if (effectiveDecisionMode === 'APPROVED_WITH_DEVIATION') {
      if (!serverHasDeviation) {
        throw new BadRequestException({
          success: false,
          message:
            'APPROVED_WITH_DEVIATION tidak valid jika seluruh checklist OK. Gunakan NORMAL_PASS.',
          errors: [],
        });
      }
      if (hasCriticalNotOk) {
        const criticalLabels = notOkIndices
          .filter((idx) => GBJ_CHECKLIST_SEVERITY[idx] === 'CRITICAL')
          .map((idx) => `${idx + 1}. ${GBJ_CHECKLIST_ITEMS[idx]}`);
        throw new BadRequestException({
          success: false,
          message: `APPROVED_WITH_DEVIATION tidak diperbolehkan karena terdapat temuan CRITICAL: ${criticalLabels.join('; ')}. Kendaraan wajib ditolak (REJECTED).`,
          errors: [],
        });
      }
      if (
        !dto.deviationReason ||
        dto.deviationReason.trim().length < MIN_DEVIATION_REASON_LENGTH
      ) {
        throw new BadRequestException({
          success: false,
          message: `Alasan deviation (deviationReason) wajib diisi minimal ${MIN_DEVIATION_REASON_LENGTH} karakter.`,
          errors: [],
        });
      }
    }

    if (effectiveDecisionMode === 'REJECTED') {
      if (!serverHasDeviation) {
        throw new BadRequestException({
          success: false,
          message: 'REJECTED tidak valid jika seluruh checklist OK.',
          errors: [],
        });
      }
    }

    // ═══════════════════════════════════════════
    // STEP 5: Server Determines Result & Status
    // ═══════════════════════════════════════════
    const serverResult: 'PASS' | 'REJECT' =
      effectiveDecisionMode === 'NORMAL_PASS' ||
      effectiveDecisionMode === 'APPROVED_WITH_DEVIATION'
        ? 'PASS'
        : 'REJECT';

    const nextStatus: TransactionStatus =
      serverResult === 'PASS' ? 'QC_VEHICLE_PASSED' : 'QC_VEHICLE_REJECTED';

    assertValidStatusTransition(tx.status, nextStatus);

    // ═══════════════════════════════════════════
    // STEP 6: Atomic Prisma Transaction (CAS-first)
    // ═══════════════════════════════════════════
    const now = new Date();
    const serverChecklistItems = {
      items: validatedItems.map((item, idx) => ({
        label: GBJ_CHECKLIST_ITEMS[idx],
        ok: item.ok,
        photo: item.photo,
        severity: GBJ_CHECKLIST_SEVERITY[idx],
      })),
    };

    const updated = await this.prisma.$transaction(async (prisma) => {
      // 1. CAS claim FIRST
      const claimed = await prisma.transaction.updateMany({
        where: {
          id: tx.id,
          status: tx.status,
          revision: tx.revision,
        },
        data: {
          status: nextStatus,
          revision: { increment: 1 },
          qcStartAt: tx.qcStartAt || now,
          qcEndAt: now,
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException({
          success: false,
          message:
            'Transaksi telah diperbarui atau diproses secara bersamaan oleh pengguna lain (Concurrency Conflict).',
          errors: [],
        });
      }

      // 2. Create QcVehicleCheck
      const maxRev = await prisma.qcVehicleCheck.aggregate({
        where: { transactionId: tx.id },
        _max: { revision: true },
      });
      const nextRevision = (maxRev._max.revision ?? 0) + 1;

      await prisma.qcVehicleCheck.create({
        data: {
          transactionId: tx.id,
          revision: nextRevision,
          result: serverResult,
          decisionMode: effectiveDecisionMode,
          hasDeviation: serverHasDeviation,
          deviationReason:
            effectiveDecisionMode === 'APPROVED_WITH_DEVIATION'
              ? dto.deviationReason!.trim()
              : null,
          vehicleCleanliness: this.booleanToCheckResult(dto.vehicleCleanliness),
          vehicleOdor: this.booleanToCheckResult(dto.vehicleOdor),
          pestEvidence: this.booleanToCheckResult(dto.pestEvidence),
          vehicleCondition: this.booleanToCheckResult(dto.vehicleCondition),
          documentCompleteness: this.booleanToCheckResult(
            dto.documentCompleteness,
          ),
          sealCondition: this.booleanToCheckResult(dto.sealCondition),
          notes: dto.notes,
          checklistItems: serverChecklistItems,
          checkedById: userId,
          startedAt: tx.qcStartAt || now,
          completedAt: now,
        },
      });

      // 3. Status History
      await prisma.transactionStatusHistory.create({
        data: {
          transactionId: tx.id,
          oldStatus: tx.status,
          newStatus: nextStatus,
          changedById: userId,
          notes: `Vehicle Check: ${effectiveDecisionMode} → ${serverResult}`,
        },
      });

      // 4. Activity Log — Atomic within this transaction
      const activityAction =
        effectiveDecisionMode === 'NORMAL_PASS'
          ? 'QC_VEHICLE_APPROVED'
          : effectiveDecisionMode === 'APPROVED_WITH_DEVIATION'
            ? 'QC_VEHICLE_APPROVED_WITH_DEVIATION'
            : 'QC_VEHICLE_REJECTED';

      const activityDescription: Record<string, any> = {
        decisionMode: effectiveDecisionMode,
        plateNumber: tx.plateNumber,
        checklistItemCount: GBJ_CHECKLIST_COUNT,
        notOkCount: notOkIndices.length,
      };

      if (notOkIndices.length > 0) {
        activityDescription.notOkItems = notOkIndices.map((idx) => ({
          index: idx,
          label: GBJ_CHECKLIST_ITEMS[idx],
          severity: GBJ_CHECKLIST_SEVERITY[idx],
        }));
      }

      if (effectiveDecisionMode === 'APPROVED_WITH_DEVIATION') {
        activityDescription.deviationReason = dto.deviationReason!.trim();
      }

      await this.activityLogsService.logAction(
        {
          userId,
          action: activityAction,
          module: 'QC',
          referenceId: tx.id,
          description: activityDescription,
          status: 'SUCCESS',
        },
        prisma,
      );

      return prisma.transaction.findUnique({
        where: { id: tx.id },
        include: { qcVehicleChecks: true },
      });
    });

    return {
      success: true,
      message: `Vehicle QC result submitted (${effectiveDecisionMode})`,
      data: updated,
    };
  }

  async submitIncomingCheck(
    transactionId: string,
    dto: IncomingCheckResultDto,
    userId: string,
    user?: JwtPayloadUser,
  ) {
    const tx = await this.findTransactionWithAccess(transactionId, user, {
      incomingMaterialChecks: { where: { isCurrent: true } },
    });

    if (!['GBB', 'GSP'].includes(tx.processType))
      throw new BadRequestException(
        'Incoming check is only for GBB or GSP process types',
      );
    if (
      tx.status !== 'INCOMING_CHECK_IN_PROGRESS' &&
      tx.status !== 'INCOMING_CHECK_PENDING'
    )
      throw new BadRequestException(
        'Transaction must be in INCOMING_CHECK_PENDING or INCOMING_CHECK_IN_PROGRESS state.',
      );
    if ((tx as any).incomingMaterialChecks?.length > 0)
      throw new BadRequestException(
        'Result has already been submitted for this transaction',
      );

    const result = dto.result === 'PASS' ? 'PASS' : 'REJECT';
    const nextStatus =
      result === 'PASS' ? 'INCOMING_CHECK_PASSED' : 'INCOMING_CHECK_REJECTED';

    assertValidStatusTransition(tx.status, nextStatus);

    const updated = await this.prisma.$transaction(async (prisma) => {
      const existingCount = await prisma.incomingMaterialCheck.count({
        where: { transactionId, isCurrent: true },
      });
      if (existingCount > 0) {
        throw new BadRequestException(
          'Result has already been submitted for this transaction',
        );
      }

      const maxRev = await prisma.incomingMaterialCheck.aggregate({
        where: { transactionId },
        _max: { revision: true },
      });
      const nextRevision = (maxRev._max.revision ?? 0) + 1;

      await prisma.incomingMaterialCheck.create({
        data: {
          transactionId,
          revision: nextRevision,
          result: result,
          odor: this.mapToCheckResult(dto.odor),
          color: this.mapToCheckResult(dto.color),
          moisture: dto.moisture,
          foreignMatter: dto.foreignMatter,
          beanCondition: this.booleanToCheckResult(dto.beanCondition),
          sampleWeight: dto.sampleWeight,
          goodBeanPercentage: dto.goodBeanPercentage,
          itemCondition: this.booleanToCheckResult(dto.itemCondition),
          packagingCondition: this.booleanToCheckResult(dto.packagingCondition),
          quantityCheck: this.booleanToCheckResult(dto.quantityCheck),
          documentCheck: this.booleanToCheckResult(dto.documentCheck),
          visualInspection: this.booleanToCheckResult(dto.visualInspection),
          defectNotes: dto.defectNotes,
          notes: dto.notes,
          checkedById: userId,
          startedAt: tx.incomingQcStartAt || new Date(),
          completedAt: new Date(),
        },
      });

      const claimed = await prisma.transaction.updateMany({
        where: {
          id: transactionId,
          status: tx.status,
          revision: tx.revision,
        },
        data: {
          status: nextStatus,
          revision: { increment: 1 },
          incomingQcStartAt: tx.incomingQcStartAt || new Date(),
          qcEndAt: new Date(),
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException({
          success: false,
          message:
            'Transaksi telah diperbarui atau diproses secara bersamaan oleh pengguna lain (Concurrency Conflict).',
          errors: [],
        });
      }

      await prisma.transactionStatusHistory.create({
        data: {
          transactionId,
          oldStatus: tx.status,
          newStatus: nextStatus,
          changedById: userId,
          notes: `Incoming Check: ${result}`,
        },
      });

      return prisma.transaction.findUnique({
        where: { id: transactionId },
        include: { incomingMaterialChecks: true },
      });
    });

    await this.activityLogsService.logAction({
      userId,
      action: 'QC_INCOMING_RESULT',
      module: 'QC',
      referenceId: transactionId,
      description: { result },
      status: 'SUCCESS',
    });

    return {
      success: true,
      message: `Incoming QC result submitted (${result})`,
      data: updated,
    };
  }

  async getDetail(transactionId: string, user?: JwtPayloadUser) {
    const tx = await this.findTransactionWithAccess(transactionId, user, {
      qcVehicleChecks: { where: { isCurrent: true } },
      incomingMaterialChecks: { where: { isCurrent: true } },
      attachments: { where: { module: 'QC' } },
    });

    return {
      success: true,
      message: 'QC detail retrieved',
      data: tx,
    };
  }

  async getHistory(user: JwtPayloadUser) {
    this.authorizationScopeService.assertScopeNotEmpty(user);
    const scope = this.authorizationScopeService.getTransactionScope(user);
    const history = await this.prisma.transaction.findMany({
      where: {
        status: {
          in: [
            'QC_VEHICLE_PASSED',
            'QC_VEHICLE_REJECTED',
            'INCOMING_CHECK_PASSED',
            'INCOMING_CHECK_REJECTED',
            'WEIGH_OUT_DONE',
            'COMPLETED',
          ],
        },
        ...scope,
      },
      include: QC_HISTORY_CURRENT_RELATIONS_INCLUDE,
      orderBy: { qcEndAt: 'desc' },
      take: 100,
    });

    return {
      success: true,
      message: 'QC history retrieved',
      data: history,
    };
  }

  async uploadAttachment(
    transactionId: string,
    file: any,
    dto: QcAttachmentDto,
    userId: string,
    user?: JwtPayloadUser,
  ) {
    if (!file) throw new BadRequestException('File is required');
    const tx = await this.findTransactionWithAccess(transactionId, user);

    const attachment = await this.prisma.attachment.create({
      data: {
        transactionId,
        module: 'QC',
        attachmentType: (dto.attachmentType as any) || 'PHOTO',
        originalName: file.originalname,
        fileName: file.filename,
        filePath: file.path,
        mimeType: file.mimetype,
        size: file.size,
        description: dto.description,
        uploadedById: userId,
      },
    });

    return {
      success: true,
      message: 'Attachment uploaded successfully',
      data: attachment,
    };
  }

  async completeQcAnalysis(
    transactionId: string,
    user: JwtPayloadUser,
    remarks?: string,
  ) {
    this.logger.log(
      `Marking QC analysis as completed for transaction ${transactionId} by ${user.email}`,
    );

    const tx = await this.findTransactionWithAccess(transactionId, user);

    if (tx.processType === 'GBB' && user.role === 'WAREHOUSE') {
      this.logger.warn(
        `SoD violation: Warehouse role attempted QC analysis completion on GBB transaction ${transactionId}`,
      );
      await this.activityLogsService
        .logAction({
          userId: user.id,
          action: 'SOD_VIOLATION_BLOCKED',
          module: 'QC',
          referenceId: transactionId,
          description: `Blocked Warehouse role from completing GBB QC analysis`,
          status: 'FAILED',
        })
        .catch(() => {});
      throw new ForbiddenException({
        success: false,
        message:
          'Segregation of Duties (SoD) violation: Akses ditolak! Penutupan analisa QC pada transaksi GBB wajib dieksekusi oleh tim QC atau Admin.',
        errors: [],
      });
    }

    if (tx.status !== 'WAREHOUSE_IN_PROGRESS' || tx.processType !== 'GBB') {
      throw new BadRequestException({
        success: false,
        message: 'Transaction is not in GBB WAREHOUSE_IN_PROGRESS status',
        errors: [],
      });
    }

    const updated = await this.prisma.$transaction(async (prismaTx) => {
      const claimed = await prismaTx.transaction.updateMany({
        where: {
          id: transactionId,
          status: 'WAREHOUSE_IN_PROGRESS',
          revision: tx.revision,
        },
        data: {
          revision: { increment: 1 },
          qcAnalysisCompleted: true,
          qcAnalysisCompletedAt: new Date(),
          ...(remarks && { remarks }),
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException({
          success: false,
          message:
            'Transaksi telah diperbarui atau diproses secara bersamaan oleh pengguna lain (Concurrency Conflict).',
          errors: [],
        });
      }

      if (remarks) {
        const activeProcess = await prismaTx.warehouseProcess.findFirst({
          where: { transactionId, isCurrent: true, endAt: null },
        });
        if (activeProcess) {
          await prismaTx.warehouseProcess.update({
            where: { id: activeProcess.id },
            data: { remarks },
          });
        }
      }

      return prismaTx.transaction.findUnique({
        where: { id: transactionId },
        include: {
          warehouseProcesses: {
            where: { isCurrent: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });
    });

    await this.activityLogsService
      .logAction({
        userId: user.id,
        action: 'QC_ANALYSIS_COMPLETED',
        module: 'QC',
        referenceId: transactionId,
        description: `QC analysis marked as completed for ${tx.plateNumber} by ${user.email}${remarks ? ` | ${remarks}` : ''}`,
        status: 'SUCCESS',
      })
      .catch(() => {});

    if (!updated) {
      throw new NotFoundException({
        success: false,
        message: 'Updated transaction not found',
        errors: [],
      });
    }

    return {
      success: true,
      message: 'QC analysis marked as completed',
      data: {
        ...updated,
        remarks:
          remarks ||
          updated.warehouseProcesses?.[0]?.remarks ||
          updated.remarks ||
          null,
      },
    };
  }
}
