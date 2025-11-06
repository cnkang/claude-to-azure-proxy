/**
 * Conversation Context Service
 *
 * Handles conversation context building, token management, and persistence.
 * Provides intelligent context management for long conversations.
 *
 * Requirements: 3.2, 16.1, 16.2, 16.3, 16.4, 16.5
 */

import { v4 as uuidv4 } from 'uuid';
import type { RequestWithCorrelationId as _RequestWithCorrelationId } from '../types/index.js';
import {
  ValidationError,
  InternalServerError as _InternalServerError,
} from '../errors/index.js';
import { logger } from '../middleware/logging.js';
import {
  getContextManagementService,
  type ContextMessage,
  type ContextUsage,
  type ContextCompressionOptions as _ContextCompressionOptions,
} from './context-management-service.js';
import { getModelRoutingService } from './model-routing-service.js';

/**
 * Conversation metadata
 */
export interface ConversationMetadata {
  readonly id: string;
  readonly sessionId: string;
  readonly title: string;
  readonly model: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly messageCount: number;
  readonly totalTokens: number;
  readonly isExtended: boolean;
  readonly compressionHistory: readonly CompressionEvent[];
}

/**
 * Compression event record
 */
export interface CompressionEvent {
  readonly id: string;
  readonly timestamp: Date;
  readonly originalTokens: number;
  readonly compressedTokens: number;
  readonly compressionRatio: number;
  readonly method: 'ai-summary' | 'selective-removal' | 'hierarchical';
  readonly correlationId: string;
}

/**
 * Conversation context with metadata
 */
export interface ConversationContext {
  readonly metadata: ConversationMetadata;
  readonly messages: readonly ContextMessage[];
  readonly contextUsage: ContextUsage;
  readonly recommendations: {
    readonly action: 'none' | 'extend' | 'compress' | 'new_conversation';
    readonly reason: string;
    readonly urgency: 'low' | 'medium' | 'high';
  };
}

/**
 * Context building options
 */
export interface ContextBuildingOptions {
  readonly includeSystemMessages: boolean;
  readonly maxMessages?: number;
  readonly autoCompress: boolean;
  readonly compressionThreshold: number; // Percentage (e.g., 80)
  readonly preserveRecent: number;
}

/**
 * Conversation context service class
 */
export class ConversationContextService {
  private readonly contextService = getContextManagementService();
  private readonly modelRoutingService = getModelRoutingService();

  // In-memory storage for conversations (in production, this would be a database)
  private readonly conversations = new Map<string, ConversationContext>();
  private readonly sessionConversations = new Map<string, Set<string>>();

