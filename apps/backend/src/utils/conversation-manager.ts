/**
 * @fileoverview Conversation management and context tracking for multi-turn sessions.
 *
 * This module provides comprehensive conversation management capabilities including
 * conversation ID extraction, previous response ID tracking, memory management,
 * and context analysis for reasoning effort adjustment. It implements efficient
 * storage with automatic cleanup and provides thread-safe operations.
 *
 * @author Claude-to-Azure Proxy Team
 * @version 2.0.0
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { createConversationManager } from './conversation-manager';
 *
 * const manager = createConversationManager({
 *   maxConversationAge: 3600000, // 1 hour
 *   cleanupInterval: 300000,     // 5 minutes
 *   maxStoredConversations: 1000
 * });
 *
 * // Track a conversation
 * manager.trackConversation('conv-123', 'resp-456');
 *
 * // Get previous response ID for continuity
 * const previousId = manager.getPreviousResponseId('conv-123');
 * ```
 */

import type {
  ConversationContext,
  ConversationMetrics,
  ConversationConfig,
  ClaudeRequest,
  ClaudeContentBlock,
} from '../types/index';
import { logger } from '../middleware/logging';

type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends ReadonlyArray<infer U>
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
      : T;

/**
 * Interface for conversation management operations.
 *
 * Provides methods for tracking conversations, managing context,
 * and analyzing conversation patterns for reasoning adjustment.
 *
 * @public
 * @interface ConversationManager
 */
export interface ConversationManager {
  /**
   * Track a conversation with its response ID for continuity.
   *
   * @param conversationId - Unique conversation identifier
   * @param responseId - Response ID from Azure OpenAI Responses API
   * @param metrics - Optional metrics to update for this conversation
   */
  trackConversation(
    conversationId: string,
    responseId: string,
    metrics?: Partial<ConversationMetrics>
  ): void;

  /**
   * Get the previous response ID for conversation continuity.
   *
   * @param conversationId - Conversation identifier
   * @returns Previous response ID or undefined if not found
   */
  getPreviousResponseId(conversationId: string): string | undefined;

  /**
   * Clean up old conversations based on age and storage limits.
   *
   * @returns Number of conversations cleaned up
   */
  cleanupOldConversations(): number;

  /**
   * Get comprehensive metrics for a conversation.
   *
   * @param conversationId - Conversation identifier
   * @returns Conversation metrics or undefined if not found
   */
  getConversationMetrics(
    conversationId: string
  ): ConversationMetrics | undefined;

  /**
   * Get conversation context for reasoning adjustment.
   *
   * @param conversationId - Conversation identifier
   * @returns Conversation context or undefined if not found
   */
  getConversationContext(
    conversationId: string
  ): ConversationContext | undefined;

  /**
   * Update conversation metrics with new data.
   *
   * @param conversationId - Conversation identifier
   * @param metrics - Partial metrics to update
   */
  updateConversationMetrics(
    conversationId: string,
    metrics: Partial<ConversationMetrics>
  ): void;

  /**
   * Analyze conversation context for reasoning effort adjustment.
   *
   * @param conversationId - Conversation identifier
   * @param request - Current request for analysis
   * @returns Recommended task complexity based on conversation context
   */
  analyzeConversationContext(
    conversationId: string,
    request: DeepReadonly<ClaudeRequest>
  ): 'simple' | 'medium' | 'complex';

  /**
   * Extract conversation ID from request headers or generate new one.
   *
   * @param headers - Request headers
   * @param correlationId - Request correlation ID for fallback
   * @returns Conversation ID
   */
  extractConversationId(
    headers: DeepReadonly<Record<string, string>>,
    correlationId: string
  ): string;

  /**
   * Get current storage statistics.
   *
   * @returns Storage statistics including count and memory usage
   */
  getStorageStats(): {
    readonly conversationCount: number;
    readonly oldestConversation: string | undefined;
    readonly newestConversation: string | undefined;
    readonly estimatedMemoryUsage: number;
  };

  /**
   * Start automatic cleanup timer.
   */
  startCleanupTimer(): void;

  /**
   * Stop automatic cleanup timer.
   */
  stopCleanupTimer(): void;
}

