import { Module } from '@nestjs/common';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { OperationLogCorrectionService } from './operation-log-correction.service';
import { OperationLogCorrectionController } from './operation-log-correction.controller';

@Module({
  imports: [ActivityLogsModule],
  controllers: [TransactionsController, OperationLogCorrectionController],
  providers: [TransactionsService, OperationLogCorrectionService],
  exports: [TransactionsService, OperationLogCorrectionService],
})
export class TransactionsModule {}
