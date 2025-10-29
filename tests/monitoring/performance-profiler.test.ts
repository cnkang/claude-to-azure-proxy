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
    expect(performance.getEntriesByName('unit-test-op_duration').length).toBe(
      0
    );
  });

  it('emits warnings and errors during memory leak monitoring', () => {
    vi.useFakeTimers();
    const profilerInternals = performanceProfiler as unknown as {
      memorySamples: Array<{
        timestamp: number;
        heapUsed: number;
        heapTotal: number;
        rss: number;
      }>;
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

  describe('Node.js 24 Enhanced Features', () => {
    it('should get Node.js 24 specific performance metrics', () => {
      const profiler = new PerformanceProfiler();
      const metrics = profiler.getNodeJS24Metrics();

      expect(metrics).toHaveProperty('nodeVersion');
      expect(metrics).toHaveProperty('v8Version');
      expect(metrics).toHaveProperty('eventLoopUtilization');
      expect(metrics).toHaveProperty('resourceUsage');
      expect(metrics).toHaveProperty('timestamp');

      // Check event loop utilization structure
      expect(metrics.eventLoopUtilization).toHaveProperty('idle');
      expect(metrics.eventLoopUtilization).toHaveProperty('active');
      expect(metrics.eventLoopUtilization).toHaveProperty('utilization');

      // Check resource usage structure
      expect(metrics.resourceUsage).toHaveProperty('userCPUTime');
      expect(metrics.resourceUsage).toHaveProperty('systemCPUTime');
      expect(metrics.resourceUsage).toHaveProperty('maxRSS');
      expect(metrics.resourceUsage).toHaveProperty('fsRead');
      expect(metrics.resourceUsage).toHaveProperty('fsWrite');
    });

    it('should handle enhanced memory monitoring with detailed thresholds', () => {
      vi.useFakeTimers();

      // Mock high memory usage scenario
      const memoryUsageSpy = vi
        .spyOn(process, 'memoryUsage')
        .mockImplementation(() => ({
          rss: 100_000_000,
          heapTotal: 80_000_000,
          heapUsed: 76_000_000, // 95% usage - critical
          external: 15_000_000,
          arrayBuffers: 5_000_000,
        }));

      const profiler = new PerformanceProfiler(10, 100);
      profiler.startProfiling();

      // Advance time to trigger memory monitoring
      vi.advanceTimersByTime(100);

      profiler.stopProfiling();

      // Should log critical memory usage
      expect(logger.error).toHaveBeenCalledWith(
        'Critical memory usage detected',
        '',
        expect.objectContaining({
          heapUsagePercent: 95,
          severity: 'critical',
          threshold: 90,
        })
      );

      memoryUsageSpy.mockRestore();
    });

    it('should handle enhanced GC monitoring with type names', () => {
      const profiler = new PerformanceProfiler();

      // Start profiling to trigger the setup
      profiler.startProfiling();

      // Test GC profile creation and logging
      const profile = profiler.getCurrentProfile();

      // GC profiles should be an array (may be empty if no GC events occurred)
      expect(Array.isArray(profile.gc)).toBe(true);

      // The profiler should have been set up to observe GC events
      expect(logger.info).toHaveBeenCalledWith(
        'Performance profiling started',
        '',
        expect.objectContaining({
          maxSamples: expect.any(Number),
          sampleInterval: expect.any(Number),
        })
      );

      // Clean up
      profiler.stopProfiling();
    });

    it('should handle external memory monitoring', () => {
      vi.useFakeTimers();

      // Mock high external memory usage
      const memoryUsageSpy = vi
        .spyOn(process, 'memoryUsage')
        .mockImplementation(() => ({
          rss: 100_000_000,
          heapTotal: 80_000_000,
          heapUsed: 40_000_000, // 50% heap usage - normal
          external: 60_000_000, // 60% of RSS - high external usage
          arrayBuffers: 10_000_000,
        }));

      const profiler = new PerformanceProfiler(10, 100);
      profiler.startProfiling();

      // Advance time to trigger memory monitoring
      vi.advanceTimersByTime(100);

      profiler.stopProfiling();

      // Should warn about high external memory usage
      expect(logger.warn).toHaveBeenCalledWith(
        'High external memory usage detected',
        '',
        expect.objectContaining({
          externalThreshold: 50,
          externalPercent: 60,
        })
      );

      memoryUsageSpy.mockRestore();
    });

    it('should provide enhanced memory leak detection recommendations', () => {
      const profiler = new PerformanceProfiler();

      // Test with insufficient data
      const detection = profiler.detectMemoryLeaks();

      expect(detection.leakDetected).toBe(false);
      expect(detection.recommendations).toContain(
        'Insufficient data - need at least 10 samples'
      );
    });

    it('should handle GC observer setup gracefully when not available', () => {
      // This test verifies that the profiler handles cases where GC observation
      // might not be available (older Node.js versions or restricted environments)
      const profiler = new PerformanceProfiler();

      // Starting profiling should not throw even if GC observer fails
      expect(() => profiler.startProfiling()).not.toThrow();
      expect(() => profiler.stopProfiling()).not.toThrow();
    });

    it('should calculate memory growth rate accurately', () => {
      vi.useFakeTimers();

      // Create a scenario with steady memory growth
      let heapUsed = 50_000_000;
      const memoryUsageSpy = vi
        .spyOn(process, 'memoryUsage')
        .mockImplementation(() => ({
          rss: 100_000_000,
          heapTotal: 80_000_000,
          heapUsed: (heapUsed += 500_000), // Steady 500KB growth per sample
          external: 10_000_000,
          arrayBuffers: 5_000_000,
        }));

      const profiler = new PerformanceProfiler(20, 50);
      profiler.startProfiling();

      // Generate enough samples for leak detection
      vi.advanceTimersByTime(500); // 10 samples

      profiler.stopProfiling();

      const detection = profiler.detectMemoryLeaks();

      // Should detect the growth pattern
      expect(detection.samples.length).toBeGreaterThanOrEqual(10);
      expect(detection.growthRate).toBeGreaterThan(0);

      memoryUsageSpy.mockRestore();
    });
  });
});
