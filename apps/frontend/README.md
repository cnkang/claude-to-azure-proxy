# Claude-to-Azure Proxy Frontend

React frontend for the Claude-to-Azure OpenAI proxy service.

## Tech Stack

- **React 19.2** - Modern React with concurrent features, use() hook, and enhanced Suspense
- **shadcn/ui** - Accessible, customizable component library built with Radix UI and Tailwind CSS
- **Tailwind CSS 4.1** - Native cascade layers, container queries, and improved JIT compilation
- **TypeScript 5.3+** - Type safety and developer experience
- **framer-motion** - Spring physics-based fluid animations
- **Vite** - Fast build tool and development server
- **i18next** - Internationalization (English and Chinese)
- **React Router DOM** - Client-side routing
- **Vitest + happy-dom** - Testing framework with fast DOM environment
- **Playwright** - E2E testing with cross-browser support
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
- 🪟 **Liquid Glass Design** - Modern frosted glass UI with dynamic optical effects
- 🎭 **Fluid Animations** - Spring physics-based organic motion
- 📜 **Dynamic Scroll Behavior** - Adaptive header that responds to scroll direction
- 🎯 **In-Place Interactions** - Dialogs expand from trigger elements
- 📱 **Mobile Optimizations** - Bottom search positioning for thumb reachability
- 🎨 **Modern CSS Features** - Container queries, logical properties, clamp(), dvh units

## Liquid Glass Design System

### Overview

The application features a modern "Liquid Glass" design inspired by Apple's macOS 26 and iOS 26 design language. This creates a sophisticated, translucent interface with frosted-glass effects, fluid animations, and dynamic optical adaptation.

### Key Features

#### Glass Components (shadcn/ui)

All UI components use shadcn/ui as the foundation, enhanced with glass effect styling:

- **Accessible by Default**: Built with Radix UI primitives meeting WCAG AAA standards
- **Customizable**: Full control over styling with Tailwind CSS 4.1
- **Three Intensity Levels**:
  - **Low**: Subtle transparency (bg-white/10, backdrop-blur-md)
  - **Medium**: Balanced visibility (bg-white/40, backdrop-blur-xl)
  - **High**: Strong frosted effect (bg-white/70, backdrop-blur-2xl)

```typescript
// Example: Using Glass components
import { GlassCard } from '@/components/ui/glass-card';

<GlassCard intensity="medium" border>
  Content with glass effect
</GlassCard>
```

#### Fluid Animation System

Spring physics-based animations that feel organic and alive:

- **Spring Presets**: Gentle, default, bouncy, and gel configurations
- **Accessibility**: Respects `prefers-reduced-motion` preference
- **Performance**: GPU-accelerated with transform and opacity
- **Gesture-Driven**: Responds to user input velocity and direction

```typescript
// Example: Using accessible animations
import { useAccessibleAnimation } from '@/hooks/useAccessibleAnimation';

function Button() {
  const animation = useAccessibleAnimation('bouncy');
  
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={animation}
    >
      Click me
    </motion.button>
  );
}
```

#### Dynamic Scroll Behavior

Header adapts to scroll direction for optimal space usage:

- **Collapse on Scroll Down**: Reduces height from 64px to 48px
- **Expand on Scroll Up**: Returns to full height
- **Essential Controls**: Always visible when collapsed
- **Smooth Transitions**: Spring physics for natural motion

```typescript
// Example: Using scroll behavior
import { useScrollBehavior } from '@/hooks/useScrollBehavior';

function Header() {
  const { isCollapsed, scrollDirection } = useScrollBehavior();
  
  return (
    <motion.header
      animate={{ height: isCollapsed ? '48px' : '64px' }}
      transition={useAccessibleAnimation('gentle')}
    >
      Header content
    </motion.header>
  );
}
```

#### In-Place Dialog Expansion

Dialogs expand from their trigger elements for connected interactions:

- **Transform Origin**: Set to trigger button's center coordinates
- **Scale Animation**: Grows from 0 to 1 with spring physics
- **Focus Management**: Returns focus to trigger on close
- **Backdrop Blur**: Synchronized with dialog animation

```typescript
// Example: In-place dialog
import { useInPlaceDialog } from '@/hooks/useInPlaceDialog';

function Component() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { transformOrigin } = useInPlaceDialog(triggerRef, isOpen);
  
  return (
    <>
      <button ref={triggerRef}>Open Dialog</button>
      <Dialog>
        <DialogContent style={{ transformOrigin }}>
          Content
        </DialogContent>
      </Dialog>
    </>
  );
}
```

#### Mobile Touch Reachability

Search positioned in thumb zone on mobile devices:

- **Bottom 20% Positioning**: Easy one-handed access
- **Keyboard Detection**: Adjusts when keyboard appears
- **44x44px Touch Targets**: Meets accessibility requirements
- **Responsive**: Adapts to portrait and landscape

```typescript
// Example: Mobile search positioning
import { useMobileSearchPosition } from '@/hooks/useMobileSearchPosition';

function MobileSearch() {
  const { style, isMobileBottom } = useMobileSearchPosition();
  
  return (
    <div style={style}>
      <Input placeholder="Search..." />
    </div>
  );
}
```

#### Scroll Edge Visual Feedback

Subtle indicators when reaching scroll boundaries:

