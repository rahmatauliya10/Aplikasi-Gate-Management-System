import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  getHello() {
    return {
      success: true,
      message: 'Welcome to Gate Management System API',
      documentation: '/api/docs',
      health: '/api/health',
    };
  }

  @Get('health')
  async getHealth() {
    let dbStatus = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (e) {
      dbStatus = 'error';
    }

    const isHealthy = dbStatus === 'ok';

    if (!isHealthy) {
      throw new ServiceUnavailableException({
        success: false,
        message: 'GMS backend database error',
        data: {
          status: 'error',
          database: dbStatus,
        },
      });
    }

    return {
      success: true,
      message: 'GMS backend is running',
      data: {
        status: 'ok',
        database: dbStatus,
      },
    };
  }
}
