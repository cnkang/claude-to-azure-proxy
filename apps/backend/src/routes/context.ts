/**
 * Context Management Route Handler
 *
 * Handles conversation context extension and compression for frontend clients.
 * Provides intelligent context management to optimize model performance.
 *
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
 */

import type { Request, Response } from 'express';
import { param, body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { ValidationError } from '../errors/index.js';
import { logger } from '../middleware/logging.js';
import type { RequestWithCorrelationId } from '../types/index.js';
import {
  getContextManagementService,
  type ContextMessage,
  type ContextCompressionOptions,
} from '../services/context-management-service.js';
import { isValidConversationId } from '../utils/validation.js';
import { getModelRoutingService } from '../services/model-routing-service.js';
import { getConversationContextService } from '../services/conversation-context-service.js';

// Context management types (using service types)
interface CompressionEvent {
  readonly id: string;
  readonly timestamp: Date;
  readonly originalTokens: number;
  readonly compressedTokens: number;
  readonly compressionRatio: number;
  readonly method: 'ai-summary' | 'selective-removal' | 'hierarchical';
  readonly correlationId: string;
}

interface ContextExtensionRequest {
  readonly targetModel: string;
  readonly reason?: string;
}

interface ContextCompressionRequest {
  readonly method: 'ai-summary' | 'selective-removal' | 'hierarchical';
  readonly targetTokens?: number;
  readonly preserveRecent?: number; // Number of recent messages to preserve
  readonly preserveImportant?: boolean; // Whether to preserve important messages
}

interface CompressedConversationRequest {
  readonly title?: string;
  readonly compressedContext: string;
  readonly originalConversationId: string;
}

// Model context limits are now handled by the model routing service

// In-memory storage for context data (could be database in production)
const compressionHistory = new Map<string, CompressionEvent[]>();

// Get service instances
const contextService = getContextManagementService();
const modelRoutingService = getModelRoutingService();
const conversationService = getConversationContextService();

/**
 * Get context usage for conversation
 * GET /api/conversations/:conversationId/context
 */
export const getContextUsageHandler = [
  // Input validation
  param('conversationId')
    .custom(isValidConversationId)
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

      // In a real implementation, you would fetch the conversation from storage
      // For now, we'll simulate context usage calculation

      // Simulate conversation messages (in real implementation, fetch from database)
      const simulatedMessages: ContextMessage[] = [
        {
          id: uuidv4(),
          role: 'user',
          content: 'Hello, I need help with my TypeScript project.',
          timestamp: new Date(),
        },
        {
          id: uuidv4(),
          role: 'assistant',
          content:
            "I'd be happy to help you with your TypeScript project. What specific issue are you facing?",
          timestamp: new Date(),
        },
      ];

      const model = 'gpt-4o-mini'; // In real implementation, get from conversation
      const contextUsage = contextService.calculateContextUsage(
        simulatedMessages,
        model
      );

      // Get compression history
      const compressions = compressionHistory.get(conversationId) || [];

      logger.info('Retrieved context usage', correlationId, {
        conversationId,
        sessionId,
        currentTokens: contextUsage.currentTokens,
        maxTokens: contextUsage.maxTokens,
        usagePercentage: Math.round(
          (contextUsage.currentTokens / contextUsage.maxTokens) * 100
        ),
        canExtend: contextUsage.canExtend,
      });

      res.json({
        contextUsage,
        compressionHistory: compressions,
        recommendations: contextService.getContextRecommendations(contextUsage),
        correlationId,
      });
    } catch (error) {
      logger.error('Failed to get context usage', correlationId, {
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
            type: 'context_usage_error',
            message: 'Failed to get context usage',
            correlationId,
          },
        });
      }
    }
  },
];

/**
 * Extend conversation context
 * POST /api/conversations/:conversationId/extend-context
 */
