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

import { CorrectTransactionDto } from './dto/correct-transaction.dto';
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

  @Get(':id/corrections')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Get correction history for a transaction (ADMIN only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Correction history retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  getCorrections(@Param('id') id: string) {
    return this.transactionsService.getTransactionCorrections(id);
  }

  @Post(':id/corrections')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Correct data on a COMPLETED transaction (ADMIN only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Completed transaction data corrected successfully',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - ADMIN role required' })
  @ApiResponse({
    status: 400,
    description: 'Transaction is not COMPLETED or reason/evidence invalid',
  })
  correct(
    @Param('id') id: string,
    @Body() dto: CorrectTransactionDto,
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
  ) {
    const rawForwarded = req.headers['x-forwarded-for'];
    const clientIp =
      typeof rawForwarded === 'string'
        ? rawForwarded.split(',')[0].trim()
        : req.ip || '127.0.0.1';
    return this.transactionsService.correctCompletedTransaction(
      id,
      dto,
      user,
      clientIp,
    );
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

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete a transaction completely' })
  @ApiResponse({ status: 200, description: 'Transaction deleted successfully' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayloadUser) {
    return this.transactionsService.remove(id, user);
  }
}
