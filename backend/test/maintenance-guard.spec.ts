import * as fs from 'fs';
import * as path from 'path';
import { configureApp } from '../src/app.config';

describe('Maintenance Mode Guard & Write Freeze Gate (P0-06)', () => {
  const rootMaintFlag = path.resolve(process.cwd(), '../maintenance.flag');
  const localMaintFlag = path.resolve(process.cwd(), 'maintenance.flag');
  const rootMaintActive = path.resolve(process.cwd(), '../maintenance/active');
  const localMaintActive = path.resolve(process.cwd(), 'maintenance/active');

  afterEach(() => {
    // Clean up any test maintenance flags
    [rootMaintFlag, localMaintFlag, rootMaintActive, localMaintActive].forEach(
      (f) => {
        if (fs.existsSync(f)) {
          try {
            fs.unlinkSync(f);
          } catch (e) {
            // Ignore cleanup errors during test teardown
          }
        }
      },
    );
  });

  function createMockApp() {
    const middlewares: Array<(req: any, res: any, next: any) => void> = [];
    const mockApp: any = {
      use: jest.fn((fn) => {
        if (typeof fn === 'function') {
          middlewares.push(fn);
        }
      }),
      setGlobalPrefix: jest.fn(),
      enableCors: jest.fn(),
      useGlobalPipes: jest.fn(),
      useGlobalFilters: jest.fn(),
      getHttpAdapter: jest.fn(() => ({
        getInstance: jest.fn(() => ({
          set: jest.fn(),
        })),
      })),
    };

    configureApp(mockApp);
    return middlewares[0];
  }

  it('should allow GET requests when maintenance mode is active', () => {
    const maintMiddleware = createMockApp();

    // Create active maintenance marker
    const maintDir = path.resolve(process.cwd(), 'maintenance');
    if (!fs.existsSync(maintDir)) {
      fs.mkdirSync(maintDir, { recursive: true });
    }
    fs.writeFileSync(localMaintActive, 'MAINTENANCE_ACTIVE_TEST', 'utf8');

    const req: any = { method: 'GET', url: '/api/transactions' };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    maintMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should reject POST write requests with 503 and MAINTENANCE_MODE code during maintenance', () => {
    const maintMiddleware = createMockApp();

    const maintDir = path.resolve(process.cwd(), 'maintenance');
    if (!fs.existsSync(maintDir)) {
      fs.mkdirSync(maintDir, { recursive: true });
    }
    fs.writeFileSync(localMaintActive, 'MAINTENANCE_ACTIVE_TEST', 'utf8');

    const req: any = {
      method: 'POST',
      url: '/api/gate/check-in',
      body: { driverName: 'Test' },
    };
    let jsonResult: any = null;
    const res: any = {
      status: jest.fn().mockImplementation((code) => {
        expect(code).toBe(503);
        return {
          json: jest.fn().mockImplementation((body) => {
            jsonResult = body;
          }),
        };
      }),
    };
    const next = jest.fn();

    maintMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(jsonResult).toBeDefined();
    expect(jsonResult.success).toBe(false);
    expect(jsonResult.statusCode).toBe(503);
    expect(jsonResult.code).toBe('MAINTENANCE_MODE');
    expect(jsonResult.message).toContain(
      'System is temporarily unavailable due to maintenance.',
    );
  });

  it('should reject PUT and DELETE write requests with 503 during maintenance', () => {
    const maintMiddleware = createMockApp();

    fs.writeFileSync(localMaintFlag, 'MAINTENANCE_ACTIVE_TEST', 'utf8');

    ['PUT', 'PATCH', 'DELETE'].forEach((method) => {
      const req: any = { method, url: '/api/transactions/1' };
      const res: any = {
        status: jest.fn().mockReturnValue({
          json: jest.fn(),
        }),
      };
      const next = jest.fn();

      maintMiddleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  it('should allow all HTTP methods when maintenance mode is inactive', () => {
    const maintMiddleware = createMockApp();

    ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].forEach((method) => {
      const req: any = { method, url: '/api/transactions' };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      maintMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
