import { Module } from '@nestjs/common';
import { SystemIssuesService } from './system-issues.service';
import { SystemIssuesController } from './system-issues.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [SystemIssuesService],
  controllers: [SystemIssuesController],
  exports: [SystemIssuesService],
})
export class SystemIssuesModule {}
