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

interface RequestWithSession extends RequestWithCorrelationId {
  sessionId: string;
}

// SSE connection management
interface SSEConnection {
  readonly id: string;
  readonly sessionId: string;
  readonly conversationId: string;
  readonly response: Response;
  readonly createdAt: Date;
  readonly correlationId: string;
  isActive: boolean;
}

interface StreamChunk {
  readonly type: 'start' | 'chunk' | 'end' | 'error';
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

// Configuration
const SSE_CONFIG = {
  maxConnectionsPerSession: 5,
  connectionTimeout: 30 * 60 * 1000, // 30 minutes
  heartbeatInterval: 30 * 1000, // 30 seconds
  cleanupInterval: 60 * 1000, // 1 minute
  maxMessageSize: 100000, // 100KB
};

/**
 * Clean up inactive connections
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
    return true;
  } catch (error) {
    logger.warn('Failed to send SSE message', connection.correlationId, {
      connectionId,
      error: error instanceof Error ? error.message : String(error),
    });

    closeSSEConnection(connectionId, 'write_error');
    return false;
  }
}

/**
 * Send heartbeat to all active connections
 */
function sendHeartbeat(): void {
  const heartbeatData: StreamChunk = {
    type: 'chunk',
    content: '',
    correlationId: 'heartbeat',
    timestamp: Date.now(),
  };

  for (const connectionId of sseConnections.keys()) {
    sendSSEMessage(connectionId, heartbeatData);
  }
}

/**
 * Close SSE connection
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

    sseConnections.delete(connectionId);

    // Remove from session mapping
    const sessionConns = sessionConnections.get(connection.sessionId);
    if (sessionConns) {
      sessionConns.delete(connectionId);
      if (sessionConns.size === 0) {
        sessionConnections.delete(connection.sessionId);
      }
    }

    logger.info('SSE connection closed', connection.correlationId, {
      connectionId,
      sessionId: connection.sessionId,
      conversationId: connection.conversationId,
      reason,
      duration: Date.now() - connection.createdAt.getTime(),
    });
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
    .isUUID()
    .withMessage('Invalid conversation ID format'),

  (req: Request, res: Response): void => {
    const correlationId = (req as RequestWithCorrelationId).correlationId;
    const sessionId = (req as RequestWithSession).sessionId;
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

      // Set up SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
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
      };

      // Store connection
      sseConnections.set(connectionId, connection);

      // Add to session mapping
      if (!sessionConnections.has(sessionId)) {
        sessionConnections.set(sessionId, new Set());
      }
      sessionConnections.get(sessionId)!.add(connectionId);

      // Send initial connection message
      const initialMessage: StreamChunk = {
        type: 'start',
        correlationId,
        timestamp: Date.now(),
      };

      sendSSEMessage(connectionId, initialMessage);

      logger.info('SSE connection established', correlationId, {
        connectionId,
        sessionId,
        conversationId,
      });

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
  body('conversationId').isUUID().withMessage('Invalid conversation ID format'),
  body('message')
    .isString()
    .isLength({ min: 1, max: SSE_CONFIG.maxMessageSize }),
  body('model').isString().isLength({ min: 1, max: 100 }),
  body('files').optional().isArray(),
  body('contextMessages').optional().isArray(),
  body('contextMessages.*.id').optional().isUUID(),
  body('contextMessages.*.role')
    .optional()
    .isIn(['user', 'assistant', 'system']),
  body('contextMessages.*.content').optional().isString(),
  body('contextMessages.*.timestamp').optional().isISO8601(),

  async (req: Request, res: Response): Promise<void> => {
    const correlationId = (req as RequestWithCorrelationId).correlationId;
    const sessionId = (req as RequestWithSession).sessionId;

    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError(
          'Invalid chat message request',
          correlationId,
          'request',
          errors.array()
        );
      }

      const { message, model, files, contextMessages, conversationId } =
        req.body as ChatStreamRequest;

      // Find active SSE connection for this conversation and session
      let targetConnection: SSEConnection | undefined;

      for (const connection of sseConnections.values()) {
        if (
          connection.sessionId === sessionId &&
          connection.conversationId === conversationId &&
          connection.isActive === true
        ) {
          targetConnection = connection;
          break;
        }
      }

      if (!targetConnection) {
        res.status(400).json({
          error: {
            type: 'no_active_connection',
            message: 'No active streaming connection for this conversation',
            correlationId,
          },
        });
        return;
      }

      logger.info('Processing chat message for streaming', correlationId, {
        conversationId,
        sessionId,
        messageLength: message.length,
        model,
        hasFiles: !!files?.length,
        hasContext: !!contextMessages?.length,
      });

      // Generate message ID for tracking
      const messageId = uuidv4();

      // Send start message
      const startMessage: StreamChunk = {
        type: 'start',
        messageId,
        correlationId,
        timestamp: Date.now(),
        model,
      };

      sendSSEMessage(targetConnection.id, startMessage);

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
    const handler = {
      onStart: (msgId: string, model: string) => {
        const startMessage: StreamChunk = {
          type: 'start',
          messageId: msgId,
          correlationId,
          timestamp: Date.now(),
          model,
        };
        sendSSEMessage(connectionId, startMessage);
      },

      onChunk: (content: string, msgId: string) => {
        if (connection.isActive !== true) {
          return;
        }

        const chunk: StreamChunk = {
          type: 'chunk',
          content,
          messageId: msgId,
          correlationId,
          timestamp: Date.now(),
        };
        sendSSEMessage(connectionId, chunk);
      },

      onEnd: (msgId: string, usage?: StreamChunk['usage']) => {
        const endMessage: StreamChunk = {
          type: 'end',
          messageId: msgId,
          correlationId,
          timestamp: Date.now(),
          usage,
        };
        sendSSEMessage(connectionId, endMessage);

        logger.info('Streaming response completed', correlationId, {
          messageId: msgId,
          model: request.model,
          usage,
        });
      },

      onError: (error: string, msgId: string) => {
        const errorMessage: StreamChunk = {
          type: 'error',
          content: error,
          messageId: msgId,
          correlationId,
          timestamp: Date.now(),
        };
        sendSSEMessage(connectionId, errorMessage);

        logger.error('Streaming response failed', correlationId, {
          messageId: msgId,
          error,
        });
      },
    };

    // Process the streaming request
    await streamingService.processStreamingRequest(
      request,
      handler,
      correlationId
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
 */
export const getConnectionsHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const correlationId = (req as RequestWithCorrelationId).correlationId;
  const sessionId = (req as RequestWithSession).sessionId;

