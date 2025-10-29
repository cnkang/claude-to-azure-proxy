/**
 * Enhanced retry strategy for Azure OpenAI Responses API
 * Implements exponential backoff with jitter and Azure-specific error handling
 */

import { RetryStrategy, type RetryConfig } from '../resilience/retry.js';
import {
  AzureErrorMapper,
  type ErrorMappingContext,
} from './azure-error-mapper.js';
import { logger } from '../middleware/logging.js';
import type {
  ResponsesCreateParams,
  ResponseFormat,
  AzureOpenAIErrorResponse,
} from '../types/index.js';

type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends ReadonlyArray<infer U>
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
      : T;

type ReadonlyFunction<T> = T extends (...args: infer A) => infer R
  ? (...args: DeepReadonly<A>) => R
  : T;

export interface AzureRetryContext {
  readonly correlationId: string;
  readonly operation: string;
  readonly requestFormat: ResponseFormat;
  readonly originalParams: Readonly<ResponsesCreateParams>;
}

export interface AzureRetryResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: Error;
  readonly attempts: number;
  readonly totalDurationMs: number;
  readonly fallbackUsed?: boolean;
}

/**
 * Azure OpenAI specific retry strategy
 */
export class AzureRetryStrategy {
  private readonly retryStrategy: RetryStrategy;
  private readonly config: RetryConfig;

  constructor(
    name: string = 'azure-openai',
    config: Partial<RetryConfig> = {}
  ) {
    this.config = {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      jitterFactor: 0.1,
      retryableErrors: [
        'NETWORK_ERROR',
        'TIMEOUT_ERROR',
        'AZURE_OPENAI_ERROR',
        'SERVICE_UNAVAILABLE_ERROR',
        'CIRCUIT_BREAKER_ERROR',
        'rate_limit_error',
        'overloaded_error',
        'api_error',
        'server_error',
        'ECONNRESET',
        'ENOTFOUND',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'EHOSTUNREACH',
        'ENETUNREACH',
      ],
      timeoutMs: 120000, // 120 seconds timeout
      ...config,
    };

    this.retryStrategy = new RetryStrategy(name, this.config);
  }

  /**
   * Execute Azure OpenAI operation with retry logic
   */
  public async executeWithRetry<T>(
    operation: ReadonlyFunction<() => Promise<T>>,
    context: DeepReadonly<AzureRetryContext>
  ): Promise<AzureRetryResult<T>> {
    const startTime = Date.now();

    try {
      const result = await this.retryStrategy.execute(
        operation,
        context.correlationId,
        context.operation
      );

      return {
        success: result.success,
        data: result.data,
        error: result.error,
        attempts: result.attempts.length,
        totalDurationMs: result.totalDurationMs,
      };
    } catch (error) {
      // Handle final failure with error mapping
      const mappedError = this.mapFinalError(error as Error, context);
      const totalDurationMs = Date.now() - startTime;

      logger.error(
        'Azure OpenAI operation failed after all retries',
        context.correlationId,
        {
          operation: context.operation,
          attempts: this.config.maxAttempts,
          totalDurationMs,
          error: mappedError.error.message,
        }
      );

      return {
        success: false,
        error: mappedError.error,
        attempts: this.config.maxAttempts,
        totalDurationMs,
      };
    }
  }

  /**
   * Map final error to appropriate client format
   */
  private mapFinalError(
    error: Readonly<Error>,
    context: DeepReadonly<AzureRetryContext>
  ): ReturnType<typeof AzureErrorMapper.mapError> {
    const mappingContext: ErrorMappingContext = {
      correlationId: context.correlationId,
      operation: context.operation,
      requestFormat: context.requestFormat,
      originalError: error,
    };

    return AzureErrorMapper.mapError(mappingContext);
  }

  /**
   * Check if error should trigger retry with custom Azure logic
   */
  public static shouldRetryError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    // Check for Azure-specific retryable errors
    if (AzureRetryStrategy.isAzureRetryableError(error)) {
      return true;
    }

    // Check for network errors
    if (AzureRetryStrategy.isNetworkError(error)) {
      return true;
    }

    // Check for timeout errors
    if (AzureRetryStrategy.isTimeoutError(error)) {
      return true;
    }

