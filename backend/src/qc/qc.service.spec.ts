import { Test, TestingModule } from '@nestjs/testing';
import { QcService } from './qc.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('QcService - Segregation of Duties (SoD)', () => {
  let service: QcService;
  let prismaService: PrismaService;
  let activityLogsService: ActivityLogsService;

  const mockPrismaService = {
    transaction: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockActivityLogsService = {
    logAction: jest.fn().mockResolvedValue({}),
  };

  const warehouseUser = {
    id: 'user-wh-1',
    role: 'WAREHOUSE',
    email: 'gudang@test.com',
  };

  const qcUser = {
    id: 'user-qc-1',
    role: 'QC',
    email: 'qc@test.com',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QcService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ActivityLogsService, useValue: mockActivityLogsService },
      ],
    }).compile();

    service = module.get<QcService>(QcService);
    prismaService = module.get<PrismaService>(PrismaService);
    activityLogsService = module.get<ActivityLogsService>(ActivityLogsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should THROW ForbiddenException (403) when WAREHOUSE role calls completeQcAnalysis on GBB transaction', async () => {
    mockPrismaService.transaction.findUnique.mockResolvedValueOnce({
      id: 'tx-124',
      processType: 'GBB',
      status: 'INCOMING_CHECK_PENDING',
    });

    await expect(
      service.completeQcAnalysis(
        'tx-124',
        warehouseUser as any,
        'Catatan aman',
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(mockActivityLogsService.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SOD_VIOLATION_BLOCKED',
        module: 'QC',
        status: 'FAILED',
      }),
    );
  });

  it('should ALLOW QC role to complete completeQcAnalysis on GBB transaction', async () => {
    const mockTx = {
      id: 'tx-124',
      processType: 'GBB',
      status: 'INCOMING_CHECK_PENDING',
    };

    mockPrismaService.transaction.findUnique.mockResolvedValue(mockTx);
    mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
      cb({
        transaction: {
          update: jest.fn().mockResolvedValue({
            ...mockTx,
            status: 'COMPLETED',
          }),
        },
      }),
    );

    const result = await service.completeQcAnalysis(
      'tx-124',
      qcUser as any,
      'Catatan aman',
    );

    expect(result.success).toBe(true);
  });
});
