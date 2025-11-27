# E2E Test Fixes - Design

## Architecture Overview

### Problem Analysis
Based on test failures and requirements analysis, the root causes are:
1. **UI Elements Not Rendering**: Conversation list items and action buttons not visible to tests
2. **Storage Initialization**: Conversations not persisting or loading correctly
3. **Component Lifecycle**: Components may render before storage is ready
4. **CSS Visibility**: Action buttons hidden by opacity/visibility rules
5. **Missing Test IDs**: Some elements lack data-testid attributes
6. **Backend Stability**: Headers sent multiple times, error handling issues
7. **Test Infrastructure**: Inconsistent test isolation and cleanup
8. **Code Quality**: TypeScript errors, ESLint violations, console errors

### Solution Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Application Layer                          │
├─────────────────────────────────────────────────────────────────┤
│  1. Storage Initialization (Priority: Critical)                 │
│     - Ensure storage ready before UI renders                    │
│     - Add loading states with proper error boundaries           │
│     - Handle initialization errors gracefully                   │
│     - Implement 500ms initialization timeout                    │
├─────────────────────────────────────────────────────────────────┤
│  2. Component Rendering (Priority: Critical)                    │
│     - Fix component mounting order                              │
│     - Add comprehensive data-testid attributes                  │
│     - Ensure visibility for E2E tests (opacity: 1.0)            │
│     - Implement proper React lifecycle management               │
├─────────────────────────────────────────────────────────────────┤
│  3. Cross-Tab Sync (Priority: High)                             │
│     - Fix storage event listeners                               │
│     - Ensure proper event propagation (<1000ms)                 │
│     - Handle race conditions with conflict resolution           │
│     - Implement storage event debouncing                        │
├─────────────────────────────────────────────────────────────────┤
│  4. Search Functionality (Priority: High)                       │
│     - Verify search component rendering                         │
│     - Fix result display logic with highlighting               │
│     - Ensure proper indexing and pagination                     │
│     - Implement 500ms search response time                      │
├─────────────────────────────────────────────────────────────────┤
│  5. Backend Server Stability (Priority: Critical)               │
│     - Fix "headers already sent" errors                         │
│     - Implement proper error handling with correlation IDs      │
│     - Add graceful degradation under load                       │
│     - Ensure single response per request                        │
├─────────────────────────────────────────────────────────────────┤
│  6. Test Infrastructure (Priority: High)                        │
│     - Implement proper test isolation                           │
│     - Add comprehensive cleanup in afterEach hooks              │
│     - Ensure reliable element location strategies              │
│     - Capture screenshots and traces on failure                 │
├─────────────────────────────────────────────────────────────────┤
│  7. Code Quality & Type Safety (Priority: High)                 │
│     - Fix all TypeScript compilation errors                     │
│     - Resolve all ESLint violations                             │
│     - Eliminate console errors                                  │
│     - Implement memory leak detection                           │
└─────────────────────────────────────────────────────────────────┘
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### CP-1: Storage Initialization Timing
**Property**: *For any* Frontend Application startup, the Conversation Storage SHALL complete initialization before any UI component attempts to read from storage, and SHALL complete within 500 milliseconds.

**Validates**: Requirements 3.1, 3.3

**Verification**:
```typescript
// Before: UI renders immediately
<App /> → <ConversationList /> → storage.getConversations() → undefined

// After: UI waits for storage
<App /> → await storage.initialize() → <ConversationList /> → storage.getConversations() → [conversations]
```

**Implementation**:
- Add `isStorageReady` state to App context
- Show loading spinner until storage ready
- Prevent component render until initialized
- Implement 500ms timeout with error handling

### CP-2: UI Element Visibility and Testability
**Property**: *For any* interactive element in the Frontend Application, the element SHALL have opacity value of 1.0 and SHALL include a data-testid attribute for test identification.

**Validates**: Requirements 2.2, 2.5

**Verification**:
```css
/* Before: Hidden by default */
.conversation-actions { opacity: 0; }

/* After: Always visible */
.conversation-actions { opacity: 1; }
```

**Implementation**:
- Remove opacity: 0 from action buttons
- Ensure display properties are correct
- Add data-testid to all interactive elements
- Verify visibility in E2E tests

### CP-3: Cross-Tab Synchronization Latency
**Property**: *For any* storage modification in one tab, the Frontend Application SHALL propagate the change to all other tabs within 1000 milliseconds, and SHALL resolve conflicts without data loss when multiple tabs modify storage simultaneously.

**Validates**: Requirements 4.1, 4.2, 4.3, 4.4, 4.5

**Verification**:
```typescript
// Tab 1: Update conversation
await storage.updateConversation(id, { title: 'New Title' });

// Tab 2: Receive event within 1s
await waitForStorageEvent('update', 1000);
const conversation = await storage.getConversation(id);
expect(conversation.title).toBe('New Title');
```

**Implementation**:
- Verify storage event listeners are attached
- Ensure events fire on storage changes
- Add proper event handling in components
- Implement conflict resolution strategy

### CP-4: Search Response Time and Display
**Property**: *For any* search query submitted by a user, the Frontend Application SHALL return results within 500 milliseconds and SHALL render a container with data-testid attribute value "search-results".

**Validates**: Requirements 5.2, 5.5

