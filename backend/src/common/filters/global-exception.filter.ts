import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Terjadi kesalahan pada server. Hubungi administrator.';
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let details: any = null;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse: any = exception.getResponse();

      // Custom message overriding
      if (statusCode === HttpStatus.BAD_REQUEST) {
        errorCode = 'BAD_REQUEST';
        if (typeof exceptionResponse === 'object' && exceptionResponse.message) {
          if (Array.isArray(exceptionResponse.message)) {
             message = 'Validasi data gagal. Periksa field yang wajib diisi.';
             errorCode = 'VALIDATION_ERROR';
             details = exceptionResponse.message;
          } else if (typeof exceptionResponse.message === 'string') {
             message = exceptionResponse.message;
          } else {
             message = 'Data yang diisi belum sesuai. Periksa kembali form.';
          }
        } else {
          message = 'Data yang diisi belum sesuai. Periksa kembali form.';
        }
      } else if (statusCode === HttpStatus.UNAUTHORIZED) {
        message = 'Sesi login sudah habis. Silakan login ulang.';
        errorCode = 'UNAUTHORIZED';
      } else if (statusCode === HttpStatus.FORBIDDEN) {
        message = 'Anda tidak memiliki akses ke halaman ini.';
        errorCode = 'FORBIDDEN';
      } else if (statusCode === HttpStatus.NOT_FOUND) {
        message = 'Data atau halaman tidak ditemukan.';
        errorCode = 'NOT_FOUND';
      } else if (statusCode === HttpStatus.CONFLICT) {
        message = 'Data sudah ada atau terjadi duplikasi.';
        errorCode = 'CONFLICT';
      } else if (statusCode === HttpStatus.UNPROCESSABLE_ENTITY) {
        message = 'Validasi data gagal. Periksa field yang wajib diisi.';
        errorCode = 'UNPROCESSABLE_ENTITY';
        if (typeof exceptionResponse === 'object' && exceptionResponse.message) {
           details = exceptionResponse.message;
        }
      } else if (statusCode === HttpStatus.BAD_GATEWAY) {
        message = 'Server backend tidak merespons. Pastikan backend aktif dan port API benar.';
        errorCode = 'BAD_GATEWAY';
      } else {
         if (typeof exceptionResponse === 'object' && exceptionResponse.message) {
           message = Array.isArray(exceptionResponse.message) ? exceptionResponse.message[0] : exceptionResponse.message;
         } else if (typeof exceptionResponse === 'string') {
           message = exceptionResponse;
         }
      }
    } else {
      // Prisma error mapping or other unknown errors
      const err = exception as any;
      if (err?.code) {
        if (err.code === 'P2002') {
          statusCode = HttpStatus.CONFLICT;
          message = 'Data sudah ada atau terjadi duplikasi.';
          errorCode = 'CONFLICT';
        }
      }
    }

    // Always log the actual technical error to the console
    this.logger.error(
      `[${request.method}] ${request.url} - ${statusCode} - ${errorCode}`,
      exception instanceof Error ? exception.stack : JSON.stringify(exception)
    );

    // Standardized consistent response format
    response.status(statusCode).json({
      success: false,
      statusCode,
      errorCode,
      message,
      details,
    });
  }
}
