import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityLogsService } from '../../activity-logs/activity-logs.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  async findAll() {
    return this.prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findActive() {
    return this.prisma.announcement.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { priority: 'desc' },
    });
  }

  async findOne(id: string) {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id },
    });
    if (!announcement) {
      throw new NotFoundException(`Announcement with ID ${id} not found`);
    }
    return announcement;
  }

  async create(createDto: CreateAnnouncementDto, user: any) {
    const announcement = await this.prisma.announcement.create({
      data: {
        ...createDto,
        createdBy: user?.id,
      },
    });

    await this.activityLogsService.logAction({
      userId: user?.id,
      userName: user?.name,
      role: user?.role,
      action: 'CREATE_ANNOUNCEMENT',
      module: 'SYSTEM_CONFIG',
      description: `Created announcement: ${announcement.title}`,
      referenceId: announcement.id,
      status: 'SUCCESS',
    });

    return announcement;
  }

  async update(id: string, updateDto: UpdateAnnouncementDto, user: any) {
    const oldAnnouncement = await this.findOne(id);

    const announcement = await this.prisma.announcement.update({
      where: { id },
      data: {
        ...updateDto,
        updatedBy: user?.id,
      },
    });

    let action = 'UPDATE_ANNOUNCEMENT';
    let desc = `Updated announcement: ${announcement.title}`;

    if (oldAnnouncement.status !== announcement.status) {
      action =
        announcement.status === 'ACTIVE'
          ? 'ACTIVATE_ANNOUNCEMENT'
          : 'DEACTIVATE_ANNOUNCEMENT';
      desc = `${announcement.status === 'ACTIVE' ? 'Activated' : 'Deactivated'} announcement: ${announcement.title}`;
    }

    await this.activityLogsService.logAction({
      userId: user?.id,
      userName: user?.name,
      role: user?.role,
      action: action,
      module: 'SYSTEM_CONFIG',
      description: desc,
      referenceId: announcement.id,
      status: 'SUCCESS',
    });

    return announcement;
  }

  async remove(id: string, user: any) {
    const announcement = await this.findOne(id);
    await this.prisma.announcement.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });

    await this.activityLogsService.logAction({
      userId: user?.id,
      userName: user?.name,
      role: user?.role,
      action: 'DELETE_ANNOUNCEMENT',
      module: 'SYSTEM_CONFIG',
      description: `Deleted announcement: ${announcement.title}`,
      referenceId: announcement.id,
      status: 'SUCCESS',
    });

    return { message: 'Announcement deleted successfully' };
  }
}
