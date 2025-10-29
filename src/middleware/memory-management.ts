/**
 * @fileoverview Memory management middleware for Node.js 24 with enhanced memory leak prevention
 * and resource cleanup capabilities.
 *
 * This middleware provides:
 * - Automatic memory pressure monitoring per request
 * - Resource leak prevention for HTTP connections
 * - Memory usage tracking and alerting
 * - Integration with Node.js 24 memory management features
 *
 * @author Claude-to-Azure Proxy Team
 * @version 1.0.0
 * @since 1.0.0
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from './logging.js';
import { getCurrentMemoryMetrics, forceGarbageCollection } from '../utils/memory-manager.js';
import { createHTTPConnectionResource, resourceManager } from '../runtime/resource-manager.js';
import type { RequestWithCorrelationId } from '../types/index.js';
import loadedConfig from '../config/index.js';

/**
 * Memory management middleware configuration.
 *
 * @public
 * @interface MemoryMiddlewareConfig
 */
export interface MemoryMiddlewareConfig {
  /** Enable memory pressure monitoring per request */
  readonly enablePressureMonitoring: boolean;
  /** Enable resource leak prevention */
  readonly enableResourceTracking: boolean;
  /** Memory pressure threshold for warnings (percentage) */
  readonly pressureThreshold: number;
  /** Enable automatic garbage collection suggestions */
  readonly enableGCSuggestions: boolean;
  /** Log memory metrics for slow requests */
  readonly logSlowRequestMemory: boolean;
  /** Slow request threshold in milliseconds */
  readonly slowRequestThreshold: number;
}

/**
 * Default memory middleware configuration.
 */
const DEFAULT_CONFIG: MemoryMiddlewareConfig = {
  enablePressureMonitoring: true,
  enableResourceTracking: true,
  pressureThreshold: 80,
  enableGCSuggestions: true,
  logSlowRequestMemory: true,
  slowRequestThreshold: 1000,
};

/**
 * Request memory tracking interface.
 *
 * @public
 * @interface RequestMemoryInfo
 */
export interface RequestMemoryInfo {
  /** Memory usage at request start */
  readonly startMemory: NodeJS.MemoryUsage;
  /** Memory usage at request end */
  readonly endMemory?: NodeJS.MemoryUsage;
  /** Memory difference during request */
  readonly memoryDelta?: number;
  /** Request start timestamp */
  readonly startTime: number;
  /** Request duration in milliseconds */
  readonly duration?: number;
  /** Whether memory pressure was detected */
  readonly pressureDetected: boolean;
  /** Resource cleanup status */
  readonly resourcesCleanedUp: boolean;
}

/**
 * Extended request interface with memory tracking.
 *
 * @public
 * @interface RequestWithMemoryTracking
 */
export interface RequestWithMemoryTracking extends RequestWithCorrelationId {
  /** Memory tracking information */
  memoryInfo?: RequestMemoryInfo;
}

/**
 * Memory management middleware class.
 *
 * @public
 * @class MemoryManagementMiddleware
 */
export class MemoryManagementMiddleware {
  private readonly config: MemoryMiddlewareConfig;
  private requestCount = 0;
  private memoryLeakWarnings = 0;
  private lastMemoryCheck = 0;

