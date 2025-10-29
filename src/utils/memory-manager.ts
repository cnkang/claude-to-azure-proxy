/**
 * @fileoverview Memory management utility for Node.js 24 with enhanced GC monitoring
 * and memory leak detection using built-in profiling tools.
 *
 * This module provides comprehensive memory management capabilities including:
 * - Real-time garbage collection monitoring
 * - Memory leak detection using Node.js 24 features
 * - Memory metrics collection and reporting
 * - Automatic memory pressure handling
 *
 * @author Claude-to-Azure Proxy Team
 * @version 1.0.0
 * @since 1.0.0
 */

import { PerformanceObserver, performance } from 'node:perf_hooks';
import { getHeapStatistics } from 'node:v8';
import { logger } from '../middleware/logging.js';

/**
 * Memory metrics interface for comprehensive memory tracking.
 *
 * @public
 * @interface MemoryMetrics
 */
export interface MemoryMetrics {
  /** Timestamp when metrics were collected */
  readonly timestamp: string;
  /** Heap memory usage information */
  readonly heap: {
    readonly used: number;
    readonly total: number;
    readonly limit: number;
    readonly percentage: number;
  };
  /** System memory information */
  readonly system: {
    readonly rss: number;
    readonly external: number;
    readonly arrayBuffers: number;
  };
  /** Garbage collection statistics */
  readonly gc: {
    readonly totalCollections: number;
    readonly totalDuration: number;
    readonly averageDuration: number;
    readonly recentCollections: readonly GCEvent[];
  };
  /** Memory pressure indicators */
  readonly pressure: {
    readonly level: 'low' | 'medium' | 'high' | 'critical';
    readonly score: number;
    readonly recommendations: readonly string[];
  };
}

/**
 * Garbage collection event interface.
 *
 * @public
 * @interface GCEvent
 */
export interface GCEvent {
  /** GC event type */
  readonly type: 'minor' | 'major' | 'incremental' | 'unknown';
  /** GC duration in milliseconds */
  readonly duration: number;
  /** Timestamp when GC occurred */
  readonly timestamp: number;
  /** Memory before GC */
  readonly memoryBefore: number;
  /** Memory after GC */
  readonly memoryAfter: number;
  /** Memory freed by GC */
  readonly memoryFreed: number;
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
  /** Confidence level of leak detection (0-1) */
  readonly confidence: number;
  /** Memory growth rate in bytes per second */
  readonly growthRate: number;
  /** Memory samples used for analysis */
  readonly samples: readonly MemorySample[];
  /** Analysis timestamp */
  readonly timestamp: string;
  /** Detailed analysis results */
  readonly analysis: {
    readonly trend: 'stable' | 'growing' | 'declining' | 'volatile';
    readonly growthAcceleration: number;
    readonly memoryEfficiency: number;
  };
  /** Actionable recommendations */
  readonly recommendations: readonly string[];
}

/**
 * Memory sample interface for tracking memory usage over time.
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
  /** External memory in bytes */
  readonly external: number;
}

/**
 * Memory manager configuration interface.
 *
 * @public
 * @interface MemoryManagerConfig
 */
export interface MemoryManagerConfig {
  /** Maximum number of memory samples to keep */
  readonly maxSamples: number;
  /** Memory sampling interval in milliseconds */
  readonly sampleInterval: number;
  /** Maximum number of GC events to track */
  readonly maxGCEvents: number;
  /** Memory pressure thresholds */
  readonly pressureThresholds: {
    readonly medium: number; // Percentage
    readonly high: number; // Percentage
    readonly critical: number; // Percentage
  };
  /** Enable automatic garbage collection suggestions */
  readonly enableGCSuggestions: boolean;
  /** Enable memory leak detection */
  readonly enableLeakDetection: boolean;
}

/**
 * Default memory manager configuration.
 */
const DEFAULT_CONFIG: MemoryManagerConfig = {
  maxSamples: 100,
  sampleInterval: 5000, // 5 seconds
  maxGCEvents: 50,
  pressureThresholds: {
    medium: 70,
    high: 85,
    critical: 95,
  },
  enableGCSuggestions: true,
  enableLeakDetection: true,
};

/**
 * Memory manager class with Node.js 24 GC monitoring and leak detection.
 *
 * @public
 * @class MemoryManager
 */
