import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

describe('SettingsService', () => {
  let service: SettingsService;

  const mockPrisma = {
    appSetting: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockActivityLogsService = {
    logAction: jest.fn().mockResolvedValue(true),
  };

  const mockUser: JwtPayloadUser = {
    id: 'usr-1',
    name: 'Admin',
    email: 'admin@gms.local',
    role: 'ADMIN',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ActivityLogsService, useValue: mockActivityLogsService },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all app settings ordered by key asc', async () => {
      const mockSettings = [{ id: 'set-1', key: 'MAINTENANCE_MODE', value: 'false' }];
      mockPrisma.appSetting.findMany.mockResolvedValue(mockSettings);

      const result = await service.findAll(mockUser);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockSettings);
    });
  });

  describe('findByKey', () => {
    it('should return setting by key', async () => {
      const mockSetting = { id: 'set-1', key: 'AUTO_SYNC', value: 'true' };
      mockPrisma.appSetting.findUnique.mockResolvedValue(mockSetting);

      const result = await service.findByKey('AUTO_SYNC');
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockSetting);
    });

    it('should throw NotFoundException when setting key not found', async () => {
      mockPrisma.appSetting.findUnique.mockResolvedValue(null);
      await expect(service.findByKey('NON_EXISTENT')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('upsert', () => {
    it('should upsert setting and log action', async () => {
      const dto = { key: 'CORS_ORIGIN', value: 'http://localhost:8080' };
      const mockResult = { id: 'set-2', ...dto };
      mockPrisma.appSetting.upsert.mockResolvedValue(mockResult);

      const result = await service.upsert(dto as any, mockUser);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResult);
      expect(mockActivityLogsService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SETTING_UPSERT',
          status: 'SUCCESS',
        }),
      );
    });
  });

  describe('remove', () => {
    it('should delete setting and log action', async () => {
      const mockSetting = { id: 'set-3', key: 'TEMP_SETTING', value: 'xyz' };
      mockPrisma.appSetting.findUnique.mockResolvedValue(mockSetting);
      mockPrisma.appSetting.delete.mockResolvedValue(mockSetting);

      const result = await service.remove('TEMP_SETTING', mockUser);
      expect(result.success).toBe(true);
      expect(mockPrisma.appSetting.delete).toHaveBeenCalledWith({
        where: { key: 'TEMP_SETTING' },
      });
      expect(mockActivityLogsService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SETTING_DELETE',
          status: 'SUCCESS',
        }),
      );
    });

    it('should throw NotFoundException when trying to delete non-existent setting', async () => {
      mockPrisma.appSetting.findUnique.mockResolvedValue(null);
      await expect(service.remove('MISSING_KEY', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
