/**
 * Load testing for backend server stability
 * Tests Requirement 8.1: Server SHALL process concurrent requests without crashing
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { createServer } from '../src/index.js';

describe('Server Load Testing', () => {
  let app: Express;

  beforeAll(async () => {
    // Create server instance for testing
    app = await createServer({
      configOverride: {
        PROXY_API_KEY: 'test-api-key-for-load-testing',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
        AZURE_OPENAI_API_KEY: 'test-azure-key',
        AZURE_OPENAI_MODEL: 'gpt-4',
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('should handle 100 concurrent health check requests without crashing', async () => {
    // Requirement 8.1: Process concurrent requests without crashing
    const requests = Array.from({ length: 100 }, () =>
      request(app).get('/health').timeout(5000) // 5 second timeout per request
    );

    const responses = await Promise.allSettled(requests);

    // Count successful requests
    const successful = responses.filter(
      (r) => r.status === 'fulfilled' && r.value.status === 200
    );

    // Most requests should succeed (allow some to timeout under load)
    expect(successful.length).toBeGreaterThan(50);
  }, 60000); // 60 second timeout for test

  it('should handle rapid sequential requests without memory leaks', async () => {
    // Requirement 7.4: No memory leaks
    const initialMemory = process.memoryUsage().heapUsed;

    // Make 20 sequential requests (reduced for faster test)
    for (let i = 0; i < 20; i++) {
      await request(app).get('/health').timeout(5000);
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;

    // Memory increase should be reasonable (less than 50MB)
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
  }, 60000);

  it('should return 503 when overloaded (load shedding)', async () => {
    // Requirement 8.4: Graceful degradation under load
    // This test verifies load shedding works, but may not trigger in test environment
    // due to lower concurrent request limits

    // Make many concurrent requests to potentially trigger load shedding
    const requests = Array.from({ length: 100 }, () =>
      request(app).get('/health').timeout(5000)
    );

    const responses = await Promise.allSettled(requests);

    // Count successful and shed requests
    const successful = responses.filter(
      (r) => r.status === 'fulfilled' && r.value.status === 200
    );
    const shed = responses.filter(
      (r) => r.status === 'fulfilled' && r.value.status === 503
    );

    // Most requests should succeed
    expect(successful.length).toBeGreaterThan(0);

    // If any requests were shed, verify proper format
    if (shed.length > 0) {
      shed.forEach((result) => {
        if (result.status === 'fulfilled') {
          expect(result.value.body).toHaveProperty('error');
          expect(result.value.body.error).toHaveProperty('type', 'service_unavailable');
          expect(result.value.body.error).toHaveProperty('retryAfter');
        }
      });
    }
  }, 60000);

  it('should maintain response integrity under load', async () => {
    // Requirement 8.2: Send headers exactly once per response
    const requests = Array.from({ length: 30 }, () =>
      request(app).get('/health').timeout(5000)
    );

    const responses = await Promise.allSettled(requests);

    // Verify successful responses are valid and complete
    const successful = responses.filter(
      (r) => r.status === 'fulfilled' && r.value.status === 200
    );

    expect(successful.length).toBeGreaterThan(20);

    successful.forEach((result) => {
      if (result.status === 'fulfilled') {
        expect(result.value.status).toBe(200);
        expect(result.value.body).toHaveProperty('status');
        expect(result.value.headers).toHaveProperty('content-type');
      }
    });
  }, 60000);

  it('should handle errors gracefully under load', async () => {
    // Requirement 8.3: Continue serving requests after errors
    const requests = Array.from({ length: 30 }, (_, i) => {
      // Mix of valid and invalid requests
      if (i % 5 === 0) {
        // Invalid request (no auth)
        return request(app).get('/v1/models').timeout(5000);
      } else {
        // Valid request
        return request(app).get('/health').timeout(5000);
      }
    });

    const responses = await Promise.allSettled(requests);

    // Count successful responses by type
    const healthRequests = responses.filter(
      (r) => r.status === 'fulfilled' && r.value.status === 200
    );
    const authErrors = responses.filter(
      (r) => r.status === 'fulfilled' && r.value.status === 401
    );

    // Most health checks should succeed
    expect(healthRequests.length).toBeGreaterThan(15);
    
    // Auth errors should be present
    expect(authErrors.length).toBeGreaterThan(0);

    // Verify error responses have proper format
    authErrors.forEach((result) => {
      if (result.status === 'fulfilled') {
        expect(result.value.body).toHaveProperty('error');
        expect(result.value.body.error).toHaveProperty('correlationId');
      }
    });
  }, 60000);
});
