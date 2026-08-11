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

      // 4. Create Attachment record in atomic database transaction
      const attachment = await this.prisma.$transaction(async (prismaTx) => {
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

      // 5. Atomic file move from quarantine to permanent storage with compensating cleanup
      try {
        fs.renameSync(tempPath, destPath);
      } catch (moveErr: any) {
        // Compensating action: Delete DB record if file move fails
        if (attachment?.id) {
          try {
            await this.prisma.attachment.delete({
              where: { id: attachment.id },
            });
          } catch (delErr: any) {
            this.logger.error(
              `Compensating DB cleanup failed: ${delErr.message}`,
            );
          }
        }
        throw new InternalServerErrorException(
          `Gagal memindahkan berkas fisik ke lokasi permanen: ${moveErr.message}`,
        );
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
        `Gagal memproses lampiran: ${err.message}`,
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
}
