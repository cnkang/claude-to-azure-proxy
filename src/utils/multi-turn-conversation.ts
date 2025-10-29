/**
 * @fileoverview Multi-turn conversation support with history management and continuity.
 *
 * This module provides comprehensive multi-turn conversation capabilities including
 * conversation continuity using previous_response_id, conversation history management
 * with configurable limits, context-aware response tracking, and conversation cleanup
 * policies. It integrates with the conversation manager for seamless operation.
 *
 * @author Claude-to-Azure Proxy Team
 * @version 1.0.0
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { createMultiTurnConversationHandler } from './multi-turn-conversation.js';
 *
 * const handler = createMultiTurnConversationHandler({
 *   maxHistoryLength: 50,
 *   maxHistoryAge: 3600000, // 1 hour
 *   enableContextTracking: true
 * });
 *
 * // Process a request with conversation continuity
 * const result = await handler.processRequest(request, conversationId);
 * ```
 */

import type {
  ClaudeRequest,
  ClaudeContentBlock,
  ResponsesCreateParams,
  ResponsesResponse,
  ConversationContext,
  ConversationMetrics,
} from '../types/index.js';
import { isRecord } from '../types/index.js';
import type { ConversationManager } from './conversation-manager.js';
import { createConversationManager } from './conversation-manager.js';
import { logger } from '../middleware/logging.js';
import { ValidationError } from '../errors/index.js';

/**
 * Configuration for multi-turn conversation handling.
 *
 * @public
 * @interface MultiTurnConversationConfig
 */
export interface MultiTurnConversationConfig {
  /** Maximum number of messages to keep in conversation history */
  readonly maxHistoryLength: number;

  /** Maximum age of conversation history in milliseconds */
  readonly maxHistoryAge: number;

  /** Whether to enable context-aware response tracking */
  readonly enableContextTracking: boolean;

  /** Whether to enable automatic conversation cleanup */
  readonly enableAutoCleanup: boolean;

  /** Interval for automatic cleanup in milliseconds */
  readonly cleanupInterval: number;

  /** Maximum number of concurrent conversations to track */
  readonly maxConcurrentConversations: number;

  /** Whether to preserve conversation state across restarts */
  readonly enablePersistence: boolean;
}

/**
 * Conversation history entry representing a single turn.
 *
 * @public
 * @interface ConversationHistoryEntry
 */
export interface ConversationHistoryEntry {
  readonly messageId: string;
  readonly timestamp: number;
  readonly request: ClaudeRequest;
  readonly response: ResponsesResponse;
  readonly responseTime: number;
  readonly tokenUsage: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
    readonly reasoningTokens?: number;
  };
  readonly contextComplexity: 'simple' | 'medium' | 'complex';
  readonly role?: ClaudeRequest['messages'][number]['role'];
  readonly content?: string;
  readonly tokenCount?: number;
}

/**
 * Complete conversation state including history and metadata.
 *
 * @public
 * @interface ConversationState
 */
export interface ConversationState {
  readonly conversationId: string;
  readonly createdAt: number;
  readonly lastUpdatedAt: number;
  readonly history: readonly ConversationHistoryEntry[];
  readonly context: ConversationContext;
  readonly metrics: ConversationMetrics;
  readonly isActive: boolean;
}

/**
 * Result of processing a multi-turn conversation request.
 *
 * @public
 * @interface MultiTurnProcessingResult
 */
export interface MultiTurnProcessingResult {
  readonly conversationId: string;
  readonly previousResponseId?: string;
  readonly enhancedRequest: ResponsesCreateParams;
  readonly contextComplexity: 'simple' | 'medium' | 'complex';
  readonly historyLength: number;
  readonly shouldUsePreviousResponse: boolean;
}

/**
 * Interface for multi-turn conversation handling operations.
 *
 * @public
 * @interface MultiTurnConversationHandler
 */
export interface MultiTurnConversationHandler {
  /**
   * Process a request with multi-turn conversation support.
   *
   * @param request - Claude request to process
   * @param conversationId - Conversation identifier
   * @param correlationId - Request correlation ID
   * @returns Enhanced request with conversation continuity
   */
  processRequest<TRequest extends ClaudeRequest>(
    request: Readonly<TRequest>,
    conversationId: string,
    correlationId: string
  ): Promise<MultiTurnProcessingResult>;

