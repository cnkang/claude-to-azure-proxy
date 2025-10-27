import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { performance } from 'perf_hooks';
import {
  PerformanceProfiler,
  performanceProfiler,
  profileOperation,
  startMemoryLeakDetection,
} from '../../src/monitoring/performance-profiler.js';

const { logger } = vi.hoisted(() => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../src/middleware/logging.js', () => ({ logger }));

describe('PerformanceProfiler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('produces performance snapshots with CPU, memory, and event loop data', () => {
    const profiler = new PerformanceProfiler();
    const profile = profiler.getCurrentProfile();

    expect(profile.cpu).toHaveProperty('user');
    expect(profile.memory).toHaveProperty('heapUsagePercent');
    expect(profile.eventLoop).toHaveProperty('lag');
    expect(Array.isArray(profile.marks)).toBe(true);
    expect(Array.isArray(profile.measures)).toBe(true);
  });

  it('samples memory and detects potential leaks when growth persists', () => {
    vi.useFakeTimers();
    let heapUsed = 10_000_000;
    const memoryUsageSpy = vi
      .spyOn(process, 'memoryUsage')
      .mockImplementation(() => ({
        rss: 20_000_000,
        heapTotal: 40_000_000,
        heapUsed: (heapUsed += 2_000_000),
        external: 0,
        arrayBuffers: 0,
      }));

    const profiler = new PerformanceProfiler(25, 10);
    profiler.startProfiling();
    vi.advanceTimersByTime(300);
    profiler.stopProfiling();

    const detection = profiler.detectMemoryLeaks();
    expect(detection.samples.length).toBeGreaterThanOrEqual(10);
    expect(detection.leakDetected).toBe(true);

    memoryUsageSpy.mockRestore();
  });

  it('creates and clears performance marks via helpers', async () => {
    await profileOperation('unit-test-op', async () => 'done');
    const measures = performance.getEntriesByName('unit-test-op_duration');
    expect(measures.length).toBeGreaterThan(0);

    performanceProfiler.clearPerformanceData();
    expect(performance.getEntriesByName('unit-test-op_duration').length).toBe(0);
  });

  it('emits warnings and errors during memory leak monitoring', () => {
    vi.useFakeTimers();
    const profilerInternals = performanceProfiler as unknown as {
      memorySamples: Array<{ timestamp: number; heapUsed: number; heapTotal: number; rss: number }>;
    };
    profilerInternals.memorySamples.length = 0;
    for (let i = 0; i < 12; i++) {
      profilerInternals.memorySamples.push({
        timestamp: i,
        heapUsed: 10_000_000 + i * 600_000,
        heapTotal: 40_000_000,
        rss: 20_000_000,
      });
    }

    const stopMonitoring = startMemoryLeakDetection(10);
    vi.advanceTimersByTime(10);
    stopMonitoring();

    expect(logger.warn).toHaveBeenCalled();

    profilerInternals.memorySamples.length = 0;
    for (let i = 0; i < 12; i++) {
      profilerInternals.memorySamples.push({
        timestamp: i,
        heapUsed: 10_000_000 + i * 2_000_000,
        heapTotal: 40_000_000,
        rss: 20_000_000,
      });
    }

    const stopCriticalMonitoring = startMemoryLeakDetection(10);
    vi.advanceTimersByTime(10);
    stopCriticalMonitoring();

    expect(logger.error).toHaveBeenCalled();
  });
});
