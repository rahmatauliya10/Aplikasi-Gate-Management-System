import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SettingsService } from './settings.service';
import { UpsertSettingDto } from './dto/upsert-setting.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all settings' })
  @ApiResponse({ status: 200, description: 'Settings list retrieved' })
  findAll(@CurrentUser() user: JwtPayloadUser) {
    return this.settingsService.findAll(user);
  }

  @Get(':key')
  @ApiOperation({ summary: 'Get setting by key' })
  @ApiResponse({ status: 200, description: 'Setting retrieved' })
  @ApiResponse({ status: 404, description: 'Setting not found' })
  findByKey(@Param('key') key: string) {
    return this.settingsService.findByKey(key);
  }

  @Post()
  @ApiOperation({ summary: 'Create or update a setting' })
  @ApiResponse({ status: 200, description: 'Setting saved' })
  upsert(@Body() dto: UpsertSettingDto, @CurrentUser() user: JwtPayloadUser) {
    return this.settingsService.upsert(dto, user);
  }

  @Delete(':key')
  @ApiOperation({ summary: 'Delete a setting by key' })
  @ApiResponse({ status: 200, description: 'Setting deleted' })
  remove(@Param('key') key: string, @CurrentUser() user: JwtPayloadUser) {
    return this.settingsService.remove(key, user);
  }
}
