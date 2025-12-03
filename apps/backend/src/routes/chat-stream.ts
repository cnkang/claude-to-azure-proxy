/**
 * Chat Streaming Route Handler
 *
 * Handles Server-Sent Events (SSE) for real-time chat streaming.
 * Provides streaming responses with session isolation and connection management.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 13.1, 13.4
 */

import type { Request, Response } from 'express';
import {
  type ValidationError as ExpressValidationError,
  body,
  param,
  validationResult,
} from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { ValidationError } from '../errors/index.js';
import { isE2EBypassRequest } from '../middleware/authentication.js';
import { logger } from '../middleware/logging.js';
import type { ContextMessage } from '../services/context-management-service.js';
import type { RequestWithCorrelationId } from '../types/index.js';
import {
  forceGarbageCollection,
  getCurrentMemoryMetrics,
} from '../utils/memory-manager.js';
import {
  isValidConnectionId,
  isValidConversationId,
  isValidMessageId,
} from '../utils/validation.js';

interface RequestWithSession extends RequestWithCorrelationId {
  sessionId: string;
}

const formatValidationError = (err: ExpressValidationError): {
  field: string;
  message: string;
  value?: unknown;
  location?: string;
} => ({
  field: err.type === 'field' ? err.path : 'unknown',
  message: err.msg,
  value: err.type === 'field' ? err.value : undefined,
  location: err.type === 'field' ? err.location : undefined,
});

// SSE connection management
// Task 11.3: Add chunkCount to interface to avoid dynamic property addition
interface SSEConnection {
  readonly id: string;
  readonly sessionId: string;
  readonly conversationId: string;
  readonly response: Response;
  readonly createdAt: Date;
  readonly correlationId: string;
  isActive: boolean;
  lastMessageTimestamp: number; // Track last message time for health monitoring
  chunkCount: number; // Task 11.3: Track chunk count for logging (defined upfront)
}

interface StreamChunk {
  readonly type: 'start' | 'chunk' | 'end' | 'error' | 'heartbeat';
  readonly content?: string;
  readonly messageId?: string;
  readonly correlationId: string;
  readonly timestamp: number;
  readonly model?: string;
  readonly usage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
  };
}

interface ChatStreamRequest {
  readonly message: string;
  readonly model: string;
  readonly conversationId: string;
  readonly files?: Array<{
    readonly id: string;
    readonly name: string;
    readonly type: string;
    readonly url: string;
  }>;
  readonly contextMessages?: readonly ContextMessage[];
}

// Active SSE connections
const sseConnections = new Map<string, SSEConnection>();
const sessionConnections = new Map<string, Set<string>>(); // sessionId -> connectionIds
// Secondary index for O(1) connection lookup by session+conversation
const connectionIndex = new Map<string, string>(); // `${sessionId}_${conversationId}` -> connectionId

// Statistics tracking for monitoring
// Task 11.3: Add limits to prevent unbounded growth
interface SSEStatistics {
  totalConnectionsCreated: number;
  totalConnectionsClosed: number;
  totalErrors: number;
  totalReconnections: number;
  connectionDurations: number[]; // Store last 100 connection durations
  errorsByType: Map<string, number>; // Task 11.3: Limited to top 50 error types
  reconnectionsBySession: Map<string, number>; // Task 11.3: Cleaned up with sessions
}

const sseStatistics: SSEStatistics = {
  totalConnectionsCreated: 0,
  totalConnectionsClosed: 0,
  totalErrors: 0,
  totalReconnections: 0,
  connectionDurations: [],
  errorsByType: new Map(),
  reconnectionsBySession: new Map(),
};

// Task 11.3: Configuration for statistics limits
const STATS_CONFIG = {
  maxErrorTypes: 50, // Limit error types map to top 50
  maxReconnectionSessions: 1000, // Limit reconnection tracking to 1000 sessions
};

// Configuration
// Task 11.3: Optimize cleanup interval for better memory management
const SSE_CONFIG = {
  maxConnectionsPerSession: 5,
  connectionTimeout: 30 * 60 * 1000, // 30 minutes
  heartbeatInterval: 30 * 1000, // 30 seconds
  cleanupInterval: 30 * 1000, // Task 11.3: Reduced from 60s to 30s for more aggressive cleanup
  maxMessageSize: 100000, // 100KB
  maxStoredDurations: 100, // Keep last 100 connection durations for average calculation
};

/**
 * Clean up inactive connections
 *
 * Task 11.3: Enhanced cleanup with statistics pruning and memory management
 */
function cleanupInactiveConnections(): void {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [connectionId, connection] of sseConnections.entries()) {
    if (
      !connection.isActive ||
      now - connection.createdAt.getTime() > SSE_CONFIG.connectionTimeout
    ) {
      closeSSEConnection(connectionId, 'timeout');
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    logger.info('Cleaned up inactive SSE connections', '', {
      cleanedCount,
      remainingConnections: sseConnections.size,
    });
  }

  // Task 11.3: Clean up statistics maps to prevent unbounded growth
  cleanupStatistics();

  // Task 11.3: Check memory and trigger GC if needed after cleanup
  const memoryMetrics = getCurrentMemoryMetrics();
  const memoryPercentUsed = memoryMetrics.heap.percentage;

  if (memoryPercentUsed > 80) {
    logger.info('High memory usage detected after cleanup, triggering GC', '', {
      memoryPercentUsed: memoryPercentUsed.toFixed(2),
      heapUsedMB: (memoryMetrics.heap.used / 1024 / 1024).toFixed(2),
      heapTotalMB: (memoryMetrics.heap.total / 1024 / 1024).toFixed(2),
    });

    forceGarbageCollection();
  }
}

