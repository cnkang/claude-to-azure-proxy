/**
 * Azure OpenAI error mapping to client-specific formats
 * Maps Azure OpenAI Responses API errors to Claude and OpenAI formats
 */

type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends ReadonlyArray<infer U>
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
      : T;

import {
  AzureOpenAIError,
  ValidationError,
  AuthenticationError,
  RateLimitError,
  ServiceUnavailableError,
  NetworkError,
  TimeoutError,
  BaseError,
} from '../errors/index';
import type {
  ClaudeError,
  OpenAIError,
  ResponseFormat,
  AzureOpenAIErrorResponse,
} from '../types/index';

export interface ErrorMappingContext {
  readonly correlationId: string;
  readonly operation?: string;
  readonly requestFormat: ResponseFormat;
  readonly originalError: unknown;
}

export interface MappedError {
  readonly error: BaseError;
  readonly clientResponse: ClaudeError | OpenAIError;
}

/**
 * Azure OpenAI error mapper class
 */
export class AzureErrorMapper {
  /**
   * Map Azure OpenAI error to appropriate client format
   */
  public static mapError(
    context: DeepReadonly<ErrorMappingContext>
  ): MappedError {
    const baseError = this.createBaseError(context);
    const clientResponse = this.createClientResponse(baseError, context);

    return {
      error: baseError,
      clientResponse,
    };
  }

  /**
   * Create BaseError from Azure OpenAI error
   */
  private static createBaseError(
    context: DeepReadonly<ErrorMappingContext>
  ): BaseError {
    const { correlationId, operation, originalError } = context;

    // Handle network and timeout errors
    if (this.isNetworkError(originalError)) {
      return new NetworkError(
        'Network error occurred while communicating with Azure OpenAI',
        correlationId,
        originalError as Error,
        operation
      );
    }

    if (this.isTimeoutError(originalError)) {
      const timeoutMs = this.extractTimeoutValue(originalError);
      return new TimeoutError(
        'Request to Azure OpenAI timed out',
        correlationId,
        timeoutMs,
        operation
      );
    }

    // Handle Azure OpenAI API errors
    if (this.isAzureOpenAIError(originalError)) {
      return this.mapAzureOpenAIError(originalError, correlationId, operation);
    }

    // Handle BaseError instances (including RateLimitError, ValidationError, etc.)
    if (originalError instanceof BaseError) {
      return originalError;
    }

    // Handle generic errors
    if (originalError instanceof Error) {
      return new AzureOpenAIError(
        originalError.message,
        500,
        correlationId,
        'unknown_error',
        undefined,
        operation
      );
    }

    // Unknown error type
    return new AzureOpenAIError(
      'An unknown error occurred',
      500,
      correlationId,
      'unknown_error',
      undefined,
      operation
    );
  }

  /**
   * Map Azure OpenAI API error to BaseError
   */
  private static mapAzureOpenAIError(
    azureError: Readonly<AzureOpenAIErrorResponse>,
    correlationId: string,
    operation?: string
  ): BaseError {
    const errorData = azureError.error ?? {};
    const errorType = errorData.type ?? 'unknown_error';
    const errorMessage = errorData.message ?? 'Azure OpenAI error occurred';
    const errorCode = errorData.code;

    // Map Azure error types to appropriate BaseError subclasses
    switch (errorType) {
      case 'invalid_request_error':
        return new ValidationError(
          errorMessage,
          correlationId,
          errorData.param,
          undefined,
          true,
          operation
        );

      case 'authentication_error':
        return new AuthenticationError(errorMessage, correlationId, operation, {
          azureErrorCode: errorCode,
        });

      case 'permission_error':
        return new AuthenticationError(errorMessage, correlationId, operation, {
          azureErrorCode: errorCode,
        });

      case 'rate_limit_error':
        const retryAfter = this.extractRetryAfter(azureError);
        return new RateLimitError(
          errorMessage,
          correlationId,
          retryAfter,
          operation
        );

      case 'api_error':
      case 'overloaded_error':
        const serviceRetryAfter = this.extractRetryAfter(azureError);
        return new ServiceUnavailableError(
          errorMessage,
          correlationId,
          serviceRetryAfter,
          operation
        );

      case 'not_found_error':
        return new ValidationError(
          errorMessage,
          correlationId,
          'model',
          undefined,
          true,
          operation
        );

      default:
        const statusCode = this.mapErrorTypeToStatusCode(errorType);
        return new AzureOpenAIError(
          errorMessage,
          statusCode,
          correlationId,
          errorType,
          errorCode,
          operation
        );
    }
  }

  /**
   * Create client-specific error response
   */
  private static createClientResponse(
    baseError: DeepReadonly<BaseError>,
    context: DeepReadonly<ErrorMappingContext>
  ): ClaudeError | OpenAIError {
    if (context.requestFormat === 'claude') {
      return this.createClaudeError(baseError);
    } else {
      return this.createOpenAIError(baseError);
    }
  }

  /**
   * Create Claude-format error response
   */
  private static createClaudeError(
    baseError: DeepReadonly<BaseError>
  ): ClaudeError {
    return {
      type: 'error',
      error: {
        type: this.mapToClaudeErrorType(baseError),
        message: baseError.message,
      },
    };
  }

