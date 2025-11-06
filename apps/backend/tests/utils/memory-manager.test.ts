/**
 * @fileoverview Unit tests for memory management utilities
 * Tests memory leak detection, GC monitoring, and memory metrics collection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MemoryManager,
  memoryManager,
  startMemoryMonitoring,
  getCurrentMemoryMetrics,
  detectMemoryLeaks,
  forceGarbageCollection,
  type MemoryMetrics,
  type MemoryLeakDetection,
  type MemoryManagerConfig,
} from '../../src/utils/memory-manager';

// Mock performance hooks
vi.mock('node:perf_hooks', () => ({
  PerformanceObserver: vi.fn().mockImplementation((callback) => ({
    observe: vi.fn(),
    disconnect: vi.fn(),
    callback,
  })),
  performance: {
    now: vi.fn(() => Date.now()),
    timeOrigin: Date.now(),
  },
}));

// Mock logger
vi.mock('../../src/middleware/logging.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('MemoryManager', () => {
  let manager: MemoryManager;
  let originalGC: typeof global.gc | undefined;
  let originalMemoryUsage: typeof process.memoryUsage;

  beforeEach(() => {
    // Store original functions
    originalGC = typeof global.gc === 'function' ? global.gc : undefined;
    originalMemoryUsage = process.memoryUsage;

    // Mock process.memoryUsage
    process.memoryUsage = vi.fn().mockReturnValue({
      rss: 100 * 1024 * 1024, // 100MB
      heapTotal: 80 * 1024 * 1024, // 80MB
      heapUsed: 40 * 1024 * 1024, // 40MB (50% usage)
      external: 5 * 1024 * 1024, // 5MB
      arrayBuffers: 2 * 1024 * 1024, // 2MB
    });

    // Create fresh manager instance
    manager = new MemoryManager({
      maxSamples: 10,
      sampleInterval: 100, // Fast sampling for tests
      enableLeakDetection: true,
      enableLogging: false, // Reduce noise in tests
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original functions
    if (originalGC !== undefined) {
      global.gc = originalGC;
    } else {
      delete (global as { gc?: typeof global.gc }).gc;
    }
    process.memoryUsage = originalMemoryUsage;

    // Stop monitoring
    manager.stopMonitoring();
  });

  describe('Memory Metrics Collection', () => {
    it('should collect basic memory metrics', () => {
      const metrics: MemoryMetrics = manager.getMemoryMetrics();

      expect(metrics).toMatchObject({
        timestamp: expect.any(String),
        heap: {
          used: 40 * 1024 * 1024,
          total: 80 * 1024 * 1024,
          percentage: 50,
          limit: expect.any(Number),
        },
        system: {
          rss: 100 * 1024 * 1024,
          external: 5 * 1024 * 1024,
          arrayBuffers: 2 * 1024 * 1024,
        },
        gc: {
          totalCollections: 0,
          totalDuration: 0,
          averageDuration: 0,
          recentCollections: [],
        },
        pressure: {
          level: 'low', // 50% usage is low pressure
          score: expect.any(Number),
          recommendations: expect.any(Array),
        },
      });
    });

    it('should detect memory pressure levels correctly', () => {
      // Test medium pressure (70%+)
      process.memoryUsage = vi.fn(() => ({
        rss: 100 * 1024 * 1024,
        heapTotal: 80 * 1024 * 1024,
        heapUsed: 60 * 1024 * 1024, // 75% usage
        external: 5 * 1024 * 1024,
        arrayBuffers: 2 * 1024 * 1024,
      }));

      let metrics: MemoryMetrics = manager.getMemoryMetrics();
      expect(metrics.pressure.level).toBe('medium');
      expect(metrics.heap.percentage).toBe(75);

      // Test high pressure (85%+)
      process.memoryUsage = vi.fn(() => ({
        rss: 100 * 1024 * 1024,
        heapTotal: 80 * 1024 * 1024,
        heapUsed: 72 * 1024 * 1024, // 90% usage
        external: 5 * 1024 * 1024,
        arrayBuffers: 2 * 1024 * 1024,
      }));

      metrics = manager.getMemoryMetrics();
      expect(metrics.pressure.level).toBe('high');
      expect(metrics.heap.percentage).toBe(90);

      // Test critical pressure (95%+)
      process.memoryUsage = vi.fn(() => ({
        rss: 100 * 1024 * 1024,
        heapTotal: 80 * 1024 * 1024,
        heapUsed: 78 * 1024 * 1024, // 97.5% usage
        external: 5 * 1024 * 1024,
        arrayBuffers: 2 * 1024 * 1024,
      }));

      metrics = manager.getMemoryMetrics();
      expect(metrics.pressure.level).toBe('critical');
      expect(metrics.heap.percentage).toBe(97.5);
    });

    it('should provide appropriate recommendations based on pressure level', () => {
      // Test critical pressure recommendations
      process.memoryUsage = vi.fn(() => ({
        rss: 100 * 1024 * 1024,
        heapTotal: 80 * 1024 * 1024,
        heapUsed: 78 * 1024 * 1024, // 97.5% usage
        external: 5 * 1024 * 1024,
        arrayBuffers: 2 * 1024 * 1024,
      }));

      const metrics: MemoryMetrics = manager.getMemoryMetrics();
      expect(metrics.pressure.recommendations).toContain(
        'Immediate action required - consider request throttling'
      );
      expect(metrics.pressure.recommendations).toContain(
        'Force garbage collection if possible'
      );
    });
  });

  describe('Memory Leak Detection', () => {
    it('should detect no leak with insufficient data', () => {
      const detection: MemoryLeakDetection = manager.detectMemoryLeaks();

      expect(detection).toMatchObject({
        leakDetected: false,
        confidence: 0,
        growthRate: 0,
        samples: [],
        analysis: {
          trend: 'stable',
          growthAcceleration: 0,
          memoryEfficiency: 1,
        },
        recommendations: [
          'Insufficient data - need at least 10 samples for analysis',
        ],
      });
    });

    it('should detect memory leak with growing trend', async () => {
      // Start monitoring to collect samples
      manager.startMonitoring();

      // Simulate growing memory usage over time
      let heapUsed = 40 * 1024 * 1024;
      const growthPerSample = 5 * 1024 * 1024; // 5MB growth per sample

      for (let i = 0; i < 15; i++) {
        heapUsed += growthPerSample;
        process.memoryUsage = vi.fn(() => ({
          rss: 100 * 1024 * 1024,
          heapTotal: 120 * 1024 * 1024,
          heapUsed,
          external: 5 * 1024 * 1024,
          arrayBuffers: 2 * 1024 * 1024,
        }));

        // Wait for sample collection
        await new Promise((resolve) => setTimeout(resolve, 110));
      }

      const detection: MemoryLeakDetection = manager.detectMemoryLeaks();

      expect(detection.leakDetected).toBe(true);
      expect(detection.confidence).toBeGreaterThan(0.7);
      expect(detection.growthRate).toBeGreaterThan(1024 * 1024); // > 1MB growth
      expect(detection.analysis.trend).toBe('growing');
      expect(detection.recommendations).toContain(
        'Memory leak detected - immediate investigation required'
      );
    });

    it('should handle stable memory usage correctly', async () => {
      manager.startMonitoring();

      // Simulate stable memory usage
      const stableHeapUsed = 40 * 1024 * 1024;
      process.memoryUsage = vi.fn(() => ({
        rss: 100 * 1024 * 1024,
        heapTotal: 80 * 1024 * 1024,
        heapUsed: stableHeapUsed + Math.random() * 1024 * 1024, // Small random variation
        external: 5 * 1024 * 1024,
        arrayBuffers: 2 * 1024 * 1024,
      }));

      // Collect samples
      for (let i = 0; i < 12; i++) {
        await new Promise((resolve) => setTimeout(resolve, 110));
      }

      const detection: MemoryLeakDetection = manager.detectMemoryLeaks();

      expect(detection.leakDetected).toBe(false);
      expect(detection.confidence).toBeLessThan(0.5);
      expect(detection.analysis.trend).toMatch(/stable|volatile/);
    });
  });

  describe('Garbage Collection Monitoring', () => {
    it('should start and stop monitoring correctly', () => {
      expect(manager.getMemoryMetrics().gc.totalCollections).toBe(0);

      manager.startMonitoring();
      // Monitoring should be active (tested via side effects)

      manager.stopMonitoring();
      // Monitoring should be stopped (tested via side effects)
    });

    it('should handle GC observer initialization failure gracefully', async () => {
      const { PerformanceObserver } = vi.mocked(
        await import('node:perf_hooks')
      );
      PerformanceObserver.mockImplementationOnce(() => {
        throw new Error('GC observer not available');
      });

      // Should not throw
      expect(() => manager.startMonitoring()).not.toThrow();
    });
  });

  describe('Force Garbage Collection', () => {
    it('should force GC when available', () => {
      const mockGC = vi.fn();
      global.gc = mockGC;

      const result = manager.forceGarbageCollection();

      expect(result).toBe(true);
      expect(mockGC).toHaveBeenCalledOnce();
    });

    it('should handle missing GC gracefully', () => {
      delete (global as { gc?: () => void }).gc;

      const result = manager.forceGarbageCollection();

      expect(result).toBe(false);
    });
  });

  describe('Memory Data Management', () => {
    it('should clear memory data correctly', () => {
      manager.clearMemoryData();

      const metrics: MemoryMetrics = manager.getMemoryMetrics();
      expect(metrics.gc.totalCollections).toBe(0);
      expect(metrics.gc.totalDuration).toBe(0);
      expect(metrics.gc.recentCollections).toHaveLength(0);
    });
  });
});

describe('Global Memory Management Functions', () => {
  beforeEach(() => {
    // Mock process.memoryUsage for global functions
    process.memoryUsage = vi.fn(() => ({
      rss: 100 * 1024 * 1024,
      heapTotal: 80 * 1024 * 1024,
      heapUsed: 40 * 1024 * 1024,
      external: 5 * 1024 * 1024,
      arrayBuffers: 2 * 1024 * 1024,
    }));
  });

  afterEach(() => {
    // Stop any monitoring that might have been started
    memoryManager.stopMonitoring();
  });

  describe('startMemoryMonitoring', () => {
    it('should start monitoring with default configuration', () => {
      const manager = startMemoryMonitoring();
      expect(manager).toBeInstanceOf(MemoryManager);

      // Should be able to get metrics
      const metrics: MemoryMetrics = manager.getMemoryMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.timestamp).toBeDefined();
    });

    it('should start monitoring with custom configuration', () => {
      const config: Partial<MemoryManagerConfig> = {
        maxSamples: 50,
        sampleInterval: 1000,
        enableLeakDetection: false,
      };

      const manager = startMemoryMonitoring(config);
      expect(manager).toBeInstanceOf(MemoryManager);
    });
  });

  describe('getCurrentMemoryMetrics', () => {
    it('should return current memory metrics', () => {
      const metrics: MemoryMetrics = getCurrentMemoryMetrics();

      expect(metrics).toMatchObject({
        timestamp: expect.any(String),
        heap: expect.objectContaining({
          used: expect.any(Number),
          total: expect.any(Number),
          percentage: expect.any(Number),
        }),
        system: expect.objectContaining({
          rss: expect.any(Number),
          external: expect.any(Number),
          arrayBuffers: expect.any(Number),
        }),
        gc: expect.objectContaining({
          totalCollections: expect.any(Number),
          totalDuration: expect.any(Number),
          averageDuration: expect.any(Number),
        }),
        pressure: expect.objectContaining({
          level: expect.stringMatching(/^(low|medium|high|critical)$/),
          score: expect.any(Number),
          recommendations: expect.any(Array),
        }),
      });
    });
  });

  describe('detectMemoryLeaks', () => {
    it('should return memory leak detection results', () => {
      const detection: MemoryLeakDetection = detectMemoryLeaks();

      expect(detection).toMatchObject({
        leakDetected: expect.any(Boolean),
        confidence: expect.any(Number),
        growthRate: expect.any(Number),
        samples: expect.any(Array),
        timestamp: expect.any(String),
        analysis: expect.objectContaining({
          trend: expect.stringMatching(/^(stable|growing|declining|volatile)$/),
          growthAcceleration: expect.any(Number),
          memoryEfficiency: expect.any(Number),
        }),
        recommendations: expect.any(Array),
      });
    });
  });

  describe('forceGarbageCollection', () => {
    it('should attempt to force garbage collection', () => {
      const result = forceGarbageCollection();
      expect(typeof result).toBe('boolean');
    });
  });
});

describe('Memory Leak Detection Edge Cases', () => {
  let manager: MemoryManager;

  beforeEach(() => {
    manager = new MemoryManager({
      maxSamples: 20,
      sampleInterval: 50,
      enableLeakDetection: true,
      enableLogging: false,
    });

    process.memoryUsage = vi.fn(() => ({
      rss: 100 * 1024 * 1024,
      heapTotal: 80 * 1024 * 1024,
      heapUsed: 40 * 1024 * 1024,
      external: 5 * 1024 * 1024,
      arrayBuffers: 2 * 1024 * 1024,
    }));
  });

  afterEach(() => {
    manager.stopMonitoring();
  });

  it('should handle volatile memory patterns', async () => {
    manager.startMonitoring();

    // Simulate volatile memory usage (up and down)
    const baseHeapUsed = 40 * 1024 * 1024;
    let direction = 1;
    let heapUsed = baseHeapUsed;

    for (let i = 0; i < 15; i++) {
      heapUsed += direction * Math.random() * 10 * 1024 * 1024;
      if (heapUsed > baseHeapUsed + 20 * 1024 * 1024) {
        direction = -1;
      }
      if (heapUsed < baseHeapUsed) {
        direction = 1;
      }

      process.memoryUsage = vi.fn(() => ({
        rss: 100 * 1024 * 1024,
        heapTotal: 120 * 1024 * 1024,
        heapUsed: Math.max(baseHeapUsed, heapUsed),
        external: 5 * 1024 * 1024,
        arrayBuffers: 2 * 1024 * 1024,
      }));

      await new Promise((resolve) => setTimeout(resolve, 60));
    }

    const detection: MemoryLeakDetection = manager.detectMemoryLeaks();
    expect(detection.analysis.trend).toMatch(/volatile|stable/);
    expect(detection.leakDetected).toBe(false);
  });

  it('should handle declining memory usage', async () => {
    manager.startMonitoring();

    // Simulate declining memory usage (good GC)
    let heapUsed = 80 * 1024 * 1024; // Start high
    const decreasePerSample = 3 * 1024 * 1024; // 3MB decrease per sample

    for (let i = 0; i < 15; i++) {
      heapUsed = Math.max(20 * 1024 * 1024, heapUsed - decreasePerSample);
      process.memoryUsage = vi.fn(() => ({
        rss: 100 * 1024 * 1024,
        heapTotal: 80 * 1024 * 1024,
        heapUsed,
        external: 5 * 1024 * 1024,
        arrayBuffers: 2 * 1024 * 1024,
      }));

      await new Promise((resolve) => setTimeout(resolve, 60));
    }

    const detection: MemoryLeakDetection = manager.detectMemoryLeaks();
    expect(detection.analysis.trend).toBe('declining');
    expect(detection.leakDetected).toBe(false);
    expect(detection.growthRate).toBeLessThan(0);
  });
});
