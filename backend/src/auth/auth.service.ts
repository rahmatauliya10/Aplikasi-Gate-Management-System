import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private activityLogsService: ActivityLogsService,
  ) {}

  async login(dto: LoginDto) {
    this.logger.log(`Login attempt for identifier: ${dto.identifier}`);

    const identifier = dto.identifier.trim();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: identifier, mode: 'insensitive' } },
          { username: { equals: identifier, mode: 'insensitive' } },
        ],
      },
      include: { warehouseAccess: true } });

    if (!user) {
      this.logger.warn(`Login failed: user not found - ${dto.identifier}`);
      await this.auditLog(null, 'LOGIN_FAILED', { identifier: dto.identifier, reason: 'User not found' });
      throw new UnauthorizedException({
        success: false,
        message: 'Username atau email tidak ditemukan.',
        errors: [],
      });
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      this.logger.warn(`Login failed: invalid password for ${dto.identifier}`);
      await this.auditLog(user.id, 'LOGIN_FAILED', { identifier: dto.identifier, reason: 'Invalid password' });
      throw new UnauthorizedException({
        success: false,
        message: 'Password salah.',
        errors: [],
      });
    }

    if (!user.isActive) {
      this.logger.warn(`Login failed: account disabled for ${dto.identifier}`);
      await this.auditLog(user.id, 'LOGIN_FAILED', { identifier: dto.identifier, reason: 'Account disabled' });
      throw new UnauthorizedException({
        success: false,
        message: 'Account is disabled. Contact administrator.',
        errors: [],
      });
    }

    const payload = {
      sub: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
    };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    // Hash and store refresh token, update lastLoginAt
    const refreshTokenHash = await argon2.hash(refreshToken);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { 
        refreshTokenHash,
        lastLoginAt: new Date()
      } });

    const isDefaultPassword = [
      process.env.DEFAULT_ADMIN_PASSWORD || 'admin123',
      process.env.DEFAULT_QC_PASSWORD || 'qc123',
      process.env.DEFAULT_WAREHOUSE_PASSWORD || 'warehouse123',
      process.env.DEFAULT_SECURITY_PASSWORD || 'security123',
    ].includes(dto.password);

    this.logger.log(`Login success for ${dto.identifier}`);
    await this.auditLog(user.id, 'LOGIN_SUCCESS', { identifier: dto.identifier });

    return {
      success: true,
      message: 'Login successful',
      data: {
        accessToken,
        refreshToken,
        mustChangePassword: isDefaultPassword,
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          role: user.role,
          warehouseAccess: user.warehouseAccess.map((wa) => wa.processType),
        },
      },
    };
  }

  async logout(userId: string) {
    this.logger.log(`Logout for user: ${userId}`);

    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null } });

    await this.auditLog(userId, 'LOGOUT', {});

    return {
      success: true,
      message: 'Logout successful',
      data: null,
    };
  }

  async refreshTokens(refreshToken: string) {
    this.logger.log('Refresh token attempt');

    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      });
    } catch {
      this.logger.warn('Refresh token: invalid or expired token');
      throw new UnauthorizedException({
        success: false,
        message: 'Invalid or expired refresh token',
        errors: [],
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { warehouseAccess: true } });

    if (!user || !user.isActive || !user.refreshTokenHash) {
      this.logger.warn(`Refresh token: user not found, inactive, or no stored token for ${payload.email}`);
      throw new UnauthorizedException({
        success: false,
        message: 'Invalid refresh token',
        errors: [],
      });
    }

    // Verify refresh token matches stored hash
    const tokenMatches = await argon2.verify(user.refreshTokenHash, refreshToken);
    if (!tokenMatches) {
      this.logger.warn(`Refresh token: token mismatch for ${payload.email} — possible token reuse attack`);
      // Invalidate all tokens (security measure)
      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshTokenHash: null } });
      throw new UnauthorizedException({
        success: false,
        message: 'Invalid refresh token',
        errors: [],
      });
    }

    // Rotation: generate new tokens
    const newPayload = {
      sub: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
    };
    const newAccessToken = this.jwtService.sign(newPayload);
    const newRefreshToken = this.jwtService.sign(newPayload, {
      secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    // Store new refresh token hash
    const newRefreshTokenHash = await argon2.hash(newRefreshToken);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: newRefreshTokenHash } });

    this.logger.log(`Refresh token success for ${user.email}`);
    await this.auditLog(user.id, 'REFRESH_TOKEN', {});

    return {
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          role: user.role,
          warehouseAccess: user.warehouseAccess.map((wa) => wa.processType),
        },
      },
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { warehouseAccess: true } });

    if (!user) {
      throw new UnauthorizedException({
        success: false,
        message: 'User not found',
        errors: [],
      });
    }

    return {
      success: true,
      message: 'User profile retrieved',
      data: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        warehouseAccess: user.warehouseAccess.map((wa) => wa.processType),
        createdAt: user.createdAt,
      },
    };
  }

  private async auditLog(userId: string | null, action: string, details: any) {
    let userName = null;
    let role = null;
    if (userId) {
      const u = await this.prisma.user.findUnique({ where: { id: userId } });
      if (u) {
        userName = u.name;
        role = u.role;
      }
    }
    
    await this.activityLogsService.logAction({
      userId: userId || undefined,
      userName: userName || undefined,
      role: role || undefined,
      action,
      module: 'AUTH',
      description: details?.reason || JSON.stringify(details),
      status: action.includes('FAILED') ? 'FAILED' : 'SUCCESS',
    });
  }
}
