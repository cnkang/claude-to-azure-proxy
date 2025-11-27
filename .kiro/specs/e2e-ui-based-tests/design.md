# Design Document

## Overview

This design document outlines the architecture and implementation strategy for rewriting E2E tests to use UI-based interactions. The new tests will interact with the application through the user interface (clicking buttons, typing text, etc.) rather than directly manipulating the storage layer. This approach creates more maintainable tests that better reflect real user behavior.

## Architecture

### Test Structure

```
tests/e2e/
├── helpers/
│   ├── ui-actions.ts          # Reusable UI interaction helpers
│   ├── test-setup.ts          # Test setup and cleanup utilities
│   └── assertions.ts          # Custom assertion helpers
├── cross-tab-sync.spec.ts     # Cross-tab synchronization tests (rewritten)
├── search-functionality.spec.ts # Search functionality tests (rewritten)
├── title-persistence.spec.ts  # Title persistence tests (rewritten)
└── deletion-cleanup.spec.ts   # Deletion cleanup tests (rewritten)
```

### UI Test Helpers

The test helpers will provide high-level functions that encapsulate common UI interactions:

```typescript
// UI Actions
- createConversation(): Promise<string>  // Returns conversation ID
- updateConversationTitle(title: string): Promise<void>
- deleteConversation(conversationId: string): Promise<void>
- searchConversations(query: string): Promise<void>
- clearAllConversations(): Promise<void>
- sendMessage(message: string): Promise<void>

// Assertions
- expectConversationInList(title: string): Promise<void>
- expectConversationNotInList(title: string): Promise<void>
- expectSearchResults(count: number): Promise<void>
- expectHighlightedKeyword(keyword: string): Promise<void>
```

## Components and Interfaces

### UI Actions Helper

```typescript
export class UIActions {
  constructor(private page: Page) {}

  /**
   * Creates a new conversation through the UI
   * @returns The title of the created conversation
   */
  async createConversation(): Promise<string> {
    // Click "New Conversation" button
    await this.page.click('[data-testid="new-conversation-button"]');
    
    // Wait for conversation to appear in list
    await this.page.waitForSelector('[data-testid="conversation-item"]');
    
    // Get the conversation title
    const title = await this.page.textContent('[data-testid="conversation-item"]:first-child [data-testid="conversation-title"]');
    
    return title || '';
  }

  /**
   * Updates the title of the currently selected conversation
   * @param newTitle The new title to set
   */
  async updateConversationTitle(newTitle: string): Promise<void> {
    // Click on the title to edit
    await this.page.click('[data-testid="conversation-title"]');
    
    // Clear existing title
    await this.page.fill('[data-testid="conversation-title-input"]', '');
    
    // Type new title
    await this.page.fill('[data-testid="conversation-title-input"]', newTitle);
    
    // Press Enter to save
    await this.page.press('[data-testid="conversation-title-input"]', 'Enter');
    
    // Wait for title to update
    await this.page.waitForSelector(`[data-testid="conversation-title"]:has-text("${newTitle}")`);
  }

  /**
   * Deletes a conversation through the dropdown menu
   * @param conversationTitle The title of the conversation to delete
   */
  async deleteConversation(conversationTitle: string): Promise<void> {
    // Find the conversation in the list
    const conversationItem = this.page.locator(`[data-testid="conversation-item"]:has-text("${conversationTitle}")`);
    
    // Click the dropdown menu button
    await conversationItem.locator('[data-testid="conversation-menu-button"]').click();
    
    // Click delete option
    await this.page.click('[data-testid="delete-conversation"]');
    
    // Wait for conversation to disappear
    await this.page.waitForSelector(`[data-testid="conversation-item"]:has-text("${conversationTitle}")`, { state: 'detached' });
  }

  /**
   * Searches for conversations using the search box
   * @param query The search query
   */
  async searchConversations(query: string): Promise<void> {
    // Click search box
    await this.page.click('[data-testid="search-input"]');
    
    // Type query
    await this.page.fill('[data-testid="search-input"]', query);
    
    // Wait for search results
    await this.page.waitForTimeout(500); // Debounce delay
  }

  /**
   * Clears all conversations through the UI
   */
  async clearAllConversations(): Promise<void> {
    // Get all conversation items
    const conversations = await this.page.locator('[data-testid="conversation-item"]').count();
    
    // Delete each conversation
    for (let i = 0; i < conversations; i++) {
      // Always delete the first item since the list shrinks
      const firstConversation = this.page.locator('[data-testid="conversation-item"]').first();
      const title = await firstConversation.locator('[data-testid="conversation-title"]').textContent();
      
      if (title) {
        await this.deleteConversation(title);
      }
    }
  }

  /**
   * Sends a message in the current conversation
   * @param message The message text to send
   */
  async sendMessage(message: string): Promise<void> {
    // Type message
    await this.page.fill('[data-testid="message-input"]', message);
    
    // Click send button
    await this.page.click('[data-testid="send-button"]');
    
    // Wait for message to appear
    await this.page.waitForSelector(`[data-testid="message-item"]:has-text("${message}")`);
  }
}
```