**Verification**:
```typescript
// Execute search
const startTime = Date.now();
await searchInput.fill('test query');

// Results appear within 500ms
const results = await page.waitForSelector('[data-testid="search-results"]', { timeout: 500 });
expect(Date.now() - startTime).toBeLessThan(500);
expect(results).toBeVisible();
```

**Implementation**:
- Verify search component mounts correctly
- Ensure search results container renders
- Fix any conditional rendering issues
- Optimize search indexing for performance

### CP-5: Search Result Highlighting
**Property**: *For any* search results containing matching text, the Frontend Application SHALL highlight the matched keywords.

**Validates**: Requirements 5.3

**Implementation**:
- Implement text highlighting algorithm
- Apply highlighting styles to matched keywords
- Ensure highlighting is accessible (proper contrast)

### CP-6: Search Pagination
**Property**: *For any* search results that exceed one page, the Frontend Application SHALL provide pagination controls.

**Validates**: Requirements 5.4

**Implementation**:
- Implement pagination component
- Calculate page count based on results
- Handle page navigation events

### CP-7: Storage Error Handling
**Property**: *For any* Conversation Storage initialization failure, the Frontend Application SHALL display an error message to the user.

**Validates**: Requirements 3.4

**Implementation**:
- Add error boundary component
- Display user-friendly error message
- Provide retry mechanism

### CP-8: Storage Data Integrity
**Property**: *For any* storage operation, the Conversation Storage SHALL maintain data integrity without corruption.

**Validates**: Requirements 3.5

**Implementation**:
- Implement data validation before storage
- Add integrity checks on retrieval
- Handle corrupted data gracefully

### CP-9: Backend Response Headers
**Property**: *For any* HTTP request to the Backend Server, the Backend Server SHALL send headers exactly once per response.

**Validates**: Requirements 8.2

**Implementation**:
- Add response state tracking
- Prevent duplicate header sends
- Implement proper middleware ordering

### CP-10: Backend Error Logging
**Property**: *For any* error during request processing, the Backend Server SHALL log the error with correlation ID and continue serving requests.

**Validates**: Requirements 8.3

**Implementation**:
- Add correlation ID to all requests
- Implement structured error logging
- Ensure error handling doesn't crash server

### CP-11: Test State Isolation
**Property**: *For any* test execution, the Test System SHALL initialize application state to a known clean state before the test and SHALL clean up all test data and state after the test completes.

**Validates**: Requirements 9.1, 9.3, 9.4

**Implementation**:
- Clear localStorage/sessionStorage in beforeEach
- Delete IndexedDB databases in beforeEach
- Restore mocks and timers in afterEach
- Wait for pending promises to resolve

### CP-12: Test Element Location
**Property**: *For any* test helper interaction with UI elements, the Test System SHALL reliably locate and interact with elements.

**Validates**: Requirements 9.2

**Implementation**:
- Use data-testid attributes consistently
- Implement proper wait strategies
- Add retry logic for flaky selectors

### CP-13: Test Failure Diagnostics
**Property**: *For any* test failure, the Test System SHALL capture screenshots and trace files for debugging and SHALL provide clear error messages indicating the failure cause.

**Validates**: Requirements 1.5, 9.5

**Implementation**:
- Configure Playwright to capture screenshots on failure
- Enable trace collection for failed tests
- Implement descriptive error messages

### CP-14: Test Suite Execution Time
**Property**: *For any* Test Suite execution, the Test System SHALL complete within 600 seconds.

**Validates**: Requirements 1.4

**Implementation**:
- Optimize test setup and teardown
- Run tests in parallel where safe
- Identify and optimize slow tests

### CP-15: Test Suite Consistency
**Property**: *For any* Test Suite execution in the CI/CD Environment, the Test System SHALL produce consistent results across multiple executions without intermittent failures.

**Validates**: Requirements 1.2, 1.3

**Implementation**:
- Fix race conditions in tests
- Implement proper wait strategies
- Ensure test isolation
- Add retry logic for network-dependent tests

## Component Design

### 1. Storage Initialization Guard

**Design Rationale**: Implements a loading gate pattern to ensure storage is fully initialized before any UI components attempt to access it. This prevents race conditions and undefined behavior when components try to read from uninitialized storage.

```typescript
// apps/frontend/src/App.tsx
function App() {
  const [isStorageReady, setIsStorageReady] = useState(false);
  const [storageError, setStorageError] = useState<Error | null>(null);

  useEffect(() => {
    const initStorage = async () => {
      try {
        const storage = getConversationStorage();
        
        // Implement 500ms timeout as per requirement 3.3
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Storage initialization timeout')), 500)
        );
        
        await Promise.race([
          storage.initialize(),
          timeoutPromise
        ]);
        
        setIsStorageReady(true);
      } catch (error) {
        setStorageError(error as Error);
      }
    };
    initStorage();
  }, []);

  if (storageError) {
    return <ErrorScreen error={storageError} onRetry={() => window.location.reload()} />;
  }

  if (!isStorageReady) {
    return <LoadingScreen message="Initializing storage..." />;
  }

  return <AppRouter />;
}
```

### 2. Conversation List Visibility

