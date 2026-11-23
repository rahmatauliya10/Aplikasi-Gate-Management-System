import { Test, TestingModule } from '@nestjs/testing';
import { GateService } from './gate.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { getPlantDay } from '../common/utils/plant-day.util';
import { verifyTargetDatabaseFixtureIdentity } from '../settings/destructive-target-guard';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { CargoProcessType, ProcessType, Role } from '@prisma/client';

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
  rawTestDbUrl.includes('gms_test_cor01') &&
  process.env.GMS_FIXTURE_ISOLATION_UUID &&
  process.env.GMS_FIXTURE_ISOLATION_UUID.startsWith('FIXTURE-'),
);

const describePgTest = isPgTestAvailable ? describe : describe.skip;

describePgTest(
  'COR-01: Populated-Upgrade & Real Concurrency Allocator Suite',
  () => {
    let gateService: GateService;
    let prisma: PrismaService;
    let activityLogsService: ActivityLogsService;

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
          expectedDbName: 'gms_test_cor01',
          expectedFixtureUuid,
          expectedEnvId,
        });
      }
    });

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
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
    });

    it('COR01-CONCURRENCY: Populated baseline with gaps must allocate from high-water mark without collision under parallel check-in', async () => {
      await prisma.$connect();

      const plantDay = getPlantDay();
      const dateKey = plantDay.dateKey;
      const prefix = `GMS-${dateKey}-`;

      const runSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const gateUserId = `user-gate-cor01-${runSuffix}`;

      const createdTxIds: string[] = [];

      try {
        // 1. Create a dedicated Gate operator user fixture
        const gateUserRecord = await prisma.user.create({
          data: {
            id: gateUserId,
            email: `gate.cor01.${runSuffix}@gms.local`,
            username: `gate_cor01_${runSuffix}`,
            passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$fixturehash',
            name: `Gate Operator COR01 ${runSuffix}`,
            role: Role.SECURITY,
          },
        });

        const jwtGateUser: JwtPayloadUser = {
          id: gateUserRecord.id,
          email: gateUserRecord.email,
          role: 'SECURITY',
        };

        // 2. Ensure DailyArrivalCounter has NO record for dateKey (simulating counter missing post-upgrade)
        await prisma.dailyArrivalCounter.deleteMany({
          where: { dateKey },
        });

        // 3. Inject 3 synthetic historical transactions on dateKey with an intentional gap:
        // Seq 1, Seq 2, and Seq 5 (Count = 3, but Max Sequence = 5!)
        const baselineSequences = [1, 2, 5];
        for (const seq of baselineSequences) {
          const seqStr = seq.toString().padStart(4, '0');
          const txNum = `${prefix}${seqStr}`;
          const baseTx = await prisma.transaction.create({
            data: {
              transactionNumber: txNum,
              dailySequence: seq,
              plateNumber: `B 100${seq} BASE`,
              driverName: `Baseline Driver ${seq}`,
              driverPhone: '08123456789',
              vendorName: 'Vendor Baseline',
              vehicleType: 'TRUCK',
              processType: ProcessType.GBB,
              cargoType: 'CPO',
              cargoProcessType: CargoProcessType.INBOUND,
              grossWeight: 10000,
              tareWeight: 3000,
              netWeight: 7000,
              status: 'COMPLETED',
              createdById: gateUserRecord.id,
            },
          });
          createdTxIds.push(baseTx.id);
        }

        // Verify baseline state in DB directly
        const preCounter = await prisma.dailyArrivalCounter.findUnique({
          where: { dateKey },
        });
        expect(preCounter).toBeNull();

        const preTxs = await prisma.transaction.findMany({
          where: { transactionNumber: { startsWith: prefix } },
          select: { transactionNumber: true, dailySequence: true },
        });
        expect(preTxs).toHaveLength(3);

        // 4. Construct 10 parallel check-in requests
        const concurrentCount = 10;
        const checkInPayloads = Array.from(
          { length: concurrentCount },
          (_, idx) => {
            const num = idx + 1;
            const plateSuffix = (2000 + num).toString();
            return {
              plateNumber: `B ${plateSuffix} COR`,
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

        // 5. Fire all 10 check-in requests simultaneously via Promise.allSettled
        const settledResults = await Promise.allSettled(
          checkInPayloads.map((payload) =>
            gateService.checkIn(payload as any, jwtGateUser),
          ),
        );

        // Always track created transactions for cleanup regardless of any failure
        const checkInResponses: any[] = [];
        const failureReasons: any[] = [];

        for (const res of settledResults) {
          if (res.status === 'fulfilled') {
            checkInResponses.push(res.value);
            if (res.value?.data?.id) {
              createdTxIds.push(res.value.data.id);
            }
          } else {
            failureReasons.push(res.reason);
          }
        }

        if (failureReasons.length > 0) {
          throw new Error(
            `Concurrent check-in failure: ${failureReasons[0]?.message || failureReasons[0]}`,
          );
        }

        expect(checkInResponses).toHaveLength(concurrentCount);

        // 6. Collect and verify allocated dailySequences
        const allocatedSequences = checkInResponses
          .map((res) => res.data.dailySequence)
          .sort((a, b) => a - b);

        // CRITICAL HIGH-WATER MARK ASSERTION:
        // Minimum allocated sequence must be 6 (max 5 + 1), NOT 4 (count 3 + 1)!
        expect(allocatedSequences[0]).toBe(6);

        // ZERO COLLISION & STRICT SEQUENTIAL MONOTONICITY:
        const expectedSequences = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
        expect(allocatedSequences).toEqual(expectedSequences);

        const uniqueSet = new Set(allocatedSequences);
        expect(uniqueSet.size).toBe(concurrentCount);

        // 7. Verify transaction numbers match allocated sequences
        const transactionNumbers = checkInResponses
          .map((res) => res.data.transactionNumber)
          .sort();

        const expectedTxNumbers = expectedSequences.map(
          (seq) => `${prefix}${seq.toString().padStart(4, '0')}`,
        );
        expect(transactionNumbers).toEqual(expectedTxNumbers);

        // 8. Verify DailyArrivalCounter in PostgreSQL reflects final high-water mark = 15
        const postCounter = await prisma.dailyArrivalCounter.findUnique({
          where: { dateKey },
        });
        expect(postCounter).not.toBeNull();
        expect(postCounter?.lastSeq).toBe(15);

        // 9. Physical DB query check: all 13 transactions exist and status is valid
        const totalTxsInDb = await prisma.transaction.findMany({
          where: { transactionNumber: { startsWith: prefix } },
          orderBy: { dailySequence: 'asc' },
        });
        expect(totalTxsInDb).toHaveLength(13);

        const newTxsInDb = totalTxsInDb.filter(
          (tx) => tx.dailySequence && tx.dailySequence >= 6,
        );
        expect(newTxsInDb).toHaveLength(10);
        for (const tx of newTxsInDb) {
          expect(tx.status).toBe('REGISTERED');
          expect(tx.createdById).toBe(gateUserRecord.id);
        }
      } finally {
        // 10. Precise teardown: delete status history, transactions, counter, and user
        if (prisma) {
          if (createdTxIds.length > 0) {
            await prisma.transactionStatusHistory
              ?.deleteMany({
                where: { transactionId: { in: createdTxIds } },
              })
              .catch(() => {});

            await prisma.transaction
              ?.deleteMany({
                where: { id: { in: createdTxIds } },
              })
              .catch(() => {});
          }

          await prisma.dailyArrivalCounter
            ?.deleteMany({
              where: { dateKey },
            })
            .catch(() => {});

          if (gateUserId) {
            await prisma.user
              ?.deleteMany({
                where: { id: gateUserId },
              })
              .catch(() => {});
          }
        }
      }
    });
  },
);
