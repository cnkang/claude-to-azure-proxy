# Playwright E2E Tests

This directory contains end-to-end tests for the conversation persistence feature using Playwright.

## Test Files

### UI-Based Tests (Using Real User Interactions)

These tests interact with the application through the UI, simulating real user behavior:

- **cross-tab-sync.spec.ts** - Tests for cross-tab synchronization using storage events
- **search-functionality.spec.ts** - Tests for search functionality with keyword highlighting and pagination
- **title-persistence.spec.ts** - Tests for conversation title persistence across browser refresh
- **deletion-cleanup.spec.ts** - Tests for conversation deletion and complete cleanup

### Other E2E Tests

- **accessibility.spec.ts** - Tests for WCAG 2.2 AAA accessibility compliance
- **performance.spec.ts** - Tests for performance metrics and monitoring
- **browser-compatibility.spec.ts** - Tests for cross-browser compatibility
- **app-context-persistence.spec.ts** - Tests for application context persistence
- **component-rendering-order.spec.ts** - Tests for component rendering order
- **layout-rendering.spec.ts** - Tests for layout rendering
- **diagnostic.spec.ts** - Diagnostic tests for troubleshooting

## Setup

### First Time Setup

1. Install Playwright browsers:
   ```bash
   pnpm exec playwright install
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

## Running Tests

### Option 1: Automatic Dev Server (CI/CD)

The default configuration automatically starts the dev server before running tests:

```bash
# Run all E2E tests
pnpm exec playwright test

# Run specific test file
pnpm exec playwright test tests/e2e/accessibility.spec.ts

# Run in specific browser
pnpm exec playwright test --project=chromium
pnpm exec playwright test --project=firefox
pnpm exec playwright test --project=webkit

# Run in all browsers
pnpm exec playwright test --project=chromium --project=firefox --project=webkit

# Run on mobile viewports
pnpm exec playwright test --project=mobile-chrome
pnpm exec playwright test --project=mobile-safari

# Run browser compatibility tests
./scripts/test-browser-compatibility.sh
```

### Option 2: Manual Dev Server (Development)

For faster iteration during development, start the dev server manually:

```bash
# Terminal 1: Start dev server
pnpm --filter @repo/frontend dev

# Terminal 2: Run tests with manual config
pnpm exec playwright test --config=playwright.config.manual.ts

# Run specific test file
pnpm exec playwright test tests/e2e/accessibility.spec.ts --config=playwright.config.manual.ts

# Run in headed mode (see browser)
pnpm exec playwright test --config=playwright.config.manual.ts --headed

# Run specific test by name
pnpm exec playwright test --config=playwright.config.manual.ts -g "should persist title"
```

## Debugging Tests

### Playwright Inspector

Run tests in debug mode with the Playwright Inspector:

```bash
pnpm exec playwright test --config=playwright.config.manual.ts --debug
```

### Headed Mode

See the browser while tests run:

```bash
pnpm exec playwright test --config=playwright.config.manual.ts --headed
```

### Slow Motion

Run tests in slow motion to see what's happening:

```bash
pnpm exec playwright test --config=playwright.config.manual.ts --headed --slow-mo=1000
```

### Screenshots and Videos

Screenshots and videos are automatically captured on test failure and saved to:
- `playwright-report/screenshots/`
- `playwright-report/videos/`

### Traces

View detailed traces of test execution:

```bash
# Run tests with trace
pnpm exec playwright test --config=playwright.config.manual.ts --trace=on

# View trace
pnpm exec playwright show-trace playwright-report/trace.zip
```

## Test Reports

### HTML Report

Generate and view HTML report:

```bash
# Run tests
pnpm exec playwright test --config=playwright.config.manual.ts --reporter=html

# View report
pnpm exec playwright show-report
```

### JSON Report

JSON report is automatically generated at `playwright-report/results.json`

### JUnit Report

JUnit XML report is automatically generated at `playwright-report/junit.xml` for CI/CD integration.

## Testing Approach

### UI-Based Testing

The E2E tests follow a UI-based testing approach that simulates real user interactions rather than directly manipulating storage or internal APIs. This approach:

- **Increases test reliability** - Tests verify the complete user experience, not just internal state
- **Catches UI bugs** - Tests interact with actual UI elements, catching rendering and interaction issues
- **Reflects real usage** - Tests simulate how users actually interact with the application
- **Reduces brittleness** - Tests are less coupled to internal implementation details

### Key Principles

1. **Use UI interactions** - Click buttons, type in inputs, navigate through menus
2. **Wait for UI updates** - Use Playwright's built-in waiting mechanisms for elements to appear
3. **Verify through UI** - Check that changes are visible in the UI, not just in storage
4. **Avoid direct storage access** - Only access storage when absolutely necessary for test setup

## Test Structure

### Fixtures

Tests use custom fixtures defined in `tests/e2e/fixtures/base.ts`:

- **cleanPage** - Page with clean storage (localStorage, sessionStorage, IndexedDB cleared)
- **helpers** - TestHelpers instance with utility methods

### Test Helpers

The `TestHelpers` class (`tests/e2e/utils/test-helpers.ts`) provides common operations:

#### App State Management
- `waitForAppReady()` - Wait for app to load
- `clearAllStorage()` - Clear all storage

#### Conversation Operations
- `createTestConversation(title, messages)` - Create test conversation
- `waitForConversation(id)` - Wait for conversation to appear
- `getConversationTitle(id)` - Get conversation title
- `updateConversationTitle(id, newTitle)` - Update title
- `deleteConversation(id)` - Delete conversation

#### Search Operations
- `searchConversations(query)` - Search for conversations
- `getSearchResultsCount()` - Get number of results

#### Multi-Tab Operations
- `openNewTab()` - Open new tab
- `waitForStorageEvent(eventType)` - Wait for storage event

#### Error Simulation
- `simulateNetworkError()` - Simulate network error
- `restoreNetwork()` - Restore network
- `waitForErrorMessage(message?)` - Wait for error message

#### Debugging
- `takeScreenshot(name)` - Take screenshot
- `enableConsoleLogging()` - Log console messages
- `enableErrorLogging()` - Log page errors

## Writing New Tests

### Basic Test Structure

```typescript
import { test, expect } from './fixtures/base.js';

