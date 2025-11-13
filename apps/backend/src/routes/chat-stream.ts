/**
 * Chat Streaming Route Handler
 *
 * Handles Server-Sent Events (SSE) for real-time chat streaming.
 * Provides streaming responses with session isolation and connection management.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 13.1, 13.4
 */

import type { Request, Response } from 'express';
import { param, body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { ValidationError } from '../errors/index.js';
import { logger } from '../middleware/logging.js';
import type { RequestWithCorrelationId } from '../types/index.js';
import type { ContextMessage } from '../services/context-management-service.js';
import { isValidConversationId, isValidConnectionId, isValidMessageId } from '../utils/validation.js';
import { forceGarbageCollection, getCurrentMemoryMetrics } from '../utils/memory-manager.js';

interface RequestWithSession extends RequestWithCorrelationId {
  sessionId: string;
}

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
  if (sseStatistics.reconnectionsBySession.size > STATS_CONFIG.maxReconnectionSessions) {
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

/**
 * Close SSE connection
 * 
 * Task 11.3: Enhanced cleanup to release Response object references
 */
function closeSSEConnection(connectionId: string, reason: string): void {
  const connection = sseConnections.get(connectionId);

  if (connection) {
    connection.isActive = false;

    try {
      connection.response.end();
    } catch {
      // Connection might already be closed
    }

    // Calculate connection duration
    const duration = Date.now() - connection.createdAt.getTime();

    // Task 11.3: Remove connection from map immediately to release Response object
    sseConnections.delete(connectionId);

    // Remove from session mapping
    const sessionConns = sessionConnections.get(connection.sessionId);
    if (sessionConns) {
      sessionConns.delete(connectionId);
      if (sessionConns.size === 0) {
        sessionConnections.delete(connection.sessionId);
      }
    }

    // Remove from secondary index
    const indexKey = `${connection.sessionId}_${connection.conversationId}`;
    connectionIndex.delete(indexKey);

    // Track statistics
    sseStatistics.totalConnectionsClosed++;
    
    // Store connection duration (keep last N durations)
    sseStatistics.connectionDurations.push(duration);
    if (sseStatistics.connectionDurations.length > SSE_CONFIG.maxStoredDurations) {
      sseStatistics.connectionDurations.shift(); // Remove oldest
    }

    // Track errors
    if (reason.includes('error') || reason.includes('timeout')) {
      sseStatistics.totalErrors++;
      const errorCount = sseStatistics.errorsByType.get(reason) || 0;
      sseStatistics.errorsByType.set(reason, errorCount + 1);
    }

    // Track reconnections (if this is not the first connection for this session)
    if (reason === 'client_disconnect' || reason.includes('error')) {
      const reconnectCount = sseStatistics.reconnectionsBySession.get(connection.sessionId) || 0;
      if (reconnectCount > 0) {
        sseStatistics.totalReconnections++;
      }
      sseStatistics.reconnectionsBySession.set(connection.sessionId, reconnectCount + 1);
    }

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
    const {correlationId} = req as RequestWithCorrelationId;
    const {sessionId} = req as RequestWithSession;
    const conversationId = req.params.conversationId as string;

    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError(
          'Invalid conversation ID',
          correlationId,
          'conversationId',
          conversationId
        );
      }

      // Check connection limit for session
      const sessionConns = sessionConnections.get(sessionId) || new Set();
      if (sessionConns.size >= SSE_CONFIG.maxConnectionsPerSession) {
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
        return;
      }

      // Set up SSE headers with nginx compatibility
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering for SSE
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      });

      // Create connection
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

      // Store connection
      sseConnections.set(connectionId, connection);

      // Add to session mapping
      if (!sessionConnections.has(sessionId)) {
        sessionConnections.set(sessionId, new Set());
      }
      sessionConnections.get(sessionId)!.add(connectionId);

      // Add to secondary index for fast lookup
      const indexKey = `${sessionId}_${conversationId}`;
      connectionIndex.set(indexKey, connectionId);

      // Track statistics
      sseStatistics.totalConnectionsCreated++;

      logger.info('SSE connection established', correlationId, {
        connectionId,
        sessionId,
        conversationId,
        totalCreated: sseStatistics.totalConnectionsCreated,
      });

      // Send initial connection message after delay to ensure client is ready
      setTimeout(() => {
        // Verify connection is still active before sending
        if (connection.isActive) {
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
        } else {
          logger.warn('Connection closed before initial message could be sent', correlationId, {
            connectionId,
          });
        }
      }, 100); // 100ms delay to ensure client is ready

      // Handle client disconnect
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
    } catch (error) {
      logger.error('Failed to establish SSE connection', correlationId, {
        sessionId,
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (!res.headersSent) {
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
              type: 'sse_connection_error',
              message: 'Failed to establish streaming connection',
              correlationId,
            },
          });
        }
      }
    }
  },
];

