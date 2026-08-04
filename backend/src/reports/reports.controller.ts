import { Controller, Get, Query, UseGuards, Header, StreamableFile } from '@nestjs/common';
import { Readable } from 'stream';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ReportsService } from './reports.service';
import { ReportQueryDto } from './dto/report-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('history')
  @Roles('ADMIN', 'SECURITY')
  @ApiOperation({
    summary: 'Get transaction history',
    description:
      'Returns completed/cancelled transactions with pagination and filters',
  })
  @ApiResponse({ status: 200, description: 'Transaction history retrieved' })
  getHistory(
    @Query() query: ReportQueryDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.reportsService.getTransactionHistory(query, user);
  }

  @Get('export')
  @Roles('ADMIN', 'SECURITY')
  @ApiOperation({ summary: 'Export transaction history as CSV' })
  @ApiResponse({ status: 200, description: 'CSV file generated' })
  @Header('Content-Type', 'text/csv')
  @Header(
    'Content-Disposition',
    'attachment; filename="transaction-history.csv"',
  )
  async exportHistory(
    @Query() query: ReportQueryDto,
    @CurrentUser() user: JwtPayloadUser,
  ): Promise<StreamableFile> {
    const stream = Readable.from(this.reportsService.exportCsvStream(query, user));
    return new StreamableFile(stream);
  }
}
