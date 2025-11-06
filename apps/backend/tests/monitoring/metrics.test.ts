import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  InMemoryMetricCollector,
  PerformanceTimer,
  SystemResourceMonitor,
  metricsCollector,
  createTimer,
  recordBusinessMetric,
} from '../../src/monitoring/metrics';

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../src/middleware/logging.js', () => ({
  logger: loggerMock,
}));

describe('InMemoryMetricCollector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records metrics with validation and circular buffering', () => {
    const collector = new InMemoryMetricCollector(2);

    collector.recordPerformance({
      name: 'azure_request',
      value: 25,
      duration: 25,
      success: true,
      timestamp: new Date().toISOString(),
    } as any);
    collector.recordPerformance({
      name: 'azure_request',
      value: 40,
      duration: 40,
      success: true,
      timestamp: new Date().toISOString(),
    } as any);
    collector.recordPerformance({
      name: 'azure_request',
      value: 55,
      duration: 55,
      success: true,
      timestamp: new Date().toISOString(),
    } as any);

    const metrics = collector.getMetrics();
    expect(metrics).toHaveLength(2);
    expect(metrics[0]?.value).toBe(40);
    expect(metrics[1]?.value).toBe(55);
  });

  it('rejects invalid metrics', () => {
    const collector = new InMemoryMetricCollector();
    expect(() => collector.recordPerformance({} as any)).toThrow(
      'Metric name is required'
    );
  });

  it('clears metrics on demand', () => {
    const collector = new InMemoryMetricCollector();
    collector.recordResource({
      name: 'heap_used',
      value: 100,
      timestamp: new Date().toISOString(),
      resourceType: 'memory',
      usage: 100,
    });

    expect(collector.getMetrics()).toHaveLength(1);
    collector.clearMetrics();
    expect(collector.getMetrics()).toHaveLength(0);
  });
});

describe('Performance timers and global helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records performance metrics through the global collector', () => {
    const recordSpy = vi.spyOn(metricsCollector, 'recordPerformance');
    const timer = new PerformanceTimer('responses.create', 'timer-test');
    const metric = timer.stop(true);

    expect(recordSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'responses.create' })
    );
    expect(metric.success).toBe(true);
    recordSpy.mockRestore();
  });

  it('creates timers and business metrics via helper functions', () => {
    const recordPerformanceSpy = vi.spyOn(
      metricsCollector,
      'recordPerformance'
    );
    const recordBusinessSpy = vi.spyOn(metricsCollector, 'recordBusiness');

    const timer = createTimer('claude.request');
    timer.stop(false, 'timeout');
    expect(recordPerformanceSpy).toHaveBeenCalled();

    recordBusinessMetric('api_requests', 'requests', 1, {
      endpoint: '/v1/completions',
    });
    expect(recordBusinessSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'api_requests' })
    );

    recordPerformanceSpy.mockRestore();
    recordBusinessSpy.mockRestore();
  });
});

describe('SystemResourceMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('collects CPU, memory, and event loop metrics', async () => {
    const monitor = new SystemResourceMonitor(10);
    const recordSpy = vi.spyOn(metricsCollector, 'recordResource');

    await (
      monitor as unknown as {
        collectResourceMetrics: () => Promise<void> | void;
      }
    ).collectResourceMetrics();

    await new Promise((resolve) => setImmediate(resolve));

    expect(recordSpy).toHaveBeenCalled();
    recordSpy.mockRestore();
  });
});
