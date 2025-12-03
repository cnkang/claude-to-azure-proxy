/**
 * Context Management Service
 *
 * Provides API client for context management operations including
 * context extension, conversation compression, and compressed conversation creation.
 *
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
 */

import type { CompressionOptions } from '../hooks/useContextManagement.js';
import type { CompressionEvent, ContextUsage } from '../types/index.js';
import { frontendLogger } from '../utils/logger.js';
import { getSessionManager } from './session.js';

// API endpoints
const CONTEXT_EXTEND_ENDPOINT =
  '/api/conversations/{conversationId}/extend-context';
const CONTEXT_COMPRESS_ENDPOINT =
  '/api/conversations/{conversationId}/compress';
const CONTEXT_CREATE_COMPRESSED_ENDPOINT =
  '/api/conversations/{conversationId}/create-compressed';

/**
 * Context extension result from API
 */
export interface ContextExtensionResponse {
  success: boolean;
  extendedMaxTokens: number;
  previousMaxTokens: number;
  model: string;
}

/**
 * Context compression result from API
 */
export interface ContextCompressionResponse {
  compressedContext: string;
  compressionEvent: CompressionEvent;
  originalTokens: number;
  compressedTokens: number;
  compressionRatio: number;
  method: string;
}

/**
 * Compressed conversation creation result from API
 */
export interface CompressedConversationResponse {
  newConversationId: string;
  title: string;
  parentConversationId: string;
  createdAt: string;
}

/**
 * Context management service class
 */
export class ContextService {
  private static instance: ContextService | null = null;
  private readonly sessionManager = getSessionManager();

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): ContextService {
    ContextService.instance ??= new ContextService();
    return ContextService.instance;
  }

  /**
   * Extend context for a conversation (for supported models)
   */
  public async extendContext(
    conversationId: string
  ): Promise<ContextExtensionResponse> {
    try {
      const sessionId = this.sessionManager.getSessionId();
      if (!sessionId) {
        throw new Error('No active session');
      }

      const url = CONTEXT_EXTEND_ENDPOINT.replace(
        '{conversationId}',
        conversationId
      );

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': sessionId,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error?.message ??
            `Context extension failed: ${response.status}`
        );
      }

      const result = (await response.json()) as ContextExtensionResponse;

      frontendLogger.info('Context extended successfully', {
        metadata: {
          conversationId,
          previousMaxTokens: result.previousMaxTokens,
          extendedMaxTokens: result.extendedMaxTokens,
          model: result.model,
        },
      });

      return result;
    } catch (error) {
      frontendLogger.error('Failed to extend context', {
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: { conversationId },
      });
      throw error;
    }
  }

  /**
   * Compress conversation using AI
   */
  public async compressConversation(
    conversationId: string,
    options: CompressionOptions
  ): Promise<ContextCompressionResponse> {
    try {
      const sessionId = this.sessionManager.getSessionId();
      if (!sessionId) {
        throw new Error('No active session');
      }

      const url = CONTEXT_COMPRESS_ENDPOINT.replace(
        '{conversationId}',
        conversationId
      );

      const requestBody = {
        compressionMethod: options.method,
        targetReduction: options.targetReduction,
        preserveCodeBlocks: options.preserveCodeBlocks,
        preserveRecentMessages: options.preserveRecentMessages,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': sessionId,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error?.message ??
            `Conversation compression failed: ${response.status}`
        );
      }

      const result = (await response.json()) as ContextCompressionResponse;

      frontendLogger.info('Conversation compressed successfully', {
        metadata: {
          conversationId,
          method: options.method,
          originalTokens: result.originalTokens,
          compressedTokens: result.compressedTokens,
          compressionRatio: result.compressionRatio,
        },
      });

      return result;
    } catch (error) {
      frontendLogger.error('Failed to compress conversation', {
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: { conversationId, options },
      });
      throw error;
    }
  }

  /**
   * Create a new conversation with compressed context
   */
  public async createCompressedConversation(
    originalConversationId: string,
    compressedContext: string,
    title?: string
  ): Promise<CompressedConversationResponse> {
    try {
      const sessionId = this.sessionManager.getSessionId();
      if (!sessionId) {
        throw new Error('No active session');
      }

      const url = CONTEXT_CREATE_COMPRESSED_ENDPOINT.replace(
        '{conversationId}',
        originalConversationId
      );

      const requestBody = {
        compressedContext,
        originalConversationId,
        title:
          title ?? `Compressed Conversation ${new Date().toLocaleDateString()}`,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': sessionId,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error?.message ??
            `Failed to create compressed conversation: ${response.status}`
        );
      }

      const result = (await response.json()) as CompressedConversationResponse;

      frontendLogger.info('Compressed conversation created successfully', {
        metadata: {
          originalConversationId,
          newConversationId: result.newConversationId,
          title: result.title,
        },
      });

      return result;
    } catch (error) {
      frontendLogger.error('Failed to create compressed conversation', {
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: { originalConversationId, title },
      });
      throw error;
    }
  }

  /**
   * Check if a model supports context extension
   */
  public canModelExtendContext(_modelId: string): boolean {
    // Models that support context extension
    const extensibleModels = [
      'qwen-3-coder',
      'qwen.qwen3-coder-480b-a35b-v1:0',
      'qwen2.5-coder-32b-instruct-v1:0',
    ];

    return extensibleModels.some(
      (model) => _modelId.includes(model) || model.includes(_modelId)
    );
  }

  /**
   * Get extended context limit for a model
   */
  public getExtendedContextLimit(_modelId: string): number | null {
    const extendedLimits: Record<string, number> = {
      'qwen-3-coder': 1000000,
      'qwen.qwen3-coder-480b-a35b-v1:0': 1000000,
      'qwen2.5-coder-32b-instruct-v1:0': 1000000,
    };

    for (const [model, limit] of Object.entries(extendedLimits)) {
      if (_modelId.includes(model) || model.includes(_modelId)) {
        return limit;
      }
    }

    return null;
  }

  /**
   * Estimate compression ratio based on options
   */
  public estimateCompressionRatio(options: CompressionOptions): number {
    let baseRatio = options.targetReduction;

    // Adjust based on method
    switch (options.method) {
      case 'ai-summary':
        // AI summary is most effective
        break;
      case 'selective-removal':
        // Selective removal is less aggressive
        baseRatio *= 0.8;
        break;
      case 'hierarchical':
        // Hierarchical compression is moderate
        baseRatio *= 0.9;
        break;
    }

    // Adjust based on preservation options
    if (options.preserveCodeBlocks) {
      baseRatio *= 0.9; // Less compression when preserving code
    }

    if (options.preserveRecentMessages > 5) {
      baseRatio *= 0.85; // Less compression when preserving more messages
    }

    return Math.max(0.1, Math.min(0.9, baseRatio));
  }

  /**
   * Validate compression options
   */
  public validateCompressionOptions(options: CompressionOptions): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (options.targetReduction < 0.1 || options.targetReduction > 0.9) {
      errors.push('Target reduction must be between 10% and 90%');
    }

    if (
      options.preserveRecentMessages < 1 ||
      options.preserveRecentMessages > 20
    ) {
      errors.push('Preserve recent messages must be between 1 and 20');
    }

    if (
      !['ai-summary', 'selective-removal', 'hierarchical'].includes(
        options.method
      )
    ) {
      errors.push('Invalid compression method');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Calculate context usage for messages
   */
  public calculateContextUsage(
    messages: Array<{
      content: string;
      files?: Array<{ size?: number; type: string }>;
    }>,
    _modelId: string
  ): { currentTokens: number; estimatedTokens: number } {
    let totalTokens = 0;

    for (const message of messages) {
      // Estimate tokens for text content (rough approximation: 1 token ≈ 4 characters)
      totalTokens += Math.ceil(message.content.length / 4);

      // Add tokens for files
      if (message.files) {
        for (const file of message.files) {
          if (file.type.startsWith('image/')) {
            totalTokens += 1000; // Images use more tokens
          } else if (file.size) {
            totalTokens += Math.ceil(file.size / 4); // Text files
          }
        }
      }
    }

    return {
      currentTokens: totalTokens,
      estimatedTokens: totalTokens,
    };
  }

  /**
   * Get context warning threshold for a model
   */
  public getContextWarningThreshold(_modelId: string): number {
    // Different models may have different warning thresholds
    const thresholds: Record<string, number> = {
      'gpt-4': 0.8, // 80%
      'gpt-5-codex': 0.8, // 80%
      'qwen-3-coder': 0.85, // 85% (larger context)
      'qwen.qwen3-coder-480b-a35b-v1:0': 0.9, // 90% (very large context)
    };

    for (const [model, threshold] of Object.entries(thresholds)) {
      if (_modelId.includes(model) || model.includes(_modelId)) {
        return threshold;
      }
    }

    return 0.8; // Default 80%
  }
}

