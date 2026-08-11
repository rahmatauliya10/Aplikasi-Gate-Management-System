import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';

describe('UsersService (PR-05 Admin Lifecycle & Session Invariants)', () => {
  let service: UsersService;

  const mockPrismaService = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    userWarehouseAccess: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
  };

  const mockActivityLogsService = {
    logAction: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ActivityLogsService, useValue: mockActivityLogsService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  it('should increment tokenVersion and set refreshTokenHash to null on status update (deactivation)', async () => {
    mockPrismaService.user.findFirst.mockResolvedValueOnce({
      id: 'usr-regular',
      username: 'operator',
      email: 'op@gms.local',
      role: 'WEIGHBRIDGE',
      isActive: true,
    });

    mockPrismaService.user.update.mockResolvedValueOnce({
      id: 'usr-regular',
      isActive: false,
    });

    const result = await service.updateStatus('usr-regular', {
      isActive: false,
    });

    expect(mockPrismaService.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'usr-regular' },
        data: expect.objectContaining({
          isActive: false,
          tokenVersion: { increment: 1 },
          refreshTokenHash: null,
        }),
      }),
    );
    expect(result.success).toBe(true);
  });

  it('should increment tokenVersion and set refreshTokenHash to null on soft delete', async () => {
    mockPrismaService.user.findFirst.mockResolvedValueOnce({
      id: 'usr-regular',
      username: 'operator',
      email: 'op@gms.local',
      role: 'WEIGHBRIDGE',
      isActive: true,
    });

    mockPrismaService.user.update.mockResolvedValueOnce({
      id: 'usr-regular',
      isDeleted: true,
    });

    const result = await service.remove('usr-regular');

    expect(mockPrismaService.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'usr-regular' },
        data: expect.objectContaining({
          isDeleted: true,
          isActive: false,
          tokenVersion: { increment: 1 },
          refreshTokenHash: null,
        }),
      }),
    );
    expect(result.success).toBe(true);
  });

  it('should prevent deactivating primary administrator account', async () => {
    mockPrismaService.user.findFirst.mockResolvedValueOnce({
      id: 'admin-id',
      username: 'admin',
      email: 'admin@gms.local',
      role: 'ADMIN',
      isActive: true,
    });

    await expect(
      service.updateStatus('admin-id', { isActive: false }),
    ).rejects.toThrow(BadRequestException);
  });
});
