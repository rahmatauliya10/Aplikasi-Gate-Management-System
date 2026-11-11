import { Module } from '@nestjs/common';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { AuthModule } from '../auth/auth.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { QcService } from './qc.service';
import { QcController } from './qc.controller';
import { QcProductAnalysisService } from './qc-product-analysis.service';
import { QcProductAnalysisController } from './qc-product-analysis.controller';

import { SpecificationProvider } from './providers/specification.provider';

@Module({
  imports: [ActivityLogsModule, AuthModule, AttachmentsModule],
  controllers: [QcController, QcProductAnalysisController],
  providers: [QcService, QcProductAnalysisService, SpecificationProvider],
  exports: [QcService, QcProductAnalysisService, SpecificationProvider],
})
export class QcModule {}
