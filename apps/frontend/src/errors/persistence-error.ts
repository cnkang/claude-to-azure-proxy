/**
 * Persistence Error Classification System
 *
 * Provides error classification and recovery strategies for persistence operations.
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { frontendLogger } from '../utils/logger.js';

/**
 * Persistence error types
 */
export enum PersistenceErrorType {
  STORAGE_FULL = 'storage_full',
  ENCRYPTION_FAILED = 'encryption_failed',
  DECRYPTION_FAILED = 'decryption_failed',
  WRITE_FAILED = 'write_failed',
  READ_FAILED = 'read_failed',
  VALIDATION_ERROR = 'validation_error',
  VALIDATION_FAILED = 'validation_failed', // Alias for backward compatibility
  CONFLICT = 'conflict',
  CORRUPTED_DATA = 'corrupted_data',
  DATA_CORRUPTION = 'data_corruption', // Alias
  NETWORK_ERROR = 'network_error',
  STORAGE_UNAVAILABLE = 'storage_unavailable',
  INDEXEDDB_ERROR = 'indexeddb_error',
  LOCALSTORAGE_ERROR = 'localstorage_error',
  NOT_FOUND = 'not_found',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown',
}

/**
 * Recovery strategies for persistence errors
 */
export enum RecoveryStrategy {
  RETRY = 'retry', // Retry the operation
  QUEUE = 'queue', // Queue for later retry
  EXPORT_DATA = 'export_data', // Export data and clear storage
  CLEAR_CACHE = 'clear_cache', // Clear cache and retry
  CLEAR_AND_RETRY = 'clear_and_retry', // Clear cache and retry
  RELOAD = 'reload', // Reload the page
  FALLBACK = 'fallback', // Fallback to alternative storage
  NONE = 'none', // No recovery possible
}

/**
 * Persistence error class with classification and recovery information
 */
export class PersistenceError extends Error {
  public readonly type: PersistenceErrorType;
  public readonly operation: string;
  public readonly userMessage: string;
  public readonly conversationId?: string;
  public readonly correlationId: string;
  public readonly retryable: boolean;
  public readonly recoveryStrategy: RecoveryStrategy;
  public readonly timestamp: Date;
  public readonly metadata?: Record<string, unknown>;
  public readonly originalError?: Error;

  constructor(
    type: PersistenceErrorType,
    operation: string,
    userMessageOrConversationId?: string,
    optionsOrRetryable?:
      | {
          conversationId?: string;
          correlationId?: string;
          retryable?: boolean;
          recoveryStrategy?: RecoveryStrategy;
          metadata?: Record<string, unknown>;
          originalError?: Error;
        }
      | boolean
  ) {
    // Handle backward compatibility with old signature:
    // new PersistenceError(type, operation, conversationId?, retryable?)
    let userMessage: string;
    let options: {
      conversationId?: string;
      correlationId?: string;
      retryable?: boolean;
      recoveryStrategy?: RecoveryStrategy;
      metadata?: Record<string, unknown>;
      originalError?: Error;
    } = {};

    if (typeof optionsOrRetryable === 'boolean') {
      // Old signature: (type, operation, conversationId?, retryable?)
      userMessage = PersistenceError.getDefaultMessage(type);
      options = {
        conversationId: userMessageOrConversationId,
        retryable: optionsOrRetryable,
      };
    } else if (
      typeof optionsOrRetryable === 'object' &&
      optionsOrRetryable !== null
    ) {
      // New signature with userMessage and options: (type, operation, userMessage, options)
      userMessage =
        userMessageOrConversationId || PersistenceError.getDefaultMessage(type);
      options = optionsOrRetryable;
    } else if (typeof userMessageOrConversationId === 'string') {
      // Could be either userMessage or conversationId
      // If it looks like a UUID or short identifier, treat as conversationId
      // If it looks like a sentence/message, treat as userMessage
      const looksLikeMessage =
        userMessageOrConversationId.length > 50 ||
        userMessageOrConversationId.includes(' ') ||
        userMessageOrConversationId.endsWith('.') ||
        userMessageOrConversationId.includes(',');

      if (looksLikeMessage) {
        userMessage = userMessageOrConversationId;
        options = {};
      } else {
        userMessage = PersistenceError.getDefaultMessage(type);
        options = {
          conversationId: userMessageOrConversationId,
        };
      }
    } else {
      // No third parameter provided
      userMessage = PersistenceError.getDefaultMessage(type);
      options = {};
    }

    super(userMessage);
    this.name = 'PersistenceError';
    this.type = type;
    this.operation = operation;
    this.userMessage = userMessage;
    this.conversationId = options.conversationId;
    this.correlationId = options.correlationId || crypto.randomUUID();
    this.timestamp = new Date();
    this.metadata = options.metadata;
    this.originalError = options.originalError;

    // Determine retryable and recovery strategy based on error type
    const classification = this.classifyError(type);
    this.retryable = options.retryable ?? classification.retryable;
    this.recoveryStrategy =
      options.recoveryStrategy ?? classification.recoveryStrategy;

    // Maintain proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PersistenceError);
    }

