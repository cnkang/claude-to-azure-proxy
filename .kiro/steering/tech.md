---
inclusion: always
---

# Technology Stack & Development Guidelines

## Core Stack Requirements

- **Runtime**: Node.js 24+ with ES Modules (ESM) - use `.js` extensions in imports
- **Language**: TypeScript 5.3+ with strict mode - no `any` types, explicit return types required
- **Framework**: Express.js - always use typed Request/Response interfaces
- **Package Manager**: pnpm (preferred) - use `pnpm` commands in scripts and documentation
- **Testing**: Vitest with happy-dom environment and >90% coverage requirement

## Critical Dependencies & Usage Patterns

### HTTP & Security

- **axios**: For Azure OpenAI API calls - always include timeout and retry logic
- **helmet**: Apply to all routes - never disable security headers
- **express-rate-limit**: Required on all public endpoints
- **express-validator**: Validate all request inputs - use schema-based validation

### Configuration & Validation

- **joi**: Schema validation for environment variables - fail-fast on invalid config
- **dotenv**: Load environment variables - validate at startup, not runtime
- **uuid**: Generate correlation IDs for all requests - include in logs and error responses

## Development Commands (Use These)

```bash
# Development workflow
pnpm dev              # Hot reload development server
pnpm build            # TypeScript compilation to dist/
pnpm start            # Production server from dist/

# Testing workflow
pnpm test --run       # Run all tests once (RECOMMENDED - avoids watch mode)
pnpm test             # Run tests in watch mode (keeps running, use Ctrl+C to stop)
pnpm test:coverage    # Generate coverage report (>90% required)

# Code quality (run before commits)
pnpm lint             # Check formatting and linting with Biome
pnpm lint:fix         # Auto-fix Biome issues (lint + format)
pnpm type-check       # Run TypeScript type checking
pnpm format           # Format with Biome
pnpm quality:all      # Run all quality checks
```

**IMPORTANT**: Always use `pnpm test --run` instead of `pnpm test` to avoid watch mode that keeps running indefinitely. Use watch mode (`pnpm test`) only during active development when you want continuous test feedback.

## TypeScript Patterns (Enforce These)

### Import/Export Rules

```typescript
// Always use .js extensions in imports
import { validateRequest } from '../utils/validation.js';
import type { ApiRequest } from '../types/index.js';

// Group imports: external → types → internal
import express from 'express';
import type { Request, Response } from 'express';
import type { ApiRequest } from '../types/index.js';
import { logger } from '../utils/logger.js';
```

### Type Safety Requirements

- Use `readonly` for immutable data structures
- Explicit return types on all functions
- Use `unknown` instead of `any` with type guards
- Prefer interfaces over types for object shapes

### Error Handling Pattern

```typescript
// Always use this pattern for async operations
try {
  const result = await externalApiCall();
  return transformResponse(result);
} catch (error) {
  logger.error('Operation failed', { correlationId, error });
  throw new ApiError('Operation failed', 500);
}
```

## Configuration Standards

### Environment Variables

- Validate all env vars at startup using Joi schemas
- Use `.env.example` for documentation
- Never expose secrets in logs or error responses
- Default to secure values, fail if required vars missing

### Docker Requirements

- Use `node:24-alpine` base image
- Multi-stage builds: deps → builder → runner
- Non-root user with minimal privileges
- Health check endpoint at `/health`

## Testing Requirements

### Test Patterns Documentation

**IMPORTANT**: For comprehensive test patterns and best practices, see [test-patterns.md](./test-patterns.md) which covers:
- Async/await patterns for fake timer tests
- Storage initialization and cleanup patterns
- E2E test isolation patterns
- Common pitfalls and how to avoid them

### Test Structure

- Mirror `src/` structure in `tests/`
- Use test factories from `tests/test-factories.ts`
- Include unit, integration, and security tests
- Mock external dependencies consistently

### Coverage Targets

- Minimum 90% code coverage
- 100% coverage for critical security functions
- Test all error paths and edge cases
- Include performance and load testing for API endpoints

### Testing Best Practices

#### Async Testing with Fake Timers

When testing code with timers (setTimeout, retry logic, etc.):

```typescript
// ✅ CORRECT: Advance timers before awaiting promise
test('should retry operation', async () => {
  vi.useFakeTimers();
  
  const promise = retryManager.execute(operation);
  await vi.runAllTimersAsync();  // Advance timers first
  const result = await promise;   // Then await promise
  
  vi.useRealTimers();
});

// ✅ CORRECT: Handle rejections properly
test('should fail after retries', async () => {
  vi.useFakeTimers();
  
  const promise = retryManager.execute(operation);
  const rejectionPromise = promise.catch(error => error);  // Catch immediately
  await vi.runAllTimersAsync();
  const error = await rejectionPromise;
  
  vi.useRealTimers();
});
```

#### Storage Testing

When testing browser storage (localStorage, IndexedDB):

```typescript
// ✅ CORRECT: Clear and initialize storage before each test
beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  
  // Disable IndexedDB for consistent testing
  originalIndexedDB = window.indexedDB;
  Object.defineProperty(window, 'indexedDB', {
    configurable: true,
    value: null,
  });
  
  storage = ConversationStorage.getInstance();
  await storage.initialize();
});

// ✅ CORRECT: Restore storage after each test
afterEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  
  Object.defineProperty(window, 'indexedDB', {
    configurable: true,
    value: originalIndexedDB,
  });
  
  await new Promise(resolve => setTimeout(resolve, 0));
});
```

#### E2E Testing

When writing Playwright E2E tests:

```typescript
// ✅ CORRECT: Clear storage before each E2E test
test.beforeEach(async ({ page }) => {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  
  await page.evaluate(async () => {
    const databases = await indexedDB.databases();
    for (const db of databases) {
      if (db.name) indexedDB.deleteDatabase(db.name);
    }
  });
  
  await page.goto('/');
  await page.waitForFunction(() => window.localStorage !== null);
});
```

### Test Cleanup

Always implement comprehensive cleanup in `afterEach` hooks:

```typescript
afterEach(async () => {
  // 1. Wait for pending promises
  await vi.runAllTimersAsync();
  
  // 2. Restore mocks
  vi.restoreAllMocks();
  
  // 3. Restore timers
  vi.useRealTimers();
  
  // 4. Clear microtask queue
  await new Promise(resolve => setImmediate(resolve));
});
```

### Common Testing Pitfalls to Avoid

1. **❌ Not awaiting timer advancement**: Always `await vi.runAllTimersAsync()`
2. **❌ Not catching rejected promises**: Use `.catch()` or `expect().rejects`
3. **❌ Not clearing storage between tests**: Always clear in `beforeEach`/`afterEach`
4. **❌ Restoring timers too early**: Restore in `afterEach`, not mid-test
5. **❌ Not waiting for async storage operations**: Always `await` storage calls
