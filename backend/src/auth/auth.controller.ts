import {
  Controller,
  Post,
  Put,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
  Req,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AllowMustChangePassword } from '../common/decorators/allow-must-change-password.decorator';
import type { Response, Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
function parseCookieSecure(): boolean {
  const rawValue = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (rawValue === 'true') {
    return true;
  }
  return false;
}

function parseSameSite(): 'strict' | 'lax' | 'none' {
  const val = process.env.SAME_SITE?.trim().toLowerCase();
  if (val === 'lax') return 'lax';
  if (val === 'none') return 'none';
  return 'strict';
}

function getRefreshCookieOptions() {
  return {
    httpOnly: true,
    secure: parseCookieSecure(),
    sameSite: parseSameSite(),
    path: '/',
  };
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login user',
    description: 'Authenticate with email and password. Returns JWT tokens.',
  })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    if (result.success && result.data?.refreshToken) {
      res.cookie('refreshToken', result.data.refreshToken, {
        ...getRefreshCookieOptions(),
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      delete (result.data as any).refreshToken;
    }
    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @AllowMustChangePassword()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Logout user',
    description: 'Invalidate refresh token for current user.',
  })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(
    @CurrentUser() user: JwtPayloadUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.clearCookie('refreshToken', getRefreshCookieOptions());
    return this.authService.logout(user.id);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh tokens',
    description:
      'Exchange refresh token for new access and refresh tokens (rotation).',
  })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieHeader = req.headers.cookie || '';
    const match = cookieHeader.match(/refreshToken=([^;]+)/);
    const refreshToken = match ? match[1] : req.body?.refreshToken;
    if (!refreshToken) throw new UnauthorizedException('Refresh token missing');

    const result = await this.authService.refreshTokens(refreshToken);
    if (result.success && result.data?.refreshToken) {
      res.cookie('refreshToken', result.data.refreshToken, {
        ...getRefreshCookieOptions(),
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      delete (result.data as any).refreshToken;
    }
    return result;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @AllowMustChangePassword()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user',
    description: 'Retrieve profile of the currently authenticated user.',
  })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMe(@CurrentUser() user: JwtPayloadUser) {
    return this.authService.getMe(user.id);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @AllowMustChangePassword()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change own password (forced or manual)' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async changePassword(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException({
        success: false,
        message: 'New password and confirm password do not match',
        errors: [],
      });
    }
    const result = await this.authService.changePassword(user.id, dto);
    res.clearCookie('refreshToken', getRefreshCookieOptions());
    return result;
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update own profile details' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async updateProfile(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user.id, dto);
  }
}
