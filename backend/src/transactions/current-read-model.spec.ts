import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { AuthorizationScopeService } from '../auth/authorization-scope.service';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';

/**
 * P0-02 Regression: Verifies that all TransactionsService query methods
 * pass `{ where: { isCurrent: true } }` in their relation includes,
 * ensuring only current (non-superseded) records are returned.
 */
describe('Current Read Model (P0-02)', () => {
  let service: TransactionsService;
  let findManySpy: jest.Mock;
  let findFirstSpy: jest.Mock;
  let countSpy: jest.Mock;

  const mockUser = {
    id: 'user-1',
    role: 'ADMIN',
    email: 'admin@gms.local',
    name: 'Admin',
  };

  beforeEach(async () => {
    findManySpy = jest.fn().mockResolvedValue([]);
    findFirstSpy = jest.fn().mockResolvedValue(null);
    countSpy = jest.fn().mockResolvedValue(0);

    const mockPrisma = {
      transaction: {
        findMany: findManySpy,
        findFirst: findFirstSpy,
        count: countSpy,
      },
    };

    const mockActivityLogs = {
      logAction: jest.fn().mockResolvedValue({}),
    };

    const mockAuthScope = {
      getTransactionScope: jest.fn().mockReturnValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ActivityLogsService, useValue: mockActivityLogs },
        { provide: AuthorizationScopeService, useValue: mockAuthScope },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
  });

  const expectIsCurrentFilter = (call: any, relationName: string) => {
    const includeArg = call.include || call;
    const relation = includeArg[relationName];
    expect(relation).toBeDefined();
    if (typeof relation === 'object' && relation !== null) {
      expect(relation.where).toBeDefined();
      expect(relation.where.isCurrent).toBe(true);
    }
  };

  it('findAll should include isCurrent:true on all relation queries', async () => {
    await service.findAll(
      { page: 1, limit: 10 } as any,
      mockUser as unknown as JwtPayloadUser,
    );

    const findManyCall = findManySpy.mock.calls[0][0];
    expect(findManyCall.include).toBeDefined();
    expectIsCurrentFilter(findManyCall.include, 'weighbridgeRecords');
    expectIsCurrentFilter(findManyCall.include, 'warehouseProcesses');
    expectIsCurrentFilter(findManyCall.include, 'qcVehicleChecks');
    expectIsCurrentFilter(findManyCall.include, 'incomingMaterialChecks');
  });

  it('findActive should include isCurrent:true on all relation queries', async () => {
    await service.findActive(mockUser as unknown as JwtPayloadUser);

    const findManyCall = findManySpy.mock.calls[0][0];
    expect(findManyCall.include).toBeDefined();
    expectIsCurrentFilter(findManyCall.include, 'weighbridgeRecords');
    expectIsCurrentFilter(findManyCall.include, 'warehouseProcesses');
    expectIsCurrentFilter(findManyCall.include, 'qcVehicleChecks');
    expectIsCurrentFilter(findManyCall.include, 'incomingMaterialChecks');
  });

  it('findOne should include isCurrent:true on all relation queries', async () => {
    findFirstSpy.mockResolvedValueOnce({
      id: 'tx-1',
      transactionNumber: 'GMS-20260808-0001',
      status: 'COMPLETED',
    });

    await service.findOne('tx-1', mockUser as unknown as JwtPayloadUser);

    const findFirstCall = findFirstSpy.mock.calls[0][0];
    expect(findFirstCall.include).toBeDefined();
    expectIsCurrentFilter(findFirstCall.include, 'weighbridgeRecords');
    expectIsCurrentFilter(findFirstCall.include, 'warehouseProcesses');
    expectIsCurrentFilter(findFirstCall.include, 'qcVehicleChecks');
    expectIsCurrentFilter(findFirstCall.include, 'incomingMaterialChecks');
  });
});
