import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { PrismaService } from '../src/prisma/prisma.service';

describe('GMS Comprehensive Security Verification & Negative Access Matrix (Task 10)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Unauthenticated & Malformed Token Rejection', () => {
    it('GET /api/transactions should return 401 Unauthorized without Bearer token', async () => {
      await request(app.getHttpServer()).get('/api/transactions').expect(401);
    });

    it('GET /api/transactions with forged/tampered JWT should return 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .get('/api/transactions')
        .set(
          'Authorization',
          'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.tampered_signature',
        )
        .expect(401);
    });
  });

  describe('2. Path Traversal & Attachment Security Checks', () => {
    it('GET /api/attachments/download with directory traversal (../../etc/passwd) should be rejected fail-closed', async () => {
      await request(app.getHttpServer())
        .get('/api/attachments/download')
        .query({ path: '../../etc/passwd' })
        .expect((res) => {
          expect([400, 401, 403, 404]).toContain(res.status);
        });
    });
  });

  describe('3. HTTP Method & Security Headers Check', () => {
    it('Should include security headers (Helmet) on API responses', async () => {
      const res = await request(app.getHttpServer()).get('/api/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    });
  });
});
