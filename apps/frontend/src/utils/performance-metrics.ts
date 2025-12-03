/**
 * Performance Metrics Collection Utility
 *
 * Tracks persistence operation latency, search performance, and other metrics
 * with a rolling window approach for memory efficiency.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 *
 * Task 9.1: Performance metrics collection for conversation persistence
 */

import { frontendLogger } from './logger.js';

/**
 * Performance metric entry
 */
interface MetricEntry {
  readonly timestamp: number;
  readonly duration: number;
  readonly success: boolean;
  readonly error?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Aggregated metric statistics
 */
export interface MetricStats {
  readonly total: number;
  readonly successful: number;
  readonly failed: number;
  readonly averageLatency: number;
  readonly minLatency: number;
  readonly maxLatency: number;
  readonly p50Latency: number;
  readonly p95Latency: number;
  readonly p99Latency: number;
  readonly successRate: number;
}

/**
 * Operation type for metrics tracking
 */
export enum OperationType {
  TITLE_UPDATE = 'title_update',
  DELETION = 'deletion',
  SEARCH = 'search',
  CROSS_TAB_SYNC = 'cross_tab_sync',
  INTEGRITY_CHECK = 'integrity_check',
  STORAGE_READ = 'storage_read',
  STORAGE_WRITE = 'storage_write',
  ENCRYPTION = 'encryption',
  DECRYPTION = 'decryption',
}

/**
 * Performance targets for different operations (in milliseconds)
 */
export const PERFORMANCE_TARGETS: Record<OperationType, number> = {
  [OperationType.TITLE_UPDATE]: 500,
  [OperationType.DELETION]: 500,
  [OperationType.SEARCH]: 500,
  [OperationType.CROSS_TAB_SYNC]: 1000,
  [OperationType.INTEGRITY_CHECK]: 5000,
  [OperationType.STORAGE_READ]: 100,
  [OperationType.STORAGE_WRITE]: 200,
  [OperationType.ENCRYPTION]: 50,
  [OperationType.DECRYPTION]: 50,
};

/**
 * Performance Metrics Collector
 *
 * Collects and aggregates performance metrics for persistence operations
 * with a rolling window to prevent memory leaks.
 *
 * Features:
 * - Rolling window of last 100 operations per type
 * - Automatic cleanup of old metrics
 * - Statistical analysis (avg, min, max, percentiles)
 * - Success rate tracking
 * - Performance target violation detection
 */
export class PerformanceMetrics {
  private static instance: PerformanceMetrics | null = null;
  private readonly metrics: Map<OperationType, MetricEntry[]>;
  private readonly maxEntriesPerType: number;

  /**
   * Create a new PerformanceMetrics instance
   *
   * @param maxEntriesPerType - Maximum number of entries to keep per operation type (default: 100)
   */
  private constructor(maxEntriesPerType = 100) {
    this.metrics = new Map();
    this.maxEntriesPerType = maxEntriesPerType;

    // Initialize empty arrays for each operation type
    Object.values(OperationType).forEach((type) => {
      this.metrics.set(type, []);
    });
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): PerformanceMetrics {
    if (PerformanceMetrics.instance === null) {
      PerformanceMetrics.instance = new PerformanceMetrics();
    }
    return PerformanceMetrics.instance;
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    PerformanceMetrics.instance = null;
  }

  /**
   * Record a metric entry
   *
   * @param type - Operation type
   * @param duration - Operation duration in milliseconds
   * @param success - Whether the operation succeeded
   * @param error - Error message if operation failed
   * @param metadata - Additional metadata
   */
  public record(
    type: OperationType,
    duration: number,
    success: boolean,
    error?: string,
    metadata?: Record<string, unknown>
  ): void {
    const entry: MetricEntry = {
      timestamp: Date.now(),
      duration,
      success,
      error,
      metadata,
    };

    const entries = this.metrics.get(type);
    if (!entries) {
      frontendLogger.warn('Unknown operation type', { type });
      return;
    }

    // Add new entry
    entries.push(entry);

    // Maintain rolling window
    if (entries.length > this.maxEntriesPerType) {
      entries.shift(); // Remove oldest entry
    }

    // Check if operation exceeded target
    const target = PERFORMANCE_TARGETS[type];
    if (duration > target) {
      frontendLogger.warn('Operation exceeded performance target', {
        type,
        duration,
        target,
        exceeded: duration - target,
        metadata,
      });
    }

    // Log failed operations
    if (!success) {
      frontendLogger.error('Operation failed', {
        type,
        duration,
        error,
        metadata,
      });
    }
  }

