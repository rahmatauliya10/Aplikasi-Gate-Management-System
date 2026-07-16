import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { json, urlencoded } from 'express';

export function configureApp(app: INestApplication) {
  // Global prefix
  app.setGlobalPrefix('api');

  // Security headers
  app.use(helmet());

  // Increase payload limit for base64 photo uploads
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // CORS
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:8081';
  const origins = corsOrigin.split(',').map((o) => o.trim());
  app.enableCors({
    origin: origins,
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
