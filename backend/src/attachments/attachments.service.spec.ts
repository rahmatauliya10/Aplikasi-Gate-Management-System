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

describe('AttachmentsService', () => {
  let service: AttachmentsService;

  const mockPrismaService = {
    $transaction: jest.fn(),
    attachment: {
      create: jest.fn(),
      findFirst: jest.fn(),
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
});
