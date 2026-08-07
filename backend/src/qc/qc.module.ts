import { Module } from '@nestjs/common';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { AuthModule } from '../auth/auth.module';
import { QcService } from './qc.service';
import { QcController } from './qc.controller';

@Module({
  imports: [ActivityLogsModule, AuthModule],
  controllers: [QcController],
  providers: [QcService],
})
export class QcModule {}
