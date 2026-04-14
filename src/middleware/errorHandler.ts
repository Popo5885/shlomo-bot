import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { db } from '../config/database.js';

/**
 * Global Express error handler.
 * Logs errors to system_error_logs and returns a safe response.
 */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      details: err.flatten().fieldErrors,
    });
    return;
  }

  // Known application errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
    });

    if (err.statusCode >= 500) {
      logErrorToDB(err, req).catch(() => {});
    }
    return;
  }

  // Unknown errors
  logger.error('Unhandled error:', err);
  logErrorToDB(err, req).catch(() => {});

  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
}

async function logErrorToDB(err: Error, req: Request): Promise<void> {
  try {
    await db('system_error_logs').insert({
      severity: 'ERROR',
      source: 'http_server',
      error_code: (err as AppError).code ?? 'UNHANDLED',
      message: err.message,
      stack_trace: err.stack,
      request_payload: {
        method: req.method,
        url: req.originalUrl,
        body: req.body,
      },
      metadata: {
        ip: req.ip,
        user_agent: req.get('user-agent'),
      },
    });
  } catch {
    logger.error('Failed to log error to DB');
  }
}
