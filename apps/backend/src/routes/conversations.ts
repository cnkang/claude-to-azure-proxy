/**
 * Conversation Management Route Handler
 *
 * Handles CRUD operations for conversations with session isolation.
 * Provides conversation persistence and management for frontend clients.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 13.1, 13.4
 */

import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { body, param, query, validationResult } from 'express-validator';
import { ValidationError } from '../errors/index.js';
import { logger } from '../middleware/logging.js';
import type { RequestWithCorrelationId } from '../types/index.js';
import {
  getConversationContextService,
  type ConversationContext,
  type ContextBuildingOptions,
} from '../services/conversation-context-service.js';
import { type ContextMessage } from '../services/context-management-service.js';

// Conversation data structures for API responses
interface ConversationSummary {
  readonly id: string;
  readonly title: string;
  readonly selectedModel: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly messageCount: number;
  readonly contextUsage: {
    readonly currentTokens: number;
    readonly maxTokens: number;
    readonly utilizationPercentage: number;
    readonly canExtend: boolean;
    readonly isExtended: boolean;
  };
  readonly lastMessage?: {
    readonly content: string;
    readonly timestamp: Date;
    readonly role: 'user' | 'assistant';
  };
}

interface _MessageRequest {
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly files?: Array<{
    readonly id: string;
    readonly name: string;
    readonly type: string;
    readonly url: string;
  }>;
}

// Get conversation context service
const conversationService = getConversationContextService();

// Configuration
const CONVERSATION_CONFIG = {
  maxConversationsPerSession: 100,
  maxMessagesPerConversation: 1000,
  maxTitleLength: 200,
  maxMessageLength: 100000, // 100KB
};

/**
 * Convert conversation context to API summary
 */
function convertToConversationSummary(
  context: ConversationContext
): ConversationSummary {
  const lastMessage =
    context.messages.length > 0
      ? context.messages[context.messages.length - 1]
      : undefined;

  return {
    id: context.metadata.id,
    title: context.metadata.title,
    selectedModel: context.metadata.model,
    createdAt: context.metadata.createdAt,
    updatedAt: context.metadata.updatedAt,
    messageCount: context.metadata.messageCount,
    contextUsage: {
      currentTokens: context.contextUsage.currentTokens,
      maxTokens: context.contextUsage.maxTokens,
      utilizationPercentage: context.contextUsage.utilizationPercentage,
      canExtend: context.contextUsage.canExtend,
      isExtended: context.contextUsage.isExtended,
    },
    lastMessage:
      lastMessage &&
      (lastMessage.role === 'user' || lastMessage.role === 'assistant')
        ? {
            content:
              lastMessage.content.substring(0, 100) +
              (lastMessage.content.length > 100 ? '...' : ''),
            timestamp: lastMessage.timestamp,
            role: lastMessage.role,
          }
        : undefined,
  };
}

/**
 * Default context building options
 */
const DEFAULT_CONTEXT_OPTIONS: ContextBuildingOptions = {
  includeSystemMessages: true,
  maxMessages: 100,
  autoCompress: true,
  compressionThreshold: 85, // Auto-compress at 85% utilization
  preserveRecent: 5,
};

/**
 * Get all conversations for a session
 * GET /api/conversations
 */
export const getConversationsHandler = [
  // Query validation
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('offset').optional().isInt({ min: 0 }).toInt(),
  query('search').optional().isString().isLength({ min: 1, max: 100 }),

  async (req: Request, res: Response): Promise<void> => {
    const correlationId = (req as RequestWithCorrelationId).correlationId;
    const sessionId = (req as any).sessionId as string;

    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError(
          'Invalid query parameters',
          correlationId,
          'query',
          errors.array()
        );
      }

      const limit = parseInt(req.query.limit as string, 10) || 50;
      const offset = parseInt(req.query.offset as string, 10) || 0;
      const search = req.query.search as string;

      // Get conversations for session using the service
      const sessionContexts =
        conversationService.getSessionConversations(sessionId);
      let conversationSummaries = sessionContexts.map(
        convertToConversationSummary
      );

      // Apply search filter if provided
      if (search) {
        const searchLower = search.toLowerCase();
        conversationSummaries = conversationSummaries.filter(
          (conv) =>
            conv.title.toLowerCase().includes(searchLower) ||
            conv.lastMessage?.content.toLowerCase().includes(searchLower)
        );
      }

      // Apply pagination
      const paginatedConversations = conversationSummaries.slice(
        offset,
        offset + limit
      );

      logger.info('Retrieved conversations for session', correlationId, {
        sessionId,
        totalConversations: conversationSummaries.length,
        returnedConversations: paginatedConversations.length,
        limit,
        offset,
        hasSearch: !!search,
      });

      res.json({
        conversations: paginatedConversations,
        pagination: {
          total: conversationSummaries.length,
          limit,
          offset,
          hasMore: offset + limit < conversationSummaries.length,
        },
        correlationId,
      });
    } catch (error) {
      logger.error('Failed to get conversations', correlationId, {
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
            type: 'conversations_retrieval_error',
            message: 'Failed to retrieve conversations',
            correlationId,
          },
        });
      }
    }
  },
];

