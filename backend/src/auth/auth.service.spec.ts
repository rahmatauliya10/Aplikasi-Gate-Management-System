import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';

jest.mock('argon2');

describe('AuthService Refresh Token Rotation', () => {
  let service: AuthService;
  let prismaService: PrismaService;
  let jwtService: JwtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: jest.fn(), update: jest.fn() },
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
            get: jest.fn(),
          },
        },
        {
          provide: ActivityLogsService,
          useValue: { logAction: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should invalidate all tokens on refresh token reuse attack', async () => {
    jest
      .spyOn(jwtService, 'verify')
      .mockReturnValue({ sub: 'user-1', email: 'test@local' });
    jest.spyOn(prismaService.user, 'findUnique').mockResolvedValue({
      id: 'user-1',
      isActive: true,
      refreshTokenHash: 'stored-hash',
    } as any);

    // Simulate argon2 failing -> meaning the token was already used (reuse attack)
    (argon2.verify as jest.Mock).mockResolvedValue(false);
    const updateSpy = jest
      .spyOn(prismaService.user, 'update')
      .mockResolvedValue(null as any);

    await expect(service.refreshTokens('stolen-token')).rejects.toThrow(
      UnauthorizedException,
    );

    // Verify rotation security: it must nullify the stored hash
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { refreshTokenHash: null },
    });
  });
});
