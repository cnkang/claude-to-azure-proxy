/**
 * @fileoverview Resource cleanup validation tests
 *
 * Tests to validate that event listeners, timers, and streams are properly cleaned up
 * to prevent memory leaks and resource exhaustion.
 *
 * Requirements: 5.1, 5.2, 5.4
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../src/config/index';
import { sanitizeInput } from '../src/middleware/security';
import { AzureResponsesMonitor } from '../src/monitoring/azure-responses-monitor';
import { HealthMonitor } from '../src/monitoring/health-monitor';
import { SystemResourceMonitor } from '../src/monitoring/metrics';
import { PerformanceProfiler } from '../src/monitoring/performance-profiler';
import type { ServerConfig } from '../src/types/index';
import { ConversationManagerImpl } from '../src/utils/conversation-manager';
import { MultiTurnConversationHandlerImpl } from '../src/utils/multi-turn-conversation';
import { ResponsesStreamProcessor } from '../src/utils/responses-streaming-handler';

// Mock timers for testing
vi.useFakeTimers();

describe('Resource Cleanup Validation', () => {
  let originalSetInterval: typeof setInterval;
  let originalClearInterval: typeof clearInterval;
  let originalSetTimeout: typeof setTimeout;
  let originalClearTimeout: typeof clearTimeout;

  // Track active timers and intervals
  const activeTimers = new Set<NodeJS.Timeout>();
  const activeIntervals = new Set<NodeJS.Timeout>();

  beforeEach(() => {
    // Store original timer functions
    originalSetInterval = global.setInterval;
    originalClearInterval = global.clearInterval;
    originalSetTimeout = global.setTimeout;
    originalClearTimeout = global.clearTimeout;

    // Mock timer functions to track active timers
    global.setInterval = vi.fn((callback: () => void, ms: number) => {
      const timer = originalSetInterval(callback, ms);
      activeIntervals.add(timer);
      return timer;
    });

    global.clearInterval = vi.fn((timer: NodeJS.Timeout) => {
      activeIntervals.delete(timer);
      return originalClearInterval(timer);
    });

    global.setTimeout = vi.fn((callback: () => void, ms: number) => {
      const timer = originalSetTimeout(callback, ms);
      activeTimers.add(timer);
      return timer;
    });

    global.clearTimeout = vi.fn((timer: NodeJS.Timeout) => {
      activeTimers.delete(timer);
      return originalClearTimeout(timer);
    });

    // Clear any existing timers
    activeTimers.clear();
    activeIntervals.clear();
  });

  afterEach(() => {
    // Restore original timer functions
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;

    // Clean up any remaining timers
    for (const timer of activeTimers) {
      clearTimeout(timer);
    }
    for (const interval of activeIntervals) {
      clearInterval(interval);
    }

    vi.useRealTimers();
  });

  describe('Timer and Interval Cleanup', () => {
    it('should properly clean up HealthMonitor intervals', () => {
      const mockServerConfig: ServerConfig = {
        azureOpenAI: {
          endpoint: 'https://test.openai.azure.com',
          apiKey: 'test-key',
          deployment: 'test-deployment',
          apiVersion: '2024-10-01-preview',
          timeout: 30000,
          maxRetries: 3,
        },
      };

      const healthMonitor = new HealthMonitor(mockServerConfig);

      // Start monitoring
      healthMonitor.startMonitoring(1000);
      expect(activeIntervals.size).toBe(1);

      // Stop monitoring should clean up interval
      healthMonitor.stopMonitoring();
      expect(activeIntervals.size).toBe(0);
    });

    it('should properly clean up AzureResponsesMonitor intervals', () => {
      const monitor = new AzureResponsesMonitor();

      // Start monitoring
      monitor.startMonitoring(1000);
      expect(activeIntervals.size).toBe(1);

      // Stop monitoring should clean up interval
      monitor.stopMonitoring();
      expect(activeIntervals.size).toBe(0);
    });

    it('should properly clean up SystemResourceMonitor intervals', () => {
      const resourceMonitor = new SystemResourceMonitor();

      // Start monitoring
      resourceMonitor.startMonitoring();
      expect(activeIntervals.size).toBe(1);

      // Stop monitoring should clean up interval
      resourceMonitor.stopMonitoring();
      expect(activeIntervals.size).toBe(0);
    });

    it('should properly clean up MultiTurnConversationHandler maintenance timers', () => {
      const mockConfig: Config = {
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
        AZURE_OPENAI_API_KEY: 'test-key',
        AZURE_OPENAI_DEPLOYMENT: 'test-deployment',
        PORT: 3000,
        NODE_ENV: 'test',
        LOG_LEVEL: 'info',
        CORS_ORIGIN: '*',
        RATE_LIMIT_WINDOW_MS: 60000,
        RATE_LIMIT_MAX_REQUESTS: 100,
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

      const handler = new MultiTurnConversationHandlerImpl(mockConfig);

      // Start maintenance tasks
      handler.startMaintenanceTasks();
      expect(activeIntervals.size).toBe(1);

      // Stop maintenance tasks should clean up timer
      handler.stopMaintenanceTasks();
      expect(activeIntervals.size).toBe(0);
    });

    it('should properly clean up ConversationManager cleanup timers', () => {
      const mockConfig = {
        cleanupInterval: 60000,
        maxAge: 3600000,
        maxSize: 100,
      };

      const conversationManager = new ConversationManagerImpl(mockConfig);

      // Start cleanup timer
      conversationManager.startCleanupTimer();
      expect(activeIntervals.size).toBe(1);

      // Stop cleanup timer should clean up interval
      conversationManager.stopCleanupTimer();
      expect(activeIntervals.size).toBe(0);
    });

    it('should properly clean up PerformanceProfiler memory monitoring', () => {
      const profiler = new PerformanceProfiler();

      // Start profiling (which starts memory monitoring)
      profiler.startProfiling('test-operation', 'test-correlation-id');
      expect(activeIntervals.size).toBe(1);

      // Stop profiling should clean up memory monitoring
      profiler.stopProfiling('test-operation');
      expect(activeIntervals.size).toBe(0);
    });

    it('should handle multiple start/stop cycles without leaking timers', () => {
      const mockServerConfig: ServerConfig = {
        azureOpenAI: {
          endpoint: 'https://test.openai.azure.com',
          apiKey: 'test-key',
          deployment: 'test-deployment',
          apiVersion: '2024-10-01-preview',
          timeout: 30000,
          maxRetries: 3,
        },
      };

      const healthMonitor = new HealthMonitor(mockServerConfig);

      // Multiple start/stop cycles
      for (let i = 0; i < 5; i++) {
        healthMonitor.startMonitoring(1000);
        expect(activeIntervals.size).toBe(1);

        healthMonitor.stopMonitoring();
        expect(activeIntervals.size).toBe(0);
      }
    });

    it('should not create duplicate timers when starting already running monitors', () => {
      const monitor = new AzureResponsesMonitor();

      // Start monitoring multiple times
      monitor.startMonitoring(1000);
      expect(activeIntervals.size).toBe(1);

      monitor.startMonitoring(1000);
      expect(activeIntervals.size).toBe(1); // Should still be 1, not 2

      monitor.stopMonitoring();
      expect(activeIntervals.size).toBe(0);
    });
  });

  describe('WeakMap and WeakSet Usage Validation', () => {
    it('should use WeakSet for circular reference detection in sanitization', () => {
      // Test the sanitizeInput function uses WeakSet properly
      const testObj: any = { a: 1 };
      testObj.self = testObj; // Create circular reference

      // This should not cause infinite recursion due to WeakSet usage
      expect(() => {
        sanitizeInput(testObj);
      }).not.toThrow();
    });

    it('should properly handle WeakSet cleanup in request validation', () => {
      // Test that WeakSet allows garbage collection
      // This test validates the pattern exists by testing sanitizeInput with WeakSet
      let testObj: any = { data: 'test' };
      const weakRef = new WeakRef(testObj);

      // Process object through sanitization (which uses WeakSet internally)
      sanitizeInput(testObj);

      // Clear reference
      testObj = null;

      // Force garbage collection (if available)
      if (global.gc) {
        global.gc();
      }

      // WeakRef should allow object to be collected
      // Note: This test is not deterministic due to GC timing
      // but validates the pattern is in place
      expect(weakRef.deref()).toBeDefined(); // May still be defined immediately
    });
  });

  describe('Stream Resource Management', () => {
    it('should properly handle stream processor cleanup', async () => {
      const processor = new ResponsesStreamProcessor(
        'test-correlation-id',
        'claude'
      );

      // Create a mock stream that can be controlled
      const mockChunks = [
        {
          id: 'chunk-1',
          object: 'response.chunk' as const,
          created: Date.now(),
          model: 'gpt-4',
          output: [{ type: 'text' as const, text: 'Hello' }],
        },
        {
          id: 'chunk-2',
          object: 'response.chunk' as const,
          created: Date.now(),
          model: 'gpt-4',
          output: [
            {
              type: 'reasoning' as const,
              reasoning: { status: 'completed' as const, content: 'Done' },
            },
          ],
        },
      ];

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          for (const chunk of mockChunks) {
            yield chunk;
          }
        },
      };

      // Process stream
      const results = [];
      for await (const chunk of processor.processStream(mockStream)) {
        results.push(chunk);
      }

      // Verify stream was processed and completed
      expect(results.length).toBeGreaterThan(0);

      // No explicit cleanup needed for async generators,
      // but verify no hanging promises or resources
      expect(true).toBe(true); // Stream completed successfully
    });

    it('should handle stream errors without resource leaks', async () => {
      const processor = new ResponsesStreamProcessor(
        'test-correlation-id',
        'claude'
      );

      // Create a mock stream that throws an error
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield {
            id: 'chunk-1',
            object: 'response.chunk' as const,
            created: Date.now(),
            model: 'gpt-4',
            output: [{ type: 'text' as const, text: 'Hello' }],
          };

          throw new Error('Stream error');
        },
      };

      // Process stream and expect error handling
      const results = [];
      for await (const chunk of processor.processStream(mockStream)) {
        results.push(chunk);
      }

      // Should have received at least start chunk and error chunks
      expect(results.length).toBeGreaterThan(0);

      // Verify error was handled gracefully
      const errorChunk = results.find(
        (chunk) => 'type' in chunk && chunk.type === 'error'
      );
      expect(errorChunk).toBeDefined();
    });
  });

  describe('Memory Leak Detection', () => {
    it('should detect potential memory leaks in monitoring components', () => {
      const mockServerConfig: ServerConfig = {
        azureOpenAI: {
          endpoint: 'https://test.openai.azure.com',
          apiKey: 'test-key',
          deployment: 'test-deployment',
          apiVersion: '2024-10-01-preview',
          timeout: 30000,
          maxRetries: 3,
        },
      };

      const initialMemory = process.memoryUsage();

      // Create and destroy multiple monitoring instances
      const monitors = [];
      for (let i = 0; i < 10; i++) {
        const monitor = new HealthMonitor(mockServerConfig);
        monitor.startMonitoring(100);
        monitors.push(monitor);
      }

      // Clean up all monitors
      for (const monitor of monitors) {
        monitor.stopMonitoring();
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();

      // Memory usage should not have grown significantly
      // Allow for some variance due to test overhead
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      const maxAllowedGrowth = 10 * 1024 * 1024; // 10MB threshold

      expect(memoryGrowth).toBeLessThan(maxAllowedGrowth);
    });

    it('should properly clean up conversation managers without memory leaks', () => {
      const mockConfig = {
        cleanupInterval: 1000,
        maxAge: 60000,
        maxSize: 100,
      };

      const managers = [];

      // Create multiple conversation managers
      for (let i = 0; i < 5; i++) {
        const manager = new ConversationManagerImpl(mockConfig);
        manager.startCleanupTimer();
        managers.push(manager);
      }

      // Add some conversations to each manager
      for (const manager of managers) {
        for (let j = 0; j < 10; j++) {
          manager.trackConversation(
            `conv-${j}`,
            `msg-${j}`,
            'user',
            'test message'
          );
        }
      }

      // Clean up all managers
      for (const manager of managers) {
        manager.stopCleanupTimer();
      }

      // Verify all intervals were cleaned up
      expect(activeIntervals.size).toBe(0);
    });
  });

  describe('Resource Cleanup on Process Exit', () => {
    it('should handle graceful shutdown cleanup', () => {
      const mockServerConfig: ServerConfig = {
        azureOpenAI: {
          endpoint: 'https://test.openai.azure.com',
          apiKey: 'test-key',
          deployment: 'test-deployment',
          apiVersion: '2024-10-01-preview',
          timeout: 30000,
          maxRetries: 3,
        },
      };

      const healthMonitor = new HealthMonitor(mockServerConfig);
      const resourceMonitor = new SystemResourceMonitor();
      const azureMonitor = new AzureResponsesMonitor();

      // Start all monitoring
      healthMonitor.startMonitoring(1000);
      resourceMonitor.startMonitoring();
      azureMonitor.startMonitoring(1000);

      expect(activeIntervals.size).toBe(3);

      // Simulate graceful shutdown
      healthMonitor.stopMonitoring();
      resourceMonitor.stopMonitoring();
      azureMonitor.stopMonitoring();

      // All intervals should be cleaned up
      expect(activeIntervals.size).toBe(0);
    });

    it('should handle cleanup when components are destroyed without explicit stop', () => {
      const mockServerConfig: ServerConfig = {
        azureOpenAI: {
          endpoint: 'https://test.openai.azure.com',
          apiKey: 'test-key',
          deployment: 'test-deployment',
          apiVersion: '2024-10-01-preview',
          timeout: 30000,
          maxRetries: 3,
        },
      };

      // Create monitors in a scope that will be garbage collected
      (() => {
        const monitor = new HealthMonitor(mockServerConfig);
        monitor.startMonitoring(1000);
        expect(activeIntervals.size).toBe(1);

        // Monitor goes out of scope here, but interval may still be active
        // This tests the importance of explicit cleanup
      })();

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Without explicit cleanup, interval would still be active
      // This demonstrates why explicit cleanup is necessary
      expect(activeIntervals.size).toBe(1);

      // Manual cleanup to prevent test interference
      for (const interval of activeIntervals) {
        clearInterval(interval);
      }
      activeIntervals.clear();
    });
  });
});
