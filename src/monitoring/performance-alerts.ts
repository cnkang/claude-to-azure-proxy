/**
 * Performance monitoring and alerting system for Node.js 24
 * Monitors performance metrics and triggers alerts for regressions
 */

import { PerformanceObserver } from 'node:perf_hooks';
import { EventEmitter } from 'node:events';
import { mkdir, open } from 'node:fs/promises';
import { resolve, relative, basename } from 'node:path';
import { logger } from '../middleware/logging.js';
import { memoryPressureHandler } from '../config/performance.js';

/**
 * Performance alert levels
 */
export type AlertLevel = 'info' | 'warning' | 'critical';

/**
 * Performance metric types
 */
export type MetricType = 'response_time' | 'memory_usage' | 'gc_duration' | 'throughput' | 'error_rate';

/**
 * Performance alert configuration
 */
export interface AlertConfig {
  readonly metric: MetricType;
  readonly threshold: number;
  readonly level: AlertLevel;
  readonly enabled: boolean;
  readonly cooldownMs: number;
}

/**
 * Performance alert event
 */
export interface PerformanceAlert {
  readonly id: string;
  readonly metric: MetricType;
  readonly level: AlertLevel;
  readonly value: number;
  readonly threshold: number;
  readonly timestamp: Date;
  readonly message: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Performance metrics snapshot
 */
export interface PerformanceMetrics {
  readonly timestamp: Date;
  readonly responseTime: {
    readonly average: number;
    readonly p95: number;
    readonly p99: number;
  };
  readonly memoryUsage: {
    readonly heapUsed: number;
    readonly heapTotal: number;
    readonly external: number;
    readonly rss: number;
  };
  readonly gcMetrics: {
    readonly totalDuration: number;
    readonly eventCount: number;
    readonly averageDuration: number;
  };
  readonly throughput: {
    readonly requestsPerSecond: number;
    readonly bytesPerSecond: number;
  };
  readonly errorRate: number;
}

/**
 * Default alert configurations
 */
const DEFAULT_ALERT_CONFIGS: AlertConfig[] = [
  {
    metric: 'response_time',
    threshold: 1000, // 1 second
    level: 'warning',
    enabled: true,
    cooldownMs: 60000 // 1 minute
  },
  {
    metric: 'response_time',
    threshold: 5000, // 5 seconds
    level: 'critical',
    enabled: true,
    cooldownMs: 30000 // 30 seconds
  },
  {
    metric: 'memory_usage',
    threshold: 0.8, // 80% of heap
    level: 'warning',
    enabled: true,
    cooldownMs: 120000 // 2 minutes
  },
  {
    metric: 'memory_usage',
    threshold: 0.9, // 90% of heap
    level: 'critical',
    enabled: true,
    cooldownMs: 60000 // 1 minute
  },
  {
    metric: 'gc_duration',
    threshold: 100, // 100ms
    level: 'warning',
    enabled: true,
    cooldownMs: 300000 // 5 minutes
  },
  {
    metric: 'gc_duration',
    threshold: 500, // 500ms
    level: 'critical',
    enabled: true,
    cooldownMs: 120000 // 2 minutes
  },
  {
    metric: 'throughput',
    threshold: 10, // 10 requests per second minimum
    level: 'warning',
    enabled: true,
    cooldownMs: 180000 // 3 minutes
  },
  {
    metric: 'error_rate',
    threshold: 0.05, // 5% error rate
    level: 'warning',
    enabled: true,
    cooldownMs: 120000 // 2 minutes
  },
  {
    metric: 'error_rate',
    threshold: 0.1, // 10% error rate
    level: 'critical',
    enabled: true,
    cooldownMs: 60000 // 1 minute
  }
];

/**
 * Performance monitoring and alerting system
 */
export class PerformanceAlertSystem extends EventEmitter {
  private readonly alertConfigs: Map<string, AlertConfig> = new Map();
  private readonly lastAlertTimes: Map<string, number> = new Map();
  private readonly metricsHistory: PerformanceMetrics[] = [];
  private readonly maxHistorySize = 1000;
  
  private performanceObserver: PerformanceObserver | null = null;
  private metricsCollectionInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;
  
