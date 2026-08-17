import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseBackupService } from './database-backup.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import {
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, createHmac } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('child_process', () => ({
  execFile: jest.fn((cmd: string, args: string[], opts: any, callback: any) => {
    const cb = typeof opts === 'function' ? opts : callback;
    if (cmd === 'pg_dump' && Array.isArray(args)) {
      const fileArg = args.find((a) => a.startsWith('--file='));
      if (fileArg) {
        const filePath = fileArg.replace('--file=', '');
        try {
          fs.writeFileSync(filePath, 'dummy_pg_dump_binary');
        } catch (e) {
          // ignore
        }
      }
    }
    if (cb) cb(null, { stdout: '', stderr: '' }, '');
  }),
}));

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
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5432/gms_test_db';
    process.env.BACKUP_SIGNATURE_SECRET = 'test_secret_key';

    prismaService = {
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined),
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
      transactionCorrectionItem: {
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

    it('should throw InternalServerErrorException if DATABASE_URL is missing (fail-closed)', async () => {
      delete process.env.DATABASE_URL;
      await expect(
        service.runAutomatedScheduledBackup('MANUAL_EXPLICIT', mockAdminUser),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('restoreDatabase & restoreFromPortableBundle', () => {
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

    it('should throw BadRequestException if portable bundle signature is invalid / tampered', async () => {
      const tamperedBundle = {
        metadata: { system: 'GMS_GATE_MANAGEMENT_SYSTEM' },
        dumpBase64: 'dummy_dump',
        signature: 'invalid_tampered_signature_hash',
      };

      await expect(
        service.restoreFromPortableBundle(
          mockAdminUser,
          tamperedBundle,
          'SecretAdmin123',
          '127.0.0.1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException with Signature mismatch if payload is tampered after signing', async () => {
      const secret = 'test_secret_key';
      process.env.BACKUP_SIGNATURE_SECRET = secret;

      const payload: any = {
        metadata: {
          system: 'GMS_GATE_MANAGEMENT_SYSTEM',
          backupId: 'BKP-TEST',
          checksums: { dump: 'dummy_checksum' },
        },
        dumpBase64: Buffer.from('dummy_dump_data').toString('base64'),
        attachmentsContent: null,
      };

      const payloadStr = JSON.stringify(payload);
      const signature = createHmac('sha256', secret)
        .update(payloadStr)
        .digest('hex');

      // Tamper payload after signing
      payload.metadata.backupId = 'BKP-HACKED';
      payload.signature = signature;

      await expect(
        service.restoreFromPortableBundle(
          mockAdminUser,
          payload,
          'SecretAdmin123',
          '127.0.0.1',
        ),
      ).rejects.toMatchObject({
        response: {
          message: expect.stringContaining('Signature mismatch'),
        },
      });
    });

    it('should throw BadRequestException specifically on attachment checksum failure when restoring valid bundle', async () => {
      const hashedPassword = await argon2.hash('SecretAdmin123');
      prismaService.user.findUnique.mockResolvedValue({
        id: mockAdminUser.id,
        passwordHash: hashedPassword,
      });

      const secret = 'test_secret_key';
      process.env.BACKUP_SIGNATURE_SECRET = secret;

      const dumpBuffer = Buffer.from('dummy PostgreSQL dump content');
      const dumpChecksum = createHash('sha256')
        .update(dumpBuffer)
        .digest('hex');

      const attachmentBuffer = Buffer.from('corrupted_image_data');

      const rawBundle: any = {
        metadata: {
          system: 'GMS_GATE_MANAGEMENT_SYSTEM',
          backupId: 'BKP-TEST-ATTACHMENT',
          checksums: {
            dump: dumpChecksum,
          },
        },
        dumpBase64: dumpBuffer.toString('base64'),
        attachmentsContent: {
          files: [
            {
              fileName: 'photo_test.jpg',
              base64Content: attachmentBuffer.toString('base64'),
              checksum: 'invalid_expected_checksum_value',
            },
          ],
        },
      };

      const payloadStr = JSON.stringify(rawBundle);
      const signature = createHmac('sha256', secret)
        .update(payloadStr)
        .digest('hex');
      rawBundle.signature = signature;

      const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
      const targetFilePath = path.join(uploadDir, 'photo_test.jpg');
      if (fs.existsSync(targetFilePath)) {
        fs.unlinkSync(targetFilePath);
      }

      await expect(
        service.restoreFromPortableBundle(
          mockAdminUser,
          rawBundle,
          'SecretAdmin123',
          '127.0.0.1',
        ),
      ).rejects.toMatchObject({
        response: {
          message: expect.stringContaining('photo_test.jpg'),
        },
      });

      expect(fs.existsSync(targetFilePath)).toBe(false);
    });

    it('should throw BadRequestException on attachment path traversal attempt and abort restore', async () => {
      const hashedPassword = await argon2.hash('SecretAdmin123');
      prismaService.user.findUnique.mockResolvedValue({
        id: mockAdminUser.id,
        passwordHash: hashedPassword,
      });

      const secret = 'test_secret_key';
      process.env.BACKUP_SIGNATURE_SECRET = secret;

      const dumpBuffer = Buffer.from('dummy dump');
      const dumpChecksum = createHash('sha256')
        .update(dumpBuffer)
        .digest('hex');

      const rawBundle: any = {
        metadata: {
          system: 'GMS_GATE_MANAGEMENT_SYSTEM',
          backupId: 'BKP-TEST-TRAVERSAL',
          checksums: {
            dump: dumpChecksum,
          },
        },
        dumpBase64: dumpBuffer.toString('base64'),
        attachmentsContent: {
          files: [
            {
              fileName: '../malicious_script.sh',
              base64Content: Buffer.from('echo hacked').toString('base64'),
              checksum: '',
            },
          ],
        },
      };

      const payloadStr = JSON.stringify(rawBundle);
      const signature = createHmac('sha256', secret)
        .update(payloadStr)
        .digest('hex');
      rawBundle.signature = signature;

      await expect(
        service.restoreFromPortableBundle(
          mockAdminUser,
          rawBundle,
          'SecretAdmin123',
          '127.0.0.1',
        ),
      ).rejects.toMatchObject({
        response: {
          message: expect.stringContaining('tidak valid'),
        },
      });
    });

    it('should recursively backup attachments and preserve relativePath in manifest', async () => {
      const testUploadDir = path.resolve('./test_uploads_recursive');
      process.env.UPLOAD_DIR = testUploadDir;
      const qcSubdir = path.join(testUploadDir, 'qc');
      const whSubdir = path.join(testUploadDir, 'warehouse');
      fs.mkdirSync(qcSubdir, { recursive: true });
      fs.mkdirSync(whSubdir, { recursive: true });

      fs.writeFileSync(path.join(qcSubdir, 'qc_sample.jpg'), 'qc_data');
      fs.writeFileSync(path.join(whSubdir, 'wh_sample.pdf'), 'wh_data');

      try {
        const manifest = await service.runAutomatedScheduledBackup(
          'MANUAL_EXPLICIT',
          mockAdminUser,
        );

        expect(manifest.localStatus).toBe('VERIFIED');
        expect(manifest.attachmentsCount).toBe(2);

        const archivePath = path.join(
          process.env.LOCAL_BACKUP_DIR || './backups/local',
          manifest.artifacts.attachmentsArchive || '',
        );
        const archive = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
        const paths = archive.files.map((f: any) => f.relativePath);

        expect(paths).toContain('qc/qc_sample.jpg');
        expect(paths).toContain('warehouse/wh_sample.pdf');
      } finally {
        if (fs.existsSync(testUploadDir)) {
          fs.rmSync(testUploadDir, { recursive: true, force: true });
        }
      }
    });

    it('should fail local backup status if DB attachment record exists but physical file is missing', async () => {
      prismaService.attachment.findMany.mockResolvedValueOnce([
        {
          id: 'att-missing-1',
          transactionId: 'tx-1',
          module: 'QC',
          attachmentType: 'QC_PHOTO',
          originalName: 'missing.jpg',
          fileName: 'missing.jpg',
          filePath: 'qc/missing.jpg',
          mimeType: 'image/jpeg',
          size: 1234,
        },
      ]);

      const testUploadDir = path.resolve('./test_uploads_missing');
      process.env.UPLOAD_DIR = testUploadDir;
      if (!fs.existsSync(testUploadDir)) {
        fs.mkdirSync(testUploadDir, { recursive: true });
      }

      try {
        const manifest = await service.runAutomatedScheduledBackup(
          'MANUAL_EXPLICIT',
          mockAdminUser,
        );

        expect(manifest.localStatus).toBe('FAILED');
        expect(manifest.reconciliation?.missingAttachmentCount).toBe(1);
      } finally {
        if (fs.existsSync(testUploadDir)) {
          fs.rmSync(testUploadDir, { recursive: true, force: true });
        }
      }
    });

    it('should return null for lastBackupAgeHours when no verified backup exists (P2-06)', async () => {
      jest.spyOn(service, 'getBackupHistory').mockResolvedValue([]);
      const status = await service.getSystemStatus();
      expect(status.status).toBe('CRITICAL');
      expect(status.lastBackupAgeHours).toBeNull();
    });

    it('should create native pg_dump backup even if legacy schema tables are missing (P0-02)', async () => {
      prismaService.transactionCorrection = {
        findMany: jest
          .fn()
          .mockRejectedValue(
            new Error(
              'Table not found: relation TransactionCorrection does not exist',
            ),
          ),
      };
      const manifest = await service.runAutomatedScheduledBackup(
        'MANUAL_PRE_UPDATE',
        mockAdminUser,
      );
      expect(manifest.backupId).toBeDefined();
      expect(manifest.localStatus).toBe('VERIFIED');
    });

    it('should return UNKNOWN storageStatus when statfsSync fails or throws', async () => {
      const originalStatfs = (fs as any).statfsSync;
      (fs as any).statfsSync = jest.fn().mockImplementation(() => {
        throw new Error('Filesystem stat unavailable');
      });

      const status = await service.getSystemStatus();
      expect(status.storageStatus).toBe('UNKNOWN');
      expect(status.storageFreeBytes).toBeNull();
      expect(status.storagePercent).toBeNull();

      (fs as any).statfsSync = originalStatfs;
    });

    it('should return KNOWN storageStatus when statfsSync succeeds', async () => {
      const originalStatfs = (fs as any).statfsSync;
      (fs as any).statfsSync = jest.fn().mockReturnValue({
        bavail: 1000,
        bsize: 1024,
        blocks: 4000,
      });

      const status = await service.getSystemStatus();
      expect(status.storageStatus).toBe('KNOWN');
      expect(status.storageFreeBytes).toBe(1000 * 1024);
      expect(status.storagePercent).toBe(75);

      (fs as any).statfsSync = originalStatfs;
    });
  });
});
