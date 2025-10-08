/**
 * Retry logic with exponential backoff, jitter, and maximum retry limits
 * Provides resilient operation execution with configurable retry strategies
 */

import { TimeoutError, NetworkError, AzureOpenAIError } from '../errors/index.js';

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
        'ETIMEDOUT'
      ],
      ...config
    };

    this.metrics = {
      totalAttempts: 0,
      successfulAttempts: 0,
      failedAttempts: 0,
      averageAttempts: 0,
      averageDurationMs: 0
    };
  }

  /**
   * Execute operation with retry logic
   */
  public async execute<T>(
    operation: () => Promise<T>,
    correlationId: string,
    operationName?: string
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    const attempts: RetryAttempt[] = [];
    let lastError: Error | undefined;
    let delayBeforeAttempt = 0;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      if (attempt > 1 && delayBeforeAttempt > 0) {
        await this.delay(delayBeforeAttempt);
      }

      const attemptStartTime = Date.now();
      const recordedDelay = attempt === 1 ? 0 : delayBeforeAttempt;
      
      try {
        // Add timeout wrapper if configured
        const result = this.config.timeoutMs 
          ? await this.withTimeout(operation(), this.config.timeoutMs, correlationId, operationName)
          : await operation();

        // Success - record attempt and return
        attempts.push({
          attemptNumber: attempt,
          delayMs: recordedDelay,
          timestamp: new Date(attemptStartTime)
        });

        const totalDurationMs = Date.now() - startTime;
        this.updateMetrics(true, attempt, totalDurationMs);

        return {
          success: true,
          data: result,
          attempts,
          totalDurationMs
        };

      } catch (error) {
        lastError = error as Error;

        attempts.push({
          attemptNumber: attempt,
          delayMs: recordedDelay,
          error: lastError,
          timestamp: new Date(attemptStartTime)
        });

        // Check if error is retryable
        if (!this.isRetryableError(lastError) || attempt === this.config.maxAttempts) {
          break;
        }

        delayBeforeAttempt = this.calculateDelay(attempt);
      }
    }

    // All attempts failed
    const totalDurationMs = Date.now() - startTime;
    this.updateMetrics(false, attempts.length, totalDurationMs);

    return {
      success: false,
      error: lastError,
      attempts,
      totalDurationMs
    };
  }

  /**
   * Check if error is retryable based on configuration
   */
  private isRetryableError(error: Error): boolean {
    const errorName = error.name || '';
    const errorMessage = error.message || '';
    const errorCode = (error as any).code;

    return this.config.retryableErrors.some(retryableError => 
      errorName.includes(retryableError) ||
      errorMessage.includes(retryableError) ||
      (errorCode && typeof errorCode === 'string' && errorCode.includes(retryableError))
    );
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private calculateDelay(attemptNumber: number): number {
    // Exponential backoff: baseDelay * (multiplier ^ (attempt - 1))
    const exponentialDelay = this.config.baseDelayMs * 
      Math.pow(this.config.backoffMultiplier, attemptNumber - 1);

    // Apply maximum delay limit
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs);

    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * this.config.jitterFactor * (Math.random() - 0.5);
    const finalDelay = Math.max(0, cappedDelay + jitter);

    return Math.round(finalDelay);
  }

  /**
   * Delay execution for specified milliseconds
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Wrap operation with timeout
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    correlationId: string,
    operationName?: string
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new TimeoutError(
          `Operation timed out after ${timeoutMs}ms`,
          correlationId,
          timeoutMs,
          operationName
        ));
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  /**
   * Update retry metrics
   */
  private updateMetrics(success: boolean, attempts: number, durationMs: number): void {
    const totalOperations = this.metrics.successfulAttempts + this.metrics.failedAttempts + 1;
    
    this.metrics = {
      totalAttempts: this.metrics.totalAttempts + attempts,
      successfulAttempts: success ? this.metrics.successfulAttempts + 1 : this.metrics.successfulAttempts,
      failedAttempts: success ? this.metrics.failedAttempts : this.metrics.failedAttempts + 1,
      averageAttempts: (this.metrics.averageAttempts * (totalOperations - 1) + attempts) / totalOperations,
      averageDurationMs: (this.metrics.averageDurationMs * (totalOperations - 1) + durationMs) / totalOperations
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
      averageDurationMs: 0
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
        'ETIMEDOUT'
      ],
      ...defaultConfig
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
      metrics[name] = strategy.getMetrics();
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
  operationName?: string
): Promise<T> {
  const strategy = new RetryStrategy('default', config);

  const wrappedPromise = new Promise<T>((resolve, reject) => {
    strategy
      .execute(operation, correlationId, operationName)
      .then(result => {
        if (result.success && result.data !== undefined) {
          resolve(result.data);
        } else {
          reject(result.error || new Error('Operation failed after all retry attempts'));
        }
      })
      .catch(reject);
  });

  // Attach a noop handler to avoid unhandled rejection warnings while keeping the rejection observable
  wrappedPromise.catch(() => {});

  return wrappedPromise;
}
