import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { configureApp } from './app.config';

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';
  const app = await NestFactory.create(AppModule, {
    logger: isProduction
      ? ['log', 'error', 'warn']
      : ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  const requiredEnvs = ['DATABASE_URL', 'JWT_REFRESH_SECRET', 'CORS_ORIGIN'];
  for (const env of requiredEnvs) {
    if (!process.env[env]) {
      throw new Error(`CRITICAL: Environment variable ${env} is missing.`);
    }
  }

  if (!process.env.JWT_ACCESS_SECRET) {
    throw new Error(
      `CRITICAL: Environment variable JWT_ACCESS_SECRET is missing.`,
    );
  }

  // Security Hardening: Enforce strong secrets in production mode
  if (isProduction) {
    const weakSecrets = [
      'super_secret_access_key_gms',
      'super_secret_refresh_key_gms',
      'postgres',
      'admin123',
      'secret',
    ];
    
    if (weakSecrets.includes(process.env.JWT_ACCESS_SECRET)) {
      throw new Error('CRITICAL SECURITY BLOCKER: Default JWT_ACCESS_SECRET is forbidden in production.');
    }
    if (weakSecrets.includes(process.env.JWT_REFRESH_SECRET || '')) {
      throw new Error('CRITICAL SECURITY BLOCKER: Default JWT_REFRESH_SECRET is forbidden in production.');
    }
    if ((process.env.JWT_ACCESS_SECRET || '').length < 32) {
      throw new Error('CRITICAL SECURITY BLOCKER: JWT_ACCESS_SECRET must be at least 32 characters long in production.');
    }
  }

  app.enableShutdownHooks();

  // Load shared application middlewares & configurations
  configureApp(app);

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
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`🚀 Application is running on: http://localhost:${port}/api`);
  if (process.env.NODE_ENV !== 'production') {
    logger.log(
      `📖 Swagger docs available at: http://localhost:${port}/api/docs`,
    );
  }
}

void bootstrap();
