import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { json } from 'express';
import axios from 'axios';
import {
  ClaudeRequestFactory,
  AzureResponseFactory,
  AzureErrorFactory,
  MaliciousDataFactory,
  AuthTestDataFactory,
  TestDataUtils,
} from './test-factories.js';
import type { ServerConfig } from '../src/types/index.js';
import { gracefulDegradationManager } from '../src/resilience/index.js';

// Mock configuration
vi.mock('../src/config/index.js', () => ({
  default: {
    PROXY_API_KEY: 'test-api-key-12345678901234567890123456789012',
    AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
    AZURE_OPENAI_API_KEY: 'test-azure-key-12345678901234567890123456789012',
    AZURE_OPENAI_MODEL: 'gpt-5-codex',
    PORT: 3000,
    NODE_ENV: 'test',
  },
  isAWSBedrockConfigured: vi.fn(() => false),
  createAWSBedrockConfig: vi.fn(() => ({
    baseURL: 'https://bedrock-runtime.us-west-2.amazonaws.com',
    apiKey: 'test-bedrock-key',
    region: 'us-west-2',
  })),
}));

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

// Mock graceful degradation manager
vi.mock('../src/resilience/index.js', async () => {
  const actual = await vi.importActual('../src/resilience/index.js');
  return {
    ...actual,
    gracefulDegradationManager: {
      executeGracefulDegradation: vi.fn(),
      getCurrentServiceLevel: vi.fn(() => ({ name: 'full', features: [] })),
      degradeServiceLevel: vi.fn(),
      restoreServiceLevel: vi.fn(),
      autoAdjustServiceLevel: vi.fn(),
    },
  };
});

// Mock rate limiting middleware
vi.mock('express-rate-limit', () => {
  return {
    default: vi.fn(
      () =>
        (
          req: express.Request,
          res: express.Response,
          next: express.NextFunction
        ) =>
          next()
    ),
  };
});

// Mock health monitor
const mockHealthMonitor = {
  getHealthStatus: vi.fn().mockResolvedValue({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: 1000,
    memory: { used: 100, total: 1000, percentage: 10 },
    azureOpenAI: { status: 'connected', responseTime: 100 },
  }),
};

vi.mock('../src/monitoring/health-monitor.ts', () => {
  return {
    HealthMonitor: vi.fn().mockImplementation(function () {
      return mockHealthMonitor;
    }),
    healthMonitor: mockHealthMonitor,
  };
});

