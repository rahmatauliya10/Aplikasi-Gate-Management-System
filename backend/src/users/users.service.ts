import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import {
  acquireActiveAdminInvariantLock,
  isRetryableTransactionConflict,
} from './admin-invariant.util';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private activityLogsService: ActivityLogsService,
  ) {}

  async create(dto: CreateUserDto) {
    return this.runAdminInvariantMutation((prismaTx) =>
      this.createUser(dto, prismaTx),
    );
  }

  private async createUser(dto: CreateUserDto, prismaTx: any) {
    const emailLower = dto.email.trim().toLowerCase();
    const usernameLower = dto.username.trim().toLowerCase();

    const existingEmail = await prismaTx.user.findUnique({
      where: { email: emailLower },
    });
    if (existingEmail)
      throw new ConflictException({
        success: false,
        message: 'Email already exists',
        errors: [],
      });

    const existingUsername = await prismaTx.user.findUnique({
      where: { username: usernameLower },
    });
    if (existingUsername)
      throw new ConflictException({
        success: false,
        message: 'Username already exists',
        errors: [],
      });

    if (dto.role === 'WAREHOUSE' || dto.role === 'QC') {
      if (!dto.warehouseAccess || dto.warehouseAccess.length === 0) {
        throw new BadRequestException({
          success: false,
          message: `${dto.role === 'WAREHOUSE' ? 'Warehouse' : 'QC'} role requires at least 1 process scope selection`,
          errors: [],
        });
      }
    } else {
      dto.warehouseAccess = [];
    }

    const temporaryPassword = require('crypto')
      .randomBytes(16)
      .toString('base64url');
    const passwordHash = await argon2.hash(temporaryPassword, {
      type: argon2.argon2id,
    });
    const user = await prismaTx.user.create({
      data: {
        email: emailLower,
        username: usernameLower,
        passwordHash,
        name: dto.name.trim(),
        role: dto.role as any,
        phone: dto.phone,
        department: dto.department,
        site: dto.site,
        area: dto.area,
        avatarUrl: dto.avatarUrl,
        warehouseAccess: dto.warehouseAccess?.length
          ? {
              create: dto.warehouseAccess.map((wh) => ({
                processType: wh as any,
              })),
            }
          : undefined,
        mustChangePassword: true,
        temporaryPasswordExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      include: { warehouseAccess: true },
    });

    return {
      success: true,
      message: 'User created successfully',
      data: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
        warehouseAccess: user.warehouseAccess.map(
          (wa: { processType: any }) => wa.processType,
        ),
        createdAt: user.createdAt,
        phone: user.phone,
        department: user.department,
        site: user.site,
        area: user.area,
        avatarUrl: user.avatarUrl,
      },
      temporaryPassword,
    };
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      where: { isDeleted: false },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        warehouseAccess: true,
        phone: true,
        department: true,
        site: true,
        area: true,
        avatarUrl: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      success: true,
      message: 'Users retrieved',
      data: users.map((u) => ({
        ...u,
        warehouseAccess: u.warehouseAccess.map((wa) => wa.processType),
      })),
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, isDeleted: false },
      include: { warehouseAccess: true },
    });
    if (!user)
      throw new NotFoundException({
        success: false,
        message: 'User not found',
        errors: [],
      });
    return {
      success: true,
      message: 'User retrieved',
      data: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
        warehouseAccess: user.warehouseAccess.map(
          (wa: { processType: any }) => wa.processType,
        ),
        createdAt: user.createdAt,
        phone: user.phone,
        department: user.department,
        site: user.site,
        area: user.area,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  async update(id: string, dto: UpdateUserDto, currentUser?: JwtPayloadUser) {
    const { updated, finalAccess } = await this.runAdminInvariantMutation(
      async (prismaTx) => {
        const lockedUser = await prismaTx.user.findFirst({
          where: { id, isDeleted: false },
          include: { warehouseAccess: true },
        });
        if (!lockedUser)
          throw new NotFoundException({
            success: false,
            message: 'User not found',
            errors: [],
          });

        if (
          currentUser &&
          currentUser.id === id &&
          dto.area &&
          dto.area !== lockedUser.area &&
          dto.area.includes('UTILITY_DISPOSITION_AUTHORITY')
        ) {
          throw new ForbiddenException({
            success: false,
            message:
              'Pemberian kewenangan disposisi Utility kepada akun sendiri dilarang (Self-privilege escalation prohibited).',
            errors: [],
          });
        }

        const data: any = {};
        if (dto.email) {
          const emailLower = dto.email.trim().toLowerCase();
          if (emailLower !== lockedUser.email) {
            const existingEmail = await prismaTx.user.findUnique({
              where: { email: emailLower },
            });
            if (existingEmail && existingEmail.id !== id)
              throw new ConflictException({
                success: false,
                message: 'Email already exists',
                errors: [],
              });
            data.email = emailLower;
          }
        }
        if (dto.username) {
          const usernameLower = dto.username.trim().toLowerCase();
          if (usernameLower !== lockedUser.username) {
            const existingUsername = await prismaTx.user.findUnique({
              where: { username: usernameLower },
            });
            if (existingUsername && existingUsername.id !== id)
              throw new ConflictException({
                success: false,
                message: 'Username already exists',
                errors: [],
              });
            data.username = usernameLower;
          }
        }
        if (dto.name) data.name = dto.name.trim();
        if (dto.isActive !== undefined) data.isActive = dto.isActive;
        if (dto.phone !== undefined) data.phone = dto.phone;
        if (dto.department !== undefined) data.department = dto.department;
        if (dto.site !== undefined) data.site = dto.site;
        if (dto.area !== undefined) data.area = dto.area;

        if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;

        const targetRole = dto.role || lockedUser.role;
        if (dto.role) data.role = dto.role;
        if (
          dto.role !== undefined ||
          dto.warehouseAccess !== undefined ||
          dto.isActive !== undefined
        ) {
          data.tokenVersion = { increment: 1 };
          data.refreshTokenHash = null;
        }

        let updatedAccess = dto.warehouseAccess;
        if (targetRole === 'WAREHOUSE' || targetRole === 'QC') {
          if (dto.warehouseAccess) {
            if (dto.warehouseAccess.length === 0) {
              throw new BadRequestException({
                success: false,
                message: `${targetRole === 'WAREHOUSE' ? 'Warehouse' : 'QC'} role requires at least 1 process scope selection`,
                errors: [],
              });
            }
          } else if ((lockedUser.warehouseAccess || []).length === 0) {
            throw new BadRequestException({
              success: false,
              message: `${targetRole === 'WAREHOUSE' ? 'Warehouse' : 'QC'} role requires at least 1 process scope selection`,
              errors: [],
            });
          }
        } else {
          updatedAccess = [];
        }

        if (
          lockedUser.role === 'ADMIN' &&
          ((dto.role && dto.role !== 'ADMIN') || dto.isActive === false)
        ) {
          const activeAdminCount = await prismaTx.user.count({
            where: { role: 'ADMIN', isActive: true, isDeleted: false },
          });
          if (activeAdminCount <= 1)
            throw new BadRequestException(
              'Perubahan ditolak: Sistem harus selalu memiliki minimal satu ADMIN aktif.',
            );
        }

        const resUser = await prismaTx.user.update({
          where: { id },
          data,
          include: { warehouseAccess: true },
        });
        if (updatedAccess !== undefined) {
          await prismaTx.userWarehouseAccess.deleteMany({
            where: { userId: id },
          });
          if (updatedAccess.length > 0) {
            await prismaTx.userWarehouseAccess.createMany({
              data: updatedAccess.map((wh) => ({
                userId: id,
                processType: wh as any,
              })),
            });
          }
        }
        if (dto.area !== undefined && dto.area !== lockedUser.area) {
          await this.activityLogsService.logAction(
            {
              userId: currentUser?.id || 'SYSTEM',
              action: 'USER_PRIVILEGE_CHANGED',
              module: 'USERS',
              referenceId: id,
              description: `User '${lockedUser.username}' area privilege changed from '${lockedUser.area || 'NONE'}' to '${dto.area || 'NONE'}' by actor '${currentUser?.email || currentUser?.name || currentUser?.id || 'SYSTEM'}'`,
              status: 'SUCCESS',
            },
            prismaTx,
          );
        }
        const accessList =
          updatedAccess !== undefined
            ? updatedAccess
            : resUser.warehouseAccess.map(
                (wa: { processType: any }) => wa.processType,
              );
        return { updated: resUser, finalAccess: accessList };
      },
    );

    return {
      success: true,
      message: 'User updated successfully',
      data: {
        id: updated.id,
        email: updated.email,
        username: updated.username,
        name: updated.name,
        role: updated.role,
        isActive: updated.isActive,
        lastLoginAt: updated.lastLoginAt,
        warehouseAccess: finalAccess,
        createdAt: updated.createdAt,
        phone: updated.phone,
        department: updated.department,
        site: updated.site,
        area: updated.area,
        avatarUrl: updated.avatarUrl,
      },
    };
  }

  async remove(id: string) {
    await this.runAdminInvariantMutation(async (prismaTx) => {
      const user = await prismaTx.user.findFirst({
        where: { id, isDeleted: false },
      });
      if (!user)
        throw new NotFoundException({
          success: false,
          message: 'User not found',
          errors: [],
        });
      if (user.role === 'ADMIN') {
        const activeAdminCount = await prismaTx.user.count({
          where: { role: 'ADMIN', isActive: true, isDeleted: false },
        });
        if (activeAdminCount <= 1)
          throw new BadRequestException(
            'Penghapusan ditolak: Sistem harus selalu memiliki minimal satu ADMIN aktif.',
          );
      }
      const timestamp = Date.now();
      await prismaTx.user.update({
        where: { id },
        data: {
          isDeleted: true,
          isActive: false,
          email: `${user.email}_deleted_${timestamp}`,
          username: `${user.username}_deleted_${timestamp}`,
          tokenVersion: { increment: 1 },
          refreshTokenHash: null,
        },
      });
    });
    return { success: true, message: 'User deleted successfully', data: null };
  }

  private async runAdminInvariantMutation<T>(
    mutation: (prismaTx: any) => Promise<T>,
  ): Promise<T> {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (prismaTx) => {
            await acquireActiveAdminInvariantLock(prismaTx);
            return mutation(prismaTx);
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error) {
        if (isRetryableTransactionConflict(error) && attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException(
      'Mutasi akun gagal setelah beberapa percobaan.',
    );
  }

  async resetPassword(id: string, adminId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, isDeleted: false },
    });
    if (!user)
      throw new NotFoundException({
        success: false,
        message: 'User not found',
        errors: [],
      });
    const temporaryPassword =
      'Tmp' + require('crypto').randomBytes(8).toString('hex') + '1!';
    const passwordHash = await argon2.hash(temporaryPassword, {
      type: argon2.argon2id,
    });
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
        passwordChangedAt: new Date(),
        temporaryPasswordExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        tokenVersion: { increment: 1 },
        refreshTokenHash: null,
      },
    });
    await this.activityLogsService.logAction({
      userId: adminId,
      action: 'ADMIN_RESET_PASSWORD',
      module: 'USERS',
      description: `Admin reset password for user ${user.username}`,
      status: 'SUCCESS',
      referenceId: user.id,
    });
    return {
      success: true,
      message:
        'Password reset successfully. Please share this temporary password securely.',
      data: { temporaryPassword },
    };
  }

  async updateStatus(id: string, dto: UpdateStatusDto) {
    const updated = await this.runAdminInvariantMutation(async (prismaTx) => {
      const user = await prismaTx.user.findFirst({
        where: { id, isDeleted: false },
      });
      if (!user)
        throw new NotFoundException({
          success: false,
          message: 'User not found',
          errors: [],
        });
      if (
        (user.email === 'admin@gms.local' || user.username === 'admin') &&
        !dto.isActive
      ) {
        throw new BadRequestException({
          success: false,
          message: 'Cannot deactivate the primary administrator account',
          errors: [],
        });
      }
      if (user.role === 'ADMIN' && !dto.isActive) {
        const activeAdminCount = await prismaTx.user.count({
          where: { role: 'ADMIN', isActive: true, isDeleted: false },
        });
        if (activeAdminCount <= 1)
          throw new BadRequestException(
            'Deaktivasi ditolak: Sistem harus selalu memiliki minimal satu ADMIN aktif.',
          );
      }
      return prismaTx.user.update({
        where: { id },
        data: {
          isActive: dto.isActive,
          tokenVersion: { increment: 1 },
          refreshTokenHash: null,
        },
      });
    });
    return {
      success: true,
      message: `User status updated to ${dto.isActive ? 'active' : 'inactive'}`,
      data: { id: updated.id, isActive: updated.isActive },
    };
  }
}