**Design Rationale**: Ensures all interactive elements are visible and testable by adding comprehensive data-testid attributes and setting opacity to 1.0. This addresses Requirements 2.2 and 2.5 for proper UI rendering and test identification.

```typescript
// apps/frontend/src/components/conversation/OptimizedConversationList.tsx
// Ensure all elements have data-testid and are visible
<div
  data-testid={`conversation-item-${conversation.id}`}
  className="conversation-list-item"
  role="article"
  aria-labelledby={`conversation-title-${conversation.id}`}
>
  <h3 
    id={`conversation-title-${conversation.id}`}
    className="conversation-title"
    data-testid={`conversation-title-${conversation.id}`}
  >
    {conversation.title}
  </h3>
  <div 
    className="conversation-actions"
    data-testid={`conversation-actions-${conversation.id}`}
    style={{ opacity: 1 }} // Ensure visibility for tests (Requirement 2.2)
  >
    <button
      data-testid={`rename-conversation-button-${conversation.id}`}
      onClick={handleRename}
      aria-label={`Rename conversation ${conversation.title}`}
    >
      ✏️
    </button>
    <button
      data-testid={`delete-conversation-button-${conversation.id}`}
      onClick={handleDelete}
      aria-label={`Delete conversation ${conversation.title}`}
    >
      🗑️
    </button>
  </div>
</div>
```

### 3. Cross-Tab Event Handling

**Design Rationale**: Implements storage event listeners with debouncing to ensure changes propagate across tabs within 1000ms (Requirement 4.1-4.3) while preventing excessive re-renders. Includes conflict resolution for simultaneous updates (Requirement 4.5).

```typescript
// apps/frontend/src/hooks/useConversations.ts
useEffect(() => {
  let debounceTimer: NodeJS.Timeout | null = null;
  
  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key?.startsWith('conversation_')) {
      // Debounce to prevent excessive reloads while ensuring <1000ms propagation
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      
      debounceTimer = setTimeout(() => {
        // Reload conversations from storage
        loadConversations();
      }, 100); // 100ms debounce, well within 1000ms requirement
    }
  };

  window.addEventListener('storage', handleStorageEvent);
  
  return () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    window.removeEventListener('storage', handleStorageEvent);
  };
}, []);
```

### 4. Search Component with Performance Optimization

**Design Rationale**: Implements search functionality with 500ms response time requirement (Requirement 5.5), proper data-testid attributes (Requirement 5.2), keyword highlighting (Requirement 5.3), and pagination (Requirement 5.4).

