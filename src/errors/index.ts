/**
 * Custom error classes with proper inheritance hierarchy
 * Provides structured error handling with correlation IDs and sanitization
 */

export interface ErrorContext {
  readonly correlationId: string;
  readonly timestamp: string;
  readonly service: string;
  readonly operation?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Base error class for all application errors
 */
export abstract class BaseError extends Error {
  public readonly context: ErrorContext;
  public readonly isOperational: boolean;
  public readonly statusCode: number;
  public readonly errorCode: string;

  constructor(
    message: string,
    statusCode: number,
    errorCode: string,
    correlationId: string,
    isOperational: boolean = true,
    operation?: string,
    metadata?: Record<string, unknown>
  ) {
    super(message);

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, new.target.prototype);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = isOperational;

    this.context = {
      correlationId,
      timestamp: new Date().toISOString(),
      service: 'claude-to-azure-proxy',
      operation,
      metadata: this.sanitizeMetadata(metadata),
    };

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Sanitize metadata to prevent sensitive information leakage
   */
  private sanitizeMetadata(
    metadata?: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    if (!metadata) return undefined;

    const sanitized = { ...metadata };
    const sensitiveKeys = [
      'password',
      'token',
      'key',
      'secret',
      'authorization',
      'apikey',
    ];

    for (const [key, value] of Object.entries(sanitized)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > 1000) {
        // Truncate very long strings
        sanitized[key] = value.substring(0, 1000) + '...[TRUNCATED]';
      }
    }

    return sanitized;
  }

  /**
   * Convert error to JSON for logging
   */
  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      errorCode: this.errorCode,
      isOperational: this.isOperational,
      context: this.context,
      stack: process.env.NODE_ENV === 'development' ? this.stack : undefined,
    };
  }

  /**
   * Get sanitized error for client response
   */
  public toClientError(): Record<string, unknown> {
    return {
      type: this.errorCode,
      message: this.isOperational
        ? this.message
        : 'An internal server error occurred',
      correlationId: this.context.correlationId,
    };
  }
}

/**
 * Authentication related errors
 */
export class AuthenticationError extends BaseError {
  constructor(
    message: string,
    correlationId: string,
    operation?: string,
    metadata?: Record<string, unknown>
  ) {
    super(
      message,
      401,
      'AUTHENTICATION_ERROR',
      correlationId,
      true,
      operation,
      metadata
    );
  }
}

/**
 * Authorization related errors
 */
export class AuthorizationError extends BaseError {
  constructor(
    message: string,
    correlationId: string,
    operation?: string,
    metadata?: Record<string, unknown>
  ) {
    super(
      message,
      403,
      'AUTHORIZATION_ERROR',
      correlationId,
      true,
      operation,
      metadata
    );
  }
}

/**
 * Validation related errors
 */
export class ValidationError extends BaseError {
  public readonly field?: string;
  public readonly value?: unknown;

