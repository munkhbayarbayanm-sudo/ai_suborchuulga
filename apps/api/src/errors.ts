import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { AppError, errorDiagnostics } from '@mongolsub/domain';
import { Prisma } from '@mongolsub/database';
@Catch()
export class ApiErrors implements ExceptionFilter {
  private readonly logger = new Logger('ApiErrors');
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) return;
    if (error instanceof AppError) { response.status(error.statusCode).json({ code: error.code, message: error.message }); return; }
    if (error instanceof ZodError) { response.status(400).json({ code: 'INVALID_REQUEST', message: error.issues.map(i => `${i.path.join('.') || 'Request'}: ${i.message}`).join('; ') }); return; }
    if (error instanceof HttpException) { const status = error.getStatus(); response.status(status).json({ code: status === 404 ? 'NOT_FOUND' : 'INVALID_REQUEST', message: status === 404 ? 'Endpoint not found.' : 'The request is malformed.' }); return; }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') { response.status(404).json({ code: 'NOT_FOUND', message: 'The requested record no longer exists.' }); return; }
    // Do not log connection URLs, upload content, or raw database exceptions.
    this.logger.error(JSON.stringify({ event: 'request_failed', diagnostics: errorDiagnostics(error) }));
    response.status(503).json({ code: 'SERVICE_UNAVAILABLE', message: 'The operation could not be completed. Check service readiness and try again.' });
  }
}
