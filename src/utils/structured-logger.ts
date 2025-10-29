import { logger } from '../middleware/logging.js';
import type { SecurityLogEntry } from '../middleware/logging.js';
import { performance, PerformanceObserver } from 'node:perf_hooks';

export interface SecurityEventContext {
  readonly correlationId: string;
  readonly operation?: string;
  readonly source?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface StructuredSecurityEvent {
  readonly eventType: string;
  readonly severity: SecurityLogEntry['severity'];
  readonly clientInfo?: Readonly<Record<string, unknown>>;
  readonly outcome?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface PerformanceLogEntry {
  readonly operation: string;
  readonly duration: number;
  readonly timestamp: string;
  readonly correlationId: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface GCLogEntry {
  readonly type: string;
  readonly duration: number;
  readonly timestamp: string;
  readonly heapBefore: number;
  readonly heapAfter: number;
  readonly freedMemory: number;
}

const buildSecurityDetails = (
  context: Readonly<SecurityEventContext>,
  event: Readonly<StructuredSecurityEvent>
): Record<string, unknown> => {
  const details: Record<string, unknown> = {};

  if (context.metadata !== undefined) {
    details.context = context.metadata;
  }

  if (event.clientInfo !== undefined) {
    details.clientInfo = event.clientInfo;
  }

  if (event.outcome !== undefined) {
    details.outcome = event.outcome;
  }

  if (event.details !== undefined) {
    details.details = event.details;
  }

  return details;
};

export class StructuredLogger {
  private static gcObserver?: PerformanceObserver;
  private static performanceObserver?: PerformanceObserver;
  private static isMonitoringStarted = false;

  /**
   * Start Node.js 24 enhanced monitoring
   */
  public static startEnhancedMonitoring(): void {
    if (StructuredLogger.isMonitoringStarted) {
      return;
    }

    StructuredLogger.setupGCMonitoring();
    StructuredLogger.setupPerformanceMonitoring();
    StructuredLogger.isMonitoringStarted = true;

    logger.info('Enhanced monitoring started with Node.js 24 features', '', {
      gcMonitoring: !!StructuredLogger.gcObserver,
      performanceMonitoring: !!StructuredLogger.performanceObserver,
    });
  }

  /**
   * Stop enhanced monitoring
   */
  public static stopEnhancedMonitoring(): void {
    if (StructuredLogger.gcObserver) {
      StructuredLogger.gcObserver.disconnect();
      StructuredLogger.gcObserver = undefined;
    }

    if (StructuredLogger.performanceObserver) {
      StructuredLogger.performanceObserver.disconnect();
      StructuredLogger.performanceObserver = undefined;
    }

    StructuredLogger.isMonitoringStarted = false;
    logger.info('Enhanced monitoring stopped', '', {});
  }

  public static logSecurityEvent(
    context: Readonly<SecurityEventContext>,
    event: Readonly<StructuredSecurityEvent>
  ): void {
    const correlationId =
      typeof context.correlationId === 'string' &&
      context.correlationId.length > 0
        ? context.correlationId
        : 'unknown';

    const message =
      context.operation !== undefined && context.operation.length > 0
        ? `Security event recorded: ${context.operation}`
        : 'Security event recorded';

    const source = context.operation ?? context.source ?? 'structured-logger';

    const details = buildSecurityDetails(context, event);

    logger.security(
      message,
      correlationId,
      event.eventType,
      event.severity,
      source,
      details
    );
  }

  /**
   * Log performance metrics with Node.js 24 enhancements
   */
  public static logPerformanceMetrics(
    operation: string,
    duration: number,
    correlationId: string,
    metadata?: Readonly<Record<string, unknown>>
  ): void {
    const entry: PerformanceLogEntry = {
      operation,
      duration,
      timestamp: new Date().toISOString(),
      correlationId,
      metadata,
    };

    // Log warning for slow operations
    if (duration > 1000) {
      logger.warn('Slow operation detected', correlationId, {
        ...entry,
        threshold: 1000,
      });
    } else {
      logger.debug(
        'Performance metrics recorded',
        correlationId,
        entry as unknown as Record<string, unknown>
      );
    }
  }

  /**
   * Log garbage collection events
   */
  public static logGCEvent(entry: Readonly<GCLogEntry>): void {
    const gcTypeNames: Record<number, string> = {
      1: 'Scavenge',
      2: 'Mark-Sweep-Compact',
      4: 'Incremental Marking',
      8: 'Weak Callbacks',
      15: 'All',
    };

    const message = `Garbage collection completed: ${entry.type}`;

    // Log warning for long GC pauses
    if (entry.duration > 100) {
      logger.warn(message, '', {
        ...entry,
        gcTypeName: gcTypeNames[parseInt(entry.type, 10)] ?? 'Unknown',
        threshold: 100,
      });
    } else {
      logger.debug(message, '', {
        ...entry,
        gcTypeName: gcTypeNames[parseInt(entry.type, 10)] ?? 'Unknown',
      });
    }
  }

  /**
   * Setup garbage collection monitoring using Node.js 24 features
   */
  private static setupGCMonitoring(): void {
    try {
      StructuredLogger.gcObserver = new PerformanceObserver((list) => {
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

          const memoryBefore = process.memoryUsage();

          // Force a small delay to get memory after GC
          setImmediate(() => {
            const memoryAfter = process.memoryUsage();

            const logEntry: GCLogEntry = {
              type: String(gcEntry.kind ?? gcEntry.detail?.kind ?? 0),
              duration: entry.duration,
              timestamp: new Date(
                performance.timeOrigin + entry.startTime
              ).toISOString(),
              heapBefore: memoryBefore.heapUsed,
              heapAfter: memoryAfter.heapUsed,
              freedMemory: Math.max(
                0,
                memoryBefore.heapUsed - memoryAfter.heapUsed
              ),
            };

            StructuredLogger.logGCEvent(logEntry);
          });
        }
      });

      StructuredLogger.gcObserver.observe({ entryTypes: ['gc'] });
    } catch (error) {
      logger.warn('Failed to setup GC monitoring', '', {
        error: error instanceof Error ? error.message : 'Unknown error',
        nodeVersion: process.version,
      });
    }
  }

  /**
   * Setup performance monitoring using Node.js 24 features
   */
  private static setupPerformanceMonitoring(): void {
    try {
      StructuredLogger.performanceObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          if (entry.entryType === 'measure') {
            StructuredLogger.logPerformanceMetrics(
              entry.name,
              entry.duration,
              'performance-observer',
              {
                startTime: entry.startTime,
                entryType: entry.entryType,
              }
            );
          }
        }
      });

      StructuredLogger.performanceObserver.observe({
        entryTypes: ['measure', 'resource'],
      });
    } catch (error) {
      logger.warn('Failed to setup performance monitoring', '', {
        error: error instanceof Error ? error.message : 'Unknown error',
        nodeVersion: process.version,
      });
    }
  }

  /**
   * Create a performance mark for timing operations
   */
  public static mark(name: string): void {
    try {
      performance.mark(name);
    } catch (error) {
      logger.debug('Failed to create performance mark', '', {
        name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Create a performance measure between two marks
   */
  public static measure(
    name: string,
    startMark: string,
    endMark?: string,
    correlationId?: string
  ): number {
    try {
      performance.measure(name, startMark, endMark);

      const measures = performance.getEntriesByName(name, 'measure');
      if (measures.length === 0) {
        return 0;
      }

      const latestMeasure = measures[measures.length - 1];

      const hasCorrelationId =
        typeof correlationId === 'string' && correlationId.length > 0;

      if (hasCorrelationId) {
        StructuredLogger.logPerformanceMetrics(
          name,
          latestMeasure.duration,
          correlationId,
          {
            startMark,
            endMark,
            startTime: latestMeasure.startTime,
          }
        );
      }

      return latestMeasure.duration;
    } catch (error) {
      logger.debug('Failed to create performance measure', '', {
        name,
        startMark,
        endMark,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 0;
    }
  }

  /**
   * Log memory usage with Node.js 24 enhanced details
   */
  public static logMemoryUsage(
    correlationId: string,
    operation?: string
  ): void {
    const memoryUsage = process.memoryUsage();
    const heapUsagePercent =
      (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

    const logData = {
      operation,
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers,
        heapUsagePercent: Math.round(heapUsagePercent * 100) / 100,
      },
      timestamp: new Date().toISOString(),
    };

    if (heapUsagePercent > 80) {
      logger.warn('High memory usage detected', correlationId, logData);
    } else if (heapUsagePercent > 60) {
      logger.info('Memory usage monitoring', correlationId, logData);
    } else {
      logger.debug('Memory usage monitoring', correlationId, logData);
    }
  }
}
