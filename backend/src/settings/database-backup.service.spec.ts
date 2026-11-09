import { Test, TestingModule } from '@nestjs/testing';
import {
  DatabaseBackupService,
  createSanitizingTransformStream,
  executeStreamingRestorePipeline,
  StreamingChildProcessLike,
} from './database-backup.service';
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
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

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
    }, 15000);

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
        try {
          if (fs.existsSync(testUploadDir)) {
            fs.rmSync(testUploadDir, {
              recursive: true,
              force: true,
              maxRetries: 3,
              retryDelay: 100,
            });
          }
        } catch (_) {
          // Ignore Windows file lock cleanup race
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

    it('should return UNKNOWN storageStatus when backup dir path throws stat error', async () => {
      const originalEnv = process.env.LOCAL_BACKUP_DIR;
      process.env.LOCAL_BACKUP_DIR =
        process.platform === 'win32'
          ? 'Z:\\non_existent_drive_9999\\path'
          : '/dev/null/cannot_exist/path';

      const status = await service.getSystemStatus();
      expect(status.storageStatus).toBe('UNKNOWN');
      expect(status.storageFreeBytes).toBeNull();
      expect(status.storagePercent).toBeNull();

      if (originalEnv !== undefined) {
        process.env.LOCAL_BACKUP_DIR = originalEnv;
      } else {
        delete process.env.LOCAL_BACKUP_DIR;
      }
    });

    it('should calculate and return storageStatus from localBackupDir filesystem stats', async () => {
      const status = await service.getSystemStatus();
      expect(['KNOWN', 'UNKNOWN']).toContain(status.storageStatus);
      if (status.storageStatus === 'KNOWN') {
        expect(status.storageFreeBytes).toBeGreaterThanOrEqual(0);
        expect(status.storagePercent).toBeGreaterThanOrEqual(0);
      }
    });

    it('should fail closed in production when BACKUP_DATABASE_URL is missing', async () => {
      const origNodeEnv = process.env.NODE_ENV;
      const origBackupUrl = process.env.BACKUP_DATABASE_URL;
      process.env.NODE_ENV = 'production';
      delete process.env.BACKUP_DATABASE_URL;

      await expect(
        service.runAutomatedScheduledBackup('MANUAL_PRE_UPDATE', mockAdminUser),
      ).rejects.toThrow(InternalServerErrorException);

      process.env.NODE_ENV = origNodeEnv;
      if (origBackupUrl !== undefined) {
        process.env.BACKUP_DATABASE_URL = origBackupUrl;
      }
    });

    it('should succeed in production when BACKUP_DATABASE_URL is provided', async () => {
      const origNodeEnv = process.env.NODE_ENV;
      const origBackupUrl = process.env.BACKUP_DATABASE_URL;
      process.env.NODE_ENV = 'production';
      process.env.BACKUP_DATABASE_URL =
        'postgresql://gms_backup:secret123@localhost:5432/gms?schema=public';

      const manifest = await service.runAutomatedScheduledBackup(
        'MANUAL_PRE_UPDATE',
        mockAdminUser,
      );
      expect(manifest.backupId).toBeDefined();

      process.env.NODE_ENV = origNodeEnv;
      if (origBackupUrl !== undefined) {
        process.env.BACKUP_DATABASE_URL = origBackupUrl;
      } else {
        delete process.env.BACKUP_DATABASE_URL;
      }
    });
  });

  describe('createSanitizingTransformStream (M02 COPY-aware restore filter)', () => {
    async function runTransform(chunks: (string | Buffer)[]): Promise<string> {
      const stream = createSanitizingTransformStream();
      let result = '';
      return new Promise((resolve, reject) => {
        stream.on('data', (d: Buffer) => {
          result += d.toString('utf8');
        });
        stream.on('end', () => resolve(result));
        stream.on('error', reject);
        for (const chunk of chunks) {
          const buf =
            typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
          stream.write(buf);
        }
        stream.end();
      });
    }

    it('should sanitize SET transaction_timeout outside COPY blocks', async () => {
      const input = [
        'SET statement_timeout = 0;\n',
        'SET transaction_timeout = 0;\n',
        'SET client_encoding = "UTF8";\n',
      ];
      const output = await runTransform(input);
      expect(output).toContain('-- sanitized: SET transaction_timeout = 0;');
      expect(output).toContain('SET statement_timeout = 0;');
      expect(output).toContain('SET client_encoding = "UTF8";');
    });

    it('should NEVER sanitize or drop literal transaction_timeout inside COPY blocks', async () => {
      const input = [
        'COPY "ActivityLog" ("id", "action", "details") FROM stdin;\n',
        '1\tLOG_INFO\tConfig transaction_timeout modified\n',
        '2\tLOG_WARN\tExecuted SET transaction_timeout = 0; manually\n',
        '\\.\n',
        'SET transaction_timeout = 0;\n',
      ];
      const output = await runTransform(input);
      // Data lines inside COPY block must remain completely unmodified
      expect(output).toContain(
        '1\tLOG_INFO\tConfig transaction_timeout modified',
      );
      expect(output).toContain(
        '2\tLOG_WARN\tExecuted SET transaction_timeout = 0; manually',
      );
      // But the statement outside COPY block must be sanitized
      expect(output).toContain('-- sanitized: SET transaction_timeout = 0;');
    });

    it('should handle multi-byte UTF-8 split across chunk boundaries without corruption', async () => {
      // 📦 is 4 bytes: 0xF0 0x9F 0x93 0xA6
      // Let's create a full line with non-ASCII text and an emoji
      const text =
        'Batubara — Kontrak PT. Sinar Jaya 📦\nSET transaction_timeout = 0;\n';
      const fullBuf = Buffer.from(text, 'utf8');

      // Find the index of the emoji byte
      const emojiIndex = fullBuf.indexOf(Buffer.from('📦'));
      // Split right inside the 4-byte emoji sequence
      const chunk1 = fullBuf.subarray(0, emojiIndex + 2);
      const chunk2 = fullBuf.subarray(emojiIndex + 2);

      const output = await runTransform([chunk1, chunk2]);
      expect(output).toContain('Batubara — Kontrak PT. Sinar Jaya 📦');
      expect(output).toContain('-- sanitized: SET transaction_timeout = 0;');
    });
  });

  describe('executeStreamingRestorePipeline', () => {
    class MockProcess
      extends EventEmitter
      implements StreamingChildProcessLike
    {
      stdout: PassThrough | null = new PassThrough();
      stderr: PassThrough | null = new PassThrough();
      stdin: PassThrough | null = new PassThrough();
      killed = false;

      kill(signal?: NodeJS.Signals | number): boolean {
        this.killed = true;
        return true;
      }

      simulateClose(code: number | null, signal: string | null = null) {
        this.emit('close', code, signal);
      }
    }

    let restoreProc: MockProcess;
    let psqlProc: MockProcess;

    beforeEach(() => {
      restoreProc = new MockProcess();
      psqlProc = new MockProcess();
    });

    it('should successfully complete streaming restore when both processes exit with 0 and pipeline finishes', async () => {
      const promise = executeStreamingRestorePipeline(
        restoreProc,
        psqlProc,
        createSanitizingTransformStream(),
        5000,
      );

      restoreProc.stdout?.write('SET statement_timeout = 0;\n');
      restoreProc.stdout?.end();

      restoreProc.simulateClose(0);
      psqlProc.simulateClose(0);

      await expect(promise).resolves.toBeUndefined();
    });

    it('should fail-closed when psql process exits with non-zero exit code (connection severed or syntax error)', async () => {
      const promise = executeStreamingRestorePipeline(
        restoreProc,
        psqlProc,
        createSanitizingTransformStream(),
        5000,
      );

      psqlProc.stderr?.write('FATAL: connection terminated unexpectedly\n');
      restoreProc.stdout?.end();

      restoreProc.simulateClose(0);
      psqlProc.simulateClose(1);

      await expect(promise).rejects.toThrow(
        /psql streaming execution exited with code 1/,
      );
      expect(restoreProc.killed).toBe(true);
    });

    it('should fail-closed when pg_restore process exits with non-zero exit code', async () => {
      const promise = executeStreamingRestorePipeline(
        restoreProc,
        psqlProc,
        createSanitizingTransformStream(),
        5000,
      );

      restoreProc.stderr?.write(
        'pg_restore: error: archive header corrupted\n',
      );
      restoreProc.stdout?.end();

      restoreProc.simulateClose(1);
      psqlProc.simulateClose(0);

      await expect(promise).rejects.toThrow(
        /pg_restore streaming process exited with code 1/,
      );
      expect(psqlProc.killed).toBe(true);
    });

    it('should fail-closed when child process is terminated by signal (SIGKILL / SIGTERM)', async () => {
      const promise = executeStreamingRestorePipeline(
        restoreProc,
        psqlProc,
        createSanitizingTransformStream(),
        5000,
      );

      restoreProc.stdout?.end();
      restoreProc.simulateClose(null, 'SIGKILL');
      psqlProc.simulateClose(0);

      await expect(promise).rejects.toThrow(
        /pg_restore streaming process exited with code -1/,
      );
    });

    it('should fail-closed when stream pipeline encounters an error mid-stream', async () => {
      const promise = executeStreamingRestorePipeline(
        restoreProc,
        psqlProc,
        createSanitizingTransformStream(),
        5000,
      );

      restoreProc.stdout?.destroy(
        new Error('I/O error reading dump stream mid-COPY'),
      );

      await expect(promise).rejects.toThrow(
        'I/O error reading dump stream mid-COPY',
      );
      expect(restoreProc.killed).toBe(true);
      expect(psqlProc.killed).toBe(true);
    });

    it('should fail-closed on execution timeout and terminate processes', async () => {
      const promise = executeStreamingRestorePipeline(
        restoreProc,
        psqlProc,
        createSanitizingTransformStream(),
        50, // 50ms timeout for test
      );

      await expect(promise).rejects.toThrow(
        /Streaming restore execution timed out/,
      );
      expect(restoreProc.killed).toBe(true);
      expect(psqlProc.killed).toBe(true);
    });
  });
});