/**
 * Internal conversation data structure.
 *
 * @private
 * @interface ConversationData
 */
interface ConversationData {
  readonly conversationId: string;
  readonly createdAt: number;
  readonly lastUpdatedAt: number;
  readonly previousResponseId?: string;
  readonly metrics: ConversationMetrics;
  readonly context: ConversationContext;
}

/**
 * Default conversation configuration.
 *
 * @private
 */
const DEFAULT_CONVERSATION_CONFIG: ConversationConfig = {
  maxConversationAge: 3600000, // 1 hour
  cleanupInterval: 300000, // 5 minutes
  maxStoredConversations: 1000,
} as const;

/**
 * In-memory conversation manager implementation.
 *
 * Provides efficient conversation tracking with automatic cleanup
 * and memory management. Uses Map for O(1) lookups and implements
 * circular buffer behavior for memory efficiency.
 *
 * @public
 * @class ConversationManagerImpl
 * @implements {ConversationManager}
 */
export class ConversationManagerImpl implements ConversationManager {
  private readonly conversations = new Map<string, ConversationData>();
  private readonly config: ConversationConfig;
  private cleanupTimer: NodeJS.Timeout | undefined;

  /**
   * Creates a new conversation manager instance.
   *
   * @param config - Configuration for conversation management
   */
  constructor(config: DeepReadonly<Partial<ConversationConfig>> = {}) {
    this.config = { ...DEFAULT_CONVERSATION_CONFIG, ...config };
  }

