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
} from '../errors/index';
import { logger } from './logging';
import { healthMonitor } from '../monitoring/health-monitor';
import { gracefulDegradationManager } from '../resilience/graceful-degradation';
import type { RequestWithCorrelationId, ErrorResponse } from '../types/index';
import { normalizeHeaderValue } from '../utils/http-headers';
import { resolveCorrelationId } from '../utils/correlation-id';
import {
  getCurrentMemoryMetrics,
  forceGarbageCollection,
} from '../utils/memory-manager';
import { getRequestMemoryInfo } from './memory-management';
import loadedConfig from '../config/index';

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
      enableGracefulDegradation: false,
      enableHealthMonitoring: true,
      ...config,
    };
  }

  /**
   * Main error handling middleware with Node.js 24 enhancements
   * Implements Requirement 8.3: Log errors with correlation IDs and continue serving
   */
  public handleError = async (
    error: Readonly<Error>,
    req: Readonly<Request>,
    res: Readonly<Response>,
    next: NextFunction
  ): Promise<void> => {
    const context = this.createErrorContext(req);

    try {
      // Check memory state during error handling
      const memoryInfo = this.gatherMemoryInfo(req);

      // Log the error with memory context and correlation ID (Requirement 8.3)
      if (this.config.logErrors) {
        this.logErrorWithMemoryContext(error, context, memoryInfo);
      }

      // Check if response was already sent (Requirement 8.2)
      if (res.headersSent) {
        // Log but don't throw - continue serving requests (Requirement 8.3)
        logger.warn('Response already sent, cannot send error response', context.correlationId, {
          url: req.url,
          method: req.method,
          errorMessage: error.message,
        });
        return next(error);
      }

      // Handle different error types
      const errorResponse = await this.processError(error, context);

      // Send error response (Requirement 8.2 - send once)
      res.status(errorResponse.statusCode).json(errorResponse.body);

      // Trigger health monitoring alerts if enabled
      if (
        this.config.enableHealthMonitoring &&
        this.shouldTriggerAlert(error)
      ) {
        await this.triggerHealthAlert(error, context);
      }

      // Auto-adjust service level based on error patterns
      this.adjustServiceLevel(error, context);

      // Handle memory pressure during error scenarios
      if (memoryInfo.pressureDetected && loadedConfig.ENABLE_AUTO_GC) {
        this.handleMemoryPressureOnError(context.correlationId);
      }
    } catch (handlingError) {
      // Error occurred while handling the original error
      // Log with correlation ID and continue serving (Requirement 8.3)
      logger.critical(
        'Error handler failed',
        context.correlationId,
        {
          originalError: error.message,
          handlingError:
            handlingError instanceof Error
              ? handlingError.message
              : 'Unknown error',
          nodeVersion: process.version,
        },
        handlingError as Error
      );

      // Send minimal error response without exposing internals (Requirement 8.3)
      if (!res.headersSent) {
        res.status(500).json({
          error: {
            type: 'internal_server_error',
            message: 'An unexpected error occurred',
            correlationId: context.correlationId,
            timestamp: new Date().toISOString(),
          },
        });
      }
      
      // Continue serving requests - don't crash the server (Requirement 8.3)
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
      operation: operation ?? undefined,
      userAgent: userAgent ?? undefined,
      ip: clientIp ?? undefined,
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

    if (this.isPayloadTooLargeError(error)) {
      return this.handlePayloadTooLargeError(error, context);
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
      if (error.nextAttemptTime) {
        errorPayload.nextAttemptTime = error.nextAttemptTime.toISOString();
      }
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
   * Handle known Node.js errors with enhanced Node.js 24 error detection
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
      case 'ENOMEM':
        statusCode = 503;
        errorType = 'memory_exhausted';
        message = 'Server memory temporarily exhausted';
        break;
      case 'ERR_OUT_OF_RANGE':
        statusCode = 400;
        errorType = 'invalid_request';
        message = 'Request parameter out of valid range';
        break;
      case 'ERR_INVALID_ARG_TYPE':
        statusCode = 400;
        errorType = 'invalid_request';
        message = 'Invalid request parameter type';
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
   * Check if error is a known Node.js error with Node.js 24 error codes
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
      'ENOMEM',
      'ERR_OUT_OF_RANGE',
      'ERR_INVALID_ARG_TYPE',
      'ERR_INVALID_ARG_VALUE',
      'ERR_INVALID_RETURN_VALUE',
      'ERR_MEMORY_ALLOCATION_FAILED',
    ];

    const errorCode = extractErrorCode(error);
    return errorCode !== undefined && knownCodes.includes(errorCode);
  }

  private isPayloadTooLargeError(error: Readonly<Error>): boolean {
    const errorWithType = error as { type?: unknown };
    return (
      typeof errorWithType.type === 'string' &&
      errorWithType.type.toLowerCase() === 'entity.too.large'
    );
  }

  private handlePayloadTooLargeError(
    error: Readonly<Error>,
    context: Readonly<ErrorContext>
  ): { statusCode: number; body: ErrorResponse } {
    const errorPayload: ExtendedErrorPayload = {
      type: 'request_entity_too_large',
      message: 'Request payload exceeds the allowed size limit',
      correlationId: context.correlationId,
    };

    if (this.config.exposeStackTrace && typeof error.stack === 'string') {
      errorPayload.stack = error.stack;
    }

    const body: ErrorResponse = { error: errorPayload };
    return { statusCode: 413, body };
  }

  /**
   * Gathers memory information for error context.
   *
   * @private
   * @param req - Express request object
   * @returns Memory information
   */
  private gatherMemoryInfo(req: Readonly<Request>): {
    readonly currentMemory: NodeJS.MemoryUsage;
    readonly requestMemoryInfo?: ReturnType<typeof getRequestMemoryInfo>;
    readonly pressureDetected: boolean;
    readonly memoryMetrics?: ReturnType<typeof getCurrentMemoryMetrics>;
  } {
    const currentMemory = process.memoryUsage();
    const requestMemoryInfo = getRequestMemoryInfo(req);

    let memoryMetrics: ReturnType<typeof getCurrentMemoryMetrics> | undefined;
    let pressureDetected = false;

    try {
      if (loadedConfig.ENABLE_MEMORY_MANAGEMENT) {
        memoryMetrics = getCurrentMemoryMetrics();
        pressureDetected =
          memoryMetrics.pressure.level === 'high' ||
          memoryMetrics.pressure.level === 'critical';
      }
    } catch (error) {
      // Memory metrics gathering failed, continue without it
      logger.debug(
        'Failed to gather memory metrics during error handling',
        '',
        {
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      );
    }

    return {
      currentMemory,
      requestMemoryInfo,
      pressureDetected,
      memoryMetrics: memoryMetrics ?? undefined,
    };
  }

  /**
   * Logs error with enhanced memory context.
   *
   * @private
   * @param error - Error to log
   * @param context - Error context
   * @param memoryInfo - Memory information
   */
  private logErrorWithMemoryContext(
    error: Readonly<Error>,
    context: Readonly<ErrorContext>,
    memoryInfo: ReturnType<typeof this.gatherMemoryInfo>
  ): void {
    const metadata = {
      operation: context.operation,
      method: context.method,
      url: context.url,
      userAgent: context.userAgent,
      ip: context.ip,
      nodeVersion: process.version,
      heapUsed: memoryInfo.currentMemory.heapUsed,
      heapTotal: memoryInfo.currentMemory.heapTotal,
      memoryPressure: memoryInfo.pressureDetected,
    };

    // Add request-specific memory information if available
    if (memoryInfo.requestMemoryInfo) {
      Object.assign(metadata, {
        requestMemoryDelta: memoryInfo.requestMemoryInfo.memoryDelta,
        requestDuration: memoryInfo.requestMemoryInfo.duration,
      });
    }

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
      // Unknown error type with enhanced context
      logger.error(
        `Unhandled error: ${error.message}`,
        context.correlationId,
        metadata,
        error
      );
    }
  }

  /**
   * Handles memory pressure during error scenarios.
   *
   * @private
   * @param correlationId - Request correlation ID
   */
  private handleMemoryPressureOnError(correlationId: string): void {
    logger.warn(
      'Memory pressure detected during error handling',
      correlationId,
      {
        action: 'triggering_garbage_collection',
      }
    );

    // Force garbage collection to free memory during error scenarios
    const gcTriggered = forceGarbageCollection();

    if (!gcTriggered) {
      logger.warn(
        'Could not trigger garbage collection during memory pressure',
        correlationId,
        {
          suggestion: 'Consider running with --expose-gc flag',
        }
      );
    }
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
        name: 'error_rate',
        severity,
        details: {
          message: `Error in ${context.operation ?? context.url}: ${error.message}`,
          timestamp: new Date(),
          correlationId: context.correlationId,
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
export function asyncErrorHandler<T extends Request = Request>(
  handler: (req: T, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: T, res: Response, next: NextFunction): void => {
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