  /**
   * Record a conversation turn after receiving response.
   *
   * @param conversationId - Conversation identifier
   * @param request - Original request
   * @param response - Response from Azure OpenAI
   * @param responseTime - Response time in milliseconds
   * @param correlationId - Request correlation ID
   */
  recordConversationTurn<
    TRequest extends ClaudeRequest,
    TResponse extends ResponsesResponse,
  >(
    conversationId: string,
    request: Readonly<TRequest>,
    response: Readonly<TResponse>,
    responseTime: number,
    correlationId: string
  ): Promise<void>;

  /**
   * Get conversation history for a given conversation.
   *
   * @param conversationId - Conversation identifier
   * @param limit - Maximum number of entries to return
   * @returns Conversation history entries
   */
  getConversationHistory(
    conversationId: string,
    limit?: number
  ): readonly ConversationHistoryEntry[];

  /**
   * Get complete conversation state.
   *
   * @param conversationId - Conversation identifier
   * @returns Complete conversation state or undefined if not found
   */
  getConversationState(conversationId: string): ConversationState | undefined;

  /**
   * Clean up old conversation history based on age and limits.
   *
   * @param conversationId - Optional specific conversation to clean
   * @returns Number of entries cleaned up
   */
  cleanupConversationHistory(conversationId?: string): Promise<number>;

  /**
   * Archive a conversation to make it inactive.
   *
   * @param conversationId - Conversation identifier
   * @returns Whether the conversation was successfully archived
   */
  archiveConversation(conversationId: string): boolean;

  /**
   * Get statistics about conversation management.
   *
   * @returns Statistics about active conversations and memory usage
   */
  getConversationStats(): {
    readonly activeConversations: number;
    readonly totalHistoryEntries: number;
    readonly averageHistoryLength: number;
    readonly oldestConversation: string | undefined;
    readonly estimatedMemoryUsage: number;
  };

  /**
   * Start automatic cleanup and maintenance tasks.
   */
  startMaintenanceTasks(): void;

  /**
   * Stop automatic cleanup and maintenance tasks.
   */
  stopMaintenanceTasks(): void;

  /**
   * Add a transcript entry to the conversation history.
   *
   * @param conversationId - Conversation identifier
   * @param entry - Transcript entry to append
   * @param correlationId - Optional correlation identifier for logging
   */
  addToConversationHistory<TEntry extends ConversationTranscriptEntry>(
    conversationId: string,
    entry: Readonly<TEntry>,
    correlationId?: string
  ): void;
}

export interface ConversationTranscriptEntry {
  readonly role: ClaudeRequest['messages'][number]['role'];
  readonly content: string;
  readonly timestamp: Date | number;
  readonly tokenCount?: number;
}

/**
 * Default configuration for multi-turn conversation handling.
 *
 * @private
 */
const DEFAULT_MULTI_TURN_CONFIG: MultiTurnConversationConfig = {
  maxHistoryLength: 50,
  maxHistoryAge: 3600000, // 1 hour
  enableContextTracking: true,
  enableAutoCleanup: true,
  cleanupInterval: 300000, // 5 minutes
  maxConcurrentConversations: 1000,
  enablePersistence: false, // In-memory only for now
} as const;

const MANUAL_HISTORY_MODEL = 'manual-history-entry' as const;

/**
 * Multi-turn conversation handler implementation.
 *
 * Provides comprehensive multi-turn conversation support with history management,
 * context tracking, and automatic cleanup. Integrates with the conversation manager
 * for seamless operation and maintains conversation continuity using previous_response_id.
 *
 * @public
 * @class MultiTurnConversationHandlerImpl
 * @implements {MultiTurnConversationHandler}
 */
