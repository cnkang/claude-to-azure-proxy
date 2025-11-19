/**
 * Performance Metrics Tests
 *
 * Tests for the PerformanceMetrics utility class
 *
 * Task 9.1: Test performance metrics collection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PerformanceMetrics,
  OperationType,
  PERFORMANCE_TARGETS,
  measureAsync,
  measureSync,
} from '../utils/performance-metrics';

describe('PerformanceMetrics', () => {
  let metrics: PerformanceMetrics;

  beforeEach(() => {
    // Reset singleton instance before each test
    PerformanceMetrics.resetInstance();
    metrics = PerformanceMetrics.getInstance();
  });

  afterEach(() => {
    metrics.clear();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = PerformanceMetrics.getInstance();
      const instance2 = PerformanceMetrics.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should reset instance', () => {
      const instance1 = PerformanceMetrics.getInstance();
      PerformanceMetrics.resetInstance();
      const instance2 = PerformanceMetrics.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Recording Metrics', () => {
    it('should record successful operation', () => {
      metrics.record(OperationType.TITLE_UPDATE, 100, true);

      const stats = metrics.getStats(OperationType.TITLE_UPDATE);
      expect(stats.total).toBe(1);
      expect(stats.successful).toBe(1);
      expect(stats.failed).toBe(0);
      expect(stats.averageLatency).toBe(100);
      expect(stats.successRate).toBe(100);
    });

    it('should record failed operation', () => {
      metrics.record(OperationType.DELETION, 200, false, 'Test error');

      const stats = metrics.getStats(OperationType.DELETION);
      expect(stats.total).toBe(1);
      expect(stats.successful).toBe(0);
      expect(stats.failed).toBe(1);
      expect(stats.successRate).toBe(0);
    });

    it('should record multiple operations', () => {
      metrics.record(OperationType.SEARCH, 100, true);
      metrics.record(OperationType.SEARCH, 200, true);
      metrics.record(OperationType.SEARCH, 300, false);

      const stats = metrics.getStats(OperationType.SEARCH);
      expect(stats.total).toBe(3);
      expect(stats.successful).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.averageLatency).toBe(200);
      expect(stats.successRate).toBeCloseTo(66.67, 1);
    });

    it('should maintain rolling window of 100 entries', () => {
      // Record 150 operations
      for (let i = 0; i < 150; i++) {
        metrics.record(OperationType.TITLE_UPDATE, i, true);
      }

      const stats = metrics.getStats(OperationType.TITLE_UPDATE);
      expect(stats.total).toBe(100); // Should only keep last 100
    });
  });

  describe('Statistics Calculation', () => {
    beforeEach(() => {
      // Record operations with known latencies
      [50, 100, 150, 200, 250, 300, 350, 400, 450, 500].forEach((latency) => {
        metrics.record(OperationType.CROSS_TAB_SYNC, latency, true);
      });
    });

    it('should calculate average latency correctly', () => {
      const stats = metrics.getStats(OperationType.CROSS_TAB_SYNC);
      expect(stats.averageLatency).toBe(275); // (50+100+...+500)/10
    });

    it('should calculate min and max latency', () => {
      const stats = metrics.getStats(OperationType.CROSS_TAB_SYNC);
      expect(stats.minLatency).toBe(50);
      expect(stats.maxLatency).toBe(500);
    });

    it('should calculate percentiles correctly', () => {
      const stats = metrics.getStats(OperationType.CROSS_TAB_SYNC);
      // With 10 values [50, 100, 150, 200, 250, 300, 350, 400, 450, 500]
      // p50 (50%) = index 5 = 300
      // p95 (95%) = index 9 = 500
      // p99 (99%) = index 9 = 500
      expect(stats.p50Latency).toBe(300); // Median (50th percentile)
      expect(stats.p95Latency).toBe(500); // 95th percentile
      expect(stats.p99Latency).toBe(500); // 99th percentile
    });

    it('should return zero stats for empty operation type', () => {
      const stats = metrics.getStats(OperationType.INTEGRITY_CHECK);
      expect(stats.total).toBe(0);
      expect(stats.averageLatency).toBe(0);
      expect(stats.successRate).toBe(0);
    });
  });

  describe('Performance Targets', () => {
    it('should have defined targets for all operation types', () => {
      Object.values(OperationType).forEach((opType) => {
        expect(PERFORMANCE_TARGETS[opType]).toBeDefined();
        expect(PERFORMANCE_TARGETS[opType]).toBeGreaterThan(0);
      });
    });

    it('should detect performance violations', () => {
      // Record operations that exceed targets
      metrics.record(OperationType.TITLE_UPDATE, 1000, true); // Target: 500ms
      metrics.record(OperationType.DELETION, 1500, true); // Target: 500ms

      const violations = metrics.getPerformanceViolations();
      expect(violations.size).toBeGreaterThan(0);
    });
  });

  describe('Recent Entries', () => {
    it('should return recent entries', () => {
      metrics.record(OperationType.SEARCH, 100, true);
      metrics.record(OperationType.SEARCH, 200, true);
      metrics.record(OperationType.SEARCH, 300, true);

      const recent = metrics.getRecentEntries(OperationType.SEARCH, 2);
      expect(recent.length).toBe(2);
      expect(recent[0].duration).toBe(200);
      expect(recent[1].duration).toBe(300);
    });

    it('should return all entries if count exceeds total', () => {
      metrics.record(OperationType.SEARCH, 100, true);
      metrics.record(OperationType.SEARCH, 200, true);

      const recent = metrics.getRecentEntries(OperationType.SEARCH, 10);
      expect(recent.length).toBe(2);
    });
  });

  describe('Clear Operations', () => {
    beforeEach(() => {
      metrics.record(OperationType.TITLE_UPDATE, 100, true);
      metrics.record(OperationType.DELETION, 200, true);
    });

    it('should clear all metrics', () => {
      metrics.clear();

      const stats1 = metrics.getStats(OperationType.TITLE_UPDATE);
      const stats2 = metrics.getStats(OperationType.DELETION);

      expect(stats1.total).toBe(0);
      expect(stats2.total).toBe(0);
    });

    it('should clear specific operation type', () => {
      metrics.clearType(OperationType.TITLE_UPDATE);

      const stats1 = metrics.getStats(OperationType.TITLE_UPDATE);
      const stats2 = metrics.getStats(OperationType.DELETION);

      expect(stats1.total).toBe(0);
      expect(stats2.total).toBe(1);
    });
  });

  describe('Export Metrics', () => {
    it('should export metrics as JSON', () => {
      metrics.record(OperationType.TITLE_UPDATE, 100, true);

      const exported = metrics.exportMetrics();
      const data = JSON.parse(exported);

      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('stats');
      expect(data).toHaveProperty('recentEntries');
      expect(data.stats).toHaveProperty('title_update');
    });
  });

  describe('Measurement Helpers', () => {
    it('should measure async operation', async () => {
      const operation = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'result';
      };

      const result = await measureAsync(OperationType.TITLE_UPDATE, operation);

      expect(result).toBe('result');

      const stats = metrics.getStats(OperationType.TITLE_UPDATE);
      expect(stats.total).toBe(1);
      expect(stats.successful).toBe(1);
      expect(stats.averageLatency).toBeGreaterThan(0);
    });

    it('should measure async operation failure', async () => {
      const operation = async () => {
        throw new Error('Test error');
      };

      await expect(
        measureAsync(OperationType.DELETION, operation)
      ).rejects.toThrow('Test error');

      const stats = metrics.getStats(OperationType.DELETION);
      expect(stats.total).toBe(1);
      expect(stats.successful).toBe(0);
      expect(stats.failed).toBe(1);
    });

    it('should measure sync operation', () => {
      const operation = () => {
        return 'result';
      };

      const result = measureSync(OperationType.SEARCH, operation);

      expect(result).toBe('result');

      const stats = metrics.getStats(OperationType.SEARCH);
      expect(stats.total).toBe(1);
      expect(stats.successful).toBe(1);
    });

    it('should measure sync operation failure', () => {
      const operation = () => {
        throw new Error('Test error');
      };

      expect(() => measureSync(OperationType.SEARCH, operation)).toThrow(
        'Test error'
      );

      const stats = metrics.getStats(OperationType.SEARCH);
      expect(stats.total).toBe(1);
      expect(stats.failed).toBe(1);
    });
  });

  describe('Total Count', () => {
    it('should return total count across all operation types', () => {
      metrics.record(OperationType.TITLE_UPDATE, 100, true);
      metrics.record(OperationType.DELETION, 200, true);
      metrics.record(OperationType.SEARCH, 300, true);

      expect(metrics.getTotalCount()).toBe(3);
    });
  });

  describe('Get All Stats', () => {
    it('should return stats for all operation types', () => {
      metrics.record(OperationType.TITLE_UPDATE, 100, true);
      metrics.record(OperationType.DELETION, 200, true);

      const allStats = metrics.getAllStats();

      expect(allStats.size).toBe(Object.values(OperationType).length);
      expect(allStats.get(OperationType.TITLE_UPDATE)?.total).toBe(1);
      expect(allStats.get(OperationType.DELETION)?.total).toBe(1);
      expect(allStats.get(OperationType.SEARCH)?.total).toBe(0);
    });
  });
});
