import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AttachmentsService } from './attachments.service';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';
import { AttachmentUploadAccessGuard } from './guards/attachment-upload-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import * as multer from 'multer';
import * as path from 'path';
import type { Response } from 'express';

@ApiTags('Attachments')
@ApiBearerAuth()
@Controller('attachments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('upload/:transactionId')
  @Roles('ADMIN', 'SECURITY', 'WAREHOUSE', 'QC')
  @UseGuards(AttachmentUploadAccessGuard)
  @ApiOperation({ summary: 'Upload file securely for a transaction' })
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: (req: any, file: any, cb: any) => {
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];
        const ext = path.extname(file.originalname).toLowerCase();
        const allowedExts = ['.jpg', '.jpeg', '.png', '.pdf'];
        if (
          allowedMimeTypes.includes(file.mimetype) &&
          allowedExts.includes(ext)
        ) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Hanya berkas JPG, PNG, dan PDF yang diizinkan (Maks 10MB).',
            ),
            false,
          );
        }
      },
      storage: multer.diskStorage({
        destination: (req: any, file: any, cb: any) => {
          const uploadDir = process.env.UPLOAD_DIR || './uploads';
          const quarantine = path.resolve(path.join(uploadDir, 'quarantine'));
          require('fs').mkdirSync(quarantine, { recursive: true });
          cb(null, quarantine);
        },
        filename: (req: any, file: any, cb: any) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(
            null,
            `quarantine-${uniqueSuffix}${path.extname(file.originalname)}`,
          );
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB
      },
    }),
  )
  uploadAttachment(
    @Param('transactionId') transactionId: string,
    @UploadedFile() file: any,
    @Body() dto: UploadAttachmentDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.attachmentsService.processQuarantineUpload(
      file,
      transactionId,
      dto,
      user,
    );
  }

  @Get(':id/download')
  @Roles('ADMIN', 'SECURITY', 'WAREHOUSE', 'QC')
  @ApiOperation({ summary: 'Download attachment securely' })
  downloadAttachment(
    @Param('id') attachmentId: string,
    @CurrentUser() user: JwtPayloadUser,
    @Res() res: Response,
  ) {
    return this.attachmentsService.downloadAttachment(attachmentId, user, res);
  }
}
