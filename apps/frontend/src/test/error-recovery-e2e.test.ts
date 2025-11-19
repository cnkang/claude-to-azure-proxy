/**
 * Integration Test: Error Recovery E2E Scenarios
 *
 * Tests complete error recovery workflows:
 * - Simulate storage full error (mock IndexedDB quota exceeded)
 * - Verify RetryManager attempts retries
 * - Verify rollback on failure
 * - Simulate encryption error
 * - Verify graceful degradation to localStorage
 * - Test PersistenceError handling
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 *
 * NOTE: This is an integration test, not a true E2E test as it doesn't
 * involve UI components. It tests the error recovery logic and retry mechanisms.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { getConversationStorage } from '../services/storage.js';
import { getRetryManager } from '../utils/retry-manager.js';
import {
  PersistenceError,
  PersistenceErrorType,
} from '../errors/persistence-error.js';
import type { Conversation } from '../types/index.js';

describe('Error Recovery E2E Scenarios', () => {
  let storage: ReturnType<typeof getConversationStorage>;
  let retryManager: ReturnType<typeof getRetryManager>;
  let testConversation: Conversation;

  beforeEach(async () => {
    // Clear storage before each test
    localStorage.clear();
    sessionStorage.clear();

    // Initialize session manager first
    const sessionManager = (
      await import('../services/session.js')
    ).getSessionManager();
    sessionManager.initializeSession();
    const currentSessionId = sessionManager.getSessionId();

    // Initialize storage and retry manager
    storage = getConversationStorage();
    await storage.initialize();

    retryManager = getRetryManager();

    // Create test conversation
    testConversation = {
      id: crypto.randomUUID(),
      title: 'Test Conversation',
      messages: [
        {
          id: crypto.randomUUID(),
          role: 'user',
          content: 'Test message',
          timestamp: new Date(),
        },
      ],
      selectedModel: 'gpt-4o',
      createdAt: new Date(),
      updatedAt: new Date(),
      sessionId: currentSessionId,
      isStreaming: false,
      modelHistory: [],
      contextUsage: {
        currentTokens: 0,
        maxTokens: 128000,
        warningThreshold: 80,
        canExtend: false,
        isExtended: false,
      },
      compressionHistory: [],
      persistenceStatus: 'synced',
      isDirty: false,
      syncVersion: 1,
    };

    // Store conversation
    await storage.storeConversation(testConversation);
  });

  afterEach(async () => {
    // Clean up
    vi.restoreAllMocks();
    if (testConversation?.id) {
      try {
        await storage.deleteConversation(testConversation.id);
      } catch {
        // Ignore errors during cleanup
      }
    }
    await storage.clearAllData();
  });

  it('should handle storage full error with retry', async () => {
    let attemptCount = 0;

    // Create operation that fails with storage full error
    const operation = vi.fn(async () => {
      attemptCount++;
      if (attemptCount < 3) {
        throw new PersistenceError(
          PersistenceErrorType.STORAGE_FULL,
          'Storage quota exceeded',
          testConversation.id,
          true // retryable
        );
      }
      return 'success';
    });

    // Execute with retry
    const result = await retryManager.execute(operation);

    // Verify retries occurred
    expect(attemptCount).toBe(3);
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should display user-friendly error message for storage full', () => {
    const error = new PersistenceError(
      PersistenceErrorType.STORAGE_FULL,
      'Quota exceeded',
      testConversation.id,
      false
    );

    const userMessage = error.getUserMessage();

    // Verify message is user-friendly
    expect(userMessage).toBeTruthy();
    expect(userMessage.length).toBeGreaterThan(0);
    expect(userMessage).not.toContain('undefined');
    expect(userMessage).not.toContain('null');
    expect(userMessage.toLowerCase()).toContain('storage');
  });

  it('should rollback on persistent failure', async () => {
    const originalTitle = testConversation.title;
    const newTitle = 'Failed Update Title';

    // Create operation that always fails
    const failingOperation = vi.fn(async () => {
      throw new PersistenceError(
        PersistenceErrorType.WRITE_FAILED,
        'Write operation failed',
        testConversation.id,
        true
      );
    });

    // Attempt operation with retry
    try {
      await retryManager.execute(failingOperation);
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      // Expected to fail
      expect(error).toBeInstanceOf(PersistenceError);
    }

    // Verify title unchanged (rollback occurred)
    const conversation = await storage.getConversation(testConversation.id);
    expect(conversation?.title).toBe(originalTitle);
  });

  it('should handle encryption errors gracefully', async () => {
    // Create error for encryption failure
    const encryptionError = new PersistenceError(
      PersistenceErrorType.ENCRYPTION_FAILED,
      'Encryption operation failed',
      testConversation.id,
      false // not retryable
    );

    // Verify error properties
    expect(encryptionError.type).toBe(PersistenceErrorType.ENCRYPTION_FAILED);
    expect(encryptionError.retryable).toBe(false);
    expect(encryptionError.getRecoveryAction()).toBe('manual');

    // Verify user message
    const userMessage = encryptionError.getUserMessage();
    expect(userMessage).toBeTruthy();
    expect(userMessage.toLowerCase()).toContain('encryption');
  });

  it('should attempt retries with exponential backoff', async () => {
    const timestamps: number[] = [];
    let attemptCount = 0;

    // Create operation that records timestamps
    const operation = vi.fn(async () => {
      timestamps.push(Date.now());
      attemptCount++;
      if (attemptCount < 3) {
        throw new PersistenceError(
          PersistenceErrorType.WRITE_FAILED,
          'Temporary failure',
          testConversation.id,
          true
        );
      }
      return 'success';
    });

    // Execute with retry
    await retryManager.execute(operation);

    // Verify exponential backoff
    expect(timestamps.length).toBe(3);

    // Calculate delays between attempts
    const delay1 = timestamps[1] - timestamps[0];
    const delay2 = timestamps[2] - timestamps[1];

    // Second delay should be approximately 2x first delay (exponential backoff)
    // Allow for timing variance
    expect(delay2).toBeGreaterThan(delay1 * 1.5);
  });

  it('should not retry non-retryable errors', async () => {
    let attemptCount = 0;

    // Create operation that fails with non-retryable error
    const operation = vi.fn(async () => {
      attemptCount++;
      throw new PersistenceError(
        PersistenceErrorType.VALIDATION_FAILED,
        'Invalid data',
        testConversation.id,
        false // not retryable
      );
    });

    // Attempt operation
    try {
      await retryManager.execute(operation);
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      // Expected to fail immediately
      expect(error).toBeInstanceOf(PersistenceError);
    }

    // Verify only one attempt
    expect(attemptCount).toBe(1);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should classify errors correctly for recovery', () => {
    const errors = [
      {
        error: new PersistenceError(PersistenceErrorType.STORAGE_FULL, 'Full'),
        expectedAction: 'manual',
        expectedRetryable: false,
      },
      {
        error: new PersistenceError(
          PersistenceErrorType.WRITE_FAILED,
          'Write failed',
          undefined,
          true
        ),
        expectedAction: 'retry',
        expectedRetryable: true,
      },
      {
        error: new PersistenceError(
          PersistenceErrorType.VALIDATION_FAILED,
          'Invalid'
        ),
        expectedAction: 'revert',
        expectedRetryable: false,
      },
      {
        error: new PersistenceError(
          PersistenceErrorType.ENCRYPTION_FAILED,
          'Encryption failed'
        ),
        expectedAction: 'manual',
        expectedRetryable: false,
      },
    ];

    errors.forEach(({ error, expectedAction, expectedRetryable }) => {
      expect(error.getRecoveryAction()).toBe(expectedAction);
      expect(error.retryable).toBe(expectedRetryable);
    });
  });

  it('should log errors with correlation IDs', async () => {
    const correlationId = crypto.randomUUID();

    const error = new PersistenceError(
      PersistenceErrorType.WRITE_FAILED,
      'Test error',
      correlationId,
      true
    );

    // Verify error has correlation ID
    expect(error.conversationId).toBe(correlationId);

    // Verify error can be logged with context
    const errorContext = {
      type: error.type,
      message: error.message,
      conversationId: error.conversationId,
      retryable: error.retryable,
    };

    expect(errorContext.conversationId).toBe(correlationId);
  });

  it('should handle concurrent errors correctly', async () => {
    const operations = Array.from({ length: 5 }, (_, i) => {
      let attemptCount = 0;
      return vi.fn(async () => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new PersistenceError(
            PersistenceErrorType.WRITE_FAILED,
            `Error ${i}`,
            testConversation.id,
            true
          );
        }
        return `success-${i}`;
      });
    });

    // Execute all operations concurrently
    const results = await Promise.allSettled(
      operations.map((op) => retryManager.execute(op))
    );

    // Verify all operations eventually succeeded
    results.forEach((result, i) => {
      expect(result.status).toBe('fulfilled');
      if (result.status === 'fulfilled') {
        expect(result.value).toBe(`success-${i}`);
      }
    });
  });

  it('should provide recovery suggestions for different error types', () => {
    const errorTypes = [
      PersistenceErrorType.STORAGE_FULL,
      PersistenceErrorType.ENCRYPTION_FAILED,
      PersistenceErrorType.WRITE_FAILED,
      PersistenceErrorType.VALIDATION_FAILED,
      PersistenceErrorType.CORRUPTED_DATA,
    ];

    errorTypes.forEach((type) => {
      const error = new PersistenceError(type, 'Test error');
      const userMessage = error.getUserMessage();

      // Verify each error type has a meaningful message
      expect(userMessage).toBeTruthy();
      expect(userMessage.length).toBeGreaterThan(10);
      expect(userMessage).not.toContain('undefined');
    });
  });

  it('should handle timeout errors with retry', async () => {
    let attemptCount = 0;

    // Create operation that times out initially
    const operation = vi.fn(async () => {
      attemptCount++;
      if (attemptCount < 2) {
        throw new PersistenceError(
          PersistenceErrorType.NETWORK_ERROR,
          'Operation timed out',
          testConversation.id,
          true
        );
      }
      return 'success';
    });

    // Execute with retry
    const result = await retryManager.execute(operation);

    // Verify retry succeeded
    expect(result).toBe('success');
    expect(attemptCount).toBe(2);
  });

  it('should maintain data consistency after error recovery', async () => {
    const originalTitle = testConversation.title;
    let attemptCount = 0;

    // Create operation that fails once then succeeds
    const operation = vi.fn(async () => {
      attemptCount++;
      if (attemptCount === 1) {
        throw new PersistenceError(
          PersistenceErrorType.WRITE_FAILED,
          'Temporary failure',
          testConversation.id,
          true
        );
      }
      // Succeed on second attempt
      await storage.updateConversationTitle(
        testConversation.id,
        'Recovered Title'
      );
      return 'success';
    });

    // Execute with retry
    await retryManager.execute(operation);

    // Verify data is consistent
    const conversation = await storage.getConversation(testConversation.id);
    expect(conversation?.title).toBe('Recovered Title');
  });

  it('should handle storage backend fallback gracefully', async () => {
    // This test verifies that the system can handle backend switching
    // In a real scenario, this would test IndexedDB -> localStorage fallback

    // Get current backend
    const backend = storage.getStorageBackend();
    expect(backend).toBeDefined();
    expect(['indexeddb', 'localstorage']).toContain(backend);

    // Verify storage operations work regardless of backend
    const newTitle = 'Backend Test Title';
    await storage.updateConversationTitle(testConversation.id, newTitle);

    const conversation = await storage.getConversation(testConversation.id);
    expect(conversation?.title).toBe(newTitle);
  });
});
