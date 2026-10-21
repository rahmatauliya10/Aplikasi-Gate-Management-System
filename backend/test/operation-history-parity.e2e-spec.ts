import { Prisma, PrismaClient } from '@prisma/client';
import { ReportsService } from '../src/reports/reports.service';
import {
  getOperationHistoryFraud,
  getOperationHistoryDurations,
  getOperationHistoryBottleneck,
} from '../src/reports/operation-history.util';
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

  // Parity fixture: GSP process-aware weighbridge derivation (IN=gross, OUT=tare)
  {
    id: 'gsp-standard',
    processType: 'GSP',
    actualWeight: 78,
    weighbridgeRecords: [
      {
        id: 'gsp-in',
        type: 'IN',
        weight: 120,
        revision: 1,
        isCurrent: true,
        createdAt: timestamp,
      },
      {
        id: 'gsp-out',
        type: 'OUT',
        weight: 40,
        revision: 1,
        isCurrent: true,
        createdAt: timestamp,
      },
    ],
    fraudChecks: [],
  },

  // Parity fixture: GBJ process-aware weighbridge derivation (OUT=gross, IN=tare)
  {
    id: 'gbj-process-aware',
    processType: 'GBJ',
    actualWeight: 79,
    weighbridgeRecords: [
      {
        id: 'gbj-in',
        type: 'IN',
        weight: 40,
        revision: 1,
        isCurrent: true,
        createdAt: timestamp,
      },
      {
        id: 'gbj-out',
        type: 'OUT',
        weight: 120,
        revision: 1,
        isCurrent: true,
        createdAt: timestamp,
      },
    ],
    fraudChecks: [],
  },

  // Parity fixture: Active child revision selection on WeighbridgeRecord
  {
    id: 'weighbridge-rev-active',
    processType: 'GBB',
    actualWeight: 80,
    weighbridgeRecords: [
      {
        id: 'wb-in-rev1-superseded',
        type: 'IN',
        weight: 999,
        revision: 1,
        isCurrent: false,
        createdAt: '2026-10-20T00:00:00Z',
      },
      {
        id: 'wb-in-rev2-active',
        type: 'IN',
        weight: 120,
        revision: 2,
        isCurrent: true,
        createdAt: '2026-10-21T00:00:00Z',
      },
      {
        id: 'wb-out-rev1-active',
        type: 'OUT',
        weight: 40,
        revision: 1,
        isCurrent: true,
        createdAt: timestamp,
      },
    ],
    fraudChecks: [],
  },

  // Parity fixture: Active child revision on QcVehicleCheck (superseded REJECT, active PASS)
  {
    id: 'qc-vehicle-corrected-to-pass',
    processType: 'GBB',
    netWeight: 100,
    actualWeight: 98,
    qcVehicleChecks: [
      {
        id: 'qc-v-rev1-rejected',
        revision: 1,
        isCurrent: false,
        result: 'REJECT',
        createdAt: '2026-10-20T00:00:00Z',
      },
      {
        id: 'qc-v-rev2-active-pass',
        revision: 2,
        isCurrent: true,
        result: 'PASS',
        createdAt: '2026-10-21T00:00:00Z',
      },
    ],
    fraudChecks: [],
  },

  // Parity fixture: Active child revision on QcVehicleCheck (active REJECT overrides previous PASS)
  {
    id: 'qc-vehicle-active-rejected',
    processType: 'GBB',
    netWeight: 100,
    actualWeight: 98,
    qcVehicleChecks: [
      {
        id: 'qc-v-rev1-pass',
        revision: 1,
        isCurrent: false,
        result: 'PASS',
        createdAt: '2026-10-20T00:00:00Z',
      },
      {
        id: 'qc-v-rev2-active-reject',
        revision: 2,
        isCurrent: true,
        result: 'REJECT',
        createdAt: '2026-10-21T00:00:00Z',
      },
    ],
    fraudChecks: [],
  },

  // Parity fixture: Active child revision on IncomingMaterialCheck (superseded REJECT, active PASS)
  {
    id: 'incoming-corrected-to-pass',
    processType: 'GBB',
    netWeight: 100,
    actualWeight: 98,
    incomingMaterialChecks: [
      {
        id: 'im-rev1-rejected',
        revision: 1,
        isCurrent: false,
        result: 'REJECT',
        createdAt: '2026-10-20T00:00:00Z',
      },
      {
        id: 'im-rev2-active-pass',
        revision: 2,
        isCurrent: true,
        result: 'PASS',
        createdAt: '2026-10-21T00:00:00Z',
      },
    ],
    fraudChecks: [],
  },

  // Parity fixture: Active child revision on WarehouseProcess
  {
    id: 'warehouse-active-revision',
    processType: 'GBB',
    netWeight: 100,
    actualWeight: 98,
    warehouseProcesses: [
      {
        id: 'wh-rev1-superseded',
        revision: 1,
        isCurrent: false,
        startAt: '2026-10-21T01:00:00Z',
        endAt: '2026-10-21T01:30:00Z',
        createdAt: '2026-10-20T00:00:00Z',
      },
      {
        id: 'wh-rev2-active',
        revision: 2,
        isCurrent: true,
        startAt: '2026-10-21T02:00:00Z',
        endAt: '2026-10-21T02:45:00Z',
        createdAt: '2026-10-21T00:00:00Z',
      },
    ],
    fraudChecks: [],
  },

  // Parity fixture: FraudCheck.netWeight non-positive edge cases (0 and negative fall back to transaction netWeight)
  {
    id: 'fraud-net-zero-fallback',
    netWeight: 100,
    actualWeight: 93,
    fraudChecks: [fraud({ netWeight: 0, deviationPercent: 7 })],
  },
  {
    id: 'fraud-net-negative-fallback',
    netWeight: 100,
    actualWeight: 93,
    fraudChecks: [fraud({ netWeight: -10, deviationPercent: 7 })],
  },
  {
    id: 'fraud-net-zero-no-fallback',
    netWeight: 0,
    actualWeight: 93,
    fraudChecks: [fraud({ netWeight: 0, deviationPercent: null })],
  },

  // Parity fixture: Complete operational lifecycle durations & waitingOut bottleneck
  {
    id: 'durations-complete-cycle',
    processType: 'GBB',
    gateInAt: '2026-10-21T00:00:00.000Z',
    weighInAt: '2026-10-21T00:15:00.000Z',
    warehouseProcesses: [
      {
        id: 'wh-cycle-rev1-superseded',
        revision: 1,
        isCurrent: false,
        startAt: '2026-10-21T00:20:00.000Z',
        endAt: '2026-10-21T00:30:00.000Z',
        createdAt: '2026-10-20T00:00:00.000Z',
      },
      {
        id: 'wh-cycle-rev2-active',
        revision: 2,
        isCurrent: true,
        startAt: '2026-10-21T00:20:00.000Z',
        endAt: '2026-10-21T00:50:00.000Z',
        createdAt: '2026-10-21T00:00:00.000Z',
      },
    ],
    qcVehicleChecks: [
      {
        id: 'qc-v-complete',
        revision: 1,
        isCurrent: true,
        result: 'PASS',
        startedAt: '2026-10-21T00:50:00.000Z',
        completedAt: '2026-10-21T01:10:00.000Z',
        createdAt: timestamp,
      },
    ],
    incomingMaterialChecks: [
      {
        id: 'im-complete',
        revision: 1,
        isCurrent: true,
        result: 'PASS',
        startedAt: '2026-10-21T01:10:00.000Z',
        completedAt: '2026-10-21T01:15:00.000Z',
        createdAt: timestamp,
      },
    ],
    weighOutAt: '2026-10-21T01:25:00.000Z',
    gateOutAt: '2026-10-21T01:30:00.000Z',
    netWeight: 100,
    actualWeight: 98,
    fraudChecks: [],
  },

  // Parity fixture: Warehouse stage bottleneck
  {
    id: 'durations-warehouse-bottleneck',
    processType: 'GBB',
    gateInAt: '2026-10-21T00:00:00.000Z',
    weighInAt: '2026-10-21T00:10:00.000Z',
    warehouseProcesses: [
      {
        id: 'wh-bottleneck',
        revision: 1,
        isCurrent: true,
        startAt: '2026-10-21T00:10:00.000Z',
        endAt: '2026-10-21T01:10:00.000Z',
        createdAt: timestamp,
      },
    ],
    weighOutAt: '2026-10-21T01:15:00.000Z',
    gateOutAt: '2026-10-21T01:20:00.000Z',
    netWeight: 100,
    actualWeight: 98,
    fraudChecks: [],
  },

  // Parity fixture: QC stage bottleneck
  {
    id: 'durations-qc-bottleneck',
    processType: 'GBB',
    gateInAt: '2026-10-21T00:00:00.000Z',
    weighInAt: '2026-10-21T00:05:00.000Z',
    qcVehicleChecks: [
      {
        id: 'qc-bottleneck',
        revision: 1,
        isCurrent: true,
        result: 'PASS',
        startedAt: '2026-10-21T00:10:00.000Z',
        completedAt: '2026-10-21T01:00:00.000Z',
        createdAt: timestamp,
      },
    ],
    gateOutAt: '2026-10-21T01:10:00.000Z',
    netWeight: 100,
    actualWeight: 98,
    fraudChecks: [],
  },

  // Parity fixture: Inverted timestamps produce NULL stage durations
  {
    id: 'durations-inverted-timestamps',
    processType: 'GBB',
    gateInAt: '2026-10-21T01:00:00.000Z',
    weighInAt: '2026-10-21T00:50:00.000Z',
    warehouseProcesses: [
      {
        id: 'wh-inverted',
        revision: 1,
        isCurrent: true,
        startAt: '2026-10-21T02:00:00.000Z',
        endAt: '2026-10-21T01:50:00.000Z',
        createdAt: timestamp,
      },
    ],
    netWeight: 100,
    actualWeight: 98,
    fraudChecks: [],
  },

  // Parity fixture: Partial QC timestamps
  {
    id: 'durations-partial-qc',
    processType: 'GBB',
    qcVehicleChecks: [
      {
        id: 'qc-partial',
        revision: 1,
        isCurrent: true,
        result: 'PASS',
        startedAt: '2026-10-21T00:10:00.000Z',
        completedAt: null,
        createdAt: timestamp,
      },
    ],
    fraudChecks: [],
  },

  // Parity fixture: Partial Warehouse timestamps
  {
    id: 'durations-partial-warehouse',
    processType: 'GBB',
    warehouseProcesses: [
      {
        id: 'wh-partial',
        revision: 1,
        isCurrent: true,
        startAt: '2026-10-21T00:10:00.000Z',
        endAt: null,
        createdAt: timestamp,
      },
    ],
    fraudChecks: [],
  },
].map((tx) => ({
  processType: 'GBB',
  status: 'COMPLETED',
  createdAt: timestamp,
  weighbridgeRecords: [],
  warehouseProcesses: [],
  qcVehicleChecks: [],
  incomingMaterialChecks: [],
  ...tx,
}));

