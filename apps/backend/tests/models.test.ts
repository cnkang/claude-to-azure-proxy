import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';

// Type for test response body
interface TestResponseBody {
  error?: {
    type: string;
    message: string;
    correlationId?: string;
  };
  object?: string;
  data?: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
    provider?: 'azure' | 'bedrock';
  }>;
}

/**
 * Test suite for /v1/models endpoint
 */

describe('Models Endpoint', () => {
  let app: express.Application;
  const validApiKey = 'test-api-key-12345678901234567890123456789012'; // 32+ chars

  beforeAll(async () => {
    // Set up test environment variables
    process.env.PROXY_API_KEY = validApiKey;
    process.env.AZURE_OPENAI_ENDPOINT = 'https://test.openai.azure.com';
    process.env.AZURE_OPENAI_API_KEY =
      'test-azure-key-12345678901234567890123456789012';
    process.env.AZURE_OPENAI_MODEL = 'gpt-5-codex';
    process.env.NODE_ENV = 'test';

    // Import modules after setting environment variables
    const { modelsHandler } = await import('../src/routes/models.js');
    const { secureAuthenticationMiddleware } = await import(
      '../src/middleware/authentication.js'
    );
    const { correlationIdMiddleware } = await import(
      '../src/middleware/security.js'
    );

    // Create test Express app
    app = express();
    app.use(correlationIdMiddleware);
    app.get('/v1/models', secureAuthenticationMiddleware, modelsHandler);
  });

  afterAll(() => {
    // Clean up environment variables
    delete process.env.PROXY_API_KEY;
    delete process.env.AZURE_OPENAI_ENDPOINT;
    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.AZURE_OPENAI_MODEL;
    delete process.env.NODE_ENV;
  });

  describe('Authentication Required', () => {
    it('should return 401 when no authentication is provided', async () => {
      const response = await request(app).get('/v1/models').expect(401);

      expect(response.body).toHaveProperty('error');
      const body = response.body as TestResponseBody;
      expect(body.error?.type).toBe('authentication_required');
      expect(body.error?.message).toContain('Authentication required');
    });

    it('should return 401 when invalid Bearer token is provided', async () => {
      const response = await request(app)
        .get('/v1/models')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      const body = response.body as TestResponseBody;
      expect(body.error?.type).toBe('authentication_failed');
      expect(body.error?.message).toBe('Invalid credentials provided.');
    });

    it('should return 401 when invalid x-api-key is provided', async () => {
      const response = await request(app)
        .get('/v1/models')
        .set('x-api-key', 'invalid-key')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      const body = response.body as TestResponseBody;
      expect(body.error?.type).toBe('authentication_failed');
      expect(body.error?.message).toBe('Invalid credentials provided.');
    });
  });

  describe('Successful Authentication', () => {
    it('should return models list with valid Bearer token', async () => {
      const response = await request(app)
        .get('/v1/models')
        .set('Authorization', `Bearer ${validApiKey}`)
        .expect(200);

      // Verify response structure matches Claude API format
      const body = response.body as TestResponseBody;
      expect(body).toHaveProperty('object', 'list');
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data?.length).toBeGreaterThan(0);

      // Verify each model has required properties
      body.data?.forEach((model) => {
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('object', 'model');
        expect(model).toHaveProperty('created');
        expect(model).toHaveProperty('owned_by');
        expect(typeof model.id).toBe('string');
        expect(typeof model.created).toBe('number');
        expect(typeof model.owned_by).toBe('string');
      });
    });

    it('should return models list with valid x-api-key header', async () => {
      const response = await request(app)
        .get('/v1/models')
        .set('x-api-key', validApiKey)
        .expect(200);

      // Verify response structure matches Claude API format
      const body = response.body as TestResponseBody;
      expect(body).toHaveProperty('object', 'list');
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data?.length).toBeGreaterThan(0);
    });

    it('should return expected Azure model (gpt-5-codex)', async () => {
      const response = await request(app)
        .get('/v1/models')
        .set('Authorization', `Bearer ${validApiKey}`)
        .expect(200);

      const body = response.body as TestResponseBody;
      const modelIds = body.data?.map((model) => model.id) ?? [];

      // Verify expected model ID is present
      expect(modelIds).toContain('gpt-5-codex');

      // Verify Azure model properties
      const azureModel = body.data?.find((model) => model.id === 'gpt-5-codex');
      expect(azureModel).toBeDefined();
      expect(azureModel?.owned_by).toBe('openai');
      expect(azureModel?.provider).toBe('azure');
    });

    it('should return consistent response structure', async () => {
      const response1 = await request(app)
        .get('/v1/models')
        .set('Authorization', `Bearer ${validApiKey}`)
        .expect(200);

      const response2 = await request(app)
        .get('/v1/models')
        .set('x-api-key', validApiKey)
        .expect(200);

      // Both responses should be identical
      expect(response1.body).toEqual(response2.body);
    });
  });

  describe('Response Format Validation', () => {
    it('should match Claude API models response format exactly', async () => {
      const response = await request(app)
        .get('/v1/models')
        .set('Authorization', `Bearer ${validApiKey}`)
        .expect(200);

      // Verify top-level structure
      expect(response.body).toEqual({
        object: 'list',
        data: expect.any(Array) as unknown[],
      });

      // Verify each model structure
      const body = response.body as TestResponseBody;
      body.data?.forEach((model) => {
        expect(model).toEqual({
          id: expect.any(String) as string,
          object: 'model',
          created: expect.any(Number) as number,
          owned_by: expect.any(String) as string,
          provider: expect.stringMatching(/^(azure|bedrock)$/) as string,
        });
      });
    });

    it('should have proper Content-Type header', async () => {
      const response = await request(app)
        .get('/v1/models')
        .set('Authorization', `Bearer ${validApiKey}`)
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  // Note: Bedrock model integration tests are skipped in this test suite
  // because the configuration is loaded at module initialization time.
  // The Bedrock functionality is tested through manual verification
  // and integration tests with proper environment setup.

  describe('Configuration-Based Model Inclusion', () => {
    it('should only include Azure models when Bedrock is not configured', async () => {
      // This test uses the original app without Bedrock configuration
      const response = await request(app)
        .get('/v1/models')
        .set('Authorization', `Bearer ${validApiKey}`)
        .expect(200);

      const body = response.body as TestResponseBody;
      const modelIds = body.data?.map((model) => model.id) ?? [];

      // Verify only Azure model is present (Requirement 5.4)
      expect(modelIds).toContain('gpt-5-codex');
      expect(modelIds).not.toContain('qwen-3-coder');
      expect(modelIds).not.toContain('qwen.qwen3-coder-480b-a35b-v1:0');
      expect(body.data?.length).toBe(1);

      // Verify Azure model has correct provider
      const azureModel = body.data?.find((model) => model.id === 'gpt-5-codex');
      expect(azureModel?.provider).toBe('azure');
    });
  });
});
