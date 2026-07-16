import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSystemIssueDto } from './dto/create-system-issue.dto';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class SystemIssuesService {
  private readonly logger = new Logger(SystemIssuesService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSystemIssueDto, user: JwtPayloadUser) {
    this.logger.log(`Creating new system issue: ${dto.issueType} by ${user.email}`);

    const issue = await this.prisma.systemIssue.create({
      data: {
        issueType: dto.issueType,
        description: dto.description,
        screenshotUrl: dto.screenshotUrl || null,
        reporterId: user.id,
      },
      include: {
        reporter: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return {
      success: true,
      message: 'Laporan kendala berhasil disimpan ke database GMS.',
      data: issue,
    };
  }

  async findAll(user: JwtPayloadUser) {
    this.logger.log(`Fetching all system issues by ${user.email}`);

    const issues = await this.prisma.systemIssue.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return {
      success: true,
      message: 'Daftar laporan kendala berhasil diambil.',
      data: issues,
    };
  }
}
