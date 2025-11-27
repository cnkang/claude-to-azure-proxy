# E2E Test Organization and Conventions

## Overview

This document describes the organization, structure, and conventions for E2E tests in this project. All tests follow a consistent pattern using Playwright with custom fixtures and helpers.

## Directory Structure

```
tests/e2e/
├── fixtures/
│   └── base.ts                    # Custom test fixtures (cleanPage, helpers)
├── utils/
│   └── test-helpers.ts            # Reusable test helper class
├── *.spec.ts                      # Test specification files
├── global-setup.ts                # Global test setup
├── global-teardown.ts             # Global test teardown
├── README.md                      # Test documentation
├── TEST_ORGANIZATION.md           # This file
└── BROWSER_TESTING_QUICK_REFERENCE.md  # Browser testing guide
```

## Test File Naming Convention

All test files follow the pattern: `<feature-name>.spec.ts`

Examples:
- `cross-tab-sync.spec.ts` - Cross-tab synchronization tests
- `search-functionality.spec.ts` - Search functionality tests
- `title-persistence.spec.ts` - Title persistence tests
- `deletion-cleanup.spec.ts` - Deletion cleanup tests
- `accessibility.spec.ts` - Accessibility compliance tests
- `performance.spec.ts` - Performance benchmarking tests

## Test Structure Pattern

All tests follow this consistent structure:

```typescript
import { test, expect } from './fixtures/base.js';

test.describe('Feature Name', () => {
  test('should do something specific', async ({ cleanPage, helpers }) => {
    // 1. Setup: Create test data
    const conversationId = await helpers.createTestConversation(
      'Test Title',
      [{ role: 'user', content: 'Test message' }]
    );
    
    // 2. Action: Perform the operation being tested
    await helpers.updateConversationTitle(conversationId, 'New Title');
    
    // 3. Wait: Allow for async operations to complete
    await cleanPage.waitForTimeout(600);
    
    // 4. Assert: Verify the expected outcome
    const title = await helpers.getConversationTitle(conversationId);
    expect(title).toBe('New Title');
  });
});
```

## Fixtures

### cleanPage Fixture

The `cleanPage` fixture provides a Playwright Page with:
- Clean storage (localStorage, sessionStorage, IndexedDB cleared)
- E2E test mode enabled (`__E2E_TEST_MODE__` flag)
- Automatic storage initialization
- API mocking for backend endpoints
- Automatic cleanup after each test

Usage:
```typescript
test('test name', async ({ cleanPage }) => {
  // cleanPage is ready to use with clean storage
  await cleanPage.goto('/');
});
```

### helpers Fixture

The `helpers` fixture provides an instance of the `TestHelpers` class with utility methods for common operations.

Usage:
```typescript
test('test name', async ({ helpers }) => {
  await helpers.waitForAppReady();
  const id = await helpers.createTestConversation('Title', []);
});
```

## TestHelpers Class

The `TestHelpers` class (`tests/e2e/utils/test-helpers.ts`) provides reusable methods organized into categories:

### App State Management
- `waitForAppReady()` - Wait for application to fully load
- `dismissIntegrityCheckDialog()` - Dismiss data integrity warnings
- `clearAllStorage()` - Clear all browser storage
- `initializeStorage()` - Initialize storage system
- `verifyStorageReady()` - Check if storage is ready
- `cleanupStorageWithVerification()` - Comprehensive cleanup with verification
- `waitForPendingStorageOperations()` - Wait for async storage operations
- `verifyStorageEmpty()` - Verify storage is empty
- `getStorageState()` - Get detailed storage state for debugging
- `logStorageState()` - Log storage state to console

### Retry Logic
- `retryStorageOperation()` - Retry storage operations with exponential backoff
- `retryUIOperation()` - Retry UI interactions with exponential backoff

### Conversation Operations
- `createTestConversation(title, messages)` - Create test conversation via UI
- `waitForConversation(id)` - Wait for conversation to appear
- `getConversationTitle(id)` - Get conversation title from storage
- `updateConversationTitle(id, newTitle)` - Update title via dropdown menu
- `deleteConversation(id)` - Delete conversation via dropdown menu

### Search Operations
- `searchConversations(query)` - Search using search input
- `getSearchResultsCount()` - Get number of search results

### Multi-Tab Operations
- `openNewTab()` - Open new tab with same URL
- `waitForStorageEvent(eventType)` - Wait for storage event to fire

### Error Simulation
- `simulateNetworkError()` - Simulate network failure
- `restoreNetwork()` - Restore network connectivity
- `waitForErrorMessage(message?)` - Wait for error message to appear