/**
 * Clean up statistics maps to prevent memory leaks
 *
 * Task 11.3: Limit statistics map sizes
 * - Limit errorsByType to top 50 error types
 * - Clean up reconnectionsBySession for inactive sessions
 */
function cleanupStatistics(): void {
  // Limit errorsByType to top 50 error types
  if (sseStatistics.errorsByType.size > STATS_CONFIG.maxErrorTypes) {
    // Sort by count and keep only top 50
    const sortedErrors = Array.from(sseStatistics.errorsByType.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, STATS_CONFIG.maxErrorTypes);

    sseStatistics.errorsByType.clear();
    for (const [type, count] of sortedErrors) {
      sseStatistics.errorsByType.set(type, count);
    }

    logger.debug('Pruned errorsByType map', '', {
      keptEntries: sseStatistics.errorsByType.size,
      maxEntries: STATS_CONFIG.maxErrorTypes,
    });
  }

  // Clean up reconnectionsBySession for sessions with no active connections
  if (
    sseStatistics.reconnectionsBySession.size >
    STATS_CONFIG.maxReconnectionSessions
  ) {
    const activeSessions = new Set(sessionConnections.keys());
    let removedCount = 0;

    for (const sessionId of sseStatistics.reconnectionsBySession.keys()) {
      if (!activeSessions.has(sessionId)) {
        sseStatistics.reconnectionsBySession.delete(sessionId);
        removedCount++;
      }
    }

    logger.debug('Cleaned up reconnectionsBySession map', '', {
      removedSessions: removedCount,
      remainingSessions: sseStatistics.reconnectionsBySession.size,
    });
  }
}

/**
 * Classify error type for proper handling
 */
function classifyError(error: unknown): 'transient' | 'permanent' {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Transient errors that might recover
    if (
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('network')
    ) {
      return 'transient';
    }
  }

  // Default to permanent for safety
  return 'permanent';
}

/**
 * Send SSE message to connection
 */
function sendSSEMessage(connectionId: string, data: StreamChunk): boolean {
  const connection = sseConnections.get(connectionId);

  if (connection?.isActive !== true) {
    return false;
  }

  try {
    const sseData = `data: ${JSON.stringify(data)}\n\n`;
    connection.response.write(sseData);

    // Update last message timestamp for health monitoring
    connection.lastMessageTimestamp = Date.now();

    return true;
  } catch (error) {
    const errorType = classifyError(error);

    logger.warn('Failed to send SSE message', connection.correlationId, {
      connectionId,
      error: error instanceof Error ? error.message : String(error),
      errorType,
      messageType: data.type,
    });

    // Immediately close connection on write errors
    closeSSEConnection(connectionId, `write_error_${errorType}`);
    return false;
  }
}

/**
 * Send heartbeat to all active connections
 *
 * Task 6.1: Use dedicated heartbeat message type
 */
function sendHeartbeat(): void {
  const heartbeatData: StreamChunk = {
    type: 'heartbeat',
    correlationId: 'heartbeat',
    timestamp: Date.now(),
  };

  let sentCount = 0;
  for (const connectionId of sseConnections.keys()) {
    if (sendSSEMessage(connectionId, heartbeatData)) {
      sentCount++;
    }
  }

  if (sentCount > 0) {
    logger.debug('Heartbeat sent to active connections', 'heartbeat', {
      sentCount,
      totalConnections: sseConnections.size,
    });
  }
}

function handleE2EBypass(
  req: Request,
  res: Response,
  correlationId: string
): boolean {
  if (!isE2EBypassRequest(req)) {
    return false;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const now = Date.now();
  const startPayload = {
    type: 'start',
    correlationId,
    timestamp: now,
  };
  res.write(`data: ${JSON.stringify(startPayload)}\n\n`);

  const endPayload = {
    type: 'end',
    correlationId,
    timestamp: now,
  };
  res.write(`data: ${JSON.stringify(endPayload)}\n\n`);
  res.end();
  return true;
}

function validateConversationRequest(
  req: Request,
  correlationId: string,
  conversationId: string
): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError(
      'Invalid conversation ID',
      correlationId,
      'conversationId',
      conversationId
    );
  }
}

function rejectWhenSessionAtLimit(
  sessionConns: Set<string>,
  sessionId: string,
  correlationId: string,
  res: Response
): boolean {
  if (sessionConns.size < SSE_CONFIG.maxConnectionsPerSession) {
    return false;
  }

  logger.warn('SSE connection limit reached for session', correlationId, {
    sessionId,
    currentConnections: sessionConns.size,
    maxConnections: SSE_CONFIG.maxConnectionsPerSession,
  });

  res.status(429).json({
    error: {
      type: 'connection_limit_exceeded',
      message: `Maximum ${SSE_CONFIG.maxConnectionsPerSession} connections per session`,
      correlationId,
    },
  });
  return true;
}

function setupSSEHeaders(res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering for SSE
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
  });
}

function registerSSEConnection(
  sessionId: string,
  conversationId: string,
  correlationId: string,
  res: Response,
  sessionConns: Set<string>
): { connectionId: string; connection: SSEConnection } {
  const connectionId = uuidv4();
  const connection: SSEConnection = {
    id: connectionId,
    sessionId,
    conversationId,
    response: res,
    createdAt: new Date(),
    correlationId,
    isActive: true,
    lastMessageTimestamp: Date.now(), // Initialize with creation time
    chunkCount: 0, // Task 11.3: Initialize chunk counter
  };

  sseConnections.set(connectionId, connection);

  if (!sessionConnections.has(sessionId)) {
    sessionConnections.set(sessionId, sessionConns);
  }
  sessionConns.add(connectionId);

  const indexKey = `${sessionId}_${conversationId}`;
  connectionIndex.set(indexKey, connectionId);

  sseStatistics.totalConnectionsCreated++;

  logger.info('SSE connection established', correlationId, {
    connectionId,
    sessionId,
    conversationId,
    totalCreated: sseStatistics.totalConnectionsCreated,
  });

  return { connectionId, connection };
}

