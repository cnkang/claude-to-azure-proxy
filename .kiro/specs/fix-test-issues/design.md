# Design Document

## Overview

This design addresses critical test issues in the codebase that cause 66 test failures out of 589 total tests. The main issues are:

1. **Unhandled Promise Rejections**: 2 unhandled rejections in storage-persistence tests causing worker exit errors
2. **Search Functionality Failures**: 9 search tests failing due to missing test data initialization
3. **E2E Test Issues**: Wrong method names (`executeWithRetry` vs `execute`) and undefined variables (`currentSessionId`)
4. **Title Validation Test**: Incorrect expectations for validation error handling

The solution implements proper async/await patterns, fixes test data initialization, corrects method names and variable definitions, and ensures all tests pass without disabling checks or avoiding problems.

## Root Cause Analysis

### 1. Storage Persistence Unhandled Promise Rejections

**Problem**: Test "should integrate retry logic with storage operations" causes 2 unhandled promise rejections that lead to worker exit errors.

**Root Causes**:
1. **Retry Logic with Fake Timers**: The `updateWithRetry` function uses retry manager with fake timers, but rejected promises aren't properly caught
2. **Promise Settlement Race**: When storage operations fail during retry, the rejected promises settle after test completion
3. **Worker Exit**: Unhandled rejections cause the worker process to exit unexpectedly
4. **Missing Error Handling**: The test doesn't properly catch rejected promises before advancing timers

**Evidence from Test Output**:
```
⎯⎯⎯⎯ Unhandled Rejection ⎯⎯⎯⎯⎯
Error: Failed to update conversation title
 ❯ ConversationStorage.updateConversationTitleLocalStorage src/services/storage.ts:1186:13
 ❯ updateWithRetry src/test/storage-persistence.test.ts:672:9

⎯⎯⎯⎯⎯⎯ Unhandled Error ⎯⎯⎯⎯⎯⎯⎯
Error: [vitest-pool]: Worker forks emitted error.
Caused by: Error: Worker exited unexpectedly
```

### 2. Search Functionality Test Failures

**Problem**: 9 search functionality tests fail because search operations return empty results.

**Root Causes**:
1. **Missing Test Data**: Search index is not populated with test conversations before search operations
2. **Undefined Variables**: `currentSessionId` is referenced but not defined in test scope
3. **Storage Not Initialized**: Tests don't ensure storage contains searchable conversations
4. **Async Timing**: Search index may not be updated before search queries execute

**Evidence from Test Output**:
```
FAIL  src/test/e2e/search-functionality.test.ts > should search and display results
AssertionError: expected 0 to be greater than 0
 ❯ expect(response.results.length).toBeGreaterThan(0);

FAIL  src/test/e2e/search-functionality.test.ts > should handle pagination
ReferenceError: currentSessionId is not defined
 ❯ sessionId: currentSessionId,
```

### 3. E2E Test Method and Variable Issues

**Problem**: E2E tests fail due to incorrect method names and undefined variables.

**Root Causes**:
1. **Wrong Method Name**: Test calls `retryManager.executeWithRetry()` but the correct method is `retryManager.execute()`
2. **Undefined Variables**: `currentSessionId` is used but not defined in test scope
3. **Title Validation**: Test expects long titles to be accepted but validation correctly rejects them

**Evidence from Test Output**:
```
FAIL  src/test/e2e/error-recovery.test.ts > should maintain data consistency
TypeError: retryManager.executeWithRetry is not a function
 ❯ await retryManager.executeWithRetry(operation, 'consistencyTest', …

FAIL  src/test/e2e/title-persistence.test.ts > should handle very long titles
Error: Title must be between 1 and 200 characters
 ❯ ConversationStorage.updateConversationTitle src/services/storage.ts:978:17
```

## Architecture

### Component Overview

```
Test Infrastructure
├── Retry Manager Tests (apps/frontend/src/test/retry-manager.test.ts)
│   ├── Fake Timer Management
│   ├── Promise Settlement Handling
│   └── Cleanup Coordination
├── Storage Persistence Tests (apps/frontend/src/test/storage-persistence.test.ts)
│   ├── Storage Initialization
│   ├── State Isolation
│   └── Cleanup Management
└── E2E Tests (tests/e2e/*.spec.ts)
    ├── Browser Storage Setup
    ├── Test Isolation
    └── Cleanup Verification
```