  /**
   * Creates a new conversation context
   */
  public async createConversation(
    sessionId: string,
    title: string,
    model: string,
    correlationId: string
  ): Promise<ConversationContext> {
    try {
      const conversationId = uuidv4();
      const now = new Date();

      // Validate model
      const availableModels = this.modelRoutingService.getAvailableModels();
      const modelExists = availableModels.some((m) => m.id === model);

      if (!modelExists) {
        throw new ValidationError(
          `Model "${model}" is not available`,
          correlationId,
          'model',
          model
        );
      }

      // Create conversation metadata
      const metadata: ConversationMetadata = {
        id: conversationId,
        sessionId,
        title,
        model,
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
        totalTokens: 0,
        isExtended: false,
        compressionHistory: [],
      };

      // Calculate initial context usage
      const contextUsage = this.contextService.calculateContextUsage([], model);
      const recommendations =
        this.contextService.getContextRecommendations(contextUsage);

      const context: ConversationContext = {
        metadata,
        messages: [],
        contextUsage,
        recommendations,
      };

      // Store conversation
      this.conversations.set(conversationId, context);

      // Add to session mapping
      if (!this.sessionConversations.has(sessionId)) {
        this.sessionConversations.set(sessionId, new Set());
      }
      this.sessionConversations.get(sessionId)!.add(conversationId);

      logger.info('Conversation created', correlationId, {
        conversationId,
        sessionId,
        title,
        model,
      });

      return context;
    } catch (error) {
      logger.error('Failed to create conversation', correlationId, {
        sessionId,
        title,
        model,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Gets conversation context by ID
   */
  public getConversation(
    conversationId: string,
    sessionId: string,
    correlationId: string
  ): ConversationContext | null {
    try {
      const context = this.conversations.get(conversationId);

      if (!context) {
        return null;
      }

      // Validate session access
      if (context.metadata.sessionId !== sessionId) {
        logger.warn('Unauthorized conversation access attempt', correlationId, {
          conversationId,
          requestedSessionId: sessionId,
          actualSessionId: context.metadata.sessionId,
        });
        return null;
      }

      return context;
    } catch (error) {
      logger.error('Failed to get conversation', correlationId, {
        conversationId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Adds a message to conversation context
   */
  public async addMessage(
    conversationId: string,
    sessionId: string,
    message: ContextMessage,
    options: ContextBuildingOptions,
    correlationId: string
  ): Promise<ConversationContext> {
    try {
      const context = this.getConversation(
        conversationId,
        sessionId,
        correlationId
      );

      if (!context) {
        throw new ValidationError(
          'Conversation not found or access denied',
          correlationId,
          'conversationId',
          conversationId
        );
      }

      // Add message to context
      const updatedMessages = [...context.messages, message];

      // Apply context building options
      let finalMessages = updatedMessages;

      if (options.maxMessages && finalMessages.length > options.maxMessages) {
        finalMessages = finalMessages.slice(-options.maxMessages);
      }

      // Calculate updated context usage
      const contextUsage = this.contextService.calculateContextUsage(
        finalMessages,
        context.metadata.model,
        context.metadata.isExtended
      );

      // Check if auto-compression is needed
      if (
        options.autoCompress &&
        contextUsage.utilizationPercentage >= options.compressionThreshold
      ) {
        logger.info('Auto-compression triggered', correlationId, {
          conversationId,
          utilizationPercentage: contextUsage.utilizationPercentage,
          threshold: options.compressionThreshold,
        });

        const compressionResult = await this.contextService.compressContext(
          finalMessages.slice(0, -options.preserveRecent),
          {
            method: 'ai-summary',
            targetReduction: 50,
            preserveRecent: options.preserveRecent,
            preserveImportant: true,
          },
          correlationId
        );

        // Create compressed message
        const compressedMessage: ContextMessage = {
          id: uuidv4(),
          role: 'system',
          content: compressionResult.compressedContent,
          timestamp: new Date(),
        };

        // Replace compressed messages with summary
        finalMessages = [
          compressedMessage,
          ...finalMessages.slice(-options.preserveRecent),
        ];

        // Record compression event
        const compressionEvent: CompressionEvent = {
          id: uuidv4(),
          timestamp: new Date(),
          originalTokens: compressionResult.originalTokens,
          compressedTokens: compressionResult.compressedTokens,
          compressionRatio: compressionResult.compressionRatio,
          method: 'ai-summary',
          correlationId,
        };

        // Update metadata with compression history
        const updatedMetadata: ConversationMetadata = {
          ...context.metadata,
          updatedAt: new Date(),
          messageCount: finalMessages.length,
          totalTokens: contextUsage.currentTokens,
          compressionHistory: [
            ...context.metadata.compressionHistory,
            compressionEvent,
          ],
        };

        // Recalculate context usage after compression
        const finalContextUsage = this.contextService.calculateContextUsage(
          finalMessages,
          context.metadata.model,
          context.metadata.isExtended
        );

        const updatedContext: ConversationContext = {
          metadata: updatedMetadata,
          messages: finalMessages,
          contextUsage: finalContextUsage,
          recommendations:
            this.contextService.getContextRecommendations(finalContextUsage),
        };

        this.conversations.set(conversationId, updatedContext);
        return updatedContext;
      }

      // Update metadata
      const updatedMetadata: ConversationMetadata = {
        ...context.metadata,
        updatedAt: new Date(),
        messageCount: finalMessages.length,
        totalTokens: contextUsage.currentTokens,
      };

      const updatedContext: ConversationContext = {
        metadata: updatedMetadata,
        messages: finalMessages,
        contextUsage,
        recommendations:
          this.contextService.getContextRecommendations(contextUsage),
      };

      this.conversations.set(conversationId, updatedContext);

      logger.info('Message added to conversation', correlationId, {
        conversationId,
        messageRole: message.role,
        messageLength: message.content.length,
        totalMessages: finalMessages.length,
        contextUtilization: contextUsage.utilizationPercentage,
      });

      return updatedContext;
    } catch (error) {
      logger.error('Failed to add message to conversation', correlationId, {
        conversationId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Extends conversation context for supported models
   */
  public async extendConversationContext(
    conversationId: string,
    sessionId: string,
    targetModel: string,
    correlationId: string
  ): Promise<ConversationContext> {
    try {
      const context = this.getConversation(
        conversationId,
        sessionId,
        correlationId
      );

      if (!context) {
        throw new ValidationError(
          'Conversation not found or access denied',
          correlationId,
          'conversationId',
          conversationId
        );
      }

      // Note: Model support check is now done in the route handler
      // This allows for extending context with different target models

      // Extend context using the target model
      const extensionResult = await this.contextService.extendContext(
        targetModel,
        correlationId
      );

      if (!extensionResult.success) {
        throw new _InternalServerError(
          extensionResult.message,
          correlationId,
          'ConversationContextService.extendConversationContext'
        );
      }

      // Update metadata
      const updatedMetadata: ConversationMetadata = {
        ...context.metadata,
        updatedAt: new Date(),
        isExtended: true,
      };

      // Recalculate context usage with extended limits
      const extendedContextUsage = this.contextService.calculateContextUsage(
        context.messages,
        context.metadata.model,
        true
      );

      const updatedContext: ConversationContext = {
        metadata: updatedMetadata,
        messages: context.messages,
        contextUsage: extendedContextUsage,
        recommendations:
          this.contextService.getContextRecommendations(extendedContextUsage),
      };

      this.conversations.set(conversationId, updatedContext);

      logger.info('Conversation context extended', correlationId, {
        conversationId,
        originalModel: context.metadata.model,
        targetModel,
        originalMaxTokens: extensionResult.previousMaxTokens,
        extendedMaxTokens: extensionResult.newMaxTokens,
      });

      return updatedContext;
    } catch (error) {
      logger.error('Failed to extend conversation context', correlationId, {
        conversationId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Gets conversations for a session
   */
  public getSessionConversations(
    sessionId: string
  ): readonly ConversationContext[] {
    const conversationIds =
      this.sessionConversations.get(sessionId) || new Set();
    const conversations: ConversationContext[] = [];

    for (const conversationId of conversationIds) {
      const context = this.conversations.get(conversationId);
      if (context) {
        conversations.push(context);
      }
    }

    return conversations.sort(
      (a, b) => b.metadata.updatedAt.getTime() - a.metadata.updatedAt.getTime()
    );
  }

  /**
   * Deletes a conversation
   */
  public deleteConversation(
    conversationId: string,
    sessionId: string,
    correlationId: string
  ): boolean {
    try {
      const context = this.getConversation(
        conversationId,
        sessionId,
        correlationId
      );

      if (!context) {
        return false;
      }

      // Remove from storage
      this.conversations.delete(conversationId);

      // Remove from session mapping
      const sessionConvs = this.sessionConversations.get(sessionId);
      if (sessionConvs) {
        sessionConvs.delete(conversationId);
        if (sessionConvs.size === 0) {
          this.sessionConversations.delete(sessionId);
        }
      }

      logger.info('Conversation deleted', correlationId, {
        conversationId,
        sessionId,
      });

      return true;
    } catch (error) {
      logger.error('Failed to delete conversation', correlationId, {
        conversationId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Gets conversation statistics
   */
  public getConversationStats(): {
    totalConversations: number;
    totalSessions: number;
    averageMessagesPerConversation: number;
    averageTokensPerConversation: number;
    conversationsWithCompression: number;
    conversationsWithExtension: number;
  } {
    const conversations = Array.from(this.conversations.values());

    const totalConversations = conversations.length;
    const totalSessions = this.sessionConversations.size;

    const totalMessages = conversations.reduce(
      (sum, conv) => sum + conv.metadata.messageCount,
      0
    );
    const totalTokens = conversations.reduce(
      (sum, conv) => sum + conv.metadata.totalTokens,
      0
    );

    const conversationsWithCompression = conversations.filter(
      (conv) => conv.metadata.compressionHistory.length > 0
    ).length;

    const conversationsWithExtension = conversations.filter(
      (conv) => conv.metadata.isExtended
    ).length;

    return {
      totalConversations,
      totalSessions,
      averageMessagesPerConversation:
        totalConversations > 0 ? totalMessages / totalConversations : 0,
      averageTokensPerConversation:
        totalConversations > 0 ? totalTokens / totalConversations : 0,
      conversationsWithCompression,
      conversationsWithExtension,
    };
  }
}

/**
 * Global conversation context service instance
 */
let conversationContextService: ConversationContextService | null = null;

/**
 * Gets the global conversation context service instance
 */
export function getConversationContextService(): ConversationContextService {
  if (!conversationContextService) {
    conversationContextService = new ConversationContextService();
  }
  return conversationContextService;
}

/**
 * Creates a new conversation context service instance
 */
export function createConversationContextService(): ConversationContextService {
  return new ConversationContextService();
}