  /**
   * Track a conversation with its response ID for continuity.
   */
  public trackConversation(
    conversationId: string,
    responseId: string,
    metrics?: Partial<ConversationMetrics>
  ): void {
    try {
      const now = Date.now();
      const existingData = this.conversations.get(conversationId);

      if (existingData) {
        // Update existing conversation
        const safeMetrics = metrics ?? {};
        const updatedMetrics: ConversationMetrics = {
          messageCount: existingData.metrics.messageCount + 1,
          totalTokensUsed:
            existingData.metrics.totalTokensUsed +
            (safeMetrics.totalTokensUsed ?? 0),
          reasoningTokensUsed:
            existingData.metrics.reasoningTokensUsed +
            (safeMetrics.reasoningTokensUsed ?? 0),
          averageResponseTime: this.calculateAverageResponseTime(
            existingData.metrics.averageResponseTime,
            existingData.metrics.messageCount,
            safeMetrics.averageResponseTime ?? 0
          ),
          errorCount:
            existingData.metrics.errorCount + (safeMetrics.errorCount ?? 0),
        };

        const updatedContext: ConversationContext = {
          ...existingData.context,
          messageCount: updatedMetrics.messageCount,
          totalTokensUsed: updatedMetrics.totalTokensUsed,
          averageResponseTime: updatedMetrics.averageResponseTime,
          previousResponseId: responseId,
        };

        const updatedData: ConversationData = {
          ...existingData,
          lastUpdatedAt: now,
          previousResponseId: responseId,
          metrics: updatedMetrics,
          context: updatedContext,
        };

        this.conversations.set(conversationId, updatedData);
      } else {
        // Create new conversation
        const safeMetrics = metrics ?? {};
        const initialMetrics: ConversationMetrics = {
          messageCount: 1,
          totalTokensUsed: safeMetrics.totalTokensUsed ?? 0,
          reasoningTokensUsed: safeMetrics.reasoningTokensUsed ?? 0,
          averageResponseTime: safeMetrics.averageResponseTime ?? 0,
          errorCount: safeMetrics.errorCount ?? 0,
        };

        const initialContext: ConversationContext = {
          conversationId,
          messageCount: 1,
          previousResponseId: responseId,
          taskComplexity: 'simple', // Will be updated based on analysis
          totalTokensUsed: initialMetrics.totalTokensUsed,
          averageResponseTime: initialMetrics.averageResponseTime,
        };

        const newData: ConversationData = {
          conversationId,
          createdAt: now,
          lastUpdatedAt: now,
          previousResponseId: responseId,
          metrics: initialMetrics,
          context: initialContext,
        };

        this.conversations.set(conversationId, newData);
      }

      // Enforce storage limits
      this.enforceStorageLimits();

      logger.debug('Conversation tracked successfully', conversationId, {
        responseId,
        messageCount:
          this.conversations.get(conversationId)?.metrics.messageCount,
        totalConversations: this.conversations.size,
      });
    } catch (error) {
      logger.error('Failed to track conversation', conversationId, {
        responseId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get the previous response ID for conversation continuity.
   */
  public getPreviousResponseId(conversationId: string): string | undefined {
    const data = this.conversations.get(conversationId);
    return data?.previousResponseId;
  }

  /**
   * Clean up old conversations based on age and storage limits.
   */
  public cleanupOldConversations(): number {
    const now = Date.now();
    const maxAge = this.config.maxConversationAge;
    let cleanedCount = 0;

    try {
      for (const [conversationId, data] of this.conversations.entries()) {
        const age = now - data.lastUpdatedAt;
        if (age > maxAge) {
          this.conversations.delete(conversationId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.info('Cleaned up old conversations', 'conversation-cleanup', {
          cleanedCount,
          remainingCount: this.conversations.size,
          maxAge,
        });
      }

      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup conversations', 'conversation-cleanup', {
        error: error instanceof Error ? error.message : String(error),
      });
      return cleanedCount;
    }
  }

  /**
   * Get comprehensive metrics for a conversation.
   */
  public getConversationMetrics(
    conversationId: string
  ): ConversationMetrics | undefined {
    const data = this.conversations.get(conversationId);
    return data?.metrics;
  }

  /**
   * Get conversation context for reasoning adjustment.
   */
  public getConversationContext(
    conversationId: string
  ): ConversationContext | undefined {
    const data = this.conversations.get(conversationId);
    return data?.context;
  }

  /**
   * Update conversation metrics with new data.
   */
  public updateConversationMetrics(
    conversationId: string,
    metrics: Partial<ConversationMetrics>
  ): void {
    const data = this.conversations.get(conversationId);
    if (!data) {
      logger.warn(
        'Attempted to update metrics for non-existent conversation',
        conversationId
      );
      return;
    }

    try {
      const updatedMetrics: ConversationMetrics = {
        messageCount: metrics.messageCount ?? data.metrics.messageCount,
        totalTokensUsed:
          metrics.totalTokensUsed ?? data.metrics.totalTokensUsed,
        reasoningTokensUsed:
          metrics.reasoningTokensUsed ?? data.metrics.reasoningTokensUsed,
        averageResponseTime:
          metrics.averageResponseTime ?? data.metrics.averageResponseTime,
        errorCount: metrics.errorCount ?? data.metrics.errorCount,
      };

      const updatedContext: ConversationContext = {
        ...data.context,
        messageCount: updatedMetrics.messageCount,
        totalTokensUsed: updatedMetrics.totalTokensUsed,
        averageResponseTime: updatedMetrics.averageResponseTime,
      };

      const updatedData: ConversationData = {
        ...data,
        lastUpdatedAt: Date.now(),
        metrics: updatedMetrics,
        context: updatedContext,
      };

      this.conversations.set(conversationId, updatedData);

      logger.debug('Conversation metrics updated', conversationId, {
        updatedFields: Object.keys(metrics),
      });
    } catch (error) {
      logger.error('Failed to update conversation metrics', conversationId, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Analyze conversation context for reasoning effort adjustment.
   */
  public analyzeConversationContext(
    conversationId: string,
    request: DeepReadonly<ClaudeRequest>
  ): 'simple' | 'medium' | 'complex' {
    const data = this.conversations.get(conversationId);

    if (!data) {
      // New conversation, analyze based on request content
      return this.analyzeRequestComplexity(request);
    }

    try {
      const { metrics, context } = data;

      // Factors that increase complexity:
      // 1. High message count (deep conversation)
      // 2. High token usage (complex topics)
      // 3. Previous errors (debugging session)
      // 4. Long average response time (complex processing)

      let complexityScore = 0;

      // Message count factor (0-3 points)
      if (metrics.messageCount > 10) {
        complexityScore += 3;
      } else if (metrics.messageCount > 5) {
        complexityScore += 2;
      } else if (metrics.messageCount > 2) {
        complexityScore += 1;
      }

      // Token usage factor (0-2 points)
      const avgTokensPerMessage =
        metrics.totalTokensUsed / metrics.messageCount;
      if (avgTokensPerMessage > 2000) {
        complexityScore += 2;
      } else if (avgTokensPerMessage > 1000) {
        complexityScore += 1;
      }

      // Error rate factor (0-2 points)
      const errorRate = metrics.errorCount / metrics.messageCount;
      if (errorRate > 0.2) {
        complexityScore += 2;
      } else if (errorRate > 0.1) {
        complexityScore += 1;
      }

      // Response time factor (0-1 point)
      if (metrics.averageResponseTime > 10000) {
        // > 10 seconds
        complexityScore += 1;
      }

      // Reasoning token usage factor (0-2 points)
      if (metrics.reasoningTokensUsed > 0) {
        const reasoningRatio =
          metrics.reasoningTokensUsed / metrics.totalTokensUsed;
        if (reasoningRatio > 0.3) {
          complexityScore += 2;
        } else if (reasoningRatio > 0.1) {
          complexityScore += 1;
        }
      }

      // Current request complexity
      const requestComplexity = this.analyzeRequestComplexity(request);
      if (requestComplexity === 'complex') {
        complexityScore += 2;
      } else if (requestComplexity === 'medium') {
        complexityScore += 1;
      }

      // Determine final complexity
      let finalComplexity: 'simple' | 'medium' | 'complex';
      if (complexityScore >= 8) {
        finalComplexity = 'complex';
      } else if (complexityScore >= 4) {
        finalComplexity = 'medium';
      } else {
        finalComplexity = 'simple';
      }

      // Update context with new complexity
      const updatedContext: ConversationContext = {
        ...context,
        taskComplexity: finalComplexity,
      };

      const updatedData: ConversationData = {
        ...data,
        context: updatedContext,
      };

      this.conversations.set(conversationId, updatedData);

      logger.debug('Conversation complexity analyzed', conversationId, {
        complexityScore,
        finalComplexity,
        messageCount: metrics.messageCount,
        avgTokensPerMessage,
        errorRate,
      });

      return finalComplexity;
    } catch (error) {
      logger.error('Failed to analyze conversation context', conversationId, {
        error: error instanceof Error ? error.message : String(error),
      });
      // Fallback to request-based analysis
      return this.analyzeRequestComplexity(request);
    }
  }

  /**
   * Extract conversation ID from request headers or generate new one.
   */
  public extractConversationId(
    headers: DeepReadonly<Record<string, string>>,
    correlationId: string
  ): string {
    // Try to extract from various header formats
    const conversationId =
      headers['x-conversation-id'] ??
      headers['conversation-id'] ??
      headers['x-session-id'] ??
      headers['session-id'] ??
      headers['x-thread-id'] ??
      headers['thread-id'];

    if (
      conversationId !== undefined &&
      typeof conversationId === 'string' &&
      conversationId.trim().length > 0
    ) {
      return conversationId.trim();
    }

    // Generate conversation ID from correlation ID
    return `conv-${correlationId}`;
  }

  /**
   * Get current storage statistics.
   */
  public getStorageStats(): {
    readonly conversationCount: number;
    readonly oldestConversation: string | undefined;
    readonly newestConversation: string | undefined;
    readonly estimatedMemoryUsage: number;
  } {
    const conversations = Array.from(this.conversations.values());

    if (conversations.length === 0) {
      return {
        conversationCount: 0,
        oldestConversation: undefined,
        newestConversation: undefined,
        estimatedMemoryUsage: 0,
      };
    }

    const sortedByAge = conversations.sort((a, b) => a.createdAt - b.createdAt);
    const oldest = sortedByAge[0];
    const newest = sortedByAge[sortedByAge.length - 1];

    // Rough memory estimation (in bytes)
    const estimatedMemoryUsage = conversations.length * 1024; // ~1KB per conversation

    return {
      conversationCount: conversations.length,
      oldestConversation: oldest?.conversationId ?? 'unknown',
      newestConversation: newest?.conversationId ?? 'unknown',
      estimatedMemoryUsage,
    };
  }

  /**
   * Start automatic cleanup timer.
   */
  public startCleanupTimer(): void {
    if (this.cleanupTimer) {
      return; // Already started
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupOldConversations();
    }, this.config.cleanupInterval);

    logger.info('Conversation cleanup timer started', 'conversation-manager', {
      cleanupInterval: this.config.cleanupInterval,
    });
  }

  /**
   * Stop automatic cleanup timer.
   */
  public stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
      logger.info('Conversation cleanup timer stopped', 'conversation-manager');
    }
  }

  /**
   * Calculate running average response time.
   *
   * @private
   */
  private calculateAverageResponseTime(
    currentAverage: number,
    messageCount: number,
    newResponseTime: number
  ): number {
    if (messageCount === 0) {
      return newResponseTime;
    }
    return (
      (currentAverage * messageCount + newResponseTime) / (messageCount + 1)
    );
  }

  /**
   * Analyze request complexity based on content.
   *
   * @private
   */
  private analyzeRequestComplexity(
    request: DeepReadonly<ClaudeRequest>
  ): 'simple' | 'medium' | 'complex' {
    try {
      const messages = request.messages;
      const totalContent = messages
        .map((msg) =>
          typeof msg.content === 'string'
            ? msg.content
            : Array.isArray(msg.content)
              ? msg.content
                  .filter(
                    (block: DeepReadonly<ClaudeContentBlock>) =>
                      block.type === 'text'
                  )
                  .map(
                    (block: DeepReadonly<ClaudeContentBlock>) =>
                      block.text ?? ''
                  )
                  .join(' ')
              : ''
        )
        .join(' ');

      const contentLength = totalContent.length;
      const hasCodeBlocks = /```/.test(totalContent);
      const hasComplexKeywords =
        /\b(algorithm|architecture|design pattern|refactor|optimize|debug|troubleshoot)\b/i.test(
          totalContent
        );
      const hasMultipleQuestions = (totalContent.match(/\?/g) ?? []).length > 2;

      if (
        contentLength > 2000 ||
        (hasCodeBlocks && hasComplexKeywords) ||
        hasMultipleQuestions
      ) {
        return 'complex';
      } else if (contentLength > 500 || hasCodeBlocks || hasComplexKeywords) {
        return 'medium';
      } else {
        return 'simple';
      }
    } catch (error) {
      logger.warn(
        'Failed to analyze request complexity',
        'conversation-manager',
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
      return 'simple'; // Safe fallback
    }
  }

  /**
   * Enforce storage limits by removing oldest conversations.
   *
   * @private
   */
  private enforceStorageLimits(): void {
    const maxConversations = this.config.maxStoredConversations;

    if (this.conversations.size <= maxConversations) {
      return;
    }

    const conversations = Array.from(this.conversations.entries());
    const sortedByAge = conversations.sort(
      ([, a], [, b]) => a.lastUpdatedAt - b.lastUpdatedAt
    );

    const toRemove = sortedByAge.slice(
      0,
      this.conversations.size - maxConversations
    );

    for (const [conversationId] of toRemove) {
      this.conversations.delete(conversationId);
    }

    logger.info('Enforced storage limits', 'conversation-manager', {
      removedCount: toRemove.length,
      remainingCount: this.conversations.size,
      maxConversations,
    });
  }
}

/**
 * Create a new conversation manager instance with the provided configuration.
 *
 * @param config - Optional configuration for conversation management
 * @returns Configured conversation manager instance
 *
 * @public
 * @example
 * ```typescript
 * const manager = createConversationManager({
 *   maxConversationAge: 7200000, // 2 hours
 *   cleanupInterval: 600000,     // 10 minutes
 *   maxStoredConversations: 500
 * });
 * ```
 */
export function createConversationManager(
  config: Partial<ConversationConfig> = {}
): ConversationManager {
  return new ConversationManagerImpl(config);
}

/**
 * Default conversation manager instance for application use.
 *
 * @public
 */
export const conversationManager = createConversationManager();
