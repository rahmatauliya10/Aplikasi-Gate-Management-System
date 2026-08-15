import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, ActivityLogsModule, AuthModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
