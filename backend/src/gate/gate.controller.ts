import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
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
import { GateService } from './gate.service';
import { CreateGateCheckInDto } from './dto/create-gate-check-in.dto';
import { GateQueryDto } from './dto/gate-query.dto';
import { CancelTransactionDto } from './dto/cancel-transaction.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';

@ApiTags('Gate')
@ApiBearerAuth()
@Controller('gate')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GateController {
  constructor(private gateService: GateService) {}

  @Post('check-in')
  @Roles('SECURITY')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register new vehicle check-in at gate' })
  @ApiResponse({
    status: 201,
    description: 'Gate check-in created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or active transaction exists',
  })
  checkIn(
    @Body() dto: CreateGateCheckInDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.gateService.checkIn(dto, user);
  }

  @Get('queue')
  @Roles('SECURITY')
  @ApiOperation({ summary: 'Get active gate queue (paginated)' })
  @ApiResponse({ status: 200, description: 'Queue retrieved successfully' })
  getQueue(@Query() query: GateQueryDto, @CurrentUser() user: JwtPayloadUser) {
    return this.gateService.getQueue(query, user);
  }

  @Get('detail/:id')
  @Roles('SECURITY')
  @ApiOperation({ summary: 'Get complete transaction detail by ID' })
  @ApiResponse({ status: 200, description: 'Detail retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  getDetail(@Param('id') id: string, @CurrentUser() user: JwtPayloadUser) {
    return this.gateService.getDetail(id, user);
  }

  @Post('check-out/:id')
  @Roles('SECURITY')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process vehicle check-out' })
  @ApiResponse({ status: 200, description: 'Check-out successful' })
  @ApiResponse({ status: 400, description: 'Not ready for check-out' })
  checkOut(@Param('id') id: string, @CurrentUser() user: JwtPayloadUser) {
    return this.gateService.checkOut(id, user);
  }

  @Post('cancel/:id')
  @Roles('SECURITY') // Admin is automatically allowed via RolesGuard
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel active transaction' })
  @ApiResponse({ status: 200, description: 'Transaction cancelled' })
  @ApiResponse({ status: 400, description: 'Already completed or cancelled' })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelTransactionDto,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.gateService.cancel(id, dto.cancellationReason, user);
  }
}
