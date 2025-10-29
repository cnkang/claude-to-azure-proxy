/**
 * @fileoverview Performance profiling and memory leak detection utilities.
 *
 * This module provides comprehensive performance monitoring capabilities
 * including CPU profiling, memory leak detection, and performance metrics
 * collection with TypeScript type safety.
 *
 * @author Claude-to-Azure Proxy Team
 * @version 1.0.0
 * @since 1.0.0
 */

import { performance, PerformanceObserver } from 'perf_hooks';
import { logger } from '../middleware/logging.js';

/**
 * Performance profile data interface.
 *
 * @public
 * @interface PerformanceProfile
 */
export interface PerformanceProfile {
  /** Profile timestamp */
  readonly timestamp: string;
  /** CPU usage information */
  readonly cpu: CPUProfile;
  /** Memory usage information */
  readonly memory: MemoryProfile;
  /** Event loop metrics */
  readonly eventLoop: EventLoopProfile;
  /** Garbage collection metrics */
  readonly gc?: GCProfile[];
  /** Performance marks and measures */
  readonly marks: PerformanceMark[];
  /** Performance measures */
  readonly measures: PerformanceMeasure[];
}

/**
 * CPU profile interface.
 *
 * @public
 * @interface CPUProfile
 */
export interface CPUProfile {
  /** User CPU time in microseconds */
  readonly user: number;
  /** System CPU time in microseconds */
  readonly system: number;
  /** CPU usage percentage (approximate) */
  readonly percentage?: number;
}

/**
 * Memory profile interface.
 *
 * @public
 * @interface MemoryProfile
 */
export interface MemoryProfile {
  /** Resident set size in bytes */
  readonly rss: number;
  /** Heap total in bytes */
  readonly heapTotal: number;
  /** Heap used in bytes */
  readonly heapUsed: number;
  /** External memory in bytes */
  readonly external: number;
  /** Array buffers in bytes */
  readonly arrayBuffers: number;
  /** Heap usage percentage */
  readonly heapUsagePercent: number;
}

/**
 * Event loop profile interface.
 *
 * @public
 * @interface EventLoopProfile
 */
export interface EventLoopProfile {
  /** Event loop lag in milliseconds */
  readonly lag: number;
  /** Active handles count */
  readonly activeHandles: number;
  /** Active requests count */
  readonly activeRequests: number;
  /** Summary of active handles */
  readonly handlesSummary: readonly ActiveHandleSummary[];
  /** Summary of active requests */
  readonly requestsSummary: readonly ActiveRequestSummary[];
}

export type ActiveHandleSummary = {
  readonly type: string;
};

export type ActiveRequestSummary = {
  readonly type: string;
};

/**
 * Garbage collection profile interface.
 *
 * @public
 * @interface GCProfile
 */
export interface GCProfile {
  /** GC type */
  readonly kind: number;
  /** GC duration in nanoseconds */
  readonly duration: number;
  /** Timestamp when GC occurred */
  readonly timestamp: number;
}

/**
 * Performance mark interface.
 *
 * @public
 * @interface PerformanceMark
 */
export interface PerformanceMark {
  /** Mark name */
  readonly name: string;
  /** Mark timestamp */
  readonly startTime: number;
  /** Mark duration (0 for marks) */
  readonly duration: number;
}

/**
 * Performance measure interface.
 *
 * @public
 * @interface PerformanceMeasure
 */
export interface PerformanceMeasure {
  /** Measure name */
  readonly name: string;
  /** Measure start time */
  readonly startTime: number;
  /** Measure duration */
  readonly duration: number;
}

/**
 * Memory leak detection result interface.
 *
 * @public
 * @interface MemoryLeakDetection
 */
export interface MemoryLeakDetection {
  /** Whether a potential leak was detected */
  readonly leakDetected: boolean;
  /** Memory growth rate in bytes per second */
  readonly growthRate: number;
  /** Memory samples used for analysis */
  readonly samples: MemorySample[];
  /** Analysis timestamp */
  readonly timestamp: string;
  /** Recommendations for investigation */
  readonly recommendations: string[];
}

