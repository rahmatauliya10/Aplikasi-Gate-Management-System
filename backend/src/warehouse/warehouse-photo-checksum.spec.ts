import * as fs from 'fs';
import * as crypto from 'crypto';

jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    existsSync: jest.fn().mockReturnValue(true),
    statSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    unlinkSync: jest.fn(),
    mkdirSync: jest.fn(),
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';

describe('Warehouse Photo Checksum & Integrity Verification', () => {
  let service: WarehouseService;

  const mockUser: JwtPayloadUser = {
    id: 'user-wh-test',
    email: 'wh@test.com',
    role: 'WAREHOUSE_OPERATOR',
    permissions: [],
    assignedProcesses: ['GSP'],
    accessibleWarehouses: ['GSP'],
  };

  const mockPrisma = {
    $transaction: jest.fn(),
    transaction: {
      findUnique: jest.fn(),
    },
    warehouseProcess: {
      findFirst: jest.fn(),
    },
    attachment: {
      findFirst: jest.fn(),
    },
    userWarehouseAccess: {
      findMany: jest.fn().mockResolvedValue([{ processType: 'GSP' }]),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WarehouseService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ActivityLogsService,
          useValue: { logAction: jest.fn().mockResolvedValue({}) },
        },
        {
          provide: AuthorizationScopeService,
          useValue: {
            assertProcessAccess: jest.fn(),
            assertWarehouseAccess: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WarehouseService>(WarehouseService);
  });

  it('rejects truncated JPEG file with checksum mismatch (CORRUPTED_PHYSICAL_PHOTO_FILE)', async () => {
    // A 10-byte truncated JPEG (starts with 0xFF, 0xD8, 0xFF)
    const truncatedJpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
    ]);
    const originalJpeg = Buffer.concat([
      truncatedJpeg,
      Buffer.from([0x01, 0x02, 0x03]),
    ]);
    const originalChecksum = crypto
      .createHash('sha256')
      .update(originalJpeg)
      .digest('hex');

    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.statSync as jest.Mock).mockReturnValue({ size: truncatedJpeg.length });
    (fs.readFileSync as jest.Mock).mockReturnValue(truncatedJpeg);

    mockPrisma.attachment.findFirst.mockResolvedValueOnce({
      id: 'att-truncated-1',
      transactionId: 'tx-test-1',
      module: 'WAREHOUSE',
      attachmentType: 'PHOTO',
      isCurrent: true,
      originalName: 'CLEAN_VEHICLE_evidence.jpg',
      revision: 1,
      filePath: 'checklist-evidence/truncated.jpg',
      size: originalJpeg.length, // 13 bytes expected, but file is only 10 bytes!
      sha256: originalChecksum, // Checksum of original untruncated file
    });

    // Invoke private validateNotOkItemEvidences through any method or cast
    const validateFn = (service as any).validateNotOkItemEvidences.bind(
      service,
    );

    await expect(
      validateFn(
        'tx-test-1',
        [
          {
            code: 'CLEAN_VEHICLE',
            result: 'OK',
            photoAttachmentId: 'att-truncated-1',
          },
        ],
        1,
        mockPrisma,
      ),
    ).rejects.toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          errors: expect.arrayContaining(['CORRUPTED_PHYSICAL_PHOTO_FILE']),
        }),
      }),
    );
  });

  it('accepts valid physical photo when checksum and size match registered attachment metadata', async () => {
    const validPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    const validChecksum = crypto
      .createHash('sha256')
      .update(validPng)
      .digest('hex');

    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.statSync as jest.Mock).mockReturnValue({ size: validPng.length });
    (fs.readFileSync as jest.Mock).mockReturnValue(validPng);

    mockPrisma.attachment.findFirst.mockResolvedValueOnce({
      id: 'att-valid-1',
      transactionId: 'tx-test-1',
      module: 'WAREHOUSE',
      attachmentType: 'PHOTO',
      isCurrent: true,
      originalName: 'CLEAN_VEHICLE_evidence.png',
      revision: 1,
      filePath: 'checklist-evidence/valid.png',
      size: validPng.length,
      sha256: validChecksum,
    });

    const validateFn = (service as any).validateNotOkItemEvidences.bind(
      service,
    );
    const res = await validateFn(
      'tx-test-1',
      [
        {
          code: 'CLEAN_VEHICLE',
          result: 'OK',
          photoAttachmentId: 'att-valid-1',
        },
      ],
      1,
      mockPrisma,
    );

    expect(res).toBeDefined();
    expect(res.createdFiles).toEqual([]);
  });
});
