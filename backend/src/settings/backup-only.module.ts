import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { DatabaseBackupService } from './database-backup.service';

/**
 * Isolated BackupOnlyModule
 *
 * Provides a minimal NestJS dependency injection context containing ONLY the
 * services required to perform database & attachment backups (Prisma, ActivityLogs,
 * and DatabaseBackupService).
 *
 * By isolating from AppModule, this avoids loading AuthModule, JwtModule, or
 * requiring HTTP/JWT secrets during pre-deployment migrations in the migrator container.
 */
@Module({
  providers: [PrismaService, ActivityLogsService, DatabaseBackupService],
  exports: [DatabaseBackupService],
})
export class BackupOnlyModule {}
