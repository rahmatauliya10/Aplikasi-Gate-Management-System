import { Controller, Post, Get, Param, Body, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { WeighbridgeService } from './weighbridge.service';
import { WeighInDto } from './dto/weigh-in.dto';
import { WeighOutDto } from './dto/weigh-out.dto';
import { WeighbridgeQueryDto } from './dto/weighbridge-query.dto';

@ApiTags('Weighbridge')
@ApiBearerAuth()
@Controller('weighbridge')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SECURITY')
export class WeighbridgeController {
  constructor(private weighbridgeService: WeighbridgeService) {}

  @Get('queue')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get active weighbridge queue (IN/OUT) with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Queue retrieved successfully' })
  getQueue(@Query() query: WeighbridgeQueryDto, @CurrentUser() user: JwtPayloadUser) {
    return this.weighbridgeService.getQueue(query, user);
  }

  @Post('in/:transactionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process vehicle weigh-in (register first weight)' })
  @ApiResponse({ status: 200, description: 'Weighbridge in completed successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed or transaction is not in REGISTERED status' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  weighIn(
    @Param('transactionId') transactionId: string,
    @Body() dto: WeighInDto,
    @CurrentUser() user: JwtPayloadUser
  ) {
    return this.weighbridgeService.submitWeighIn(transactionId, dto, user);
  }

  @Post('out/:transactionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process vehicle weigh-out (register second weight and compute net weight)' })
  @ApiResponse({ status: 200, description: 'Weighbridge out completed successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed, wrong status, or weight calculation error' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  weighOut(
    @Param('transactionId') transactionId: string,
    @Body() dto: WeighOutDto,
    @CurrentUser() user: JwtPayloadUser
  ) {
    return this.weighbridgeService.submitWeighOut(transactionId, dto, user);
  }

  @Get('record/:transactionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get weighbridge record detail for a specific transaction' })
  @ApiResponse({ status: 200, description: 'Weighbridge record retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  getRecord(@Param('transactionId') transactionId: string, @CurrentUser() user: JwtPayloadUser) {
    return this.weighbridgeService.getRecordDetail(transactionId, user);
  }
}
