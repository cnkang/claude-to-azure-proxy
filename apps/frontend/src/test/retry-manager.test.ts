/**
 * Unit tests for RetryManager
 *
 * Tests retry logic with exponential backoff, error classification,
 * timeout handling, and various retry scenarios.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RetryManager,
  retryManager,
  executeWithRetry,
  executeWithRetrySafe,
  type RetryOptions,
} from '../utils/retry-manager.js';

describe('RetryManager', () => {
  let manager: RetryManager;

  beforeEach(() => {
    manager = new RetryManager();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    // 1. Wait for all pending promises to settle
    await vi.runAllTimersAsync();

    // 2. Restore mocks
    vi.restoreAllMocks();

    // 3. Restore real timers
    vi.useRealTimers();

    // 4. Wait for microtask queue to clear
    await new Promise((resolve) => setImmediate(resolve));
  });

  describe('execute', () => {
    it('should execute operation successfully on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const promise = manager.execute(operation);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed on second attempt', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('temporary failure'))
        .mockResolvedValueOnce('success');

      const promise = manager.execute(operation);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry up to maxAttempts times', async () => {
      const operation = vi
        .fn()
        .mockImplementation(() =>
          Promise.reject(new Error('persistent failure'))
        );

      const promise = manager.execute(operation, { maxAttempts: 3 });
      const rejectionPromise = promise.catch((error) => error);
      await vi.runAllTimersAsync();
      const error = await rejectionPromise;

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('persistent failure');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff with base delay of 500ms', async () => {
      const operation = vi
        .fn()
        .mockImplementation(() => Promise.reject(new Error('failure')));
      const delays: number[] = [];

      const promise = manager.execute(operation, {
        maxAttempts: 3,
        baseDelay: 500,
        useJitter: false,
        onRetry: (_attempt, _error, delay) => {
          delays.push(delay);
        },
      });
      const rejectionPromise = promise.catch((error) => error);
      await vi.runAllTimersAsync();
      const error = await rejectionPromise;

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('failure');

      // Verify exponential backoff: 500ms, 1000ms
      expect(delays[0]).toBe(500); // 500 * 2^0 = 500
      expect(delays[1]).toBe(1000); // 500 * 2^1 = 1000
    });

    it('should respect maxDelay cap', async () => {
      const operation = vi
        .fn()
        .mockImplementation(() => Promise.reject(new Error('failure')));
      const delays: number[] = [];

      const promise = manager.execute(operation, {
        maxAttempts: 5,
        baseDelay: 1000,
        maxDelay: 2000,
        useJitter: false,
        onRetry: (_attempt, _error, delay) => {
          delays.push(delay);
        },
      });
      const rejectionPromise = promise.catch((error) => error);
      await vi.runAllTimersAsync();
      const error = await rejectionPromise;

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('failure');

      // All delays should be capped at 2000ms
      expect(delays[0]).toBe(1000); // 1000 * 2^0 = 1000
      expect(delays[1]).toBe(2000); // 1000 * 2^1 = 2000 (capped)
      expect(delays[2]).toBe(2000); // 1000 * 2^2 = 4000 -> capped to 2000
      expect(delays[3]).toBe(2000); // 1000 * 2^3 = 8000 -> capped to 2000
    });

    it('should add jitter when enabled', async () => {
      const operation = vi
        .fn()
        .mockImplementation(() => Promise.reject(new Error('failure')));
      const delays: number[] = [];

      const promise = manager.execute(operation, {
        maxAttempts: 3,
        baseDelay: 500,
        useJitter: true,
        onRetry: (_attempt, _error, delay) => {
          delays.push(delay);
        },
      });
      const rejectionPromise = promise.catch((error) => error);
      await vi.runAllTimersAsync();
      const error = await rejectionPromise;

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('failure');

      // Delays should be base + jitter (0-1000ms)
      expect(delays[0]).toBeGreaterThanOrEqual(500);
      expect(delays[0]).toBeLessThanOrEqual(1500);
      expect(delays[1]).toBeGreaterThanOrEqual(1000);
      expect(delays[1]).toBeLessThanOrEqual(2000);
    });

    it('should not retry non-retryable errors', async () => {
      const operation = vi
        .fn()
        .mockImplementation(() =>
          Promise.reject(new Error('validation failed'))
        );

      const promise = manager.execute(operation, {
        maxAttempts: 3,
        isRetryable: (error) => !error.message.includes('validation'),
      });
      const rejectionPromise = promise.catch((error) => error);
      await vi.runAllTimersAsync();
      const error = await rejectionPromise;

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('validation failed');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should classify errors correctly by default', async () => {
      // Non-retryable errors
      const validationError = vi
        .fn()
        .mockImplementation(() =>
          Promise.reject(new Error('validation error'))
        );
      const unauthorizedError = vi
        .fn()
        .mockImplementation(() => Promise.reject(new Error('unauthorized')));
      const notFoundError = vi
        .fn()
        .mockImplementation(() => Promise.reject(new Error('not found')));

      const validationPromise = manager.execute(validationError);
      const validationRejection = validationPromise.catch((error) => error);
      await vi.runAllTimersAsync();
      await validationRejection;
      expect(validationError).toHaveBeenCalledTimes(1);

      const unauthorizedPromise = manager.execute(unauthorizedError);
      const unauthorizedRejection = unauthorizedPromise.catch((error) => error);
      await vi.runAllTimersAsync();
      await unauthorizedRejection;
      expect(unauthorizedError).toHaveBeenCalledTimes(1);

      const notFoundPromise = manager.execute(notFoundError);
      const notFoundRejection = notFoundPromise.catch((error) => error);
      await vi.runAllTimersAsync();
      await notFoundRejection;
      expect(notFoundError).toHaveBeenCalledTimes(1);

      // Retryable errors
      const networkError = vi
        .fn()
        .mockImplementation(() => Promise.reject(new Error('network error')));
      const timeoutError = vi
        .fn()
        .mockImplementation(() => Promise.reject(new Error('timeout')));

      const networkPromise = manager.execute(networkError, { maxAttempts: 2 });
      const networkRejection = networkPromise.catch((error) => error);
      await vi.runAllTimersAsync();
      await networkRejection;
      expect(networkError).toHaveBeenCalledTimes(2);

      const timeoutPromise = manager.execute(timeoutError, { maxAttempts: 2 });
      const timeoutRejection = timeoutPromise.catch((error) => error);
      await vi.runAllTimersAsync();
      await timeoutRejection;
      expect(timeoutError).toHaveBeenCalledTimes(2);
    });

    it('should handle timeout for each attempt', async () => {
      const operation = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve('success'), 5000);
          })
      );

      const promise = manager.execute(operation, {
        timeout: 1000,
        maxAttempts: 1,
      });
      const rejectionPromise = promise.catch((error) => error);

      // Advance timers to trigger timeout
      await vi.advanceTimersByTimeAsync(2000);

      // Wait for the promise to settle
      const error = await rejectionPromise;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Operation timed out after 1000ms');

      expect(operation).toHaveBeenCalledTimes(1);

      // Ensure all timers are cleared
      await vi.runAllTimersAsync();
    });

    it('should call onRetry callback before each retry', async () => {
      const operation = vi
        .fn()
        .mockImplementation(() => Promise.reject(new Error('failure')));
      const onRetry = vi.fn();

      const promise = manager.execute(operation, {
        maxAttempts: 3,
        onRetry,
      });
      const rejectionPromise = promise.catch((error) => error);
      await vi.runAllTimersAsync();
      const error = await rejectionPromise;

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('failure');

      expect(onRetry).toHaveBeenCalledTimes(2); // Called before 2nd and 3rd attempts
      expect(onRetry).toHaveBeenNthCalledWith(
        1,
        1,
        expect.any(Error),
        expect.any(Number)
      );
      expect(onRetry).toHaveBeenNthCalledWith(
        2,
        2,
        expect.any(Error),
        expect.any(Number)
      );
    });

    it('should call onFailure callback when all retries fail', async () => {
      const operation = vi
        .fn()
        .mockImplementation(() => Promise.reject(new Error('failure')));
      const onFailure = vi.fn();

      const promise = manager.execute(operation, {
        maxAttempts: 3,
        onFailure,
      });
      const rejectionPromise = promise.catch((error) => error);
      await vi.runAllTimersAsync();
      const error = await rejectionPromise;

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('failure');

      expect(onFailure).toHaveBeenCalledTimes(1);
      expect(onFailure).toHaveBeenCalledWith(expect.any(Error), 3);
    });

    it('should call onFailure callback for non-retryable errors', async () => {
      const operation = vi
        .fn()
        .mockImplementation(() =>
          Promise.reject(new Error('validation failed'))
        );
      const onFailure = vi.fn();

      const promise = manager.execute(operation, {
        maxAttempts: 3,
        isRetryable: () => false,
        onFailure,
      });
      const rejectionPromise = promise.catch((error) => error);
      await vi.runAllTimersAsync();
      const error = await rejectionPromise;

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('validation failed');

      expect(onFailure).toHaveBeenCalledTimes(1);
      expect(onFailure).toHaveBeenCalledWith(expect.any(Error), 1);
    });
  });

  describe('executeAll', () => {
    it('should execute multiple operations in parallel', async () => {
      const op1 = vi.fn().mockResolvedValue('result1');
      const op2 = vi.fn().mockResolvedValue('result2');
      const op3 = vi.fn().mockResolvedValue('result3');

      const promise = manager.executeAll([op1, op2, op3]);
      await vi.runAllTimersAsync();
      const results = await promise;

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({
        success: true,
        result: 'result1',
        attempts: 1,
        totalDuration: expect.any(Number),
      });
      expect(results[1]).toEqual({
        success: true,
        result: 'result2',
        attempts: 1,
        totalDuration: expect.any(Number),
      });
      expect(results[2]).toEqual({
        success: true,
        result: 'result3',
        attempts: 1,
        totalDuration: expect.any(Number),
      });
    });

    it('should handle mixed success and failure', async () => {
      const op1 = vi.fn().mockResolvedValue('success');
      const op2 = vi
        .fn()
        .mockImplementation(() => Promise.reject(new Error('failure')));
      const op3 = vi.fn().mockResolvedValue('success');

      const promise = manager.executeAll([op1, op2, op3], {
        maxAttempts: 1,
      });
      await vi.runAllTimersAsync();
      const results = await promise;

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBeInstanceOf(Error);
      expect(results[2].success).toBe(true);
    });
  });

  describe('executeSafe', () => {
    it('should return success result without throwing', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const promise = manager.executeSafe(operation);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual({
        success: true,
        result: 'success',
        attempts: 1,
        totalDuration: expect.any(Number),
      });
    });

    it('should return error result without throwing', async () => {
      const operation = vi
        .fn()
        .mockImplementation(() => Promise.reject(new Error('failure')));

      const promise = manager.executeSafe(operation, { maxAttempts: 2 });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual({
        success: false,
        error: expect.any(Error),
        attempts: 2,
        totalDuration: expect.any(Number),
      });
      expect(result.error?.message).toBe('failure');
    });
  });

  describe('global instance', () => {
    it('should provide global retryManager instance', () => {
      expect(retryManager).toBeInstanceOf(RetryManager);
    });

    it('should provide executeWithRetry utility function', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const promise = executeWithRetry(operation);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should provide executeWithRetrySafe utility function', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const promise = executeWithRetrySafe(operation);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual({
        success: true,
        result: 'success',
        attempts: 1,
        totalDuration: expect.any(Number),
      });
    });
  });

  describe('custom configuration', () => {
    it('should use custom default options', async () => {
      const customManager = new RetryManager({
        maxAttempts: 5,
        baseDelay: 1000,
      });

      const operation = vi
        .fn()
        .mockImplementation(() => Promise.reject(new Error('failure')));

      const promise = customManager.execute(operation);
      const rejectionPromise = promise.catch((error) => error);
      await vi.runAllTimersAsync();
      const error = await rejectionPromise;

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('failure');
      expect(operation).toHaveBeenCalledTimes(5);
    });

    it('should merge custom options with defaults', async () => {
      const operation = vi
        .fn()
        .mockImplementation(() => Promise.reject(new Error('failure')));

      const promise = manager.execute(operation, {
        maxAttempts: 2, // Override default
        // baseDelay uses default 500ms
      });
      const rejectionPromise = promise.catch((error) => error);
      await vi.runAllTimersAsync();
      const error = await rejectionPromise;

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('failure');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('edge cases', () => {
    it('should handle operation that throws non-Error', async () => {
      const operation = vi
        .fn()
        .mockImplementation(() => Promise.reject('string error'));

      const promise = manager.execute(operation, { maxAttempts: 1 });
      const rejectionPromise = promise.catch((error) => error);
      await vi.runAllTimersAsync();
      const error = await rejectionPromise;

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('string error');
    });

    it('should handle operation that returns undefined', async () => {
      const operation = vi.fn().mockResolvedValue(undefined);

      const promise = manager.execute(operation);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBeUndefined();
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle zero maxAttempts gracefully', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      // maxAttempts of 0 should be treated as 1
      const result = await manager.execute(operation, { maxAttempts: 0 });

      // Should still execute at least once
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle very large delays', async () => {
      const operation = vi
        .fn()
        .mockImplementation(() => Promise.reject(new Error('failure')));

      const promise = manager.execute(operation, {
        maxAttempts: 2,
        baseDelay: 100000,
        maxDelay: 200000,
        useJitter: false,
      });
      const rejectionPromise = promise.catch((error) => error);
      await vi.runAllTimersAsync();
      const error = await rejectionPromise;

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('failure');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('requirements validation', () => {
    it('should meet Requirement 7.1: retry up to 3 times with exponential backoff', async () => {
      const operation = vi
        .fn()
        .mockImplementation(() => Promise.reject(new Error('failure')));
      const delays: number[] = [];

      const promise = manager.execute(operation, {
        maxAttempts: 3,
        baseDelay: 500,
        useJitter: false,
        onRetry: (_attempt, _error, delay) => {
          delays.push(delay);
        },
      });
      const rejectionPromise = promise.catch((error) => error);
      await vi.runAllTimersAsync();
      const error = await rejectionPromise;

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('failure');

      // Verify 3 attempts
      expect(operation).toHaveBeenCalledTimes(3);

      // Verify exponential backoff with base 500ms
      expect(delays[0]).toBe(500); // 500 * 2^0
      expect(delays[1]).toBe(1000); // 500 * 2^1
    });

    it('should meet Requirement 7.2: classify errors as retryable/non-retryable', async () => {
      // Test retryable error
      const retryableOp = vi
        .fn()
        .mockImplementation(() => Promise.reject(new Error('network error')));

      const retryablePromise = manager.execute(retryableOp, { maxAttempts: 2 });
      const retryableRejection = retryablePromise.catch((error) => error);
      await vi.runAllTimersAsync();
      const retryableError = await retryableRejection;
      expect(retryableError).toBeInstanceOf(Error);
      expect(retryableError.message).toBe('network error');
      expect(retryableOp).toHaveBeenCalledTimes(2); // Retried

      // Test non-retryable error
      const nonRetryableOp = vi
        .fn()
        .mockImplementation(() =>
          Promise.reject(new Error('validation error'))
        );

      const nonRetryablePromise = manager.execute(nonRetryableOp, {
        maxAttempts: 3,
      });
      const nonRetryableRejection = nonRetryablePromise.catch((error) => error);
      await vi.runAllTimersAsync();
      const nonRetryableError = await nonRetryableRejection;
      expect(nonRetryableError).toBeInstanceOf(Error);
      expect(nonRetryableError.message).toBe('validation error');
      expect(nonRetryableOp).toHaveBeenCalledTimes(1); // Not retried
    });

    it('should handle timeout for each attempt with retries', async () => {
      const operation = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve('success'), 5000);
          })
      );

      const promise = manager.execute(operation, {
        timeout: 1000,
        maxAttempts: 2,
      });
      const rejectionPromise = promise.catch((error) => error);

      // Advance timers to trigger timeouts and wait for all retries
      await vi.advanceTimersByTimeAsync(10000);

      // Wait for the promise to settle
      const error = await rejectionPromise;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/timed out/i);

      // Should retry timeout errors
      expect(operation).toHaveBeenCalledTimes(2);

      // Ensure all timers are cleared
      await vi.runAllTimersAsync();
    });
  });
});