/**
 * Memory sample interface.
 *
 * @public
 * @interface MemorySample
 */
export interface MemorySample {
  /** Sample timestamp */
  readonly timestamp: number;
  /** Heap used in bytes */
  readonly heapUsed: number;
  /** Heap total in bytes */
  readonly heapTotal: number;
  /** RSS in bytes */
  readonly rss: number;
}

/**
 * Performance profiler class with comprehensive monitoring capabilities.
 *
 * @public
 * @class PerformanceProfiler
 */
export class PerformanceProfiler {
  private readonly memorySamples: MemorySample[] = [];
  private readonly gcProfiles: GCProfile[] = [];
  private performanceObserver?: PerformanceObserver;
  private gcObserver?: PerformanceObserver;
  private memoryMonitorInterval?: NodeJS.Timeout;
  private readonly maxSamples: number;
  private readonly sampleInterval: number;
  private lastEventLoopUtilization = performance.eventLoopUtilization();

  /**
   * Creates a new performance profiler.
   *
   * @param maxSamples - Maximum number of memory samples to keep (default: 100)
   * @param sampleInterval - Memory sampling interval in milliseconds (default: 5000)
   */
  constructor(maxSamples: number = 100, sampleInterval: number = 5000) {
    this.maxSamples = maxSamples;
    this.sampleInterval = sampleInterval;
  }

  /**
   * Starts performance profiling.
   *
   * @public
   */
  public startProfiling(): void {
    this.setupPerformanceObserver();
    this.setupGCObserver();
    this.startMemoryMonitoring();

    logger.info('Performance profiling started', '', {
      maxSamples: this.maxSamples,
      sampleInterval: this.sampleInterval,
    });
  }

  /**
   * Stops performance profiling.
   *
   * @public
   */
  public stopProfiling(): void {
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
      this.performanceObserver = undefined;
    }

