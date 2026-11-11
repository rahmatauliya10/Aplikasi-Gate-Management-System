import {
  Controller,
  Get,
  Query,
  UseGuards,
  Header,
  StreamableFile,
} from '@nestjs/common';
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
import {
  OperationHistoryExportFormat,
  OperationHistoryExportQueryDto,
  OperationHistoryQueryDto,
} from './dto/operation-history-query.dto';

const DEFAULT_OPERATION_HISTORY_EXPORT_FORMAT =
  OperationHistoryExportFormat.CSV;
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('operation-history')
  @Roles('ADMIN', 'SECURITY', 'WAREHOUSE', 'QC')
  @ApiOperation({
    summary: 'Get scoped operation history with server-side filters',
  })
  @ApiResponse({ status: 200, description: 'Operation history retrieved' })
  getOperationHistory(
    @Query() query: OperationHistoryQueryDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.reportsService.getOperationHistory(query, user);
  }

  @Get('operation-history/export')
  @Roles('ADMIN', 'SECURITY', 'WAREHOUSE', 'QC')
  @ApiOperation({ summary: 'Export scoped operation history' })
  @ApiResponse({
    status: 200,
    description: 'Operation history export generated',
  })
  async exportOperationHistory(
    @Query() query: OperationHistoryExportQueryDto,
    @CurrentUser() user: JwtPayloadUser,
  ): Promise<StreamableFile> {
    const format = query.format || DEFAULT_OPERATION_HISTORY_EXPORT_FORMAT;
    const isXls = format === OperationHistoryExportFormat.XLS;
    const contentType = isXls
      ? 'application/vnd.ms-excel;charset=utf-8'
      : 'text/csv;charset=utf-8';
    const extension = isXls ? 'xls' : 'csv';
    const stream = Readable.from(
      this.reportsService.exportOperationHistoryStream(query, user),
    );
    return new StreamableFile(stream, {
      type: contentType,
      disposition: `attachment; filename="operation-history.${extension}"`,
    });
  }

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
    const stream = Readable.from(
      this.reportsService.exportCsvStream(query, user),
    );
    return new StreamableFile(stream);
  }
}