### Design Principles

1. **Explicit Promise Settlement**: All promises must be explicitly awaited before test completion
2. **Proper Cleanup Order**: Cleanup operations must complete in correct order (promises → timers → storage)
3. **State Isolation**: Each test must have isolated storage state
4. **Deterministic Timing**: Fake timers must be used consistently with proper await patterns

## Components and Interfaces

### 1. Retry Manager Test Fixes

#### Test Pattern Improvements

**Current Pattern (Problematic)**:
```typescript
const executePromise = (async () => {
  const promise = manager.execute(operation);
  await vi.runAllTimersAsync();
  return promise;
})();
const result = await executePromise;
```

**New Pattern (Fixed)**:
```typescript
// Pattern 1: For tests expecting success
const promise = manager.execute(operation);
await vi.runAllTimersAsync();
const result = await promise;

// Pattern 2: For tests expecting rejection
const promise = manager.execute(operation);
const rejectionPromise = promise.catch((error) => error);
await vi.runAllTimersAsync();
await rejectionPromise;
expect(operation).toHaveBeenCalledTimes(expectedCount);

// Pattern 3: For tests with expect().rejects
await expect(async () => {
  const promise = manager.execute(operation);
  await vi.runAllTimersAsync();
  await promise;
}).rejects.toThrow('expected error');
```

#### Cleanup Improvements

**Enhanced afterEach Hook**:
```typescript
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
```

### 2. Storage Persistence Test Fixes

#### Storage Initialization Pattern

**Enhanced beforeEach Hook**:
```typescript
beforeEach(async () => {
  // 1. Clear all mocks and storage
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  
  // 2. Disable IndexedDB for consistent testing
  originalIndexedDB = window.indexedDB;
  Object.defineProperty(window, 'indexedDB', {
    configurable: true,
    value: null,
  });
  
  // 3. Initialize storage and wait for completion
  storage = ConversationStorage.getInstance();
  await storage.initialize();
  
  // 4. Verify fallback mode
  expect((storage as any).isIndexedDBAvailable).toBe(false);
  
  // 5. Setup localStorage helpers
  setupLocalStorageHelpers();
});
```

#### Storage Cleanup Pattern

**Enhanced afterEach Hook**:
```typescript
afterEach(async () => {
  // 1. Clear all storage data
  sessionStorage.clear();
  localStorage.clear();
  
  // 2. Restore IndexedDB
  Object.defineProperty(window, 'indexedDB', {
    configurable: true,
    value: originalIndexedDB,
  });
  
  // 3. Wait for any pending storage operations
  await new Promise((resolve) => setTimeout(resolve, 0));
});
```

### 3. Storage Persistence Unhandled Rejection Fixes

#### Fix Retry Logic Test Pattern

**Current Pattern (Problematic)**:
```typescript
// In storage-persistence.test.ts
const updateWithRetry = async (conversationId: string, newTitle: string) => {
  return retryManager.execute(async () => {
    await storage.updateConversationTitle(conversationId, newTitle);
  });
};

// Test doesn't catch rejected promises
await updateWithRetry(conversation.id, 'Updated Title');
```

**Fixed Pattern**:
```typescript
// Pattern 1: Catch rejection before timer advancement
const promise = updateWithRetry(conversation.id, 'Updated Title');
const rejectionPromise = promise.catch((error) => error);
await vi.runAllTimersAsync();
const error = await rejectionPromise;

// Pattern 2: Use expect().rejects
await expect(async () => {
  const promise = updateWithRetry(conversation.id, 'Updated Title');
  await vi.runAllTimersAsync();
  await promise;
}).rejects.toThrow('Failed to update conversation title');
```

### 4. Search Functionality Test Fixes

#### Fix Test Data Initialization