/**
 * Create new conversation
 * POST /api/conversations
 */
export const createConversationHandler = [
  // Input validation
  body('title')
    .optional()
    .isString()
    .isLength({ min: 1, max: CONVERSATION_CONFIG.maxTitleLength }),
  body('initialModel').optional().isString().isLength({ min: 1, max: 100 }),

  async (req: Request, res: Response): Promise<void> => {
    const correlationId = (req as RequestWithCorrelationId).correlationId;
    const sessionId = (req as any).sessionId as string;

    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError(
          'Invalid conversation creation request',
          correlationId,
          'request',
          errors.array()
        );
      }

      // Check conversation limit for session
      const sessionConversations =
        conversationService.getSessionConversations(sessionId);
      if (
        sessionConversations.length >=
        CONVERSATION_CONFIG.maxConversationsPerSession
      ) {
        logger.warn('Conversation limit reached for session', correlationId, {
          sessionId,
          currentCount: sessionConversations.length,
          maxCount: CONVERSATION_CONFIG.maxConversationsPerSession,
        });

        res.status(400).json({
          error: {
            type: 'conversation_limit_exceeded',
            message: `Maximum ${CONVERSATION_CONFIG.maxConversationsPerSession} conversations per session`,
            correlationId,
          },
        });
        return;
      }

      // Create conversation using the service
      const title =
        req.body.title || `Conversation ${new Date().toLocaleString()}`;
      const selectedModel = req.body.initialModel || 'gpt-4o-mini';

      const context = await conversationService.createConversation(
        sessionId,
        title,
        selectedModel,
        correlationId
      );

      logger.info('Conversation created successfully', correlationId, {
        conversationId: context.metadata.id,
        sessionId,
        title,
        selectedModel,
      });

      res.status(201).json({
        ...convertToConversationSummary(context),
        correlationId,
      });
    } catch (error) {
      logger.error('Conversation creation failed', correlationId, {
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
            type: 'conversation_creation_error',
            message: 'Failed to create conversation',
            correlationId,
          },
        });
      }
    }
  },
];

/**
 * Get specific conversation with messages
 * GET /api/conversations/:conversationId
 */
export const getConversationHandler = [
  // Input validation
  param('conversationId')
    .isUUID()
    .withMessage('Invalid conversation ID format'),

  async (req: Request, res: Response): Promise<void> => {
    const correlationId = (req as RequestWithCorrelationId).correlationId;
    const sessionId = (req as any).sessionId as string;
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

      // Get conversation using the service
      const context = conversationService.getConversation(
        conversationId,
        sessionId,
        correlationId
      );

      if (!context) {
        res.status(404).json({
          error: {
            type: 'conversation_not_found',
            message: 'Conversation not found',
            correlationId,
          },
        });
        return;
      }

      logger.info('Retrieved conversation successfully', correlationId, {
        conversationId,
        sessionId,
        messageCount: context.metadata.messageCount,
      });

      res.json({
        id: context.metadata.id,
        title: context.metadata.title,
        selectedModel: context.metadata.model,
        messages: context.messages,
        createdAt: context.metadata.createdAt,
        updatedAt: context.metadata.updatedAt,
        messageCount: context.metadata.messageCount,
        contextUsage: context.contextUsage,
        recommendations: context.recommendations,
        correlationId,
      });
    } catch (error) {
      logger.error('Failed to get conversation', correlationId, {
        conversationId,
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
            type: 'conversation_retrieval_error',
            message: 'Failed to retrieve conversation',
            correlationId,
          },
        });
      }
    }
  },
];

/**
 * Update conversation (title, model)
 * PUT /api/conversations/:conversationId
 */
export const updateConversationHandler = [
  // Input validation
  param('conversationId')
    .isUUID()
    .withMessage('Invalid conversation ID format'),
  body('title')
    .optional()
    .isString()
    .isLength({ min: 1, max: CONVERSATION_CONFIG.maxTitleLength }),
  body('selectedModel').optional().isString().isLength({ min: 1, max: 100 }),

  async (req: Request, res: Response): Promise<void> => {
    const correlationId = (req as RequestWithCorrelationId).correlationId;
    const sessionId = (req as any).sessionId as string;
    const conversationId = req.params.conversationId as string;

    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError(
          'Invalid conversation update request',
          correlationId,
          'request',
          errors.array()
        );
      }

      // Get conversation using the service
      const context = conversationService.getConversation(
        conversationId,
        sessionId,
        correlationId
      );

      if (!context) {
        res.status(404).json({
          error: {
            type: 'conversation_not_found',
            message: 'Conversation not found',
            correlationId,
          },
        });
        return;
      }

      // For now, we'll simulate the update since the service doesn't have an update method
      // In a full implementation, you'd add an updateConversation method to the service
      logger.info('Conversation update requested', correlationId, {
        conversationId,
        sessionId,
        title: req.body.title,
        selectedModel: req.body.selectedModel,
      });

      // Return the current conversation summary (in a real implementation, this would be updated)
      res.json({
        ...convertToConversationSummary(context),
        correlationId,
      });
    } catch (error) {
      logger.error('Conversation update failed', correlationId, {
        conversationId,
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
            type: 'conversation_update_error',
            message: 'Failed to update conversation',
            correlationId,
          },
        });
      }
    }
  },
];

