import { Test, TestingModule } from '@nestjs/testing';
import { QcService } from '../qc/qc.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';

describe('Reopen Rerun Revisioning (P0-02)', () => {
  let qcService: QcService;

  const mockPrismaService = {
    transaction: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    qcVehicleCheck: {
      count: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
    },
    incomingMaterialCheck: {
      count: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrismaService)),
  };

  const mockActivityLogsService = {
    logAction: jest.fn().mockResolvedValue({}),
  };

  const mockAuthScopeService = {
    getTransactionScope: jest.fn().mockReturnValue({}),
  };

  const adminUser = {
    id: 'admin-1',
    role: 'ADMIN',
    email: 'admin@gms.local',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QcService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ActivityLogsService, useValue: mockActivityLogsService },
        { provide: AuthorizationScopeService, useValue: mockAuthScopeService },
      ],
    }).compile();

    qcService = module.get<QcService>(QcService);
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation((cb) =>
      cb(mockPrismaService),
    );
  });

  it('should calculate revision = max(revision) + 1 when submitting vehicle check after REOPEN', async () => {
    mockPrismaService.transaction.findFirst.mockResolvedValueOnce({
      id: 'tx-100',
      status: 'QC_VEHICLE_PENDING',
      processType: 'GBB',
      qcVehicleChecks: [],
    });

    mockPrismaService.qcVehicleCheck.count.mockResolvedValueOnce(0);
    mockPrismaService.qcVehicleCheck.aggregate.mockResolvedValueOnce({
      _max: { revision: 1 },
    });
    mockPrismaService.qcVehicleCheck.create.mockResolvedValueOnce({
      id: 'qcv-2',
      transactionId: 'tx-100',
      revision: 2,
      result: 'PASS',
    });
    mockPrismaService.transaction.update.mockResolvedValueOnce({
      id: 'tx-100',
      status: 'QC_VEHICLE_PASSED',
      revision: 3,
    });

    const result = await qcService.submitVehicleCheck(
      'tx-100',
      { result: 'PASS' } as any,
      'admin-1',
      adminUser as any,
    );

    expect(mockPrismaService.qcVehicleCheck.aggregate).toHaveBeenCalledWith({
      where: { transactionId: 'tx-100' },
      _max: { revision: true },
    });

    expect(mockPrismaService.qcVehicleCheck.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          transactionId: 'tx-100',
          revision: 2,
          result: 'PASS',
        }),
      }),
    );

    expect(result.success).toBe(true);
  });

  it('should calculate revision = max(revision) + 1 when submitting incoming material check after REOPEN', async () => {
    mockPrismaService.transaction.findFirst.mockResolvedValueOnce({
      id: 'tx-101',
      status: 'INCOMING_CHECK_PENDING',
      processType: 'GBB',
      incomingMaterialChecks: [],
    });

    mockPrismaService.incomingMaterialCheck.count.mockResolvedValueOnce(0);
    mockPrismaService.incomingMaterialCheck.aggregate.mockResolvedValueOnce({
      _max: { revision: 1 },
    });
    mockPrismaService.incomingMaterialCheck.create.mockResolvedValueOnce({
      id: 'im-2',
      transactionId: 'tx-101',
      revision: 2,
      result: 'PASS',
    });
    mockPrismaService.transaction.update.mockResolvedValueOnce({
      id: 'tx-101',
      status: 'INCOMING_CHECK_PASSED',
      revision: 3,
    });

    const result = await qcService.submitIncomingCheck(
      'tx-101',
      { result: 'PASS' } as any,
      'admin-1',
      adminUser as any,
    );

    expect(
      mockPrismaService.incomingMaterialCheck.aggregate,
    ).toHaveBeenCalledWith({
      where: { transactionId: 'tx-101' },
      _max: { revision: true },
    });

    expect(mockPrismaService.incomingMaterialCheck.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          transactionId: 'tx-101',
          revision: 2,
          result: 'PASS',
        }),
      }),
    );

    expect(result.success).toBe(true);
  });
});