    return false;
  }

  /**
   * Check if error is Azure-specific retryable error
   */
  private static isAzureRetryableError(error: Readonly<Error>): boolean {
    const retryableTypes = [
      'rate_limit_error',
      'overloaded_error',
      'api_error',
      'server_error',
      'service_unavailable',
    ];

    const errorMessage = error.message.toLowerCase();
    const errorName = error.name.toLowerCase();

    return retryableTypes.some(
      (type) => errorMessage.includes(type) || errorName.includes(type)
    );
  }

  /**
   * Check if error is a network error
   */
  private static isNetworkError(error: Readonly<Error>): boolean {
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
  private static isTimeoutError(error: Readonly<Error>): boolean {
    const errorCode = (error as Error & { code?: string }).code;
    return (
      errorCode === 'ETIMEDOUT' ||
      error.message.toLowerCase().includes('timeout') ||
      error.message.toLowerCase().includes('timed out')
    );
  }

  /**
   * Extract retry delay from Azure error response
   */
  public static extractRetryDelay(error: unknown): number | undefined {
    if (typeof error === 'object' && error !== null && 'error' in error) {
      const azureError = error as AzureOpenAIErrorResponse;
      if (azureError.error?.retry_after !== undefined) {
        return azureError.error.retry_after * 1000; // Convert to milliseconds
      }
    }

    return undefined;
  }

  /**
   * Get retry strategy metrics
   */
  public getMetrics(): ReturnType<RetryStrategy['getMetrics']> {
    return this.retryStrategy.getMetrics();
  }

  /**
   * Reset retry strategy metrics
   */
  public resetMetrics(): void {
    this.retryStrategy.resetMetrics();
  }
}

/**
 * Convenience function for Azure OpenAI operations with retry
 */
export async function withAzureRetry<T>(
  operation: ReadonlyFunction<() => Promise<T>>,
  context: DeepReadonly<AzureRetryContext>,
  config?: DeepReadonly<Partial<RetryConfig>>
): Promise<T> {
  const retryStrategy = new AzureRetryStrategy(
    'azure-openai-operation',
    config
  );
  const result = await retryStrategy.executeWithRetry(operation, context);

  if (result.success && result.data !== undefined) {
    return result.data;
  }

  throw (
    result.error ?? new Error('Azure OpenAI operation failed after all retries')
  );
}

/**
 * Create Azure-specific retry configuration
 */
export function createAzureRetryConfig(
  overrides: Readonly<Partial<RetryConfig>> = {}
): RetryConfig {
  return {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitterFactor: 0.1,
    retryableErrors: [
      'NETWORK_ERROR',
      'TIMEOUT_ERROR',
      'AZURE_OPENAI_ERROR',
      'SERVICE_UNAVAILABLE_ERROR',
      'CIRCUIT_BREAKER_ERROR',
      'rate_limit_error',
      'overloaded_error',
      'api_error',
      'server_error',
      'ECONNRESET',
      'ENOTFOUND',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'EHOSTUNREACH',
      'ENETUNREACH',
    ],
    timeoutMs: 120000,
    ...overrides,
  };
}

/**
 * Create retry configurations for different operation types with dynamic timeout
 */
export function createAzureRetryConfigs(baseTimeoutMs: number = 120000) {
  return {
    /**
     * Configuration for completion requests
     */
    completions: createAzureRetryConfig({
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      timeoutMs: Math.max(baseTimeoutMs * 2, 120000), // At least 2 minutes for completions
    }),

    /**
     * Configuration for streaming requests
     */
    streaming: createAzureRetryConfig({
      maxAttempts: 2, // Fewer retries for streaming
      baseDelayMs: 500,
      maxDelayMs: 10000,
      timeoutMs: Math.max(baseTimeoutMs * 3, 180000), // At least 3 minutes for streaming
    }),

    /**
     * Configuration for health checks
     */
    healthCheck: createAzureRetryConfig({
      maxAttempts: 2,
      baseDelayMs: 500,
      maxDelayMs: 5000,
      timeoutMs: 10000, // 10 seconds for health checks (fixed)
    }),

    /**
     * Configuration for model operations
     */
    models: createAzureRetryConfig({
      maxAttempts: 2,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      timeoutMs: baseTimeoutMs, // Use configured timeout for model operations
    }),
  } as const;
}

/**
 * Create retry configuration for different operation types
 * @deprecated Use createAzureRetryConfigs() instead for dynamic timeout configuration
 */
export const AzureRetryConfigs = createAzureRetryConfigs();