/**
 * Get the global context service instance
 */
export function getContextService(): ContextService {
  return ContextService.getInstance();
}

/**
 * Context utility functions
 */
export const contextUtils = {
  /**
   * Format token count for display
   */
  formatTokenCount(tokens: number): string {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(1)}M`;
    }
    if (tokens >= 1_000) {
      return `${(tokens / 1_000).toFixed(0)}K`;
    }
    return tokens.toLocaleString();
  },

  /**
   * Calculate context usage percentage
   */
  getUsagePercentage(current: number, max: number): number {
    return Math.round((current / max) * 100);
  },

  /**
   * Get context warning level
   */
  getWarningLevel(percentage: number): 'none' | 'warning' | 'critical' {
    if (percentage >= 95) {
      return 'critical';
    } else if (percentage >= 80) {
      return 'warning';
    }
    return 'none';
  },

  /**
   * Estimate tokens from text
   */
  estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  },

  /**
   * Check if context extension is beneficial
   */
  shouldSuggestExtension(usage: ContextUsage): boolean {
    const percentage = (usage.currentTokens / usage.maxTokens) * 100;
    return usage.canExtend && !usage.isExtended && percentage >= 80;
  },

  /**
   * Check if compression is recommended
   */
  shouldSuggestCompression(usage: ContextUsage): boolean {
    const percentage = (usage.currentTokens / usage.maxTokens) * 100;
    return percentage >= 90 || (usage.isExtended && percentage >= 85);
  },

  /**
   * Generate compression event ID
   */
  generateCompressionId(): string {
    return `comp_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  },
};
