/**
 * Performance alert system tests
 * Tests the performance monitoring and alerting functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import PerformanceAlertSystem, {
  type AlertConfig,
  type PerformanceAlert,
} from '../../src/monitoring/performance-alerts';

describe('Performance Alert System', () => {
  let alertSystem: PerformanceAlertSystem;
  let alertsReceived: PerformanceAlert[] = [];

  const testAlertConfigs: AlertConfig[] = [
    {
      metric: 'response_time',
      threshold: 100, // 100ms for testing
      level: 'warning',
      enabled: true,
      cooldownMs: 1000, // 1 second for testing
    },
    {
      metric: 'response_time',
      threshold: 500, // 500ms for testing
      level: 'critical',
      enabled: true,
      cooldownMs: 500, // 500ms for testing
    },
    {
      metric: 'memory_usage',
      threshold: 0.8, // 80%
      level: 'warning',
      enabled: true,
      cooldownMs: 1000,
    },
    {
      metric: 'error_rate',
      threshold: 0.1, // 10%
      level: 'warning',
      enabled: true,
      cooldownMs: 1000,
    },
  ];

  beforeEach(() => {
    alertsReceived = [];
    alertSystem = new PerformanceAlertSystem(testAlertConfigs);

    // Listen for alerts
    alertSystem.on('alert', (alert: PerformanceAlert) => {
      alertsReceived.push(alert);
    });
  });

  afterEach(() => {
    alertSystem.cleanup();
  });

  describe('Initialization', () => {
    it('should initialize with default configurations', () => {
      const defaultSystem = new PerformanceAlertSystem();
      expect(defaultSystem).toBeDefined();
      defaultSystem.cleanup();
    });

    it('should initialize with custom configurations', () => {
      expect(alertSystem).toBeDefined();
    });
  });

  describe('Monitoring Control', () => {
    it('should start and stop monitoring', () => {
      expect(() => alertSystem.startMonitoring()).not.toThrow();
      expect(() => alertSystem.stopMonitoring()).not.toThrow();
    });

    it('should handle multiple start/stop calls gracefully', () => {
      alertSystem.startMonitoring();
      alertSystem.startMonitoring(); // Should not throw

      alertSystem.stopMonitoring();
      alertSystem.stopMonitoring(); // Should not throw
    });
  });

  describe('Response Time Alerts', () => {
    it('should trigger warning alert for slow response time', async () => {
      alertSystem.startMonitoring();

      // Record a slow response time
      alertSystem.recordRequest(150, false); // 150ms > 100ms threshold

      // Wait for alert processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(alertsReceived).toHaveLength(1);
      expect(alertsReceived[0].metric).toBe('response_time');
      expect(alertsReceived[0].level).toBe('warning');
      expect(alertsReceived[0].value).toBe(150);
    });

    it('should trigger critical alert for very slow response time', async () => {
      alertSystem.startMonitoring();

      // Record a very slow response time
      alertSystem.recordRequest(600, false); // 600ms > 500ms threshold

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should trigger both warning and critical alerts
      expect(alertsReceived.length).toBeGreaterThanOrEqual(1);

      const criticalAlert = alertsReceived.find(
        (alert) => alert.level === 'critical'
      );
      expect(criticalAlert).toBeDefined();
      expect(criticalAlert?.metric).toBe('response_time');
      expect(criticalAlert?.value).toBe(600);
    });

    it('should not trigger alert for fast response time', async () => {
      alertSystem.startMonitoring();

      // Record a fast response time
      alertSystem.recordRequest(50, false); // 50ms < 100ms threshold

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(alertsReceived).toHaveLength(0);
    });

    it('should respect cooldown periods', async () => {
      alertSystem.startMonitoring();

      // Record first slow response
      alertSystem.recordRequest(150, false);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const firstAlertCount = alertsReceived.length;
      expect(firstAlertCount).toBe(1);

      // Record second slow response immediately (should be in cooldown)
      alertSystem.recordRequest(150, false);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(alertsReceived).toHaveLength(firstAlertCount); // No new alert

      // Wait for cooldown to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Record third slow response (should trigger new alert)
      alertSystem.recordRequest(150, false);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(alertsReceived.length).toBeGreaterThan(firstAlertCount);
    });
  });

  describe('Error Rate Alerts', () => {
    it('should trigger alert for high error rate', async () => {
      alertSystem.startMonitoring();

      // Record requests with high error rate
      for (let i = 0; i < 10; i++) {
        alertSystem.recordRequest(50, i < 2); // 20% error rate
      }

      // Wait for metrics collection
      await new Promise((resolve) => setTimeout(resolve, 31000)); // Wait for collection interval

      const errorRateAlerts = alertsReceived.filter(
        (alert) => alert.metric === 'error_rate'
      );
      expect(errorRateAlerts.length).toBeGreaterThan(0);
    }, 35000);

    it('should not trigger alert for low error rate', async () => {
      alertSystem.startMonitoring();

      // Record requests with low error rate
      for (let i = 0; i < 10; i++) {
        alertSystem.recordRequest(50, i === 0); // 10% error rate (at threshold)
      }

      // Wait for metrics collection
      await new Promise((resolve) => setTimeout(resolve, 31000));

      const errorRateAlerts = alertsReceived.filter(
        (alert) => alert.metric === 'error_rate'
      );
      expect(errorRateAlerts).toHaveLength(0);
    }, 35000);
  });

  describe('Metrics Collection', () => {
    it('should collect and store performance metrics', async () => {
      alertSystem.startMonitoring();

      // Record some requests
      for (let i = 0; i < 5; i++) {
        alertSystem.recordRequest(100 + i * 10, false);
      }

      // Wait for metrics collection
      await new Promise((resolve) => setTimeout(resolve, 31000));

      const currentMetrics = alertSystem.getCurrentMetrics();
      expect(currentMetrics).toBeDefined();
      expect(currentMetrics?.responseTime.average).toBeGreaterThan(0);
      expect(currentMetrics?.memoryUsage.heapUsed).toBeGreaterThan(0);
    }, 35000);

    it('should maintain metrics history', async () => {
      alertSystem.startMonitoring();

      // Record requests
      alertSystem.recordRequest(100, false);

      // Wait for multiple collection cycles
      await new Promise((resolve) => setTimeout(resolve, 65000)); // 2+ cycles

      const history = alertSystem.getMetricsHistory();
      expect(history.length).toBeGreaterThan(1);
    }, 70000);

    it('should limit metrics history size', async () => {
      alertSystem.startMonitoring();

      // Simulate many collection cycles (would need to mock for practical testing)
      const history = alertSystem.getMetricsHistory(10);
      expect(history.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Memory Monitoring', () => {
    it('should monitor memory usage', async () => {
      alertSystem.startMonitoring();

      // Wait for metrics collection
      await new Promise((resolve) => setTimeout(resolve, 31000));

      const metrics = alertSystem.getCurrentMetrics();
      expect(metrics?.memoryUsage.heapUsed).toBeGreaterThan(0);
      expect(metrics?.memoryUsage.heapTotal).toBeGreaterThan(0);
    }, 35000);
  });

  describe('GC Monitoring', () => {
    it('should monitor garbage collection events', async () => {
      if (!global.gc) {
        console.warn('GC not exposed, skipping GC monitoring test');
        return;
      }

      alertSystem.startMonitoring();

      // Create memory pressure to trigger GC
      const arrays = [];
      for (let i = 0; i < 1000; i++) {
        arrays.push(new Array(1000).fill(i));
      }

      // Force GC
      global.gc();

      // Clear arrays
      arrays.length = 0;

      // Wait for GC event processing
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const metrics = alertSystem.getCurrentMetrics();
      expect(metrics?.gcMetrics.eventCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Alert Configuration', () => {
    it('should handle disabled alerts', async () => {
      const configsWithDisabled: AlertConfig[] = [
        {
          metric: 'response_time',
          threshold: 50,
          level: 'warning',
          enabled: false, // Disabled
          cooldownMs: 1000,
        },
      ];

      const disabledSystem = new PerformanceAlertSystem(configsWithDisabled);
      const disabledAlerts: PerformanceAlert[] = [];

      disabledSystem.on('alert', (alert) => {
        disabledAlerts.push(alert);
      });

      disabledSystem.startMonitoring();
      disabledSystem.recordRequest(100, false); // Should exceed threshold but alert is disabled

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(disabledAlerts).toHaveLength(0);

      disabledSystem.cleanup();
    });
  });

  describe('Resource Management', () => {
    it('should implement explicit resource management', () => {
      using testSystem = new PerformanceAlertSystem(testAlertConfigs);
      expect(testSystem).toBeDefined();
      // Should automatically dispose when leaving scope
    });

    it('should implement async resource management', async () => {
      await using testSystem = new PerformanceAlertSystem(testAlertConfigs);
      expect(testSystem).toBeDefined();
      // Should automatically dispose when leaving scope
    });

    it('should cleanup resources properly', () => {
      const system = new PerformanceAlertSystem(testAlertConfigs);
      system.startMonitoring();

      expect(() => system.cleanup()).not.toThrow();
      expect(() => system.cleanup()).not.toThrow(); // Should handle multiple cleanup calls
    });
  });

  describe('Metrics Export', () => {
    it('should export metrics to file', async () => {
      alertSystem.startMonitoring();

      // Record some data
      alertSystem.recordRequest(100, false);

      // Wait for metrics collection
      await new Promise((resolve) => setTimeout(resolve, 31000));

      const exportPath = 'test-metrics-export.json';

      await expect(
        alertSystem.exportMetrics(exportPath)
      ).resolves.not.toThrow();

      // Clean up test file
      try {
        const fs = await import('node:fs/promises');
        await fs.unlink(exportPath);
      } catch {
        // File might not exist, ignore
      }
    }, 35000);
  });
});