  constructor(config: Partial<MemoryMiddlewareConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Main memory management middleware function.
   *
   * @public
   * @param req - Express request object
   * @param res - Express response object
   * @param next - Express next function
   */
  public middleware = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const request = req as RequestWithMemoryTracking;
    const correlationId = request.correlationId || 'unknown';
    
    // Initialize memory tracking
    const startMemory = process.memoryUsage();
    const startTime = Date.now();
    
    request.memoryInfo = {
      startMemory,
      startTime,
      pressureDetected: false,
      resourcesCleanedUp: false,
    };

    // Check memory pressure at request start
    if (this.config.enablePressureMonitoring) {
      this.checkMemoryPressure(correlationId, startMemory);
    }

    // Create resource tracking for this request
    let connectionResource: ReturnType<typeof createHTTPConnectionResource> | undefined;
    if (this.config.enableResourceTracking) {
      connectionResource = createHTTPConnectionResource(req, res, req.socket);
    }

    // Set up response cleanup
    const cleanup = (): void => {
      const endTime = Date.now();
      const endMemory = process.memoryUsage();
      const duration = endTime - startTime;
      const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;

      // Update memory tracking info
      if (request.memoryInfo) {
        request.memoryInfo = {
          ...request.memoryInfo,
          endMemory,
          memoryDelta,
          duration,
          resourcesCleanedUp: true,
        };
      }

      // Log memory usage for slow requests
      if (this.config.logSlowRequestMemory && duration > this.config.slowRequestThreshold) {
        logger.warn('Slow request with memory tracking', correlationId, {
          method: req.method,
          url: req.originalUrl,
          duration,
          memoryDelta,
          heapUsedStart: startMemory.heapUsed,
          heapUsedEnd: endMemory.heapUsed,
          statusCode: res.statusCode,
        });
      }

      // Clean up connection resource
      if (connectionResource && !connectionResource.disposed) {
        connectionResource[Symbol.asyncDispose]().catch((error: unknown) => {
          logger.debug('Connection resource cleanup failed', correlationId, {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      }

      // Check for memory leaks periodically
      this.requestCount += 1;
      if (this.requestCount % 100 === 0) {
        this.performPeriodicMemoryCheck(correlationId);
      }

      // Suggest garbage collection for memory-intensive requests
      if (this.config.enableGCSuggestions && memoryDelta > 10 * 1024 * 1024) { // 10MB
        this.suggestGarbageCollection(correlationId, memoryDelta);
      }
    };

    // Set up cleanup on response finish
    res.on('finish', cleanup);
    res.on('close', cleanup);

    // Continue with request processing
    next();
  };

  /**
   * Checks memory pressure and logs warnings if necessary.
   *
   * @private
   * @param correlationId - Request correlation ID
   * @param memoryUsage - Current memory usage
   */
  private checkMemoryPressure(
    correlationId: string,
    memoryUsage: NodeJS.MemoryUsage
  ): void {
    const heapPercentage = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    
    if (heapPercentage > this.config.pressureThreshold) {
      logger.warn('Memory pressure detected during request', correlationId, {
        heapUsage: Math.round(heapPercentage),
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        threshold: this.config.pressureThreshold,
      });
    }
  }

  /**
   * Performs periodic memory leak detection.
   *
   * @private
   * @param correlationId - Request correlation ID
   */
  private performPeriodicMemoryCheck(correlationId: string): void {
    const now = Date.now();
    
    // Only check memory every 5 minutes to avoid overhead
    if (now - this.lastMemoryCheck < 300000) {
      return;
    }
    
    this.lastMemoryCheck = now;

    try {
      const memoryMetrics = getCurrentMemoryMetrics();
      const resourceStats = resourceManager.getResourceStats();

      // Check for potential memory leaks
      if (memoryMetrics.pressure.level === 'high' || memoryMetrics.pressure.level === 'critical') {
        this.memoryLeakWarnings += 1;
        
        logger.warn('Potential memory leak detected during periodic check', correlationId, {
          pressureLevel: memoryMetrics.pressure.level,
          heapUsage: memoryMetrics.heap.percentage,
          activeResources: resourceStats.active,
          totalRequests: this.requestCount,
          leakWarnings: this.memoryLeakWarnings,
        });

        // Force garbage collection if available and pressure is critical
        if (memoryMetrics.pressure.level === 'critical' && typeof global.gc === 'function') {
          logger.info('Forcing garbage collection due to critical memory pressure', correlationId, {
            heapUsage: memoryMetrics.heap.percentage,
          });
          global.gc();
        }
      }

      // Check for resource leaks
      if (resourceStats.active > 100) {
        logger.warn('High number of active resources detected', correlationId, {
          activeResources: resourceStats.active,
          totalResources: resourceStats.total,
          resourcesByType: resourceStats.byType,
        });
      }

    } catch (error) {
      logger.error('Error during periodic memory check', correlationId, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Suggests garbage collection for memory-intensive requests.
   *
   * @private
   * @param correlationId - Request correlation ID
   * @param memoryDelta - Memory usage delta
   */
  private suggestGarbageCollection(correlationId: string, memoryDelta: number): void {
    logger.debug('Memory-intensive request detected', correlationId, {
      memoryDelta,
      suggestion: 'Consider garbage collection',
    });

    // Trigger GC if available and delta is very large
    if (memoryDelta > 50 * 1024 * 1024) { // 50MB
      const gcTriggered = forceGarbageCollection();

      if (gcTriggered) {
        logger.info('Garbage collection triggered for memory-intensive request', correlationId, {
          memoryDelta,
        });
      } else {
        logger.warn('Garbage collection unavailable for memory-intensive request', correlationId, {
          memoryDelta,
        });
      }
    }
  }

  /**
   * Gets memory middleware statistics.
   *
   * @public
   * @returns Memory middleware statistics
   */
  public getStats(): {
    readonly requestCount: number;
    readonly memoryLeakWarnings: number;
    readonly lastMemoryCheck: number;
    readonly config: MemoryMiddlewareConfig;
  } {
    return {
      requestCount: this.requestCount,
      memoryLeakWarnings: this.memoryLeakWarnings,
      lastMemoryCheck: this.lastMemoryCheck,
      config: this.config,
    };
  }

  /**
   * Resets middleware statistics.
   *
   * @public
   */
  public resetStats(): void {
    this.requestCount = 0;
    this.memoryLeakWarnings = 0;
    this.lastMemoryCheck = 0;
  }
}

/**
 * Global memory management middleware instance.
 */
const memoryMiddleware = new MemoryManagementMiddleware({
  enablePressureMonitoring: loadedConfig.ENABLE_MEMORY_MANAGEMENT,
  enableResourceTracking: loadedConfig.ENABLE_RESOURCE_MONITORING,
  pressureThreshold: loadedConfig.MEMORY_PRESSURE_THRESHOLD,
  enableGCSuggestions: loadedConfig.ENABLE_AUTO_GC,
  logSlowRequestMemory: true,
  slowRequestThreshold: 1000,
});

/**
 * Memory management middleware function for Express.
 *
 * @public
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export const memoryManagementMiddleware = memoryMiddleware.middleware;

/**
 * Gets memory middleware statistics.
 *
 * @public
 * @returns Memory middleware statistics
 */
export function getMemoryMiddlewareStats(): ReturnType<MemoryManagementMiddleware['getStats']> {
  return memoryMiddleware.getStats();
}

/**
 * Resets memory middleware statistics.
 *
 * @public
 */
export function resetMemoryMiddlewareStats(): void {
  memoryMiddleware.resetStats();
}

/**
 * Type guard to check if request has memory tracking.
 *
 * @public
 * @param req - Express request object
 * @returns True if request has memory tracking
 */
export function hasMemoryTracking(req: Request): req is RequestWithMemoryTracking {
  return 'memoryInfo' in req && req.memoryInfo !== undefined;
}

/**
 * Gets memory information from request if available.
 *
 * @public
 * @param req - Express request object
 * @returns Memory information or undefined
 */
export function getRequestMemoryInfo(req: Request): RequestMemoryInfo | undefined {
  return hasMemoryTracking(req) ? req.memoryInfo : undefined;
}
