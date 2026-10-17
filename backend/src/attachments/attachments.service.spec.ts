import { Test, TestingModule } from '@nestjs/testing';
import { AttachmentsService } from './attachments.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as fs from 'fs';

jest.mock('fs', () => {
  const original = jest.requireActual('fs');
  return {
    ...original,
    existsSync: jest.fn((...args: any[]) => original.existsSync(...args)),
    readdirSync: jest.fn((...args: any[]) => original.readdirSync(...args)),
    unlinkSync: jest.fn((...args: any[]) => original.unlinkSync(...args)),
    renameSync: jest.fn((...args: any[]) => original.renameSync(...args)),
    mkdirSync: jest.fn((...args: any[]) => original.mkdirSync(...args)),
    statSync: jest.fn((...args: any[]) => ({
      mtimeMs: 0,
      size: 1024,
      isFile: () => true,
      isDirectory: () => false,
    })),
  };
});

describe('AttachmentsService', () => {
  let service: AttachmentsService;

  const mockPrismaService = {
    $transaction: jest.fn(),
    attachment: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    transaction: {
      findFirst: jest.fn(),
    },
    transactionCorrection: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    systemIssue: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const mockActivityLogsService = {
    logAction: jest.fn(),
    logActionStrict: jest.fn(),
  };

  const mockAuthorizationScopeService = {
    getTransactionScope: jest.fn().mockReturnValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ActivityLogsService, useValue: mockActivityLogsService },
        {
          provide: AuthorizationScopeService,
          useValue: mockAuthorizationScopeService,
        },
      ],
    }).compile();

    service = module.get<AttachmentsService>(AttachmentsService);
    mockPrismaService.transactionCorrection.findMany.mockResolvedValue([]);
    mockPrismaService.systemIssue.findMany.mockResolvedValue([]);
    mockActivityLogsService.logAction.mockResolvedValue({ id: 'log-1' });
    mockActivityLogsService.logActionStrict.mockResolvedValue({
      id: 'log-strict-1',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should reject path traversal in module name', async () => {
    mockPrismaService.transaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      status: 'IN_PROGRESS',
    });

    const mockFile = {
      path: '/tmp/quarantine/test.jpg',
      originalname: 'test.jpg',
      mimetype: 'image/jpeg',
      size: 1024,
    };

    await expect(
      service.processQuarantineUpload(
        mockFile,
        'tx-1',
        { module: '../../outside' },
        { id: 'usr-1', role: 'QC', email: 'qc@gms.local' },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject unapproved module name', async () => {
    mockPrismaService.transaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      status: 'IN_PROGRESS',
    });

    const mockFile = {
      path: '/tmp/quarantine/test.jpg',
      originalname: 'test.jpg',
      mimetype: 'image/jpeg',
      size: 1024,
    };

    await expect(
      service.processQuarantineUpload(
        mockFile,
        'tx-1',
        { module: 'malicious' },
        { id: 'usr-1', role: 'QC', email: 'qc@gms.local' },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw NotFoundException if transaction is not found or outside user scope', async () => {
    mockPrismaService.transaction.findFirst.mockResolvedValue(null);

    const mockFile = {
      path: '/tmp/quarantine/test.jpg',
      originalname: 'test.jpg',
      mimetype: 'image/jpeg',
      size: 1024,
    };

    await expect(
      service.processQuarantineUpload(
        mockFile,
        'tx-unauthorized',
        { module: 'qc' },
        { id: 'usr-1', role: 'QC', email: 'qc@gms.local' },
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException if transaction is COMPLETED and user is non-ADMIN', async () => {
    mockPrismaService.transaction.findFirst.mockResolvedValue({
      id: 'tx-1',
      status: 'COMPLETED',
    });

    const mockFile = {
      path: '/tmp/quarantine/test.jpg',
      originalname: 'test.jpg',
      mimetype: 'image/jpeg',
      size: 1024,
    };

    await expect(
      service.processQuarantineUpload(
        mockFile,
        'tx-1',
        { module: 'qc' },
        { id: 'usr-1', role: 'QC', email: 'qc@gms.local' },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should clean up temporary file in quarantine if authorization or terminal check fails', async () => {
    const fs = require('fs');
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

    mockPrismaService.transaction.findFirst.mockResolvedValue(null);

    const mockFile = {
      path: '/tmp/quarantine/temp-12345.jpg',
      originalname: 'temp.jpg',
      mimetype: 'image/jpeg',
      size: 1024,
    };

    await expect(
      service.processQuarantineUpload(
        mockFile,
        'tx-unauthorized',
        { module: 'qc' },
        { id: 'usr-1', role: 'QC', email: 'qc@gms.local' },
      ),
    ).rejects.toThrow(NotFoundException);

    expect(unlinkSpy).toHaveBeenCalledWith('/tmp/quarantine/temp-12345.jpg');
    unlinkSpy.mockRestore();
  });

  it('should throw NotFoundException if attachment is missing on download', async () => {
    mockPrismaService.attachment.findFirst.mockResolvedValue(null);

    await expect(
      service.downloadAttachment(
        'att-999',
        { id: 'usr-1', role: 'ADMIN', email: 'admin@gms.local' },
        {} as any,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException if user lacks transaction scope on download', async () => {
    mockPrismaService.attachment.findFirst.mockResolvedValue({
      id: 'att-1',
      transactionId: 'tx-unauthorized',
      isCurrent: true,
      filePath: 'qc/test.jpg',
    });

    mockPrismaService.transaction.findFirst.mockResolvedValue(null);

    await expect(
      service.downloadAttachment(
        'att-1',
        { id: 'usr-wh', role: 'WAREHOUSE', email: 'wh@gms.local' },
        {} as any,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  describe('reconcileAttachmentStorage', () => {
    it('should identify orphan files and missing records without deleting when dryRun is true', async () => {
      mockPrismaService.attachment.findMany.mockResolvedValue([
        {
          id: 'att-1',
          transactionId: 'tx-1',
          filePath: 'photo1.jpg',
          fileName: 'photo1.jpg',
          sha256: 'hash1',
          size: 100,
          isCurrent: true,
          revision: 1,
        },
        {
          id: 'att-2',
          transactionId: 'tx-2',
          filePath: 'qc/missing.jpg',
          fileName: 'missing.jpg',
          sha256: 'hash2',
          size: 200,
          isCurrent: true,
          revision: 1,
        },
      ]);

      (fs.existsSync as jest.Mock).mockImplementation((p: any) => {
        if (p.toString().includes('missing.jpg')) return false;
        return true;
      });
      (fs.readdirSync as jest.Mock).mockImplementation((_dir: any) => {
        return [
          {
            name: 'photo1.jpg',
            isFile: () => true,
            isDirectory: () => false,
          },
          {
            name: 'orphan.jpg',
            isFile: () => true,
            isDirectory: () => false,
          },
        ] as any;
      });
      (fs.unlinkSync as jest.Mock).mockImplementation(() => {});

      const result = await service.reconcileAttachmentStorage({ dryRun: true });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.orphanFilesCount).toBe(1);
      expect(result.orphanFiles).toContain('orphan.jpg');
      expect(result.cleanedOrphanFilesCount).toBe(0);
      expect(result.missingRecordsCount).toBe(1);
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('should protect historical attachment records (isCurrent: false) from orphan classification', async () => {
      mockPrismaService.attachment.findMany.mockResolvedValue([
        {
          id: 'att-historical',
          transactionId: 'tx-old',
          filePath: 'historical-v1.jpg',
          fileName: 'historical-v1.jpg',
          isCurrent: false,
          revision: 1,
        },
      ]);

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockImplementation((_dir: any) => {
        return [
          {
            name: 'historical-v1.jpg',
            isFile: () => true,
            isDirectory: () => false,
          },
        ] as any;
      });

      const result = await service.reconcileAttachmentStorage({
        removeOrphans: true,
      });

      expect(result.orphanFilesCount).toBe(0);
      expect(result.cleanedOrphanFilesCount).toBe(0);
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('should protect recent files within safety grace period from orphan deletion', async () => {
      mockPrismaService.attachment.findMany.mockResolvedValue([]);

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockImplementation((_dir: any) => {
        return [
          {
            name: 'in-flight-upload.jpg',
            isFile: () => true,
            isDirectory: () => false,
          },
        ] as any;
      });

      // Mock recent file modified 5 minutes ago
      (fs.statSync as jest.Mock).mockReturnValue({
        mtimeMs: Date.now() - 5 * 60 * 1000,
        size: 5000,
      });

      const result = await service.reconcileAttachmentStorage({
        removeOrphans: true,
        gracePeriodMinutes: 1440, // 24 hours
      });

      expect(result.filesInGracePeriodCount).toBe(1);
      expect(result.filesInGracePeriod).toContain('in-flight-upload.jpg');
      expect(result.orphanFilesCount).toBe(0);
      expect(result.cleanedOrphanFilesCount).toBe(0);
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('should move orphan files to quarantine and log both INTENT and PURGE via logActionStrict by default (Two-Stage Quarantine)', async () => {
      mockPrismaService.attachment.findMany.mockResolvedValue([]);

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockImplementation((_dir: any) => {
        return [
          {
            name: 'orphan.jpg',
            isFile: () => true,
            isDirectory: () => false,
          },
        ] as any;
      });
      (fs.statSync as jest.Mock).mockReturnValue({
        mtimeMs: Date.now() - 48 * 60 * 60 * 1000, // 48 hours old
        size: 2048,
        isFile: () => true,
        isDirectory: () => false,
      });
      (fs.renameSync as jest.Mock).mockImplementation(() => {});

      const adminUser = {
        id: 'usr-admin-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      };
      const result = await service.reconcileAttachmentStorage(
        { removeOrphans: true, dryRun: false },
        adminUser,
        '192.168.1.10',
      );

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(false);
      expect(result.quarantine).toBe(true);
      expect(result.orphanFilesCount).toBe(1);
      expect(result.cleanedOrphanFilesCount).toBe(1);
      expect(result.quarantinedFilesCount).toBe(1);
      expect(result.freedBytes).toBe(2048);
      expect(fs.renameSync).toHaveBeenCalled();
      expect(fs.unlinkSync).not.toHaveBeenCalled();

      // Verify INTENT was recorded strictly first, then PURGE
      expect(mockActivityLogsService.logActionStrict).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'usr-admin-1',
          action: 'ATTACHMENT_RECONCILE_INTENT',
          module: 'ATTACHMENTS',
          status: 'SUCCESS',
        }),
      );
      expect(mockActivityLogsService.logActionStrict).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'usr-admin-1',
          action: 'ATTACHMENT_RECONCILE_PURGE',
          module: 'ATTACHMENTS',
          status: 'SUCCESS',
        }),
      );
    });

    it('should permanently unlink orphan files when quarantineOrphans is explicitly false', async () => {
      mockPrismaService.attachment.findMany.mockResolvedValue([]);
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockImplementation((_dir: any) => {
        return [
          { name: 'orphan.jpg', isFile: () => true, isDirectory: () => false },
        ] as any;
      });
      (fs.statSync as jest.Mock).mockReturnValue({
        mtimeMs: Date.now() - 48 * 60 * 60 * 1000,
        size: 2048,
        isFile: () => true,
        isDirectory: () => false,
      });
      (fs.unlinkSync as jest.Mock).mockImplementation(() => {});

      const adminUser = {
        id: 'usr-admin-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      };
      const result = await service.reconcileAttachmentStorage(
        { removeOrphans: true, dryRun: false, quarantineOrphans: false },
        adminUser,
      );

      expect(result.quarantine).toBe(false);
      expect(result.cleanedOrphanFilesCount).toBe(1);
      expect(fs.unlinkSync).toHaveBeenCalled();
      expect(fs.renameSync).not.toHaveBeenCalled();
    });

    it('should restore quarantined files back to active storage directory', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockImplementation((_dir: any) => {
        return [
          {
            name: 'orphan.jpg',
            isFile: () => true,
            isDirectory: () => false,
          },
        ] as any;
      });
      (fs.renameSync as jest.Mock).mockImplementation(() => {});

      const adminUser = {
        id: 'usr-admin-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      };
      const result = await service.restoreQuarantinedFiles(
        'reconcile-run-123',
        adminUser,
      );

      expect(result.success).toBe(true);
      expect(result.restoredFilesCount).toBe(1);
      expect(fs.renameSync).toHaveBeenCalled();
      expect(mockActivityLogsService.logActionStrict).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'usr-admin-1',
          action: 'ATTACHMENT_RECONCILE_RESTORE',
          referenceId: 'reconcile-run-123',
        }),
      );
    });

    it('should NOT delete or quarantine files when dryRun is false but removeOrphans is false (Dual Affirmation)', async () => {
      mockPrismaService.attachment.findMany.mockResolvedValue([]);
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockImplementation((_dir: any) => {
        return [
          { name: 'orphan.jpg', isFile: () => true, isDirectory: () => false },
        ] as any;
      });
      (fs.statSync as jest.Mock).mockReturnValue({
        mtimeMs: Date.now() - 48 * 60 * 60 * 1000,
        size: 2048,
        isFile: () => true,
        isDirectory: () => false,
      });
      (fs.unlinkSync as jest.Mock).mockImplementation(() => {});
      (fs.renameSync as jest.Mock).mockImplementation(() => {});

      const adminUser = {
        id: 'usr-admin-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      };
      const result = await service.reconcileAttachmentStorage(
        { dryRun: false, removeOrphans: false },
        adminUser,
      );

      expect(result.dryRun).toBe(true);
      expect(result.orphanFilesCount).toBe(1);
      expect(result.cleanedOrphanFilesCount).toBe(0);
      expect(fs.unlinkSync).not.toHaveBeenCalled();
      expect(fs.renameSync).not.toHaveBeenCalled();
    });

    it('should NOT delete or quarantine files when removeOrphans is true but dryRun is omitted (Dual Affirmation)', async () => {
      mockPrismaService.attachment.findMany.mockResolvedValue([]);
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockImplementation((_dir: any) => {
        return [
          { name: 'orphan.jpg', isFile: () => true, isDirectory: () => false },
        ] as any;
      });
      (fs.statSync as jest.Mock).mockReturnValue({
        mtimeMs: Date.now() - 48 * 60 * 60 * 1000,
        size: 2048,
        isFile: () => true,
        isDirectory: () => false,
      });
      (fs.unlinkSync as jest.Mock).mockImplementation(() => {});
      (fs.renameSync as jest.Mock).mockImplementation(() => {});

      const adminUser = {
        id: 'usr-admin-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      };
      const result = await service.reconcileAttachmentStorage(
        { removeOrphans: true }, // dryRun not explicitly set to false
        adminUser,
      );

      expect(result.dryRun).toBe(true);
      expect(result.orphanFilesCount).toBe(1);
      expect(result.cleanedOrphanFilesCount).toBe(0);
      expect(fs.unlinkSync).not.toHaveBeenCalled();
      expect(fs.renameSync).not.toHaveBeenCalled();
    });

    it('should reject live cleanup if caller is unauthenticated (Fail-Closed)', async () => {
      await expect(
        service.reconcileAttachmentStorage({
          removeOrphans: true,
          dryRun: false,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should abort live cleanup and throw InternalServerErrorException if reference query fails (Fail-Closed)', async () => {
      mockPrismaService.attachment.findMany.mockResolvedValue([]);
      mockPrismaService.transactionCorrection.findMany.mockRejectedValueOnce(
        new Error('DB Connection Timeout'),
      );

      const adminUser = {
        id: 'usr-admin-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      };
      await expect(
        service.reconcileAttachmentStorage(
          { removeOrphans: true, dryRun: false },
          adminUser,
        ),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should abort live cleanup and leave files 100% untouched if ATTACHMENT_RECONCILE_INTENT audit fails (Zero-Touch Fail-Closed)', async () => {
      mockPrismaService.attachment.findMany.mockResolvedValue([]);
      mockPrismaService.transactionCorrection.findMany.mockResolvedValue([]);
      mockPrismaService.systemIssue.findMany.mockResolvedValue([]);

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      // REAL ORPHAN FILES PRESENT IN DIRECTORY
      (fs.readdirSync as jest.Mock).mockImplementation((_dir: any) => [
        {
          name: 'critical-doc-1.pdf',
          isFile: () => true,
          isDirectory: () => false,
        },
        {
          name: 'critical-doc-2.jpg',
          isFile: () => true,
          isDirectory: () => false,
        },
      ]);
      (fs.statSync as jest.Mock).mockReturnValue({
        mtimeMs: Date.now() - 48 * 60 * 60 * 1000,
        size: 5120,
        isFile: () => true,
        isDirectory: () => false,
      });

      // Strict intent audit fails (e.g. database error)
      mockActivityLogsService.logActionStrict.mockRejectedValueOnce(
        new Error('Audit database out of disk space'),
      );

      const adminUser = {
        id: 'usr-admin-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      };

      await expect(
        service.reconcileAttachmentStorage(
          { removeOrphans: true, dryRun: false },
          adminUser,
        ),
      ).rejects.toThrow(InternalServerErrorException);

      // ZERO-TOUCH PROOF: Neither unlink nor rename was called on disk!
      expect(fs.unlinkSync).not.toHaveBeenCalled();
      expect(fs.renameSync).not.toHaveBeenCalled();
    });

    it('should abort if outcome audit fails after cleanup', async () => {
      mockPrismaService.attachment.findMany.mockResolvedValue([]);
      mockPrismaService.transactionCorrection.findMany.mockResolvedValue([]);
      mockPrismaService.systemIssue.findMany.mockResolvedValue([]);

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockImplementation((_dir: any) => [
        {
          name: 'orphan.jpg',
          isFile: () => true,
          isDirectory: () => false,
        },
      ]);
      (fs.statSync as jest.Mock).mockReturnValue({
        mtimeMs: Date.now() - 48 * 60 * 60 * 1000,
        size: 1024,
        isFile: () => true,
        isDirectory: () => false,
      });
      (fs.renameSync as jest.Mock).mockImplementation(() => {});

      // First call (intent) succeeds, second call (outcome) fails
      mockActivityLogsService.logActionStrict
        .mockResolvedValueOnce({ id: 'intent-log-1' })
        .mockRejectedValueOnce(new Error('Audit outcome table error'));

      const adminUser = {
        id: 'usr-admin-1',
        role: 'ADMIN',
        email: 'admin@gms.local',
      };

      await expect(
        service.reconcileAttachmentStorage(
          { removeOrphans: true, dryRun: false },
          adminUser,
        ),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
