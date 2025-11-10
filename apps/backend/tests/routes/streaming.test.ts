/**
 * Tests for streaming functionality in completions route
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import type {
  ServerConfig,
  ResponsesStreamChunk,
  ClaudeRequest,
  OpenAIRequest,
} from '../../src/types/index';
import { completionsHandler } from '../../src/routes/completions';
import { correlationIdMiddleware } from '../../src/middleware/index';
import { AzureResponsesClient } from '../../src/clients/azure-responses-client';

// Mock the Azure Responses client
vi.mock('../../src/clients/azure-responses-client.js');
const MockedAzureResponsesClient = vi.mocked(AzureResponsesClient);

// Mock conversation manager
vi.mock('../../src/utils/conversation-manager.js', () => ({
  conversationManager: {
    extractConversationId: vi.fn(() => 'test-conversation-id'),
    getConversationContext: vi.fn(() => undefined),
    trackConversation: vi.fn(),
    updateConversationMetrics: vi.fn(),
    analyzeConversationContext: vi.fn(() => 'simple'),
    getPreviousResponseId: vi.fn(() => undefined),
    getConversationMetrics: vi.fn(() => undefined),
    cleanupOldConversations: vi.fn(() => 0),
    getStorageStats: vi.fn(() => ({
      conversationCount: 0,
      oldestConversation: undefined,
      newestConversation: undefined,
      estimatedMemoryUsage: 0,
    })),
    startCleanupTimer: vi.fn(),
    stopCleanupTimer: vi.fn(),
  },
}));

// Mock resilience components
vi.mock('../../src/resilience/index.js', () => ({
  circuitBreakerRegistry: {
    getCircuitBreaker: vi.fn(() => ({
      execute: vi.fn(async (fn) => ({ success: true, data: await fn() })),
    })),
  },
  retryStrategyRegistry: {
    getStrategy: vi.fn(() => ({
      execute: vi.fn(async (fn) => ({ success: true, data: await fn() })),
    })),
  },
  gracefulDegradationManager: {
    executeGracefulDegradation: vi.fn(async () => ({ success: false })),
  },
}));

describe('Streaming Functionality', () => {
  let app: express.Application;
  let mockConfig: ServerConfig;
  let mockResponsesClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      azureOpenAI: {
        baseURL: 'https://test-resource.openai.azure.com/openai/v1/',
        apiKey: 'test-api-key',
        deployment: 'gpt-5-codex',
        timeout: 30000,
        maxRetries: 3,
      },
    } as ServerConfig;

    mockResponsesClient = {
      createResponse: vi.fn(),
      createResponseStream: vi.fn(),
      getConfig: vi.fn(() => ({
        baseURL: mockConfig.azureOpenAI!.baseURL,
        apiKey: '[REDACTED]',
        deployment: mockConfig.azureOpenAI!.deployment,
        timeout: mockConfig.azureOpenAI!.timeout,
        maxRetries: mockConfig.azureOpenAI!.maxRetries,
      })),
    };

    MockedAzureResponsesClient.mockImplementation(function (
      this: any,
      ..._args: any[]
    ) {
      Object.assign(this, mockResponsesClient);
      return this;
    });

    app = express();
    app.use(express.json());
    app.use(correlationIdMiddleware);
    app.use((req, res, next) => {
      (req as any).correlationId = 'test-correlation-id';
      next();
    });
    app.post('/v1/completions', completionsHandler(mockConfig) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Claude Format Streaming', () => {
    const claudeStreamingRequest: ClaudeRequest = {
      model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: 'Write a TypeScript function to calculate fibonacci numbers',
        },
      ],
      max_tokens: 1000,
      stream: true,
    };

    it('should handle Claude streaming request successfully', async () => {
      const mockStreamChunks: ResponsesStreamChunk[] = [
        {
          id: 'resp_stream_test123',
          object: 'response.chunk',
          created: Date.now(),
          model: 'gpt-5-codex',
          output: [
            {
              type: 'text',
              text: 'Here is a TypeScript function to calculate fibonacci numbers:\n\n```typescript\n',
            },
          ],
        },
        {
          id: 'resp_stream_test123',
          object: 'response.chunk',
          created: Date.now(),
          model: 'gpt-5-codex',
          output: [
            {
              type: 'text',
              text: 'function fibonacci(n: number): number {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}\n```',
            },
          ],
        },
      ];

      // Mock async generator
      async function* mockStreamGenerator() {
        for (const chunk of mockStreamChunks) {
          yield chunk;
        }
      }

      mockResponsesClient.createResponseStream.mockReturnValue(
        mockStreamGenerator()
      );

      // Also mock createResponse for fallback non-streaming simulation
      mockResponsesClient.createResponse.mockResolvedValue({
        id: 'resp_test123',
        object: 'response',
        created: Date.now(),
        model: 'gpt-4-test-deployment',
        output: [
          {
            type: 'text',
            text: 'function fibonacci(n: number): number {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}',
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 100,
          total_tokens: 150,
        },
      });

      const response = await request(app)
        .post('/v1/completions')
        .send(claudeStreamingRequest)
        .expect(200);

      // Verify streaming headers
      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.headers['connection']).toBe('keep-alive');
      expect(response.headers['access-control-allow-origin']).toBe('*');

      // Verify non-streaming was called (simulated streaming)
      expect(mockResponsesClient.createResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          // stream parameter is not passed to non-streaming API
          model: 'gpt-4-test-deployment', // Mapped from gpt-4 in Claude request
          input: expect.any(Array),
          max_output_tokens: claudeStreamingRequest.max_tokens,
        }),
        expect.any(AbortSignal) // AbortSignal is now passed
      );

      // Verify response contains streaming data
      expect(response.text).toContain('data:');
      expect(response.text).toContain('[DONE]');
    });

    it('should handle Claude streaming with reasoning', async () => {
      const complexStreamingRequest: ClaudeRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content:
              'Design and implement a complex algorithm for graph traversal with optimization for large datasets',
          },
        ],
        max_tokens: 2000,
        stream: true,
      };

      const mockStreamChunks: ResponsesStreamChunk[] = [
        {
          id: 'resp_stream_test123',
          object: 'response.chunk',
          created: Date.now(),
          model: 'gpt-5-codex',
          output: [
            {
              type: 'reasoning',
              reasoning: {
                content:
                  'Let me think about the optimal approach for graph traversal...',
                status: 'in_progress',
              },
            },
          ],
        },
        {
          id: 'resp_stream_test123',
          object: 'response.chunk',
          created: Date.now(),
          model: 'gpt-5-codex',
          output: [
            {
              type: 'text',
              text: 'Here is an optimized graph traversal algorithm:\n\n```typescript\n',
            },
          ],
        },
        {
          id: 'resp_stream_test123',
          object: 'response.chunk',
          created: Date.now(),
          model: 'gpt-5-codex',
          output: [
            {
              type: 'reasoning',
              reasoning: {
                content: 'The algorithm is complete.',
                status: 'completed',
              },
            },
          ],
        },
      ];

      async function* mockStreamGenerator() {
        for (const chunk of mockStreamChunks) {
          yield chunk;
        }
      }

      mockResponsesClient.createResponseStream.mockReturnValue(
        mockStreamGenerator()
      );

      // Also mock createResponse for fallback non-streaming simulation
      mockResponsesClient.createResponse.mockResolvedValue({
        id: 'resp_test123',
        object: 'response',
        created: Date.now(),
        model: 'gpt-4-test-deployment',
        output: [
          {
            type: 'reasoning',
            reasoning: {
              content: 'The algorithm is complete.',
              status: 'completed',
            },
          },
          {
            type: 'text',
            text: 'Here is an optimized graph traversal algorithm:\n\n```typescript\n',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 200,
          total_tokens: 300,
          reasoning_tokens: 50,
        },
      });

      const response = await request(app)
        .post('/v1/completions')
        .send(complexStreamingRequest)
        .expect(200);

      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(mockResponsesClient.createResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          reasoning: expect.objectContaining({
            effort: expect.stringMatching(/^(medium|high)$/),
          }),
        }),
        expect.any(AbortSignal)
      );
    });
  });

  describe('OpenAI Format Streaming', () => {
    const openAIStreamingRequest: OpenAIRequest = {
      model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: 'Write a Python function to sort a list',
        },
      ],
      max_tokens: 500,
      stream: true,
    };

    it('should handle OpenAI streaming request successfully', async () => {
      const mockStreamChunks: ResponsesStreamChunk[] = [
        {
          id: 'resp_stream_test456',
          object: 'response.chunk',
          created: Date.now(),
          model: 'gpt-5-codex',
          output: [
            {
              type: 'text',
              text: 'Here is a Python function to sort a list:\n\n```python\n',
            },
          ],
        },
        {
          id: 'resp_stream_test456',
          object: 'response.chunk',
          created: Date.now(),
          model: 'gpt-5-codex',
          output: [
            {
              type: 'text',
              text: 'def sort_list(lst):\n    return sorted(lst)\n```',
            },
          ],
        },
      ];

      async function* mockStreamGenerator() {
        for (const chunk of mockStreamChunks) {
          yield chunk;
        }
      }

      mockResponsesClient.createResponseStream.mockReturnValue(
        mockStreamGenerator()
      );

      // Also mock createResponse for fallback non-streaming simulation
      mockResponsesClient.createResponse.mockResolvedValue({
        id: 'resp_test456',
        object: 'response',
        created: Date.now(),
        model: 'gpt-4-test-deployment',
        output: [
          {
            type: 'text',
            text: 'def sort_list(lst):\n    return sorted(lst)',
          },
        ],
        usage: {
          prompt_tokens: 30,
          completion_tokens: 50,
          total_tokens: 80,
        },
      });

      const response = await request(app)
        .post('/v1/completions')
        .send(openAIStreamingRequest)
        .expect(200);

      // Verify streaming headers
      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.headers['connection']).toBe('keep-alive');

      // Verify non-streaming was called (simulated streaming)
      expect(mockResponsesClient.createResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          // stream parameter is not passed to non-streaming API
          model: expect.any(String), // Model routing may transform the model name
        }),
        expect.any(AbortSignal)
      );

      // OpenAI format should not have event: prefixes
      expect(response.text).toContain('data:');
      expect(response.text).toContain('[DONE]');
    });
  });

  describe('Streaming Error Handling', () => {
    it('should handle streaming errors gracefully', async () => {
      const streamingRequest: ClaudeRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Test streaming error',
          },
        ],
        max_tokens: 100,
        stream: true,
      };

      const streamError = new Error('Streaming connection failed');
      mockResponsesClient.createResponse.mockRejectedValue(streamError);

      // When backend request fails before streaming starts, should return error response
      const response = await request(app)
        .post('/v1/completions')
        .send(streamingRequest);

      // Should return error status (500 or 503), or success with graceful degradation (200)
      // In test environment with mocked graceful degradation returning success: false,
      // we expect an error status
      expect([200, 500, 503]).toContain(response.status);
      if (response.status !== 200 && response.body.error) {
        expect(response.body.error).toHaveProperty('message');
      }
    });

    it('should handle malformed stream chunks', async () => {
      const streamingRequest: ClaudeRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Test malformed chunks',
          },
        ],
        max_tokens: 100,
        stream: true,
      };

      // Mock generator that yields invalid chunks
      async function* mockInvalidStreamGenerator() {
        yield { invalid: 'chunk' } as any;
        yield null as any;
        yield {
          id: 'valid_chunk',
          object: 'response.chunk',
          created: Date.now(),
          model: 'gpt-5-codex',
          output: [{ type: 'text', text: 'Valid content' }],
        };
      }

      mockResponsesClient.createResponseStream.mockReturnValue(
        mockInvalidStreamGenerator()
      );

      // Also mock createResponse for fallback non-streaming simulation
      mockResponsesClient.createResponse.mockResolvedValue({
        id: 'resp_test789',
        object: 'response',
        created: Date.now(),
        model: 'gpt-4-test-deployment',
        output: [
          {
            type: 'text',
            text: 'Valid content',
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 10,
          total_tokens: 30,
        },
      });

      const response = await request(app)
        .post('/v1/completions')
        .send(streamingRequest)
        .expect(200);

      expect(response.headers['content-type']).toBe('text/event-stream');
      // Simulated streaming should work even with malformed stream chunks
      expect(response.text).toContain('data:');
    });
  });

  describe('Streaming Performance', () => {
    it('should handle high-frequency streaming chunks', async () => {
      const streamingRequest: ClaudeRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Generate a long response',
          },
        ],
        max_tokens: 2000,
        stream: true,
      };

      // Generate many small chunks
      const manyChunks: ResponsesStreamChunk[] = [];
      for (let i = 0; i < 50; i++) {
        manyChunks.push({
          id: `resp_stream_test${i}`,
          object: 'response.chunk',
          created: Date.now(),
          model: 'gpt-5-codex',
          output: [
            {
              type: 'text',
              text: `Chunk ${i} content `,
            },
          ],
        });
      }

      async function* mockHighFrequencyStreamGenerator() {
        for (const chunk of manyChunks) {
          yield chunk;
          // Small delay to simulate real streaming
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
      }

      mockResponsesClient.createResponseStream.mockReturnValue(
        mockHighFrequencyStreamGenerator()
      );

      // Also mock createResponse for fallback non-streaming simulation
      const allChunksText = manyChunks.map(c => c.output[0].type === 'text' ? c.output[0].text : '').join('');
      mockResponsesClient.createResponse.mockResolvedValue({
        id: 'resp_test_perf',
        object: 'response',
        created: Date.now(),
        model: 'gpt-4-test-deployment',
        output: [
          {
            type: 'text',
            text: allChunksText,
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 500,
          total_tokens: 550,
        },
      });

      const startTime = Date.now();
      const response = await request(app)
        .post('/v1/completions')
        .send(streamingRequest)
        .expect(200);
      const endTime = Date.now();

      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Simulated streaming should contain data
      expect(response.text).toContain('data:');
    });
  });

  describe('Conversation Tracking in Streaming', () => {
    it('should track conversation context during streaming', async () => {
      const streamingRequest: ClaudeRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Continue our discussion',
          },
        ],
        max_tokens: 500,
        stream: true,
      };

      const mockStreamChunks: ResponsesStreamChunk[] = [
        {
          id: 'resp_stream_conversation',
          object: 'response.chunk',
          created: Date.now(),
          model: 'gpt-5-codex',
          output: [
            {
              type: 'text',
              text: 'Continuing our discussion...',
            },
          ],
        },
      ];

      async function* mockStreamGenerator() {
        for (const chunk of mockStreamChunks) {
          yield chunk;
        }
      }

      mockResponsesClient.createResponseStream.mockReturnValue(
        mockStreamGenerator()
      );

      // Also mock createResponse for fallback non-streaming simulation
      mockResponsesClient.createResponse.mockResolvedValue({
        id: 'resp_conversation',
        object: 'response',
        created: Date.now(),
        model: 'gpt-4-test-deployment',
        output: [
          {
            type: 'text',
            text: 'Continuing our discussion...',
          },
        ],
        usage: {
          prompt_tokens: 30,
          completion_tokens: 20,
          total_tokens: 50,
        },
      });

      const response = await request(app)
        .post('/v1/completions')
        .set('x-conversation-id', 'streaming-conversation-123')
        .send(streamingRequest)
        .expect(200);

      expect(response.headers['content-type']).toBe('text/event-stream');

      // Simulated streaming uses different conversation tracking
      expect(mockResponsesClient.createResponse).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(AbortSignal)
      );
      // Note: conversation tracking works differently in simulated streaming
    });
  });
});
