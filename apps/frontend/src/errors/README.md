# Persistence Error Classification System

## Overview

The persistence error classification system provides comprehensive error handling for conversation
persistence operations with automatic error classification, recovery strategies, and user-friendly
messages.

## Features

### Error Classification (Requirement 7.2)

The system classifies errors into specific types:

- **STORAGE_FULL**: Storage quota exceeded (non-retryable)
- **ENCRYPTION_FAILED**: Encryption operation failed (retryable)
- **DECRYPTION_FAILED**: Decryption operation failed (non-retryable)
- **COMPRESSION_FAILED**: Compression operation failed (retryable)
- **DECOMPRESSION_FAILED**: Decompression operation failed (non-retryable)
- **INDEXEDDB_ERROR**: IndexedDB operation failed (retryable)
- **LOCALSTORAGE_ERROR**: localStorage operation failed (retryable)
- **STORAGE_UNAVAILABLE**: Storage backend unavailable (non-retryable)
- **VALIDATION_ERROR**: Data validation failed (non-retryable)
- **DATA_CORRUPTION**: Data corruption detected (non-retryable)
- **NOT_FOUND**: Conversation not found (non-retryable)
- **CONFLICT**: Concurrent modification conflict (retryable)
- **TIMEOUT**: Operation timeout (retryable)
- **NETWORK_ERROR**: Network error during sync (retryable)
- **UNKNOWN**: Unknown error (retryable by default)

### Recovery Strategies

Each error type has an associated recovery strategy:

- **RETRY**: Retry with exponential backoff (Requirement 7.1)
- **QUEUE**: Queue for later execution (Requirement 7.2)
- **FALLBACK**: Fallback to alternative storage
- **CLEAR_AND_RETRY**: Clear corrupted data and retry
- **EXPORT_DATA**: Offer user to export data (Requirement 7.3)
- **DELETE_OLD**: Offer user to delete old conversations (Requirement 7.3)
- **MANUAL**: Manual intervention required
- **NONE**: No recovery possible

### Error Metadata

Each error includes comprehensive metadata:

- **correlationId**: Unique ID for debugging (Requirement 7.4)
- **timestamp**: When the error occurred
- **operation**: Operation that failed
- **conversationId**: Related conversation ID
- **storageBackend**: Storage backend that failed
- **quota**: Storage quota information
- **context**: Additional context

### User-Friendly Messages

Each error provides:

- **technicalMessage**: Detailed message for logging
- **userMessage**: User-friendly message for display
- **recoverySuggestion**: Actionable recovery suggestion

## Usage

### Creating Errors

```typescript
import {
  createStorageFullError,
  createIndexedDBError,
  createValidationError,
  createPersistenceError,
} from '../errors/persistence-error.js';

// Create specific error types
const storageError = createStorageFullError('updateTitle', {
  used: 1000,
  available: 500,
});

const dbError = createIndexedDBError(
  'deleteConversation',
  new Error('Transaction failed'),
  'conv-123'
);

const validationError = createValidationError('updateTitle', 'title', '', 'Title cannot be empty');

// Create from generic Error
const error = createPersistenceError(new Error('Something went wrong'), 'updateTitle', 'conv-123');
```

### Handling Errors

```typescript
import { PersistenceError } from '../errors/persistence-error.js';
import { retryManager } from '../utils/retry-manager.js';

try {
  await storage.updateConversationTitle(id, title);
} catch (error) {
  if (error instanceof PersistenceError) {
    // Check if should retry
    if (error.shouldRetry()) {
      await retryManager.execute(() => storage.updateConversationTitle(id, title));
    }

    // Check if requires user action
    if (error.requiresUserAction()) {
      showNotification(error.getUserMessage(), {
        actions: [
          { label: 'Export Data', action: exportData },
          { label: 'Delete Old', action: deleteOld },
        ],
      });
    }

    // Log with correlation ID
    console.error('Operation failed', {
      correlationId: error.correlationId,
      type: error.type,
      recoveryStrategy: error.recoveryStrategy,
    });
  }
}
```

### Integration with Retry Manager

```typescript
import { retryManager } from '../utils/retry-manager.js';
import { createPersistenceError } from '../errors/persistence-error.js';

const result = await retryManager.execute(
  async () => {
    try {
      return await storage.updateConversationTitle(id, title);
    } catch (error) {
      throw createPersistenceError(
        error instanceof Error ? error : new Error(String(error)),
        'updateTitle',
        id
      );
    }
  },
  {
    maxAttempts: 3,
    baseDelay: 500,
    isRetryable: (error) => {
      if (error instanceof PersistenceError) {
        return error.shouldRetry();
      }
      return true;
    },
  }
);
```

## Testing

The error classification system has comprehensive test coverage (92.56%):

- Error classification tests
- Error metadata tests
- Error logging tests
- User message tests
- Recovery strategy tests
- JSON serialization tests
- Error factory tests
- Integration tests

Run tests:

```bash
pnpm test persistence-error.test.ts --run
```

## Requirements Coverage

- ✅ **7.1**: Retry up to 3 times with exponential backoff
- ✅ **7.2**: Classify errors as retryable/non-retryable, queue for later execution
- ✅ **7.3**: Offer to delete old conversations or export data
- ✅ **7.4**: Log all persistence errors with correlation IDs

## Architecture

The error classification system follows these design principles:

1. **Separation of Concerns**: Error classification, recovery strategies, and user messages are
   separate
2. **Extensibility**: Easy to add new error types and recovery strategies
3. **Type Safety**: Full TypeScript support with enums and interfaces
4. **Logging**: Automatic logging with correlation IDs
5. **User Experience**: User-friendly messages with actionable suggestions
6. **Integration**: Works seamlessly with existing retry manager and error handling hooks

## Future Enhancements

Potential improvements:

1. Error analytics and tracking
2. Automatic error recovery workflows
3. Error rate limiting and circuit breakers
4. Error aggregation and reporting
5. Custom error handlers per operation type
