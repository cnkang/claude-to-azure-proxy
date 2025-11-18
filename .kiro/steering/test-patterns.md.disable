---
inclusion: always
---

# Test Patterns and Best Practices

## Overview

This document provides comprehensive test patterns and best practices for writing reliable, maintainable tests in the Claude-to-Azure OpenAI Proxy project. Following these patterns ensures tests are deterministic, properly isolated, and free from common issues like unhandled promise rejections and timing-related failures.

## Table of Contents

1. [Async/Await Patterns for Fake Timers](#asyncawait-patterns-for-fake-timers)
2. [Storage Testing Patterns](#storage-testing-patterns)
3. [E2E Test Patterns](#e2e-test-patterns)
4. [General Testing Best Practices](#general-testing-best-practices)

---

## Async/Await Patterns for Fake Timers

### Overview

When testing code that uses timers (setTimeout, setInterval, retry logic with delays), Vitest's fake timers (`vi.useFakeTimers()`) allow you to control time. However, improper async/await patterns can lead to unhandled promise rejections and flaky tests.

### Core Principles

1. **Always await timer advancement** before awaiting promises
2. **Properly handle rejected promises** before test completion
3. **Ensure cleanup completes** before moving to next test
4. **Use consistent patterns** for success and failure cases

### Pattern 1: Testing Successful Operations

**✅ CORRECT Pattern:**

```typescript
test('should execute operation successfully', async () => {
  vi.useFakeTimers();
  
  const operation = vi.fn().mockResolvedValue('success');
  const manager = new RetryManager({ maxAttempts: 3 });
  
  // Create promise first
  const promise = manager.execute(operation);
  
  // Advance timers to trigger any scheduled callbacks
  await vi.runAllTimersAsync();
  
  // Now await the promise
  const result = await promise;
  
  expect(result).toBe('success');
  expect(operation).toHaveBeenCalledTimes(1);
  
  vi.useRealTimers();
});
```

**❌ INCORRECT Pattern (causes unhandled rejections):**

```typescript
test('should execute operation successfully', async () => {
  vi.useFakeTimers();
  
  const operation = vi.fn().mockResolvedValue('success');
  const manager = new RetryManager({ maxAttempts: 3 });
  
  // ❌ Wrapping in async IIFE doesn't guarantee proper settlement
  const executePromise = (async () => {
    const promise = manager.execute(operation);
    await vi.runAllTimersAsync();
    return promise;  // Promise may still be pending
  })();
  
  const result = await executePromise;  // May complete before rejection handlers run
  
  vi.useRealTimers();
});
```

### Pattern 2: Testing Failing Operations

**✅ CORRECT Pattern:**

```typescript
test('should retry on failure', async () => {
  vi.useFakeTimers();
  
  const operation = vi.fn()
    .mockRejectedValueOnce(new Error('Attempt 1 failed'))
    .mockRejectedValueOnce(new Error('Attempt 2 failed'))
    .mockRejectedValueOnce(new Error('Attempt 3 failed'));
  
  const manager = new RetryManager({ maxAttempts: 3 });
  
  // Create promise and catch rejection immediately
  const promise = manager.execute(operation);
  const rejectionPromise = promise.catch((error) => error);
  
  // Advance timers to trigger retries
  await vi.runAllTimersAsync();
  
  // Await the caught rejection
  const error = await rejectionPromise;
  
  expect(error).toBeInstanceOf(Error);
  expect(operation).toHaveBeenCalledTimes(3);
  
  vi.useRealTimers();
});
```

**Alternative Pattern with expect().rejects:**

```typescript
test('should retry on failure', async () => {
  vi.useFakeTimers();
  
  const operation = vi.fn()
    .mockRejectedValueOnce(new Error('Attempt 1 failed'))
    .mockRejectedValueOnce(new Error('Attempt 2 failed'))
    .mockRejectedValueOnce(new Error('Attempt 3 failed'));
  
  const manager = new RetryManager({ maxAttempts: 3 });
  
  await expect(async () => {
    const promise = manager.execute(operation);
    await vi.runAllTimersAsync();
    await promise;
  }).rejects.toThrow('Attempt 3 failed');
  
  expect(operation).toHaveBeenCalledTimes(3);
  
  vi.useRealTimers();
});
```

### Pattern 3: Testing Timeout Handling

**✅ CORRECT Pattern:**

```typescript
test('should handle timeout', async () => {
  vi.useFakeTimers();
  
  const operation = vi.fn().mockImplementation(() => {
    return new Promise((resolve) => {
      // Never resolves - simulates timeout
    });
  });
  
  const manager = new RetryManager({ 
    maxAttempts: 1,
    timeout: 5000 
  });
  
  const promise = manager.execute(operation);
  const rejectionPromise = promise.catch((error) => error);
  
  // Advance time past timeout
  await vi.advanceTimersByTimeAsync(6000);
  
  const error = await rejectionPromise;
  
  expect(error.message).toContain('timeout');
  
  vi.useRealTimers();
});
```

### Pattern 4: Enhanced Cleanup Hook

**✅ CORRECT Pattern:**

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

### Common Pitfalls to Avoid

1. **❌ Not awaiting timer advancement:**
   ```typescript
   const promise = manager.execute(operation);
   vi.runAllTimersAsync();  // ❌ Missing await
   await promise;
   ```

2. **❌ Awaiting promise before advancing timers:**
   ```typescript
   const promise = manager.execute(operation);
   await promise;  // ❌ Will hang - timers haven't advanced
   await vi.runAllTimersAsync();
   ```

3. **❌ Not catching rejected promises:**
   ```typescript
   const promise = manager.execute(operation);  // ❌ Will reject without handler
   await vi.runAllTimersAsync();
   // Test ends, promise rejects -> unhandled rejection
   ```

4. **❌ Restoring timers before promises settle:**
   ```typescript
   const promise = manager.execute(operation);
   vi.useRealTimers();  // ❌ Too early
   await vi.runAllTimersAsync();  // Won't work - real timers restored
   await promise;
   ```

---

## Storage Testing Patterns

### Overview

Testing browser storage (IndexedDB, localStorage, sessionStorage) requires careful initialization, cleanup, and state isolation to prevent test interference and flaky failures.

### Core Principles

1. **Initialize storage before each test** with verification
2. **Clean up storage after each test** completely
3. **Verify storage state** at test boundaries
4. **Isolate test data** to prevent cross-test contamination

### Pattern 1: Storage Initialization

**✅ CORRECT Pattern:**

```typescript
let storage: ConversationStorage;
let originalIndexedDB: typeof indexedDB;

beforeEach(async () => {
  // 1. Clear all mocks and storage
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  
  // 2. Disable IndexedDB for consistent testing (fallback to localStorage)
  originalIndexedDB = window.indexedDB;
  Object.defineProperty(window, 'indexedDB', {
    configurable: true,
    value: null,
  });
  
  // 3. Initialize storage and wait for completion
  storage = ConversationStorage.getInstance();
  await storage.initialize();
  
  // 4. Verify fallback mode is active
  expect((storage as any).isIndexedDBAvailable).toBe(false);
  
  // 5. Setup localStorage helpers if needed
  setupLocalStorageHelpers();
  
  // 6. Verify storage is empty
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});
```

### Pattern 2: Storage Cleanup

**✅ CORRECT Pattern:**

```typescript
afterEach(async () => {
  // 1. Clear all storage data
  sessionStorage.clear();
  localStorage.clear();
  
  // 2. Restore IndexedDB to original state
  Object.defineProperty(window, 'indexedDB', {
    configurable: true,
    value: originalIndexedDB,
  });
  
  // 3. Wait for any pending storage operations to complete
  await new Promise((resolve) => setTimeout(resolve, 0));
  
  // 4. Verify cleanup completed
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});
```

### Pattern 3: Storage State Verification

**✅ CORRECT Pattern:**

```typescript
// Helper function to verify storage is empty
function verifyStorageEmpty(): void {
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
}

// Helper function to verify storage contains expected data
function verifyStorageContains(key: string, expectedValue: any): void {
  const stored = localStorage.getItem(key);
  expect(stored).not.toBeNull();
  expect(JSON.parse(stored!)).toEqual(expectedValue);
}

test('should save conversation to storage', async () => {
  // Verify clean state at start
  verifyStorageEmpty();
  
  const conversation = createTestConversation();
  await storage.saveConversation(conversation);
  
  // Verify data was saved
  verifyStorageContains(`conversation_${conversation.id}`, conversation);
});
```

### Pattern 4: Testing with Retry Logic

**✅ CORRECT Pattern:**

```typescript
test('should retry failed storage operations', async () => {
  vi.useFakeTimers();
  
  // Mock storage to fail first attempts
  const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    .mockImplementationOnce(() => {
      throw new Error('Storage quota exceeded');
    })
    .mockImplementationOnce(() => {
      throw new Error('Storage quota exceeded');
    })
    .mockImplementation((key, value) => {
      // Third attempt succeeds
      localStorage[key] = value;
    });
  
  const conversation = createTestConversation();
  
  // Create promise and advance timers
  const promise = storage.saveConversation(conversation);
  await vi.runAllTimersAsync();
  await promise;
  
  // Verify retry attempts
  expect(setItemSpy).toHaveBeenCalledTimes(3);
  
  // Verify data was eventually saved
  verifyStorageContains(`conversation_${conversation.id}`, conversation);
  
  vi.useRealTimers();
});
```

### Common Pitfalls to Avoid

1. **❌ Not clearing storage between tests:**
   ```typescript
   // ❌ Previous test data remains
   test('test 1', async () => {
     await storage.saveConversation(conv1);
   });
   
   test('test 2', async () => {
     // ❌ conv1 still in storage!
     const conversations = await storage.getAllConversations();
   });
   ```

2. **❌ Not waiting for async storage operations:**
   ```typescript
   test('should save conversation', async () => {
     storage.saveConversation(conversation);  // ❌ Missing await
     const retrieved = await storage.getConversation(conversation.id);
     // May fail - save not complete
   });
   ```

3. **❌ Not restoring IndexedDB:**
   ```typescript
   beforeEach(() => {
     window.indexedDB = null;  // ❌ Disable IndexedDB
   });
   
   afterEach(() => {
     // ❌ Forgot to restore - affects other tests
   });
   ```

---

## E2E Test Patterns

### Overview

End-to-end tests using Playwright require careful browser storage management, proper cleanup, and retry logic for flaky operations to ensure reliable test execution.

### Core Principles

1. **Clear all storage before each test**
2. **Wait for storage initialization** before test actions
3. **Verify storage state** at test boundaries
4. **Implement retry logic** for flaky operations

### Pattern 1: E2E Storage Initialization

**✅ CORRECT Pattern:**

```typescript
import { test, expect } from '@playwright/test';

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
  }, { timeout: 5000 });
  
  // 5. Verify storage is empty
  const storageState = await page.evaluate(() => ({
    localStorageLength: localStorage.length,
    sessionStorageLength: sessionStorage.length,
  }));
  
  expect(storageState.localStorageLength).toBe(0);
  expect(storageState.sessionStorageLength).toBe(0);
});
```

### Pattern 2: E2E Storage Cleanup

**✅ CORRECT Pattern:**

```typescript
test.afterEach(async ({ page }) => {
  // 1. Clear all storage after each test
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
  
  // 3. Verify cleanup completed
  const storageState = await page.evaluate(() => ({
    localStorageLength: localStorage.length,
    sessionStorageLength: sessionStorage.length,
  }));
  
  expect(storageState.localStorageLength).toBe(0);
  expect(storageState.sessionStorageLength).toBe(0);
});
```

### Pattern 3: E2E Storage State Verification

**✅ CORRECT Pattern:**

```typescript
test('should have clean storage state', async ({ page }) => {
  // Verify storage is empty at test start
  const initialState = await page.evaluate(() => ({
    localStorageLength: localStorage.length,
    sessionStorageLength: sessionStorage.length,
    localStorageKeys: Object.keys(localStorage),
    sessionStorageKeys: Object.keys(sessionStorage),
  }));
  
  expect(initialState.localStorageLength).toBe(0);
  expect(initialState.sessionStorageLength).toBe(0);
  expect(initialState.localStorageKeys).toEqual([]);
  expect(initialState.sessionStorageKeys).toEqual([]);
});

test('should persist conversation to storage', async ({ page }) => {
  // Create conversation
  await page.click('[data-testid="new-conversation"]');
  await page.fill('[data-testid="message-input"]', 'Test message');
  await page.click('[data-testid="send-button"]');
  
  // Wait for storage operation
  await page.waitForTimeout(100);
  
  // Verify conversation was saved
  const storageData = await page.evaluate(() => {
    const keys = Object.keys(localStorage);
    const conversationKeys = keys.filter(k => k.startsWith('conversation_'));
    return {
      conversationCount: conversationKeys.length,
      conversations: conversationKeys.map(k => JSON.parse(localStorage.getItem(k)!)),
    };
  });
  
  expect(storageData.conversationCount).toBeGreaterThan(0);
  expect(storageData.conversations[0]).toHaveProperty('id');
  expect(storageData.conversations[0]).toHaveProperty('title');
});
```

### Pattern 4: E2E Retry Logic for Flaky Operations

**✅ CORRECT Pattern:**

```typescript
// Helper function for retrying flaky operations
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
  
  throw lastError;
}

test('should handle flaky storage operations', async ({ page }) => {
  await page.goto('/');
  
  // Retry flaky storage operation
  const result = await retryOperation(async () => {
    await page.click('[data-testid="new-conversation"]');
    
    // Wait for storage with timeout
    await page.waitForFunction(() => {
      const keys = Object.keys(localStorage);
      return keys.some(k => k.startsWith('conversation_'));
    }, { timeout: 2000 });
    
    return page.evaluate(() => {
      const keys = Object.keys(localStorage);
      const conversationKey = keys.find(k => k.startsWith('conversation_'));
      return conversationKey ? JSON.parse(localStorage.getItem(conversationKey)!) : null;
    });
  });
  
  expect(result).not.toBeNull();
  expect(result).toHaveProperty('id');
});
```

### Pattern 5: Playwright Configuration for Storage Tests

**✅ CORRECT Configuration:**

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    // Clear storage state for each test
    storageState: undefined,
    
    // Add timeout for storage operations
    actionTimeout: 10000,
    navigationTimeout: 30000,
    
    // Take screenshot on failure for debugging
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  
  // Retry flaky tests
  retries: process.env.CI ? 2 : 1,
  
  // Run tests in parallel but limit workers for storage tests
  workers: process.env.CI ? 2 : undefined,
  
  // Global setup and teardown
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
});
```

### Common Pitfalls to Avoid

1. **❌ Not clearing storage between tests:**
   ```typescript
   test('test 1', async ({ page }) => {
     // Creates conversation
   });
   
   test('test 2', async ({ page }) => {
     // ❌ Previous conversation still in storage!
   });
   ```

2. **❌ Not waiting for storage operations:**
   ```typescript
   test('should save conversation', async ({ page }) => {
     await page.click('[data-testid="save-button"]');
     // ❌ Immediately check storage - operation may not be complete
     const data = await page.evaluate(() => localStorage.getItem('key'));
   });
   ```

3. **❌ Not handling flaky storage operations:**
   ```typescript
   test('should load conversation', async ({ page }) => {
     await page.goto('/conversation/123');
     // ❌ May fail if storage is slow - no retry logic
     await expect(page.locator('[data-testid="conversation-title"]')).toBeVisible();
   });
   ```

---

## General Testing Best Practices

### Test Structure

1. **Use descriptive test names** that explain what is being tested
2. **Follow AAA pattern**: Arrange, Act, Assert
3. **One assertion concept per test** (multiple assertions for same concept OK)
4. **Use test factories** for creating test data consistently

### Test Isolation

1. **Each test should be independent** and runnable in any order
2. **Clean up after each test** to prevent state leakage
3. **Don't rely on test execution order**
4. **Use beforeEach/afterEach** for setup and teardown

### Async Testing

1. **Always await async operations** - don't forget await
2. **Use proper error handling** for rejected promises
3. **Set appropriate timeouts** for async operations
4. **Clean up pending operations** in afterEach hooks

### Mocking

1. **Mock external dependencies** consistently
2. **Restore mocks after each test** using vi.restoreAllMocks()
3. **Verify mock calls** to ensure correct behavior
4. **Use realistic mock data** that matches production data

### Test Coverage

1. **Aim for >90% code coverage** as minimum
2. **Test happy paths and error paths**
3. **Test edge cases and boundary conditions**
4. **Test error handling and recovery**

### Performance

1. **Keep tests fast** - avoid unnecessary delays
2. **Use fake timers** instead of real delays
3. **Parallelize tests** when possible
4. **Optimize test setup** to reduce overhead

### Debugging

1. **Use descriptive error messages** in assertions
2. **Log relevant context** when tests fail
3. **Use test.only** to focus on specific tests during debugging
4. **Take screenshots/videos** for E2E test failures

---

## Quick Reference

### Fake Timer Test Checklist

- [ ] Use `vi.useFakeTimers()` at test start
- [ ] Create promise first
- [ ] Await `vi.runAllTimersAsync()` before awaiting promise
- [ ] For rejections, catch promise before advancing timers
- [ ] Restore real timers in afterEach
- [ ] Clear microtask queue in afterEach

### Storage Test Checklist

- [ ] Clear storage in beforeEach
- [ ] Disable IndexedDB if testing fallback mode
- [ ] Initialize storage and wait for completion
- [ ] Verify storage state before test actions
- [ ] Clear storage in afterEach
- [ ] Restore IndexedDB in afterEach
- [ ] Verify cleanup completed

### E2E Test Checklist

- [ ] Clear all storage in beforeEach
- [ ] Clear IndexedDB databases
- [ ] Wait for storage initialization
- [ ] Verify clean storage state
- [ ] Implement retry logic for flaky operations
- [ ] Clear storage in afterEach
- [ ] Verify cleanup completed
- [ ] Configure appropriate timeouts

---

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Async Testing Patterns](https://kentcdodds.com/blog/fix-the-not-wrapped-in-act-warning)

---

**Last Updated**: 2024-01-01  
**Maintained By**: Development Team
