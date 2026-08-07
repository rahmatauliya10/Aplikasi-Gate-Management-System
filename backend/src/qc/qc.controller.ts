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

@ApiTags('QC')
@ApiBearerAuth()
@Controller('qc')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QcController {
  constructor(private qcService: QcService) {}

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

  @Post('vehicle-result/:transactionId')
  @Roles('QC')
  @ApiOperation({ summary: 'Submit vehicle check result' })
  submitVehicleCheck(
    @Param('transactionId') id: string,
    @Body() dto: VehicleCheckResultDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.qcService.submitVehicleCheck(id, dto, user.id, user);
  }

  @Post('incoming-result/:transactionId')
  @Roles('QC')
  @ApiOperation({ summary: 'Submit incoming material check result' })
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
  @ApiOperation({ summary: 'Upload QC attachment' })
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
              'File tidak valid. Hanya JPG, PNG, dan PDF yang diizinkan (Maks 5MB).',
            ),
            false,
          );
        }
      },
      storage: multer.diskStorage({
        destination: './uploads/qc',
        filename: (req: any, file: any, cb: any) => {
          const uniqueSuffix =
            Date.now() + '-' + crypto.randomBytes(4).toString('hex');
          const ext = path.extname(file.originalname);
          cb(null, `${uniqueSuffix}${ext}`);
        },
      }),
    }),
  )
  uploadAttachment(
    @Param('transactionId') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({
            maxSize: 5 * 1024 * 1024,
            message: 'Ukuran file terlalu besar (Maks 5MB)',
          }),
          new FileTypeValidator({
            fileType: '.(jpeg|jpg|png|pdf)',
          }),
        ],
      }),
    )
    file: any,
    @Body() dto: QcAttachmentDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.qcService.uploadAttachment(id, file, dto, user.id, user);
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
