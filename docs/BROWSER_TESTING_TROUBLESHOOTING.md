# Browser Testing Troubleshooting Guide

## Common Issues and Solutions

### Issue 1: Dev Server Timeout

**Error Message:**
```
Error: Timed out waiting 120000ms from config.webServer.
```

**Cause:**
The Playwright configuration tries to automatically start the dev server, but it times out after 120 seconds.

**Solution 1: Use Manual Configuration (Recommended)**

Start the dev server manually in a separate terminal:

```bash
# Terminal 1: Start dev server
pnpm --filter @repo/frontend dev

# Terminal 2: Run tests with manual config
pnpm exec playwright test --config=playwright.config.manual.ts
```

**Solution 2: Increase Timeout**

Edit `playwright.config.ts` and increase the webServer timeout:

```typescript
webServer: {
  command: 'pnpm --filter @repo/frontend dev',
  url: 'http://localhost:5173',
  timeout: 300 * 1000, // Increase to 5 minutes
  // ...
}
```

**Solution 3: Check Port Availability**

Make sure port 5173 is not already in use:

```bash
# Check if port is in use
lsof -i :5173

# Kill process using the port (if needed)
kill -9 <PID>
```

### Issue 2: Browser Not Installed

**Error Message:**
```
Error: browserType.launch: Executable doesn't exist
```

**Solution:**

Install Playwright browsers:

```bash
pnpm exec playwright install
```

Or install with system dependencies:

```bash
pnpm exec playwright install --with-deps
```

### Issue 3: Tests Timing Out

**Error Message:**
```
Test timeout of 30000ms exceeded
```

**Solution 1: Increase Test Timeout**

Add timeout to specific test:

```typescript
test('my test', async ({ page }) => {
  test.setTimeout(60000); // 60 seconds
  // test code
});
```

**Solution 2: Check App Loading**

Verify the app loads correctly:

```bash
# Start dev server
pnpm --filter @repo/frontend dev

# Open browser and check http://localhost:5173
```

**Solution 3: Wait for App Ready**

Ensure tests wait for app to be ready:

```typescript
await helpers.waitForAppReady();
```

### Issue 4: Storage Not Persisting

**Error Message:**
```
Expected "New Title" but got "Original Title"
```

**Solution:**

Add wait time for debounce and persistence:

```typescript
// Update title
await helpers.updateConversationTitle(id, 'New Title');

// Wait for debounce (500ms) + persistence (100ms)
await page.waitForTimeout(600);

// Now verify
const title = await helpers.getConversationTitle(id);
expect(title).toBe('New Title');
```

### Issue 5: Cross-Tab Sync Not Working

**Error Message:**
```
Storage event not received
```

**Solution:**

Ensure proper event handling:

```typescript
// Open new tab
const newTab = await helpers.openNewTab();

// Make change in original tab
await page.evaluate(() => {
  localStorage.setItem('test', 'value');
});

// Wait for storage event in new tab
await newTab.waitForEvent('storage');
```

### Issue 6: Mobile Tests Failing

**Error Message:**
```
Element not visible on mobile viewport
```

**Solution:**

Set mobile viewport before test:

```typescript
test('mobile test', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  // test code
});
```

Or use mobile project:

```bash
pnpm exec playwright test --project=mobile-chrome
```

### Issue 7: Accessibility Violations

**Error Message:**
```
Expected 0 violations but got 5
```

**Solution:**

Review violations and fix:

```typescript
const results = await new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa', 'wcag2aaa'])
  .analyze();

// Log violations for debugging
console.log(JSON.stringify(results.violations, null, 2));
```

Common fixes:
- Add ARIA labels
- Fix color contrast
- Add alt text to images
- Ensure keyboard navigation

### Issue 8: Browser-Specific Failures

**Error Message:**
```
Test passes on Chromium but fails on WebKit
```

**Solution:**

Check browser-specific issues:

**WebKit (Safari):**
- Use ISO 8601 date format: `new Date().toISOString()`
- Keep IndexedDB transactions short
- Check storage quota before operations

**Firefox:**
- Batch large IndexedDB operations
- Use smaller transactions

**Chromium:**
- Check storage quota calculation

See [Browser Compatibility Guide](./BROWSER_COMPATIBILITY.md) for details.

### Issue 9: Flaky Tests

**Error Message:**
```
Test passes sometimes but fails randomly
```

**Solution 1: Add Proper Waits**

Don't use arbitrary timeouts:

```typescript
// ❌ Bad: Arbitrary timeout
await page.waitForTimeout(1000);

// ✅ Good: Wait for specific condition
await page.waitForSelector('[data-conversation-id]');
```

**Solution 2: Disable Animations**

Add to test setup:

```typescript
await page.addStyleTag({
  content: '* { animation: none !important; transition: none !important; }'
});
```

**Solution 3: Increase Retries**

In `playwright.config.ts`:

```typescript
retries: 2, // Retry failed tests twice
```

### Issue 10: Screenshots Not Captured

**Error Message:**
```
No screenshots in playwright-report
```

**Solution:**

Ensure screenshot configuration:

```typescript
use: {
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
}
```

Or take manual screenshot:

```typescript
await page.screenshot({ path: 'debug.png' });
```

## Debugging Techniques

### 1. Headed Mode

See the browser while tests run:

```bash
pnpm exec playwright test --config=playwright.config.manual.ts --headed
```

### 2. Debug Mode

Use Playwright Inspector:

```bash
pnpm exec playwright test --config=playwright.config.manual.ts --debug
```

### 3. Slow Motion

Run tests in slow motion:

```bash
pnpm exec playwright test --config=playwright.config.manual.ts --headed --slow-mo=1000
```

### 4. Console Logging

Enable console logging in tests:

```typescript
page.on('console', msg => console.log('PAGE LOG:', msg.text()));
```

### 5. Trace Viewer

Generate and view traces:

```bash
# Run with trace
pnpm exec playwright test --config=playwright.config.manual.ts --trace=on

# View trace
pnpm exec playwright show-trace playwright-report/trace.zip
```

### 6. Network Inspection

Log network requests:

```typescript
page.on('request', request => {
  console.log('REQUEST:', request.url());
});

page.on('response', response => {
  console.log('RESPONSE:', response.url(), response.status());
});
```

## Getting Help

1. Check this troubleshooting guide
2. Review [Browser Compatibility Guide](./BROWSER_COMPATIBILITY.md)
3. Check [E2E Test README](../tests/e2e/README.md)
4. Search existing GitHub issues
5. Create new issue with:
   - Error message
   - Steps to reproduce
   - Browser and OS
   - Test output
   - Screenshots/videos

## Useful Commands

```bash
# Check Playwright version
pnpm exec playwright --version

# List installed browsers
pnpm exec playwright install --dry-run

# Clear test cache
rm -rf playwright-report

# Run single test
pnpm exec playwright test --config=playwright.config.manual.ts -g "test name"

# Run tests in specific file
pnpm exec playwright test --config=playwright.config.manual.ts tests/e2e/browser-compatibility.spec.ts

# Generate HTML report
pnpm exec playwright show-report
```
