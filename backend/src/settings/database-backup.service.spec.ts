import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseBackupService } from './database-backup.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';

describe('DatabaseBackupService', () => {
  let service: DatabaseBackupService;
  let prismaService: any;
  let activityLogsService: any;

  const mockAdminUser: any = {
    id: 'user-admin-uuid',
    email: 'admin@gms.local',
    name: 'Admin User',
    role: 'ADMIN',
    warehouseAccess: [],
  };

  beforeEach(async () => {
    prismaService = {
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'user-1', email: 'admin@gms.local' }]),
        findUnique: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      userWarehouseAccess: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      transaction: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      transactionStatusHistory: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      weighbridgeRecord: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      warehouseProcess: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      qcVehicleCheck: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      incomingMaterialCheck: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      attachment: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      fraudCheck: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      activityLog: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      appSetting: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      announcement: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      systemIssue: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      transactionCorrection: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((cb) => cb(prismaService)),
    };

    activityLogsService = {
      logAction: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseBackupService,
        { provide: PrismaService, useValue: prismaService },
        { provide: ActivityLogsService, useValue: activityLogsService },
      ],
    }).compile();

    service = module.get<DatabaseBackupService>(DatabaseBackupService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSystemStatus', () => {
    it('should return system backup health metrics and status', async () => {
      const status = await service.getSystemStatus();
      expect(status).toBeDefined();
      expect(status.targetRpoHours).toBe(6);
      expect(['PROTECTED', 'DEGRADED', 'CRITICAL']).toContain(status.status);
    });
  });

  describe('generateBackup', () => {
    it('should generate a valid backup payload with metadata and SHA-256 checksum', async () => {
      const backup = await service.generateBackup(mockAdminUser, '127.0.0.1');

      expect(backup).toBeDefined();
      expect(backup.metadata.system).toBe('GMS_GATE_MANAGEMENT_SYSTEM');
      expect(backup.metadata.checksum).toBeDefined();
      expect(backup.data.users).toHaveLength(1);
      expect(activityLogsService.logAction).toHaveBeenCalled();
    });
  });

  describe('runAutomatedScheduledBackup', () => {
    it('should generate full backup manifest (PG_CUSTOM or JSON_SNAPSHOT fallback)', async () => {
      const manifest = await service.runAutomatedScheduledBackup(
        'MANUAL_EXPLICIT',
        mockAdminUser,
      );

      expect(manifest).toBeDefined();
      expect(manifest.backupId).toBeDefined();
      expect(['PG_CUSTOM', 'JSON_SNAPSHOT']).toContain(manifest.dumpFormat);
      expect(manifest.createdBy.email).toBe(mockAdminUser.email);
    });
  });

  describe('restoreDatabase', () => {
    it('should throw UnauthorizedException if admin password is wrong', async () => {
      const hashedPassword = await argon2.hash('SecretAdmin123');
      prismaService.user.findUnique.mockResolvedValue({
        id: mockAdminUser.id,
        passwordHash: hashedPassword,
      });

      const backup = await service.generateBackup(mockAdminUser);

      await expect(
        service.restoreDatabase(
          mockAdminUser,
          backup,
          'WrongPassword',
          '127.0.0.1',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw BadRequestException if backup file is corrupted / checksum mismatched', async () => {
      const hashedPassword = await argon2.hash('SecretAdmin123');
      prismaService.user.findUnique.mockResolvedValue({
        id: mockAdminUser.id,
        passwordHash: hashedPassword,
      });

      const backup = await service.generateBackup(mockAdminUser);
      backup.data.users = [{ id: 'hacked-user' }];

      await expect(
        service.restoreDatabase(
          mockAdminUser,
          backup,
          'SecretAdmin123',
          '127.0.0.1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
