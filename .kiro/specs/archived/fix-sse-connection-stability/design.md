# Design Document

## Overview

This design document outlines the technical approach to fix SSE (Server-Sent Events) connection stability issues in the Claude-to-Azure OpenAI Proxy application. The solution focuses on three key areas: connection lifecycle management, message routing reliability, and error handling robustness.

## Current State Analysis

### Identified Issues

1. **Premature Connection Termination**: SSE connections establish successfully (HTTP 200) but immediately abort (net::ERR_ABORTED)
2. **Message Routing Failure**: Backend completes streaming responses, but Frontend never receives the data
3. **State Synchronization**: Frontend remains in "STREAMING..." state indefinitely
4. **Connection Lifecycle**: No clear mechanism to keep connections alive between message sends

### Root Cause Hypothesis

Based on code analysis and testing, the primary issues are:

1. **Connection Timing**: Frontend may be establishing multiple SSE connections that conflict with each other
2. **Event Handler Registration**: Frontend event handlers may not be properly registered before messages arrive
3. **Connection Cleanup**: Connections may be prematurely closed by cleanup routines or error handlers
4. **Message Buffering**: SSE messages may be sent before the connection is fully ready to receive them

## Architecture

### High-Level Flow

```
┌─────────────┐                    ┌─────────────┐
│   Frontend  │                    │   Backend   │
│             │                    │             │
│ ChatInterface│                   │ Express API │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │ 1. GET /api/chat/stream/:id     │
       │─────────────────────────────────>│
       │                                  │
       │ 2. SSE Connection (200 OK)      │
       │<─────────────────────────────────│
       │    Headers: text/event-stream    │
       │                                  │
       │ 3. Initial "start" event        │
       │<─────────────────────────────────│
       │    data: {type:"start",...}      │
       │                                  │
       │ 4. POST /api/chat/send          │
       │─────────────────────────────────>│
       │    {message, model, convId}      │
       │                                  │
       │ 5. Find SSE connection          │
       │                                  │─┐
       │                                  │ │ Lookup by
       │                                  │<┘ session+conv
       │                                  │
       │ 6. Stream "chunk" events        │
       │<─────────────────────────────────│
       │    data: {type:"chunk",...}      │
       │    (multiple times)              │
       │                                  │
       │ 7. Final "end" event            │
       │<─────────────────────────────────│
       │    data: {type:"end",...}        │
       │                                  │
```

### Component Architecture

```
Frontend Components:
┌────────────────────────────────────────┐
│ ChatInterface (React Component)        │
│  - Manages UI state                    │
│  - Handles user interactions           │
└────────────┬───────────────────────────┘
             │
             ├─> ChatService
             │    - Sends messages via POST
             │    - Manages SSE connections
             │
             └─> ChatSSEClient
                  - Establishes SSE connection
                  - Handles events (start/chunk/end)
                  - Manages reconnection logic

Backend Components:
┌────────────────────────────────────────┐
│ Express Routes                         │
│  - GET /api/chat/stream/:id            │
│  - POST /api/chat/send                 │
└────────────┬───────────────────────────┘
             │
             ├─> SSE Connection Manager
             │    - Tracks active connections
             │    - Maps session+conv to connection
             │    - Sends SSE messages
             │
             └─> StreamingService
                  - Processes chat requests
                  - Generates streaming responses
                  - Routes to SSE connections
```

## Components and Interfaces

### Frontend: ChatSSEClient

**Location**: `apps/frontend/src/services/chat.ts`

**Purpose**: Manage SSE connection lifecycle for a single conversation using `@microsoft/fetch-event-source`

**Current Implementation**:
```typescript
class ChatSSEClient {
  private conversationId: string;
  private abortController: AbortController | null = null;
  private connectionState: SSEConnectionState = 'disconnected';
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;
  private manualDisconnect: boolean = false;
  private lastMessageTimestamp: number = 0;
  private eventListeners: Partial<ChatEvents> = {};
  
  // Establish SSE connection
  connect(): void
  
  // Gracefully disconnect
  disconnect(): void
  
  // Force reconnection
  forceReconnect(): void
  
  // Get current connection state
  getConnectionState(): SSEConnectionState
  
  // Get connection health metrics
  getConnectionHealth(): ConnectionHealth
  
  // Event registration
  on<K extends keyof ChatEvents>(event: K, listener: ChatEvents[K]): void
  off<K extends keyof ChatEvents>(event: K): void
}
```

**Critical Fix Areas**:

1. **Connection Lifecycle Management**:
   - **Issue**: `fetchEventSource` may be called multiple times due to React re-renders
   - **Fix**: Add connection state check before calling `fetchEventSource`
   - **Implementation**: Check if `abortController` exists and connection is active before creating new connection

2. **Event Handler Registration Timing**:
   - **Issue**: Event handlers may not be registered before SSE messages arrive
   - **Fix**: Ensure all event handlers are registered in `connect()` before `fetchEventSource` is called
   - **Implementation**: Move event listener setup to top of `connect()` method

3. **Premature Disconnection Prevention**:
   - **Issue**: Connection closes immediately after establishment
   - **Fix**: Properly handle `onopen` callback and avoid closing on transient errors
   - **Implementation**: Only set `manualDisconnect = true` when user explicitly disconnects

4. **Reconnection Logic**:
   - **Issue**: Reconnection may trigger too aggressively or not at all
   - **Fix**: Implement exponential backoff with proper error classification
   - **Implementation**: Classify errors as retryable/non-retryable before attempting reconnection

5. **AbortController Management**:
   - **Issue**: AbortController may be reused or not properly cleaned up
   - **Fix**: Create new AbortController for each connection attempt
   - **Implementation**: Always create fresh AbortController in `connect()` and properly clean up in `disconnect()`

### Frontend: ChatService

**Location**: `apps/frontend/src/services/chat.ts`

**Purpose**: Coordinate message sending and SSE connection management with singleton pattern

**Current Implementation**:
```typescript
class ChatService {
  private static instance: ChatService | null = null;
  private readonly sessionManager = getSessionManager();
  private readonly activeConnections = new Map<string, ChatSSEClient>();
  
  // Singleton accessor
  static getInstance(): ChatService
  
  // Send message and return immediately
  async sendMessage(request: SendMessageRequest): Promise<{messageId, correlationId}>
  
  // Get or create SSE connection for conversation
  getSSEConnection(conversationId: string): ChatSSEClient
  
  // Disconnect specific conversation
  disconnectSSE(conversationId: string): void
}
```

**Critical Fix Areas**:

1. **Connection Establishment Timing**:
   - **Issue**: Messages may be sent before SSE connection is fully established
   - **Fix**: Wait for connection state to be 'connected' before sending message
   - **Implementation**: Add connection readiness check in `sendMessage()` with timeout

2. **Connection Pooling and Reuse**:
   - **Issue**: Multiple ChatSSEClient instances may be created for same conversation
   - **Fix**: Properly check `activeConnections` map before creating new instance
   - **Implementation**: Return existing connection if already in map and active

3. **Connection State Synchronization**:
   - **Issue**: UI may not reflect actual connection state
   - **Fix**: Propagate connection state changes from ChatSSEClient to UI
   - **Implementation**: Subscribe to ChatSSEClient events and update UI state

4. **Error Propagation**:
   - **Issue**: Connection errors may not reach UI layer
   - **Fix**: Implement error callback chain from ChatSSEClient → ChatService → UI
   - **Implementation**: Add error event listeners and propagate to React components

5. **Cleanup on Component Unmount**:
   - **Issue**: Connections may not be cleaned up when components unmount
   - **Fix**: Implement proper cleanup in React useEffect cleanup function
   - **Implementation**: Call `disconnectSSE()` in component cleanup