    // Automatic logging on error creation (Requirement 7.5)
    this.logError();
  }

  /**
   * Get default user message for error type
   */
  private static getDefaultMessage(type: PersistenceErrorType): string {
    switch (type) {
      case PersistenceErrorType.STORAGE_FULL:
        return 'Storage is full. Please delete some conversations to free up space.';
      case PersistenceErrorType.ENCRYPTION_FAILED:
        return 'Encryption failed. Please try again.';
      case PersistenceErrorType.DECRYPTION_FAILED:
        return 'Failed to decrypt data. Data may be corrupted.';
      case PersistenceErrorType.WRITE_FAILED:
        return 'Failed to save data. Please try again.';
      case PersistenceErrorType.READ_FAILED:
        return 'Failed to read data. Please try again.';
      case PersistenceErrorType.VALIDATION_ERROR:
      case PersistenceErrorType.VALIDATION_FAILED:
        return 'Invalid data provided.';
      case PersistenceErrorType.CONFLICT:
        return 'Conflict detected. Your changes may have been overwritten.';
      case PersistenceErrorType.CORRUPTED_DATA:
      case PersistenceErrorType.DATA_CORRUPTION:
        return 'Data is corrupted. Please contact support.';
      case PersistenceErrorType.NETWORK_ERROR:
        return 'Network error. Please check your connection and try again.';
      case PersistenceErrorType.STORAGE_UNAVAILABLE:
        return 'Storage is unavailable. Please try again later.';
      case PersistenceErrorType.INDEXEDDB_ERROR:
        return 'Database error occurred. Please try again.';
      case PersistenceErrorType.LOCALSTORAGE_ERROR:
        return 'Local storage error occurred. Please try again.';
      case PersistenceErrorType.NOT_FOUND:
        return 'Conversation not found.';
      case PersistenceErrorType.TIMEOUT:
        return 'Operation timed out. Please try again.';
      default:
        return 'An unknown error occurred. Please try again.';
    }
  }

  /**
   * Classify error type to determine retryability and recovery strategy
   */
  private classifyError(type: PersistenceErrorType): {
    retryable: boolean;
    recoveryStrategy: RecoveryStrategy;
  } {
    switch (type) {
      case PersistenceErrorType.STORAGE_FULL:
        return {
          retryable: false,
          recoveryStrategy: RecoveryStrategy.EXPORT_DATA,
        };

      case PersistenceErrorType.ENCRYPTION_FAILED:
        // Encryption errors are not retryable - they indicate a fundamental issue
        return { retryable: false, recoveryStrategy: RecoveryStrategy.NONE };

      case PersistenceErrorType.INDEXEDDB_ERROR:
      case PersistenceErrorType.NETWORK_ERROR:
      case PersistenceErrorType.TIMEOUT:
      case PersistenceErrorType.CONFLICT:
      case PersistenceErrorType.WRITE_FAILED:
        return { retryable: true, recoveryStrategy: RecoveryStrategy.RETRY };

      case PersistenceErrorType.DECRYPTION_FAILED:
      case PersistenceErrorType.VALIDATION_ERROR:
      case PersistenceErrorType.VALIDATION_FAILED:
        return { retryable: false, recoveryStrategy: RecoveryStrategy.NONE };

      case PersistenceErrorType.CORRUPTED_DATA:
      case PersistenceErrorType.DATA_CORRUPTION:
        return {
          retryable: false,
          recoveryStrategy: RecoveryStrategy.CLEAR_AND_RETRY,
        };

      case PersistenceErrorType.STORAGE_UNAVAILABLE:
        return {
          retryable: false,
          recoveryStrategy: RecoveryStrategy.FALLBACK,
        };

      case PersistenceErrorType.LOCALSTORAGE_ERROR:
        return { retryable: true, recoveryStrategy: RecoveryStrategy.RETRY };

      case PersistenceErrorType.NOT_FOUND:
        return { retryable: false, recoveryStrategy: RecoveryStrategy.NONE };

      default:
        return { retryable: true, recoveryStrategy: RecoveryStrategy.RETRY };
    }
  }

  /**
   * Get user-friendly error message with recovery suggestion
   */
  public getUserMessage(): string {
    const suggestion = this.getRecoverySuggestion();
    if (suggestion) {
      return `${this.userMessage} ${suggestion}`;
    }
    return this.userMessage;
  }

  /**
   * Get recovery suggestion for user
   */
  public getRecoverySuggestion(): string | null {
    switch (this.recoveryStrategy) {
      case RecoveryStrategy.RETRY:
        return 'Please try again in a moment.';
      case RecoveryStrategy.EXPORT_DATA:
        return 'Please export your data and clear storage to free up space.';
      case RecoveryStrategy.CLEAR_CACHE:
      case RecoveryStrategy.CLEAR_AND_RETRY:
        return 'Please clear your browser cache and try again.';
      case RecoveryStrategy.RELOAD:
        return 'Please reload the page and try again.';
      case RecoveryStrategy.QUEUE:
        return 'Your changes will be saved when connection is restored.';
      case RecoveryStrategy.FALLBACK:
        return 'Trying alternative storage method.';
      default:
        return null;
    }
  }

  /**
   * Determine if error is retryable
   */
  public isRetryable(): boolean {
    return this.retryable;
  }

  /**
   * Check if error should be retried
   * Alias for isRetryable() for backward compatibility
   */
  public shouldRetry(): boolean {
    return this.retryable;
  }

  /**
   * Check if error should be queued for later retry
   */
  public shouldQueue(): boolean {
    return this.retryable && this.recoveryStrategy === RecoveryStrategy.QUEUE;
  }

  /**
   * Check if error is eligible for retry queue
   */
  public isQueueEligible(): boolean {
    return this.retryable && this.recoveryStrategy === RecoveryStrategy.RETRY;
  }

  /**
   * Check if error requires user action
   */
  public requiresUserAction(): boolean {
    return (
      this.recoveryStrategy === RecoveryStrategy.EXPORT_DATA ||
      this.recoveryStrategy === RecoveryStrategy.RELOAD ||
      this.recoveryStrategy === RecoveryStrategy.CLEAR_CACHE ||
      this.recoveryStrategy === RecoveryStrategy.CLEAR_AND_RETRY
    );
  }

  /**
   * Get recovery action type
   * Returns specific action name based on recovery strategy
   */
  public getRecoveryAction(): 'retry' | 'manual' | 'revert' | 'auto' | 'queue' {
    switch (this.recoveryStrategy) {
      case RecoveryStrategy.RETRY:
        return 'retry';
      case RecoveryStrategy.EXPORT_DATA:
      case RecoveryStrategy.CLEAR_CACHE:
      case RecoveryStrategy.CLEAR_AND_RETRY:
      case RecoveryStrategy.RELOAD:
        return 'manual';
      case RecoveryStrategy.NONE:
        // For validation errors, return 'revert' to indicate data should be reverted
        if (
          this.type === PersistenceErrorType.VALIDATION_ERROR ||
          this.type === PersistenceErrorType.VALIDATION_FAILED
        ) {
          return 'revert';
        }
        return 'manual';
      case RecoveryStrategy.QUEUE:
        return 'queue';
      case RecoveryStrategy.FALLBACK:
        return 'auto';
      default:
        return 'auto';
    }
  }

  /**
   * Convert to JSON for logging
   */
  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      type: this.type,
      operation: this.operation,
      message: this.operation,
      userMessage: this.userMessage,
      conversationId: this.conversationId,
      correlationId: this.correlationId,
      retryable: this.retryable,
      recoveryStrategy: this.recoveryStrategy,
      timestamp: this.timestamp.toISOString(),
      metadata: this.metadata,
      stack: this.stack,
    };
  }

  /**
   * Log error with appropriate level based on error type
   * Requirement 7.5: Automatic error logging with metadata
   */
  private logError(): void {
    const logLevel = this.getLogLevel();
    const logMessage = this.operation;

    // Build metadata object
    const metadata: Record<string, unknown> = {
      errorType: this.type,
      correlationId: this.correlationId,
      retryable: this.retryable,
      recoveryStrategy: this.recoveryStrategy,
      operation: this.operation,
      conversationId: this.conversationId,
      timestamp: this.timestamp.toISOString(),
    };

    // Merge with additional metadata
    if (this.metadata) {
      Object.assign(metadata, this.metadata);
    }

    const logData: Record<string, unknown> = {
      metadata,
    };

    // Include original error if available
    if (this.originalError) {
      logData.error = this.originalError;
    }

    // Log with appropriate level
    if (logLevel === 'error') {
      frontendLogger.error(logMessage, logData);
    } else {
      frontendLogger.warn(logMessage, logData);
    }
  }

  /**
   * Determine log level based on error type
   * Most errors use 'error' level, only minor issues use 'warn'
   */
  private getLogLevel(): 'error' | 'warn' {
    // Minor errors that should be logged as warnings
    const warningTypes = [
      PersistenceErrorType.TIMEOUT,
      PersistenceErrorType.NETWORK_ERROR,
      PersistenceErrorType.CONFLICT,
    ];

    return warningTypes.includes(this.type) ? 'warn' : 'error';
  }
}

