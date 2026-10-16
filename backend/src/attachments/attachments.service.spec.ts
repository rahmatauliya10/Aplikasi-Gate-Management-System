import { Test, TestingModule } from '@nestjs/testing';
import { AttachmentsService } from './attachments.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';

jest.mock('fs', () => {
  const original = jest.requireActual('fs');
  return {
    ...original,
    existsSync: jest.fn((...args: any[]) => original.existsSync(...args)),
    readdirSync: jest.fn((...args: any[]) => original.readdirSync(...args)),
    unlinkSync: jest.fn((...args: any[]) => original.unlinkSync(...args)),
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
  };

  const mockActivityLogsService = {
    logAction: jest.fn(),
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
        },
        {
          id: 'att-2',
          transactionId: 'tx-2',
          filePath: 'qc/missing.jpg',
          fileName: 'missing.jpg',
          sha256: 'hash2',
          size: 200,
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

    it('should delete orphan files when removeOrphans is true', async () => {
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
      (fs.unlinkSync as jest.Mock).mockImplementation(() => {});

      const result = await service.reconcileAttachmentStorage({
        removeOrphans: true,
      });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(false);
      expect(result.orphanFilesCount).toBe(1);
      expect(result.cleanedOrphanFilesCount).toBe(1);
      expect(fs.unlinkSync).toHaveBeenCalled();
    });
  });
});
