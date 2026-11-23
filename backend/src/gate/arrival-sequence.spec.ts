import { InternalServerErrorException } from '@nestjs/common';
import { GateService } from './gate.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';

describe('Daily Arrival Sequence Number Unit Tests (COR-01 Resilience)', () => {
  let service: GateService;
  let mockPrisma: any;
  let mockActivityLogs: any;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T08:00:00.000Z'));
    mockPrisma = {
      transaction: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      dailyArrivalCounter: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation((args: any) =>
          Promise.resolve({
            dateKey: args?.where?.dateKey || '20261015',
            lastSeq: args?.create?.lastSeq ?? args?.update?.lastSeq ?? 1,
          }),
        ),
      },
      $transaction: jest.fn(),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    mockActivityLogs = {
      logAction: jest.fn().mockResolvedValue({}),
    };
    service = new GateService(mockPrisma, mockActivityLogs);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const baseUser: JwtPayloadUser = {
    id: 'sec-1',
    email: 'sec@gms.local',
    role: 'SECURITY',
  } as any;

  it('1. should atomically allocate dailySequence = 1 for the first truck of the day', async () => {
    const mockTxClient = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      dailyArrivalCounter: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({
          dateKey: '20261015',
          lastSeq: 1,
        }),
      },
      transaction: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
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

    const result = await service.checkIn(
      {
        plateNumber: 'B 1234 ABC',
        driverName: 'Pak Budi',
        driverPhone: '08123456789',
        vendorName: 'PT Logistik Prima',
        vehicleType: 'TRUCK_CDD',
        processType: 'GBB',
      },
      baseUser,
    );

    expect(mockTxClient.$executeRaw).toHaveBeenCalledWith(
      expect.anything(),
      'gate_arrival_counter_20261015',
    );
    expect(mockTxClient.dailyArrivalCounter.findUnique).toHaveBeenCalledWith({
      where: { dateKey: '20261015' },
    });
    expect(mockTxClient.transaction.findMany).toHaveBeenCalledWith({
      where: { transactionNumber: { startsWith: 'GMS-20261015-' } },
      select: { transactionNumber: true, dailySequence: true },
    });
    expect(mockTxClient.dailyArrivalCounter.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dateKey: '20261015' },
        create: expect.objectContaining({ lastSeq: 1 }),
        update: expect.objectContaining({ lastSeq: 1 }),
      }),
    );
    expect(result.data.dailySequence).toBe(1);
    expect(result.data.transactionNumber).toBe('GMS-20261015-0001');
  });

  it('2. should increment dailySequence across GBB, GBJ, and GSP globally', async () => {
    let currentSeq = 0;
    const mockTxClient = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      dailyArrivalCounter: {
        findUnique: jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve(
              currentSeq > 0
                ? { dateKey: '20261015', lastSeq: currentSeq }
                : null,
            ),
          ),
        upsert: jest.fn().mockImplementation((args: any) => {
          currentSeq = args?.update?.lastSeq ?? args?.create?.lastSeq ?? 1;
          return Promise.resolve({
            dateKey: '20261015',
            lastSeq: currentSeq,
          });
        }),
      },
      transaction: {
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
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
      baseUser,
    );
    expect(resultGbj.data.dailySequence).toBe(1);
    expect(resultGbj.data.transactionNumber).toBe('GMS-20261015-0001');

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
      baseUser,
    );
    expect(result3.data.dailySequence).toBe(2);
    expect(result3.data.transactionNumber).toBe('GMS-20261015-0002');
  });

  it('3. should gracefully fail-closed if atomic counter fails', async () => {
    const mockTxClient = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      dailyArrivalCounter: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockRejectedValue(new Error('Counter lock timeout')),
      },
      transaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockPrisma.$transaction.mockImplementation(async (cb: any) =>
      cb(mockTxClient),
    );

    await expect(
      service.checkIn(
        {
          plateNumber: 'N 8888 BB',
          driverName: 'Pak Dani',
          driverPhone: '08123333444',
          vendorName: 'PT Maju Bersama',
          vehicleType: 'TRUCK_TRAILER',
          processType: 'GBB',
        },
        baseUser,
      ),
    ).rejects.toThrow(InternalServerErrorException);
  });

  describe('COR-01 Upgrade Resiliency & High-Water Mark Allocation', () => {
    it('COR01-01 (Fresh DB / Fresh Date): allocates dailySequence = 1 when no counter and no transactions exist', async () => {
      const mockTxClient = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        dailyArrivalCounter: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockImplementation((args: any) =>
            Promise.resolve({
              dateKey: args?.where?.dateKey,
              lastSeq: args?.create?.lastSeq,
            }),
          ),
        },
        transaction: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
          create: jest
            .fn()
            .mockImplementation(({ data }) =>
              Promise.resolve({ id: 'tx-cor01-1', ...data }),
            ),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await service.checkIn(
        {
          plateNumber: 'B 1001 COR',
          driverName: 'Driver 1',
          driverPhone: '0811111111',
          vendorName: 'Vendor A',
          vehicleType: 'TRUCK',
          processType: 'GBB',
        },
        baseUser,
      );

      expect(mockTxClient.$executeRaw).toHaveBeenCalledWith(
        expect.anything(),
        'gate_arrival_counter_20261015',
      );
      expect(mockTxClient.dailyArrivalCounter.findUnique).toHaveBeenCalledWith({
        where: { dateKey: '20261015' },
      });
      expect(mockTxClient.transaction.findMany).toHaveBeenCalledWith({
        where: { transactionNumber: { startsWith: 'GMS-20261015-' } },
        select: { transactionNumber: true, dailySequence: true },
      });
      expect(res.data.dailySequence).toBe(1);
      expect(res.data.transactionNumber).toBe('GMS-20261015-0001');
      expect(mockTxClient.dailyArrivalCounter.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { dateKey: '20261015' },
          create: expect.objectContaining({ lastSeq: 1 }),
          update: expect.objectContaining({ lastSeq: 1 }),
        }),
      );
    });

    it('COR01-02 (Existing Transactions, Counter Missing): initializes counter past highest existing transaction sequence', async () => {
      const mockTxClient = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        dailyArrivalCounter: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockImplementation((args: any) =>
            Promise.resolve({
              dateKey: args?.where?.dateKey,
              lastSeq: args?.create?.lastSeq,
            }),
          ),
        },
        transaction: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([
            { transactionNumber: 'GMS-20261015-0001', dailySequence: 1 },
            { transactionNumber: 'GMS-20261015-0002', dailySequence: 2 },
          ]),
          create: jest
            .fn()
            .mockImplementation(({ data }) =>
              Promise.resolve({ id: 'tx-cor01-2', ...data }),
            ),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await service.checkIn(
        {
          plateNumber: 'B 1002 COR',
          driverName: 'Driver 2',
          driverPhone: '0822222222',
          vendorName: 'Vendor B',
          vehicleType: 'TRUCK',
          processType: 'GBB',
        },
        baseUser,
      );

      expect(mockTxClient.transaction.findMany).toHaveBeenCalledWith({
        where: { transactionNumber: { startsWith: 'GMS-20261015-' } },
        select: { transactionNumber: true, dailySequence: true },
      });
      expect(res.data.dailySequence).toBe(3);
      expect(res.data.transactionNumber).toBe('GMS-20261015-0003');
      expect(mockTxClient.dailyArrivalCounter.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { dateKey: '20261015' },
          create: expect.objectContaining({ lastSeq: 3 }),
          update: expect.objectContaining({ lastSeq: 3 }),
        }),
      );
    });

    it('COR01-03 (Gaps in Existing Transactions): allocates past highest sequence without using row count', async () => {
      const mockTxClient = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        dailyArrivalCounter: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockImplementation((args: any) =>
            Promise.resolve({
              dateKey: args?.where?.dateKey,
              lastSeq: args?.create?.lastSeq,
            }),
          ),
        },
        transaction: {
          findFirst: jest.fn().mockResolvedValue(null),
          // 2 records total (count = 2), but max sequence is 5!
          findMany: jest.fn().mockResolvedValue([
            { transactionNumber: 'GMS-20261015-0001', dailySequence: 1 },
            { transactionNumber: 'GMS-20261015-0005', dailySequence: 5 },
          ]),
          create: jest
            .fn()
            .mockImplementation(({ data }) =>
              Promise.resolve({ id: 'tx-cor01-3', ...data }),
            ),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await service.checkIn(
        {
          plateNumber: 'B 1003 COR',
          driverName: 'Driver 3',
          driverPhone: '0833333333',
          vendorName: 'Vendor C',
          vehicleType: 'TRUCK',
          processType: 'GBB',
        },
        baseUser,
      );

      // Must be 6 (max + 1), NOT 3 (count + 1)!
      expect(res.data.dailySequence).toBe(6);
      expect(res.data.transactionNumber).toBe('GMS-20261015-0006');
    });

    it('COR01-04 (Lagging Counter): updates counter to exceed highest transaction when counter is lagging', async () => {
      const mockTxClient = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        dailyArrivalCounter: {
          // Counter lags at 2
          findUnique: jest.fn().mockResolvedValue({
            dateKey: '20261015',
            lastSeq: 2,
          }),
          upsert: jest.fn().mockImplementation((args: any) =>
            Promise.resolve({
              dateKey: args?.where?.dateKey,
              lastSeq: args?.update?.lastSeq,
            }),
          ),
        },
        transaction: {
          findFirst: jest.fn().mockResolvedValue(null),
          // Transactions already reached 5
          findMany: jest.fn().mockResolvedValue([
            { transactionNumber: 'GMS-20261015-0001', dailySequence: 1 },
            { transactionNumber: 'GMS-20261015-0005', dailySequence: 5 },
          ]),
          create: jest
            .fn()
            .mockImplementation(({ data }) =>
              Promise.resolve({ id: 'tx-cor01-4', ...data }),
            ),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await service.checkIn(
        {
          plateNumber: 'B 1004 COR',
          driverName: 'Driver 4',
          driverPhone: '0844444444',
          vendorName: 'Vendor D',
          vehicleType: 'TRUCK',
          processType: 'GBB',
        },
        baseUser,
      );

      expect(res.data.dailySequence).toBe(6);
      expect(res.data.transactionNumber).toBe('GMS-20261015-0006');
      expect(mockTxClient.dailyArrivalCounter.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { dateKey: '20261015' },
          update: expect.objectContaining({ lastSeq: 6 }),
        }),
      );
    });

    it('COR01-05 (5-Digit Numerical Ordering): correctly identifies 10000 as higher than 9999 and allocates 10001', async () => {
      const mockTxClient = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        dailyArrivalCounter: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockImplementation((args: any) =>
            Promise.resolve({
              dateKey: args?.where?.dateKey,
              lastSeq: args?.create?.lastSeq,
            }),
          ),
        },
        transaction: {
          findFirst: jest.fn().mockResolvedValue(null),
          // 9999 and 10000 with dailySequence: null to isolate and prove numeric suffix parsing
          findMany: jest.fn().mockResolvedValue([
            { transactionNumber: 'GMS-20261015-9999', dailySequence: null },
            { transactionNumber: 'GMS-20261015-10000', dailySequence: null },
          ]),
          create: jest
            .fn()
            .mockImplementation(({ data }) =>
              Promise.resolve({ id: 'tx-cor01-5', ...data }),
            ),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await service.checkIn(
        {
          plateNumber: 'B 1005 COR',
          driverName: 'Driver 5',
          driverPhone: '0855555555',
          vendorName: 'Vendor E',
          vehicleType: 'TRUCK',
          processType: 'GBB',
        },
        baseUser,
      );

      // Must be 10001 (numeric ordering isolated from dailySequence)
      expect(res.data.dailySequence).toBe(10001);
      expect(res.data.transactionNumber).toBe('GMS-20261015-10001');
    });

    it('COR01-06 (Reconciliation dailySequence vs Suffix): resolves discrepancies by taking the maximum occupied value', async () => {
      // Subcase A: dailySequence = 5, suffix = 0007 -> selects 7 -> next is 8
      const mockTxClientA = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        dailyArrivalCounter: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockImplementation((args: any) =>
            Promise.resolve({
              dateKey: args?.where?.dateKey,
              lastSeq: args?.create?.lastSeq,
            }),
          ),
        },
        transaction: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest
            .fn()
            .mockResolvedValue([
              { transactionNumber: 'GMS-20261015-0007', dailySequence: 5 },
            ]),
          create: jest
            .fn()
            .mockImplementation(({ data }) =>
              Promise.resolve({ id: 'tx-cor01-6a', ...data }),
            ),
        },
      };

      mockPrisma.$transaction.mockImplementationOnce(async (cb: any) =>
        cb(mockTxClientA),
      );

      const resA = await service.checkIn(
        {
          plateNumber: 'B 1006 CORA',
          driverName: 'Driver 6A',
          driverPhone: '0866666661',
          vendorName: 'Vendor FA',
          vehicleType: 'TRUCK',
          processType: 'GBB',
        },
        baseUser,
      );
      expect(resA.data.dailySequence).toBe(8);
      expect(resA.data.transactionNumber).toBe('GMS-20261015-0008');

      // Subcase B: dailySequence = 9, suffix = 0004 -> selects 9 -> next is 10
      const mockTxClientB = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        dailyArrivalCounter: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockImplementation((args: any) =>
            Promise.resolve({
              dateKey: args?.where?.dateKey,
              lastSeq: args?.create?.lastSeq,
            }),
          ),
        },
        transaction: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest
            .fn()
            .mockResolvedValue([
              { transactionNumber: 'GMS-20261015-0004', dailySequence: 9 },
            ]),
          create: jest
            .fn()
            .mockImplementation(({ data }) =>
              Promise.resolve({ id: 'tx-cor01-6b', ...data }),
            ),
        },
      };

      mockPrisma.$transaction.mockImplementationOnce(async (cb: any) =>
        cb(mockTxClientB),
      );

      const resB = await service.checkIn(
        {
          plateNumber: 'B 1006 CORB',
          driverName: 'Driver 6B',
          driverPhone: '0866666662',
          vendorName: 'Vendor FB',
          vehicleType: 'TRUCK',
          processType: 'GBB',
        },
        baseUser,
      );
      expect(resB.data.dailySequence).toBe(10);
      expect(resB.data.transactionNumber).toBe('GMS-20261015-0010');
    });

    it('COR01-07 (Non-Canonical Suffix Handling): uses dailySequence when suffix is non-canonical, and ignores when both are invalid', async () => {
      // Subcase A: Non-canonical suffix with valid dailySequence = 4 -> uses 4 -> next is 5
      const mockTxClientA = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        dailyArrivalCounter: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockImplementation((args: any) =>
            Promise.resolve({
              dateKey: args?.where?.dateKey,
              lastSeq: args?.create?.lastSeq,
            }),
          ),
        },
        transaction: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest
            .fn()
            .mockResolvedValue([
              { transactionNumber: 'GMS-20261015-SPECIAL', dailySequence: 4 },
            ]),
          create: jest
            .fn()
            .mockImplementation(({ data }) =>
              Promise.resolve({ id: 'tx-cor01-7a', ...data }),
            ),
        },
      };

      mockPrisma.$transaction.mockImplementationOnce(async (cb: any) =>
        cb(mockTxClientA),
      );

      const resA = await service.checkIn(
        {
          plateNumber: 'B 1007 CORA',
          driverName: 'Driver 7A',
          driverPhone: '0877777771',
          vendorName: 'Vendor GA',
          vehicleType: 'TRUCK',
          processType: 'GBB',
        },
        baseUser,
      );
      expect(resA.data.dailySequence).toBe(5);
      expect(resA.data.transactionNumber).toBe('GMS-20261015-0005');

      // Subcase B: Non-canonical suffix with null dailySequence -> ignored -> defaults to sequence 1
      const mockTxClientB = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        dailyArrivalCounter: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockImplementation((args: any) =>
            Promise.resolve({
              dateKey: args?.where?.dateKey,
              lastSeq: args?.create?.lastSeq,
            }),
          ),
        },
        transaction: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([
            {
              transactionNumber: 'GMS-20261015-SPECIAL',
              dailySequence: null,
            },
          ]),
          create: jest
            .fn()
            .mockImplementation(({ data }) =>
              Promise.resolve({ id: 'tx-cor01-7b', ...data }),
            ),
        },
      };

      mockPrisma.$transaction.mockImplementationOnce(async (cb: any) =>
        cb(mockTxClientB),
      );

      const resB = await service.checkIn(
        {
          plateNumber: 'B 1007 CORB',
          driverName: 'Driver 7B',
          driverPhone: '0877777772',
          vendorName: 'Vendor GB',
          vehicleType: 'TRUCK',
          processType: 'GBB',
        },
        baseUser,
      );
      expect(resB.data.dailySequence).toBe(1);
      expect(resB.data.transactionNumber).toBe('GMS-20261015-0001');
    });

    it('COR01-08 (Legacy Upgrade - dailySequence is NULL): parses canonical suffix to determine sequence when dailySequence is NULL', async () => {
      const mockTxClient = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        dailyArrivalCounter: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockImplementation((args: any) =>
            Promise.resolve({
              dateKey: args?.where?.dateKey,
              lastSeq: args?.create?.lastSeq,
            }),
          ),
        },
        transaction: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest
            .fn()
            .mockResolvedValue([
              { transactionNumber: 'GMS-20261015-0004', dailySequence: null },
            ]),
          create: jest
            .fn()
            .mockImplementation(({ data }) =>
              Promise.resolve({ id: 'tx-cor01-8', ...data }),
            ),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await service.checkIn(
        {
          plateNumber: 'B 1008 COR',
          driverName: 'Driver 8',
          driverPhone: '0888888888',
          vendorName: 'Vendor H',
          vehicleType: 'TRUCK',
          processType: 'GBB',
        },
        baseUser,
      );

      expect(res.data.dailySequence).toBe(5);
      expect(res.data.transactionNumber).toBe('GMS-20261015-0005');
    });

    it('COR01-09 (Anti-Mundur - Counter Ahead of Transactions): preserves counter high-water mark when counter exceeds highest transaction', async () => {
      const mockTxClient = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        dailyArrivalCounter: {
          findUnique: jest.fn().mockResolvedValue({
            dateKey: '20261015',
            lastSeq: 10,
          }),
          upsert: jest.fn().mockImplementation((args: any) =>
            Promise.resolve({
              dateKey: args?.where?.dateKey,
              lastSeq: args?.update?.lastSeq,
            }),
          ),
        },
        transaction: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest
            .fn()
            .mockResolvedValue([
              { transactionNumber: 'GMS-20261015-0005', dailySequence: 5 },
            ]),
          create: jest
            .fn()
            .mockImplementation(({ data }) =>
              Promise.resolve({ id: 'tx-cor01-9', ...data }),
            ),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );

      const res = await service.checkIn(
        {
          plateNumber: 'B 1009 COR',
          driverName: 'Driver 9',
          driverPhone: '0899999999',
          vendorName: 'Vendor I',
          vehicleType: 'TRUCK',
          processType: 'GBB',
        },
        baseUser,
      );

      // Must increment from 10 to 11 (does NOT drop to 6)
      expect(res.data.dailySequence).toBe(11);
      expect(res.data.transactionNumber).toBe('GMS-20261015-0011');
    });

    it('COR01-10 (Integer Boundary & Overflow Protection): tests last valid boundary and rejects allocation exceeding MAX_INT32 fail-closed', async () => {
      const MAX_INT32 = 2147483647;

      // Subcase A: Last valid boundary (baseline = 2147483646 -> next = 2147483647)
      const mockTxClientA = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        dailyArrivalCounter: {
          findUnique: jest.fn().mockResolvedValue({
            dateKey: '20261015',
            lastSeq: MAX_INT32 - 1,
          }),
          upsert: jest.fn().mockImplementation((args: any) =>
            Promise.resolve({
              dateKey: args?.where?.dateKey,
              lastSeq: args?.update?.lastSeq,
            }),
          ),
        },
        transaction: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
          create: jest
            .fn()
            .mockImplementation(({ data }) =>
              Promise.resolve({ id: 'tx-cor01-10a', ...data }),
            ),
        },
      };

      mockPrisma.$transaction.mockImplementationOnce(async (cb: any) =>
        cb(mockTxClientA),
      );

      const resA = await service.checkIn(
        {
          plateNumber: 'B 1010 CORA',
          driverName: 'Driver 10A',
          driverPhone: '0810101011',
          vendorName: 'Vendor JA',
          vehicleType: 'TRUCK',
          processType: 'GBB',
        },
        baseUser,
      );
      expect(resA.data.dailySequence).toBe(MAX_INT32);
      expect(resA.data.transactionNumber).toBe(`GMS-20261015-${MAX_INT32}`);

      // Subcase B: Baseline already at MAX_INT32 -> fails closed
      const mockTxClientB = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        dailyArrivalCounter: {
          findUnique: jest.fn().mockResolvedValue({
            dateKey: '20261015',
            lastSeq: MAX_INT32,
          }),
          upsert: jest.fn(),
        },
        transaction: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn(),
        },
      };

      mockPrisma.$transaction.mockImplementationOnce(async (cb: any) =>
        cb(mockTxClientB),
      );

      await expect(
        service.checkIn(
          {
            plateNumber: 'B 1010 CORB',
            driverName: 'Driver 10B',
            driverPhone: '0810101012',
            vendorName: 'Vendor JB',
            vehicleType: 'TRUCK',
            processType: 'GBB',
          },
          baseUser,
        ),
      ).rejects.toThrow(InternalServerErrorException);

      // Subcase C: Canonical suffix with extreme overflow digits -> fails closed
      const mockTxClientC = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        dailyArrivalCounter: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn(),
        },
        transaction: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([
            {
              transactionNumber: 'GMS-20261015-9999999999999999999999999999',
              dailySequence: null,
            },
          ]),
          create: jest.fn(),
        },
      };

      mockPrisma.$transaction.mockImplementationOnce(async (cb: any) =>
        cb(mockTxClientC),
      );

      await expect(
        service.checkIn(
          {
            plateNumber: 'B 1010 CORC',
            driverName: 'Driver 10C',
            driverPhone: '0810101013',
            vendorName: 'Vendor JC',
            vehicleType: 'TRUCK',
            processType: 'GBB',
          },
          baseUser,
        ),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('COR01-11 (Daily Advisory Lock Fail-Closed): aborts process before baseline read or counter allocation when daily advisory lock fails', async () => {
      let plateLockCalled = false;
      let dailyLockCalled = false;
      let dailyLockKeyPassed = '';

      const mockTxClient = {
        $executeRaw: jest
          .fn()
          .mockImplementation(async (query: any, ...values: any[]) => {
            const valStr = values.map((v) => String(v)).join(' ');
            if (valStr.includes('gate_arrival_counter_')) {
              dailyLockCalled = true;
              dailyLockKeyPassed = valStr;
              throw new Error(
                'PostgreSQL advisory lock failure on daily counter',
              );
            }
            plateLockCalled = true;
            return 1;
          }),
        dailyArrivalCounter: {
          findUnique: jest.fn(),
          upsert: jest.fn(),
        },
        transaction: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
          create: jest.fn(),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );

      await expect(
        service.checkIn(
          {
            plateNumber: 'B 1011 COR',
            driverName: 'Driver 11',
            driverPhone: '0811111112',
            vendorName: 'Vendor K',
            vehicleType: 'TRUCK',
            processType: 'GBB',
          },
          baseUser,
        ),
      ).rejects.toThrow(InternalServerErrorException);

      // Verifies that plate lock succeeded but daily lock failed
      expect(plateLockCalled).toBe(true);
      expect(dailyLockCalled).toBe(true);
      expect(dailyLockKeyPassed).toContain('gate_arrival_counter_20261015');

      // Asserts that no baseline query or counter modification was reached
      expect(
        mockTxClient.dailyArrivalCounter.findUnique,
      ).not.toHaveBeenCalled();
      expect(mockTxClient.transaction.findMany).not.toHaveBeenCalled();
      expect(mockTxClient.dailyArrivalCounter.upsert).not.toHaveBeenCalled();
      expect(mockTxClient.transaction.create).not.toHaveBeenCalled();
    });

    it('COR01-12 (Failure Propagation & Aborting Subsequent Operations): propagates counter persistence failure and aborts transaction creation', async () => {
      const mockTxClient = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        dailyArrivalCounter: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest
            .fn()
            .mockRejectedValue(new Error('Database write constraint error')),
        },
        transaction: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn(),
        },
      };

      mockPrisma.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTxClient),
      );

      await expect(
        service.checkIn(
          {
            plateNumber: 'B 1012 COR',
            driverName: 'Driver 12',
            driverPhone: '0812121212',
            vendorName: 'Vendor L',
            vehicleType: 'TRUCK',
            processType: 'GBB',
          },
          baseUser,
        ),
      ).rejects.toThrow(InternalServerErrorException);

      // Verifies failure propagation: transaction.create is never called
      expect(mockTxClient.transaction.create).not.toHaveBeenCalled();
    });
  });
});
