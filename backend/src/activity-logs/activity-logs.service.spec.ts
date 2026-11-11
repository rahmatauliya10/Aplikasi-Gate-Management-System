import {
  ActivityLogsService,
  CreateActivityLogDto,
} from './activity-logs.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ActivityLogsService', () => {
  let service: ActivityLogsService;
  let mockPrismaService: any;

  beforeEach(() => {
    mockPrismaService = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'Operator Warehouse',
          role: 'WAREHOUSE_OPERATOR',
        }),
      },
      activityLog: {
        create: jest.fn().mockResolvedValue({
          id: 'log-1',
          action: 'GSP_PREUNLOAD_CHECKLIST_FAILED',
          status: 'FAILED',
          createdAt: new Date(),
        }),
      },
    };

    service = new ActivityLogsService(mockPrismaService as PrismaService);
  });

  describe('logAction (standard non-strict mode)', () => {
    it('persists log to database and enriches user information when database is available', async () => {
      const dto: CreateActivityLogDto = {
        userId: 'user-1',
        action: 'REGULAR_ACTION',
        module: 'WAREHOUSE',
        status: 'SUCCESS',
      };

      const result = await service.logAction(dto);

      expect(mockPrismaService.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          userName: 'Operator Warehouse',
          role: 'WAREHOUSE_OPERATOR',
          action: 'REGULAR_ACTION',
        }),
      });
      expect(result).toEqual(
        expect.objectContaining({
          id: 'log-1',
        }),
      );
    });

    it('falls back to buffer and does not throw when database write fails', async () => {
      mockPrismaService.activityLog.create.mockRejectedValueOnce(
        new Error('Database disk full or connection dropped'),
      );

      const dto: CreateActivityLogDto = {
        userId: 'user-1',
        action: 'REGULAR_ACTION',
        module: 'WAREHOUSE',
        status: 'SUCCESS',
      };

      // Should NOT throw
      await expect(service.logAction(dto)).resolves.not.toThrow();
    });
  });

  describe('logActionStrict / requireDb: true (strict durable mode)', () => {
    it('successfully persists log and returns record when database write succeeds', async () => {
      const dto: CreateActivityLogDto = {
        userId: 'user-1',
        action: 'GSP_PREUNLOAD_CHECKLIST_FAILED',
        module: 'WAREHOUSE',
        referenceId: 'tx-123',
        description: JSON.stringify({ reason: 'Seal broken' }),
        status: 'FAILED',
      };

      const result = await service.logActionStrict(dto);

      expect(mockPrismaService.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'GSP_PREUNLOAD_CHECKLIST_FAILED',
          referenceId: 'tx-123',
          status: 'FAILED',
        }),
      });
      expect(result).toEqual(
        expect.objectContaining({
          id: 'log-1',
          action: 'GSP_PREUNLOAD_CHECKLIST_FAILED',
        }),
      );
    });

    it('rethrows database error immediately when database write fails', async () => {
      const dbError = new Error('Database connection failed: ECONNREFUSED');
      mockPrismaService.activityLog.create.mockRejectedValueOnce(dbError);

      const dto: CreateActivityLogDto = {
        userId: 'user-1',
        action: 'GSP_PREUNLOAD_CHECKLIST_FAILED',
        module: 'WAREHOUSE',
        referenceId: 'tx-123',
        status: 'FAILED',
      };

      // Must throw, ensuring callers detect database persistence failure
      await expect(service.logActionStrict(dto)).rejects.toThrow(
        'Database connection failed: ECONNREFUSED',
      );
    });

    it('rethrows when called via logAction with options { requireDb: true }', async () => {
      const dbError = new Error('Prisma write constraint violation');
      mockPrismaService.activityLog.create.mockRejectedValueOnce(dbError);

      const dto: CreateActivityLogDto = {
        userId: 'user-1',
        action: 'GSP_PREUNLOAD_CHECKLIST_FAILED',
        module: 'WAREHOUSE',
        status: 'FAILED',
      };

      await expect(
        service.logAction(dto, undefined, { requireDb: true }),
      ).rejects.toThrow('Prisma write constraint violation');
    });
  });
});
