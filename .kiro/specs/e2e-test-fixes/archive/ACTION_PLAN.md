# E2E Test Fixes - Action Plan

**Date**: November 24, 2025  
**Current Status**: Task 3.1 Completed, Task 2.4 Blocked

## Current Situation

Task 3.1 (Test core functionality) has been completed successfully. The investigation confirmed the root causes of test failures:

1. **UI Implementation Mismatch** - Tests expect direct buttons, UI uses dropdown menus
2. **Storage Access Issue** - `__conversationStorage` not reliably exposed on window
3. **Backend Stability** - "Headers already sent" errors persist

## Critical Blocker

**Task 2.4.5: Storage Access for E2E Tests**

The fundamental issue preventing progress is that E2E tests cannot reliably access the storage module. This blocks:
- Creating test conversations
- Updating conversation titles
- Deleting conversations
- All storage-dependent test operations

### Problem Details

```
Error: Storage not available on window object. Ensure __E2E_TEST_MODE__ is set.
```

**Root Cause**: Timing issue between when `__E2E_TEST_MODE__` is set and when App.tsx tries to expose storage.

**What We've Tried**:
1. ✅ Added storage exposure in App.tsx useEffect
2. ✅ Used `page.addInitScript()` to set flag early
3. ❌ Storage still not available when tests run

## Recommended Solutions (In Priority Order)

### Option 1: Expose Storage in addInitScript (Recommended)

**Approach**: Expose storage directly in the init script, before any React code runs.

**Implementation**:
```typescript
// In tests/e2e/fixtures/base.ts
await page.addInitScript(() => {
  // Set E2E mode
  (window as any).__E2E_TEST_MODE__ = true;
  
  // Expose a promise that resolves when storage is ready
  (window as any).__storageReady__ = new Promise((resolve) => {
    (window as any).__resolveStorage__ = resolve;
  });
});

// In apps/frontend/src/App.tsx (or main.tsx)
if (window.__E2E_TEST_MODE__ && window.__resolveStorage__) {
  const storage = getConversationStorage();
  await storage.initialize();
  window.__conversationStorage__ = storage;
  window.__resolveStorage__(storage);
}

// In tests
await page.evaluate(() => (window as any).__storageReady__);
```

**Pros**:
- Reliable timing
- Storage available when needed
- Minimal changes to existing code

**Cons**:
- Requires coordination between test and app code
- Adds complexity

### Option 2: Use UI Interactions Only (Alternative)

**Approach**: Modify tests to use only UI interactions, no direct storage access.

**Implementation**:
```typescript
// Instead of: await helpers.createTestConversation()
// Use: Click "New Conversation" button and interact with UI

async createTestConversation(title: string): Promise<string> {
  // Click new conversation button
  await this.page.click('[data-testid="new-conversation-button"]');
  
  // Wait for conversation to appear
  const conversationItem = await this.page.waitForSelector(
    '[data-testid^="conversation-item-"]'
  );
  
  // Extract ID from testid
  const testId = await conversationItem.getAttribute('data-testid');
  const id = testId?.replace('conversation-item-', '') || '';
  
  // Rename if needed
  if (title !== 'New Conversation') {
    await this.updateConversationTitle(id, title);
  }
  
  return id;
}
```

**Pros**:
- Tests real user flow
- No storage access needed
- More realistic E2E testing

**Cons**:
- Slower test execution
- More complex test setup
- Depends on UI being fully functional

### Option 3: Use Backend API (Hybrid Approach)

**Approach**: Create conversations via backend API, then test UI interactions.

**Implementation**:
```typescript
async createTestConversation(title: string): Promise<string> {
  // Create via API
  const response = await this.page.request.post('/api/conversations', {
    data: { title, model: 'gpt-4' }
  });
  
  const { id } = await response.json();
  
  // Wait for UI to update
  await this.page.waitForSelector(
    `[data-testid="conversation-item-${id}"]`
  );
  
  return id;
}
```

**Pros**:
- Fast and reliable
- Tests both API and UI
- No storage access issues

**Cons**:
- Requires backend to be running
- May not test full integration

## Immediate Action Items

### Priority 1: Choose and Implement Solution

**Decision Needed**: Which option to pursue?

**Recommendation**: Start with **Option 1** (Expose Storage in addInitScript) because:
- Most reliable
- Maintains existing test structure
- Can fallback to Option 2 if needed

### Priority 2: Implement Chosen Solution

**Steps**:
1. Implement storage exposure mechanism
2. Update test helpers to wait for storage
3. Verify with diagnostic test
4. Run title-persistence tests
5. Run deletion-cleanup tests

### Priority 3: Complete Task 2.4

Once storage access is fixed:
1. Verify `updateConversationTitle` works with dropdown menu
2. Verify `deleteConversation` works with dropdown menu
3. Run all affected tests
4. Document any remaining issues

### Priority 4: Address Backend Issues

**Problem**: "Can't set headers after they are sent" errors

**Action**:
1. Review backend middleware order
2. Add response state tracking
3. Test under load
4. Fix any race conditions

## Success Criteria

- [ ] Storage reliably available in E2E tests
- [ ] `createTestConversation` works consistently
- [ ] `updateConversationTitle` works with dropdown menu
- [ ] `deleteConversation` works with dropdown menu
- [ ] Title persistence tests pass (at least 5/7)
- [ ] Deletion cleanup tests pass (at least 5/7)
- [ ] No backend crashes during test runs

## Timeline Estimate

- **Option 1 Implementation**: 2-3 hours
- **Option 2 Implementation**: 4-6 hours
- **Option 3 Implementation**: 3-4 hours
- **Backend Fixes**: 2-3 hours
- **Testing and Verification**: 2-3 hours

**Total**: 1-2 days for complete solution

## Resources

- **Documentation**: 
  - TASK_3.1_COMPLETION_SUMMARY.md
  - STORAGE_VERIFICATION_FINDINGS.md
  - TASK_2.4.4_SOLUTION.md

- **Key Files**:
  - `tests/e2e/fixtures/base.ts`
  - `tests/e2e/utils/test-helpers.ts`
  - `apps/frontend/src/App.tsx`
  - `apps/frontend/src/components/layout/Sidebar.tsx`

- **Test Files**:
  - `tests/e2e/title-persistence.spec.ts`
  - `tests/e2e/deletion-cleanup.spec.ts`
  - `tests/e2e/cross-tab-sync.spec.ts`
  - `tests/e2e/search-functionality.spec.ts`

## Questions for User

1. **Which solution approach do you prefer?**
   - Option 1: Expose storage in addInitScript (recommended)
   - Option 2: Use UI interactions only
   - Option 3: Use backend API

2. **Priority for backend fixes?**
   - Fix immediately (blocks some tests)
   - Fix after storage access (can work around)

3. **Acceptable test execution time?**
   - Current target: <600 seconds for 288 tests
   - UI-only approach may be slower

## Next Steps

**Waiting for user decision on solution approach.**

Once decided, I will:
1. Implement the chosen solution
2. Verify with tests
3. Complete Task 2.4
4. Move to Phase 3.2 (Full test suite)
