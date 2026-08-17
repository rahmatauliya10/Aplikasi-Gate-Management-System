import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Terjadi kesalahan pada server. Hubungi administrator.';
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let details: any = null;

    const requestId = `REQ-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse: any = exception.getResponse();

      // For 5xx Server Errors: NEVER leak internal details/traces to the client
      if (statusCode >= (HttpStatus.INTERNAL_SERVER_ERROR as number)) {
        const errStack =
          exception.stack || JSON.stringify(exception);
        this.logger.error(
          `[${request.method}] ${request.url} - ${statusCode} - RequestID: ${requestId}`,
          errStack,
        );
        response.status(statusCode).json({
          success: false,
          statusCode,
          errorCode: 'INTERNAL_SERVER_ERROR',
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Terjadi kesalahan pada server. Hubungi administrator.',
          requestId,
        });
        return;
      }

      // Extract custom error code and message if provided for client 4xx errors
      if (exceptionResponse && typeof exceptionResponse === 'object') {
        if (exceptionResponse.code) errorCode = exceptionResponse.code;
        if (exceptionResponse.errorCode)
          errorCode = exceptionResponse.errorCode;
        if (
          exceptionResponse.message &&
          typeof exceptionResponse.message === 'string'
        ) {
          message = exceptionResponse.message;
        }
      }

      // Custom message overriding if not custom defined
      if (statusCode === (HttpStatus.BAD_REQUEST as number)) {
        if (errorCode === 'INTERNAL_SERVER_ERROR') errorCode = 'BAD_REQUEST';
        if (
          typeof exceptionResponse === 'object' &&
          exceptionResponse.message
        ) {
          if (Array.isArray(exceptionResponse.message)) {
            message = 'Validasi data gagal. Periksa field yang wajib diisi.';
            errorCode = 'VALIDATION_ERROR';
            details = exceptionResponse.message;
          } else if (
            message === 'Terjadi kesalahan pada server. Hubungi administrator.'
          ) {
            message = exceptionResponse.message;
          }
        }
      } else if (statusCode === (HttpStatus.UNAUTHORIZED as number)) {
        if (
          message === 'Terjadi kesalahan pada server. Hubungi administrator.'
        ) {
          message = 'Sesi login sudah habis. Silakan login ulang.';
        }
        if (errorCode === 'INTERNAL_SERVER_ERROR') errorCode = 'UNAUTHORIZED';
      } else if (statusCode === (HttpStatus.FORBIDDEN as number)) {
        if (
          message === 'Terjadi kesalahan pada server. Hubungi administrator.'
        ) {
          message = 'Anda tidak memiliki akses ke halaman ini.';
        }
        if (errorCode === 'INTERNAL_SERVER_ERROR') errorCode = 'FORBIDDEN';
      } else if (statusCode === (HttpStatus.NOT_FOUND as number)) {
        if (
          message === 'Terjadi kesalahan pada server. Hubungi administrator.'
        ) {
          message = 'Data atau halaman tidak ditemukan.';
        }
        if (errorCode === 'INTERNAL_SERVER_ERROR') errorCode = 'NOT_FOUND';
      } else if (statusCode === (HttpStatus.CONFLICT as number)) {
        if (
          message === 'Terjadi kesalahan pada server. Hubungi administrator.'
        ) {
          message = 'Data sudah ada atau terjadi duplikasi.';
        }
        if (errorCode === 'INTERNAL_SERVER_ERROR') errorCode = 'CONFLICT';
      } else if (statusCode === (HttpStatus.UNPROCESSABLE_ENTITY as number)) {
        if (
          message === 'Terjadi kesalahan pada server. Hubungi administrator.'
        ) {
          message = 'Validasi data gagal. Periksa field yang wajib diisi.';
        }
        if (errorCode === 'INTERNAL_SERVER_ERROR')
          errorCode = 'UNPROCESSABLE_ENTITY';
        if (
          typeof exceptionResponse === 'object' &&
          exceptionResponse.message
        ) {
          details = exceptionResponse.message;
        }
      } else if (statusCode === (HttpStatus.BAD_GATEWAY as number)) {
        if (
          message === 'Terjadi kesalahan pada server. Hubungi administrator.'
        ) {
          message =
            'Server backend tidak merespons. Pastikan backend aktif dan port API benar.';
        }
        if (errorCode === 'INTERNAL_SERVER_ERROR') errorCode = 'BAD_GATEWAY';
      } else {
        if (
          message === 'Terjadi kesalahan pada server. Hubungi administrator.'
        ) {
          if (
            typeof exceptionResponse === 'object' &&
            exceptionResponse.message
          ) {
            message = Array.isArray(exceptionResponse.message)
              ? exceptionResponse.message[0]
              : exceptionResponse.message;
          } else if (typeof exceptionResponse === 'string') {
            message = exceptionResponse;
          }
        }
      }
    } else {
      // Prisma error mapping or other unknown errors (non-HttpException => 500)
      const err = exception as any;
      if (err?.code) {
        if (err.code === 'P2002') {
          statusCode = HttpStatus.CONFLICT;
          message = 'Data sudah ada atau terjadi duplikasi.';
          errorCode = 'CONFLICT';
        }
      }

      // If unhandled error resulted in 500, sanitize output
      if (statusCode >= (HttpStatus.INTERNAL_SERVER_ERROR as number)) {
        const unhandledStack =
          exception instanceof Error
            ? exception.stack
            : JSON.stringify(exception);
        this.logger.error(
          `[${request.method}] ${request.url} - ${statusCode} - UnhandledException - RequestID: ${requestId}`,
          unhandledStack,
        );
        response.status(statusCode).json({
          success: false,
          statusCode,
          errorCode: 'INTERNAL_SERVER_ERROR',
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Terjadi kesalahan pada server. Hubungi administrator.',
          requestId,
        });
        return;
      }
    }

    const logStack =
      exception instanceof Error ? exception.stack : JSON.stringify(exception);
    this.logger.error(
      `[${request.method}] ${request.url} - ${statusCode} - ${errorCode} - RequestID: ${requestId}`,
      logStack,
    );

    // Standardized consistent response format (mapping both code and errorCode)
    response.status(statusCode).json({
      success: false,
      statusCode,
      errorCode,
      code: errorCode,
      message,
      details,
      requestId,
    });
  }
}
