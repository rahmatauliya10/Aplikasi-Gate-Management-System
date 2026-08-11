import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { QcService } from '../qc/qc.service';
import { WarehouseService } from '../warehouse/warehouse.service';
import { AuthorizationScopeService } from './authorization-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ConfigService } from '@nestjs/config';

describe('PR-01: QC Scope RBAC and GBB Separation of Duties (SoD)', () => {
  let usersService: UsersService;
  let qcService: QcService;
  let warehouseService: WarehouseService;
  let scopeService: AuthorizationScopeService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    userWarehouseAccess: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
    transaction: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    warehouseProcess: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    activityLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrismaService)),
  };

  const mockActivityLogsService = {
    logAction: jest.fn().mockResolvedValue(true),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        QcService,
        WarehouseService,
        AuthorizationScopeService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ActivityLogsService, useValue: mockActivityLogsService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    usersService = module.get<UsersService>(UsersService);
    qcService = module.get<QcService>(QcService);
    warehouseService = module.get<WarehouseService>(WarehouseService);
    scopeService = module.get<AuthorizationScopeService>(
      AuthorizationScopeService,
    );
  });

  describe('UsersService - QC Role Process Scope & Revocation', () => {
    it('should create QC user with valid process scope (GBB, GBJ)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        id: 'user-qc-1',
        email: 'qc1@gms.local',
        username: 'qc1',
        name: 'QC One',
        role: 'QC',
        isActive: true,
        lastLoginAt: null,
        warehouseAccess: [{ processType: 'GBB' }, { processType: 'GBJ' }],
        createdAt: new Date(),
        phone: null,
        department: null,
        site: null,
        area: null,
        avatarUrl: null,
      });

      const result = await usersService.create({
        email: 'qc1@gms.local',
        username: 'qc1',
        name: 'QC One',
        role: 'QC',
        warehouseAccess: ['GBB', 'GBJ'],
      });

      expect(result.success).toBe(true);
      expect(result.data.warehouseAccess).toEqual(['GBB', 'GBJ']);
      expect(mockPrismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'QC',
            warehouseAccess: {
              create: [{ processType: 'GBB' }, { processType: 'GBJ' }],
            },
          }),
        }),
      );
    });

    it('should reject QC user creation when warehouseAccess is empty', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        usersService.create({
          email: 'qc_noscope@gms.local',
          username: 'qc_noscope',
          name: 'QC No Scope',
          role: 'QC',
          warehouseAccess: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should preserve and update QC process scope during user update', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-qc-1',
        email: 'qc1@gms.local',
        username: 'qc1',
        name: 'QC One',
        role: 'QC',
        isActive: true,
        warehouseAccess: [{ processType: 'GBB' }],
      });

      mockPrismaService.user.update.mockResolvedValue({
        id: 'user-qc-1',
        email: 'qc1@gms.local',
        username: 'qc1',
        name: 'QC One Updated',
        role: 'QC',
        isActive: true,
        lastLoginAt: null,
        createdAt: new Date(),
        warehouseAccess: [{ processType: 'GBB' }, { processType: 'GSP' }],
      });

      const result = await usersService.update('user-qc-1', {
        warehouseAccess: ['GBB', 'GSP'],
      });

      expect(result.success).toBe(true);
      expect(
        mockPrismaService.userWarehouseAccess.deleteMany,
      ).toHaveBeenCalledWith({
        where: { userId: 'user-qc-1' },
      });
      expect(
        mockPrismaService.userWarehouseAccess.createMany,
      ).toHaveBeenCalledWith({
        data: [
          { userId: 'user-qc-1', processType: 'GBB' },
          { userId: 'user-qc-1', processType: 'GSP' },
        ],
      });
    });

    it('should revoke active sessions (increment tokenVersion & clear refreshTokenHash) on privilege change', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-qc-1',
        email: 'qc1@gms.local',
        username: 'qc1',
        name: 'QC One',
        role: 'QC',
        isActive: true,
        warehouseAccess: [{ processType: 'GBB' }],
      });

      mockPrismaService.user.update.mockResolvedValue({
        id: 'user-qc-1',
        email: 'qc1@gms.local',
        username: 'qc1',
        name: 'QC One',
        role: 'QC',
        isActive: true,
        warehouseAccess: [],
      });

      await usersService.update('user-qc-1', {
        warehouseAccess: ['GSP'],
      });

      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-qc-1' },
          data: expect.objectContaining({
            tokenVersion: { increment: 1 },
            refreshTokenHash: null,
          }),
        }),
      );
    });
  });

  describe('AuthorizationScopeService & QcService - Object Scope & 403 Enforcement', () => {
    it('should return 403 Forbidden when QC user without process scope accesses queue', async () => {
      const userWithoutScope: any = {
        id: 'qc-no-scope',
        role: 'QC',
        warehouseAccess: [],
      };

      await expect(qcService.getQueue(userWithoutScope)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should filter queue by assigned process types for QC user with scope', async () => {
      const userWithGbb: any = {
        id: 'qc-gbb',
        role: 'QC',
        warehouseAccess: ['GBB'],
      };

      mockPrismaService.transaction.findMany.mockResolvedValue([
        { id: 'tx-1', processType: 'GBB', status: 'QC_VEHICLE_PENDING' },
      ]);

      const result = await qcService.getQueue(userWithGbb);
      expect(result.success).toBe(true);
      expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            processType: { in: ['GBB'] },
          }),
        }),
      );
    });

    it('should return 403 Forbidden when QC user attempts operation on transaction outside assigned scope', async () => {
      const userWithGbjOnly: any = {
        id: 'qc-gbj',
        role: 'QC',
        warehouseAccess: ['GBJ'],
      };

      // Transaction tx-gbb exists but has processType GBB
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-gbb',
        processType: 'GBB',
        status: 'QC_VEHICLE_PENDING',
      });

      await expect(
        qcService.startQc(
          'tx-gbb',
          { processType: 'GBB' } as any,
          'qc-gbj',
          userWithGbjOnly,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return 404 NotFound when transaction does not exist regardless of scope', async () => {
      const userWithGbb: any = {
        id: 'qc-gbb',
        role: 'QC',
        warehouseAccess: ['GBB'],
      };

      mockPrismaService.transaction.findUnique.mockResolvedValue(null);

      await expect(
        qcService.startQc('non-existent-tx', {} as any, 'qc-gbb', userWithGbb),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('GBB Separation of Duties (SoD) Enforcement', () => {
    it('should reject WAREHOUSE user attempting to complete GBB QC analysis with 403 Forbidden and log SoD violation', async () => {
      const warehouseUser: any = {
        id: 'wh-user',
        email: 'wh@gms.local',
        role: 'WAREHOUSE',
        warehouseAccess: ['GBB'],
      };

      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-gbb',
        processType: 'GBB',
        status: 'WAREHOUSE_IN_PROGRESS',
      });

      await expect(
        qcService.completeQcAnalysis(
          'tx-gbb',
          warehouseUser,
          'Self QC signoff',
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockActivityLogsService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'wh-user',
          action: 'SOD_VIOLATION_BLOCKED',
          module: 'QC',
          status: 'FAILED',
        }),
      );
    });

    it('should allow QC user to complete GBB QC analysis', async () => {
      const qcUser: any = {
        id: 'qc-user',
        email: 'qc@gms.local',
        role: 'QC',
        warehouseAccess: ['GBB'],
      };

      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-gbb',
        processType: 'GBB',
        status: 'WAREHOUSE_IN_PROGRESS',
        plateNumber: 'B 1234 ABC',
      });

      mockPrismaService.transaction.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-gbb',
        processType: 'GBB',
        status: 'WAREHOUSE_IN_PROGRESS',
        qcAnalysisCompleted: true,
        qcAnalysisCompletedAt: new Date(),
        warehouseProcesses: [{ remarks: 'Checked by QC' }],
      });

      const result = await qcService.completeQcAnalysis(
        'tx-gbb',
        qcUser,
        'Lab PASS',
      );
      expect(result.success).toBe(true);
      expect(result.data.qcAnalysisCompleted).toBe(true);
    });
  });
});