/**
 * Factory class for creating persistence errors
 */
export class PersistenceErrorFactory {
  /**
   * Create storage full error
   */
  static createStorageFullError(
    operation: string,
    quota?: { used?: number; available?: number }
  ): PersistenceError {
    // Calculate percentage if both values provided
    const metadata: Record<string, unknown> = {};
    if (quota) {
      const quotaInfo: Record<string, unknown> = { ...quota };
      if (quota.used !== undefined && quota.available !== undefined) {
        const total = quota.used + quota.available;
        quotaInfo.percentage = (quota.used / total) * 100;
      }
      metadata.quota = quotaInfo;
    }

    return new PersistenceError(
      PersistenceErrorType.STORAGE_FULL,
      operation,
      'Storage is full. Please delete some conversations to free up space.',
      {
        metadata,
        retryable: false,
        recoveryStrategy: RecoveryStrategy.EXPORT_DATA,
      }
    );
  }

  /**
   * Create IndexedDB error
   */
  static createIndexedDBError(
    operation: string,
    originalError: Error,
    conversationId?: string
  ): PersistenceError {
    return new PersistenceError(
      PersistenceErrorType.INDEXEDDB_ERROR,
      operation,
      'Database error occurred. Please try again.',
      {
        conversationId,
        originalError,
        metadata: {
          storageBackend: 'indexeddb',
          conversationId,
        },
        retryable: true,
        recoveryStrategy: RecoveryStrategy.RETRY,
      }
    );
  }

