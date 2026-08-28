import { Test } from '@nestjs/testing';
import { BackupOnlyModule } from './backup-only.module';
import { DatabaseBackupService } from './database-backup.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';

describe('BackupOnlyModule Isolation Test', () => {
  it('should compile and provide DatabaseBackupService without requiring JWT secrets or AuthModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [BackupOnlyModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        $queryRaw: jest.fn(),
      })
      .overrideProvider(ActivityLogsService)
      .useValue({
        logAction: jest.fn(),
      })
      .compile();

    const backupService = moduleRef.get<DatabaseBackupService>(
      DatabaseBackupService,
    );
    expect(backupService).toBeDefined();
    expect(typeof backupService.runAutomatedScheduledBackup).toBe('function');
  });
});
