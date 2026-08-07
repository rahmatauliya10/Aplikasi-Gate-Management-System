import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import * as fs from 'fs';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { DatabaseBackupService } from './database-backup.service';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings/database')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class DatabaseBackupController {
  constructor(private backupService: DatabaseBackupService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Get backup system health status and enterprise metrics',
  })
  @ApiResponse({ status: 200, description: 'System status retrieved' })
  async getStatus() {
    const status = await this.backupService.getSystemStatus();
    return {
      success: true,
      data: status,
    };
  }

  @Get('history')
  @ApiOperation({ summary: 'Get backup history manifests list' })
  @ApiResponse({ status: 200, description: 'Backup history retrieved' })
  async getHistory() {
    const history = await this.backupService.getBackupHistory();
    return {
      success: true,
      data: history,
    };
  }

  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger explicit manual backup (Admin only)' })
  @ApiResponse({ status: 200, description: 'Backup triggered successfully' })
  async triggerBackup(
    @CurrentUser() user: JwtPayloadUser,
    @Body('type') type?: 'MANUAL_EXPLICIT' | 'MANUAL_PRE_UPDATE',
  ) {
    const manifest = await this.backupService.runAutomatedScheduledBackup(
      type || 'MANUAL_EXPLICIT',
      user,
    );
    return {
      success: true,
      message: 'Backup database berhasil dibuat.',
      data: manifest,
    };
  }

  @Post('backup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate and download database backup file (Admin only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Backup file generated successfully',
  })
  async downloadBackup(
    @CurrentUser() user: JwtPayloadUser,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress;
    const backupData = await this.backupService.generateBackup(user, ipAddress);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `GMS_Backup_${timestamp}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(JSON.stringify(backupData, null, 2));
  }

  @Post('restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore database from backup file (Admin only)' })
  @ApiResponse({ status: 200, description: 'Database restored successfully' })
  async restoreBackup(
    @CurrentUser() user: JwtPayloadUser,
    @Body('backupData') backupData: any,
    @Body('adminPassword') adminPasswordConfirm: string,
    @Req() req: Request,
  ) {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress;

    let payload = backupData;
    if (typeof backupData === 'string') {
      try {
        payload = JSON.parse(backupData);
      } catch (e) {
        throw new Error('Format JSON backupData tidak valid');
      }
    }

    return await this.backupService.restoreDatabase(
      user,
      payload,
      adminPasswordConfirm,
      ipAddress,
    );
  }

  @Get('download-bundle/:backupId')
  @ApiOperation({
    summary: 'Download complete portable DR backup bundle (.gmsbackup)',
  })
  @ApiResponse({
    status: 200,
    description: 'Portable DR backup bundle downloaded',
  })
  async downloadBundle(
    @Param('backupId') backupId: string,
    @Res() res: Response,
  ) {
    const filePath =
      await this.backupService.exportPortableBackupBundle(backupId);
    const filename = `GMS_DR_Bundle_${backupId}.gmsbackup`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
    readStream.on('end', () => {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {}
    });
  }

  @Post('restore-bundle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Restore database and attachments from portable DR bundle (.gmsbackup)',
  })
  @ApiResponse({
    status: 200,
    description: 'Database restored from portable DR bundle',
  })
  async restoreBundle(
    @CurrentUser() user: JwtPayloadUser,
    @Body('bundleData') bundleData: any,
    @Body('adminPassword') adminPasswordConfirm: string,
    @Req() req: Request,
  ) {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress;

    let payload = bundleData;
    if (typeof bundleData === 'string') {
      try {
        payload = JSON.parse(bundleData);
      } catch (e) {
        throw new Error('Format JSON bundleData tidak valid');
      }
    }

    return await this.backupService.restoreFromPortableBundle(
      user,
      payload,
      adminPasswordConfirm,
      ipAddress,
    );
  }
}
