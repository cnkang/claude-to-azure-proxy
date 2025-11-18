/**
 * Persistence Error Tests
 *
 * Tests for the persistence error classification system.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PersistenceError,
  PersistenceErrorType,
  RecoveryStrategy,
  PersistenceErrorFactory,
  createPersistenceError,
  createStorageFullError,
  createIndexedDBError,
  createLocalStorageError,
  createEncryptionError,
  createDecryptionError,
  createValidationError,
  createDataCorruptionError,
  createNotFoundError,
  createConflictError,
  createTimeoutError,
  createStorageUnavailableError,
  createUnknownError,
} from '../errors/persistence-error.js';
import { frontendLogger } from '../utils/logger.js';

// Mock logger
vi.mock('../utils/logger.js', () => ({
  frontendLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('PersistenceError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Error Classification', () => {
    it('should classify STORAGE_FULL as non-retryable', () => {
      const error = new PersistenceError(
        PersistenceErrorType.STORAGE_FULL,
        'Storage full',
        'Storage is full'
      );

      expect(error.retryable).toBe(false);
      expect(error.recoveryStrategy).toBe(RecoveryStrategy.EXPORT_DATA);
    });

    it('should classify ENCRYPTION_FAILED as non-retryable', () => {
      const error = new PersistenceError(
        PersistenceErrorType.ENCRYPTION_FAILED,
        'Encryption failed',
        'Failed to encrypt'
      );

      expect(error.retryable).toBe(false);
      expect(error.recoveryStrategy).toBe(RecoveryStrategy.NONE);
    });

    it('should classify DECRYPTION_FAILED as non-retryable', () => {
      const error = new PersistenceError(
        PersistenceErrorType.DECRYPTION_FAILED,
        'Decryption failed',
        'Failed to decrypt'
      );

      expect(error.retryable).toBe(false);
      expect(error.recoveryStrategy).toBe(RecoveryStrategy.NONE);
    });

    it('should classify INDEXEDDB_ERROR as retryable', () => {
      const error = new PersistenceError(
        PersistenceErrorType.INDEXEDDB_ERROR,
        'IndexedDB error',
        'Database error'
      );

      expect(error.retryable).toBe(true);
      expect(error.recoveryStrategy).toBe(RecoveryStrategy.RETRY);
    });

    it('should classify VALIDATION_ERROR as non-retryable', () => {
      const error = new PersistenceError(
        PersistenceErrorType.VALIDATION_ERROR,
        'Validation failed',
        'Invalid data'
      );

      expect(error.retryable).toBe(false);
      expect(error.recoveryStrategy).toBe(RecoveryStrategy.NONE);
    });

    it('should classify CONFLICT as retryable', () => {
      const error = new PersistenceError(
        PersistenceErrorType.CONFLICT,
        'Conflict detected',
        'Concurrent modification'
      );

      expect(error.retryable).toBe(true);
      expect(error.recoveryStrategy).toBe(RecoveryStrategy.RETRY);
    });

    it('should classify TIMEOUT as retryable', () => {
      const error = new PersistenceError(
        PersistenceErrorType.TIMEOUT,
        'Operation timed out',
        'Timeout'
      );

      expect(error.retryable).toBe(true);
      expect(error.recoveryStrategy).toBe(RecoveryStrategy.RETRY);
    });
  });

  describe('Error Metadata', () => {
    it('should include correlation ID', () => {
      const error = new PersistenceError(
        PersistenceErrorType.UNKNOWN,
        'Test error',
        'Test'
      );

      expect(error.correlationId).toBeDefined();
      expect(typeof error.correlationId).toBe('string');
      expect(error.correlationId.length).toBeGreaterThan(0);
    });

    it('should use provided correlation ID', () => {
      const correlationId = 'test-correlation-id';
      const error = new PersistenceError(
        PersistenceErrorType.UNKNOWN,
        'Test error',
        'Test',
        { correlationId }
      );

      expect(error.correlationId).toBe(correlationId);
    });

    it('should include timestamp', () => {
      const before = new Date();
      const error = new PersistenceError(
        PersistenceErrorType.UNKNOWN,
        'Test error',
        'Test'
      );
      const after = new Date();

      expect(error.timestamp).toBeInstanceOf(Date);
      expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should include operation metadata', () => {
      const error = new PersistenceError(
        PersistenceErrorType.UNKNOWN,
        'Test error',
        'Test',
        {
          metadata: {
            operation: 'updateTitle',
            conversationId: 'conv-123',
          },
        }
      );

      expect(error.metadata.operation).toBe('updateTitle');
      expect(error.metadata.conversationId).toBe('conv-123');
    });

    it('should include storage backend metadata', () => {
      const error = new PersistenceError(
        PersistenceErrorType.INDEXEDDB_ERROR,
        'Test error',
        'Test',
        {
          metadata: {
            storageBackend: 'indexeddb',
          },
        }
      );

      expect(error.metadata.storageBackend).toBe('indexeddb');
    });

    it('should include quota metadata', () => {
      const quota = { used: 1000, available: 500, percentage: 66.67 };
      const error = new PersistenceError(
        PersistenceErrorType.STORAGE_FULL,
        'Storage full',
        'Storage is full',
        {
          metadata: { quota },
        }
      );

      expect(error.metadata.quota).toEqual(quota);
    });
  });

  describe('Error Logging', () => {
    it('should log error on creation', () => {
      const error = new PersistenceError(
        PersistenceErrorType.UNKNOWN,
        'Test error',
        'Test'
      );

      expect(frontendLogger.error).toHaveBeenCalledWith(
        'Test error',
        expect.objectContaining({
          metadata: expect.objectContaining({
            errorType: PersistenceErrorType.UNKNOWN,
            correlationId: error.correlationId,
            retryable: true,
            recoveryStrategy: RecoveryStrategy.RETRY,
          }),
        })
      );
    });

    it('should log original error if provided', () => {
      const originalError = new Error('Original error');
      const error = new PersistenceError(
        PersistenceErrorType.UNKNOWN,
        'Test error',
        'Test',
        { originalError }
      );

      expect(frontendLogger.error).toHaveBeenCalledWith(
        'Test error',
        expect.objectContaining({
          error: originalError,
        })
      );
    });
  });

  describe('User Messages', () => {
    it('should provide user-friendly message', () => {
      const error = new PersistenceError(
        PersistenceErrorType.STORAGE_FULL,
        'Storage quota exceeded',
        'Storage is full'
      );

      const userMessage = error.getUserMessage();
      expect(userMessage).toContain('Storage is full');
      expect(userMessage).toContain('export your data');
    });

    it('should include recovery suggestion for retryable errors', () => {
      const error = new PersistenceError(
        PersistenceErrorType.TIMEOUT,
        'Operation timed out',
        'Timeout occurred'
      );

      const userMessage = error.getUserMessage();
      expect(userMessage).toContain('try again');
    });

    it('should not include suggestion for non-recoverable errors', () => {
      const error = new PersistenceError(
        PersistenceErrorType.VALIDATION_ERROR,
        'Validation failed',
        'Invalid data'
      );

      const userMessage = error.getUserMessage();
      expect(userMessage).toBe('Invalid data');
    });
  });

  describe('Recovery Strategies', () => {
    it('should identify retry-eligible errors', () => {
      const error = new PersistenceError(
        PersistenceErrorType.TIMEOUT,
        'Timeout',
        'Timeout'
      );

      expect(error.shouldRetry()).toBe(true);
    });

    it('should identify non-retry-eligible errors', () => {
      const error = new PersistenceError(
        PersistenceErrorType.VALIDATION_ERROR,
        'Validation failed',
        'Invalid'
      );

      expect(error.shouldRetry()).toBe(false);
    });

    it('should identify queue-eligible errors', () => {
      const error = new PersistenceError(
        PersistenceErrorType.UNKNOWN,
        'Test',
        'Test',
        { recoveryStrategy: RecoveryStrategy.QUEUE }
      );

      expect(error.shouldQueue()).toBe(true);
    });

    it('should identify errors requiring user action', () => {
      const error = new PersistenceError(
        PersistenceErrorType.STORAGE_FULL,
        'Storage full',
        'Storage is full'
      );

      expect(error.requiresUserAction()).toBe(true);
    });
  });

  describe('JSON Serialization', () => {
    it('should serialize to JSON', () => {
      const error = new PersistenceError(
        PersistenceErrorType.TIMEOUT,
        'Operation timed out',
        'Timeout',
        {
          metadata: {
            operation: 'updateTitle',
            conversationId: 'conv-123',
          },
        }
      );

      const json = error.toJSON();

      expect(json).toMatchObject({
        name: 'PersistenceError',
        type: PersistenceErrorType.TIMEOUT,
        message: 'Operation timed out',
        userMessage: 'Timeout',
        correlationId: error.correlationId,
        timestamp: error.timestamp.toISOString(),
        retryable: true,
        recoveryStrategy: RecoveryStrategy.RETRY,
        metadata: {
          operation: 'updateTitle',
          conversationId: 'conv-123',
        },
      });
    });
  });
});

describe('PersistenceErrorFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createStorageFullError', () => {
    it('should create storage full error with quota info', () => {
      const error = createStorageFullError('updateTitle', {
        used: 1000,
        available: 500,
      });

      expect(error.type).toBe(PersistenceErrorType.STORAGE_FULL);
      expect(error.retryable).toBe(false);
      expect(error.recoveryStrategy).toBe(RecoveryStrategy.EXPORT_DATA);
      expect(error.metadata.quota).toBeDefined();
      expect(error.metadata.quota?.percentage).toBeCloseTo(66.67, 1);
    });
  });

  describe('createIndexedDBError', () => {
    it('should create IndexedDB error', () => {
      const originalError = new Error('DB error');
      const error = createIndexedDBError('updateTitle', originalError, 'conv-123');

      expect(error.type).toBe(PersistenceErrorType.INDEXEDDB_ERROR);
      expect(error.retryable).toBe(true);
      expect(error.recoveryStrategy).toBe(RecoveryStrategy.RETRY);
      expect(error.metadata.storageBackend).toBe('indexeddb');
      expect(error.metadata.conversationId).toBe('conv-123');
      expect(error.originalError).toBe(originalError);
    });
  });

  describe('createLocalStorageError', () => {
    it('should create localStorage error', () => {
      const originalError = new Error('Storage error');
      const error = createLocalStorageError('deleteConversation', originalError);

      expect(error.type).toBe(PersistenceErrorType.LOCALSTORAGE_ERROR);
      expect(error.retryable).toBe(true);
      expect(error.metadata.storageBackend).toBe('localstorage');
    });
  });

  describe('createEncryptionError', () => {
    it('should create encryption error', () => {
      const originalError = new Error('Encryption failed');
      const error = createEncryptionError('storeConversation', originalError);

      expect(error.type).toBe(PersistenceErrorType.ENCRYPTION_FAILED);
      expect(error.retryable).toBe(true);
      expect(error.recoveryStrategy).toBe(RecoveryStrategy.RETRY);
    });
  });

  describe('createDecryptionError', () => {
    it('should create decryption error', () => {
      const originalError = new Error('Decryption failed');
      const error = createDecryptionError('loadConversation', originalError);

      expect(error.type).toBe(PersistenceErrorType.DECRYPTION_FAILED);
      expect(error.retryable).toBe(false);
      expect(error.recoveryStrategy).toBe(RecoveryStrategy.NONE);
    });
  });

  describe('createValidationError', () => {
    it('should create validation error', () => {
      const error = createValidationError(
        'updateTitle',
        'title',
        '',
        'Title cannot be empty'
      );

      expect(error.type).toBe(PersistenceErrorType.VALIDATION_ERROR);
      expect(error.retryable).toBe(false);
      expect(error.metadata.context?.field).toBe('title');
      expect(error.metadata.context?.reason).toBe('Title cannot be empty');
    });
  });

  describe('createDataCorruptionError', () => {
    it('should create data corruption error', () => {
      const error = createDataCorruptionError(
        'loadConversation',
        'conv-123',
        'Invalid JSON'
      );

      expect(error.type).toBe(PersistenceErrorType.DATA_CORRUPTION);
      expect(error.recoveryStrategy).toBe(RecoveryStrategy.CLEAR_AND_RETRY);
      expect(error.metadata.conversationId).toBe('conv-123');
    });
  });

  describe('createNotFoundError', () => {
    it('should create not found error', () => {
      const error = createNotFoundError('deleteConversation', 'conv-123');

      expect(error.type).toBe(PersistenceErrorType.NOT_FOUND);
      expect(error.retryable).toBe(false);
      expect(error.metadata.conversationId).toBe('conv-123');
    });
  });

  describe('createConflictError', () => {
    it('should create conflict error', () => {
      const error = createConflictError('updateTitle', 'conv-123');

      expect(error.type).toBe(PersistenceErrorType.CONFLICT);
      expect(error.retryable).toBe(true);
      expect(error.recoveryStrategy).toBe(RecoveryStrategy.RETRY);
    });
  });

  describe('createTimeoutError', () => {
    it('should create timeout error', () => {
      const error = createTimeoutError('updateTitle', 5000);

      expect(error.type).toBe(PersistenceErrorType.TIMEOUT);
      expect(error.retryable).toBe(true);
      expect(error.metadata.context?.timeout).toBe(5000);
    });
  });

  describe('createStorageUnavailableError', () => {
    it('should create storage unavailable error', () => {
      const error = createStorageUnavailableError('IndexedDB not supported');

      expect(error.type).toBe(PersistenceErrorType.STORAGE_UNAVAILABLE);
      expect(error.recoveryStrategy).toBe(RecoveryStrategy.FALLBACK);
    });
  });

  describe('createUnknownError', () => {
    it('should create unknown error', () => {
      const originalError = new Error('Something went wrong');
      const error = createUnknownError('updateTitle', originalError);

      expect(error.type).toBe(PersistenceErrorType.UNKNOWN);
      expect(error.retryable).toBe(true);
      expect(error.originalError).toBe(originalError);
    });
  });

  describe('fromError', () => {
    it('should classify quota error', () => {
      const originalError = new Error('QuotaExceededError: Storage quota exceeded');
      const error = createPersistenceError(originalError, 'updateTitle');

      expect(error.type).toBe(PersistenceErrorType.STORAGE_FULL);
    });

    it('should classify IndexedDB error', () => {
      const originalError = new Error('IndexedDB transaction failed');
      const error = createPersistenceError(originalError, 'updateTitle');

      expect(error.type).toBe(PersistenceErrorType.INDEXEDDB_ERROR);
    });

    it('should classify localStorage error', () => {
      const originalError = new Error('localStorage is not available');
      const error = createPersistenceError(originalError, 'updateTitle');

      expect(error.type).toBe(PersistenceErrorType.LOCALSTORAGE_ERROR);
    });

    it('should classify encryption error', () => {
      const originalError = new Error('Failed to encrypt data');
      const error = createPersistenceError(originalError, 'updateTitle');

      expect(error.type).toBe(PersistenceErrorType.ENCRYPTION_FAILED);
    });

    it('should classify decryption error', () => {
      const originalError = new Error('Failed to decrypt data');
      const error = createPersistenceError(originalError, 'loadConversation');

      expect(error.type).toBe(PersistenceErrorType.DECRYPTION_FAILED);
    });

    it('should classify validation error', () => {
      const originalError = new Error('Validation failed: invalid title');
      const error = createPersistenceError(originalError, 'updateTitle');

      expect(error.type).toBe(PersistenceErrorType.VALIDATION_ERROR);
    });

    it('should classify corruption error', () => {
      const originalError = new Error('Data is corrupted');
      const error = createPersistenceError(originalError, 'loadConversation');

      expect(error.type).toBe(PersistenceErrorType.DATA_CORRUPTION);
    });

    it('should classify not found error', () => {
      const originalError = new Error('Conversation not found');
      const error = createPersistenceError(originalError, 'deleteConversation');

      expect(error.type).toBe(PersistenceErrorType.NOT_FOUND);
    });

    it('should classify conflict error', () => {
      const originalError = new Error('Conflict: concurrent modification');
      const error = createPersistenceError(originalError, 'updateTitle');

      expect(error.type).toBe(PersistenceErrorType.CONFLICT);
    });

    it('should classify timeout error', () => {
      const originalError = new Error('Operation timeout');
      const error = createPersistenceError(originalError, 'updateTitle');

      expect(error.type).toBe(PersistenceErrorType.TIMEOUT);
    });

    it('should default to unknown error', () => {
      const originalError = new Error('Something unexpected happened');
      const error = createPersistenceError(originalError, 'updateTitle');

      expect(error.type).toBe(PersistenceErrorType.UNKNOWN);
      expect(error.retryable).toBe(true);
    });
  });
});

describe('Error Recovery Integration', () => {
  it('should provide correct recovery strategy for storage full', () => {
    const error = createStorageFullError('updateTitle', {
      used: 1000,
      available: 100,
    });

    expect(error.requiresUserAction()).toBe(true);
    expect(error.shouldRetry()).toBe(false);
    expect(error.getUserMessage()).toContain('export your data');
  });

  it('should provide correct recovery strategy for retryable errors', () => {
    const error = createTimeoutError('updateTitle', 5000);

    expect(error.shouldRetry()).toBe(true);
    expect(error.requiresUserAction()).toBe(false);
    expect(error.getUserMessage()).toContain('try again');
  });

  it('should provide correct recovery strategy for non-retryable errors', () => {
    const error = createValidationError(
      'updateTitle',
      'title',
      '',
      'Title is required'
    );

    expect(error.shouldRetry()).toBe(false);
    expect(error.requiresUserAction()).toBe(false);
    expect(error.recoveryStrategy).toBe(RecoveryStrategy.NONE);
  });
});