export class MultiTurnConversationHandlerImpl
  implements MultiTurnConversationHandler
{
  private readonly conversationStates = new Map<string, ConversationState>();
  private readonly config: MultiTurnConversationConfig;
  private readonly conversationManager: ConversationManager;
  private maintenanceTimer: NodeJS.Timeout | undefined;

  /**
   * Creates a new multi-turn conversation handler.
   *
   * @param config - Configuration for multi-turn conversation handling
   * @param conversationManager - Conversation manager instance
   */
  constructor(
    config: Readonly<Partial<MultiTurnConversationConfig>> = {},
    conversationManager?: ConversationManager
  ) {
    this.config = { ...DEFAULT_MULTI_TURN_CONFIG, ...config };
    this.conversationManager =
      conversationManager ?? createConversationManager();
  }

  /**
   * Process a request with multi-turn conversation support.
   */
  public processRequest<TRequest extends ClaudeRequest>(
    request: Readonly<TRequest>,
    conversationId: string,
    correlationId: string
  ): Promise<MultiTurnProcessingResult> {
    try {
      const requestCandidate: unknown = request;

      if (!isRecord(requestCandidate)) {
        throw new ValidationError(
          'Invalid request object',
          correlationId,
          'request',
          request,
          true,
          'multi_turn_validation'
        );
      }

      const requestRecord: Record<string, unknown> = requestCandidate;
      const rawMessages = requestRecord.messages;

      if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
        throw new ValidationError(
          'At least one request message is required',
          correlationId,
          'messages',
          request.messages,
          true,
          'multi_turn_validation'
        );
      }

      // Validate input parameters
      const modelCandidate = requestRecord.model;
      if (typeof modelCandidate !== 'string' || modelCandidate.length === 0) {
        throw new ValidationError(
          'Request model is required',
          correlationId,
          'model',
          request.model,
          true,
          'multi_turn_validation'
        );
      }

      // Get or create conversation state
      let conversationState = this.conversationStates.get(conversationId);

      if (!conversationState) {
        conversationState = this.createNewConversationState(conversationId);
        this.conversationStates.set(conversationId, conversationState);
      }

      // Get previous response ID for continuity
      const previousResponseId =
        this.conversationManager.getPreviousResponseId(conversationId);

      // Analyze context complexity
      const contextComplexity =
        this.conversationManager.analyzeConversationContext(
          conversationId,
          request
        );

      // Determine if we should use previous response for continuity
      const shouldUsePreviousResponse = this.shouldUsePreviousResponse(
        conversationState,
        previousResponseId
      );

      // Create enhanced request with conversation continuity
      const enhancedRequest: ResponsesCreateParams = {
        model: request.model,
        input: this.prepareConversationInput(request),
        max_output_tokens: request.max_tokens,
        temperature: request.temperature,
        top_p: request.top_p,
        stream: request.stream,
        ...(shouldUsePreviousResponse &&
          typeof previousResponseId === 'string' && {
            previous_response_id: previousResponseId,
          }),
      };

      const result: MultiTurnProcessingResult = {
        conversationId,
        previousResponseId: shouldUsePreviousResponse
          ? previousResponseId
          : undefined,
        enhancedRequest,
        contextComplexity,
        historyLength: conversationState.history.length,
        shouldUsePreviousResponse,
      };

      logger.debug('Multi-turn request processed', correlationId, {
        conversationId,
        historyLength: conversationState.history.length,
        contextComplexity,
        shouldUsePreviousResponse,
        hasPreviousResponseId: typeof previousResponseId === 'string',
      });

      return Promise.resolve(result);
    } catch (error) {
      logger.error('Failed to process multi-turn request', correlationId, {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
      const rejectionError =
        error instanceof Error ? error : new Error(String(error));
      return Promise.reject(rejectionError);
    }
  }

  /**
   * Record a conversation turn after receiving response.
   */
  public async recordConversationTurn<
    TRequest extends ClaudeRequest,
    TResponse extends ResponsesResponse,
  >(
    conversationId: string,
    request: Readonly<TRequest>,
    response: Readonly<TResponse>,
    responseTime: number,
    correlationId: string
  ): Promise<void> {
    try {
      const requestCandidate: unknown = request;
      if (!isRecord(requestCandidate)) {
        throw new ValidationError(
          'Invalid request object',
          correlationId,
          'request',
          request,
          true,
          'multi_turn_validation'
        );
      }

      const requestRecord: Record<string, unknown> = requestCandidate;
      const messageCandidate = requestRecord.messages;
      if (!Array.isArray(messageCandidate) || messageCandidate.length === 0) {
        throw new ValidationError(
          'At least one request message is required for conversation history',
          correlationId,
          'messages',
          request.messages,
          true,
          'multi_turn_validation'
        );
      }

      const responseCandidate: unknown = response;
      if (!isRecord(responseCandidate)) {
        throw new ValidationError(
          'Invalid response object',
          correlationId,
          'response',
          response,
          true,
          'multi_turn_validation'
        );
      }

      const responseRecord: Record<string, unknown> = responseCandidate;
      const usageCandidate = responseRecord.usage;
      if (
        !isRecord(usageCandidate) ||
        typeof usageCandidate.total_tokens !== 'number' ||
        typeof usageCandidate.prompt_tokens !== 'number' ||
        typeof usageCandidate.completion_tokens !== 'number'
      ) {
        throw new ValidationError(
          'Response usage metrics are required',
          correlationId,
          'response.usage',
          response.usage,
          true,
          'multi_turn_validation'
        );
      }

      // Validate input parameters
      const responseIdCandidate = responseRecord.id;
      if (
        typeof responseIdCandidate !== 'string' ||
        responseIdCandidate.length === 0
      ) {
        throw new ValidationError(
          'Response ID is required',
          correlationId,
          'response_id',
          response.id,
          true,
          'multi_turn_validation'
        );
      }

      const conversationState = this.conversationStates.get(conversationId);

      if (!conversationState) {
        logger.warn(
          'Attempted to record turn for non-existent conversation',
          correlationId,
          {
            conversationId,
          }
        );
        return Promise.resolve();
      }

      // Create history entry
      const historyEntry: ConversationHistoryEntry = {
        messageId: response.id,
        timestamp: Date.now(),
        request,
        response,
        responseTime,
        tokenUsage: {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
          reasoningTokens: response.usage.reasoning_tokens,
        },
        contextComplexity: this.conversationManager.analyzeConversationContext(
          conversationId,
          request
        ),
      };

      // Update conversation state
      const updatedHistory = [...conversationState.history, historyEntry];

      // Enforce history length limits
      const trimmedHistory = this.trimHistoryToLimits(updatedHistory);

      // Update metrics
      const updatedMetrics: ConversationMetrics = {
        messageCount: conversationState.metrics.messageCount + 1,
        totalTokensUsed:
          conversationState.metrics.totalTokensUsed +
          response.usage.total_tokens,
        reasoningTokensUsed:
          conversationState.metrics.reasoningTokensUsed +
          (response.usage.reasoning_tokens ?? 0),
        averageResponseTime: this.calculateAverageResponseTime(
          conversationState.metrics.averageResponseTime,
          conversationState.metrics.messageCount,
          responseTime
        ),
        errorCount: conversationState.metrics.errorCount,
      };

      // Update context
      const updatedContext: ConversationContext = {
        ...conversationState.context,
        messageCount: updatedMetrics.messageCount,
        previousResponseId: response.id,
        totalTokensUsed: updatedMetrics.totalTokensUsed,
        averageResponseTime: updatedMetrics.averageResponseTime,
      };

      // Create updated state
      const updatedState: ConversationState = {
        ...conversationState,
        lastUpdatedAt: Date.now(),
        history: trimmedHistory,
        context: updatedContext,
        metrics: updatedMetrics,
      };

      this.conversationStates.set(conversationId, updatedState);

      // Update conversation manager
      this.conversationManager.trackConversation(conversationId, response.id, {
        totalTokensUsed: response.usage.total_tokens,
        reasoningTokensUsed: response.usage.reasoning_tokens,
        averageResponseTime: responseTime,
      });

      logger.debug('Conversation turn recorded', correlationId, {
        conversationId,
        messageId: response.id,
        historyLength: trimmedHistory.length,
        totalTokens: response.usage.total_tokens,
        responseTime,
      });
      return;
    } catch (error) {
      logger.error('Failed to record conversation turn', correlationId, {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Add a transcript entry to the conversation history.
   */
  public addToConversationHistory<TEntry extends ConversationTranscriptEntry>(
    conversationId: string,
    entry: Readonly<TEntry>,
    correlationId: string = 'manual-history-entry'
  ): void {
    try {
      const content =
        typeof entry.content === 'string' && entry.content.length > 0
          ? entry.content
          : '';

      const role = entry.role;
      const timestampValue =
        entry.timestamp instanceof Date
          ? entry.timestamp.getTime()
          : typeof entry.timestamp === 'number' &&
              Number.isFinite(entry.timestamp)
            ? entry.timestamp
            : Date.now();

      const tokenCount =
        entry.tokenCount !== undefined && Number.isFinite(entry.tokenCount)
          ? entry.tokenCount
          : 0;

      let conversationState = this.conversationStates.get(conversationId);

      if (!conversationState) {
        conversationState = this.createNewConversationState(conversationId);
        this.conversationStates.set(conversationId, conversationState);
      }

      const manualRequest: ClaudeRequest = {
        model: MANUAL_HISTORY_MODEL,
        messages: [
          {
            role,
            content,
          },
        ],
      };

      const contextComplexity =
        this.conversationManager.analyzeConversationContext(
          conversationId,
          manualRequest
        );

      const messageId = `manual-${conversationId}-${timestampValue}-${Math.random()
        .toString(16)
        .slice(2)}`;

      const historyEntry: ConversationHistoryEntry = {
        messageId,
        timestamp: timestampValue,
        request: manualRequest,
        response: {
          id: messageId,
          object: 'response',
          created: timestampValue,
          model: MANUAL_HISTORY_MODEL,
          output: [
            {
              type: 'text',
              text: content,
            },
          ],
          usage: {
            prompt_tokens: tokenCount,
            completion_tokens: 0,
            total_tokens: tokenCount,
          },
        },
        responseTime: 0,
        tokenUsage: {
          promptTokens: tokenCount,
          completionTokens: 0,
          totalTokens: tokenCount,
        },
        contextComplexity,
        role,
        content,
        tokenCount,
      };

      const updatedHistory = [...conversationState.history, historyEntry];
      const trimmedHistory = this.trimHistoryToLimits(updatedHistory);

      const updatedMetrics: ConversationMetrics = {
        messageCount: conversationState.metrics.messageCount + 1,
        totalTokensUsed: conversationState.metrics.totalTokensUsed + tokenCount,
        reasoningTokensUsed: conversationState.metrics.reasoningTokensUsed,
        averageResponseTime: this.calculateAverageResponseTime(
          conversationState.metrics.averageResponseTime,
          conversationState.metrics.messageCount,
          0
        ),
        errorCount: conversationState.metrics.errorCount,
      };

      const updatedContext: ConversationContext = {
        ...conversationState.context,
        messageCount: updatedMetrics.messageCount,
        totalTokensUsed: updatedMetrics.totalTokensUsed,
        averageResponseTime: updatedMetrics.averageResponseTime,
        taskComplexity: contextComplexity,
        ...(role === 'assistant'
          ? { previousResponseId: historyEntry.messageId }
          : {}),
      };

      const updatedState: ConversationState = {
        ...conversationState,
        lastUpdatedAt: timestampValue,
        history: trimmedHistory,
        metrics: updatedMetrics,
        context: updatedContext,
        isActive: true,
      };

      this.conversationStates.set(conversationId, updatedState);

      this.conversationManager.trackConversation(
        conversationId,
        historyEntry.messageId,
        {
          totalTokensUsed: tokenCount,
          averageResponseTime: 0,
        }
      );

      logger.debug('Manual conversation history entry added', correlationId, {
        conversationId,
        role,
        tokenCount,
        historyLength: trimmedHistory.length,
      });
    } catch (error) {
      logger.error(
        'Failed to add manual conversation history entry',
        correlationId,
        {
          conversationId,
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Get conversation history for a given conversation.
   */
  public getConversationHistory(
    conversationId: string,
    limit?: number
  ): readonly ConversationHistoryEntry[] {
    const conversationState = this.conversationStates.get(conversationId);

    if (!conversationState) {
      return [];
    }

    const history = conversationState.history;

    if (limit !== undefined && limit > 0) {
      return history.slice(-limit); // Get most recent entries
    }

    return history;
  }

  /**
   * Get complete conversation state.
   */
  public getConversationState(
    conversationId: string
  ): ConversationState | undefined {
    return this.conversationStates.get(conversationId);
  }

  /**
   * Clean up old conversation history based on age and limits.
   */
  public cleanupConversationHistory(conversationId?: string): Promise<number> {
    let cleanedCount = 0;
    const now = Date.now();
    const maxAge = this.config.maxHistoryAge;

    try {
      const conversationsToClean =
        typeof conversationId === 'string' && conversationId.length > 0
          ? [conversationId]
          : Array.from(this.conversationStates.keys());

      for (const id of conversationsToClean) {
        const state = this.conversationStates.get(id);
        if (!state) {
          continue;
        }

        // Clean old history entries
        const filteredHistory = state.history.filter((entry) => {
          const age = now - entry.timestamp;
          return age <= maxAge;
        });

        const removedCount = state.history.length - filteredHistory.length;
        cleanedCount += removedCount;

        if (removedCount > 0) {
          // Update state with cleaned history
          const updatedState: ConversationState = {
            ...state,
            history: filteredHistory,
            lastUpdatedAt: now,
          };

          this.conversationStates.set(id, updatedState);
        }

        // Remove empty conversations
        if (filteredHistory.length === 0 && state.history.length > 0) {
          this.conversationStates.delete(id);
        }
      }

      // Enforce concurrent conversation limits
      if (
        this.conversationStates.size > this.config.maxConcurrentConversations
      ) {
        const conversations = Array.from(this.conversationStates.entries());
        const sortedByAge = conversations.sort(
          ([, a], [, b]) => a.lastUpdatedAt - b.lastUpdatedAt
        );

        const toRemove = sortedByAge.slice(
          0,
          this.conversationStates.size - this.config.maxConcurrentConversations
        );

        for (const [id] of toRemove) {
          this.conversationStates.delete(id);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.info('Cleaned up conversation history', 'multi-turn-cleanup', {
          cleanedCount,
          remainingConversations: this.conversationStates.size,
          specificConversation: conversationId,
        });
      }

      return Promise.resolve(cleanedCount);
    } catch (error) {
      logger.error(
        'Failed to cleanup conversation history',
        'multi-turn-cleanup',
        {
          conversationId,
          error: error instanceof Error ? error.message : String(error),
        }
      );
      return Promise.resolve(cleanedCount);
    }
  }

  /**
   * Archive a conversation to make it inactive.
   */
  public archiveConversation(conversationId: string): boolean {
    const state = this.conversationStates.get(conversationId);

    if (!state) {
      return false;
    }

    try {
      const archivedState: ConversationState = {
        ...state,
        isActive: false,
        lastUpdatedAt: Date.now(),
      };

      this.conversationStates.set(conversationId, archivedState);

      logger.info('Conversation archived', conversationId, {
        historyLength: state.history.length,
        totalTokens: state.metrics.totalTokensUsed,
      });

      return true;
    } catch (error) {
      logger.error('Failed to archive conversation', conversationId, {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get statistics about conversation management.
   */
  public getConversationStats(): {
    readonly activeConversations: number;
    readonly totalHistoryEntries: number;
    readonly averageHistoryLength: number;
    readonly oldestConversation: string | undefined;
    readonly estimatedMemoryUsage: number;
  } {
    const conversations = Array.from(this.conversationStates.values());
    const activeConversations = conversations.filter((state) => state.isActive);

    const totalHistoryEntries = conversations.reduce(
      (sum, state) => sum + state.history.length,
      0
    );

    const averageHistoryLength =
      conversations.length > 0 ? totalHistoryEntries / conversations.length : 0;

    const sortedByAge = conversations.sort((a, b) => a.createdAt - b.createdAt);
    const oldestConversation = sortedByAge[0]?.conversationId;

    // Rough memory estimation (in bytes)
    const estimatedMemoryUsage = totalHistoryEntries * 2048; // ~2KB per history entry

    return {
      activeConversations: activeConversations.length,
      totalHistoryEntries,
      averageHistoryLength,
      oldestConversation,
      estimatedMemoryUsage,
    };
  }

  /**
   * Start automatic cleanup and maintenance tasks.
   */
  public startMaintenanceTasks(): void {
    if (this.maintenanceTimer || !this.config.enableAutoCleanup) {
      return;
    }

    this.maintenanceTimer = setInterval(() => {
      this.cleanupConversationHistory().catch((error) => {
        logger.error('Maintenance task failed', 'multi-turn-maintenance', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.config.cleanupInterval);

    logger.info(
      'Multi-turn conversation maintenance started',
      'multi-turn-handler',
      {
        cleanupInterval: this.config.cleanupInterval,
      }
    );
  }

  /**
   * Stop automatic cleanup and maintenance tasks.
   */
  public stopMaintenanceTasks(): void {
    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
      this.maintenanceTimer = undefined;
      logger.info(
        'Multi-turn conversation maintenance stopped',
        'multi-turn-handler'
      );
    }
  }

  /**
   * Create a new conversation state.
   *
   * @private
   */
  private createNewConversationState(
    conversationId: string
  ): ConversationState {
    const now = Date.now();

    return {
      conversationId,
      createdAt: now,
      lastUpdatedAt: now,
      history: [],
      context: {
        conversationId,
        messageCount: 0,
        taskComplexity: 'simple',
        totalTokensUsed: 0,
        averageResponseTime: 0,
      },
      metrics: {
        messageCount: 0,
        totalTokensUsed: 0,
        reasoningTokensUsed: 0,
        averageResponseTime: 0,
        errorCount: 0,
      },
      isActive: true,
    };
  }

  /**
   * Determine if we should use previous response for continuity.
   *
   * @private
   */
  private shouldUsePreviousResponse<TState extends ConversationState>(
    conversationState: Readonly<TState>,
    previousResponseId?: string
  ): boolean {
    // Don't use previous response if not available
    if (
      typeof previousResponseId !== 'string' ||
      previousResponseId.length === 0
    ) {
      return false;
    }

    // Don't use for first message in conversation
    if (conversationState.history.length === 0) {
      return false;
    }

    // Don't use if conversation is too old
    const lastUpdate = conversationState.lastUpdatedAt;
    const age = Date.now() - lastUpdate;
    if (age > this.config.maxHistoryAge) {
      return false;
    }

    // Use for multi-turn conversations with recent activity
    return conversationState.history.length > 0 && age < 300000; // 5 minutes
  }

  /**
   * Prepare conversation input with context.
   *
   * @private
   */
  private prepareConversationInput<TRequest extends ClaudeRequest>(
    request: Readonly<TRequest>
  ): string | readonly import('../types/index.js').ResponseMessage[] {
    // For now, return the request messages as-is
    // In the future, this could include conversation context
    const messages = request.messages.map((msg) => {
      if (typeof msg.content === 'string') {
        return {
          role: msg.role,
          content: msg.content,
        };
      }

      if (Array.isArray(msg.content)) {
        const contentBlocks = msg.content as readonly ClaudeContentBlock[];
        const textSegments: string[] = [];
        for (const block of contentBlocks) {
          if (block.type === 'text' && typeof block.text === 'string') {
            textSegments.push(block.text);
          }
        }

        return {
          role: msg.role,
          content: textSegments.join('\n'),
        };
      }

      return {
        role: msg.role,
        content: '',
      };
    });

    return messages;
  }

  /**
   * Trim history to configured limits.
   *
   * @private
   */
  private trimHistoryToLimits<TEntry extends ConversationHistoryEntry>(
    history: ReadonlyArray<Readonly<TEntry>>
  ): readonly ConversationHistoryEntry[] {
    const maxLength = this.config.maxHistoryLength;

    if (history.length <= maxLength) {
      return history;
    }

    // Keep most recent entries
    return history.slice(-maxLength);
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
}

/**
 * Create a new multi-turn conversation handler with the provided configuration.
 *
 * @param config - Optional configuration for multi-turn conversation handling
 * @param conversationManager - Optional conversation manager instance
 * @returns Configured multi-turn conversation handler
 *
 * @public
 * @example
 * ```typescript
 * const handler = createMultiTurnConversationHandler({
 *   maxHistoryLength: 100,
 *   maxHistoryAge: 7200000, // 2 hours
 *   enableContextTracking: true
 * });
 * ```
 */
export function createMultiTurnConversationHandler(
  config: Partial<MultiTurnConversationConfig> = {},
  conversationManager?: ConversationManager
): MultiTurnConversationHandler {
  return new MultiTurnConversationHandlerImpl(config, conversationManager);
}

/**
 * Default multi-turn conversation handler instance for application use.
 *
 * @public
 */
export const multiTurnConversationHandler =
  createMultiTurnConversationHandler();
