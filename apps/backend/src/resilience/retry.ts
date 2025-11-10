/**
 * Retry logic with exponential backoff, jitter, and maximum retry limits
 * Provides resilient operation execution with configurable retry strategies
 */

import { performance } from 'node:perf_hooks';
import { TimeoutError } from '../errors/index';
import {
  abortableDelay,
  createAbortError,
  isAbortError,
  throwIfAborted,
} from '../utils/abort-utils';

export interface RetryConfig {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffMultiplier: number;
  readonly jitterFactor: number;
  readonly retryableErrors: readonly string[];
  readonly timeoutMs?: number;
}

export interface RetryAttempt {
  readonly attemptNumber: number;
  readonly delayMs: number;
  readonly durationMs: number;
  readonly error?: Error;
  readonly timestamp: Date;
}

export interface RetryResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: Error;
  readonly attempts: readonly RetryAttempt[];
  readonly totalDurationMs: number;
}

export interface RetryMetrics {
  readonly totalAttempts: number;
  readonly successfulAttempts: number;
  readonly failedAttempts: number;
  readonly averageAttempts: number;
  readonly averageDurationMs: number;
}

export interface RetryManagerConfig extends Partial<RetryConfig> {
  /**
   * Friendly name for metrics and logging.
   */
  readonly name?: string;

  /**
   * Absolute jitter value in milliseconds to apply between attempts.
   * When provided, overrides jitterFactor if one is not explicitly supplied.
   */
  readonly jitterMs?: number;
}

/**
 * Retry strategy implementation with exponential backoff and jitter
 */
export class RetryStrategy {
  private readonly config: RetryConfig;
  private readonly name: string;
  private metrics: RetryMetrics;

