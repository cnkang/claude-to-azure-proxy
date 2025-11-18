# Testing Data Test IDs

## Overview

This document defines the `data-testid` attributes used throughout the application for E2E testing. Using consistent test IDs makes tests more stable and maintainable.

## Why Use data-testid?

1. **Stability**: Tests don't break when CSS classes or text content changes
2. **Clarity**: Clear intent that element is meant for testing
3. **Performance**: Faster selector queries than complex CSS selectors
4. **Maintainability**: Easy to find and update test selectors

## Naming Convention

Format: `{component}-{element}-{action?}`

Examples:
- `app-container` - Main app container
- `conversation-item` - Individual conversation in list
- `conversation-title` - Conversation title text
- `conversation-edit-button` - Button to edit conversation
- `search-input` - Search input field
- `search-results` - Search results container

## Required Test IDs

### App Layout

| Element | Test ID | Component | Purpose |
|---------|---------|-----------|---------|
| Main app container | `app-container` | App.tsx | Wait for app ready |
| Loading spinner | `loading-spinner` | App.tsx | Wait for loading complete |
| Sidebar | `sidebar` | Sidebar.tsx | Sidebar interactions |
| Main content | `main-content` | AppLayout.tsx | Content area |

### Conversation List (Sidebar)

| Element | Test ID | Component | Purpose |
|---------|---------|-----------|---------|
| New conversation button | `new-conversation-button` | Sidebar.tsx | Create new conversation |
| Conversations list | `conversations-list` | Sidebar.tsx | List container |
| Conversation item | `conversation-item-{id}` | Sidebar.tsx | Individual conversation |
| Conversation title | `conversation-title-{id}` | Sidebar.tsx | Conversation title |
| Conversation options | `conversation-options-{id}` | Sidebar.tsx | Options menu button |
| Rename button | `conversation-rename-{id}` | Sidebar.tsx | Rename action |
| Delete button | `conversation-delete-{id}` | Sidebar.tsx | Delete action |
| Title input | `conversation-title-input` | Sidebar.tsx | Title editing input |

### Search

| Element | Test ID | Component | Purpose |
|---------|---------|-----------|---------|
| Search input | `search-input` | ConversationSearch.tsx | Search input field |
| Search results | `search-results` | ConversationSearch.tsx | Results container |
| Search result item | `search-result-{id}` | SearchResultItem.tsx | Individual result |
| Search pagination | `search-pagination` | SearchPagination.tsx | Pagination controls |
| No results message | `search-no-results` | ConversationSearch.tsx | Empty state |

### Chat Interface

| Element | Test ID | Component | Purpose |
|---------|---------|-----------|---------|
| Chat container | `chat-container` | ChatInterface.tsx | Main chat area |
| Message list | `message-list` | ChatInterface.tsx | Messages container |
| Message item | `message-{id}` | ChatInterface.tsx | Individual message |
| Message input | `message-input` | ChatInterface.tsx | Input field |
| Send button | `send-button` | ChatInterface.tsx | Send message |

### Dialogs

| Element | Test ID | Component | Purpose |
|---------|---------|-----------|---------|
| Confirm dialog | `confirm-dialog` | ConfirmDialog.tsx | Confirmation dialog |
| Confirm button | `confirm-button` | ConfirmDialog.tsx | Confirm action |
| Cancel button | `cancel-button` | ConfirmDialog.tsx | Cancel action |

## Implementation Checklist

### Priority 1: Critical for Browser Compatibility Tests

- [x] `app-container` - App.tsx
- [ ] `conversation-item-{id}` - Sidebar.tsx
- [ ] `conversation-title-{id}` - Sidebar.tsx
- [ ] `conversation-options-{id}` - Sidebar.tsx
- [ ] `conversation-title-input` - Sidebar.tsx
- [ ] `search-input` - ConversationSearch.tsx
- [ ] `search-results` - ConversationSearch.tsx
- [ ] `confirm-dialog` - ConfirmDialog.tsx
- [ ] `confirm-button` - ConfirmDialog.tsx

### Priority 2: Important for Other Tests

- [ ] `loading-spinner` - App.tsx
- [ ] `sidebar` - Sidebar.tsx
- [ ] `new-conversation-button` - Sidebar.tsx
- [ ] `conversations-list` - Sidebar.tsx
- [ ] `search-result-{id}` - SearchResultItem.tsx
- [ ] `search-pagination` - SearchPagination.tsx
- [ ] `search-no-results` - ConversationSearch.tsx

### Priority 3: Nice to Have

- [ ] `main-content` - AppLayout.tsx
- [ ] `chat-container` - ChatInterface.tsx
- [ ] `message-list` - ChatInterface.tsx
- [ ] `message-{id}` - ChatInterface.tsx
- [ ] `message-input` - ChatInterface.tsx
- [ ] `send-button` - ChatInterface.tsx

## Usage in Tests

### Before (Fragile)
```typescript
// Bad: Relies on CSS classes and text content
await page.waitForSelector('.conversation-list-item:has-text("My Conversation")');
await page.click('button[aria-label*="Rename"]');
```

### After (Stable)
```typescript
// Good: Uses stable test IDs
await page.waitForSelector('[data-testid="conversation-item-123"]');
await page.click('[data-testid="conversation-rename-123"]');
```

## Migration Plan

1. **Phase 1**: Add test IDs to critical components (Sidebar, Search)
2. **Phase 2**: Update test helpers to use test IDs
3. **Phase 3**: Run browser compatibility tests to verify
4. **Phase 4**: Add remaining test IDs for comprehensive coverage

## Best Practices

1. **Always use data-testid for interactive elements**
   - Buttons, inputs, links, form controls

2. **Include IDs in dynamic content**
   - Use `data-testid="element-{id}"` for list items

3. **Keep test IDs stable**
   - Don't change test IDs without updating tests
   - Document changes in this file

4. **Use semantic names**
   - `conversation-edit-button` not `button-1`
   - `search-input` not `input-field`

5. **Avoid test IDs in production**
   - Consider stripping in production builds
   - Or keep them - they're harmless and useful for debugging

## Example Implementation

```tsx
// Sidebar.tsx
<li 
  key={conversation.id} 
  className="conversation-item"
  data-testid={`conversation-item-${conversation.id}`}
>
  <button
    className="conversation-button"
    data-testid={`conversation-button-${conversation.id}`}
    onClick={() => handleSelect(conversation.id)}
  >
    <div 
      className="conversation-title"
      data-testid={`conversation-title-${conversation.id}`}
    >
      {conversation.title}
    </div>
  </button>
  
  <button
    className="conversation-action"
    data-testid={`conversation-options-${conversation.id}`}
    onClick={(e) => handleOptions(e, conversation.id)}
  >
    ⋯
  </button>
</li>
```

## Verification

After adding test IDs, verify with:

```bash
# Check if test IDs are present
grep -r "data-testid" apps/frontend/src/components/

# Run browser compatibility tests
pnpm exec playwright test --config=playwright.config.manual.ts tests/e2e/browser-compatibility.spec.ts
```

## References

- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Testing Library - data-testid](https://testing-library.com/docs/queries/bytestid/)
- [React Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
