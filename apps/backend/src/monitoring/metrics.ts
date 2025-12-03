/**
 * @fileoverview Metrics collection and monitoring system with TypeScript interfaces.
 *
 * This module provides comprehensive metrics collection for monitoring application
 * performance, health, and operational characteristics. All metrics are typed
 * for compile-time safety and runtime validation.
 *
 * @author Claude-to-Azure Proxy Team
 * @version 2.0.0
 * @since 1.0.0
 */

import { performance } from 'node:perf_hooks';
import { logger } from '../middleware/logging';

/**
 * Metric data point interface with timestamp and metadata.
 *
 * @public
 * @interface MetricDataPoint
 */
export interface MetricDataPoint {
  /** Metric name identifier */
  readonly name: string;
  /** Metric value (number or string) */
  readonly value: number | string;
  /** ISO 8601 timestamp when metric was recorded */
  readonly timestamp: string;
  /** Optional metadata tags for filtering and grouping */
  readonly tags?: Readonly<Record<string, string>>;
  /** Optional unit of measurement */
  readonly unit?: string;
}

/**
 * Performance metric for tracking operation timing and success rates.
 *
 * @public
 * @interface PerformanceMetric
 */
export interface PerformanceMetric extends MetricDataPoint {
  /** Operation duration in milliseconds */
  readonly duration: number;
  /** Whether the operation was successful */
  readonly success: boolean;
  /** Optional error type if operation failed */
  readonly errorType?: string;
  /** Request correlation ID for tracing */
  readonly correlationId?: string;
}

/**
 * System resource metric for monitoring CPU, memory, and other resources.
 *
 * @public
 * @interface ResourceMetric
 */
export interface ResourceMetric extends MetricDataPoint {
  /** Resource type (cpu, memory, disk, network) */
  readonly resourceType: 'cpu' | 'memory' | 'disk' | 'network';
  /** Current usage value */
  readonly usage: number;
  /** Maximum available capacity */
  readonly capacity?: number;
  /** Usage as percentage of capacity */
  readonly percentage?: number;
}

/**
 * Business metric for tracking application-specific KPIs.
 *
 * @public
 * @interface BusinessMetric
 */
export interface BusinessMetric extends MetricDataPoint {
  /** Metric category for grouping */
  readonly category: 'requests' | 'completions' | 'authentication' | 'errors';
  /** Counter or gauge value */
  readonly count: number;
  /** Optional rate per time period */
  readonly rate?: number;
}

/**
 * Metric collection interface for different metric types.
 *
 * @public
 * @interface MetricCollector
 */
export interface MetricCollector {
  /** Collect and record a performance metric */
  recordPerformance(metric: PerformanceMetric): void;
  /** Collect and record a resource metric */
  recordResource(metric: ResourceMetric): void;
  /** Collect and record a business metric */
  recordBusiness(metric: BusinessMetric): void;
  /** Get all collected metrics */
  getMetrics(): readonly MetricDataPoint[];
  /** Clear all collected metrics */
  clearMetrics(): void;
}

/**
 * In-memory metric collector implementation with circular buffer.
 *
 * @public
 * @class InMemoryMetricCollector
 * @implements {MetricCollector}
 */
export class InMemoryMetricCollector implements MetricCollector {
  private readonly metrics: MetricDataPoint[] = [];
  private readonly maxMetrics: number;

  /**
   * Creates a new in-memory metric collector.
   *
   * @param maxMetrics - Maximum number of metrics to store (default: 1000)
   */
  constructor(maxMetrics = 1000) {
    this.maxMetrics = maxMetrics;
  }

  /**
   * Records a performance metric with validation.
   *
   * @param metric - Performance metric to record
   * @throws {Error} If metric validation fails
   */
  public recordPerformance(metric: PerformanceMetric): void {
    this.validateMetric(metric);
    this.addMetric({
      ...metric,
      name: `performance.${metric.name}`,
      value: metric.duration,
      unit: 'ms',
    });

    // Log performance metrics for monitoring
    logger.debug('Performance metric recorded', metric.correlationId ?? '', {
      metric: metric.name,
      duration: metric.duration,
      success: metric.success,
      errorType: metric.errorType,
    });
  }

  /**
   * Records a resource metric with validation.
   *
   * @param metric - Resource metric to record
   * @throws {Error} If metric validation fails
   */
  public recordResource(metric: ResourceMetric): void {
    this.validateMetric(metric);
    this.addMetric({
      ...metric,
      name: `resource.${metric.resourceType}.${metric.name}`,
      value: metric.usage,
    });

    // Log resource metrics for monitoring
    logger.debug('Resource metric recorded', '', {
      metric: metric.name,
      resourceType: metric.resourceType,
      usage: metric.usage,
      percentage: metric.percentage,
    });
  }

  /**
   * Records a business metric with validation.
   *
   * @param metric - Business metric to record
   * @throws {Error} If metric validation fails
   */
  public recordBusiness(metric: BusinessMetric): void {
    this.validateMetric(metric);
    this.addMetric({
      ...metric,
      name: `business.${metric.category}.${metric.name}`,
      value: metric.count,
    });

    // Log business metrics for monitoring
    logger.info('Business metric recorded', '', {
      metric: metric.name,
      category: metric.category,
      count: metric.count,
      rate: metric.rate,
    });
  }

  /**
   * Gets all collected metrics as a readonly array.
   *
   * @returns Readonly array of all collected metrics
   */
  public getMetrics(): readonly MetricDataPoint[] {
    return Object.freeze([...this.metrics]);
  }

  /**
   * Clears all collected metrics.
   */
  public clearMetrics(): void {
    this.metrics.length = 0;
    logger.debug('Metrics cleared', '', { action: 'clear_metrics' });
  }

