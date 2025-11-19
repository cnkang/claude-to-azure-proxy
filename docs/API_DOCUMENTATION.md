# API Documentation - Conversation Persistence

## Overview

This document provides comprehensive documentation for all public APIs related to conversation
persistence, search, cross-tab synchronization, and data integrity.

## Table of Contents

- [ConversationStorage](#conversationstorage)
- [CrossTabSyncService](#crosstabsyncservice)
- [DataIntegrityService](#dataintegrityservice)
- [ConversationSearchService](#conversationsearchservice)
- [Custom Hooks](#custom-hooks)
- [UI Components](#ui-components)
- [Type Definitions](#type-definitions)

## ConversationStorage

### Overview

Provides secure local storage for conversation data using IndexedDB with Web Crypto API encryption,
data compression, and fallback to localStorage when IndexedDB is unavailable.

**Location**: `apps/frontend/src/services/storage.ts`

### Public Methods

#### `getInstance(): ConversationStorage`

Get singleton instance of ConversationStorage.

**Returns**: `ConversationStorage` - The singleton instance

**Example**:

```typescript
const storage = ConversationStorage.getInstance();
```

---

#### `initialize(): Promise<void>`

Initialize the storage system. Must be called before using any other methods.

**Throws**: `Error` - If initialization fails

**Example**:

```typescript
await storage.initialize();
```

---

#### `storeConversation(conversation: Conversation): Promise<void>`

Store conversation in IndexedDB or localStorage fallback.

**Parameters**:

- `conversation: Conversation` - The conversation to store

**Throws**: `Error` - If storage operation fails

**Example**:

```typescript
await storage.storeConversation(conversation);
```

---

#### `getConversation(conversationId: string): Promise<Conversation | null>`

Retrieve conversation from storage.

**Parameters**:

- `conversationId: string` - ID of the conversation to retrieve

**Returns**: `Promise<Conversation | null>` - The conversation or null if not found

**Example**:

```typescript
const conversation = await storage.getConversation('conv-123');
```

---

#### `getAllConversations(): Promise<Conversation[]>`

Get all conversations for current session.

**Returns**: `Promise<Conversation[]>` - Array of all conversations

**Example**:

```typescript
const conversations = await storage.getAllConversations();
```

---

#### `updateConversationTitle(conversationId: string, newTitle: string): Promise<void>`

Update conversation title with atomic operation and validation.

**Requirements**: 1.1, 1.2, 1.3, 1.5

**Features**:

- Atomic transaction using IndexedDB
- Input validation (1-200 characters)
- XSS prevention through sanitization
- Encryption before storage
- Performance tracking (<500ms target)

**Parameters**:

- `conversationId: string` - ID of the conversation to update
- `newTitle: string` - New title for the conversation (1-200 characters)

**Throws**:

- `Error` - If validation fails (title length invalid)
- `Error` - If conversation not found
- `Error` - If storage operation fails

**Example**:

```typescript
await storage.updateConversationTitle('conv-123', 'New Title');
```

---

#### `deleteConversation(conversationId: string): Promise<DeleteResult>`

Delete conversation with complete cleanup of all associated data.

**Requirements**: 2.1, 2.2, 2.3, 2.4, 2.5

**Features**:

- Removes conversation record
- Removes all associated messages
- Removes all metadata
- Returns detailed statistics
- Atomic operation
- Performance tracking (<500ms target)

**Parameters**:

- `conversationId: string` - ID of the conversation to delete

**Returns**: `Promise<DeleteResult>` - Detailed deletion statistics

**DeleteResult Interface**:

```typescript
interface DeleteResult {
  success: boolean;
  conversationRemoved: boolean;
  messagesRemoved: number;
  metadataRemoved: boolean;
  bytesFreed: number;
  error?: string;
}
```

**Example**:

```typescript
const result = await storage.deleteConversation('conv-123');
console.log(`Freed ${result.bytesFreed} bytes`);
console.log(`Removed ${result.messagesRemoved} messages`);
```

---

#### `getStorageQuota(): Promise<StorageQuota>`

Get storage quota information.

**Returns**: `Promise<StorageQuota>` - Storage quota details

**StorageQuota Interface**:

```typescript
interface StorageQuota {
  used: number; // Bytes used
  quota: number; // Total quota in bytes
  percentage: number; // Percentage used (0-100)
  available: number; // Bytes available
}
```

**Example**:

```typescript
const quota = await storage.getStorageQuota();
if (quota.percentage > 80) {
  console.warn('Storage is 80% full');
}
```

---

#### `getStorageStats(): Promise<StorageStats>`

Get comprehensive storage statistics.

**Returns**: `Promise<StorageStats>` - Storage statistics

**StorageStats Interface**:

```typescript
interface StorageStats {
  conversationCount: number;
  messageCount: number;
  totalSize: number;
  oldestConversation?: Date;
  newestConversation?: Date;
  quota: StorageQuota;
}
```

**Example**:

```typescript
const stats = await storage.getStorageStats();
console.log(`${stats.conversationCount} conversations`);
console.log(`${stats.messageCount} messages`);
```

---

#### `isCleanupNeeded(): Promise<boolean>`

Check if storage cleanup is needed (>80% full).

**Returns**: `Promise<boolean>` - True if cleanup needed

**Example**:

```typescript
if (await storage.isCleanupNeeded()) {
  await storage.performCleanup();
}
```

---

#### `performCleanup(): Promise<CleanupResult>`

Perform storage cleanup by removing old conversations.

**Returns**: `Promise<CleanupResult>` - Cleanup statistics

**CleanupResult Interface**:

```typescript
interface CleanupResult {
  conversationsRemoved: number;
  messagesRemoved: number;
  bytesFreed: number;
  success: boolean;
  error?: string;
}
```

**Example**:

```typescript
const result = await storage.performCleanup();
console.log(`Cleaned up ${result.conversationsRemoved} conversations`);
```

---

#### `clearAllData(): Promise<void>`

Clear all storage data for current session.

**Warning**: This is destructive and cannot be undone.

**Example**:

```typescript
await storage.clearAllData();
```

---

#### `exportData(): Promise<string>`

Export all conversation data as JSON string.

**Returns**: `Promise<string>` - JSON string of all conversations

**Example**:

```typescript
const json = await storage.exportData();
const blob = new Blob([json], { type: 'application/json' });
// Download or save blob
```

---

## CrossTabSyncService

### Overview

Provides real-time synchronization of conversation changes across browser tabs using the Storage
Event API.

**Location**: `apps/frontend/src/services/cross-tab-sync.ts`

**Requirements**: 4.1, 4.2, 4.3, 4.4, 4.5

### Public Methods

#### `getInstance(): CrossTabSyncService`

Get singleton instance of CrossTabSyncService.

**Returns**: `CrossTabSyncService` - The singleton instance

**Example**:

```typescript
const syncService = CrossTabSyncService.getInstance();
```

---

#### `initialize(): void`

Initialize cross-tab synchronization. Sets up storage event listeners.

**Example**:

```typescript
syncService.initialize();
```

---

#### `broadcastUpdate(conversationId: string, updates: Partial<Conversation>): void`

Broadcast conversation update to other tabs.

**Parameters**:

- `conversationId: string` - ID of the updated conversation
- `updates: Partial<Conversation>` - The updates to broadcast

**Example**:

```typescript
syncService.broadcastUpdate('conv-123', { title: 'New Title' });
```

---

#### `broadcastDeletion(conversationId: string): void`

Broadcast conversation deletion to other tabs.

**Parameters**:

- `conversationId: string` - ID of the deleted conversation

**Example**:

```typescript
syncService.broadcastDeletion('conv-123');
```

---

#### `broadcastCreation(conversationId: string): void`

Broadcast new conversation creation to other tabs.

**Parameters**:

- `conversationId: string` - ID of the new conversation

**Example**:

```typescript
syncService.broadcastCreation('conv-123');
```

---

#### `subscribe(eventType: SyncEventType, listener: SyncListener): () => void`

Subscribe to sync events from other tabs.

**Parameters**:

- `eventType: SyncEventType` - Type of event ('update' | 'delete' | 'create')
- `listener: SyncListener` - Callback function

**Returns**: `() => void` - Unsubscribe function

**Example**:

```typescript
const unsubscribe = syncService.subscribe('update', (event) => {
  console.log(`Conversation ${event.conversationId} updated in another tab`);
  // Update local state
});

// Later: unsubscribe()
```

---

#### `destroy(): void`

Clean up resources and remove event listeners.

**Example**:

```typescript
syncService.destroy();
```

---

### Type Definitions

```typescript
type SyncEventType = 'update' | 'delete' | 'create';

interface SyncEvent {
  type: SyncEventType;
  conversationId: string;
  data?: Partial<Conversation>;
  timestamp: number;
  sourceTabId: string;
}

type SyncListener = (event: SyncEvent) => void;
```

---

## DataIntegrityService

### Overview

Provides data integrity checking, orphan detection, and automatic repair mechanisms.

**Location**: `apps/frontend/src/services/data-integrity.ts`

**Requirements**: 3.3, 5.1, 5.2, 5.3, 5.4, 5.5

### Public Methods

#### `constructor(storage: ConversationStorage)`

Create a new DataIntegrityService instance.

**Parameters**:

- `storage: ConversationStorage` - The storage instance to check

**Example**:

```typescript
const integrityService = new DataIntegrityService(storage);
```

---

#### `runStartupCheck(): Promise<IntegrityReport>`

Run comprehensive integrity check on application startup.

**Returns**: `Promise<IntegrityReport>` - Detailed integrity report

**IntegrityReport Interface**:

```typescript
interface IntegrityReport {
  totalConversations: number;
  orphanedMessages: number;
  corruptedConversations: number;
  missingReferences: number;
  recommendations: string[];
  timestamp: Date;
}
```

**Example**:

```typescript
const report = await integrityService.runStartupCheck();
if (report.orphanedMessages > 0) {
  console.warn(`Found ${report.orphanedMessages} orphaned messages`);
}
```

---

#### `detectOrphanedMessages(): Promise<string[]>`

Detect messages without parent conversation.

**Returns**: `Promise<string[]>` - Array of orphaned message IDs

**Example**:

```typescript
const orphanIds = await integrityService.detectOrphanedMessages();
console.log(`Found ${orphanIds.length} orphaned messages`);
```

---

#### `cleanupOrphanedMessages(messageIds: string[]): Promise<number>`

Clean up orphaned messages.

**Parameters**:

- `messageIds: string[]` - Array of message IDs to clean up

**Returns**: `Promise<number>` - Number of messages cleaned up

**Example**:

```typescript
const orphanIds = await integrityService.detectOrphanedMessages();
const cleaned = await integrityService.cleanupOrphanedMessages(orphanIds);
console.log(`Cleaned up ${cleaned} orphaned messages`);
```

---

## ConversationSearchService

### Overview

Provides full-text search across conversations and messages with keyword highlighting, pagination,
and performance optimization.

**Location**: `apps/frontend/src/services/conversation-search.ts`

**Requirements**: 8.1-8.15

### Public Methods

#### `constructor(storage: ConversationStorage)`

Create a new ConversationSearchService instance.

**Parameters**:

- `storage: ConversationStorage` - The storage instance to search

**Example**:

```typescript
const searchService = new ConversationSearchService(storage);
```

---

#### `initialize(): Promise<void>`

Initialize search service and build search index.

**Example**:

```typescript
await searchService.initialize();
```

---

#### `search(query: string, options?: SearchOptions): Promise<SearchResponse>`

Search conversations by keyword with pagination.

**Parameters**:

- `query: string` - Search query
- `options?: SearchOptions` - Search options

**SearchOptions Interface**:

```typescript
interface SearchOptions {
  caseSensitive?: boolean; // Default: false
  page?: number; // Default: 0
  pageSize?: number; // Default: 20
  searchInTitles?: boolean; // Default: true
  searchInMessages?: boolean; // Default: true
  conversationIds?: string[]; // Limit to specific conversations
}
```

**Returns**: `Promise<SearchResponse>` - Search results with pagination

**SearchResponse Interface**:

```typescript
interface SearchResponse {
  results: SearchResult[];
  pagination: {
    currentPage: number;
    pageSize: number;
    totalResults: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  searchTime: number; // milliseconds
}
```

**Example**:

```typescript
const response = await searchService.search('authentication', {
  caseSensitive: false,
  page: 0,
  pageSize: 20,
});

console.log(`Found ${response.pagination.totalResults} results`);
console.log(`Search took ${response.searchTime}ms`);
```

---

#### `buildSearchIndex(): Promise<void>`

Build search index from all conversations.

**Example**:

```typescript
await searchService.buildSearchIndex();
```

---

#### `updateIndex(conversationId: string): Promise<void>`

Update search index when conversation changes.

**Parameters**:

- `conversationId: string` - ID of the changed conversation

**Example**:

```typescript
await searchService.updateIndex('conv-123');
```

---

#### `removeFromIndex(conversationId: string): Promise<void>`

Remove conversation from search index.

**Parameters**:

- `conversationId: string` - ID of the conversation to remove

**Example**:

```typescript
await searchService.removeFromIndex('conv-123');
```

---

### Type Definitions

```typescript
interface SearchResult {
  conversationId: string;
  conversationTitle: string;
  matches: SearchMatch[];
  totalMatches: number;
  relevanceScore: number;
}

interface SearchMatch {
  messageId: string;
  messageIndex: number;
  content: string;
  context: SearchContext;
  highlights: HighlightRange[];
  timestamp: Date;
  role: 'user' | 'assistant';
}

interface SearchContext {
  before: string;
  keyword: string;
  after: string;
  position: number;
}

interface HighlightRange {
  start: number;
  end: number;
  keyword: string;
}
```

---

## Custom Hooks

### useSearchWithPrefetch

Provides search with automatic prefetching and caching.

**Location**: `apps/frontend/src/hooks/useSearchWithPrefetch.ts`

**Parameters**:

- `searchService: ConversationSearchService` - The search service instance
- `options?: UseSearchWithPrefetchOptions` - Configuration options

**Returns**: `UseSearchWithPrefetchResult`

**Example**:

```typescript
const { searchWithPrefetch, clearCache, prefetchStatus } = useSearchWithPrefetch(searchService, {
  initialPages: 3,
  maxCacheSize: 100,
});

const results = await searchWithPrefetch('keyword', 0);
```

---

### useDebouncedTitle

Provides debounced title updates with automatic persistence.

**Location**: `apps/frontend/src/hooks/useDebouncedTitle.ts`

**Parameters**:

- `initialTitle: string` - Initial title value
- `config: DebouncedTitleConfig` - Configuration

**Returns**: `DebouncedTitleResult`

**Example**:

```typescript
const { title, setTitle, isPending, error } = useDebouncedTitle(conversation.title, {
  conversationId: conversation.id,
  debounceMs: 300,
  onSave: async (newTitle) => {
    await storage.updateConversationTitle(conversation.id, newTitle);
  },
});
```

---

## UI Components

### ConversationSearch

Main search interface component.

**Location**: `apps/frontend/src/components/search/ConversationSearch.tsx`

**Props**:

```typescript
interface ConversationSearchProps {
  onResultSelect?: (conversationId: string, messageId?: string) => void;
  onConversationChange?: () => void;
  className?: string;
}
```

**Features**:

- Debounced search input (300ms)
- Real-time result count
- Loading states
- Error handling
- Keyboard navigation
- WCAG 2.2 AAA compliant

**Example**:

```tsx
<ConversationSearch
  onResultSelect={(convId, msgId) => {
    openConversation(convId);
    if (msgId) scrollToMessage(msgId);
  }}
  onConversationChange={() => {
    // Invalidate cache
  }}
/>
```

---

### SearchResultItem

Individual search result display.

**Location**: `apps/frontend/src/components/search/SearchResultItem.tsx`

**Props**:

```typescript
interface SearchResultItemProps {
  result: SearchResult;
  query: string;
  isFocused: boolean;
  onSelect: () => void;
}
```

**Features**:

- Keyword highlighting
- Context display
- Match count
- Timestamp
- Keyboard activation

**Example**:

```tsx
<SearchResultItem
  result={result}
  query="authentication"
  isFocused={index === focusedIndex}
  onSelect={() => handleSelect(result)}
/>
```

---

### SearchPagination

Accessible pagination controls.

**Location**: `apps/frontend/src/components/search/SearchPagination.tsx`

**Props**:

```typescript
interface SearchPaginationProps {
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onPageChange: (page: number) => void;
  maxPageButtons?: number;
}
```

**Features**:

- Previous/Next buttons
- Page number navigation
- ARIA labels
- Keyboard support
- Disabled state handling

**Example**:

```tsx
<SearchPagination
  currentPage={0}
  totalPages={10}
  hasNextPage={true}
  hasPreviousPage={false}
  onPageChange={(page) => setCurrentPage(page)}
  maxPageButtons={5}
/>
```

---

## Type Definitions

### Core Types

```typescript
interface Conversation {
  id: string;
  title: string;
  selectedModel: string;
  createdAt: Date;
  updatedAt: Date;
  sessionId: string;
  messages: Message[];
  isStreaming: boolean;
  modelHistory: ModelChange[];
  contextUsage: ContextUsage;
  compressionHistory: CompressionEvent[];

  // Persistence tracking
  lastSyncedAt?: Date;
  syncVersion?: number;
  isDirty?: boolean;
  persistenceStatus?: 'synced' | 'pending' | 'error';
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  model?: string;
  tokens?: number;
}
```

---

## Performance Targets

| Operation       | Target Latency (95th percentile) |
| --------------- | -------------------------------- |
| Title Update    | <500ms                           |
| Deletion        | <500ms                           |
| Search          | <500ms                           |
| Cross-Tab Sync  | <1000ms                          |
| Integrity Check | <5000ms                          |

---

## Error Handling

### Error Types

```typescript
enum PersistenceErrorType {
  STORAGE_FULL = 'storage_full',
  ENCRYPTION_FAILED = 'encryption_failed',
  WRITE_FAILED = 'write_failed',
  READ_FAILED = 'read_failed',
  VALIDATION_FAILED = 'validation_failed',
  CONFLICT = 'conflict',
  CORRUPTED_DATA = 'corrupted_data',
  NETWORK_ERROR = 'network_error'
}

class PersistenceError extends Error {
  constructor(
    public readonly type: PersistenceErrorType,
    message: string,
    public readonly conversationId?: string,
    public readonly retryable: boolean = false
  );
}
```

### Error Recovery

All persistence operations include:

- Automatic retry with exponential backoff (up to 3 attempts)
- Error classification (retryable vs. non-retryable)
- User-friendly error messages
- Correlation IDs for debugging
- Detailed logging

---

## Security

### Encryption

- **Algorithm**: AES-GCM 256-bit
- **Key Management**: Session-based (cleared on tab close)
- **IV Generation**: Cryptographically secure random
- **API**: Web Crypto API (native browser)

### Input Validation

- **Title Length**: 1-200 characters
- **XSS Prevention**: HTML tag removal and sanitization
- **Session Validation**: Conversation ownership verification
- **Type Checking**: Strict TypeScript types

---

## Best Practices

### Storage Usage

1. **Initialize Once**: Call `initialize()` once at app startup
2. **Check Quota**: Monitor storage usage regularly
3. **Cleanup**: Run cleanup when >80% full
4. **Export**: Provide export functionality for users

### Search Usage

1. **Build Index**: Initialize search service early
2. **Update Index**: Keep index in sync with storage
3. **Debounce Input**: Use 300ms debounce for search input
4. **Cache Results**: Leverage prefetching for better UX

### Cross-Tab Sync

1. **Subscribe Early**: Set up listeners at app startup
2. **Broadcast Changes**: Always broadcast after local updates
3. **Handle Conflicts**: Trust timestamp-based resolution
4. **Clean Up**: Destroy service on unmount

### Data Integrity

1. **Startup Check**: Run integrity check on app load
2. **Auto Repair**: Enable automatic repair when safe
3. **Log Issues**: Always log integrity problems
4. **User Notification**: Inform users of data issues

---

## Migration Guide

### From v1.x to v2.0

**Breaking Changes**:

1. `deleteConversation()` now returns `DeleteResult` instead of `void`
2. `updateConversationTitle()` requires title length 1-200 characters
3. Search service requires explicit initialization

**Migration Steps**:

```typescript
// Old
await storage.deleteConversation(id);

// New
const result = await storage.deleteConversation(id);
console.log(`Freed ${result.bytesFreed} bytes`);
```

---

## Troubleshooting

### Common Issues

**Storage Full**:

```typescript
if (await storage.isCleanupNeeded()) {
  await storage.performCleanup();
}
```

**Orphaned Data**:

```typescript
const service = new DataIntegrityService(storage);
const report = await service.runStartupCheck();
if (report.orphanedMessages > 0) {
  const orphans = await service.detectOrphanedMessages();
  await service.cleanupOrphanedMessages(orphans);
}
```

**Search Not Working**:

```typescript
await searchService.buildSearchIndex();
```

---

## Support

For issues, questions, or feature requests:

- GitHub Issues: [Link]
- Documentation: [Link]
- Email: support@example.com

---

**Last Updated**: 2024-01-15 **Version**: 2.0.0
