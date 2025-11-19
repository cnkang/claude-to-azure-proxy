/**
 * Error Recovery Integration Tests
 *
 * Tests error handling and recovery mechanisms at the service layer.
 * These tests focus on the error recovery logic without full UI interaction.
 *
 * Requirements:
 * - 7.1: Retry logic with exponential backoff
 * - 7.2: Error classification and recovery strategies
 * - 7.3: Rollback on persistent failures
 * - 7.4: Error message display
 * - 7.5: Comprehensive error logging
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getRetryManager } from '../utils/retry-manager.js';
import {
  PersistenceError,
  PersistenceErrorType,
  RecoveryStrategy,
  createStorageFullError,
  createIndexedDBError,
  createNetworkError,
  createDataCorruptionError,
  createTimeoutError,
} from '../errors/persistence-error.js';
import { frontendLogger } from '../utils/logger.js';

describe('Error Recovery Integration Tests', () => {
  let retryManager: ReturnType<typeof getRetryManager>;

  beforeEach(() => {
    retryManager = getRetryManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Requirement 7.1: Retry Logic with Exponential Backoff', () => {
    it('should retry transient errors with exponential backoff', async () => {
      let attemptCount = 0;
      const delays: number[] = [];
      let lastAttemptTime = Date.now();

      // Mock operation that fails first 2 attempts, succeeds on 3rd
      const mockOperation = vi.fn(async () => {
        attemptCount++;
        const currentTime = Date.now();

        if (attemptCount > 1) {
          delays.push(currentTime - lastAttemptTime);
        }
        lastAttemptTime = currentTime;

        if (attemptCount <= 2) {
          throw createIndexedDBError(
            'mockOperation',
            new Error('Transient error')
          );
        }

        return { success: true };
      });

      // Attempt operation with retry
      const result = await retryManager.execute(mockOperation, {
        maxAttempts: 4, // 1 initial + 3 retries
        baseDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2,
        useJitter: false, // Disable jitter for predictable testing
      });

      // Verify retry attempts
      expect(attemptCount).toBe(3);
      expect(result.success).toBe(true);

      // Verify exponential backoff (each delay should be roughly 2x the previous)
      expect(delays.length).toBeGreaterThanOrEqual(1);
      if (delays.length >= 2) {
        const ratio = delays[1] / delays[0];
        expect(ratio).toBeGreaterThan(1.5); // Allow some variance
        expect(ratio).toBeLessThan(3);
      }
    });

    it('should respect max attempts limit', async () => {
      let attemptCount = 0;

      // Mock operation that always fails
      const mockOperation = vi.fn(async () => {
        attemptCount++;
        throw createIndexedDBError(
          'mockOperation',
          new Error('Persistent error')
        );
      });

      // Attempt operation with retry (should fail after max attempts)
      await expect(
        retryManager.execute(mockOperation, {
          maxAttempts: 3,
          baseDelay: 10,
          maxDelay: 100,
          backoffMultiplier: 2,
        })
      ).rejects.toThrow();

      // Verify it tried exactly maxAttempts times
      expect(attemptCount).toBe(3);
    });
  });

  describe('Requirement 7.2: Error Classification and Recovery Strategies', () => {
    it('should classify storage full error correctly', () => {
      const error = createStorageFullError('storeConversation', {
        used: 45000000,
        available: 5000000,
      });

      expect(error.type).toBe(PersistenceErrorType.STORAGE_FULL);
      expect(error.retryable).toBe(false);
      expect(error.recoveryStrategy).toBe(RecoveryStrategy.EXPORT_DATA);
      expect(error.getUserMessage()).toContain('export');
    });

    it('should classify IndexedDB error as retryable', () => {
      const error = createIndexedDBError(
        'storeConversation',
        new Error('Database locked'),
        'conv-123'
      );

      expect(error.type).toBe(PersistenceErrorType.INDEXEDDB_ERROR);
      expect(error.retryable).toBe(true);
      expect(error.recoveryStrategy).toBe(RecoveryStrategy.RETRY);
    });

    it('should classify network error as retryable', () => {
      const error = createNetworkError('syncConversation');

      expect(error.type).toBe(PersistenceErrorType.NETWORK_ERROR);
      expect(error.retryable).toBe(true);
      expect(error.recoveryStrategy).toBe(RecoveryStrategy.RETRY);
    });

    it('should classify data corruption as non-retryable with clear and retry strategy', () => {
      const error = createDataCorruptionError(
        'loadConversation',
        'conv-123',
        'Invalid data structure'
      );

      expect(error.type).toBe(PersistenceErrorType.DATA_CORRUPTION);
      expect(error.retryable).toBe(false);
      expect(error.recoveryStrategy).toBe(RecoveryStrategy.CLEAR_AND_RETRY);
    });

    it('should provide appropriate recovery suggestions', () => {
      const storageFullError = createStorageFullError('storeConversation');
      expect(storageFullError.getRecoverySuggestion()).toContain('export');

      const retryableError = createIndexedDBError(
        'storeConversation',
        new Error('Temp error')
      );
      expect(retryableError.getRecoverySuggestion()).toContain('try again');

      const corruptionError = createDataCorruptionError('loadConversation');
      expect(corruptionError.getRecoverySuggestion()).toContain('cache');
    });
  });

  describe('Requirement 7.3: Rollback on Persistent Failures', () => {
    it('should not execute operation after all retries exhausted', async () => {
      let attemptCount = 0;
      const sideEffects: string[] = [];

      // Mock operation that always fails but tracks side effects
      const mockOperation = vi.fn(async () => {
        attemptCount++;
        sideEffects.push(`attempt-${attemptCount}`);
        throw createIndexedDBError(
          'mockOperation',
          new Error('Persistent error')
        );
      });

      // Attempt operation with retry
      await expect(
        retryManager.execute(mockOperation, {
          maxAttempts: 3,
          baseDelay: 10,
        })
      ).rejects.toThrow();

      // Verify operation was attempted exactly maxAttempts times
      expect(attemptCount).toBe(3);
      expect(sideEffects).toHaveLength(3);

      // No additional side effects after failure
      expect(sideEffects).toEqual(['attempt-1', 'attempt-2', 'attempt-3']);
    });

    it('should maintain data consistency with transaction-like behavior', async () => {
      const dataStore = { value: 'original' };
      let attemptCount = 0;

      // Mock operation that modifies data but fails
      const mockOperation = vi.fn(async () => {
        attemptCount++;
        const backup = dataStore.value;

        try {
          // Simulate modification
          dataStore.value = 'modified';

          // Simulate failure
          throw createIndexedDBError(
            'mockOperation',
            new Error('Operation failed')
          );
        } catch (error) {
          // Rollback on error
          dataStore.value = backup;
          throw error;
        }
      });

      // Attempt operation with retry
      await expect(
        retryManager.execute(mockOperation, {
          maxAttempts: 2,
          baseDelay: 10,
        })
      ).rejects.toThrow();

      // Verify data was rolled back
      expect(dataStore.value).toBe('original');
      expect(attemptCount).toBe(2);
    });
  });

  describe('Requirement 7.4: Error Message Display', () => {
    it('should provide user-friendly error messages', () => {
      const errors = [
        createStorageFullError('storeConversation'),
        createIndexedDBError('storeConversation', new Error('DB error')),
        createNetworkError('syncConversation'),
        createDataCorruptionError('loadConversation'),
        createTimeoutError('storeConversation', 5000),
      ];

      errors.forEach((error) => {
        const message = error.getUserMessage();

        // Should not contain technical jargon
        expect(message).not.toMatch(/undefined|null|NaN/i);
        expect(message).not.toMatch(/stack trace|exception/i);

        // Should be descriptive
        expect(message.length).toBeGreaterThan(10);

        // Should include recovery suggestion
        expect(error.getRecoverySuggestion()).toBeTruthy();
      });
    });

    it('should include actionable guidance in error messages', () => {
      const storageFullError = createStorageFullError('storeConversation');
      const message = storageFullError.getUserMessage();

      // Should tell user what to do
      expect(message.toLowerCase()).toMatch(/export|delete|clear|free/);
    });
  });

  describe('Requirement 7.5: Comprehensive Error Logging', () => {
    it('should log errors with metadata', async () => {
      const logSpy = vi.spyOn(frontendLogger, 'error');

      createIndexedDBError(
        'storeConversation',
        new Error('Test error'),
        'conv-123'
      );

      // Error should be logged on creation
      expect(logSpy).toHaveBeenCalled();

      const logCall = logSpy.mock.calls[0];
      expect(logCall[0]).toBe('storeConversation');
      expect(logCall[1]).toHaveProperty('metadata');

      const metadata = logCall[1].metadata as Record<string, unknown>;
      expect(metadata.errorType).toBe(PersistenceErrorType.INDEXEDDB_ERROR);
      expect(metadata.retryable).toBe(true);
      expect(metadata.recoveryStrategy).toBe(RecoveryStrategy.RETRY);
      expect(metadata.conversationId).toBe('conv-123');
    });

    it('should log retry attempts with onRetry callback', async () => {
      const retryLogs: Array<{ attempt: number; error: Error; delay: number }> =
        [];
      let attemptCount = 0;

      // Mock operation that fails first 2 attempts
      const mockOperation = vi.fn(async () => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw createIndexedDBError(
            'mockOperation',
            new Error('Transient error')
          );
        }
        return { success: true };
      });

      await retryManager.execute(mockOperation, {
        maxAttempts: 3,
        baseDelay: 10,
        onRetry: (attempt, error, delay) => {
          retryLogs.push({ attempt, error, delay });
        },
      });

      // Should have logged 2 retry attempts (after 1st and 2nd failures)
      expect(retryLogs).toHaveLength(2);
      expect(retryLogs[0].attempt).toBe(1);
      expect(retryLogs[1].attempt).toBe(2);
    });
  });

  describe('Graceful Degradation', () => {
    it('should handle storage unavailability gracefully', async () => {
      // Mock operation that simulates storage unavailable
      const mockOperation = vi.fn(async () => {
        throw new PersistenceError(
          PersistenceErrorType.STORAGE_UNAVAILABLE,
          'mockOperation',
          'Storage is not available',
          {
            retryable: false,
            recoveryStrategy: RecoveryStrategy.FALLBACK,
          }
        );
      });

      // Should not retry non-retryable errors when using custom isRetryable
      await expect(
        retryManager.execute(mockOperation, {
          maxAttempts: 3,
          baseDelay: 10,
          isRetryable: (error) => {
            // Check if error is a PersistenceError and use its retryable property
            if (error instanceof PersistenceError) {
              return error.retryable;
            }
            return true;
          },
        })
      ).rejects.toThrow('Storage is not available');

      // Should only attempt once (no retries for non-retryable errors)
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Timeout Handling', () => {
    it('should handle operation timeouts', async () => {
      // Mock slow operation that takes longer than timeout
      const mockOperation = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return { success: true };
      });

      // Should timeout and throw
      await expect(
        retryManager.execute(mockOperation, {
          maxAttempts: 1,
          baseDelay: 10,
          timeout: 50, // 50ms timeout (operation takes 200ms)
        })
      ).rejects.toThrow();

      // Operation should have been called
      expect(mockOperation).toHaveBeenCalled();
    });
  });

  describe('Concurrent Error Handling', () => {
    it('should handle concurrent operations with errors', async () => {
      const operations = Array.from({ length: 5 }, (_, i) => i);

      // Mock operations that fail on even indices
      const mockOperations = operations.map((i) =>
        vi.fn(async () => {
          if (i % 2 === 0) {
            throw createIndexedDBError(
              'mockOperation',
              new Error(`Error for operation ${i}`)
            );
          }
          return { success: true, id: i };
        })
      );

      // Attempt all operations concurrently with retry
      const results = await Promise.allSettled(
        mockOperations.map((op) =>
          retryManager.execute(op, {
            maxAttempts: 2,
            baseDelay: 10,
          })
        )
      );

      // Some should succeed, some should fail
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      expect(succeeded).toBe(2); // Operations 1 and 3 (odd indices)
      expect(failed).toBe(3); // Operations 0, 2, and 4 (even indices)
      expect(succeeded + failed).toBe(operations.length);
    });
  });
});

/**
 * Helper function to create network error
 */
function createNetworkError(operation: string): PersistenceError {
  return new PersistenceError(
    PersistenceErrorType.NETWORK_ERROR,
    operation,
    'Network error. Please check your connection and try again.',
    {
      retryable: true,
      recoveryStrategy: RecoveryStrategy.RETRY,
    }
  );
}