function scheduleInitialMessage(
  connectionId: string,
  connection: SSEConnection,
  correlationId: string
): void {
  setTimeout(() => {
    if (!connection.isActive) {
      logger.warn(
        'Connection closed before initial message could be sent',
        correlationId,
        {
          connectionId,
        }
      );
      return;
    }

    const initialMessage: StreamChunk = {
      type: 'start',
      correlationId,
      timestamp: Date.now(),
    };

    const sent = sendSSEMessage(connectionId, initialMessage);
    if (sent) {
      logger.info('Initial SSE message sent', correlationId, {
        connectionId,
        delay: 100,
      });
    }
  }, 100); // 100ms delay to ensure client is ready
}

function registerConnectionEventHandlers(
  req: Request,
  connectionId: string,
  correlationId: string
): void {
  req.on('close', () => {
    closeSSEConnection(connectionId, 'client_disconnect');
  });

  req.on('error', (error) => {
    logger.warn('SSE connection error', correlationId, {
      connectionId,
      error: error.message,
    });
    closeSSEConnection(connectionId, 'connection_error');
  });
}

/**
 * Close SSE connection
 *
 * Task 11.3: Enhanced cleanup to release Response object references
 */
function closeSSEConnection(connectionId: string, reason: string): void {
  const connection = sseConnections.get(connectionId);

  if (connection) {
    connection.isActive = false;
    safelyEndResponse(connection);

    // Calculate connection duration
    const duration = Date.now() - connection.createdAt.getTime();

    removeConnectionIndices(connectionId, connection);
    updateConnectionStatistics(connection, reason, duration);

    logger.info('SSE connection closed', connection.correlationId, {
      connectionId,
      sessionId: connection.sessionId,
      conversationId: connection.conversationId,
      reason,
      duration,
      totalClosed: sseStatistics.totalConnectionsClosed,
    });

    // Task 11.3: Explicitly nullify connection reference to help GC
    // (connection variable will be garbage collected after this function returns)
  }
}

function safelyEndResponse(connection: SSEConnection): void {
  try {
    connection.response.end();
  } catch {
    // Connection might already be closed
  }
}

function removeConnectionIndices(
  connectionId: string,
  connection: SSEConnection
): void {
  // Task 11.3: Remove connection from map immediately to release Response object
  sseConnections.delete(connectionId);

  const sessionConns = sessionConnections.get(connection.sessionId);
  if (sessionConns) {
    sessionConns.delete(connectionId);
    if (sessionConns.size === 0) {
      sessionConnections.delete(connection.sessionId);
    }
  }

  const indexKey = `${connection.sessionId}_${connection.conversationId}`;
  connectionIndex.delete(indexKey);
}

function updateConnectionStatistics(
  connection: SSEConnection,
  reason: string,
  duration: number
): void {
  sseStatistics.totalConnectionsClosed++;

  sseStatistics.connectionDurations.push(duration);
  if (sseStatistics.connectionDurations.length > SSE_CONFIG.maxStoredDurations) {
    sseStatistics.connectionDurations.shift(); // Remove oldest
  }

  if (reason.includes('error') || reason.includes('timeout')) {
    sseStatistics.totalErrors++;
    const errorCount = sseStatistics.errorsByType.get(reason) || 0;
    sseStatistics.errorsByType.set(reason, errorCount + 1);
  }

  if (reason === 'client_disconnect' || reason.includes('error')) {
    const reconnectCount =
      sseStatistics.reconnectionsBySession.get(connection.sessionId) || 0;
    if (reconnectCount > 0) {
      sseStatistics.totalReconnections++;
    }
    sseStatistics.reconnectionsBySession.set(
      connection.sessionId,
      reconnectCount + 1
    );
  }
}

// Start cleanup and heartbeat intervals
setInterval(cleanupInactiveConnections, SSE_CONFIG.cleanupInterval);
setInterval(sendHeartbeat, SSE_CONFIG.heartbeatInterval);

/**
 * Establish SSE connection for conversation
 * GET /api/chat/stream/:conversationId
 */
export const chatSSEHandler = [
  // Input validation
  param('conversationId')
    .custom(isValidConversationId)
    .withMessage('Invalid conversation ID format'),

  (req: Request, res: Response): void => {
    const { correlationId } = req as RequestWithCorrelationId;
    const { sessionId } = req as RequestWithSession;
    const conversationId = req.params.conversationId as string;

    try {
      if (handleE2EBypass(req, res, correlationId)) {
        return;
      }

      validateConversationRequest(req, correlationId, conversationId);

      const sessionConns = sessionConnections.get(sessionId) || new Set<string>();
      if (
        rejectWhenSessionAtLimit(
          sessionConns,
          sessionId,
          correlationId,
          res
        )
      ) {
        return;
      }

      setupSSEHeaders(res);

      const { connectionId, connection } = registerSSEConnection(
        sessionId,
        conversationId,
        correlationId,
        res,
        sessionConns
      );

      scheduleInitialMessage(connectionId, connection, correlationId);
      registerConnectionEventHandlers(req, connectionId, correlationId);
    } catch (error) {
      handleSSEConnectionError(
        res,
        error,
        correlationId,
        sessionId,
        conversationId
      );
    }
  },
];

function logIncomingMessageRequest(
  req: Request,
  correlationId: string,
  sessionId: string
): void {
  logger.info('Incoming message request', correlationId, {
    body: req.body,
    sessionId,
    headers: {
      'x-session-id': req.headers['x-session-id'],
      'content-type': req.headers['content-type'],
    },
    conversationId: req.body?.conversationId,
    messageLength: req.body?.message?.length,
    hasFiles: !!req.body?.files,
    hasContextMessages: !!req.body?.contextMessages,
  });
}

