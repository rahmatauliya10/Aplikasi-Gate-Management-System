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

export interface UploadAttachmentDto {
  module?: string;
  attachmentType?: AttachmentType;
  description?: string;
}

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

      // 3. Generate UUID physical filename
      const ext = path.extname(file.originalname).toLowerCase();
      const uuidFilename = `${crypto.randomUUID()}${ext}`;
      const moduleFolder = (dto.module || 'general').toLowerCase();
      const destDir = path.join(this.baseUploadDir, moduleFolder);
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

      const destPath = path.join(destDir, uuidFilename);
      const relativeFilePath = path
        .relative(this.baseUploadDir, destPath)
        .replace(/\\/g, '/');

      // 4. Create Attachment record in atomic database transaction
      const attachmentType = dto.attachmentType || AttachmentType.OTHER;

      const attachment = await this.prisma.$transaction(async (prismaTx) => {
        const created = await prismaTx.attachment.create({
          data: {
            transactionId,
            module: moduleFolder.toUpperCase(),
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

      // 5. Atomic file move from quarantine to permanent storage
      fs.renameSync(tempPath, destPath);

      return {
        success: true,
        message: 'Lampiran berhasil diunggah dan disimpan secara aman.',
        data: attachment,
      };
    } catch (err: any) {
      // Cleanup temporary file on ALL error paths
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
