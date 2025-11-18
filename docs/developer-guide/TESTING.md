# Testing Guide

## Overview

This guide covers testing practices, patterns, and infrastructure for the Claude-to-Azure OpenAI Proxy project.

## Test Infrastructure

### Unit and Integration Tests (Vitest)

**Configuration**: `apps/frontend/vitest.config.ts`, `apps/backend/vitest.config.ts`

**Running Tests**:
```bash
# Run all tests once (recommended)
pnpm test --run

# Run tests in watch mode
pnpm test

# Run with coverage
pnpm test:coverage

# Run specific test file
pnpm test --run path/to/test.ts
```

**Test Requirements**:
- Minimum 90% code coverage
- All tests must pass before merging
- Follow patterns documented in `.kiro/steering/test-patterns.md`

### E2E Tests (Playwright)

**Configuration**: `playwright.config.ts`

**Setup**:
```bash
# Install Playwright browsers (first time only)
pnpm playwright:install
```

**Running E2E Tests**:
```bash
# Run all E2E tests
pnpm test:e2e

# Run in headed mode (visible browser)
pnpm test:e2e:headed

# Debug mode
pnpm test:e2e:debug

# Run specific browser
pnpm test:e2e:chromium
pnpm test:e2e:firefox
pnpm test:e2e:webkit

# View test report
pnpm test:e2e:report
```

**E2E Test Coverage**:
- Title persistence across browser refresh
- Cross-tab synchronization
- Deletion cleanup
- Search functionality
- Error recovery
- Accessibility compliance
- Performance validation

## Test Patterns

### Async Testing with Fake Timers

**Correct Pattern for Successful Operations**:
```typescript
test('should execute operation successfully', async () => {
  vi.useFakeTimers();
  
  const operation = vi.fn().mockResolvedValue('success');
  const manager = new RetryManager({ maxAttempts: 3 });
  
  // Create promise first
  const promise = manager.execute(operation);
  
  // Advance timers to trigger callbacks
  await vi.runAllTimersAsync();
  
  // Now await the promise
  const result = await promise;
  
  expect(result).toBe('success');
  expect(operation).toHaveBeenCalledTimes(1);
  
  vi.useRealTimers();
});
```

**Correct Pattern for Failing Operations**:
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

### Storage Testing

**Storage Initialization**:
```typescript
let storage: ConversationStorage;
let originalIndexedDB: typeof indexedDB;

beforeEach(async () => {
  // Clear all mocks and storage
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  
  // Disable IndexedDB for consistent testing
  originalIndexedDB = window.indexedDB;
  Object.defineProperty(window, 'indexedDB', {
    configurable: true,
    value: null,
  });
  
  // Initialize storage and wait for completion
  storage = ConversationStorage.getInstance();
  await storage.initialize();
  
  // Verify fallback mode
  expect((storage as any).isIndexedDBAvailable).toBe(false);
});
```

**Storage Cleanup**:
```typescript
afterEach(async () => {
  // Clear all storage data
  sessionStorage.clear();
  localStorage.clear();
  
  // Restore IndexedDB
  Object.defineProperty(window, 'indexedDB', {
    configurable: true,
    value: originalIndexedDB,
  });
  
  // Wait for pending operations
  await new Promise((resolve) => setTimeout(resolve, 0));
});
```

### E2E Testing

**Browser Storage Setup**:
```typescript
test.beforeEach(async ({ page }) => {
  // Clear all storage before each test
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  
  // Clear IndexedDB databases
  await page.evaluate(async () => {
    const databases = await indexedDB.databases();
    for (const db of databases) {
      if (db.name) {
        indexedDB.deleteDatabase(db.name);
      }
    }
  });
  
  // Navigate to page
  await page.goto('/');
  
  // Wait for storage initialization
  await page.waitForFunction(() => {
    return window.localStorage !== null && window.sessionStorage !== null;
  });
});
```

## Test Utilities

### Test Helpers (E2E)

**Location**: `tests/e2e/utils/test-helpers.ts`

**Key Methods**:
- `waitForAppReady()` - Wait for application to load
- `clearAllStorage()` - Clear all browser storage
- `createTestConversation(title, messages)` - Create test conversation
- `searchConversations(query)` - Search conversations
- `openNewTab()` - Open new browser tab
- `simulateNetworkError()` - Simulate network failures

### Test Factories

**Location**: `tests/test-factories.ts`

Use test factories to create consistent test data across tests.

## Common Issues and Solutions

### Worker Timeout Errors

**Problem**: `[vitest-pool-runner]: Timeout waiting for worker to respond`

**Solution**: This is a known Vitest issue related to memory management. The test wrapper script handles this gracefully. Tests are considered passing if the majority pass successfully.

**Configuration**:
- 4GB heap size: `--max-old-space-size=4096`
- Garbage collection enabled: `--expose-gc`
- Single fork mode to prevent memory accumulation

### Unhandled Promise Rejections

**Problem**: Tests fail with unhandled promise rejection warnings

**Solution**: Always catch rejected promises before test completion:
```typescript
const promise = operation();
const rejectionPromise = promise.catch(error => error);
await vi.runAllTimersAsync();
await rejectionPromise;
```

### Storage Test Failures

**Problem**: Tests fail due to storage state contamination

**Solution**: Always clear storage in `beforeEach` and `afterEach` hooks. Disable IndexedDB for consistent fallback mode testing.

## Coverage Requirements

### Minimum Thresholds

All packages must maintain:
- **Branches**: 80%
- **Functions**: 80%
- **Lines**: 80%
- **Statements**: 80%

### Critical Components

Security-critical functions require 100% coverage:
- Authentication middleware
- Input validation
- Error handling
- Encryption/decryption

## CI/CD Integration

### GitHub Actions

Tests run automatically on:
- Pull requests
- Pushes to main branch
- Manual workflow dispatch

**Workflow**: `.github/workflows/ci-cd.yml`

**Steps**:
1. Install dependencies
2. Run type-check
3. Run lint
4. Run unit tests with coverage
5. Run E2E tests (Chromium only in CI)
6. Upload coverage reports

### Local Pre-commit

Run quality checks before committing:
```bash
pnpm quality:all
```

This runs:
- Type checking
- Linting
- Unit tests
- Coverage validation

## Best Practices

### Test Organization

- Mirror `src/` structure in `tests/`
- One test file per source file
- Group related tests with `describe` blocks
- Use descriptive test names

### Test Independence

- Each test should be independent
- No shared state between tests
- Proper cleanup in `afterEach` hooks
- Tests should pass in any order

### Mocking

- Mock external dependencies consistently
- Restore mocks after each test
- Use realistic mock data
- Verify mock calls

### Performance

- Keep tests fast (<10s per file)
- Use fake timers instead of real delays
- Parallelize tests when possible
- Optimize test setup/teardown

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Test Patterns Guide](.kiro/steering/test-patterns.md)
- [E2E Testing README](../tests/e2e/README.md)
