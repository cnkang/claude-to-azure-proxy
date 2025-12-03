/**
 * Server health monitoring for E2E test stability
 * Implements Requirement 8: Backend Server Stability
 */

import type { Server } from 'node:http';
import { getActiveRequestCount } from '../middleware/load-shedding.js';
import { logger } from '../middleware/logging.js';

/**
 * Server health metrics
 */
export interface ServerHealthMetrics {
  readonly uptime: number;
  readonly activeRequests: number;
  readonly totalRequests: number;
  readonly errorCount: number;
  readonly lastErrorTime?: Date;
  readonly memoryUsage: NodeJS.MemoryUsage;
  readonly isHealthy: boolean;
}

/**
 * Server health monitor class
 */
export class ServerHealthMonitor {
  private totalRequests = 0;
  private errorCount = 0;
  private lastErrorTime?: Date;
  private startTime: number;
  private healthCheckInterval?: NodeJS.Timeout;
  private server?: Server;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Start monitoring server health
   */
  public startMonitoring(server: Server, intervalMs = 30000): void {
    this.server = server;

    // Monitor server errors
    server.on('error', (error: Error) => {
      this.recordError(error);
    });

    // Monitor connection errors
    server.on('clientError', (error: Error) => {
      this.recordError(error);
    });

    // Periodic health check
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, intervalMs);

    logger.info('Server health monitoring started', '', {
      checkInterval: intervalMs,
    });
  }

  /**
   * Stop monitoring
   */
  public stopMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    logger.info('Server health monitoring stopped', '', {});
  }

  /**
   * Record a request
   */
  public recordRequest(): void {
    this.totalRequests++;
  }

  /**
   * Record an error
   */
  public recordError(error: Error): void {
    this.errorCount++;
    this.lastErrorTime = new Date();

    logger.error('Server error recorded', '', {
      errorCount: this.errorCount,
      totalRequests: this.totalRequests,
      errorMessage: error.message,
      errorStack: error.stack,
    });
  }

  /**
   * Get current health metrics
   */
  public getMetrics(): ServerHealthMetrics {
    const uptime = Date.now() - this.startTime;
    const activeRequests = getActiveRequestCount();
    const memoryUsage = process.memoryUsage();

    // Determine if server is healthy
    const errorRate =
      this.totalRequests > 0 ? this.errorCount / this.totalRequests : 0;
    const isHealthy = errorRate < 0.1; // Less than 10% error rate

    return {
      uptime,
      activeRequests,
      totalRequests: this.totalRequests,
      errorCount: this.errorCount,
      lastErrorTime: this.lastErrorTime,
      memoryUsage,
      isHealthy,
    };
  }

  /**
   * Perform periodic health check
   */
  private performHealthCheck(): void {
    const metrics = this.getMetrics();

    // Log health status
    logger.info('Server health check', '', {
      uptime: Math.round(metrics.uptime / 1000), // seconds
      activeRequests: metrics.activeRequests,
      totalRequests: metrics.totalRequests,
      errorCount: metrics.errorCount,
      errorRate:
        metrics.totalRequests > 0
          ? `${((metrics.errorCount / metrics.totalRequests) * 100).toFixed(2)}%`
          : '0%',
      heapUsed: Math.round(metrics.memoryUsage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(metrics.memoryUsage.heapTotal / 1024 / 1024), // MB
      isHealthy: metrics.isHealthy,
    });

    // Warn if unhealthy
    if (!metrics.isHealthy) {
      logger.warn('Server health degraded', '', {
        errorCount: metrics.errorCount,
        totalRequests: metrics.totalRequests,
        errorRate: `${(
          (metrics.errorCount / metrics.totalRequests) * 100
        ).toFixed(2)}%`,
      });
    }
  }

  /**
   * Reset metrics (for testing)
   */
  public resetMetrics(): void {
    this.totalRequests = 0;
    this.errorCount = 0;
    this.lastErrorTime = undefined;
    this.startTime = Date.now();
  }
}

// Global server health monitor instance
let globalServerHealthMonitor: ServerHealthMonitor | undefined;

/**
 * Get global server health monitor instance
 */
export function getServerHealthMonitor(): ServerHealthMonitor {
  if (!globalServerHealthMonitor) {
    globalServerHealthMonitor = new ServerHealthMonitor();
  }
  return globalServerHealthMonitor;
}

/**
 * Cleanup global server health monitor
 */
export function cleanupServerHealthMonitor(): void {
  if (globalServerHealthMonitor) {
    globalServerHealthMonitor.stopMonitoring();
    globalServerHealthMonitor = undefined;
  }
}
