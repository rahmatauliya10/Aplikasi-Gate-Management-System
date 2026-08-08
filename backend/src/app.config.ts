import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { json, urlencoded } from 'express';

export function configureApp(app: INestApplication) {
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
  const allowedOrigins = corsOrigin.split(',').map((o) => o.trim());

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      if (!isProduction) {
        if (allowedOrigins.includes('*')) {
          return callback(null, true);
        }
        if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          return callback(null, true);
        }
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
