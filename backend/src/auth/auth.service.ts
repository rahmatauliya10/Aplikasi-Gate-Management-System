import {
  Injectable,
  UnauthorizedException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  getJwtAccessSecret,
  getJwtRefreshSecret,
} from '../common/utils/jwt-secrets.util';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private activityLogsService: ActivityLogsService,
  ) {}

  private failedAttemptsMap = new Map<
    string,
    { count: number; lockedUntil?: Date }
  >();

  async login(dto: LoginDto) {
    this.logger.log(`Login attempt for identifier: ${dto.identifier}`);

    const identifier = dto.identifier.trim();
    const user = await this.prisma.user.findFirst({
      where: {
        isDeleted: false,
        OR: [
          { email: { equals: identifier, mode: 'insensitive' } },
          { username: { equals: identifier, mode: 'insensitive' } },
        ],
      },
      include: { warehouseAccess: true },
    });

    const genericErrorMessage =
      'Kredensial login tidak valid. Periksa kembali username dan password Anda.';

    if (!user) {
      this.logger.warn(`Login failed: user not found - ${dto.identifier}`);
      await this.auditLog(null, 'LOGIN_FAILED', {
        identifier: dto.identifier,
        reason: 'User not found or credentials invalid',
      });
      throw new UnauthorizedException({
        success: false,
        message: genericErrorMessage,
        errors: [],
      });
    }

    // DB-Backed Account Lockout Check (5 failed attempts within 15 mins -> lockout)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const recentFailedCount = await this.prisma.activityLog.count({
      where: {
        userId: user.id,
        action: 'LOGIN_FAILED',
        createdAt: { gte: fifteenMinutesAgo },
      },
    });

    if (recentFailedCount >= 5) {
      this.logger.warn(
        `Login blocked by DB lockout policy for ${dto.identifier}`,
      );
      await this.auditLog(user.id, 'LOGIN_LOCKED', {
        identifier: dto.identifier,
        reason: 'Account locked due to consecutive failed attempts in DB log.',
      });
      throw new UnauthorizedException({
        success: false,
        message:
          'Akun Anda terkunci sementara karena berulang kali gagal login. Silakan coba lagi dalam 15 menit.',
        code: 'ACCOUNT_TEMPORARILY_LOCKED',
        errors: [],
      });
    }

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) {
      const newCount = recentFailedCount + 1;
      this.logger.warn(
        `Login failed: invalid password for ${dto.identifier} (Attempt ${newCount}/5)`,
      );
      await this.auditLog(user.id, 'LOGIN_FAILED', {
        identifier: dto.identifier,
        reason: `Invalid password (Attempt ${newCount}/5)`,
      });

      if (newCount >= 5) {
        throw new UnauthorizedException({
          success: false,
          message:
            'Akun Anda terkunci sementara karena berulang kali gagal login. Silakan coba lagi dalam 15 menit.',
          code: 'ACCOUNT_TEMPORARILY_LOCKED',
          errors: [],
        });
      }

      throw new UnauthorizedException({
        success: false,
        message: genericErrorMessage,
        errors: [],
      });
    }

    if (!user.isActive) {
      this.logger.warn(`Login failed: account disabled for ${dto.identifier}`);
      await this.auditLog(user.id, 'LOGIN_FAILED', {
        identifier: dto.identifier,
        reason: 'Account disabled',
      });
      throw new UnauthorizedException({
        success: false,
        message: 'Account is disabled. Contact administrator.',
        errors: [],
      });
    }

    if (
      user.mustChangePassword &&
      user.temporaryPasswordExpiresAt &&
      new Date() > user.temporaryPasswordExpiresAt
    ) {
      this.logger.warn(
        `Login failed: temporary password expired for ${dto.identifier}`,
      );
      await this.auditLog(user.id, 'LOGIN_FAILED', {
        identifier: dto.identifier,
        reason: 'Temporary password expired',
      });
      throw new UnauthorizedException({
        success: false,
        message: 'Temporary password expired. Hubungi administrator.',
        code: 'TEMPORARY_PASSWORD_EXPIRED',
        errors: [],
      });
    }

    // Generate tokens, fallback to JWT_SECRET for backward compatibility during transition
    const payload = {
      sub: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
      tv: user.tokenVersion,
    };
    const accessSecret = getJwtAccessSecret();
    const refreshSecret = getJwtRefreshSecret();

    const accessToken = this.jwtService.sign(payload, { secret: accessSecret });
    const refreshToken = this.jwtService.sign(payload, {
      secret: refreshSecret,
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    // Hash and store refresh token, update lastLoginAt
    const refreshTokenHash = await argon2.hash(refreshToken);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshTokenHash,
        lastLoginAt: new Date(),
      },
    });

    this.logger.log(`Login success for ${dto.identifier}`);
    await this.auditLog(user.id, 'LOGIN_SUCCESS', {
      identifier: dto.identifier,
    });

    return {
      success: true,
      message: 'Login successful',
      data: {
        accessToken,
        refreshToken,
        mustChangePassword: user.mustChangePassword,
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          role: user.role,
          warehouseAccess: user.warehouseAccess.map((wa) => wa.processType),
          phone: user.phone,
          department: user.department,
          site: user.site,
          area: user.area,
          avatarUrl: user.avatarUrl,
          lastLoginAt: user.lastLoginAt,
        },
      },
    };
  }

  async logout(userId: string) {
    this.logger.log(`Logout for user: ${userId}`);

    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });

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
      const refreshSecret = getJwtRefreshSecret();
      payload = this.jwtService.verify(refreshToken, {
        secret: refreshSecret,
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
      include: { warehouseAccess: true },
    });

    if (!user || !user.isActive || !user.refreshTokenHash) {
      this.logger.warn(
        `Refresh token: user not found, inactive, or no stored token for ${payload.email}`,
      );
      throw new UnauthorizedException({
        success: false,
        message: 'Invalid refresh token',
        errors: [],
      });
    }

    // Verify refresh token matches stored hash
    const tokenMatches = await argon2.verify(
      user.refreshTokenHash,
      refreshToken,
    );
    if (!tokenMatches) {
      this.logger.warn(
        `Refresh token: token mismatch for ${payload.email} — possible token reuse attack`,
      );
      // Invalidate all tokens (security measure)
      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshTokenHash: null },
      });
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
      tv: user.tokenVersion,
    };

    const accessSecret = getJwtAccessSecret();
    const refreshSecret = getJwtRefreshSecret();

    const newAccessToken = this.jwtService.sign(newPayload, {
      secret: accessSecret,
    });
    const newRefreshToken = this.jwtService.sign(newPayload, {
      secret: refreshSecret,
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    // Store new refresh token hash atomically via CAS check
    const newRefreshTokenHash = await argon2.hash(newRefreshToken);
    const updateRes = await this.prisma.user.updateMany({
      where: { id: user.id, refreshTokenHash: user.refreshTokenHash },
      data: { refreshTokenHash: newRefreshTokenHash },
    });

    if (updateRes.count === 0) {
      this.logger.warn(`Refresh token race condition detected for ${user.email}`);
      throw new UnauthorizedException({
        success: false,
        message: 'Refresh token session collision or invalidated',
        errors: [],
      });
    }

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
          phone: user.phone,
          department: user.department,
          site: user.site,
          area: user.area,
          avatarUrl: user.avatarUrl,
          lastLoginAt: user.lastLoginAt,
        },
      },
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { warehouseAccess: true },
    });

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
        phone: user.phone,
        department: user.department,
        site: user.site,
        area: user.area,
        avatarUrl: user.avatarUrl,
        lastLoginAt: user.lastLoginAt,
      },
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.department !== undefined) data.department = dto.department;
    if (dto.site !== undefined) data.site = dto.site;
    if (dto.area !== undefined) data.area = dto.area;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      include: { warehouseAccess: true },
    });

    await this.auditLog(userId, 'UPDATE_PROFILE', {
      details: 'User updated profile details',
    });

    return {
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: updated.id,
        name: updated.name,
        username: updated.username,
        email: updated.email,
        role: updated.role,
        isActive: updated.isActive,
        warehouseAccess: updated.warehouseAccess.map((wa) => wa.processType),
        createdAt: updated.createdAt,
        phone: updated.phone,
        department: updated.department,
        site: updated.site,
        area: updated.area,
        avatarUrl: updated.avatarUrl,
        lastLoginAt: updated.lastLoginAt,
      },
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const passwordValid = await argon2.verify(
      user.passwordHash,
      dto.currentPassword,
    );
    if (!passwordValid) {
      await this.auditLog(userId, 'CHANGE_PASSWORD_FAILED', {
        reason: 'Invalid current password',
      });
      throw new BadRequestException({
        success: false,
        message: 'Password saat ini salah',
        errors: [],
      });
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException({
        success: false,
        message: 'Password baru tidak boleh sama dengan password lama',
        errors: [],
      });
    }

    const newPasswordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });

    // Use transaction to update user and clear sessions
    await this.prisma.$transaction(async (prisma) => {
      await prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: newPasswordHash,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          temporaryPasswordExpiresAt: null,
          tokenVersion: { increment: 1 },
          refreshTokenHash: null,
        },
      });
    });

    await this.auditLog(userId, 'PASSWORD_CHANGED', {});

    return {
      success: true,
      message: 'Password berhasil diubah. Silakan login kembali.',
      data: null,
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