/**
 * Send chat message with streaming response
 * POST /api/chat/send
 */
export const sendChatMessageHandler = [
  // Input validation
  body('conversationId').custom(isValidConversationId).withMessage('Invalid conversation ID format'),
  body('message')
    .isString()
    .isLength({ min: 1, max: SSE_CONFIG.maxMessageSize })
    .withMessage('Message must be a string between 1 and 100000 characters'),
  body('model')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Model must be a string between 1 and 100 characters'),
  body('files').optional().isArray().withMessage('Files must be an array'),
  body('contextMessages').optional().isArray().withMessage('Context messages must be an array'),

  async (req: Request, res: Response): Promise<void> => {
    const {correlationId} = req as RequestWithCorrelationId;
    const {sessionId} = req as RequestWithSession;

    try {
      // Task 10.1: Log incoming message request for debugging
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

      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        // Task 10.1: Enhanced error logging with detailed validation failure information
        logger.error('Chat message validation failed', correlationId, {
          errors: errors.array(),
          errorDetails: errors.array().map(err => ({
            field: err.type === 'field' ? (err as any).path : 'unknown',
            message: err.msg,
            value: err.type === 'field' ? (err as any).value : undefined,
            location: err.type === 'field' ? (err as any).location : undefined,
          })),
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
          errors.array()
        );
      }

      const { message, model, files, contextMessages, conversationId } =
        req.body as ChatStreamRequest;

      // Task 10.4: Additional validation for contextMessages if provided
      if (contextMessages && Array.isArray(contextMessages)) {
        logger.debug('Validating context messages', correlationId, {
          contextMessageCount: contextMessages.length,
          contextMessages: contextMessages.map(msg => ({
            id: msg.id,
            role: msg.role,
            hasContent: !!msg.content,
          })),
        });
        
        for (let i = 0; i < contextMessages.length; i++) {
          const msg = contextMessages[i];
          
          // Validate message ID if provided (it's optional)
          if (msg.id && !isValidMessageId(msg.id)) {
            logger.warn('Invalid message ID in context messages', correlationId, {
              index: i,
              messageId: msg.id,
              role: msg.role,
            });
            throw new ValidationError(
              `Invalid message ID in context messages at index ${i}`,
              correlationId,
              'contextMessages',
              msg.id
            );
          }
          
          // Validate role
          if (msg.role && !['user', 'assistant', 'system'].includes(msg.role)) {
            logger.warn('Invalid role in context messages', correlationId, {
              index: i,
              role: msg.role,
              validRoles: ['user', 'assistant', 'system'],
            });
            throw new ValidationError(
              `Invalid role in context messages at index ${i}: ${msg.role}`,
              correlationId,
              'contextMessages',
              msg.role
            );
          }
          
          // Validate content exists
          if (!msg.content || (typeof msg.content === 'string' && msg.content.trim().length === 0)) {
            logger.warn('Empty content in context messages', correlationId, {
              index: i,
              role: msg.role,
              messageId: msg.id,
            });
            throw new ValidationError(
              `Empty content in context messages at index ${i}`,
              correlationId,
              'contextMessages',
              'content'
            );
          }
        }
        
        logger.debug('Context messages validation passed', correlationId, {
          validatedCount: contextMessages.length,
        });
      }

      // Task 10.2: Find active SSE connection for this conversation and session using secondary index
      const indexKey = `${sessionId}_${conversationId}`;
      const connectionId = connectionIndex.get(indexKey);
      const targetConnection = connectionId ? sseConnections.get(connectionId) : undefined;

      // Task 10.2: Log connection lookup details for debugging
      logger.info('Connection lookup for message', correlationId, {
        indexKey,
        connectionId,
        connectionFound: !!targetConnection,
        connectionActive: targetConnection?.isActive,
        totalConnections: sseConnections.size,
        totalIndexEntries: connectionIndex.size,
        sessionConnections: sessionConnections.get(sessionId)?.size || 0,
      });

      // Verify connection is still active
      if (targetConnection && !targetConnection.isActive) {
        // Connection exists but is not active, clean it up
        logger.warn('Found inactive connection, cleaning up', correlationId, {
          connectionId: targetConnection.id,
          conversationId,
          sessionId,
        });
        closeSSEConnection(targetConnection.id, 'inactive_connection');
      }

      if (!targetConnection?.isActive) {
        // Task 10.2: Enhanced error logging when no active connection found
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
        
        res.status(400).json({
          error: {
            type: 'no_active_connection',
            message: 'No active streaming connection for this conversation',
            correlationId,
          },
        });
        return;
      }

      // Task 10.3: Check if there's already an active stream for this conversation
      const existingStream = Array.from(sseConnections.values()).find(
        conn => conn.conversationId === conversationId && 
                conn.sessionId === sessionId && 
                conn.isActive
      );
      
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

      // Generate message ID for tracking
      const messageId = uuidv4();
      
      // Task 9.6.2: Log message ID at sendMessage response stage
      logger.info('[MESSAGE-ID-TRACKING] Message ID generated in sendChatMessageHandler', correlationId, {
        messageId,
        conversationId,
        sessionId,
        stage: 'sendMessage_response',
        timestamp: new Date().toISOString(),
      });

      // Note: Start message will be sent by the streaming handler
      // Do not send duplicate start message here

      // Create streaming request
      const streamRequest: ChatStreamRequest = {
        message,
        model,
        conversationId,
        files,
        contextMessages,
      };

      // Process streaming response using the streaming service
      await processStreamingResponse(
        targetConnection.id,
        messageId,
        streamRequest,
        correlationId
      );

      // Return immediate response
      res.json({
        messageId,
        status: 'streaming',
        correlationId,
      });
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
        logger.info('[MESSAGE-ID-TRACKING] Sending SSE START event', correlationId, {
          messageId: messageId,
          streamingServiceMessageId: _msgId,
          idsMatch: _msgId === messageId,
          stage: 'SSE_START_event',
          model,
          timestamp: new Date().toISOString(),
        });
        
        // Task 9.6.2: Add assertion to verify IDs match
        if (_msgId !== messageId) {
          logger.warn('[MESSAGE-ID-TRACKING] Streaming service returned different ID (expected, will use our ID)', correlationId, {
            streamingServiceMessageId: _msgId,
            ourMessageId: messageId,
            stage: 'SSE_START_event',
            timestamp: new Date().toISOString(),
          });
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
          logger.debug('[MESSAGE-ID-TRACKING] Sending SSE CHUNK event', correlationId, {
            messageId: messageId,
            streamingServiceMessageId: _msgId,
            idsMatch: _msgId === messageId,
            stage: 'SSE_CHUNK_event',
            chunkNumber: chunkCount + 1,
            contentLength: content.length,
            timestamp: new Date().toISOString(),
          });
          
          // Task 9.6.2: Add assertion to verify IDs match
          if (_msgId !== messageId) {
            logger.debug('[MESSAGE-ID-TRACKING] Streaming service ID differs (using our ID)', correlationId, {
              streamingServiceMessageId: _msgId,
              ourMessageId: messageId,
              stage: 'SSE_CHUNK_event',
              chunkNumber: chunkCount + 1,
              timestamp: new Date().toISOString(),
            });
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
        logger.info('[MESSAGE-ID-TRACKING] Sending SSE END event', correlationId, {
          messageId: messageId,
          streamingServiceMessageId: _msgId,
          idsMatch: _msgId === messageId,
          stage: 'SSE_END_event',
          usage,
          timestamp: new Date().toISOString(),
        });
        
        // Task 9.6.2: Add assertion to verify IDs match
        if (_msgId !== messageId) {
          logger.warn('[MESSAGE-ID-TRACKING] Streaming service returned different ID (using our ID)', correlationId, {
            streamingServiceMessageId: _msgId,
            ourMessageId: messageId,
            stage: 'SSE_END_event',
            timestamp: new Date().toISOString(),
          });
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
        logger.error('[MESSAGE-ID-TRACKING] Sending SSE ERROR event', correlationId, {
          messageId: messageId,
          streamingServiceMessageId: _msgId,
          idsMatch: _msgId === messageId,
          stage: 'SSE_ERROR_event',
          error,
          timestamp: new Date().toISOString(),
        });
        
        // Task 9.6.2: Add assertion to verify IDs match
        if (_msgId !== messageId) {
          logger.warn('[MESSAGE-ID-TRACKING] Streaming service returned different ID (using our ID)', correlationId, {
            streamingServiceMessageId: _msgId,
            ourMessageId: messageId,
            stage: 'SSE_ERROR_event',
            timestamp: new Date().toISOString(),
          });
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
  const {correlationId} = req as RequestWithCorrelationId;
  const {sessionId} = req as RequestWithSession;

  try {
    const sessionConns = sessionConnections.get(sessionId) ?? new Set<string>();
    const connections = [];
    const now = Date.now();

    for (const connectionId of sessionConns) {
      const connection = sseConnections.get(connectionId);
      if (connection?.isActive === true) {
        const connectionAge = now - connection.createdAt.getTime();
        const ageInMinutes = Math.floor(connectionAge / 60000);
        const ageInSeconds = Math.floor((connectionAge % 60000) / 1000);
        
        // Calculate connection health based on age and activity
        const isStale = connectionAge > 5 * 60 * 1000; // 5 minutes without activity
        const isNearTimeout = connectionAge > SSE_CONFIG.connectionTimeout * 0.8;
        
        let healthStatus: 'healthy' | 'stale' | 'near_timeout';
        if (isNearTimeout) {
          healthStatus = 'near_timeout';
        } else if (isStale) {
          healthStatus = 'stale';
        } else {
          healthStatus = 'healthy';
        }

        connections.push({
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
        });
      }
    }

    res.json({
      connections,
      total: connections.length,
      maxConnections: SSE_CONFIG.maxConnectionsPerSession,
      correlationId,
    });
  } catch (error) {
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
};

/**
 * Close SSE connection
 * DELETE /api/chat/connections/:connectionId
 */
export const closeConnectionHandler = [
  // Input validation
  param('connectionId').custom(isValidConnectionId).withMessage('Invalid connection ID format'),

  async (req: Request, res: Response): Promise<void> => {
    const {correlationId} = req as RequestWithCorrelationId;
    const {sessionId} = req as RequestWithSession;
    const connectionId = req.params.connectionId as string;

    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError(
          'Invalid connection ID',
          correlationId,
          'connectionId',
          connectionId
        );
      }

      const connection = sseConnections.get(connectionId);

      if (!connection) {
        res.status(404).json({
          error: {
            type: 'connection_not_found',
            message: 'Connection not found',
            correlationId,
          },
        });
        return;
      }

      // Validate session access
      if (connection.sessionId !== sessionId) {
        res.status(403).json({
          error: {
            type: 'access_denied',
            message: 'Access denied to this connection',
            correlationId,
          },
        });
        return;
      }

      closeSSEConnection(connectionId, 'manual_close');

      res.json({
        success: true,
        correlationId,
      });
    } catch (error) {
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
      } else {
        res.status(500).json({
          error: {
            type: 'connection_close_error',
            message: 'Failed to close connection',
            correlationId,
          },
        });
      }
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
  const {correlationId} = req as RequestWithCorrelationId;

  try {
    // Clean up inactive connections first
    cleanupInactiveConnections();

    const now = Date.now();
    let activeConnections = 0;
    let healthyConnections = 0;
    let staleConnections = 0;
    const connectionsBySession = new Map<string, number>();

    for (const connection of sseConnections.values()) {
      if (connection.isActive) {
        activeConnections++;

        const _age = now - connection.createdAt.getTime();
        const timeSinceLastMessage = now - connection.lastMessageTimestamp;

        // Track health status
        if (timeSinceLastMessage > 5 * 60 * 1000) {
          staleConnections++;
        } else {
          healthyConnections++;
        }

        const sessionCount = connectionsBySession.get(connection.sessionId) || 0;
        connectionsBySession.set(connection.sessionId, sessionCount + 1);
      }
    }

    // Calculate average connection duration
    const avgDuration =
      sseStatistics.connectionDurations.length > 0
        ? sseStatistics.connectionDurations.reduce((a, b) => a + b, 0) /
          sseStatistics.connectionDurations.length
        : 0;

    // Calculate error rate
    const totalConnections = sseStatistics.totalConnectionsCreated;
    const errorRate = totalConnections > 0 ? (sseStatistics.totalErrors / totalConnections) * 100 : 0;

    // Calculate reconnection rate
    const reconnectionRate =
      totalConnections > 0 ? (sseStatistics.totalReconnections / totalConnections) * 100 : 0;

    // Get top error types
    const topErrors = Array.from(sseStatistics.errorsByType.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));

    // Task 11.4: Add memory usage metrics
    const memoryUsage = process.memoryUsage();
    const memoryPercentUsed = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

    res.json({
      // Current state
      totalConnections: sseConnections.size,
      activeConnections,
      healthyConnections,
      staleConnections,
      totalSessions: sessionConnections.size,
      
      // Lifetime statistics
      lifetime: {
        totalConnectionsCreated: sseStatistics.totalConnectionsCreated,
        totalConnectionsClosed: sseStatistics.totalConnectionsClosed,
        totalErrors: sseStatistics.totalErrors,
        totalReconnections: sseStatistics.totalReconnections,
      },

      // Averages and rates
      averageConnectionDuration: Math.round(avgDuration),
      averageConnectionDurationFormatted: formatDuration(avgDuration),
      averageConnectionsPerSession:
        connectionsBySession.size > 0
          ? Array.from(connectionsBySession.values()).reduce((a, b) => a + b, 0) /
            connectionsBySession.size
          : 0,
      errorRate: Math.round(errorRate * 100) / 100, // Round to 2 decimal places
      reconnectionRate: Math.round(reconnectionRate * 100) / 100,

      // Error breakdown
      topErrors,
      errorsByType: Object.fromEntries(sseStatistics.errorsByType),

      // Reconnection statistics
      reconnectionStatistics: {
        totalReconnections: sseStatistics.totalReconnections,
        sessionsWithReconnections: Array.from(sseStatistics.reconnectionsBySession.values()).filter(
          (count) => count > 1
        ).length,
        averageReconnectionsPerSession:
          sseStatistics.reconnectionsBySession.size > 0
            ? Array.from(sseStatistics.reconnectionsBySession.values()).reduce((a, b) => a + b, 0) /
              sseStatistics.reconnectionsBySession.size
            : 0,
      },

      // Task 11.4: Memory usage metrics
      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        rss: memoryUsage.rss,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers,
        percentUsed: Math.round(memoryPercentUsed * 100) / 100,
        heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        rssMB: Math.round(memoryUsage.rss / 1024 / 1024),
      },

      // Configuration
      config: {
        maxConnectionsPerSession: SSE_CONFIG.maxConnectionsPerSession,
        connectionTimeout: SSE_CONFIG.connectionTimeout,
        heartbeatInterval: SSE_CONFIG.heartbeatInterval,
        cleanupInterval: SSE_CONFIG.cleanupInterval,
      },

      correlationId,
    });
  } catch (error) {
    logger.error('Failed to get chat statistics', correlationId, {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      error: {
        type: 'stats_error',
        message: 'Failed to get chat statistics',
        correlationId,
      },
    });
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
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
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
  const errorRate = totalConnections > 0 ? (sseStatistics.totalErrors / totalConnections) * 100 : 0;

  return {
    activeConnections: sseConnections.size,
    totalConnections: sseStatistics.totalConnectionsCreated,
    errorRate: Math.round(errorRate * 100) / 100,
    averageConnectionDuration: Math.round(avgDuration),
  };
}
