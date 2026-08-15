import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { AuthorizationScopeService } from './authorization-scope.service';

import { getJwtAccessSecret } from '../common/utils/jwt-secrets.util';

@Module({
  imports: [
    UsersModule,
    ActivityLogsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: getJwtAccessSecret(),
        signOptions: { expiresIn: config.get('JWT_ACCESS_EXPIRES_IN', '1h') },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, AuthorizationScopeService],
  exports: [AuthService, AuthorizationScopeService],
})
export class AuthModule {}
