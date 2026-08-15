import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class AuthorizationScopeService {
  private readonly logger = new Logger(AuthorizationScopeService.name);

  /**
   * Asserts that a WAREHOUSE or QC user has at least one assigned process scope.
   * Throws 403 Forbidden if scope is empty.
   */
  assertScopeNotEmpty(user: JwtPayloadUser): void {
    if (user.role === 'ADMIN' || user.role === 'SECURITY') {
      return;
    }

    if (user.role === 'WAREHOUSE' || user.role === 'QC') {
      const allowed = user.warehouseAccess || [];
      if (allowed.length === 0) {
        throw new ForbiddenException({
          success: false,
          message: `Akses ditolak: Akun ${user.role} Anda belum memiliki scope proses/gudang yang valid.`,
          errors: [],
        });
      }
    }
  }

  /**
   * Asserts that user has explicit access to the target processType (GBB, GBJ, GSP).
   * Throws 403 Forbidden if unauthorized or scope empty.
   */
  assertProcessAccess(user: JwtPayloadUser, processType: string): void {
    if (user.role === 'ADMIN' || user.role === 'SECURITY') {
      return;
    }

    if (user.role === 'WAREHOUSE' || user.role === 'QC') {
      const allowed = user.warehouseAccess || [];
      if (allowed.length === 0) {
        throw new ForbiddenException({
          success: false,
          message: `Akses ditolak: Akun ${user.role} Anda belum memiliki scope proses/gudang yang valid.`,
          errors: [],
        });
      }

      if (!allowed.includes(processType)) {
        throw new ForbiddenException({
          success: false,
          message: `Akses ditolak: Anda tidak memiliki otoritas scope proses ${processType}.`,
          errors: [],
        });
      }
    }
  }

  /**
   * Returns a Prisma where clause to filter transactions based on user's authorized scopes.
   * Admins and Security have access to everything (returns empty object).
   * WAREHOUSE and QC users are limited by their warehouseAccess list.
   */
  getTransactionScope(user: JwtPayloadUser): Prisma.TransactionWhereInput {
    this.assertScopeNotEmpty(user);

    if (user.role === 'ADMIN' || user.role === 'SECURITY') {
      return {};
    }

    if (user.role === 'WAREHOUSE' || user.role === 'QC') {
      const allowedProcesses = (user.warehouseAccess || []) as any[];
      return {
        processType: {
          in: allowedProcesses,
        },
      };
    }

    return {
      processType: {
        in: [],
      },
    };
  }
}
