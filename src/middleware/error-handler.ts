/**
 * Enhanced error handling middleware with comprehensive error processing
 * Integrates custom errors, circuit breakers, retry logic, and graceful degradation
 */

import type { Request, Response, NextFunction } from 'express';
import {
  BaseError,
  isBaseError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  RateLimitError,
  CircuitBreakerError,
  ServiceUnavailableError,
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

type ExtendedErrorPayload = ErrorResponse['error'] & {
  retryAfter?: number;
  nextAttemptTime?: string;
  field?: string;
  stack?: string;
  details?: Record<string, unknown>;
};

type ExtendedErrorResponse = { error: ExtendedErrorPayload };

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
    error: Readonly<Error>,
    req: Readonly<Request>,
    res: Readonly<Response>,
    next: NextFunction
  ): Promise<void> => {
    const context = this.createErrorContext(req);

    try {
      // Log the error
      if (this.config.logErrors) {
        this.logError(error, context);
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
  private createErrorContext(req: Readonly<Request>): ErrorContext {
    const requestWithCorrelation = req as RequestWithCorrelationId;
    const correlationId = resolveCorrelationId(
      requestWithCorrelation.correlationId
    );
    const operation = extractRoutePath(req);
    const userAgent = normalizeHeaderValue(req.headers['user-agent']);
    const clientIp = resolveClientIp(req);

    return {
      correlationId,
      operation,
      userAgent,
      ip: clientIp,
      method: req.method,
      url: req.originalUrl,
      timestamp: new Date(),
    };
  }

  /**
   * Log error with appropriate level and context
   */
  private logError(
    error: Readonly<Error>,
    context: Readonly<ErrorContext>
  ): void {
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
  private getLogLevel(
    error: Readonly<BaseError>
  ): 'warn' | 'error' | 'critical' {
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
    error: Readonly<Error>,
    context: Readonly<ErrorContext>
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
  private handleBaseError(
    error: Readonly<BaseError>,
    context: Readonly<ErrorContext>
  ): { statusCode: number; body: ErrorResponse } {
    const statusCode = error.statusCode;
    const errorPayload: ExtendedErrorPayload = {
      type: error.errorCode.toLowerCase(),
      message: error.isOperational
        ? error.message
        : 'An internal server error occurred',
      correlationId: context.correlationId,
    };

    // Add additional fields for specific error types
    if (error instanceof RateLimitError) {
      errorPayload.retryAfter = error.retryAfter;
    }

    if (error instanceof CircuitBreakerError) {
      errorPayload.nextAttemptTime = error.nextAttemptTime
        ? error.nextAttemptTime.toISOString()
        : undefined;
    }

    if (
      error instanceof ValidationError &&
      typeof error.field === 'string' &&
      error.field.length > 0
    ) {
      errorPayload.field = error.field;
    }

    // Add stack trace in development
    if (
      this.config.exposeStackTrace &&
      typeof error.stack === 'string' &&
      error.stack.length > 0
    ) {
      errorPayload.stack = error.stack;
    }

    const body: ExtendedErrorResponse = { error: errorPayload };
    return { statusCode, body };
  }

  /**
   * Handle known Node.js errors
   */
  private handleNodeError(
    error: Readonly<Error>,
    context: Readonly<ErrorContext>
  ): { statusCode: number; body: ErrorResponse } {
    let statusCode = 500;
    let errorType = 'internal_server_error';
    let message = 'An internal server error occurred';

    // Map Node.js errors to appropriate HTTP status codes
    const errorCode = extractErrorCode(error);

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
    error: Readonly<Error>,
    context: Readonly<ErrorContext>
  ): Promise<{ statusCode: number; body: ErrorResponse }> {
    // Try graceful degradation if enabled
    if (this.config.enableGracefulDegradation) {
      try {
        const degradationResult =
          await gracefulDegradationManager.executeGracefulDegradation({
            correlationId: context.correlationId,
            operation: context.operation ?? 'unknown',
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
          degradationError:
            degradationError instanceof Error
              ? degradationError.message
              : 'Unknown degradation error',
        });
      }
    }

    const errorPayload: ExtendedErrorPayload = {
      type: 'internal_server_error',
      message: 'An internal server error occurred',
      correlationId: context.correlationId,
    };

    // Add error details in development
    if (this.config.exposeStackTrace) {
      errorPayload.details = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    const body: ExtendedErrorResponse = { error: errorPayload };

    return { statusCode: 500, body };
  }

  /**
   * Check if error is a known Node.js error
   */
  private isKnownNodeError(error: Readonly<Error>): boolean {
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

    const errorCode = extractErrorCode(error);
    return errorCode !== undefined && knownCodes.includes(errorCode);
  }

  /**
   * Check if error should trigger a health alert
   */
  private shouldTriggerAlert(error: Readonly<Error>): boolean {
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
    error: Readonly<Error>,
    context: Readonly<ErrorContext>
  ): Promise<void> {
    try {
      const severity =
        isBaseError(error) && !error.isOperational ? 'critical' : 'high';

      await healthMonitor.triggerAlert({
        id: `error_${context.correlationId}_${Date.now()}`,
        type: 'error_rate',
        severity,
        message: `Error in ${context.operation ?? context.url}: ${error.message}`,
        timestamp: new Date(),
        correlationId: context.correlationId,
        metadata: {
          errorType: error.name,
          operation: context.operation,
          url: context.url,
          method: context.method,
        },
      });
    } catch (alertError: unknown) {
      const alertFailure =
        alertError instanceof Error
          ? alertError
          : new Error('Unknown alert error');
      logger.error(
        'Failed to trigger health alert',
        context.correlationId,
        {},
        alertFailure
      );
    }
  }

  /**
   * Adjust service level based on error patterns
   */
  private adjustServiceLevel(
    error: Readonly<Error>,
    context: Readonly<ErrorContext>
  ): void {
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
    } catch (adjustError: unknown) {
      const serviceFailure =
        adjustError instanceof Error
          ? adjustError
          : new Error('Unknown service adjustment error');
      logger.error(
        'Failed to adjust service level',
        context.correlationId,
        {},
        serviceFailure
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
    const boundaryError =
      error instanceof Error
        ? error
        : new Error('Unknown error in operation boundary');
    logger.error(
      `Error boundary caught error in ${operationName ?? 'unknown operation'}`,
      correlationId,
      { operation: operationName },
      boundaryError
    );

    throw boundaryError;
  }
}

function normalizeHeaderValue(
  value: string | readonly string[] | undefined
): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }

  return undefined;
}

function extractRoutePath(req: Readonly<Request>): string | undefined {
  const candidateRoute = (req as { route?: unknown }).route;

  if (hasRoutePath(candidateRoute) && typeof candidateRoute.path === 'string') {
    return candidateRoute.path;
  }

  return undefined;
}

function resolveClientIp(req: Readonly<Request>): string | undefined {
  if (typeof req.ip === 'string' && req.ip.length > 0) {
    return req.ip;
  }

  const socketAddress = req.socket.remoteAddress;
  return typeof socketAddress === 'string' && socketAddress.length > 0
    ? socketAddress
    : undefined;
}

function extractErrorCode(error: unknown): string | undefined {
  if (!hasErrorCode(error)) {
    return undefined;
  }

  const candidate = error.code;
  return typeof candidate === 'string' ? candidate : undefined;
}

function resolveCorrelationId(correlationId: string): string {
  return correlationId.trim().length > 0 ? correlationId : 'unknown';
}

function hasRoutePath(value: unknown): value is { readonly path?: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.prototype.hasOwnProperty.call(value, 'path')
  );
}

function hasErrorCode(value: unknown): value is { readonly code?: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.prototype.hasOwnProperty.call(value, 'code')
  );
}