function validateChatRequestPayload(
  req: Request,
  correlationId: string,
  sessionId: string
): ChatStreamRequest {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return req.body as ChatStreamRequest;
  }

  const validationErrors = errors.array();
  logger.error('Chat message validation failed', correlationId, {
    errors: validationErrors,
    errorDetails: validationErrors.map(formatValidationError),
    body: req.body,
    sessionId,
    headers: {
      'x-session-id': req.headers['x-session-id'],
      'content-type': req.headers['content-type'],
    },
  });

  throw new ValidationError(
    'Invalid chat message request',
    correlationId,
    'request',
    validationErrors
  );
}

function ensureContextMessagesValid(
  contextMessages: readonly ContextMessage[] | undefined,
  correlationId: string
): void {
  if (!contextMessages || !Array.isArray(contextMessages)) {
    return;
  }

  logger.debug('Validating context messages', correlationId, {
    contextMessageCount: contextMessages.length,
    contextMessages: contextMessages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      hasContent: !!msg.content,
    })),
  });

  contextMessages.forEach((msg, index) => {
    if (msg.id && !isValidMessageId(msg.id)) {
      logger.warn('Invalid message ID in context messages', correlationId, {
        index,
        messageId: msg.id,
        role: msg.role,
      });
      throw new ValidationError(
        `Invalid message ID in context messages at index ${index}`,
        correlationId,
        'contextMessages',
        msg.id
      );
    }

    if (msg.role && !['user', 'assistant', 'system'].includes(msg.role)) {
      logger.warn('Invalid role in context messages', correlationId, {
        index,
        role: msg.role,
        validRoles: ['user', 'assistant', 'system'],
      });
      throw new ValidationError(
        `Invalid role in context messages at index ${index}: ${msg.role}`,
        correlationId,
        'contextMessages',
        msg.role
      );
    }

    if (!msg.content || (typeof msg.content === 'string' && msg.content.trim().length === 0)) {
      logger.warn('Empty content in context messages', correlationId, {
        index,
        role: msg.role,
        messageId: msg.id,
      });
      throw new ValidationError(
        `Empty content in context messages at index ${index}`,
        correlationId,
        'contextMessages',
        'content'
      );
    }
  });

  logger.debug('Context messages validation passed', correlationId, {
    validatedCount: contextMessages.length,
  });
}

function resolveActiveConnection(
  sessionId: string,
  conversationId: string,
  correlationId: string
): SSEConnection | undefined {
  const indexKey = `${sessionId}_${conversationId}`;
  const connectionId = connectionIndex.get(indexKey);
  const targetConnection = connectionId
    ? sseConnections.get(connectionId)
    : undefined;

  logger.info('Connection lookup for message', correlationId, {
    indexKey,
    connectionId,
    connectionFound: !!targetConnection,
    connectionActive: targetConnection?.isActive,
    totalConnections: sseConnections.size,
    totalIndexEntries: connectionIndex.size,
    sessionConnections: sessionConnections.get(sessionId)?.size || 0,
  });

  if (targetConnection && !targetConnection.isActive) {
    logger.warn('Found inactive connection, cleaning up', correlationId, {
      connectionId: targetConnection.id,
      conversationId,
      sessionId,
    });
    closeSSEConnection(targetConnection.id, 'inactive_connection');
  }

  if (targetConnection?.isActive) {
    return targetConnection;
  }

  logger.error('No active connection found for message', correlationId, {
    conversationId,
    sessionId,
    indexKey,
    connectionId,
    allConnections: Array.from(sseConnections.entries()).map(([id, conn]) => ({
      id,
      sessionId: conn.sessionId,
      conversationId: conn.conversationId,
      isActive: conn.isActive,
      age: Date.now() - conn.createdAt.getTime(),
    })),
    allIndexKeys: Array.from(connectionIndex.keys()),
  });

  return undefined;
}

function respondNoActiveConnection(
  res: Response,
  correlationId: string
): void {
  res.status(400).json({
    error: {
      type: 'no_active_connection',
      message: 'No active streaming connection for this conversation',
      correlationId,
    },
  });
}

function findExistingStream(
  sessionId: string,
  conversationId: string
): SSEConnection | undefined {
  return Array.from(sseConnections.values()).find(
    (conn) =>
      conn.conversationId === conversationId &&
      conn.sessionId === sessionId &&
      conn.isActive
  );
}

function logStreamProcessing(
  correlationId: string,
  conversationId: string,
  sessionId: string,
  message: string,
  model: string,
  files: ChatStreamRequest['files'],
  contextMessages: ChatStreamRequest['contextMessages'],
  existingStream: SSEConnection | undefined
): void {
  logger.info('Processing chat message for streaming', correlationId, {
    conversationId,
    sessionId,
    messageLength: message.length,
    model,
    hasFiles: !!files?.length,
    hasContext: !!contextMessages?.length,
    hasExistingStream: !!existingStream,
    existingStreamId: existingStream?.id,
  });
}

function logMessageTracking(
  correlationId: string,
  messageId: string,
  conversationId: string,
  sessionId: string
): void {
  logger.info(
    '[MESSAGE-ID-TRACKING] Message ID generated in sendChatMessageHandler',
    correlationId,
    {
      messageId,
      conversationId,
      sessionId,
      stage: 'sendMessage_response',
      timestamp: new Date().toISOString(),
    }
  );
}

function sendStreamingAck(
  res: Response,
  messageId: string,
  correlationId: string
): void {
  res.json({
    messageId,
    status: 'streaming',
    correlationId,
  });
}

