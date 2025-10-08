/**
 * Enhanced error handling middleware with comprehensive error processing
 * Integrates custom errors, circuit breakers, retry logic, and graceful degradation
 */

import { Request, Response, NextFunction } from 'express';
import {
  BaseError,
  isBaseError,
  isOperationalError,
  NetworkError,
  TimeoutError,
  AzureOpenAIError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  RateLimitError,
  CircuitBreakerError,
  ServiceUnavailableError,
  InternalServerError,
} from '../errors/index.js';
import { logger } from './logging.js';
import { healthMonitor } from '../monitoring/health-monitor.js';
import { gracefulDegradationManager } from '../resilience/graceful-degradation.js';
import type {
  RequestWithCorrelationId,
  ErrorResponse,
} from '../types/index.js';

export interface ErrorHandlerConfig {
  readonly exposeStackTrace: boolean;
  readonly logErrors: boolean;
  readonly enableGracefulDegradation: boolean;
  readonly enableHealthMonitoring: boolean;
}

export interface ErrorContext {
  readonly correlationId: string;
  readonly operation?: string;
  readonly userAgent?: string;
  readonly ip?: string;
  readonly method: string;
  readonly url: string;
  readonly timestamp: Date;
}

/**
 * Enhanced error handler class
 */
export class EnhancedErrorHandler {
  private readonly config: ErrorHandlerConfig;

  constructor(config: Partial<ErrorHandlerConfig> = {}) {
    this.config = {
      exposeStackTrace: process.env.NODE_ENV === 'development',
      logErrors: true,
      enableGracefulDegradation: true,
      enableHealthMonitoring: true,
      ...config,
    };
  }

  /**
   * Main error handling middleware
   */
  public handleError = async (
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const context = this.createErrorContext(req);

    try {
      // Log the error
      if (this.config.logErrors) {
        await this.logError(error, context);
      }

      // Check if response was already sent
      if (res.headersSent) {
        return next(error);
      }

      // Handle different error types
      const errorResponse = await this.processError(error, context);

      // Send error response
      res.status(errorResponse.statusCode).json(errorResponse.body);

      // Trigger health monitoring alerts if enabled
      if (
        this.config.enableHealthMonitoring &&
        this.shouldTriggerAlert(error)
      ) {
        await this.triggerHealthAlert(error, context);
      }

      // Auto-adjust service level based on error patterns
      if (this.config.enableGracefulDegradation) {
        this.adjustServiceLevel(error, context);
      }
    } catch (handlingError) {
      // Error occurred while handling the original error
      logger.critical(
        'Error handler failed',
        context.correlationId,
        {
          originalError: error.message,
          handlingError:
            handlingError instanceof Error
              ? handlingError.message
              : 'Unknown error',
        },
        handlingError as Error
      );

      // Send minimal error response
      if (!res.headersSent) {
        res.status(500).json({
          error: {
            type: 'internal_server_error',
            message: 'An unexpected error occurred',
            correlationId: context.correlationId,
          },
        });
      }
    }
  };

  /**
   * Create error context from request
   */
  private createErrorContext(req: Request): ErrorContext {
    const correlationId =
      (req as RequestWithCorrelationId).correlationId || 'unknown';

    return {
      correlationId,
      operation: req.route?.path,
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.connection.remoteAddress,
      method: req.method,
      url: req.originalUrl,
      timestamp: new Date(),
    };
  }

  /**
   * Log error with appropriate level and context
   */
  private async logError(error: Error, context: ErrorContext): Promise<void> {
    const metadata = {
      operation: context.operation,
      method: context.method,
      url: context.url,
      userAgent: context.userAgent,
      ip: context.ip,
    };

    if (isBaseError(error)) {
      // Use appropriate log level based on error type
      const logLevel = this.getLogLevel(error);

      if (logLevel === 'critical') {
        logger.critical(error.message, context.correlationId, metadata, error);
      } else if (logLevel === 'error') {
        logger.error(error.message, context.correlationId, metadata, error);
      } else {
        logger.warn(error.message, context.correlationId, metadata);
      }
    } else {
      // Unknown error type
      logger.error(
        `Unhandled error: ${error.message}`,
        context.correlationId,
        metadata,
        error
      );
    }
  }

  /**
   * Get appropriate log level for error
   */
  private getLogLevel(error: BaseError): 'warn' | 'error' | 'critical' {
    if (!error.isOperational) {
      return 'critical';
    }

    if (
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError ||
      error instanceof ValidationError ||
      error instanceof RateLimitError
    ) {
      return 'warn';
    }

    if (
      error instanceof CircuitBreakerError ||
      error instanceof ServiceUnavailableError
    ) {
      return 'error';
    }

    return 'error';
  }

  /**
   * Process error and create appropriate response
   */
  private async processError(
    error: Error,
    context: ErrorContext
  ): Promise<{ statusCode: number; body: ErrorResponse }> {
    // Handle BaseError instances
    if (isBaseError(error)) {
      return this.handleBaseError(error, context);
    }

    // Handle known Node.js errors
    if (this.isKnownNodeError(error)) {
      return this.handleNodeError(error, context);
    }

    // Handle unknown errors
    return this.handleUnknownError(error, context);
  }