### Debugging
- `takeScreenshot(name)` - Take screenshot for debugging
- `enableConsoleLogging()` - Log browser console messages
- `enableErrorLogging()` - Log browser errors

## Code Reuse Guidelines

### DO: Use TestHelpers Methods

✅ **GOOD**: Use existing helper methods
```typescript
await helpers.createTestConversation('Title', []);
await helpers.searchConversations('query');
await helpers.deleteConversation(id);
```

❌ **BAD**: Duplicate helper logic inline
```typescript
// Don't do this - use helpers.searchConversations() instead
const searchInput = await cleanPage.waitForSelector('input[role="searchbox"]');
await searchInput.fill('query');
await cleanPage.waitForTimeout(800);
```

### DO: Use Consistent Selectors

✅ **GOOD**: Use data-testid attributes
```typescript
await cleanPage.waitForSelector('[data-testid="search-input"]');
await cleanPage.click('[data-testid="new-conversation-button"]');
```

❌ **BAD**: Use fragile CSS selectors
```typescript
await cleanPage.waitForSelector('.search-box input');
await cleanPage.click('button.new-conv');
```

### DO: Use Retry Logic for Flaky Operations

✅ **GOOD**: Use retry helpers for flaky operations
```typescript
await helpers.retryStorageOperation(async () => {
  return await helpers.createTestConversation('Title', []);
});
```

❌ **BAD**: No retry logic for flaky operations
```typescript
// This might fail intermittently
const id = await helpers.createTestConversation('Title', []);
```

### DO: Wait for Async Operations

✅ **GOOD**: Wait for operations to complete
```typescript
await helpers.updateConversationTitle(id, 'New Title');
await cleanPage.waitForTimeout(600); // Wait for debounce + persistence
const title = await helpers.getConversationTitle(id);
```

❌ **BAD**: Don't wait for async operations
```typescript
await helpers.updateConversationTitle(id, 'New Title');
const title = await helpers.getConversationTitle(id); // Might get old title
```

## Common Patterns

### Pattern 1: Create and Verify Conversation

```typescript
test('should create conversation', async ({ helpers }) => {
  // Create conversation
  const id = await helpers.createTestConversation(
    'Test Title',
    [{ role: 'user', content: 'Test message' }]
  );
  
  // Wait for persistence
  await helpers.waitForConversation(id);
  
  // Verify
  const title = await helpers.getConversationTitle(id);
  expect(title).toBe('Test Title');
});
```

### Pattern 2: Search and Verify Results

```typescript
test('should search conversations', async ({ cleanPage, helpers }) => {
  // Create test data
  await helpers.createTestConversation('React Tutorial', []);
  await helpers.createTestConversation('Vue Guide', []);
  
  // Search
  await helpers.searchConversations('React');
  
  // Verify results
  const count = await helpers.getSearchResultsCount();
  expect(count).toBe(1);
});
```

### Pattern 3: Cross-Tab Synchronization

```typescript
test('should sync across tabs', async ({ cleanPage, helpers }) => {
  // Create conversation in tab 1
  const id = await helpers.createTestConversation('Original', []);
  
  // Open tab 2
  const tab2 = await helpers.openNewTab();
  const helpers2 = new TestHelpers(tab2);
  
  // Update in tab 1
  await helpers.updateConversationTitle(id, 'Updated');
  
  // Wait for sync event in tab 2
  const synced = await helpers2.waitForStorageEvent('update');
  expect(synced).toBe(true);
  
  // Verify in tab 2
  const title = await helpers2.getConversationTitle(id);
  expect(title).toBe('Updated');
  
  // Cleanup
  await tab2.close();
});
```

### Pattern 4: Error Handling

```typescript
test('should handle errors gracefully', async ({ cleanPage, helpers }) => {
  // Simulate network error
  await helpers.simulateNetworkError();
  
  // Attempt operation
  await helpers.createTestConversation('Test', []);
  
  // Verify error message
  await helpers.waitForErrorMessage('Network error');
  
  // Restore network
  await helpers.restoreNetwork();
});
```

## Debugging Tests

### Enable Debug Mode

Set the `DEBUG` environment variable to enable verbose logging:

```bash
DEBUG=1 pnpm exec playwright test
```

This enables:
- Console message logging
- Error logging
- Storage state logging
- Retry attempt logging

### Take Screenshots

Use the `takeScreenshot` helper for debugging:

```typescript
test('debug test', async ({ helpers }) => {
  await helpers.takeScreenshot('before-action');
  // ... perform action
  await helpers.takeScreenshot('after-action');
});
```

### Log Storage State

Use `logStorageState` to debug storage issues:

```typescript
test('debug storage', async ({ helpers }) => {
  await helpers.logStorageState('Initial State');
  // ... perform operations
  await helpers.logStorageState('Final State');
});
```