export const extendContextHandler = [
  // Input validation
  param('conversationId')
    .custom(isValidConversationId)
    .withMessage('Invalid conversation ID format'),
  body('targetModel').isString().isLength({ min: 1, max: 100 }),
  body('reason').optional().isString().isLength({ min: 1, max: 500 }),

  async (req: Request, res: Response): Promise<void> => {
    const correlationId = (req as RequestWithCorrelationId).correlationId;
    const sessionId = (req as any).sessionId as string;
    const conversationId = req.params.conversationId as string;

    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError(
          'Invalid context extension request',
          correlationId,
          'request',
          errors.array()
        );
      }

      const { targetModel, reason }: ContextExtensionRequest = req.body;

      // Check if target model supports context extension
      if (!modelRoutingService.supportsContextExtension(targetModel)) {
        throw new ValidationError(
          `Model "${targetModel}" does not support context extension`,
          correlationId,
          'targetModel',
          targetModel
        );
      }

      // Use conversation context service to extend context
      const updatedContext =
        await conversationService.extendConversationContext(
          conversationId,
          sessionId,
          targetModel,
          correlationId
        );

      logger.info('Context extended successfully', correlationId, {
        conversationId,
        sessionId,
        targetModel,
        reason,
        isExtended: updatedContext.metadata.isExtended,
      });

      res.json({
        success: true,
        contextUsage: updatedContext.contextUsage,
        extension: {
          originalMaxTokens:
            updatedContext.contextUsage.maxTokens /
            (updatedContext.metadata.isExtended ? 4 : 1), // Rough estimation
          extendedMaxTokens: updatedContext.contextUsage.maxTokens,
          extensionRatio: updatedContext.metadata.isExtended ? 4 : 1, // Rough estimation
          reason,
        },
        correlationId,
      });
    } catch (error) {
      logger.error('Context extension failed', correlationId, {
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
            type: 'context_extension_error',
            message: 'Failed to extend context',
            correlationId,
          },
        });
      }
    }
  },
];

/**
 * Compress conversation context
 * POST /api/conversations/:conversationId/compress
 */
export const compressContextHandler = [
  // Input validation
  param('conversationId')
    .custom(isValidConversationId)
    .withMessage('Invalid conversation ID format'),
  body('method').isIn(['ai-summary', 'selective-removal', 'hierarchical']),
  body('targetTokens').optional().isInt({ min: 100, max: 1000000 }),
  body('preserveRecent').optional().isInt({ min: 1, max: 100 }),
  body('preserveImportant').optional().isBoolean(),

  async (req: Request, res: Response): Promise<void> => {
    const correlationId = (req as RequestWithCorrelationId).correlationId;
    const sessionId = (req as any).sessionId as string;
    const conversationId = req.params.conversationId as string;

    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError(
          'Invalid compression request',
          correlationId,
          'request',
          errors.array()
        );
      }

      const {
        method,
        targetTokens,
        preserveRecent = 5,
        preserveImportant = true,
      }: ContextCompressionRequest = req.body;

      // Simulate conversation messages (in real implementation, fetch from database)
      const simulatedMessages: ContextMessage[] = [
        {
          id: uuidv4(),
          role: 'user',
          content:
            "Hello, I need help with my TypeScript project. I'm working on a large application with multiple modules and I'm having issues with type definitions and module resolution.",
          timestamp: new Date(Date.now() - 3600000), // 1 hour ago
        },
        {
          id: uuidv4(),
          role: 'assistant',
          content:
            "I'd be happy to help you with your TypeScript project. What specific issues are you facing with type definitions and module resolution? Are you getting any specific error messages?",
          timestamp: new Date(Date.now() - 3500000),
        },
        {
          id: uuidv4(),
          role: 'user',
          content:
            'Yes, I\'m getting "Cannot find module" errors even though the modules exist. I think it might be related to my tsconfig.json configuration.',
          timestamp: new Date(Date.now() - 3000000),
        },
        {
          id: uuidv4(),
          role: 'assistant',
          content:
            "That sounds like a module resolution issue. Can you share your tsconfig.json file? Also, what's your project structure like?",
          timestamp: new Date(Date.now() - 2500000),
        },
      ];

      const model = 'gpt-4o-mini'; // Default model for compression
      const contextUsage = contextService.calculateContextUsage(
        simulatedMessages,
        model
      );

      // Create compression options
      const compressionOptions: ContextCompressionOptions = {
        method,
        targetReduction: targetTokens
          ? Math.round(
              ((contextUsage.currentTokens - targetTokens) /
                contextUsage.currentTokens) *
                100
            )
          : 50,
        preserveRecent,
        preserveImportant,
      };

      // Use context management service for compression
      const compressionResult = await contextService.compressContext(
        simulatedMessages,
        compressionOptions,
        correlationId
      );

      // Create compression event
      const compressionEvent: CompressionEvent = {
        id: uuidv4(),
        timestamp: new Date(),
        originalTokens: compressionResult.originalTokens,
        compressedTokens: compressionResult.compressedTokens,
        compressionRatio: compressionResult.compressionRatio,
        method,
        correlationId,
      };

      // Store compression history
      const history = compressionHistory.get(conversationId) || [];
      history.push(compressionEvent);
      compressionHistory.set(conversationId, history);

      // Calculate updated context usage with compressed messages
      const compressedMessages: ContextMessage[] = [
        {
          id: uuidv4(),
          role: 'system',
          content: compressionResult.compressedContent,
          timestamp: new Date(),
        },
      ];

      const updatedContextUsage = contextService.calculateContextUsage(
        compressedMessages,
        model
      );

      logger.info('Context compressed successfully', correlationId, {
        conversationId,
        sessionId,
        method,
        originalTokens: compressionEvent.originalTokens,
        compressedTokens: compressionEvent.compressedTokens,
        compressionRatio: compressionEvent.compressionRatio,
      });

      res.json({
        success: true,
        compression: compressionEvent,
        contextUsage: updatedContextUsage,
        compressedContent: compressionResult.compressedContent,
        correlationId,
      });
    } catch (error) {
      logger.error('Context compression failed', correlationId, {
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
            type: 'context_compression_error',
            message: 'Failed to compress context',
            correlationId,
          },
        });
      }
    }
  },
];

