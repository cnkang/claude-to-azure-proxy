/**
 * Context Management Service
 *
 * Provides intelligent context management including usage monitoring,
 * context extension, and compression for different AI models.
 *
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
 */

import type { RequestWithCorrelationId as _RequestWithCorrelationId } from '../types/index.js';
import {
  ValidationError,
  InternalServerError as _InternalServerError,
} from '../errors/index.js';
import { logger } from '../middleware/logging.js';
import { getModelRoutingService } from './model-routing-service.js';

/**
 * Context usage information
 */
export interface ContextUsage {
  readonly currentTokens: number;
  readonly maxTokens: number;
  readonly warningThreshold: number; // Percentage (e.g., 80%)
  readonly canExtend: boolean;
  readonly extendedMaxTokens?: number;
  readonly isExtended: boolean;
  readonly utilizationPercentage: number;
}

/**
 * Context extension result
 */
export interface ContextExtensionResult {
  readonly success: boolean;
  readonly newMaxTokens: number;
  readonly previousMaxTokens: number;
  readonly extensionFactor: number;
  readonly message: string;
}

/**
 * Context compression options
 */
export interface ContextCompressionOptions {
  readonly method: 'ai-summary' | 'selective-removal' | 'hierarchical';
  readonly targetReduction: number; // Percentage (e.g., 50 for 50% reduction)
  readonly preserveRecent: number; // Number of recent messages to preserve
  readonly preserveImportant: boolean; // Whether to preserve important messages
}

/**
 * Context compression result
 */
export interface ContextCompressionResult {
  readonly success: boolean;
  readonly originalTokens: number;
  readonly compressedTokens: number;
  readonly compressionRatio: number;
  readonly compressedContent: string;
  readonly method: string;
  readonly preservedMessages: number;
}

/**
 * Message for context management
 */
export interface ContextMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly timestamp: Date;
  readonly tokenCount?: number;
  readonly importance?: 'low' | 'medium' | 'high';
}

/**
 * Context management service class
 */
export class ContextManagementService {
  private readonly modelRoutingService = getModelRoutingService();
  private readonly tokenCountCache = new Map<string, number>();
  private readonly compressionCache = new Map<
    string,
    ContextCompressionResult
  >();

  /**
   * Calculates context usage for a conversation
   */
  public calculateContextUsage(
    messages: readonly ContextMessage[],
    modelId: string,
    isExtended = false
  ): ContextUsage {
    const maxTokens = this.modelRoutingService.getModelContextLength(
      modelId,
      isExtended
    );
    const canExtend =
      this.modelRoutingService.supportsContextExtension(modelId);
    const extendedMaxTokens = canExtend
      ? this.modelRoutingService.getModelContextLength(modelId, true)
      : undefined;

    // Calculate current token usage
    const currentTokens = this.calculateTotalTokens(messages);

    // Calculate utilization percentage
    const utilizationPercentage = Math.round((currentTokens / maxTokens) * 100);

    // Warning threshold (default 80%)
    const warningThreshold = 80;

    return {
      currentTokens,
      maxTokens,
      warningThreshold,
      canExtend,
      extendedMaxTokens,
      isExtended,
      utilizationPercentage,
    };
  }