function buildConnectionSummaries(
  sessionConns: Set<string>,
  now: number
): Array<{
  id: string;
  conversationId: string;
  createdAt: string;
  duration: number;
  age: { minutes: number; seconds: number; formatted: string };
  health: {
    status: 'healthy' | 'stale' | 'near_timeout';
    isStale: boolean;
    isNearTimeout: boolean;
    timeUntilTimeout: number;
  };
  lastMessageTimestamp: number;
  timeSinceLastMessage: number;
}> {
  const connections = [] as Array<{
    id: string;
    conversationId: string;
    createdAt: string;
    duration: number;
    age: { minutes: number; seconds: number; formatted: string };
    health: {
      status: 'healthy' | 'stale' | 'near_timeout';
      isStale: boolean;
      isNearTimeout: boolean;
      timeUntilTimeout: number;
    };
    lastMessageTimestamp: number;
    timeSinceLastMessage: number;
  }>;

  for (const connectionId of sessionConns) {
    const connection = sseConnections.get(connectionId);
    if (connection?.isActive !== true) {
      continue;
    }

    connections.push(createConnectionDetails(connection, now));
  }

  return connections;
}

function createConnectionDetails(
  connection: SSEConnection,
  now: number
): {
  id: string;
  conversationId: string;
  createdAt: string;
  duration: number;
  age: { minutes: number; seconds: number; formatted: string };
  health: {
    status: 'healthy' | 'stale' | 'near_timeout';
    isStale: boolean;
    isNearTimeout: boolean;
    timeUntilTimeout: number;
  };
  lastMessageTimestamp: number;
  timeSinceLastMessage: number;
} {
  const connectionAge = now - connection.createdAt.getTime();
  const ageInMinutes = Math.floor(connectionAge / 60000);
  const ageInSeconds = Math.floor((connectionAge % 60000) / 1000);
  const isStale = connectionAge > 5 * 60 * 1000; // 5 minutes without activity
  const isNearTimeout = connectionAge > SSE_CONFIG.connectionTimeout * 0.8;

  const healthStatus: 'healthy' | 'stale' | 'near_timeout' = isNearTimeout
    ? 'near_timeout'
    : isStale
      ? 'stale'
      : 'healthy';

  return {
    id: connection.id,
    conversationId: connection.conversationId,
    createdAt: connection.createdAt.toISOString(),
    duration: connectionAge,
    age: {
      minutes: ageInMinutes,
      seconds: ageInSeconds,
      formatted: `${ageInMinutes}m ${ageInSeconds}s`,
    },
    health: {
      status: healthStatus,
      isStale,
      isNearTimeout,
      timeUntilTimeout: SSE_CONFIG.connectionTimeout - connectionAge,
    },
    lastMessageTimestamp: connection.lastMessageTimestamp,
    timeSinceLastMessage: now - connection.lastMessageTimestamp,
  };
}

function handleConnectionsError(
  res: Response,
  error: unknown,
  correlationId: string,
  sessionId: string
): void {
  logger.error('Failed to get SSE connections', correlationId, {
    sessionId,
    error: error instanceof Error ? error.message : String(error),
  });

  res.status(500).json({
    error: {
      type: 'connections_error',
      message: 'Failed to get connections',
      correlationId,
    },
  });
}

function validateConnectionRequest(
  req: Request,
  correlationId: string,
  connectionId: string
): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError(
      'Invalid connection ID',
      correlationId,
      'connectionId',
      connectionId
    );
  }
}

function respondConnectionNotFound(res: Response, correlationId: string): void {
  res.status(404).json({
    error: {
      type: 'connection_not_found',
      message: 'Connection not found',
      correlationId,
    },
  });
}

function respondAccessDenied(res: Response, correlationId: string): void {
  res.status(403).json({
    error: {
      type: 'access_denied',
      message: 'Access denied to this connection',
      correlationId,
    },
  });
}

function handleCloseConnectionError(
  res: Response,
  error: unknown,
  correlationId: string,
  connectionId: string,
  sessionId: string
): void {
  logger.error('Failed to close SSE connection', correlationId, {
    connectionId,
    sessionId,
    error: error instanceof Error ? error.message : String(error),
  });

  if (error instanceof ValidationError) {
    res.status(400).json({
      error: {
        type: 'validation_error',
        message: error.message,
        correlationId,
      },
    });
    return;
  }

  res.status(500).json({
    error: {
      type: 'connection_close_error',
      message: 'Failed to close connection',
      correlationId,
    },
  });
}

interface ConnectionHealthSummary {
  activeConnections: number;
  healthyConnections: number;
  staleConnections: number;
  connectionsBySession: Map<string, number>;
}

interface RateSummary {
  errorRate: number;
  reconnectionRate: number;
}

interface MemoryStats {
  usage: NodeJS.MemoryUsage;
  percentUsed: number;
}

function gatherConnectionHealth(now: number): ConnectionHealthSummary {
  let activeConnections = 0;
  let healthyConnections = 0;
  let staleConnections = 0;
  const connectionsBySession = new Map<string, number>();

  for (const connection of sseConnections.values()) {
    if (!connection.isActive) {
      continue;
    }

    activeConnections++;

    const timeSinceLastMessage = now - connection.lastMessageTimestamp;
    if (timeSinceLastMessage > 5 * 60 * 1000) {
      staleConnections++;
    } else {
      healthyConnections++;
    }

    const sessionCount = connectionsBySession.get(connection.sessionId) || 0;
    connectionsBySession.set(connection.sessionId, sessionCount + 1);
  }

  return {
    activeConnections,
    healthyConnections,
    staleConnections,
    connectionsBySession,
  };
}

