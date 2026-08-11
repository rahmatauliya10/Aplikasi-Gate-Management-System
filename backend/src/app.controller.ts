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
    return this.getReadiness();
  }

  @Get('health/liveness')
  getLiveness() {
    return {
      success: true,
      message: 'GMS backend liveness probe passed',
      data: {
        status: 'ok',
        uptime: process.uptime(),
      },
    };
  }

  @Get('health/readiness')
  async getReadiness() {
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
      message: 'GMS backend readiness probe passed',
      data: {
        status: 'ok',
        database: dbStatus,
      },
    };
  }
}