### Backend: SSE Connection Manager

**Location**: `apps/backend/src/routes/chat-stream.ts`

**Purpose**: Track and manage all active SSE connections with session isolation

**Current Implementation**:

**Data Structures**:
```typescript
// Active connections map
const sseConnections = new Map<string, SSEConnection>();

// Session to connections mapping
const sessionConnections = new Map<string, Set<string>>(); // sessionId -> connectionIds

interface SSEConnection {
  readonly id: string;
  readonly sessionId: string;
  readonly conversationId: string;
  readonly response: Response;
  readonly createdAt: Date;
  readonly correlationId: string;
  isActive: boolean;
}

// Configuration
const SSE_CONFIG = {
  maxConnectionsPerSession: 5,
  connectionTimeout: 30 * 60 * 1000, // 30 minutes
  heartbeatInterval: 30 * 1000, // 30 seconds
  cleanupInterval: 60 * 1000, // 1 minute
  maxMessageSize: 100000, // 100KB
};
```

**Key Functions**:
```typescript
// Send SSE message to specific connection
function sendSSEMessage(connectionId: string, data: StreamChunk): boolean

// Close connection and cleanup
function closeSSEConnection(connectionId: string, reason: string): void

// Clean up inactive connections
function cleanupInactiveConnections(): void

// Send heartbeat to all connections
function sendHeartbeat(): void
```

**Critical Fix Areas**:

1. **Connection Lookup Efficiency**:
   - **Current**: Linear search through all connections to find by session+conversation
   - **Issue**: O(n) lookup time for message routing
   - **Fix**: Add secondary index for faster lookup
   - **Implementation**: Create `Map<sessionId_conversationId, connectionId>` for O(1) lookup

2. **Initial Connection Message**:
   - **Current**: Sends initial "start" message immediately after connection
   - **Issue**: Message may be sent before client is ready to receive
   - **Fix**: Add small delay or wait for client acknowledgment
   - **Implementation**: Send initial message after 100ms delay or on first heartbeat

3. **Response Header Management**:
   - **Current**: Sets SSE headers correctly with `text/event-stream`
   - **Issue**: May need additional headers for browser compatibility
   - **Fix**: Add `X-Accel-Buffering: no` for nginx compatibility
   - **Implementation**: Add header in `chatSSEHandler`

4. **Connection Cleanup Timing**:
   - **Current**: Cleanup runs every 60 seconds
   - **Issue**: Inactive connections may persist too long
   - **Fix**: Implement immediate cleanup on error + periodic cleanup
   - **Implementation**: Call `closeSSEConnection` immediately on write errors

5. **Heartbeat Message Format**:
   - **Current**: Sends empty chunk with type 'chunk'
   - **Issue**: May confuse client message handlers
   - **Fix**: Use dedicated heartbeat message type
   - **Implementation**: Add 'heartbeat' type to StreamChunk union

6. **Error Handling in sendSSEMessage**:
   - **Current**: Catches write errors and closes connection
   - **Issue**: May not handle all error scenarios
   - **Fix**: Add comprehensive error classification
   - **Implementation**: Distinguish between transient and permanent errors

### Backend: StreamingService

**Location**: `apps/backend/src/services/streaming-service.ts`

**Purpose**: Process streaming chat requests with model routing and provider abstraction

**Current Implementation**:
```typescript
class StreamingService {
  private readonly modelRoutingService = getModelRoutingService();
  private readonly contextService = getContextManagementService();
  private readonly activeStreams = new Map<string, AbortController>();
  
  // Process streaming request with model routing
  async processStreamingRequest(
    request: ChatStreamRequest,
    handler: StreamingResponseHandler,
    correlationId: string
  ): Promise<void>
  
  // Cancel active stream
  cancelStream(messageId: string): boolean
  
  // Get active stream count
  getActiveStreamCount(): number
  
  // Provider-specific streaming
  private async processAzureOpenAIStream(...): Promise<void>
  private async processAWSBedrockStream(...): Promise<void>
}

interface StreamingResponseHandler {
  onStart(messageId: string, model: string): void;
  onChunk(content: string, messageId: string): void;
  onEnd(messageId: string, usage?: StreamChunk['usage']): void;
  onError(error: string, messageId: string): void;
}
```

**Critical Fix Areas**:

1. **Handler Invocation Order**:
   - **Current**: Calls onStart, then onChunk multiple times, then onEnd
   - **Issue**: onStart may be called twice (once in chat-stream.ts, once in streaming-service.ts)
   - **Fix**: Remove duplicate onStart call
   - **Implementation**: Only call onStart in `processStreamingResponse()` in chat-stream.ts

2. **Azure OpenAI Stream Processing**:
   - **Current**: Uses axios with responseType: 'stream' and processes data events
   - **Issue**: SSE parsing may not handle all edge cases (partial chunks, malformed data)
   - **Fix**: Implement robust SSE parser with buffer management
   - **Implementation**: Accumulate partial chunks and parse complete SSE messages

3. **Error Propagation**:
   - **Current**: Catches errors and calls handler.onError
   - **Issue**: Some errors may not be caught (e.g., network errors after stream starts)
   - **Fix**: Add error handlers for all async operations
   - **Implementation**: Wrap all async calls in try-catch and add stream error handlers

4. **Completion Guarantee**:
   - **Current**: Calls onEnd when stream completes
   - **Issue**: onEnd may not be called if stream is aborted or errors occur
   - **Fix**: Use finally block to ensure completion
   - **Implementation**: Add finally block that calls onEnd or onError

5. **AbortController Management**:
   - **Current**: Stores AbortController in activeStreams map
   - **Issue**: May not be cleaned up if stream completes normally
   - **Fix**: Always clean up AbortController in finally block
   - **Implementation**: Move cleanup to finally block in `processStreamingRequest()`

6. **Stream Data Parsing**:
   - **Current**: Splits by '\n' and looks for 'data: ' prefix
   - **Issue**: May not handle CRLF line endings or multiple data lines
   - **Fix**: Implement proper SSE event parsing
   - **Implementation**: Use state machine to parse SSE events correctly

## Data Models

### SSE Message Format

All SSE messages follow this structure:

```typescript
interface StreamChunk {
  type: 'start' | 'chunk' | 'end' | 'error';
  content?: string;           // For chunk and error types
  messageId?: string;         // For all types except heartbeat
  correlationId: string;      // For request tracing
  timestamp: number;          // Unix timestamp in milliseconds
  model?: string;             // For start type
  usage?: {                   // For end type
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}
```

**Wire Format**:
```
data: {"type":"start","messageId":"msg_123","correlationId":"corr_456","timestamp":1699999999999,"model":"gpt-4o"}

data: {"type":"chunk","content":"Hello","messageId":"msg_123","correlationId":"corr_456","timestamp":1699999999999}

data: {"type":"end","messageId":"msg_123","correlationId":"corr_456","timestamp":1699999999999,"usage":{"inputTokens":10,"outputTokens":20,"totalTokens":30}}

```

### Connection State Machine

```
┌─────────────┐
│ disconnected│
└──────┬──────┘
       │ connect()
       ▼
┌─────────────┐
│ connecting  │
└──────┬──────┘
       │ onopen (success)
       ▼
┌─────────────┐     ┌──────────────┐
│  connected  │────>│ reconnecting │
└──────┬──────┘     └──────┬───────┘
       │                   │
       │ onerror           │ retry
       ▼                   │
┌─────────────┐            │
│    error    │<───────────┘
└──────┬──────┘
       │ disconnect()
       ▼
┌─────────────┐
│ disconnected│
└─────────────┘
```