function calculateAverageDuration(): number {
  return sseStatistics.connectionDurations.length > 0
    ? sseStatistics.connectionDurations.reduce((a, b) => a + b, 0) /
        sseStatistics.connectionDurations.length
    : 0;
}

function calculateRates(totalConnections: number): RateSummary {
  if (totalConnections <= 0) {
    return { errorRate: 0, reconnectionRate: 0 };
  }

  return {
    errorRate: (sseStatistics.totalErrors / totalConnections) * 100,
    reconnectionRate: (sseStatistics.totalReconnections / totalConnections) * 100,
  };
}

function getTopErrors(): Array<{ type: string; count: number }> {
  return Array.from(sseStatistics.errorsByType.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => ({ type, count }));
}

function getMemoryStats(): MemoryStats {
  const usage = process.memoryUsage();
  const percentUsed = (usage.heapUsed / usage.heapTotal) * 100;

  return { usage, percentUsed };
}

function buildChatStatsResponse(
  health: ConnectionHealthSummary,
  averageDuration: number,
  rates: RateSummary,
  topErrors: Array<{ type: string; count: number }>,
  memoryStats: MemoryStats,
  correlationId: string
): Record<string, unknown> {
  const averageConnectionsPerSession =
    health.connectionsBySession.size > 0
      ? Array.from(health.connectionsBySession.values()).reduce(
          (a, b) => a + b,
          0
        ) / health.connectionsBySession.size
      : 0;

  const sessionsWithReconnections = Array.from(
    sseStatistics.reconnectionsBySession.keys()
  );

  return {
    totalConnections: sseConnections.size,
    activeConnections: health.activeConnections,
    healthyConnections: health.healthyConnections,
    staleConnections: health.staleConnections,
    totalSessions: sessionConnections.size,

    lifetime: {
      totalConnectionsCreated: sseStatistics.totalConnectionsCreated,
      totalConnectionsClosed: sseStatistics.totalConnectionsClosed,
      totalErrors: sseStatistics.totalErrors,
      totalReconnections: sseStatistics.totalReconnections,
    },

    averageConnectionDuration: Math.round(averageDuration),
    averageConnectionDurationFormatted: formatDuration(averageDuration),
    averageConnectionsPerSession,
    errorRate: Math.round(rates.errorRate * 100) / 100,
    reconnectionRate: Math.round(rates.reconnectionRate * 100) / 100,

    topErrors,
    errorsByType: Object.fromEntries(sseStatistics.errorsByType),

    reconnectionStatistics: {
      totalReconnections: sseStatistics.totalReconnections,
      sessionsWithReconnections,
      averageReconnectionsPerSession:
        sseStatistics.reconnectionsBySession.size > 0
          ? sseStatistics.totalReconnections /
            sseStatistics.reconnectionsBySession.size
          : 0,
    },

    memoryUsage: {
      heapTotal: memoryStats.usage.heapTotal,
      heapUsed: memoryStats.usage.heapUsed,
      rss: memoryStats.usage.rss,
      external: memoryStats.usage.external,
      heapUsedPercent: Math.round(memoryStats.percentUsed * 100) / 100,
    },

    connectionIndexSize: connectionIndex.size,
    sessionConnections: Array.from(sessionConnections.entries()).map(
      ([sessionId, connections]) => ({
        sessionId,
        connections: connections.size,
      })
    ),
    correlationId,
  };
}

function handleChatStatsError(
  res: Response,
  error: unknown,
  correlationId: string
): void {
  logger.error('Failed to get chat statistics', correlationId, {
    error: error instanceof Error ? error.message : String(error),
  });

  res.status(500).json({
    error: {
      type: 'chat_stats_error',
      message: 'Failed to get chat statistics',
      correlationId,
    },
  });
}

function handleSSEConnectionError(
  res: Response,
  error: unknown,
  correlationId: string,
  sessionId: string,
  conversationId: string
): void {
  logger.error('Failed to establish SSE connection', correlationId, {
    sessionId,
    conversationId,
    error: error instanceof Error ? error.message : String(error),
  });

  if (res.headersSent) {
    return;
  }

  if (error instanceof ValidationError) {
    res.status(400).json({
      error: {
        type: 'validation_error',
        message: error.message,
        correlationId,
      },
    });
    return;
  }

  res.status(500).json({
    error: {
      type: 'sse_connection_error',
      message: 'Failed to establish streaming connection',
      correlationId,
    },
  });
}

/**
 * Send chat message with streaming response
 * POST /api/chat/send
 */
