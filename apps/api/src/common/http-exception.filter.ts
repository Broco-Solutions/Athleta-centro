import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const rawResponse = isHttpException ? exception.getResponse() : undefined;
    const message = typeof rawResponse === 'object' && rawResponse !== null && 'message' in rawResponse
      ? String(rawResponse.message) : isHttpException ? exception.message : 'Internal server error';
    const code = typeof rawResponse === 'object' && rawResponse !== null && 'code' in rawResponse
      ? String(rawResponse.code)
      : statusCode === 400 ? 'VALIDATION_ERROR' : statusCode === 429 ? 'RATE_LIMIT_EXCEEDED' : statusCode === 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR';
    response.status(statusCode).json({ statusCode, code, message, details: { requestId: request.header('x-request-id') } });
  }
}