  /**
   * Create localStorage error
   */
  static createLocalStorageError(
    operation: string,
    originalError: Error,
    conversationId?: string
  ): PersistenceError {
    return new PersistenceError(
      PersistenceErrorType.LOCALSTORAGE_ERROR,
      operation,
      'Local storage error occurred. Please try again.',
      {
        conversationId,
        originalError,
        metadata: { storageBackend: 'localstorage' },
        retryable: true,
        recoveryStrategy: RecoveryStrategy.RETRY,
      }
    );
  }

  /**
   * Create encryption error
   */
  static createEncryptionError(
    operation: string,
    originalError: Error,
    conversationId?: string
  ): PersistenceError {
    return new PersistenceError(
      PersistenceErrorType.ENCRYPTION_FAILED,
      operation,
      'Failed to encrypt data. Please try again.',
      {
        conversationId,
        originalError,
        retryable: true,
        recoveryStrategy: RecoveryStrategy.RETRY,
      }
    );
  }

  /**
   * Create decryption error
   */
  static createDecryptionError(
    operation: string,
    originalError: Error,
    conversationId?: string
  ): PersistenceError {
    return new PersistenceError(
      PersistenceErrorType.DECRYPTION_FAILED,
      operation,
      'Failed to decrypt data. Data may be corrupted.',
      {
        conversationId,
        originalError,
        retryable: false,
        recoveryStrategy: RecoveryStrategy.NONE,
      }
    );
  }

  /**
   * Create validation error
   */
  static createValidationError(
    operation: string,
    field: string,
    value: unknown,
    reason: string
  ): PersistenceError {
    return new PersistenceError(
      PersistenceErrorType.VALIDATION_ERROR,
      operation,
      reason,
      {
        metadata: {
          context: {
            field,
            value,
            reason,
          },
        },
        retryable: false,
        recoveryStrategy: RecoveryStrategy.NONE,
      }
    );
  }

