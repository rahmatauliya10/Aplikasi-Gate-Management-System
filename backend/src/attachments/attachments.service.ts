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
      where: { id: attachmentId, isCurrent: true },
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
      gracePeriodMinutes?: number;
      reason?: string;
    } = {},
    user?: JwtPayloadUser,
    ipAddress?: string,
  ) {
    const isDryRun = options.dryRun ?? (options.removeOrphans ? false : true);
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

    // Defensively fetch other models referencing files in uploads
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
    } catch {
      // Ignored if table not initialized
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
    } catch {
      // Ignored if table not initialized
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

    // 2. Scan physical files on disk recursively
    const scannedPhysicalFiles: string[] = [];
    if (fs.existsSync(resolvedUploadDir)) {
      const traverse = (currentDir: string) => {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            // Skip quarantine directory from orphan cleanup
            if (entry.name !== 'quarantine') {
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

    // 3. Find orphan physical files (files on disk not in protected set AND older than grace period)
    const orphanFiles: string[] = [];
    const filesInGracePeriod: string[] = [];
    const cleanedOrphanFiles: string[] = [];
    let freedBytes = 0;

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

          if (!isDryRun) {
            const relCheck = path.relative(resolvedUploadDir, fullPath);
            if (
              !relCheck.startsWith('..') &&
              !path.isAbsolute(relCheck) &&
              fs.existsSync(fullPath)
            ) {
              const fileSize = stats.size;
              fs.unlinkSync(fullPath);
              cleanedOrphanFiles.push(relPath);
              freedBytes += fileSize;
              this.logger.log(
                `[Storage Cleanup] Purged orphan file: ${relPath} (${fileSize} bytes)`,
              );
            }
          }
        } catch (statErr: any) {
          this.logger.warn(
            `Could not stat file ${relPath}: ${statErr.message}`,
          );
        }
      }
    }

    // 4. Structured Activity Logging
    try {
      if (user?.id) {
        await this.activityLogsService.logAction({
          userId: user.id,
          action: isDryRun
            ? 'ATTACHMENT_RECONCILE_AUDIT'
            : 'ATTACHMENT_RECONCILE_PURGE',
          module: 'ATTACHMENTS',
          referenceId: `reconcile-${Date.now()}`,
          description: `Storage reconciliation executed. Mode: ${
            isDryRun ? 'DRY_RUN' : 'LIVE_CLEANUP'
          }, Scanned: ${scannedPhysicalFiles.length}, Protected DB records: ${
            allAttachments.length
          }, In Grace Period (<${gracePeriodMinutes}m): ${
            filesInGracePeriod.length
          }, Orphans: ${orphanFiles.length}, Cleaned: ${
            cleanedOrphanFiles.length
          } (${freedBytes} bytes freed), Missing: ${
            missingRecords.length
          }. Reason: ${options.reason || 'Manual Admin Maintenance'}`,
          status: 'SUCCESS',
          ipAddress,
        });
      }
    } catch (logErr: any) {
      this.logger.warn(
        `Failed to record activity log for reconciliation: ${logErr.message}`,
      );
    }

    this.logger.log(
      `[Storage Reconciliation] Scanned ${scannedPhysicalFiles.length} files, ${allAttachments.length} DB records. In Grace Period: ${filesInGracePeriod.length}, Orphans: ${orphanFiles.length}, Missing: ${missingRecords.length}, Cleaned: ${cleanedOrphanFiles.length} (Freed: ${freedBytes}B, DryRun: ${isDryRun})`,
    );

    return {
      success: true,
      timestamp: new Date().toISOString(),
      dryRun: isDryRun,
      gracePeriodMinutes,
      scannedFilesCount: scannedPhysicalFiles.length,
      allAttachmentsCount: allAttachments.length,
      filesInGracePeriodCount: filesInGracePeriod.length,
      filesInGracePeriod,
      orphanFilesCount: orphanFiles.length,
      orphanFiles,
      cleanedOrphanFilesCount: cleanedOrphanFiles.length,
      cleanedOrphanFiles,
      freedBytes,
      missingRecordsCount: missingRecords.length,
      missingRecords,
    };
  }
}
