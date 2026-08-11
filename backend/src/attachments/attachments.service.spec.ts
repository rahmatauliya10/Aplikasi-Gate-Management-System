import { Test, TestingModule } from '@nestjs/testing';
import { AttachmentsService } from './attachments.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

describe('AttachmentsService', () => {
  let service: AttachmentsService;
  let prismaService: PrismaService;

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
        { provide: AuthorizationScopeService, useValue: mockAuthorizationScopeService },
      ],
    }).compile();

    service = module.get<AttachmentsService>(AttachmentsService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should reject path traversal in module name', async () => {
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
