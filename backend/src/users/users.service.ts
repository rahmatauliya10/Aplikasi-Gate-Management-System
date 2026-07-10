import { Injectable, ConflictException, NotFoundException, BadRequestException, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.seedDefaultAdmin();
  }

  async seedDefaultAdmin() {
    try {
      this.logger.log('[Seed] Ensuring core users are seeded...');
      const hashOptions = { type: argon2.argon2id };

      const passwordHashAdmin = await argon2.hash(this.config.get('DEFAULT_ADMIN_PASSWORD', 'admin123'), hashOptions);
      const passwordHashQC = await argon2.hash(this.config.get('DEFAULT_QC_PASSWORD', 'qc123'), hashOptions);
      const passwordHashWarehouse = await argon2.hash(this.config.get('DEFAULT_WAREHOUSE_PASSWORD', 'warehouse123'), hashOptions);
      const passwordHashSecurity = await argon2.hash(this.config.get('DEFAULT_SECURITY_PASSWORD', 'security123'), hashOptions);

      // 1. Admin
      const admin = await this.prisma.user.upsert({
        where: { email: 'admin@gms.local' },
        update: {
          username: 'admin',
          name: 'Admin',
          role: 'ADMIN',
          isActive: true,
        },
        create: {
          email: 'admin@gms.local',
          username: 'admin',
          name: 'Admin',
          role: 'ADMIN',
          isActive: true,
          passwordHash: passwordHashAdmin,
        } });
      await this.prisma.user.update({
        where: { id: admin.id },
        data: { passwordHash: passwordHashAdmin } });
      await this.prisma.userWarehouseAccess.deleteMany({ where: { userId: admin.id } });
      await this.prisma.userWarehouseAccess.createMany({
        data: [
          { userId: admin.id, processType: 'GBB' },
          { userId: admin.id, processType: 'GBJ' },
          { userId: admin.id, processType: 'GSP' },
        ],
      });

      // 2. QC
      const qc = await this.prisma.user.upsert({
        where: { email: 'frengky.qc@gms.local' },
        update: {
          username: 'frengky',
          name: 'Frengky Wahudi',
          role: 'QC',
          isActive: true,
        },
        create: {
          email: 'frengky.qc@gms.local',
          username: 'frengky',
          name: 'Frengky Wahudi',
          role: 'QC',
          isActive: true,
          passwordHash: passwordHashQC,
        } });
      await this.prisma.user.update({
        where: { id: qc.id },
        data: { passwordHash: passwordHashQC } });
      await this.prisma.userWarehouseAccess.deleteMany({ where: { userId: qc.id } });

      // 3. Warehouse
      const warehouse = await this.prisma.user.upsert({
        where: { email: 'arga.warehouse@gms.local' },
        update: {
          username: 'arga',
          name: 'Arga Vebrianto',
          role: 'WAREHOUSE',
          isActive: true,
        },
        create: {
          email: 'arga.warehouse@gms.local',
          username: 'arga',
          name: 'Arga Vebrianto',
          role: 'WAREHOUSE',
          isActive: true,
          passwordHash: passwordHashWarehouse,
        } });
      await this.prisma.user.update({
        where: { id: warehouse.id },
        data: { passwordHash: passwordHashWarehouse } });
      await this.prisma.userWarehouseAccess.deleteMany({ where: { userId: warehouse.id } });
      await this.prisma.userWarehouseAccess.createMany({
        data: [
          { userId: warehouse.id, processType: 'GBB' },
          { userId: warehouse.id, processType: 'GBJ' },
          { userId: warehouse.id, processType: 'GSP' },
        ],
      });

      // 4. Security
      const security = await this.prisma.user.upsert({
        where: { email: 'enggar.security@gms.local' },
        update: {
          username: 'enggar',
          name: 'Enggar',
          role: 'SECURITY',
          isActive: true,
        },
        create: {
          email: 'enggar.security@gms.local',
          username: 'enggar',
          name: 'Enggar',
          role: 'SECURITY',
          isActive: true,
          passwordHash: passwordHashSecurity,
        } });
      await this.prisma.user.update({
        where: { id: security.id },
        data: { passwordHash: passwordHashSecurity } });
      await this.prisma.userWarehouseAccess.deleteMany({ where: { userId: security.id } });

      this.logger.log('[Seed] Core users verification completed successfully.');
    } catch (error) {
      this.logger.warn(`[Seed] Error ensuring core users are seeded: ${error.message}`);
    }
  }

  async create(dto: CreateUserDto) {
    const emailLower = dto.email.trim().toLowerCase();
    const usernameLower = dto.username.trim().toLowerCase();

    const existingEmail = await this.prisma.user.findUnique({ where: { email: emailLower } });
    if (existingEmail) throw new ConflictException({ success: false, message: 'Email already exists', errors: [] });

    const existingUsername = await this.prisma.user.findUnique({ where: { username: usernameLower } });
    if (existingUsername) throw new ConflictException({ success: false, message: 'Username already exists', errors: [] });

    // Validate warehouse role constraints
    if (dto.role === 'WAREHOUSE') {
      if (!dto.warehouseAccess || dto.warehouseAccess.length === 0) {
        throw new BadRequestException({
          success: false,
          message: 'Warehouse role requires at least 1 warehouse access selection',
          errors: [],
        });
      }
    } else {
      dto.warehouseAccess = [];
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const user = await this.prisma.user.create({
      data: {
        email: emailLower,
        username: usernameLower,
        passwordHash,
        name: dto.name.trim(),
        role: dto.role as any,
        warehouseAccess: dto.warehouseAccess?.length
          ? { create: dto.warehouseAccess.map((wh) => ({ processType: wh as any })) }
          : undefined,
      },
      include: { warehouseAccess: true } });

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
        warehouseAccess: user.warehouseAccess.map((wa) => wa.processType),
        createdAt: user.createdAt,
      },
    };
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
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
      },
      orderBy: { createdAt: 'desc' } });
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
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { warehouseAccess: true } });
    if (!user) throw new NotFoundException({ success: false, message: 'User not found', errors: [] });

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
        warehouseAccess: user.warehouseAccess.map((wa) => wa.processType),
        createdAt: user.createdAt,
      },
    };
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { warehouseAccess: true } });
    if (!user) throw new NotFoundException({ success: false, message: 'User not found', errors: [] });

    const data: any = {};
    if (dto.email) {
      const emailLower = dto.email.trim().toLowerCase();
      if (emailLower !== user.email) {
        const existingEmail = await this.prisma.user.findUnique({ where: { email: emailLower } });
        if (existingEmail) throw new ConflictException({ success: false, message: 'Email already exists', errors: [] });
        data.email = emailLower;
      }
    }

    if (dto.username) {
      const usernameLower = dto.username.trim().toLowerCase();
      if (usernameLower !== user.username) {
        const existingUsername = await this.prisma.user.findUnique({ where: { username: usernameLower } });
        if (existingUsername) throw new ConflictException({ success: false, message: 'Username already exists', errors: [] });
        data.username = usernameLower;
      }
    }

    if (dto.name) data.name = dto.name.trim();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    
    const targetRole = dto.role || user.role;
    if (dto.role) {
      data.role = dto.role;
    }

    if (dto.password) {
      data.passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    }

    // Determine warehouseAccess logic based on final role
    let updatedAccess = dto.warehouseAccess;
    if (targetRole === 'WAREHOUSE') {
      if (dto.warehouseAccess) {
        if (dto.warehouseAccess.length === 0) {
          throw new BadRequestException({
            success: false,
            message: 'Warehouse role requires at least 1 warehouse access selection',
            errors: [],
          });
        }
      } else if (user.warehouseAccess.length === 0) {
        throw new BadRequestException({
          success: false,
          message: 'Warehouse role requires at least 1 warehouse access selection',
          errors: [],
        });
      }
    } else {
      updatedAccess = [];
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      include: { warehouseAccess: true } });

    if (updatedAccess !== undefined) {
      await this.prisma.userWarehouseAccess.deleteMany({ where: { userId: id } });
      if (updatedAccess.length > 0) {
        await this.prisma.userWarehouseAccess.createMany({
          data: updatedAccess.map((wh) => ({ userId: id, processType: wh as any })),
        });
      }
    }

    const finalAccess = updatedAccess !== undefined 
      ? updatedAccess 
      : updated.warehouseAccess.map((wa) => wa.processType);

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
      },
    };
  }

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException({ success: false, message: 'User not found', errors: [] });

    // Prevent deleting the main admin user (to avoid locking out)
    if (user.email === 'admin@gms.local' || user.username === 'admin') {
      throw new BadRequestException({
        success: false,
        message: 'Cannot delete the primary administrator account',
        errors: [],
      });
    }

    await this.prisma.user.delete({ where: { id } });
    return { success: true, message: 'User deleted successfully', data: null };
  }

  async resetPassword(id: string, dto: ResetPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException({ success: false, message: 'User not found', errors: [] });

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash } });

    return {
      success: true,
      message: 'Password reset successfully',
      data: null,
    };
  }

  async updateStatus(id: string, dto: UpdateStatusDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException({ success: false, message: 'User not found', errors: [] });

    // Prevent deactivating the main admin user (to avoid locking out)
    if ((user.email === 'admin@gms.local' || user.username === 'admin') && !dto.isActive) {
      throw new BadRequestException({
        success: false,
        message: 'Cannot deactivate the primary administrator account',
        errors: [],
      });
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: dto.isActive } });

    return {
      success: true,
      message: `User status updated to ${dto.isActive ? 'active' : 'inactive'}`,
      data: {
        id: updated.id,
        isActive: updated.isActive,
      },
    };
  }
}