**Add Test Data Setup**:
```typescript
beforeEach(async () => {
  // Initialize storage
  storage = ConversationStorage.getInstance();
  await storage.initialize();
  
  // Define currentSessionId
  const currentSessionId = 'test-session-' + Date.now();
  
  // Create test conversations with searchable content
  const testConversations = [
    {
      id: 'conv-1',
      title: 'TypeScript Tutorial',
      messages: [
        { role: 'user', content: 'How do I use TypeScript?' },
        { role: 'assistant', content: 'TypeScript is a typed superset of JavaScript...' }
      ],
      sessionId: currentSessionId,
      // ... other required fields
    },
    // ... more test conversations
  ];
  
  // Save conversations to storage
  for (const conv of testConversations) {
    await storage.saveConversation(conv);
  }
  
  // Wait for search index to update
  await new Promise(resolve => setTimeout(resolve, 100));
});
```

#### Fix Variable Scope Issues

**Define currentSessionId in Test Scope**:
```typescript
describe('Search Functionality', () => {
  let storage: ConversationStorage;
  let currentSessionId: string;  // Define at describe level
  
  beforeEach(async () => {
    currentSessionId = 'test-session-' + Date.now();
    // ... rest of setup
  });
  
  test('should search conversations', async () => {
    // Now currentSessionId is defined
    const conversation = {
      id: 'conv-1',
      sessionId: currentSessionId,  // No ReferenceError
      // ... other fields
    };
  });
});
```

### 5. E2E Test Method and Variable Fixes

#### Fix RetryManager Method Name

**Current Code (Wrong)**:
```typescript
// In error-recovery.test.ts
await retryManager.executeWithRetry(operation, 'consistencyTest', {
  maxAttempts: 3,
  baseDelay: 100,
});
```

**Fixed Code**:
```typescript
// Correct method name is 'execute'
await retryManager.execute(operation);
```

#### Fix Undefined Variable References

**Define currentSessionId**:
```typescript
describe('E2E: Search Functionality', () => {
  let currentSessionId: string;
  
  beforeEach(async () => {
    currentSessionId = 'test-session-' + Date.now();
  });
  
  test('should handle pagination', async () => {
    const conversation = {
      id: 'conv-1',
      sessionId: currentSessionId,  // Now defined
      // ... other fields
    };
  });
});
```

#### Fix Title Validation Test

**Current Test (Incorrect Expectation)**:
```typescript
test('should handle very long titles correctly', async () => {
  const longTitle = 'A'.repeat(300);  // > 200 characters
  await storage.updateConversationTitle(conversation.id, longTitle);
  // Test expects this to succeed, but it should fail
});
```

**Fixed Test**:
```typescript
test('should handle very long titles correctly', async () => {
  const longTitle = 'A'.repeat(300);  // > 200 characters
  
  // Expect validation error
  await expect(
    storage.updateConversationTitle(conversation.id, longTitle)
  ).rejects.toThrow('Title must be between 1 and 200 characters');
});
```

### 6. E2E Browser Storage Setup

#### Browser Storage Initialization

**Storage Initialization in E2E Tests**:
```typescript
test.beforeEach(async ({ page }) => {
  // 1. Clear all storage before each test
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  
  // 2. Clear IndexedDB databases
  await page.evaluate(async () => {
    const databases = await indexedDB.databases();
    for (const db of databases) {
      if (db.name) {
        indexedDB.deleteDatabase(db.name);
      }
    }
  });
  
  // 3. Navigate to page
  await page.goto('/');
  
  // 4. Wait for storage initialization
  await page.waitForFunction(() => {
    return window.localStorage !== null && window.sessionStorage !== null;
  });
});
```

#### Test Isolation

**Storage State Verification**:
```typescript
test('should have clean storage state', async ({ page }) => {
  // Verify storage is empty at test start
  const storageState = await page.evaluate(() => ({
    localStorageLength: localStorage.length,
    sessionStorageLength: sessionStorage.length,
  }));
  
  expect(storageState.localStorageLength).toBe(0);
  expect(storageState.sessionStorageLength).toBe(0);
});
```

## Data Models

### Test Execution State

```typescript
interface TestExecutionState {
  // Promise tracking
  pendingPromises: Set<Promise<unknown>>;
  settledPromises: Set<Promise<unknown>>;
  
  // Timer tracking
  fakeTimersActive: boolean;
  pendingTimers: number[];
  
  // Storage tracking
  storageInitialized: boolean;
  storageCleanupComplete: boolean;
}
```

