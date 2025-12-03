/**
 * Custom error classes with proper inheritance hierarchy
 * Provides structured error handling with correlation IDs and sanitization
 */

export interface ErrorContext {
  readonly correlationId: string;
  readonly timestamp: string;
  readonly service: string;
  readonly operation?: string | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

/**
 * Sanitizes error messages to prevent sensitive information leakage
 */
export function sanitizeErrorMessage(message: string): string {
  if (message.length === 0) {
    return message;
  }

  let sanitized = message;

  const labelValuePatterns: ReadonlyArray<{
    readonly pattern: RegExp;
    readonly shouldRedact?: (value: string) => boolean;
    readonly replacement?: string;
  }> = [
    {
      pattern: /(api[_-]?key[s]?(?:[:=]\s*|\s+))([A-Za-z0-9_-]{8,})/gi,
      shouldRedact: (value: string): boolean => /\d/.test(value),
    },
    {
      pattern: /(token[s]?(?:[:=]\s*|\s+))([A-Za-z0-9._-]{8,})/gi,
      shouldRedact: (value: string): boolean => /\d/.test(value),
    },
    {
      pattern: /(bearer\s+)([A-Za-z0-9._-]{8,})/gi,
      replacement: '[TOKEN_REDACTED]',
    },
    {
      pattern: /(password[s]?(?:[:=]\s*|\s+))([^\s]{4,})/gi,
    },
    {
      pattern: /(secret[s]?(?:[:=]\s*|\s+))([^\s]{4,})/gi,
    },
  ];

  for (const { pattern, shouldRedact, replacement } of labelValuePatterns) {
    sanitized = sanitized.replace(
      pattern,
      (match: string, prefix: string, value: string): string => {
        if (shouldRedact === undefined || shouldRedact(value)) {
          const token = replacement ?? '[REDACTED]';
          return `${prefix}${token}`;
        }

        return match;
      }
    );
  }

  const standalonePatterns: ReadonlyArray<[RegExp, string]> = [
    // Standalone key formats
    [/(sk-[A-Za-z0-9_-]{16,})/gi, '[REDACTED]'],
    // Azure-specific endpoints
    [/(https?:\/\/[^\s]*\.openai\.azure\.com[^\s]*)/gi, '[REDACTED]'],
    // Generic URLs
    [/(https?:\/\/[^\s]+)/gi, '[REDACTED]'],
    // Email addresses
    [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gi, '[EMAIL_REDACTED]'],
    // Long opaque tokens
    [/\b[A-Za-z0-9]{20,}\b/g, '[REDACTED]'],
  ];

  for (const [pattern, replacement] of standalonePatterns) {
    sanitized = sanitized.replace(pattern, replacement);
  }

  return sanitized;
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
    isOperational = true,
    operation?: string,
    metadata?: Record<string, unknown>
  ) {
    // Sanitize the message before calling super
    super(sanitizeErrorMessage(message));

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
      operation: operation ?? undefined,
      metadata: this.sanitizeMetadata(metadata) ?? undefined,
    };

    // Capture stack trace
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Sanitize metadata to prevent sensitive information leakage
   */
  private sanitizeMetadata(
    metadata?: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    if (metadata === undefined) {
      return undefined;
    }

    const sensitiveKeyFragments: readonly string[] = [
      'password',
      'token',
      'key',
      'secret',
      'authorization',
      'apikey',
    ];

    const sanitizedEntries = Object.entries(metadata).map(
      (entry): [string, unknown] => {
        const [key, value] = entry;
        const lowerKey = key.toLowerCase();
        if (
          sensitiveKeyFragments.some((fragment) => lowerKey.includes(fragment))
        ) {
          return [key, '[REDACTED]'];
        }

        if (typeof value === 'string' && value.length > 1000) {
          return [key, `${value.substring(0, 1000)}...[TRUNCATED]`];
        }

        return [key, value];
      }
    );

    return Object.fromEntries(sanitizedEntries);
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
    isOperational = true,
    operation?: string
  ) {
    super(
      message,
      400,
      'VALIDATION_ERROR',
      correlationId,
      isOperational,
      operation,
      {
        field,
        value,
      }
    );
    this.field = field ?? undefined;
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
    retryAfter = 60,
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
    this.azureErrorType = azureErrorType ?? undefined;
    this.azureErrorCode = azureErrorCode ?? undefined;
  }
}

/**
 * Network and connectivity errors
 */
export class NetworkError extends BaseError {
  public override readonly cause?: Error;

