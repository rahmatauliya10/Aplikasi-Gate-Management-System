import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
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
  getQueue() {
    return this.qcService.getQueue();
  }

  @Post('start/:transactionId')
  @Roles('QC')
  @ApiOperation({ summary: 'Start QC process' })
  startQc(
    @Param('transactionId') id: string,
    @Body() dto: StartQcDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.qcService.startQc(id, dto, user.id);
  }

  @Post('vehicle-result/:transactionId')
  @Roles('QC')
  @ApiOperation({ summary: 'Submit vehicle check result' })
  submitVehicleCheck(
    @Param('transactionId') id: string,
    @Body() dto: VehicleCheckResultDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.qcService.submitVehicleCheck(id, dto, user.id);
  }

  @Post('incoming-result/:transactionId')
  @Roles('QC')
  @ApiOperation({ summary: 'Submit incoming material check result' })
  submitIncomingCheck(
    @Param('transactionId') id: string,
    @Body() dto: IncomingCheckResultDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.qcService.submitIncomingCheck(id, dto, user.id);
  }

  @Get('detail/:transactionId')
  @Roles('QC')
  @ApiOperation({ summary: 'Get QC detail by transaction ID' })
  getDetail(@Param('transactionId') id: string) {
    return this.qcService.getDetail(id);
  }

  @Get('history')
  @Roles('QC')
  @ApiOperation({ summary: 'Get QC history' })
  getHistory() {
    return this.qcService.getHistory();
  }

  @Post('attachments/:transactionId')
  @Roles('QC')
  @ApiOperation({ summary: 'Upload QC attachment' })
  @UseInterceptors(
    require('@nestjs/platform-express').FileInterceptor('file', {
      storage: require('multer').diskStorage({
        destination: process.env.UPLOAD_DIR || './uploads',
        filename: (req: any, file: any, cb: any) => {
          const crypto = require('crypto');
          const path = require('path');
          const randomName = crypto.randomUUID();
          const ext = path.extname(file.originalname);
          cb(null, `${randomName}${ext}`);
        },
      }),
    }),
  )
  uploadAttachment(
    @Param('transactionId') id: string,
    @UploadedFile(
      new (require('@nestjs/common').ParseFilePipe)({
        validators: [
          new (require('@nestjs/common').MaxFileSizeValidator)({
            maxSize:
              parseInt(process.env.MAX_FILE_SIZE_MB || '10') * 1024 * 1024,
          }),
          new (require('@nestjs/common').FileTypeValidator)({
            fileType: /(jpg|jpeg|png|pdf)$/,
          }),
        ],
      }),
    )
    file: any,
    @Body() dto: QcAttachmentDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.qcService.uploadAttachment(id, file, dto, user.id);
  }
}
