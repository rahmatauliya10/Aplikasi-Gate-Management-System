import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { GetDashboardStatsDto } from './dto/get-dashboard-stats.dto';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('stats')
  @ApiOperation({
    summary: 'Get dashboard statistics',
    description:
      'Returns active, completed, period counts and breakdowns filtered by date range or preset',
  })
  @ApiResponse({ status: 200, description: 'Dashboard statistics retrieved' })
  getStats(
    @CurrentUser() user: JwtPayloadUser,
    @Query() query: GetDashboardStatsDto,
  ) {
    return this.dashboardService.getStats(user, query);
  }
}
