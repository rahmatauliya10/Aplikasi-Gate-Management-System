import { Module } from '@nestjs/common';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { DatabaseBackupController } from './database-backup.controller';
import { DatabaseBackupService } from './database-backup.service';
import { AnnouncementsModule } from './announcements/announcements.module';

@Module({
  imports: [ActivityLogsModule, AnnouncementsModule],
  controllers: [DatabaseBackupController, SettingsController],
  providers: [SettingsService, DatabaseBackupService],
})
export class SettingsModule {}