## Error Handling

### Error Classification

1. **Transient Errors** (Retryable):
   - Network timeouts
   - Connection refused
   - Server 5xx errors
   - Temporary DNS failures

2. **Permanent Errors** (Non-retryable):
   - Authentication failures (401)
   - Invalid session (403)
   - Invalid conversation ID (400)
   - Server explicitly closing connection

3. **Client Errors**:
   - Browser tab closed
   - User navigated away
   - Manual disconnect

### Error Handling Strategy

```typescript
// Frontend error handling
class ChatSSEClient {
  private handleConnectionError(error: NetworkError): void {
    // 1. Classify error
    const isRetryable = this.classifyError(error);
    
    // 2. Update state
    this.setConnectionState('error');
    
    // 3. Emit error event
    this.eventListeners.connectionError?.(error);
    
    // 4. Decide on retry
    if (isRetryable && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    } else {
      // Give up, show error to user
      this.setConnectionState('disconnected');
    }
  }
}
```

### Backend Error Handling

```typescript
// Backend error handling
function processStreamingResponse(
  connectionId: string,
  messageId: string,
  request: ChatStreamRequest,
  correlationId: string
): Promise<void> {
  try {
    // Process request
    await streamingService.processStreamingRequest(request, handler, correlationId);
  } catch (error) {
    // Log error
    logger.error('Streaming failed', correlationId, { error });
    
    // Send error to client
    const errorMessage: StreamChunk = {
      type: 'error',
      content: sanitizeError(error),
      messageId,
      correlationId,
      timestamp: Date.now(),
    };
    sendSSEMessage(connectionId, errorMessage);
  }
}
```

## Testing Strategy

### MCP Tool Validation (Critical)

**Purpose**: Use Chrome DevTools MCP to validate SSE connection stability and message flow in real browser environment

**Validation Steps**:

1. **Connection Establishment Validation**:
   - Use `mcp_chrome_devtools_navigate_page` to open frontend
   - Use `mcp_chrome_devtools_take_snapshot` to verify UI state
   - Use `mcp_chrome_devtools_list_network_requests` to verify SSE connection (HTTP 200)
   - Use `mcp_chrome_devtools_get_network_request` to inspect SSE connection details
   - **Success Criteria**: SSE connection established with status 200 and remains open

2. **Message Flow Validation**:
   - Use `mcp_chrome_devtools_click` to interact with chat interface
   - Use `mcp_chrome_devtools_fill` to input test message
   - Use `mcp_chrome_devtools_wait_for` to wait for streaming response
   - Use `mcp_chrome_devtools_list_console_messages` to check for errors
   - Use `mcp_chrome_devtools_take_snapshot` to verify message display
   - **Success Criteria**: Message sent successfully, streaming chunks received, response displayed

3. **Connection Stability Validation**:
   - Send multiple messages in sequence (5+ messages)
   - Verify SSE connection remains stable throughout
   - Check network requests for any connection drops or reconnections
   - Monitor console for connection errors
   - **Success Criteria**: Single SSE connection maintained, no reconnections, no errors

4. **Error Handling Validation**:
   - Simulate network errors (if possible)
   - Verify error messages displayed to user
   - Verify reconnection attempts
   - **Success Criteria**: Clear error messages, automatic reconnection works

**Validation Requirements**:
- **MUST** validate after each code change
- **MUST** fix any issues found before proceeding
- **MUST** evaluate fix quality - no arbitrary feature removal or UI degradation
- **MUST** ensure all functionality works as designed

**Fix Evaluation Criteria**:
1. **Completeness**: Does the fix address the root cause?
2. **Quality**: Is the fix robust and maintainable?
3. **Impact**: Does the fix introduce new issues?
4. **User Experience**: Does the fix maintain or improve UX?
5. **Performance**: Does the fix impact performance negatively?

**Prohibited Actions**:
- ❌ Removing features to "fix" issues
- ❌ Degrading UI/UX to avoid complexity
- ❌ Ignoring edge cases or error scenarios
- ❌ Accepting partial solutions without full validation

### Unit Tests

1. **ChatSSEClient Tests** (`apps/frontend/src/test/chat-sse.test.ts`):
   - Connection establishment with state validation
   - Event handler registration and invocation order
   - Reconnection logic with exponential backoff
   - State transitions (disconnected → connecting → connected → error)
   - Cleanup on disconnect (AbortController, event listeners)
   - Multiple connection prevention
   - Manual disconnect flag behavior

2. **SSE Connection Manager Tests**:
   - Connection storage and retrieval with session isolation
   - Message sending with connection validation
   - Connection cleanup on timeout and error
   - Heartbeat mechanism
   - Connection limit enforcement (5 per session)
   - Secondary index for fast lookup

3. **StreamingService Tests**:
   - Request processing with model routing
   - Handler invocation order (onStart → onChunk → onEnd)
   - Error propagation through handler chain
   - AbortController cleanup
   - Completion guarantee (always onEnd or onError)

### Integration Tests

1. **End-to-End SSE Flow**:
   - Establish SSE connection
   - Send message via POST /api/chat/send
   - Receive streaming response through SSE
   - Complete successfully with usage stats
   - Verify message stored in conversation history

2. **Error Recovery**:
   - Connection drops mid-stream
   - Reconnection succeeds with exponential backoff
   - Message history preserved
   - Conversation state maintained

3. **Multiple Connections**:
   - Multiple conversations in same session
   - Messages route to correct connections
   - Independent connection lifecycles
   - Connection limit enforcement

4. **Connection Lifecycle**:
   - Connection establishment timing
   - Heartbeat keeps connection alive
   - Graceful disconnection on user action
   - Automatic cleanup on timeout

### Browser Compatibility Tests

**Test Matrix**: Latest 2 versions of each browser

1. **Chrome (latest 2 versions)**:
   - SSE connection stability (30+ minutes)
   - Message reception and display
   - Reconnection behavior on network issues
   - Performance under load

2. **Firefox (latest 2 versions)**:
   - SSE connection stability
   - Message reception and display
   - Reconnection behavior
   - Memory usage

3. **Safari (latest 2 versions)**:
   - SSE connection stability
   - Message reception and display
   - Reconnection behavior
   - iOS Safari compatibility

**Browser-Specific Considerations**:
- Chrome: Connection pooling limits (6 per domain)
- Firefox: SSE timeout behavior
- Safari: Background tab connection handling

## Performance Considerations

### Connection Pooling

- Reuse SSE connections across component re-renders
- Implement connection reference counting
- Only close connections when truly no longer needed

### Message Buffering

- Buffer messages on backend if connection temporarily unavailable
- Implement bounded buffer (max 100 messages)
- Drop oldest messages if buffer full

### Memory Management

- Limit maximum connections per session (5)
- Automatic cleanup of stale connections (30 minutes)
- Periodic garbage collection of closed connections

## Security Considerations

### Authentication

- Validate session ID on every SSE connection request
- Reject connections with invalid or expired sessions
- Include session validation in message send requests

### Rate Limiting

- Enforce connection limits per session
- Rate limit message send requests
- Prevent connection flooding attacks

### Data Sanitization

- Sanitize error messages before sending to client
- Remove sensitive information from logs
- Validate all message content

## Deployment Strategy

### Phased Rollout

1. **Phase 1**: Fix critical connection stability issues
   - Prevent premature disconnections
   - Ensure message routing works

2. **Phase 2**: Improve error handling and recovery
   - Implement robust reconnection logic
   - Add comprehensive error messages