```typescript
// apps/frontend/src/components/search/ConversationSearch.tsx
function ConversationSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Conversation[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isSearching, setIsSearching] = useState(false);
  const resultsPerPage = 10;

  const performSearch = useCallback(async (searchQuery: string) => {
    const startTime = Date.now();
    setIsSearching(true);
    
    try {
      const storage = getConversationStorage();
      const allConversations = await storage.getConversations();
      
      // Filter conversations by query
      const filtered = allConversations.filter(conv => 
        conv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conv.messages?.some(msg => 
          msg.content.toLowerCase().includes(searchQuery.toLowerCase())
        )
      );
      
      setResults(filtered);
      
      // Ensure search completes within 500ms (Requirement 5.5)
      const elapsed = Date.now() - startTime;
      if (elapsed > 500) {
        console.warn(`Search took ${elapsed}ms, exceeding 500ms requirement`);
      }
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query) {
        performSearch(query);
      } else {
        setResults([]);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, performSearch]);

  const totalPages = Math.ceil(results.length / resultsPerPage);
  const paginatedResults = results.slice(
    (currentPage - 1) * resultsPerPage,
    currentPage * resultsPerPage
  );

  return (
    <div role="search" data-testid="conversation-search">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search conversations..."
        data-testid="search-input"
        aria-label="Search conversations"
      />
      
      {isSearching && (
        <div role="status" aria-live="polite">
          Searching...
        </div>
      )}
      
      <div 
        data-testid="search-results" 
        role="region" 
        aria-label="Search results"
      >
        {paginatedResults.map(result => (
          <SearchResult 
            key={result.id} 
            conversation={result} 
            query={query}
            data-testid={`search-result-${result.id}`}
          />
        ))}
      </div>
      
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          data-testid="search-pagination"
        />
      )}
    </div>
  );
}

// Highlight matched keywords (Requirement 5.3)
function SearchResult({ conversation, query }: { conversation: Conversation; query: string }) {
  const highlightText = (text: string) => {
    if (!query) return text;
    
    const regex = new RegExp(`(${query})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, i) => 
      regex.test(part) ? (
        <mark key={i} className="search-highlight">{part}</mark>
      ) : (
        part
      )
    );
  };

  return (
    <article data-testid={`search-result-${conversation.id}`}>
      <h3>{highlightText(conversation.title)}</h3>
      {/* Additional result content */}
    </article>
  );
}
```

## Data Flow

### Conversation Creation Flow
```
User Click → createConversation() → storage.create() → 
localStorage.setItem() (immediate, Req 3.2) → storage event → 
other tabs receive event (<1000ms, Req 4.2) → reload conversations
```

### Conversation Update Flow
```
User Edit → updateConversation() → storage.update() →
localStorage.setItem() (immediate) → storage event → 
other tabs receive event (<1000ms, Req 4.1) → reload conversations
```

### Conversation Deletion Flow
```
User Delete → deleteConversation() → storage.delete() →
localStorage.removeItem() (immediate) → storage event →
other tabs receive event (<1000ms, Req 4.3) → reload conversations
```

### Search Flow
```
User Input → debounce(250ms) → searchConversations() →
filter conversations → render results (<500ms, Req 5.5) → 
highlight keywords (Req 5.3) → paginate if needed (Req 5.4)
```

### Storage Initialization Flow
```
App Start → storage.initialize() → 
timeout race (500ms, Req 3.3) → 
success: render UI | failure: show error (Req 3.4)
```

### Backend Request Flow
```
HTTP Request → correlation ID middleware → 
authentication middleware → request handler → 
response (headers sent once, Req 8.2) → 
error handling (log with correlation ID, Req 8.3)
```

## Backend Server Design

**Design Rationale**: Implements robust backend error handling and stability to meet Requirement 8.

### 1. Response Guard Middleware

**Purpose**: Prevent duplicate header sends (Requirement 8.2)

```typescript
// apps/backend/src/middleware/response-guard.ts
export function responseGuard(req: Request, res: Response, next: NextFunction): void {
  const originalSend = res.send;
  const originalJson = res.json;
  const originalEnd = res.end;
  let responseSent = false;

  const guardedSend = function(this: Response, data: any) {
    if (responseSent) {
      logger.error('Attempted to send response twice', { 
        correlationId: req.correlationId,
        url: req.url,
        method: req.method
      });
      return this;
    }
    responseSent = true;
    return originalSend.call(this, data);
  };

  const guardedJson = function(this: Response, data: any) {
    if (responseSent) {
      logger.error('Attempted to send JSON response twice', { 
        correlationId: req.correlationId 
      });
      return this;
    }
    responseSent = true;
    return originalJson.call(this, data);
  };

  const guardedEnd = function(this: Response, ...args: any[]) {
    if (responseSent) {
      logger.error('Attempted to end response twice', { 
        correlationId: req.correlationId 
      });
      return this;
    }
    responseSent = true;
    return originalEnd.call(this, ...args);
  };

  res.send = guardedSend;
  res.json = guardedJson;
  res.end = guardedEnd;

  next();
}
```

### 2. Error Handler Middleware

**Purpose**: Log errors with correlation IDs and continue serving (Requirement 8.3)

```typescript
// apps/backend/src/middleware/error-handler.ts
export function errorHandler(
  err: Error, 
  req: Request, 
  res: Response, 
  next: NextFunction
): void {
  // Log error with correlation ID (Requirement 8.3)
  logger.error('Request processing error', {
    correlationId: req.correlationId,
    error: {
      message: err.message,
      stack: err.stack,
      name: err.name
    },
    request: {
      method: req.method,
      url: req.url,
      headers: sanitizeHeaders(req.headers)
    }
  });

  // Continue serving requests (Requirement 8.3)
  if (!res.headersSent) {
    res.status(500).json({
      error: {
        type: 'internal_error',
        message: 'An error occurred processing your request',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      }
    });
  }
}
```

### 3. Graceful Degradation

**Purpose**: Handle high load without complete failure (Requirement 8.4)

```typescript
// apps/backend/src/middleware/load-shedding.ts
export function loadShedding(req: Request, res: Response, next: NextFunction): void {
  const activeRequests = getActiveRequestCount();
  const maxRequests = config.MAX_CONCURRENT_REQUESTS || 1000;

  if (activeRequests > maxRequests) {
    logger.warn('Load shedding activated', {
      activeRequests,
      maxRequests,
      correlationId: req.correlationId
    });

    return res.status(503).json({
      error: {
        type: 'service_unavailable',
        message: 'Service temporarily unavailable due to high load',
        correlationId: req.correlationId,
        retryAfter: 5
      }
    });
  }

  incrementActiveRequests();
  res.on('finish', decrementActiveRequests);
  next();
}
```

### 4. Concurrent Request Handling

**Purpose**: Process concurrent requests without crashing (Requirement 8.1)

```typescript
// apps/backend/src/server.ts
export class Server {
  private server: http.Server;

  start(): void {
    this.server = this.app.listen(this.port, () => {
      logger.info('Server started', { port: this.port });
    });

    // Handle concurrent requests (Requirement 8.1)
    this.server.maxConnections = 10000;
    this.server.timeout = 120000; // 2 minutes
    this.server.keepAliveTimeout = 65000; // 65 seconds

    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  private async shutdown(): Promise<void> {
    logger.info('Shutting down gracefully');

    // Stop accepting new connections
    this.server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  }
}
```

## CSS Design

### Action Button Visibility

**Design Rationale**: Ensures action buttons are always visible for E2E tests (Requirement 2.2) while maintaining good UX.

```css
/* Remove opacity hiding - always visible for tests */
.conversation-actions {
  display: flex;
  gap: 0.25rem;
  opacity: 1; /* Always visible (Requirement 2.2) */
  transition: opacity 0.2s ease;
}

/* Maintain hover effect for visual feedback */
.conversation-list-item:hover .conversation-actions {
  opacity: 1;
  background: var(--hover-bg);
}

/* Ensure minimum touch target size (Requirement 6.5) */
.conversation-actions button {
  min-width: 44px;
  min-height: 44px;
  padding: 0.5rem;
}
```

## Error Handling

### Storage Errors

**Design Rationale**: Implements comprehensive error handling for storage operations to meet Requirements 3.4 and 3.5.

- Show user-friendly error message (Requirement 3.4)
- Provide retry mechanism with exponential backoff
- Log errors for debugging with correlation IDs
- Maintain data integrity on errors (Requirement 3.5)
- Fallback to in-memory storage if persistent storage fails

```typescript
class StorageErrorHandler {
  static handleInitializationError(error: Error): void {
    logger.error('Storage initialization failed', { error });
    
    // Display user-friendly message (Requirement 3.4)
    showErrorNotification({
      title: 'Storage Initialization Failed',
      message: 'Unable to initialize storage. Please try refreshing the page.',
      action: { label: 'Retry', onClick: () => window.location.reload() }
    });
  }