  /**
   * Handle BaseError instances
   */
  private async handleBaseError(
    error: BaseError,
    context: ErrorContext
  ): Promise<{ statusCode: number; body: ErrorResponse }> {
    const statusCode = error.statusCode;
    const body: ErrorResponse = {
      error: {
        type: error.errorCode.toLowerCase(),
        message: error.isOperational
          ? error.message
          : 'An internal server error occurred',
        correlationId: context.correlationId,
      },
    };

    // Add additional fields for specific error types
    if (error instanceof RateLimitError) {
      (body.error as any).retryAfter = error.retryAfter;
    }

    if (error instanceof CircuitBreakerError) {
      (body.error as any).nextAttemptTime =
        error.nextAttemptTime?.toISOString();
    }

    if (error instanceof ValidationError && error.field) {
      (body.error as any).field = error.field;
    }

    // Add stack trace in development
    if (this.config.exposeStackTrace && error.stack) {
      (body.error as any).stack = error.stack;
    }

    return { statusCode, body };
  }

  /**
   * Handle known Node.js errors
   */
  private async handleNodeError(
    error: Error,
    context: ErrorContext
  ): Promise<{ statusCode: number; body: ErrorResponse }> {
    let statusCode = 500;
    let errorType = 'internal_server_error';
    let message = 'An internal server error occurred';

    // Map Node.js errors to appropriate HTTP status codes
    const errorCode = (error as any).code;

    switch (errorCode) {
      case 'ECONNRESET':
      case 'ECONNREFUSED':
      case 'ENOTFOUND':
      case 'ETIMEDOUT':
        statusCode = 503;
        errorType = 'service_unavailable';
        message = 'External service is temporarily unavailable';
        break;
      case 'EMFILE':
      case 'ENFILE':
        statusCode = 503;
        errorType = 'resource_exhausted';
        message = 'Server resources temporarily exhausted';
        break;
    }

    const body: ErrorResponse = {
      error: {
        type: errorType,
        message,
        correlationId: context.correlationId,
      },
    };

    return { statusCode, body };
  }

  /**
   * Handle unknown errors
   */
  private async handleUnknownError(
    error: Error,
    context: ErrorContext
  ): Promise<{ statusCode: number; body: ErrorResponse }> {
    // Try graceful degradation if enabled
    if (this.config.enableGracefulDegradation) {
      try {
        const degradationResult =
          await gracefulDegradationManager.executeGracefulDegradation({
            correlationId: context.correlationId,
            operation: context.operation || 'unknown',
            error,
            attempt: 1,
          });

        if (degradationResult.success) {
          return {
            statusCode: 200,
            body: degradationResult.data as ErrorResponse,
          };
        }
      } catch (degradationError) {
        // Graceful degradation failed, continue with normal error handling
        logger.warn('Graceful degradation failed', context.correlationId, {
          originalError: error.message,
        });
      }
    }

    const body: ErrorResponse = {
      error: {
        type: 'internal_server_error',
        message: 'An internal server error occurred',
        correlationId: context.correlationId,
      },
    };

    // Add error details in development
    if (this.config.exposeStackTrace) {
      (body.error as any).details = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return { statusCode: 500, body };
  }

  /**
   * Check if error is a known Node.js error
   */
  private isKnownNodeError(error: Error): boolean {
    const knownCodes = [
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'EMFILE',
      'ENFILE',
      'EACCES',
      'EPERM',
    ];

    return knownCodes.includes((error as any).code);
  }

  /**
   * Check if error should trigger a health alert
   */
  private shouldTriggerAlert(error: Error): boolean {
    if (isBaseError(error)) {
      return (
        !error.isOperational ||
        error instanceof CircuitBreakerError ||
        error instanceof ServiceUnavailableError
      );
    }

    return true; // Unknown errors should trigger alerts
  }

  /**
   * Trigger health monitoring alert
   */
  private async triggerHealthAlert(
    error: Error,
    context: ErrorContext
  ): Promise<void> {
    try {
      const severity =
        isBaseError(error) && !error.isOperational ? 'critical' : 'high';

      await healthMonitor.triggerAlert({
        id: `error_${context.correlationId}_${Date.now()}`,
        type: 'error_rate',
        severity,
        message: `Error in ${context.operation || context.url}: ${error.message}`,
        timestamp: new Date(),
        correlationId: context.correlationId,
        metadata: {
          errorType: error.name,
          operation: context.operation,
          url: context.url,
          method: context.method,
        },
      });
    } catch (alertError) {
      logger.error(
        'Failed to trigger health alert',
        context.correlationId,
        {},
        alertError as Error
      );
    }
  }

  /**
   * Adjust service level based on error patterns
   */
  private adjustServiceLevel(error: Error, context: ErrorContext): void {
    try {
      // Auto-adjust based on circuit breaker states
      gracefulDegradationManager.autoAdjustServiceLevel(context.correlationId);

      // Degrade on critical errors
      if (isBaseError(error) && !error.isOperational) {
        gracefulDegradationManager.degradeServiceLevel(
          `Critical error: ${error.message}`,
          context.correlationId
        );
      }
    } catch (adjustError) {
      logger.error(
        'Failed to adjust service level',
        context.correlationId,
        {},
        adjustError as Error
      );
    }
  }
}

// Create global error handler instance
const errorHandler = new EnhancedErrorHandler();

/**
 * Express error handling middleware
 */
export const enhancedErrorHandler = errorHandler.handleError;

/**
 * Async error wrapper for route handlers
 */
export function asyncErrorHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/**
 * Error boundary for critical operations
 */
export async function withErrorBoundary<T>(
  operation: () => Promise<T>,
  correlationId: string,
  operationName?: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    logger.error(
      `Error boundary caught error in ${operationName || 'unknown operation'}`,
      correlationId,
      { operation: operationName },
      error as Error
    );

    throw error;
  }
}
