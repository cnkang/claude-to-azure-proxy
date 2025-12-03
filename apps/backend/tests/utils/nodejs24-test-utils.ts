/**
 * Node.js 24 specific test utilities and helpers
 * Provides utilities for testing Node.js 24 features and performance
 */

import { AsyncResource } from 'node:async_hooks';
import { PerformanceObserver, performance } from 'node:perf_hooks';

/**
 * Memory usage snapshot for testing memory leaks
 */
export interface MemorySnapshot {
  readonly heapUsed: number;
  readonly heapTotal: number;
  readonly external: number;
  readonly arrayBuffers: number;
  readonly rss: number;
  readonly timestamp: number;
}

/**
 * Performance metrics for Node.js 24 testing
 */
export interface PerformanceMetrics {
  readonly duration: number;
  readonly memoryBefore: MemorySnapshot;
  readonly memoryAfter: MemorySnapshot;
  readonly memoryDelta: number;
  readonly gcEvents: readonly GCEvent[];
}

/**
 * Garbage collection event information
 */
export interface GCEvent {
  readonly type: string;
  readonly duration: number;
  readonly timestamp: number;
}

/**
 * Take a memory usage snapshot
 */
export function takeMemorySnapshot(): MemorySnapshot {
  const memUsage = process.memoryUsage();
  return {
    heapUsed: memUsage.heapUsed,
    heapTotal: memUsage.heapTotal,
    external: memUsage.external,
    arrayBuffers: memUsage.arrayBuffers,
    rss: memUsage.rss,
    timestamp: performance.now(),
  };
}

/**
 * Monitor garbage collection events during test execution
 */
export class GCMonitor {
  private readonly events: GCEvent[] = [];
  private observer: PerformanceObserver | null = null;

  public start(): void {
    this.events.length = 0;
    this.observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (const entry of entries) {
        if (entry.entryType === 'gc') {
          this.events.push({
            type: (entry as any).detail?.type || 'unknown',
            duration: entry.duration,
            timestamp: entry.startTime,
          });
        }
      }
    });

    this.observer.observe({ entryTypes: ['gc'] });
  }

  public stop(): readonly GCEvent[] {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    return [...this.events];
  }
}

/**
 * Measure performance of an async operation with memory tracking
 */
export async function measurePerformance<T>(
  operation: () => Promise<T>
): Promise<{ result: T; metrics: PerformanceMetrics }> {
  const gcMonitor = new GCMonitor();

  // Force garbage collection if available (for testing)
  if (global.gc) {
    global.gc();
  }

  const memoryBefore = takeMemorySnapshot();
  gcMonitor.start();

  const startTime = performance.now();
  const result = await operation();
  const endTime = performance.now();

  const gcEvents = gcMonitor.stop();

  // Force garbage collection again to measure cleanup
  if (global.gc) {
    global.gc();
  }

  const memoryAfter = takeMemorySnapshot();

  const metrics: PerformanceMetrics = {
    duration: endTime - startTime,
    memoryBefore,
    memoryAfter,
    memoryDelta: memoryAfter.heapUsed - memoryBefore.heapUsed,
    gcEvents,
  };

  return { result, metrics };
}

/**
 * Test helper for resource cleanup using Node.js 24's explicit resource management
 */
export class TestResourceManager {
  private readonly resources: Array<{ dispose: () => void | Promise<void> }> =
    [];

  public addResource(resource: { dispose: () => void | Promise<void> }): void {
    this.resources.push(resource);
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    for (const resource of this.resources.reverse()) {
      await resource.dispose();
    }
    this.resources.length = 0;
  }

  public [Symbol.dispose](): void {
    for (const resource of this.resources.reverse()) {
      const result = resource.dispose();
      if (result instanceof Promise) {
        throw new Error('Cannot dispose async resource synchronously');
      }
    }
    this.resources.length = 0;
  }
}

/**
 * Create an async resource for testing async context tracking
 */
export function createTestAsyncResource<T extends (...args: any[]) => any>(
  name: string,
  fn: T
): T {
  const asyncResource = new AsyncResource(name);

  return ((...args: Parameters<T>) => {
    return asyncResource.runInAsyncScope(fn, null, ...args);
  }) as T;
}

/**
 * Wait for next tick with Node.js 24 optimizations
 */
export function nextTick(): Promise<void> {
  return new Promise((resolve) => {
    process.nextTick(resolve);
  });
}

/**
 * Wait for multiple ticks to ensure async operations complete
 */
export async function waitForTicks(count = 3): Promise<void> {
  for (let i = 0; i < count; i++) {
    await nextTick();
  }
}

/**
 * Assert that memory usage is within acceptable bounds
 */
export function assertMemoryUsage(
  before: MemorySnapshot,
  after: MemorySnapshot,
  maxDeltaMB = 10
): void {
  const deltaMB = (after.heapUsed - before.heapUsed) / (1024 * 1024);

  if (deltaMB > maxDeltaMB) {
    throw new Error(
      `Memory usage increased by ${deltaMB.toFixed(2)}MB, ` +
        `which exceeds the limit of ${maxDeltaMB}MB`
    );
  }
}

/**
 * Create a test timeout that works well with Node.js 24's performance characteristics
 */
export function createTestTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Test timed out after ${ms}ms`));
    }, ms);

    // Ensure timeout is cleaned up
    timeout.unref();
  });
}

/**
 * Race a promise against a timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.race([promise, createTestTimeout(timeoutMs)]);
}
