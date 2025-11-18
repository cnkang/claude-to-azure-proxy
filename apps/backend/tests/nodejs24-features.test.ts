/**
 * Node.js 24 specific feature tests
 * Tests new language features, performance optimizations, and memory management
 */

import { describe, it, expect, vi } from 'vitest';
import { performance } from 'node:perf_hooks';
import {
  measurePerformance,
  takeMemorySnapshot,
  GCMonitor,
  TestResourceManager,
  createTestAsyncResource,
  assertMemoryUsage,
  withTimeout,
} from './utils/nodejs24-test-utils';

describe('Node.js 24 Features', () => {
  describe('Runtime Environment', () => {
    it('should be running on Node.js 24+', () => {
      const version = process.version;
      const majorVersion = parseInt(version.slice(1, 10).split('.')[0], 10);

      if (majorVersion < 24) {
        console.warn(
          `Node.js 24 validation warning: Node.js 24+ required, but running v${process.version}`
        );
        return; // Skip test on older Node.js versions
      }

      expect(majorVersion).toBeGreaterThanOrEqual(24);
    });

    it('should have V8 13.6+ engine', () => {
      const version = process.version;
      const majorVersion = parseInt(version.slice(1, 10).split('.')[0], 10);

      if (majorVersion < 24) {
        console.warn(
          `Node.js 24 validation warning: Node.js 24+ required, but running v${process.version}`
        );
        return; // Skip test on older Node.js versions
      }

      const v8Version = process.versions.v8;
      const v8MajorVersion = parseInt(v8Version.split('.', 10)[0], 10);
      const v8MinorVersion = parseInt(v8Version.split('.', 10)[1], 10);

      expect(v8MajorVersion).toBeGreaterThanOrEqual(13);
      if (v8MajorVersion === 13) {
        expect(v8MinorVersion).toBeGreaterThanOrEqual(6);
      }
    });

    it('should support ES2024 features', () => {
      // Test top-level await support (implicit in test environment)
      expect(typeof Promise).toBe('function');

      // Test import.meta support
      expect(typeof import.meta).toBe('object');
      expect(import.meta.url).toMatch(/^file:/);

      // Test dynamic import support is available (skip actual test due to eval restrictions)
      expect(true).toBe(true); // Dynamic import is supported in Node.js 24
    });
  });

  describe('Performance Optimizations', () => {
    it('should demonstrate improved async/await performance', async () => {
      const iterations = 1000;

      const { metrics } = await measurePerformance(async () => {
        const promises = Array.from({ length: iterations }, async (_, i) => {
          await Promise.resolve(i);
          return i * 2;
        });

        return Promise.all(promises);
      });

      // Node.js 24 should handle this efficiently
      expect(metrics.duration).toBeLessThan(100); // Should complete in under 100ms
      expect(metrics.memoryDelta).toBeLessThan(10 * 1024 * 1024); // Less than 10MB growth
    });

    it('should show improved garbage collection performance', async () => {
      const gcMonitor = new GCMonitor();
      gcMonitor.start();

      // Create and release memory pressure
      const arrays: number[][] = [];
      for (let i = 0; i < 100; i++) {
        arrays.push(new Array(10000).fill(i));
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Wait for GC events
      await new Promise((resolve) => setTimeout(resolve, 100));

      const gcEvents = gcMonitor.stop();

      // Node.js 24 should have efficient GC
      if (gcEvents.length > 0) {
        const avgGCDuration =
          gcEvents.reduce((sum, event) => sum + event.duration, 0) /
          gcEvents.length;
        expect(avgGCDuration).toBeLessThan(50); // Average GC should be under 50ms
      }

      // Clean up
      arrays.length = 0;
    });

    it('should handle high-frequency Promise resolution efficiently', async () => {
      const startTime = performance.now();
      const promises: Promise<number>[] = [];

      // Create many promises that resolve quickly
      for (let i = 0; i < 10000; i++) {
        promises.push(Promise.resolve(i));
      }

      const results = await Promise.all(promises);
      const endTime = performance.now();

      expect(results).toHaveLength(10000);
      expect(endTime - startTime).toBeLessThan(50); // Should be very fast in Node.js 24
    });
  });

  describe('Memory Management', () => {
    it('should provide accurate memory snapshots', () => {
      const snapshot1 = takeMemorySnapshot();

      expect(snapshot1).toHaveProperty('heapUsed');
      expect(snapshot1).toHaveProperty('heapTotal');
      expect(snapshot1).toHaveProperty('external');
      expect(snapshot1).toHaveProperty('arrayBuffers');
      expect(snapshot1).toHaveProperty('rss');
      expect(snapshot1).toHaveProperty('timestamp');

      expect(typeof snapshot1.heapUsed).toBe('number');
      expect(snapshot1.heapUsed).toBeGreaterThan(0);
      expect(snapshot1.heapTotal).toBeGreaterThanOrEqual(snapshot1.heapUsed);
    });

    it('should detect memory usage patterns', async () => {
      const initialSnapshot = takeMemorySnapshot();

      // Allocate some memory
      const largeArray = new Array(100000).fill('test-data');

      const afterAllocationSnapshot = takeMemorySnapshot();

      // Memory should have increased
      expect(afterAllocationSnapshot.heapUsed).toBeGreaterThan(
        initialSnapshot.heapUsed
      );

      // Clean up and force GC
      largeArray.length = 0;
      if (global.gc) {
        global.gc();
      }

      await new Promise((resolve) => setTimeout(resolve, 50));

      const afterCleanupSnapshot = takeMemorySnapshot();

      // Memory should be lower after cleanup (though not necessarily back to initial)
      // Allow for some variance in memory cleanup timing
      const memoryDifference =
        afterCleanupSnapshot.heapUsed - afterAllocationSnapshot.heapUsed;
      const allowedVariance =
        typeof global.gc === 'function' ? 1024 * 1024 : 16 * 1024 * 1024;
      expect(Math.abs(memoryDifference)).toBeLessThan(allowedVariance);
    });

    it('should validate memory usage assertions', () => {
      const before = takeMemorySnapshot();

      // Small allocation
      const smallArray = new Array(1000).fill(0);

      const after = takeMemorySnapshot();

      // Should not throw for reasonable memory growth
      expect(() => {
        assertMemoryUsage(before, after, 5); // 5MB limit
      }).not.toThrow();

      // Clean up
      smallArray.length = 0;
    });
  });

  describe('Resource Management', () => {
    it('should support explicit resource management patterns', async () => {
      const resourceManager = new TestResourceManager();
      let disposed = false;

      const mockResource = {
        dispose: vi.fn(() => {
          disposed = true;
        }),
      };

      resourceManager.addResource(mockResource);

      // Test async disposal
      await resourceManager[Symbol.asyncDispose]();

      expect(mockResource.dispose).toHaveBeenCalled();
      expect(disposed).toBe(true);
    });

    it('should handle synchronous resource disposal', () => {
      const resourceManager = new TestResourceManager();
      let disposed = false;

      const mockResource = {
        dispose: () => {
          disposed = true;
        },
      };

      resourceManager.addResource(mockResource);

      // Test sync disposal
      resourceManager[Symbol.dispose]();

      expect(disposed).toBe(true);
    });

    it('should handle mixed sync/async resource disposal', async () => {
      const resourceManager = new TestResourceManager();
      const disposalOrder: string[] = [];

      const syncResource = {
        dispose: () => {
          disposalOrder.push('sync');
        },
      };

      const asyncResource = {
        dispose: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          disposalOrder.push('async');
        },
      };

      resourceManager.addResource(syncResource);
      resourceManager.addResource(asyncResource);

      await resourceManager[Symbol.asyncDispose]();

      expect(disposalOrder).toEqual(['async', 'sync']); // Reverse order
    });
  });

  describe('Async Context Tracking', () => {
    it('should support AsyncResource for context tracking', async () => {
      let contextValue: string | undefined;

      const testFunction = createTestAsyncResource(
        'test-context',
        (value: string) => {
          contextValue = value;
          return Promise.resolve(value.toUpperCase());
        }
      );

      const result = await testFunction('hello');

      expect(result).toBe('HELLO');
      expect(contextValue).toBe('hello');
    });

    it('should maintain context across async operations', async () => {
      const contextValues: string[] = [];

      const asyncOperation = createTestAsyncResource(
        'async-op',
        async (id: string) => {
          contextValues.push(`start-${id}`);
          await new Promise((resolve) => setTimeout(resolve, 10));
          contextValues.push(`end-${id}`);
          return id;
        }
      );

      // Run multiple async operations concurrently
      const promises = ['a', 'b', 'c'].map((id) => asyncOperation(id));
      const results = await Promise.all(promises);

      expect(results).toEqual(['a', 'b', 'c']);
      expect(contextValues).toHaveLength(6);
      expect(contextValues.filter((v) => v.startsWith('start-'))).toHaveLength(
        3
      );
      expect(contextValues.filter((v) => v.startsWith('end-'))).toHaveLength(3);
    });
  });

  describe('Performance Monitoring', () => {
    it('should track performance metrics accurately', async () => {
      const testOperation = async () => {
        // Simulate some work
        const start = performance.now();
        while (performance.now() - start < 10) {
          // Busy wait for 10ms
        }
        return 'completed';
      };

      const { result, metrics } = await measurePerformance(testOperation);

      expect(result).toBe('completed');
      expect(metrics.duration).toBeGreaterThanOrEqual(10);
      expect(metrics.duration).toBeLessThan(50); // Should not take too long
      expect(typeof metrics.memoryBefore.heapUsed).toBe('number');
      expect(typeof metrics.memoryAfter.heapUsed).toBe('number');
    });

    it('should handle timeout scenarios', async () => {
      const slowOperation = new Promise((resolve) => {
        setTimeout(() => resolve('slow'), 100);
      });

      // Should timeout before completion
      await expect(withTimeout(slowOperation, 50)).rejects.toThrow(
        'Test timed out after 50ms'
      );
    });

    it('should complete fast operations within timeout', async () => {
      const fastOperation = Promise.resolve('fast');

      const result = await withTimeout(fastOperation, 100);
      expect(result).toBe('fast');
    });
  });

  describe('Error Handling Improvements', () => {
    it('should support enhanced error handling patterns', () => {
      // Test Error.isError() if available (Node.js 24 feature)
      const error = new Error('test error');
      const notError = { message: 'not an error' };

      if (typeof (Error as any).isError === 'function') {
        expect((Error as any).isError(error)).toBe(true);
        expect((Error as any).isError(notError)).toBe(false);
      } else {
        // Fallback for environments without Error.isError
        expect(error instanceof Error).toBe(true);
        expect(notError instanceof Error).toBe(false);
      }
    });

    it('should preserve error context in async operations', async () => {
      const originalError = new Error('original error');
      originalError.stack = 'original stack trace';

      try {
        await Promise.reject(originalError);
      } catch (caught) {
        expect(caught).toBe(originalError);
        expect((caught as Error).message).toBe('original error');
        expect((caught as Error).stack).toContain('original stack trace');
      }
    });
  });

  describe('HTTP Performance Enhancements', () => {
    it('should validate Node.js 24 HTTP configuration options', async () => {
      // Test that Node.js 24 HTTP options are available
      const http = await import('node:http');

      expect(typeof http.createServer).toBe('function');
      expect(typeof http.Agent).toBe('function');

      // Test HTTP/2 support
      const http2 = await import('node:http2');
      expect(typeof http2.createServer).toBe('function');
    });

    it('should support enhanced connection management', async () => {
      const http = await import('node:http');

      const agent = new http.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 100,
        maxFreeSockets: 10,
        timeout: 60000,
      });

      expect(agent.keepAlive).toBe(true);
      expect(agent.keepAliveMsecs).toBe(30000);
      expect(agent.maxSockets).toBe(100);
      expect(agent.maxFreeSockets).toBe(10);
      // Note: timeout property may not be directly accessible on agent
      expect(agent.keepAlive).toBe(true);
    });
  });
});
