# Claude-to-Azure Proxy Frontend

React frontend for the Claude-to-Azure OpenAI proxy service.

## Tech Stack

- **React 19.2** - Modern React with latest features
- **TypeScript 5.3+** - Type safety and developer experience
- **Vite** - Fast build tool and development server
- **i18next** - Internationalization (English and Chinese)
- **React Router DOM** - Client-side routing
- **Vitest + happy-dom** - Testing framework with fast DOM environment
- **ESLint + Prettier** - Code quality and formatting

## Development

### Prerequisites

- Node.js 24+
- pnpm 10.19.0+

### Setup

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

### Code Quality

```bash
# Type checking
pnpm type-check

# Linting
pnpm lint
pnpm lint:fix

# Formatting
pnpm format
pnpm format:check

# Testing
pnpm test
pnpm test:watch
pnpm test:coverage
```

## Project Structure

```
src/
├── components/     # Reusable UI components
├── pages/         # Page components
├── hooks/         # Custom React hooks
├── utils/         # Utility functions
├── types/         # TypeScript type definitions
├── contexts/      # React contexts
├── i18n/          # Internationalization
├── test/          # Test utilities and setup
└── assets/        # Static assets
```

## Features

- 🌐 Internationalization (English/Chinese)
- 🎨 Dark/Light theme with system preference detection
- 📱 Responsive design (mobile-first)
- ♿ WCAG 2.2 AAA accessibility compliance
- 🔒 Security-first approach
- 🚀 Performance optimized
- 🧪 Comprehensive testing
- 💾 **Robust Conversation Persistence** - Atomic operations with encryption
- 🔄 **Cross-Tab Synchronization** - Real-time updates across browser tabs
- 🔍 **Full-Text Search** - Fast local search with keyword highlighting
- 🛡️ **Data Integrity** - Automatic orphan detection and cleanup
- ⚡ **Performance Monitoring** - Built-in metrics and profiling

## Conversation Persistence

### Overview

The application features a sophisticated conversation persistence system that ensures your conversations are safely stored and synchronized across browser tabs.

### Key Features

#### Atomic Title Updates
- **Instant UI Updates**: Changes appear immediately with optimistic updates
- **Automatic Persistence**: Title changes are saved within 500ms
- **Input Validation**: Titles are validated (1-200 characters) and sanitized for security
- **Error Recovery**: Automatic rollback on failure with retry logic

```typescript
// Example: Update conversation title
const { renameConversation } = useConversations();
await renameConversation(conversationId, 'New Title');
```

#### Complete Deletion Cleanup
- **Thorough Removal**: Deletes conversation, messages, and all metadata
- **No Orphaned Data**: Ensures complete cleanup from storage
- **Detailed Statistics**: Returns bytes freed and items removed
- **Automatic Verification**: Post-deletion integrity check

```typescript
// Example: Delete conversation
const { deleteConversation } = useConversations();
await deleteConversation(conversationId);
```

#### Cross-Tab Synchronization
- **Real-Time Updates**: Changes propagate to all open tabs within 1 second
- **Conflict Resolution**: Timestamp-based resolution for concurrent updates
- **Event Broadcasting**: Uses Storage Event API for efficient communication
- **Automatic Sync**: No manual refresh needed

```typescript
// Synchronization happens automatically
// All tabs stay in sync without user intervention
```

#### Data Integrity
- **Startup Checks**: Automatic integrity verification on app load
- **Orphan Detection**: Finds and cleans up orphaned messages
- **Corruption Repair**: Attempts to repair corrupted data
- **Detailed Reports**: Provides comprehensive integrity reports

```typescript
// Integrity checks run automatically on startup
// Manual check available via DataIntegrityService
const service = new DataIntegrityService(storage);
const report = await service.runStartupCheck();
```

### Storage Architecture

#### IndexedDB with localStorage Fallback
- **Primary**: IndexedDB for high-performance structured storage
- **Fallback**: localStorage when IndexedDB unavailable
- **Automatic Detection**: Seamless fallback without user intervention
- **Unified API**: Same interface regardless of backend

#### Encryption & Security
- **AES-GCM 256-bit**: Industry-standard encryption for all data
- **Web Crypto API**: Native browser encryption (no external libraries)
- **Session-Based Keys**: Keys cleared on tab close for security
- **XSS Prevention**: Input sanitization and validation

#### Performance Optimization
- **Debounced Updates**: 300ms debounce on title changes
- **Batch Operations**: Multiple updates in single transaction
- **Lazy Loading**: Messages loaded only when needed
- **Compression**: Automatic compression for large data

### Error Handling

#### Retry Logic
- **Exponential Backoff**: 500ms base delay, up to 3 attempts
- **Smart Classification**: Distinguishes retryable vs. non-retryable errors
- **User Feedback**: Clear error messages with recovery suggestions