3. **Phase 3**: Add monitoring and observability
   - Connection health metrics
   - Diagnostic endpoints
   - Enhanced logging

### Rollback Plan

- Keep existing SSE implementation as fallback
- Feature flag to enable/disable new implementation
- Monitor error rates and connection success metrics
- Rollback if error rate exceeds 5%

## Monitoring and Observability

### Key Metrics

1. **Connection Metrics**:
   - Total SSE connections established
   - Active SSE connections
   - Average connection duration
   - Connection error rate

2. **Message Metrics**:
   - Messages sent per second
   - Message delivery success rate
   - Average message latency
   - Failed message routing attempts

3. **Error Metrics**:
   - Connection errors by type
   - Reconnection attempts
   - Reconnection success rate
   - Permanent failures

### Logging Strategy

- Log all connection lifecycle events with correlation IDs
- Log message routing decisions
- Log error details with stack traces
- Use structured logging for easy querying

### Diagnostic Endpoints

1. `GET /api/chat-stats`: Overall SSE statistics
2. `GET /api/chat/connections`: Active connections for current session
3. `GET /api/health`: Include SSE health in overall health check

## Migration Path

### Backward Compatibility

- Maintain existing API contracts
- No breaking changes to message formats
- Graceful degradation if SSE unavailable

### Database Changes

- No database schema changes required
- All state is in-memory

### Configuration Changes

- Add SSE configuration options to environment variables
- Document new configuration parameters
- Provide sensible defaults

## Fix Quality Evaluation Framework

### Evaluation Principles

Every fix MUST be evaluated against these criteria before being considered acceptable:

1. **Root Cause Analysis**:
   - Does the fix address the actual root cause, not just symptoms?
   - Have we identified why the issue occurs?
   - Are there related issues that should be addressed together?

2. **Solution Completeness**:
   - Does the fix fully resolve the issue?
   - Are all edge cases handled?
   - Does the fix work across all supported browsers?
   - Are error scenarios properly handled?

3. **Code Quality**:
   - Is the fix maintainable and readable?
   - Does it follow existing code patterns?
   - Are there adequate comments explaining complex logic?
   - Does it pass all linting and type checks?

4. **User Experience**:
   - Does the fix maintain or improve UX?
   - Are error messages clear and actionable?
   - Is the UI responsive and intuitive?
   - Are loading states properly communicated?

5. **Performance Impact**:
   - Does the fix introduce performance regressions?
   - Are there unnecessary re-renders or re-connections?
   - Is memory usage reasonable?
   - Are network requests optimized?

6. **Testing Coverage**:
   - Are there unit tests for the fix?
   - Are there integration tests?
   - Has the fix been validated with MCP tools?
   - Have edge cases been tested?

### Prohibited Fix Patterns

These approaches are **NOT ACCEPTABLE** and must be avoided:

❌ **Feature Removal**: Removing functionality to avoid fixing issues
- Example: Removing reconnection logic because it's buggy
- Correct approach: Fix the reconnection logic properly

❌ **UI Degradation**: Simplifying UI to avoid complexity
- Example: Removing connection status indicator
- Correct approach: Fix the status indicator to show accurate state

❌ **Error Suppression**: Hiding errors instead of handling them
- Example: Catching errors and doing nothing
- Correct approach: Proper error handling with user feedback

❌ **Partial Solutions**: Accepting incomplete fixes
- Example: Fixing only Chrome, ignoring Firefox/Safari
- Correct approach: Ensure cross-browser compatibility

❌ **Workarounds**: Implementing hacky workarounds instead of proper fixes
- Example: Adding arbitrary delays to "fix" timing issues
- Correct approach: Understand and fix the actual timing problem

❌ **Scope Reduction**: Narrowing requirements to make fix easier
- Example: Changing "30 minutes" stability to "5 minutes"
- Correct approach: Achieve the original requirement

### Fix Validation Process

1. **Code Review**:
   - Review code changes against evaluation criteria
   - Ensure no prohibited patterns are used
   - Verify code quality and maintainability

2. **Automated Testing**:
   - Run unit tests and verify coverage
   - Run integration tests
   - Check TypeScript and ESLint

3. **MCP Tool Validation**:
   - Test connection establishment
   - Test message flow (5+ messages)
   - Test error handling
   - Test reconnection behavior
   - Verify no console errors

4. **Manual Testing**:
   - Test in Chrome, Firefox, Safari
   - Test various network conditions
   - Test edge cases
   - Verify user experience

5. **Performance Validation**:
   - Check connection establishment time
   - Verify message latency
   - Monitor memory usage
   - Check for memory leaks

### Decision Making Framework

When evaluating fix options, use this framework:

1. **Identify Options**: List all possible approaches to fix the issue
2. **Evaluate Each Option**: Score against evaluation criteria (1-5)
3. **Compare Trade-offs**: Understand pros/cons of each approach
4. **Select Best Option**: Choose option with highest overall score
5. **Document Decision**: Record why this option was chosen
6. **Implement and Validate**: Implement fix and validate thoroughly

### Example Evaluation

**Issue**: SSE connection closes immediately after establishment

**Option 1**: Add delay before sending initial message
- Root Cause: ⭐⭐⭐ (Addresses timing issue)
- Completeness: ⭐⭐⭐ (Works but not ideal)
- Code Quality: ⭐⭐⭐⭐ (Simple, maintainable)
- UX: ⭐⭐⭐⭐ (No impact)
- Performance: ⭐⭐⭐ (Adds latency)
- **Total: 16/25**

**Option 2**: Wait for client acknowledgment before sending
- Root Cause: ⭐⭐⭐⭐⭐ (Proper synchronization)
- Completeness: ⭐⭐⭐⭐⭐ (Robust solution)
- Code Quality: ⭐⭐⭐⭐ (More complex but clean)
- UX: ⭐⭐⭐⭐⭐ (No impact)
- Performance: ⭐⭐⭐⭐⭐ (Optimal)
- **Total: 24/25** ✅ **Selected**