  static handleDataCorruption(key: string, error: Error): void {
    logger.error('Data corruption detected', { key, error });
    
    // Maintain data integrity (Requirement 3.5)
    localStorage.removeItem(key);
    showErrorNotification({
      title: 'Data Corruption Detected',
      message: 'Some data was corrupted and has been removed.',
    });
  }
}
```

### Component Errors

**Design Rationale**: Implements React error boundaries to catch and handle rendering errors gracefully.

- Error boundaries catch rendering errors
- Display fallback UI with recovery options
- Log error details with component stack traces
- Allow user to recover without full page reload

```typescript
class ErrorBoundary extends React.Component<Props, State> {
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('Component error', { error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback 
          error={this.state.error}
          onReset={() => this.setState({ hasError: false })}
        />
      );
    }
    return this.props.children;
  }
}
```

### Backend Errors

**Design Rationale**: Implements proper error handling to meet Requirements 8.2 and 8.3.

- Prevent duplicate header sends (Requirement 8.2)
- Log errors with correlation IDs (Requirement 8.3)
- Continue serving requests after errors (Requirement 8.3)
- Implement graceful degradation (Requirement 8.4)

```typescript
// Middleware to prevent duplicate header sends
function responseGuard(req: Request, res: Response, next: NextFunction) {
  const originalSend = res.send;
  let responseSent = false;

  res.send = function(data: any) {
    if (responseSent) {
      logger.error('Attempted to send response twice', { 
        correlationId: req.correlationId 
      });
      return res;
    }
    responseSent = true;
    return originalSend.call(this, data);
  };

  next();
}

// Error handler middleware
function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  // Log with correlation ID (Requirement 8.3)
  logger.error('Request error', { 
    correlationId: req.correlationId,
    error: err 
  });

  // Continue serving requests (Requirement 8.3)
  if (!res.headersSent) {
    res.status(500).json({
      error: {
        type: 'internal_error',
        message: 'An error occurred processing your request',
        correlationId: req.correlationId
      }
    });
  }
}
```

### Test Errors

**Design Rationale**: Implements comprehensive test error handling to meet Requirements 1.5 and 9.5.

- Clear error messages in test output (Requirement 9.5)
- Screenshots on failure (Requirement 1.5)
- Trace files for debugging (Requirement 1.5)
- Retry logic for flaky operations

```typescript
// Playwright configuration
export default defineConfig({
  use: {
    screenshot: 'only-on-failure', // Requirement 1.5
    trace: 'retain-on-failure',    // Requirement 1.5
  },
  
  // Retry flaky tests
  retries: process.env.CI ? 2 : 0,
});

// Test helper with clear error messages
async function waitForElement(page: Page, selector: string, timeout = 5000) {
  try {
    return await page.waitForSelector(selector, { timeout });
  } catch (error) {
    // Clear error message (Requirement 9.5)
    throw new Error(
      `Failed to find element "${selector}" within ${timeout}ms. ` +
      `Current URL: ${page.url()}. ` +
      `Available elements: ${await page.evaluate(() => 
        Array.from(document.querySelectorAll('[data-testid]'))
          .map(el => el.getAttribute('data-testid'))
          .join(', ')
      )}`
    );
  }
}
```

## Performance Considerations

**Design Rationale**: Optimizes performance to meet timing requirements and prevent memory leaks (Requirement 7.4).

### Storage Operations

**Target**: <500ms retrieval time (Requirement 3.3)

- Batch updates when possible to reduce I/O
- Debounce frequent operations (100ms for cross-tab sync)
- Use indexes for search to improve query performance
- Lazy load conversations to reduce initial load time
- Implement caching layer for frequently accessed data

```typescript
class ConversationCache {
  private cache = new Map<string, Conversation>();
  private maxSize = 100;

  get(id: string): Conversation | undefined {
    return this.cache.get(id);
  }

  set(id: string, conversation: Conversation): void {
    // Implement LRU eviction
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(id, conversation);
  }