    if (this.gcObserver) {
      this.gcObserver.disconnect();
      this.gcObserver = undefined;
    }

    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
      this.memoryMonitorInterval = undefined;
    }

    logger.info('Performance profiling stopped', '', {});
  }

  /**
   * Gets current performance profile.
   *
   * @public
   * @returns Current performance profile
   */
  public getCurrentProfile(): PerformanceProfile {
    const cpuUsage = process.cpuUsage();
    const memoryUsage = process.memoryUsage();
    const eventLoopLag = this.measureEventLoopLag();

    return {
      timestamp: new Date().toISOString(),
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers,
        heapUsagePercent: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
      },
      eventLoop: {
        lag: eventLoopLag,
        activeHandles: getActiveHandlesCount(),
        activeRequests: getActiveRequestsCount(),
        handlesSummary: getActiveHandlesSummary(),
        requestsSummary: getActiveRequestsSummary(),
      },
      gc: [...this.gcProfiles],
      marks: this.getPerformanceMarks(),
      measures: this.getPerformanceMeasures(),
    };
  }

  /**
   * Detects potential memory leaks based on memory growth patterns.
   *
   * @public
   * @returns Memory leak detection results
   */
  public detectMemoryLeaks(): MemoryLeakDetection {
    if (this.memorySamples.length < 10) {
      return {
        leakDetected: false,
        growthRate: 0,
        samples: [...this.memorySamples],
        timestamp: new Date().toISOString(),
        recommendations: ['Insufficient data - need at least 10 samples'],
      };
    }

    // Calculate memory growth rate using linear regression
    const growthRate = this.calculateMemoryGrowthRate();
    const leakThreshold = 1024 * 1024; // 1MB per sample interval
    const leakDetected = growthRate > leakThreshold;

    const recommendations: string[] = [];

    if (leakDetected) {
      recommendations.push('Potential memory leak detected');
      recommendations.push(
        'Review object creation and cleanup in request handlers'
      );
      recommendations.push(
        'Check for unclosed resources (files, connections, timers)'
      );
      recommendations.push(
        'Consider using heap snapshots for detailed analysis'
      );
    }

    if (growthRate > leakThreshold / 2) {
      recommendations.push('Monitor memory usage closely');
      recommendations.push('Consider implementing memory usage alerts');
    }

    return {
      leakDetected,
      growthRate,
      samples: [...this.memorySamples],
      timestamp: new Date().toISOString(),
      recommendations,
    };
  }

  /**
   * Creates a performance mark.
   *
   * @public
   * @param name - Mark name
   */
  public mark(name: string): void {
    performance.mark(name);
  }

  /**
   * Creates a performance measure between two marks.
   *
   * @public
   * @param name - Measure name
   * @param startMark - Start mark name
   * @param endMark - End mark name (optional, defaults to current time)
   */
  public measure(name: string, startMark: string, endMark?: string): void {
    performance.measure(name, startMark, endMark);
  }

  /**
   * Clears all performance marks and measures.
   *
   * @public
   */
  public clearPerformanceData(): void {
    performance.clearMarks();
    performance.clearMeasures();
    this.gcProfiles.length = 0;
    this.memorySamples.length = 0;
  }

  /**
   * Gets Node.js 24 specific performance metrics.
   *
   * @public
   * @returns Enhanced performance metrics
   */
  public getNodeJS24Metrics(): Record<string, unknown> {
    const eventLoopUtilization = performance.eventLoopUtilization();
    const resourceUsage = process.resourceUsage();

    return {
      nodeVersion: process.version,
      v8Version: process.versions.v8,
      eventLoopUtilization: {
        idle: eventLoopUtilization.idle,
        active: eventLoopUtilization.active,
        utilization: eventLoopUtilization.utilization,
      },
      resourceUsage: {
        userCPUTime: resourceUsage.userCPUTime,
        systemCPUTime: resourceUsage.systemCPUTime,
        maxRSS: resourceUsage.maxRSS,
        sharedMemorySize: resourceUsage.sharedMemorySize,
        unsharedDataSize: resourceUsage.unsharedDataSize,
        unsharedStackSize: resourceUsage.unsharedStackSize,
        minorPageFault: resourceUsage.minorPageFault,
        majorPageFault: resourceUsage.majorPageFault,
        swappedOut: resourceUsage.swappedOut,
        fsRead: resourceUsage.fsRead,
        fsWrite: resourceUsage.fsWrite,
        ipcSent: resourceUsage.ipcSent,
        ipcReceived: resourceUsage.ipcReceived,
        signalsCount: resourceUsage.signalsCount,
        voluntaryContextSwitches: resourceUsage.voluntaryContextSwitches,
        involuntaryContextSwitches: resourceUsage.involuntaryContextSwitches,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Sets up performance observer for marks and measures.
   *
   * @private
   */
  private setupPerformanceObserver(): void {
    this.performanceObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (const entry of entries) {
        logger.debug('Performance entry recorded', '', {
          name: entry.name,
          type: entry.entryType,
          startTime: entry.startTime,
          duration: entry.duration,
        });
      }
    });

    this.performanceObserver.observe({ entryTypes: ['mark', 'measure'] });
  }

  /**
   * Sets up garbage collection observer with Node.js 24 enhancements.
   *
   * @private
   */
  private setupGCObserver(): void {
    try {
      this.gcObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          const gcEntry = entry as PerformanceEntry & {
            readonly kind?: number;
            readonly detail?: {
              readonly kind?: number;
              readonly startTime?: number;
              readonly duration?: number;
            };
          };

          // Enhanced GC profiling with Node.js 24 features
          const gcProfile: GCProfile = {
            kind: gcEntry.kind ?? gcEntry.detail?.kind ?? 0,
            duration: entry.duration * 1_000_000, // Convert to nanoseconds
            timestamp: gcEntry.detail?.startTime ?? entry.startTime,
          };

          this.gcProfiles.push(gcProfile);

          // Keep only recent GC profiles
          if (this.gcProfiles.length > this.maxSamples) {
            this.gcProfiles.shift();
          }

          // Enhanced logging with GC type names
          const gcTypeNames: Record<number, string> = {
            1: 'Scavenge',
            2: 'Mark-Sweep-Compact',
            4: 'Incremental Marking',
            8: 'Weak Callbacks',
            15: 'All',
          };

          const gcTypeName = gcTypeNames[gcProfile.kind] || 'Unknown';
          const durationMs = gcProfile.duration / 1_000_000;

          if (durationMs > 100) {
            logger.warn('Long GC pause detected', '', {
              kind: gcProfile.kind,
              typeName: gcTypeName,
              duration: gcProfile.duration,
              durationMs,
              timestamp: gcProfile.timestamp,
              threshold: 100,
            });
          } else {
            logger.debug('GC event recorded', '', {
              kind: gcProfile.kind,
              typeName: gcTypeName,
              duration: gcProfile.duration,
              durationMs,
              timestamp: gcProfile.timestamp,
            });
          }
        }
      });

      this.gcObserver.observe({ entryTypes: ['gc'] });
    } catch (error) {
      logger.warn('GC observer not available', '', {
        error: error instanceof Error ? error.message : 'Unknown error',
        nodeVersion: process.version,
      });
    }
  }

  /**
   * Starts memory monitoring with periodic sampling and Node.js 24 enhancements.
   *
   * @private
   */
  private startMemoryMonitoring(): void {
    this.memoryMonitorInterval = setInterval(() => {
      const memoryUsage = process.memoryUsage();
      const sample: MemorySample = {
        timestamp: Date.now(),
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        rss: memoryUsage.rss,
      };

      this.memorySamples.push(sample);

      // Keep only recent samples
      if (this.memorySamples.length > this.maxSamples) {
        this.memorySamples.shift();
      }

      // Enhanced memory monitoring with Node.js 24 features
      const heapUsagePercent =
        (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
      const externalPercent = (memoryUsage.external / memoryUsage.rss) * 100;

      const memoryData = {
        heapUsagePercent: Math.round(heapUsagePercent * 100) / 100,
        externalPercent: Math.round(externalPercent * 100) / 100,
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers,
        rss: memoryUsage.rss,
        timestamp: new Date().toISOString(),
      };

      // Enhanced thresholds and logging
      if (heapUsagePercent > 90) {
        logger.error('Critical memory usage detected', '', {
          ...memoryData,
          severity: 'critical',
          threshold: 90,
        });
      } else if (heapUsagePercent > 80) {
        logger.warn('High memory usage detected', '', {
          ...memoryData,
          severity: 'high',
          threshold: 80,
        });
      } else if (heapUsagePercent > 60) {
        logger.info('Elevated memory usage', '', {
          ...memoryData,
          severity: 'elevated',
          threshold: 60,
        });
      }

      // Monitor external memory usage
      if (externalPercent > 50) {
        logger.warn('High external memory usage detected', '', {
          ...memoryData,
          externalThreshold: 50,
        });
      }
    }, this.sampleInterval);
  }

  /**
   * Measures current event loop lag.
   *
   * @private
   * @returns Event loop lag in milliseconds
   */
  private measureEventLoopLag(): number {
    const delta = performance.eventLoopUtilization(
      this.lastEventLoopUtilization
    );
    this.lastEventLoopUtilization = performance.eventLoopUtilization();

    const activeMs = delta.active / 1000;
    if (!Number.isFinite(activeMs) || activeMs < 0) {
      return 0;
    }

    return activeMs;
  }

  /**
   * Calculates memory growth rate using linear regression.
   *
   * @private
   * @returns Memory growth rate in bytes per sample interval
   */
  private calculateMemoryGrowthRate(): number {
    if (this.memorySamples.length < 2) {
      return 0;
    }

    let index = 0;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (const sample of this.memorySamples) {
      const x = index;
      const y = sample.heapUsed;

      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
      index += 1;
    }

    const sampleCount = index;
    const denominator = sampleCount * sumXX - sumX * sumX;
    if (denominator === 0) {
      return 0;
    }

    const slope = (sampleCount * sumXY - sumX * sumY) / denominator;
    return slope;
  }

  /**
   * Gets current performance marks.
   *
   * @private
   * @returns Array of performance marks
   */
  private getPerformanceMarks(): PerformanceMark[] {
    return performance.getEntriesByType('mark').map((entry) => ({
      name: entry.name,
      startTime: entry.startTime,
      duration: entry.duration,
    }));
  }

  /**
   * Gets current performance measures.
   *
   * @private
   * @returns Array of performance measures
   */
  private getPerformanceMeasures(): PerformanceMeasure[] {
    return performance.getEntriesByType('measure').map((entry) => ({
      name: entry.name,
      startTime: entry.startTime,
      duration: entry.duration,
    }));
  }
}

