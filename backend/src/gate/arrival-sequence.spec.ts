import { GateService } from './gate.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';

describe('Daily Arrival Sequence Number Unit Tests', () => {
  let service: GateService;
  let mockPrisma: any;
  let mockActivityLogs: any;

  beforeEach(() => {
    mockPrisma = {
      transaction: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      dailyArrivalCounter: {
        upsert: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    mockActivityLogs = {
      logAction: jest.fn().mockResolvedValue({}),
    };
    service = new GateService(mockPrisma, mockActivityLogs);
  });

  it('1. should atomically allocate dailySequence = 1 for the first truck of the day', async () => {
    const mockTxClient = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      dailyArrivalCounter: {
        upsert: jest.fn().mockResolvedValue({
          dateKey: '20261015',
          lastSeq: 1,
        }),
      },
      transaction: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'tx-1', ...data }),
          ),
      },
    };

    mockPrisma.$transaction.mockImplementation(async (cb: any) =>
      cb(mockTxClient),
    );

    const user: JwtPayloadUser = {
      id: 'sec-1',
      email: 'sec@gms.local',
      role: 'SECURITY',
    } as any;

    const result = await service.checkIn(
      {
        plateNumber: 'B 1234 ABC',
        driverName: 'Pak Budi',
        driverPhone: '08123456789',
        vendorName: 'PT Logistik Prima',
        vehicleType: 'TRUCK_CDD',
        processType: 'GBB',
      },
      user,
    );

    expect(mockTxClient.dailyArrivalCounter.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ lastSeq: 1 }),
        update: expect.objectContaining({ lastSeq: { increment: 1 } }),
      }),
    );
    expect(result.data.dailySequence).toBe(1);
  });

  it('2. should increment dailySequence across GBB, GBJ, and GSP globally', async () => {
    let currentSeq = 1;
    const mockTxClient = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      dailyArrivalCounter: {
        upsert: jest.fn().mockImplementation(() => {
          currentSeq += 1;
          return Promise.resolve({
            dateKey: '20261015',
            lastSeq: currentSeq,
          });
        }),
      },
      transaction: {
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: `tx-${currentSeq}`, ...data }),
          ),
      },
    };

    mockPrisma.$transaction.mockImplementation(async (cb: any) =>
      cb(mockTxClient),
    );
    const user: JwtPayloadUser = {
      id: 'sec-1',
      email: 'sec@gms.local',
      role: 'SECURITY',
    } as any;

    // Second truck (GBJ)
    const resultGbj = await service.checkIn(
      {
        plateNumber: 'B 5678 DEF',
        driverName: 'Pak Joko',
        driverPhone: '08129876543',
        vendorName: 'PT Logistik Prima',
        vehicleType: 'TRUCK_WINGBOX',
        processType: 'GBJ',
      },
      user,
    );
    expect(resultGbj.data.dailySequence).toBe(2);

    // Third truck
    const result3 = await service.checkIn(
      {
        plateNumber: 'L 9999 XYZ',
        driverName: 'Pak Slamet',
        driverPhone: '08121111222',
        vendorName: 'PT Trans Kargo',
        vehicleType: 'TRUCK_FUSO',
        processType: 'GBB',
      },
      user,
    );
    expect(result3.data.dailySequence).toBe(3);
  });

  it('3. should gracefully fallback to count if atomic counter fails', async () => {
    const mockTxClient = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      dailyArrivalCounter: {
        upsert: jest.fn().mockRejectedValue(new Error('Counter lock timeout')),
      },
      transaction: {
        count: jest.fn().mockResolvedValue(5),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'tx-fallback', ...data }),
          ),
      },
    };

    mockPrisma.$transaction.mockImplementation(async (cb: any) =>
      cb(mockTxClient),
    );
    const user: JwtPayloadUser = {
      id: 'sec-1',
      email: 'sec@gms.local',
      role: 'SECURITY',
    } as any;

    const result = await service.checkIn(
      {
        plateNumber: 'N 8888 BB',
        driverName: 'Pak Dani',
        driverPhone: '08123333444',
        vendorName: 'PT Maju Bersama',
        vehicleType: 'TRUCK_TRAILER',
        processType: 'GBB',
      },
      user,
    );

    expect(result.data.dailySequence).toBe(6);
  });
});
