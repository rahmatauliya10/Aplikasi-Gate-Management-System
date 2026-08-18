import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityLogsService } from '../../activity-logs/activity-logs.service';

describe('AnnouncementsService', () => {
  let service: AnnouncementsService;

  const mockPrisma = {
    announcement: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockActivityLogsService = {
    logAction: jest.fn().mockResolvedValue(true),
  };

  const mockUser = {
    id: 'usr-1',
    name: 'Admin',
    email: 'admin@gms.local',
    role: 'ADMIN',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnnouncementsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ActivityLogsService, useValue: mockActivityLogsService },
      ],
    }).compile();

    service = module.get<AnnouncementsService>(AnnouncementsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all announcements ordered by createdAt desc', async () => {
      const mockList = [{ id: 'ann-1', title: 'Maintenance Notice' }];
      mockPrisma.announcement.findMany.mockResolvedValue(mockList);

      const result = await service.findAll();
      expect(result).toEqual(mockList);
      expect(mockPrisma.announcement.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findActive', () => {
    it('should return active announcements ordered by priority desc', async () => {
      const mockActive = [{ id: 'ann-1', status: 'ACTIVE', priority: 'HIGH' }];
      mockPrisma.announcement.findMany.mockResolvedValue(mockActive);

      const result = await service.findActive();
      expect(result).toEqual(mockActive);
      expect(mockPrisma.announcement.findMany).toHaveBeenCalledWith({
        where: { status: 'ACTIVE' },
        orderBy: { priority: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('should return announcement when found', async () => {
      const mockItem = { id: 'ann-1', title: 'Notice' };
      mockPrisma.announcement.findUnique.mockResolvedValue(mockItem);

      const result = await service.findOne('ann-1');
      expect(result).toEqual(mockItem);
    });

    it('should throw NotFoundException when announcement not found', async () => {
      mockPrisma.announcement.findUnique.mockResolvedValue(null);
      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create announcement and log action', async () => {
      const dto = {
        title: 'New Announcement',
        message: 'System upgrade tonight',
        type: 'INFO',
        priority: 'MEDIUM',
        status: 'ACTIVE',
        location: 'ALL_PAGES',
        speed: 'NORMAL',
      };
      const mockCreated = { id: 'ann-1', ...dto, createdBy: mockUser.id };
      mockPrisma.announcement.create.mockResolvedValue(mockCreated);

      const result = await service.create(dto as any, mockUser);
      expect(result).toEqual(mockCreated);
      expect(mockActivityLogsService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE_ANNOUNCEMENT',
          status: 'SUCCESS',
        }),
      );
    });
  });

  describe('update', () => {
    it('should update announcement and log activation change', async () => {
      const oldAnnouncement = {
        id: 'ann-1',
        title: 'Notice',
        status: 'INACTIVE',
      };
      mockPrisma.announcement.findUnique.mockResolvedValue(oldAnnouncement);

      const updateDto = { status: 'ACTIVE' as const };
      const updatedItem = { ...oldAnnouncement, status: 'ACTIVE' };
      mockPrisma.announcement.update.mockResolvedValue(updatedItem);

      const result = await service.update('ann-1', updateDto, mockUser);
      expect(result).toEqual(updatedItem);
      expect(mockActivityLogsService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ACTIVATE_ANNOUNCEMENT',
          status: 'SUCCESS',
        }),
      );
    });
  });

  describe('remove', () => {
    it('should mark announcement INACTIVE and log action', async () => {
      const oldAnnouncement = {
        id: 'ann-1',
        title: 'Notice',
        status: 'ACTIVE',
      };
      mockPrisma.announcement.findUnique.mockResolvedValue(oldAnnouncement);
      mockPrisma.announcement.update.mockResolvedValue({
        ...oldAnnouncement,
        status: 'INACTIVE',
      });

      const result = await service.remove('ann-1', mockUser);
      expect(result.message).toBe('Announcement deleted successfully');
      expect(mockPrisma.announcement.update).toHaveBeenCalledWith({
        where: { id: 'ann-1' },
        data: { status: 'INACTIVE' },
      });
      expect(mockActivityLogsService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DELETE_ANNOUNCEMENT',
          status: 'SUCCESS',
        }),
      );
    });
  });
});
