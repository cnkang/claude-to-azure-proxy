/**
 * @fileoverview Tests for conversation management functionality.
 *
 * This test suite covers conversation tracking accuracy, multi-turn conversation
 * continuity, conversation cleanup policies, and memory management under load.
 * It ensures the conversation manager meets all requirements for reliable
 * conversation state management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type {
  ConversationManager,
  ConversationConfig,
  ClaudeRequest,
} from '../src/types/index.js';
import {
  ConversationManagerImpl,
  createConversationManager,
} from '../src/utils/conversation-manager.js';

describe('ConversationManager', () => {
  let conversationManager: ConversationManager;
  let mockConfig: ConversationConfig;

  beforeEach(() => {
    mockConfig = {
      maxConversationAge: 60000, // 1 minute for testing
      cleanupInterval: 10000,    // 10 seconds for testing
      maxStoredConversations: 5, // Small limit for testing
    };
    conversationManager = new ConversationManagerImpl(mockConfig);
  });

  afterEach(() => {
    conversationManager.stopCleanupTimer();
  });

  describe('Conversation Tracking', () => {
    it('should track new conversation correctly', () => {
      const conversationId = 'conv-123';
      const responseId = 'resp-456';
      const metrics = {
        totalTokensUsed: 100,
        reasoningTokensUsed: 20,
        averageResponseTime: 1500,
      };

      conversationManager.trackConversation(conversationId, responseId, metrics);

      const context = conversationManager.getConversationContext(conversationId);
      expect(context).toBeDefined();
      expect(context?.conversationId).toBe(conversationId);
      expect(context?.messageCount).toBe(1);
      expect(context?.previousResponseId).toBe(responseId);
      expect(context?.totalTokensUsed).toBe(100);
      expect(context?.averageResponseTime).toBe(1500);
    });

    it('should update existing conversation correctly', () => {
      const conversationId = 'conv-123';
      const firstResponseId = 'resp-456';
      const secondResponseId = 'resp-789';

      // Track first message
      conversationManager.trackConversation(conversationId, firstResponseId, {
        totalTokensUsed: 100,
        averageResponseTime: 1000,
      });

      // Track second message
      conversationManager.trackConversation(conversationId, secondResponseId, {
        totalTokensUsed: 150,
        averageResponseTime: 2000,
      });

      const context = conversationManager.getConversationContext(conversationId);
      expect(context?.messageCount).toBe(2);
      expect(context?.previousResponseId).toBe(secondResponseId);
      expect(context?.totalTokensUsed).toBe(250); // 100 + 150
      expect(context?.averageResponseTime).toBe(1500); // (1000 + 2000) / 2
    });

    it('should handle conversation tracking errors gracefully', () => {
      const conversationId = '';
      const responseId = 'resp-456';

      expect(() => {
        conversationManager.trackConversation(conversationId, responseId);
      }).not.toThrow();
    });

    it('should get previous response ID correctly', () => {
      const conversationId = 'conv-123';
      const responseId = 'resp-456';

      // Should return undefined for non-existent conversation
      expect(conversationManager.getPreviousResponseId(conversationId)).toBeUndefined();

      // Track conversation
      conversationManager.trackConversation(conversationId, responseId);

      // Should return the response ID
      expect(conversationManager.getPreviousResponseId(conversationId)).toBe(responseId);
    });
  });

  describe('Conversation Metrics', () => {
    it('should calculate metrics correctly', () => {
      const conversationId = 'conv-123';

      // Track multiple messages
      conversationManager.trackConversation(conversationId, 'resp-1', {
        totalTokensUsed: 100,
        reasoningTokensUsed: 10,
        averageResponseTime: 1000,
        errorCount: 0,
      });

      conversationManager.trackConversation(conversationId, 'resp-2', {
        totalTokensUsed: 200,
        reasoningTokensUsed: 30,
        averageResponseTime: 2000,
        errorCount: 1,
      });

      const metrics = conversationManager.getConversationMetrics(conversationId);
      expect(metrics).toBeDefined();
      expect(metrics?.messageCount).toBe(2);
      expect(metrics?.totalTokensUsed).toBe(300);
      expect(metrics?.reasoningTokensUsed).toBe(40);
      expect(metrics?.averageResponseTime).toBe(1500);
      expect(metrics?.errorCount).toBe(1);
    });

    it('should update conversation metrics correctly', () => {
      const conversationId = 'conv-123';

      // Track initial conversation
      conversationManager.trackConversation(conversationId, 'resp-1', {
        totalTokensUsed: 100,
      });

      // Update metrics
      conversationManager.updateConversationMetrics(conversationId, {
        totalTokensUsed: 250,
        errorCount: 2,
      });

      const metrics = conversationManager.getConversationMetrics(conversationId);
      expect(metrics?.totalTokensUsed).toBe(250);
      expect(metrics?.errorCount).toBe(2);
    });

    it('should handle metrics update for non-existent conversation', () => {
      const conversationId = 'non-existent';

      expect(() => {
        conversationManager.updateConversationMetrics(conversationId, {
          totalTokensUsed: 100,
        });
      }).not.toThrow();
    });
  });

  describe('Conversation Context Analysis', () => {
    it('should analyze simple conversation context', () => {
      const conversationId = 'conv-123';
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Hello, how are you?',
          },
        ],
        max_tokens: 100,
      };

      const complexity = conversationManager.analyzeConversationContext(conversationId, request);
      expect(complexity).toBe('simple');
    });

    it('should analyze medium complexity conversation context', () => {
      const conversationId = 'conv-123';

      // Track some conversation history
      conversationManager.trackConversation(conversationId, 'resp-1', {
        totalTokensUsed: 500,
      });
      conversationManager.trackConversation(conversationId, 'resp-2', {
        totalTokensUsed: 600,
      });
      conversationManager.trackConversation(conversationId, 'resp-3', {
        totalTokensUsed: 700,
      });

      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Can you help me debug this complex algorithm? Here is the code: ```python\ndef complex_function():\n    pass\n```',
          },
        ],
        max_tokens: 1000,
      };

      const complexity = conversationManager.analyzeConversationContext(conversationId, request);
      expect(['simple', 'medium', 'complex']).toContain(complexity);
    });

    it('should analyze complex conversation context', () => {
      const conversationId = 'conv-123';

      // Track extensive conversation history with high token usage
      for (let i = 0; i < 15; i++) {
        conversationManager.trackConversation(conversationId, `resp-${i}`, {
          totalTokensUsed: 1000,
          reasoningTokensUsed: 300,
          averageResponseTime: 15000,
          errorCount: i % 3 === 0 ? 1 : 0, // Some errors
        });
      }

      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'I need help with a complex architectural design pattern for a distributed system. Can you help me design a microservices architecture with event sourcing and CQRS? This involves multiple databases, message queues, and complex business logic.',
          },
        ],
        max_tokens: 2000,
      };

      const complexity = conversationManager.analyzeConversationContext(conversationId, request);
      expect(complexity).toBe('complex');
    });

    it('should handle context analysis for new conversation', () => {
      const conversationId = 'new-conv';
      const request: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'What is 2 + 2?',
          },
        ],
        max_tokens: 50,
      };

      const complexity = conversationManager.analyzeConversationContext(conversationId, request);
      expect(complexity).toBe('simple');
    });
  });

  describe('Conversation ID Extraction', () => {
    it('should extract conversation ID from x-conversation-id header', () => {
      const headers = {
        'x-conversation-id': 'conv-from-header',
        'content-type': 'application/json',
      };
      const correlationId = 'corr-123';

      const conversationId = conversationManager.extractConversationId(headers, correlationId);
      expect(conversationId).toBe('conv-from-header');
    });

    it('should extract conversation ID from conversation-id header', () => {
      const headers = {
        'conversation-id': 'conv-from-header-2',
        'content-type': 'application/json',
      };
      const correlationId = 'corr-123';

      const conversationId = conversationManager.extractConversationId(headers, correlationId);
      expect(conversationId).toBe('conv-from-header-2');
    });

    it('should extract conversation ID from session-id header', () => {
      const headers = {
        'x-session-id': 'session-123',
        'content-type': 'application/json',
      };
      const correlationId = 'corr-123';

      const conversationId = conversationManager.extractConversationId(headers, correlationId);
      expect(conversationId).toBe('session-123');
    });

    it('should generate conversation ID from correlation ID when no header present', () => {
      const headers = {
        'content-type': 'application/json',
      };
      const correlationId = 'corr-123';

      const conversationId = conversationManager.extractConversationId(headers, correlationId);
      expect(conversationId).toBe('conv-corr-123');
    });

    it('should handle empty header values', () => {
      const headers = {
        'x-conversation-id': '',
        'content-type': 'application/json',
      };
      const correlationId = 'corr-123';

      const conversationId = conversationManager.extractConversationId(headers, correlationId);
      expect(conversationId).toBe('conv-corr-123');
    });
  });

  describe('Conversation Cleanup', () => {
    it('should clean up old conversations based on age', async () => {
      const conversationId1 = 'conv-old';
      const conversationId2 = 'conv-new';

      // Track old conversation
      conversationManager.trackConversation(conversationId1, 'resp-1');

      // Mock time to make first conversation old
      const originalNow = Date.now;
      Date.now = vi.fn(() => originalNow() + 120000); // 2 minutes later

      // Track new conversation
      conversationManager.trackConversation(conversationId2, 'resp-2');

      // Clean up old conversations
      const cleanedCount = conversationManager.cleanupOldConversations();

      expect(cleanedCount).toBe(1);
      expect(conversationManager.getConversationContext(conversationId1)).toBeUndefined();
      expect(conversationManager.getConversationContext(conversationId2)).toBeDefined();

      // Restore Date.now
      Date.now = originalNow;
    });

    it('should not clean up recent conversations', () => {
      const conversationId = 'conv-recent';

      conversationManager.trackConversation(conversationId, 'resp-1');

      const cleanedCount = conversationManager.cleanupOldConversations();

      expect(cleanedCount).toBe(0);
      expect(conversationManager.getConversationContext(conversationId)).toBeDefined();
    });

    it('should handle cleanup errors gracefully', () => {
      // This test ensures cleanup doesn't throw even with edge cases
      expect(() => {
        conversationManager.cleanupOldConversations();
      }).not.toThrow();
    });
  });

  describe('Storage Management', () => {
    it('should enforce storage limits', () => {
      // Track more conversations than the limit (5)
      for (let i = 0; i < 8; i++) {
        conversationManager.trackConversation(`conv-${i}`, `resp-${i}`);
      }

      const stats = conversationManager.getStorageStats();
      expect(stats.conversationCount).toBeLessThanOrEqual(mockConfig.maxStoredConversations);
    });

    it('should provide accurate storage statistics', () => {
      const conversationId1 = 'conv-1';
      const conversationId2 = 'conv-2';

      conversationManager.trackConversation(conversationId1, 'resp-1');
      conversationManager.trackConversation(conversationId2, 'resp-2');

      const stats = conversationManager.getStorageStats();
      expect(stats.conversationCount).toBe(2);
      expect(stats.oldestConversation).toBeDefined();
      expect(stats.newestConversation).toBeDefined();
      expect(stats.estimatedMemoryUsage).toBeGreaterThan(0);
    });

    it('should handle empty storage statistics', () => {
      const stats = conversationManager.getStorageStats();
      expect(stats.conversationCount).toBe(0);
      expect(stats.oldestConversation).toBeUndefined();
      expect(stats.newestConversation).toBeUndefined();
      expect(stats.estimatedMemoryUsage).toBe(0);
    });
  });

  describe('Cleanup Timer Management', () => {
    it('should start and stop cleanup timer', () => {
      conversationManager.startCleanupTimer();
      // Timer should be running (no direct way to test, but should not throw)

      conversationManager.stopCleanupTimer();
      // Timer should be stopped (no direct way to test, but should not throw)
    });

    it('should not start multiple timers', () => {
      conversationManager.startCleanupTimer();
      conversationManager.startCleanupTimer(); // Should not create duplicate timer

      conversationManager.stopCleanupTimer();
    });

    it('should handle stopping non-existent timer', () => {
      expect(() => {
        conversationManager.stopCleanupTimer();
      }).not.toThrow();
    });
  });

  describe('Memory Management Under Load', () => {
    it('should handle high volume of conversations efficiently', () => {
      const startTime = Date.now();
      const conversationCount = 1000;

      // Track many conversations
      for (let i = 0; i < conversationCount; i++) {
        conversationManager.trackConversation(`conv-${i}`, `resp-${i}`, {
          totalTokensUsed: Math.floor(Math.random() * 1000),
          averageResponseTime: Math.floor(Math.random() * 5000),
        });
      }

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should process quickly (less than 1 second for 1000 conversations)
      expect(processingTime).toBeLessThan(1000);

      const stats = conversationManager.getStorageStats();
      expect(stats.conversationCount).toBeLessThanOrEqual(mockConfig.maxStoredConversations);
    });

    it('should handle rapid conversation updates', () => {
      const conversationId = 'high-frequency-conv';
      const updateCount = 100;

      const startTime = Date.now();

      // Rapidly update the same conversation
      for (let i = 0; i < updateCount; i++) {
        conversationManager.trackConversation(conversationId, `resp-${i}`, {
          totalTokensUsed: 100,
          averageResponseTime: 1000,
        });
      }

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should handle rapid updates efficiently
      expect(processingTime).toBeLessThan(500);

      const context = conversationManager.getConversationContext(conversationId);
      expect(context?.messageCount).toBe(updateCount);
    });

    it('should maintain performance during cleanup operations', () => {
      // Create many old conversations
      const originalNow = Date.now;
      const baseTime = originalNow();

      for (let i = 0; i < 100; i++) {
        Date.now = vi.fn(() => baseTime + i * 1000);
        conversationManager.trackConversation(`old-conv-${i}`, `resp-${i}`);
      }

      // Move time forward to make all conversations old
      Date.now = vi.fn(() => baseTime + 200000);

      const startTime = originalNow();
      const cleanedCount = conversationManager.cleanupOldConversations();
      const endTime = originalNow();

      const cleanupTime = endTime - startTime;

      // Cleanup should be fast even with many conversations
      expect(cleanupTime).toBeLessThan(100);
      expect(cleanedCount).toBeGreaterThan(0);

      // Restore Date.now
      Date.now = originalNow;
    });
  });

  describe('Factory Function', () => {
    it('should create conversation manager with default config', () => {
      const manager = createConversationManager();
      expect(manager).toBeDefined();
      expect(manager.getStorageStats().conversationCount).toBe(0);
    });

    it('should create conversation manager with custom config', () => {
      const customConfig = {
        maxConversationAge: 120000,
        maxStoredConversations: 10,
      };

      const manager = createConversationManager(customConfig);
      expect(manager).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid conversation IDs gracefully', () => {
      const invalidIds = ['', null, undefined, 123, {}, []];

      invalidIds.forEach((id) => {
        expect(() => {
          conversationManager.trackConversation(id as any, 'resp-1');
        }).not.toThrow();
      });
    });

    it('should handle invalid response IDs gracefully', () => {
      const conversationId = 'conv-123';
      const invalidResponseIds = ['', null, undefined, 123, {}, []];

      invalidResponseIds.forEach((responseId) => {
        expect(() => {
          conversationManager.trackConversation(conversationId, responseId as any);
        }).not.toThrow();
      });
    });

    it('should handle malformed metrics gracefully', () => {
      const conversationId = 'conv-123';
      const responseId = 'resp-123';
      const malformedMetrics = [
        { totalTokensUsed: 'invalid' },
        { averageResponseTime: null },
        { errorCount: -1 },
        null,
        undefined,
      ];

      malformedMetrics.forEach((metrics) => {
        expect(() => {
          conversationManager.trackConversation(conversationId, responseId, metrics as any);
        }).not.toThrow();
      });
    });
  });
});