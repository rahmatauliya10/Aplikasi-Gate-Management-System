import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  BadRequestException,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import * as multer from 'multer';
import * as crypto from 'crypto';
import * as path from 'path';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { QcService } from './qc.service';
import { StartQcDto } from './dto/start-qc.dto';
import { VehicleCheckResultDto } from './dto/vehicle-check-result.dto';
import { IncomingCheckResultDto } from './dto/incoming-check-result.dto';
import { QcAttachmentDto } from './dto/qc-attachment.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

import { AttachmentsService } from '../attachments/attachments.service';

@ApiTags('QC')
@ApiBearerAuth()
@Controller('qc')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QcController {
  constructor(
    private qcService: QcService,
    private attachmentsService: AttachmentsService,
  ) {}

  @Get('queue')
  @Roles('QC')
  @ApiOperation({ summary: 'Get QC queue (Vehicle and Incoming)' })
  getQueue(@CurrentUser() user: JwtPayloadUser) {
    return this.qcService.getQueue(user);
  }

  @Post('start/:transactionId')
  @Roles('QC')
  @ApiOperation({ summary: 'Start QC process' })
  startQc(
    @Param('transactionId') id: string,
    @Body() dto: StartQcDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.qcService.startQc(id, dto, user.id, user);
  }

  @Post('vehicle-check/:transactionId')
  @Roles('QC')
  @ApiOperation({ summary: 'Submit vehicle check result' })
  submitVehicleCheck(
    @Param('transactionId') id: string,
    @Body() dto: VehicleCheckResultDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.qcService.submitVehicleCheck(id, dto, user.id, user);
  }

  @Post('incoming-check/:transactionId')
  @Roles('QC')
  @ApiOperation({ summary: 'Submit incoming check result' })
  submitIncomingCheck(
    @Param('transactionId') id: string,
    @Body() dto: IncomingCheckResultDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.qcService.submitIncomingCheck(id, dto, user.id, user);
  }

  @Get('detail/:transactionId')
  @Roles('QC')
  @ApiOperation({ summary: 'Get QC detail by transaction ID' })
  getDetail(
    @Param('transactionId') id: string,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.qcService.getDetail(id, user);
  }

  @Get('history')
  @Roles('QC')
  @ApiOperation({ summary: 'Get QC history' })
  getHistory(@CurrentUser() user: JwtPayloadUser) {
    return this.qcService.getHistory(user);
  }

  @Post('attachments/:transactionId')
  @Roles('QC')
  @ApiOperation({ summary: 'Upload QC attachment via centralized pipeline' })
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
              'File tidak valid. Hanya JPG, PNG, dan PDF yang diizinkan (Maks 10MB).',
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
        fileSize: 10 * 1024 * 1024,
      },
    }),
  )
  uploadAttachment(
    @Param('transactionId') id: string,
    @UploadedFile() file: any,
    @Body() dto: QcAttachmentDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.attachmentsService.processQuarantineUpload(
      file,
      id,
      {
        module: 'qc',
        attachmentType: dto?.attachmentType as any,
        description: dto?.description,
      },
      user,
    );
  }

  @Post('analysis/complete/:transactionId')
  @Roles('QC', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark QC analysis as completed for GBB process' })
  @ApiResponse({ status: 200, description: 'QC analysis marked as completed' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  completeQcAnalysis(
    @Param('transactionId') transactionId: string,
    @Body() body: { remarks?: string },
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.qcService.completeQcAnalysis(
      transactionId,
      user,
      body?.remarks,
    );
  }
}
