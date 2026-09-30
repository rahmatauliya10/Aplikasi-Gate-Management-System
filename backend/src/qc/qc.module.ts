import { Module } from '@nestjs/common';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { AuthModule } from '../auth/auth.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { QcService } from './qc.service';
import { QcController } from './qc.controller';
import { QcProductAnalysisService } from './qc-product-analysis.service';
import { QcProductAnalysisController } from './qc-product-analysis.controller';

@Module({
  imports: [ActivityLogsModule, AuthModule, AttachmentsModule],
  controllers: [QcController, QcProductAnalysisController],
  providers: [QcService, QcProductAnalysisService],
  exports: [QcService, QcProductAnalysisService],
})
export class QcModule {}

