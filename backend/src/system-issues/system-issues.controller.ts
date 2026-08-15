import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { SystemIssuesService } from './system-issues.service';
import { CreateSystemIssueDto } from './dto/create-system-issue.dto';

@ApiTags('System Issues')
@ApiBearerAuth()
@Controller('system-issues')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SystemIssuesController {
  constructor(private readonly systemIssuesService: SystemIssuesService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a new system issue report' })
  @ApiResponse({ status: 201, description: 'Issue submitted successfully' })
  create(
    @Body() dto: CreateSystemIssueDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.systemIssuesService.create(dto, user);
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get all system issue reports (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Issues list retrieved successfully',
  })
  findAll(@CurrentUser() user: JwtPayloadUser) {
    return this.systemIssuesService.findAll(user);
  }
}
