/**
 * End-to-End Performance Tests
 *
 * Comprehensive performance testing for the complete application
 * including frontend-backend integration, streaming performance,
 * memory usage, and scalability testing.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach as _beforeEach,
} from 'vitest';
import request from 'supertest';
import { createServer } from '../../src/index.js';
import type { Express } from 'express';

describe('End-to-End Performance Tests', () => {
  let app: Express;
  let server: any;

  beforeAll(async () => {
    app = await createServer();
    server = app.listen(0);
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
  });

  describe('Response Time Performance', () => {
    it('should meet API response time requirements', async () => {
      const measurements: number[] = [];
      const iterations = 20;

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();

        await request(app).get('/health').expect(200);

        const endTime = Date.now();
        measurements.push(endTime - startTime);
      }

      const averageTime =
        measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const p95Time = measurements.sort((a, b) => a - b)[
        Math.floor(measurements.length * 0.95)
      ];
      const p99Time = measurements.sort((a, b) => a - b)[
        Math.floor(measurements.length * 0.99)
      ];

      console.log(`Health endpoint performance:`, {
        average: `${averageTime.toFixed(2)}ms`,
        p95: `${p95Time.toFixed(2)}ms`,
        p99: `${p99Time.toFixed(2)}ms`,
      });

      // Performance requirements
      expect(averageTime).toBeLessThan(50); // Average < 50ms
      expect(p95Time).toBeLessThan(100); // P95 < 100ms
      expect(p99Time).toBeLessThan(200); // P99 < 200ms
    });

    it('should meet model API response time requirements', async () => {
      const measurements: number[] = [];
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
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

      console.log(`Models API performance:`, {
        average: `${averageTime.toFixed(2)}ms`,
        p95: `${p95Time.toFixed(2)}ms`,
      });

      expect(averageTime).toBeLessThan(100); // Average < 100ms
      expect(p95Time).toBeLessThan(200); // P95 < 200ms
    });

    it('should meet session creation performance requirements', async () => {
      const measurements: number[] = [];
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();

        await request(app).post('/api/session').expect(201);

        const endTime = Date.now();
        measurements.push(endTime - startTime);
      }

      const averageTime =
        measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const p95Time = measurements.sort((a, b) => a - b)[
        Math.floor(measurements.length * 0.95)
      ];

      console.log(`Session creation performance:`, {
        average: `${averageTime.toFixed(2)}ms`,
        p95: `${p95Time.toFixed(2)}ms`,
      });

      expect(averageTime).toBeLessThan(150); // Average < 150ms
      expect(p95Time).toBeLessThan(300); // P95 < 300ms
    });
  });

  describe('Concurrent Request Performance', () => {
    it('should handle concurrent session creation efficiently', async () => {
      const concurrentRequests = 20;
      const startTime = Date.now();

      const promises = Array.from({ length: concurrentRequests }, () =>
        request(app).post('/api/session').expect(201)
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      console.log(`Concurrent session creation:`, {
        requests: concurrentRequests,
        totalTime: `${totalTime}ms`,
        averagePerRequest: `${(totalTime / concurrentRequests).toFixed(2)}ms`,
      });

      // All requests should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(201);
        expect(response.body.sessionId).toBeDefined();
      });

      // Should complete within reasonable time
      expect(totalTime).toBeLessThan(5000); // 5 seconds total
      expect(totalTime / concurrentRequests).toBeLessThan(250); // 250ms average per request
    });

    it('should handle concurrent conversation operations', async () => {
      // Create a session first
      const sessionResponse = await request(app)
        .post('/api/session')
        .expect(201);
      const sessionId = sessionResponse.body.sessionId;

      const concurrentRequests = 15;
      const startTime = Date.now();

      // Create multiple conversations concurrently
      const promises = Array.from({ length: concurrentRequests }, (_, i) =>
        request(app)
          .post('/api/conversations')
          .set('X-Session-ID', sessionId)
          .send({
            title: `Concurrent Conversation ${i}`,
            initialModel: 'gpt-4',
          })
          .expect(201)
      );

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      console.log(`Concurrent conversation creation:`, {
        requests: concurrentRequests,
        totalTime: `${totalTime}ms`,
        averagePerRequest: `${(totalTime / concurrentRequests).toFixed(2)}ms`,
      });

      // All requests should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(201);
        expect(response.body.id).toBeDefined();
      });

      expect(totalTime).toBeLessThan(8000); // 8 seconds total
      expect(totalTime / concurrentRequests).toBeLessThan(500); // 500ms average per request
    });

    it('should handle mixed API operations concurrently', async () => {
      const sessionResponse = await request(app)
        .post('/api/session')
        .expect(201);
      const sessionId = sessionResponse.body.sessionId;

      const startTime = Date.now();

      // Mix of different operations
      const promises = [
        // Health checks
        ...Array.from({ length: 5 }, () => request(app).get('/health')),
        // Model requests
        ...Array.from({ length: 5 }, () => request(app).get('/api/models')),
        // Config requests
        ...Array.from({ length: 3 }, () => request(app).get('/api/config')),
        // Conversation operations
        ...Array.from({ length: 7 }, (_, i) =>
          request(app)
            .post('/api/conversations')
            .set('X-Session-ID', sessionId)
            .send({
              title: `Mixed Test Conversation ${i}`,
              initialModel: 'gpt-4',
            })
        ),
      ];

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      console.log(`Mixed concurrent operations:`, {
        totalRequests: promises.length,
        totalTime: `${totalTime}ms`,
        averagePerRequest: `${(totalTime / promises.length).toFixed(2)}ms`,
      });

      // All requests should succeed
      responses.forEach((response) => {
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);
      });

      expect(totalTime).toBeLessThan(10000); // 10 seconds total
    });
  });

  describe('Memory Usage Performance', () => {
    it('should maintain stable memory usage during sustained operations', async () => {
      const initialMemory = process.memoryUsage();

      const sessionResponse = await request(app)
        .post('/api/session')
        .expect(201);
      const sessionId = sessionResponse.body.sessionId;

      // Perform sustained operations
      const operations = 100;
      for (let i = 0; i < operations; i++) {
        await request(app)
          .post('/api/conversations')
          .set('X-Session-ID', sessionId)
          .send({
            title: `Memory Test Conversation ${i}`,
            initialModel: 'gpt-4',
          })
          .expect(201);

        // Periodically check memory
        if (i % 20 === 0) {
          const currentMemory = process.memoryUsage();
          const heapGrowth = currentMemory.heapUsed - initialMemory.heapUsed;

          // Memory growth should be reasonable
          expect(heapGrowth).toBeLessThan(100 * 1024 * 1024); // 100MB
        }
      }

      const finalMemory = process.memoryUsage();
      const totalHeapGrowth = finalMemory.heapUsed - initialMemory.heapUsed;

      console.log(`Memory usage during sustained operations:`, {
        initial: `${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        final: `${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        growth: `${(totalHeapGrowth / 1024 / 1024).toFixed(2)} MB`,
        operations,
      });

      // Total memory growth should be reasonable
      expect(totalHeapGrowth).toBeLessThan(150 * 1024 * 1024); // 150MB for 100 operations
    });

    it('should handle memory cleanup for large payloads', async () => {
      const initialMemory = process.memoryUsage();

      const sessionResponse = await request(app)
        .post('/api/session')
        .expect(201);
      const sessionId = sessionResponse.body.sessionId;

      // Create conversations with large titles
      const largeTitle = 'A'.repeat(10000); // 10KB title
      const operations = 20;

      for (let i = 0; i < operations; i++) {
        await request(app)
          .post('/api/conversations')
          .set('X-Session-ID', sessionId)
          .send({
            title: `${largeTitle} ${i}`,
            initialModel: 'gpt-4',
          })
          .expect(201);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;

      console.log(`Memory usage with large payloads:`, {
        initial: `${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        final: `${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        growth: `${(memoryGrowth / 1024 / 1024).toFixed(2)} MB`,
        payloadSize: `${((largeTitle.length * operations) / 1024).toFixed(2)} KB`,
      });

      // Memory growth should be proportional to payload size
      const expectedGrowth = largeTitle.length * operations * 2; // Allow 2x overhead
      expect(memoryGrowth).toBeLessThan(expectedGrowth);
    });
  });

  describe('Streaming Performance', () => {
    it('should establish SSE connections quickly', async () => {
      const sessionResponse = await request(app)
        .post('/api/session')
        .expect(201);
      const sessionId = sessionResponse.body.sessionId;

      const convResponse = await request(app)
        .post('/api/conversations')
        .set('X-Session-ID', sessionId)
        .send({
          title: 'SSE Test Conversation',
          initialModel: 'gpt-4',
        })
        .expect(201);
      const conversationId = convResponse.body.id;

      const measurements: number[] = [];
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();

        const response = await request(app)
          .get(`/api/chat/stream/${conversationId}`)
          .set('X-Session-ID', sessionId)
          .set('Accept', 'text/event-stream')
          .expect(200);

        const endTime = Date.now();
        measurements.push(endTime - startTime);

        expect(response.headers['content-type']).toMatch(/text\/event-stream/);
      }

      const averageTime =
        measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const p95Time = measurements.sort((a, b) => a - b)[
        Math.floor(measurements.length * 0.95)
      ];

      console.log(`SSE connection establishment:`, {
        average: `${averageTime.toFixed(2)}ms`,
        p95: `${p95Time.toFixed(2)}ms`,
      });

      expect(averageTime).toBeLessThan(100); // Average < 100ms
      expect(p95Time).toBeLessThan(200); // P95 < 200ms
    });

    it('should handle multiple concurrent SSE connections', async () => {
      const sessionResponse = await request(app)
        .post('/api/session')
        .expect(201);
      const sessionId = sessionResponse.body.sessionId;

      // Create multiple conversations
      const conversationPromises = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post('/api/conversations')
          .set('X-Session-ID', sessionId)
          .send({
            title: `SSE Concurrent Test ${i}`,
            initialModel: 'gpt-4',
          })
          .expect(201)
      );

      const conversations = await Promise.all(conversationPromises);
      const startTime = Date.now();

      // Establish multiple SSE connections concurrently
      const ssePromises = conversations.map((conv) =>
        request(app)
          .get(`/api/chat/stream/${conv.body.id}`)
          .set('X-Session-ID', sessionId)
          .set('Accept', 'text/event-stream')
          .expect(200)
      );

      const responses = await Promise.all(ssePromises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      console.log(`Concurrent SSE connections:`, {
        connections: responses.length,
        totalTime: `${totalTime}ms`,
        averagePerConnection: `${(totalTime / responses.length).toFixed(2)}ms`,
      });

      // All connections should be established successfully
      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/text\/event-stream/);
      });

      expect(totalTime).toBeLessThan(2000); // 2 seconds total
      expect(totalTime / responses.length).toBeLessThan(400); // 400ms average per connection
    });
  });

  describe('File Upload Performance', () => {
    it('should handle file uploads efficiently', async () => {
      const sessionResponse = await request(app)
        .post('/api/session')
        .expect(201);
      const sessionId = sessionResponse.body.sessionId;

      const fileSizes = [1024, 10240, 102400, 1048576]; // 1KB, 10KB, 100KB, 1MB
      const measurements: { size: number; time: number }[] = [];

      for (const size of fileSizes) {
        const fileContent = Buffer.alloc(size, 'a');
        const startTime = Date.now();

        await request(app)
          .post('/api/upload')
          .set('X-Session-ID', sessionId)
          .attach('file', fileContent, `test-${size}.txt`)
          .expect(200);

        const endTime = Date.now();
        measurements.push({ size, time: endTime - startTime });
      }

      console.log(
        `File upload performance:`,
        measurements.map((m) => ({
          size: `${(m.size / 1024).toFixed(0)}KB`,
          time: `${m.time}ms`,
          throughput: `${(m.size / 1024 / (m.time / 1000)).toFixed(2)} KB/s`,
        }))
      );

      // Upload time should scale reasonably with file size
      measurements.forEach((measurement) => {
        const expectedMaxTime = Math.max(100, measurement.size / 1024); // 1ms per KB, min 100ms
        expect(measurement.time).toBeLessThan(expectedMaxTime);
      });
    });

    it('should handle concurrent file uploads', async () => {
      const sessionResponse = await request(app)
        .post('/api/session')
        .expect(201);
      const sessionId = sessionResponse.body.sessionId;

      const fileSize = 50 * 1024; // 50KB
      const concurrentUploads = 5;
      const startTime = Date.now();

      const promises = Array.from({ length: concurrentUploads }, (_, i) => {
        const fileContent = Buffer.alloc(fileSize, String.fromCharCode(65 + i)); // Different content
        return request(app)
          .post('/api/upload')
          .set('X-Session-ID', sessionId)
          .attach('file', fileContent, `concurrent-${i}.txt`)
          .expect(200);
      });

      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      console.log(`Concurrent file uploads:`, {
        uploads: concurrentUploads,
        fileSize: `${(fileSize / 1024).toFixed(0)}KB each`,
        totalTime: `${totalTime}ms`,
        averagePerUpload: `${(totalTime / concurrentUploads).toFixed(2)}ms`,
      });

      // All uploads should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body.fileId).toBeDefined();
      });

      expect(totalTime).toBeLessThan(5000); // 5 seconds total
    });
  });

  describe('Database/Storage Performance', () => {
    it('should handle conversation queries efficiently', async () => {
      const sessionResponse = await request(app)
        .post('/api/session')
        .expect(201);
      const sessionId = sessionResponse.body.sessionId;

      // Create multiple conversations
      const conversationCount = 50;
      for (let i = 0; i < conversationCount; i++) {
        await request(app)
          .post('/api/conversations')
          .set('X-Session-ID', sessionId)
          .send({
            title: `Query Performance Test ${i}`,
            initialModel: 'gpt-4',
          })
          .expect(201);
      }

      // Measure query performance
      const measurements: number[] = [];
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();

        const response = await request(app)
          .get('/api/conversations')
          .set('X-Session-ID', sessionId)
          .expect(200);

        const endTime = Date.now();
        measurements.push(endTime - startTime);

        expect(response.body.conversations).toHaveLength(conversationCount);
      }

      const averageTime =
        measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const p95Time = measurements.sort((a, b) => a - b)[
        Math.floor(measurements.length * 0.95)
      ];

      console.log(
        `Conversation query performance (${conversationCount} conversations):`,
        {
          average: `${averageTime.toFixed(2)}ms`,
          p95: `${p95Time.toFixed(2)}ms`,
        }
      );

      expect(averageTime).toBeLessThan(200); // Average < 200ms
      expect(p95Time).toBeLessThan(400); // P95 < 400ms
    });
  });

  describe('Error Handling Performance', () => {
    it('should handle errors efficiently without performance degradation', async () => {
      const measurements: number[] = [];
      const iterations = 20;

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();

        // Make request that will result in 404
        await request(app)
          .get('/api/conversations/non-existent-id')
          .set('X-Session-ID', 'test-session')
          .expect(404);

        const endTime = Date.now();
        measurements.push(endTime - startTime);
      }

      const averageTime =
        measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const p95Time = measurements.sort((a, b) => a - b)[
        Math.floor(measurements.length * 0.95)
      ];

      console.log(`Error handling performance:`, {
        average: `${averageTime.toFixed(2)}ms`,
        p95: `${p95Time.toFixed(2)}ms`,
      });

      // Error responses should be fast
      expect(averageTime).toBeLessThan(50); // Average < 50ms
      expect(p95Time).toBeLessThan(100); // P95 < 100ms
    });
  });

  describe('Scalability Testing', () => {
    it('should maintain performance under increasing load', async () => {
      const loadLevels = [1, 5, 10, 20];
      const results: { load: number; averageTime: number; p95Time: number }[] =
        [];

      for (const load of loadLevels) {
        const measurements: number[] = [];

        // Create session for this load test
        const sessionResponse = await request(app)
          .post('/api/session')
          .expect(201);
        const sessionId = sessionResponse.body.sessionId;

        // Test with current load level
        for (let i = 0; i < 5; i++) {
          // 5 iterations per load level
          const startTime = Date.now();

          const promises = Array.from({ length: load }, (_, j) =>
            request(app)
              .post('/api/conversations')
              .set('X-Session-ID', sessionId)
              .send({
                title: `Scalability Test Load ${load} Request ${j}`,
                initialModel: 'gpt-4',
              })
              .expect(201)
          );

          await Promise.all(promises);
          const endTime = Date.now();
          measurements.push((endTime - startTime) / load); // Average time per request
        }

        const averageTime =
          measurements.reduce((a, b) => a + b, 0) / measurements.length;
        const p95Time = measurements.sort((a, b) => a - b)[
          Math.floor(measurements.length * 0.95)
        ];

        results.push({ load, averageTime, p95Time });
      }

      console.log(
        `Scalability test results:`,
        results.map((r) => ({
          load: r.load,
          averageTime: `${r.averageTime.toFixed(2)}ms`,
          p95Time: `${r.p95Time.toFixed(2)}ms`,
        }))
      );

      // Performance should not degrade significantly with increased load
      for (let i = 1; i < results.length; i++) {
        const degradation = results[i].averageTime / results[0].averageTime;
        expect(degradation).toBeLessThan(3); // No more than 3x degradation
      }
    });
  });
});