export class MemoryManager {
  private readonly config: MemoryManagerConfig;
  private readonly memorySamples: MemorySample[] = [];
  private readonly gcEvents: GCEvent[] = [];
  private gcObserver?: PerformanceObserver;
  private memoryMonitorInterval?: NodeJS.Timeout;
  private leakDetectionInterval?: NodeJS.Timeout;
  private isMonitoring = false;
  private totalGCCollections = 0;
  private totalGCDuration = 0;

  /**
   * Creates a new memory manager instance.
   *
   * @param config - Memory manager configuration
   */
  constructor(config: Partial<MemoryManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Starts memory monitoring with GC observation and leak detection.
   *
   * @public
   */
  public startMonitoring(): void {
    if (this.isMonitoring) {
      logger.warn('Memory monitoring already started', '', {});
      return;
    }

    this.setupGCObserver();
    this.startMemorySampling();

    if (this.config.enableLeakDetection) {
      this.startLeakDetection();
    }

    this.isMonitoring = true;

    logger.info('Memory monitoring started', '', {
      sampleInterval: this.config.sampleInterval,
      maxSamples: this.config.maxSamples,
      leakDetectionEnabled: this.config.enableLeakDetection,
    });
  }

  /**
   * Stops memory monitoring and cleans up resources.
   *
   * @public
   */
  public stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    if (this.gcObserver) {
      this.gcObserver.disconnect();
      this.gcObserver = undefined;
    }

    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
      this.memoryMonitorInterval = undefined;
    }

    if (this.leakDetectionInterval) {
      clearInterval(this.leakDetectionInterval);
      this.leakDetectionInterval = undefined;
    }

    this.isMonitoring = false;