### Storage Test Context

```typescript
interface StorageTestContext {
  storage: ConversationStorage;
  originalIndexedDB: typeof indexedDB;
  testConversations: Map<string, Conversation>;
  cleanupCallbacks: Array<() => Promise<void>>;
}
```

## Error Handling

### Test Error Classification

```typescript
enum TestErrorType {
  UNHANDLED_REJECTION = 'unhandled_rejection',
  TIMER_LEAK = 'timer_leak',
  STORAGE_INITIALIZATION = 'storage_initialization',
  STORAGE_CLEANUP = 'storage_cleanup',
  STATE_ISOLATION = 'state_isolation',
}

interface TestError {
  type: TestErrorType;
  message: string;
  testName: string;
  timestamp: Date;
  stack?: string;
}
```

### Error Recovery Strategies

1. **Unhandled Rejection**: Ensure all promises are awaited before test completion
2. **Timer Leak**: Restore real timers in afterEach and verify no pending timers
3. **Storage Initialization**: Add retry logic with exponential backoff
4. **Storage Cleanup**: Implement cleanup verification with timeout
5. **State Isolation**: Add pre-test state verification

## Testing Strategy

### Unit Test Improvements

**Retry Manager Tests**:
- Fix all async/await patterns to prevent unhandled rejections
- Add explicit promise settlement verification
- Enhance cleanup to ensure all timers and promises are cleared
- Add test for cleanup verification

**Storage Persistence Tests**:
- Ensure storage initialization completes before tests run
- Add storage state verification before and after each test
- Implement proper cleanup with verification
- Add tests for concurrent operations

### E2E Test Improvements

**Browser Compatibility Tests**:
- Add storage initialization verification
- Implement proper cleanup between tests
- Add retry logic for flaky storage operations
- Verify storage state isolation

**Search Functionality Tests**:
- Ensure storage is initialized before search operations
- Add cleanup verification after each test
- Implement proper error handling for storage failures

### Integration Test Strategy

**Cross-Component Testing**:
- Test retry manager with storage operations
- Verify storage cleanup doesn't interfere with retry logic
- Test concurrent storage operations with retry logic
- Verify error handling across components

## Configuration Updates

### Vitest Configuration

**Frontend Configuration** (`apps/frontend/vitest.config.ts`):
```typescript
export default defineConfig({
  test: {
    // ... existing config
    
    // Add test timeout for async operations
    testTimeout: 10000,
    hookTimeout: 10000,
    
    // Ensure proper cleanup
    clearMocks: true,
    restoreMocks: true,
    
    // Add retry for flaky tests
    retry: 1,
    
    // Ensure sequential execution for storage tests
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
```

### Playwright Configuration

**E2E Configuration** (`playwright.config.ts`):
```typescript
export default defineConfig({
  // ... existing config
  
  use: {
    // Add storage state cleanup
    storageState: undefined,
    
    // Add retry for flaky tests
    retries: 2,
    
    // Add timeout for storage operations
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },
  
  // Ensure proper cleanup between tests
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
});
```

## Steering Documentation Updates

### New Steering Document: `test-patterns.md`

**Location**: `.kiro/steering/test-patterns.md`

**Content**:
- Async/await patterns for fake timer tests
- Storage initialization and cleanup patterns
- E2E test isolation patterns
- Error handling in tests
- Best practices for test reliability

### Updated Steering Document: `tech.md`

**Additions**:
- Test execution guidelines
- Fake timer usage patterns
- Storage testing best practices
- E2E test patterns

## Documentation Cleanup Strategy

### Temporary Documentation to Review

1. **Test-related summaries**:
   - `TASK_13_COMPLETION_SUMMARY.md`
   - `RETRY_MANAGER_FINAL_SUMMARY.md`
   - `CONVERSATION_PERSISTENCE_FINAL_REPORT.md`
   - `FIXES_SUMMARY.md`
   - `.kiro/test-fixes-summary.md`
   - `.kiro/test-fixes-complete-summary.md`