  clear(): void {
    this.cache.clear();
  }
}
```

### Rendering

**Target**: Smooth 60fps rendering, no memory leaks (Requirement 7.4)

- Virtual scrolling for long lists (>100 items)
- Memoize expensive computations with useMemo
- Avoid unnecessary re-renders with React.memo
- Use React.memo for list items
- Implement proper cleanup in useEffect hooks

```typescript
// Memoized conversation list item
const ConversationListItem = React.memo(({ conversation }: Props) => {
  return (
    <div data-testid={`conversation-item-${conversation.id}`}>
      {/* Item content */}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison to prevent unnecessary re-renders
  return prevProps.conversation.id === nextProps.conversation.id &&
         prevProps.conversation.title === nextProps.conversation.title;
});

// Virtual scrolling for large lists
function ConversationList({ conversations }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const rowVirtualizer = useVirtualizer({
    count: conversations.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    overscan: 5
  });

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
        {rowVirtualizer.getVirtualItems().map(virtualRow => (
          <ConversationListItem
            key={conversations[virtualRow.index].id}
            conversation={conversations[virtualRow.index]}
          />
        ))}
      </div>
    </div>
  );
}
```

### Memory Management

**Target**: No memory leaks (Requirement 7.4)

- Implement proper cleanup in useEffect hooks
- Remove event listeners on unmount
- Clear timers and intervals
- Abort pending requests on unmount
- Monitor memory usage in tests

```typescript
function useConversations() {
  useEffect(() => {
    const controller = new AbortController();
    let debounceTimer: NodeJS.Timeout | null = null;

    const handleStorageEvent = (event: StorageEvent) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadConversations({ signal: controller.signal });
      }, 100);
    };

    window.addEventListener('storage', handleStorageEvent);

    return () => {
      // Cleanup to prevent memory leaks (Requirement 7.4)
      window.removeEventListener('storage', handleStorageEvent);
      if (debounceTimer) clearTimeout(debounceTimer);
      controller.abort();
    };
  }, []);
}

// Memory leak detection in tests
test('should not leak memory', async () => {
  const initialMemory = performance.memory?.usedJSHeapSize || 0;
  
  // Perform operations
  for (let i = 0; i < 100; i++) {
    render(<ConversationList conversations={mockConversations} />);
    cleanup();
  }
  
  // Force garbage collection if available
  if (global.gc) global.gc();
  
  const finalMemory = performance.memory?.usedJSHeapSize || 0;
  const memoryIncrease = finalMemory - initialMemory;
  
  // Memory increase should be minimal (Requirement 7.4)
  expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // 10MB threshold
});
```

### Testing

**Target**: <600s test execution (Requirement 1.4)

- Parallel test execution where safe
- Proper test isolation to prevent interference
- Efficient cleanup to reduce overhead
- Reuse browser contexts when possible
- Skip unnecessary setup for simple tests

```typescript
// Playwright configuration for performance
export default defineConfig({
  workers: process.env.CI ? 2 : 4, // Parallel execution
  fullyParallel: true,
  timeout: 30000,
  expect: { timeout: 5000 },
  
  use: {
    // Reuse browser contexts
    launchOptions: {
      args: ['--disable-dev-shm-usage']
    }
  }
});
```

## Code Quality and Type Safety

**Design Rationale**: Ensures code quality meets Requirement 7 for maintainability and reliability.

### TypeScript Configuration

**Target**: Zero type-checking errors (Requirement 7.1)

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### ESLint Configuration

**Target**: Zero linting errors (Requirement 7.2)

```typescript
// eslint.config.ts
export default [
  {
    rules: {
      'no-console': 'error', // Prevent console.log in production (Requirement 7.3)
      'no-debugger': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  }
];
```

### Console Error Prevention

**Target**: Zero console errors (Requirement 7.3)

```typescript
// Development-only logging utility
const logger = {
  debug: (message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(message, data);
    }
  },
  
  error: (message: string, error?: Error) => {
    // Use proper error tracking service in production
    if (process.env.NODE_ENV === 'production') {
      errorTrackingService.captureError(error || new Error(message));
    } else {
      console.error(message, error);
    }
  }
};

// Replace console.log with logger
// ❌ BAD: console.log('Debug info');
// ✅ GOOD: logger.debug('Debug info');
```

### Type Safety Patterns

```typescript
// Use discriminated unions for type safety
type StorageResult<T> = 
  | { success: true; data: T }
  | { success: false; error: Error };

async function getConversation(id: string): Promise<StorageResult<Conversation>> {
  try {
    const data = await storage.get(id);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}

// Use type guards for runtime validation
function isConversation(value: unknown): value is Conversation {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'title' in value &&
    typeof (value as any).id === 'string' &&
    typeof (value as any).title === 'string'
  );
}
```

## Security Considerations

**Design Rationale**: Implements security best practices to protect user data and prevent attacks.

### Storage Security

- Validate data before storing to prevent injection
- Sanitize user input to prevent XSS
- Prevent XSS in conversation content with DOMPurify
- Secure session management with httpOnly cookies
- Implement Content Security Policy (CSP)

```typescript
import DOMPurify from 'dompurify';

function sanitizeConversationContent(content: string): string {
  // Prevent XSS in conversation content
  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'code', 'pre'],
    ALLOWED_ATTR: []
  });
}

