import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
const request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { configureApp } from '../src/app.config';
import { reportTestDatabaseUrl } from './helpers/report-test-database';
import {
  CargoProcessType,
  ProcessType,
  RiskLevel,
  Role,
  TransactionStatus,
} from '@prisma/client';

const testUrl = reportTestDatabaseUrl(process.env.DATABASE_URL_TEST);
const describePostgres = testUrl ? describe : describe.skip;

describePostgres(
  'Process Scope Data Isolation End-to-End Suite (HTTP + Real PostgreSQL)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let jwtService: JwtService;

    // Test Users
    let userWhGbbGbj: any;
    let userWhGsp: any;
    let userAdmin: any;

    let tokenWhGbbGbj: string;
    let tokenWhGsp: string;
    let tokenAdmin: string;

    // Test Transactions
    const txIdGbb = 'iso-real-tx-gbb-001';
    const txIdGsp = 'iso-real-tx-gsp-001';
    const txIdGbj = 'iso-real-tx-gbj-001';

    const txNumGbb = 'TRX-REAL-ISO-GBB-001';
    const txNumGsp = 'TRX-REAL-ISO-GSP-001';
    const txNumGbj = 'TRX-REAL-ISO-GBJ-001';

    beforeAll(async () => {
      process.env.DATABASE_URL = testUrl!;

      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      configureApp(app);
      await app.init();

      prisma = app.get<PrismaService>(PrismaService);
      jwtService = app.get<JwtService>(JwtService);

      // Clean up previous test runs if any
      await prisma.userWarehouseAccess.deleteMany({
        where: {
          user: {
            username: {
              in: ['test_iso_wh_gbb_gbj', 'test_iso_wh_gsp', 'test_iso_admin'],
            },
          },
        },
      });
      await prisma.transaction.deleteMany({
        where: {
          id: { in: [txIdGbb, txIdGsp, txIdGbj] },
        },
      });
      await prisma.user.deleteMany({
        where: {
          username: {
            in: ['test_iso_wh_gbb_gbj', 'test_iso_wh_gsp', 'test_iso_admin'],
          },
        },
      });

      // 1. Seed Real Users in PostgreSQL
      userWhGbbGbj = await prisma.user.create({
        data: {
          email: 'iso_wh_gbb_gbj@test.local',
          username: 'test_iso_wh_gbb_gbj',
          name: 'Warehouse Officer GBB GBJ',
          passwordHash: 'dummy_hash',
          role: Role.WAREHOUSE,
          isActive: true,
          warehouseAccess: {
            create: [
              { processType: ProcessType.GBB },
              { processType: ProcessType.GBJ },
            ],
          },
        },
        include: { warehouseAccess: true },
      });

      userWhGsp = await prisma.user.create({
        data: {
          email: 'iso_wh_gsp@test.local',
          username: 'test_iso_wh_gsp',
          name: 'Warehouse Officer GSP',
          passwordHash: 'dummy_hash',
          role: Role.WAREHOUSE,
          isActive: true,
          warehouseAccess: {
            create: [{ processType: ProcessType.GSP }],
          },
        },
        include: { warehouseAccess: true },
      });

      userAdmin = await prisma.user.create({
        data: {
          email: 'iso_admin@test.local',
          username: 'test_iso_admin',
          name: 'Admin Scope Auditor',
          passwordHash: 'dummy_hash',
          role: Role.ADMIN,
          isActive: true,
        },
      });

      // Generate JWT Tokens
      tokenWhGbbGbj = jwtService.sign({
        sub: userWhGbbGbj.id,
        email: userWhGbbGbj.email,
        role: userWhGbbGbj.role,
        tv: userWhGbbGbj.tokenVersion,
      });

      tokenWhGsp = jwtService.sign({
        sub: userWhGsp.id,
        email: userWhGsp.email,
        role: userWhGsp.role,
        tv: userWhGsp.tokenVersion,
      });

      tokenAdmin = jwtService.sign({
        sub: userAdmin.id,
        email: userAdmin.email,
        role: userAdmin.role,
        tv: userAdmin.tokenVersion,
      });

      // Clean up any residual test data before seeding
      await prisma.fraudCheck.deleteMany({
        where: {
          transactionId: { in: [txIdGbb, txIdGsp, txIdGbj] },
        },
      });
      await prisma.transaction.deleteMany({
        where: {
          id: { in: [txIdGbb, txIdGsp, txIdGbj] },
        },
      });

      // 2. Seed Real Transactions in PostgreSQL
      // Base date: 07:00:00Z
      // txIdGbb: gateIn 07:00, weighIn 07:10 (waitingIn=10m), qc 07:10-07:45 (qc=35m), warehouse 07:45-07:55 (wh=10m), weighOut 07:58 (waitingOut=3m), gateOut 08:00 (TAT=60m). Bottleneck: 'qc' (35m). SAFE (deviation 0%).
      const baseDate = new Date('2026-10-21T07:00:00Z');
      await prisma.transaction.create({
        data: {
          id: txIdGbb,
          transactionNumber: txNumGbb,
          plateNumber: 'B 2001 GBB',
          driverName: 'Pak GBB',
          driverPhone: '081111111111',
          vendorName: 'PT Supplier GBB',
          vehicleType: 'TRUCK',
          processType: ProcessType.GBB,
          cargoType: 'RAW_MATERIAL',
          cargoProcessType: CargoProcessType.INBOUND,
          status: TransactionStatus.COMPLETED,
          gateInAt: baseDate,
          weighInAt: new Date(baseDate.getTime() + 10 * 60000),
          qcStartAt: new Date(baseDate.getTime() + 10 * 60000),
          qcEndAt: new Date(baseDate.getTime() + 45 * 60000),
          warehouseStartAt: new Date(baseDate.getTime() + 45 * 60000),
          warehouseEndAt: new Date(baseDate.getTime() + 55 * 60000),
          weighOutAt: new Date(baseDate.getTime() + 58 * 60000),
          gateOutAt: new Date(baseDate.getTime() + 60 * 60000),
          completedAt: new Date(baseDate.getTime() + 60 * 60000),
          grossWeight: 20000,
          tareWeight: 8000,
          netWeight: 12000,
          actualWeight: 12000,
        },
      });

      // txIdGsp: gateIn 07:00, weighIn 07:10 (waitingIn=10m), warehouse 07:10-07:55 (wh=45m), weighOut 08:00 (waitingOut=5m), gateOut 08:05 (TAT=65m). Bottleneck: 'warehouse' (45m). WARNING anomaly via FraudCheck.
      await prisma.transaction.create({
        data: {
          id: txIdGsp,
          transactionNumber: txNumGsp,
          plateNumber: 'B 2002 GSP',
          driverName: 'Pak GSP',
          driverPhone: '082222222222',
          vendorName: 'PT Supplier GSP',
          vehicleType: 'DUMP_TRUCK',
          processType: ProcessType.GSP,
          cargoType: 'COAL',
          cargoProcessType: CargoProcessType.INBOUND,
          status: TransactionStatus.COMPLETED,
          gateInAt: baseDate,
          weighInAt: new Date(baseDate.getTime() + 10 * 60000),
          warehouseStartAt: new Date(baseDate.getTime() + 10 * 60000),
          warehouseEndAt: new Date(baseDate.getTime() + 55 * 60000),
          weighOutAt: new Date(baseDate.getTime() + 60 * 60000),
          gateOutAt: new Date(baseDate.getTime() + 65 * 60000),
          completedAt: new Date(baseDate.getTime() + 65 * 60000),
          grossWeight: 35000,
          tareWeight: 10000,
          netWeight: 25000,
          actualWeight: 25000,
        },
      });

      // Seed explicit FraudCheck with RiskLevel.WARNING for GSP to prove cross-scope anomaly isolation
      await prisma.fraudCheck.create({
        data: {
          transactionId: txIdGsp,
          netWeight: 25000,
          warehouseActualWeight: 25000,
          deviationKg: 0,
          deviationPercent: 0,
          riskLevel: RiskLevel.WARNING,
          riskReason: 'Audit isolation verification: GSP anomaly fixture',
        },
      });

      // txIdGbj: gateIn 07:00, weighIn 07:10 (waitingIn=10m), qc 07:10-07:35 (qc=25m), warehouse 07:35-07:45 (wh=10m), weighOut 07:48 (waitingOut=3m), gateOut 07:50 (TAT=50m). Bottleneck: 'qc' (25m). SAFE (deviation 0%).
      await prisma.transaction.create({
        data: {
          id: txIdGbj,
          transactionNumber: txNumGbj,
          plateNumber: 'B 2003 GBJ',
          driverName: 'Pak GBJ',
          driverPhone: '083333333333',
          vendorName: 'PT Distributor GBJ',
          vehicleType: 'CONTAINER',
          processType: ProcessType.GBJ,
          cargoType: 'FINISHED_GOOD',
          cargoProcessType: CargoProcessType.OUTBOUND,
          status: TransactionStatus.COMPLETED,
          gateInAt: baseDate,
          weighInAt: new Date(baseDate.getTime() + 10 * 60000),
          qcStartAt: new Date(baseDate.getTime() + 10 * 60000),
          qcEndAt: new Date(baseDate.getTime() + 35 * 60000),
          warehouseStartAt: new Date(baseDate.getTime() + 35 * 60000),
          warehouseEndAt: new Date(baseDate.getTime() + 45 * 60000),
          weighOutAt: new Date(baseDate.getTime() + 48 * 60000),
          gateOutAt: new Date(baseDate.getTime() + 50 * 60000),
          completedAt: new Date(baseDate.getTime() + 50 * 60000),
          grossWeight: 22000,
          tareWeight: 9000,
          netWeight: 13000,
          actualWeight: 13000,
        },
      });
    }, 60000);

    afterAll(async () => {
      if (prisma) {
        await prisma.fraudCheck.deleteMany({
          where: {
            transactionId: { in: [txIdGbb, txIdGsp, txIdGbj] },
          },
        });
        await prisma.transaction.deleteMany({
          where: {
            id: { in: [txIdGbb, txIdGsp, txIdGbj] },
          },
        });
        await prisma.userWarehouseAccess.deleteMany({
          where: {
            user: {
              username: {
                in: [
                  'test_iso_wh_gbb_gbj',
                  'test_iso_wh_gsp',
                  'test_iso_admin',
                ],
              },
            },
          },
        });
        await prisma.user.deleteMany({
          where: {
            username: {
              in: ['test_iso_wh_gbb_gbj', 'test_iso_wh_gsp', 'test_iso_admin'],
            },
          },
        });
        await prisma.$disconnect();
      }
      if (app) {
        await app.close();
      }
    });

    describe('1. HTTP API List Isolation (GET /api/reports/operation-history)', () => {
      it('strictly restricts WAREHOUSE [GBB, GBJ] to GBB and GBJ; zero GSP transactions returned', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/reports/operation-history')
          .set('Authorization', `Bearer ${tokenWhGbbGbj}`)
          .expect(200);

        expect(res.body.success).toBe(true);
        const rows = res.body.data;
        expect(Array.isArray(rows)).toBe(true);

        const foundGbb = rows.find((r: any) => r.id === txIdGbb);
        const foundGbj = rows.find((r: any) => r.id === txIdGbj);
        const foundGsp = rows.find((r: any) => r.id === txIdGsp);

        expect(foundGbb).toBeDefined();
        expect(foundGbj).toBeDefined();
        expect(foundGsp).toBeUndefined();

        for (const row of rows) {
          expect(row.processType).not.toBe('GSP');
          expect(['GBB', 'GBJ']).toContain(row.processType);
        }
      });

      it('strictly restricts WAREHOUSE [GSP] to GSP; zero GBB or GBJ transactions returned', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/reports/operation-history')
          .set('Authorization', `Bearer ${tokenWhGsp}`)
          .expect(200);

        expect(res.body.success).toBe(true);
        const rows = res.body.data;
        expect(Array.isArray(rows)).toBe(true);

        const foundGsp = rows.find((r: any) => r.id === txIdGsp);
        const foundGbb = rows.find((r: any) => r.id === txIdGbb);
        const foundGbj = rows.find((r: any) => r.id === txIdGbj);

        expect(foundGsp).toBeDefined();
        expect(foundGbb).toBeUndefined();
        expect(foundGbj).toBeUndefined();

        for (const row of rows) {
          expect(row.processType).toBe('GSP');
        }
      });

      it('allows ADMIN to access all process types without restriction', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/reports/operation-history')
          .set('Authorization', `Bearer ${tokenAdmin}`)
          .expect(200);

        expect(res.body.success).toBe(true);
        const rows = res.body.data;

        expect(rows.some((r: any) => r.id === txIdGbb)).toBe(true);
        expect(rows.some((r: any) => r.id === txIdGsp)).toBe(true);
        expect(rows.some((r: any) => r.id === txIdGbj)).toBe(true);
      });
    });

    describe('2. HTTP API Detail Isolation (GET /api/transactions/:id)', () => {
      it('returns 404 Not Found when WAREHOUSE [GBB, GBJ] requests GSP transaction detail', async () => {
        const res = await request(app.getHttpServer())
          .get(`/api/transactions/${txIdGsp}`)
          .set('Authorization', `Bearer ${tokenWhGbbGbj}`)
          .expect(404);

        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain('Transaction not found');
      });

      it('returns 200 OK when WAREHOUSE [GBB, GBJ] requests in-scope GBB transaction detail', async () => {
        const res = await request(app.getHttpServer())
          .get(`/api/transactions/${txIdGbb}`)
          .set('Authorization', `Bearer ${tokenWhGbbGbj}`)
          .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBe(txIdGbb);
        expect(res.body.data.transactionNumber).toBe(txNumGbb);
      });

      it('returns 404 Not Found when WAREHOUSE [GSP] requests GBB transaction detail', async () => {
        const res = await request(app.getHttpServer())
          .get(`/api/transactions/${txIdGbb}`)
          .set('Authorization', `Bearer ${tokenWhGsp}`)
          .expect(404);

        expect(res.body.success).toBe(false);
        expect(res.body.message).toContain('Transaction not found');
      });

      it('returns 200 OK when WAREHOUSE [GSP] requests in-scope GSP transaction detail', async () => {
        const res = await request(app.getHttpServer())
          .get(`/api/transactions/${txIdGsp}`)
          .set('Authorization', `Bearer ${tokenWhGsp}`)
          .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBe(txIdGsp);
        expect(res.body.data.transactionNumber).toBe(txNumGsp);
      });

      it('returns 200 OK when ADMIN requests any transaction detail', async () => {
        const res = await request(app.getHttpServer())
          .get(`/api/transactions/${txIdGsp}`)
          .set('Authorization', `Bearer ${tokenAdmin}`)
          .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBe(txIdGsp);
      });
    });

    describe('3. HTTP API Summary & Aggregate Isolation (GET /api/reports/operation-history)', () => {
      it('calculates summary metrics and meta total strictly within allowed scope', async () => {
        // Scoped GBB / GBJ
        const resGbbGbj = await request(app.getHttpServer())
          .get('/api/reports/operation-history')
          .set('Authorization', `Bearer ${tokenWhGbbGbj}`)
          .expect(200);

        // Scoped GSP
        const resGsp = await request(app.getHttpServer())
          .get('/api/reports/operation-history')
          .set('Authorization', `Bearer ${tokenWhGsp}`)
          .expect(200);

        // Admin
        const resAdmin = await request(app.getHttpServer())
          .get('/api/reports/operation-history')
          .set('Authorization', `Bearer ${tokenAdmin}`)
          .expect(200);

        expect(resGbbGbj.body.meta.total).toBeLessThan(
          resAdmin.body.meta.total,
        );
        expect(resGsp.body.meta.total).toBeLessThan(resAdmin.body.meta.total);

        // GSP summary only has 1 test transaction (or total GSP count in DB)
        expect(resGsp.body.meta.total).toBeGreaterThanOrEqual(1);
        expect(resGbbGbj.body.meta.total).toBeGreaterThanOrEqual(2);
      });

      it('accurately isolates aggregate numbers (tonnage, avg TAT, anomaly count, bottleneck) on scoped search', async () => {
        // Query scoped exclusively to seeded test transactions via search prefix
        const resGbbGbj = await request(app.getHttpServer())
          .get('/api/reports/operation-history?search=TRX-REAL-ISO')
          .set('Authorization', `Bearer ${tokenWhGbbGbj}`)
          .expect(200);

        const resGsp = await request(app.getHttpServer())
          .get('/api/reports/operation-history?search=TRX-REAL-ISO')
          .set('Authorization', `Bearer ${tokenWhGsp}`)
          .expect(200);

        const resAdmin = await request(app.getHttpServer())
          .get('/api/reports/operation-history?search=TRX-REAL-ISO')
          .set('Authorization', `Bearer ${tokenAdmin}`)
          .expect(200);

        // 1. Scoped WAREHOUSE [GBB, GBJ] (GBB: 12 MT, 60m TAT, QC bottleneck; GBJ: 13 MT, 50m TAT, QC bottleneck)
        expect(resGbbGbj.body.meta.total).toBe(2);
        expect(resGbbGbj.body.summary.totalTonnageMetric).toBe(25); // (12,000 + 13,000) / 1000 = 25 MT
        expect(resGbbGbj.body.summary.avgTatMinutes).toBe(55); // (60 + 50) / 2 = 55m
        expect(resGbbGbj.body.summary.anomalyCount).toBe(0); // 0 anomalies in GBB/GBJ scope
        expect(resGbbGbj.body.summary.majorBottleneck).toBe('qc'); // Both GBB & GBJ have QC as longest phase (35m & 25m)

        // 2. Scoped WAREHOUSE [GSP] (GSP: 25 MT, 65m TAT, Warehouse bottleneck, 1 WARNING anomaly)
        expect(resGsp.body.meta.total).toBe(1);
        expect(resGsp.body.summary.totalTonnageMetric).toBe(25); // 25,000 / 1000 = 25 MT
        expect(resGsp.body.summary.avgTatMinutes).toBe(65);
        expect(resGsp.body.summary.anomalyCount).toBe(1); // 1 anomaly from FraudCheck fixture in GSP
        expect(resGsp.body.summary.majorBottleneck).toBe('warehouse'); // GSP has Warehouse as longest phase (45m)

        // 3. ADMIN (All 3: GBB 12 MT, GBJ 13 MT, GSP 25 MT -> 50 MT total, avg TAT: (60+50+65)/3 = 58m)
        expect(resAdmin.body.meta.total).toBe(3);
        expect(resAdmin.body.summary.totalTonnageMetric).toBe(50);
        expect(resAdmin.body.summary.avgTatMinutes).toBe(58);
        expect(resAdmin.body.summary.anomalyCount).toBe(1); // 1 anomaly total across all scopes
        expect(resAdmin.body.summary.majorBottleneck).toBe('qc'); // 2 QC bottlenecks > 1 Warehouse bottleneck
      });
    });

    describe('4. HTTP API Export Stream Isolation (GET /api/reports/operation-history/export)', () => {
      it('strictly excludes GSP transactions from CSV export stream for WAREHOUSE [GBB, GBJ]', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/reports/operation-history/export?format=csv')
          .set('Authorization', `Bearer ${tokenWhGbbGbj}`)
          .expect(200);

        expect(res.headers['content-type']).toContain('text/csv');
        expect(res.text).toContain(txNumGbb);
        expect(res.text).toContain(txNumGbj);
        expect(res.text).not.toContain(txNumGsp);
      });

      it('strictly isolates CSV export stream to GSP transactions for WAREHOUSE [GSP]', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/reports/operation-history/export?format=csv')
          .set('Authorization', `Bearer ${tokenWhGsp}`)
          .expect(200);

        expect(res.headers['content-type']).toContain('text/csv');
        expect(res.text).toContain(txNumGsp);
        expect(res.text).not.toContain(txNumGbb);
        expect(res.text).not.toContain(txNumGbj);
      });

      it('strictly isolates XLS export stream for WAREHOUSE [GBB, GBJ]', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/reports/operation-history/export?format=xls')
          .set('Authorization', `Bearer ${tokenWhGbbGbj}`)
          .expect(200);

        expect(res.headers['content-type']).toContain(
          'application/vnd.ms-excel',
        );
        expect(res.headers['content-disposition']).toContain(
          'operation-history.xls',
        );
        expect(res.text).toContain(txNumGbb);
        expect(res.text).toContain(txNumGbj);
        expect(res.text).not.toContain(txNumGsp);
      });

      it('strictly isolates XLS export stream for WAREHOUSE [GSP]', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/reports/operation-history/export?format=xls')
          .set('Authorization', `Bearer ${tokenWhGsp}`)
          .expect(200);

        expect(res.headers['content-type']).toContain(
          'application/vnd.ms-excel',
        );
        expect(res.headers['content-disposition']).toContain(
          'operation-history.xls',
        );
        expect(res.text).toContain(txNumGsp);
        expect(res.text).not.toContain(txNumGbb);
        expect(res.text).not.toContain(txNumGbj);
      });
    });
  },
);
