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
      create: jest.fn(),
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
});
