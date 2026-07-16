import {
  Injectable,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_ALLOW_MUST_CHANGE_PASSWORD_KEY } from '../decorators/allow-must-change-password.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Add context to the request for handleRequest
    const request = context.switchToHttp().getRequest();
    request.context = context;
    return super.canActivate(context);
  }

  handleRequest(
    err: any,
    user: any,
    info: any,
    context: ExecutionContext,
    status?: any,
  ) {
    if (err || !user) {
      throw err || new UnauthorizedException('Authentication failed');
    }

    if (user.mustChangePassword) {
      const req = context.switchToHttp().getRequest();
      const ctx = req.context || context;

      const isAllowed = this.reflector.getAllAndOverride<boolean>(
        IS_ALLOW_MUST_CHANGE_PASSWORD_KEY,
        [ctx.getHandler(), ctx.getClass()],
      );

      if (!isAllowed) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'PASSWORD_CHANGE_REQUIRED',
          message:
            'Anda wajib mengganti temporary password sebelum menggunakan aplikasi.',
        });
      }
    }

    return user;
  }
}