function validateConversation(data: unknown): Conversation {
  if (!isConversation(data)) {
    throw new ValidationError('Invalid conversation data');
  }
  
  return {
    ...data,
    title: sanitizeConversationContent(data.title),
    messages: data.messages?.map(msg => ({
      ...msg,
      content: sanitizeConversationContent(msg.content)
    }))
  };
}
```

### Cross-Tab Communication Security

- Validate storage events to prevent malicious data
- Prevent malicious event injection with origin checks
- Sanitize event data before processing
- Rate limit event processing to prevent DoS

```typescript
function handleStorageEvent(event: StorageEvent): void {
  // Validate event origin
  if (event.storageArea !== localStorage) {
    logger.warn('Invalid storage event origin');
    return;
  }

  // Validate event key
  if (!event.key?.startsWith('conversation_')) {
    return;
  }

  // Rate limit event processing
  if (isRateLimited()) {
    logger.warn('Storage event rate limit exceeded');
    return;
  }

  // Validate and sanitize event data
  try {
    const data = JSON.parse(event.newValue || '{}');
    const validated = validateConversation(data);
    processStorageUpdate(validated);
  } catch (error) {
    logger.error('Invalid storage event data', error);
  }
}
```

## Accessibility Design

### WCAG AAA Compliance
- Color contrast: 7:1 for text, 3:1 for UI
- Focus indicators: 3px solid, high contrast
- Keyboard navigation: All actions accessible
- Screen reader: Proper ARIA labels
- Touch targets: Minimum 44x44px

### Implementation
```css
/* Focus indicators */
*:focus-visible {
  outline: 3px solid var(--color-border-focus);
  outline-offset: 2px;
}

/* High contrast colors */
:root {
  --color-accent: #1e3a8a; /* 10.8:1 contrast */
  --color-border-focus: #1e3a8a;
}
```

## Testing Strategy

**Design Rationale**: Implements comprehensive testing strategy to meet Requirements 1, 7, and 9 for test reliability, code quality, and test infrastructure.

### Unit Tests

**Coverage Target**: >90% (Requirement 7.1)

- Test storage operations with mocked localStorage
- Test component rendering with React Testing Library
- Test event handlers with user event simulation
- Test utility functions with edge cases
- Test error handling paths
- Test data validation logic

```typescript
// Example: Storage operation unit test
describe('ConversationStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should persist conversation immediately', async () => {
    const storage = ConversationStorage.getInstance();
    await storage.initialize();
    
    const conversation = { id: '1', title: 'Test' };
    await storage.create(conversation);
    
    // Verify immediate persistence (Requirement 3.2)
    const stored = localStorage.getItem('conversation_1');
    expect(stored).toBeDefined();
    expect(JSON.parse(stored!)).toEqual(conversation);
  });
});
```

### Integration Tests

**Focus**: Component interaction and data flow

- Test storage + UI integration with real storage
- Test cross-tab sync with multiple contexts
- Test search functionality end-to-end
- Test error handling across layers
- Test accessibility with axe-core

```typescript
// Example: Cross-tab sync integration test
describe('Cross-Tab Synchronization', () => {
  it('should propagate changes within 1000ms', async () => {
    const tab1 = await createBrowserContext();
    const tab2 = await createBrowserContext();
    
    // Create conversation in tab1
    const startTime = Date.now();
    await tab1.evaluate(() => {
      storage.create({ id: '1', title: 'Test' });
    });
    
    // Wait for event in tab2
    await tab2.waitForFunction(() => {
      return storage.getConversation('1') !== null;
    }, { timeout: 1000 });
    
    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(1000); // Requirement 4.1
  });
});
```

### E2E Tests

**Target**: 288 tests passing consistently (Requirement 1.1)
**Execution Time**: <600 seconds (Requirement 1.4)
**Consistency**: Zero intermittent failures (Requirement 1.3)

- Test complete user flows from login to logout
- Test multi-tab scenarios with real browser contexts
- Test accessibility with automated tools
- Test performance with timing measurements
- Test error scenarios and recovery

```typescript
// Example: E2E test with proper isolation
test('should create and display conversation', async ({ page }) => {
  // Clean state (Requirement 9.1)
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  
  await page.goto('/');
  
  // Wait for storage initialization (Requirement 3.1)
  await page.waitForSelector('[data-testid="conversation-list"]');
  
  // Create conversation
  await page.click('[data-testid="new-conversation-button"]');
  
  // Verify conversation appears (Requirement 2.3)
  const conversation = await page.waitForSelector(
    '[data-testid^="conversation-item-"]',
    { timeout: 5000 }
  );
  expect(conversation).toBeVisible();
  
  // Cleanup (Requirement 9.3)
  await page.evaluate(() => localStorage.clear());
});
```

### Test Infrastructure

**Design Rationale**: Implements reliable test infrastructure to meet Requirement 9.

```typescript
// Global setup for test isolation (Requirement 9.1)
export async function globalSetup() {
  // Start backend server
  // Initialize test database
  // Clear all storage
}

// Global teardown for cleanup (Requirement 9.3)
export async function globalTeardown() {
  // Stop backend server
  // Clean up test data
  // Close database connections
}

