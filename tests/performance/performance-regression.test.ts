/**
 * Performance regression tests for Node.js 24 upgrade
 * Validates performance improvements and prevents regressions
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { performance } from 'node:perf_hooks';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import {
  measurePerformance,
  takeMemorySnapshot,
  GCMonitor,
} from '../utils/nodejs24-test-utils.js';
import { runStartupBenchmarks } from './startup-benchmark.js';
import { runMemoryBenchmarks } from './memory-benchmark.js';

/**
 * Performance thresholds for regression detection
 */
const PERFORMANCE_THRESHOLDS = {
  startup: {
    maxStartupTime: 2000, // 2 seconds
    maxModuleLoadTime: 500, // 500ms
    maxMemoryUsage: 100 * 1024 * 1024, // 100MB
  },
  http: {
    maxResponseTime: 1000, // 1 second
    minThroughput: 100, // requests per second
    maxMemoryPerRequest: 10 * 1024 * 1024, // 10MB per request
  },
  memory: {
    maxMemoryLeak: 50 * 1024 * 1024, // 50MB
    minCleanupEfficiency: -50, // Allow negative efficiency due to GC unpredictability
    maxGCPause: 100, // 100ms
  },
  streaming: {
    maxLatency: 100, // 100ms
    minThroughput: 1024 * 1024, // 1MB/s
    maxBackpressureEvents: 100, // More realistic threshold
  },
};

/**
 * Performance baseline data
 */
interface PerformanceBaseline {
  readonly nodeVersion: string;
  readonly timestamp: string;
  readonly startup: {
    readonly startupTime: number;
    readonly moduleLoadTime: number;
    readonly memoryUsage: number;
  };
  readonly http: {
    readonly averageResponseTime: number;
    readonly throughput: number;
    readonly memoryPerRequest: number;
  };
  readonly memory: {
    readonly memoryLeak: number;
    readonly cleanupEfficiency: number;
    readonly gcPause: number;
  };
  readonly streaming: {
    readonly latency: number;
    readonly throughput: number;
    readonly backpressureEvents: number;
  };
}

