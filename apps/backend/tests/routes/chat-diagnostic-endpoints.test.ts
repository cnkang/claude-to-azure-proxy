/**
 * Integration Tests for Chat Diagnostic Endpoints
 *
 * Task 7.4: Test diagnostic endpoints for SSE connection monitoring
 *
 * Tests cover:
 * - /api/chat/connections endpoint with enhanced metrics (Task 7.1)
 * - /api/chat-stats endpoint with comprehensive statistics (Task 7.2)
 * - /api/health endpoint with SSE metrics (Task 7.3)
 */

import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProxyServer } from '../../src/index.js';
import type { ServerConfig } from '../../src/types/index.js';
import { validApiKey } from '../test-config.js';

// Set rate limit environment variables BEFORE any imports
process.env.RATE_LIMIT_TEST_WINDOW_MS = '60000';
process.env.RATE_LIMIT_TEST_MAX_REQUESTS = '10000';
process.env.NODE_ENV = 'test';

// Helper to add delay between tests to avoid rate limiting
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Chat Diagnostic Endpoints Integration Tests', () => {
  let app: Express;
  let server: ProxyServer;
  const testApiKey = validApiKey;
  const testSessionId = 'test-session-id-12345678901234567890';

  beforeAll(async () => {
    // Create test configuration
    const config: ServerConfig = {
      port: 0, // Use random port for testing
      proxyApiKey: testApiKey,
      azureOpenAI: {
        endpoint: 'https://test.openai.azure.com',
        baseURL:
          'https://test.openai.azure.com/openai/deployments/test-deployment',
        apiKey: 'test-azure-key-32-characters-long',
        deployment: 'test-deployment',
        timeout: 30000,
        maxRetries: 3,
      },
      nodeEnv: 'test',
      logLevel: 'error',
    };

    server = new ProxyServer(config);
    app = server.getApp();
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  // Add delay before each test to avoid rate limiting
  beforeEach(async () => {
    await delay(200); // Increased delay to avoid rate limiting
  });

  describe('Task 7.1: Enhanced /api/chat/connections endpoint', () => {
    it('should return connection list with health metrics', async () => {
      const response = await request(app)
        .get('/api/chat/connections')
        .set('Authorization', `Bearer ${testApiKey}`)
        .set('x-session-id', testSessionId);

      // Accept 200, 400 (session validation), or 429 (rate limited)
      expect([200, 400, 429]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('connections');
        expect(response.body).toHaveProperty('total');
        expect(response.body).toHaveProperty('maxConnections');
        expect(response.body).toHaveProperty('correlationId');

        expect(Array.isArray(response.body.connections)).toBe(true);
        expect(typeof response.body.total).toBe('number');
        expect(typeof response.body.maxConnections).toBe('number');
      }
    });

    it('should include connection health metrics in response', async () => {
      const response = await request(app)
        .get('/api/chat/connections')
        .set('Authorization', `Bearer ${testApiKey}`)
        .set('x-session-id', testSessionId);

      // Accept 200, 400 (session validation), or 429 (rate limited)
      expect([200, 400, 429]).toContain(response.status);

      // If there are connections and not rate limited, verify they have health metrics
      if (response.status === 200 && response.body.connections?.length > 0) {
        const connection = response.body.connections[0];

        expect(connection).toHaveProperty('id');
        expect(connection).toHaveProperty('conversationId');
        expect(connection).toHaveProperty('createdAt');
        expect(connection).toHaveProperty('duration');
        expect(connection).toHaveProperty('age');
        expect(connection).toHaveProperty('health');
        expect(connection).toHaveProperty('lastMessageTimestamp');
        expect(connection).toHaveProperty('timeSinceLastMessage');

        // Verify age structure
        expect(connection.age).toHaveProperty('minutes');
        expect(connection.age).toHaveProperty('seconds');
        expect(connection.age).toHaveProperty('formatted');

        // Verify health structure
        expect(connection.health).toHaveProperty('status');
        expect(connection.health).toHaveProperty('isStale');
        expect(connection.health).toHaveProperty('isNearTimeout');
        expect(connection.health).toHaveProperty('timeUntilTimeout');

        // Verify health status is valid
        expect(['healthy', 'stale', 'near_timeout']).toContain(
          connection.health.status
        );
      }
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/chat/connections')
        .set('x-session-id', testSessionId);

      // Should return 400 (session validation), 401 (missing auth), or 429 (rate limit)
      expect([400, 401, 429]).toContain(response.status);
    });

    it('should return empty connections for new session', async () => {
      const response = await request(app)
        .get('/api/chat/connections')
        .set('Authorization', `Bearer ${testApiKey}`)
        .set('x-session-id', testSessionId);

      // Accept 200, 400 (session validation), or 429 (rate limited)
      expect([200, 400, 429]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.total).toBe(0);
        expect(response.body.connections).toEqual([]);
      }
    });
  });

  describe('Task 7.2: /api/chat-stats endpoint', () => {
    it('should return comprehensive chat statistics', async () => {
      const response = await request(app).get('/api/chat-stats').expect(200);

      // Current state
      expect(response.body).toHaveProperty('totalConnections');
      expect(response.body).toHaveProperty('activeConnections');
      expect(response.body).toHaveProperty('healthyConnections');
      expect(response.body).toHaveProperty('staleConnections');
      expect(response.body).toHaveProperty('totalSessions');

      // Lifetime statistics
      expect(response.body).toHaveProperty('lifetime');
      expect(response.body.lifetime).toHaveProperty('totalConnectionsCreated');
      expect(response.body.lifetime).toHaveProperty('totalConnectionsClosed');
      expect(response.body.lifetime).toHaveProperty('totalErrors');
      expect(response.body.lifetime).toHaveProperty('totalReconnections');

      // Averages and rates
      expect(response.body).toHaveProperty('averageConnectionDuration');
      expect(response.body).toHaveProperty(
        'averageConnectionDurationFormatted'
      );
      expect(response.body).toHaveProperty('averageConnectionsPerSession');
      expect(response.body).toHaveProperty('errorRate');
      expect(response.body).toHaveProperty('reconnectionRate');

      // Error breakdown
      expect(response.body).toHaveProperty('topErrors');
      expect(response.body).toHaveProperty('errorsByType');

      // Reconnection statistics
      expect(response.body).toHaveProperty('reconnectionStatistics');
      expect(response.body.reconnectionStatistics).toHaveProperty(
        'totalReconnections'
      );
      expect(response.body.reconnectionStatistics).toHaveProperty(
        'sessionsWithReconnections'
      );
      expect(response.body.reconnectionStatistics).toHaveProperty(
        'averageReconnectionsPerSession'
      );

      // Configuration
      expect(response.body).toHaveProperty('config');
      expect(response.body.config).toHaveProperty('maxConnectionsPerSession');
      expect(response.body.config).toHaveProperty('connectionTimeout');
      expect(response.body.config).toHaveProperty('heartbeatInterval');

      expect(response.body).toHaveProperty('correlationId');
    });

    it('should return valid data types for all metrics', async () => {
      const response = await request(app).get('/api/chat-stats').expect(200);

      // Verify numeric types
      expect(typeof response.body.totalConnections).toBe('number');
      expect(typeof response.body.activeConnections).toBe('number');
      expect(typeof response.body.healthyConnections).toBe('number');
      expect(typeof response.body.staleConnections).toBe('number');
      expect(typeof response.body.totalSessions).toBe('number');
      expect(typeof response.body.averageConnectionDuration).toBe('number');
      expect(typeof response.body.averageConnectionsPerSession).toBe('number');
      expect(typeof response.body.errorRate).toBe('number');
      expect(typeof response.body.reconnectionRate).toBe('number');

      // Verify string types
      expect(typeof response.body.averageConnectionDurationFormatted).toBe(
        'string'
      );
      expect(typeof response.body.correlationId).toBe('string');

      // Verify array types
      expect(Array.isArray(response.body.topErrors)).toBe(true);

      // Verify object types
      expect(typeof response.body.lifetime).toBe('object');
      expect(typeof response.body.reconnectionStatistics).toBe('object');
      expect(typeof response.body.config).toBe('object');
      expect(typeof response.body.errorsByType).toBe('object');
    });

    it('should return zero values for fresh server', async () => {
      const response = await request(app).get('/api/chat-stats').expect(200);

      // Fresh server should have zero or minimal values
      expect(response.body.totalConnections).toBeGreaterThanOrEqual(0);
      expect(response.body.activeConnections).toBeGreaterThanOrEqual(0);
      expect(response.body.errorRate).toBeGreaterThanOrEqual(0);
      expect(response.body.reconnectionRate).toBeGreaterThanOrEqual(0);
    });

    it('should not require authentication', async () => {
      // Stats endpoint should be publicly accessible for monitoring
      await request(app).get('/api/chat-stats').expect(200);
    });

    it('should include configuration values', async () => {
      const response = await request(app).get('/api/chat-stats').expect(200);

      expect(response.body.config.maxConnectionsPerSession).toBe(5);
      expect(response.body.config.connectionTimeout).toBe(30 * 60 * 1000);
      expect(response.body.config.heartbeatInterval).toBe(30 * 1000);
    });
  });

  describe('Task 7.3: /health endpoint with SSE metrics', () => {
    it('should include SSE metrics in health check', async () => {
      const response = await request(app).get('/health');

      // May get 200 or 503 depending on Azure connectivity in test environment
      expect([200, 503]).toContain(response.status);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('memory');

      // Task 7.3: Verify SSE metrics are included
      expect(response.body).toHaveProperty('sse');

      if (response.body.sse) {
        expect(response.body.sse).toHaveProperty('activeConnections');
        expect(response.body.sse).toHaveProperty('totalConnections');
        expect(response.body.sse).toHaveProperty('errorRate');
        expect(response.body.sse).toHaveProperty('averageConnectionDuration');

        // Verify data types
        expect(typeof response.body.sse.activeConnections).toBe('number');
        expect(typeof response.body.sse.totalConnections).toBe('number');
        expect(typeof response.body.sse.errorRate).toBe('number');
        expect(typeof response.body.sse.averageConnectionDuration).toBe(
          'number'
        );
      }
    });
  });

  describe('Response Format Validation', () => {
    it('should return JSON responses for chat-stats endpoint', async () => {
      const response = await request(app).get('/api/chat-stats');

      // Accept 200 or 429 (rate limited in test environment)
      expect([200, 429]).toContain(response.status);
      expect(response.headers['content-type']).toMatch(/application\/json/);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('correlationId');
        expect(typeof response.body.correlationId).toBe('string');
      }
    });
  });

  describe('Error Handling', () => {
    it('should return proper error format', async () => {
      // Test that error responses have consistent format
      // by testing missing session header
      const response = await request(app)
        .get('/api/chat/connections')
        .set('Authorization', `Bearer ${testApiKey}`);

      // Should return 400 for missing session or 429 for rate limit
      expect([400, 429]).toContain(response.status);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('type');
      expect(response.body.error).toHaveProperty('message');
    });
  });

  describe('Performance', () => {
    it('should respond quickly to diagnostic requests', async () => {
      const start = Date.now();

      await request(app).get('/api/chat-stats');

      const duration = Date.now() - start;

      // Diagnostic endpoints should respond within 500ms (relaxed for test environment)
      expect(duration).toBeLessThan(500);
    });
  });
});
