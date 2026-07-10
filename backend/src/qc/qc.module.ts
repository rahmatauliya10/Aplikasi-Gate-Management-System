import { Module } from '@nestjs/common';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { QcService } from './qc.service';
import { QcController } from './qc.controller';

@Module({
  imports: [ActivityLogsModule],
  controllers: [QcController],
  providers: [QcService],
})
export class QcModule {}
