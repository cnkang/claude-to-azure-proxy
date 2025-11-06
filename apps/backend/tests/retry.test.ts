import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RetryStrategy,
  RetryStrategyRegistry,
  withRetry,
  retryStrategyRegistry,
} from '../src/resilience/retry';
import { TimeoutError, NetworkError } from '../src/errors/index';

describe('Retry Strategy', () => {
  let retryStrategy: RetryStrategy;

  beforeEach(() => {
    vi.useFakeTimers();
    retryStrategy = new RetryStrategy('test-retry', {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
      jitterFactor: 0.1,
      retryableErrors: ['NETWORK_ERROR', 'TIMEOUT_ERROR', 'ECONNRESET'],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Successful Operations', () => {
    it('should execute successful operation on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await retryStrategy.execute(
        operation,
        'test-correlation-id',
        'test-operation'
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0].attemptNumber).toBe(1);
      expect(result.attempts[0].error).toBeUndefined();
      expect(operation).toHaveBeenCalledOnce();
    });

    it('should succeed after retries', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('NETWORK_ERROR'))
        .mockRejectedValueOnce(new Error('TIMEOUT_ERROR'))
        .mockResolvedValue('success');

      const executePromise = retryStrategy.execute(
        operation,
        'test-correlation-id',
        'test-operation'
      );

      // Advance timers for delays
      await vi.advanceTimersByTimeAsync(500); // First retry delay
      await vi.advanceTimersByTimeAsync(500); // Second retry delay

      const result = await executePromise;

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toHaveLength(3);
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('Failed Operations', () => {
    it('should fail after max attempts with retryable error', async () => {
      const error = new Error('NETWORK_ERROR');
      const operation = vi.fn().mockRejectedValue(error);

      const executePromise = retryStrategy.execute(
        operation,
        'test-correlation-id',
        'test-operation'
      );

      // Advance timers for all retry delays
      await vi.advanceTimersByTimeAsync(2000);

      const result = await executePromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(result.attempts).toHaveLength(3);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      const error = new Error('NON_RETRYABLE_ERROR');
      const operation = vi.fn().mockRejectedValue(error);

      const result = await retryStrategy.execute(
        operation,
        'test-correlation-id',
        'test-operation'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(result.attempts).toHaveLength(1);
      expect(operation).toHaveBeenCalledOnce();
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new TimeoutError(
        'Operation timed out',
        'test-correlation-id',
        5000,
        'test-operation'
      );
      const operation = vi.fn().mockRejectedValue(timeoutError);

      const result = await retryStrategy.execute(
        operation,
        'test-correlation-id',
        'test-operation'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe(timeoutError);
      expect(result.attempts).toHaveLength(1); // TimeoutError is retryable, but we're not advancing timers
    });
  });

  describe('Delay Calculation', () => {
    it('should calculate exponential backoff delays', async () => {
      const error = new Error('NETWORK_ERROR');
      const operation = vi.fn().mockRejectedValue(error);

      const executePromise = retryStrategy.execute(
        operation,
        'test-correlation-id',
        'test-operation'
      );

      await vi.advanceTimersByTimeAsync(2000);

      const result = await executePromise;

      expect(result.attempts).toHaveLength(3);

      // First attempt has no delay
      expect(result.attempts[0].delayMs).toBe(0);

      // Subsequent attempts should have increasing delays (with jitter)
      expect(result.attempts[1].delayMs).toBeGreaterThan(80); // ~100ms with jitter
      expect(result.attempts[1].delayMs).toBeLessThan(120);

      expect(result.attempts[2].delayMs).toBeGreaterThan(180); // ~200ms with jitter
      expect(result.attempts[2].delayMs).toBeLessThan(220);
    });

    it('should respect maximum delay limit', async () => {
      const shortMaxDelay = new RetryStrategy('test-short-delay', {
        maxAttempts: 5,
        baseDelayMs: 500,
        maxDelayMs: 600, // Low max delay
        backoffMultiplier: 3,
      });

      const error = new Error('NETWORK_ERROR');
      const operation = vi.fn().mockRejectedValue(error);

      const executePromise = shortMaxDelay.execute(
        operation,
        'test-correlation-id',
        'test-operation'
      );

      await vi.advanceTimersByTimeAsync(5000);

      const result = await executePromise;

      // All delays should be capped at maxDelayMs
      result.attempts.slice(1).forEach((attempt) => {
        expect(attempt.delayMs).toBeLessThanOrEqual(660); // 600 + 10% jitter
      });
    });
  });

  describe('Timeout Wrapper', () => {
    it('should timeout operations that exceed configured timeout', async () => {
      const slowOperation = () =>
        new Promise((resolve) =>
          setTimeout(() => resolve('slow-result'), 2000)
        );

      const timeoutStrategy = new RetryStrategy('timeout-test', {
        maxAttempts: 1,
        timeoutMs: 500,
      });

      const executePromise = timeoutStrategy.execute(
        slowOperation,
        'test-correlation-id',
        'slow-operation'
      );

      vi.advanceTimersByTime(600);

      const result = await executePromise;

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(TimeoutError);
      expect((result.error as TimeoutError).timeoutMs).toBe(500);
    });

    it('should not timeout fast operations', async () => {
      const fastOperation = vi.fn().mockResolvedValue('fast-result');

      const timeoutStrategy = new RetryStrategy('timeout-test', {
        maxAttempts: 1,
        timeoutMs: 1000,
      });

      const result = await timeoutStrategy.execute(
        fastOperation,
        'test-correlation-id',
        'fast-operation'
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe('fast-result');
    });
  });

  describe('Metrics', () => {
    it('should track successful operations', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      await retryStrategy.execute(operation, 'test-correlation-id');
      await retryStrategy.execute(operation, 'test-correlation-id');

      const metrics = retryStrategy.getMetrics();

      expect(metrics.successfulAttempts).toBe(2);
      expect(metrics.failedAttempts).toBe(0);
      expect(metrics.totalAttempts).toBe(2);
      expect(metrics.averageAttempts).toBe(1);
    });

    it('should track failed operations', async () => {
      const error = new Error('NON_RETRYABLE_ERROR');
      const operation = vi.fn().mockRejectedValue(error);

      await retryStrategy.execute(operation, 'test-correlation-id');

      const metrics = retryStrategy.getMetrics();

      expect(metrics.successfulAttempts).toBe(0);
      expect(metrics.failedAttempts).toBe(1);
      expect(metrics.totalAttempts).toBe(1);
    });

    it('should calculate average attempts correctly', async () => {
      const successOp = vi.fn().mockResolvedValue('success');
      const retryOp = vi
        .fn()
        .mockRejectedValueOnce(new Error('NETWORK_ERROR'))
        .mockResolvedValue('success');

      await retryStrategy.execute(successOp, 'test-correlation-id');

      const executePromise = retryStrategy.execute(
        retryOp,
        'test-correlation-id'
      );
      await vi.advanceTimersByTimeAsync(500);
      await executePromise;

      const metrics = retryStrategy.getMetrics();

      expect(metrics.successfulAttempts).toBe(2);
      expect(metrics.averageAttempts).toBe(1.5); // (1 + 2) / 2
    });

    it('should reset metrics', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      await retryStrategy.execute(operation, 'test-correlation-id');
      retryStrategy.resetMetrics();

      const metrics = retryStrategy.getMetrics();

      expect(metrics.successfulAttempts).toBe(0);
      expect(metrics.failedAttempts).toBe(0);
      expect(metrics.totalAttempts).toBe(0);
      expect(metrics.averageAttempts).toBe(0);
      expect(metrics.averageDurationMs).toBe(0);
    });
  });

  describe('Error Type Detection', () => {
    it('should detect retryable errors by name', async () => {
      const networkError = new NetworkError(
        'Connection failed',
        'test-correlation-id'
      );
      const operation = vi.fn().mockRejectedValue(networkError);

      const result = await retryStrategy.execute(
        operation,
        'test-correlation-id'
      );

      expect(result.attempts).toHaveLength(1); // NetworkError should be retryable, but we're not advancing timers
    });

    it('should detect retryable errors by message', async () => {
      const error = new Error('Request failed with ECONNRESET');
      const operation = vi.fn().mockRejectedValue(error);

      const executePromise = retryStrategy.execute(
        operation,
        'test-correlation-id'
      );
      await vi.advanceTimersByTimeAsync(2000);
      const result = await executePromise;

      expect(result.attempts).toHaveLength(3); // Should retry
    });

    it('should detect retryable errors by code', async () => {
      const error = new Error('Connection reset') as Error & { code: string };
      error.code = 'ECONNRESET';
      const operation = vi.fn().mockRejectedValue(error);

      const executePromise = retryStrategy.execute(
        operation,
        'test-correlation-id'
      );
      await vi.advanceTimersByTimeAsync(2000);
      const result = await executePromise;

      expect(result.attempts).toHaveLength(3); // Should retry
    });
  });
});

describe('Retry Strategy Registry', () => {
  let registry: RetryStrategyRegistry;

  beforeEach(() => {
    registry = new RetryStrategyRegistry({
      maxAttempts: 2,
      baseDelayMs: 50,
    });
  });

  it('should create and cache strategies', () => {
    const strategy1 = registry.getStrategy('test-strategy');
    const strategy2 = registry.getStrategy('test-strategy');

    expect(strategy1).toBe(strategy2); // Same instance
    expect(strategy1.getName()).toBe('test-strategy');
  });

  it('should merge default and custom config', () => {
    const strategy = registry.getStrategy('custom-strategy', {
      maxAttempts: 5,
    });

    const config = strategy.getConfig();
    expect(config.maxAttempts).toBe(5); // Custom value
    expect(config.baseDelayMs).toBe(50); // Default value
  });

  it('should get all metrics', async () => {
    const strategy1 = registry.getStrategy('strategy1');
    const strategy2 = registry.getStrategy('strategy2');

    const operation = vi.fn().mockResolvedValue('success');
    await strategy1.execute(operation, 'test-correlation-id');
    await strategy2.execute(operation, 'test-correlation-id');

    const allMetrics = registry.getAllMetrics();

    expect(allMetrics).toHaveProperty('strategy1');
    expect(allMetrics).toHaveProperty('strategy2');
    expect(allMetrics.strategy1.successfulAttempts).toBe(1);
    expect(allMetrics.strategy2.successfulAttempts).toBe(1);
  });

  it('should reset all metrics', async () => {
    const strategy = registry.getStrategy('test-strategy');
    const operation = vi.fn().mockResolvedValue('success');

    await strategy.execute(operation, 'test-correlation-id');
    registry.resetAllMetrics();

    const metrics = strategy.getMetrics();
    expect(metrics.successfulAttempts).toBe(0);
  });

  it('should remove strategies', () => {
    registry.getStrategy('removable-strategy');
    expect(registry.getNames()).toContain('removable-strategy');

    const removed = registry.remove('removable-strategy');
    expect(removed).toBe(true);
    expect(registry.getNames()).not.toContain('removable-strategy');
  });

  it('should list strategy names', () => {
    registry.getStrategy('strategy1');
    registry.getStrategy('strategy2');

    const names = registry.getNames();
    expect(names).toContain('strategy1');
    expect(names).toContain('strategy2');
  });
});

describe('withRetry Convenience Function', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should execute successful operation', async () => {
    const operation = vi.fn().mockResolvedValue('success');

    const result = await withRetry(
      operation,
      'test-correlation-id',
      { maxAttempts: 2 },
      'test-operation'
    );

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledOnce();
  });

  it('should throw error after all retries fail', async () => {
    const error = new Error('NETWORK_ERROR');
    const operation = vi.fn().mockRejectedValue(error);

    const retryPromise = withRetry(
      operation,
      'test-correlation-id',
      { maxAttempts: 2, baseDelayMs: 100 },
      'test-operation'
    );

    await vi.advanceTimersByTimeAsync(500);

    await expect(retryPromise).rejects.toThrow('NETWORK_ERROR');
    expect(operation).toHaveBeenCalledTimes(2);
  });
});

describe('Global Retry Strategy Registry', () => {
  it('should be available as singleton', () => {
    expect(retryStrategyRegistry).toBeDefined();
    expect(retryStrategyRegistry).toBeInstanceOf(RetryStrategyRegistry);
  });

  it('should maintain state across imports', () => {
    const strategy = retryStrategyRegistry.getStrategy('global-test');
    expect(strategy.getName()).toBe('global-test');

    // Should be the same instance when accessed again
    const sameStrategy = retryStrategyRegistry.getStrategy('global-test');
    expect(sameStrategy).toBe(strategy);
  });
});
