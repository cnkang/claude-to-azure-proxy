# Phase 13: Quick Reference Card

## 🎯 Goal

Fix all browser compatibility test failures → Achieve 100% pass rate (20/20 tests)

## 📊 Current Status

- **Passing**: 11/20 (55%)
- **Failing**: 9/20 (45%)
- **Target**: 20/20 (100%)

## 🔥 Top Priority Fixes (Quick Wins)

### 1. Fix Network Idle Timeout (Fixes 2 tests)

**File**: `tests/e2e/utils/test-helpers.ts`

```typescript
// Change from:
await this.page.waitForLoadState('networkidle');

// To:
await this.page.waitForLoadState('load');
```

**Impact**: ⭐⭐⭐ High

### 2. Fix Element Stability (Fixes 3 tests)

**File**: `apps/frontend/src/components/layout/Sidebar.tsx`

- Add loading states
- Fix animation timing
- Ensure elements are stable before interaction **Impact**: ⭐⭐⭐ High

### 3. Add data-conversation-id (Fixes 1 test)

**File**: `apps/frontend/src/components/layout/Sidebar.tsx`

```tsx
<li
  data-testid={`conversation-item-${conversation.id}`}
  data-conversation-id={conversation.id}  // Add this
>
```

**Impact**: ⭐⭐ Medium

### 4. Fix Confirm Dialog Blocking (Fixes 1 test)

**File**: `apps/frontend/src/components/common/ConfirmDialog.css`

```css
.confirm-dialog-overlay {
  z-index: 9999; /* Ensure it's on top */
}
```

**Impact**: ⭐⭐ Medium

### 5. Fix Search Indexing (Fixes 1 test)

**File**: `apps/frontend/src/services/conversation-search.ts`

- Ensure index updates when conversations are created
- Add manual rebuild trigger **Impact**: ⭐⭐ Medium

### 6. Fix Date Handling (Fixes 1 test)

**File**: `apps/frontend/src/services/storage.ts`

```typescript
// Always use ISO 8601 format
const timestamp = new Date().toISOString();
```

**Impact**: ⭐ Low

## 📈 Expected Progress

| After Fix | Tests Passing | Pass Rate |
| --------- | ------------- | --------- |
| Current   | 11/20         | 55%       |
| Fix 1-2   | 16/20         | 80%       |
| Fix 3-4   | 18/20         | 90%       |
| Fix 5     | 19/20         | 95%       |
| Fix 6     | 20/20         | 100% ✅   |

## 🚀 Quick Start

### Step 1: Run Diagnostic

```bash
pnpm exec playwright test --config=playwright.config.manual.ts tests/e2e/diagnostic.spec.ts
```

### Step 2: Fix Top Priority Issues

1. Fix network idle timeout (15 min)
2. Add data-conversation-id (10 min)
3. Fix confirm dialog z-index (10 min)

### Step 3: Verify

```bash
pnpm exec playwright test --config=playwright.config.manual.ts tests/e2e/browser-compatibility.spec.ts --project=chromium
```

### Step 4: Iterate

- Fix remaining issues
- Re-run tests
- Document fixes

## 📋 Task Checklist

### Critical (Do First)

- [ ] 13.1.1 - Fix network idle timeout
- [ ] 13.1.2 - Add data-conversation-id
- [ ] 13.1.3 - Fix confirm dialog blocking
- [ ] 13.1.4 - Fix element stability

### Important (Do Second)

- [ ] 13.2.1 - Fix search indexing
- [ ] 13.3.1 - Fix UI state sync
- [ ] 13.5.1 - Fix date handling

### Nice to Have (Do Later)

- [ ] 13.2.3 - Optimize search performance
- [ ] 13.5.2 - Optimize IndexedDB
- [ ] 13.6.1 - Improve wait conditions
- [ ] 13.6.3 - Visual regression testing

### Documentation (Do Last)

- [ ] 13.7.1 - Re-run all tests
- [ ] 13.7.2 - Update docs
- [ ] 13.7.3 - Create report

## 🔍 Debugging Tips

### Test Failing?

1. Check screenshot: `playwright-report/screenshots/`
2. Watch video: `playwright-report/videos/`
3. View trace: `pnpm exec playwright show-trace`

### Element Not Found?

1. Take snapshot: `await page.screenshot({ path: 'debug.png' })`
2. Check test IDs:
   `await page.evaluate(() => [...document.querySelectorAll('[data-testid]')].map(el => el.getAttribute('data-testid')))`
3. Verify element exists: `await page.locator('[data-testid="..."]').count()`

### Test Timeout?

1. Increase timeout: `test.setTimeout(60000)`
2. Check network: `await page.waitForLoadState('load')` instead of `'networkidle'`
3. Add explicit waits: `await page.waitForSelector('[data-testid="..."]')`

## 📞 Need Help?

### Documentation

- Full task list: `.kiro/specs/conversation-persistence/tasks.md`
- Detailed summary: `docs/PHASE_13_TASKS_SUMMARY.md`
- Test results: `docs/TASK_12.10_FINAL_SUMMARY.md`
- Browser guide: `docs/BROWSER_COMPATIBILITY.md`

### Commands

```bash
# Run all tests
pnpm exec playwright test --config=playwright.config.manual.ts

# Run specific test
pnpm exec playwright test --config=playwright.config.manual.ts -g "test name"

# Debug mode
pnpm exec playwright test --config=playwright.config.manual.ts --debug

# Headed mode
pnpm exec playwright test --config=playwright.config.manual.ts --headed
```

---

**Remember**: Fix one issue at a time, verify with tests, then move to the next! 🎯
