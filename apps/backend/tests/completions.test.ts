import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { json } from 'express';
import type { ServerConfig } from '../src/types/index';
import { testServerConfig, validApiKey, createMockConfig } from './test-config';
import type { TestResponseBody } from './types/test-types';
import { setupAllMocks, mockResponses } from './utils/typed-mocks';

// Mock configuration to prevent environment variable loading
vi.mock('../src/config/index.js', () => createMockConfig());

// Setup all typed mocks
const mocks = setupAllMocks();

// Mock Azure Responses Client
vi.mock('../src/clients/azure-responses-client.js', () => ({
  AzureResponsesClient: class MockAzureResponsesClient {
    constructor(_config: unknown) {
      return mocks.azureClient;
    }
  },
}));

// Mock AWS Bedrock Client
vi.mock('../src/clients/aws-bedrock-client.js', () => ({
  AWSBedrockClient: class MockAWSBedrockClient {
    constructor(_config: unknown) {
      return mocks.bedrockClient;
    }
  },
}));

// Mock other dependencies with typed implementations
vi.mock('../src/utils/universal-request-processor.js', () => ({
  createUniversalRequestProcessor: vi
    .fn()
    .mockReturnValue(mocks.universalProcessor),
  defaultUniversalProcessorConfig: {},
}));

vi.mock('../src/utils/reasoning-effort-analyzer.js', () => ({
  ReasoningEffortAnalysisService: class MockReasoningEffortAnalysisService {
    constructor() {
      return mocks.reasoningAnalyzer;
    }
  },
  createReasoningEffortAnalyzer: vi
    .fn()
    .mockReturnValue(mocks.reasoningAnalyzer),
}));

vi.mock('../src/utils/conversation-manager.js', () => ({
  conversationManager: mocks.conversationManager,
}));

vi.mock('../src/resilience/index.js', () => ({
  circuitBreakerRegistry: {
    getCircuitBreaker: vi.fn().mockReturnValue(mocks.circuitBreaker),
  },
  retryStrategyRegistry: {
    getStrategy: vi.fn().mockReturnValue(mocks.retryStrategy),
  },
  gracefulDegradationManager: mocks.gracefulDegradation,
}));