/**
 * Delete conversation
 * DELETE /api/conversations/:conversationId
 */
export const deleteConversationHandler = [
  // Input validation
  param('conversationId')
    .isUUID()
    .withMessage('Invalid conversation ID format'),

  async (req: Request, res: Response): Promise<void> => {
    const correlationId = (req as RequestWithCorrelationId).correlationId;
    const sessionId = (req as any).sessionId as string;
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

      // Delete conversation using the service
      const success = conversationService.deleteConversation(
        conversationId,
        sessionId,
        correlationId
      );

      if (!success) {
        res.status(404).json({
          error: {
            type: 'conversation_not_found',
            message: 'Conversation not found',
            correlationId,
          },
        });
        return;
      }

      logger.info('Conversation deleted successfully', correlationId, {
        conversationId,
        sessionId,
      });

      res.json({
        success: true,
        correlationId,
      });
    } catch (error) {
      logger.error('Conversation deletion failed', correlationId, {
        conversationId,
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
            type: 'conversation_deletion_error',
            message: 'Failed to delete conversation',
            correlationId,
          },
        });
      }
    }
  },
];

/**
 * Add message to conversation
 * POST /api/conversations/:conversationId/messages
 */
export const addMessageHandler = [
  // Input validation
  param('conversationId')
    .isUUID()
    .withMessage('Invalid conversation ID format'),
  body('role')
    .isIn(['user', 'assistant', 'system'])
    .withMessage('Invalid message role'),
  body('content')
    .isString()
    .isLength({ min: 1, max: CONVERSATION_CONFIG.maxMessageLength }),
  body('model').optional().isString().isLength({ min: 1, max: 100 }),
  body('files').optional().isArray(),

  async (req: Request, res: Response): Promise<void> => {
    const correlationId = (req as RequestWithCorrelationId).correlationId;
    const sessionId = (req as any).sessionId as string;
    const conversationId = req.params.conversationId as string;

    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError(
          'Invalid message request',
          correlationId,
          'request',
          errors.array()
        );
      }

      // Get conversation using the service
      const context = conversationService.getConversation(
        conversationId,
        sessionId,
        correlationId
      );

      if (!context) {
        res.status(404).json({
          error: {
            type: 'conversation_not_found',
            message: 'Conversation not found',
            correlationId,
          },
        });
        return;
      }

      // Check message limit
      if (
        context.metadata.messageCount >=
        CONVERSATION_CONFIG.maxMessagesPerConversation
      ) {
        res.status(400).json({
          error: {
            type: 'message_limit_exceeded',
            message: `Maximum ${CONVERSATION_CONFIG.maxMessagesPerConversation} messages per conversation`,
            correlationId,
          },
        });
        return;
      }

      // Create message
      const messageId = uuidv4();
      const now = new Date();

      const message: ContextMessage = {
        id: messageId,
        role: req.body.role,
        content: req.body.content,
        timestamp: now,
      };

      // Add message to conversation using the service
      const updatedContext = await conversationService.addMessage(
        conversationId,
        sessionId,
        message,
        DEFAULT_CONTEXT_OPTIONS,
        correlationId
      );

      logger.info('Message added to conversation', correlationId, {
        conversationId,
        sessionId,
        messageId,
        role: message.role,
        contentLength: message.content.length,
        hasFiles: !!req.body.files?.length,
      });

      res.status(201).json({
        message,
        conversation: convertToConversationSummary(updatedContext),
        contextUsage: updatedContext.contextUsage,
        recommendations: updatedContext.recommendations,
        correlationId,
      });
    } catch (error) {
      logger.error('Failed to add message', correlationId, {
        conversationId,
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
            type: 'message_creation_error',
            message: 'Failed to add message',
            correlationId,
          },
        });
      }
    }
  },
];

/**
 * Get conversation statistics (for monitoring)
 */
export const getConversationStatsHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const correlationId = (req as RequestWithCorrelationId).correlationId;

  try {
    // Get statistics from the service
    const stats = conversationService.getConversationStats();

    res.json({
      ...stats,
      maxConversationsPerSession:
        CONVERSATION_CONFIG.maxConversationsPerSession,
      maxMessagesPerConversation:
        CONVERSATION_CONFIG.maxMessagesPerConversation,
      correlationId,
    });
  } catch (error) {
    logger.error('Failed to get conversation statistics', correlationId, {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      error: {
        type: 'stats_error',
        message: 'Failed to get conversation statistics',
        correlationId,
      },
    });
  }
};