### Test Setup Helper

```typescript
export class TestSetup {
  /**
   * Clears all browser storage before a test
   */
  static async clearStorage(page: Page): Promise<void> {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    await page.evaluate(async () => {
      const databases = await indexedDB.databases();
      for (const db of databases) {
        if (db.name) {
          indexedDB.deleteDatabase(db.name);
        }
      }
    });
  }

  /**
   * Sets up a clean test environment
   */
  static async setup(page: Page): Promise<UIActions> {
    // Clear storage
    await this.clearStorage(page);
    
    // Navigate to app
    await page.goto('http://localhost:3000');
    
    // Wait for app to load
    await page.waitForLoadState('networkidle');
    
    // Return UI actions helper
    return new UIActions(page);
  }
}
```

### Assertion Helper

```typescript
export class Assertions {
  constructor(private page: Page) {}

  /**
   * Asserts that a conversation appears in the list
   */
  async expectConversationInList(title: string): Promise<void> {
    const conversation = this.page.locator(`[data-testid="conversation-item"]:has-text("${title}")`);
    await expect(conversation).toBeVisible({ timeout: 5000 });
  }

  /**
   * Asserts that a conversation does not appear in the list
   */
  async expectConversationNotInList(title: string): Promise<void> {
    const conversation = this.page.locator(`[data-testid="conversation-item"]:has-text("${title}")`);
    await expect(conversation).not.toBeVisible({ timeout: 5000 });
  }

  /**
   * Asserts the number of search results
   */
  async expectSearchResults(count: number): Promise<void> {
    const results = this.page.locator('[data-testid="search-result-item"]');
    await expect(results).toHaveCount(count, { timeout: 5000 });
  }

  /**
   * Asserts that a keyword is highlighted in search results
   */
  async expectHighlightedKeyword(keyword: string): Promise<void> {
    const highlighted = this.page.locator(`[data-testid="search-result-item"] mark:has-text("${keyword}")`);
    await expect(highlighted).toBeVisible({ timeout: 5000 });
  }
}
```

## Data Models

### Test Context

