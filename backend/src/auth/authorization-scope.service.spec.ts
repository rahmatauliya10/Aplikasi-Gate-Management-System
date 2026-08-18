import { ForbiddenException } from '@nestjs/common';
import { AuthorizationScopeService } from './authorization-scope.service';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';

describe('AuthorizationScopeService', () => {
  let service: AuthorizationScopeService;

  beforeEach(() => {
    service = new AuthorizationScopeService();
  });

  describe('assertScopeNotEmpty', () => {
    it('should allow ADMIN without checking warehouseAccess', () => {
      const adminUser: JwtPayloadUser = {
        userId: 'admin-1',
        username: 'admin',
        role: 'ADMIN',
        warehouseAccess: [],
      };
      expect(() => service.assertScopeNotEmpty(adminUser)).not.toThrow();
    });

    it('should allow SECURITY without checking warehouseAccess', () => {
      const secUser: JwtPayloadUser = {
        userId: 'sec-1',
        username: 'security',
        role: 'SECURITY',
        warehouseAccess: [],
      };
      expect(() => service.assertScopeNotEmpty(secUser)).not.toThrow();
    });

    it('should allow QC user with valid warehouseAccess list', () => {
      const qcUser: JwtPayloadUser = {
        userId: 'qc-1',
        username: 'qc_inspector',
        role: 'QC',
        warehouseAccess: ['GBB', 'GSP'],
      };
      expect(() => service.assertScopeNotEmpty(qcUser)).not.toThrow();
    });

    it('should throw ForbiddenException for QC user with empty warehouseAccess', () => {
      const qcUser: JwtPayloadUser = {
        userId: 'qc-1',
        username: 'qc_inspector',
        role: 'QC',
        warehouseAccess: [],
      };
      expect(() => service.assertScopeNotEmpty(qcUser)).toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException for WAREHOUSE user with undefined warehouseAccess', () => {
      const whUser: JwtPayloadUser = {
        userId: 'wh-1',
        username: 'warehouse_staff',
        role: 'WAREHOUSE',
        warehouseAccess: undefined as any,
      };
      expect(() => service.assertScopeNotEmpty(whUser)).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('assertProcessAccess', () => {
    it('should allow ADMIN to access any processType', () => {
      const admin: JwtPayloadUser = {
        userId: 'admin-1',
        username: 'admin',
        role: 'ADMIN',
      };
      expect(() => service.assertProcessAccess(admin, 'GBB')).not.toThrow();
      expect(() => service.assertProcessAccess(admin, 'GBJ')).not.toThrow();
    });

    it('should allow QC user to access assigned processType', () => {
      const qcUser: JwtPayloadUser = {
        userId: 'qc-1',
        username: 'qc_inspector',
        role: 'QC',
        warehouseAccess: ['GBB'],
      };
      expect(() => service.assertProcessAccess(qcUser, 'GBB')).not.toThrow();
    });

    it('should throw ForbiddenException for QC user trying to access unassigned processType', () => {
      const qcUser: JwtPayloadUser = {
        userId: 'qc-1',
        username: 'qc_inspector',
        role: 'QC',
        warehouseAccess: ['GBB'],
      };
      expect(() => service.assertProcessAccess(qcUser, 'GSP')).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getTransactionScope', () => {
    it('should return empty where clause for ADMIN (all records accessible)', () => {
      const admin: JwtPayloadUser = {
        userId: 'admin-1',
        username: 'admin',
        role: 'ADMIN',
      };
      const scope = service.getTransactionScope(admin);
      expect(scope).toEqual({});
    });

    it('should return processType in allowedProcesses for WAREHOUSE', () => {
      const whUser: JwtPayloadUser = {
        userId: 'wh-1',
        username: 'warehouse_staff',
        role: 'WAREHOUSE',
        warehouseAccess: ['GBB', 'GBJ'],
      };
      const scope = service.getTransactionScope(whUser);
      expect(scope).toEqual({
        processType: {
          in: ['GBB', 'GBJ'],
        },
      });
    });
  });
});
