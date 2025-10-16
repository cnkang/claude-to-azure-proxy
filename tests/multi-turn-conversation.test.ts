/**
 * @fileoverview Tests for multi-turn conversation functionality.
 *
 * This test suite covers multi-turn conversation continuity, conversation history
 * management, context-aware response tracking, and conversation cleanup policies.
 * It ensures the multi-turn conversation handler meets all requirements for
 * reliable conversation state management and continuity.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type {
  ClaudeRequest,
  ResponsesResponse,
} from '../src/types/index.js';
import type {
  MultiTurnConversationHandler,
  MultiTurnConversationConfig,
} from '../src/utils/multi-turn-conversation.js';
import {
  MultiTurnConversationHandlerImpl,
  createMultiTurnConversationHandler,
} from '../src/utils/multi-turn-conversation.js';
import { createConversationManager } from '../src/utils/conversation-manager.js';

describe('MultiTurnConversationHandler', () => {
  let handler: MultiTurnConversationHandler;
  let mockConfig: MultiTurnConversationConfig;

  beforeEach(() => {
    mockConfig = {
      maxHistoryLength: 10,
      maxHistoryAge: 60000, // 1 minute for testing
      enableContextTracking: true,
      enableAutoCleanup: false, // Disable for controlled testing
      cleanupInterval: 10000,
      maxConcurrentConversations: 5,
      enablePersistence: false,
    };

    const conversationManager = createConversationManager({
      maxConversationAge: 60000,
      cleanupInterval: 10000,
      maxStoredConversations: 5,
    });

    handler = new MultiTurnConversationHandlerImpl(mockConfig, conversationManager);
  });

  afterEach(() => {
    handler.stopMaintenanceTasks();
  });

  // Helper function to create mock request
  const createMockRequest = (content: string, messageCount = 1): ClaudeRequest => ({
    model: 'claude-3-5-sonnet-20241022',
    messages: Array.from({ length: messageCount }, (_, i) => ({
      role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `${content} - message ${i + 1}`,
    })),
    max_tokens: 1000,
    temperature: 0.7,
  });

  // Helper function to create mock response
  const createMockResponse = (id: string, totalTokens = 100): ResponsesResponse => ({
    id,
    object: 'response',
    created: Date.now(),
    model: 'gpt-4',
    output: [
      {
        type: 'text',
        text: `Response for ${id}`,
      },
    ],
    usage: {
      prompt_tokens: 50,
      completion_tokens: 50,
      total_tokens: totalTokens,
      reasoning_tokens: 10,
    },
  });

  describe('Multi-Turn Request Processing', () => {
    it('should process first request in conversation', async () => {
      const conversationId = 'conv-123';
      const correlationId = 'corr-123';
      const request = createMockRequest('Hello, how are you?');

      const result = await handler.processRequest(request, conversationId, correlationId);

      expect(result.conversationId).toBe(conversationId);
      expect(result.previousResponseId).toBeUndefined();
      expect(result.shouldUsePreviousResponse).toBe(false);
      expect(result.historyLength).toBe(0);
      expect(result.contextComplexity).toBe('simple');
      expect(result.enhancedRequest).toBeDefined();
      expect(result.enhancedRequest.model).toBe(request.model);
    });

    it('should process subsequent requests with conversation continuity', async () => {
      const conversationId = 'conv-123';
      const correlationId = 'corr-123';
      const request1 = createMockRequest('First message');
      const request2 = createMockRequest('Second message');
      const response1 = createMockResponse('resp-1');

      // Process first request
      await handler.processRequest(request1, conversationId, correlationId);

      // Record first conversation turn
      await handler.recordConversationTurn(
        conversationId,
        request1,
        response1,
        1500,
        correlationId
      );

      // Process second request
      const result = await handler.processRequest(request2, conversationId, correlationId);

      expect(result.conversationId).toBe(conversationId);
      expect(result.previousResponseId).toBe('resp-1');
      expect(result.shouldUsePreviousResponse).toBe(true);
      expect(result.historyLength).toBe(1);
      expect(result.enhancedRequest.previous_response_id).toBe('resp-1');
    });

    it('should handle complex conversation context', async () => {
      const conversationId = 'conv-complex';
      const correlationId = 'corr-123';
      const complexRequest = createMockRequest(
        'Can you help me design a complex microservices architecture with event sourcing and CQRS patterns?'
      );

      const result = await handler.processRequest(complexRequest, conversationId, correlationId);

      expect(result.contextComplexity).toBeOneOf(['medium', 'complex']);
    });

    it('should not use previous response for old conversations', async () => {
      const conversationId = 'conv-old';
      const correlationId = 'corr-123';
      const request1 = createMockRequest('First message');
      const request2 = createMockRequest('Second message');
      const response1 = createMockResponse('resp-1');

      // Process first request
      await handler.processRequest(request1, conversationId, correlationId);

      // Record first conversation turn
      await handler.recordConversationTurn(
        conversationId,
        request1,
        response1,
        1500,
        correlationId
      );

      // Mock time to make conversation old
      const originalNow = Date.now;
      Date.now = vi.fn(() => originalNow() + 400000); // 6+ minutes later

      // Process second request
      const result = await handler.processRequest(request2, conversationId, correlationId);

      expect(result.shouldUsePreviousResponse).toBe(false);
      expect(result.enhancedRequest.previous_response_id).toBeUndefined();

      // Restore Date.now
      Date.now = originalNow;
    });
  });

  describe('Conversation Turn Recording', () => {
    it('should record conversation turn correctly', async () => {
      const conversationId = 'conv-123';
      const correlationId = 'corr-123';
      const request = createMockRequest('Test message');
      const response = createMockResponse('resp-123', 150);

      // Process initial request to create conversation state
      await handler.processRequest(request, conversationId, correlationId);

      // Record conversation turn
      await handler.recordConversationTurn(
        conversationId,
        request,
        response,
        2000,
        correlationId
      );

      const history = handler.getConversationHistory(conversationId);
      expect(history).toHaveLength(1);

      const entry = history.length > 0 ? history[0] : null;
      expect(entry.messageId).toBe('resp-123');
      expect(entry.request).toEqual(request);
      expect(entry.response).toEqual(response);
      expect(entry.responseTime).toBe(2000);
      expect(entry.tokenUsage.totalTokens).toBe(150);
      expect(entry.tokenUsage.reasoningTokens).toBe(10);
    });

    it('should update conversation metrics when recording turns', async () => {
      const conversationId = 'conv-123';
      const correlationId = 'corr-123';
      const request1 = createMockRequest('First message');
      const request2 = createMockRequest('Second message');
      const response1 = createMockResponse('resp-1', 100);
      const response2 = createMockResponse('resp-2', 200);

      // Process and record first turn
      await handler.processRequest(request1, conversationId, correlationId);
      await handler.recordConversationTurn(
        conversationId,
        request1,
        response1,
        1000,
        correlationId
      );

      // Process and record second turn
      await handler.processRequest(request2, conversationId, correlationId);
      await handler.recordConversationTurn(
        conversationId,
        request2,
        response2,
        3000,
        correlationId
      );

      const state = handler.getConversationState(conversationId);
      expect(state).toBeDefined();
      expect(state?.metrics.messageCount).toBe(2);
      expect(state?.metrics.totalTokensUsed).toBe(300); // 100 + 200
      expect(state?.metrics.averageResponseTime).toBe(2000); // (1000 + 3000) / 2
      expect(state?.context.previousResponseId).toBe('resp-2');
    });

    it('should handle recording turn for non-existent conversation', async () => {
      const conversationId = 'non-existent';
      const correlationId = 'corr-123';
      const request = createMockRequest('Test message');
      const response = createMockResponse('resp-123');

      await expect(
        handler.recordConversationTurn(conversationId, request, response, 1000, correlationId)
      ).resolves.not.toThrow();

      const history = handler.getConversationHistory(conversationId);
      expect(history).toHaveLength(0);
    });
  });

  describe('Conversation History Management', () => {
    it('should maintain conversation history correctly', async () => {
      const conversationId = 'conv-123';
      const correlationId = 'corr-123';

      // Process initial request
      const initialRequest = createMockRequest('Initial message');
      await handler.processRequest(initialRequest, conversationId, correlationId);

      // Record multiple turns
      for (let i = 1; i <= 5; i++) {
        const request = createMockRequest(`Message ${i}`);
        const response = createMockResponse(`resp-${i}`, 100 * i);

        await handler.recordConversationTurn(
          conversationId,
          request,
          response,
          1000 * i,
          correlationId
        );
      }

      const history = handler.getConversationHistory(conversationId);
      expect(history).toHaveLength(5);

      // Check chronological order
      for (let i = 0; i < 5; i++) {
        const entry = history.at(i);
        if (entry) {
          expect(entry.messageId).toBe(`resp-${i + 1}`);
          expect(entry.tokenUsage.totalTokens).toBe(100 * (i + 1));
        }
      }
    });

    it('should limit conversation history length', async () => {
      const conversationId = 'conv-123';
      const correlationId = 'corr-123';

      // Process initial request
      const initialRequest = createMockRequest('Initial message');
      await handler.processRequest(initialRequest, conversationId, correlationId);

      // Record more turns than the limit (10)
      for (let i = 1; i <= 15; i++) {
        const request = createMockRequest(`Message ${i}`);
        const response = createMockResponse(`resp-${i}`);

        await handler.recordConversationTurn(
          conversationId,
          request,
          response,
          1000,
          correlationId
        );
      }

      const history = handler.getConversationHistory(conversationId);
      expect(history).toHaveLength(mockConfig.maxHistoryLength);

      // Should keep most recent entries
      expect(history.length > 0 ? history[0]?.messageId : null).toBe('resp-6'); // First kept entry
      expect(history.length > 9 ? history[9]?.messageId : null).toBe('resp-15'); // Last entry
    });

    it('should return limited history when requested', async () => {
      const conversationId = 'conv-123';
      const correlationId = 'corr-123';

      // Process initial request
      const initialRequest = createMockRequest('Initial message');
      await handler.processRequest(initialRequest, conversationId, correlationId);

      // Record multiple turns
      for (let i = 1; i <= 5; i++) {
        const request = createMockRequest(`Message ${i}`);
        const response = createMockResponse(`resp-${i}`);

        await handler.recordConversationTurn(
          conversationId,
          request,
          response,
          1000,
          correlationId
        );
      }

      const limitedHistory = handler.getConversationHistory(conversationId, 3);
      expect(limitedHistory).toHaveLength(3);

      // Should return most recent entries
      expect(limitedHistory.length > 0 ? limitedHistory[0]?.messageId : null).toBe('resp-3');
      expect(limitedHistory.length > 2 ? limitedHistory[2]?.messageId : null).toBe('resp-5');
    });

    it('should return empty history for non-existent conversation', () => {
      const history = handler.getConversationHistory('non-existent');
      expect(history).toHaveLength(0);
    });
  });

  describe('Conversation State Management', () => {
    it('should get complete conversation state', async () => {
      const conversationId = 'conv-123';
      const correlationId = 'corr-123';
      const request = createMockRequest('Test message');
      const response = createMockResponse('resp-123');

      // Process request and record turn
      await handler.processRequest(request, conversationId, correlationId);
      await handler.recordConversationTurn(
        conversationId,
        request,
        response,
        1500,
        correlationId
      );

      const state = handler.getConversationState(conversationId);
      expect(state).toBeDefined();
      expect(state?.conversationId).toBe(conversationId);
      expect(state?.isActive).toBe(true);
      expect(state?.history).toHaveLength(1);
      expect(state?.context.conversationId).toBe(conversationId);
      expect(state?.metrics.messageCount).toBe(1);
      expect(state?.createdAt).toBeDefined();
      expect(state?.lastUpdatedAt).toBeDefined();
    });

    it('should return undefined for non-existent conversation state', () => {
      const state = handler.getConversationState('non-existent');
      expect(state).toBeUndefined();
    });

    it('should archive conversation correctly', async () => {
      const conversationId = 'conv-123';
      const correlationId = 'corr-123';
      const request = createMockRequest('Test message');

      // Process request to create conversation
      await handler.processRequest(request, conversationId, correlationId);

      // Archive conversation
      const archived = handler.archiveConversation(conversationId);
      expect(archived).toBe(true);

      const state = handler.getConversationState(conversationId);
      expect(state?.isActive).toBe(false);
    });

    it('should handle archiving non-existent conversation', () => {
      const archived = handler.archiveConversation('non-existent');
      expect(archived).toBe(false);
    });
  });

  describe('Conversation Cleanup', () => {
    it('should clean up old conversation history', async () => {
      const conversationId = 'conv-123';
      const correlationId = 'corr-123';

      // Process initial request
      const initialRequest = createMockRequest('Initial message');
      await handler.processRequest(initialRequest, conversationId, correlationId);

      // Record turns with different timestamps
      const originalNow = Date.now;
      const baseTime = originalNow();

      for (let i = 1; i <= 5; i++) {
        Date.now = vi.fn(() => baseTime + i * 10000); // 10 seconds apart

        const request = createMockRequest(`Message ${i}`);
        const response = createMockResponse(`resp-${i}`);

        await handler.recordConversationTurn(
          conversationId,
          request,
          response,
          1000,
          correlationId
        );
      }

      // Move time forward to make some entries old
      Date.now = vi.fn(() => baseTime + 120000); // 2 minutes later

      const cleanedCount = await handler.cleanupConversationHistory(conversationId);
      expect(cleanedCount).toBeGreaterThan(0);

      const history = handler.getConversationHistory(conversationId);
      expect(history.length).toBeLessThan(5);

      // Restore Date.now
      Date.now = originalNow;
    });

    it('should clean up all conversations when no specific ID provided', async () => {
      const conversationIds = ['conv-1', 'conv-2', 'conv-3'];
      const correlationId = 'corr-123';

      // Create multiple conversations
      for (const id of conversationIds) {
        const request = createMockRequest(`Message for ${id}`);
        await handler.processRequest(request, id, correlationId);

        const response = createMockResponse(`resp-${id}`);
        await handler.recordConversationTurn(id, request, response, 1000, correlationId);
      }

      // Mock time to make conversations old
      const originalNow = Date.now;
      Date.now = vi.fn(() => originalNow() + 120000); // 2 minutes later

      const cleanedCount = await handler.cleanupConversationHistory();
      expect(cleanedCount).toBeGreaterThan(0);

      // Restore Date.now
      Date.now = originalNow;
    });

    it('should enforce concurrent conversation limits', async () => {
      const correlationId = 'corr-123';

      // Create more conversations than the limit (5)
      for (let i = 1; i <= 8; i++) {
        const conversationId = `conv-${i}`;
        const request = createMockRequest(`Message ${i}`);
        await handler.processRequest(request, conversationId, correlationId);

        const response = createMockResponse(`resp-${i}`);
        await handler.recordConversationTurn(
          conversationId,
          request,
          response,
          1000,
          correlationId
        );
      }

      // Trigger cleanup
      await handler.cleanupConversationHistory();

      const stats = handler.getConversationStats();
      expect(stats.activeConversations).toBeLessThanOrEqual(
        mockConfig.maxConcurrentConversations
      );
    });
  });

  describe('Conversation Statistics', () => {
    it('should provide accurate conversation statistics', async () => {
      const conversationIds = ['conv-1', 'conv-2', 'conv-3'];
      const correlationId = 'corr-123';

      // Create multiple conversations with different history lengths
      for (let i = 0; i < conversationIds.length; i++) {
        const id = conversationIds.at(i);
        if (id !== undefined && id.length > 0) {
          const request = createMockRequest(`Initial message for ${id}`);
          await handler.processRequest(request, id, correlationId);

          // Add different numbers of turns
          for (let j = 1; j <= i + 2; j++) {
            const turnRequest = createMockRequest(`Turn ${j} for ${id}`);
            const response = createMockResponse(`resp-${id}-${j}`);
            await handler.recordConversationTurn(id, turnRequest, response, 1000, correlationId);
          }
        }
      }

      const stats = handler.getConversationStats();
      expect(stats.activeConversations).toBe(3);
      expect(stats.totalHistoryEntries).toBe(2 + 3 + 4); // 9 total entries
      expect(stats.averageHistoryLength).toBe(3); // 9 / 3
      expect(stats.oldestConversation).toBeDefined();
      expect(stats.estimatedMemoryUsage).toBeGreaterThan(0);
    });

    it('should handle empty statistics', () => {
      const stats = handler.getConversationStats();
      expect(stats.activeConversations).toBe(0);
      expect(stats.totalHistoryEntries).toBe(0);
      expect(stats.averageHistoryLength).toBe(0);
      expect(stats.oldestConversation).toBeUndefined();
      expect(stats.estimatedMemoryUsage).toBe(0);
    });
  });

  describe('Maintenance Tasks', () => {
    it('should start and stop maintenance tasks', () => {
      const handlerWithAutoCleanup = new MultiTurnConversationHandlerImpl({
        ...mockConfig,
        enableAutoCleanup: true,
      });

      handlerWithAutoCleanup.startMaintenanceTasks();
      // Should not throw and timer should be running

      handlerWithAutoCleanup.stopMaintenanceTasks();
      // Should not throw and timer should be stopped
    });

    it('should not start maintenance when auto cleanup is disabled', () => {
      handler.startMaintenanceTasks();
      // Should not throw even when auto cleanup is disabled
    });
  });

  describe('Memory Management Under Load', () => {
    it('should handle high volume of conversation turns efficiently', async () => {
      const conversationId = 'high-volume-conv';
      const correlationId = 'corr-123';
      const turnCount = 100;

      // Process initial request
      const initialRequest = createMockRequest('Initial message');
      await handler.processRequest(initialRequest, conversationId, correlationId);

      const startTime = Date.now();

      // Record many turns
      for (let i = 1; i <= turnCount; i++) {
        const request = createMockRequest(`Turn ${i}`);
        const response = createMockResponse(`resp-${i}`);

        await handler.recordConversationTurn(
          conversationId,
          request,
          response,
          1000,
          correlationId
        );
      }

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should process efficiently (less than 2 seconds for 100 turns)
      expect(processingTime).toBeLessThan(2000);

      // History should be limited by configuration
      const history = handler.getConversationHistory(conversationId);
      expect(history.length).toBeLessThanOrEqual(mockConfig.maxHistoryLength);
    });

    it('should handle concurrent conversation processing', async () => {
      const conversationCount = 50;
      const correlationId = 'corr-123';

      const startTime = Date.now();

      // Process multiple conversations concurrently
      const promises = Array.from({ length: conversationCount }, async (_, i) => {
        const conversationId = `concurrent-conv-${i}`;
        const request = createMockRequest(`Message for conversation ${i}`);
        const response = createMockResponse(`resp-${i}`);

        await handler.processRequest(request, conversationId, correlationId);
        await handler.recordConversationTurn(
          conversationId,
          request,
          response,
          1000,
          correlationId
        );
      });

      await Promise.all(promises);

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should handle concurrent processing efficiently
      expect(processingTime).toBeLessThan(1000);

      // Trigger cleanup to enforce limits
      await handler.cleanupConversationHistory();

      const stats = handler.getConversationStats();
      expect(stats.activeConversations).toBeLessThanOrEqual(
        mockConfig.maxConcurrentConversations
      );
    });
  });

  describe('Factory Function', () => {
    it('should create multi-turn conversation handler with default config', () => {
      const handler = createMultiTurnConversationHandler();
      expect(handler).toBeDefined();

      const stats = handler.getConversationStats();
      expect(stats.activeConversations).toBe(0);
    });

    it('should create multi-turn conversation handler with custom config', () => {
      const customConfig = {
        maxHistoryLength: 20,
        maxHistoryAge: 120000,
        enableContextTracking: false,
      };

      const handler = createMultiTurnConversationHandler(customConfig);
      expect(handler).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle processing errors gracefully', async () => {
      const conversationId = 'error-conv';
      const correlationId = 'corr-123';
      const invalidRequest = null as any;

      await expect(
        handler.processRequest(invalidRequest, conversationId, correlationId)
      ).rejects.toThrow('Invalid request object');
    });

    it('should handle recording errors gracefully', async () => {
      const conversationId = 'conv-123';
      const correlationId = 'corr-123';
      const request = createMockRequest('Test message');
      const invalidResponse = null as any;

      // Process initial request
      await handler.processRequest(request, conversationId, correlationId);

      await expect(
        handler.recordConversationTurn(
          conversationId,
          request,
          invalidResponse,
          1000,
          correlationId
        )
      ).rejects.toThrow('Invalid response object');
    });

    it('should handle cleanup errors gracefully', async () => {
      // This test ensures cleanup doesn't throw even with edge cases
      await expect(handler.cleanupConversationHistory()).resolves.not.toThrow();
    });
  });
});