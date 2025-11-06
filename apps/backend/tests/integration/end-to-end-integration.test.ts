/**
 * End-to-End Integration Tests
 *
 * Comprehensive integration testing for the complete web frontend application
 * including model routing, context management, conversation persistence,
 * session isolation, and accessibility compliance.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach as _afterEach,
  vi,
} from 'vitest';
import request from 'supertest';
import { createServer } from '../../src/index.js';
import type { Express } from 'express';

vi.mock('express-rate-limit', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

describe('End-to-End Integration Tests', () => {
  let app: Express;
  let server: any;

  beforeAll(async () => {
    // Create test server instance
    app = await createServer();
    server = app.listen(0); // Use random port for testing
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
  });

  describe('Application Health and Readiness', () => {
    it('should have healthy backend service', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('uptime');
    });

    it('should serve frontend static assets', async () => {
      // Test that the backend can serve frontend assets
      const response = await request(app).get('/').expect(200);

      expect(response.headers['content-type']).toMatch(/text\/html/);
    });

    it('should provide client configuration', async () => {
      const response = await request(app).get('/api/config').expect(200);

      expect(response.body).toHaveProperty('maxFileSize');
      expect(response.body).toHaveProperty('supportedFileTypes');
      expect(response.body).toHaveProperty('availableModels');
      expect(response.body).toHaveProperty('features');
      expect(response.body).toHaveProperty('defaultModel');
    });
  });

  describe('Model Routing and Configuration', () => {
    it('should provide available models', async () => {
      const response = await request(app).get('/api/models').expect(200);

      expect(response.body).toHaveProperty('models');
      expect(Array.isArray(response.body.models)).toBe(true);

      // Verify model structure
      const models = response.body.models;
      expect(models.length).toBeGreaterThan(0);

      models.forEach((model: any) => {
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('name');
        expect(model).toHaveProperty('description');
        expect(model).toHaveProperty('capabilities');
        expect(model).toHaveProperty('contextLength');
        expect(model).toHaveProperty('isAvailable');
        expect(model).toHaveProperty('provider');
        expect(model).toHaveProperty('category');
      });
    });

    it('should provide model details', async () => {
      // First get available models
      const modelsResponse = await request(app).get('/api/models').expect(200);

      const firstModel = modelsResponse.body.models[0];

      // Get details for the first model
      const response = await request(app)
        .get(`/api/models/${firstModel.id}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', firstModel.id);
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('contextLength');
      expect(response.body).toHaveProperty('capabilities');
    });

    it('should handle model routing for different providers', async () => {
      const modelsResponse = await request(app).get('/api/models').expect(200);

      const models = modelsResponse.body.models;

      // Verify we have models from different providers
      const providers = [...new Set(models.map((m: any) => m.provider))];
      expect(providers.length).toBeGreaterThan(0);

      // Verify provider-specific models exist
      const azureModels = models.filter(
        (m: any) => m.provider === 'azure-openai'
      );
      const bedrockModels = models.filter(
        (m: any) => m.provider === 'aws-bedrock'
      );

      expect(azureModels.length + bedrockModels.length).toBe(models.length);
    });
  });

  describe('Session Management and Isolation', () => {
    let sessionId1: string;
    let sessionId2: string;

    beforeEach(async () => {
      // Create two separate sessions for isolation testing
      const session1Response = await request(app)
        .post('/api/session')
        .expect(201);

      const session2Response = await request(app)
        .post('/api/session')
        .expect(201);

      sessionId1 = session1Response.body.sessionId;
      sessionId2 = session2Response.body.sessionId;

      expect(sessionId1).toBeDefined();
      expect(sessionId2).toBeDefined();
      expect(sessionId1).not.toBe(sessionId2);
    });

    it('should create unique session IDs', async () => {
      expect(sessionId1).toMatch(/^sess_[a-f0-9]+$/);
      expect(sessionId2).toMatch(/^sess_[a-f0-9]+$/);
    });

    it('should isolate conversations between sessions', async () => {
      // Create conversation in session 1
      const conv1Response = await request(app)
        .post('/api/conversations')
        .set('X-Session-ID', sessionId1)
        .send({
          title: 'Session 1 Conversation',
          initialModel: 'gpt-4',
        })
        .expect(201);

      // Create conversation in session 2
      const conv2Response = await request(app)
        .post('/api/conversations')
        .set('X-Session-ID', sessionId2)
        .send({
          title: 'Session 2 Conversation',
          initialModel: 'gpt-4',
        })
        .expect(201);

      const conv1Id = conv1Response.body.id;
      const conv2Id = conv2Response.body.id;

      // Session 1 should only see its own conversations
      const session1Conversations = await request(app)
        .get('/api/conversations')
        .set('X-Session-ID', sessionId1)
        .expect(200);

      expect(session1Conversations.body.conversations).toHaveLength(1);
      expect(session1Conversations.body.conversations[0].id).toBe(conv1Id);

      // Session 2 should only see its own conversations
      const session2Conversations = await request(app)
        .get('/api/conversations')
        .set('X-Session-ID', sessionId2)
        .expect(200);

      expect(session2Conversations.body.conversations).toHaveLength(1);
      expect(session2Conversations.body.conversations[0].id).toBe(conv2Id);

      // Session 1 should not be able to access session 2's conversation
      await request(app)
        .get(`/api/conversations/${conv2Id}`)
        .set('X-Session-ID', sessionId1)
        .expect(403);

      // Session 2 should not be able to access session 1's conversation
      await request(app)
        .get(`/api/conversations/${conv1Id}`)
        .set('X-Session-ID', sessionId2)
        .expect(403);
    });

    it('should validate session access to SSE streams', async () => {
      // Create conversation in session 1
      const convResponse = await request(app)
        .post('/api/conversations')
        .set('X-Session-ID', sessionId1)
        .send({
          title: 'Test Conversation',
          initialModel: 'gpt-4',
        })
        .expect(201);

      const conversationId = convResponse.body.id;

      // Session 1 should be able to access the SSE stream
      const sseResponse1 = await request(app)
        .get(`/api/chat/stream/${conversationId}`)
        .set('X-Session-ID', sessionId1)
        .set('Accept', 'text/event-stream')
        .expect(200);

      expect(sseResponse1.headers['content-type']).toMatch(
        /text\/event-stream/
      );

      // Session 2 should not be able to access session 1's SSE stream
      await request(app)
        .get(`/api/chat/stream/${conversationId}`)
        .set('X-Session-ID', sessionId2)
        .set('Accept', 'text/event-stream')
        .expect(403);
    });
  });

  describe('Conversation Management', () => {
    let sessionId: string;

    beforeEach(async () => {
      const sessionResponse = await request(app)
        .post('/api/session')
        .expect(201);
      sessionId = sessionResponse.body.sessionId;
    });

    it('should create, update, and delete conversations', async () => {
      // Create conversation
      const createResponse = await request(app)
        .post('/api/conversations')
        .set('X-Session-ID', sessionId)
        .send({
          title: 'Test Conversation',
          initialModel: 'gpt-4',
        })
        .expect(201);

      const conversationId = createResponse.body.id;
      expect(createResponse.body.title).toBe('Test Conversation');
      expect(createResponse.body.model).toBe('gpt-4');

      // Update conversation
      const updateResponse = await request(app)
        .put(`/api/conversations/${conversationId}`)
        .set('X-Session-ID', sessionId)
        .send({
          title: 'Updated Conversation',
          model: 'gpt-5',
        })
        .expect(200);

      expect(updateResponse.body.title).toBe('Updated Conversation');
      expect(updateResponse.body.model).toBe('gpt-5');

      // Verify conversation exists
      const getResponse = await request(app)
        .get('/api/conversations')
        .set('X-Session-ID', sessionId)
        .expect(200);

      expect(getResponse.body.conversations).toHaveLength(1);
      expect(getResponse.body.conversations[0].id).toBe(conversationId);

      // Delete conversation
      await request(app)
        .delete(`/api/conversations/${conversationId}`)
        .set('X-Session-ID', sessionId)
        .expect(204);

      // Verify conversation is deleted
      const finalGetResponse = await request(app)
        .get('/api/conversations')
        .set('X-Session-ID', sessionId)
        .expect(200);

      expect(finalGetResponse.body.conversations).toHaveLength(0);
    });

    it('should handle model switching within conversations', async () => {
      // Create conversation
      const createResponse = await request(app)
        .post('/api/conversations')
        .set('X-Session-ID', sessionId)
        .send({
          title: 'Model Switch Test',
          initialModel: 'gpt-4',
        })
        .expect(201);

      const conversationId = createResponse.body.id;

      // Switch model
      const switchResponse = await request(app)
        .put(`/api/conversations/${conversationId}/model`)
        .set('X-Session-ID', sessionId)
        .send({
          model: 'gpt-5',
        })
        .expect(200);

      expect(switchResponse.body.model).toBe('gpt-5');
      expect(switchResponse.body.modelHistory).toBeDefined();
      expect(switchResponse.body.modelHistory.length).toBeGreaterThan(0);
    });
  });

  describe('Context Management', () => {
    let sessionId: string;
    let conversationId: string;

    beforeEach(async () => {
      const sessionResponse = await request(app)
        .post('/api/session')
        .expect(201);
      sessionId = sessionResponse.body.sessionId;

      const convResponse = await request(app)
        .post('/api/conversations')
        .set('X-Session-ID', sessionId)
        .send({
          title: 'Context Test',
          initialModel: 'qwen-coder-480b', // Model that supports context extension
        })
        .expect(201);
      conversationId = convResponse.body.id;
    });

    it('should extend context for supported models', async () => {
      const response = await request(app)
        .post(`/api/conversations/${conversationId}/extend-context`)
        .set('X-Session-ID', sessionId)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.extendedMaxTokens).toBeDefined();
      expect(response.body.extendedMaxTokens).toBeGreaterThan(262144); // Should be > 256K
    });

    it('should compress conversations when context limit is reached', async () => {
      const response = await request(app)
        .post(`/api/conversations/${conversationId}/compress`)
        .set('X-Session-ID', sessionId)
        .send({
          compressionMethod: 'ai-summary',
          targetReduction: 0.5,
        })
        .expect(200);

      expect(response.body.compressedContext).toBeDefined();
      expect(response.body.compressionEvent).toBeDefined();
      expect(response.body.compressionEvent.compressionRatio).toBe(0.5);
    });

    it('should create compressed conversations', async () => {
      // First compress the conversation
      const compressResponse = await request(app)
        .post(`/api/conversations/${conversationId}/compress`)
        .set('X-Session-ID', sessionId)
        .send({
          compressionMethod: 'ai-summary',
          targetReduction: 0.5,
        })
        .expect(200);

      // Then create a new conversation with compressed context
      const createResponse = await request(app)
        .post(`/api/conversations/${conversationId}/create-compressed`)
        .set('X-Session-ID', sessionId)
        .send({
          compressedContext: compressResponse.body.compressedContext,
          originalConversationId: conversationId,
          title: 'Compressed Conversation',
        })
        .expect(201);

      expect(createResponse.body.newConversationId).toBeDefined();
      expect(createResponse.body.title).toBe('Compressed Conversation');
      expect(createResponse.body.parentConversationId).toBe(conversationId);
    });
  });

  describe('File Upload System', () => {
    let sessionId: string;

    beforeEach(async () => {
      const sessionResponse = await request(app)
        .post('/api/session')
        .expect(201);
      sessionId = sessionResponse.body.sessionId;
    });

    it('should handle code file uploads', async () => {
      const codeContent = `
function hello() {
  console.log("Hello, world!");
}
      `.trim();

      const response = await request(app)
        .post('/api/upload')
        .set('X-Session-ID', sessionId)
        .attach('file', Buffer.from(codeContent), 'test.js')
        .expect(200);

      expect(response.body.fileId).toBeDefined();
      expect(response.body.type).toBe('text/javascript');
      expect(response.body.size).toBe(codeContent.length);
    });

    it('should validate file types and sizes', async () => {
      // Test invalid file type
      await request(app)
        .post('/api/upload')
        .set('X-Session-ID', sessionId)
        .attach('file', Buffer.from('malicious content'), 'test.exe')
        .expect(400);

      // Test file too large (assuming 10MB limit)
      const largeContent = Buffer.alloc(11 * 1024 * 1024, 'a'); // 11MB
      await request(app)
        .post('/api/upload')
        .set('X-Session-ID', sessionId)
        .attach('file', largeContent, 'large.txt')
        .expect(413);
    });

    it('should scan files for security threats', async () => {
      // Test potentially malicious content
      const suspiciousContent = `
<script>alert('xss')</script>
eval('malicious code');
      `.trim();

      const response = await request(app)
        .post('/api/upload')
        .set('X-Session-ID', sessionId)
        .attach('file', Buffer.from(suspiciousContent), 'suspicious.js')
        .expect(200);

      // File should be uploaded but flagged for security review
      expect(response.body.securityFlags).toBeDefined();
    });
  });

  describe('Performance and Load Testing', () => {
    let sessionId: string;

    beforeEach(async () => {
      const sessionResponse = await request(app)
        .post('/api/session')
        .expect(201);
      sessionId = sessionResponse.body.sessionId;
    });

    it('should handle concurrent requests efficiently', async () => {
      const startTime = Date.now();
      const concurrentRequests = 10;

      // Create multiple concurrent requests
      const promises = Array.from({ length: concurrentRequests }, (_, i) =>
        request(app)
          .post('/api/conversations')
          .set('X-Session-ID', sessionId)
          .send({
            title: `Concurrent Conversation ${i}`,
            initialModel: 'gpt-4',
          })
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All requests should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(201);
        expect(response.body.id).toBeDefined();
      });

      // Should complete within reasonable time (adjust threshold as needed)
      expect(totalTime).toBeLessThan(5000); // 5 seconds

      // Verify all conversations were created
      const getResponse = await request(app)
        .get('/api/conversations')
        .set('X-Session-ID', sessionId)
        .expect(200);

      expect(getResponse.body.conversations).toHaveLength(concurrentRequests);
    });

    it('should maintain stable memory usage under load', async () => {
      const initialMemory = process.memoryUsage();

      // Perform multiple operations
      for (let i = 0; i < 50; i++) {
        await request(app)
          .post('/api/conversations')
          .set('X-Session-ID', sessionId)
          .send({
            title: `Load Test Conversation ${i}`,
            initialModel: 'gpt-4',
          })
          .expect(201);
      }

      const finalMemory = process.memoryUsage();
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;

      // Memory growth should be reasonable (adjust threshold as needed)
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024); // 50MB
    });

    it('should meet response time requirements', async () => {
      const measurements: number[] = [];

      // Measure response times for multiple requests
      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();

        await request(app).get('/api/models').expect(200);

        const endTime = Date.now();
        measurements.push(endTime - startTime);
      }

      const averageTime =
        measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const p95Time = measurements.sort((a, b) => a - b)[
        Math.floor(measurements.length * 0.95)
      ];

      // Response time requirements
      expect(averageTime).toBeLessThan(100); // Average < 100ms
      expect(p95Time).toBeLessThan(200); // P95 < 200ms
    });
  });

  describe('Error Handling and Resilience', () => {
    let sessionId: string;

    beforeEach(async () => {
      const sessionResponse = await request(app)
        .post('/api/session')
        .expect(201);
      sessionId = sessionResponse.body.sessionId;
    });

    it('should handle invalid session IDs gracefully', async () => {
      await request(app)
        .get('/api/conversations')
        .set('X-Session-ID', 'invalid-session-id')
        .expect(400);
    });

    it('should handle missing session headers', async () => {
      await request(app).get('/api/conversations').expect(400);
    });

    it('should handle non-existent conversation IDs', async () => {
      await request(app)
        .get('/api/conversations/non-existent-id')
        .set('X-Session-ID', sessionId)
        .expect(404);
    });

    it('should handle malformed request bodies', async () => {
      await request(app)
        .post('/api/conversations')
        .set('X-Session-ID', sessionId)
        .send('invalid json')
        .expect(400);
    });

    it('should implement rate limiting', async () => {
      // Make many requests quickly to trigger rate limiting
      const promises = Array.from({ length: 100 }, () =>
        request(app).get('/api/models').set('X-Session-ID', sessionId)
      );

      const responses = await Promise.all(
        promises.map((p) => p.catch((err) => err.response))
      );

      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter((r) => r?.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Security Validation', () => {
    it('should include security headers', async () => {
      const response = await request(app).get('/health').expect(200);

      // Check for security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-xss-protection']).toBeDefined();
      expect(response.headers['strict-transport-security']).toBeDefined();
    });

    it('should sanitize error responses', async () => {
      const response = await request(app)
        .get('/api/conversations/invalid-id')
        .set('X-Session-ID', 'test-session')
        .expect(404);

      // Error response should not contain sensitive information
      expect(response.body.error).toBeDefined();
      expect(response.body.error).not.toMatch(/stack|trace|internal/i);
      expect(response.body.correlationId).toBeDefined();
    });

    it('should validate input parameters', async () => {
      const sessionResponse = await request(app)
        .post('/api/session')
        .expect(201);
      const sessionId = sessionResponse.body.sessionId;

      // Test SQL injection attempt
      await request(app)
        .post('/api/conversations')
        .set('X-Session-ID', sessionId)
        .send({
          title: "'; DROP TABLE conversations; --",
          initialModel: 'gpt-4',
        })
        .expect(400);

      // Test XSS attempt
      await request(app)
        .post('/api/conversations')
        .set('X-Session-ID', sessionId)
        .send({
          title: '<script>alert("xss")</script>',
          initialModel: 'gpt-4',
        })
        .expect(400);
    });
  });

  describe('Monorepo Build and Deployment Validation', () => {
    it('should have proper workspace configuration', async () => {
      // This test validates that the monorepo structure is working
      const response = await request(app).get('/health').expect(200);

      expect(response.body.version).toBeDefined();
      expect(response.body.environment).toBeDefined();
    });

    it('should serve frontend assets from backend', async () => {
      // Test that backend can serve frontend static assets
      const response = await request(app).get('/').expect(200);

      expect(response.headers['content-type']).toMatch(/text\/html/);
    });

    it('should handle API routes without conflicts', async () => {
      // Ensure API routes don't conflict with frontend routing
      const _apiResponse = await request(app).get('/api/health').expect(404); // Should not exist, /health is the correct endpoint

      const healthResponse = await request(app).get('/health').expect(200);

      expect(healthResponse.body.status).toBe('healthy');
    });
  });
});