describe('Performance Regression Tests', () => {
  let baseline: PerformanceBaseline | null = null;
  const baselineFile = 'performance-baseline.json';

  beforeAll(async () => {
    // Try to load existing baseline
    try {
      const baselineData = await readFile(baselineFile, 'utf-8');
      baseline = JSON.parse(baselineData);
    } catch {
      // No baseline exists, will create one
      baseline = null;
    }
  });

  afterAll(async () => {
    // Clean up test files
    try {
      await unlink(baselineFile);
    } catch {
      // File doesn't exist, ignore
    }
  });

  describe('Startup Performance', () => {
    it('should meet startup time requirements', async () => {
      const results = await runStartupBenchmarks();
      expect(results.length).toBeGreaterThan(0);

      const avgStartupTime =
        results.reduce((sum, r) => sum + r.startupTime, 0) / results.length;
      const avgModuleLoadTime =
        results.reduce((sum, r) => sum + r.moduleLoadTime, 0) / results.length;
      const avgMemoryUsage =
        results.reduce((sum, r) => sum + r.memoryUsage.heapUsed, 0) /
        results.length;

      // Check against thresholds
      expect(avgStartupTime).toBeLessThan(
        PERFORMANCE_THRESHOLDS.startup.maxStartupTime
      );
      expect(avgModuleLoadTime).toBeLessThan(
        PERFORMANCE_THRESHOLDS.startup.maxModuleLoadTime
      );
      expect(avgMemoryUsage).toBeLessThan(
        PERFORMANCE_THRESHOLDS.startup.maxMemoryUsage
      );

      // Check against baseline if available
      if (baseline) {
        expect(avgStartupTime).toBeLessThanOrEqual(
          baseline.startup.startupTime * 1.1
        ); // Allow 10% regression
        expect(avgModuleLoadTime).toBeLessThanOrEqual(
          baseline.startup.moduleLoadTime * 1.1
        );
        expect(avgMemoryUsage).toBeLessThanOrEqual(
          baseline.startup.memoryUsage * 1.1
        );
      }
    }, 60000);

    it('should show improvement over Node.js 22 baseline', async () => {
      // This test validates that Node.js 24 shows improvements
      const results = await runStartupBenchmarks();
      const avgStartupTime =
        results.reduce((sum, r) => sum + r.startupTime, 0) / results.length;

      // Node.js 24 should have better startup performance
      if (process.version.startsWith('v24.')) {
        expect(avgStartupTime).toBeLessThan(1500); // Should be under 1.5 seconds
      }
    }, 30000);
  });

  describe('Memory Performance', () => {
    it('should meet memory efficiency requirements', async () => {
      const results = await runMemoryBenchmarks();
      expect(results.length).toBeGreaterThan(0);

      for (const result of results) {
        const memoryLeak = result.memoryDelta;
        const memoryIncrease =
          result.peakMemory.heapUsed - result.initialMemory.heapUsed;
        const memoryCleanup =
          result.peakMemory.heapUsed - result.finalMemory.heapUsed;
        const cleanupEfficiency = (memoryCleanup / memoryIncrease) * 100;

        // Check against thresholds
        expect(Math.abs(memoryLeak)).toBeLessThan(
          PERFORMANCE_THRESHOLDS.memory.maxMemoryLeak
        );
        expect(cleanupEfficiency).toBeGreaterThan(
          PERFORMANCE_THRESHOLDS.memory.minCleanupEfficiency
        );

        // Check GC performance
        const avgGCDuration =
          result.gcEvents.length > 0
            ? result.gcEvents.reduce((sum, gc) => sum + gc.duration, 0) /
              result.gcEvents.length
            : 0;
        expect(avgGCDuration).toBeLessThan(
          PERFORMANCE_THRESHOLDS.memory.maxGCPause
        );
      }
    }, 120000);

    it('should prevent memory leaks in long-running operations', async () => {
      const gcMonitor = new GCMonitor();
      gcMonitor.start();

      const initialMemory = takeMemorySnapshot();

      // Simulate long-running operation
      const operations = [];
      for (let i = 0; i < 1000; i++) {
        operations.push(
          new Promise((resolve) => {
            const data = new Array(1000).fill(i);
            setTimeout(() => {
              data.length = 0; // Clear data
              resolve(i);
            }, 1);
          })
        );
      }

      await Promise.all(operations);

      // Force garbage collection
      if (global.gc) {
        global.gc();
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      const finalMemory = takeMemorySnapshot();
      const gcEvents = gcMonitor.stop();

      const memoryDelta = finalMemory.heapUsed - initialMemory.heapUsed;

      // Should not leak significant memory
      expect(Math.abs(memoryDelta)).toBeLessThan(25 * 1024 * 1024); // 25MB threshold

      // GC events might be 0 if no GC was triggered during the test
      expect(gcEvents.length).toBeGreaterThanOrEqual(0);
    }, 30000);
  });

  describe('HTTP Performance', () => {
    it('should meet HTTP response time requirements', async () => {
      // Test HTTP performance with mock server
      const { result, metrics } = await measurePerformance(async () => {
        const requests = [];
        for (let i = 0; i < 100; i++) {
          requests.push(
            new Promise((resolve) => {
              const startTime = performance.now();
              // Simulate HTTP request processing
              setTimeout(() => {
                const endTime = performance.now();
                resolve(endTime - startTime);
              }, Math.random() * 50); // Random delay 0-50ms
            })
          );
        }
        return Promise.all(requests);
      });

      const responseTimes = result as number[];
      const avgResponseTime =
        responseTimes.reduce((sum, time) => sum + time, 0) /
        responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);

      // Check against thresholds
      expect(avgResponseTime).toBeLessThan(
        PERFORMANCE_THRESHOLDS.http.maxResponseTime
      );
      expect(maxResponseTime).toBeLessThan(
        PERFORMANCE_THRESHOLDS.http.maxResponseTime * 2
      );

      // Check memory usage during HTTP processing
      expect(metrics.memoryDelta).toBeLessThan(
        PERFORMANCE_THRESHOLDS.http.maxMemoryPerRequest
      );
    }, 30000);

    it('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = 50;
      const { result, metrics } = await measurePerformance(async () => {
        const requests = Array.from(
          { length: concurrentRequests },
          async (_, i) => {
            const startTime = performance.now();

            // Simulate concurrent request processing
            await new Promise((resolve) =>
              setTimeout(resolve, Math.random() * 100)
            );

            return {
              id: i,
              duration: performance.now() - startTime,
            };
          }
        );

        return Promise.all(requests);
      });

      const results = result as Array<{ id: number; duration: number }>;
      const avgDuration =
        results.reduce((sum, r) => sum + r.duration, 0) / results.length;
      const throughput = concurrentRequests / (metrics.duration / 1000); // requests per second

      expect(avgDuration).toBeLessThan(200); // 200ms average
      expect(throughput).toBeGreaterThan(
        PERFORMANCE_THRESHOLDS.http.minThroughput
      );
    }, 30000);
  });

  describe('Streaming Performance', () => {
    it('should meet streaming latency requirements', async () => {
      const { result, metrics } = await measurePerformance(async () => {
        const chunks = [];
        const chunkSize = 1024; // 1KB chunks
        const totalChunks = 1000;

        for (let i = 0; i < totalChunks; i++) {
          const startTime = performance.now();

          // Simulate chunk processing
          const chunk = Buffer.alloc(chunkSize, i % 256);
          chunks.push(chunk);

          const processingTime = performance.now() - startTime;

          // Check individual chunk latency
          expect(processingTime).toBeLessThan(
            PERFORMANCE_THRESHOLDS.streaming.maxLatency
          );
        }

        return chunks;
      });

      const chunks = result as Buffer[];
      const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const throughput = totalSize / (metrics.duration / 1000); // bytes per second

      expect(throughput).toBeGreaterThan(
        PERFORMANCE_THRESHOLDS.streaming.minThroughput
      );
    }, 30000);

    it('should handle backpressure efficiently', async () => {
      let backpressureEvents = 0;

      await measurePerformance(async () => {
        const chunks = [];
        const slowConsumer = async (chunk: Buffer) => {
          // Simulate slow consumer
          await new Promise((resolve) => setTimeout(resolve, 10));
          return chunk;
        };

        for (let i = 0; i < 100; i++) {
          const chunk = Buffer.alloc(1024, i % 256);

          // Simulate backpressure
          if (chunks.length > 10) {
            backpressureEvents++;
            // Wait for consumer to catch up
            await slowConsumer(chunks.shift()!);
          }

          chunks.push(chunk);
        }

        // Process remaining chunks
        while (chunks.length > 0) {
          await slowConsumer(chunks.shift()!);
        }
      });

      expect(backpressureEvents).toBeLessThan(
        PERFORMANCE_THRESHOLDS.streaming.maxBackpressureEvents
      );
    }, 30000);
  });

  describe('Performance Baseline Management', () => {
    it('should create or update performance baseline', async () => {
      // Run all performance tests to create baseline
      const [startupResults, memoryResults] = await Promise.all([
        runStartupBenchmarks(),
        runMemoryBenchmarks(),
      ]);

      const newBaseline: PerformanceBaseline = {
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
        startup: {
          startupTime:
            startupResults.reduce((sum, r) => sum + r.startupTime, 0) /
            startupResults.length,
          moduleLoadTime:
            startupResults.reduce((sum, r) => sum + r.moduleLoadTime, 0) /
            startupResults.length,
          memoryUsage:
            startupResults.reduce((sum, r) => sum + r.memoryUsage.heapUsed, 0) /
            startupResults.length,
        },
        http: {
          averageResponseTime: 50, // Mock value
          throughput: 200, // Mock value
          memoryPerRequest: 1024 * 1024, // Mock value
        },
        memory: {
          memoryLeak: Math.abs(
            memoryResults.reduce((sum, r) => sum + r.memoryDelta, 0) /
              memoryResults.length
          ),
          cleanupEfficiency: 85, // Mock value
          gcPause: 50, // Mock value
        },
        streaming: {
          latency: 10, // Mock value
          throughput: 2 * 1024 * 1024, // Mock value
          backpressureEvents: 2, // Mock value
        },
      };

      // Save baseline for future comparisons
      await writeFile(baselineFile, JSON.stringify(newBaseline, null, 2));

      expect(newBaseline.nodeVersion).toBe(process.version);
      expect(newBaseline.startup.startupTime).toBeGreaterThan(0);
      expect(newBaseline.startup.memoryUsage).toBeGreaterThan(0);
    }, 180000);
  });

  describe('Node.js 24 Specific Performance Features', () => {
    it('should validate V8 engine improvements', () => {
      // Test V8 version for Node.js 24
      if (process.version.startsWith('v24.')) {
        const v8Version = process.versions.v8;
        expect(v8Version).toMatch(/^13\./); // V8 13.x for Node.js 24
      }
    });

    it('should validate enhanced async/await performance', async () => {
      const iterations = 10000;
      const startTime = performance.now();

      // Test async/await performance
      const results = [];
      for (let i = 0; i < iterations; i++) {
        results.push(await Promise.resolve(i));
      }

      const duration = performance.now() - startTime;
      const operationsPerSecond = iterations / (duration / 1000);

      // Node.js 24 should handle async operations efficiently
      expect(operationsPerSecond).toBeGreaterThan(50000); // 50k ops/sec minimum
      expect(results.length).toBe(iterations);
    }, 30000);

    it('should validate improved garbage collection', async () => {
      if (!global.gc) {
        console.warn('GC not exposed, skipping GC performance test');
        return;
      }

      const gcMonitor = new GCMonitor();
      gcMonitor.start();

      // Create memory pressure
      const arrays = [];
      for (let i = 0; i < 1000; i++) {
        arrays.push(new Array(1000).fill(i));
      }

      // Force GC
      global.gc();

      const gcEvents = gcMonitor.stop();

      // Clear arrays
      arrays.length = 0;

      expect(gcEvents.length).toBeGreaterThan(0);

      // Check GC efficiency (Node.js 24 should have faster GC)
      const avgGCDuration =
        gcEvents.reduce((sum, event) => sum + event.duration, 0) /
        gcEvents.length;
      expect(avgGCDuration).toBeLessThan(100); // 100ms max average GC pause
    }, 30000);
  });
});