2. **Implementation summaries**:
   - `apps/frontend/RETRY_MANAGER_IMPROVEMENTS.md`
   - `apps/frontend/CONVERSATION_MANAGEMENT_IMPLEMENTATION.md`
   - `apps/frontend/PERFORMANCE_MONITORING_IMPLEMENTATION.md`
   - `apps/frontend/LANGUAGE_SWITCH_FIX.md`
   - `apps/frontend/UI_MODERNIZATION.md`
   - `apps/frontend/ACCESSIBILITY_IMPLEMENTATION_SUMMARY.md`

### Cleanup Actions

**Merge Strategy**:
1. Extract valuable patterns and insights from temporary docs
2. Merge into appropriate permanent documentation:
   - Testing patterns → `.kiro/steering/test-patterns.md`
   - Implementation details → `docs/developer-guide/`
   - Architecture decisions → `docs/architecture/decisions/`
3. Remove temporary documentation files
4. Update README.md with links to consolidated documentation

**Commit Strategy**:
1. **Commit 1**: Fix retry manager test patterns
2. **Commit 2**: Fix storage persistence test patterns
3. **Commit 3**: Fix E2E test patterns
4. **Commit 4**: Update vitest and playwright configurations
5. **Commit 5**: Add steering documentation for test patterns
6. **Commit 6**: Merge and cleanup temporary documentation
7. **Commit 7**: Update README and main documentation

## Implementation Plan

### Phase 1: Fix Storage Persistence Unhandled Rejections (COMPLETED: Tasks 1-6)
1. ✅ Update retry manager test patterns
2. ✅ Fix storage persistence test patterns
3. ✅ Fix E2E test patterns
4. ✅ Update test configurations
5. ✅ Create test patterns steering documentation
6. ✅ Update tech steering documentation

### Phase 2: Fix Storage Persistence Unhandled Rejections (NEW: Task 7)
1. Fix "should integrate retry logic with storage operations" test
2. Update `updateWithRetry` function to properly catch rejections
3. Ensure proper async/await pattern with fake timers
4. Verify test passes without unhandled rejections
5. Verify no worker exit errors

### Phase 3: Fix Search Functionality Test Failures (NEW: Task 8)
1. Add test data initialization in beforeEach
2. Define `currentSessionId` variable in test scope
3. Create and save test conversations before search operations
4. Wait for search index to update after saving conversations
5. Update all search tests to use proper test data
6. Verify all 9 search tests pass

### Phase 4: Fix E2E Test Method and Variable Issues (NEW: Task 9)
1. Fix RetryManager method name from `executeWithRetry` to `execute`
2. Define `currentSessionId` in E2E test scope
3. Fix title validation test to expect validation error
4. Update all E2E tests with correct method names and variables
5. Verify all E2E tests pass

### Phase 5: Verify All Tests Pass (NEW: Task 10)
1. Run full test suite with `pnpm test --run`
2. Verify all 589 tests pass (zero failures)
3. Verify no unhandled rejection warnings
4. Verify no worker exit errors
5. Verify type-check and lint pass

### Phase 6: Documentation Cleanup (NEW: Task 11)
1. Review all temporary documentation files
2. Extract valuable patterns and insights
3. Merge content into permanent documentation
4. Remove temporary files
5. Update README with consolidated documentation links

### Phase 7: Commit Changes (NEW: Task 12)
1. Commit storage persistence unhandled rejection fixes
2. Commit search functionality test fixes
3. Commit E2E test method and variable fixes
4. Commit documentation cleanup
5. Commit README and main documentation updates

## Success Criteria

1. **All Tests Pass**: `pnpm test --run` completes with 0 failures and 0 unhandled errors
2. **Type Check Passes**: `pnpm type-check` completes with 0 errors
3. **Lint Passes**: `pnpm lint` completes with 0 errors
4. **No Unhandled Rejections**: Test output shows no unhandled rejection warnings
5. **E2E Tests Pass**: All E2E tests pass consistently
6. **Documentation Updated**: Steering docs reflect new patterns
7. **Temporary Docs Cleaned**: All temporary documentation merged or removed
8. **Commits Organized**: Changes committed in logical batches with clear messages