- **Top/Bottom Indicators**: Gradient overlays at edges
- **Opacity-Based**: Fades based on distance from edge
- **Smooth Transitions**: Respects reduced motion preference
- **Screen Reader Support**: Announces "End of content"

```typescript
// Example: Scroll edge indicators
import { useScrollEdge } from '@/hooks/useScrollEdge';

function ScrollableContent() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isNearTop, isNearBottom, topOpacity, bottomOpacity } = useScrollEdge(containerRef);
  
  return (
    <div ref={containerRef} className="overflow-y-auto">
      {isNearTop && <div style={{ opacity: topOpacity }} className="edge-indicator-top" />}
      Content
      {isNearBottom && <div style={{ opacity: bottomOpacity }} className="edge-indicator-bottom" />}
    </div>
  );
}
```

### Modern CSS Features

The design system leverages cutting-edge CSS features:

#### Responsive Typography with clamp()

```css
/* Fluid typography that scales with viewport */
font-size: clamp(1rem, 2vw + 0.5rem, 2rem);
padding: clamp(1rem, 3vw, 3rem);
```

#### Container Queries

```css
/* Component-level responsiveness */
@container (min-width: 400px) {
  .card-content {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
}
```

#### CSS Logical Properties

```css
/* Better internationalization support */
padding-inline: 1rem;  /* Instead of padding-left/right */
margin-block: 2rem;    /* Instead of margin-top/bottom */
```

#### Dynamic Viewport Units

```css
/* Accounts for mobile browser UI */
height: 100dvh;  /* Dynamic viewport height */
min-height: 100lvh;  /* Large viewport height */
```

#### Modern Selectors

```css
/* Parent-based styling */
.card:has(img) {
  padding: 0;
}

/* Grouping selectors */
:is(h1, h2, h3) {
  font-weight: bold;
}
```

### Accessibility (WCAG 2.2 AAA)

All Liquid Glass features maintain strict accessibility compliance:

#### Contrast Ratios

- **Normal Text**: 7:1 minimum contrast ratio
- **Large Text**: 4.5:1 minimum contrast ratio
- **Focus Indicators**: 3:1 minimum contrast ratio
- **Continuous Validation**: Real-time contrast checking

#### Motion Preferences

- **Reduced Motion**: Instant transitions when `prefers-reduced-motion` is enabled
- **Smooth Animations**: Spring physics when motion is preferred
- **User Control**: All animations respect user preferences

#### Keyboard Navigation

- **Full Access**: All features accessible via keyboard
- **Visible Focus**: 3px outline with 3:1 contrast
- **No Traps**: Can always escape with Escape key
- **Logical Order**: Intuitive tab navigation

#### Screen Reader Support

- **ARIA Labels**: Comprehensive labeling for all elements
- **Live Regions**: Dynamic content announced
- **State Changes**: Animations and transitions announced
- **Semantic HTML**: Proper heading hierarchy and landmarks

### Browser Compatibility

#### Supported Browsers

- Chrome/Edge 90+ (full support)
- Firefox 88+ (with backdrop-filter fallback)
- Safari 14+ (with WebKit optimizations)
- Mobile Safari 14+ (with touch optimizations)

#### Fallback Strategies

- **Backdrop Filter**: Solid backgrounds when unsupported
- **Container Queries**: Media query fallbacks
- **CSS Variables**: Static color values as fallback
- **Modern Selectors**: Progressive enhancement

### Performance

#### Optimization Techniques

- **GPU Acceleration**: Transform and opacity for animations
- **React.memo**: Expensive components wrapped
- **Virtualization**: Lists > 50 items use react-window
- **Code Splitting**: Lazy loading for non-critical components
- **Debouncing**: 300ms for search and resize handlers

#### Performance Targets

| Metric | Target |
|--------|--------|
| Initial Render | <2s |
| Animation Frame Rate | 60fps |
| Scroll Performance | 60fps |
| Memory Usage | <100MB |
| Bundle Size | <500KB (gzipped) |

## Conversation Persistence

### Overview

The application features a sophisticated conversation persistence system that ensures your
conversations are safely stored and synchronized across browser tabs.

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

Full-text search across all conversations and messages with keyword highlighting, pagination, and
WCAG 2.2 AAA accessibility compliance.

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
  pageSize: 20,
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

| Shortcut    | Action               |
| ----------- | -------------------- |
| `Ctrl+K`    | Open search          |
| `Escape`    | Clear search / Close |
| `ArrowDown` | Next result          |
| `ArrowUp`   | Previous result      |
| `Enter`     | Open selected result |
| `Home`      | First result         |
| `End`       | Last result          |
| `PageDown`  | Next page            |
| `PageUp`    | Previous page        |

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
  caseSensitive: true,
});
```

#### Paginated Search

```typescript
// Get second page of results
const results = await searchService.search('error', {
  page: 1,
  pageSize: 20,
});
```

#### Search in Specific Conversations

```typescript
// Search only in specific conversations
const results = await searchService.search('bug', {
  conversationIds: ['conv-1', 'conv-2'],
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

| Operation       | Target Latency (95th percentile) |
| --------------- | -------------------------------- |
| Title Update    | <500ms                           |
| Deletion        | <500ms                           |
| Search          | <500ms                           |
| Cross-Tab Sync  | <1000ms                          |
| Integrity Check | <5000ms                          |

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
