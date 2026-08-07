import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { DatabaseBackupService } from './../src/settings/database-backup.service';
import { configureApp } from './../src/app.config';

describe('Disaster Recovery & Portable Restore (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let backupService: DatabaseBackupService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_TEST) {
      process.env.DATABASE_URL_TEST =
        'postgresql://postgres:postgres@127.0.0.1:5432/gms_test';
    }
    process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    backupService = app.get<DatabaseBackupService>(DatabaseBackupService);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect().catch(() => {});
    }
    if (app) {
      await app.close();
    }
  });

  it('should generate backup manifest and export portable bundle', async () => {
    const status = await backupService.getSystemStatus();
    expect(status).toBeDefined();
    expect(status.targetRpoHours).toBe(6);

    const history = await backupService.getBackupHistory();
    expect(Array.isArray(history)).toBe(true);

    if (history.length > 0) {
      const bundle = await backupService.exportPortableBackupBundle(
        history[0].backupId,
      );
      expect(bundle).toBeDefined();
      expect(bundle.metadata.system).toBe('GMS_GATE_MANAGEMENT_SYSTEM');
      expect(bundle.manifest).toBeDefined();
    }
  });
});