```typescript
interface TestContext {
  page: Page;
  context: BrowserContext;
  ui: UIActions;
  assert: Assertions;
}

interface CrossTabTestContext {
  page1: Page;
  page2: Page;
  context1: BrowserContext;
  context2: BrowserContext;
  ui1: UIActions;
  ui2: UIActions;
  assert1: Assertions;
  assert2: Assertions;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Cross-tab title update propagation

*For any* conversation and any title update performed in one browser tab, the updated title should appear in all other open tabs within 1 second.

**Validates: Requirements 1.1**

### Property 2: Cross-tab deletion propagation

*For any* conversation deleted in one browser tab, the conversation should disappear from all other open tabs within 1 second.

**Validates: Requirements 1.2**

### Property 3: Cross-tab creation propagation

*For any* new conversation created in one browser tab, the conversation should appear in all other open tabs within 1 second.

**Validates: Requirements 1.4**

### Property 4: UI reactivity to storage events

*For any* storage event triggered (create, update, delete), the UI should update automatically to reflect the changes without requiring a page refresh.

**Validates: Requirements 1.5**

### Property 5: Search completeness

*For any* search keyword, the search results should include all conversations that contain that keyword in either their title or messages.

**Validates: Requirements 2.1**

### Property 6: Search keyword highlighting

*For any* search query that returns results, all instances of the search keyword should be visually highlighted in the displayed results.

**Validates: Requirements 2.2**

### Property 7: Search reset behavior

*For any* active search query, clearing the search input should restore the display to show all conversations.

**Validates: Requirements 2.4**

### Property 8: Title persistence (round-trip)

*For any* conversation title update, the new title should persist after a page refresh (round-trip property: update → refresh → verify).

**Validates: Requirements 3.1**

### Property 9: Rapid update consistency

*For any* sequence of rapid title updates to the same conversation, the system should persist the final title correctly without data loss.

**Validates: Requirements 3.3**

### Property 10: Deletion completeness via UI

*For any* deleted conversation, the conversation and all its messages should not appear in the UI after deletion (verified through UI inspection, not direct storage access).

**Validates: Requirements 4.1**

### Property 11: Deleted conversations excluded from search

*For any* conversation that has been deleted, it should not appear in search results regardless of the search query.

**Validates: Requirements 4.2**

### Property 12: Immediate deletion UI update

*For any* conversation deletion, the UI should update immediately to remove the conversation from the visible list without requiring a page refresh.

**Validates: Requirements 4.3**

### Edge Cases

The following edge cases should be handled gracefully by the test helpers and verified during testing:

- **Very long titles**: Titles exceeding normal length should not break the UI layout (Requirement 3.2)
- **Simultaneous updates**: When multiple tabs update the same conversation simultaneously, the system should handle conflicts without crashing (Requirement 1.3)
- **Empty search results**: When no conversations match a search query, an appropriate empty state message should be displayed (Requirement 2.3)
- **Pagination**: When search results exceed one page, pagination controls should appear and function correctly (Requirement 2.5)

**Note**: Requirements 5-13 are testing implementation requirements (test helpers, isolation, error handling, performance, documentation, quality gates, file organization, and commit strategy) rather than functional correctness properties. These are addressed in the Testing Strategy, Quality Assurance Strategy, File Organization Strategy, and Commit Strategy sections of this design document.

## Test Examples

### Cross-Tab Synchronization Test

```typescript
test('should propagate title update from tab 1 to tab 2', async ({ browser }) => {
  // Setup two tabs
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();
  
  const ui1 = await TestSetup.setup(page1);
  const ui2 = await TestSetup.setup(page2);
  const assert2 = new Assertions(page2);
  
  // Create conversation in tab 1
  const originalTitle = await ui1.createConversation();
  
  // Wait for it to appear in tab 2
  await assert2.expectConversationInList(originalTitle);
  
  // Update title in tab 1
  const newTitle = 'Updated Title';
  await ui1.updateConversationTitle(newTitle);
  
  // Verify it updates in tab 2
  await assert2.expectConversationInList(newTitle);
  await assert2.expectConversationNotInList(originalTitle);
  
  // Cleanup
  await context1.close();
  await context2.close();
});
```

### Search Functionality Test

```typescript
test('should search and display results with keyword highlighting', async ({ page }) => {
  const ui = await TestSetup.setup(page);
  const assert = new Assertions(page);
  
  // Create conversations with specific content
  await ui.createConversation();
  await ui.updateConversationTitle('React Tutorial');
  
  await ui.createConversation();
  await ui.updateConversationTitle('Vue Guide');
  
  await ui.createConversation();
  await ui.updateConversationTitle('React Hooks');
  
  // Search for "React"
  await ui.searchConversations('React');
  
  // Verify results
  await assert.expectSearchResults(2);
  await assert.expectHighlightedKeyword('React');
  
  // Verify correct conversations appear
  await assert.expectConversationInList('React Tutorial');
  await assert.expectConversationInList('React Hooks');
});
```

## Error Handling

### Timeout Handling

```typescript
// Use Playwright's built-in timeout mechanisms
await page.waitForSelector('[data-testid="element"]', { 
  timeout: 5000,
  state: 'visible'
});

