import { Module } from '@nestjs/common';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { AnnouncementsModule } from './announcements/announcements.module';

@Module({
  imports: [ActivityLogsModule, AnnouncementsModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