    logger.info('Memory monitoring stopped', '', {});
  }

  /**
   * Gets current comprehensive memory metrics.
   *
   * @public
   * @returns Current memory metrics
   */
  public getMemoryMetrics(): MemoryMetrics {
    const memoryUsage = process.memoryUsage();
    const heapPercentage = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

    // Calculate pressure level and score
    const pressure = this.calculateMemoryPressure(heapPercentage);

    // Calculate GC statistics
    const recentGCEvents = this.gcEvents.slice(-10); // Last 10 GC events
    const averageGCDuration =
      this.totalGCCollections > 0
        ? this.totalGCDuration / this.totalGCCollections
        : 0;

    return {
      timestamp: new Date().toISOString(),
      heap: {
        used: memoryUsage.heapUsed,
        total: memoryUsage.heapTotal,
        limit: this.getHeapSizeLimit(),
        percentage: heapPercentage,
      },
      system: {
        rss: memoryUsage.rss,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers,
      },
      gc: {
        totalCollections: this.totalGCCollections,
        totalDuration: this.totalGCDuration,
        averageDuration: averageGCDuration,
        recentCollections: recentGCEvents,
      },
      pressure,
    };
  }

  /**
   * Performs comprehensive memory leak detection analysis.
   *
   * @public
   * @returns Memory leak detection results
   */
  public detectMemoryLeaks(): MemoryLeakDetection {
    if (this.memorySamples.length < 10) {
      return {
        leakDetected: false,
        confidence: 0,
        growthRate: 0,
        samples: [...this.memorySamples],
        timestamp: new Date().toISOString(),
        analysis: {
          trend: 'stable',
          growthAcceleration: 0,
          memoryEfficiency: 1,
        },
        recommendations: [
          'Insufficient data - need at least 10 samples for analysis',
        ],
      };
    }

    // Perform statistical analysis on memory samples
    const analysis = this.analyzeMemoryTrend();
    const growthRate = this.calculateMemoryGrowthRate();
    const confidence = this.calculateLeakConfidence(analysis, growthRate);

    // Determine if leak is detected based on multiple factors
    const leakThreshold = 1024 * 1024; // 1MB per sample interval
    const leakDetected = confidence > 0.7 && growthRate > leakThreshold;

    const recommendations = this.generateRecommendations(
      analysis,
      growthRate,
      leakDetected
    );

    return {
      leakDetected,
      confidence,
      growthRate,
      samples: [...this.memorySamples],
      timestamp: new Date().toISOString(),
      analysis,
      recommendations,
    };
  }

  /**
   * Forces garbage collection if available and logs results.
   *
   * @public
   * @returns Whether GC was triggered
   */
  public forceGarbageCollection(): boolean {
    if (typeof global.gc !== 'function') {
      logger.warn('Garbage collection not available', '', {
        suggestion: 'Run with --expose-gc flag to enable manual GC',
      });
      return false;
    }

    const beforeMemory = process.memoryUsage();
    const startTime = performance.now();

    global.gc();

    const afterMemory = process.memoryUsage();
    const duration = performance.now() - startTime;
    const memoryFreed = beforeMemory.heapUsed - afterMemory.heapUsed;

    logger.info('Manual garbage collection completed', '', {
      duration: Math.round(duration),
      memoryFreed,
      heapBefore: beforeMemory.heapUsed,
      heapAfter: afterMemory.heapUsed,
    });

    return true;
  }

  /**
   * Clears all collected memory data and resets counters.
   *
   * @public
   */
  public clearMemoryData(): void {
    this.memorySamples.length = 0;
    this.gcEvents.length = 0;
    this.totalGCCollections = 0;
    this.totalGCDuration = 0;

    logger.info('Memory data cleared', '', {});
  }

  /**
   * Sets up garbage collection observer using Node.js 24 features.
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
            readonly flags?: number;
          };

          // Map GC kind to readable type
          const gcType = this.mapGCKindToType(gcEntry.kind ?? 0);
          const duration = gcEntry.duration;

          // Estimate memory before/after (approximation)
          const currentMemory = process.memoryUsage().heapUsed;
          const estimatedFreed = Math.max(0, duration * 1000); // Rough estimation

          const gcEvent: GCEvent = {
            type: gcType,
            duration,
            timestamp: gcEntry.startTime + performance.timeOrigin,
            memoryBefore: currentMemory + estimatedFreed,
            memoryAfter: currentMemory,
            memoryFreed: estimatedFreed,
          };

          this.gcEvents.push(gcEvent);
          this.totalGCCollections += 1;
          this.totalGCDuration += duration;

          // Keep only recent GC events
          if (this.gcEvents.length > this.config.maxGCEvents) {
            this.gcEvents.shift();
          }

          // Log significant GC events
          if (duration > 100) {
            // Log GC events longer than 100ms
            logger.warn('Long garbage collection detected', '', {
              type: gcType,
              duration: Math.round(duration),
              memoryFreed: estimatedFreed,
            });
          }

          // Provide GC suggestions if enabled
          if (this.config.enableGCSuggestions && duration > 50) {
            this.suggestGCOptimizations(gcEvent);
          }
        }
      });

      this.gcObserver.observe({ entryTypes: ['gc'] });

      logger.debug('GC observer initialized', '', {});
    } catch (error) {
      logger.warn('Failed to initialize GC observer', '', {
        error: error instanceof Error ? error.message : 'Unknown error',
        suggestion:
          'GC monitoring may not be available in this Node.js version',
      });
    }
  }

  /**
   * Starts periodic memory sampling.
   *
   * @private
   */
  private startMemorySampling(): void {
    this.memoryMonitorInterval = setInterval(() => {
      const memoryUsage = process.memoryUsage();

      const sample: MemorySample = {
        timestamp: Date.now(),
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        rss: memoryUsage.rss,
        external: memoryUsage.external,
      };

      this.memorySamples.push(sample);

      // Keep only recent samples
      if (this.memorySamples.length > this.config.maxSamples) {
        this.memorySamples.shift();
      }

      // Check for memory pressure
      const heapPercentage =
        (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
      if (heapPercentage > this.config.pressureThresholds.critical) {
        logger.error('Critical memory pressure detected', '', {
          heapUsage: Math.round(heapPercentage),
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          recommendation:
            'Consider immediate garbage collection or request throttling',
        });
      } else if (heapPercentage > this.config.pressureThresholds.high) {
        logger.warn('High memory pressure detected', '', {
          heapUsage: Math.round(heapPercentage),
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
        });
      }
    }, this.config.sampleInterval);
  }

  /**
   * Starts periodic memory leak detection.
   *
   * @private
   */
  private startLeakDetection(): void {
    // Run leak detection every 5 minutes
    const leakDetectionInterval = Math.max(
      this.config.sampleInterval * 10,
      300000
    );

    this.leakDetectionInterval = setInterval(() => {
      const detection = this.detectMemoryLeaks();

      if (detection.leakDetected) {
        logger.error('Memory leak detected', '', {
          confidence: Math.round(detection.confidence * 100),
          growthRate: detection.growthRate,
          trend: detection.analysis.trend,
          recommendations: detection.recommendations,
        });
      } else if (detection.confidence > 0.5) {
        logger.warn('Potential memory issue detected', '', {
          confidence: Math.round(detection.confidence * 100),
          growthRate: detection.growthRate,
          trend: detection.analysis.trend,
        });
      }
    }, leakDetectionInterval);
  } /**

   * Maps GC kind number to readable type.
   *
   * @private
   * @param kind - GC kind number
   * @returns Readable GC type
   */
  private mapGCKindToType(
    kind: number
  ): 'minor' | 'major' | 'incremental' | 'unknown' {
    // Based on Node.js GC kind constants
    switch (kind) {
      case 1:
        return 'minor'; // Scavenge
      case 2:
        return 'major'; // Mark-Sweep-Compact
      case 4:
        return 'incremental'; // Incremental marking
      case 8:
        return 'major'; // Weak processing
      case 15:
        return 'major'; // All
      default:
        return 'unknown';
    }
  }

  /**
   * Calculates memory pressure level and recommendations.
   *
   * @private
   * @param heapPercentage - Current heap usage percentage
   * @returns Memory pressure information
   */
  private calculateMemoryPressure(
    heapPercentage: number
  ): MemoryMetrics['pressure'] {
    let level: 'low' | 'medium' | 'high' | 'critical';
    let score: number;
    const recommendations: string[] = [];

    if (heapPercentage >= this.config.pressureThresholds.critical) {
      level = 'critical';
      score = 1.0;
      recommendations.push(
        'Immediate action required - consider request throttling'
      );
      recommendations.push('Force garbage collection if possible');
      recommendations.push('Review memory-intensive operations');
    } else if (heapPercentage >= this.config.pressureThresholds.high) {
      level = 'high';
      score = 0.8;
      recommendations.push('Monitor memory usage closely');
      recommendations.push('Consider optimizing memory-intensive operations');
      recommendations.push('Review object lifecycle management');
    } else if (heapPercentage >= this.config.pressureThresholds.medium) {
      level = 'medium';
      score = 0.5;
      recommendations.push('Memory usage is elevated but manageable');
      recommendations.push('Consider proactive garbage collection');
    } else {
      level = 'low';
      score = heapPercentage / 100;
      recommendations.push('Memory usage is within normal range');
    }

    return { level, score, recommendations };
  }

  /**
   * Analyzes memory usage trend over time.
   *
   * @private
   * @returns Memory trend analysis
   */
  private analyzeMemoryTrend(): MemoryLeakDetection['analysis'] {
    if (this.memorySamples.length < 5) {
      return {
        trend: 'stable',
        growthAcceleration: 0,
        memoryEfficiency: 1,
      };
    }

    const samples = this.memorySamples.slice(-20); // Analyze last 20 samples
    const heapUsages = samples.map((s) => s.heapUsed);

    // Calculate linear regression for trend
    const n = heapUsages.length;
    const sumX = (n * (n - 1)) / 2; // Sum of indices 0, 1, 2, ..., n-1
    const sumY = heapUsages.reduce((sum, usage) => sum + usage, 0);
    const sumXY = heapUsages.reduce(
      (sum, usage, index) => sum + index * usage,
      0
    );
    const sumXX = (n * (n - 1) * (2 * n - 1)) / 6; // Sum of squares of indices

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R-squared for trend strength
    const yMean = sumY / n;
    const ssTotal = heapUsages.reduce(
      (sum, usage) => sum + Math.pow(usage - yMean, 2),
      0
    );
    const ssResidual = heapUsages.reduce((sum, usage, index) => {
      const predicted = slope * index + intercept;
      return sum + Math.pow(usage - predicted, 2);
    }, 0);
    const rSquared = 1 - ssResidual / ssTotal;

    // Determine trend
    let trend: 'stable' | 'growing' | 'declining' | 'volatile';
    if (rSquared < 0.5) {
      trend = 'volatile';
    } else if (Math.abs(slope) < 1000) {
      // Less than 1KB change per sample
      trend = 'stable';
    } else if (slope > 0) {
      trend = 'growing';
    } else {
      trend = 'declining';
    }

    // Calculate growth acceleration (second derivative approximation)
    let growthAcceleration = 0;
    if (samples.length >= 3) {
      const recentSlope = this.calculateRecentSlope(samples.slice(-5));
      const olderSlope = this.calculateRecentSlope(samples.slice(-10, -5));
      growthAcceleration = recentSlope - olderSlope;
    }

    // Calculate memory efficiency (how well GC is working)
    const gcEffectiveness = this.calculateGCEffectiveness();
    const memoryEfficiency = Math.max(0, Math.min(1, gcEffectiveness));

    return {
      trend,
      growthAcceleration,
      memoryEfficiency,
    };
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

    const samples = this.memorySamples.slice(-10); // Use last 10 samples
    return this.calculateRecentSlope(samples);
  }

  /**
   * Calculates slope for recent memory samples.
   *
   * @private
   * @param samples - Memory samples to analyze
   * @returns Slope (growth rate)
   */
  private calculateRecentSlope(samples: readonly MemorySample[]): number {
    if (samples.length < 2) {
      return 0;
    }

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    samples.forEach((sample, index) => {
      const x = index;
      const y = sample.heapUsed;

      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    });

    const n = samples.length;
    const denominator = n * sumXX - sumX * sumX;

    if (denominator === 0) {
      return 0;
    }

    return (n * sumXY - sumX * sumY) / denominator;
  }

  /**
   * Calculates leak detection confidence based on analysis.
   *
   * @private
   * @param analysis - Memory trend analysis
   * @param growthRate - Memory growth rate
   * @returns Confidence level (0-1)
   */
  private calculateLeakConfidence(
    analysis: MemoryLeakDetection['analysis'],
    growthRate: number
  ): number {
    let confidence = 0;

    // Factor 1: Consistent growth trend
    if (analysis.trend === 'growing') {
      confidence += 0.4;
    } else if (analysis.trend === 'volatile') {
      confidence += 0.1;
    }

    // Factor 2: Growth rate magnitude
    const growthRateKB = growthRate / 1024;
    if (growthRateKB > 1024) {
      // > 1MB per interval
      confidence += 0.4;
    } else if (growthRateKB > 256) {
      // > 256KB per interval
      confidence += 0.25;
    } else if (growthRateKB > 64) {
      // > 64KB per interval
      confidence += 0.1;
    } else if (growthRateKB > 10) {
      // > 10KB per interval
      confidence += 0.1;
    }

    // Factor 3: Growth acceleration
    if (analysis.growthAcceleration > 0) {
      confidence += 0.2;
    }

    // Factor 4: GC effectiveness
    if (analysis.memoryEfficiency < 0.5) {
      confidence += 0.1;
    }

    return Math.min(1, confidence);
  }

  /**
   * Calculates garbage collection effectiveness.
   *
   * @private
   * @returns GC effectiveness score (0-1)
   */
  private calculateGCEffectiveness(): number {
    if (this.gcEvents.length < 3) {
      return 1; // Assume good if not enough data
    }

    const recentGCEvents = this.gcEvents.slice(-10);
    const totalMemoryFreed = recentGCEvents.reduce(
      (sum, event) => sum + event.memoryFreed,
      0
    );
    const totalGCTime = recentGCEvents.reduce(
      (sum, event) => sum + event.duration,
      0
    );

    if (totalGCTime === 0) {
      return 1;
    }

    // Calculate memory freed per millisecond of GC time
    const efficiency = totalMemoryFreed / totalGCTime;

    // Normalize to 0-1 scale (arbitrary scaling based on typical values)
    return Math.min(1, efficiency / 10000);
  }

  /**
   * Generates actionable recommendations based on analysis.
   *
   * @private
   * @param analysis - Memory trend analysis
   * @param growthRate - Memory growth rate
   * @param leakDetected - Whether leak was detected
   * @returns Array of recommendations
   */
  private generateRecommendations(
    analysis: MemoryLeakDetection['analysis'],
    growthRate: number,
    leakDetected: boolean
  ): readonly string[] {
    const recommendations: string[] = [];

    if (leakDetected) {
      recommendations.push(
        'Memory leak detected - immediate investigation required'
      );
      recommendations.push('Review recent code changes for unclosed resources');
      recommendations.push(
        'Check for event listener leaks and unclosed connections'
      );
      recommendations.push(
        'Consider taking heap snapshots for detailed analysis'
      );
    }

    if (analysis.trend === 'growing') {
      recommendations.push('Memory usage is consistently growing');
      recommendations.push('Review object lifecycle and cleanup patterns');
      recommendations.push(
        'Consider implementing object pooling for frequently created objects'
      );
    }

    if (analysis.trend === 'volatile') {
      recommendations.push('Memory usage is highly variable');
      recommendations.push(
        'Review request handling patterns for memory spikes'
      );
      recommendations.push(
        'Consider implementing request-based memory monitoring'
      );
    }

    if (analysis.memoryEfficiency < 0.5) {
      recommendations.push('Garbage collection appears ineffective');
      recommendations.push('Review large object allocations and retention');
      recommendations.push(
        'Consider manual garbage collection during low-traffic periods'
      );
    }

    if (analysis.growthAcceleration > 0) {
      recommendations.push('Memory growth is accelerating');
      recommendations.push('Prioritize memory leak investigation');
    }

    const growthRateKB = growthRate / 1024;
    if (growthRateKB > 100) {
      recommendations.push(
        `High memory growth rate: ${Math.round(growthRateKB)}KB per sample`
      );
      recommendations.push('Monitor memory usage more frequently');
    }

    if (recommendations.length === 0) {
      recommendations.push('Memory usage appears normal');
      recommendations.push('Continue regular monitoring');
    }

    return recommendations;
  }

  /**
   * Provides GC optimization suggestions based on GC events.
   *
   * @private
   * @param gcEvent - Recent GC event
   */
  private suggestGCOptimizations(gcEvent: GCEvent): void {
    const suggestions: string[] = [];

    if (gcEvent.duration > 100) {
      suggestions.push(
        'Consider reducing heap size or optimizing object allocation patterns'
      );
    }

    if (gcEvent.type === 'major' && gcEvent.duration > 50) {
      suggestions.push(
        'Major GC taking significant time - review large object retention'
      );
    }

    if (gcEvent.memoryFreed < 1024 * 1024 && gcEvent.duration > 20) {
      suggestions.push(
        'GC freed little memory but took significant time - check for memory fragmentation'
      );
    }

    if (suggestions.length > 0) {
      logger.debug('GC optimization suggestions', '', {
        gcType: gcEvent.type,
        duration: Math.round(gcEvent.duration),
        suggestions,
      });
    }
  }

  /**
   * Gets the current heap size limit.
   *
   * @private
   * @returns Heap size limit in bytes
   */
  private getHeapSizeLimit(): number {
    // Try to get heap size limit from V8 if available
    try {
      const heapStats = getHeapStatistics();
      return heapStats.heap_size_limit;
    } catch {
      // Fallback to default Node.js heap limit (approximate)
      return 1.4 * 1024 * 1024 * 1024; // ~1.4GB default for 64-bit systems
    }
  }
}

/**
 * Global memory manager instance.
 */
export const memoryManager = new MemoryManager();

/**
 * Utility function to start memory monitoring with default configuration.
 *
 * @public
 * @param config - Optional configuration overrides
 * @returns Memory manager instance
 */
export function startMemoryMonitoring(
  config?: Partial<MemoryManagerConfig>
): MemoryManager {
  const manager = config ? new MemoryManager(config) : memoryManager;
  manager.startMonitoring();
  return manager;
}

/**
 * Utility function to get current memory metrics.
 *
 * @public
 * @returns Current memory metrics
 */
export function getCurrentMemoryMetrics(): MemoryMetrics {
  return memoryManager.getMemoryMetrics();
}

/**
 * Utility function to detect memory leaks.
 *
 * @public
 * @returns Memory leak detection results
 */
export function detectMemoryLeaks(): MemoryLeakDetection {
  return memoryManager.detectMemoryLeaks();
}

/**
 * Utility function to force garbage collection.
 *
 * @public
 * @returns Whether GC was successfully triggered
 */
export function forceGarbageCollection(): boolean {
  return memoryManager.forceGarbageCollection();
}
