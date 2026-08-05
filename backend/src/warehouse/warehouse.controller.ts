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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
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
  constructor(private readonly warehouseService: WarehouseService) {}

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

  @Post('complete-qc-analysis/:transactionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark QC analysis as completed for GBB process' })
  @ApiResponse({ status: 200, description: 'QC analysis marked as completed' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  completeQcAnalysis(
    @Param('transactionId') transactionId: string,
    @Body() body: { remarks?: string },
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.warehouseService.completeQcAnalysis(
      transactionId,
      user,
      body?.remarks,
    );
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
  @ApiOperation({ summary: 'Upload warehouse attachment' })
  @UseInterceptors(
    require('@nestjs/platform-express').FileInterceptor('file', {
      fileFilter: (req: any, file: any, cb: any) => {
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];
        const path = require('path');
        const ext = path.extname(file.originalname).toLowerCase();
        const allowedExts = ['.jpg', '.jpeg', '.png', '.pdf'];
        if (
          allowedMimeTypes.includes(file.mimetype) &&
          allowedExts.includes(ext)
        ) {
          cb(null, true);
        } else {
          cb(
            new (require('@nestjs/common').BadRequestException)(
              'Invalid upload: only JPG, PNG, and PDF files are allowed.',
            ),
            false,
          );
        }
      },
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
    @Body() dto: any,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.warehouseService.uploadAttachment(id, file, dto, user);
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
