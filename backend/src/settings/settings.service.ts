import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { UpsertSettingDto } from './dto/upsert-setting.dto';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
  ) {}

  async findAll(user: JwtPayloadUser) {
    const settings = await this.prisma.appSetting.findMany({
      orderBy: { key: 'asc' },
    });

    return {
      success: true,
      message: 'Settings retrieved successfully',
      data: settings,
    };
  }

  async findByKey(key: string) {
    const setting = await this.prisma.appSetting.findUnique({ where: { key } });
    if (!setting)
      throw new NotFoundException({
        success: false,
        message: `Setting '${key}' not found`,
        errors: [],
      });

    return {
      success: true,
      message: 'Setting retrieved successfully',
      data: setting,
    };
  }

  async upsert(dto: UpsertSettingDto, user: JwtPayloadUser) {
    this.logger.log(`Setting upsert: ${dto.key} by ${user.email}`);

    // Self-grant guard for UTILITY_DISPOSITION_AUTHORIZED_USERS
    if (dto.key === 'UTILITY_DISPOSITION_AUTHORIZED_USERS' && dto.value) {
      const authorizedList = dto.value
        .split(',')
        .map((s) => s.trim().toLowerCase());
      const selfIdentifiers = [
        user.email?.toLowerCase(),
        user.id?.toLowerCase(),
        (user as any).username?.toLowerCase(),
      ].filter(Boolean);
      if (selfIdentifiers.some((ident) => authorizedList.includes(ident))) {
        throw new ForbiddenException({
          success: false,
          message:
            'Menambahkan akun sendiri ke dalam daftar otorisasi disposisi Utility dilarang (Self-privilege escalation prohibited).',
          errors: [],
        });
      }
    }

    const setting = await this.prisma.appSetting.upsert({
      where: { key: dto.key },
      update: { value: dto.value },
      create: { key: dto.key, value: dto.value },
    });

    await this.activityLogsService.logAction({
      userId: user.id,
      action: 'SETTING_UPSERT',
      module: 'SETTINGS',

      referenceId: setting.id,
      description: `Setting '${dto.key}' updated to '${dto.value}' by actor '${user.email || user.name || user.id}'`,
      status: 'SUCCESS',
    });

    return {
      success: true,
      message: `Setting '${dto.key}' saved successfully`,
      data: setting,
    };
  }

  async remove(key: string, user: JwtPayloadUser) {
    const setting = await this.prisma.appSetting.findUnique({ where: { key } });
    if (!setting)
      throw new NotFoundException({
        success: false,
        message: `Setting '${key}' not found`,
        errors: [],
      });

    await this.prisma.appSetting.delete({ where: { key } });

    this.logger.warn(`Setting deleted: ${key} by ${user.email}`);

    await this.activityLogsService.logAction({
      userId: user.id,
      action: 'SETTING_DELETE',
      module: 'SETTINGS',

      referenceId: setting.id,
      description: `Setting '${key}' deleted`,
      status: 'SUCCESS',
    });

    return {
      success: true,
      message: `Setting '${key}' deleted successfully`,
    };
  }
}
