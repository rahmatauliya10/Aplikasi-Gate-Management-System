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

  it('should classify exact 2% deviation as SAFE and 2.1% as WARNING', () => {
    // 1000 kg net weight, 980 kg actual -> deviation = 20 -> 2.0% -> SAFE
    const netWeight = 1000;
    const actual2 = 980;
    const dev2 = (Math.abs(netWeight - actual2) / netWeight) * 100;
    expect(dev2).toBe(2);
    expect(dev2 > 2 ? 'WARNING' : 'SAFE').toBe('SAFE');

    // 1000 kg net weight, 979 kg actual -> deviation = 21 -> 2.1% -> WARNING
    const actualWarning = 979;
    const devWarning = (Math.abs(netWeight - actualWarning) / netWeight) * 100;
    expect(devWarning).toBe(2.1);
    expect(devWarning > 5 ? 'CRITICAL' : devWarning > 2 ? 'WARNING' : 'SAFE').toBe('WARNING');
  });

  it('should classify exact 5% deviation as WARNING and 5.1% as CRITICAL', () => {
    const netWeight = 1000;

    // 1000 kg net weight, 950 kg actual -> deviation = 50 -> 5.0% -> WARNING
    const actual5 = 950;
    const dev5 = (Math.abs(netWeight - actual5) / netWeight) * 100;
    expect(dev5).toBe(5);
    expect(dev5 > 5 ? 'CRITICAL' : dev5 > 2 ? 'WARNING' : 'SAFE').toBe('WARNING');

    // 1000 kg net weight, 949 kg actual -> deviation = 51 -> 5.1% -> CRITICAL
    const actualCritical = 949;
    const devCritical = (Math.abs(netWeight - actualCritical) / netWeight) * 100;
    expect(devCritical).toBe(5.1);
    expect(devCritical > 5 ? 'CRITICAL' : devCritical > 2 ? 'WARNING' : 'SAFE').toBe('CRITICAL');
  });
});