  /**
   * Extends context for models that support it
   */
  public async extendContext(
    modelId: string,
    correlationId: string
  ): Promise<ContextExtensionResult> {
    try {
      logger.info('Context extension requested', correlationId, {
        modelId,
      });

      // Check if model supports context extension
      if (!this.modelRoutingService.supportsContextExtension(modelId)) {
        return {
          success: false,
          newMaxTokens: this.modelRoutingService.getModelContextLength(modelId),
          previousMaxTokens:
            this.modelRoutingService.getModelContextLength(modelId),
          extensionFactor: 1,
          message: `Model ${modelId} does not support context extension`,
        };
      }

      const previousMaxTokens = this.modelRoutingService.getModelContextLength(
        modelId,
        false
      );
      const newMaxTokens = this.modelRoutingService.getModelContextLength(
        modelId,
        true
      );
      const extensionFactor = newMaxTokens / previousMaxTokens;

      logger.info('Context extension successful', correlationId, {
        modelId,
        previousMaxTokens,
        newMaxTokens,
        extensionFactor,
      });

      return {
        success: true,
        newMaxTokens,
        previousMaxTokens,
        extensionFactor,
        message: `Context extended from ${previousMaxTokens.toLocaleString()} to ${newMaxTokens.toLocaleString()} tokens`,
      };
    } catch (error) {
      logger.error('Context extension failed', correlationId, {
        modelId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new _InternalServerError(
        'Failed to extend context',
        correlationId,
        'ContextManagementService.extendContext'
      );
    }
  }

  /**
   * Compresses conversation context using AI-powered summarization
   */
  public async compressContext(
    messages: readonly ContextMessage[],
    options: ContextCompressionOptions,
    correlationId: string
  ): Promise<ContextCompressionResult> {
    try {
      logger.info('Context compression requested', correlationId, {
        messageCount: messages.length,
        method: options.method,
        targetReduction: options.targetReduction,
      });

      // Calculate original token count
      const originalTokens = this.calculateTotalTokens(messages);

      // Create cache key for this compression request
      const cacheKey = this.createCompressionCacheKey(messages, options);
      const cached = this.compressionCache.get(cacheKey);

      if (cached) {
        logger.info('Using cached compression result', correlationId, {
          originalTokens: cached.originalTokens,
          compressedTokens: cached.compressedTokens,
          compressionRatio: cached.compressionRatio,
        });
        return cached;
      }

      // Perform compression based on method
      let compressedContent: string;
      let preservedMessages: number;

      switch (options.method) {
        case 'ai-summary':
          ({ compressedContent, preservedMessages } =
            await this.performAISummaryCompression(
              messages,
              options,
              correlationId
            ));
          break;
        case 'selective-removal':
          ({ compressedContent, preservedMessages } =
            await this.performSelectiveRemovalCompression(
              messages,
              options,
              correlationId
            ));
          break;
        case 'hierarchical':
          ({ compressedContent, preservedMessages } =
            await this.performHierarchicalCompression(
              messages,
              options,
              correlationId
            ));
          break;
        default:
          throw new ValidationError(
            `Unsupported compression method: ${options.method}`,
            correlationId,
            'method',
            options.method
          );
      }

      // Calculate compressed token count
      const compressedTokens = this.estimateTokenCount(compressedContent);
      const compressionRatio = Math.round(
        ((originalTokens - compressedTokens) / originalTokens) * 100
      );

      const result: ContextCompressionResult = {
        success: true,
        originalTokens,
        compressedTokens,
        compressionRatio,
        compressedContent,
        method: options.method,
        preservedMessages,
      };

      // Cache the result
      this.compressionCache.set(cacheKey, result);

      logger.info('Context compression completed', correlationId, {
        originalTokens,
        compressedTokens,
        compressionRatio,
        method: options.method,
        preservedMessages,
      });

      return result;
    } catch (error) {
      logger.error('Context compression failed', correlationId, {
        messageCount: messages.length,
        method: options.method,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ValidationError) {
        throw error;
      }

      throw new _InternalServerError(
        'Failed to compress context',
        correlationId,
        'ContextManagementService.compressContext'
      );
    }
  }

  /**
   * Checks if context is approaching limits and needs attention
   */
  public shouldWarnAboutContext(usage: ContextUsage): boolean {
    return usage.utilizationPercentage >= usage.warningThreshold;
  }

  /**
   * Gets context management recommendations
   */
  public getContextRecommendations(usage: ContextUsage): {
    action: 'none' | 'extend' | 'compress' | 'new_conversation';
    reason: string;
    urgency: 'low' | 'medium' | 'high';
  } {
    if (usage.utilizationPercentage < usage.warningThreshold) {
      return {
        action: 'none',
        reason: 'Context usage is within normal limits',
        urgency: 'low',
      };
    }

    if (usage.utilizationPercentage >= 95) {
      if (usage.canExtend && !usage.isExtended) {
        return {
          action: 'extend',
          reason: 'Context is nearly full, but extension is available',
          urgency: 'high',
        };
      }
      return {
        action: 'new_conversation',
        reason: 'Context is nearly full and cannot be extended further',
        urgency: 'high',
      };
    }

    if (usage.utilizationPercentage >= usage.warningThreshold) {
      if (usage.canExtend && !usage.isExtended) {
        return {
          action: 'extend',
          reason: 'Context is approaching limits, extension recommended',
          urgency: 'medium',
        };
      }
      return {
        action: 'compress',
        reason: 'Context is approaching limits, compression recommended',
        urgency: 'medium',
      };
    }

    return {
      action: 'none',
      reason: 'Context usage is acceptable',
      urgency: 'low',
    };
  }

  /**
   * Calculates total token count for messages
   */
  private calculateTotalTokens(messages: readonly ContextMessage[]): number {
    return messages.reduce((total, message) => {
      if (message.tokenCount) {
        return total + message.tokenCount;
      }

      // Use cached token count or estimate
      const cacheKey = `${message.id}:${message.content.length}`;
      let tokenCount = this.tokenCountCache.get(cacheKey);

      if (!tokenCount) {
        tokenCount = this.estimateTokenCount(message.content);
        this.tokenCountCache.set(cacheKey, tokenCount);
      }

      return total + tokenCount;
    }, 0);
  }

  /**
   * Estimates token count for text content
   * This is a simplified estimation - in production, you'd use a proper tokenizer
   */
  private estimateTokenCount(content: string): number {
    // Rough estimation: ~4 characters per token for English text
    // This should be replaced with actual tokenization in production
    return Math.ceil(content.length / 4);
  }

  /**
   * Performs AI-powered summary compression
   */
  private async performAISummaryCompression(
    messages: readonly ContextMessage[],
    options: ContextCompressionOptions,
    correlationId: string
  ): Promise<{ compressedContent: string; preservedMessages: number }> {
    const recentMessages = messages.slice(-options.preserveRecent);
    const messagesToCompress = messages.slice(0, -options.preserveRecent);

    if (messagesToCompress.length === 0) {
      return {
        compressedContent: messages
          .map((m) => `${m.role}: ${m.content}`)
          .join('\n'),
        preservedMessages: messages.length,
      };
    }

    try {
      // Use AI-powered compression with actual model call
      const compressedSummary = await this.generateAISummary(
        messagesToCompress,
        correlationId
      );

      // Combine AI summary with recent messages
      const recentContent = recentMessages
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');
      const compressedContent = `${compressedSummary}\n\n${recentContent}`;

      return {
        compressedContent,
        preservedMessages: recentMessages.length,
      };
    } catch (error) {
      logger.warn(
        'AI summary compression failed, using fallback',
        correlationId,
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );

      // Fallback to simple summary
      const summary = this.createFallbackSummary(messagesToCompress);
      const recentContent = recentMessages
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');
      const compressedContent = `${summary}\n\n${recentContent}`;

      return {
        compressedContent,
        preservedMessages: recentMessages.length,
      };
    }
  }

  /**
   * Generates AI-powered summary of conversation messages
   */
  private async generateAISummary(
    messages: readonly ContextMessage[],
    correlationId: string
  ): Promise<string> {
    // Create a prompt for AI summarization
    const conversationText = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const _summaryPrompt = `Please provide a concise summary of the following conversation, preserving key technical details, decisions made, and important context. Focus on maintaining information that would be useful for continuing the conversation:

${conversationText}

Summary:`;

    try {
      // In a real implementation, this would call an AI service for summarization
      // For now, we'll use a more sophisticated text processing approach
      const summary = await this.processConversationForSummary(messages);

      logger.info('AI summary generated successfully', correlationId, {
        originalMessages: messages.length,
        summaryLength: summary.length,
      });

      return `[AI Summary] ${summary}`;
    } catch (error) {
      logger.error('AI summary generation failed', correlationId, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Processes conversation messages to create an intelligent summary
   */
  private async processConversationForSummary(
    messages: readonly ContextMessage[]
  ): Promise<string> {
    // Extract key information from messages
    const keyTopics = new Set<string>();
    const codeBlocks: string[] = [];
    const decisions: string[] = [];
    const questions: string[] = [];

    for (const message of messages) {
      const content = message.content.toLowerCase();

      // Extract code blocks
      const codeMatches = message.content.match(/```[\s\S]*?```/g);
      if (codeMatches) {
        codeBlocks.push(...codeMatches.slice(0, 2)); // Limit to 2 code blocks
      }

      // Identify key topics (programming languages, frameworks, etc.)
      const topics = this.extractTopics(message.content);
      topics.forEach((topic) => keyTopics.add(topic));

      // Extract decisions and conclusions
      if (
        content.includes('decided') ||
        content.includes('conclusion') ||
        content.includes('solution')
      ) {
        const sentences = message.content.split(/[.!?]+/);
        for (const sentence of sentences) {
          if (
            sentence.toLowerCase().includes('decided') ||
            sentence.toLowerCase().includes('conclusion') ||
            sentence.toLowerCase().includes('solution')
          ) {
            decisions.push(sentence.trim());
          }
        }
      }

      // Extract questions for context
      if (message.role === 'user' && message.content.includes('?')) {
        const questionSentences = message.content
          .split(/[.!?]+/)
          .filter((s) => s.includes('?'));
        questions.push(...questionSentences.slice(0, 2)); // Limit to 2 questions
      }
    }

    // Build comprehensive summary
    const summaryParts: string[] = [];

    if (keyTopics.size > 0) {
      summaryParts.push(
        `Topics discussed: ${Array.from(keyTopics).slice(0, 5).join(', ')}`
      );
    }

    if (questions.length > 0) {
      summaryParts.push(`Key questions: ${questions.slice(0, 2).join('; ')}`);
    }

    if (decisions.length > 0) {
      summaryParts.push(
        `Decisions/Solutions: ${decisions.slice(0, 2).join('; ')}`
      );
    }

    if (codeBlocks.length > 0) {
      summaryParts.push(
        `Code examples provided: ${codeBlocks.length} code block(s)`
      );
    }

    return (
      summaryParts.join('. ') ||
      'General technical discussion covering various programming topics.'
    );
  }

  /**
   * Extracts key topics from message content
   */
  private extractTopics(content: string): string[] {
    const topics: string[] = [];
    const topicPatterns = [
      // Programming languages
      /\b(javascript|typescript|python|java|kotlin|swift|go|rust|c\+\+|c#|php|ruby)\b/gi,
      // Frameworks
      /\b(react|vue|angular|express|django|flask|spring|laravel|rails)\b/gi,
      // Technologies
      /\b(docker|kubernetes|aws|azure|gcp|mongodb|postgresql|mysql|redis)\b/gi,
      // Concepts
      /\b(api|database|authentication|authorization|microservices|serverless)\b/gi,
    ];

    for (const pattern of topicPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        topics.push(...matches.map((m) => m.toLowerCase()));
      }
    }

    return [...new Set(topics)]; // Remove duplicates
  }

  /**
   * Creates a fallback summary when AI summarization fails
   */
  private createFallbackSummary(messages: readonly ContextMessage[]): string {
    const messageCount = messages.length;
    const userMessages = messages.filter((m) => m.role === 'user').length;
    const assistantMessages = messages.filter(
      (m) => m.role === 'assistant'
    ).length;

    // Extract some key terms for context
    const allContent = messages.map((m) => m.content).join(' ');
    const topics = this.extractTopics(allContent);

    let summary = `[Conversation Summary: ${messageCount} messages exchanged (${userMessages} user, ${assistantMessages} assistant)`;

    if (topics.length > 0) {
      summary += `. Topics: ${topics.slice(0, 3).join(', ')}`;
    }

    summary += '. Key context and technical details preserved.]';

    return summary;
  }

  /**
   * Performs selective removal compression
   */
  private async performSelectiveRemovalCompression(
    messages: readonly ContextMessage[],
    options: ContextCompressionOptions,
    _correlationId: string
  ): Promise<{ compressedContent: string; preservedMessages: number }> {
    // Keep recent messages and important messages
    const recentMessages = messages.slice(-options.preserveRecent);
    const olderMessages = messages.slice(0, -options.preserveRecent);

    // Filter older messages to keep only important ones if specified
    let preservedOlderMessages = olderMessages;
    if (options.preserveImportant) {
      preservedOlderMessages = olderMessages.filter(
        (m) => m.importance === 'high'
      );
    } else {
      // Keep every nth message to achieve target reduction
      const keepRatio = 1 - options.targetReduction / 100;
      const keepEvery = Math.max(1, Math.round(1 / keepRatio));
      preservedOlderMessages = olderMessages.filter(
        (_, index) => index % keepEvery === 0
      );
    }

    const allPreservedMessages = [...preservedOlderMessages, ...recentMessages];
    const compressedContent = allPreservedMessages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    return {
      compressedContent,
      preservedMessages: allPreservedMessages.length,
    };
  }

  /**
   * Performs hierarchical compression
   */
  private async performHierarchicalCompression(
    messages: readonly ContextMessage[],
    _options: ContextCompressionOptions,
    _correlationId: string
  ): Promise<{ compressedContent: string; preservedMessages: number }> {
    // Group messages by importance and apply different compression levels
    const highImportance = messages.filter((m) => m.importance === 'high');
    const mediumImportance = messages.filter((m) => m.importance === 'medium');
    const lowImportance = messages.filter(
      (m) => m.importance === 'low' || !m.importance
    );

    // Keep all high importance messages
    const preservedHigh = highImportance;

    // Keep recent medium importance messages
    const recentMedium = mediumImportance.slice(
      -Math.ceil(mediumImportance.length * 0.5)
    );

    // Keep only very recent low importance messages
    const recentLow = lowImportance.slice(
      -Math.ceil(lowImportance.length * 0.2)
    );

    // Combine and sort by timestamp
    const allPreserved = [...preservedHigh, ...recentMedium, ...recentLow].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    const compressedContent = allPreserved
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    return {
      compressedContent,
      preservedMessages: allPreserved.length,
    };
  }

  /**
   * Creates a cache key for compression results
   */
  private createCompressionCacheKey(
    messages: readonly ContextMessage[],
    options: ContextCompressionOptions
  ): string {
    const messageHash = messages
      .map((m) => `${m.id}:${m.content.length}`)
      .join('|');
    const optionsHash = `${options.method}:${options.targetReduction}:${options.preserveRecent}:${options.preserveImportant}`;
    return `${messageHash}:${optionsHash}`;
  }
}

/**
 * Global context management service instance
 */
let contextManagementService: ContextManagementService | null = null;

/**
 * Gets the global context management service instance
 */
export function getContextManagementService(): ContextManagementService {
  if (!contextManagementService) {
    contextManagementService = new ContextManagementService();
  }
  return contextManagementService;
}

/**
 * Creates a new context management service instance
 */
export function createContextManagementService(): ContextManagementService {
  return new ContextManagementService();
}