// Global profiler instance
export const performanceProfiler = new PerformanceProfiler();

/**
 * Utility function to profile an async operation.
 *
 * @public
 * @param name - Operation name
 * @param operation - Async operation to profile
 * @returns Promise resolving to operation result
 *
 * @example
 * ```typescript
 * const result = await profileOperation('database_query', async () => {
 *   return await database.query('SELECT * FROM users');
 * });
 * ```
 */
export async function profileOperation<T>(
  name: string,
  operation: () => Promise<T>
): Promise<T> {
  const startMark = `${name}_start`;
  const endMark = `${name}_end`;
  const measureName = `${name}_duration`;

  performanceProfiler.mark(startMark);

  try {
    const result = await operation();
    performanceProfiler.mark(endMark);
    performanceProfiler.measure(measureName, startMark, endMark);
    return result;
  } catch (error) {
    performanceProfiler.mark(endMark);
    performanceProfiler.measure(measureName, startMark, endMark);
    throw error;
  }
}

/**
 * Utility function to start memory leak detection monitoring.
 *
 * @public
 * @param intervalMs - Check interval in milliseconds (default: 60000)
 * @returns Function to stop monitoring
 *
 * @example
 * ```typescript
 * const stopMonitoring = startMemoryLeakDetection(30000);
 * // ... later
 * stopMonitoring();
 * ```
 */