  constructor(name: string, config: Partial<RetryConfig> = {}) {
    this.name = name;
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
        'ECONNRESET',
        'ENOTFOUND',
        'ECONNREFUSED',
        'ETIMEDOUT',
      ],
      ...config,
    };

    this.metrics = {
      totalAttempts: 0,
      successfulAttempts: 0,
      failedAttempts: 0,
      averageAttempts: 0,
      averageDurationMs: 0,
    };
  }

  /**
   * Execute operation with retry logic
   */
  public async execute<T>(
    operation: () => Promise<T>,
    correlationId: string,
    operationName?: string,
    signal?: AbortSignal
  ): Promise<RetryResult<T>> {
    const startTime = performance.now();
    const attempts: RetryAttempt[] = [];
    let lastError: Error | undefined;
    let delayBeforeAttempt = 0;

    if (signal?.aborted) {
      const abortError = createAbortError(signal.reason);
      return {
        success: false,
        error: abortError,
        attempts,
        totalDurationMs: Date.now() - startTime,
      };
    }

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      if (attempt > 1 && delayBeforeAttempt > 0) {
        try {
          await this.delay(delayBeforeAttempt, signal);
        } catch (delayError) {
          lastError = delayError as Error;
          if (isAbortError(lastError)) {
            break;
          }
          throw delayError;
        }
      }

      const attemptStartTime = performance.now();
      const recordedDelay = attempt === 1 ? 0 : delayBeforeAttempt;
      let attemptTimestamp: Date | undefined;

      try {
        throwIfAborted(signal);
        const operationPromise = operation();
        attemptTimestamp = new Date(performance.timeOrigin + attemptStartTime);

        // Add timeout wrapper if configured
        const result =
          this.config.timeoutMs !== undefined && this.config.timeoutMs > 0
            ? await this.withTimeout(
                operationPromise,
                this.config.timeoutMs,
                correlationId,
                operationName,
                signal
              )
            : await operationPromise;

        // Success - record attempt and return
        const attemptDurationMs = performance.now() - attemptStartTime;
        attempts.push({
          attemptNumber: attempt,
          delayMs: recordedDelay,
          durationMs: attemptDurationMs,
          timestamp:
            attemptTimestamp ??
            new Date(performance.timeOrigin + attemptStartTime),
        });

        const totalDurationMs = performance.now() - startTime;
        this.updateMetrics(true, attempt, totalDurationMs);

        return {
          success: true,
          data: result,
          attempts,
          totalDurationMs,
        };
      } catch (error) {
        lastError = error as Error;

        const attemptDurationMs = performance.now() - attemptStartTime;
        attempts.push({
          attemptNumber: attempt,
          delayMs: recordedDelay,
          durationMs: attemptDurationMs,
          error: lastError,
          timestamp:
            attemptTimestamp ??
            new Date(performance.timeOrigin + attemptStartTime),
        });

        if (isAbortError(lastError)) {
          break;
        }

        // Check if error is retryable
        if (
          !this.isRetryableError(lastError) ||
          attempt === this.config.maxAttempts
        ) {
          break;
        }

        delayBeforeAttempt = this.calculateDelay(attempt);
      }
    }

    // All attempts failed
    const totalDurationMs = performance.now() - startTime;

    if (lastError !== undefined && isAbortError(lastError)) {
      return {
        success: false,
        error: lastError,
        attempts,
        totalDurationMs,
      };
    }

    this.updateMetrics(false, attempts.length, totalDurationMs);

    return {
      success: false,
      error: lastError,
      attempts,
      totalDurationMs,
    };
  }

  /**
   * Check if error is retryable based on configuration
   */
  private isRetryableError(error: Error): boolean {
    const errorName = error.name || '';
    const errorMessage = error.message || '';
    const errorCode = (error as Error & { code?: string }).code;

    return this.config.retryableErrors.some(
      (retryableError) =>
        errorName.includes(retryableError) ||
        errorMessage.includes(retryableError) ||
        (typeof errorCode === 'string' && errorCode.includes(retryableError))
    );
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private calculateDelay(attemptNumber: number): number {
    // Exponential backoff: baseDelay * (multiplier ^ (attempt - 1))
    const exponentialDelay =
      this.config.baseDelayMs *
      Math.pow(this.config.backoffMultiplier, attemptNumber - 1);

    // Apply maximum delay limit
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs);

    // Add jitter to prevent thundering herd
    const jitter =
      cappedDelay * this.config.jitterFactor * (Math.random() - 0.5);
    const finalDelay = Math.max(0, cappedDelay + jitter);

    return Math.round(finalDelay);
  }

  /**
   * Delay execution for specified milliseconds with abort support
   */
  private delay(ms: number, signal?: AbortSignal): Promise<void> {
    if (ms <= 0) {
      return Promise.resolve();
    }

    return abortableDelay(ms, signal);
  }

  /**
   * Wrap operation with timeout
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    correlationId: string,
    operationName?: string,
    signal?: AbortSignal
  ): Promise<T> {
    if (timeoutMs <= 0) {
      return promise;
    }

    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combinedSignal =
      signal !== undefined
        ? AbortSignal.any([signal, timeoutSignal])
        : timeoutSignal;

    return new Promise<T>((resolve, reject) => {
      const cleanup = (): void => {
        combinedSignal.removeEventListener('abort', onAbort);
      };

      const onAbort = (): void => {
        cleanup();
        if (timeoutSignal.aborted && !(signal?.aborted ?? false)) {
          reject(
            new TimeoutError(
              `Operation timed out after ${timeoutMs}ms`,
              correlationId,
              timeoutMs,
              operationName
            )
          );
        } else {
          reject(createAbortError(signal?.reason));
        }
      };

      if (combinedSignal.aborted) {
        onAbort();
        return;
      }

      combinedSignal.addEventListener('abort', onAbort, { once: true });

      promise
        .then((value) => {
          cleanup();
          resolve(value);
        })
        .catch((error) => {
          cleanup();
          reject(error);
        });
    });
  }

  /**
   * Update retry metrics
   */
  private updateMetrics(
    success: boolean,
    attempts: number,
    durationMs: number
  ): void {
    const totalOperations =
      this.metrics.successfulAttempts + this.metrics.failedAttempts + 1;

    this.metrics = {
      totalAttempts: this.metrics.totalAttempts + attempts,
      successfulAttempts: success
        ? this.metrics.successfulAttempts + 1
        : this.metrics.successfulAttempts,
      failedAttempts: success
        ? this.metrics.failedAttempts
        : this.metrics.failedAttempts + 1,
      averageAttempts:
        (this.metrics.averageAttempts * (totalOperations - 1) + attempts) /
        totalOperations,
      averageDurationMs:
        (this.metrics.averageDurationMs * (totalOperations - 1) + durationMs) /
        totalOperations,
    };
  }

  /**
   * Get retry metrics
   */
  public getMetrics(): RetryMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  public resetMetrics(): void {
    this.metrics = {
      totalAttempts: 0,
      successfulAttempts: 0,
      failedAttempts: 0,
      averageAttempts: 0,
      averageDurationMs: 0,
    };
  }

  /**
   * Get strategy name
   */
  public getName(): string {
    return this.name;
  }

  /**
   * Get configuration
   */
  public getConfig(): RetryConfig {
    return { ...this.config };
  }
}

