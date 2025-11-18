/**
 * Retry Manager with Exponential Backoff
 *
 * Provides automatic retry logic with exponential backoff for persistence operations.
 * Requirements: 7.1, 7.2
 */

/* eslint-disable no-console */

/**
 * Retry options for execute method
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Base delay in milliseconds (default: 500) */
  baseDelay?: number;
  /** Maximum delay in milliseconds (default: 5000) */
  maxDelay?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Whether to use jitter (±30% random variation) (default: true) */
  useJitter?: boolean;
  /** Timeout in milliseconds for each attempt (default: 30000) */
  timeout?: number;
  /** Callback invoked before each retry */
  onRetry?: (attempt: number, error: Error, delay: number) => void;
  /** Callback invoked when all retries fail */
  onFailure?: (error: Error, attempts: number) => void;
  /** Custom error classification function */
  isRetryable?: (error: Error) => boolean;
}

/**
 * Default retry options
 */
const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'onFailure' | 'isRetryable'>> = {
  maxAttempts: 3,
  baseDelay: 500,
  maxDelay: 5000,
  backoffMultiplier: 2,
  useJitter: true,
  timeout: 30000,
};

/**
 * Result of a safe execution
 */
export interface ExecutionResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDuration: number;
}

/**
 * Retry manager class
 */
export class RetryManager {
  private readonly defaultOptions: Partial<RetryOptions>;

  constructor(defaultOptions: Partial<RetryOptions> = {}) {
    this.defaultOptions = defaultOptions;
  }