**Option 3**: Remove initial message
- Root Cause: ⭐ (Avoids issue, doesn't fix)
- Completeness: ⭐⭐ (Incomplete)
- Code Quality: ⭐⭐⭐ (Simple but wrong)
- UX: ⭐⭐ (Degrades experience)
- Performance: ⭐⭐⭐⭐⭐ (Fast but wrong)
- **Total: 13/25** ❌ **Rejected** (Feature removal)

## Implementation Plan Summary

### Phase 1: Critical Connection Stability Fixes (Priority: High)

1. **Frontend ChatSSEClient**:
   - Fix connection lifecycle to prevent multiple concurrent connections
   - Ensure event handlers are registered before fetchEventSource call
   - Implement proper AbortController management
   - Add connection state validation before creating new connections

2. **Backend SSE Connection Manager**:
   - Add secondary index for O(1) connection lookup
   - Fix initial message timing (add delay or acknowledgment)
   - Add nginx compatibility headers
   - Implement immediate cleanup on write errors

3. **Backend StreamingService**:
   - Remove duplicate onStart calls
   - Implement robust SSE parser with buffer management
   - Add completion guarantee with finally blocks
   - Fix AbortController cleanup

### Phase 2: Error Handling and Recovery (Priority: Medium)

1. **Frontend Error Classification**:
   - Implement retryable vs non-retryable error detection
   - Add exponential backoff for reconnection
   - Surface connection errors to UI with user-friendly messages

2. **Backend Error Handling**:
   - Add comprehensive error classification
   - Implement proper error propagation through handler chain
   - Add error recovery mechanisms

### Phase 3: Monitoring and Observability (Priority: Low)

1. **Metrics Collection**:
   - Add connection lifecycle metrics
   - Track message delivery success rates
   - Monitor reconnection attempts and success rates

2. **Diagnostic Endpoints**:
   - Enhance `/api/chat/connections` endpoint
   - Add `/api/chat-stats` for overall statistics
   - Include SSE health in `/api/health` endpoint

## Open Questions and Risks

### Open Questions

1. **Message Persistence**: Should we implement message persistence for offline scenarios?
   - **Decision**: Not in initial implementation; focus on connection stability first
   - **Rationale**: Adds complexity; can be added later if needed

2. **Message Delivery Latency**: What is the acceptable message delivery latency?
   - **Decision**: Target <100ms from backend generation to frontend reception
   - **Rationale**: Provides real-time feel without excessive optimization

3. **Multiple Connections**: Should we support multiple SSE connections per conversation?
   - **Decision**: No, one connection per conversation
   - **Rationale**: Simplifies message routing and state management

4. **Heartbeat Message Type**: Should heartbeat be a separate message type?
   - **Decision**: Yes, add 'heartbeat' type to StreamChunk
   - **Rationale**: Prevents confusion with actual content chunks

### Risks

1. **Browser Limitations**: Some browsers may have SSE connection limits (typically 6 per domain)
   - **Mitigation**: Document browser requirements, test thoroughly, limit connections per session to 5
   - **Impact**: Medium - affects users with many concurrent conversations

2. **Network Instability**: Mobile networks may cause frequent disconnections
   - **Mitigation**: Robust reconnection logic with exponential backoff, user feedback
   - **Impact**: High - affects mobile users significantly

3. **Server Load**: Many concurrent SSE connections may impact performance
   - **Mitigation**: Connection limits (5 per session), resource monitoring, horizontal scaling
   - **Impact**: Medium - can be addressed with infrastructure scaling

4. **Message Ordering**: Out-of-order message delivery could corrupt responses
   - **Mitigation**: Sequence numbers in messages, client-side ordering, single connection per conversation
   - **Impact**: Low - single connection ensures ordering

5. **React Re-render Issues**: Component re-renders may trigger multiple connection attempts
   - **Mitigation**: Connection state checks, singleton ChatService, proper useEffect dependencies
   - **Impact**: High - critical for stability

6. **SSE Parser Edge Cases**: Malformed SSE data or partial chunks may cause parsing errors
   - **Mitigation**: Robust SSE parser with buffer management, comprehensive error handling
   - **Impact**: Medium - affects reliability but not security

## Detailed Code Changes

### Frontend Changes

#### 1. ChatSSEClient Connection Lifecycle (`apps/frontend/src/services/chat.ts`)

**Current Issue**: Multiple connections may be created due to React re-renders

**Fix**:
```typescript
public connect(): void {
  // CRITICAL: Check if already connected or connecting
  if (this.connectionState === 'connected' || this.connectionState === 'connecting') {
    logger.warn('Connection already active, skipping connect()');
    return;
  }
  
  // CRITICAL: Check if abortController exists (indicates active connection)
  if (this.abortController && !this.abortController.signal.aborted) {
    logger.warn('AbortController exists, connection may be active');
    return;
  }
  
  // Reset state for new connection
  this.manualDisconnect = false;
  this.reconnectAttempts = 0;
  this.setConnectionState('connecting');
  
  // CRITICAL: Create fresh AbortController
  this.abortController = new AbortController();
  
  // Rest of connection logic...
}
```

#### 2. ChatSSEClient Event Handler Registration

**Current Issue**: Event handlers may not be registered before messages arrive

**Fix**: Move event listener setup to top of `connect()` method before `fetchEventSource` call

#### 3. ChatService Connection Readiness Check

**Current Issue**: Messages sent before connection is ready

**Fix**:
```typescript
public async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
  // Get or create SSE connection
  const sseConnection = this.getSSEConnection(request.conversationId);
  
  // CRITICAL: Wait for connection to be ready
  const maxWaitTime = 5000; // 5 seconds
  const startTime = Date.now();
  
  while (sseConnection.getConnectionState() !== 'connected') {
    if (Date.now() - startTime > maxWaitTime) {
      throw new Error('SSE connection timeout');
    }
    
    if (sseConnection.getConnectionState() === 'error') {
      throw new Error('SSE connection failed');
    }
    
    // Wait 100ms before checking again
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Now safe to send message...
}
```

### Backend Changes

#### 1. Connection Lookup Optimization (`apps/backend/src/routes/chat-stream.ts`)

**Current Issue**: O(n) lookup time for finding connections

**Fix**:
```typescript
// Add secondary index for fast lookup
const connectionIndex = new Map<string, string>(); // `${sessionId}_${conversationId}` -> connectionId

// In chatSSEHandler, after creating connection:
const indexKey = `${sessionId}_${conversationId}`;
connectionIndex.set(indexKey, connectionId);

// In sendChatMessageHandler, for fast lookup:
const indexKey = `${sessionId}_${conversationId}`;
const connectionId = connectionIndex.get(indexKey);
const targetConnection = connectionId ? sseConnections.get(connectionId) : undefined;
```

#### 2. Initial Message Timing Fix

**Current Issue**: Initial message sent before client ready

**Fix**:
```typescript
// In chatSSEHandler, after setting up connection:
// Delay initial message to ensure client is ready
setTimeout(() => {
  if (connection.isActive) {
    const initialMessage: StreamChunk = {
      type: 'start',
      correlationId,
      timestamp: Date.now(),
    };
    sendSSEMessage(connectionId, initialMessage);
  }
}, 100); // 100ms delay
```

#### 3. StreamingService Completion Guarantee

**Current Issue**: onEnd may not be called on errors

**Fix**:
```typescript
public async processStreamingRequest(
  request: ChatStreamRequest,
  handler: StreamingResponseHandler,
  correlationId: string
): Promise<void> {
  const messageId = uuidv4();
  const abortController = new AbortController();
  this.activeStreams.set(messageId, abortController);
  
  let completed = false;
  
  try {
    // Processing logic...
    completed = true;
  } catch (error) {
    handler.onError(error.message, messageId);
    completed = true;
  } finally {
    // CRITICAL: Always cleanup
    this.activeStreams.delete(messageId);
    
    // CRITICAL: Ensure completion if not already done
    if (!completed) {
      handler.onError('Stream terminated unexpectedly', messageId);
    }
  }
}
```

#### 4. SSE Parser Robustness

**Current Issue**: May not handle partial chunks correctly

**Fix**:
```typescript
// In processAzureOpenAIStream:
let buffer = '';

response.data.on('data', (chunk: Buffer) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  
  // Keep last incomplete line in buffer
  buffer = lines.pop() || '';
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6).trim();
      // Process data...
    }
  }
});
```

## Issue Discovery and Resolution Process

### Overview

During task execution, new issues may be discovered through implementation, testing, or validation. This section defines the process for handling discovered issues to ensure comprehensive resolution.

### Discovery Process

1. **During Implementation**: Issues found while writing code
2. **During Testing**: Issues found while running unit or integration tests
3. **During MCP Validation**: Issues found during browser-based validation
4. **During Code Review**: Issues found during peer review or self-review

### Documentation Requirements

When a new issue is discovered, the following information MUST be documented:

1. **Issue Description**: Clear, concise description of the problem
2. **Discovery Context**: Which task was being executed when issue was found
3. **Impact Assessment**: Severity and scope of the issue
4. **Root Cause**: Technical explanation of why the issue occurs
5. **Proposed Solution**: High-level approach to fix the issue

### Task Addition Process

1. **Create New Task**: Add task to tasks.md in appropriate section
2. **Include Metadata**:
   - Task number (following existing numbering scheme)
   - Clear task description
   - Related requirements references
   - Discovery note: "_Discovered during Task X validation/implementation_"
3. **Update Dependencies**: Adjust task dependencies if needed
4. **Prioritize**: Determine if issue is blocking or can be addressed later

### Example: Issues Discovered During Task 1

**Issue 1: Frequent connect() Calls**
- **Description**: React components call connect() every 5 seconds
- **Discovery**: Task 1.5 MCP validation
- **Impact**: Performance degradation, excessive logging
- **Root Cause**: useEffect dependencies not properly configured
- **Solution**: Add Task 1.6 to fix useEffect dependencies and add debounce

**Issue 2: Backend Message Validation Failure**
- **Description**: Backend returns "Invalid chat message request" error
- **Discovery**: Task 1.5 MCP validation when sending test message
- **Impact**: Messages cannot be sent, blocking core functionality
- **Root Cause**: express-validator rules may be too strict or incorrect
- **Solution**: Add Task 3.7 to investigate and fix validation logic

### Validation Requirements

Before marking all tasks as complete:

1. **Comprehensive Testing**: Run all tests (unit, integration, e2e)
2. **MCP Validation**: Perform full validation with Chrome DevTools MCP
3. **Cross-Browser Testing**: Verify in Chrome, Firefox, Safari
4. **Performance Testing**: Verify performance metrics meet requirements
5. **Issue Verification**: Confirm all discovered issues are resolved
6. **Success Criteria Check**: Verify all 10 success criteria are met

### Reopening Tasks

If a discovered issue affects a previously completed task:

1. **Reopen Task**: Change task status from completed to in_progress
2. **Document Regression**: Note what caused the regression
3. **Fix and Revalidate**: Fix the issue and re-run all validations
4. **Update Documentation**: Update validation reports with new findings

## Success Criteria

The SSE connection stability fix will be considered successful when:

1. ✅ SSE connections remain stable for at least 30 minutes without premature disconnection
2. ✅ Message delivery success rate exceeds 99% for established connections
3. ✅ Connection establishment completes within 2 seconds under normal network conditions
4. ✅ Reconnection succeeds within 3 attempts in 95% of transient failure cases
5. ✅ Test coverage exceeds 80% for SSE-related code (ChatSSEClient, connection manager, streaming service)
6. ✅ No TypeScript or ESLint errors in modified code
7. ✅ Works correctly in latest 2 versions of Chrome, Firefox, and Safari
8. ✅ User can complete a multi-turn conversation (5+ messages) without connection issues
9. ✅ Connection state accurately reflects actual connection status in UI
10. ✅ Error messages are clear and actionable for users
11. ✅ All discovered issues during implementation and validation are resolved
12. ✅ No unresolved issues remain after all tasks are completed


## Chat Interface UI Design

### Layout Structure

The chat interface follows the standard messaging application pattern with three main sections:

```
┌─────────────────────────────────────────────────────────┐
│ Header (Fixed)                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 📝 Conversation Title        [gpt-4o] [6 messages]  │ │
│ └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ Message Area (Scrollable, flex-grow)                   │
│ ┌─────────────────────────────────────────────────────┐ │
│ │                                                     │ │
│ │  ┌──────────────────────────────────────┐          │ │
│ │  │ 👤 User                    3分钟前    │          │ │
│ │  │ Hello, this is a test message        │          │ │
│ │  └──────────────────────────────────────┘          │ │
│ │                                                     │ │
│ │          ┌──────────────────────────────────────┐  │ │
│ │          │ 🤖 Assistant (gpt-4o)    3分钟前     │  │ │
│ │          │ Hello! How can I help you today?     │  │ │
│ │          └──────────────────────────────────────┘  │ │
│ │                                                     │ │
│ │  ┌──────────────────────────────────────┐          │ │
│ │  │ 👤 User                    2分钟前    │          │ │
│ │  │ Tell me more about...                │          │ │
│ │  └──────────────────────────────────────┘          │ │
│ │                                                     │ │
│ │          ┌──────────────────────────────────────┐  │ │
│ │          │ 🤖 Assistant (gpt-4o)    2分钟前     │  │ │
│ │          │ Sure! Let me explain... ▋            │  │ │
│ │          └──────────────────────────────────────┘  │ │
│ │                                                     │ │
│ └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ Input Area (Fixed at Bottom)                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ [📎] [输入您的消息...                        ] [→]  │ │
│ │      按 Enter 发送，Shift+Enter 换行                │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### CSS Layout Strategy

```css
/* Main container - full viewport height */
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* Header - fixed height */
.chat-header {
  flex-shrink: 0;
  height: 60px;
  border-bottom: 1px solid #e5e7eb;
}

/* Message area - grows to fill available space */
.message-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Input area - fixed at bottom */
.input-area {
  flex-shrink: 0;
  padding: 16px;
  border-top: 1px solid #e5e7eb;
  background: white;
}
```

### Message Styling

**User Messages (Right-aligned)**:
```css
.message-user {
  align-self: flex-end;
  max-width: 70%;
  background: #3b82f6;
  color: white;
  border-radius: 18px 18px 4px 18px;
  padding: 12px 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}
```

**AI Messages (Left-aligned)**:
```css
.message-assistant {
  align-self: flex-start;
  max-width: 70%;
  background: #f3f4f6;
  color: #1f2937;
  border-radius: 18px 18px 18px 4px;
  padding: 12px 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}
```

### Auto-Scroll Behavior

```typescript
// Scroll to bottom when new message arrives
const scrollToBottom = () => {
  const messageArea = messageAreaRef.current;
  if (messageArea) {
    messageArea.scrollTop = messageArea.scrollHeight;
  }
};

// Trigger on new message or streaming update
useEffect(() => {
  scrollToBottom();
}, [messages, streamingMessage]);

// Optional: Detect if user has scrolled up
const [isUserScrolling, setIsUserScrolling] = useState(false);

const handleScroll = () => {
  const messageArea = messageAreaRef.current;
  if (messageArea) {
    const isAtBottom = 
      messageArea.scrollHeight - messageArea.scrollTop <= 
      messageArea.clientHeight + 100; // 100px threshold
    setIsUserScrolling(!isAtBottom);
  }
};

// Only auto-scroll if user hasn't manually scrolled up
useEffect(() => {
  if (!isUserScrolling) {
    scrollToBottom();
  }
}, [messages, streamingMessage, isUserScrolling]);
```

### Streaming Indicator

```typescript
// Show typing indicator while streaming
{streamingMessage && (
  <div className="message-assistant streaming">
    <div className="message-header">
      <span className="avatar">🤖</span>
      <span className="name">Assistant</span>
      <span className="model">{selectedModel}</span>
    </div>
    <div className="message-content">
      {streamingMessage.content}
      <span className="cursor">▋</span>
    </div>
  </div>
)}
```

### Responsive Design

```css
/* Mobile adjustments */
@media (max-width: 768px) {
  .message-user,
  .message-assistant {
    max-width: 85%;
  }
  
  .message-area {
    padding: 12px;
    gap: 12px;
  }
}
```

### Accessibility Considerations

1. **Semantic HTML**: Use `<main>`, `<article>`, `<form>` for proper structure
2. **ARIA Labels**: Add `role="log"` to message area, `aria-live="polite"` for streaming
3. **Keyboard Navigation**: Ensure input field is easily accessible via Tab
4. **Screen Reader Support**: Announce new messages with proper context
5. **Focus Management**: Return focus to input after sending message

### Implementation Components

**ChatInterface.tsx** (Main component):
- Manages message state and streaming state
- Handles scroll behavior
- Renders header, message list, and input area

**MessageList.tsx** (Message display):
- Renders all messages in chronological order
- Handles auto-scroll logic
- Shows streaming indicator

**MessageBubble.tsx** (Individual message):
- Displays user or AI message with appropriate styling
- Shows avatar, name, timestamp
- Handles code blocks and formatting

**ChatInput.tsx** (Input area):
- Fixed position at bottom
- File attachment button
- Send button
- Keyboard shortcuts (Enter to send, Shift+Enter for newline)

### Key Design Decisions

1. **Fixed Input Position**: Input stays at bottom for easy access, similar to WhatsApp/Telegram
2. **Auto-Scroll with Override**: Automatically scroll to new messages unless user has scrolled up
3. **Message Bubbles**: Clear visual distinction between user and AI messages
4. **Streaming Cursor**: Animated cursor (▋) shows active streaming
5. **Responsive Width**: Messages take 70% width on desktop, 85% on mobile
6. **Smooth Scrolling**: Use `scroll-behavior: smooth` for better UX

## CSS Architecture for Scroll Functionality

### Problem Analysis

**Issue**: Message list container height is not properly constrained, causing scroll functionality to break.

**Symptoms**:
- `.message-list-container` expands to full content height (1835px) instead of being constrained by parent (548px)
- No scrollbar appears because `scrollHeight === clientHeight`
- Long messages are truncated and inaccessible
- Auto-scroll doesn't work because container isn't scrollable

**Root Cause**:
- `.message-list-container` has `height: 100%` in CSS
- This breaks the flex height constraint chain
- Container expands to content size instead of respecting parent constraints

### Solution Architecture

#### Flex Height Constraint Chain

For proper scrolling, we need a complete flex height constraint chain from viewport to scrollable container:

```
viewport (100vh)
  ↓ (height constraint)
.layout-container (display: flex, flex-direction: column, height: 100%)
  ↓ (flex: 1, min-height: 0)
.chat-interface (display: flex, flex-direction: column)
  ↓ (flex: 1, min-height: 0)
.chat-interface-content (display: flex, flex-direction: column)
  ↓ (flex: 1, min-height: 0)
.chat-messages (display: flex, flex-direction: column, overflow: hidden)
  ↓ (flex: 1, min-height: 0, overflow-y: auto)
.message-list-container (SCROLLABLE - constrained by parent)
```

#### Critical CSS Properties

**Parent Containers** (non-scrollable):
```css
.layout-container,
.chat-interface,
.chat-interface-content,
.chat-messages {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0; /* CRITICAL: Allows flex child to shrink below content size */
  overflow: hidden; /* Prevents parent from scrolling */
}
```

**Scrollable Container**:
```css
.message-list-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0; /* CRITICAL: Allows container to be constrained by parent */
  overflow-y: auto; /* Enables scrolling when content exceeds height */
  /* DO NOT USE: height: 100% - This breaks flex constraint */
}
```

#### Why `height: 100%` Breaks Scrolling

**With `height: 100%`**:
```
Parent: 548px available height
Child with height: 100%:
  - Tries to be 100% of parent (548px)
  - But content is 1835px
  - Result: Child expands to 1835px (content size)
  - Parent must accommodate child
  - No scrollbar because child.scrollHeight === child.clientHeight
