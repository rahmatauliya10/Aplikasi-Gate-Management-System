import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  Body,
  HttpCode,
  HttpStatus,
  Delete,
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
import { TransactionsService } from './transactions.service';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { CancelTransactionDto } from '../gate/dto/cancel-transaction.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

import { Req } from '@nestjs/common';
import type { Request } from 'express';

@ApiTags('Transactions')
@ApiBearerAuth()
@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all transactions with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Transactions list retrieved' })
  findAll(
    @Query() query: TransactionQueryDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.transactionsService.findAll(query, user);
  }

  @Get('reopen-matrix')
  @ApiOperation({
    summary: 'Get canonical REOPEN target matrix by process type',
  })
  @ApiResponse({
    status: 200,
    description: 'Allowed REOPEN targets map retrieved',
  })
  getReopenMatrix() {
    return {
      success: true,
      data: {
        GBB: [
          'REGISTERED',
          'QC_VEHICLE_PENDING',
          'QC_VEHICLE_PASSED',
          'INCOMING_CHECK_PENDING',
        ],
        GSP: [
          'REGISTERED',
          'QC_VEHICLE_PENDING',
          'QC_VEHICLE_PASSED',
          'INCOMING_CHECK_PENDING',
        ],
        GBJ: ['REGISTERED', 'QC_VEHICLE_PENDING', 'QC_VEHICLE_PASSED'],
      },
    };
  }

  @Get('active')
  @ApiOperation({
    summary: 'Get all active (non-completed/cancelled) transactions',
  })
  @ApiResponse({
    status: 200,
    description: 'Active transactions list retrieved',
  })
  findActive(@CurrentUser() user: JwtPayloadUser) {
    return this.transactionsService.findActive(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transaction details by ID' })
  @ApiResponse({ status: 200, description: 'Transaction details retrieved' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayloadUser) {
    return this.transactionsService.findOne(id, user);
  }

  @Post(':id/cancel')
  @Roles('ADMIN', 'SECURITY')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a transaction' })
  @ApiResponse({
    status: 200,
    description: 'Transaction cancelled successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Transaction already completed or cancelled',
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelTransactionDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.transactionsService.cancel(id, dto.cancellationReason, user);
  }

  @Post(':id/void')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Administratively void a transaction (ADMIN only, Atomic CAS enforced)',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction voided successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Transaction is COMPLETED or validation failed',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - ADMIN role required',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - Stale revision / OCC CAS failure',
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  voidTransaction(
    @Param('id') id: string,
    @Body() dto: import('./dto/void-transaction.dto').VoidTransactionDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.transactionsService.voidTransaction(id, dto, user);
  }
}