export class RetryManager {
  private readonly strategy: RetryStrategy;

  constructor(config: RetryManagerConfig = {}) {
    const { name = 'retry-manager', jitterMs, ...strategyOverrides } = config;

    let strategyConfig: Partial<RetryConfig> = strategyOverrides;

    if (
      jitterMs !== undefined &&
      strategyOverrides.jitterFactor === undefined
    ) {
      const baseDelayMs = strategyOverrides.baseDelayMs ?? 1000;
      const denominator = baseDelayMs > 0 ? baseDelayMs : 1;
      strategyConfig = {
        ...strategyOverrides,
        jitterFactor: Math.max(jitterMs / denominator, 0),
      };
    }

    this.strategy = new RetryStrategy(name, strategyConfig);
  }

  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    correlationId: string,
    operationName?: string
  ): Promise<T> {
    const result = await this.strategy.execute(
      operation,
      correlationId,
      operationName
    );

    if (result.success) {
      return result.data as T;
    }

    const error =
      result.error ??
      new Error(
        'Retry operation failed after all attempts without error details'
      );
    throw error;
  }

  public getMetrics(): RetryMetrics {
    return this.strategy.getMetrics();
  }

  public resetMetrics(): void {
    this.strategy.resetMetrics();
  }
}

/**
 * Retry strategy registry for managing multiple retry strategies
 */
export class RetryStrategyRegistry {
  private readonly strategies = new Map<string, RetryStrategy>();
  private readonly defaultConfig: RetryConfig;

  constructor(defaultConfig: Partial<RetryConfig> = {}) {
    this.defaultConfig = {
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
        'ECONNRESET',
        'ENOTFOUND',
        'ECONNREFUSED',
        'ETIMEDOUT',
      ],
      ...defaultConfig,
    };
  }

  /**
   * Get or create a retry strategy
   */
  public getStrategy(
    name: string,
    config?: Partial<RetryConfig>
  ): RetryStrategy {
    if (!this.strategies.has(name)) {
      const mergedConfig = { ...this.defaultConfig, ...config };
      this.strategies.set(name, new RetryStrategy(name, mergedConfig));
    }

    return this.strategies.get(name)!;
  }

  /**
   * Get all strategy metrics
   */
  public getAllMetrics(): Record<string, RetryMetrics> {
    const metrics: Record<string, RetryMetrics> = {};

    for (const [name, strategy] of this.strategies) {
      // Use Object.assign to safely set property
      Object.assign(metrics, { [name]: strategy.getMetrics() });
    }

    return metrics;
  }

  /**
   * Reset all strategy metrics
   */
  public resetAllMetrics(): void {
    for (const strategy of this.strategies.values()) {
      strategy.resetMetrics();
    }
  }

  /**
   * Remove a strategy
   */
  public remove(name: string): boolean {
    return this.strategies.delete(name);
  }

  /**
   * Get strategy names
   */
  public getNames(): string[] {
    return Array.from(this.strategies.keys());
  }
}

// Global retry strategy registry instance
export const retryStrategyRegistry = new RetryStrategyRegistry();

/**
 * Convenience function for simple retry operations
 */
export function withRetry<T>(
  operation: () => Promise<T>,
  correlationId: string,
  config?: Partial<RetryConfig>,
  operationName?: string,
  signal?: AbortSignal
): Promise<T> {
  const strategy = new RetryStrategy('default', config);

  const wrappedPromise = new Promise<T>((resolve, reject) => {
    strategy
      .execute(operation, correlationId, operationName, signal)
      .then((result) => {
        if (result.success && result.data !== undefined) {
          resolve(result.data);
        } else {
          reject(
            result.error ??
              new Error('Operation failed after all retry attempts')
          );
        }
      })
      .catch(reject);
  });

  // Attach a noop handler to avoid unhandled rejection warnings while keeping the rejection observable
  wrappedPromise.catch(() => {});

  return wrappedPromise;
}