test.describe('Feature Name', () => {
  test('should do something', async ({ cleanPage, helpers }) => {
    // Create test data
    const conversationId = await helpers.createTestConversation(
      'Test Title',
      [{ role: 'user', content: 'Test message' }]
    );
    
    // Reload to load from storage
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Perform actions
    await helpers.updateConversationTitle(conversationId, 'New Title');
    
    // Wait for persistence
    await cleanPage.waitForTimeout(600);
    
    // Verify results
    const title = await helpers.getConversationTitle(conversationId);
    expect(title).toBe('New Title');
  });
});
```

### Accessibility Test Structure

```typescript
import { test, expect } from './fixtures/base.js';
import AxeBuilder from '@axe-core/playwright';

test('should have no accessibility violations', async ({ cleanPage }) => {
  // Run axe accessibility scan
  const accessibilityScanResults = await new AxeBuilder({ page: cleanPage })
    .withTags(['wcag2a', 'wcag2aa', 'wcag2aaa'])
    .analyze();
  
  // Assert no violations
  expect(accessibilityScanResults.violations).toEqual([]);
});
```

## Best Practices

1. **Use Fixtures** - Always use `cleanPage` and `helpers` fixtures
2. **Wait for App Ready** - Call `helpers.waitForAppReady()` after navigation
3. **Wait for Persistence** - Add delays after storage operations (600ms for debounce)
4. **Clean State** - Each test starts with clean storage
5. **Descriptive Names** - Use clear, descriptive test names
6. **Assertions** - Use specific assertions with clear error messages
7. **Error Handling** - Handle expected errors gracefully
8. **Screenshots** - Take screenshots for debugging complex issues

## Troubleshooting

### Dev Server Not Starting

If the dev server fails to start:

1. Check if port 5173 is already in use
2. Try starting the dev server manually
3. Use the manual config: `--config=playwright.config.manual.ts`

### Tests Timing Out

If tests timeout:

1. Increase timeout in test: `test.setTimeout(60000)`
2. Check if app is loading correctly
3. Verify network requests are completing
4. Check browser console for errors

### Storage Not Persisting

If storage operations fail:

1. Verify IndexedDB is available in browser
2. Check browser console for storage errors
3. Verify storage quota is not exceeded
4. Clear browser data and retry

### Accessibility Violations

If accessibility tests fail:

1. Review axe violations in test output
2. Fix violations in UI components
3. Update CSS for color contrast
4. Add missing ARIA attributes
5. Verify keyboard navigation

## CI/CD Integration

Tests are designed to run in CI/CD pipelines:

```yaml
# .github/workflows/e2e-tests.yml
- name: Install Playwright
  run: pnpm exec playwright install --with-deps

- name: Run E2E Tests
  run: pnpm exec playwright test

- name: Upload Test Results
  if: failure()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## Browser Compatibility

### Supported Browsers

- **Chromium** (Chrome, Edge) - Desktop
- **Firefox** - Desktop
- **WebKit** (Safari) - Desktop
- **Mobile Chrome** (Pixel 5) - Mobile viewport
- **Mobile Safari** (iPhone 12) - Mobile viewport

### Running Cross-Browser Tests

```bash
# Run all tests on all browsers
pnpm exec playwright test

# Run on specific browser
pnpm exec playwright test --project=chromium
pnpm exec playwright test --project=firefox
pnpm exec playwright test --project=webkit

# Run on mobile viewports
pnpm exec playwright test --project=mobile-chrome
pnpm exec playwright test --project=mobile-safari

# Run browser compatibility test suite
pnpm exec playwright test tests/e2e/browser-compatibility.spec.ts

# Generate compatibility report
./scripts/test-browser-compatibility.sh
```

### Known Browser-Specific Issues

See [Browser Compatibility Guide](../../docs/BROWSER_COMPATIBILITY.md) for detailed information on:
- Safari date parsing requirements
- Firefox IndexedDB performance considerations
- Chromium storage quota behavior
- Mobile viewport considerations
- Touch target requirements

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Playwright Test API](https://playwright.dev/docs/api/class-test)
- [axe-core Documentation](https://github.com/dequelabs/axe-core)
- [WCAG 2.2 Guidelines](https://www.w3.org/WAI/WCAG22/quickref/)
- [Browser Compatibility Guide](../../docs/BROWSER_COMPATIBILITY.md)
