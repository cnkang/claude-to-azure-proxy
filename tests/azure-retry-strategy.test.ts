/**
 * Tests for Azure OpenAI retry strategy functionality
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  AzureRetryStrategy,
  withAzureRetry,
  createAzureRetryConfig,
  type AzureRetryContext,
} from '../src/utils/azure-retry-strategy.js';
import type { ResponsesCreateParams } from '../src/types/index.js';

describe('AzureRetryStrategy', () => {
  let retryStrategy: AzureRetryStrategy;
  const mockCorrelationId = 'test-correlation-id';
  const mockOperation = 'test-operation';

  beforeEach(() => {
    retryStrategy = new AzureRetryStrategy('test-strategy', {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
      jitterFactor: 0,
      timeoutMs: 5000,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('executeWithRetry', () => {
    it('should succeed on first attempt', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success');
      const context: AzureRetryContext = {
        correlationId: mockCorrelationId,
        operation: mockOperation,
        requestFormat: 'claude',
        originalParams: {
          model: 'test-model',
          input: 'test',
        } as ResponsesCreateParams,
      };

      const result = await retryStrategy.executeWithRetry(
        mockOperation,
        context
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toBe(1);
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const retryableError = new Error('rate_limit_error occurred');

      const mockOperation = vi
        .fn()
        .mockRejectedValueOnce(retryableError)
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValue('success');

      const context: AzureRetryContext = {
        correlationId: mockCorrelationId,
        operation: mockOperation,
        requestFormat: 'claude',
        originalParams: {
          model: 'test-model',
          input: 'test',
        } as ResponsesCreateParams,
      };

      const result = await retryStrategy.executeWithRetry(
        mockOperation,
        context
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toBe(3);
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should fail after max attempts', async () => {
      const retryableError = new Error('Service unavailable');
      retryableError.name = 'SERVICE_UNAVAILABLE_ERROR';

      const mockOperation = vi.fn().mockRejectedValue(retryableError);
      const context: AzureRetryContext = {
        correlationId: mockCorrelationId,
        operation: mockOperation,
        requestFormat: 'claude',
        originalParams: {
          model: 'test-model',
          input: 'test',
        } as ResponsesCreateParams,
      };

      const result = await retryStrategy.executeWithRetry(
        mockOperation,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.attempts).toBe(3);
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      const nonRetryableError = new Error('Invalid request');
      nonRetryableError.name = 'VALIDATION_ERROR';

      const mockOperation = vi.fn().mockRejectedValue(nonRetryableError);
      const context: AzureRetryContext = {
        correlationId: mockCorrelationId,
        operation: mockOperation,
        requestFormat: 'claude',
        originalParams: {
          model: 'test-model',
          input: 'test',
        } as ResponsesCreateParams,
      };

      const result = await retryStrategy.executeWithRetry(
        mockOperation,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.attempts).toBe(1);
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should handle timeout correctly', async () => {
      const slowOperation = vi
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 10000))
        );

      const context: AzureRetryContext = {
        correlationId: mockCorrelationId,
        operation: mockOperation,
        requestFormat: 'claude',
        originalParams: {
          model: 'test-model',
          input: 'test',
        } as ResponsesCreateParams,
      };

      const result = await retryStrategy.executeWithRetry(
        slowOperation,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('timed out');
    }, 10000); // Increase timeout for this test
  });

  describe('shouldRetryError', () => {
    it('should identify retryable Azure errors', () => {
      const retryableErrors = [
        { name: 'RATE_LIMIT_ERROR', message: 'Rate limit exceeded' },
        { name: 'NETWORK_ERROR', message: 'Network error' },
        { name: 'TIMEOUT_ERROR', message: 'Timeout' },
        { message: 'rate_limit_error occurred' },
        { message: 'overloaded_error occurred' },
        { message: 'api_error occurred' },
      ];

      for (const errorData of retryableErrors) {
        const error = new Error(errorData.message);
        if (typeof errorData.name === 'string' && errorData.name.length > 0) {
          error.name = errorData.name;
        }

        expect(AzureRetryStrategy.shouldRetryError(error)).toBe(true);
      }
    });

    it('should identify non-retryable errors', () => {
      const nonRetryableErrors = [
        { name: 'VALIDATION_ERROR', message: 'Invalid input' },
        { name: 'AUTHENTICATION_ERROR', message: 'Invalid API key' },
        { message: 'Some other error' },
      ];

      for (const errorData of nonRetryableErrors) {
        const error = new Error(errorData.message);
        if (typeof errorData.name === 'string' && errorData.name.length > 0) {
          error.name = errorData.name;
        }

        expect(AzureRetryStrategy.shouldRetryError(error)).toBe(false);
      }
    });

    it('should identify network errors by code', () => {
      const networkCodes = [
        'ECONNRESET',
        'ECONNREFUSED',
        'ENOTFOUND',
        'ENETUNREACH',
        'EHOSTUNREACH',
      ];

      for (const code of networkCodes) {
        const error = new Error('Network error');
        (error as any).code = code;

        expect(AzureRetryStrategy.shouldRetryError(error)).toBe(true);
      }
    });

    it('should identify timeout errors by code', () => {
      const timeoutError = new Error('Timeout');
      (timeoutError as any).code = 'ETIMEDOUT';

      expect(AzureRetryStrategy.shouldRetryError(timeoutError)).toBe(true);
    });

    it('should handle non-Error objects', () => {
      expect(AzureRetryStrategy.shouldRetryError('string error')).toBe(false);
      expect(AzureRetryStrategy.shouldRetryError(null)).toBe(false);
      expect(AzureRetryStrategy.shouldRetryError(undefined)).toBe(false);
      expect(AzureRetryStrategy.shouldRetryError({})).toBe(false);
    });
  });

  describe('extractRetryDelay', () => {
    it('should extract retry delay from Azure error response', () => {
      const azureError = {
        error: {
          type: 'rate_limit_error',
          message: 'Rate limit exceeded',
          retry_after: 60,
        },
      };

      const delay = AzureRetryStrategy.extractRetryDelay(azureError);
      expect(delay).toBe(60000); // Converted to milliseconds
    });

    it('should return undefined for errors without retry_after', () => {
      const azureError = {
        error: {
          type: 'api_error',
          message: 'API error',
        },
      };

      const delay = AzureRetryStrategy.extractRetryDelay(azureError);
      expect(delay).toBeUndefined();
    });

    it('should handle non-object errors', () => {
      expect(AzureRetryStrategy.extractRetryDelay('error')).toBeUndefined();
      expect(AzureRetryStrategy.extractRetryDelay(null)).toBeUndefined();
      expect(AzureRetryStrategy.extractRetryDelay(undefined)).toBeUndefined();
    });
  });

  describe('metrics', () => {
    it('should track retry metrics', async () => {
      const retryableError = new Error('rate_limit_error occurred');

      const mockOperation = vi
        .fn()
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValue('success');

      const context: AzureRetryContext = {
        correlationId: mockCorrelationId,
        operation: mockOperation,
        requestFormat: 'claude',
        originalParams: {
          model: 'test-model',
          input: 'test',
        } as ResponsesCreateParams,
      };

      await retryStrategy.executeWithRetry(mockOperation, context);

      const metrics = retryStrategy.getMetrics();
      expect(metrics.totalAttempts).toBeGreaterThan(0);
      expect(metrics.successfulAttempts).toBeGreaterThan(0);
    });

    it('should reset metrics', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success');
      const context: AzureRetryContext = {
        correlationId: mockCorrelationId,
        operation: mockOperation,
        requestFormat: 'claude',
        originalParams: {
          model: 'test-model',
          input: 'test',
        } as ResponsesCreateParams,
      };

      await retryStrategy.executeWithRetry(mockOperation, context);

      let metrics = retryStrategy.getMetrics();
      expect(metrics.totalAttempts).toBeGreaterThan(0);

      retryStrategy.resetMetrics();

      metrics = retryStrategy.getMetrics();
      expect(metrics.totalAttempts).toBe(0);
      expect(metrics.successfulAttempts).toBe(0);
      expect(metrics.failedAttempts).toBe(0);
    });
  });
});

describe('withAzureRetry', () => {
  it('should execute operation with retry and return result', async () => {
    const mockOperation = vi.fn().mockResolvedValue('success');
    const context: AzureRetryContext = {
      correlationId: 'test-id',
      operation: 'test-op',
      requestFormat: 'claude',
      originalParams: {
        model: 'test-model',
        input: 'test',
      } as ResponsesCreateParams,
    };

    const result = await withAzureRetry(mockOperation, context);

    expect(result).toBe('success');
    expect(mockOperation).toHaveBeenCalledTimes(1);
  });

  it('should throw error when all retries fail', async () => {
    const mockError = new Error('Persistent error');
    mockError.name = 'NETWORK_ERROR';

    const mockOperation = vi.fn().mockRejectedValue(mockError);
    const context: AzureRetryContext = {
      correlationId: 'test-id',
      operation: 'test-op',
      requestFormat: 'claude',
      originalParams: {
        model: 'test-model',
        input: 'test',
      } as ResponsesCreateParams,
    };

    await expect(
      withAzureRetry(mockOperation, context, { maxAttempts: 2 })
    ).rejects.toThrow('Persistent error');
  });
});

describe('createAzureRetryConfig', () => {
  it('should create default Azure retry configuration', () => {
    const config = createAzureRetryConfig();

    expect(config.maxAttempts).toBe(3);
    expect(config.baseDelayMs).toBe(1000);
    expect(config.maxDelayMs).toBe(30000);
    expect(config.backoffMultiplier).toBe(2);
    expect(config.jitterFactor).toBe(0.1);
    expect(config.timeoutMs).toBe(120000);
    expect(config.retryableErrors).toContain('NETWORK_ERROR');
    expect(config.retryableErrors).toContain('rate_limit_error');
  });

  it('should allow overriding default configuration', () => {
    const config = createAzureRetryConfig({
      maxAttempts: 5,
      baseDelayMs: 2000,
      timeoutMs: 120000,
    });

    expect(config.maxAttempts).toBe(5);
    expect(config.baseDelayMs).toBe(2000);
    expect(config.timeoutMs).toBe(120000);
    // Should keep other defaults
    expect(config.maxDelayMs).toBe(30000);
    expect(config.backoffMultiplier).toBe(2);
  });
});

describe('AzureRetryConfigs', () => {
  it('should provide predefined configurations for different operations', async () => {
    const { AzureRetryConfigs } = await import(
      '../src/utils/azure-retry-strategy.js'
    );

    expect(AzureRetryConfigs.completions).toBeDefined();
    expect(AzureRetryConfigs.streaming).toBeDefined();
    expect(AzureRetryConfigs.healthCheck).toBeDefined();
    expect(AzureRetryConfigs.models).toBeDefined();

    // Completions should have longer timeout
    expect(AzureRetryConfigs.completions.timeoutMs).toBe(240000);

    // Streaming should have fewer retries
    expect(AzureRetryConfigs.streaming.maxAttempts).toBe(2);

    // Health checks should be fast
    expect(AzureRetryConfigs.healthCheck.timeoutMs).toBe(10000);
  });
});
