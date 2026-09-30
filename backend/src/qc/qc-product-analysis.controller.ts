import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
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
import { QcProductAnalysisService } from './qc-product-analysis.service';
import { SubmitProductAnalysisDto } from './dto/submit-product-analysis.dto';
import { UtilityDispositionDto } from './dto/utility-disposition.dto';

@ApiTags('QC Product Analysis')
@ApiBearerAuth()
@Controller('qc')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QcProductAnalysisController {
  constructor(
    private readonly productAnalysisService: QcProductAnalysisService,
  ) {}

  @Post('product-analysis/:transactionId')
  @Roles('QC', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit lab analysis or retest for GSP cargo (Batubara, PAC, Rapid Klen)',
  })
  @ApiResponse({
    status: 200,
    description: 'Product analysis recorded successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid transition, exempt product (Solar), or state mismatch',
  })
  submitProductAnalysis(
    @Param('transactionId') transactionId: string,
    @Body() dto: SubmitProductAnalysisDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.productAnalysisService.submitProductAnalysis(
      transactionId,
      dto,
      user,
    );
  }

  @Post('disposition/:transactionId')
  @Roles('ADMIN', 'QC')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit Utility disposition for out-of-spec products (Enforces Four-Eyes Principle)',
  })
  @ApiResponse({
    status: 200,
    description: 'Utility disposition processed successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Four-Eyes Principle violation: approver cannot be testing analyst',
  })
  submitUtilityDisposition(
    @Param('transactionId') transactionId: string,
    @Body() dto: UtilityDispositionDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.productAnalysisService.submitUtilityDisposition(
      transactionId,
      dto,
      user,
    );
  }

  @Get('product-analysis/:transactionId')
  @ApiOperation({
    summary: 'Get all product analysis rounds and history for a transaction',
  })
  @ApiResponse({
    status: 200,
    description: 'Product analysis history retrieved successfully',
  })
  getAnalysisHistory(@Param('transactionId') transactionId: string) {
    return this.productAnalysisService.getAnalysisHistory(transactionId);
  }
}