#### Error Types
- `STORAGE_FULL`: Storage quota exceeded
- `ENCRYPTION_FAILED`: Encryption/decryption error
- `WRITE_FAILED`: Write operation failed
- `VALIDATION_FAILED`: Input validation error
- `CONFLICT`: Concurrent update conflict

### Performance Metrics

The system tracks and reports:
- **Title Update Latency**: Target <500ms (95th percentile)
- **Deletion Latency**: Target <500ms (95th percentile)
- **Cross-Tab Sync Latency**: Target <1000ms (95th percentile)
- **Integrity Check Duration**: Target <5000ms
- **Storage Usage**: Quota monitoring and warnings

## Conversation Search

### Overview

Full-text search across all conversations and messages with keyword highlighting, pagination, and WCAG 2.2 AAA accessibility compliance.

### Key Features

#### Fast Local Search
- **Sub-500ms Results**: Search completes within 500ms
- **Full-Text Index**: In-memory index for instant results
- **Case-Insensitive**: Default case-insensitive with case-sensitive option
- **Multi-Keyword**: Supports multiple search terms

```typescript
// Example: Search conversations
const searchService = new ConversationSearchService(storage);
await searchService.initialize();

const results = await searchService.search('keyword', {
  caseSensitive: false,
  page: 0,
  pageSize: 20
});
```

#### Keyword Highlighting
- **Visual Highlighting**: Keywords highlighted in yellow
- **Context Display**: Shows 100 characters before/after keyword
- **Multiple Occurrences**: All matches highlighted in conversation
- **Navigation Controls**: Jump between keyword occurrences

#### Pagination
- **20 Results Per Page**: Configurable page size
- **Prefetching**: First 3 pages loaded immediately
- **Lazy Loading**: Additional pages loaded on demand
- **Page Navigation**: Previous/Next buttons and page numbers

#### Search UI Components

##### ConversationSearch
Main search interface with:
- Debounced search input (300ms)
- Real-time result count and search time
- Loading states and error handling
- Keyboard navigation (Arrow keys, Enter, Escape)

##### SearchResultItem
Individual result display with:
- Conversation title with highlighting
- Match count and context preview
- Timestamp and role (user/assistant)
- Click to open and scroll to match

##### SearchPagination
Accessible pagination controls with:
- Current page and total pages
- Previous/Next buttons
- Page number quick navigation
- ARIA labels and keyboard support

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Open search |
| `Escape` | Clear search / Close |
| `ArrowDown` | Next result |
| `ArrowUp` | Previous result |
| `Enter` | Open selected result |
| `Home` | First result |
| `End` | Last result |
| `PageDown` | Next page |
| `PageUp` | Previous page |

### Search Performance

#### Prefetching Strategy
- **Initial Load**: First 3 pages (60 results) loaded immediately
- **Cache**: Results cached in memory for instant navigation
- **Invalidation**: Cache cleared on conversation changes
- **Background**: Additional pages prefetched in background

#### Index Maintenance
- **Automatic Updates**: Index updated on conversation changes
- **Incremental**: Only changed conversations re-indexed
- **Rebuild**: Full rebuild on corruption or startup
- **Consistency**: Always in sync with storage

### Accessibility (WCAG 2.2 AAA)

#### Visual Design
- **7:1 Contrast**: All text meets AAA contrast requirements
- **Focus Indicators**: 3px outline with 3:1 contrast
- **Color Independence**: Never rely on color alone
- **Responsive**: Works on all screen sizes

#### Keyboard Navigation
- **Full Keyboard Access**: All features accessible via keyboard
- **Logical Tab Order**: Intuitive navigation flow
- **No Keyboard Traps**: Can always escape with Escape key
- **Visible Focus**: Always know where you are

#### Screen Reader Support
- **ARIA Labels**: Comprehensive labeling for all elements
- **Live Regions**: Dynamic content announced
- **Semantic HTML**: Proper heading hierarchy and landmarks
- **Role Attributes**: Correct roles for all interactive elements

#### Motion & Animation
- **Reduced Motion**: Respects `prefers-reduced-motion`
- **Smooth Transitions**: Subtle animations when enabled
- **No Auto-Play**: User controls all animations

### Search Examples

#### Basic Search
```typescript
// Search for a keyword
const results = await searchService.search('authentication');
```

#### Case-Sensitive Search
```typescript
// Case-sensitive search
const results = await searchService.search('API', {
  caseSensitive: true
});
```

#### Paginated Search
```typescript
// Get second page of results
const results = await searchService.search('error', {
  page: 1,
  pageSize: 20
});
```

