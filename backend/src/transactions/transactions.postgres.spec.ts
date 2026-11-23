import { Test, TestingModule } from '@nestjs/testing';
import { OperationLogCorrectionService } from './operation-log-correction.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import {
  CargoProcessType,
  CorrectionTargetModule,
  ProcessType,
} from '@prisma/client';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';
import { verifyTargetDatabaseFixtureIdentity } from '../settings/destructive-target-guard';

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
  rawTestDbUrl &&
  process.env.DATABASE_URL === rawTestDbUrl &&
  process.env.GMS_FIXTURE_ISOLATION_UUID &&
  process.env.GMS_FIXTURE_ISOLATION_UUID.startsWith('FIXTURE-'),
);

const describePgTest = isPgTestAvailable ? describe : describe.skip;

describePgTest('OperationLogCorrectionService PG Rollback Integration', () => {
  let service: OperationLogCorrectionService;
  let prisma: PrismaService;
  let activityLogsService: ActivityLogsService;

  beforeAll(async () => {
    if (isPgTestAvailable) {
      // 1. Mandatory expected identity validation: fail-closed if run config is missing/incomplete
      const expectedFixtureUuid =
        process.env.GMS_FIXTURE_ISOLATION_UUID?.trim();
      const expectedEnvId = process.env.GMS_ENVIRONMENT_ID?.trim();

      if (!expectedFixtureUuid || !expectedFixtureUuid.startsWith('FIXTURE-')) {
        throw new Error(
          `INTEGRATION TARGET REJECTION: GMS_FIXTURE_ISOLATION_UUID is required and must start with 'FIXTURE-'. Found: '${expectedFixtureUuid || '<empty>'}'. Explicit fixture identity proof is required before running integration tests.`,
        );
      }

      if (
        !expectedEnvId ||
        expectedEnvId === '' ||
        expectedEnvId.toUpperCase().includes('PROD')
      ) {
        throw new Error(
          `INTEGRATION TARGET REJECTION: GMS_ENVIRONMENT_ID is required and must be an explicit non-production environment. Found: '${expectedEnvId || '<empty>'}'.`,
        );
      }

      // 2. Formal preflight verification: ensures target database has been migrated
      // and stamped with positive proof of isolated fixture ownership.
      // Explicitly forbids implicit schema mutations (db push).
      await verifyTargetDatabaseFixtureIdentity(process.env.DATABASE_URL!, {
        expectedDbName: 'gms_test_db',
        expectedFixtureUuid,
        expectedEnvId,
      });
    }
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OperationLogCorrectionService,
        PrismaService,
        ActivityLogsService,
        {
          provide: AuthorizationScopeService,
          useValue: {
            getTransactionScope: jest.fn().mockReturnValue({}),
          },
        },
      ],
    }).compile();

    service = module.get<OperationLogCorrectionService>(
      OperationLogCorrectionService,
    );
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

    // Strict fail-closed: physical connection must succeed without silent return
    await prisma.$connect();

    const runSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      // Create a unique Admin user fixture in test database for FK relation
      const adminUser = await prisma.user.create({
        data: {
          id: `admin-pg-${runSuffix}`,
          email: `admin.pg.test.${runSuffix}@gms.local`,
          username: `admin_pg_${runSuffix}`,
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$fixturehash',
          name: `Admin PG Test ${runSuffix}`,
          role: 'ADMIN',
        },
      });
      adminUserId = adminUser.id;

      // Create a real transaction record in test database with valid Prisma schema fields
      const testTx = await prisma.transaction.create({
        data: {
          transactionNumber: `TRX-PG-TEST-${runSuffix}`,
          driverName: 'Driver PG Test',
          driverPhone: '08123456789',
          plateNumber: `B ${Math.floor(1000 + Math.random() * 9000)} PG`,
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

      // Mock activity log to throw error inside transaction scope
      jest
        .spyOn(activityLogsService, 'logAction')
        .mockRejectedValueOnce(
          new Error('Audit Log Failure - DB I/O Rollback Trigger'),
        );

      const dto = {
        reasonCode: 'SALAH_INPUT_ANGKA',
        remark: 'Physical PG rollback test after audit error',
        expectedRevision: testTx.revision,
        items: [
          {
            targetModule: CorrectionTargetModule.TRANSACTION,
            fieldName: 'grossWeight',
            newValue: 21000,
          },
        ],
      };

      // Attempt correction, expecting audit log error to fail the atomic transaction
      await expect(
        service.correctOperationLog(testTx.id, dto as any, adminUser as any),
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
      // Guaranteed cleanup of fixture records created during this run
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
