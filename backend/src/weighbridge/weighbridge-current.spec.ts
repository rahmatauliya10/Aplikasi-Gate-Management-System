import { Test, TestingModule } from '@nestjs/testing';
import { WeighbridgeService } from './weighbridge.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';

import { JwtPayloadUser } from '../common/decorators/current-user.decorator';

/**
 * P1-07 Regression: Verifies that WeighbridgeService getRecordDetail
 * and getQueue use isCurrent:true filter so historical records
 * don't leak into operational views after REOPEN.
 */
describe('Weighbridge isCurrent Filter (P1-07)', () => {
  let service: WeighbridgeService;
  let findUniqueSpy: jest.Mock;
  let findManySpy: jest.Mock;
  let countSpy: jest.Mock;

  const mockUser = {
    id: 'user-1',
    role: 'ADMIN',
    email: 'admin@gms.local',
    name: 'Admin',
  };

  beforeEach(async () => {
    findUniqueSpy = jest.fn();
    findManySpy = jest.fn().mockResolvedValue([]);
    countSpy = jest.fn().mockResolvedValue(0);

    const mockPrisma = {
      transaction: {
        findUnique: findUniqueSpy,
        findMany: findManySpy,
        count: countSpy,
      },
    };

    const mockActivityLogs = {
      logAction: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeighbridgeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ActivityLogsService, useValue: mockActivityLogs },
      ],
    }).compile();

    service = module.get<WeighbridgeService>(WeighbridgeService);
  });

  it('getRecordDetail should filter weighbridgeRecords by isCurrent:true', async () => {
    findUniqueSpy.mockResolvedValueOnce({
      id: 'tx-1',
      transactionNumber: 'GMS-20260808-0001',
      status: 'WEIGH_OUT_DONE',
      weighbridgeRecords: [
        { id: 'wb-2', type: 'IN', isCurrent: true, weight: 15000 },
        { id: 'wb-3', type: 'OUT', isCurrent: true, weight: 5000 },
      ],
      weighInBy: { id: 'u1', name: 'Op1', role: 'SECURITY' },
      weighOutBy: { id: 'u2', name: 'Op2', role: 'SECURITY' },
    });

    const result = await service.getRecordDetail(
      'tx-1',
      mockUser as unknown as JwtPayloadUser,
    );

    // Verify the query included isCurrent filter
    const queryArg = findUniqueSpy.mock.calls[0][0];
    expect(queryArg.include.weighbridgeRecords.where).toBeDefined();
    expect(queryArg.include.weighbridgeRecords.where.isCurrent).toBe(true);

    expect(result.success).toBe(true);
  });

  it('getQueue should filter weighbridgeRecords by isCurrent:true', async () => {
    await service.getQueue(
      { page: 1, limit: 10 },
      mockUser as unknown as JwtPayloadUser,
    );

    const findManyCall = findManySpy.mock.calls[0][0];
    expect(findManyCall.include.weighbridgeRecords.where).toBeDefined();
    expect(findManyCall.include.weighbridgeRecords.where.isCurrent).toBe(true);
  });

  it('getRecordDetail .find() should return current IN and OUT records', async () => {
    // Simulate post-REOPEN scenario: only current records are returned
    findUniqueSpy.mockResolvedValueOnce({
      id: 'tx-1',
      transactionNumber: 'GMS-20260808-0001',
      status: 'WEIGH_OUT_DONE',
      grossWeight: 15000,
      tareWeight: 5000,
      netWeight: 10000,
      weighInAt: new Date(),
      weighOutAt: new Date(),
      remarks: null,
      weighbridgeRecords: [
        {
          id: 'wb-in-2',
          type: 'IN',
          isCurrent: true,
          weight: 15000,
          ticketNumber: 'T002',
          remarks: null,
        },
        {
          id: 'wb-out-2',
          type: 'OUT',
          isCurrent: true,
          weight: 5000,
          ticketNumber: 'T003',
          remarks: null,
        },
      ],
      weighInBy: { id: 'u1', name: 'Op1', role: 'SECURITY' },
      weighOutBy: { id: 'u2', name: 'Op2', role: 'SECURITY' },
    });

    const result = await service.getRecordDetail(
      'tx-1',
      mockUser as unknown as JwtPayloadUser,
    );

    // The result should use the current revision records
    expect(result.data.weighInTicketNumber).toBe('T002');
    expect(result.data.weighOutTicketNumber).toBe('T003');
  });
});
