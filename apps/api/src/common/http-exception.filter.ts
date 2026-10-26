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
    const details: { requestId: string | undefined; fullSlots?: number; requiredSlots?: number; recordId?: string } = { requestId: request.header('x-request-id') };
    if (code === 'SALA_CAPACITY_EXCEEDED_CONFIRMATION_REQUIRED' && typeof rawResponse === 'object' && rawResponse !== null && 'details' in rawResponse) {
      const capacity = rawResponse.details;
      if (typeof capacity === 'object' && capacity !== null && 'fullSlots' in capacity && 'requiredSlots' in capacity
        && typeof capacity.fullSlots === 'number' && typeof capacity.requiredSlots === 'number') {
        details.fullSlots = capacity.fullSlots;
        details.requiredSlots = capacity.requiredSlots;
      }
    }
    if (code === 'TRAINING_DUPLICATE' && typeof rawResponse === 'object' && rawResponse !== null && 'details' in rawResponse) {
      const training = rawResponse.details;
      if (typeof training === 'object' && training !== null && 'recordId' in training && typeof training.recordId === 'string') details.recordId = training.recordId;
    }
    response.status(statusCode).json({ statusCode, code, message, details });
  }
}
