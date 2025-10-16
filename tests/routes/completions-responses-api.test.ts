/**
 * Integration tests for completions route with Responses API
 * Tests complete request-response cycles, format detection, streaming, and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { 
  ServerConfig,
  ResponsesResponse,
  ResponsesStreamChunk,
  ClaudeRequest,
  OpenAIRequest,
} from '../../src/types/index.js';
import { completionsHandler } from '../../src/routes/completions.js';
import { 
  correlationIdMiddleware,
  requestLoggingMiddleware,
} from '../../src/middleware/index.js';
import { AzureResponsesClient } from '../../src/clients/azure-responses-client.js';

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

describe('Completions Route - Responses API Integration', () => {
  let app: express.Application;
  let mockConfig: ServerConfig;
  let mockResponsesClient: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock config
    mockConfig = {
      azureOpenAI: {
        baseURL: 'https://test-resource.openai.azure.com/openai/v1/',
        apiKey: 'test-api-key',
        apiVersion: '2025-04-01-preview',
        deployment: 'gpt-5-codex',
        timeout: 30000,
        maxRetries: 3,
      },
    };

    // Create mock responses client
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

    MockedAzureResponsesClient.mockImplementation(() => mockResponsesClient);

    // Create Express app with middleware
    app = express();
    app.use(express.json());
    app.use(correlationIdMiddleware);
    app.use(requestLoggingMiddleware);
    
    // Skip authentication for tests
    app.use((req, res, next) => {
      (req as any).correlationId = 'test-correlation-id';
      next();
    });

    app.post('/v1/completions', completionsHandler(mockConfig));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Claude Format Requests', () => {
    const claudeRequest: ClaudeRequest = {
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        {
          role: 'user',
          content: 'Write a TypeScript function to calculate factorial',
        },
      ],
      max_tokens: 1000,
      temperature: 0.7,
    };

    const mockResponsesAPIResponse: ResponsesResponse = {
      id: 'resp_test123',
      object: 'response',
      created: Date.now(),
      model: 'gpt-5-codex',
      output: [
        {
          type: 'text',
          text: 'Here is a TypeScript function to calculate factorial:\n\n```typescript\nfunction factorial(n: number): number {\n  if (n <= 1) return 1;\n  return n * factorial(n - 1);\n}\n```',
        },
      ],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 50,
        total_tokens: 70,
        reasoning_tokens: 10,
      },
    };

    it('should handle Claude format request successfully', async () => {
      mockResponsesClient.createResponse.mockResolvedValue(mockResponsesAPIResponse);

      const response = await request(app)
        .post('/v1/completions')
        .send(claudeRequest)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('type', 'message');
      expect(response.body).toHaveProperty('role', 'assistant');
      expect(response.body).toHaveProperty('content');
      expect(response.body.content).toBeInstanceOf(Array);
      expect(response.body.content[0]).toHaveProperty('type', 'text');
      expect(response.body.content[0]).toHaveProperty('text');

      // Verify Azure Responses API was called with correct parameters
      expect(mockResponsesClient.createResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          model: mockConfig.azureOpenAI!.deployment,
          input: expect.any(Array),
          max_output_tokens: claudeRequest.max_tokens,
          temperature: claudeRequest.temperature,
          reasoning: expect.objectContaining({
            effort: expect.any(String),
          }),
        })
      );
    });

    it('should handle Claude format with system message', async () => {
      const claudeRequestWithSystem: ClaudeRequest = {
        ...claudeRequest,
        system: 'You are a helpful TypeScript expert.',
      };

      mockResponsesClient.createResponse.mockResolvedValue(mockResponsesAPIResponse);

      const response = await request(app)
        .post('/v1/completions')
        .send(claudeRequestWithSystem)
        .expect(200);

      expect(response.body).toHaveProperty('type', 'message');
      expect(mockResponsesClient.createResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.arrayContaining([
            expect.objectContaining({
              role: 'system',
              content: 'You are a helpful TypeScript expert.',
            }),
          ]),
        })
      );
    });

    it('should handle Claude format with content blocks', async () => {
      const claudeRequestWithBlocks: ClaudeRequest = {
        ...claudeRequest,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Write a TypeScript function to calculate factorial',
              },
            ],
          },
        ],
      };

      mockResponsesClient.createResponse.mockResolvedValue(mockResponsesAPIResponse);

      const response = await request(app)
        .post('/v1/completions')
        .send(claudeRequestWithBlocks)
        .expect(200);

      expect(response.body).toHaveProperty('type', 'message');
      expect(mockResponsesClient.createResponse).toHaveBeenCalled();
    });
  });

  describe('OpenAI Format Requests', () => {
    const openAIRequest: OpenAIRequest = {
      model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: 'Write a TypeScript function to calculate factorial',
        },
      ],
      max_tokens: 1000,
      temperature: 0.7,
    };

    const mockResponsesAPIResponse: ResponsesResponse = {
      id: 'resp_test123',
      object: 'response',
      created: Date.now(),
      model: 'gpt-5-codex',
      output: [
        {
          type: 'text',
          text: 'Here is a TypeScript function to calculate factorial:\n\n```typescript\nfunction factorial(n: number): number {\n  if (n <= 1) return 1;\n  return n * factorial(n - 1);\n}\n```',
        },
      ],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 50,
        total_tokens: 70,
        reasoning_tokens: 10,
      },
    };

    it('should handle OpenAI format request successfully', async () => {
      mockResponsesClient.createResponse.mockResolvedValue(mockResponsesAPIResponse);

      const response = await request(app)
        .post('/v1/completions')
        .send(openAIRequest)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('object', 'chat.completion');
      expect(response.body).toHaveProperty('choices');
      expect(response.body.choices).toBeInstanceOf(Array);
      expect(response.body.choices[0]).toHaveProperty('message');
      expect(response.body.choices[0].message).toHaveProperty('role', 'assistant');
      expect(response.body.choices[0].message).toHaveProperty('content');

      // Verify Azure Responses API was called
      expect(mockResponsesClient.createResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          model: mockConfig.azureOpenAI!.deployment,
          input: expect.any(Array),
          max_output_tokens: openAIRequest.max_tokens,
          temperature: openAIRequest.temperature,
        })
      );
    });

    it('should handle OpenAI format with max_completion_tokens', async () => {
      const openAIRequestWithMaxCompletionTokens = {
        ...openAIRequest,
        max_completion_tokens: 1500,
      };
      delete (openAIRequestWithMaxCompletionTokens as any).max_tokens;

      mockResponsesClient.createResponse.mockResolvedValue(mockResponsesAPIResponse);

      const response = await request(app)
        .post('/v1/completions')
        .send(openAIRequestWithMaxCompletionTokens)
        .expect(200);

      expect(response.body).toHaveProperty('object', 'chat.completion');
      expect(mockResponsesClient.createResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          max_output_tokens: 1500,
        })
      );
    });
  });

  describe('Streaming Requests', () => {
    const claudeStreamingRequest: ClaudeRequest = {
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        {
          role: 'user',
          content: 'Write a simple hello world function',
        },
      ],
      max_tokens: 500,
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
            type: 'text',
            text: 'Here is a simple hello world function:\n\n```typescript\n',
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
            text: 'function helloWorld(): void {\n  console.log("Hello, World!");\n}\n```',
          },
        ],
      },
    ];

    it('should handle Claude streaming request', async () => {
      // Mock async generator for streaming
      async function* mockStreamGenerator() {
        for (const chunk of mockStreamChunks) {
          yield chunk;
        }
      }

      mockResponsesClient.createResponseStream.mockReturnValue(mockStreamGenerator());

      const response = await request(app)
        .post('/v1/completions')
        .send(claudeStreamingRequest)
        .expect(200);

      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.headers['connection']).toBe('keep-alive');

      // Verify streaming was called
      expect(mockResponsesClient.createResponseStream).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: true,
        })
      );
    });

    it('should handle OpenAI streaming request', async () => {
      const openAIStreamingRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Write a simple hello world function',
          },
        ],
        max_tokens: 500,
        stream: true,
      };

      async function* mockStreamGenerator() {
        for (const chunk of mockStreamChunks) {
          yield chunk;
        }
      }

      mockResponsesClient.createResponseStream.mockReturnValue(mockStreamGenerator());

      const response = await request(app)
        .post('/v1/completions')
        .send(openAIStreamingRequest)
        .expect(200);

      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(mockResponsesClient.createResponseStream).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    const claudeRequest: ClaudeRequest = {
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        {
          role: 'user',
          content: 'Test request',
        },
      ],
      max_tokens: 100,
    };

    it('should handle Azure Responses API errors', async () => {
      const azureError = new Error('Azure API Error');
      (azureError as any).response = {
        status: 400,
        data: {
          error: {
            type: 'invalid_request_error',
            message: 'Invalid request parameters',
          },
        },
      };

      mockResponsesClient.createResponse.mockRejectedValue(azureError);

      const response = await request(app)
        .post('/v1/completions')
        .send(claudeRequest)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('type');
      expect(response.body.error).toHaveProperty('message');
    });

    it('should handle validation errors', async () => {
      const invalidRequest = {
        model: '', // Invalid empty model
        messages: [],
        max_tokens: -1, // Invalid negative tokens
      };

      const response = await request(app)
        .post('/v1/completions')
        .send(invalidRequest)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.type).toBe('invalid_request_error');
    });

    it('should handle missing Azure OpenAI configuration', async () => {
      const appWithoutConfig = express();
      appWithoutConfig.use(express.json());
      appWithoutConfig.use(correlationIdMiddleware);
      appWithoutConfig.use((req, res, next) => {
        (req as any).correlationId = 'test-correlation-id';
        next();
      });

      // Config without Azure OpenAI
      const invalidConfig: ServerConfig = {};
      appWithoutConfig.post('/v1/completions', completionsHandler(invalidConfig));

      const response = await request(appWithoutConfig)
        .post('/v1/completions')
        .send(claudeRequest)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.message).toContain('configuration is missing');
    });

    it('should handle streaming errors', async () => {
      const streamingRequest: ClaudeRequest = {
        ...claudeRequest,
        stream: true,
      };

      const streamError = new Error('Streaming failed');
      mockResponsesClient.createResponseStream.mockRejectedValue(streamError);

      const response = await request(app)
        .post('/v1/completions')
        .send(streamingRequest)
        .expect(200); // Streaming starts with 200, errors are sent as events

      expect(response.headers['content-type']).toBe('text/event-stream');
    });
  });

  describe('Format Detection and Routing', () => {
    it('should detect Claude format correctly', async () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        system: 'You are a helpful assistant',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Hello',
              },
            ],
          },
        ],
        max_tokens: 100,
      };

      const mockResponse: ResponsesResponse = {
        id: 'resp_test123',
        object: 'response',
        created: Date.now(),
        model: 'gpt-5-codex',
        output: [{ type: 'text', text: 'Hello!' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };

      mockResponsesClient.createResponse.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/v1/completions')
        .send(claudeRequest)
        .expect(200);

      // Should return Claude format
      expect(response.body).toHaveProperty('type', 'message');
      expect(response.body).toHaveProperty('role', 'assistant');
    });

    it('should detect OpenAI format correctly', async () => {
      const openAIRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
        max_completion_tokens: 100,
      };

      const mockResponse: ResponsesResponse = {
        id: 'resp_test123',
        object: 'response',
        created: Date.now(),
        model: 'gpt-5-codex',
        output: [{ type: 'text', text: 'Hello!' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };

      mockResponsesClient.createResponse.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/v1/completions')
        .send(openAIRequest)
        .expect(200);

      // Should return OpenAI format
      expect(response.body).toHaveProperty('object', 'chat.completion');
      expect(response.body).toHaveProperty('choices');
    });
  });

  describe('Reasoning Effort Analysis', () => {
    it('should apply reasoning effort for complex requests', async () => {
      const complexRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Design a microservices architecture for a large-scale e-commerce platform with high availability, scalability, and security requirements. Include database design, API gateway configuration, service mesh implementation, and deployment strategies using Kubernetes.',
          },
        ],
        max_tokens: 2000,
      };

      const mockResponse: ResponsesResponse = {
        id: 'resp_test123',
        object: 'response',
        created: Date.now(),
        model: 'gpt-5-codex',
        output: [{ type: 'text', text: 'Complex architecture response...' }],
        usage: { 
          prompt_tokens: 100, 
          completion_tokens: 500, 
          total_tokens: 600,
          reasoning_tokens: 200,
        },
      };

      mockResponsesClient.createResponse.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/v1/completions')
        .send(complexRequest)
        .expect(200);

      expect(response.body).toHaveProperty('type', 'message');

      // Verify reasoning effort was applied
      expect(mockResponsesClient.createResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          reasoning: expect.objectContaining({
            effort: expect.stringMatching(/^(medium|high)$/),
          }),
        })
      );
    });

    it('should skip reasoning for simple requests', async () => {
      const simpleRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
        max_tokens: 50,
      };

      const mockResponse: ResponsesResponse = {
        id: 'resp_test123',
        object: 'response',
        created: Date.now(),
        model: 'gpt-5-codex',
        output: [{ type: 'text', text: 'Hello!' }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      };

      mockResponsesClient.createResponse.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/v1/completions')
        .send(simpleRequest)
        .expect(200);

      expect(response.body).toHaveProperty('type', 'message');

      // Verify minimal or no reasoning was applied
      expect(mockResponsesClient.createResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          reasoning: expect.objectContaining({
            effort: expect.stringMatching(/^(minimal|low)$/),
          }),
        })
      );
    });
  });

  describe('Conversation Context Tracking', () => {
    it('should track conversation context', async () => {
      const conversationRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'What is TypeScript?',
          },
        ],
        max_tokens: 200,
      };

      const mockResponse: ResponsesResponse = {
        id: 'resp_test123',
        object: 'response',
        created: Date.now(),
        model: 'gpt-5-codex',
        output: [{ type: 'text', text: 'TypeScript is a programming language...' }],
        usage: { prompt_tokens: 20, completion_tokens: 50, total_tokens: 70 },
      };

      mockResponsesClient.createResponse.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/v1/completions')
        .set('x-conversation-id', 'test-conversation-123')
        .send(conversationRequest)
        .expect(200);

      expect(response.body).toHaveProperty('type', 'message');

      // Verify conversation was tracked
      const { conversationManager } = await import('../../src/utils/conversation-manager.js');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(conversationManager.trackConversation).toHaveBeenCalledWith(
        'test-conversation-123',
        'resp_test123',
        expect.objectContaining({
          totalTokensUsed: 70,
          reasoningTokensUsed: 0,
        })
      );
    });
  });
});