  /**
   * Execute operation with retry logic and exponential backoff
   *
   * @param operation - Async operation to execute
   * @param options - Retry options
   * @returns Result of the operation
   * @throws Error if all retry attempts fail
   */
  public async execute<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    // Wrap the entire execution in a promise with comprehensive error handling
    return new Promise<T>((resolve, reject) => {
      // Track if promise has been settled to prevent multiple settlements
      let settled = false;
      
      // Safe resolve that prevents multiple settlements
      const safeResolve = (value: T): void => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };
      
      // Safe reject that prevents multiple settlements
      const safeReject = (error: Error): void => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      // Execute the retry logic in an async IIFE with global error handling
      (async (): Promise<void> => {
        try {
          const mergedOptions = { ...DEFAULT_RETRY_OPTIONS, ...this.defaultOptions, ...options };
          const {
            maxAttempts,
            baseDelay,
            maxDelay,
            backoffMultiplier,
            useJitter,
            timeout,
            onRetry,
            onFailure,
            isRetryable,
          } = mergedOptions;

          // Ensure at least 1 attempt
          const effectiveMaxAttempts = Math.max(1, maxAttempts);

          let lastError: Error | null = null;
          let attempt = 0;

          while (attempt < effectiveMaxAttempts) {
            attempt++;

            try {
              // Execute operation with timeout - wrap in Promise.resolve for safety
              const result = await Promise.resolve()
                .then(() => this.executeWithTimeout(operation, timeout))
                .catch((error) => {
                  // Ensure error is properly caught and re-thrown
                  throw error instanceof Error ? error : new Error(String(error));
                });
              
              safeResolve(result);
              return;
            } catch (error) {
              lastError = error instanceof Error ? error : new Error(String(error));

              // Check if error is retryable
              const retryable = isRetryable
                ? isRetryable(lastError)
                : this.defaultIsRetryable(lastError);

              // If not retryable or last attempt, fail immediately
              if (!retryable || attempt >= effectiveMaxAttempts) {
                if (onFailure) {
                  try {
                    onFailure(lastError, attempt);
                  } catch (callbackError) {
                    // Log callback errors but don't let them affect the main flow
                    console.warn('Error in onFailure callback:', callbackError);
                  }
                }
                safeReject(lastError);
                return;
              }

              // Calculate delay with exponential backoff
              const delay = this.calculateDelay(
                attempt,
                baseDelay,
                maxDelay,
                backoffMultiplier,
                useJitter
              );

              // Call onRetry callback with error handling
              if (onRetry) {
                try {
                  onRetry(attempt, lastError, delay);
                } catch (callbackError) {
                  // Log callback errors but don't let them affect the main flow
                  console.warn('Error in onRetry callback:', callbackError);
                }
              }

              // Wait before next retry - wrap in try-catch for safety
              try {
                await this.sleep(delay);
              } catch (sleepError) {
                // Sleep should never fail, but handle it just in case
                console.warn('Error during sleep:', sleepError);
              }
            }
          }

          // This should never be reached, but handle it gracefully
          if (onFailure && lastError) {
            try {
              onFailure(lastError, attempt);
            } catch (callbackError) {
              console.warn('Error in final onFailure callback:', callbackError);
            }
          }
          safeReject(lastError ?? new Error('Operation failed after all retry attempts'));
        } catch (error) {
          // Catch any unexpected errors in the retry logic itself
          const finalError = error instanceof Error ? error : new Error(String(error));
          console.error('Unexpected error in retry logic:', finalError);
          safeReject(finalError);
        }
      })().catch((error) => {
        // Final safety net: catch any unhandled promise rejections from the IIFE
        const finalError = error instanceof Error ? error : new Error(String(error));
        console.error('Unhandled error in execute method:', finalError);
        safeReject(finalError);
      });
    });
  }

  /**
   * Execute operation safely without throwing
   *
   * @param operation - Async operation to execute
   * @param options - Retry options
   * @returns Execution result with success/error information
   */
  public async executeSafe<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<ExecutionResult<T>> {
    const startTime = Date.now();
    let attempts = 0;

    try {
      // Wrap execute call with comprehensive error handling
      const result = await Promise.resolve()
        .then(() =>
          this.execute(operation, {
            ...options,
            onRetry: (attempt, error, delay) => {
              attempts = attempt;
              if (options.onRetry) {
                try {
                  options.onRetry(attempt, error, delay);
                } catch (callbackError) {
                  console.warn('Error in onRetry callback:', callbackError);
                }
              }
            },
            onFailure: (error, finalAttempts) => {
              attempts = finalAttempts;
              if (options.onFailure) {
                try {
                  options.onFailure(error, finalAttempts);
                } catch (callbackError) {
                  console.warn('Error in onFailure callback:', callbackError);
                }
              }
            },
          })
        )
        .catch((error) => {
          // Ensure error is properly caught
          throw error instanceof Error ? error : new Error(String(error));
        });

      return {
        success: true,
        result,
        attempts: attempts || 1,
        totalDuration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        attempts: attempts || 1,
        totalDuration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute multiple operations in parallel with retry logic
   *
   * @param operations - Array of async operations to execute
   * @param options - Retry options
   * @returns Array of execution results
   */
  public async executeAll<T>(
    operations: Array<() => Promise<T>>,
    options: RetryOptions = {}
  ): Promise<Array<ExecutionResult<T>>> {
    try {
      // Map operations to executeSafe calls with individual error handling
      const promises = operations.map((operation, index) => {
        return this.executeSafe(operation, options).catch((error) => {
          // This should never happen since executeSafe doesn't throw,
          // but add a safety net just in case
          console.error(`Unexpected error in executeAll for operation ${index}:`, error);
          return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
            attempts: 1,
            totalDuration: 0,
          } as ExecutionResult<T>;
        });
      });

      // Wait for all operations to complete
      return await Promise.all(promises);
    } catch (error) {
      // Final safety net: if Promise.all somehow fails, return error results
      console.error('Unexpected error in executeAll:', error);
      return operations.map(() => ({
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        attempts: 0,
        totalDuration: 0,
      }));
    }
  }

  /**
   * Execute operation with timeout
   *
   * @param operation - Async operation to execute
   * @param timeout - Timeout in milliseconds
   * @returns Result of the operation
   * @throws Error if operation times out
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    // If no timeout specified, execute operation directly with error handling
    if (timeout <= 0) {
      try {
        return await Promise.resolve().then(() => operation());
      } catch (error) {
        throw error instanceof Error ? error : new Error(String(error));
      }
    }

    return new Promise<T>((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let settled = false;
      
      // Safe resolve that prevents multiple settlements
      const safeResolve = (value: T): void => {
        if (!settled) {
          settled = true;
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          resolve(value);
        }
      };
      
      // Safe reject that prevents multiple settlements
      const safeReject = (error: Error): void => {
        if (!settled) {
          settled = true;
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          reject(error);
        }
      };
      
      // Set up timeout with error handling
      try {
        timeoutId = setTimeout(() => {
          safeReject(new Error(`Operation timed out after ${timeout}ms`));
        }, timeout);
      } catch (error) {
        // setTimeout should never fail, but handle it just in case
        safeReject(new Error('Failed to set timeout: ' + String(error)));
        return;
      }
      
      // Execute operation with comprehensive error handling
      // Immediately attach catch handler to prevent unhandled rejection warnings
      Promise.resolve()
        .then(() => operation())
        .then(
          (result) => safeResolve(result),
          (error) => safeReject(error instanceof Error ? error : new Error(String(error)))
        )
        .catch((error) => {
          // Final safety net for any unhandled errors
          safeReject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  /**
   * Calculate delay for retry attempt using exponential backoff
   *
   * @param attempt - Current attempt number (1-based)
   * @param baseDelay - Base delay in milliseconds
   * @param maxDelay - Maximum delay in milliseconds
   * @param backoffMultiplier - Backoff multiplier
   * @param useJitter - Whether to add jitter
   * @returns Delay in milliseconds
   */
  private calculateDelay(
    attempt: number,
    baseDelay: number,
    maxDelay: number,
    backoffMultiplier: number,
    useJitter: boolean
  ): number {
    // Exponential backoff: baseDelay * (backoffMultiplier ^ (attempt - 1))
    const exponentialDelay = baseDelay * Math.pow(backoffMultiplier, attempt - 1);

    // Add jitter (0-100% random variation) to prevent thundering herd
    let delay = exponentialDelay;
    if (useJitter) {
      const jitterRange = exponentialDelay; // 100% of base delay
      const jitter = Math.random() * jitterRange; // 0 to 100%
      delay = exponentialDelay + jitter;
    }

    // Cap at maxDelay
    delay = Math.min(delay, maxDelay);

    return Math.floor(delay);
  }

  /**
   * Sleep for specified duration
   *
   * @param ms - Duration in milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Default error classification
   *
   * @param error - Error to check
   * @returns True if error is retryable
   */
  private defaultIsRetryable(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Non-retryable errors
    const nonRetryablePatterns = [
      'validation',
      'unauthorized',
      'forbidden',
      'not found',
      'invalid',
      'bad request',
    ];

    for (const pattern of nonRetryablePatterns) {
      if (message.includes(pattern)) {
        return false;
      }
    }

    // Retryable errors
    const retryablePatterns = ['network', 'timeout', 'connection', 'unavailable', 'temporary'];

    for (const pattern of retryablePatterns) {
      if (message.includes(pattern)) {
        return true;
      }
    }

    // Default: retry unknown errors
    return true;
  }
}

/**
 * Global retry manager instance
 */
export const retryManager = new RetryManager();

/**
 * Convenience function to execute operation with retry using global instance
 *
 * @param operation - Async operation to execute
 * @param options - Retry options
 * @returns Result of the operation
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  return retryManager.execute(operation, options);
}

/**
 * Convenience function to execute operation safely using global instance
 *
 * @param operation - Async operation to execute
 * @param options - Retry options
 * @returns Execution result with success/error information
 */
export async function executeWithRetrySafe<T>(
  operation: () => Promise<T>,
  options?: RetryOptions
): Promise<ExecutionResult<T>> {
  return retryManager.executeSafe(operation, options);
}

/**
 * Get the global retry manager instance
 *
 * @returns Global retry manager instance
 */
export function getRetryManager(): RetryManager {
  return retryManager;
}
