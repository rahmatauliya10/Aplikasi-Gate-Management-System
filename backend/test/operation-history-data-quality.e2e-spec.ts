import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ReportsController } from '../src/reports/reports.controller';
import { ReportsService } from '../src/reports/reports.service';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { AuthorizationScopeService } from '../src/auth/authorization-scope.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ActivityLogsService } from '../src/activity-logs/activity-logs.service';
import { configureApp } from '../src/app.config';

describe('Operation History API dataQuality & HTTP Integration (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const testSecret =
    process.env.JWT_ACCESS_SECRET ||
    'test-jwt-access-secret-for-ci-pipeline-min-32-chars-long';

  const mockUsers: Record<string, any> = {
    'admin-1': {
      id: 'admin-1',
      email: 'admin@gms.local',
      username: 'admin',
      name: 'System Admin',
      role: 'ADMIN',
      isActive: true,
      mustChangePassword: false,
      tokenVersion: 0,
      warehouseAccess: [],
    },
    'security-1': {
      id: 'security-1',
      email: 'security@gms.local',
      username: 'security',
      name: 'Security Officer',
      role: 'SECURITY',
      isActive: true,
      mustChangePassword: false,
      tokenVersion: 0,
      warehouseAccess: [],
    },
    'warehouse-scoped': {
      id: 'warehouse-scoped',
      email: 'warehouse@gms.local',
      username: 'warehouse_officer',
      name: 'Warehouse Officer',
      role: 'WAREHOUSE',
      isActive: true,
      mustChangePassword: false,
      tokenVersion: 0,
      warehouseAccess: [{ processType: 'GBB' }, { processType: 'GBJ' }],
    },
    'warehouse-empty': {
      id: 'warehouse-empty',
      email: 'warehouse_empty@gms.local',
      username: 'warehouse_empty',
      name: 'Warehouse Officer No Scope',
      role: 'WAREHOUSE',
      isActive: true,
      mustChangePassword: false,
      tokenVersion: 0,
      warehouseAccess: [],
    },
    'driver-1': {
      id: 'driver-1',
      email: 'driver@gms.local',
      username: 'driver',
      name: 'Driver External',
      role: 'DRIVER',
      isActive: true,
      mustChangePassword: false,
      tokenVersion: 0,
      warehouseAccess: [],
    },
  };

  const testTransactions: any[] = [
    // 1. Inverted timestamps (weighIn < gateIn, warehouse end < start)
    {
      id: 'tx-inverted-timestamps',
      transactionNumber: 'TRX-INV-001',
      plateNumber: 'B 1111 INV',
      driverName: 'Pak Inverted',
      vendorName: 'PT Vendor Inverted',
      processType: 'GBB',
      status: 'COMPLETED',
      createdAt: new Date('2026-10-21T00:00:00.000Z'),
      gateInAt: new Date('2026-10-21T01:00:00.000Z'),
      weighInAt: new Date('2026-10-21T00:50:00.000Z'),
      gateOutAt: null,
      weighOutAt: null,
      netWeight: 100,
      actualWeight: 98,
      warehouseProcesses: [
        {
          id: 'wh-inv-1',
          revision: 1,
          isCurrent: true,
          startAt: new Date('2026-10-21T02:00:00.000Z'),
          endAt: new Date('2026-10-21T01:50:00.000Z'),
          createdAt: new Date('2026-10-21T00:00:00.000Z'),
        },
      ],
      qcVehicleChecks: [],
      incomingMaterialChecks: [],
      fraudChecks: [],
      weighbridgeRecords: [],
      corrections: [],
    },

    // 2. Partial QC timestamp (startedAt provided, completedAt null)
    {
      id: 'tx-partial-qc',
      transactionNumber: 'TRX-QC-PART-001',
      plateNumber: 'B 2222 QCP',
      driverName: 'Pak QC Partial',
      vendorName: 'PT Vendor QC',
      processType: 'GBB',
      status: 'ACTIVE',
      createdAt: new Date('2026-10-21T00:00:00.000Z'),
      gateInAt: new Date('2026-10-21T00:05:00.000Z'),
      weighInAt: new Date('2026-10-21T00:10:00.000Z'),
      gateOutAt: null,
      weighOutAt: null,
      netWeight: 100,
      actualWeight: 98,
      warehouseProcesses: [],
      qcVehicleChecks: [
        {
          id: 'qc-part-1',
          revision: 1,
          isCurrent: true,
          startedAt: new Date('2026-10-21T00:15:00.000Z'),
          completedAt: null,
          result: null,
          createdAt: new Date('2026-10-21T00:00:00.000Z'),
        },
      ],
      incomingMaterialChecks: [],
      fraudChecks: [],
      weighbridgeRecords: [],
      corrections: [],
    },

    // 3. Partial Warehouse timestamp (startAt provided, endAt null)
    {
      id: 'tx-partial-warehouse',
      transactionNumber: 'TRX-WH-PART-001',
      plateNumber: 'B 3333 WHP',
      driverName: 'Pak WH Partial',
      vendorName: 'PT Vendor WH',
      processType: 'GBB',
      status: 'ACTIVE',
      createdAt: new Date('2026-10-21T00:00:00.000Z'),
      gateInAt: new Date('2026-10-21T00:05:00.000Z'),
      weighInAt: new Date('2026-10-21T00:10:00.000Z'),
      gateOutAt: null,
      weighOutAt: null,
      netWeight: 100,
      actualWeight: 98,
      warehouseProcesses: [
        {
          id: 'wh-part-1',
          revision: 1,
          isCurrent: true,
          startAt: new Date('2026-10-21T00:15:00.000Z'),
          endAt: null,
          createdAt: new Date('2026-10-21T00:00:00.000Z'),
        },
      ],
      qcVehicleChecks: [],
      incomingMaterialChecks: [],
      fraudChecks: [],
      weighbridgeRecords: [],
      corrections: [],
    },

    // 4. Invalid weight (0 roll weight & non-positive netWeight in fraudCheck)
    {
      id: 'tx-invalid-weights',
      transactionNumber: 'TRX-INV-WT-001',
      plateNumber: 'B 4444 IWT',
      driverName: 'Pak Invalid Weight',
      vendorName: 'PT Vendor Invalid',
      processType: 'GBB',
      status: 'COMPLETED',
      createdAt: new Date('2026-10-21T00:00:00.000Z'),
      gateInAt: new Date('2026-10-21T00:05:00.000Z'),
      weighInAt: new Date('2026-10-21T00:10:00.000Z'),
      gateOutAt: new Date('2026-10-21T00:40:00.000Z'),
      weighOutAt: new Date('2026-10-21T00:35:00.000Z'),
      netWeight: 100,
      actualWeight: 0,
      warehouseProcesses: [],
      qcVehicleChecks: [],
      incomingMaterialChecks: [],
      fraudChecks: [
        {
          id: 'fc-inv-1',
          netWeight: -10,
          warehouseActualWeight: 0,
          deviationPercent: null,
          riskLevel: 'INVALID_DATA',
          calculatedAt: new Date('2026-10-21T00:20:00.000Z'),
          createdAt: new Date('2026-10-21T00:20:00.000Z'),
        },
      ],
      weighbridgeRecords: [],
      corrections: [],
    },

    // 5. Missing all weights
    {
      id: 'tx-missing-weights',
      transactionNumber: 'TRX-MISS-WT-001',
      plateNumber: 'B 5555 MWT',
      driverName: 'Pak Missing Weight',
      vendorName: 'PT Vendor Missing',
      processType: 'GBB',
      status: 'ACTIVE',
      createdAt: new Date('2026-10-21T00:00:00.000Z'),
      gateInAt: new Date('2026-10-21T00:05:00.000Z'),
      weighInAt: null,
      gateOutAt: null,
      weighOutAt: null,
      grossWeight: null,
      tareWeight: null,
      netWeight: null,
      actualWeight: null,
      warehouseProcesses: [],
      qcVehicleChecks: [],
      incomingMaterialChecks: [],
      fraudChecks: [],
      weighbridgeRecords: [],
      corrections: [],
    },

    // 6. Active QC vehicle check REJECT
    {
      id: 'tx-qc-reject',
      transactionNumber: 'TRX-QC-REJ-001',
      plateNumber: 'B 6666 REJ',
      driverName: 'Pak Reject',
      vendorName: 'PT Vendor Reject',
      processType: 'GBB',
      status: 'QC_VEHICLE_REJECTED',
      createdAt: new Date('2026-10-21T00:00:00.000Z'),
      gateInAt: new Date('2026-10-21T00:05:00.000Z'),
      weighInAt: new Date('2026-10-21T00:10:00.000Z'),
      gateOutAt: null,
      weighOutAt: null,
      netWeight: 100,
      actualWeight: 98,
      warehouseProcesses: [],
      qcVehicleChecks: [
        {
          id: 'qc-v-rej-1',
          revision: 1,
          isCurrent: true,
          result: 'REJECT',
          notes: 'Muatan terkontaminasi',
          createdAt: new Date('2026-10-21T00:15:00.000Z'),
        },
      ],
      incomingMaterialChecks: [],
      fraudChecks: [],
      weighbridgeRecords: [],
      corrections: [],
    },

    // 7. Superseded QC REJECT corrected to active PASS
    {
      id: 'tx-qc-corrected',
      transactionNumber: 'TRX-QC-CORR-001',
      plateNumber: 'B 7777 CORR',
      driverName: 'Pak Corrected',
      vendorName: 'PT Vendor Corrected',
      processType: 'GBB',
      status: 'COMPLETED',
      createdAt: new Date('2026-10-21T00:00:00.000Z'),
      gateInAt: new Date('2026-10-21T00:05:00.000Z'),
      weighInAt: new Date('2026-10-21T00:10:00.000Z'),
      gateOutAt: new Date('2026-10-21T00:45:00.000Z'),
      weighOutAt: new Date('2026-10-21T00:40:00.000Z'),
      netWeight: 100,
      actualWeight: 98,
      warehouseProcesses: [],
      qcVehicleChecks: [
        {
          id: 'qc-old-rej',
          revision: 1,
          isCurrent: false,
          result: 'REJECT',
          createdAt: new Date('2026-10-20T00:00:00.000Z'),
        },
        {
          id: 'qc-new-pass',
          revision: 2,
          isCurrent: true,
          result: 'PASS',
          notes: 'Koreksi QC PASS setelah pembersihan',
          createdAt: new Date('2026-10-21T00:00:00.000Z'),
        },
      ],
      incomingMaterialChecks: [],
      fraudChecks: [],
      weighbridgeRecords: [],
      corrections: [],
    },
  ];

  const mockPrisma = {
    user: {
      findUnique: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) => {
          const user = mockUsers[where.id];
          return Promise.resolve(user ? { ...user } : null);
        }),
    },
    transaction: {
      findMany: jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { id: { in: string[] } } }) => {
            const ids = where?.id?.in || [];
            return Promise.resolve(
              testTransactions.filter((tx) => ids.includes(tx.id)),
            );
          },
        ),
    },
    $queryRaw: jest.fn().mockImplementation((query: any) => {
      // Differentiate between getOperationHistorySummary and getOperationHistoryProjections
      const text =
        typeof query === 'string' ? query : query?.strings?.join(' ') || '';
      if (
        text.includes('avg_tat') ||
        text.includes('completed_duration_count')
      ) {
        return Promise.resolve([
          {
            total: BigInt(testTransactions.length),
            completed_duration_count: BigInt(testTransactions.length),
            avg_tat: 35.5,
            total_net: 500,
            anomaly_count: BigInt(1),
            waiting_in_count: BigInt(1),
            warehouse_count: BigInt(5),
            qc_count: BigInt(1),
            waiting_out_count: BigInt(1),
          },
        ]);
      }
      // Return projections matching test transactions
      return Promise.resolve(
        testTransactions.map((tx) => ({
          id: tx.id,
          arrival: tx.gateInAt || tx.createdAt,
          waiting_in: 10,
          warehouse: 20,
          qc: 15,
          waiting_out: 10,
          total: 55,
          net: tx.netWeight,
          roll: tx.actualWeight,
          diff: 2,
          deviation_percent: 2,
          fraud_status:
            tx.status === 'QC_VEHICLE_REJECTED' ? 'PENDING' : 'SAFE',
          bottleneck: 'warehouse',
        })),
      );
    }),
  };

  const createToken = (userId: string) => {
    const user = mockUsers[userId];
    if (!user) throw new Error(`User not found: ${userId}`);
    return jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      tv: user.tokenVersion,
    });
  };

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = testSecret;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: testSecret,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [ReportsController],
      providers: [
        ReportsService,
        JwtStrategy,
        RolesGuard,
        AuthorizationScopeService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ActivityLogsService,
          useValue: { logAction: jest.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('1. HTTP Authentication & Role-Based Access Matrix', () => {
    it('returns 401 Unauthorized when request lacks Bearer token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/operation-history')
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('returns 401 Unauthorized when Bearer token is malformed or invalid', async () => {
      await request(app.getHttpServer())
        .get('/api/reports/operation-history')
        .set('Authorization', 'Bearer invalid.token.payload')
        .expect(401);
    });

    it('returns 403 Forbidden when accessed by unauthorized role (DRIVER)', async () => {
      const driverToken = createToken('driver-1');
      await request(app.getHttpServer())
        .get('/api/reports/operation-history')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(403);
    });

    it('returns 403 Forbidden when WAREHOUSE user has empty process scope', async () => {
      const emptyWarehouseToken = createToken('warehouse-empty');
      const res = await request(app.getHttpServer())
        .get('/api/reports/operation-history')
        .set('Authorization', `Bearer ${emptyWarehouseToken}`)
        .expect(403);

      expect(res.body.message).toContain('belum memiliki scope');
    });

    it('returns 200 OK when accessed by authorized role (ADMIN)', async () => {
      const adminToken = createToken('admin-1');
      const res = await request(app.getHttpServer())
        .get('/api/reports/operation-history')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('returns 200 OK when accessed by authorized role (SECURITY)', async () => {
      const securityToken = createToken('security-1');
      const res = await request(app.getHttpServer())
        .get('/api/reports/operation-history')
        .set('Authorization', `Bearer ${securityToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('returns 200 OK when accessed by WAREHOUSE user with valid scope', async () => {
      const scopedWarehouseToken = createToken('warehouse-scoped');
      const res = await request(app.getHttpServer())
        .get('/api/reports/operation-history')
        .set('Authorization', `Bearer ${scopedWarehouseToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('2. HTTP Response Envelope & Pagination Contract', () => {
    it('returns standard API envelope with data, meta, and summary fields', async () => {
      const adminToken = createToken('admin-1');
      const res = await request(app.getHttpServer())
        .get('/api/reports/operation-history?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toMatchObject({
        success: true,
        message: 'Operation history retrieved successfully',
        meta: {
          page: 1,
          limit: 10,
          total: testTransactions.length,
          totalPages: 1,
        },
        summary: {
          avgTatMinutes: 36,
          totalTonnageMetric: 0.5,
          anomalyCount: 1,
          majorBottleneck: 'warehouse',
        },
      });
      expect(res.body.data).toHaveLength(testTransactions.length);
    });
  });

  describe('3. dataQuality API Integrity Contracts on Client Response', () => {
    let rows: any[];

    beforeAll(async () => {
      const adminToken = createToken('admin-1');
      const res = await request(app.getHttpServer())
        .get('/api/reports/operation-history')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      rows = res.body.data;
    });

    it('flags INVERTED_TIMESTAMP and sets null duration when timestamps are inverted', () => {
      const item = rows.find((r) => r.id === 'tx-inverted-timestamps');
      expect(item).toBeDefined();

      // Durations must be null for invalid sequences
      expect(item.durations.waitingIn).toBeNull();
      expect(item.durations.warehouse).toBeNull();

      // dataQuality received by client must include the contract flag
      expect(item.durations.dataQuality).toContain('INVERTED_TIMESTAMP');
    });

    it('flags PARTIAL_QC_TIMESTAMP and sets null duration when QC end is missing', () => {
      const item = rows.find((r) => r.id === 'tx-partial-qc');
      expect(item).toBeDefined();

      expect(item.durations.qc).toBeNull();
      expect(item.durations.dataQuality).toContain('PARTIAL_QC_TIMESTAMP');
    });

    it('flags PARTIAL_WAREHOUSE_TIMESTAMP and sets null duration when warehouse end is missing', () => {
      const item = rows.find((r) => r.id === 'tx-partial-warehouse');
      expect(item).toBeDefined();

      expect(item.durations.warehouse).toBeNull();
      expect(item.durations.dataQuality).toContain(
        'PARTIAL_WAREHOUSE_TIMESTAMP',
      );
    });

    it('flags INVALID_WEIGHT when roll weight is 0 or net weight is non-positive', () => {
      const item = rows.find((r) => r.id === 'tx-invalid-weights');
      expect(item).toBeDefined();

      // Roll weight is 0 -> invalid
      expect(item.weights.rollWeight).toBeNull();
      expect(item.fraud.dataQuality).toContain('INVALID_WEIGHT');
    });

    it('flags MISSING_WEIGHT when all weighbridge and fraud check weights are absent', () => {
      const item = rows.find((r) => r.id === 'tx-missing-weights');
      expect(item).toBeDefined();

      expect(item.weights.net).toBeNull();
      expect(item.weights.rollWeight).toBeNull();
      expect(item.fraud.status).toBe('PENDING');
      expect(item.fraud.dataQuality).toContain('MISSING_WEIGHT');
    });

    it('flags REJECTED_NOT_EVALUATED and sets deviation to null on active QC REJECT', () => {
      const item = rows.find((r) => r.id === 'tx-qc-reject');
      expect(item).toBeDefined();

      expect(item.fraud.deviationPercent).toBeNull();
      expect(item.fraud.status).toBe('PENDING');
      expect(item.fraud.dataQuality).toContain('REJECTED_NOT_EVALUATED');
    });

    it('does NOT flag REJECTED_NOT_EVALUATED when superseded revision was REJECT but active is PASS', () => {
      const item = rows.find((r) => r.id === 'tx-qc-corrected');
      expect(item).toBeDefined();

      // Active QC is PASS -> normal deviation calculation
      expect(item.qcDetails.status).toBe('PASS');
      expect(item.fraud.dataQuality).not.toContain('REJECTED_NOT_EVALUATED');
      expect(item.fraud.deviationPercent).toBeCloseTo(2, 5);
      expect(item.fraud.status).toBe('SAFE');
    });
  });
});
