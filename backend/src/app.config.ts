import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { json, urlencoded } from 'express';
import * as fs from 'fs';
import * as path from 'path';

export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: string[],
  isProduction: boolean,
): boolean {
  if (!origin) return true; // non-browser / same-origin requests
  if (allowedOrigins.includes(origin)) return true;
  return !isProduction && allowedOrigins.includes('*');
}

export function configureApp(app: INestApplication) {
  // Maintenance Mode Guard / Application Write Freeze Middleware (P0-06)
  app.use((req: any, res: any, next: any) => {
    const rootMaintFlag = path.resolve(process.cwd(), '../maintenance.flag');
    const localMaintFlag = path.resolve(process.cwd(), 'maintenance.flag');
    const rootMaintActive = path.resolve(
      process.cwd(),
      '../maintenance/active',
    );
    const localMaintActive = path.resolve(process.cwd(), 'maintenance/active');
    const isMaintenance =
      fs.existsSync(rootMaintFlag) ||
      fs.existsSync(localMaintFlag) ||
      fs.existsSync(rootMaintActive) ||
      fs.existsSync(localMaintActive);

    if (isMaintenance) {
      const readMethods = ['GET', 'HEAD', 'OPTIONS'];
      if (!readMethods.includes(req.method.toUpperCase())) {
        return res.status(503).json({
          success: false,
          statusCode: 503,
          code: 'MAINTENANCE_MODE',
          error: 'Service Unavailable',
          message: 'System is temporarily unavailable due to maintenance.',
          timestamp: new Date().toISOString(),
        });
      }
    }
    next();
  });

  // Trust proxy for Nginx reverse proxying
  try {
    const instance = app.getHttpAdapter().getInstance();
    if (instance && typeof instance.set === 'function') {
      instance.set('trust proxy', 1);
    }
  } catch (e) {
    // Non-express adapter fallback
  }

  // Global prefix
  app.setGlobalPrefix('api');

  // Security headers
  app.use(helmet());

  // Increase payload limit for base64 photo uploads
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // CORS Configuration - Strict in production, flexible in development
  const isProduction = process.env.NODE_ENV === 'production';
  const corsOrigin = process.env.CORS_ORIGIN || (isProduction ? '' : '*');
  const allowedOrigins = corsOrigin
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (isOriginAllowed(origin, allowedOrigins, isProduction)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'), false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Global validation pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global Exception Filter
  app.useGlobalFilters(new GlobalExceptionFilter());
}