## Best Practices

### 1. Test Isolation

Each test should:
- Start with clean storage (use `cleanPage` fixture)
- Not depend on other tests
- Clean up after itself (automatic with fixtures)

### 2. Descriptive Test Names

Use clear, descriptive test names that explain what is being tested:

✅ **GOOD**:
```typescript
test('should propagate title update from tab 1 to tab 2', async ({ ... }) => {
```

❌ **BAD**:
```typescript
test('test sync', async ({ ... }) => {
```

### 3. Wait for Operations

Always wait for async operations to complete:
- Use `waitForTimeout` for debounce delays (600ms for storage operations)
- Use `waitForSelector` for UI elements to appear
- Use `waitForFunction` for complex conditions
- Use `waitForStorageEvent` for cross-tab sync

### 4. Use Retry Logic

Use retry helpers for operations that might be flaky:
- Storage operations (IndexedDB can be slow)
- UI interactions (elements might not be immediately clickable)
- Network operations (might timeout)

### 5. Avoid Direct Storage Access

Prefer UI interactions over direct storage manipulation:

✅ **GOOD**: Use UI to create conversation
```typescript
await helpers.createTestConversation('Title', []); // Uses UI + storage
```

❌ **BAD**: Direct storage manipulation
```typescript
await cleanPage.evaluate(() => {
  window.__conversationStorage.storeConversation(...);
});
```

### 6. Handle Fallbacks

Always provide fallback mechanisms for flaky operations:

```typescript
// Try UI deletion first
await helpers.deleteConversation(id);

// Fallback to direct deletion if UI fails
if (await conversationStillExists(id)) {
  await performDirectDeletion(id);
}
```

## Maintenance Guidelines

### Adding New Helper Methods

When adding new helper methods to `TestHelpers`:

1. **Choose the right category**: Place method in appropriate section (App State, Conversation Operations, etc.)
2. **Add JSDoc comments**: Document parameters, return values, and behavior
3. **Include retry logic**: For flaky operations, use `retryStorageOperation` or `retryUIOperation`
4. **Handle errors gracefully**: Provide fallback mechanisms for failures
5. **Log in debug mode**: Add debug logging using `process.env.DEBUG`

Example:
```typescript
/**
 * New helper method description
 * @param param1 - Description of param1
 * @returns Description of return value
 */
async newHelperMethod(param1: string): Promise<void> {
  return await this.retryUIOperation(async () => {
    // Implementation
    if (process.env.DEBUG) {
      console.log('Debug info');
    }
  });
}
```

### Updating Test Files

When updating test files:

1. **Use existing helpers**: Don't duplicate functionality
2. **Follow patterns**: Use established patterns from other tests
3. **Add comments**: Explain complex logic or workarounds
4. **Update documentation**: Update this file if adding new patterns

### Removing Deprecated Code

When removing old code:

1. **Verify no usage**: Search for all usages before removing
2. **Update documentation**: Remove references from docs
3. **Update tests**: Ensure all tests still pass
4. **Commit separately**: Use separate commit for cleanup

## File Organization Summary

### Core Files (Keep)
- `fixtures/base.ts` - Custom fixtures for all tests
- `utils/test-helpers.ts` - Reusable helper methods
- `global-setup.ts` - Global test setup
- `global-teardown.ts` - Global test teardown

### Test Files (Keep)
- `cross-tab-sync.spec.ts` - Cross-tab synchronization tests
- `search-functionality.spec.ts` - Search functionality tests
- `title-persistence.spec.ts` - Title persistence tests
- `deletion-cleanup.spec.ts` - Deletion cleanup tests
- `accessibility.spec.ts` - Accessibility tests
- `performance.spec.ts` - Performance tests
- `browser-compatibility.spec.ts` - Browser compatibility tests
- `app-context-persistence.spec.ts` - App context tests
- `component-rendering-order.spec.ts` - Rendering order tests
- `layout-rendering.spec.ts` - Layout tests
- `diagnostic.spec.ts` - Diagnostic tests

### Documentation Files (Keep)
- `README.md` - Main test documentation
- `TEST_ORGANIZATION.md` - This file
- `BROWSER_TESTING_QUICK_REFERENCE.md` - Browser testing guide

## Conclusion

This organization ensures:
- **Consistency**: All tests follow the same patterns
- **Maintainability**: Code is well-organized and documented
- **Reusability**: Common functionality is centralized in helpers
- **Reliability**: Retry logic and fallbacks handle flaky operations
- **Debuggability**: Comprehensive logging and debugging tools

When in doubt, follow the patterns established in existing tests and use the `TestHelpers` class for common operations.
