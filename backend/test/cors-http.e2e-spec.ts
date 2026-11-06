import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Controller, Get } from '@nestjs/common';
import request from 'supertest';
import { configureApp } from '../src/app.config';

@Controller('test-cors')
class TestCorsController {
  @Get('ping')
  ping() {
    return { status: 'pong' };
  }
}

describe('CORS HTTP Layer Verification (e2e)', () => {
  let app: INestApplication;
  const originalEnv = process.env.NODE_ENV;
  const originalCors = process.env.CORS_ORIGIN;

  beforeAll(async () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN =
      'http://10.13.14.36:8081,http://localhost:8081,https://gms.plant.local';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TestCorsController],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    process.env.NODE_ENV = originalEnv;
    process.env.CORS_ORIGIN = originalCors;
    if (app) {
      await app.close();
    }
  });

  describe('OPTIONS Preflight Handling in Production', () => {
    it('accepts explicitly listed LAN origin with credentials', async () => {
      const res = await request(app.getHttpServer())
        .options('/api/test-cors/ping')
        .set('Origin', 'http://10.13.14.36:8081')
        .set('Access-Control-Request-Method', 'GET');

      expect(res.headers['access-control-allow-origin']).toBe(
        'http://10.13.14.36:8081',
      );
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('accepts explicitly listed localhost origin', async () => {
      const res = await request(app.getHttpServer())
        .options('/api/test-cors/ping')
        .set('Origin', 'http://localhost:8081')
        .set('Access-Control-Request-Method', 'GET');

      expect(res.headers['access-control-allow-origin']).toBe(
        'http://localhost:8081',
      );
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('rejects unlisted LAN origin', async () => {
      const res = await request(app.getHttpServer())
        .options('/api/test-cors/ping')
        .set('Origin', 'http://10.13.14.99:8081')
        .set('Access-Control-Request-Method', 'GET');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('rejects unlisted port on allowed IP', async () => {
      const res = await request(app.getHttpServer())
        .options('/api/test-cors/ping')
        .set('Origin', 'http://10.13.14.36:9999')
        .set('Access-Control-Request-Method', 'GET');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('rejects external unauthorized origin', async () => {
      const res = await request(app.getHttpServer())
        .options('/api/test-cors/ping')
        .set('Origin', 'https://evil-attacker.example.com')
        .set('Access-Control-Request-Method', 'GET');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Actual GET Request Handling', () => {
    it('allows non-browser requests without Origin header', async () => {
      const res = await request(app.getHttpServer()).get('/api/test-cors/ping');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'pong' });
    });

    it('returns allow-origin header for valid browser origin', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/test-cors/ping')
        .set('Origin', 'https://gms.plant.local');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe(
        'https://gms.plant.local',
      );
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });
  });
});