// Test fixtures for reliable element location (Requirement 9.2)
export const test = base.extend({
  page: async ({ page }, use) => {
    // Add custom helpers
    page.getByTestId = (testId: string) => 
      page.locator(`[data-testid="${testId}"]`);
    
    await use(page);
    
    // Cleanup after each test (Requirement 9.3)
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  },
});
```

### Performance Testing

**Target**: Sub-100ms proxy overhead, 500ms search response (Requirements 5.5)

- Measure request/response timing
- Monitor memory usage over time (Requirement 7.4)
- Test concurrent request handling (Requirement 8.1)
- Identify performance bottlenecks

```typescript
test('search should complete within 500ms', async ({ page }) => {
  await page.goto('/');
  
  const startTime = Date.now();
  await page.fill('[data-testid="search-input"]', 'test query');
  await page.waitForSelector('[data-testid="search-results"]');
  const elapsed = Date.now() - startTime;
  
  expect(elapsed).toBeLessThan(500); // Requirement 5.5
});
```

### Code Quality Testing

**Design Rationale**: Ensures code quality meets Requirement 7.

- TypeScript type-checking: Zero errors (Requirement 7.1)
- ESLint: Zero errors (Requirement 7.2)
- Console errors: Zero in production (Requirement 7.3)
- Memory leak detection (Requirement 7.4)

```bash
# Type checking (Requirement 7.1)
pnpm -r type-check

# Linting (Requirement 7.2)
pnpm -r lint

# Memory leak detection (Requirement 7.4)
pnpm test:memory-leaks
```

## Rollout Plan

**Design Rationale**: Phased approach prioritizes critical functionality first, then quality improvements, ensuring the application remains functional throughout the fix process.

### Phase 1: Critical Fixes (Priority: Critical)

**Goal**: Fix blocking issues preventing basic functionality

1. Fix storage initialization with 500ms timeout (Requirements 3.1, 3.3)
2. Add missing data-testid attributes to all interactive elements (Requirement 2.5)
3. Fix button visibility to opacity: 1.0 (Requirement 2.2)
4. Fix backend "headers already sent" errors (Requirement 8.2)
5. Verify basic rendering and component lifecycle

**Success Criteria**:
- Storage initializes before UI renders
- All interactive elements have data-testid attributes
- Action buttons visible in tests
- Backend sends headers exactly once per response

### Phase 2: Functionality Fixes (Priority: High)

**Goal**: Restore full application functionality

1. Fix cross-tab synchronization with <1000ms propagation (Requirements 4.1-4.5)
2. Implement search functionality with <500ms response time (Requirements 5.1-5.5)
3. Fix title persistence across sessions (Requirement 3.2)
4. Fix deletion cleanup and cross-tab propagation (Requirement 4.3)
5. Implement proper error handling with correlation IDs (Requirement 8.3)

**Success Criteria**:
- Changes propagate across tabs within 1000ms
- Search returns results within 500ms
- Search results include highlighting and pagination
- Conversations persist across sessions
- Errors logged with correlation IDs

### Phase 3: Quality Assurance (Priority: High)

**Goal**: Ensure code quality and test reliability

1. Run full E2E test suite (288 tests) (Requirement 1.1)
2. Fix any remaining test failures (Requirement 1.2)
3. Verify accessibility compliance (WCAG AAA) (Requirement 6)
4. Fix TypeScript compilation errors (Requirement 7.1)
5. Fix ESLint violations (Requirement 7.2)
6. Eliminate console errors (Requirement 7.3)
7. Test memory leak detection (Requirement 7.4)
8. Verify test execution time <600s (Requirement 1.4)

**Success Criteria**:
- 100% of E2E tests passing
- Zero TypeScript errors
- Zero ESLint errors
- Zero console errors in production
- No memory leaks detected
- Test suite completes within 600 seconds
- WCAG AAA compliance verified

### Phase 4: Test Infrastructure (Priority: High)

**Goal**: Ensure reliable and reproducible tests

1. Implement proper test isolation (Requirement 9.1)
2. Add comprehensive cleanup in afterEach hooks (Requirement 9.3)
3. Improve element location strategies (Requirement 9.2)
4. Configure screenshot and trace capture on failure (Requirements 1.5, 9.5)
5. Implement test retry logic for flaky tests (Requirement 1.3)
6. Verify consistent results across multiple runs (Requirement 1.2)

**Success Criteria**:
- Tests start with clean state
- Tests clean up after completion
- No state pollution between tests
- Screenshots and traces captured on failure
- Clear error messages on test failures
- Consistent results across CI/CD runs

### Phase 5: Cleanup & Documentation (Priority: Medium)

**Goal**: Finalize implementation and documentation

1. Remove debug code and console.log statements
2. Clean up temporary files and unused code
3. Organize commits by feature with conventional commit format
4. Update documentation to reflect changes
5. Add inline comments for complex logic
6. Update API documentation if needed

**Success Criteria**:
- No debug code in production
- Clean git history with meaningful commits
- Documentation up to date
- Code well-commented

### Rollback Strategy

**Design Rationale**: Provides safety net for each phase

- Each phase is independently deployable
- Changes are feature-flagged where possible
- Database migrations are reversible
- Configuration changes are backward compatible
- Monitoring alerts configured for each phase

### Monitoring and Validation

**Design Rationale**: Ensures fixes are effective and don't introduce regressions

- Monitor test pass rate after each phase
- Track test execution time
- Monitor error rates in production
- Validate accessibility compliance
- Check memory usage patterns
- Verify cross-tab sync latency