  /**
   * Get statistics for a specific operation type
   *
   * @param type - Operation type
   * @returns Aggregated statistics
   */
  public getStats(type: OperationType): MetricStats {
    const entries = this.metrics.get(type) ?? [];

    if (entries.length === 0) {
      return {
        total: 0,
        successful: 0,
        failed: 0,
        averageLatency: 0,
        minLatency: 0,
        maxLatency: 0,
        p50Latency: 0,
        p95Latency: 0,
        p99Latency: 0,
        successRate: 0,
      };
    }

    const successful = entries.filter((e) => e.success).length;
    const failed = entries.length - successful;
    const durations = entries.map((e) => e.duration).sort((a, b) => a - b);

    const sum = durations.reduce((acc, d) => acc + d, 0);
    const averageLatency = sum / durations.length;
    const minLatency = durations[0];
    const maxLatency = durations[durations.length - 1];

    // Calculate percentiles
    const p50Index = Math.floor(durations.length * 0.5);
    const p95Index = Math.floor(durations.length * 0.95);
    const p99Index = Math.floor(durations.length * 0.99);

    const p50Latency = durations[p50Index];
    const p95Latency = durations[p95Index];
    const p99Latency = durations[p99Index];

    const successRate = (successful / entries.length) * 100;

    return {
      total: entries.length,
      successful,
      failed,
      averageLatency,
      minLatency,
      maxLatency,
      p50Latency,
      p95Latency,
      p99Latency,
      successRate,
    };
  }

  /**
   * Get statistics for all operation types
   *
   * @returns Map of operation type to statistics
   */
  public getAllStats(): Map<OperationType, MetricStats> {
    const allStats = new Map<OperationType, MetricStats>();

    Object.values(OperationType).forEach((type) => {
      allStats.set(type, this.getStats(type));
    });

    return allStats;
  }

  /**
   * Get recent entries for a specific operation type
   *
   * @param type - Operation type
   * @param count - Number of recent entries to return (default: 10)
   * @returns Recent metric entries
   */
  public getRecentEntries(
    type: OperationType,
    count = 10
  ): readonly MetricEntry[] {
    const entries = this.metrics.get(type) ?? [];
    return entries.slice(-count);
  }

  /**
   * Clear all metrics
   */
  public clear(): void {
    this.metrics.forEach((entries) => {
      entries.length = 0;
    });
  }

  /**
   * Clear metrics for a specific operation type
   *
   * @param type - Operation type
   */
  public clearType(type: OperationType): void {
    const entries = this.metrics.get(type);
    if (entries) {
      entries.length = 0;
    }
  }

  /**
   * Get total number of recorded metrics
   *
   * @returns Total count across all operation types
   */
  public getTotalCount(): number {
    let total = 0;
    this.metrics.forEach((entries) => {
      total += entries.length;
    });
    return total;
  }

  /**
   * Check if any operation type has exceeded its performance target
   *
   * @returns Map of operation types that exceeded targets with their stats
   */
  public getPerformanceViolations(): Map<OperationType, MetricStats> {
    const violations = new Map<OperationType, MetricStats>();

    Object.values(OperationType).forEach((type) => {
      const stats = this.getStats(type);
      const target = PERFORMANCE_TARGETS[type];

      // Check if p95 latency exceeds target
      if (stats.p95Latency > target) {
        violations.set(type, stats);
      }
    });

    return violations;
  }

  /**
   * Export metrics as JSON for analysis
   *
   * @returns JSON representation of all metrics
   */
  public exportMetrics(): string {
    const data: Record<string, unknown> = {
      timestamp: Date.now(),
      stats: {},
      recentEntries: {},
    };

    const stats: Record<string, MetricStats> = {};
    const recentEntries: Record<string, readonly MetricEntry[]> = {};

    Object.values(OperationType).forEach((type) => {
      stats[type] = this.getStats(type);
      recentEntries[type] = this.getRecentEntries(type, 5);
    });

    data.stats = stats;
    data.recentEntries = recentEntries;

    return JSON.stringify(data, null, 2);
  }
}

/**
 * Measure the duration of an async operation and record metrics
 *
 * @param type - Operation type
 * @param operation - Async operation to measure
 * @param metadata - Additional metadata
 * @returns Result of the operation
 */
export async function measureAsync<T>(
  type: OperationType,
  operation: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const metrics = PerformanceMetrics.getInstance();
  const startTime = performance.now();
  let success = false;
  let error: string | undefined;

  try {
    const result = await operation();
    success = true;
    return result;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    const duration = performance.now() - startTime;
    metrics.record(type, duration, success, error, metadata);
  }
}

/**
 * Measure the duration of a sync operation and record metrics
 *
 * @param type - Operation type
 * @param operation - Sync operation to measure
 * @param metadata - Additional metadata
 * @returns Result of the operation
 */
export function measureSync<T>(
  type: OperationType,
  operation: () => T,
  metadata?: Record<string, unknown>
): T {
  const metrics = PerformanceMetrics.getInstance();
  const startTime = performance.now();
  let success = false;
  let error: string | undefined;

  try {
    const result = operation();
    success = true;
    return result;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    const duration = performance.now() - startTime;
    metrics.record(type, duration, success, error, metadata);
  }
}

/**
 * Create a performance measurement wrapper for a function
 *
 * @param type - Operation type
 * @param fn - Function to wrap
 * @returns Wrapped function that records metrics
 */
export function withMetrics<T extends (...args: unknown[]) => Promise<unknown>>(
  type: OperationType,
  fn: T
): T {
  return (async (...args: unknown[]) => {
    return await measureAsync(type, () => fn(...args));
  }) as T;
}

/**
 * Get singleton instance of PerformanceMetrics
 */
export function getPerformanceMetrics(): PerformanceMetrics {
  return PerformanceMetrics.getInstance();
}