export const sendChatMessageHandler = [
  // Input validation
  body('conversationId')
    .custom(isValidConversationId)
    .withMessage('Invalid conversation ID format'),
  body('message')
    .isString()
    .isLength({ min: 1, max: SSE_CONFIG.maxMessageSize })
    .withMessage('Message must be a string between 1 and 100000 characters'),
  body('model')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Model must be a string between 1 and 100 characters'),
  body('files').optional().isArray().withMessage('Files must be an array'),
  body('contextMessages')
    .optional()
    .isArray()
    .withMessage('Context messages must be an array'),

  async (req: Request, res: Response): Promise<void> => {
    const { correlationId } = req as RequestWithCorrelationId;
    const { sessionId } = req as RequestWithSession;

    try {
      logIncomingMessageRequest(req, correlationId, sessionId);

      const { message, model, files, contextMessages, conversationId } =
        validateChatRequestPayload(req, correlationId, sessionId);

      ensureContextMessagesValid(contextMessages, correlationId);

      const targetConnection = resolveActiveConnection(
        sessionId,
        conversationId,
        correlationId
      );

      if (targetConnection === undefined) {
        respondNoActiveConnection(res, correlationId);
        return;
      }

      const existingStream = findExistingStream(sessionId, conversationId);
      logStreamProcessing(
        correlationId,
        conversationId,
        sessionId,
        message,
        model,
        files,
        contextMessages,
        existingStream
      );

      const messageId = uuidv4();
      logMessageTracking(correlationId, messageId, conversationId, sessionId);

      const streamRequest: ChatStreamRequest = {
        message,
        model,
        conversationId,
        files,
        contextMessages,
      };

      await processStreamingResponse(
        targetConnection.id,
        messageId,
        streamRequest,
        correlationId
      );

      sendStreamingAck(res, messageId, correlationId);
    } catch (error) {
      logger.error('Failed to send chat message', correlationId, {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof ValidationError) {
        res.status(400).json({
          error: {
            type: 'validation_error',
            message: error.message,
            correlationId,
          },
        });
      } else {
        res.status(500).json({
          error: {
            type: 'chat_message_error',
            message: 'Failed to send chat message',
            correlationId,
          },
        });
      }
    }
  },
];

/**
 * Process streaming response using the streaming service
 */
async function processStreamingResponse(
  connectionId: string,
  messageId: string,
  request: ChatStreamRequest,
  correlationId: string
): Promise<void> {
  const connection = sseConnections.get(connectionId);
  if (connection?.isActive !== true) {
    return;
  }

  try {
    // Import streaming service
    const { getStreamingService } = await import(
      '../services/streaming-service.js'
    );
    const streamingService = getStreamingService();

    // Create streaming response handler
    // Task 9.6.1: Use messageId parameter directly instead of msgId from callbacks
    const handler = {
      onStart: (_msgId: string, model: string) => {
        // Task 9.6.2: Log message ID at SSE START event stage
        logger.info(
          '[MESSAGE-ID-TRACKING] Sending SSE START event',
          correlationId,
          {
            messageId: messageId,
            streamingServiceMessageId: _msgId,
            idsMatch: _msgId === messageId,
            stage: 'SSE_START_event',
            model,
            timestamp: new Date().toISOString(),
          }
        );

        // Task 9.6.2: Add assertion to verify IDs match
        if (_msgId !== messageId) {
          logger.warn(
            '[MESSAGE-ID-TRACKING] Streaming service returned different ID (expected, will use our ID)',
            correlationId,
            {
              streamingServiceMessageId: _msgId,
              ourMessageId: messageId,
              stage: 'SSE_START_event',
              timestamp: new Date().toISOString(),
            }
          );
        }

        const startMessage: StreamChunk = {
          type: 'start',
          messageId: messageId, // Task 9.6.1: Use our messageId, not the one from streaming service
          correlationId,
          timestamp: Date.now(),
          model,
        };
        sendSSEMessage(connectionId, startMessage);
      },

      onChunk: (content: string, _msgId: string) => {
        if (connection.isActive !== true) {
          return;
        }

        // Task 9.6.2: Log message ID at SSE CHUNK event stage (throttled to avoid spam)
        // Task 11.3: Use properly defined chunkCount property
        // Only log first chunk and every 10th chunk
        const chunkCount = connection.chunkCount;
        connection.chunkCount = chunkCount + 1;

        if (chunkCount === 0 || chunkCount % 10 === 0) {
          logger.debug(
            '[MESSAGE-ID-TRACKING] Sending SSE CHUNK event',
            correlationId,
            {
              messageId: messageId,
              streamingServiceMessageId: _msgId,
              idsMatch: _msgId === messageId,
              stage: 'SSE_CHUNK_event',
              chunkNumber: chunkCount + 1,
              contentLength: content.length,
              timestamp: new Date().toISOString(),
            }
          );

          // Task 9.6.2: Add assertion to verify IDs match
          if (_msgId !== messageId) {
            logger.debug(
              '[MESSAGE-ID-TRACKING] Streaming service ID differs (using our ID)',
              correlationId,
              {
                streamingServiceMessageId: _msgId,
                ourMessageId: messageId,
                stage: 'SSE_CHUNK_event',
                chunkNumber: chunkCount + 1,
                timestamp: new Date().toISOString(),
              }
            );
          }
        }

        const chunk: StreamChunk = {
          type: 'chunk',
          content,
          messageId: messageId, // Task 9.6.1: Use our messageId, not the one from streaming service
          correlationId,
          timestamp: Date.now(),
        };
        sendSSEMessage(connectionId, chunk);
      },

      onEnd: (_msgId: string, usage?: StreamChunk['usage']) => {
        // Task 9.6.2: Log message ID at SSE END event stage
        logger.info(
          '[MESSAGE-ID-TRACKING] Sending SSE END event',
          correlationId,
          {
            messageId: messageId,
            streamingServiceMessageId: _msgId,
            idsMatch: _msgId === messageId,
            stage: 'SSE_END_event',
            usage,
            timestamp: new Date().toISOString(),
          }
        );

        // Task 9.6.2: Add assertion to verify IDs match
        if (_msgId !== messageId) {
          logger.warn(
            '[MESSAGE-ID-TRACKING] Streaming service returned different ID (using our ID)',
            correlationId,
            {
              streamingServiceMessageId: _msgId,
              ourMessageId: messageId,
              stage: 'SSE_END_event',
              timestamp: new Date().toISOString(),
            }
          );
        }

        const endMessage: StreamChunk = {
          type: 'end',
          messageId: messageId, // Task 9.6.1: Use our messageId, not the one from streaming service
          correlationId,
          timestamp: Date.now(),
          usage,
        };
        sendSSEMessage(connectionId, endMessage);

        logger.info('Streaming response completed', correlationId, {
          messageId: messageId,
          model: request.model,
          usage,
        });
      },

      onError: (error: string, _msgId: string) => {
        // Task 9.6.2: Log message ID at SSE ERROR event stage
        logger.error(
          '[MESSAGE-ID-TRACKING] Sending SSE ERROR event',
          correlationId,
          {
            messageId: messageId,
            streamingServiceMessageId: _msgId,
            idsMatch: _msgId === messageId,
            stage: 'SSE_ERROR_event',
            error,
            timestamp: new Date().toISOString(),
          }
        );

        // Task 9.6.2: Add assertion to verify IDs match
        if (_msgId !== messageId) {
          logger.warn(
            '[MESSAGE-ID-TRACKING] Streaming service returned different ID (using our ID)',
            correlationId,
            {
              streamingServiceMessageId: _msgId,
              ourMessageId: messageId,
              stage: 'SSE_ERROR_event',
              timestamp: new Date().toISOString(),
            }
          );
        }

        const errorMessage: StreamChunk = {
          type: 'error',
          content: error,
          messageId: messageId, // Task 9.6.1: Use our messageId, not the one from streaming service
          correlationId,
          timestamp: Date.now(),
        };
        sendSSEMessage(connectionId, errorMessage);

        logger.error('Streaming response failed', correlationId, {
          messageId: messageId,
          error,
        });
      },
    };

    // Process the streaming request
    // Task 9.6.1: Pass messageId to ensure consistent ID throughout the flow
    await streamingService.processStreamingRequest(
      request,
      handler,
      correlationId,
      messageId
    );
  } catch (error) {
    logger.error('Failed to process streaming response', correlationId, {
      messageId,
      error: error instanceof Error ? error.message : String(error),
    });

    // Send error message
    const errorMessage: StreamChunk = {
      type: 'error',
      content: 'Failed to process streaming response',
      messageId,
      correlationId,
      timestamp: Date.now(),
    };

    sendSSEMessage(connectionId, errorMessage);
  }
}

/**
 * Get active SSE connections for session
 * GET /api/chat/connections
 *
 * Task 7.1: Enhanced with connection health metrics, last message timestamp, and connection age
 */
export const getConnectionsHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { correlationId } = req as RequestWithCorrelationId;
  const { sessionId } = req as RequestWithSession;

  try {
    const sessionConns = sessionConnections.get(sessionId) ?? new Set<string>();
    const connections = buildConnectionSummaries(sessionConns, Date.now());

    res.json({
      connections,
      total: connections.length,
      maxConnections: SSE_CONFIG.maxConnectionsPerSession,
      correlationId,
    });
  } catch (error) {
    handleConnectionsError(res, error, correlationId, sessionId);
  }
};

