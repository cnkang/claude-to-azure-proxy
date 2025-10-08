import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';

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
    process.env.AZURE_OPENAI_API_KEY = 'test-azure-key-12345678901234567890123456789012';
    process.env.AZURE_OPENAI_MODEL = 'gpt-4';
    process.env.NODE_ENV = 'test';

    // Import modules after setting environment variables
    const { modelsHandler } = await import('../src/routes/models.js');
    const { secureAuthenticationMiddleware } = await import('../src/middleware/authentication.js');
    const { correlationIdMiddleware } = await import('../src/middleware/security.js');

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
      const response = await request(app)
        .get('/v1/models')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.type).toBe('authentication_required');
      expect(response.body.error.message).toContain('Authentication required');
    });

    it('should return 401 when invalid Bearer token is provided', async () => {
      const response = await request(app)
        .get('/v1/models')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.type).toBe('authentication_failed');
      expect(response.body.error.message).toBe('Invalid credentials provided.');
    });

    it('should return 401 when invalid x-api-key is provided', async () => {
      const response = await request(app)
        .get('/v1/models')
        .set('x-api-key', 'invalid-key')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.type).toBe('authentication_failed');
      expect(response.body.error.message).toBe('Invalid credentials provided.');
    });
  });

  describe('Successful Authentication', () => {
    it('should return models list with valid Bearer token', async () => {
      const response = await request(app)
        .get('/v1/models')
        .set('Authorization', `Bearer ${validApiKey}`)
        .expect(200);

      // Verify response structure matches Claude API format
      expect(response.body).toHaveProperty('object', 'list');
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);

      // Verify each model has required properties
      response.body.data.forEach((model: any) => {
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
      expect(response.body).toHaveProperty('object', 'list');
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should return expected model (gpt-5-codex)', async () => {
      const response = await request(app)
        .get('/v1/models')
        .set('Authorization', `Bearer ${validApiKey}`)
        .expect(200);

      const modelIds = response.body.data.map((model: any) => model.id);
      
      // Verify expected model ID is present
      expect(modelIds).toContain('gpt-5-codex');

      // Verify model is owned by openai
      response.body.data.forEach((model: any) => {
        expect(model.owned_by).toBe('openai');
      });
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
        data: expect.any(Array)
      });

      // Verify each model structure
      response.body.data.forEach((model: any) => {
        expect(model).toEqual({
          id: expect.any(String),
          object: 'model',
          created: expect.any(Number),
          owned_by: expect.any(String)
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
});