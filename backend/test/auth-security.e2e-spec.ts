import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
const request = require('supertest');
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { configureApp } from './../src/app.config';

describe('Auth Security (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    // Note: E2E tests should be run with a separate DATABASE_URL_TEST
    // to avoid wiping out operational database data.
    if (!process.env.DATABASE_URL_TEST) {
      throw new Error(
        'DATABASE_URL_TEST environment variable is required for E2E tests',
      );
    }
    if (!process.env.DATABASE_URL_TEST.includes('_test')) {
      throw new Error('DATABASE_URL_TEST database name must end with _test');
    }
    process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Account Lifecycle & Password Security Scenarios', () => {
    let adminToken: string;
    let testUserId: string;
    let temporaryPassword = '';

    beforeAll(async () => {
      // Clean up previous test runs safely
      await prisma.user.deleteMany({ where: { username: 'test_sec_user' } });

      // 1. Create a test admin for reset operations (if doesn't exist)
      // Alternatively, assuming an admin exists or we can create a temporary one.
      const admin = await prisma.user.upsert({
        where: { username: 'admin_test_sec' },
        update: {},
        create: {
          email: 'admin_sec@gms.local',
          username: 'admin_test_sec',
          passwordHash: 'dummy_hash', // will not login via UI for this test, we can mock token if needed
          name: 'Admin Test Security',
          role: 'ADMIN',
          isActive: true,
        },
      });

      // Let's create a regular user to test with directly
      const user = await prisma.user.create({
        data: {
          email: 'test_sec@gms.local',
          username: 'test_sec_user',
          passwordHash: 'dummy_hash',
          name: 'Test Security',
          role: 'SECURITY',
          isActive: true,
        },
      });
      testUserId = user.id;

      // Mock admin token for testing reset
      const jwtService = new JwtService({
        secret: process.env.JWT_ACCESS_SECRET,
      });
      adminToken = jwtService.sign({
        sub: admin.id,
        email: admin.email,
        role: admin.role,
        tv: admin.tokenVersion,
      });
    });

    it('should reset password via admin and set mustChangePassword=true', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/users/${testUserId}/reset-password`) // Assuming this is the endpoint
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.temporaryPassword).toBeDefined();
      temporaryPassword = res.body.data.temporaryPassword;

      // Check DB
      const dbUser = await prisma.user.findUnique({
        where: { id: testUserId },
      });
      expect(dbUser).toBeDefined();
      expect(dbUser!.mustChangePassword).toBe(true);
      expect(dbUser!.temporaryPasswordExpiresAt).toBeDefined();
    });

    let userAccessToken: string;
    let userRefreshToken: string;

    it('should login with temporary password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ identifier: 'test_sec_user', password: temporaryPassword })
        .expect(200);

      expect(res.body.data.mustChangePassword).toBe(true);
      userAccessToken = res.body.data.accessToken;

      const cookies = res.headers['set-cookie'] || [];
      const refreshCookie = cookies.find((c: string) =>
        c.startsWith('refreshToken='),
      );
      if (refreshCookie) {
        userRefreshToken = refreshCookie.split(';')[0].split('=')[1];
      }
    });

    it('should deny business endpoint access when forced-password is true', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users') // A typical business endpoint
        .set('Authorization', `Bearer ${userAccessToken}`)
        .expect(403);

      expect(res.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    });

    it('should allow /auth/me when forced-password is true', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .expect(200);
    });

    it('should allow /auth/change-password when forced-password is true', async () => {
      // Just check if it's reachable (we'll provide bad data first to ensure it hits the controller, not 403)
      const res = await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .send({})
        .expect(400); // Bad request means it passed the guard
    });

    it('should reject new password matching old password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .send({
          currentPassword: temporaryPassword,
          newPassword: temporaryPassword,
          confirmPassword: temporaryPassword,
        })
        .expect(400);

      expect(res.body.message).toContain('sama dengan password lama');
    });

    it('should successfully change password and set mustChangePassword=false', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .send({
          currentPassword: temporaryPassword,
          newPassword: 'NewSecurePassword123!',
          confirmPassword: 'NewSecurePassword123!',
        })
        .expect(200);

      expect(res.body.success).toBe(true);

      // Check DB
      const dbUser = await prisma.user.findUnique({
        where: { id: testUserId },
      });
      expect(dbUser).toBeDefined();
      expect(dbUser!.mustChangePassword).toBe(false);
      expect(dbUser!.temporaryPasswordExpiresAt).toBeNull();
    });

    it('should deny old access token due to tokenVersion increment', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${userAccessToken}`)
        .expect(401);

      expect(res.body.message).toContain('revoked');
    });

    it('should deny old refresh token due to hash reset', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', [`refreshToken=${userRefreshToken}`])
        .expect(401);
    });
  });
});
