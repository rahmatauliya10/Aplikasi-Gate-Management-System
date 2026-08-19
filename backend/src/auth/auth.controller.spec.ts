import { Test, TestingModule } from '@nestjs/testing';
import { AuthController, getRefreshCookieOptions } from './auth.controller';
import { AuthService } from './auth.service';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthController & Cookie Fail-Closed Security', () => {
  let controller: AuthController;
  let authService: any;

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
      logout: jest.fn(),
      refreshTokens: jest.fn(),
      getMe: jest.fn(),
      changePassword: jest.fn(),
      updateProfile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('getRefreshCookieOptions', () => {
    const originalEnv = process.env;

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('must ALWAYS enforce secure=true, sameSite=strict, httpOnly=true in production even if env vars try to downgrade', () => {
      process.env.COOKIE_SECURE = 'false';
      process.env.SAME_SITE = 'lax';
      const options = getRefreshCookieOptions('production');

      expect(options.httpOnly).toBe(true);
      expect(options.secure).toBe(true);
      expect(options.sameSite).toBe('strict');
      expect(options.path).toBe('/');
    });

    it('should respect development config when not in production', () => {
      process.env.COOKIE_SECURE = 'false';
      process.env.SAME_SITE = 'lax';
      const options = getRefreshCookieOptions('development');

      expect(options.httpOnly).toBe(true);
      expect(options.secure).toBe(false);
      expect(options.sameSite).toBe('lax');
      expect(options.path).toBe('/');
    });
  });

  describe('login', () => {
    it('should set refresh cookie and omit refreshToken from JSON response', async () => {
      const mockRes: any = {
        cookie: jest.fn(),
      };
      authService.login.mockResolvedValue({
        success: true,
        message: 'Login successful',
        data: {
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
          user: { id: 'usr-1', role: 'ADMIN' },
        },
      });

      const result = await controller.login(
        { identifier: 'admin@gms.local', password: 'Password123!' },
        mockRes,
      );

      expect(result.success).toBe(true);
      expect(result.data.accessToken).toBe('mock-access-token');
      expect((result.data as any).refreshToken).toBeUndefined();
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'mock-refresh-token',
        expect.objectContaining({
          httpOnly: true,
          path: '/',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        }),
      );
    });
  });

  describe('refresh', () => {
    it('should extract cookie, rotate refresh token, and return new access token', async () => {
      const mockReq: any = {
        headers: { cookie: 'refreshToken=old-refresh-token; other=1' },
      };
      const mockRes: any = {
        cookie: jest.fn(),
      };
      authService.refreshTokens.mockResolvedValue({
        success: true,
        message: 'Refreshed',
        data: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
        },
      });

      const result = await controller.refresh(mockReq, mockRes);
      expect(result.success).toBe(true);
      expect(result.data.accessToken).toBe('new-access-token');
      expect((result.data as any).refreshToken).toBeUndefined();
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'new-refresh-token',
        expect.objectContaining({ httpOnly: true, path: '/' }),
      );
    });

    it('should throw UnauthorizedException if refresh token is missing', async () => {
      const mockReq: any = { headers: {}, body: {} };
      const mockRes: any = { cookie: jest.fn() };

      await expect(controller.refresh(mockReq, mockRes)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('should clear refresh cookie and invoke authService.logout', async () => {
      const mockRes: any = {
        clearCookie: jest.fn(),
      };
      authService.logout.mockResolvedValue({
        success: true,
        message: 'Logged out',
      });

      const user: any = { id: 'usr-1', email: 'admin@gms.local' };
      const result = await controller.logout(user, mockRes);

      expect(mockRes.clearCookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.objectContaining({ httpOnly: true, path: '/' }),
      );
      expect(authService.logout).toHaveBeenCalledWith('usr-1');
      expect(result.success).toBe(true);
    });
  });
});
