import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  transformRequest,
  validateClaudeRequest,
  transformClaudeToAzureRequest
} from '../src/utils/request-transformer.js';
import {
  transformAzureResponseToClaude,
  isAzureOpenAIResponse
} from '../src/utils/response-transformer.js';
import { sanitizeInput } from '../src/middleware/security.js';
import { CircuitBreaker } from '../src/resilience/circuit-breaker.js';
import { RetryStrategy } from '../src/resilience/retry.js';

/**
 * Performance tests for critical paths
 * Tests response times, memory usage, and throughput
 */

describe('Performance Tests', () => {
  const PERFORMANCE_THRESHOLD_MS = 100; // 100ms threshold for most operations
  const MEMORY_THRESHOLD_MB = 50; // 50MB memory threshold

  beforeEach(() => {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });

  describe('Request Transformation Performance', () => {
    it('should transform requests within performance threshold', () => {
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        prompt: 'Performance test prompt',
        max_tokens: 100,
        temperature: 0.7,
        top_p: 0.9,
        stop_sequences: ['END', 'STOP']
      };

      const azureModel = 'gpt-4';
      const apiKey = 'test-api-key-12345678901234567890123456789012';

      const startTime = performance.now();
      const result = transformRequest(request, azureModel, apiKey);
      const endTime = performance.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
      expect(result).toBeDefined();
      expect(result.azureRequest).toBeDefined();
    });

    it('should handle batch transformations efficiently', () => {
      const requests = Array.from({ length: 100 }, (_, i) => ({
        model: 'claude-3-5-sonnet-20241022',
        prompt: `Batch test prompt ${i}`,
        max_tokens: 100
      }));

      const azureModel = 'gpt-4';
      const apiKey = 'test-api-key-12345678901234567890123456789012';

      const startTime = performance.now();
      const results = requests.map(request => 
        transformRequest(request, azureModel, apiKey)
      );
      const endTime = performance.now();

      const duration = endTime - startTime;
      const avgDuration = duration / requests.length;

      expect(results).toHaveLength(100);
      expect(avgDuration).toBeLessThan(10); // Average should be under 10ms per request
      expect(duration).toBeLessThan(1000); // Total should be under 1 second
    });

    it('should handle large prompts efficiently', () => {
      const largePrompt = 'x'.repeat(50000); // 50KB prompt
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        prompt: largePrompt,
        max_tokens: 100
      };

      const azureModel = 'gpt-4';
      const apiKey = 'test-api-key-12345678901234567890123456789012';

      const startTime = performance.now();
      const result = transformRequest(request, azureModel, apiKey);
      const endTime = performance.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS * 2); // Allow 2x threshold for large data
      expect(result.azureRequest.messages[0].content).toBe(largePrompt);
    });

    it('should validate requests efficiently', () => {
      const requests = Array.from({ length: 1000 }, (_, i) => ({
        model: 'claude-3-5-sonnet-20241022',
        prompt: `Validation test ${i}`,
        max_tokens: 100,
        temperature: Math.random() * 2,
        top_p: Math.random()
      }));

      const startTime = performance.now();
      const results = requests.map(request => validateClaudeRequest(request));
      const endTime = performance.now();

      const duration = endTime - startTime;
      const avgDuration = duration / requests.length;

      expect(results).toHaveLength(1000);
      expect(avgDuration).toBeLessThan(1); // Should be under 1ms per validation
      expect(duration).toBeLessThan(100); // Total under 100ms
    });
  });

  describe('Response Transformation Performance', () => {
    it('should transform responses within performance threshold', () => {
      const azureResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion' as const,
        created: 1640995200,
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant' as const,
            content: 'Performance test response content'
          },
          finish_reason: 'stop' as const
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 15,
          total_tokens: 25
        }
      };

      const startTime = performance.now();
      const result = transformAzureResponseToClaude(
        azureResponse,
        200,
        'test-correlation-id'
      );
      const endTime = performance.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
      expect(result.claudeResponse).toBeDefined();
    });

    it('should handle batch response transformations efficiently', () => {
      const responses = Array.from({ length: 100 }, (_, i) => ({
        id: `chatcmpl-${i}`,
        object: 'chat.completion' as const,
        created: 1640995200,
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant' as const,
            content: `Batch response ${i} with some content`
          },
          finish_reason: 'stop' as const
        }]
      }));

      const startTime = performance.now();
      const results = responses.map(response => 
        transformAzureResponseToClaude(response, 200, 'test-correlation-id')
      );
      const endTime = performance.now();

      const duration = endTime - startTime;
      const avgDuration = duration / responses.length;

      expect(results).toHaveLength(100);
      expect(avgDuration).toBeLessThan(5); // Average under 5ms per response
      expect(duration).toBeLessThan(500); // Total under 500ms
    });

    it('should handle large responses efficiently', () => {
      const largeContent = 'x'.repeat(10000); // 10KB response
      const azureResponse = {
        id: 'chatcmpl-large',
        object: 'chat.completion' as const,
        created: 1640995200,
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant' as const,
            content: largeContent
          },
          finish_reason: 'stop' as const
        }]
      };

      const startTime = performance.now();
      const result = transformAzureResponseToClaude(
        azureResponse,
        200,
        'test-correlation-id'
      );
      const endTime = performance.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS * 2);
      
      const claudeResponse = result.claudeResponse as any;
      expect(claudeResponse.completion).toContain('x'.repeat(100)); // Verify content preserved
    });

    it('should validate type guards efficiently', () => {
      const testObjects = Array.from({ length: 10000 }, (_, i) => ({
        id: `test-${i}`,
        object: i % 2 === 0 ? 'chat.completion' : 'invalid',
        created: 1640995200,
        model: 'gpt-4',
        choices: i % 3 === 0 ? [] : [{
          index: 0,
          message: { role: 'assistant', content: 'test' },
          finish_reason: 'stop'
        }]
      }));

      const startTime = performance.now();
      const results = testObjects.map(obj => isAzureOpenAIResponse(obj));
      const endTime = performance.now();

      const duration = endTime - startTime;
      const avgDuration = duration / testObjects.length;

      expect(results).toHaveLength(10000);
      expect(avgDuration).toBeLessThan(0.1); // Should be very fast
      expect(duration).toBeLessThan(100); // Total under 100ms
    });
  });

  describe('Input Sanitization Performance', () => {
    it('should sanitize simple strings efficiently', () => {
      const testStrings = Array.from({ length: 1000 }, (_, i) => 
        `Test string ${i} with <script>alert(${i})</script> and safe content`
      );

      const startTime = performance.now();
      const results = testStrings.map(str => sanitizeInput(str));
      const endTime = performance.now();

      const duration = endTime - startTime;
      const avgDuration = duration / testStrings.length;

      expect(results).toHaveLength(1000);
      expect(avgDuration).toBeLessThan(1); // Under 1ms per string
      expect(duration).toBeLessThan(100); // Total under 100ms
    });

    it('should sanitize complex objects efficiently', () => {
      const complexObjects = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        content: `<script>alert(${i})</script>`,
        nested: {
          level1: {
            level2: {
              dangerous: `javascript:alert(${i})`,
              safe: `Safe content ${i}`
            }
          }
        },
        array: [
          `Item ${i}`,
          `<img onerror=alert(${i})>`,
          { nested: `More content ${i}` }
        ]
      }));

      const startTime = performance.now();
      const results = complexObjects.map(obj => sanitizeInput(obj));
      const endTime = performance.now();

      const duration = endTime - startTime;
      const avgDuration = duration / complexObjects.length;

      expect(results).toHaveLength(100);
      expect(avgDuration).toBeLessThan(10); // Under 10ms per complex object
      expect(duration).toBeLessThan(1000); // Total under 1 second
    });

    it('should handle large text sanitization efficiently', () => {
      const largeText = Array.from({ length: 1000 }, (_, i) => 
        i % 10 === 0 ? '<script>alert("xss")</script>' : 'Safe content line'
      ).join('\n');

      const startTime = performance.now();
      const result = sanitizeInput(largeText);
      const endTime = performance.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
      expect(typeof result).toBe('string');
      expect((result as string).length).toBeGreaterThan(0);
    });
  });

  describe('Circuit Breaker Performance', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should execute operations efficiently when closed', async () => {
      const circuitBreaker = new CircuitBreaker('performance-test', {
        failureThreshold: 5,
        recoveryTimeout: 1000
      });

      const fastOperation = vi.fn().mockResolvedValue('success');
      const operations = Array.from({ length: 100 }, () => 
        circuitBreaker.execute(fastOperation, 'test-correlation-id')
      );

      const startTime = performance.now();
      const results = await Promise.all(operations);
      const endTime = performance.now();

      const duration = endTime - startTime;
      const avgDuration = duration / operations.length;

      expect(results).toHaveLength(100);
      expect(results.every(r => r.success)).toBe(true);
      expect(avgDuration).toBeLessThan(1); // Very fast when circuit is closed
    });

    it('should fail fast when circuit is open', async () => {
      const circuitBreaker = new CircuitBreaker('fail-fast-test', {
        failureThreshold: 3,
        recoveryTimeout: 1000
      });

      const failingOperation = vi.fn().mockRejectedValue(new Error('NETWORK_ERROR'));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(failingOperation, 'test-correlation-id');
      }

      // Now test fail-fast performance
      const operations = Array.from({ length: 100 }, () => 
        circuitBreaker.execute(failingOperation, 'test-correlation-id')
      );

      const startTime = performance.now();
      const results = await Promise.all(operations);
      const endTime = performance.now();

      const duration = endTime - startTime;
      const avgDuration = duration / operations.length;

      expect(results).toHaveLength(100);
      expect(results.every(r => !r.success)).toBe(true);
      expect(avgDuration).toBeLessThan(0.1); // Should be extremely fast (fail-fast)
      expect(duration).toBeLessThan(10); // Total should be very quick
    });
  });

  describe('Retry Strategy Performance', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should execute successful operations efficiently', async () => {
      const retryStrategy = new RetryStrategy('performance-test', {
        maxAttempts: 3,
        baseDelayMs: 100
      });

      const successOperation = vi.fn().mockResolvedValue('success');
      const operations = Array.from({ length: 50 }, () => 
        retryStrategy.execute(successOperation, 'test-correlation-id')
      );

      const startTime = performance.now();
      const results = await Promise.all(operations);
      const endTime = performance.now();

      const duration = endTime - startTime;
      const avgDuration = duration / operations.length;

      expect(results).toHaveLength(50);
      expect(results.every(r => r.success)).toBe(true);
      expect(avgDuration).toBeLessThan(5); // Should be fast for successful operations
    });

    it('should handle non-retryable errors efficiently', async () => {
      const retryStrategy = new RetryStrategy('non-retryable-test', {
        maxAttempts: 3,
        baseDelayMs: 100
      });

      const nonRetryableOperation = vi.fn().mockRejectedValue(new Error('NON_RETRYABLE'));
      const operations = Array.from({ length: 50 }, () => 
        retryStrategy.execute(nonRetryableOperation, 'test-correlation-id')
      );

      const startTime = performance.now();
      const results = await Promise.all(operations);
      const endTime = performance.now();

      const duration = endTime - startTime;
      const avgDuration = duration / operations.length;

      expect(results).toHaveLength(50);
      expect(results.every(r => !r.success)).toBe(true);
      expect(avgDuration).toBeLessThan(2); // Should be fast (no retries)
      expect(duration).toBeLessThan(100); // Total should be quick
    });
  });

  describe('Memory Usage Tests', () => {
    it('should not leak memory during request transformations', () => {
      const getMemoryUsage = () => process.memoryUsage().heapUsed;
      
      const initialMemory = getMemoryUsage();
      
      // Perform many transformations
      for (let i = 0; i < 1000; i++) {
        const request = {
          model: 'claude-3-5-sonnet-20241022',
          prompt: `Memory test ${i}`,
          max_tokens: 100
        };
        
        transformRequest(request, 'gpt-4', 'test-key-12345678901234567890123456789012');
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = getMemoryUsage();
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      expect(memoryIncrease).toBeLessThan(MEMORY_THRESHOLD_MB);
    });

    it('should not leak memory during response transformations', () => {
      const getMemoryUsage = () => process.memoryUsage().heapUsed;
      
      const initialMemory = getMemoryUsage();
      
      // Perform many transformations
      for (let i = 0; i < 1000; i++) {
        const azureResponse = {
          id: `chatcmpl-${i}`,
          object: 'chat.completion' as const,
          created: 1640995200,
          model: 'gpt-4',
          choices: [{
            index: 0,
            message: {
              role: 'assistant' as const,
              content: `Memory test response ${i}`
            },
            finish_reason: 'stop' as const
          }]
        };
        
        transformAzureResponseToClaude(azureResponse, 200, `correlation-${i}`);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = getMemoryUsage();
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      expect(memoryIncrease).toBeLessThan(MEMORY_THRESHOLD_MB);
    });

    it('should handle large objects without excessive memory usage', () => {
      const getMemoryUsage = () => process.memoryUsage().heapUsed;
      
      const initialMemory = getMemoryUsage();
      
      // Create and process large objects
      for (let i = 0; i < 10; i++) {
        const largePrompt = 'x'.repeat(100000); // 100KB each
        const request = {
          model: 'claude-3-5-sonnet-20241022',
          prompt: largePrompt,
          max_tokens: 100
        };
        
        const result = transformRequest(request, 'gpt-4', 'test-key-12345678901234567890123456789012');
        
        // Verify the transformation worked
        expect(result.azureRequest.messages[0].content).toBe(largePrompt);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = getMemoryUsage();
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      // Should not use more than 100MB for processing 1MB of data
      expect(memoryIncrease).toBeLessThan(100);
    });
  });

  describe('Concurrent Operations Performance', () => {
    it('should handle concurrent transformations efficiently', async () => {
      const concurrentRequests = Array.from({ length: 100 }, (_, i) => ({
        model: 'claude-3-5-sonnet-20241022',
        prompt: `Concurrent test ${i}`,
        max_tokens: 100
      }));

      const azureModel = 'gpt-4';
      const apiKey = 'test-api-key-12345678901234567890123456789012';

      const startTime = performance.now();
      
      const promises = concurrentRequests.map(request => 
        Promise.resolve(transformRequest(request, azureModel, apiKey))
      );
      
      const results = await Promise.all(promises);
      const endTime = performance.now();

      const duration = endTime - startTime;
      const avgDuration = duration / concurrentRequests.length;

      expect(results).toHaveLength(100);
      expect(avgDuration).toBeLessThan(10); // Should be efficient even with concurrency
      expect(duration).toBeLessThan(1000); // Total under 1 second
    });

    it('should handle concurrent sanitization efficiently', async () => {
      const concurrentInputs = Array.from({ length: 200 }, (_, i) => ({
        id: i,
        content: `<script>alert(${i})</script>Test content ${i}`,
        nested: {
          dangerous: `javascript:alert(${i})`,
          safe: `Safe ${i}`
        }
      }));

      const startTime = performance.now();
      
      const promises = concurrentInputs.map(input => 
        Promise.resolve(sanitizeInput(input))
      );
      
      const results = await Promise.all(promises);
      const endTime = performance.now();

      const duration = endTime - startTime;
      const avgDuration = duration / concurrentInputs.length;

      expect(results).toHaveLength(200);
      expect(avgDuration).toBeLessThan(5); // Should handle concurrent sanitization well
      expect(duration).toBeLessThan(1000); // Total under 1 second
    });
  });
});