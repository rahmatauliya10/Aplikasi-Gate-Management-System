import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as argon2 from 'argon2';
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
      const bundlePath = await backupService.exportPortableBackupBundle(
        history[0].backupId,
      );
      expect(typeof bundlePath).toBe('string');

      const bundleContent = fs.readFileSync(bundlePath, 'utf8');
      const bundle = JSON.parse(bundleContent);

      expect(bundle).toBeDefined();
      expect(bundle.metadata.system).toBe('GMS_GATE_MANAGEMENT_SYSTEM');
      expect(bundle.manifest).toBeDefined();

      try {
        fs.unlinkSync(bundlePath);
      } catch (e) {
        // Abaikan error hapus temporary file
      }
    }
  });

  it('should execute full destructive seed -> backup -> wipe -> restore -> verify cycle', async () => {
    const adminPassword = 'DrTestAdminPassword123!';
    const passwordHash = await argon2.hash(adminPassword);

    // 1. Create temporary admin user for backup & restore authorization
    const adminUser = await prisma.user.upsert({
      where: { username: 'dr_e2e_admin' },
      update: { passwordHash, isActive: true },
      create: {
        email: 'dr_e2e_admin@gms.local',
        username: 'dr_e2e_admin',
        passwordHash,
        name: 'DR E2E Admin',
        role: 'ADMIN',
        isActive: true,
      },
    });

    const jwtUser = {
      id: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
      tokenVersion: adminUser.tokenVersion,
    };

    // 2. Seed test fixture data
    const testLog = await prisma.activityLog.create({
      data: {
        userId: adminUser.id,
        action: 'DR_RESTORE_TEST_SEED',
        module: 'SYSTEM',
        description: 'Test seed record for DR E2E destructive restore test',
        status: 'SUCCESS',
      },
    });

    // 3. Generate backup snapshot containing seeded record
    const backupPayload = await backupService.generateBackup(
      jwtUser,
      '127.0.0.1',
    );
    expect(backupPayload.metadata).toBeDefined();
    expect(backupPayload.data).toBeDefined();

    // 4. Simulate data loss / corruption (destructive wipe of test log)
    await prisma.activityLog.delete({ where: { id: testLog.id } });
    const wipedRecord = await prisma.activityLog.findUnique({
      where: { id: testLog.id },
    });
    expect(wipedRecord).toBeNull();

    // 5. Perform database restore from backup payload
    const restoreResult = await backupService.restoreDatabase(
      jwtUser,
      backupPayload,
      adminPassword,
      '127.0.0.1',
    );

    expect(restoreResult.success).toBe(true);

    // 6. Verify data is fully restored back in PostgreSQL DB
    const restoredRecord = await prisma.activityLog.findUnique({
      where: { id: testLog.id },
    });
    expect(restoredRecord).toBeDefined();
    expect(restoredRecord?.action).toBe('DR_RESTORE_TEST_SEED');

    // Clean up test records safely
    await prisma.activityLog.deleteMany({
      where: { action: 'DR_RESTORE_TEST_SEED' },
    });
    await prisma.user.delete({ where: { id: adminUser.id } });
  });
});