  constructor(
    message: string,
    correlationId: string,
    cause?: Error,
    operation?: string
  ) {
    super(message, 503, 'NETWORK_ERROR', correlationId, true, operation, {
      cause: cause?.message,
      errorCode: cause && 'code' in cause ? cause.code : undefined,
      syscall: cause && 'syscall' in cause ? cause.syscall : undefined,
      errno: cause && 'errno' in cause ? cause.errno : undefined,
    });

    // Set cause using Node.js 24's error cause pattern
    if (cause) {
      this.cause = cause;
      // Also set as a property for Node.js 24 compatibility
      Object.defineProperty(this, 'cause', {
        value: cause,
        writable: false,
        enumerable: false,
        configurable: true,
      });
    }
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
    this.nextAttemptTime = nextAttemptTime ?? undefined;
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
    this.retryAfter = retryAfter ?? undefined;
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
 * Enhanced type guard using Node.js 24's Error.isError() method
 * Falls back to instanceof Error for compatibility
 */
export function isError(error: unknown): error is Error {
  // Fallback implementation (Error.isError not yet available in Node.js 24)
  return error instanceof Error;
}

/**
 * Set error cause property
 */
function setErrorCause(originalError: Error, newError: BaseError): void {
  if (newError.cause === undefined) {
    Object.defineProperty(newError, 'cause', {
      value: originalError,
      writable: false,
      enumerable: false,
      configurable: true,
    });
  }
}

/**
 * Preserve error code property
 */
function preserveErrorCode(originalError: Error, newError: BaseError): void {
  if ('code' in originalError && typeof originalError.code === 'string') {
    Object.assign(newError.context.metadata ?? {}, {
      originalErrorCode: originalError.code,
    });
  }
}

/**
 * Preserve error errno property
 */
function preserveErrorErrno(originalError: Error, newError: BaseError): void {
  if ('errno' in originalError && typeof originalError.errno === 'number') {
    Object.assign(newError.context.metadata ?? {}, {
      originalErrno: originalError.errno,
    });
  }
}

/**
 * Preserve error syscall property
 */
function preserveErrorSyscall(originalError: Error, newError: BaseError): void {
  if ('syscall' in originalError && typeof originalError.syscall === 'string') {
    Object.assign(newError.context.metadata ?? {}, {
      originalSyscall: originalError.syscall,
    });
  }
}

/**
 * Enhanced error context preservation for Node.js 24
 * Maintains error cause chain and additional context
 */
export function preserveErrorContext(
  originalError: unknown,
  newError: BaseError
): BaseError {
  if (!isError(originalError)) {
    return newError;
  }

  setErrorCause(originalError, newError);
  preserveErrorCode(originalError, newError);
  preserveErrorErrno(originalError, newError);
  preserveErrorSyscall(originalError, newError);

  return newError;
}

/**
 * Map Azure error types to HTTP status codes
 */
function mapAzureErrorTypeToStatusCode(errorType: string): number {
  const errorTypeMap: Record<string, number> = {
    invalid_request_error: 400,
    authentication_error: 401,
    permission_error: 403,
    not_found_error: 404,
    rate_limit_error: 429,
    api_error: 503,
    overloaded_error: 503,
  };

  return errorTypeMap[errorType] ?? 500;
}

/**
 * Build AzureOpenAIError with context preservation
 */
function buildAzureOpenAIError(
  message: string,
  statusCode: number,
  correlationId: string,
  type: string,
  code: string | undefined,
  operation: string | undefined,
  originalError: unknown
): AzureOpenAIError {
  const azureOpenAIError = new AzureOpenAIError(
    message,
    statusCode,
    correlationId,
    type,
    code,
    operation
  );

  if (isError(originalError)) {
    return preserveErrorContext(originalError, azureOpenAIError);
  }

  return azureOpenAIError;
}

/**
 * Error factory for creating errors from Azure OpenAI responses
 */
export class ErrorFactory {
  public static fromAzureOpenAIError(
    azureError: unknown,
    correlationId: string,
    operation?: string
  ): AzureOpenAIError {
    const { message, type, code } =
      ErrorFactory.parseAzureOpenAIErrorPayload(azureError);

    const statusCode = mapAzureErrorTypeToStatusCode(type);

    return buildAzureOpenAIError(
      message,
      statusCode,
      correlationId,
      type,
      code,
      operation,
      azureError
    );
  }

  private static parseAzureOpenAIErrorPayload(azureError: unknown): {
    message: string;
    type: string;
    code?: string;
  } {
    if (!ErrorFactory.isRecord(azureError)) {
      return {
        message: 'Unknown Azure OpenAI error',
        type: 'unknown_error',
      };
    }

    const errorSection = (azureError as { error?: unknown }).error;
    if (!ErrorFactory.isRecord(errorSection)) {
      return {
        message: 'Unknown Azure OpenAI error',
        type: 'unknown_error',
      };
    }

    const message =
      typeof errorSection.message === 'string'
        ? errorSection.message
        : 'Unknown Azure OpenAI error';
    const type =
      typeof errorSection.type === 'string'
        ? errorSection.type
        : 'unknown_error';
    const codeValue = errorSection.code;
    const code =
      typeof codeValue === 'string'
        ? codeValue
        : typeof codeValue === 'number'
          ? String(codeValue)
          : undefined;

    return { message, type, code };
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  public static fromNetworkError(
    error: Error,
    correlationId: string,
    operation?: string
  ): NetworkError {
    const networkError = new NetworkError(
      `Network error: ${error.message}`,
      correlationId,
      error,
      operation
    );

    return preserveErrorContext(error, networkError) as NetworkError;
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

  /**
   * Check if error code indicates a network error
   */
  private static isNetworkErrorCode(code: string): boolean {
    const networkErrorCodes = [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ECONNRESET',
      'ETIMEDOUT',
    ];
    return networkErrorCodes.includes(code);
  }

  /**
   * Check if error code indicates a timeout error
   */
  private static isTimeoutErrorCode(code: string): boolean {
    const timeoutErrorCodes = ['TIMEOUT', 'ESOCKETTIMEDOUT'];
    return timeoutErrorCodes.includes(code);
  }

  /**
   * Transform Error object with code property
   */
  private static transformErrorWithCode(
    error: Error,
    correlationId: string,
    operation?: string,
    defaultMessage?: string
  ): BaseError {
    if (!('code' in error)) {
      return ErrorFactory.transformGenericError(
        error,
        correlationId,
        operation,
        defaultMessage
      );
    }

    const errorWithCode = error as Error & { code: string };

    if (ErrorFactory.isNetworkErrorCode(errorWithCode.code)) {
      return ErrorFactory.fromNetworkError(error, correlationId, operation);
    }

    if (ErrorFactory.isTimeoutErrorCode(errorWithCode.code)) {
      return ErrorFactory.fromTimeout(30000, correlationId, operation);
    }

    return ErrorFactory.transformGenericError(
      error,
      correlationId,
      operation,
      defaultMessage
    );
  }

  /**
   * Transform generic Error object
   */
  private static transformGenericError(
    error: Error,
    correlationId: string,
    operation?: string,
    defaultMessage = 'An unexpected error occurred'
  ): BaseError {
    const genericError = new InternalServerError(
      error.message || defaultMessage,
      correlationId,
      operation,
      { originalErrorName: error.name }
    );

    return preserveErrorContext(error, genericError);
  }

  /**
   * Transform non-Error objects
   */
  private static transformNonError(
    error: unknown,
    correlationId: string,
    operation?: string,
    defaultMessage = 'An unexpected error occurred'
  ): BaseError {
    if (typeof error === 'string') {
      return new InternalServerError(
        error || defaultMessage,
        correlationId,
        operation
      );
    }

    if (typeof error === 'object' && error !== null) {
      const errorObj = error as Record<string, unknown>;
      const message =
        typeof errorObj.message === 'string'
          ? errorObj.message
          : defaultMessage;

      return new InternalServerError(message, correlationId, operation, {
        originalError: errorObj,
      });
    }

    return new InternalServerError(defaultMessage, correlationId, operation, {
      originalError: String(error),
    });
  }

  /**
   * Enhanced error transformation with comprehensive context preservation
   * Handles various error types and maintains error cause chains
   */
  public static transformError(
    error: unknown,
    correlationId: string,
    operation?: string,
    defaultMessage = 'An unexpected error occurred'
  ): BaseError {
    if (isBaseError(error)) {
      return error;
    }

    if (isError(error)) {
      return ErrorFactory.transformErrorWithCode(
        error,
        correlationId,
        operation,
        defaultMessage
      );
    }

    return ErrorFactory.transformNonError(
      error,
      correlationId,
      operation,
      defaultMessage
    );
  }
}

/**
 * Creates a standardized error response for client consumption
 */
export function createErrorResponse(
  error: BaseError,
  includeStack = false
): Record<string, unknown> {
  const response = error.toClientError();

  if (includeStack && process.env.NODE_ENV === 'development') {
    return {
      ...response,
      stack: error.stack,
    };
  }

  return response;
}

/**
 * Determines if an error should be logged as an error or warning
 */
export function getErrorLogLevel(error: BaseError): 'error' | 'warn' {
  // Non-operational errors are always logged as errors
  if (!error.isOperational) {
    return 'error';
  }

  // Client errors (4xx) are warnings, server errors (5xx) are errors
  return error.statusCode >= 500 ? 'error' : 'warn';
}

/**
 * Creates correlation ID for error tracking
 */
export function createCorrelationId(): string {
  return `err-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Type guard to check if an error has a correlation ID
 */
export function hasCorrelationId(
  error: unknown
): error is { context: { correlationId: string } } {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  if (!('context' in error)) {
    return false;
  }

  const errorWithContext = error as { context: unknown };
  if (
    typeof errorWithContext.context !== 'object' ||
    errorWithContext.context === null
  ) {
    return false;
  }

  const context = errorWithContext.context as Record<string, unknown>;
  return (
    'correlationId' in context && typeof context.correlationId === 'string'
  );
}
