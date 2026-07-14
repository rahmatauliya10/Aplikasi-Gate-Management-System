import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Security headers
  app.use(helmet());

  // Increase payload limit for base64 photo uploads
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // CORS
  const corsOrigin = process.env.CORS_ORIGIN;
  if (!corsOrigin) {
    throw new Error('CORS_ORIGIN environment variable is not defined.');
  }
  
  app.enableCors({
    origin: corsOrigin,
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

  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Gate Management System API')
      .setDescription('GMS Backend API Documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('Auth', 'Authentication & authorization endpoints')
      .addTag('Users', 'User management endpoints')
      .addTag('Gate', 'Gate check-in / check-out endpoints')
      .addTag('Weighbridge', 'Weighbridge operations')
      .addTag('Warehouse', 'Warehouse processing')
      .addTag('QC', 'Quality Control operations')
      .addTag('Dashboard', 'Dashboard statistics')
      .addTag('Reports', 'Reporting endpoints')
      .addTag('Settings', 'Application settings')
      .addTag('ActivityLogs', 'Activity log viewer')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, { 
      useGlobalPrefix: true,
      swaggerOptions: { persistAuthorization: true } });
  }

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`🚀 Application is running on: http://localhost:${port}/api`);
  if (process.env.NODE_ENV !== 'production') {
    logger.log(`📖 Swagger docs available at: http://localhost:${port}/api/docs`);
  }
}
bootstrap();