  constructor(
    message: string,
    correlationId: string,
    field?: string,
    value?: unknown,
    operation?: string
  ) {
    super(message, 400, 'VALIDATION_ERROR', correlationId, true, operation, {
      field,
      value,
    });
    this.field = field;
    this.value = value;
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends BaseError {
  public readonly retryAfter: number;

  constructor(
    message: string,
    correlationId: string,
    retryAfter: number = 60,
    operation?: string
  ) {
    super(message, 429, 'RATE_LIMIT_ERROR', correlationId, true, operation, {
      retryAfter,
    });
    this.retryAfter = retryAfter;
  }
}

/**
 * Azure OpenAI API related errors
 */
export class AzureOpenAIError extends BaseError {
  public readonly azureErrorType?: string;
  public readonly azureErrorCode?: string;

  constructor(
    message: string,
    statusCode: number,
    correlationId: string,
    azureErrorType?: string,
    azureErrorCode?: string,
    operation?: string
  ) {
    super(
      message,
      statusCode,
      'AZURE_OPENAI_ERROR',
      correlationId,
      true,
      operation,
      { azureErrorType, azureErrorCode }
    );
    this.azureErrorType = azureErrorType;
    this.azureErrorCode = azureErrorCode;
  }
}

/**
 * Network and connectivity errors
 */
export class NetworkError extends BaseError {
  public readonly cause?: Error;

  constructor(
    message: string,
    correlationId: string,
    cause?: Error,
    operation?: string
  ) {
    super(message, 503, 'NETWORK_ERROR', correlationId, true, operation, {
      cause: cause?.message,
    });
    this.cause = cause;
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends BaseError {
  public readonly timeoutMs: number;

  constructor(
    message: string,
    correlationId: string,
    timeoutMs: number,
    operation?: string
  ) {
    super(message, 408, 'TIMEOUT_ERROR', correlationId, true, operation, {
      timeoutMs,
    });
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Circuit breaker errors
 */
export class CircuitBreakerError extends BaseError {
  public readonly state: 'OPEN' | 'HALF_OPEN';
  public readonly nextAttemptTime?: Date;

  constructor(
    message: string,
    correlationId: string,
    state: 'OPEN' | 'HALF_OPEN',
    nextAttemptTime?: Date,
    operation?: string
  ) {
    super(
      message,
      503,
      'CIRCUIT_BREAKER_ERROR',
      correlationId,
      true,
      operation,
      {
        state,
        nextAttemptTime: nextAttemptTime?.toISOString(),
      }
    );
    this.state = state;
    this.nextAttemptTime = nextAttemptTime;
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends BaseError {
  constructor(
    message: string,
    correlationId: string,
    operation?: string,
    metadata?: Record<string, unknown>
  ) {
    super(
      message,
      500,
      'CONFIGURATION_ERROR',
      correlationId,
      false,
      operation,
      metadata
    );
  }
}

/**
 * Service unavailable errors
 */
export class ServiceUnavailableError extends BaseError {
  public readonly retryAfter?: number;

  constructor(
    message: string,
    correlationId: string,
    retryAfter?: number,
    operation?: string
  ) {
    super(
      message,
      503,
      'SERVICE_UNAVAILABLE_ERROR',
      correlationId,
      true,
      operation,
      { retryAfter }
    );
    this.retryAfter = retryAfter;
  }
}

/**
 * Internal server errors (non-operational)
 */
export class InternalServerError extends BaseError {
  constructor(
    message: string,
    correlationId: string,
    operation?: string,
    metadata?: Record<string, unknown>
  ) {
    super(
      message,
      500,
      'INTERNAL_SERVER_ERROR',
      correlationId,
      false,
      operation,
      metadata
    );
  }
}

/**
 * Type guard to check if error is operational
 */
export function isOperationalError(error: unknown): error is BaseError {
  return error instanceof BaseError && error.isOperational;
}

/**
 * Type guard to check if error is a BaseError
 */
export function isBaseError(error: unknown): error is BaseError {
  return error instanceof BaseError;
}

/**
 * Error factory for creating errors from Azure OpenAI responses
 */
export class ErrorFactory {
  public static fromAzureOpenAIError(
    azureError: any,
    correlationId: string,
    operation?: string
  ): AzureOpenAIError {
    const message = azureError?.error?.message || 'Unknown Azure OpenAI error';
    const type = azureError?.error?.type || 'unknown_error';
    const code = azureError?.error?.code;

    // Map Azure error types to appropriate status codes
    let statusCode = 500;
    switch (type) {
      case 'invalid_request_error':
        statusCode = 400;
        break;
      case 'authentication_error':
        statusCode = 401;
        break;
      case 'permission_error':
        statusCode = 403;
        break;
      case 'not_found_error':
        statusCode = 404;
        break;
      case 'rate_limit_error':
        statusCode = 429;
        break;
      case 'api_error':
      case 'overloaded_error':
        statusCode = 503;
        break;
      default:
        statusCode = 500;
    }

    return new AzureOpenAIError(
      message,
      statusCode,
      correlationId,
      type,
      code,
      operation
    );
  }

  public static fromNetworkError(
    error: Error,
    correlationId: string,
    operation?: string
  ): NetworkError {
    return new NetworkError(
      `Network error: ${error.message}`,
      correlationId,
      error,
      operation
    );
  }

  public static fromTimeout(
    timeoutMs: number,
    correlationId: string,
    operation?: string
  ): TimeoutError {
    return new TimeoutError(
      `Operation timed out after ${timeoutMs}ms`,
      correlationId,
      timeoutMs,
      operation
    );
  }
}