```

**With `flex: 1` and `min-height: 0`**:
```
Parent: 548px available height
Child with flex: 1, min-height: 0:
  - Constrained to parent height (548px)
  - Content is 1835px
  - Result: Child stays at 548px (parent constraint)
  - Scrollbar appears because child.scrollHeight (1835px) > child.clientHeight (548px)
```

### Implementation Steps

#### Step 1: Fix MessageList.css

**File**: `apps/frontend/src/components/chat/MessageList.css`

**Change**:
```css
/* BEFORE (BROKEN) */
.message-list-container {
  display: flex;
  flex-direction: column;
  height: 100%; /* ❌ BREAKS SCROLLING */
  overflow-y: auto;
}

/* AFTER (FIXED) */
.message-list-container {
  display: flex;
  flex-direction: column;
  flex: 1; /* ✅ Allows growth within parent */
  min-height: 0; /* ✅ Allows shrinking below content size */
  overflow-y: auto; /* ✅ Enables scrolling */
  /* height: 100% removed - let flex handle sizing */
}
```

#### Step 2: Verify Parent Chain

**Files to verify**:
- `apps/frontend/src/components/layout/AppLayout.css`
- `apps/frontend/src/components/chat/ChatInterface.css`

**Required properties for each parent**:
```css
.parent-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden; /* or visible, but not auto/scroll */
}
```

#### Step 3: Validate Fix

**Validation criteria**:
1. `.message-list-container` height equals parent height (~548px)
2. `scrollHeight` exceeds `clientHeight` when content is long
3. Scrollbar appears and is functional
4. User can scroll to see all content
5. Auto-scroll works for new messages

**Validation script** (Chrome DevTools):
```javascript
const container = document.querySelector('.message-list-container');
const parent = container.parentElement;
return {
  container: {
    clientHeight: container.clientHeight,
    scrollHeight: container.scrollHeight,
    hasScrollbar: container.scrollHeight > container.clientHeight,
    computedHeight: window.getComputedStyle(container).height,
    computedFlex: window.getComputedStyle(container).flex,
    computedMinHeight: window.getComputedStyle(container).minHeight
  },
  parent: {
    clientHeight: parent.clientHeight,
    computedHeight: window.getComputedStyle(parent).height
  },
  isProperlyConstrained: container.clientHeight <= parent.clientHeight,
  canScroll: container.scrollHeight > container.clientHeight
};
```

### Auto-Scroll Implementation

Once scrolling is fixed, auto-scroll should work automatically with existing logic:

```typescript
// In MessageList.tsx
const scrollToBottom = () => {
  const container = messageListRef.current;
  if (container) {
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth'
    });
  }
};

