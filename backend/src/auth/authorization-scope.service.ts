import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class AuthorizationScopeService {
  private readonly logger = new Logger(AuthorizationScopeService.name);

  /**
   * Returns a Prisma where clause to filter transactions based on user's authorized scopes.
   * Admins have access to everything (returns empty object).
   * WAREHOUSE and QC users are limited by their warehouseAccess list.
   * If they have no warehouseAccess mapped, they get a condition that resolves to nothing (e.g. processType: { in: [] })
   * resulting in empty results.
   */
  getTransactionScope(user: JwtPayloadUser): Prisma.TransactionWhereInput {
    // Admin, Security, and other high-level roles without strict object-level segmentation bypass this
    if (user.role === 'ADMIN' || user.role === 'SECURITY') {
      return {};
    }

    // WAREHOUSE and QC are strictly bound to their assigned process types (GBB, GBJ, GSP)
    if (user.role === 'WAREHOUSE' || user.role === 'QC') {
      const allowedProcesses = (user.warehouseAccess || []) as any[];
      return {
        processType: {
          in: allowedProcesses,
        },
      };
    }

    // Default deny for unknown roles that try to query segmented lists
    return {
      processType: {
        in: [],
      },
    };
  }
}