  // Metrics tracking
  private requestCount = 0;
  private totalResponseTime = 0;
  private errorCount = 0;
  private responseTimes: number[] = [];
  private readonly gcEvents: Array<{ duration: number; timestamp: number }> = [];

  constructor(configs: AlertConfig[] = DEFAULT_ALERT_CONFIGS) {
    super();
    
    // Initialize alert configurations
    configs.forEach(config => {
      const key = `${config.metric}_${config.level}`;
      this.alertConfigs.set(key, config);
    });
    
    this.setupEventHandlers();
  }

  /**
   * Set up event handlers
   */
  private setupEventHandlers(): void {
    this.on('alert', (alert: PerformanceAlert) => {
      this.handleAlert(alert);
    });
  }

  /**
   * Start performance monitoring
   */
  public startMonitoring(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    
    // Set up performance observer for GC events
    this.performanceObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (const entry of entries) {
        if (entry.entryType === 'gc') {
          this.gcEvents.push({
            duration: entry.duration,
            timestamp: entry.startTime
          });
          
          // Check GC duration alerts
          this.checkGCDurationAlerts(entry.duration);
        }
      }
    });
    
    this.performanceObserver.observe({ entryTypes: ['gc'] });
    
    // Start metrics collection
    this.metricsCollectionInterval = setInterval(() => {
      this.collectMetrics();
    }, 30000); // Collect metrics every 30 seconds
    
