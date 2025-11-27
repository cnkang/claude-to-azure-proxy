# Bug Analysis Report

## Investigation Date
2025-11-24

## Issues Identified

### Issue 1: Data Integrity Check on Page Load ✅ CONFIRMED
**Status**: Critical Bug
**Severity**: High

**Description**:
When the page loads (or refreshes), a "Data Integrity Check" dialog appears reporting "2 corrupted conversations".

**Root Cause**:
- All conversations in IndexedDB have empty `encryptedData.data` objects (`{}`)
- The data integrity service detects these as corrupted because the encrypted data is empty
- Database: `claude-proxy-storage`
- Affected conversations: 6 out of 6 total conversations

**Evidence**:
```json
{
  "id": "1f155b9b-ed15-4878-9b20-1adb5ce6fe16",
  "sessionId": "session_1763954382003_65ehsn_6a5932f56ff7b8a4bf2e4074cecaed55",
  "createdAt": 1763954710576,
  "updatedAt": 1763955079744,
  "encryptedData": {
    "data": {},  // ❌ Empty object - should contain encrypted data
    "iv": {},    // ❌ Empty object - should contain initialization vector
    "compressed": false,
    "timestamp": 1763955079754
  }
}
```

**Impact**:
- Poor user experience on every page load
- Users see alarming "corrupted data" warnings
- May cause users to lose trust in the application

**Possible Causes**:
1. Encryption service not properly encrypting data before storage
2. Storage service not properly handling encrypted data
3. Migration issue from previous storage format
4. Session key management issue

---

### Issue 2: First Conversation Dropdown Menu Not Responding ✅ FIXED
**Status**: ✅ RESOLVED
**Severity**: Medium (UX Issue)

**Description**:
When there is only one conversation in the list, clicking the dropdown menu (⋯) button causes the menu to appear but in the wrong position (too narrow and misaligned).

**Root Cause**:
A global accessibility CSS rule for touch targets was overriding the dropdown menu's `min-width`:

```css
button, input, textarea, select, a, [role="button"], [role="link"], [tabindex] {
  minWidth: 44px
}
```

Since the dropdown menu has `role="menu"` and `tabindex="-1"`, it matched this rule, which overrode the intended `min-width: 180px` from `.dropdown-menu`, causing the menu to be only 44px wide instead of 180px. This made the positioning calculation incorrect.

**Investigation Results**:
- ✅ Menu button is clickable
- ✅ Menu opens with correct options
- ❌ Menu width was 44px instead of 180px
- ❌ Menu position was incorrect (left: 302px instead of expected left: 170px)

**Impact**:
- Menu appears but is too narrow and positioned incorrectly
- Poor user experience, especially with only one conversation
- Menu items may be truncated or hard to read

---

### Issue 3: Delete Confirmation Dialog Obscured ✅ CONFIRMED
**Status**: Critical Bug
**Severity**: High (Accessibility & UX Issue)

**Description**:
When clicking "删除对话" (Delete Conversation), the confirmation dialog appears but is partially obscured by the sidebar.

**Root Cause**:
The `ConfirmDialog` component is rendered **inside** the `<aside>` (sidebar) element, which creates a stacking context issue:

```tsx
// apps/frontend/src/components/layout/Sidebar.tsx (line 677-685)
<aside className="sidebar">
  {/* ... sidebar content ... */}
  
  {/* ❌ Dialog rendered inside sidebar */}
  <ConfirmDialog
    isOpen={deleteConfirmOpen}
    title={t('sidebar.confirmDelete')}
    message={t('sidebar.confirmDeleteMessage')}
    confirmLabel={t('common.delete')}
    cancelLabel={t('common.cancel')}
    onConfirm={handleDeleteConfirm}
    onCancel={handleDeleteCancel}
    variant="danger"
  />
</aside>
```

**Z-Index Analysis**:
- `confirm-dialog-overlay`: z-index 2000 ✅
- `confirm-dialog`: z-index 1000 ✅
- `sidebar`: z-index 1 ✅
- **Problem**: Dialog is inside sidebar's DOM hierarchy, so it's constrained by sidebar's stacking context

**Visual Evidence**:
The dialog appears in the center of the viewport but is partially covered by the left sidebar, making it difficult to read and interact with.

**Impact**:
- Poor user experience
- Accessibility violation (WCAG 2.2 AAA)
- Users may not be able to see or interact with the confirmation dialog
- Critical action (delete) is obscured

**Solution**:
Move the `ConfirmDialog` to be rendered at the root level (outside sidebar), using React Portal or by lifting the state to a parent component.

---

## Priority Ranking

1. **Issue 3** (Delete Dialog Obscured) - High Priority
   - Blocks critical user action
   - Accessibility violation
   - Easy to fix with React Portal

2. **Issue 1** (Data Integrity Check) - High Priority
   - Affects all users on every page load
   - Requires investigation of encryption/storage layer
   - May indicate data loss risk

3. **Issue 2** (Dropdown Not Responding) - Low Priority
   - Cannot reproduce
   - May be resolved already
   - Monitor for future reports

---

## Recommended Fixes

### Fix for Issue 3 (Immediate)
1. Use React Portal to render `ConfirmDialog` at document root
2. Alternative: Move dialog state to parent component (App.tsx)
3. Test with different viewport sizes

### Fix for Issue 1 (Investigation Required)
1. Check encryption service implementation
2. Verify storage service properly handles encrypted data
3. Add migration script if needed
4. Add better error handling for encryption failures
5. Consider adding data validation before storage

---

## Files to Modify

### Issue 3:
- `apps/frontend/src/components/layout/Sidebar.tsx`
- `apps/frontend/src/components/common/ConfirmDialog.tsx` (possibly)

### Issue 1:
- `apps/frontend/src/services/storage.ts`
- `apps/frontend/src/services/encryption.ts` (if exists)
- `apps/frontend/src/services/data-integrity.ts`

---

## Testing Checklist

### Issue 3:
- [ ] Dialog appears centered and fully visible
- [ ] Dialog is not obscured by sidebar
- [ ] Dialog works on mobile viewport
- [ ] Dialog works with sidebar open/closed
- [ ] Keyboard navigation works (Tab, Escape)
- [ ] Screen reader announces dialog correctly

### Issue 1:
- [ ] New conversations save with proper encrypted data
- [ ] Existing conversations can be decrypted
- [ ] No integrity warnings on fresh page load
- [ ] Data persists across sessions
- [ ] Encryption keys are properly managed
