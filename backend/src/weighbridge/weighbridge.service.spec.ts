import { Test, TestingModule } from '@nestjs/testing';
import { WeighbridgeService } from './weighbridge.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';

describe('WeighbridgeService Fraud Calculation', () => {
  let service: WeighbridgeService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeighbridgeService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn((cb) =>
              cb({
                transaction: { findUnique: jest.fn(), update: jest.fn() },
                weighbridgeRecord: { create: jest.fn() },
                transactionStatusHistory: { create: jest.fn() },
                fraudCheck: { create: jest.fn() },
              }),
            ),
            transaction: { findUnique: jest.fn() },
            weighbridgeRecord: { findFirst: jest.fn() },
          },
        },
        {
          provide: ActivityLogsService,
          useValue: { logAction: jest.fn().mockResolvedValue(true) },
        },
      ],
    }).compile();

    service = module.get<WeighbridgeService>(WeighbridgeService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should handle divide by zero when both netWeight and actualWeight are 0', async () => {
    const mockTx = {
      id: 'tx-1',
      status: 'QC_VEHICLE_REJECTED',
      processType: 'GBJ',
      grossWeight: 0,
      tareWeight: 0, // netWeight will be 0
      actualWeight: 0, // causes Math.max(0, 0) -> 0
    };

    const txClient = {
      transaction: {
        findUnique: jest.fn().mockResolvedValue(mockTx),
        update: jest.fn().mockResolvedValue(mockTx),
      },
      weighbridgeRecord: { create: jest.fn() },
      transactionStatusHistory: { create: jest.fn() },
      fraudCheck: { create: jest.fn() },
    };

    jest
      .spyOn(prismaService, '$transaction')
      .mockImplementation(async (cb: any) => cb(txClient));

    jest
      .spyOn(prismaService.transaction, 'findUnique')
      .mockResolvedValue(mockTx as any);

    jest
      .spyOn(prismaService.weighbridgeRecord, 'findFirst')
      .mockResolvedValue(null);

    await service.submitWeighOut('tx-1', { weight: 0 }, {
      id: 'user-1',
    } as any);

    // Ensure fraudCheck was created with 0% deviation, avoiding NaN
    expect(txClient.fraudCheck.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deviationPercent: 0,
          riskLevel: 'SAFE',
        }),
      }),
    );
  });
});