    logger.info('Performance alert system started', '', {
      alertConfigs: this.alertConfigs.size,
      monitoringInterval: '30s'
    });
  }

  /**
   * Stop performance monitoring
   */
  public stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
      this.performanceObserver = null;
    }
    
    if (this.metricsCollectionInterval) {
      clearInterval(this.metricsCollectionInterval);
      this.metricsCollectionInterval = null;
    }
    
    logger.info('Performance alert system stopped');
  }

  /**
   * Record a request for metrics tracking
   */
  public recordRequest(responseTime: number, isError: boolean = false): void {
    this.requestCount++;
    this.totalResponseTime += responseTime;
    this.responseTimes.push(responseTime);
    
    if (isError) {
      this.errorCount++;
    }
    
    // Keep only recent response times (last 1000)
    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-1000);
    }
    
    // Check response time alerts
    this.checkResponseTimeAlerts(responseTime);
  }

  /**
   * Collect current performance metrics
   */
  private collectMetrics(): void {
    const memUsage = process.memoryUsage();
    const now = new Date();
    
    // Calculate response time percentiles
    const sortedResponseTimes = [...this.responseTimes].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedResponseTimes.length * 0.95);
    const p99Index = Math.floor(sortedResponseTimes.length * 0.99);
    
    // Calculate GC metrics
    const recentGCEvents = this.gcEvents.filter(event => 
      now.getTime() - event.timestamp < 300000 // Last 5 minutes
    );
    
    const metrics: PerformanceMetrics = {
      timestamp: now,
      responseTime: {
        average: this.requestCount > 0 ? this.totalResponseTime / this.requestCount : 0,
        p95: sortedResponseTimes.at(p95Index) ?? 0,
        p99: sortedResponseTimes.at(p99Index) ?? 0
      },
      memoryUsage: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss
      },
      gcMetrics: {
        totalDuration: recentGCEvents.reduce((sum, event) => sum + event.duration, 0),
        eventCount: recentGCEvents.length,
        averageDuration: recentGCEvents.length > 0 
          ? recentGCEvents.reduce((sum, event) => sum + event.duration, 0) / recentGCEvents.length 
          : 0
      },
      throughput: {
        requestsPerSecond: this.requestCount / 30, // Requests in last 30 seconds
        bytesPerSecond: 0 // Would need to track bytes
      },
      errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0
    };
    
    // Add to history
    this.metricsHistory.push(metrics);
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.shift();
    }
    
    // Check all metric-based alerts
    this.checkMemoryAlerts(metrics.memoryUsage);
    this.checkThroughputAlerts(metrics.throughput.requestsPerSecond);
    this.checkErrorRateAlerts(metrics.errorRate);
    
    // Reset counters for next interval
    this.requestCount = 0;
    this.totalResponseTime = 0;
    this.errorCount = 0;
  }

  /**
   * Check response time alerts
   */
  private checkResponseTimeAlerts(responseTime: number): void {
    this.alertConfigs.forEach((config, key) => {
      if (config.metric === 'response_time' && config.enabled) {
        if (responseTime > config.threshold) {
          this.triggerAlert({
            id: `response_time_${Date.now()}`,
            metric: 'response_time',
            level: config.level,
            value: responseTime,
            threshold: config.threshold,
            timestamp: new Date(),
            message: `Response time ${responseTime.toFixed(2)}ms exceeds threshold ${config.threshold}ms`,
            metadata: { responseTime }
          }, key, config.cooldownMs);
        }
      }
    });
  }

  /**
   * Check memory usage alerts
   */
  private checkMemoryAlerts(memUsage: PerformanceMetrics['memoryUsage']): void {
    const heapUsageRatio = memUsage.heapUsed / memUsage.heapTotal;
    
    this.alertConfigs.forEach((config, key) => {
      if (config.metric === 'memory_usage' && config.enabled) {
        if (heapUsageRatio > config.threshold) {
          this.triggerAlert({
            id: `memory_usage_${Date.now()}`,
            metric: 'memory_usage',
            level: config.level,
            value: heapUsageRatio,
            threshold: config.threshold,
            timestamp: new Date(),
            message: `Memory usage ${(heapUsageRatio * 100).toFixed(1)}% exceeds threshold ${(config.threshold * 100).toFixed(1)}%`,
            metadata: { memUsage }
          }, key, config.cooldownMs);
        }
      }
    });
  }

  /**
   * Check GC duration alerts
   */
  private checkGCDurationAlerts(gcDuration: number): void {
    this.alertConfigs.forEach((config, key) => {
      if (config.metric === 'gc_duration' && config.enabled) {
        if (gcDuration > config.threshold) {
          this.triggerAlert({
            id: `gc_duration_${Date.now()}`,
            metric: 'gc_duration',
            level: config.level,
            value: gcDuration,
            threshold: config.threshold,
            timestamp: new Date(),
            message: `GC duration ${gcDuration.toFixed(2)}ms exceeds threshold ${config.threshold}ms`,
            metadata: { gcDuration }
          }, key, config.cooldownMs);
        }
      }
    });
  }

  /**
   * Check throughput alerts
   */
  private checkThroughputAlerts(throughput: number): void {
    this.alertConfigs.forEach((config, key) => {
      if (config.metric === 'throughput' && config.enabled) {
        if (throughput < config.threshold) {
          this.triggerAlert({
            id: `throughput_${Date.now()}`,
            metric: 'throughput',
            level: config.level,
            value: throughput,
            threshold: config.threshold,
            timestamp: new Date(),
            message: `Throughput ${throughput.toFixed(2)} req/s below threshold ${config.threshold} req/s`,
            metadata: { throughput }
          }, key, config.cooldownMs);
        }
      }
    });
  }

  /**
   * Check error rate alerts
   */
  private checkErrorRateAlerts(errorRate: number): void {
    this.alertConfigs.forEach((config, key) => {
      if (config.metric === 'error_rate' && config.enabled) {
        if (errorRate > config.threshold) {
          this.triggerAlert({
            id: `error_rate_${Date.now()}`,
            metric: 'error_rate',
            level: config.level,
            value: errorRate,
            threshold: config.threshold,
            timestamp: new Date(),
            message: `Error rate ${(errorRate * 100).toFixed(2)}% exceeds threshold ${(config.threshold * 100).toFixed(2)}%`,
            metadata: { errorRate }
          }, key, config.cooldownMs);
        }
      }
    });
  }

  /**
   * Trigger an alert with cooldown protection
   */
  private triggerAlert(alert: PerformanceAlert, configKey: string, cooldownMs: number): void {
    const now = Date.now();
    const lastAlertTime = this.lastAlertTimes.get(configKey) ?? 0;
    
    if (now - lastAlertTime < cooldownMs) {
      return; // Still in cooldown period
    }
    
    this.lastAlertTimes.set(configKey, now);
    this.emit('alert', alert);
  }

  /**
   * Handle performance alert
   */
  private handleAlert(alert: PerformanceAlert): void {
    if (alert.level === 'critical') {
      logger.error('Performance alert triggered', '', {
        alertId: alert.id,
        metric: alert.metric,
        level: alert.level,
        value: alert.value,
        threshold: alert.threshold,
        message: alert.message,
        metadata: alert.metadata
      });
    } else {
      logger.warn('Performance alert triggered', '', {
        alertId: alert.id,
        metric: alert.metric,
        level: alert.level,
        value: alert.value,
        threshold: alert.threshold,
        message: alert.message,
        metadata: alert.metadata
      });
    }
    
    // Handle critical alerts
    if (alert.level === 'critical') {
      this.handleCriticalAlert(alert);
    }
  }

  /**
   * Handle critical performance alerts
   */
  private handleCriticalAlert(alert: PerformanceAlert): void {
    switch (alert.metric) {
      case 'memory_usage':
        // Trigger memory pressure handling
        memoryPressureHandler.handleMemoryPressure().catch(error => {
          logger.error('Failed to handle memory pressure', '', {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        });
        break;
        
      case 'gc_duration':
        // Log GC performance issue
        logger.error('Critical GC performance detected', '', {
          duration: alert.value,
          threshold: alert.threshold,
          recommendation: 'Consider tuning GC parameters or reducing memory allocation'
        });
        break;
        
      case 'response_time':
        // Log response time issue
        logger.error('Critical response time detected', '', {
          responseTime: alert.value,
          threshold: alert.threshold,
          recommendation: 'Check for blocking operations or resource contention'
        });
        break;
    }
  }

  /**
   * Get current performance metrics
   */
  public getCurrentMetrics(): PerformanceMetrics | null {
    if (this.metricsHistory.length > 0) {
      return this.metricsHistory[this.metricsHistory.length - 1] ?? null;
    }
    return null;
  }

  /**
   * Get metrics history
   */
  public getMetricsHistory(limit?: number): PerformanceMetrics[] {
    if (limit !== undefined && limit > 0) {
      return this.metricsHistory.slice(-limit);
    }
    return [...this.metricsHistory];
  }

  /**
   * Export metrics to file
  */
  public async exportMetrics(filePath: string): Promise<void> {
    // Validate file path to prevent directory traversal
    if (filePath.trim() === '' || !filePath.endsWith('.json')) {
      throw new Error('Invalid file path');
    }

    const safeFileName = basename(filePath);
    if (safeFileName !== filePath) {
      throw new Error('Invalid file path');
    }

    const exportDirectory = resolve(process.cwd(), 'metrics-exports');
    await mkdir(exportDirectory, { recursive: true });

    const resolvedPath = resolve(exportDirectory, safeFileName);
    const relativePath = relative(exportDirectory, resolvedPath);

    if (relativePath.startsWith('..')) {
      throw new Error('Invalid file path');
    }
    
    const exportData = {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      alertConfigs: Array.from(this.alertConfigs.entries()),
      metricsHistory: this.metricsHistory
    };
    
    // Path sanitization above prevents directory traversal; suppress security rule for this safe usage.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const fileHandle = await open(resolvedPath, 'w');
    try {
      await fileHandle.writeFile(JSON.stringify(exportData, null, 2), 'utf8');
    } finally {
      await fileHandle.close();
    }
    logger.info('Performance metrics exported', '', { filePath: resolvedPath });
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.stopMonitoring();
    this.removeAllListeners();
    this.metricsHistory.length = 0;
    this.alertConfigs.clear();
    this.lastAlertTimes.clear();
  }

  /**
   * Implement explicit resource management for Node.js 24
   */
  public [Symbol.dispose](): void {
    this.cleanup();
  }

  /**
   * Async cleanup for Node.js 24
   */
  public [Symbol.asyncDispose](): Promise<void> {
    this.cleanup();
    return Promise.resolve();
  }
}

/**
 * Global performance alert system instance
 */
let globalPerformanceAlerts: PerformanceAlertSystem | null = null;

export function getPerformanceAlertSystem(configs?: AlertConfig[]): PerformanceAlertSystem {
  globalPerformanceAlerts ??= new PerformanceAlertSystem(configs);
  return globalPerformanceAlerts;
}

/**
 * Cleanup global performance alert system
 */
export function cleanupGlobalPerformanceAlerts(): void {
  if (globalPerformanceAlerts) {
    globalPerformanceAlerts.cleanup();
    globalPerformanceAlerts = null;
  }
}

export default PerformanceAlertSystem;
