import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { AttachmentsService } from '../attachments/attachments.service';
import { WarehouseService } from './warehouse.service';
import { StartWarehouseDto } from './dto/start-warehouse.dto';
import { CompleteWarehouseDto } from './dto/complete-warehouse.dto';
import { WarehouseQueryDto } from './dto/warehouse-query.dto';
import { SubmitIncomingCheckDto } from './dto/submit-incoming-check.dto';

@ApiTags('Warehouse')
@ApiBearerAuth()
@Controller('warehouse')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'WAREHOUSE')
export class WarehouseController {
  constructor(
    private readonly warehouseService: WarehouseService,
    private readonly attachmentsService: AttachmentsService,
  ) {}

  @Get('queue')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get active warehouse queue' })
  @ApiResponse({ status: 200, description: 'Queue retrieved successfully' })
  getQueue(
    @Query() query: WarehouseQueryDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.warehouseService.getQueue(query, user);
  }

  @Post('start/:transactionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start warehouse process for a transaction' })
  @ApiResponse({
    status: 200,
    description: 'Warehouse process started successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or transaction flow error',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden due to lack of warehouseAccess',
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  startWarehouse(
    @Param('transactionId') transactionId: string,
    @Body() dto: StartWarehouseDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.warehouseService.startWarehouse(transactionId, dto, user);
  }

  @Post('complete/:transactionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete warehouse process and submit recorded data',
  })
  @ApiResponse({
    status: 200,
    description: 'Warehouse process completed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or transaction flow error',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden due to lack of warehouseAccess',
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  completeWarehouse(
    @Param('transactionId') transactionId: string,
    @Body() dto: CompleteWarehouseDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.warehouseService.completeWarehouse(transactionId, dto, user);
  }

  @Post('incoming-check/:transactionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit incoming check result from warehouse' })
  @ApiResponse({
    status: 200,
    description: 'Incoming check result submitted successfully',
  })
  submitIncomingCheck(
    @Param('transactionId') transactionId: string,
    @Body() dto: SubmitIncomingCheckDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.warehouseService.submitIncomingCheck(transactionId, dto, user);
  }

  @Get('process/:transactionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get warehouse process details for a transaction' })
  @ApiResponse({
    status: 200,
    description: 'Process detail retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  getProcessDetail(
    @Param('transactionId') transactionId: string,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.warehouseService.getProcessDetail(transactionId, user);
  }

  @Post('attachments/:transactionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload warehouse attachment via centralized pipeline' })
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
    @Body() dto: any,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.attachmentsService.processQuarantineUpload(
      file,
      id,
      {
        module: 'warehouse',
        attachmentType: dto?.attachmentType,
        description: dto?.description,
      },
      user,
    );
  }

  @Get('history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get warehouse processing history' })
  @ApiResponse({ status: 200, description: 'History retrieved successfully' })
  getHistory(
    @Query() query: WarehouseQueryDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.warehouseService.getHistory(query, user);
  }
}
