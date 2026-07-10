import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityLogsService } from '../../activity-logs/activity-logs.service';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied: No user context',
        errors: [],
      });
    }

    // ADMIN bypasses all restrictions
    if (user.role === 'ADMIN') {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no roles specified, allow access for logged-in users
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const hasRole = requiredRoles.some((role) => user.role === role);

    if (!hasRole) {
      this.logger.warn(`ACCESS_DENIED: User ${user.email} (role: ${user.role}) tried to access endpoint requiring roles: [${requiredRoles.join(', ')}]`);

      // Log access denied to audit
      await this.activityLogsService.logAction({
          userId: user.id,
          action: 'ACCESS_DENIED',
          module: 'AUTH',
          description: {
            requiredRoles: requiredRoles,
            userRole: user.role,
            endpoint: context.switchToHttp().getRequest().url,
            method: context.switchToHttp().getRequest().method,
          },
          status: 'FAILED',
        }).catch((err) => {
        // Don't fail the request if audit logging fails
        console.error('Failed to log unauthorized access', err);
      });

      throw new ForbiddenException({
        success: false,
        message: 'Access denied: Insufficient permissions',
        errors: [],
      });
    }

    return true;
  }
}