#### Search in Specific Conversations
```typescript
// Search only in specific conversations
const results = await searchService.search('bug', {
  conversationIds: ['conv-1', 'conv-2']
});
```

## Cross-Tab Synchronization

### How It Works

The application uses the Storage Event API to synchronize changes across browser tabs in real-time.

#### Event Types
- **Update**: Conversation title or content changed
- **Delete**: Conversation deleted
- **Create**: New conversation created

#### Conflict Resolution
- **Timestamp-Based**: Most recent change wins
- **Automatic**: No user intervention required
- **Logged**: All conflicts logged for debugging

#### Performance
- **Sub-1s Propagation**: Changes appear in other tabs within 1 second
- **Efficient**: Uses localStorage for event communication
- **Reliable**: Handles race conditions and concurrent updates

### Usage

Synchronization happens automatically. No code changes needed:

```typescript
// Tab 1: Update title
await renameConversation(id, 'New Title');

// Tab 2: Automatically receives update within 1 second
// UI updates automatically without refresh
```

## Data Integrity

### Automatic Checks

#### Startup Integrity Check
Runs automatically when app loads:
- Detects orphaned messages
- Finds corrupted conversations
- Identifies missing references
- Generates repair recommendations

#### Orphan Detection
Finds messages without parent conversation:
- Scans all messages in storage
- Checks for valid conversation references
- Reports orphaned message IDs
- Offers automatic cleanup

#### Corruption Repair
Attempts to repair corrupted data:
- Validates conversation schema
- Fixes invalid dates and fields
- Removes malformed data
- Logs all repairs

### Manual Operations

```typescript
// Run integrity check manually
const service = new DataIntegrityService(storage);
const report = await service.runStartupCheck();

console.log(`Orphaned messages: ${report.orphanedMessages}`);
console.log(`Corrupted conversations: ${report.corruptedConversations}`);

// Clean up orphaned messages
const orphanIds = await service.detectOrphanedMessages();
const cleaned = await service.cleanupOrphanedMessages(orphanIds);

console.log(`Cleaned ${cleaned} orphaned messages`);
```

## Performance Monitoring

### Built-in Metrics

The application tracks performance metrics for all persistence operations:

#### Tracked Operations
- Title updates
- Conversation deletions
- Search operations
- Cross-tab sync events
- Integrity checks

#### Metrics Collected
- **Latency**: Operation duration in milliseconds
- **Success Rate**: Percentage of successful operations
- **Error Rate**: Percentage of failed operations
- **Throughput**: Operations per second

### Accessing Metrics

```typescript
import { getPerformanceMetrics } from './utils/performance-metrics';

const metrics = getPerformanceMetrics();

console.log('Title Update Metrics:', metrics.titleUpdate);
console.log('Average Latency:', metrics.titleUpdate.averageLatency);
console.log('Success Rate:', metrics.titleUpdate.successRate);
```

### Performance Targets

| Operation | Target Latency (95th percentile) |
|-----------|----------------------------------|
| Title Update | <500ms |
| Deletion | <500ms |
| Search | <500ms |
| Cross-Tab Sync | <1000ms |
| Integrity Check | <5000ms |

## Troubleshooting

### Common Issues

#### Storage Full
**Symptom**: "Storage quota exceeded" error

**Solution**:
1. Check storage usage: `await storage.getStorageQuota()`
2. Run cleanup: `await storage.performCleanup()`
3. Export and delete old conversations

#### Orphaned Data
**Symptom**: Storage size larger than expected

**Solution**:
1. Run integrity check: `await integrityService.runStartupCheck()`
2. Clean up orphans: `await integrityService.cleanupOrphanedMessages()`

#### Sync Not Working
**Symptom**: Changes not appearing in other tabs

**Solution**:
1. Check browser console for errors
2. Verify localStorage is enabled
3. Check if tabs are from same origin
4. Restart all tabs

#### Search Not Finding Results
**Symptom**: Known conversations not appearing in search

**Solution**:
1. Rebuild search index: `await searchService.buildSearchIndex()`
2. Check for typos in search query
3. Try case-insensitive search
4. Verify conversations exist in storage

## Environment Variables

Copy `.env.example` to `.env` and configure:

- `VITE_API_BASE_URL` - Backend API URL
- `VITE_APP_TITLE` - Application title

## API Integration

The frontend communicates with the backend through:

- REST API endpoints for configuration and CRUD operations
- Server-Sent Events (SSE) for real-time streaming responses
- File upload endpoints for code and image files

## Browser Support

- Chrome (latest 2 versions)
- Safari (latest 2 versions)
- Firefox (latest 2 versions)
- Edge (latest 2 versions)

## Contributing

1. Follow the existing code style and patterns
2. Write tests for new functionality
3. Ensure accessibility compliance
4. Update documentation as needed
