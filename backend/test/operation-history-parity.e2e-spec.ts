import { Prisma, PrismaClient } from '@prisma/client';
import { ReportsService } from '../src/reports/reports.service';
import { getOperationHistoryFraud } from '../src/reports/operation-history.util';
import { reportTestDatabaseUrl } from './helpers/report-test-database';

const testUrl = reportTestDatabaseUrl(process.env.DATABASE_URL_TEST);
const describePostgres = testUrl ? describe : describe.skip;
const timestamp = '2026-10-21T00:00:00.000Z';
const fraud = (overrides: Record<string, unknown> = {}) => ({
  id: 'check-current',
  riskLevel: 'CRITICAL',
  calculatedAt: timestamp,
  createdAt: timestamp,
  deviationPercent: 7,
  ...overrides,
});
const fixtures: any[] = [
  ...['SAFE', 'WARNING', 'CRITICAL', 'INVALID_DATA', 'PENDING_DATA'].map(
    (riskLevel) => ({
      id: `missing-weights-${riskLevel}`,
      fraudChecks: [fraud({ riskLevel })],
    }),
  ),
  { id: 'missing-net', actualWeight: 93, fraudChecks: [fraud()] },
  { id: 'missing-roll', netWeight: 100, fraudChecks: [fraud()] },
  {
    id: 'persisted-zero',
    fraudChecks: [fraud({ deviationPercent: 0, riskLevel: 'SAFE' })],
  },
  {
    id: 'persisted-wins',
    netWeight: 100,
    actualWeight: 99,
    fraudChecks: [fraud()],
  },
  { id: 'missing-all', fraudChecks: [] },
  {
    id: 'no-derived-without-net',
    actualWeight: 93,
    fraudChecks: [fraud({ deviationPercent: null })],
  },
  ...[98, 97, 95, 94].map((roll) => ({
    id: `derived-${roll}`,
    netWeight: 100,
    actualWeight: roll,
    fraudChecks: [],
  })),
  { id: 'zero-roll', netWeight: 100, actualWeight: 0, fraudChecks: [] },
  {
    id: 'latest-calculated',
    fraudChecks: [
      fraud({
        id: 'new-created-old-calculated',
        calculatedAt: '2026-10-20T00:00:00Z',
        createdAt: '2026-10-22T00:00:00Z',
        deviationPercent: 1,
        riskLevel: 'SAFE',
      }),
      fraud(),
    ],
  },
  {
    id: 'latest-created',
    fraudChecks: [
      fraud({
        id: 'z-old-created',
        createdAt: '2026-10-20T00:00:00Z',
        deviationPercent: 1,
        riskLevel: 'SAFE',
      }),
      fraud(),
    ],
  },
  {
    id: 'latest-id',
    fraudChecks: [
      fraud({ id: 'a-old', deviationPercent: 1, riskLevel: 'SAFE' }),
      fraud({ id: 'z-new' }),
    ],
  },
  ...['QC_VEHICLE_REJECTED', 'INCOMING_CHECK_REJECTED'].map((status) => ({
    id: `rejected-${status}`,
    status,
    netWeight: 100,
    actualWeight: 93,
    fraudChecks: [fraud()],
  })),
].map((tx) => ({
  processType: 'GBB',
  status: 'COMPLETED',
  createdAt: timestamp,
  ...tx,
}));

// Fixture relations shadow the production table names for this SELECT only.
// No schema, DDL, fixture inserts, cleanup, or operational records are needed.
function fixtureRelations() {
  const transactions = fixtures.map(({ fraudChecks, ...tx }) => tx);
  const checks = fixtures.flatMap((tx) =>
    tx.fraudChecks.map((check: any) => ({ ...check, transactionId: tx.id })),
  );
  return Prisma.sql`
    "Transaction" AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(transactions)}::jsonb) AS t(
        id text, "processType" text, status text, "createdAt" timestamp,
        "gateInAt" timestamp, "weighInAt" timestamp, "gateOutAt" timestamp,
        "warehouseStartAt" timestamp, "warehouseEndAt" timestamp,
        "qcStartAt" timestamp, "qcEndAt" timestamp, "weighOutAt" timestamp,
        "grossWeight" double precision, "tareWeight" double precision,
        "netWeight" double precision, "actualWeight" double precision
      )
    ), "FraudCheck" AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(checks)}::jsonb) AS f(
        id text, "transactionId" text, "riskLevel" text,
        "calculatedAt" timestamp, "createdAt" timestamp,
        "netWeight" double precision, "warehouseActualWeight" double precision,
        "deviationPercent" double precision
      )
    ), "WarehouseProcess" AS (
      SELECT NULL::text AS id, NULL::text AS "transactionId", 1 AS revision,
        NULL::timestamp AS "createdAt", TRUE AS "isCurrent",
        NULL::timestamp AS "startAt", NULL::timestamp AS "endAt" WHERE FALSE
    ), "QcVehicleCheck" AS (
      SELECT NULL::text AS id, NULL::text AS "transactionId", 1 AS revision,
        NULL::timestamp AS "createdAt", TRUE AS "isCurrent", NULL::text AS result,
        NULL::timestamp AS "startedAt", NULL::timestamp AS "completedAt" WHERE FALSE
    ), "IncomingMaterialCheck" AS (
      SELECT *, NULL::double precision AS moisture, NULL::double precision AS "foreignMatter",
        NULL::text AS "beanCondition" FROM "QcVehicleCheck"
    ), "WeighbridgeRecord" AS (
      SELECT NULL::text AS id, NULL::text AS "transactionId", 1 AS revision,
        NULL::timestamp AS "createdAt", TRUE AS "isCurrent",
        NULL::text AS type, NULL::double precision AS weight WHERE FALSE
    )`;
}

describePostgres(
  'operation-history actual PostgreSQL / TypeScript parity (read-only)',
  () => {
    let client: PrismaClient;
    let rows: any[];

    beforeAll(async () => {
      client = new PrismaClient({ datasources: { db: { url: testUrl! } } });
      const service = new ReportsService(
        {} as any,
        {} as any,
        { assertScopeNotEmpty: () => {} } as any,
      );
      const cte = (service as any).operationHistoryCte(
        (service as any).normalizeOperationHistoryQuery({}),
        { role: 'ADMIN' },
      ) as Prisma.Sql;
      const strings = [...cte.strings];
      if (!/^\s*WITH\s/.test(strings[0]))
        throw new Error('Expected operation history WITH clause');
      strings[0] = strings[0].replace(/^\s*WITH\s/, '');
      const body = Prisma.sql(strings, ...cte.values);
      rows = await client.$transaction(async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return tx.$queryRaw<any[]>(Prisma.sql`
        WITH ${fixtureRelations()}, ${body}
        SELECT id, net, roll, deviation_percent, fraud_status FROM final ORDER BY id
      `);
      });
    }, 30000);

    afterAll(async () => {
      if (client) await client.$disconnect();
    });

    it.each(fixtures.map((tx) => [tx.id, tx]))(
      'matches persisted/derived/rejected evidence for %s',
      (id, tx) => {
        const actual = rows.find((row) => row.id === id);
        const expected = getOperationHistoryFraud(tx);
        expect(actual).toBeDefined();
        expect(actual.net).toBe(expected.net);
        expect(actual.roll).toBe(expected.roll);
        expect(actual.fraud_status).toBe(expected.status);
        if (expected.deviationPercent === null)
          expect(actual.deviation_percent).toBeNull();
        else
          expect(actual.deviation_percent).toBeCloseTo(
            expected.deviationPercent,
            10,
          );
      },
    );
  },
);