// Provide clear error messages
try {
  await ui.createConversation();
} catch (error) {
  throw new Error(`Failed to create conversation: ${error.message}`);
}
```

### Retry Logic

```typescript
// Use Playwright's auto-retry for assertions
await expect(element).toBeVisible({ timeout: 5000 });

// For custom operations, implement retry logic
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw new Error('Operation failed after retries');
}
```

## Testing Strategy

### Test Isolation

1. **Before Each Test**:
   - Clear localStorage and IndexedDB
   - Navigate to clean app state
   - Wait for app to fully load

2. **After Each Test**:
   - Close all browser contexts
   - Clean up any test data

### Cross-Tab Testing

1. **Setup**:
   - Create two separate browser contexts
   - Navigate both to the app
   - Wait for both to load

2. **Synchronization**:
   - Perform action in tab 1
   - Wait for storage event to propagate (100-500ms)
   - Verify change appears in tab 2

3. **Cleanup**:
   - Close both contexts

### Waiting Strategies

1. **Element Visibility**: `waitForSelector` with `state: 'visible'`
2. **Network Idle**: `waitForLoadState('networkidle')`
3. **Custom Conditions**: `waitForFunction` for complex conditions
4. **Fixed Delays**: Only when necessary (debounce delays)

## Performance Considerations

### Test Execution Time

- Target: < 30 seconds per test
- Total suite: < 5 minutes
- Use parallel execution where possible (but not for cross-tab tests)

### Resource Management

- Close browser contexts after each test
- Clear storage to prevent memory leaks
- Use single worker for cross-tab tests to avoid conflicts

## Quality Assurance Strategy

### Code Quality Checks

After implementation, the following checks MUST pass:

1. **TypeScript Type Check**
   ```bash
   cd apps/frontend && pnpm type-check
   ```
   - Expected: 0 errors
   - Fix any type errors before proceeding

2. **ESLint**
   ```bash
   cd apps/frontend && pnpm lint
   ```
   - Expected: 0 errors, 0 warnings
   - Fix all linting issues before proceeding

3. **Unit Tests**
   ```bash
   cd apps/frontend && pnpm test --run
   ```
   - Expected: All tests pass
   - Fix any broken unit tests

4. **E2E Tests**
   ```bash
   cd apps/frontend && pnpm test:e2e
   ```
   - Expected: All 12 tests pass
   - This is the primary goal of this spec

## File Organization Strategy

### New Files to Create

```
apps/frontend/src/test/e2e/
├── helpers/
│   ├── ui-actions.ts          # NEW: UI interaction helpers
│   ├── test-setup.ts          # NEW: Test setup utilities
│   └── assertions.ts          # NEW: Custom assertions
├── cross-tab-sync.spec.ts     # NEW: Rewritten cross-tab tests
├── search-functionality.spec.ts # NEW: Rewritten search tests
├── title-persistence.spec.ts  # NEW: Rewritten title tests
└── deletion-cleanup.spec.ts   # NEW: Rewritten deletion tests
```

### Files to Remove

After verifying new tests pass:

```
apps/frontend/src/test/e2e/
├── cross-tab-sync.playwright.test.ts  # REMOVE: Old storage-based tests
└── search-functionality.playwright.test.ts # REMOVE: Old storage-based tests
```

### Files to Keep

```
apps/frontend/src/test/e2e/
├── accessibility.spec.ts      # KEEP: Already UI-based
├── browser-compatibility.spec.ts # KEEP: Already UI-based
├── layout-rendering.spec.ts   # KEEP: Already UI-based
└── ... (other existing spec files)
```

### Consolidation Strategy

1. **Evaluate Overlap**: Check if new helpers duplicate existing utilities
2. **Merge if Possible**: Consolidate duplicate helpers into shared utilities
3. **Document Decisions**: Add comments explaining why files were kept or removed

## Commit Strategy

### Commit Batches

Following industry best practices, changes should be committed in logical batches:

**Batch 1: Test Helpers**
```
test: add UI-based E2E test helpers

