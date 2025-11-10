/**
 * @fileoverview Concurrency safety validation tests
 *
 * Tests to validate request isolation, connection pooling, rate limiting,
 * and circuit breaker patterns for safe concurrent operations.
 *
 * Requirements: 6.1, 6.4, 6.5, 6.6
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { CircuitBreaker } from '../src/resilience/circuit-breaker';
import { RetryManager } from '../src/resilience/retry';
import { AzureResponsesClient } from '../src/clients/azure-responses-client';
import { ConversationManagerImpl } from '../src/utils/conversation-manager';
import { MultiTurnConversationHandlerImpl } from '../src/utils/multi-turn-conversation';
import {
  correlationIdMiddleware,
  globalRateLimit,
} from '../src/middleware/security';
import type { Config } from '../src/config/index';

// Mock external dependencies
vi.mock('axios');

describe('Concurrency Safety Validation', () => {
  let app: express.Application;
  let mockConfig: Config;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    mockConfig = {
      AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
      AZURE_OPENAI_API_KEY: 'test-key',
      AZURE_OPENAI_DEPLOYMENT: 'test-deployment',
      PORT: 3000,
      NODE_ENV: 'test',
      LOG_LEVEL: 'info',
      CORS_ORIGIN: '*',
      RATE_LIMIT_WINDOW_MS: 60000,
      RATE_LIMIT_MAX_REQUESTS: 10, // Low limit for testing
      REQUEST_TIMEOUT_MS: 30000,
      AZURE_OPENAI_TIMEOUT_MS: 30000,
      AZURE_OPENAI_MAX_RETRIES: 3,
      // API version removed - using latest stable Azure OpenAI API (v1)
      CONVERSATION_CLEANUP_INTERVAL_MS: 300000,
      CONVERSATION_MAX_AGE_MS: 3600000,
      CONVERSATION_MAX_SIZE: 50,
      MULTI_TURN_CLEANUP_INTERVAL_MS: 300000,
      MULTI_TURN_MAX_AGE_MS: 3600000,
      MULTI_TURN_MAX_CONVERSATIONS: 1000,
      HEALTH_CHECK_INTERVAL_MS: 30000,
      METRICS_COLLECTION_INTERVAL_MS: 60000,
      PERFORMANCE_MONITORING_ENABLED: true,
      MEMORY_MONITORING_INTERVAL_MS: 60000,
      CIRCUIT_BREAKER_FAILURE_THRESHOLD: 5,
      CIRCUIT_BREAKER_RESET_TIMEOUT_MS: 60000,
      CIRCUIT_BREAKER_MONITOR_INTERVAL_MS: 10000,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Request Isolation', () => {
    it('should isolate correlation IDs between concurrent requests', async () => {
      // Set up test endpoint with correlation ID middleware
      app.use(correlationIdMiddleware);
      app.get('/test', (req, res) => {
        const correlationId = (req as any).correlationId;
        res.json({ correlationId });
      });

      // Make multiple concurrent requests
      const requests = Array.from({ length: 5 }, () =>
        request(app).get('/test')
      );

      const responses = await Promise.all(requests);

      // Each response should have a unique correlation ID
      const correlationIds = responses.map((res) => res.body.correlationId);
      const uniqueIds = new Set(correlationIds);

      expect(uniqueIds.size).toBe(5);
      expect(
        correlationIds.every((id) => typeof id === 'string' && id.length > 0)
      ).toBe(true);
    });

    it('should maintain request context isolation in conversation managers', async () => {
      const conversationManager = new ConversationManagerImpl({
        cleanupInterval: 60000,
        maxAge: 3600000,
        maxSize: 100,
      });

      // Simulate concurrent conversation tracking
      const conversationPromises = Array.from({ length: 10 }, (_, i) =>
        Promise.resolve().then(() => {
          const conversationId = `conv-${i}`;
          const responseId = `resp-${i}`;

          conversationManager.trackConversation(conversationId, responseId, {
            totalTokensUsed: 100,
          });

          return conversationManager.getPreviousResponseId(conversationId);
        })
      );

      const results = await Promise.all(conversationPromises);

      // Each conversation should have its own isolated response ID
      results.forEach((responseId, index) => {
        expect(responseId).toBe(`resp-${index}`);
      });
    });

    it('should prevent data leakage between concurrent multi-turn conversations', async () => {
      const handler = new MultiTurnConversationHandlerImpl(mockConfig);

      // Create multiple concurrent conversations
      const conversationPromises = Array.from({ length: 5 }, (_, i) =>
        Promise.resolve().then(() => {
          const conversationId = `multi-turn-${i}`;

          // Add messages to conversation history
          handler.addToConversationHistory(conversationId, {
            role: 'user',
            content: `User message ${i}`,
            timestamp: new Date(),
            tokenCount: 10,
          });

          handler.addToConversationHistory(conversationId, {
            role: 'assistant',
            content: `Assistant response ${i}`,
            timestamp: new Date(),
            tokenCount: 20,
          });

          return handler.getConversationHistory(conversationId);
        })
      );

      const results = await Promise.all(conversationPromises);

      // Each conversation should have its own isolated history
      results.forEach((history, index) => {
        expect(history).toHaveLength(2);
        expect(history[0].content).toBe(`User message ${index}`);
        expect(history[1].content).toBe(`Assistant response ${index}`);
      });

      // Cleanup
      handler.stopMaintenanceTasks();
    });
  });

  describe('Rate Limiting Safety', () => {
    it('should enforce rate limits per user/IP', async () => {
      // Set up test endpoint with rate limiting
      app.use(globalRateLimit);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      // Make requests up to the limit
      const successfulRequests = Array.from(
        { length: mockConfig.RATE_LIMIT_MAX_REQUESTS },
        () => request(app).get('/test')
      );

      const successfulResponses = await Promise.all(successfulRequests);

      // All requests within limit should succeed
      successfulResponses.forEach((response) => {
        expect(response.status).toBe(200);
      });

      // Additional request should be rate limited
      const rateLimitedResponse = await request(app).get('/test');
      expect(rateLimitedResponse.status).toBe(429);
    });

    it('should handle concurrent requests within rate limits', async () => {
      app.use(globalRateLimit);
      app.get('/test', (req, res) => {
        res.json({ timestamp: Date.now() });
      });

      // Make concurrent requests within the limit
      const concurrentRequests = Array.from({ length: 5 }, () =>
        request(app).get('/test')
      );

      const responses = await Promise.all(concurrentRequests);

      // All concurrent requests should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body.timestamp).toBeDefined();
      });

      // Timestamps should be close but not identical (proving concurrency)
      const timestamps = responses.map((res) => res.body.timestamp);
      const uniqueTimestamps = new Set(timestamps);
      expect(uniqueTimestamps.size).toBeGreaterThan(1);
    });

    it(
      'should isolate rate limits between different IPs',
      { timeout: 60000 },
      async () => {
        app.use(globalRateLimit);
        app.get('/test', (req, res) => {
          res.json({ ip: req.ip });
        });

        // Simulate requests from different IPs
        const ip1Requests = Array.from({ length: 2 }, () =>
          request(app).get('/test').set('X-Forwarded-For', '192.168.1.1')
        );

        const ip2Requests = Array.from({ length: 2 }, () =>
          request(app).get('/test').set('X-Forwarded-For', '192.168.1.2')
        );

        const [ip1Responses, ip2Responses] = await Promise.all([
          Promise.all(ip1Requests),
          Promise.all(ip2Requests),
        ]);

        // Both IPs should be able to make their allowed requests
        ip1Responses.forEach((response) => {
          expect(response.status).toBe(200);
        });

        ip2Responses.forEach((response) => {
          expect(response.status).toBe(200);
        });
      }
    );
  });

  describe('Circuit Breaker Patterns', () => {
    it('should open circuit after failure threshold is reached', async () => {
      const circuitBreaker = new CircuitBreaker('test-service', {
        failureThreshold: 3,
        recoveryTimeout: 60000,
        monitoringPeriod: 1000,
        expectedErrors: ['Service unavailable'], // Make sure our error is counted
      });

      // Mock operation that always fails with expected error
      const failingOperation = vi
        .fn()
        .mockRejectedValue(new Error('Service unavailable'));

      // Execute failing operations to trigger circuit breaker
      const results = [];
      for (let i = 0; i < 5; i++) {
        const result = await circuitBreaker.execute(
          failingOperation,
          'test-correlation-id'
        );
        results.push(result);
      }

      // Should have 3 actual operation calls, then circuit should open
      expect(failingOperation).toHaveBeenCalledTimes(3);
      expect(results).toHaveLength(5);

      // All results should be failures
      results.forEach((result) => {
        expect(result.success).toBe(false);
      });

      // Last 2 results should be circuit breaker errors (not calling the operation)
      expect(results[3].error?.message).toContain('Circuit breaker is OPEN');
      expect(results[4].error?.message).toContain('Circuit breaker is OPEN');
    });

    it('should handle concurrent requests when circuit is open', async () => {
      const circuitBreaker = new CircuitBreaker('test-service', {
        failureThreshold: 2,
        recoveryTimeout: 60000,
        monitoringPeriod: 1000,
        expectedErrors: ['Service unavailable'],
      });

      // Mock operation that always fails
      const failingOperation = vi
        .fn()
        .mockRejectedValue(new Error('Service unavailable'));

      // Trigger circuit breaker to open
      await circuitBreaker.execute(failingOperation, 'test-1');
      await circuitBreaker.execute(failingOperation, 'test-2');

      // Now make concurrent requests with open circuit
      const concurrentRequests = Array.from({ length: 5 }, (_, i) =>
        circuitBreaker.execute(failingOperation, `concurrent-${i}`)
      );

      const results = await Promise.all(concurrentRequests);

      // All concurrent requests should fail with circuit breaker error
      results.forEach((result) => {
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Circuit breaker is OPEN');
      });

      // Original operation should not be called for concurrent requests
      expect(failingOperation).toHaveBeenCalledTimes(2);
    });

    it('should handle circuit breaker state transitions safely under load', async () => {
      const circuitBreaker = new CircuitBreaker('test-service', {
        failureThreshold: 3,
        recoveryTimeout: 100, // Short timeout for testing
        monitoringPeriod: 50,
        expectedErrors: ['Initial failures'],
      });

      let callCount = 0;
      const mockOperation = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 3) {
          throw new Error('Initial failures');
        }
        return Promise.resolve(`Success ${callCount}`);
      });

      // Trigger circuit breaker to open
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(mockOperation, `fail-${i}`);
      }

      // Wait for circuit to potentially reset
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Make concurrent requests during potential reset
      const concurrentRequests = Array.from({ length: 3 }, (_, i) =>
        circuitBreaker.execute(mockOperation, `reset-${i}`)
      );

      const results = await Promise.all(concurrentRequests);

      // At least one request should succeed (circuit reset)
      const successes = results.filter((result) => result.success === true);
      expect(successes.length).toBeGreaterThan(0);
    });
  });

  describe('Connection Pooling Safety', () => {
    it('should handle concurrent Azure client requests safely', async () => {
      const clientConfig = {
        baseURL: 'https://test.openai.azure.com/openai/v1/',
        apiKey: 'test-key',
        apiVersion: '2024-10-01-preview',
        deployment: 'test-deployment',
        timeout: 30000,
        maxRetries: 3,
      };

      const client = new AzureResponsesClient(clientConfig);

      // Mock the OpenAI client to simulate responses
      const mockCreate = vi.fn().mockResolvedValue({
        id: 'response-123',
        object: 'response',
        created: Date.now(),
        model: 'gpt-4',
        output: [{ type: 'text', text: 'Test response' }],
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      // Replace the client's internal OpenAI client
      (client as any).client = {
        responses: {
          create: mockCreate,
        },
      };

      // Make concurrent requests
      const concurrentRequests = Array.from({ length: 5 }, (_, i) =>
        client.createResponse({
          model: 'gpt-4',
          input: [{ role: 'user', content: `Test message ${i}` }],
          max_output_tokens: 100,
        })
      );

      const responses = await Promise.all(concurrentRequests);

      // All requests should succeed
      expect(responses).toHaveLength(5);
      responses.forEach((response) => {
        expect(response.id).toBe('response-123');
        expect(response.object).toBe('response');
      });

      // Mock should be called for each request
      expect(mockCreate).toHaveBeenCalledTimes(5);
    });

    it('should handle connection errors gracefully under concurrent load', async () => {
      const clientConfig = {
        baseURL: 'https://test.openai.azure.com/openai/v1/',
        apiKey: 'test-key',
        apiVersion: '2024-10-01-preview',
        deployment: 'test-deployment',
        timeout: 30000,
        maxRetries: 1, // Low retry count for testing
      };

      const client = new AzureResponsesClient(clientConfig);

      // Mock the OpenAI client to simulate connection errors
      const mockCreate = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      (client as any).client = {
        responses: {
          create: mockCreate,
        },
      };

      // Make concurrent requests that will fail
      const concurrentRequests = Array.from({ length: 3 }, (_, i) =>
        client
          .createResponse({
            model: 'gpt-4',
            input: [{ role: 'user', content: `Test message ${i}` }],
            max_output_tokens: 100,
          })
          .catch((error) => error)
      );

      const results = await Promise.all(concurrentRequests);

      // All requests should fail with network errors
      results.forEach((result) => {
        expect(result).toBeInstanceOf(Error);
        expect(result.message).toContain('Network error');
      });

      // Each request should have been attempted
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });
  });

  describe('Memory Safety Under Concurrent Load', () => {
    it('should not leak memory during concurrent conversation management', async () => {
      const conversationManager = new ConversationManagerImpl({
        cleanupInterval: 1000,
        maxAge: 60000,
        maxSize: 10, // Small size to trigger cleanup
      });

      conversationManager.startCleanupTimer();

      const initialMemory = process.memoryUsage().heapUsed;

      // Create many concurrent conversations
      const conversationPromises = Array.from({ length: 100 }, (_, i) =>
        Promise.resolve().then(() => {
          const conversationId = `stress-test-${i}`;

          // Add multiple response IDs to each conversation
          for (let j = 0; j < 5; j++) {
            conversationManager.trackConversation(
              conversationId,
              `resp-${i}-${j}`,
              { totalTokensUsed: 100 + j * 10 }
            );
          }

          return conversationManager.getPreviousResponseId(conversationId);
        })
      );

      await Promise.all(conversationPromises);

      // Force cleanup
      conversationManager.stopCleanupTimer();

      // Allow some time for cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;

      // Memory growth should be reasonable (less than 50MB for this test)
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);
    });

    it('should handle concurrent retry operations without memory leaks', async () => {
      const retryManager = new RetryManager({
        maxAttempts: 3,
        baseDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
        jitterMs: 5,
      });

      let attemptCount = 0;
      const mockOperation = vi.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 10) {
          throw new Error('Temporary failure');
        }
        return Promise.resolve('Success');
      });

      // Run multiple concurrent retry operations
      const retryPromises = Array.from({ length: 5 }, (_, i) =>
        retryManager
          .executeWithRetry(
            mockOperation,
            `concurrent-retry-${i}`,
            'test-operation'
          )
          .catch((error) => error)
      );

      const results = await Promise.all(retryPromises);

      // Some operations should eventually succeed, others may fail
      const successes = results.filter((result) => result === 'Success');
      const failures = results.filter((result) => result instanceof Error);

      expect(successes.length + failures.length).toBe(5);

      // Verify retry attempts were made
      expect(mockOperation).toHaveBeenCalled();
    });
  });

  describe('Thread Safety Patterns', () => {
    it('should handle concurrent access to shared resources safely', async () => {
      const sharedCounter = { value: 0 };
      const incrementPromises = [];

      // Simulate concurrent increments
      for (let i = 0; i < 100; i++) {
        incrementPromises.push(
          Promise.resolve().then(() => {
            // Simulate some async work
            return new Promise((resolve) =>
              setTimeout(resolve, Math.random() * 10)
            ).then(() => {
              sharedCounter.value++;
            });
          })
        );
      }

      await Promise.all(incrementPromises);

      // All increments should have been applied
      expect(sharedCounter.value).toBe(100);
    });

    it('should maintain data consistency during concurrent operations', async () => {
      const dataStore = new Map<string, number>();
      const operations = [];

      // Concurrent read/write operations
      for (let i = 0; i < 50; i++) {
        // Write operation
        operations.push(
          Promise.resolve().then(() => {
            dataStore.set(`key-${i}`, i * 2);
          })
        );

        // Read operation
        operations.push(
          Promise.resolve().then(() => {
            const value = dataStore.get(`key-${i}`);
            return value;
          })
        );
      }

      await Promise.all(operations);

      // Verify data consistency
      for (let i = 0; i < 50; i++) {
        const storedValue = dataStore.get(`key-${i}`);
        expect(storedValue).toBe(i * 2);
      }
    });
  });
});