  /**
   * Create data corruption error
   */
  static createDataCorruptionError(
    operation: string,
    conversationId?: string,
    details?: string
  ): PersistenceError {
    return new PersistenceError(
      PersistenceErrorType.DATA_CORRUPTION,
      operation,
      details || 'Data is corrupted. Please contact support.',
      {
        conversationId,
        metadata: {
          conversationId,
        },
        retryable: false,
        recoveryStrategy: RecoveryStrategy.CLEAR_AND_RETRY,
      }
    );
  }

  /**
   * Create not found error
   */
  static createNotFoundError(
    operation: string,
    conversationId?: string
  ): PersistenceError {
    return new PersistenceError(
      PersistenceErrorType.NOT_FOUND,
      operation,
      'Conversation not found.',
      {
        conversationId,
        metadata: {
          conversationId,
        },
        retryable: false,
        recoveryStrategy: RecoveryStrategy.NONE,
      }
    );
  }

  /**
   * Create conflict error
   */
  static createConflictError(
    operation: string,
    conversationId?: string
  ): PersistenceError {
    return new PersistenceError(
      PersistenceErrorType.CONFLICT,
      operation,
      'Conflict detected. Your changes may have been overwritten.',
      {
        conversationId,
        retryable: true,
        recoveryStrategy: RecoveryStrategy.RETRY,
      }
    );
  }

  /**
   * Create timeout error
   */
  static createTimeoutError(
    operation: string,
    timeout?: number
  ): PersistenceError {
    return new PersistenceError(
      PersistenceErrorType.TIMEOUT,
      operation,
      `Operation timed out after ${timeout || 30000}ms.`,
      {
        metadata: {
          context: {
            timeout: timeout || 30000,
          },
        },
        retryable: true,
        recoveryStrategy: RecoveryStrategy.RETRY,
      }
    );
  }

  /**
   * Create storage unavailable error
   */
  static createStorageUnavailableError(reason: string): PersistenceError {
    return new PersistenceError(
      PersistenceErrorType.STORAGE_UNAVAILABLE,
      'storage_init',
      reason,
      {
        retryable: false,
        recoveryStrategy: RecoveryStrategy.FALLBACK,
      }
    );
  }

  /**
   * Create unknown error
   */
  static createUnknownError(
    operation: string,
    originalError: Error,
    conversationId?: string
  ): PersistenceError {
    return new PersistenceError(
      PersistenceErrorType.UNKNOWN,
      operation,
      'An unknown error occurred. Please try again.',
      {
        conversationId,
        originalError,
        retryable: true,
        recoveryStrategy: RecoveryStrategy.RETRY,
      }
    );
  }

  /**
   * Create persistence error from generic Error
   * Analyzes error message to determine appropriate error type
   */
  static fromError(
    error: Error,
    operation: string = 'unknown',
    conversationId?: string
  ): PersistenceError {
    const message = error.message.toLowerCase();

    // Classify error based on message
    if (message.includes('quota') || message.includes('full')) {
      return PersistenceErrorFactory.createStorageFullError(operation);
    }

    if (message.includes('indexeddb')) {
      return PersistenceErrorFactory.createIndexedDBError(
        operation,
        error,
        conversationId
      );
    }

    if (message.includes('localstorage')) {
      return PersistenceErrorFactory.createLocalStorageError(
        operation,
        error,
        conversationId
      );
    }

    if (message.includes('encrypt')) {
      return PersistenceErrorFactory.createEncryptionError(
        operation,
        error,
        conversationId
      );
    }

    if (message.includes('decrypt')) {
      return PersistenceErrorFactory.createDecryptionError(
        operation,
        error,
        conversationId
      );
    }

    if (message.includes('validation') || message.includes('invalid')) {
      return PersistenceErrorFactory.createValidationError(
        operation,
        'unknown',
        error.message,
        error.message
      );
    }

    if (message.includes('conflict')) {
      return PersistenceErrorFactory.createConflictError(
        operation,
        conversationId
      );
    }

    if (message.includes('corrupt')) {
      return PersistenceErrorFactory.createDataCorruptionError(
        operation,
        conversationId,
        error.message
      );
    }

    if (message.includes('network') || message.includes('connection')) {
      return new PersistenceError(
        PersistenceErrorType.NETWORK_ERROR,
        operation,
        'Network error. Please check your connection and try again.',
        {
          conversationId,
          originalError: error,
          retryable: true,
          recoveryStrategy: RecoveryStrategy.RETRY,
        }
      );
    }

    if (message.includes('timeout')) {
      return PersistenceErrorFactory.createTimeoutError(operation);
    }

    if (message.includes('not found')) {
      return PersistenceErrorFactory.createNotFoundError(
        operation,
        conversationId
      );
    }

    // Default to unknown error with retry
    return PersistenceErrorFactory.createUnknownError(
      operation,
      error,
      conversationId
    );
  }
}

