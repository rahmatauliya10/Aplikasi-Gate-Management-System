import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { OperationLogCorrectionService } from './operation-log-correction.service';
import { CreateOperationLogCorrectionDto } from './dto/create-operation-log-correction.dto';
import type { Request } from 'express';

@ApiTags('Transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('transactions')
export class OperationLogCorrectionController {
  constructor(
    private readonly correctionService: OperationLogCorrectionService,
  ) {}

  @Get(':id/operation-log-corrections')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Get operation log correction history and attribution for a transaction (ADMIN only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Operation log correction history retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  getOperationLogCorrections(@Param('id') id: string) {
    return this.correctionService.getOperationLogCorrections(id);
  }

  @Post(':id/operation-log-corrections')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit atomic operation log correction across modules (ADMIN only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Operation log data corrected and audited atomically',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - ADMIN role required' })
  @ApiResponse({ status: 409, description: 'Conflict - Stale revision / OCC failure' })
  @ApiResponse({
    status: 400,
    description: 'Transaction is not terminal or allowlist/business rule validation failed',
  })
  correctOperationLog(
    @Param('id') id: string,
    @Body() dto: CreateOperationLogCorrectionDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req?: Request,
  ) {
    const ipAddress = req?.ip || req?.headers['x-forwarded-for']?.toString();
    return this.correctionService.correctOperationLog(id, dto, user, ipAddress);
  }
}
