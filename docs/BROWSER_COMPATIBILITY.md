# Browser Compatibility Guide

This document outlines browser compatibility testing, known issues, and workarounds for the conversation persistence feature.

## Supported Browsers

### Desktop Browsers

| Browser | Minimum Version | Status | Notes |
|---------|----------------|--------|-------|
| Chrome | 90+ | ✅ Fully Supported | Primary development browser |
| Firefox | 88+ | ✅ Fully Supported | Full feature parity |
| Safari | 14+ | ✅ Fully Supported | WebKit-specific workarounds implemented |
| Edge | 90+ | ✅ Fully Supported | Chromium-based, same as Chrome |

### Mobile Browsers

| Browser | Minimum Version | Status | Notes |
|---------|----------------|--------|-------|
| Chrome Mobile | 90+ | ✅ Fully Supported | Android |
| Safari Mobile | 14+ | ✅ Fully Supported | iOS |
| Firefox Mobile | 88+ | ✅ Fully Supported | Android |
| Samsung Internet | 14+ | ✅ Fully Supported | Android |

## Browser Feature Support

### Storage APIs

#### IndexedDB

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome | ✅ Full | Primary storage mechanism |
| Firefox | ✅ Full | Slightly different transaction behavior |
| Safari | ✅ Full | Stricter transaction timeout rules |
| Edge | ✅ Full | Same as Chrome |

**Implementation Notes:**
- All browsers support IndexedDB v2 with full transaction support
- Safari requires shorter transaction durations
- Firefox may be slower with large transactions
- All browsers support compound indexes and cursors

#### localStorage

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome | ✅ Full | Fallback storage mechanism |
| Firefox | ✅ Full | Same behavior as Chrome |
| Safari | ✅ Full | Same behavior as Chrome |
| Edge | ✅ Full | Same behavior as Chrome |

**Implementation Notes:**
- Used as fallback when IndexedDB is unavailable
- 5-10MB storage limit across all browsers
- Synchronous API (blocking)
- No encryption support (handled at application level)

#### Storage Events (Cross-Tab Sync)

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome | ✅ Full | Reliable event delivery |
| Firefox | ✅ Full | Reliable event delivery |
| Safari | ✅ Full | Reliable event delivery |
| Edge | ✅ Full | Same as Chrome |

**Implementation Notes:**
- All browsers support storage events for cross-tab synchronization
- Events fire reliably when localStorage is modified
- Same-tab modifications do not trigger events (expected behavior)
- Event delivery is typically <100ms

### Web Crypto API

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome | ✅ Full | AES-GCM 256-bit encryption |
| Firefox | ✅ Full | AES-GCM 256-bit encryption |
| Safari | ✅ Full | AES-GCM 256-bit encryption |
| Edge | ✅ Full | Same as Chrome |

**Implementation Notes:**
- All browsers support Web Crypto API for encryption
- AES-GCM 256-bit encryption is supported across all browsers
- Key derivation using PBKDF2 is supported
- Random IV generation using crypto.getRandomValues()

### CSS Features

#### CSS Grid

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome | ✅ Full | Primary layout system |
| Firefox | ✅ Full | Full feature parity |
| Safari | ✅ Full | Full feature parity |
| Edge | ✅ Full | Same as Chrome |

#### CSS Flexbox

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome | ✅ Full | Secondary layout system |
| Firefox | ✅ Full | Full feature parity |
| Safari | ✅ Full | Full feature parity |
| Edge | ✅ Full | Same as Chrome |

#### CSS Custom Properties (Variables)

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome | ✅ Full | Used for theming |
| Firefox | ✅ Full | Full feature parity |
| Safari | ✅ Full | Full feature parity |
| Edge | ✅ Full | Same as Chrome |

### JavaScript Features

#### ES Modules

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome | ✅ Full | Native ES module support |
| Firefox | ✅ Full | Native ES module support |
| Safari | ✅ Full | Native ES module support |
| Edge | ✅ Full | Same as Chrome |

#### Async/Await

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome | ✅ Full | Used throughout application |
| Firefox | ✅ Full | Full feature parity |
| Safari | ✅ Full | Full feature parity |
| Edge | ✅ Full | Same as Chrome |

## Known Browser-Specific Issues

### Safari (WebKit)

#### Issue 1: Date Parsing

**Problem:**
Safari requires ISO 8601 format for date strings. Other formats may fail to parse.

**Example:**
```javascript
// ❌ May fail in Safari
new Date('2024-01-15 10:30:00');

// ✅ Works in all browsers
new Date('2024-01-15T10:30:00.000Z');
```

**Workaround:**
Always use `toISOString()` when serializing dates:

```typescript
// Serialize date
const timestamp = new Date().toISOString();

// Deserialize date
const date = new Date(timestamp);
```

**Status:** ✅ Implemented throughout codebase

#### Issue 2: IndexedDB Transaction Timeout

**Problem:**
Safari has stricter transaction timeout rules. Transactions that take too long will fail.

**Workaround:**
Keep transactions short and focused:

```typescript
// ❌ Long transaction (may timeout in Safari)
const transaction = db.transaction(['conversations', 'messages'], 'readwrite');
// ... many operations ...

// ✅ Short, focused transaction
const transaction = db.transaction(['conversations'], 'readwrite');
const store = transaction.objectStore('conversations');
await store.put(conversation);
```

**Status:** ✅ Implemented in storage service

#### Issue 3: Storage Quota Estimation

**Problem:**
Safari's storage quota estimation may differ from other browsers.

**Workaround:**
Always check quota before large operations:

```typescript
if ('storage' in navigator && 'estimate' in navigator.storage) {
  const estimate = await navigator.storage.estimate();
  const percentUsed = (estimate.usage! / estimate.quota!) * 100;
  
  if (percentUsed > 80) {
    // Warn user or cleanup old data
  }
}
```

**Status:** ✅ Implemented in storage service

### Firefox

#### Issue 1: IndexedDB Performance

**Problem:**
Firefox may be slower with large IndexedDB transactions compared to Chrome.

**Workaround:**
Batch operations and use smaller transactions:

```typescript
// ❌ Single large transaction
for (const item of items) {
  await store.put(item);
}

// ✅ Batched operations
const BATCH_SIZE = 100;
for (let i = 0; i < items.length; i += BATCH_SIZE) {
  const batch = items.slice(i, i + BATCH_SIZE);
  const transaction = db.transaction(['store'], 'readwrite');
  const store = transaction.objectStore('store');
  
  for (const item of batch) {
    store.put(item);
  }
  
  await transaction.complete;
}
```

**Status:** ✅ Implemented in storage service

#### Issue 2: Console Logging

**Problem:**
Firefox console may show more verbose warnings than other browsers.

**Workaround:**
Filter non-critical warnings in development:

```typescript
// Suppress non-critical warnings in Firefox
if (navigator.userAgent.includes('Firefox')) {
  const originalWarn = console.warn;
  console.warn = (...args) => {
    const message = args[0]?.toString() || '';
    if (!message.includes('non-critical-pattern')) {
      originalWarn.apply(console, args);
    }
  };
}
```

**Status:** ⚠️ Optional (not critical for functionality)

### Chromium (Chrome/Edge)

#### Issue 1: Storage Quota Calculation

**Problem:**
Chromium calculates storage quota differently than other browsers.

**Workaround:**
Use Storage API for accurate quota information:

```typescript
const estimate = await navigator.storage.estimate();
const available = estimate.quota! - estimate.usage!;

// Check if enough space for operation
if (available < requiredSpace) {
  // Handle insufficient space
}
```

**Status:** ✅ Implemented in storage service

## Mobile Browser Considerations

### Touch Targets

**Requirement:** WCAG 2.2 AAA requires minimum 44x44 CSS pixels for touch targets.

**Implementation:**
```css
/* Ensure adequate touch target size */
button,
a,
input,
[role="button"],
[tabindex="0"] {
  min-width: 44px;
  min-height: 44px;
  padding: 12px;
}
```

**Status:** ✅ Implemented in all UI components

### Viewport Configuration

**Implementation:**
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
```

**Notes:**
- Allows zoom up to 5x for accessibility
- Prevents horizontal scrolling
- Responsive design adapts to all viewport sizes

**Status:** ✅ Implemented

### Mobile Scrolling

**Implementation:**
```css
/* Smooth scrolling on mobile */
html {
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
}