  /**
   * Create OpenAI-format error response
   */
  private static createOpenAIError(
    baseError: DeepReadonly<BaseError>
  ): OpenAIError {
    return {
      error: {
        message: baseError.message,
        type: this.mapToOpenAIErrorType(baseError),
        code: baseError.errorCode.toLowerCase(),
      },
    };
  }

  /**
   * Map BaseError to Claude error type
   */
  private static mapToClaudeErrorType(
    baseError: DeepReadonly<BaseError>
  ):
    | 'invalid_request_error'
    | 'authentication_error'
    | 'rate_limit_error'
    | 'api_error'
    | 'overloaded_error' {
    if (baseError instanceof ValidationError) {
      return 'invalid_request_error';
    }
    if (baseError instanceof AuthenticationError) {
      return 'authentication_error';
    }
    if (baseError instanceof RateLimitError) {
      return 'rate_limit_error';
    }
    if (baseError instanceof ServiceUnavailableError) {
      return 'overloaded_error';
    }
    if (
      baseError instanceof NetworkError ||
      baseError instanceof TimeoutError
    ) {
      return 'api_error';
    }
    return 'api_error';
  }

  /**
   * Map BaseError to OpenAI error type
   */
  private static mapToOpenAIErrorType(
    baseError: DeepReadonly<BaseError>
  ): string {
    if (baseError instanceof ValidationError) {
      return 'invalid_request_error';
    }
    if (baseError instanceof AuthenticationError) {
      return 'invalid_request_error';
    }
    if (baseError instanceof RateLimitError) {
      return 'rate_limit_exceeded';
    }
    if (baseError instanceof ServiceUnavailableError) {
      return 'server_error';
    }
    if (
      baseError instanceof NetworkError ||
      baseError instanceof TimeoutError
    ) {
      return 'server_error';
    }
    return 'server_error';
  }

  /**
   * Check if error is a network error
   */
  private static isNetworkError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const networkCodes = [
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ENETUNREACH',
      'EHOSTUNREACH',
    ];

    const errorCode = (error as Error & { code?: string }).code;
    return (
      networkCodes.includes(errorCode ?? '') ||
      error.message.toLowerCase().includes('network') ||
      error.message.toLowerCase().includes('connection')
    );
  }

  /**
   * Check if error is a timeout error
   */
  private static isTimeoutError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const errorCode = (error as Error & { code?: string }).code;
    return (
      errorCode === 'ETIMEDOUT' ||
      error.message.toLowerCase().includes('timeout') ||
      error.message.toLowerCase().includes('timed out')
    );
  }

  /**
   * Check if error is an Azure OpenAI API error
   */
  private static isAzureOpenAIError(
    error: unknown
  ): error is AzureOpenAIErrorResponse {
    return (
      typeof error === 'object' &&
      error !== null &&
      'error' in error &&
      typeof (error as { error: unknown }).error === 'object'
    );
  }

  /**
   * Extract timeout value from error
   */
  private static extractTimeoutValue(error: unknown): number {
    if (error instanceof TimeoutError) {
      return error.timeoutMs;
    }

    // Try to extract from error message
    const message = error instanceof Error ? error.message : '';
    const timeoutMatch = message.match(/(\d+)\s*ms/);
    return timeoutMatch?.[1] !== undefined
      ? parseInt(timeoutMatch[1], 10)
      : 120000;
  }

  /**
   * Extract retry-after value from Azure error
   */
  private static extractRetryAfter(
    azureError: Readonly<AzureOpenAIErrorResponse>
  ): number {
    // Check for retry-after in error response
    if (azureError.error && typeof azureError.error === 'object') {
      const errorObj = azureError.error as Record<string, unknown>;
      if (typeof errorObj.retry_after === 'number') {
        return errorObj.retry_after;
      }
    }

    // Default retry-after values based on error type
    const errorType = azureError.error?.type;
    switch (errorType) {
      case 'rate_limit_error':
        return 60; // 1 minute
      case 'overloaded_error':
        return 300; // 5 minutes
      default:
        return 60; // 1 minute default
    }
  }

  /**
   * Map error type to HTTP status code
   */
  private static mapErrorTypeToStatusCode(errorType: string): number {
    switch (errorType) {
      case 'invalid_request_error':
        return 400;
      case 'authentication_error':
      case 'permission_error':
        return 401;
      case 'not_found_error':
        return 404;
      case 'rate_limit_error':
        return 429;
      case 'api_error':
      case 'overloaded_error':
        return 503;
      default:
        return 500;
    }
  }

  /**
   * Create fallback error response when mapping fails
   */
  public static createFallbackError(
    correlationId: string,
    requestFormat: ResponseFormat,
    operation?: string
  ): MappedError {
    const baseError = new AzureOpenAIError(
      'An unexpected error occurred',
      500,
      correlationId,
      'internal_error',
      undefined,
      operation
    );

    const clientResponse =
      requestFormat === 'claude'
        ? this.createClaudeError(baseError)
        : this.createOpenAIError(baseError);

    return {
      error: baseError,
      clientResponse,
    };
  }
}