// Export factory functions for convenience
export const createStorageFullError = (
  operation: string,
  quota?: { used?: number; available?: number }
): PersistenceError =>
  PersistenceErrorFactory.createStorageFullError(operation, quota);

export const createIndexedDBError = (
  operation: string,
  originalError: Error,
  conversationId?: string
): PersistenceError =>
  PersistenceErrorFactory.createIndexedDBError(
    operation,
    originalError,
    conversationId
  );

export const createLocalStorageError = (
  operation: string,
  originalError: Error,
  conversationId?: string
): PersistenceError =>
  PersistenceErrorFactory.createLocalStorageError(
    operation,
    originalError,
    conversationId
  );

export const createEncryptionError = (
  operation: string,
  originalError: Error,
  conversationId?: string
): PersistenceError =>
  PersistenceErrorFactory.createEncryptionError(
    operation,
    originalError,
    conversationId
  );

export const createDecryptionError = (
  operation: string,
  originalError: Error,
  conversationId?: string
): PersistenceError =>
  PersistenceErrorFactory.createDecryptionError(
    operation,
    originalError,
    conversationId
  );

export const createValidationError = (
  operation: string,
  field: string,
  value: unknown,
  reason: string
): PersistenceError =>
  PersistenceErrorFactory.createValidationError(
    operation,
    field,
    value,
    reason
  );

export const createDataCorruptionError = (
  operation: string,
  conversationId?: string,
  details?: string
): PersistenceError =>
  PersistenceErrorFactory.createDataCorruptionError(
    operation,
    conversationId,
    details
  );

export const createNotFoundError = (
  operation: string,
  conversationId?: string
): PersistenceError =>
  PersistenceErrorFactory.createNotFoundError(operation, conversationId);

export const createConflictError = (
  operation: string,
  conversationId?: string
): PersistenceError =>
  PersistenceErrorFactory.createConflictError(operation, conversationId);

export const createTimeoutError = (
  operation: string,
  timeout?: number
): PersistenceError =>
  PersistenceErrorFactory.createTimeoutError(operation, timeout);

export const createStorageUnavailableError = (
  reason: string
): PersistenceError =>
  PersistenceErrorFactory.createStorageUnavailableError(reason);

export const createUnknownError = (
  operation: string,
  originalError: Error,
  conversationId?: string
): PersistenceError =>
  PersistenceErrorFactory.createUnknownError(
    operation,
    originalError,
    conversationId
  );

/**
 * Create persistence error from unknown error
 */
export function createPersistenceError(
  error: unknown,
  operation: string = 'unknown'
): PersistenceError {
  if (error instanceof PersistenceError) {
    return error;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Classify error based on message
    if (message.includes('quota') || message.includes('full')) {
      return createStorageFullError(operation);
    }

    if (message.includes('indexeddb')) {
      return createIndexedDBError(operation, error);
    }

    if (message.includes('localstorage')) {
      return createLocalStorageError(operation, error);
    }

    if (message.includes('encrypt')) {
      return createEncryptionError(operation, error);
    }

    if (message.includes('decrypt')) {
      return createDecryptionError(operation, error);
    }

    if (message.includes('validation') || message.includes('invalid')) {
      return createValidationError(
        operation,
        'unknown',
        error.message,
        error.message
      );
    }

    if (message.includes('conflict')) {
      return createConflictError(operation);
    }

    if (message.includes('corrupt')) {
      return createDataCorruptionError(operation, undefined, error.message);
    }

    if (message.includes('network') || message.includes('connection')) {
      return new PersistenceError(
        PersistenceErrorType.NETWORK_ERROR,
        operation,
        'Network error. Please check your connection and try again.',
        {
          originalError: error,
          retryable: true,
          recoveryStrategy: RecoveryStrategy.RETRY,
        }
      );
    }

    if (message.includes('timeout')) {
      return createTimeoutError(operation);
    }

    if (message.includes('not found')) {
      return createNotFoundError(operation);
    }

    // Default to unknown error with retry
    return createUnknownError(operation, error);
  }

  // Unknown error type
  return createUnknownError(operation, new Error(String(error)));
}