/* Prevent horizontal scroll */
body {
  overflow-x: hidden;
  max-width: 100vw;
}
```

**Status:** ✅ Implemented

### Mobile Input Handling

**Considerations:**
- Virtual keyboard may cover input fields
- Use `scrollIntoView()` to ensure input is visible
- Handle orientation changes gracefully

**Implementation:**
```typescript
// Scroll input into view when focused
input.addEventListener('focus', () => {
  input.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

// Handle orientation change
window.addEventListener('orientationchange', () => {
  // Recalculate layout
  window.location.reload();
});
```

**Status:** ✅ Implemented in input components

## Testing Strategy

### Automated Testing

#### Option 1: Automatic Dev Server (CI/CD)

The default configuration automatically starts the dev server:

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

# Run browser compatibility tests
./scripts/test-browser-compatibility.sh
```

#### Option 2: Manual Dev Server (Development - Recommended)

For faster iteration and to avoid webServer timeout issues:

```bash
# Terminal 1: Start dev server manually
pnpm --filter @repo/frontend dev

# Terminal 2: Run tests with manual config
pnpm exec playwright test --config=playwright.config.manual.ts

# Run on specific browser
pnpm exec playwright test --config=playwright.config.manual.ts --project=chromium

# Run browser compatibility tests
pnpm exec playwright test --config=playwright.config.manual.ts tests/e2e/browser-compatibility.spec.ts

# Generate compatibility report with manual config
USE_MANUAL_CONFIG=true ./scripts/test-browser-compatibility.sh
```

**Troubleshooting:** If you see "Error: Timed out waiting 120000ms from config.webServer", use Option 2 (manual dev server).

### Manual Testing Checklist

#### Desktop Browsers

- [ ] Test on Chrome (latest)
- [ ] Test on Firefox (latest)
- [ ] Test on Safari (latest)
- [ ] Test on Edge (latest)

#### Mobile Browsers

- [ ] Test on Chrome Mobile (Android)
- [ ] Test on Safari Mobile (iOS)
- [ ] Test on Firefox Mobile (Android)
- [ ] Test on Samsung Internet (Android)

#### Test Scenarios

- [ ] Create conversation
- [ ] Update conversation title
- [ ] Delete conversation
- [ ] Search conversations
- [ ] Cross-tab synchronization
- [ ] Browser refresh (persistence)
- [ ] Keyboard navigation
- [ ] Touch interaction (mobile)
- [ ] Orientation change (mobile)
- [ ] Zoom (accessibility)

### Performance Testing

Monitor performance across browsers:

```bash
# Run performance tests
pnpm exec playwright test tests/e2e/performance.spec.ts

# Check results
cat playwright-report/performance-metrics.json
```

**Target Metrics:**
- Load time: <1000ms
- Title update: <500ms
- Deletion: <500ms
- Search: <500ms
- Cross-tab sync: <1000ms

## Debugging Browser-Specific Issues

### Chrome DevTools

```bash
# Run tests in headed mode
pnpm exec playwright test --headed --project=chromium

# Debug specific test
pnpm exec playwright test --debug --project=chromium -g "test name"
```

### Firefox DevTools

```bash
# Run tests in headed mode
pnpm exec playwright test --headed --project=firefox

# Debug specific test
pnpm exec playwright test --debug --project=firefox -g "test name"
```

### Safari Web Inspector

```bash
# Run tests in headed mode
pnpm exec playwright test --headed --project=webkit

# Debug specific test
pnpm exec playwright test --debug --project=webkit -g "test name"
```

### Mobile Debugging

#### Chrome Mobile (Android)

1. Enable USB debugging on Android device
2. Connect device to computer
3. Open `chrome://inspect` in Chrome
4. Select device and inspect

#### Safari Mobile (iOS)

1. Enable Web Inspector on iOS device (Settings > Safari > Advanced)
2. Connect device to Mac
3. Open Safari > Develop > [Device Name]
4. Select page to inspect

## Browser Compatibility Report

Generate compatibility report:

```bash
# Run compatibility tests and generate report
./scripts/test-browser-compatibility.sh

# View report
cat playwright-report/browser-compatibility/compatibility-report.md
```

## Continuous Integration

### GitHub Actions

```yaml
# .github/workflows/browser-compatibility.yml
name: Browser Compatibility Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        browser: [chromium, firefox, webkit]
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Install Playwright
        run: pnpm exec playwright install --with-deps
      
      - name: Run tests
        run: pnpm exec playwright test --project=${{ matrix.browser }}
      
      - name: Upload results
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report-${{ matrix.browser }}
          path: playwright-report/
```

## Best Practices

### 1. Feature Detection

Always use feature detection instead of browser detection:

```typescript
// ✅ Good: Feature detection
if ('indexedDB' in window) {
  // Use IndexedDB
} else {
  // Fallback to localStorage
}

// ❌ Bad: Browser detection
if (navigator.userAgent.includes('Safari')) {
  // Safari-specific code
}
```

### 2. Progressive Enhancement

Build features that work everywhere, enhance where possible:

```typescript
// Base functionality (works everywhere)
const storage = new LocalStorageAdapter();

// Enhanced functionality (where available)
if ('indexedDB' in window) {
  storage = new IndexedDBAdapter();
}
```

### 3. Graceful Degradation

Handle missing features gracefully:

```typescript
try {
  // Try advanced feature
  await useIndexedDB();
} catch (error) {
  // Fallback to basic feature
  await useLocalStorage();
}
```

### 4. Cross-Browser Testing

Test on all supported browsers before release:

```bash
# Run full test suite on all browsers
./scripts/test-browser-compatibility.sh
```

## Resources

- [Can I Use](https://caniuse.com/) - Browser feature support tables
- [MDN Web Docs](https://developer.mozilla.org/) - Browser compatibility data
- [Playwright Documentation](https://playwright.dev/) - Cross-browser testing
- [WebKit Blog](https://webkit.org/blog/) - Safari-specific updates
- [Firefox Release Notes](https://www.mozilla.org/firefox/releases/) - Firefox updates
- [Chrome Platform Status](https://chromestatus.com/) - Chrome feature status

## Support

For browser-specific issues:

1. Check this documentation for known issues
2. Search existing GitHub issues
3. Create new issue with browser details:
   - Browser name and version
   - Operating system
   - Steps to reproduce
   - Expected vs actual behavior
   - Console errors (if any)

## Changelog

### 2024-01-15
- Initial browser compatibility documentation
- Added Safari date parsing workaround
- Added Firefox IndexedDB performance notes
- Added mobile browser considerations
- Added automated testing script

---

*This document is maintained by the development team and updated as new browser-specific issues are discovered.*
