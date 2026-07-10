import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ActivityLogsService } from './activity-logs.service';
import { ActivityLogQueryDto } from './dto/activity-log-query.dto';

@ApiTags('ActivityLogs')
@ApiBearerAuth()
@Controller('activity-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActivityLogsController {
  constructor(private activityLogsService: ActivityLogsService) {}

  @Get()
  @ApiOperation({ summary: 'Get activity logs', description: 'Returns paginated activity logs with filters' })
  @ApiResponse({ status: 200, description: 'Activity logs retrieved' })
  findAll(@Query() query: ActivityLogQueryDto, @Req() req: any) {
    const user = req.user;
    
    // Only ADMIN can see all logs. Others can only see their own logs if needed.
    // Wait, the prompt says: "Only authorized roles can view Activity Log. ADMIN can view all activity logs. Other roles can only view their own activity logs if required by business rules."
    if (user.role !== 'ADMIN') {
      query.userId = user.id;
    }

    return this.activityLogsService.findAll(query);
  }
}
