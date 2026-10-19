import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';
import { AttachmentType } from '@prisma/client';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { validateMagicBytes } from '../common/utils/magic-byte.util';
import type { Response } from 'express';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';

const ALLOWED_MODULES = [
  'qc',
  'warehouse',
  'gate',
  'weighbridge',
  'general',
  'system',
];

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly authorizationScopeService: AuthorizationScopeService,
  ) {}

  private get baseUploadDir(): string {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    return path.resolve(uploadDir);
  }

  private get quarantineDir(): string {
    const dir = path.join(this.baseUploadDir, 'quarantine');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  async processQuarantineUpload(
    file: any,
    transactionId: string,
    dto: UploadAttachmentDto,
    user: JwtPayloadUser,
    ipAddress?: string,
  ) {
    if (!file || !file.path) {
      throw new BadRequestException('Berkas lampiran wajib diunggah.');
    }

    const tempPath = file.path;

    try {
      if (!transactionId) {
        throw new BadRequestException('ID Transaksi wajib diberikan.');
      }

      const scope = this.authorizationScopeService.getTransactionScope(user);
      const targetTx = await this.prisma.transaction.findFirst({
        where: {
          id: transactionId,
          ...scope,
        },
      });

      if (!targetTx) {
        throw new NotFoundException(
          'Transaksi tidak ditemukan atau Anda tidak memiliki akses ke transaksi ini.',
        );
      }

      if (
        ['COMPLETED', 'CANCELLED'].includes(targetTx.status) &&
        user.role !== 'ADMIN'
      ) {
        throw new BadRequestException(
          'Lampiran tidak dapat ditambahkan pada transaksi berstatus terminal (COMPLETED/CANCELLED).',
        );
      }
      // 0. Module path containment check
      const rawModule = (dto.module || 'general').trim().toLowerCase();
      if (
        rawModule.includes('..') ||
        rawModule.includes('/') ||
        rawModule.includes('\\') ||
        rawModule.includes('\0')
      ) {
        throw new BadRequestException(
          'Nama modul mengandung karakter path traversal yang dilarang.',
        );
      }

      if (!ALLOWED_MODULES.includes(rawModule)) {
        throw new BadRequestException(
          `Modul ${rawModule} tidak terdaftar pada approved allowlist.`,
        );
      }

      const destDir = path.resolve(this.baseUploadDir, rawModule);
      const relativeDir = path.relative(this.baseUploadDir, destDir);
      if (relativeDir.startsWith('..') || path.isAbsolute(relativeDir)) {
        throw new BadRequestException(
          'Target direktori modul tidak berada dalam root penyimpanan unggahan.',
        );
      }

      // 1. Magic byte validation
      const isValidMagic = validateMagicBytes(tempPath, file.mimetype);
      if (!isValidMagic) {
        throw new BadRequestException(
          'Tipe berkas tidak valid atau isi berkas tidak cocok dengan ekstensi/MIME type yang diklaim.',
        );
      }

      // 2. Compute SHA-256 checksum & read file buffer
      const fileBuffer = fs.readFileSync(tempPath);
      const sha256 = crypto
        .createHash('sha256')
        .update(fileBuffer)
        .digest('hex');

      // 3. Generate UUID physical filename and unique attachment lineage ID
      const ext = path.extname(file.originalname).toLowerCase();
      const uuidFilename = `${crypto.randomUUID()}${ext}`;
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

      const destPath = path.join(destDir, uuidFilename);
      const relativeFilePath = path
        .relative(this.baseUploadDir, destPath)
        .replace(/\\/g, '/');

      const attachmentLineageId = crypto.randomUUID();
      const attachmentType = dto.attachmentType || AttachmentType.OTHER;

      // 4. Move physical file from quarantine to permanent storage FIRST
      try {
        fs.renameSync(tempPath, destPath);
      } catch (moveErr: any) {
        this.logger.error(
          `Failed to move physical file: ${moveErr.message}`,
          moveErr.stack,
        );
        throw new InternalServerErrorException(
          'Gagal memindahkan berkas fisik ke lokasi permanen.',
        );
      }

      // 5. Create Attachment record & audit log in atomic DB transaction
      let attachment: any;
      try {
        attachment = await this.prisma.$transaction(async (prismaTx) => {
          const created = await prismaTx.attachment.create({
            data: {
              attachmentLineageId,
              transactionId,
              module: rawModule.toUpperCase(),
              attachmentType,
              originalName: file.originalname,
              fileName: uuidFilename,
              filePath: relativeFilePath,
              mimeType: file.mimetype,
              size: file.size,
              description: dto.description || null,
              uploadedById: user.id,
              sha256,
              isCurrent: true,
              revision: 1,
            },
          });

          await this.activityLogsService.logAction(
            {
              userId: user.id,
              action: 'ATTACHMENT_UPLOAD',
              module: 'ATTACHMENTS',
              referenceId: created.id,
              description: `Uploaded attachment ${file.originalname} (${sha256.substring(
                0,
                8,
              )}...) for transaction ${transactionId}`,
              status: 'SUCCESS',
              ipAddress,
            },
            prismaTx,
          );

          return created;
        });
      } catch (dbErr: any) {
        // Compensating action: Delete moved physical file if DB transaction fails
        if (fs.existsSync(destPath)) {
          try {
            fs.unlinkSync(destPath);
          } catch (unlinkErr: any) {
            this.logger.error(
              `Compensating physical file cleanup failed: ${unlinkErr.message}`,
            );
          }
        }
        throw dbErr;
      }

      return {
        success: true,
        message: 'Lampiran berhasil diunggah dan disimpan secara aman.',
        data: attachment,
      };
    } catch (err: any) {
      // Cleanup temporary quarantine file on ALL error paths
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch (cleanupErr: any) {
          this.logger.warn(`Quarantine cleanup warning: ${cleanupErr.message}`);
        }
      }
      if (
        err instanceof BadRequestException ||
        err instanceof ForbiddenException ||
        err instanceof NotFoundException
      ) {
        throw err;
      }
      this.logger.error(
        `Attachment processing failed: ${err.message}`,
        err.stack,
      );
      throw new InternalServerErrorException(
        'Gagal memproses lampiran. Hubungi administrator.',
      );
    }
  }

  async downloadAttachment(
    attachmentId: string,
    user: JwtPayloadUser,
    res: Response,
  ) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId },
      include: { transaction: true },
    });

    if (!attachment) {
      throw new NotFoundException('Lampiran tidak ditemukan.');
    }

    // Role & Warehouse Scope Authorization check
    const scope = this.authorizationScopeService.getTransactionScope(user);
    const tx = await this.prisma.transaction.findFirst({
      where: {
        id: attachment.transactionId,
        ...scope,
      },
    });

    if (!tx) {
      throw new ForbiddenException(
        'Anda tidak memiliki otoritas untuk mengunduh lampiran pada transaksi ini.',
      );
    }

    const resolvedUploadDir = path.resolve(this.baseUploadDir);
    const fullPhysicalPath = path.resolve(
      resolvedUploadDir,
      attachment.filePath,
    );

    // Path traversal safety guard
    const rel = path.relative(resolvedUploadDir, fullPhysicalPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new ForbiddenException('Akses jalur berkas tidak valid.');
    }

    if (!fs.existsSync(fullPhysicalPath)) {
      throw new NotFoundException(
        'Berkas fisik lampiran tidak ditemukan di penyimpanan server.',
      );
    }

    // SHA-256 integrity verification on download
    if (attachment.sha256) {
      const fileBuffer = fs.readFileSync(fullPhysicalPath);
      const computedSha256 = crypto
        .createHash('sha256')
        .update(fileBuffer)
        .digest('hex');

      if (computedSha256 !== attachment.sha256) {
        throw new InternalServerErrorException(
          'Integritas berkas lampiran rusak (Checksum SHA-256 tidak sesuai).',
        );
      }
    }

    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(attachment.originalName)}"`,
    );
    res.setHeader('Content-Length', attachment.size);

    const stream = fs.createReadStream(fullPhysicalPath);
    stream.pipe(res);
  }

  /**
   * Reconciles physical files in uploads against database Attachment records.
   * Detects:
   * 1. Missing physical files: DB records pointing to files that do not exist on disk.
   * 2. Orphan physical files: Files on disk not referenced by ANY DB record (active or historical)
   *    and whose modification age exceeds the safety grace period.
   * If removeOrphans is true (and dryRun is false), orphan physical files are removed safely.
   */
  async reconcileAttachmentStorage(
    options: {
      dryRun?: boolean;
      removeOrphans?: boolean;
      quarantineOrphans?: boolean;
      gracePeriodMinutes?: number;
      reason?: string;
    } = {},
    user?: JwtPayloadUser,
    ipAddress?: string,
  ) {
    // DUAL EXPLICIT AFFIRMATION RULE (Strict Fail-Closed):
    // Physical deletion or quarantine of ANY file is strictly forbidden unless BOTH conditions are explicitly met:
    // 1. dryRun === false (caller explicitly disabled simulation)
    // 2. removeOrphans === true (caller explicitly confirmed physical deletion/quarantine)
    // In ALL other combinations (e.g. dryRun: false with removeOrphans: false, or undefined/null),
    // isDeletionPermitted is FALSE and isDryRun is TRUE.
    const isDeletionPermitted =
      options.dryRun === false && options.removeOrphans === true;
    const isDryRun = !isDeletionPermitted;
    const useQuarantine = options.quarantineOrphans !== false;

    if (isDeletionPermitted && !user?.id) {
      throw new ForbiddenException(
        'Penghapusan fisik berkas memerlukan otentikasi administrator yang sah.',
      );
    }

    const gracePeriodMinutes = options.gracePeriodMinutes ?? 1440; // 24 hours default
    const gracePeriodMs = gracePeriodMinutes * 60 * 1000;
    const now = Date.now();
    const resolvedUploadDir = path.resolve(this.baseUploadDir);

    // 1. Fetch ALL attachment records from database (BOTH isCurrent: true and isCurrent: false)
    const allAttachments = await this.prisma.attachment.findMany({
      select: {
        id: true,
        transactionId: true,
        filePath: true,
        fileName: true,
        sha256: true,
        size: true,
        isCurrent: true,
        revision: true,
      },
    });

    // Defensively fetch other models referencing files in uploads (Fail-Closed on live cleanup)
    let correctionsWithEvidence: Array<{
      id: string;
      evidenceUrl: string | null;
    }> = [];
    try {
      correctionsWithEvidence = await (
        this.prisma as any
      ).transactionCorrection.findMany({
        where: { evidenceUrl: { not: null } },
        select: { id: true, evidenceUrl: true },
      });
    } catch (corrErr: any) {
      this.logger.error(
        `Failed to query transaction corrections for file protection: ${corrErr.message}`,
        corrErr.stack,
      );
      if (isDeletionPermitted) {
        throw new InternalServerErrorException(
          'Rekonsiliasi dibatalkan demi keamanan integritas: Gagal memverifikasi referensi koreksi transaksi (Fail-Closed).',
        );
      }
    }

    let issuesWithScreenshot: Array<{
      id: string;
      screenshotUrl: string | null;
    }> = [];
    try {
      issuesWithScreenshot = await (this.prisma as any).systemIssue.findMany({
        where: { screenshotUrl: { not: null } },
        select: { id: true, screenshotUrl: true },
      });
    } catch (issueErr: any) {
      this.logger.error(
        `Failed to query system issues for file protection: ${issueErr.message}`,
        issueErr.stack,
      );
      if (isDeletionPermitted) {
        throw new InternalServerErrorException(
          'Rekonsiliasi dibatalkan demi keamanan integritas: Gagal memverifikasi referensi kendala sistem (Fail-Closed).',
        );
      }
    }

    const protectedDbPathsSet = new Set<string>();
    const missingRecords: Array<{
      id: string;
      transactionId: string;
      filePath: string;
      isCurrent: boolean;
      revision: number;
    }> = [];

    const normalizeRel = (rawPath: string | null | undefined): string => {
      if (!rawPath) return '';
      return rawPath
        .replace(/^(uploads[/\\]|\/app\/uploads[/\\])/, '')
        .replace(/^[/\\]+/, '')
        .replace(/\\/g, '/');
    };

    // Index all Attachment records (active + historical)
    for (const att of allAttachments) {
      const cleanRelPath = normalizeRel(att.filePath || att.fileName);
      if (!cleanRelPath) {
        missingRecords.push({
          id: att.id,
          transactionId: att.transactionId,
          filePath: '',
          isCurrent: att.isCurrent,
          revision: att.revision,
        });
        continue;
      }

      protectedDbPathsSet.add(cleanRelPath.toLowerCase());

      const fullPhysicalPath = path.resolve(resolvedUploadDir, cleanRelPath);
      const relFromUpload = path.relative(resolvedUploadDir, fullPhysicalPath);
      const isInsideUpload =
        !relFromUpload.startsWith('..') && !path.isAbsolute(relFromUpload);

      if (!isInsideUpload || !fs.existsSync(fullPhysicalPath)) {
        missingRecords.push({
          id: att.id,
          transactionId: att.transactionId,
          filePath: cleanRelPath,
          isCurrent: att.isCurrent,
          revision: att.revision,
        });
      }
    }

    // Index TransactionCorrection evidence
    for (const corr of correctionsWithEvidence) {
      const clean = normalizeRel(corr.evidenceUrl);
      if (clean) protectedDbPathsSet.add(clean.toLowerCase());
    }

    // Index SystemIssue screenshot
    for (const issue of issuesWithScreenshot) {
      const clean = normalizeRel(issue.screenshotUrl);
      if (clean) protectedDbPathsSet.add(clean.toLowerCase());
    }

    // 2. Scan physical files on disk recursively (excluding quarantine directories)
    const scannedPhysicalFiles: string[] = [];
    if (fs.existsSync(resolvedUploadDir)) {
      const traverse = (currentDir: string) => {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            // Skip quarantine directories from orphan candidate scanning
            if (entry.name !== 'quarantine' && entry.name !== '.quarantine') {
              traverse(fullPath);
            }
          } else if (entry.isFile()) {
            const relPath = path
              .relative(resolvedUploadDir, fullPath)
              .replace(/\\/g, '/');
            scannedPhysicalFiles.push(relPath);
          }
        }
      };
      traverse(resolvedUploadDir);
    }

    // 3. Find candidate orphan physical files (files on disk not in protected set AND older than grace period)
    const orphanFiles: string[] = [];
    const filesInGracePeriod: string[] = [];
    const candidateOrphans: Array<{
      relPath: string;
      fullPath: string;
      size: number;
    }> = [];

    for (const relPath of scannedPhysicalFiles) {
      if (!protectedDbPathsSet.has(relPath.toLowerCase())) {
        const fullPath = path.resolve(resolvedUploadDir, relPath);
        try {
          const stats = fs.statSync(fullPath);
          const ageMs = now - stats.mtimeMs;
          if (ageMs < gracePeriodMs) {
            // File is within safety grace period (recent upload/in-flight), DO NOT touch
            filesInGracePeriod.push(relPath);
            continue;
          }

          orphanFiles.push(relPath);
          candidateOrphans.push({
            relPath,
            fullPath,
            size: stats.size,
          });
        } catch (statErr: any) {
          this.logger.warn(
            `Could not stat file ${relPath}: ${statErr.message}`,
          );
        }
      }
    }

    const executionId = `reconcile-${now}-${Math.random().toString(36).substring(2, 7)}`;

    // 4A. MANDATORY INTENT AUDIT LOGGING (Strict Fail-Closed BEFORE touching files)
    if (isDeletionPermitted) {
      try {
        await this.activityLogsService.logActionStrict({
          userId: user!.id,
          action: 'ATTACHMENT_RECONCILE_INTENT',
          module: 'ATTACHMENTS',
          referenceId: executionId,
          description: {
            executionId,
            mode: useQuarantine ? 'QUARANTINE' : 'PERMANENT_PURGE',
            scannedFilesCount: scannedPhysicalFiles.length,
            protectedDbRecordsCount: allAttachments.length,
            inGracePeriodCount: filesInGracePeriod.length,
            plannedOrphansCount: candidateOrphans.length,
            plannedOrphanFiles: candidateOrphans
              .slice(0, 50)
              .map((c) => c.relPath),
            reason: options.reason || 'Manual Admin Maintenance',
          },
          status: 'SUCCESS',
          ipAddress,
        });
      } catch (intentErr: any) {
        this.logger.error(
          `[Fail-Closed Audit Trail] Gagal mencatat ATTACHMENT_RECONCILE_INTENT ke database: ${intentErr.message}`,
          intentErr.stack,
        );
        throw new InternalServerErrorException(
          'Operasi pembersihan dibatalkan demi integritas data (Fail-Closed): Gagal mencatat niat audit (ActivityLog Intent) ke database sebelum memodifikasi berkas.',
        );
      }
    }

    // 4B. EXECUTE QUARANTINE OR PURGE (Only executed after intent audit is committed)
    const cleanedOrphanFiles: string[] = [];
    const quarantinedFiles: string[] = [];
    let freedBytes = 0;

    if (isDeletionPermitted) {
      const quarantineBaseDir = path.resolve(
        resolvedUploadDir,
        'quarantine',
        executionId,
      );

      for (const candidate of candidateOrphans) {
        const { relPath, fullPath, size } = candidate;
        try {
          if (!fs.existsSync(fullPath)) {
            this.logger.warn(
              `File ${relPath} disappeared before cleanup, skipping.`,
            );
            continue;
          }

          const statCheck = fs.statSync(fullPath);
          if (typeof statCheck.isFile === 'function' && !statCheck.isFile()) {
            this.logger.warn(
              `Path ${relPath} is no longer a regular file, skipping.`,
            );
            continue;
          }

          const relCheck = path.relative(resolvedUploadDir, fullPath);
          if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
            this.logger.warn(
              `Path traversal check prevented processing ${relPath}`,
            );
            continue;
          }

          if (useQuarantine) {
            const destPath = path.resolve(quarantineBaseDir, relPath);
            const destDir = path.dirname(destPath);
            if (!fs.existsSync(destDir)) {
              fs.mkdirSync(destDir, { recursive: true });
            }
            fs.renameSync(fullPath, destPath);
            quarantinedFiles.push(relPath);
            cleanedOrphanFiles.push(relPath);
            freedBytes += size;
            this.logger.log(
              `[Storage Cleanup] Quarantined orphan file: ${relPath} -> ${destPath}`,
            );
          } else {
            fs.unlinkSync(fullPath);
            cleanedOrphanFiles.push(relPath);
            freedBytes += size;
            this.logger.log(
              `[Storage Cleanup] Purged orphan file: ${relPath} (${size} bytes)`,
            );
          }
        } catch (cleanupErr: any) {
          this.logger.error(
            `Failed to process orphan file ${relPath}: ${cleanupErr.message}`,
            cleanupErr.stack,
          );
        }
      }
    }

    // 4C. STRUCTURED OUTCOME ACTIVITY LOGGING
    if (user?.id) {
      try {
        if (isDeletionPermitted) {
          await this.activityLogsService.logActionStrict({
            userId: user.id,
            action: 'ATTACHMENT_RECONCILE_PURGE',
            module: 'ATTACHMENTS',
            referenceId: executionId,
            description: {
              executionId,
              mode: useQuarantine ? 'QUARANTINE' : 'PERMANENT_PURGE',
              quarantineDirectory: useQuarantine
                ? `quarantine/${executionId}`
                : null,
              scannedFilesCount: scannedPhysicalFiles.length,
              protectedDbRecordsCount: allAttachments.length,
              inGracePeriodCount: filesInGracePeriod.length,
              orphansDetectedCount: orphanFiles.length,
              cleanedOrphansCount: cleanedOrphanFiles.length,
              quarantinedFilesCount: quarantinedFiles.length,
              freedBytes,
              reason: options.reason || 'Manual Admin Maintenance',
            },
            status: 'SUCCESS',
            ipAddress,
          });
        } else {
          await this.activityLogsService.logAction({
            userId: user.id,
            action: 'ATTACHMENT_RECONCILE_AUDIT',
            module: 'ATTACHMENTS',
            referenceId: executionId,
            description: `Storage reconciliation simulation executed (DRY_RUN). Scanned: ${scannedPhysicalFiles.length}, Protected records: ${allAttachments.length}, In Grace Period: ${filesInGracePeriod.length}, Orphans: ${orphanFiles.length}, Missing: ${missingRecords.length}. Reason: ${options.reason || 'Manual Admin Maintenance'}`,
            status: 'SUCCESS',
            ipAddress,
          });
        }
      } catch (logErr: any) {
        this.logger.error(
          `Failed to record activity log outcome for reconciliation: ${logErr.message}`,
          logErr.stack,
        );
        if (isDeletionPermitted) {
          throw new InternalServerErrorException(
            'Gagal mencatat jejak audit hasil (ActivityLog Outcome) untuk operasi pembersihan berkas.',
          );
        }
      }
    }

    this.logger.log(
      `[Storage Reconciliation] Scanned ${scannedPhysicalFiles.length} files, ${allAttachments.length} DB records. In Grace Period: ${filesInGracePeriod.length}, Orphans: ${orphanFiles.length}, Missing: ${missingRecords.length}, Cleaned: ${cleanedOrphanFiles.length} (Quarantined: ${quarantinedFiles.length}, Freed: ${freedBytes}B, DryRun: ${isDryRun})`,
    );

    return {
      success: true,
      timestamp: new Date().toISOString(),
      executionId,
      dryRun: isDryRun,
      quarantine: useQuarantine,
      gracePeriodMinutes,
      scannedFilesCount: scannedPhysicalFiles.length,
      allAttachmentsCount: allAttachments.length,
      filesInGracePeriodCount: filesInGracePeriod.length,
      filesInGracePeriod,
      orphanFilesCount: orphanFiles.length,
      orphanFiles,
      cleanedOrphanFilesCount: cleanedOrphanFiles.length,
      cleanedOrphanFiles,
      quarantinedFilesCount: quarantinedFiles.length,
      quarantinedFiles,
      freedBytes,
      missingRecordsCount: missingRecords.length,
      missingRecords,
    };
  }

  /**
   * Restores files from quarantine back to active storage directory.
   */
  async restoreQuarantinedFiles(
    executionId: string,
    user: JwtPayloadUser,
    ipAddress?: string,
  ) {
    if (!user?.id) {
      throw new ForbiddenException(
        'Pemulihan berkas karantina memerlukan otentikasi administrator.',
      );
    }

    // Sanitize executionId to avoid directory traversal
    const safeExecId = path.basename(executionId);
    const resolvedUploadDir = path.resolve(this.baseUploadDir);
    const quarantineTargetDir = path.resolve(
      resolvedUploadDir,
      'quarantine',
      safeExecId,
    );

    if (!fs.existsSync(quarantineTargetDir)) {
      throw new NotFoundException(
        `Direktori karantina untuk eksekusi ${safeExecId} tidak ditemukan.`,
      );
    }

    const restoredFiles: string[] = [];

    const traverseAndRestore = (currentDir: string) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullSourcePath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          traverseAndRestore(fullSourcePath);
        } else if (entry.isFile()) {
          const relFromQuarantine = path
            .relative(quarantineTargetDir, fullSourcePath)
            .replace(/\\/g, '/');
          const destPath = path.resolve(resolvedUploadDir, relFromQuarantine);
          const destDir = path.dirname(destPath);
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
          }
          fs.renameSync(fullSourcePath, destPath);
          restoredFiles.push(relFromQuarantine);
        }
      }
    };

    traverseAndRestore(quarantineTargetDir);

    // Audit restore action
    try {
      await this.activityLogsService.logActionStrict({
        userId: user.id,
        action: 'ATTACHMENT_RECONCILE_RESTORE',
        module: 'ATTACHMENTS',
        referenceId: safeExecId,
        description: {
          executionId: safeExecId,
          restoredFilesCount: restoredFiles.length,
          restoredFiles,
        },
        status: 'SUCCESS',
        ipAddress,
      });
    } catch (auditErr: any) {
      this.logger.warn(
        `Failed to log restore audit for ${safeExecId}: ${auditErr.message}`,
      );
    }

    return {
      success: true,
      executionId: safeExecId,
      restoredFilesCount: restoredFiles.length,
      restoredFiles,
    };
  }
}