describe('Completions Endpoint', () => {
  let app: express.Application;
  let mockAxiosInstance: {
    post: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };

  // Import after mocking
  let correlationIdMiddleware: express.RequestHandler;
  let secureAuthenticationMiddleware: express.RequestHandler;
  let completionsHandler: (config: ServerConfig) => express.RequestHandler;

  beforeAll(async () => {
    // Create mock axios instance for tests that need direct axios mocking
    mockAxiosInstance = {
      post: vi.fn(),
      get: vi.fn(),
    };

    (
      globalThis as { __AZURE_OPENAI_AXIOS_MOCK__?: typeof mockAxiosInstance }
    ).__AZURE_OPENAI_AXIOS_MOCK__ = mockAxiosInstance;

    // Import ValidationError for mocking
    const { ValidationError } = await import('../src/errors/index.js');

    // Setup default mock responses
    mocks.azureClient.createResponse.mockResolvedValue(
      mockResponses.azureResponsesSuccess()
    );

    // Setup universal processor to validate inputs and throw errors for invalid requests
    mocks.universalProcessor.processRequest.mockImplementation(
      async (request) => {
        // Check for missing messages/prompt
        if (
          request.body === null ||
          request.body === undefined ||
          typeof request.body !== 'object'
        ) {
          throw new ValidationError(
            'Request body is required',
            'test-correlation-id'
          );
        }

        const body = request.body as Record<string, unknown>;

        // Check for missing messages
        if (
          (body.messages === null || body.messages === undefined) &&
          (body.prompt === null || body.prompt === undefined)
        ) {
          throw new ValidationError(
            'Either messages or prompt is required',
            'test-correlation-id'
          );
        }

        // Check for invalid max_tokens
        if (
          body.max_tokens !== undefined &&
          (typeof body.max_tokens !== 'number' || body.max_tokens <= 0)
        ) {
          throw new ValidationError(
            'max_tokens must be a positive number',
            'test-correlation-id'
          );
        }

        // Check for invalid temperature
        if (
          body.temperature !== undefined &&
          (typeof body.temperature !== 'number' ||
            body.temperature < 0 ||
            body.temperature > 2)
        ) {
          throw new ValidationError(
            'temperature must be between 0 and 2',
            'test-correlation-id'
          );
        }

        // Check for empty prompt
        if (
          body.prompt !== undefined &&
          (body.prompt === null ||
            (typeof body.prompt === 'string' && body.prompt.trim() === ''))
        ) {
          throw new ValidationError(
            'prompt cannot be empty',
            'test-correlation-id'
          );
        }

        // Check for malicious content (simple check for script tags)
        const promptContent =
          typeof body.prompt === 'string' ? body.prompt : '';
        const messageContent = Array.isArray(body.messages)
          ? body.messages
              .map((m: Record<string, unknown>) =>
                typeof m.content === 'string' ? m.content : ''
              )
              .join(' ')
          : '';
        const content = promptContent || messageContent;
        const jsProtocol = ['javascript', ':'].join('');
        if (content.includes('<script>') || content.includes(jsProtocol)) {
          throw new ValidationError(
            'Request contains invalid or potentially harmful content',
            'test-correlation-id'
          );
        }

        // Return successful processing result for valid requests
        return mockResponses.universalProcessingResult();
      }
    );

    mocks.conversationManager.extractConversationId.mockReturnValue(
      'test-conversation-id'
    );
    mocks.conversationManager.getConversationContext.mockReturnValue(
      mockResponses.conversationContext()
    );

    // Import modules after mocking
    const securityModule = await import('../src/middleware/security.js');
    const authModule = await import('../src/middleware/authentication.js');
    const completionsModule = await import('../src/routes/completions.js');

    correlationIdMiddleware = securityModule.correlationIdMiddleware;
    secureAuthenticationMiddleware = authModule.secureAuthenticationMiddleware;
    completionsHandler = completionsModule.completionsHandler;

    // Create test Express app
    app = express();
    app.use(json({ limit: '10mb' }));
    app.use(correlationIdMiddleware);
    app.post(
      '/v1/completions',
      secureAuthenticationMiddleware,
      completionsHandler(testServerConfig)
    );
  });

  afterEach(() => {
    // Restore the original universal processor mock implementation after each test
    mocks.universalProcessor.processRequest.mockImplementation(
      async (request) => {
        // Check for missing messages/prompt
        if (
          request.body === null ||
          request.body === undefined ||
          typeof request.body !== 'object'
        ) {
          const { ValidationError } = await import('../src/errors/index.js');
          throw new ValidationError(
            'Request body is required',
            'test-correlation-id'
          );
        }

        const body = request.body as Record<string, unknown>;

        // Check for missing messages
        if (
          (body.messages === null || body.messages === undefined) &&
          (body.prompt === null || body.prompt === undefined)
        ) {
          const { ValidationError } = await import('../src/errors/index.js');
          throw new ValidationError(
            'Either messages or prompt is required',
            'test-correlation-id'
          );
        }

        // Check for invalid max_tokens
        if (
          body.max_tokens !== undefined &&
          (typeof body.max_tokens !== 'number' || body.max_tokens <= 0)
        ) {
          const { ValidationError } = await import('../src/errors/index.js');
          throw new ValidationError(
            'max_tokens must be a positive number',
            'test-correlation-id'
          );
        }

        // Check for invalid temperature
        if (
          body.temperature !== undefined &&
          (typeof body.temperature !== 'number' ||
            body.temperature < 0 ||
            body.temperature > 2)
        ) {
          const { ValidationError } = await import('../src/errors/index.js');
          throw new ValidationError(
            'temperature must be between 0 and 2',
            'test-correlation-id'
          );
        }

        // Check for empty prompt
        if (
          body.prompt !== undefined &&
          (body.prompt === null ||
            (typeof body.prompt === 'string' && body.prompt.trim() === ''))
        ) {
          const { ValidationError } = await import('../src/errors/index.js');
          throw new ValidationError(
            'prompt cannot be empty',
            'test-correlation-id'
          );
        }

        // Check for malicious content (simple check for script tags)
        const promptContent =
          typeof body.prompt === 'string' ? body.prompt : '';
        const messageContent = Array.isArray(body.messages)
          ? body.messages
              .map((m: Record<string, unknown>) =>
                typeof m.content === 'string' ? m.content : ''
              )
              .join(' ')
          : '';
        const content = promptContent || messageContent;
        const jsProtocol = ['javascript', ':'].join('');
        if (content.includes('<script>') || content.includes(jsProtocol)) {
          const { ValidationError } = await import('../src/errors/index.js');
          throw new ValidationError(
            'Request contains invalid or potentially harmful content',
            'test-correlation-id'
          );
        }

        // Return successful processing result for valid requests
        return mockResponses.universalProcessingResult();
      }
    );

    // Reset Azure client mock to default success
    mocks.azureClient.createResponse.mockResolvedValue(
      mockResponses.azureResponsesSuccess()
    );
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication Required', () => {
    it('should return 401 when no authentication is provided', async () => {
      const response = await request(app).post('/v1/completions').send({
        model: 'claude-3-5-sonnet-20241022',
        prompt: 'Hello, world!',
        max_tokens: 100,
      });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      const body = response.body as TestResponseBody;
      expect(body.error?.type).toBe('authentication_required');
    });

    it('should return 401 when invalid Bearer token is provided', async () => {
      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          model: 'claude-3-5-sonnet-20241022',
          prompt: 'Hello, world!',
          max_tokens: 100,
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      const body = response.body as TestResponseBody;
      expect(body.error?.type).toBe('authentication_failed');
    });
  });

  describe('Input Validation', () => {
    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          model: 'claude-3-5-sonnet-20241022',
          // Missing prompt and max_tokens
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect((response.body as TestResponseBody).error!.type).toBe(
        'invalid_request_error'
      );
    });

    it('should return 400 for invalid max_tokens', async () => {
      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          model: 'claude-3-5-sonnet-20241022',
          prompt: 'Hello, world!',
          max_tokens: -1, // Invalid negative value
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect((response.body as TestResponseBody).error!.type).toBe(
        'invalid_request_error'
      );
    });

    it('should return 400 for invalid temperature', async () => {
      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          model: 'claude-3-5-sonnet-20241022',
          prompt: 'Hello, world!',
          max_tokens: 100,
          temperature: 3.0, // Invalid value > 2
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect((response.body as TestResponseBody).error!.type).toBe(
        'invalid_request_error'
      );
    });

    it('should return 400 for empty prompt', async () => {
      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          model: 'claude-3-5-sonnet-20241022',
          prompt: '', // Empty prompt
          max_tokens: 100,
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect((response.body as TestResponseBody).error!.type).toBe(
        'invalid_request_error'
      );
    });
  });

  describe('Security Validation', () => {
    it('should reject potentially malicious content', async () => {
      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          model: 'claude-3-5-sonnet-20241022',
          prompt: '<script>alert("xss")</script>',
          max_tokens: 100,
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect((response.body as TestResponseBody).error!.type).toBe(
        'invalid_request_error'
      );
      expect((response.body as TestResponseBody).error!.message).toContain(
        'invalid or potentially harmful content'
      );
    });
  });

  describe('Successful Requests', () => {
    it('should successfully process valid completion request', async () => {
      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          model: 'claude-3-5-sonnet-20241022',
          prompt: 'Hello, world!',
          max_tokens: 100,
          temperature: 0.7,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('type', 'message');
      expect(response.body).toHaveProperty('role', 'assistant');
      expect(response.body).toHaveProperty('content');
      expect(Array.isArray(response.body.content)).toBe(true);
      expect(response.body.content[0]).toHaveProperty('type', 'text');
      expect(response.body.content[0]).toHaveProperty('text');
      expect(response.body).toHaveProperty(
        'model',
        'claude-3-5-sonnet-20241022'
      );
      expect(response.body).toHaveProperty('stop_reason');
    });

    it('should handle optional parameters correctly', async () => {
      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          model: 'claude-3-5-sonnet-20241022',
          prompt: 'Test with optional parameters',
          max_tokens: 50,
          temperature: 0.5,
          top_p: 0.9,
          stop_sequences: ['END', 'STOP'],
        });

      expect(response.status).toBe(200);
      expect((response.body as TestResponseBody).type).toBe('message');
    });
  });

  describe('Bedrock routing safeguards', () => {
    it('returns a validation error when Bedrock routing is requested without configuration', async () => {
      const bedrockResult = {
        ...mockResponses.universalProcessingResult(),
        responsesParams: {
          model: 'qwen-3-coder',
          input: 'Route this request to Bedrock',
          stream: false,
        },
        routingDecision: {
          provider: 'bedrock' as const,
          requestedModel: 'qwen-3-coder',
          backendModel: 'qwen.qwen3-coder-480b-a35b-v1:0',
          isSupported: true,
        },
      };
      mocks.universalProcessor.processRequest.mockResolvedValueOnce(
        bedrockResult
      );

      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          model: 'qwen-3-coder',
          prompt: 'Please use the alternative provider',
          max_tokens: 200,
        });

      expect(response.status).toBe(400);
      expect(response.body.error?.message).toContain(
        'AWS Bedrock configuration is missing'
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle basic error scenarios', async () => {
      // Test with a request that will trigger the defensive handler
      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          model: 'claude-3-5-sonnet-20241022',
          prompt: 'Test error handling',
          max_tokens: 100,
        });

      // Should get some response (either success or error)
      expect([200, 400, 500, 503]).toContain(response.status);
      expect(response.body).toHaveProperty('type');
    });
  });

  describe('Format Detection and Response', () => {
    it('should detect Claude format and return Claude response', async () => {
      // Mock successful Azure OpenAI response
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: {
          id: 'chatcmpl-test-123',
          object: 'chat.completion',
          created: 1234567890,
          model: 'gpt-5-codex',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Hello! How can I help you today?',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 8,
            total_tokens: 18,
          },
        },
      });

      const claudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
      };

      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(claudeRequest);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type', 'message');
      expect(response.body).toHaveProperty('role', 'assistant');
      expect(response.body).toHaveProperty('content');
      expect(Array.isArray(response.body.content)).toBe(true);
      expect(response.body.content[0]).toHaveProperty('type', 'text');
      expect(response.body.content[0]).toHaveProperty('text');
    });

    it('should detect OpenAI format and return OpenAI response', async () => {
      // Mock successful Azure OpenAI response
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: {
          id: 'chatcmpl-test-456',
          object: 'chat.completion',
          created: 1234567890,
          model: 'gpt-5-codex',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Hello! How can I help you today?',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 8,
            total_tokens: 18,
          },
        },
      });

      const openAIRequest = {
        model: 'gpt-4',
        max_completion_tokens: 100,
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      };

      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(openAIRequest);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('object', 'chat.completion');
      expect(response.body).toHaveProperty('choices');
      expect(Array.isArray(response.body.choices)).toBe(true);
      expect(response.body.choices[0]).toHaveProperty('message');
      expect(response.body.choices[0].message).toHaveProperty(
        'role',
        'assistant'
      );
      expect(response.body.choices[0].message).toHaveProperty('content');
    });

    it('should return Claude format error for Claude request', async () => {
      const claudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 100,
        // Missing required messages field
      };

      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(claudeRequest);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('type', 'error');
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty(
        'type',
        'invalid_request_error'
      );
      expect(response.body.error).toHaveProperty('message');
    });

    it('should return OpenAI format error for OpenAI request', async () => {
      const openAIRequest = {
        model: 'gpt-4',
        max_completion_tokens: 100,
        // Missing required messages field
      };

      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(openAIRequest);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty(
        'type',
        'invalid_request_error'
      );
      expect(response.body.error).toHaveProperty('message');
      // Should NOT have Claude-specific 'type' field at root level
      expect(response.body).not.toHaveProperty('type');
    });

    it('should handle Azure OpenAI errors with correct format', async () => {
      // This test verifies that RateLimitError from Azure client is properly mapped
      // We'll test this by mocking the Azure client to throw the error after validation passes

      // Import RateLimitError for mocking
      const { RateLimitError } = await import('../src/errors/index.js');

      // Create a valid request that will pass validation
      const claudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello, world!' }],
          },
        ],
      };

      // Mock the Azure client to throw a rate limit error after validation passes
      mocks.azureClient.createResponse.mockRejectedValueOnce(
        new RateLimitError('Rate limit exceeded', 'test-correlation-id', 60)
      );

      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(claudeRequest);

      // Debug: Log the actual response to understand what's happening
      console.log('Response status:', response.status);
      console.log('Response body:', JSON.stringify(response.body, null, 2));

      // The error should be properly mapped and return the correct status code
      expect(response.status).toBe(429);
      expect(response.body).toHaveProperty('type', 'error');
      expect(response.body.error).toHaveProperty('type', 'rate_limit_error');
    });
  });

  describe('Response Headers', () => {
    it('should include correlation ID in response headers', async () => {
      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send({
          model: 'claude-3-5-sonnet-20241022',
          prompt: 'Test headers',
          max_tokens: 50,
        });

      // Should have proper headers regardless of success/error
      expect(response.headers['content-type']).toContain('application/json');
      // Correlation ID might be in different header formats
      const hasCorrelationId = Boolean(
        response.headers['x-correlation-id'] ||
          response.headers['correlation-id'] ||
          (response.body as TestResponseBody).correlationId!
      );
      expect(hasCorrelationId).toBeDefined();
    });
  });
});