describe('Integration Tests', () => {
  let app: express.Application;
  const validApiKey = 'test-api-key-12345678901234567890123456789012';
  let mockAxiosInstance: ReturnType<typeof vi.mocked>;

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
    // Create mock axios instance
    mockAxiosInstance = {
      post: vi.fn(),
      get: vi.fn(),
    };

    mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

    (
      globalThis as { __AZURE_OPENAI_AXIOS_MOCK__?: typeof mockAxiosInstance }
    ).__AZURE_OPENAI_AXIOS_MOCK__ = mockAxiosInstance;

    // Import modules after mocking
    const securityModule = await import('../src/middleware/security.js');
    const authModule = await import('../src/middleware/authentication.js');
    const modelsModule = await import('../src/routes/models.js');
    const completionsModule = await import('../src/routes/completions.js');
    const healthModule = await import('../src/monitoring/health-monitor.js');

    // Create test Express app with full middleware stack
    app = express();
    app.use(json({ limit: '10mb' }));
    app.use(securityModule.correlationIdMiddleware);
    app.use(securityModule.securityHeadersMiddleware);

    // Routes
    app.get(
      '/v1/models',
      authModule.secureAuthenticationMiddleware,
      modelsModule.modelsHandler
    );
    app.post(
      '/v1/completions',
      authModule.secureAuthenticationMiddleware,
      ...completionsModule.secureCompletionsHandler(mockConfig)
    );

    // Health endpoint
    const healthMonitor = new healthModule.HealthMonitor(mockConfig);
    app.get('/health', async (req, res) => {
      const health = await healthMonitor.getHealthStatus();
      res.status(health.status === 'healthy' ? 200 : 503).json(health);
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Default successful Azure OpenAI response
    (mockAxiosInstance.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 200,
      data: AzureResponseFactory.create({ includeOptional: true }),
    });

    (mockAxiosInstance.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 200,
      data: { object: 'list', data: [{ id: 'gpt-5-codex' }] },
    });

    // Reset graceful degradation mock to default success
    const degradationManagerMock = vi.mocked(gracefulDegradationManager);
    degradationManagerMock.executeGracefulDegradation.mockResolvedValue({
      success: true,
      data: {
        type: 'completion',
        completion: 'Test response',
        id: 'test-id',
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'stop_sequence',
      },
      fallbackUsed: null,
      degraded: false,
    });
  });

  describe('Complete Request Flow', () => {
    it('should handle complete successful request flow', async () => {
      const claudeRequest = ClaudeRequestFactory.create({
        includeOptional: true,
      });
      const azureResponse = AzureResponseFactory.create({
        includeOptional: true,
      });

      (mockAxiosInstance.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: 200,
        data: azureResponse,
      });

      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(claudeRequest)
        .expect(200);

      // Verify response structure (OpenAI format)
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
      expect(response.body.choices[0]).toHaveProperty('finish_reason');
      expect(response.body).toHaveProperty('usage');
      expect(response.body).toHaveProperty('usage');

      // Verify headers
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');

      // Verify Azure OpenAI was called correctly
      expect(mockAxiosInstance.post).toHaveBeenCalledOnce();
      const mockPost = mockAxiosInstance.post as ReturnType<typeof vi.fn>;
      const callArgs = mockPost.mock.calls[0] as [
        string,
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      const [url, data, config] = callArgs;
      expect(url).toBe(
        'https://test.openai.azure.com/openai/v1/chat/completions'
      );
      expect(data.model).toBe('gpt-5-codex');
      expect(Array.isArray(data.messages)).toBe(true);
      const messages = data.messages as Array<{ content: string }>;
      expect(messages).toHaveLength(1);
      // Extract text from content blocks for comparison
      const expectedContent = Array.isArray(claudeRequest.messages[0].content)
        ? (claudeRequest.messages[0].content as Array<{ text: string }>)[0].text
        : (claudeRequest.messages[0].content as string);
      expect(messages[0].content).toBe(expectedContent);
      const headers = config.headers as Record<string, string>;
      expect(headers['api-key']).toBe(
        'test-azure-key-12345678901234567890123456789012'
      );
    });

    it('should handle request with all optional parameters', async () => {
      const claudeRequest = ClaudeRequestFactory.create({
        includeOptional: true,
        size: 'large',
      });

      const response = await request(app)
        .post('/v1/completions')
        .set('x-api-key', validApiKey)
        .send(claudeRequest)
        .expect(200);

      // Verify response structure (OpenAI format)
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

      // Verify all parameters were passed to Azure OpenAI
      const mockPost = mockAxiosInstance.post as ReturnType<typeof vi.fn>;
      const callArgs = mockPost.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      const [, data] = callArgs;
      expect(data.temperature).toBe(claudeRequest.temperature);
      expect(data.top_p).toBe(claudeRequest.top_p);
      expect(data.stop).toEqual(claudeRequest.stop_sequences);
    });

    it('should handle minimal request correctly', async () => {
      const claudeRequest = ClaudeRequestFactory.create({ size: 'small' });

      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(claudeRequest)
        .expect(200);

      // Verify response structure (OpenAI format)
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

      // Verify minimal parameters were passed
      const mockPost2 = mockAxiosInstance.post as ReturnType<typeof vi.fn>;
      const callArgs2 = mockPost2.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      const [, data] = callArgs2;
      expect(data.model).toBe('gpt-5-codex');
      expect(data.max_completion_tokens).toBe(claudeRequest.max_tokens);
      expect(data.temperature).toBeUndefined();
      expect(data.top_p).toBeUndefined();
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle Azure OpenAI authentication errors', async () => {
      const claudeRequest = ClaudeRequestFactory.create();
      const azureError = AzureErrorFactory.create('authentication_error');

      // Mock graceful degradation to return error response instead of throwing
      const degradationManagerMock = vi.mocked(gracefulDegradationManager);
      degradationManagerMock.executeGracefulDegradation.mockResolvedValueOnce({
        success: false,
        error: azureError,
        fallbackUsed: null,
        degraded: false,
      });

      (
        mockAxiosInstance.post as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce({
        response: {
          status: 401,
          data: azureError,
        },
      });

      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(claudeRequest)
        .expect(401);

      // Verify error response structure (OpenAI format)
      expect(response.body).toHaveProperty('error');
      const error3 = response.body.error as Record<string, unknown>;
      expect(error3).toHaveProperty('type');
      expect(error3).toHaveProperty('message');
    });

    it('should handle Azure OpenAI rate limiting', async () => {
      const claudeRequest = ClaudeRequestFactory.create();
      const azureError = AzureErrorFactory.create('rate_limit_error');

      // Mock graceful degradation to return error response instead of throwing
      const degradationManagerMock = vi.mocked(gracefulDegradationManager);
      degradationManagerMock.executeGracefulDegradation.mockResolvedValueOnce({
        success: false,
        error: azureError,
        fallbackUsed: null,
        degraded: false,
      });

      (
        mockAxiosInstance.post as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce({
        response: {
          status: 429,
          data: azureError,
        },
      });

      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(claudeRequest)
        .expect(429);

      // Verify error response structure (OpenAI format)
      expect(response.body).toHaveProperty('error');
      const error4 = response.body.error as Record<string, unknown>;
      expect(error4).toHaveProperty('type');
      expect(error4).toHaveProperty('message');
    });

    it('should handle network errors gracefully', async () => {
      const claudeRequest = ClaudeRequestFactory.create();

      // Mock graceful degradation to fail
      const degradationManagerMock = vi.mocked(gracefulDegradationManager);
      degradationManagerMock.executeGracefulDegradation.mockRejectedValueOnce(
        new Error('Network error')
      );

      (mockAxiosInstance.post as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('ECONNREFUSED')
      );

      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(claudeRequest);

      // Should return some error response (exact status may vary based on error handling)
      expect([500, 503]).toContain(response.status);
      // OpenAI format errors have error object
      if (response.body.error !== undefined) {
        expect(response.body).toHaveProperty('error');
      } else {
        // Or it might be a successful response with OpenAI format
        expect(response.body).toHaveProperty('id');
      }
    });

    it('should handle malformed Azure OpenAI responses', async () => {
      const claudeRequest = ClaudeRequestFactory.create();

      (mockAxiosInstance.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: 200,
        data: { invalid: 'response structure' },
      });

      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(claudeRequest);

      expect([200, 500]).toContain(response.status);
      // OpenAI format - check for either success or error structure
      if (response.status === 200) {
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('object', 'chat.completion');
      } else {
        expect(response.body).toHaveProperty('error');
      }
    });
  });

  describe('Security Integration', () => {
    it('should handle malicious input with sanitization', async () => {
      const maliciousPayloads = MaliciousDataFactory.getXSSPayloads();

      for (const payload of maliciousPayloads) {
        const maliciousRequest = {
          model: 'gpt-4',
          prompt: payload,
          max_tokens: 100,
        };

        const response = await request(app)
          .post('/v1/completions')
          .set('Authorization', `Bearer ${validApiKey}`)
          .send(maliciousRequest);

        // Malicious content is now sanitized rather than rejected
        // The request should succeed but content should be sanitized
        expect([200, 400]).toContain(response.status);

        if (response.status === 200) {
          // If successful, verify the response is properly formatted (OpenAI format)
          expect(response.body).toHaveProperty('id');
          expect(response.body).toHaveProperty('object', 'chat.completion');
        } else {
          // If rejected, verify it's a proper error response
          // Verify error response structure (OpenAI format)
          expect(response.body).toHaveProperty('error');
          const error = response.body.error as Record<string, unknown>;
          expect(error).toHaveProperty('type');
          expect(error).toHaveProperty('message');
        }
      }
    });

    it('should sanitize sensitive data in error responses', async () => {
      const azureError = AzureErrorFactory.createWithSensitiveData();

      // Mock graceful degradation to return error response instead of throwing
      const degradationManagerMock = vi.mocked(gracefulDegradationManager);
      degradationManagerMock.executeGracefulDegradation.mockResolvedValueOnce({
        success: false,
        error: azureError,
        fallbackUsed: null,
        degraded: false,
      });

      (
        mockAxiosInstance.post as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce({
        response: {
          status: 400,
          data: azureError,
        },
      });

      const claudeRequest = ClaudeRequestFactory.create();

      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(claudeRequest)
        .expect(400);

      const responseBody6 = response.body as Record<string, unknown>;
      const error6 = responseBody6.error as Record<string, unknown>;
      const errorMessage = error6.message as string;
      expect(errorMessage).toContain('[EMAIL_REDACTED]');
      expect(errorMessage).toContain('[TOKEN_REDACTED]');
      expect(errorMessage).not.toContain('user@example.com');
      expect(errorMessage).not.toContain('token123');
    });

    it('should enforce request size limits', async () => {
      // Create a request that definitely exceeds the 10MB limit
      const largePrompt = 'x'.repeat(12 * 1024 * 1024); // 12MB of characters
      const largeRequest = {
        model: 'gpt-4',
        prompt: largePrompt,
        max_tokens: 100,
      };

      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .set('Content-Type', 'application/json')
        .send(largeRequest);

      // Express body parser will return 413 for requests exceeding limit
      expect(response.status).toBe(413);
      // The error format might be different from our custom middleware
      expect(response.body ?? response.text).toBeDefined();
    });

    it('should set all security headers', async () => {
      const response = await request(app)
        .get('/v1/models')
        .set('Authorization', `Bearer ${validApiKey}`)
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      expect(response.headers['referrer-policy']).toBe(
        'strict-origin-when-cross-origin'
      );
      expect(response.headers['strict-transport-security']).toContain(
        'max-age=31536000'
      );
      expect(response.headers['content-security-policy']).toContain(
        "default-src 'none'"
      );
    });
  });

  describe('Authentication Integration', () => {
    it('should handle various authentication methods', async () => {
      const claudeRequest = ClaudeRequestFactory.create();
      const validKeys = AuthTestDataFactory.getValidApiKeys();

      for (const key of validKeys) {
        // Test Bearer token
        const bearerResponse = await request(app)
          .post('/v1/completions')
          .set('Authorization', `Bearer ${key}`)
          .send(claudeRequest);

        if (key === validApiKey) {
          expect(bearerResponse.status).toBe(200);
        } else {
          expect(bearerResponse.status).toBe(401);
        }

        // Test x-api-key header
        const apiKeyResponse = await request(app)
          .post('/v1/completions')
          .set('x-api-key', key)
          .send(claudeRequest);

        if (key === validApiKey) {
          expect(apiKeyResponse.status).toBe(200);
        } else {
          expect(apiKeyResponse.status).toBe(401);
        }
      }
    });

    it('should handle malformed authentication headers', async () => {
      const claudeRequest = ClaudeRequestFactory.create();
      const malformedHeaders = AuthTestDataFactory.createMalformedAuthHeaders();

      for (const headers of malformedHeaders) {
        const response = await request(app)
          .post('/v1/completions')
          .set(headers)
          .send(claudeRequest);

        expect(response.status).toBe(401);
        const responseBody8 = response.body as Record<string, unknown>;
        const error8 = responseBody8.error as Record<string, unknown>;
        expect(error8.type).toMatch(/authentication_/);
      }
    });

    it('should prioritize Bearer token over x-api-key', async () => {
      const claudeRequest = ClaudeRequestFactory.create();

      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .set('x-api-key', 'different-key')
        .send(claudeRequest)
        .expect(200);

      // Verify response structure (OpenAI format)
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('object', 'chat.completion');
      expect(response.body.choices[0]).toHaveProperty('message');
      expect(response.body.choices[0].message).toHaveProperty(
        'role',
        'assistant'
      );
    });
  });

  describe('Models Endpoint Integration', () => {
    it('should return consistent models response', async () => {
      const response = await request(app)
        .get('/v1/models')
        .set('Authorization', `Bearer ${validApiKey}`)
        .expect(200);

      expect(response.body).toHaveProperty('object', 'list');
      const responseBody20 = response.body as Record<string, unknown>;
      expect(responseBody20).toHaveProperty('data');
      const data20 = responseBody20.data as unknown[];
      expect(Array.isArray(data20)).toBe(true);
      expect(data20.length).toBeGreaterThan(0);

      // Verify model structure
      const models = data20 as Array<Record<string, unknown>>;
      models.forEach((model) => {
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('object', 'model');
        expect(model).toHaveProperty('created');
        expect(model).toHaveProperty('owned_by');
      });
    });

    it('should require authentication for models endpoint', async () => {
      const response = await request(app).get('/v1/models').expect(401);

      const responseBody11 = response.body as Record<string, unknown>;
      const error11 = responseBody11.error as Record<string, unknown>;
      expect(error11.type).toBe('authentication_required');
    });
  });

  describe('Health Check Integration', () => {
    it('should return healthy status when all systems are operational', async () => {
      (mockAxiosInstance.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: 200,
        data: { object: 'list', data: [] },
      });

      const response = await request(app).get('/health').expect(200);

      const responseBody12 = response.body as Record<string, unknown>;
      expect(responseBody12.status).toBe('healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('memory');
      expect(response.body).toHaveProperty('azureOpenAI');
      const azureOpenAI12 = responseBody12.azureOpenAI as Record<
        string,
        unknown
      >;
      expect(azureOpenAI12.status).toBe('connected');
    });

    it('should return unhealthy status when Azure OpenAI is down', async () => {
      // Mock health monitor to return unhealthy status
      const mockGetHealthStatus = vi.mocked(mockHealthMonitor.getHealthStatus);
      mockGetHealthStatus.mockResolvedValueOnce({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: 1000,
        memory: { used: 100, total: 1000, percentage: 10 },
        azureOpenAI: { status: 'disconnected' },
      });

      (mockAxiosInstance.get as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Connection failed')
      );

      const response = await request(app).get('/health').expect(503);

      const responseBody13: Record<string, unknown> = response.body;
      expect(responseBody13.status).toBe('unhealthy');
      const azureOpenAI13 = responseBody13.azureOpenAI as Record<
        string,
        unknown
      >;
      expect(azureOpenAI13.status).toBe('disconnected');
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle multiple concurrent requests', async () => {
      const claudeRequests = ClaudeRequestFactory.createBatch(10);

      const promises = claudeRequests.map((claudeReq) =>
        request(app)
          .post('/v1/completions')
          .set('Authorization', `Bearer ${validApiKey}`)
          .send(claudeReq)
      );

      const responses = await Promise.all(promises);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        // Verify response structure (OpenAI format)
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('object', 'chat.completion');
        expect(response.body.choices[0]).toHaveProperty('message');
        expect(response.body.choices[0].message).toHaveProperty(
          'role',
          'assistant'
        );
      });

      // Verify all requests were processed
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(10);
    });

    it('should handle mixed successful and failed requests', async () => {
      // Test with sequential requests to avoid mock ordering issues
      const claudeRequest = ClaudeRequestFactory.create();

      // First request - success
      (
        mockAxiosInstance.post as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        status: 200,
        data: AzureResponseFactory.create(),
      });

      const response1 = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(claudeRequest);
      expect(response1.status).toBe(200);

      // Second request - failure with graceful degradation returning error
      (
        mockAxiosInstance.post as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce({
        response: {
          status: 429,
          data: AzureErrorFactory.create('rate_limit_error'),
        },
      });
      const degradationManagerMock = vi.mocked(gracefulDegradationManager);
      degradationManagerMock.executeGracefulDegradation.mockResolvedValueOnce({
        success: false,
        error: AzureErrorFactory.create('rate_limit_error'),
        fallbackUsed: null,
        degraded: false,
      });

      const response2 = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(claudeRequest);
      expect(response2.status).toBe(429);

      // Third request - success again
      (
        mockAxiosInstance.post as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        status: 200,
        data: AzureResponseFactory.create(),
      });

      const response3 = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(claudeRequest);
      expect(response3.status).toBe(200);
    });
  });

  describe('Response Format Consistency', () => {
    it('should maintain consistent response format across different scenarios', async () => {
      const testCases = [
        { size: 'small', includeOptional: false },
        { size: 'medium', includeOptional: true },
        { size: 'large', includeOptional: true },
      ];

      for (const testCase of testCases) {
        const claudeRequest = ClaudeRequestFactory.create(testCase);
        const azureResponse = AzureResponseFactory.create(testCase);

        (
          mockAxiosInstance.post as ReturnType<typeof vi.fn>
        ).mockResolvedValueOnce({
          status: 200,
          data: azureResponse,
        });

        const response = await request(app)
          .post('/v1/completions')
          .set('Authorization', `Bearer ${validApiKey}`)
          .send(claudeRequest)
          .expect(200);

        // Verify consistent structure (OpenAI format)
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('object', 'chat.completion');
        expect(response.body.choices[0]).toHaveProperty('message');
        expect(response.body.choices[0].message).toHaveProperty(
          'role',
          'assistant'
        );
        expect(response.body.choices[0].message).toHaveProperty('content');
        // OpenAI format - content is in choices[0].message.content, not response.body.content
        expect(typeof response.body.choices[0].message.content).toBe('string');
        expect(response.body).toHaveProperty('model');
        expect(response.body.choices[0]).toHaveProperty('finish_reason');

        if (testCase.includeOptional) {
          expect(response.body).toHaveProperty('usage');
        }
      }
    });

    it('should handle different finish reasons consistently', async () => {
      const finishReasons = ['stop', 'length', 'content_filter'];

      for (const reason of finishReasons) {
        const claudeRequest = ClaudeRequestFactory.create();
        const azureResponse = AzureResponseFactory.createWithFinishReason(
          reason as 'stop' | 'length' | 'content_filter'
        );

        (
          mockAxiosInstance.post as ReturnType<typeof vi.fn>
        ).mockResolvedValueOnce({
          status: 200,
          data: azureResponse,
        });

        const response = await request(app)
          .post('/v1/completions')
          .set('Authorization', `Bearer ${validApiKey}`)
          .send(claudeRequest)
          .expect(200);

        // Verify response structure (OpenAI format)
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('object', 'chat.completion');
        expect(response.body.choices[0]).toHaveProperty('message');
        expect(response.body.choices[0].message).toHaveProperty(
          'role',
          'assistant'
        );
        expect(response.body.choices[0]).toHaveProperty('finish_reason');
      }
    });
  });

  describe('Edge Cases Integration', () => {
    it('should handle Unicode content correctly', async () => {
      const unicodeRequest = ClaudeRequestFactory.createEdgeCase('unicode');

      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(unicodeRequest)
        .expect(200);

      // Verify response structure (OpenAI format)
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('object', 'chat.completion');
      expect(response.body.choices[0]).toHaveProperty('message');
      expect(response.body.choices[0].message).toHaveProperty(
        'role',
        'assistant'
      );

      // Verify Unicode was preserved in Azure request
      const mockPost3 = mockAxiosInstance.post as ReturnType<typeof vi.fn>;
      const callArgs3 = mockPost3.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      const [, data] = callArgs3;
      const messages = data.messages as Array<{ content: string }>;
      // The Unicode content should be preserved in the Azure request
      expect(messages[0].content).toBe('Hello 世界 🌍 café naïve résumé ∑∫∆√π');
    });

    it('should handle special characters correctly', async () => {
      const specialCharsRequest =
        ClaudeRequestFactory.createEdgeCase('special_chars');

      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(specialCharsRequest)
        .expect(200);

      // Verify response structure (OpenAI format)
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('object', 'chat.completion');
      expect(response.body.choices[0]).toHaveProperty('message');
      expect(response.body.choices[0].message).toHaveProperty(
        'role',
        'assistant'
      );
    });

    it('should handle null content in Azure responses', async () => {
      const claudeRequest = ClaudeRequestFactory.create();
      const azureResponse = AzureResponseFactory.createWithNullContent();

      (mockAxiosInstance.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: 200,
        data: azureResponse,
      });

      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(claudeRequest)
        .expect(200);

      // Verify response structure (OpenAI format)
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('object', 'chat.completion');
      expect(response.body.choices[0]).toHaveProperty('message');
      expect(response.body.choices[0].message).toHaveProperty(
        'role',
        'assistant'
      );
      // OpenAI format can return null for empty content
      expect(response.body.choices[0].message.content).toBeNull();
    });
  });

  describe('Correlation ID Tracking', () => {
    it('should maintain correlation ID throughout request lifecycle', async () => {
      const correlationId = TestDataUtils.createCorrelationId();
      const claudeRequest = ClaudeRequestFactory.create();

      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .set('X-Correlation-ID', correlationId)
        .send(claudeRequest)
        .expect(200);

      // Correlation ID should be in response headers or body
      const responseBody = response.body as Record<string, unknown>;
      const hasCorrelationId =
        response.headers['x-correlation-id'] === correlationId ||
        responseBody.correlationId === correlationId;
      expect(hasCorrelationId).toBe(true);
    });

    it('should generate correlation ID when not provided', async () => {
      const claudeRequest = ClaudeRequestFactory.create();

      const response = await request(app)
        .post('/v1/completions')
        .set('Authorization', `Bearer ${validApiKey}`)
        .send(claudeRequest)
        .expect(200);

      // Should have some form of correlation ID
      const responseBody2 = response.body as Record<string, unknown>;
      const hasCorrelationId =
        response.headers['x-correlation-id'] ?? responseBody2.correlationId;
      expect(hasCorrelationId).toBeDefined();
    });
  });
});