- Add UIActions class for common UI interactions
- Add TestSetup class for test initialization and cleanup
- Add Assertions class for custom test assertions
- Add JSDoc documentation for all helpers

Validates: Requirements 5.1-5.5, 9.1-9.5
```

**Batch 2: Rewrite Cross-Tab Tests**
```
test: rewrite cross-tab sync tests to use UI interactions

- Rewrite title update propagation test
- Rewrite deletion propagation test
- Rewrite simultaneous updates test
- Rewrite conversation creation test
- Remove direct storage access
- Use UI helpers for all interactions

Validates: Requirements 1.1-1.5, 6.1-6.5, 7.1-7.5
```

**Batch 3: Rewrite Search Tests**
```
test: rewrite search functionality tests to use UI interactions

- Rewrite search with results test
- Rewrite empty search results test
- Rewrite search in titles and messages test
- Rewrite case-insensitive search test
- Rewrite pagination test
- Use UI helpers for all interactions

Validates: Requirements 2.1-2.5, 6.1-6.5, 7.1-7.5
```

**Batch 4: Rewrite Persistence Tests**
```
test: rewrite title persistence tests to use UI interactions

- Rewrite title persistence after refresh test
- Rewrite very long titles test
- Use UI helpers for all interactions

Validates: Requirements 3.1-3.3, 6.1-6.5, 7.1-7.5
```

**Batch 5: Rewrite Deletion Tests**
```
test: rewrite deletion cleanup tests to use UI interactions

- Rewrite deletion cleanup test
- Use UI helpers for all interactions

Validates: Requirements 4.1-4.3, 6.1-6.5, 7.1-7.5
```

**Batch 6: Clean Up Old Files**
```
chore: remove old storage-based E2E tests

- Remove cross-tab-sync.playwright.test.ts
- Remove search-functionality.playwright.test.ts
- Update test documentation
- Clean up test artifacts

Validates: Requirements 12.1-12.5
```

**Batch 7: Update Documentation**
```
docs: update E2E test documentation

- Document new UI-based test patterns
- Update E2E test README
- Add examples of using test helpers
- Document test isolation strategy

Validates: Requirements 9.1-9.5
```

### Commit Message Format

Each commit should follow this format:

```
<type>(<scope>): <subject>

<body>

Validates: Requirements X.Y
Closes: Tasks A.B
```

## Success Criteria

The rewrite is successful when:

1. ✅ All E2E tests pass using UI interactions (number of tests may vary based on best practices - could be more or fewer than the original 12)
2. ✅ Tests do not access `window.conversationStorage` directly
3. ✅ Tests are more readable and maintainable
4. ✅ Tests run reliably in CI/CD
5. ✅ Test execution time is reasonable (< 5 minutes total)
6. ✅ Tests provide clear error messages on failure
7. ✅ Test helpers are reusable and well-documented
8. ✅ TypeScript type-check passes with 0 errors
9. ✅ ESLint passes with 0 errors and 0 warnings
10. ✅ All unit tests pass
11. ✅ Old test files are removed
12. ✅ Changes are committed in logical batches with clear messages
13. ✅ Test coverage follows E2E testing best practices (comprehensive but not redundant)