// Auto-scroll on new messages
useEffect(() => {
  if (autoScrollEnabled) {
    scrollToBottom();
  }
}, [messages, streamingMessage, autoScrollEnabled]);

// Detect manual scroll
const handleScroll = () => {
  const container = messageListRef.current;
  if (container) {
    const isAtBottom = 
      container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    setAutoScrollEnabled(isAtBottom);
  }
};
```

### Common Pitfalls to Avoid

1. **❌ Using `height: 100%` on flex children**: Breaks flex constraint chain
2. **❌ Forgetting `min-height: 0`**: Prevents flex child from shrinking
3. **❌ Using `overflow: auto` on parent**: Creates nested scroll containers
4. **❌ Missing `display: flex` on parents**: Breaks flex layout
5. **❌ Using absolute positioning**: Removes element from flex flow

### Browser Compatibility

This flex-based scrolling approach works in:
- ✅ Chrome 29+ (2013)
- ✅ Firefox 28+ (2014)
- ✅ Safari 9+ (2015)
- ✅ Edge (all versions)

No browser-specific prefixes or workarounds needed.

## Accessibility Design Guidelines

### WCAG 2.2 AAA Compliance

All UI components must meet WCAG 2.2 Level AAA accessibility standards to ensure the application is usable by everyone, including users with visual impairments.

### Color Contrast Requirements

**WCAG 2.2 AAA Standards**:
- **Normal text** (< 18pt or < 14pt bold): Minimum 7:1 contrast ratio
- **Large text** (≥ 18pt or ≥ 14pt bold): Minimum 4.5:1 contrast ratio
- **UI components**: Minimum 3:1 contrast ratio

### Conversation List Accessibility

#### Problem: Insufficient Hover Contrast

**Current Issue**:
- Conversation list hover state has poor color contrast
- Text becomes difficult or impossible to read on hover
- Fails WCAG 2.2 AAA requirements
- Affects all users, not just those with visual impairments

**Impact**:
- Users cannot identify which conversation they're hovering over
- Text is unreadable in hover state
- Poor user experience for everyone
- Accessibility compliance violation

#### Solution: Accessible Color Palette

**Design Principles**:
1. Maintain brand identity while meeting accessibility standards
2. Ensure sufficient contrast in all interactive states
3. Provide clear visual feedback for all interactions
4. Support both keyboard and mouse navigation

**Color Palette Requirements**:

```css
/* Example accessible color scheme for conversation list */