export function startMemoryLeakDetection(
  intervalMs: number = 60000
): () => void {
  const interval = setInterval(() => {
    const detection = performanceProfiler.detectMemoryLeaks();

    if (detection.leakDetected) {
      logger.error('Memory leak detected', '', {
        growthRate: detection.growthRate,
        recommendations: detection.recommendations,
      });
    } else if (detection.growthRate > 512 * 1024) {
      // 512KB threshold
      logger.warn('Elevated memory growth detected', '', {
        growthRate: detection.growthRate,
        recommendations: detection.recommendations,
      });
    }
  }, intervalMs);

  return () => clearInterval(interval);
}
const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const getActiveHandles = (): readonly unknown[] => {
  const getHandles = (
    process as unknown as { _getActiveHandles?: () => unknown }
  )._getActiveHandles;

  if (typeof getHandles !== 'function') {
    return [];
  }

  const result = getHandles.call(process);
  if (!Array.isArray(result)) {
    return [];
  }

  return result as readonly unknown[];
};

const getActiveRequests = (): readonly unknown[] => {
  const getRequests = (
    process as unknown as { _getActiveRequests?: () => unknown }
  )._getActiveRequests;

  if (typeof getRequests !== 'function') {
    return [];
  }

  const result = getRequests.call(process);
  if (!Array.isArray(result)) {
    return [];
  }

  return result as readonly unknown[];
};

const getActiveHandlesCount = (): number => {
  return getActiveHandles().length;
};

const getActiveRequestsCount = (): number => {
  return getActiveRequests().length;
};

const getActiveHandlesSummary = (): readonly ActiveHandleSummary[] => {
  return getActiveHandles().map((handle) => ({
    type:
      isObject(handle) &&
      typeof (handle as { constructor?: { name?: string } }).constructor
        ?.name === 'string'
        ? (handle as { constructor: { name: string } }).constructor.name
        : typeof handle,
  }));
};

const getActiveRequestsSummary = (): readonly ActiveRequestSummary[] => {
  return getActiveRequests().map((request) => ({
    type:
      isObject(request) &&
      typeof (request as { constructor?: { name?: string } }).constructor
        ?.name === 'string'
        ? (request as { constructor: { name: string } }).constructor.name
        : typeof request,
  }));
};
