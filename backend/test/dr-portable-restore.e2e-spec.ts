import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as argon2 from 'argon2';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { DatabaseBackupService } from './../src/settings/database-backup.service';
import { configureApp } from './../src/app.config';
import {
  assertDestructiveTestTargetSafe,
  DestructiveTargetValidationOptions,
} from './../src/settings/destructive-target-guard';

export { assertDestructiveTestTargetSafe, DestructiveTargetValidationOptions };

describe('Disaster Recovery & Portable Restore (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let backupService: DatabaseBackupService;

  const isolatedFixtureDir = path.join(
    __dirname,
    'fixtures',
    'tmp-dr-portable-e2e',
  );
  const isolatedUploadDir = path.join(isolatedFixtureDir, 'uploads');
  const isolatedLocalBackupDir = path.join(
    isolatedFixtureDir,
    'backups',
    'local',
  );
  const isolatedOffsiteBackupDir = path.join(
    isolatedFixtureDir,
    'backups',
    'nas',
  );

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_TEST) {
      process.env.DATABASE_URL_TEST =
        'postgresql://postgres:postgres@127.0.0.1:5432/gms_test';
    }

    // Isolate environment variables to test paths
    process.env.NODE_ENV = 'test';
    process.env.GMS_DISABLE_BACKUP_SCHEDULER = 'true';
    process.env.UPLOAD_DIR = isolatedUploadDir;
    process.env.LOCAL_BACKUP_DIR = isolatedLocalBackupDir;
    process.env.OFFSITE_BACKUP_DIR = isolatedOffsiteBackupDir;

    // Strict target validation before any application initialization or database mutation
    assertDestructiveTestTargetSafe({
      databaseUrl: process.env.DATABASE_URL_TEST,
      nodeEnv: process.env.NODE_ENV,
      gmsEnvId: process.env.GMS_ENVIRONMENT_ID,
      installationUuid: process.env.GMS_INSTALLATION_UUID,
      uploadDir: process.env.UPLOAD_DIR,
      localBackupDir: process.env.LOCAL_BACKUP_DIR,
      offsiteBackupDir: process.env.OFFSITE_BACKUP_DIR,
    });

    process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

    // Create isolated directory structure
    fs.mkdirSync(isolatedUploadDir, { recursive: true });
    fs.mkdirSync(isolatedLocalBackupDir, { recursive: true });
    fs.mkdirSync(isolatedOffsiteBackupDir, { recursive: true });

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
    // Clean up isolated fixture directory
    try {
      if (fs.existsSync(isolatedFixtureDir)) {
        fs.rmSync(isolatedFixtureDir, { recursive: true, force: true });
      }
    } catch (e) {
      // Ignore cleanup error on teardown
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

  it('should execute full multi-table destructive backup, wipe, and restore cycle (restoreDatabase & restoreFromPortableBundle)', async () => {
    const adminPassword = 'DrFullTestPassword123!';
    const passwordHash = await argon2.hash(adminPassword);

    // 1. Create temporary admin user
    const adminUser = await prisma.user.upsert({
      where: { username: 'dr_multi_admin' },
      update: { passwordHash, isActive: true },
      create: {
        email: 'dr_multi_admin@gms.local',
        username: 'dr_multi_admin',
        passwordHash,
        name: 'DR Multi Admin',
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

    // 2. Seed multi-table transaction workflow fixture (Transaction, Weighbridge, QC, Warehouse, Correction)
    const tx = await prisma.transaction.create({
      data: {
        transactionNumber: 'TRX-DR-TEST-001',
        plateNumber: 'B9999DRTest',
        driverName: 'Driver DR Test',
        driverPhone: '08123456789',
        vendorName: 'Vendor DR Test',
        vehicleType: 'TRUCK',
        processType: 'GBB',
        cargoType: 'RAW_MATERIAL',
        cargoProcessType: 'INBOUND',
        status: 'INCOMING_CHECK_IN_PROGRESS',
        remarks: 'Pengujian muatan batubara — PT. Sinar Jaya & Co. 📦✓',
        gateInAt: new Date(),
        weighbridgeRecords: {
          create: {
            ticketNumber: 'WB-DR-TEST-001',
            type: 'IN',
            weight: 15400,
            isCurrent: true,
            revision: 1,
          },
        },
        qcVehicleChecks: {
          create: {
            result: 'PASS',
            vehicleCleanliness: 'PASS',
            sealCondition: 'PASS',
            vehicleOdor: 'PASS',
            checklistItems: {
              initialMoisture: 12.4,
              items: [{ label: 'Vehicle Cleanliness', ok: true }],
            },
            isCurrent: true,
            revision: 1,
          },
        },
        incomingMaterialChecks: {
          create: {
            result: 'PASS',
            moisture: 12.4,
            foreignMatter: 0.5,
            sampleWeight: 100,
            isCurrent: true,
            revision: 1,
          },
        },
        warehouseProcesses: {
          create: {
            processType: 'GBB',
            condition: 'GOOD',
            isCurrent: true,
            revision: 1,
          },
        },
      },
    });

    // Seed correction record linked to transaction
    const correction = await prisma.transactionCorrection.create({
      data: {
        transactionId: tx.id,
        correctedById: adminUser.id,
        reason: 'Pengujian koreksi data batubara — PT. Sinar Jaya & Co. 📦✓',
        oldValues: { initialMoisture: 10.0 },
        newValues: { initialMoisture: 12.4 },
        items: {
          create: {
            targetModule: 'QC_VEHICLE',
            targetRecordId: tx.id,
            fieldName: 'checklistItems',
            newValue: JSON.stringify({ initialMoisture: 12.4, items: [] }),
          },
        },
      },
    });

    // Seed physical nested attachment files
    const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
    const qcSubdir = path.join(uploadDir, 'qc');
    const whSubdir = path.join(uploadDir, 'warehouse');
    fs.mkdirSync(qcSubdir, { recursive: true });
    fs.mkdirSync(whSubdir, { recursive: true });

    const qcFile = path.join(qcSubdir, 'dr-qc.jpg');
    const whFile = path.join(whSubdir, 'dr-wh.pdf');
    fs.writeFileSync(qcFile, 'DR_QC_FILE_CONTENT_12345');
    fs.writeFileSync(whFile, 'DR_WH_FILE_CONTENT_67890');

    // 3. Generate snapshot & portable bundle
    const backupSnapshot = await backupService.generateBackup(
      jwtUser,
      '127.0.0.1',
    );
    expect(backupSnapshot.metadata).toBeDefined();

    const history = await backupService.getBackupHistory();
    expect(history.length).toBeGreaterThan(0);
    const portableBundlePath = await backupService.exportPortableBackupBundle(
      history[0].backupId,
    );
    const bundleContent = JSON.parse(
      fs.readFileSync(portableBundlePath, 'utf8'),
    );

    // 4. DESTRUCTIVE WIPE (simulating catastrophic failure)
    await prisma.transactionCorrectionItem.deleteMany({
      where: { correctionId: correction.id },
    });
    await prisma.transactionCorrection.delete({
      where: { id: correction.id },
    });
    await prisma.warehouseProcess.deleteMany({
      where: { transactionId: tx.id },
    });
    await prisma.incomingMaterialCheck.deleteMany({
      where: { transactionId: tx.id },
    });
    await prisma.qcVehicleCheck.deleteMany({
      where: { transactionId: tx.id },
    });
    await prisma.weighbridgeRecord.deleteMany({
      where: { transactionId: tx.id },
    });
    await prisma.transaction.delete({ where: { id: tx.id } });

    // Wipe physical files
    if (fs.existsSync(qcFile)) fs.unlinkSync(qcFile);
    if (fs.existsSync(whFile)) fs.unlinkSync(whFile);

    // Assert database & physical files are wiped
    expect(
      await prisma.transaction.findUnique({ where: { id: tx.id } }),
    ).toBeNull();
    expect(fs.existsSync(qcFile)).toBe(false);
    expect(fs.existsSync(whFile)).toBe(false);

    // 5. TEST RESTORE METHOD 1: restoreDatabase()
    const restoreRes = await backupService.restoreDatabase(
      jwtUser,
      backupSnapshot,
      adminPassword,
      '127.0.0.1',
    );
    expect(restoreRes.success).toBe(true);

    // Verify physical nested files restored
    expect(fs.existsSync(qcFile)).toBe(true);
    expect(fs.readFileSync(qcFile, 'utf8')).toBe('DR_QC_FILE_CONTENT_12345');
    expect(fs.existsSync(whFile)).toBe(true);
    expect(fs.readFileSync(whFile, 'utf8')).toBe('DR_WH_FILE_CONTENT_67890');

    // Verify multi-table integrity restored
    const restoredTx = await prisma.transaction.findUnique({
      where: { id: tx.id },
      include: {
        weighbridgeRecords: true,
        qcVehicleChecks: true,
        incomingMaterialChecks: true,
        warehouseProcesses: true,
        corrections: { include: { items: true } },
      },
    });

    expect(restoredTx).not.toBeNull();
    expect(restoredTx?.plateNumber).toBe('B9999DRTest');
    expect(restoredTx?.remarks).toBe(
      'Pengujian muatan batubara — PT. Sinar Jaya & Co. 📦✓',
    );
    expect(restoredTx?.weighbridgeRecords).toHaveLength(1);
    expect(restoredTx?.qcVehicleChecks).toHaveLength(1);
    expect(restoredTx?.incomingMaterialChecks).toHaveLength(1);
    expect(restoredTx?.warehouseProcesses).toHaveLength(1);
    expect(restoredTx?.corrections).toHaveLength(1);
    expect(restoredTx?.corrections[0].reason).toBe(
      'Pengujian koreksi data batubara — PT. Sinar Jaya & Co. 📦✓',
    );

    // 6. DESTRUCTIVE WIPE AGAIN for Portable Bundle Restore test
    await prisma.transactionCorrectionItem.deleteMany({
      where: { correctionId: correction.id },
    });
    await prisma.transactionCorrection.delete({
      where: { id: correction.id },
    });
    await prisma.warehouseProcess.deleteMany({
      where: { transactionId: tx.id },
    });
    await prisma.incomingMaterialCheck.deleteMany({
      where: { transactionId: tx.id },
    });
    await prisma.qcVehicleCheck.deleteMany({
      where: { transactionId: tx.id },
    });
    await prisma.weighbridgeRecord.deleteMany({
      where: { transactionId: tx.id },
    });
    await prisma.transaction.delete({ where: { id: tx.id } });

    if (fs.existsSync(qcFile)) fs.unlinkSync(qcFile);
    if (fs.existsSync(whFile)) fs.unlinkSync(whFile);

    // 7. TEST RESTORE METHOD 2: restoreFromPortableBundle() (.gmsbackup)
    const bundleRestoreRes = await backupService.restoreFromPortableBundle(
      jwtUser,
      bundleContent,
      adminPassword,
      '127.0.0.1',
    );
    expect(bundleRestoreRes.success).toBe(true);

    // Verify physical nested files restored from portable bundle
    expect(fs.existsSync(qcFile)).toBe(true);
    expect(fs.readFileSync(qcFile, 'utf8')).toBe('DR_QC_FILE_CONTENT_12345');
    expect(fs.existsSync(whFile)).toBe(true);
    expect(fs.readFileSync(whFile, 'utf8')).toBe('DR_WH_FILE_CONTENT_67890');

    // Clean up physical test files
    if (fs.existsSync(qcFile)) fs.unlinkSync(qcFile);
    if (fs.existsSync(whFile)) fs.unlinkSync(whFile);

    // Verify multi-table data restored from portable bundle
    const bundleRestoredTx = await prisma.transaction.findUnique({
      where: { id: tx.id },
      include: {
        weighbridgeRecords: true,
        qcVehicleChecks: true,
      },
    });

    expect(bundleRestoredTx).not.toBeNull();
    expect(bundleRestoredTx?.plateNumber).toBe('B9999DRTest');
    expect(bundleRestoredTx?.remarks).toBe(
      'Pengujian muatan batubara — PT. Sinar Jaya & Co. 📦✓',
    );
    expect(bundleRestoredTx?.weighbridgeRecords[0].weight).toBe(15400);

    // Clean up temporary test records
    await prisma.transactionCorrectionItem.deleteMany({
      where: { correctionId: correction.id },
    });
    await prisma.transactionCorrection.delete({
      where: { id: correction.id },
    });
    await prisma.warehouseProcess.deleteMany({
      where: { transactionId: tx.id },
    });
    await prisma.incomingMaterialCheck.deleteMany({
      where: { transactionId: tx.id },
    });
    await prisma.qcVehicleCheck.deleteMany({
      where: { transactionId: tx.id },
    });
    await prisma.weighbridgeRecord.deleteMany({
      where: { transactionId: tx.id },
    });
    await prisma.transaction.delete({ where: { id: tx.id } });
    await prisma.user.delete({ where: { id: adminUser.id } });

    try {
      fs.unlinkSync(portableBundlePath);
    } catch (e) {
      // ignore
    }
  });

  it('should fail-closed and reject corrupted portable bundle payload without mutating database', async () => {
    const adminPassword = 'DrCorruptPassword123!';
    const passwordHash = await argon2.hash(adminPassword);

    const corruptUser = await prisma.user.create({
      data: {
        email: 'dr_corrupt_test@gms.local',
        username: 'dr_corrupt_test',
        passwordHash,
        name: 'DR Corrupt Test User',
        role: 'ADMIN',
        isActive: true,
      },
    });

    const jwtUser = {
      id: corruptUser.id,
      email: corruptUser.email,
      role: corruptUser.role,
      tokenVersion: corruptUser.tokenVersion,
    };

    const initialTxCount = await prisma.transaction.count();

    const tamperedBundle = {
      metadata: {
        system: 'GMS_GATE_MANAGEMENT_SYSTEM',
        version: '1.0.0',
        checksums: { dump: 'invalid-checksum' },
      },
      dumpBase64: Buffer.from('INVALID_CORRUPTED_DUMP_STREAM').toString(
        'base64',
      ),
      signature:
        'deadbeef00112233445566778899aabbccddeeff00112233445566778899aabb',
    };

    await expect(
      backupService.restoreFromPortableBundle(
        jwtUser,
        tamperedBundle,
        adminPassword,
        '127.0.0.1',
      ),
    ).rejects.toThrow();

    const postTxCount = await prisma.transaction.count();
    expect(postTxCount).toBe(initialTxCount);

    await prisma.user.delete({ where: { id: corruptUser.id } });
  });

  describe('Destructive Target Isolation Guard (P1-02 Negative Tests)', () => {
    it('should reject empty or missing database URL fail-closed', () => {
      expect(() =>
        assertDestructiveTestTargetSafe({
          databaseUrl: '',
          nodeEnv: 'test',
        }),
      ).toThrow(/DATABASE_URL_TEST is undefined or empty/);
    });

    it('should reject operational database name "gms" fail-closed', () => {
      expect(() =>
        assertDestructiveTestTargetSafe({
          databaseUrl: 'postgresql://postgres:postgres@localhost:5432/gms',
          nodeEnv: 'test',
        }),
      ).toThrow(/prohibited or matches operational database/);
    });

    it('should reject operational database name "gate_management_system" fail-closed', () => {
      expect(() =>
        assertDestructiveTestTargetSafe({
          databaseUrl:
            'postgresql://postgres:postgres@localhost:5432/gate_management_system',
          nodeEnv: 'test',
        }),
      ).toThrow(/prohibited or matches operational database/);
    });

    it('should reject production NODE_ENV fail-closed', () => {
      expect(() =>
        assertDestructiveTestTargetSafe({
          databaseUrl: 'postgresql://postgres:postgres@localhost:5432/gms_test',
          nodeEnv: 'production',
        }),
      ).toThrow(/NODE_ENV is set to 'production'/);
    });

    it('should reject production GMS_ENVIRONMENT_ID fail-closed', () => {
      expect(() =>
        assertDestructiveTestTargetSafe({
          databaseUrl: 'postgresql://postgres:postgres@localhost:5432/gms_test',
          gmsEnvId: 'GMS-PROD-SJA-01',
          nodeEnv: 'test',
        }),
      ).toThrow(/identified as production/);
    });

    it('should reject operational installation UUID fail-closed', () => {
      expect(() =>
        assertDestructiveTestTargetSafe({
          databaseUrl: 'postgresql://postgres:postgres@localhost:5432/gms_test',
          installationUuid: 'GMS-PROD-UUID-01',
          nodeEnv: 'test',
        }),
      ).toThrow(/belongs to an operational environment/);
    });

    it('should reject target database lacking explicit test indicator fail-closed', () => {
      expect(() =>
        assertDestructiveTestTargetSafe({
          databaseUrl:
            'postgresql://postgres:postgres@localhost:5432/operational_analytics',
          nodeEnv: 'test',
        }),
      ).toThrow(/does not contain an authorized test indicator/);
    });

    it('should reject operational uploads directory fail-closed', () => {
      expect(() =>
        assertDestructiveTestTargetSafe({
          databaseUrl: 'postgresql://postgres:postgres@localhost:5432/gms_test',
          uploadDir: path.resolve('./uploads'),
          nodeEnv: 'test',
        }),
      ).toThrow(/points to operational root storage directory/);
    });

    it('should verify that target database data remains untouched when guard rejects target', async () => {
      // Create a marker setting in current test DB
      const markerSetting = await prisma.appSetting.create({
        data: {
          key: 'SENTINEL_GUARD_MARKER_001',
          value: 'UNTOUCHED_SENTINEL_VALUE',
        },
      });

      // Attempt to invoke guard with unsafe production target
      expect(() => {
        assertDestructiveTestTargetSafe({
          databaseUrl: 'postgresql://postgres:postgres@localhost:5432/gms',
          nodeEnv: 'production',
        });
      }).toThrow();

      // Verify that marker setting is 100% intact and no mutations occurred
      const retrieved = await prisma.appSetting.findUnique({
        where: { key: 'SENTINEL_GUARD_MARKER_001' },
      });
      expect(retrieved).not.toBeNull();
      expect(retrieved?.value).toBe('UNTOUCHED_SENTINEL_VALUE');

      // Cleanup marker setting
      await prisma.appSetting.delete({
        where: { key: 'SENTINEL_GUARD_MARKER_001' },
      });
    });
  });
});
