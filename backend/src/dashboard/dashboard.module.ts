import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [AuthModule, ActivityLogsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
