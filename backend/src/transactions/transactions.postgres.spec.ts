import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { CargoProcessType, ProcessType } from '@prisma/client';

// Ensure test database isolation before Prisma or Nest services are instantiated
const rawTestDbUrl = process.env.DATABASE_URL_TEST?.replace(/^"|"$/g, '');

if (rawTestDbUrl) {
  try {
    const parsedUrl = new URL(rawTestDbUrl);
    if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
      delete process.env.DATABASE_URL;
      throw new Error('DATABASE_URL_TEST harus berupa PostgreSQL URL');
    }
    const dbName = decodeURIComponent(
      parsedUrl.pathname.replace(/^\//, ''),
    ).toLowerCase();
    const allowedTestDatabases = new Set([
      'gms_test_db',
      'test_gms',
      'gms_test',
    ]);

    if (!allowedTestDatabases.has(dbName)) {
      delete process.env.DATABASE_URL;
      throw new Error(`DATABASE_URL_TEST database "${dbName}" tidak diizinkan`);
    }
    process.env.DATABASE_URL = rawTestDbUrl;
  } catch (err: any) {
    delete process.env.DATABASE_URL;
    if (err.message.includes('DATABASE_URL_TEST')) {
      throw err;
    }
    throw new Error(`Invalid DATABASE_URL_TEST format: ${err.message}`);
  }
} else {
  // If DATABASE_URL_TEST is absent, remove DATABASE_URL to avoid fallbacks to production
  delete process.env.DATABASE_URL;
}

const isPgTestAvailable = Boolean(
  rawTestDbUrl && process.env.DATABASE_URL === rawTestDbUrl,
);

const describePgTest = isPgTestAvailable ? describe : describe.skip;

describePgTest('TransactionsService PG Rollback Integration', () => {
  let service: TransactionsService;
  let prisma: PrismaService;
  let activityLogsService: ActivityLogsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TransactionsService, PrismaService, ActivityLogsService],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
    prisma = module.get<PrismaService>(PrismaService);
    activityLogsService = module.get<ActivityLogsService>(ActivityLogsService);
  });

  afterEach(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it('should verify physical PostgreSQL rollback on audit failure', async () => {
    let testTxId: string | undefined;
    let adminUserId: string | undefined;

    try {
      // Create a real Admin user fixture in test database for FK relation
      const adminUser = await prisma.user.upsert({
        where: { email: 'admin.pg.test@gms.local' },
        update: {},
        create: {
          id: 'admin-pg-uuid-fixture',
          email: 'admin.pg.test@gms.local',
          username: 'admin_pg_test',
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$fixturehash',
          name: 'Admin PG Test',
          role: 'ADMIN',
        },
      });
      adminUserId = adminUser.id;

      // Create a real transaction record in test database with valid Prisma schema fields
      const testTx = await prisma.transaction.create({
        data: {
          transactionNumber: `TRX-PG-TEST-${Date.now()}`,
          driverName: 'Driver PG Test',
          driverPhone: '08123456789',
          plateNumber: 'B 9999 PG',
          vendorName: 'Vendor PG Test',
          vehicleType: 'TRUCK',
          processType: ProcessType.GBB,
          cargoType: 'CPO',
          cargoProcessType: CargoProcessType.INBOUND,
          grossWeight: 20000,
          tareWeight: 5000,
          netWeight: 15000,
          status: 'COMPLETED',
        },
      });
      testTxId = testTx.id;

      const initialUpdatedAtIso = testTx.updatedAt.toISOString();

      // Mock activity log to throw error inside transaction scope
      jest
        .spyOn(activityLogsService, 'logAction')
        .mockRejectedValueOnce(
          new Error('Audit Log Failure - DB I/O Rollback Trigger'),
        );

      const dto = {
        reason: 'Physical PG rollback test after audit error',
        evidenceUrl: 'https://storage.gms.local/evidence/ticket-pg.pdf',
        expectedUpdatedAt: initialUpdatedAtIso,
        grossWeight: 21000,
      };

      // Attempt correction, expecting audit log error to fail the atomic transaction
      await expect(
        service.correctCompletedTransaction(testTx.id, dto, adminUser as any),
      ).rejects.toThrow('Audit Log Failure - DB I/O Rollback Trigger');

      // Query physical DB: transaction record must NOT have grossWeight updated to 21000
      const reloadedTx = await prisma.transaction.findUnique({
        where: { id: testTx.id },
      });

      expect(reloadedTx?.grossWeight).toBe(20000);
      expect(reloadedTx?.netWeight).toBe(15000);

      // Query physical DB: no correction record should exist
      const corrections = await prisma.transactionCorrection.findMany({
        where: { transactionId: testTx.id },
      });
      expect(corrections).toHaveLength(0);
    } finally {
      // Guaranteed cleanup of fixture records
      if (prisma && testTxId) {
        await prisma.transactionCorrection
          ?.deleteMany({
            where: { transactionId: testTxId },
          })
          .catch(() => {});
        await prisma.transaction
          ?.deleteMany({
            where: { id: testTxId },
          })
          .catch(() => {});
      }
      if (prisma && adminUserId) {
        await prisma.user
          ?.deleteMany({
            where: { id: adminUserId },
          })
          .catch(() => {});
      }
    }
  });
});
