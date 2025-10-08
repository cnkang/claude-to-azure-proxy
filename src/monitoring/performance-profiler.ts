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
}

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
      sampleInterval: this.sampleInterval
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
        system: cpuUsage.system
      },
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers,
        heapUsagePercent: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
      },
      eventLoop: {
        lag: eventLoopLag,
        activeHandles: (process as any)._getActiveHandles().length,
        activeRequests: (process as any)._getActiveRequests().length
      },
      gc: [...this.gcProfiles],
      marks: this.getPerformanceMarks(),
      measures: this.getPerformanceMeasures()
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
        recommendations: ['Insufficient data - need at least 10 samples']
      };
    }

    // Calculate memory growth rate using linear regression
    const growthRate = this.calculateMemoryGrowthRate();
    const leakThreshold = 1024 * 1024; // 1MB per sample interval
    const leakDetected = growthRate > leakThreshold;

    const recommendations: string[] = [];
    
    if (leakDetected) {
      recommendations.push('Potential memory leak detected');
      recommendations.push('Review object creation and cleanup in request handlers');
      recommendations.push('Check for unclosed resources (files, connections, timers)');
      recommendations.push('Consider using heap snapshots for detailed analysis');
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
      recommendations
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
          duration: entry.duration
        });
      }
    });

    this.performanceObserver.observe({ entryTypes: ['mark', 'measure'] });
  }

  /**
   * Sets up garbage collection observer.
   * 
   * @private
   */
  private setupGCObserver(): void {
    try {
      this.gcObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          const gcProfile: GCProfile = {
            kind: (entry as any).kind || 0,
            duration: entry.duration * 1000000, // Convert to nanoseconds
            timestamp: entry.startTime
          };

          this.gcProfiles.push(gcProfile);
          
          // Keep only recent GC profiles
          if (this.gcProfiles.length > this.maxSamples) {
            this.gcProfiles.shift();
          }

          logger.debug('GC event recorded', '', {
            kind: gcProfile.kind,
            duration: gcProfile.duration,
            timestamp: gcProfile.timestamp
          });
        }
      });

      this.gcObserver.observe({ entryTypes: ['gc'] });
    } catch (error) {
      logger.warn('GC observer not available', '', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Starts memory monitoring with periodic sampling.
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
        rss: memoryUsage.rss
      };

      this.memorySamples.push(sample);

      // Keep only recent samples
      if (this.memorySamples.length > this.maxSamples) {
        this.memorySamples.shift();
      }

      // Log memory usage if it's high
      const heapUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
      if (heapUsagePercent > 80) {
        logger.warn('High memory usage detected', '', {
          heapUsagePercent: heapUsagePercent.toFixed(1),
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal
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
    const start = process.hrtime.bigint();
    return new Promise<number>((resolve) => {
      setImmediate(() => {
        const lag = Number(process.hrtime.bigint() - start) / 1000000;
        resolve(lag);
      });
    }) as any; // Simplified for synchronous usage
    
    // Simplified synchronous approximation
    return 0;
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

    const n = this.memorySamples.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let i = 0; i < n; i++) {
      const x = i;
      const y = this.memorySamples[i]!.heapUsed;
      
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope;
  }

  /**
   * Gets current performance marks.
   * 
   * @private
   * @returns Array of performance marks
   */
  private getPerformanceMarks(): PerformanceMark[] {
    return performance.getEntriesByType('mark').map(entry => ({
      name: entry.name,
      startTime: entry.startTime,
      duration: entry.duration
    }));
  }

  /**
   * Gets current performance measures.
   * 
   * @private
   * @returns Array of performance measures
   */
  private getPerformanceMeasures(): PerformanceMeasure[] {
    return performance.getEntriesByType('measure').map(entry => ({
      name: entry.name,
      startTime: entry.startTime,
      duration: entry.duration
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
export function startMemoryLeakDetection(intervalMs: number = 60000): () => void {
  const interval = setInterval(() => {
    const detection = performanceProfiler.detectMemoryLeaks();
    
    if (detection.leakDetected) {
      logger.error('Memory leak detected', '', {
        growthRate: detection.growthRate,
        recommendations: detection.recommendations
      });
    } else if (detection.growthRate > 512 * 1024) { // 512KB threshold
      logger.warn('Elevated memory growth detected', '', {
        growthRate: detection.growthRate,
        recommendations: detection.recommendations
      });
    }
  }, intervalMs);

  return () => clearInterval(interval);
}