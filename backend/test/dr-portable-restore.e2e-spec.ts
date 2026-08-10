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
        reason: 'DR E2E Test correction fixture',
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
    expect(restoredTx?.weighbridgeRecords).toHaveLength(1);
    expect(restoredTx?.qcVehicleChecks).toHaveLength(1);
    expect(restoredTx?.incomingMaterialChecks).toHaveLength(1);
    expect(restoredTx?.warehouseProcesses).toHaveLength(1);
    expect(restoredTx?.corrections).toHaveLength(1);

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
});