// Fixture relations shadow the production table names for this SELECT only.
// No schema, DDL, fixture inserts, cleanup, or operational records are needed.
function fixtureRelations() {
  const transactions = fixtures.map(
    ({
      fraudChecks,
      weighbridgeRecords,
      warehouseProcesses,
      qcVehicleChecks,
      incomingMaterialChecks,
      ...tx
    }) => tx,
  );
  const checks = fixtures.flatMap((tx) =>
    (tx.fraudChecks || []).map((check: any) => ({
      ...check,
      transactionId: tx.id,
    })),
  );
  const weighbridge = fixtures.flatMap((tx) =>
    (tx.weighbridgeRecords || []).map((wr: any) => ({
      ...wr,
      transactionId: tx.id,
    })),
  );
  const warehouse = fixtures.flatMap((tx) =>
    (tx.warehouseProcesses || []).map((wp: any) => ({
      ...wp,
      transactionId: tx.id,
    })),
  );
  const qcVehicle = fixtures.flatMap((tx) =>
    (tx.qcVehicleChecks || []).map((qc: any) => ({
      ...qc,
      transactionId: tx.id,
    })),
  );
  const incoming = fixtures.flatMap((tx) =>
    (tx.incomingMaterialChecks || []).map((im: any) => ({
      ...im,
      transactionId: tx.id,
    })),
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
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(warehouse)}::jsonb) AS wp(
        id text, "transactionId" text, revision int, "createdAt" timestamp,
        "isCurrent" boolean, "startAt" timestamp, "endAt" timestamp
      )
    ), "QcVehicleCheck" AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(qcVehicle)}::jsonb) AS qc(
        id text, "transactionId" text, revision int, "createdAt" timestamp,
        "isCurrent" boolean, result text, "startedAt" timestamp, "completedAt" timestamp
      )
    ), "IncomingMaterialCheck" AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(incoming)}::jsonb) AS im(
        id text, "transactionId" text, revision int, "createdAt" timestamp,
        "isCurrent" boolean, result text, "startedAt" timestamp, "completedAt" timestamp,
        moisture double precision, "foreignMatter" double precision, "beanCondition" text
      )
    ), "WeighbridgeRecord" AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(weighbridge)}::jsonb) AS wr(
        id text, "transactionId" text, revision int, "createdAt" timestamp,
        "isCurrent" boolean, type text, weight double precision
      )
    )`;
}

const asNum = (v: any): number | null => (v == null ? null : Number(v));

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
      if (!/^\s*WITH\s/.test(strings[0])) {
        throw new Error('Expected operation history WITH clause');
      }
      strings[0] = strings[0].replace(/^\s*WITH\s/, '');
      const body = Prisma.sql(strings, ...cte.values);
      rows = await client.$transaction(async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return tx.$queryRaw<any[]>(Prisma.sql`
          WITH ${fixtureRelations()}, ${body}
          SELECT
            id,
            net,
            roll,
            deviation_percent,
            fraud_status,
            waiting_in,
            warehouse,
            qc,
            waiting_out,
            total,
            bottleneck
          FROM final ORDER BY id
        `);
      });
    }, 30000);

    afterAll(async () => {
      if (client) await client.$disconnect();
    });

    it.each(fixtures.map((tx) => [tx.id, tx]))(
      'matches fraud evidence, process durations, and bottleneck for %s',
      (id, tx) => {
        const actual = rows.find((row) => row.id === id);
        const expectedFraud = getOperationHistoryFraud(tx);
        const expectedDurations = getOperationHistoryDurations(tx);
        const expectedBottleneck =
          getOperationHistoryBottleneck(expectedDurations);

        expect(actual).toBeDefined();

        // 1. Fraud & Weight Evidence Parity
        expect(actual.net).toBe(expectedFraud.net);
        expect(actual.roll).toBe(expectedFraud.roll);
        expect(actual.fraud_status).toBe(expectedFraud.status);
        if (expectedFraud.deviationPercent === null) {
          expect(actual.deviation_percent).toBeNull();
        } else {
          expect(actual.deviation_percent).toBeCloseTo(
            expectedFraud.deviationPercent,
            10,
          );
        }

        // 2. Process Stage Durations Parity (minutes)
        expect(asNum(actual.waiting_in)).toBe(expectedDurations.waitingIn);
        expect(asNum(actual.warehouse)).toBe(expectedDurations.warehouse);
        expect(asNum(actual.qc)).toBe(expectedDurations.qc);
        expect(asNum(actual.waiting_out)).toBe(expectedDurations.waitingOut);
        expect(asNum(actual.total)).toBe(expectedDurations.total);

        // 3. Bottleneck Determination Parity
        expect(actual.bottleneck).toBe(expectedBottleneck);
      },
    );
  },
);

describe('dataQuality audit integrity contracts', () => {
  it.each([
    ['zero-roll', 'INVALID_WEIGHT'],
    ['fraud-net-zero-fallback', 'INVALID_WEIGHT'],
    ['fraud-net-negative-fallback', 'INVALID_WEIGHT'],
    ['rejected-QC_VEHICLE_REJECTED', 'REJECTED_NOT_EVALUATED'],
    ['rejected-INCOMING_CHECK_REJECTED', 'REJECTED_NOT_EVALUATED'],
    ['qc-vehicle-active-rejected', 'REJECTED_NOT_EVALUATED'],
    ['missing-all', 'MISSING_WEIGHT'],
    ['durations-inverted-timestamps', 'INVERTED_TIMESTAMP'],
    ['durations-partial-qc', 'PARTIAL_QC_TIMESTAMP'],
    ['durations-partial-warehouse', 'PARTIAL_WAREHOUSE_TIMESTAMP'],
  ])('asserts expected dataQuality flag %s for %s', (id, expectedFlag) => {
    const fixture = fixtures.find((f) => f.id === id);
    expect(fixture).toBeDefined();
    const fraudRes = getOperationHistoryFraud(fixture);
    const durationsRes = getOperationHistoryDurations(fixture);
    const allQuality = [...fraudRes.dataQuality, ...durationsRes.dataQuality];
    expect(allQuality).toContain(expectedFlag);
  });
});
