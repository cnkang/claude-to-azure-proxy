/**
 * Network Error Handler with Retry Mechanisms
 *
 * Provides comprehensive network error handling with exponential backoff,
 * retry logic, and user-friendly error messages.
 *
 * Requirements: 6.3, 7.3
 */

import { frontendLogger } from './logger';

/**
 * Network error types
 */
export type NetworkErrorType =
  | 'connection_failed'
  | 'timeout'
  | 'server_error'
  | 'client_error'
  | 'rate_limited'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation_error'
  | 'unknown';

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryableErrors: NetworkErrorType[];
}

/**
 * Network error class
 */
export class NetworkError extends Error {
  public readonly type: NetworkErrorType;
  public readonly statusCode?: number;
  public readonly correlationId: string;
  public readonly timestamp: Date;
  public readonly retryable: boolean;
  public readonly originalError?: Error;

  constructor(
    message: string,
    type: NetworkErrorType,
    options: {
      statusCode?: number;
      correlationId?: string;
      retryable?: boolean;
      originalError?: Error;
    } = {}
  ) {
    super(message);
    this.name = 'NetworkError';
    this.type = type;
    this.statusCode = options.statusCode;
    this.correlationId = options.correlationId ?? crypto.randomUUID();
    this.timestamp = new Date();
    this.retryable = options.retryable ?? this.isRetryableByDefault(type);
    this.originalError = options.originalError;
  }

  private isRetryableByDefault(type: NetworkErrorType): boolean {
    const retryableTypes: NetworkErrorType[] = [
      'connection_failed',
      'timeout',
      'server_error',
      'rate_limited',
    ];
    return retryableTypes.includes(type);
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      statusCode: this.statusCode,
      correlationId: this.correlationId,
      timestamp: this.timestamp.toISOString(),
      retryable: this.retryable,
      stack: this.stack,
    };
  }
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffFactor: 2,
  retryableErrors: [
    'connection_failed',
    'timeout',
    'server_error',
    'rate_limited',
  ],
};

/**
 * Network error handler class
 */
export class NetworkErrorHandler {
  private readonly retryConfig: RetryConfig;

  constructor(retryConfig: Partial<RetryConfig> = {}) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  /**
   * Classify error based on response or error type
   */
  public classifyError(error: unknown, response?: Response): NetworkError {
    // Handle Response objects
    if (response) {
      return this.classifyResponseError(response);
    }

    // Handle Error objects
    if (error instanceof Error) {
      return this.classifyJavaScriptError(error);
    }

    // Handle unknown errors
    return new NetworkError('An unknown error occurred', 'unknown', {
      originalError: error instanceof Error ? error : new Error(String(error)),
    });
  }

  /**
   * Classify HTTP response errors
   */
  private classifyResponseError(response: Response): NetworkError {
    const statusCode = response.status;
    let type: NetworkErrorType;
    let message: string;

    switch (true) {
      case statusCode === 400:
        type = 'validation_error';
        message = 'Invalid request data';
        break;
      case statusCode === 401:
        type = 'unauthorized';
        message = 'Authentication required';
        break;
      case statusCode === 403:
        type = 'forbidden';
        message = 'Access denied';
        break;
      case statusCode === 404:
        type = 'not_found';
        message = 'Resource not found';
        break;
      case statusCode === 429:
        type = 'rate_limited';
        message = 'Too many requests';
        break;
      case statusCode >= 400 && statusCode < 500:
        type = 'client_error';
        message = `Client error: ${statusCode}`;
        break;
      case statusCode >= 500:
        type = 'server_error';
        message = `Server error: ${statusCode}`;
        break;
      default:
        type = 'unknown';
        message = `Unexpected status: ${statusCode}`;
    }

    return new NetworkError(message, type, { statusCode });
  }

  /**
   * Classify JavaScript errors
   */
  private classifyJavaScriptError(error: Error): NetworkError {
    const message = error.message.toLowerCase();
    let type: NetworkErrorType;
    let errorMessage: string;

    switch (true) {
      case message.includes('network') || message.includes('fetch'):
        type = 'connection_failed';
        errorMessage = 'Network connection failed';
        break;
      case message.includes('timeout') || message.includes('aborted'):
        type = 'timeout';
        errorMessage = 'Request timed out';
        break;
      case message.includes('cors'):
        type = 'client_error';
        errorMessage = 'Cross-origin request blocked';
        break;
      default:
        type = 'unknown';
        errorMessage = error.message || 'An unexpected error occurred';
    }

    return new NetworkError(errorMessage, type, { originalError: error });
  }

