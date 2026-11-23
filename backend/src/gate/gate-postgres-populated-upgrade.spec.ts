import { Test, TestingModule } from '@nestjs/testing';
import { GateService } from './gate.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { getPlantDay } from '../common/utils/plant-day.util';
import { verifyTargetDatabaseFixtureIdentity } from '../settings/destructive-target-guard';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';
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
    const allowedTestIndicators = [
      'test',
      'rehearsal',
      'fixture',
      'tmp',
      'temp',
      'upgrade',
    ];
    const isAllowed = allowedTestIndicators.some((ind) => dbName.includes(ind));

    if (!isAllowed) {
      delete process.env.DATABASE_URL;
      throw new Error(
        `DATABASE_URL_TEST database "${dbName}" tidak mengandung indikator test`,
      );
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
  delete process.env.DATABASE_URL;
}

const isPgTestAvailable = Boolean(
  rawTestDbUrl &&
    process.env.DATABASE_URL === rawTestDbUrl &&
    process.env.GMS_FIXTURE_ISOLATION_UUID &&
    process.env.GMS_FIXTURE_ISOLATION_UUID.startsWith('FIXTURE-'),
);

const describePgTest = isPgTestAvailable ? describe : describe.skip;

describePgTest(
  'COR-01: Populated-Upgrade & Regex Fallback Concurrency Allocator Suite',
  () => {
    let gateService: GateService;
    let prisma: PrismaService;
    let activityLogsService: ActivityLogsService;
    let module: TestingModule;

    beforeAll(async () => {
      if (isPgTestAvailable) {
        // 1. Mandatory expected identity validation: fail-closed if run config is missing/incomplete
        const expectedFixtureUuid =
          process.env.GMS_FIXTURE_ISOLATION_UUID?.trim();
        const expectedEnvId = process.env.GMS_ENVIRONMENT_ID?.trim();

        if (
          !expectedFixtureUuid ||
          !expectedFixtureUuid.startsWith('FIXTURE-')
        ) {
          throw new Error(
            `INTEGRATION TARGET REJECTION: GMS_FIXTURE_ISOLATION_UUID is required and must start with 'FIXTURE-'. Found: '${expectedFixtureUuid || '<empty>'}'.`,
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

        // 2. Preflight verification against target guard
        await verifyTargetDatabaseFixtureIdentity(process.env.DATABASE_URL!, {
          expectedDbName: 'gms_test_upgrade',
          expectedFixtureUuid,
          expectedEnvId,
        });
      }
    });

    beforeEach(async () => {
      module = await Test.createTestingModule({
        providers: [
          GateService,
          PrismaService,
          {
            provide: ActivityLogsService,
            useValue: {
              logAction: jest.fn().mockResolvedValue({}),
            },
          },
        ],
      }).compile();

      gateService = module.get<GateService>(GateService);
      prisma = module.get<PrismaService>(PrismaService);
      activityLogsService =
        module.get<ActivityLogsService>(ActivityLogsService);
    });

    afterEach(async () => {
      if (prisma) {
        await prisma.$disconnect();
      }
      if (module) {
        await module.close();
      }
    });

    it('COR01-POPULATED-UPGRADE: Historical records with dailySequence=null trigger regex fallback and allocate [6..15] without collision', async () => {
      await prisma.$connect();

      const plantDay = getPlantDay();
      const dateKey = plantDay.dateKey;
      const prefix = `GMS-${dateKey}-`;

      // 1. Invariant check on upgraded historical baseline in PostgreSQL
      const histRows = await prisma.transaction.findMany({
        where: {
          id: { in: ['tx-hist-001', 'tx-hist-002', 'tx-hist-005'] },
        },
        select: {
          id: true,
          transactionNumber: true,
          dailySequence: true,
          status: true,
        },
        orderBy: { transactionNumber: 'asc' },
      });

      expect(histRows).toHaveLength(3);
      expect(histRows[0].transactionNumber).toBe(`${prefix}0001`);
      expect(histRows[0].dailySequence).toBeNull();
      expect(histRows[0].status).toBe('COMPLETED');

      expect(histRows[1].transactionNumber).toBe(`${prefix}0002`);
      expect(histRows[1].dailySequence).toBeNull();
      expect(histRows[1].status).toBe('COMPLETED');

      expect(histRows[2].transactionNumber).toBe(`${prefix}0005`);
      expect(histRows[2].dailySequence).toBeNull();
      expect(histRows[2].status).toBe('COMPLETED');

      // Verify DailyArrivalCounter has 0 rows for dateKey prior to concurrent check-ins
      const preCounter = await prisma.dailyArrivalCounter.findUnique({
        where: { dateKey },
      });
      expect(preCounter).toBeNull();

      // 2. Prepare 10 parallel check-in requests
      const jwtGateUser: JwtPayloadUser = {
        id: 'usr-operator-drill',
        email: 'operator@gms.test',
        role: 'SECURITY',
      };

      const concurrentCount = 10;
      const checkInPayloads = Array.from(
        { length: concurrentCount },
        (_, idx) => {
          const num = idx + 1;
          const plateSuffix = (3000 + num).toString();
          return {
            plateNumber: `B ${plateSuffix} UPG`,
            driverName: `Concurrent Driver ${num}`,
            driverPhone: `0811000${num.toString().padStart(4, '0')}`,
            vendorName: `Concurrent Vendor ${num}`,
            vehicleType: 'TRUCK',
            processType: ProcessType.GBB,
            cargoType: 'CPO',
            cargoProcessType: CargoProcessType.INBOUND,
          };
        },
      );

      // 3. Fire all 10 check-in requests simultaneously via Promise.allSettled
      const settledResults = await Promise.allSettled(
        checkInPayloads.map((dto) => gateService.checkIn(dto, jwtGateUser)),
      );

      const fulfilledResults: any[] = [];
      const rejectedReasons: any[] = [];

      for (const res of settledResults) {
        if (res.status === 'fulfilled') {
          fulfilledResults.push(res.value);
        } else {
          rejectedReasons.push(res.reason);
        }
      }

      // Track created IDs for strict teardown
      const createdTxIds = fulfilledResults
        .map((tx) => tx.data?.id)
        .filter(Boolean);

      try {
        expect(rejectedReasons).toHaveLength(0);
        expect(fulfilledResults).toHaveLength(concurrentCount);

        // 4. Assert allocated sequence numbers are strictly [6..15]
        const allocatedSequences = fulfilledResults
          .map((tx) => tx.data?.dailySequence)
          .sort((a, b) => a - b);
        expect(allocatedSequences).toEqual([
          6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
        ]);

        // 5. Assert 0 collision (unique set size = 10)
        const uniqueSequences = new Set(allocatedSequences);
        expect(uniqueSequences.size).toBe(concurrentCount);

        // 6. Assert transaction numbers match allocated sequences
        const allocatedTxNumbers = fulfilledResults
          .map((tx) => tx.data?.transactionNumber)
          .sort();
        const expectedTxNumbers = [
          `${prefix}0006`,
          `${prefix}0007`,
          `${prefix}0008`,
          `${prefix}0009`,
          `${prefix}0010`,
          `${prefix}0011`,
          `${prefix}0012`,
          `${prefix}0013`,
          `${prefix}0014`,
          `${prefix}0015`,
        ];
        expect(allocatedTxNumbers).toEqual(expectedTxNumbers);

        // 7. Verify persistent state directly in PostgreSQL
        const postCounter = await prisma.dailyArrivalCounter.findUnique({
          where: { dateKey },
        });
        expect(postCounter).not.toBeNull();
        expect(postCounter?.lastSeq).toBe(15);

        // 8. Verify all 10 new transactions are persisted with status 'REGISTERED'
        const persistedNewTxs = await prisma.transaction.findMany({
          where: { id: { in: createdTxIds } },
          select: {
            id: true,
            transactionNumber: true,
            dailySequence: true,
            status: true,
          },
        });
        expect(persistedNewTxs).toHaveLength(concurrentCount);
        for (const tx of persistedNewTxs) {
          expect(tx.status).toBe('REGISTERED');
          expect(tx.dailySequence).toBeGreaterThanOrEqual(6);
          expect(tx.dailySequence).toBeLessThanOrEqual(15);
        }

        // 9. Verify the 3 historical baseline records are unchanged (COMPLETED, dailySequence=null)
        const persistedHistTxs = await prisma.transaction.findMany({
          where: {
            id: { in: ['tx-hist-001', 'tx-hist-002', 'tx-hist-005'] },
          },
          select: {
            id: true,
            transactionNumber: true,
            dailySequence: true,
            status: true,
          },
        });
        expect(persistedHistTxs).toHaveLength(3);
        for (const tx of persistedHistTxs) {
          expect(tx.status).toBe('COMPLETED');
          expect(tx.dailySequence).toBeNull();
        }

        // 10. Total transactions in DB for dateKey = 13
        const totalTxs = await prisma.transaction.count({
          where: { transactionNumber: { startsWith: prefix } },
        });
        expect(totalTxs).toBe(13);
      } finally {
        // 11. Verified teardown: clean up created transactions strictly by ID
        if (createdTxIds.length > 0) {
          await prisma.transactionStatusHistory.deleteMany({
            where: { transactionId: { in: createdTxIds } },
          });
          await prisma.transaction.deleteMany({
            where: { id: { in: createdTxIds } },
          });
        }

        // Verify remaining count matches historical baseline (3)
        const remainingCount = await prisma.transaction.count({
          where: { transactionNumber: { startsWith: prefix } },
        });
        expect(remainingCount).toBe(3);

        // Clean up historical transactions and counter for test hygiene
        await prisma.transactionStatusHistory.deleteMany({
          where: {
            transactionId: {
              in: ['tx-hist-001', 'tx-hist-002', 'tx-hist-005'],
            },
          },
        });
        await prisma.transaction.deleteMany({
          where: {
            id: { in: ['tx-hist-001', 'tx-hist-002', 'tx-hist-005'] },
          },
        });
        await prisma.dailyArrivalCounter.deleteMany({
          where: { dateKey },
        });
        await prisma.user.deleteMany({
          where: { id: 'usr-operator-drill' },
        });

        const finalCount = await prisma.transaction.count({
          where: { transactionNumber: { startsWith: prefix } },
        });
        expect(finalCount).toBe(0);
      }
    });
  },
);
