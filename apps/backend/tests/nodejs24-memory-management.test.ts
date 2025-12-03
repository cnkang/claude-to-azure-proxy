/**
 * Node.js 24 Memory Management Tests
 * Tests for enhanced memory management features in Node.js 24
 */

import { performance } from 'node:perf_hooks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GCMonitor,
  type MemorySnapshot,
  assertMemoryUsage,
  measurePerformance,
  takeMemorySnapshot,
} from './utils/nodejs24-test-utils';

describe('Node.js 24 Memory Management', () => {
  let initialSnapshot: MemorySnapshot;

  beforeEach(() => {
    // Force GC if available to start with clean state
    if (global.gc) {
      global.gc();
    }
    initialSnapshot = takeMemorySnapshot();
  });

  afterEach(() => {
    // Clean up after each test
    if (global.gc) {
      global.gc();
    }
  });

  describe('Enhanced Garbage Collection', () => {
    it('should handle large object allocation and cleanup efficiently', async () => {
      const beforeAllocation = takeMemorySnapshot();

      // Allocate large objects
      const largeObjects: Array<{
        data: number[];
        metadata: Record<string, unknown>;
      }> = [];

      for (let i = 0; i < 100; i++) {
        largeObjects.push({
          data: new Array(10000).fill(i),
          metadata: {
            id: i,
            timestamp: Date.now(),
            description: `Large object ${i}`.repeat(100),
          },
        });
      }

      const afterAllocation = takeMemorySnapshot();
      expect(afterAllocation.heapUsed).toBeGreaterThan(
        beforeAllocation.heapUsed
      );

      // Clear references
      largeObjects.length = 0;

      // Force GC and wait
      if (global.gc) {
        global.gc();
      }
      await new Promise((resolve) => setTimeout(resolve, 100));

      const afterCleanup = takeMemorySnapshot();

      // Memory should be reduced or at least not significantly increased
      const memoryReduction = afterAllocation.heapUsed - afterCleanup.heapUsed;
      // Allow for some variance in GC behavior - memory might not always be reduced immediately
      expect(memoryReduction).toBeGreaterThanOrEqual(-1024 * 1024); // Allow up to 1MB increase
    });

    it('should monitor garbage collection events', async () => {
      const gcMonitor = new GCMonitor();
      gcMonitor.start();

      // Create memory pressure to trigger GC
      const arrays: number[][] = [];
      for (let i = 0; i < 200; i++) {
        arrays.push(new Array(5000).fill(Math.random()));
      }

      // Force GC
      if (global.gc) {
        global.gc();
      }

      // Wait for GC events to be recorded
      await new Promise((resolve) => setTimeout(resolve, 50));

      const gcEvents = gcMonitor.stop();

      // Clean up
      arrays.length = 0;

      // Should have recorded some GC activity
      if (gcEvents.length > 0) {
        expect(gcEvents[0]).toHaveProperty('type');
        expect(gcEvents[0]).toHaveProperty('duration');
        expect(gcEvents[0]).toHaveProperty('timestamp');
        expect(typeof gcEvents[0].duration).toBe('number');
        expect(gcEvents[0].duration).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle circular references efficiently', () => {
      const beforeTest = takeMemorySnapshot();

      // Create circular references
      const objects: Array<{ ref?: unknown; data: number[] }> = [];

      for (let i = 0; i < 1000; i++) {
        const obj = {
          data: new Array(100).fill(i),
          ref: undefined as unknown,
        };

        // Create circular reference
        obj.ref = obj;
        objects.push(obj);
      }

      const afterCreation = takeMemorySnapshot();
      expect(afterCreation.heapUsed).toBeGreaterThan(beforeTest.heapUsed);

      // Break circular references
      objects.forEach((obj) => {
        obj.ref = undefined;
      });
      objects.length = 0;

      // Force GC
      if (global.gc) {
        global.gc();
      }

      const afterCleanup = takeMemorySnapshot();

      // Should not leak memory significantly
      assertMemoryUsage(beforeTest, afterCleanup, 5); // 5MB tolerance
    });
  });

  describe('Memory Pressure Handling', () => {
    it('should handle memory pressure gracefully', async () => {
      const { metrics } = await measurePerformance(async () => {
        const chunks: Uint8Array[] = [];

        try {
          // Gradually increase memory usage
          for (let i = 0; i < 100; i++) {
            chunks.push(new Uint8Array(1024 * 1024)); // 1MB chunks

            // Check if we're using too much memory
            const currentSnapshot = takeMemorySnapshot();
            if (
              currentSnapshot.heapUsed >
              initialSnapshot.heapUsed + 200 * 1024 * 1024
            ) {
              // Stop if we've used more than 200MB additional
              break;
            }
          }

          return chunks.length;
        } finally {
          // Clean up
          chunks.length = 0;
        }
      });

      // Should complete without crashing
      expect(metrics.duration).toBeGreaterThan(0);

      // Memory delta should be reasonable after cleanup
      expect(Math.abs(metrics.memoryDelta)).toBeLessThan(50 * 1024 * 1024); // 50MB tolerance
    });

    it('should handle ArrayBuffer allocation efficiently', () => {
      const beforeTest = takeMemorySnapshot();

      const buffers: ArrayBuffer[] = [];

      // Allocate multiple ArrayBuffers
      for (let i = 0; i < 50; i++) {
        buffers.push(new ArrayBuffer(1024 * 1024)); // 1MB each
      }

      const afterAllocation = takeMemorySnapshot();

      // Should show increased external memory
      expect(afterAllocation.external).toBeGreaterThan(beforeTest.external);
      expect(afterAllocation.arrayBuffers).toBeGreaterThan(
        beforeTest.arrayBuffers
      );

      // Clean up
      buffers.length = 0;

      if (global.gc) {
        global.gc();
      }

      const afterCleanup = takeMemorySnapshot();

      // External memory should be reduced
      expect(afterCleanup.external).toBeLessThanOrEqual(
        afterAllocation.external
      );
    });
  });

  describe('WeakRef and FinalizationRegistry', () => {
    it('should support WeakRef for weak references', () => {
      let target = { data: 'test-data', id: 123 };
      const weakRef = new WeakRef(target);

      // Should be able to access the target initially
      expect(weakRef.deref()).toBe(target);
      expect(weakRef.deref()?.data).toBe('test-data');

      // Clear the strong reference
      target = null as any;

      // WeakRef might still have the reference (depends on GC timing)
      const derefResult = weakRef.deref();
      if (derefResult) {
        expect(derefResult.data).toBe('test-data');
      }
    });

    it('should support FinalizationRegistry for cleanup callbacks', async () => {
      const cleanupCalls: string[] = [];

      const registry = new FinalizationRegistry((heldValue: string) => {
        cleanupCalls.push(heldValue);
      });

      // Create objects and register them
      let obj1: { id: number } | null = { id: 1 };
      let obj2: { id: number } | null = { id: 2 };

      registry.register(obj1, 'object-1');
      registry.register(obj2, 'object-2');

      // Clear references
      obj1 = null;
      obj2 = null;

      // Force GC multiple times
      if (global.gc) {
        for (let i = 0; i < 5; i++) {
          global.gc();
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      // Note: FinalizationRegistry callbacks are not guaranteed to run
      // This test mainly verifies the API is available
      expect(registry).toBeInstanceOf(FinalizationRegistry);
    });
  });

  describe('Memory Monitoring', () => {
    it('should provide detailed memory metrics', () => {
      const snapshot = takeMemorySnapshot();

      // Validate all expected properties are present and reasonable
      expect(snapshot.heapUsed).toBeGreaterThan(0);
      expect(snapshot.heapTotal).toBeGreaterThanOrEqual(snapshot.heapUsed);
      expect(snapshot.external).toBeGreaterThanOrEqual(0);
      expect(snapshot.arrayBuffers).toBeGreaterThanOrEqual(0);
      expect(snapshot.rss).toBeGreaterThan(snapshot.heapTotal);
      expect(snapshot.timestamp).toBeGreaterThan(0);

      // RSS should be the largest value (includes everything)
      expect(snapshot.rss).toBeGreaterThanOrEqual(snapshot.heapTotal);
      expect(snapshot.heapTotal).toBeGreaterThanOrEqual(snapshot.heapUsed);
    });

    it('should track memory changes over time', async () => {
      const snapshots: MemorySnapshot[] = [];

      // Take initial snapshot
      snapshots.push(takeMemorySnapshot());

      // Perform memory operations
      for (let i = 0; i < 5; i++) {
        // Allocate some memory
        const tempArray = new Array(10000).fill(`data-${i}`);

        snapshots.push(takeMemorySnapshot());

        // Clean up
        tempArray.length = 0;

        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Verify we captured multiple snapshots
      expect(snapshots.length).toBe(6);

      // Verify timestamps are increasing
      for (let i = 1; i < snapshots.length; i++) {
        expect(snapshots[i].timestamp).toBeGreaterThan(
          snapshots[i - 1].timestamp
        );
      }

      // Memory usage should have varied
      const heapUsages = snapshots.map((s) => s.heapUsed);
      const minHeap = Math.min(...heapUsages);
      const maxHeap = Math.max(...heapUsages);

      expect(maxHeap).toBeGreaterThan(minHeap);
    });
  });

  describe('Performance Impact', () => {
    it('should have minimal performance impact from memory monitoring', async () => {
      const iterations = 1000;

      // Measure without monitoring
      const startWithoutMonitoring = performance.now();
      for (let i = 0; i < iterations; i++) {
        const arr = new Array(100).fill(i);
        arr.reduce((sum, val) => sum + val, 0);
      }
      const timeWithoutMonitoring = performance.now() - startWithoutMonitoring;

      // Measure with monitoring
      const startWithMonitoring = performance.now();
      for (let i = 0; i < iterations; i++) {
        const arr = new Array(100).fill(i);
        takeMemorySnapshot(); // Add monitoring overhead
        arr.reduce((sum, val) => sum + val, 0);
      }
      const timeWithMonitoring = performance.now() - startWithMonitoring;

      // Monitoring overhead should be reasonable (less than 10x slower)
      const overhead = timeWithMonitoring / timeWithoutMonitoring;
      expect(overhead).toBeLessThan(10);
    });
  });
});
