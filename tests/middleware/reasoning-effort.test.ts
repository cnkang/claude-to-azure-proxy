/**
 * Tests for reasoning effort analysis middleware
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  reasoningEffortMiddleware,
  hasReasoningAnalysis,
} from '../../src/middleware/reasoning-effort.js';
import type { ClaudeRequest } from '../../src/types/index.js';

// Mock logger
vi.mock('../../src/middleware/logging.js', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock conversation manager
vi.mock('../../src/utils/conversation-manager.js', () => ({
  conversationManager: {
    extractConversationId: vi.fn(() => 'test-conversation-id'),
    getConversationContext: vi.fn(() => undefined),
    analyzeConversationContext: vi.fn(() => 'simple'),
  },
}));

describe('Reasoning Effort Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
      body: {},
      path: '/v1/completions',
      method: 'POST',
    };
    mockRes = {};
    mockNext = vi.fn();
  });

  describe('Claude Request Analysis', () => {
    it('should analyze simple Claude request', () => {
      const simpleClaudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
        max_tokens: 50,
      };

      mockReq.body = simpleClaudeRequest;
      (mockReq as any).correlationId = 'test-correlation-id';

      reasoningEffortMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).reasoningEffort).toBeUndefined(); // Simple requests may not need reasoning
      expect((mockReq as any).shouldApplyReasoning).toBe(false);
      expect((mockReq as any).conversationComplexity).toBe('simple');
      expect((mockReq as any).complexityFactors).toBeDefined();
      expect((mockReq as any).languageContext).toBeDefined();
      expect(typeof (mockReq as any).reasoningAnalysisTime).toBe('number');
    });

    it('should analyze complex Claude request', () => {
      const complexClaudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Design a microservices architecture for a large-scale e-commerce platform with high availability, scalability, and security requirements. Include database design, API gateway configuration, service mesh implementation, and deployment strategies using Kubernetes. Consider the following requirements:\n\n1. Handle 1M+ concurrent users\n2. 99.99% uptime\n3. Global distribution\n4. Real-time inventory management\n5. Payment processing integration\n6. Advanced analytics and reporting\n\nProvide detailed implementation plans, code examples, and architectural diagrams.',
          },
        ],
        max_tokens: 4000,
      };

      mockReq.body = complexClaudeRequest;
      (mockReq as any).correlationId = 'test-correlation-id';

      reasoningEffortMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).reasoningEffort).toBeDefined();
      expect(['medium', 'high']).toContain((mockReq as any).reasoningEffort);
      expect((mockReq as any).shouldApplyReasoning).toBe(true);
      expect((mockReq as any).complexityFactors.hasArchitecturalKeywords).toBe(
        true
      );
      expect((mockReq as any).complexityFactors.contentLength).toBeGreaterThan(
        500
      );
    });

    it('should analyze TypeScript development request', () => {
      const typescriptRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Create a TypeScript React component with hooks for managing user authentication state. Include proper type definitions, error handling, and integration with a REST API. The component should support login, logout, and automatic token refresh.',
          },
        ],
        max_tokens: 2000,
      };

      mockReq.body = typescriptRequest;
      (mockReq as any).correlationId = 'test-correlation-id';

      reasoningEffortMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).languageContext.primaryLanguage).toBe(
        'typescript'
      );
      expect((mockReq as any).languageContext.frameworks).toContain('react');
      expect((mockReq as any).shouldApplyReasoning).toBe(true);
    });

    it('should analyze Python Django request', () => {
      const djangoRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Create a Django REST API with models.py, views.py, and serializers.py for a blog application. Include user authentication, permissions, and proper database relationships.',
          },
        ],
        max_tokens: 1500,
      };

      mockReq.body = djangoRequest;
      (mockReq as any).correlationId = 'test-correlation-id';

      reasoningEffortMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).languageContext.primaryLanguage).toBe('python');
      expect((mockReq as any).languageContext.frameworks).toContain('django');
      expect(
        (mockReq as any).complexityFactors.hasComplexFrameworkPatterns
      ).toBe(true);
    });

    it('should analyze Android Kotlin request', () => {
      const androidRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Create an Android Kotlin app with Jetpack Compose for a todo list. Include Room database, ViewModel, and proper MVVM architecture.',
          },
        ],
        max_tokens: 2000,
      };

      mockReq.body = androidRequest;
      (mockReq as any).correlationId = 'test-correlation-id';

      reasoningEffortMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).languageContext.primaryLanguage).toBe('kotlin');
      expect((mockReq as any).languageContext.frameworks).toContain(
        'android-sdk'
      );
      expect((mockReq as any).shouldApplyReasoning).toBe(true);
    });
  });

  describe('Non-Claude Request Handling', () => {
    it('should handle OpenAI format requests', () => {
      const openAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
        max_tokens: 100,
      };

      mockReq.body = openAIRequest;
      (mockReq as any).correlationId = 'test-correlation-id';

      reasoningEffortMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).reasoningEffort).toBeUndefined();
      expect((mockReq as any).shouldApplyReasoning).toBe(false);
      expect((mockReq as any).complexityFactors).toBeDefined();
      expect((mockReq as any).languageContext.primaryLanguage).toBe('unknown');
    });

    it('should handle invalid request bodies', () => {
      mockReq.body = null;
      (mockReq as any).correlationId = 'test-correlation-id';

      reasoningEffortMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).reasoningEffort).toBeUndefined();
      expect((mockReq as any).shouldApplyReasoning).toBe(false);
      expect((mockReq as any).complexityFactors).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle analysis errors gracefully', () => {
      // Mock an error in the reasoning analyzer
      const invalidRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: 'invalid-messages', // Invalid format
        max_tokens: 100,
      };

      mockReq.body = invalidRequest;
      (mockReq as any).correlationId = 'test-correlation-id';

      reasoningEffortMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).reasoningEffort).toBeUndefined();
      expect((mockReq as any).shouldApplyReasoning).toBe(false);
      expect((mockReq as any).complexityFactors).toBeDefined();
      expect(typeof (mockReq as any).reasoningAnalysisTime).toBe('number');
    });
  });

  describe('Type Guard', () => {
    it('should correctly identify requests with reasoning analysis', () => {
      const reqWithReasoning = {
        reasoningAnalysisTime: 10,
        shouldApplyReasoning: true,
        conversationComplexity: 'medium',
        complexityFactors: {},
        languageContext: {},
      } as any;

      expect(hasReasoningAnalysis(reqWithReasoning)).toBe(true);
    });

    it('should correctly identify requests without reasoning analysis', () => {
      const reqWithoutReasoning = {} as any;

      expect(hasReasoningAnalysis(reqWithoutReasoning)).toBe(false);
    });
  });

  describe('Performance', () => {
    it('should complete reasoning analysis quickly', () => {
      const mediumRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Write a Python function to sort a list of dictionaries by multiple keys.',
          },
        ],
        max_tokens: 500,
      };

      mockReq.body = mediumRequest;
      (mockReq as any).correlationId = 'test-correlation-id';

      const startTime = Date.now();
      reasoningEffortMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );
      const endTime = Date.now();

      expect(mockNext).toHaveBeenCalled();
      expect(endTime - startTime).toBeLessThan(200); // Should complete in under 200ms
      expect((mockReq as any).reasoningAnalysisTime).toBeLessThan(200);
    });
  });

  describe('Conversation Context Integration', () => {
    it('should integrate with conversation manager', async () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Continue our discussion about microservices.',
          },
        ],
        max_tokens: 1000,
      };

      mockReq.body = claudeRequest;
      mockReq.headers = { 'x-conversation-id': 'test-conversation-123' };
      (mockReq as any).correlationId = 'test-correlation-id';

      reasoningEffortMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).conversationComplexity).toBe('simple'); // Mocked return value

      const { conversationManager } = await import(
        '../../src/utils/conversation-manager.js'
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(conversationManager.extractConversationId).toHaveBeenCalledWith(
        expect.objectContaining({
          'x-conversation-id': 'test-conversation-123',
        }),
        'test-correlation-id'
      );
    });
  });
});