  /**
   * Execute request with retry logic
   */
  public async executeWithRetry<T>(
    requestFn: () => Promise<T>,
    options: {
      retryConfig?: Partial<RetryConfig>;
      onRetry?: (attempt: number, _error: NetworkError) => void;
      onError?: (_error: NetworkError) => void;
    } = {}
  ): Promise<T> {
    const config = { ...this.retryConfig, ...options.retryConfig };
    let lastError: NetworkError | null = null;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        const networkError =
          error instanceof NetworkError ? error : this.classifyError(error);

        lastError = networkError;

        // Log the error
        frontendLogger.error(
          `Request failed (attempt ${attempt}/${config.maxAttempts})`,
          {
            error: networkError,
            metadata: {
              attempt,
              maxAttempts: config.maxAttempts,
              errorType: networkError.type,
              retryable: networkError.retryable,
              correlationId: networkError.correlationId,
            },
          }
        );

        // Call error handler
        options.onError?.(networkError);

        // Check if we should retry
        if (
          attempt >= config.maxAttempts ||
          !networkError.retryable ||
          !config.retryableErrors.includes(networkError.type)
        ) {
          throw networkError;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          config.initialDelay * Math.pow(config.backoffFactor, attempt - 1),
          config.maxDelay
        );

        // Add jitter to prevent thundering herd
        const jitteredDelay = delay + Math.random() * 1000;

        frontendLogger.info(
          `Retrying request in ${Math.round(jitteredDelay)}ms`,
          {
            metadata: {
              attempt: attempt + 1,
              maxAttempts: config.maxAttempts,
              delay: jitteredDelay,
              correlationId: networkError.correlationId,
            },
          }
        );

        // Call retry handler
        options.onRetry?.(attempt, networkError);

        // Wait before retry
        await this.delay(jitteredDelay);
      }
    }

    // This should never be reached, but TypeScript requires it
    throw (
      lastError ??
      new NetworkError('Maximum retry attempts exceeded', 'unknown')
    );
  }

  /**
   * Execute fetch request with error handling and retry
   */
  public async fetchWithRetry(
    url: string,
    init?: RequestInit,
    options: {
      retryConfig?: Partial<RetryConfig>;
      timeout?: number;
      onRetry?: (attempt: number, _error: NetworkError) => void;
      onError?: (_error: NetworkError) => void;
    } = {}
  ): Promise<Response> {
    const { timeout = 30000, ...retryOptions } = options;

    return this.executeWithRetry(async () => {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          ...init,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Check if response is ok
        if (!response.ok) {
          throw this.classifyResponseError(response);
        }

        return response;
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof NetworkError) {
          throw error;
        }

        throw this.classifyError(error);
      }
    }, retryOptions);
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if error is retryable
   */
  public isRetryable(error: NetworkError): boolean {
    return (
      error.retryable && this.retryConfig.retryableErrors.includes(error.type)
    );
  }

  /**
   * Get user-friendly error message
   */
  public getUserFriendlyMessage(
    error: NetworkError,
    t: (key: string, options?: Record<string, unknown>) => string
  ): string {
    switch (error.type) {
      case 'connection_failed':
        return t('error.network.connectionFailed');
      case 'timeout':
        return t('error.network.timeout');
      case 'server_error':
        return t('error.network.serverError');
      case 'rate_limited':
        return t('error.network.rateLimited');
      case 'unauthorized':
        return t('error.network.unauthorized');
      case 'forbidden':
        return t('error.network.forbidden');
      case 'not_found':
        return t('error.network.notFound');
      case 'validation_error':
        return t('error.network.validationError');
      default:
        return t('error.network.unknown');
    }
  }

  /**
   * Get retry suggestion message
   */
  public getRetrySuggestion(
    error: NetworkError,
    t: (key: string, options?: Record<string, unknown>) => string
  ): string | null {
    if (!error.retryable) {
      return null;
    }

    switch (error.type) {
      case 'connection_failed':
        return t('error.network.retryConnection');
      case 'timeout':
        return t('error.network.retryTimeout');
      case 'server_error':
        return t('error.network.retryServer');
      case 'rate_limited':
        return t('error.network.retryRateLimit');
      default:
        return t('error.network.retryGeneric');
    }
  }
}

/**
 * Global network error handler instance
 */
export const networkErrorHandler = new NetworkErrorHandler();

/**
 * Utility functions
 */
export const networkUtils = {
  /**
   * Check if online
   */
  isOnline(): boolean {
    return navigator.onLine;
  },

  /**
   * Wait for online status
   */
  waitForOnline(): Promise<void> {
    return new Promise((resolve) => {
      if (navigator.onLine) {
        resolve();
        return;
      }

      const handleOnline = (): void => {
        window.removeEventListener('online', handleOnline);
        resolve();
      };

      window.addEventListener('online', handleOnline);
    });
  },

  /**
   * Create timeout signal
   */
  createTimeoutSignal(timeout: number): AbortSignal {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeout);
    return controller.signal;
  },

  /**
   * Combine abort signals
   */
  combineSignals(...signals: (AbortSignal | undefined)[]): AbortSignal {
    const controller = new AbortController();

    for (const signal of signals) {
      if (signal?.aborted === true) {
        controller.abort();
        break;
      }

      signal?.addEventListener('abort', () => controller.abort(), {
        once: true,
      });
    }

    return controller.signal;
  },
};
