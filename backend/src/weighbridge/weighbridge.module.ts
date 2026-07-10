import { Module } from '@nestjs/common';
import { WeighbridgeService } from './weighbridge.service';
import { WeighbridgeController } from './weighbridge.controller';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';

@Module({
  imports: [ActivityLogsModule],
  controllers: [WeighbridgeController],
  providers: [WeighbridgeService],
})
export class WeighbridgeModule {}
