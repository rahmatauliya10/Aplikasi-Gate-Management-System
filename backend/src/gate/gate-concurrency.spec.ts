import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { GateService } from './gate.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';

describe('PR-03: Gate Plate Normalization & Concurrency Protection', () => {
  let gateService: GateService;

  const mockPrismaService: any = {
    transaction: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    },
    dailyArrivalCounter: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation((args: any) =>
        Promise.resolve({
          dateKey: args?.where?.dateKey || '20261016',
          lastSeq: args?.create?.lastSeq ?? args?.update?.lastSeq ?? 1,
        }),
      ),
    },
    $transaction: jest.fn(),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };

  const mockActivityLogsService = {
    logAction: jest.fn().mockResolvedValue({}),
  };

  const user: JwtPayloadUser = {
    id: 'user-gate-1',
    email: 'gate@gms.local',
    role: 'GATE',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GateService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ActivityLogsService, useValue: mockActivityLogsService },
      ],
    }).compile();

    gateService = module.get<GateService>(GateService);
    jest.clearAllMocks();
  });

  it('should normalize plate number and reject active vehicle check-in with 409 ConflictException', async () => {
    mockPrismaService.transaction.findFirst.mockResolvedValueOnce({
      id: 'tx-existing',
      plateNumber: 'B 1234 ABC',
      status: 'REGISTERED',
    });

    mockPrismaService.$transaction.mockImplementation((cb: any) =>
      cb(mockPrismaService),
    );

    await expect(
      gateService.checkIn(
        {
          plateNumber: 'b  1234  abc', // Messy casing/spacing
          driverName: 'Budi',
          driverPhone: '08123456789',
          vendorName: 'PT Logistics',
          vehicleType: 'TRUCK',
          processType: 'GBB',
          cargoType: 'BULK',
        } as any,
        user,
      ),
    ).rejects.toThrow(ConflictException);

    expect(mockPrismaService.transaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { plateNumber: 'B 1234 ABC' },
            { plateNumber: 'B1234ABC' },
          ]),
        }),
      }),
    );
  });

  it('should create gate check-in with normalized plate number when no active transaction exists', async () => {
    mockPrismaService.transaction.findFirst.mockResolvedValueOnce(null);
    mockPrismaService.transaction.create.mockResolvedValueOnce({
      id: 'tx-new',
      transactionNumber: 'GMS-20260811-0001',
      plateNumber: 'B 1234 ABC',
      status: 'REGISTERED',
    });

    mockPrismaService.$transaction.mockImplementation((cb: any) =>
      cb(mockPrismaService),
    );

    const result = await gateService.checkIn(
      {
        plateNumber: 'b-1234-abc',
        driverName: 'Budi',
        driverPhone: '08123456789',
        vendorName: 'PT Logistics',
        vehicleType: 'TRUCK',
        processType: 'GBB',
        cargoType: 'BULK',
      } as any,
      user,
    );

    expect(result.success).toBe(true);
    expect(mockPrismaService.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          plateNumber: 'B 1234 ABC',
        }),
      }),
    );
  });

  it('generates transaction numbers rolling over exactly at 00.00.00 WIB', async () => {
    mockPrismaService.transaction.count.mockResolvedValue(0);

    // 23:59:59 WIB (2026-09-29T16:59:59.000Z UTC)
    const numBeforeMidnight = await gateService.generateTransactionNumber(
      mockPrismaService,
      new Date('2026-09-29T16:59:59.000Z'),
    );
    expect(numBeforeMidnight).toBe('GMS-20260929-0001');

    // 00:00:00 WIB (2026-09-29T17:00:00.000Z UTC)
    const numAtMidnight = await gateService.generateTransactionNumber(
      mockPrismaService,
      new Date('2026-09-29T17:00:00.000Z'),
    );
    expect(numAtMidnight).toBe('GMS-20260930-0001');

    // 06:59:59 WIB (2026-09-29T23:59:59.000Z UTC)
    const numMorning = await gateService.generateTransactionNumber(
      mockPrismaService,
      new Date('2026-09-29T23:59:59.000Z'),
    );
    expect(numMorning).toBe('GMS-20260930-0001');
  });

  it('acquires plate advisory lock followed by daily arrival advisory lock before baseline query and counter upsert', async () => {
    const executionOrder: string[] = [];

    mockPrismaService.$executeRaw.mockImplementation(
      async (query: any, ...values: any[]) => {
        const valStr = values.map((v) => String(v)).join(' ');
        if (valStr.includes('gate_arrival_counter_')) {
          executionOrder.push('daily_lock');
        } else {
          executionOrder.push('plate_lock');
        }
        return 1;
      },
    );

    mockPrismaService.dailyArrivalCounter.findUnique.mockImplementation(
      async () => {
        executionOrder.push('counter_findUnique');
        return null;
      },
    );

    mockPrismaService.transaction.findMany.mockImplementation(async () => {
      executionOrder.push('transaction_findMany');
      return [];
    });

    mockPrismaService.dailyArrivalCounter.upsert.mockImplementation(
      async (args: any) => {
        executionOrder.push('counter_upsert');
        return {
          dateKey: args?.where?.dateKey || '20261016',
          lastSeq: args?.create?.lastSeq ?? 1,
        };
      },
    );

    mockPrismaService.transaction.findFirst.mockResolvedValue(null);
    mockPrismaService.transaction.create.mockImplementation(
      async (args: any) => {
        executionOrder.push('transaction_create');
        return { id: 'tx-lock-order', ...args.data };
      },
    );

    mockPrismaService.$transaction.mockImplementation((cb: any) =>
      cb(mockPrismaService),
    );

    const res = await gateService.checkIn(
      {
        plateNumber: 'B 9999 LOCK',
        driverName: 'Driver Lock',
        driverPhone: '08123456789',
        vendorName: 'PT Lock Logistics',
        vehicleType: 'TRUCK',
        processType: 'GBB',
        cargoType: 'BULK',
      } as any,
      user,
    );

    expect(res.success).toBe(true);
    expect(executionOrder).toEqual([
      'plate_lock',
      'daily_lock',
      'counter_findUnique',
      'transaction_findMany',
      'counter_upsert',
      'transaction_create',
    ]);
  });

  it('serializes multiple check-ins with different plate numbers under the same daily arrival advisory lock key', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T08:00:00.000Z'));
    try {
      const dailyLockKeysAcquired: string[] = [];

      mockPrismaService.$executeRaw.mockImplementation(
        async (query: any, ...values: any[]) => {
          const valStr = values.map((v) => String(v)).join(' ');
          if (valStr.includes('gate_arrival_counter_')) {
            dailyLockKeysAcquired.push(valStr);
          }
          return 1;
        },
      );

      mockPrismaService.transaction.findFirst.mockResolvedValue(null);
      mockPrismaService.dailyArrivalCounter.findUnique.mockResolvedValue(null);
      mockPrismaService.transaction.findMany.mockResolvedValue([]);
      mockPrismaService.dailyArrivalCounter.upsert.mockImplementation(
        (args: any) =>
          Promise.resolve({
            dateKey: args?.where?.dateKey || '20261015',
            lastSeq: args?.create?.lastSeq ?? 1,
          }),
      );
      mockPrismaService.transaction.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'tx-test', ...args.data }),
      );

      mockPrismaService.$transaction.mockImplementation((cb: any) =>
        cb(mockPrismaService),
      );

      // Check-in Truck 1 with plate B 1111 AAA
      const res1 = await gateService.checkIn(
        {
          plateNumber: 'B 1111 AAA',
          driverName: 'Driver 1',
          driverPhone: '08111111111',
          vendorName: 'Vendor 1',
          vehicleType: 'TRUCK',
          processType: 'GBB',
          cargoType: 'BULK',
        } as any,
        user,
      );

      // Check-in Truck 2 with completely different plate B 2222 BBB
      const res2 = await gateService.checkIn(
        {
          plateNumber: 'B 2222 BBB',
          driverName: 'Driver 2',
          driverPhone: '08222222222',
          vendorName: 'Vendor 2',
          vehicleType: 'TRUCK',
          processType: 'GBB',
          cargoType: 'BULK',
        } as any,
        user,
      );

      expect(res1.success).toBe(true);
      expect(res2.success).toBe(true);

      // Both check-ins must have requested a daily arrival counter lock
      expect(dailyLockKeysAcquired).toHaveLength(2);
      // Both requests must target the exact same date-scoped lock key
      expect(dailyLockKeysAcquired[0]).toBe('gate_arrival_counter_20261015');
      expect(dailyLockKeysAcquired[1]).toBe('gate_arrival_counter_20261015');
      expect(dailyLockKeysAcquired[0]).toEqual(dailyLockKeysAcquired[1]);
    } finally {
      jest.useRealTimers();
    }
  });
});