  /**
   * Adds a metric to the collection with circular buffer behavior.
   *
   * @private
   * @param metric - Metric to add
   */
  private addMetric(metric: MetricDataPoint): void {
    this.metrics.push(metric);

    // Implement circular buffer to prevent memory leaks
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }
  }

  /**
   * Validates a metric data point.
   *
   * @private
   * @param metric - Metric to validate
   * @throws {Error} If metric is invalid
   */
  private validateMetric(metric: Partial<MetricDataPoint>): void {
    if (typeof metric.name !== 'string' || metric.name === '') {
      throw new Error('Metric name is required and must be a string');
    }

    if (metric.value === undefined) {
      throw new Error('Metric value is required');
    }

    // TypeScript now knows metric.value is defined
    const { value } = metric;
    if (typeof value !== 'number' && typeof value !== 'string') {
      throw new Error('Metric value must be a number or string');
    }
  }
}

/**
 * Performance timer utility for measuring operation duration.
 *
 * @public
 * @class PerformanceTimer
 */
export class PerformanceTimer {
  private readonly startTime: number;
  private readonly operationName: string;
  private readonly correlationId?: string;

  /**
   * Creates a new performance timer.
   *
   * @param operationName - Name of the operation being timed
   * @param correlationId - Optional correlation ID for tracing
   */
  constructor(operationName: string, correlationId?: string) {
    this.operationName = operationName;
    this.correlationId = correlationId;
    this.startTime = performance.now();
  }

  /**
   * Stops the timer and records a performance metric.
   *
   * @param success - Whether the operation was successful
   * @param errorType - Optional error type if operation failed
   * @returns Performance metric data
   */
  public stop(success = true, errorType?: string): PerformanceMetric {
    const duration = performance.now() - this.startTime;

    const metric: PerformanceMetric = {
      name: this.operationName,
      value: duration,
      timestamp: new Date().toISOString(),
      duration,
      success,
      errorType,
      correlationId: this.correlationId,
      unit: 'ms',
    };

    // Record the metric
    metricsCollector.recordPerformance(metric);

    return metric;
  }
}

/**
 * System resource monitor for collecting CPU, memory, and other metrics.
 *
 * @public
 * @class SystemResourceMonitor
 */
export class SystemResourceMonitor {
  private monitoringInterval?: NodeJS.Timeout;
  private readonly intervalMs: number;

  /**
   * Creates a new system resource monitor.
   *
   * @param intervalMs - Monitoring interval in milliseconds (default: 60000)
   */
  constructor(intervalMs = 60000) {
    this.intervalMs = intervalMs;
  }

  /**
   * Starts continuous resource monitoring.
   */
  public startMonitoring(): void {
    if (this.monitoringInterval) {
      return; // Already monitoring
    }

    this.monitoringInterval = setInterval(() => {
      this.collectResourceMetrics();
    }, this.intervalMs);

    logger.info('System resource monitoring started', '', {
      intervalMs: this.intervalMs,
    });
  }

  /**
   * Stops resource monitoring.
   */
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;

      logger.info('System resource monitoring stopped', '', {});
    }
  }

  /**
   * Collects current system resource metrics.
   *
   * @private
   */
  private collectResourceMetrics(): void {
    try {
      // Memory metrics
      const memoryUsage = process.memoryUsage();
      const memoryPercentage =
        (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

      metricsCollector.recordResource({
        name: 'heap_used',
        value: memoryUsage.heapUsed,
        timestamp: new Date().toISOString(),
        resourceType: 'memory',
        usage: memoryUsage.heapUsed,
        capacity: memoryUsage.heapTotal,
        percentage: memoryPercentage,
        unit: 'bytes',
      });

      // CPU metrics (basic process CPU time)
      const cpuUsage = process.cpuUsage();

      metricsCollector.recordResource({
        name: 'cpu_user_time',
        value: cpuUsage.user,
        timestamp: new Date().toISOString(),
        resourceType: 'cpu',
        usage: cpuUsage.user,
        unit: 'microseconds',
      });

      // Event loop lag (approximate)
      const start = process.hrtime.bigint();
      setImmediate(() => {
        const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms

        metricsCollector.recordResource({
          name: 'event_loop_lag',
          value: lag,
          timestamp: new Date().toISOString(),
          resourceType: 'cpu',
          usage: lag,
          unit: 'ms',
        });
      });
    } catch (error) {
      logger.error('Error collecting resource metrics', '', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

// Global instances
export const metricsCollector = new InMemoryMetricCollector(1000);
export const resourceMonitor = new SystemResourceMonitor(60000);

/**
 * Utility function to create a performance timer.
 *
 * @param operationName - Name of the operation being timed
 * @param correlationId - Optional correlation ID for tracing
 * @returns New performance timer instance
 *
 * @example
 * ```typescript
 * const timer = createTimer('api_request', correlationId);
 * // ... perform operation ...
 * timer.stop(true); // success = true
 * ```
 */
export function createTimer(
  operationName: string,
  correlationId?: string
): PerformanceTimer {
  return new PerformanceTimer(operationName, correlationId);
}

/**
 * Utility function to record a business metric.
 *
 * @param name - Metric name
 * @param category - Metric category
 * @param count - Counter value
 * @param tags - Optional metadata tags
 *
 * @example
 * ```typescript
 * recordBusinessMetric('api_requests', 'requests', 1, { endpoint: '/v1/completions' });
 * ```
 */
export function recordBusinessMetric(
  name: string,
  category: BusinessMetric['category'],
  count: number,
  tags?: Record<string, string>
): void {
  metricsCollector.recordBusiness({
    name,
    value: count,
    timestamp: new Date().toISOString(),
    category,
    count,
    tags,
  });
}
