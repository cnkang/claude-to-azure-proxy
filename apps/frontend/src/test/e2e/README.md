# E2E Tests with Playwright

This directory contains End-to-End (E2E) tests using Playwright for testing the frontend application
in real browser environments.

## Overview

E2E tests have been migrated from Vitest to Playwright to provide:

- **Real browser testing**: Tests run in actual browser contexts (Chromium, Firefox, WebKit)
- **True cross-tab synchronization**: Multiple browser contexts can simulate real tab behavior
- **Storage event testing**: Real localStorage and IndexedDB events work correctly
- **Better UI interaction**: Playwright provides more reliable UI interaction APIs

## Test Files

### ✅ Implemented Playwright Tests

- **`cross-tab-sync.playwright.test.ts`**: Comprehensive cross-tab synchronization tests
  - Title update propagation between tabs
  - Deletion propagation between tabs
  - Conflict resolution with simultaneous updates
  - Conversation creation propagation
  - Title persistence after browser refresh
  - Long title handling
  - Deletion cleanup verification

### 📝 TODO: Convert to Playwright

- **`search-functionality.test.ts`**: Search UI and interaction tests (currently skipped)
- **`error-recovery.test.ts`**: Error handling and recovery tests (currently skipped)

These tests are currently skipped in Vitest and should be converted to Playwright for proper UI
testing.

## Running Tests

### Run all Playwright E2E tests

```bash
cd apps/frontend
pnpm test:e2e
```

### Run with UI mode (interactive)

```bash
pnpm test:e2e:ui
```

### Run with debug mode

```bash
pnpm test:e2e:debug
```

### Run specific test file

```bash
pnpm test:e2e cross-tab-sync.playwright.test.ts
```

## Test Structure

### Basic Test Pattern

```typescript
import { test, expect, type Page, type BrowserContext } from '@playwright/test';

test.describe('Feature Name', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('should do something', async () => {
    // Test implementation
  });
});
```

### Cross-Tab Testing Pattern

```typescript
test.describe('Cross-Tab Feature', () => {
  let context1: BrowserContext;
  let context2: BrowserContext;
  let page1: Page;
  let page2: Page;

  test.beforeEach(async ({ browser }) => {
    // Create two separate browser contexts (simulating two tabs)
    context1 = await browser.newContext();
    context2 = await browser.newContext();

    page1 = await context1.newPage();
    page2 = await context2.newPage();

    await page1.goto('http://localhost:5173');
    await page2.goto('http://localhost:5173');

    await page1.waitForLoadState('networkidle');
    await page2.waitForLoadState('networkidle');
  });

  test.afterEach(async () => {
    await context1.close();
    await context2.close();
  });

  test('should sync between tabs', async () => {
    // Perform action in tab 1
    await page1.evaluate(() => {
      // Your code here
    });

    // Verify in tab 2
    const result = await page2.evaluate(() => {
      // Your verification code
    });

    expect(result).toBe(expected);
  });
});
```

## Configuration

Playwright configuration is in `apps/frontend/playwright.config.ts`:

- **Test directory**: `./src/test/e2e`
- **Base URL**: `http://localhost:5173`
- **Timeout**: 30 seconds per test
- **Workers**: 1 (sequential execution for storage tests)
- **Retries**: 1 retry locally, 2 in CI
- **Dev server**: Automatically starts before tests

## Best Practices

### 1. Storage Isolation

Always clear storage before each test:

```typescript
test.beforeEach(async ({ page }) => {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});
```

### 2. Wait for Network Idle

Wait for page to fully load:

```typescript
await page.waitForLoadState('networkidle');
```

### 3. Use page.evaluate for Storage Operations

Access browser APIs through page.evaluate:

```typescript
await page.evaluate(() => {
  const storage = (window as any).conversationStorage;
  return storage.storeConversation(conversation);
});
```

### 4. Handle Async Operations

Use promises for async operations in page.evaluate:

```typescript
const result = await page.evaluate(() => {
  return new Promise((resolve) => {
    const syncService = (window as any).crossTabSyncService;
    syncService.subscribe('update', (event) => {
      resolve(event);
    });
  });
});
```

### 5. Clean Up Resources

Always close contexts in afterEach:

```typescript
test.afterEach(async () => {
  await context.close();
});
```

## Debugging

### View Test Report

After running tests, view the HTML report:

```bash
npx playwright show-report playwright-report
```

### Debug Specific Test

```bash
pnpm test:e2e:debug --grep "test name"
```

### Take Screenshots

Screenshots are automatically taken on failure and saved to `playwright-report/`.

### View Traces

Traces are captured on first retry and can be viewed with:

```bash
npx playwright show-trace trace.zip
```

## CI/CD Integration

Tests are configured to run in CI with:

- 2 retries for flaky tests
- Single worker to avoid conflicts
- JUnit XML report generation
- HTML report artifacts

## Migration Guide

To convert a Vitest E2E test to Playwright:

1. **Change imports**:

   ```typescript
   // Before (Vitest)
   import { describe, it, expect } from 'vitest';
   import { render, screen } from '@testing-library/react';

   // After (Playwright)
   import { test, expect, type Page } from '@playwright/test';
   ```

2. **Change test structure**:

   ```typescript
   // Before
   describe('Feature', () => {
     it('should work', () => {});
   });

   // After
   test.describe('Feature', () => {
     test('should work', async () => {});
   });
   ```

3. **Use page.evaluate for browser APIs**:

   ```typescript
   // Before
   const storage = getConversationStorage();
   await storage.storeConversation(conv);

   // After
   await page.evaluate((conv) => {
     const storage = (window as any).conversationStorage;
     return storage.storeConversation(conv);
   }, conv);
   ```

4. **Use Playwright assertions**:

   ```typescript
   // Before
   expect(result).toBe(true);

   // After (same, but in async context)
   const result = await page.evaluate(() => {
     // Get result
   });
   expect(result).toBe(true);
   ```

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright API Reference](https://playwright.dev/docs/api/class-playwright)