/**
 * Close SSE connection
 * DELETE /api/chat/connections/:connectionId
 */
export const closeConnectionHandler = [
  // Input validation
  param('connectionId')
    .custom(isValidConnectionId)
    .withMessage('Invalid connection ID format'),

  async (req: Request, res: Response): Promise<void> => {
    const { correlationId } = req as RequestWithCorrelationId;
    const { sessionId } = req as RequestWithSession;
    const connectionId = req.params.connectionId as string;

    try {
      validateConnectionRequest(req, correlationId, connectionId);

      const connection = sseConnections.get(connectionId);

      if (!connection) {
        respondConnectionNotFound(res, correlationId);
        return;
      }

      // Validate session access
      if (connection.sessionId !== sessionId) {
        respondAccessDenied(res, correlationId);
        return;
      }

      closeSSEConnection(connectionId, 'manual_close');

      res.json({
        success: true,
        correlationId,
      });
    } catch (error) {
      handleCloseConnectionError(
        res,
        error,
        correlationId,
        connectionId,
        sessionId
      );
    }
  },
];

/**
 * Get SSE connection statistics (for monitoring)
 * GET /api/chat-stats
 *
 * Task 7.2: Comprehensive statistics endpoint with connection metrics, error rates, and reconnection data
 */
export const getChatStatsHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { correlationId } = req as RequestWithCorrelationId;

  try {
    // Clean up inactive connections first
    cleanupInactiveConnections();

    const now = Date.now();
    const health = gatherConnectionHealth(now);
    const avgDuration = calculateAverageDuration();
    const rates = calculateRates(sseStatistics.totalConnectionsCreated);
    const topErrors = getTopErrors();
    const memoryStats = getMemoryStats();

    res.json(
      buildChatStatsResponse(
        health,
        avgDuration,
        rates,
        topErrors,
        memoryStats,
        correlationId
      )
    );
  } catch (error) {
    handleChatStatsError(res, error, correlationId);
  }
};

/**
 * Helper function to format duration in human-readable format
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }

  return `${seconds}s`;
}

/**
 * Legacy endpoint - redirects to getChatStatsHandler
 * GET /api/chat/sse-stats (deprecated)
 */
export const getSSEStatsHandler = getChatStatsHandler;

/**
 * Get SSE health metrics for health check endpoint
 * Task 7.3: Export SSE metrics for inclusion in health endpoint
 */
export function getSSEHealthMetrics(): {
  activeConnections: number;
  totalConnections: number;
  errorRate: number;
  averageConnectionDuration: number;
} {
  // Calculate average connection duration
  const avgDuration =
    sseStatistics.connectionDurations.length > 0
      ? sseStatistics.connectionDurations.reduce((a, b) => a + b, 0) /
        sseStatistics.connectionDurations.length
      : 0;

  // Calculate error rate
  const totalConnections = sseStatistics.totalConnectionsCreated;
  const errorRate =
    totalConnections > 0
      ? (sseStatistics.totalErrors / totalConnections) * 100
      : 0;

  return {
    activeConnections: sseConnections.size,
    totalConnections: sseStatistics.totalConnectionsCreated,
    errorRate: Math.round(errorRate * 100) / 100,
    averageConnectionDuration: Math.round(avgDuration),
  };
}