/* Normal State */
.conversation-item {
  background-color: #FFFFFF; /* White background */
  color: #1F2937; /* Dark gray text - 12.6:1 contrast ✅ */
}

/* Hover State - MUST meet 7:1 contrast */
.conversation-item:hover {
  background-color: #3B82F6; /* Blue background */
  color: #FFFFFF; /* White text - 8.6:1 contrast ✅ */
  transition: background-color 0.2s ease, color 0.2s ease;
}

/* Focus State - Visible focus indicator */
.conversation-item:focus {
  outline: 2px solid #2563EB; /* Blue outline */
  outline-offset: 2px;
  /* Ensure outline has 3:1 contrast with background */
}

/* Active/Selected State */
.conversation-item.active {
  background-color: #DBEAFE; /* Light blue background */
  color: #1E40AF; /* Dark blue text - 7.2:1 contrast ✅ */
  border-left: 4px solid #3B82F6; /* Blue accent */
}

/* Disabled State (if applicable) */
.conversation-item:disabled {
  background-color: #F3F4F6; /* Light gray background */
  color: #9CA3AF; /* Medium gray text - 4.5:1 contrast ✅ */
  opacity: 0.6;
}
```

**Contrast Validation**:

| State | Background | Text | Contrast Ratio | WCAG AAA |
|-------|-----------|------|----------------|----------|
| Normal | #FFFFFF | #1F2937 | 12.6:1 | ✅ Pass |
| Hover | #3B82F6 | #FFFFFF | 8.6:1 | ✅ Pass |
| Focus | #FFFFFF | #1F2937 | 12.6:1 | ✅ Pass |
| Active | #DBEAFE | #1E40AF | 7.2:1 | ✅ Pass |
| Disabled | #F3F4F6 | #9CA3AF | 4.5:1 | ✅ Pass |

**Tools for Validation**:
- WebAIM Contrast Checker: https://webaim.org/resources/contrastchecker/
- Chrome DevTools Accessibility panel
- Lighthouse accessibility audit
- axe DevTools browser extension

### Keyboard Navigation

**Requirements**:
1. All interactive elements must be keyboard accessible
2. Focus indicators must be clearly visible (2px outline with 2px offset)
3. Focus order must be logical and predictable
4. Keyboard shortcuts must not conflict with browser/screen reader shortcuts

**Implementation**:

```typescript
// Keyboard navigation for conversation list
const ConversationList: React.FC = () => {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => Math.max(0, prev - 1));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => Math.min(conversations.length - 1, prev + 1));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        selectConversation(focusedIndex);
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(conversations.length - 1);
        break;
    }
  };

  useEffect(() => {
    itemRefs.current[focusedIndex]?.focus();
  }, [focusedIndex]);

  return (
    <div role="list" onKeyDown={handleKeyDown}>
      {conversations.map((conv, index) => (
        <div
          key={conv.id}
          ref={el => itemRefs.current[index] = el}
          role="listitem"
          tabIndex={index === focusedIndex ? 0 : -1}
          aria-selected={index === selectedIndex}
          className="conversation-item"
        >
          {conv.title}
        </div>
      ))}
    </div>
  );
};
```

### Screen Reader Support

**ARIA Labels and Semantic HTML**:

```tsx
// Conversation list with proper ARIA labels
<nav aria-label="Conversation list">
  <ul role="list">
    {conversations.map(conv => (
      <li key={conv.id} role="listitem">
        <button
          aria-label={`Conversation: ${conv.title}, ${conv.messageCount} messages, last updated ${conv.lastUpdated}`}
          aria-current={conv.id === selectedId ? 'page' : undefined}
          onClick={() => selectConversation(conv.id)}
        >
          <span className="conversation-title">{conv.title}</span>
          <span className="conversation-meta" aria-label="Message count">
            {conv.messageCount} messages
          </span>
          <time dateTime={conv.lastUpdated} aria-label="Last updated">
            {formatRelativeTime(conv.lastUpdated)}
          </time>
        </button>
      </li>
    ))}
  </ul>
</nav>
```

### Focus Management

**Best Practices**:
1. Return focus to trigger element after closing modals/dialogs
2. Trap focus within modals to prevent focus escaping
3. Announce dynamic content changes to screen readers
4. Maintain focus position when navigating between views

**Example: Focus Trap for Modal**:

```typescript
const Modal: React.FC = ({ isOpen, onClose, children }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Save current focus
      previousFocusRef.current = document.activeElement as HTMLElement;
      
      // Focus first focusable element in modal
      const firstFocusable = modalRef.current?.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) as HTMLElement;
      firstFocusable?.focus();
    } else {
      // Restore focus when modal closes
      previousFocusRef.current?.focus();
    }
  }, [isOpen]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
    
    // Trap focus within modal
    if (e.key === 'Tab') {
      const focusableElements = modalRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements?.[0] as HTMLElement;
      const lastElement = focusableElements?.[focusableElements.length - 1] as HTMLElement;
      
      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    }
  };

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
};
```

### Testing Checklist

**Automated Testing**:
- ✅ Run axe DevTools accessibility scan
- ✅ Run Lighthouse accessibility audit (score ≥ 95)
- ✅ Check color contrast with Chrome DevTools
- ✅ Validate ARIA labels and roles

**Manual Testing**:
- ✅ Navigate entire application using keyboard only
- ✅ Test with screen reader (NVDA, JAWS, or VoiceOver)
- ✅ Test at 200% browser zoom
- ✅ Test in different lighting conditions
- ✅ Test with high contrast mode enabled
- ✅ Verify focus indicators are visible
- ✅ Verify all interactive elements are reachable

**Browser Testing**:
- ✅ Chrome with ChromeVox
- ✅ Firefox with NVDA
- ✅ Safari with VoiceOver
- ✅ Edge with Narrator

### Accessibility Compliance Report Template

```markdown
# Accessibility Compliance Report

## Test Date
[Date]

## Tested By
[Name]

## WCAG 2.2 AAA Compliance

### Color Contrast
- [ ] Normal text: 7:1 minimum
- [ ] Large text: 4.5:1 minimum
- [ ] UI components: 3:1 minimum

### Keyboard Navigation
- [ ] All interactive elements keyboard accessible
- [ ] Focus indicators visible
- [ ] Logical focus order
- [ ] No keyboard traps

### Screen Reader Support
- [ ] Proper ARIA labels
- [ ] Semantic HTML structure
- [ ] Dynamic content announced
- [ ] Form labels associated

### Visual Design
- [ ] Sufficient color contrast in all states
- [ ] Focus indicators clearly visible
- [ ] Text readable at 200% zoom
- [ ] No information conveyed by color alone

## Issues Found
[List any accessibility violations]

## Recommendations
[List improvements or enhancements]

## Overall Score
Lighthouse Accessibility Score: [0-100]
axe DevTools Violations: [count]

## Status
[ ] Pass - Meets WCAG 2.2 AAA
[ ] Fail - Violations found
```