/**
 * Create new conversation with compressed context
 * POST /api/conversations/:conversationId/create-compressed
 */
export const createCompressedConversationHandler = [
  // Input validation
  param('conversationId')
    .custom(isValidConversationId)
    .withMessage('Invalid conversation ID format'),
  body('title').optional().isString().isLength({ min: 1, max: 200 }),
  body('compressedContext').isString().isLength({ min: 1, max: 100000 }),
  body('originalConversationId')
    .custom(isValidConversationId)
    .withMessage('Invalid original conversation ID'),

  async (req: Request, res: Response): Promise<void> => {
    const correlationId = (req as RequestWithCorrelationId).correlationId;
    const sessionId = (req as any).sessionId as string;
    const conversationId = req.params.conversationId as string;

    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError(
          'Invalid compressed conversation request',
          correlationId,
          'request',
          errors.array()
        );
      }

      const {
        title,
        compressedContext,
        originalConversationId,
      }: CompressedConversationRequest = req.body;

      // Create new conversation with compressed context
      const newConversationId = uuidv4();
      const now = new Date();

      // Create compressed messages for context calculation
      const compressedMessages: ContextMessage[] = [
        {
          id: uuidv4(),
          role: 'system',
          content: compressedContext,
          timestamp: now,
        },
      ];

      const model = 'gpt-4o-mini'; // Default model
      const newContextUsage = contextService.calculateContextUsage(
        compressedMessages,
        model
      );

      // Copy compression history
      const originalHistory =
        compressionHistory.get(originalConversationId) || [];
      compressionHistory.set(newConversationId, [...originalHistory]);

      logger.info(
        'Compressed conversation created successfully',
        correlationId,
        {
          newConversationId,
          originalConversationId,
          sessionId,
          title: title || 'Compressed Conversation',
          compressedTokens: newContextUsage.currentTokens,
        }
      );

      res.status(201).json({
        conversationId: newConversationId,
        title: title || 'Compressed Conversation',
        contextUsage: newContextUsage,
        compressionSummary: {
          originalTokens: 5000, // Simulated original tokens
          compressedTokens: newContextUsage.currentTokens,
          compressionRatio: newContextUsage.currentTokens / 5000,
          spaceSaved: 5000 - newContextUsage.currentTokens,
        },
        correlationId,
      });
    } catch (error) {
      logger.error('Failed to create compressed conversation', correlationId, {
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
            type: 'compressed_conversation_error',
            message: 'Failed to create compressed conversation',
            correlationId,
          },
        });
      }
    }
  },
];

// This function is now handled by the context service

// Compression logic is now handled by the context management service

/**
 * Get context management statistics (for monitoring)
 */
export const getContextStatsHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const correlationId = (req as RequestWithCorrelationId).correlationId;

  try {
    // Simulate statistics for now (in real implementation, get from database)
    const totalConversations = compressionHistory.size;
    let totalCompressions = 0;

    for (const compressions of compressionHistory.values()) {
      totalCompressions += compressions.length;
    }

    // Get available models from model routing service
    const availableModels = modelRoutingService.getAvailableModels();

    res.json({
      totalConversations,
      highUsageConversations: Math.floor(totalConversations * 0.2), // Simulate 20% high usage
      extendedConversations: Math.floor(totalConversations * 0.1), // Simulate 10% extended
      totalCompressions,
      averageCompressionsPerConversation:
        totalConversations > 0 ? totalCompressions / totalConversations : 0,
      supportedModels: availableModels.map((m) => m.id),
      correlationId,
    });
  } catch (error) {
    logger.error('Failed to get context statistics', correlationId, {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      error: {
        type: 'stats_error',
        message: 'Failed to get context statistics',
        correlationId,
      },
    });
  }
};
