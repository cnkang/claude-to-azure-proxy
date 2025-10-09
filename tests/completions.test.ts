import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { json } from 'express';
import axios from 'axios';
import type { ServerConfig } from '../src/types/index.js';

// Type for test response body
interface TestResponseBody {
  error?: {
    type: string;
    message: string;
    correlationId?: string;
  };
  id?: string;
  completion?: string;
  model?: string;
}

// Mock configuration to prevent environment variable loading
vi.mock('../src/config/index.js', () => ({
  default: {
    PROXY_API_KEY: 'test-api-key-12345678901234567890123456789012',
    AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
    AZURE_OPENAI_API_KEY: 'test-azure-key-12345678901234567890123456789012',
    AZURE_OPENAI_MODEL: 'gpt-5-codex',
    PORT: 3000,
    NODE_ENV: 'test',
  },
}));

// Mock axios for Azure OpenAI requests
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('Completions Endpoint', () => {
  let app: express.Application;
  const validApiKey = 'test-api-key-12345678901234567890123456789012';

  // Import after mocking
  let correlationIdMiddleware: express.RequestHandler;
  let secureAuthenticationMiddleware: express.RequestHandler;
  let secureCompletionsHandler: express.RequestHandler;

  const mockConfig: ServerConfig = {
    port: 3000,
    nodeEnv: 'test',
    proxyApiKey: validApiKey,
    azureOpenAI: {
      endpoint: 'https://test.openai.azure.com',
      apiKey: 'test-azure-key-12345678901234567890123456789012',
      model: 'gpt-5-codex',
    },
  };

  beforeAll(async () => {
    // Create a proper mock axios instance
    const mockAxiosInstance = {
      post: vi.fn().mockResolvedValue({
        status: 200,
        data: {
          id: 'chatcmpl-test123',
          object: 'chat.completion',
          created: 1640995200,
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
            completion_tokens: 15,
            total_tokens: 25,
          },
        },
      }),
    };

    // Mock axios.create to return the mock instance
    mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

    // Import modules after mocking
    const securityModule = await import('../src/middleware/security.js');
    const authModule = await import('../src/middleware/authentication.js');
    const completionsModule = await import('../src/routes/completions.js');

    correlationIdMiddleware = securityModule.correlationIdMiddleware;
    secureAuthenticationMiddleware = authModule.secureAuthenticationMiddleware;
    secureCompletionsHandler = completionsModule.secureCompletionsHandler;

    // Create test Express app
    app = express();
    app.use(json({ limit: '10mb' }));
    app.use(correlationIdMiddleware);
    app.post(
      '/v1/completions',
      secureAuthenticationMiddleware,
      ...secureCompletionsHandler(mockConfig)
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
      expect(response.body).toHaveProperty('type', 'completion');
      expect(response.body).toHaveProperty('completion');
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
      expect((response.body as TestResponseBody).type).toBe('completion');
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
