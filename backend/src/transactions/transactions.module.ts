import { Module } from '@nestjs/common';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { AuthModule } from '../auth/auth.module';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { OperationLogCorrectionService } from './operation-log-correction.service';
import { OperationLogCorrectionController } from './operation-log-correction.controller';
import { ActiveTransactionAmendmentService } from './active-transaction-amendment.service';

@Module({
  imports: [ActivityLogsModule, AuthModule],
  controllers: [TransactionsController, OperationLogCorrectionController],
  providers: [
    TransactionsService,
    OperationLogCorrectionService,
    ActiveTransactionAmendmentService,
  ],
  exports: [
    TransactionsService,
    OperationLogCorrectionService,
    ActiveTransactionAmendmentService,
  ],
})
export class TransactionsModule {}

