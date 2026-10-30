import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';

jest.mock('argon2');

describe('AuthService Refresh Token Security & Rotation', () => {
  let service: AuthService;
  let prismaService: PrismaService;
  let jwtService: JwtService;

  beforeEach(async () => {
    process.env.JWT_ACCESS_SECRET =
      'a_secure_valid_test_access_secret_key_at_least_32_bytes_long_here_123';
    process.env.JWT_REFRESH_SECRET =
      'another_secure_distinct_test_refresh_secret_at_least_32_bytes_long_456';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
          },
        },
        {
          provide: JwtService,
          useValue: { verify: jest.fn(), sign: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('secret'),
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'JWT_ACCESS_EXPIRES_IN') return '1h';
              if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
              return 'secret';
            }),
          },
        },
        {
          provide: ActivityLogsService,
          useValue: { logAction: jest.fn().mockResolvedValue({}) },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
  });

  describe('Refresh Token Rotation and Replay Containment', () => {
    it('successfully rotates refresh token and issues new key pair', async () => {
      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: 'user-1',
        email: 'user@gms.local',
        role: 'QC',
      });

      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue({
        id: 'user-1',
        email: 'user@gms.local',
        username: 'user1',
        role: 'QC',
        name: 'QC Analyst',
        isActive: true,
        isDeleted: false,
        refreshTokenHash: '$argon2id$v=19$valid_hash',
        tokenVersion: 1,
        warehouseAccess: [],
      } as any);

      (argon2.verify as jest.Mock).mockResolvedValue(true);
      (argon2.hash as jest.Mock).mockResolvedValue(
        '$argon2id$v=19$new_hashed_token',
      );
      jest.spyOn(jwtService, 'sign').mockReturnValue('new-token-string');
      const updateSpy = jest
        .spyOn(prismaService.user, 'updateMany')
        .mockResolvedValue({ count: 1 });

      const result = await service.refreshTokens('valid-refresh-token');

      expect(result.data).toHaveProperty('accessToken');
      expect(result.data).toHaveProperty('refreshToken');
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: 'user-1', refreshTokenHash: '$argon2id$v=19$valid_hash' },
        data: expect.objectContaining({
          refreshTokenHash: '$argon2id$v=19$new_hashed_token',
        }),
      });
    });

    it('should invalidate all tokens on refresh token reuse attack (increment tokenVersion)', async () => {
      jest
        .spyOn(jwtService, 'verify')
        .mockReturnValue({ sub: 'user-1', email: 'test@local' });
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue({
        id: 'user-1',
        isActive: true,
        refreshTokenHash: 'stored-hash',
      } as any);

      // Simulate argon2 failing -> token reuse / replay attack detected
      (argon2.verify as jest.Mock).mockResolvedValue(false);
      const updateSpy = jest
        .spyOn(prismaService.user, 'update')
        .mockResolvedValue(null as any);

      await expect(service.refreshTokens('stolen-token')).rejects.toThrow(
        UnauthorizedException,
      );

      // Verify rotation security: it must nullify the stored hash and increment tokenVersion to revoke active access tokens
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          refreshTokenHash: null,
          tokenVersion: { increment: 1 },
        },
      });
    });

    it('rejects refresh attempt if user account is inactive', async () => {
      jest
        .spyOn(jwtService, 'verify')
        .mockReturnValue({ sub: 'user-inactive', email: 'inactive@local' });
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue({
        id: 'user-inactive',
        isActive: false, // Inactive account!
        refreshTokenHash: 'stored-hash',
      } as any);

      await expect(service.refreshTokens('some-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects refresh attempt if user has no stored refresh token (logged out)', async () => {
      jest
        .spyOn(jwtService, 'verify')
        .mockReturnValue({ sub: 'user-logged-out', email: 'out@local' });
      jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue({
        id: 'user-logged-out',
        isActive: true,
        refreshTokenHash: null, // Null hash -> already revoked
      } as any);

      await expect(service.refreshTokens('some-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects refresh attempt if token is expired or cryptographically invalid', async () => {
      jest.spyOn(jwtService, 'verify').mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.refreshTokens('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