  try {
    const sessionConns = sessionConnections.get(sessionId) ?? new Set<string>();
    const connections = [];

    for (const connectionId of sessionConns) {
      const connection = sseConnections.get(connectionId);
      if (connection?.isActive === true) {
        connections.push({
          id: connection.id,
          conversationId: connection.conversationId,
          createdAt: connection.createdAt.toISOString(),
          duration: Date.now() - connection.createdAt.getTime(),
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
  param('connectionId').isUUID().withMessage('Invalid connection ID format'),

  async (req: Request, res: Response): Promise<void> => {
    const correlationId = (req as RequestWithCorrelationId).correlationId;
    const sessionId = (req as RequestWithSession).sessionId;
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
 */
export const getSSEStatsHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const correlationId = (req as RequestWithCorrelationId).correlationId;

  try {
    // Clean up inactive connections first
    cleanupInactiveConnections();

    const now = Date.now();
    let activeConnections = 0;
    let recentConnections = 0;
    const connectionsBySession = new Map<string, number>();

    for (const connection of sseConnections.values()) {
      if (connection.isActive) {
        activeConnections++;

        const age = now - connection.createdAt.getTime();
        if (age < 60 * 60 * 1000) {
          // Last hour
          recentConnections++;
        }

        const sessionCount =
          connectionsBySession.get(connection.sessionId) || 0;
        connectionsBySession.set(connection.sessionId, sessionCount + 1);
      }
    }

    res.json({
      totalConnections: sseConnections.size,
      activeConnections,
      recentConnections,
      totalSessions: sessionConnections.size,
      averageConnectionsPerSession:
        connectionsBySession.size > 0
          ? Array.from(connectionsBySession.values()).reduce(
              (a, b) => a + b,
              0
            ) / connectionsBySession.size
          : 0,
      maxConnectionsPerSession: SSE_CONFIG.maxConnectionsPerSession,
      connectionTimeout: SSE_CONFIG.connectionTimeout,
      correlationId,
    });
  } catch (error) {
    logger.error('Failed to get SSE statistics', correlationId, {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      error: {
        type: 'stats_error',
        message: 'Failed to get SSE statistics',
        correlationId,
      },
    });
  }
};
