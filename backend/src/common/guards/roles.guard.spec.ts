import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';

describe('RolesGuard RBAC', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    const mockPrisma: any = {};
    const mockActivityLogs: any = {
      logAction: jest.fn().mockResolvedValue(true),
    };
    guard = new RolesGuard(reflector, mockPrisma, mockActivityLogs);
  });

  it('should deny access if no user context', async () => {
    const mockContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ user: null }) }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(mockContext)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should allow access if no roles are required', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const mockContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ user: { role: 'QC' } }) }),
    } as unknown as ExecutionContext;

    expect(await guard.canActivate(mockContext)).toBe(true);
  });

  it('should deny access if user has wrong role', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    const mockContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: '1', role: 'QC', email: 'qc@test.com' },
          url: '/api',
          method: 'GET',
        }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(mockContext)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should allow access if user has required role', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN', 'QC']);
    const mockContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ user: { role: 'QC' } }) }),
    } as unknown as ExecutionContext;

    expect(await guard.canActivate(mockContext)).toBe(true);
  });
});
