import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

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
      liveness: '/api/health/liveness',
      readiness: '/api/health/readiness',
      dependencies: '/api/health/dependencies',
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
    let uploadDirWritable = true;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (e) {
      dbStatus = 'error';
    }

    try {
      const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const testFile = path.join(uploadDir, `.health_write_test_${Date.now()}`);
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (e) {
      uploadDirWritable = false;
    }

    const isHealthy = dbStatus === 'ok' && uploadDirWritable;

    if (!isHealthy) {
      throw new ServiceUnavailableException({
        success: false,
        message: 'GMS backend readiness probe failed',
        data: {
          status: 'error',
          database: dbStatus,
          uploadDirWritable,
        },
      });
    }

    return {
      success: true,
      message: 'GMS backend readiness probe passed',
      data: {
        status: 'ok',
        database: dbStatus,
        uploadDirWritable,
      },
    };
  }

  @Get('health/dependencies')
  async getDependencies() {
    let dbStatus = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (e) {
      dbStatus = 'error';
    }

    let nasStatus = 'ok';
    const nasDir = path.resolve(process.env.OFFSITE_BACKUP_DIR || './backups/nas');
    try {
      if (!fs.existsSync(nasDir)) {
        nasStatus = 'DEGRADED';
      }
    } catch (e) {
      nasStatus = 'DEGRADED';
    }

    const overallStatus = dbStatus === 'ok' && nasStatus === 'ok' ? 'HEALTHY' : 'DEGRADED';

    return {
      success: true,
      message: `GMS dependency status: ${overallStatus}`,
      data: {
        status: overallStatus,
        database: dbStatus,
        nasBackupDirectory: nasStatus,
        alert: nasStatus === 'DEGRADED' ? 'NAS storage unreachable or degraded' : null,
      },
    };
  }
}

