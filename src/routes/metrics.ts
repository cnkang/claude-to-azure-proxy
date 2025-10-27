/**
 * @fileoverview Metrics endpoint for monitoring Azure OpenAI and AWS Bedrock usage.
 *
 * This module provides comprehensive metrics collection and reporting for both
 * Azure OpenAI and AWS Bedrock services, enabling separate performance tracking
 * and usage analysis as required by the monitoring specifications.
 *
 * @author Claude-to-Azure Proxy Team
 * @version 1.0.0
 * @since 1.0.0
 */

import { Response } from 'express';
import type { RequestWithCorrelationId } from '../types/index.js';
import { logger } from '../middleware/logging.js';
import { metricsCollector } from '../monitoring/metrics.js';
import { getHealthMonitor } from '../monitoring/health-monitor.js';

/**
 * Service-specific metrics interface for distinguishing between providers.
 * Requirement 4.5: Create metrics endpoints that distinguish between Azure and Bedrock usage
 *
 * @public
 * @interface ServiceMetrics
 */
export interface ServiceMetrics {
  /** Azure OpenAI service metrics */
  readonly azure: {
    readonly requestCount: number;
    readonly averageLatency: number;
    readonly errorRate: number;
    readonly successCount: number;
    readonly errorCount: number;
    readonly lastRequestTime?: string;
    readonly serviceStatus: 'available' | 'degraded' | 'unavailable';
  };
  /** AWS Bedrock service metrics */
  readonly bedrock: {
    readonly requestCount: number;
    readonly averageLatency: number;
    readonly errorRate: number;
    readonly successCount: number;
    readonly errorCount: number;
    readonly lastRequestTime?: string;
    readonly serviceStatus: 'available' | 'degraded' | 'unavailable';
  };
  /** Overall system metrics */
  readonly system: {
    readonly totalRequests: number;
    readonly overallErrorRate: number;
    readonly averageResponseTime: number;
    readonly uptime: number;
    readonly timestamp: string;
  };
}

/**
 * Detailed metrics response including performance and business metrics.
 *
 * @public
 * @interface DetailedMetricsResponse
 */
export interface DetailedMetricsResponse extends ServiceMetrics {
  /** Raw performance metrics from the metrics collector */
  readonly performanceMetrics: readonly import('../monitoring/metrics.js').MetricDataPoint[];
  /** Business metrics breakdown by category */
  readonly businessMetrics: {
    readonly requests: readonly import('../monitoring/metrics.js').MetricDataPoint[];
    readonly completions: readonly import('../monitoring/metrics.js').MetricDataPoint[];
    readonly errors: readonly import('../monitoring/metrics.js').MetricDataPoint[];
    readonly authentication: readonly import('../monitoring/metrics.js').MetricDataPoint[];
  };
}

/**
 * Metrics endpoint handler that provides service-distinguished metrics.
 * Requirement 4.5: Create metrics endpoints that distinguish between Azure and Bedrock usage
 *
 * @param req - Request with correlation ID
 * @param res - Express response object
 */
export const metricsHandler = (
  req: RequestWithCorrelationId,
  res: Response
): void => {
  const { correlationId } = req;
  const startTime = Date.now();

  try {
    logger.info('Metrics request received', correlationId, {
      endpoint: '/metrics',
      timestamp: new Date().toISOString(),
    });

    // Get all collected metrics
    const allMetrics = metricsCollector.getMetrics();

    // Separate metrics by service (Azure vs Bedrock)
    const azureMetrics = allMetrics.filter(metric => 
      metric.tags?.service === 'azure' || 
      metric.name.includes('azure') ||
      (metric.tags?.service === undefined && !metric.name.includes('bedrock'))
    );

    const bedrockMetrics = allMetrics.filter(metric => 
      metric.tags?.service === 'bedrock' || 
      metric.name.includes('bedrock')
    );

    // Calculate Azure metrics
    const azureStats = calculateServiceStats(azureMetrics);
    
    // Calculate Bedrock metrics
    const bedrockStats = calculateServiceStats(bedrockMetrics);

    // Get Bedrock-specific metrics from monitor if available
    let bedrockMonitorStats: import('../monitoring/bedrock-monitor.js').BedrockMetrics | undefined;
    
    try {
      const healthMonitor = getHealthMonitor();
      const bedrockMonitor = healthMonitor.getBedrockMonitor();
      bedrockMonitorStats = bedrockMonitor?.getBedrockMetrics();
    } catch (error) {
      // Health monitor not initialized or Bedrock monitor not available
      logger.debug('Bedrock monitor not available for metrics', correlationId, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      bedrockMonitorStats = undefined;
    }

    // Merge Bedrock stats with monitor stats if available
    const finalBedrockStats = bedrockMonitorStats ? {
      ...bedrockStats,
      ...bedrockMonitorStats,
    } : bedrockStats;

    // Calculate system-wide metrics
    const totalRequests = azureStats.requestCount + finalBedrockStats.requestCount;
    const totalErrors = azureStats.errorCount + finalBedrockStats.errorCount;
    const overallErrorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
    
    const totalLatency = (azureStats.averageLatency * azureStats.requestCount) + 
                        (finalBedrockStats.averageLatency * finalBedrockStats.requestCount);
    const averageResponseTime = totalRequests > 0 ? totalLatency / totalRequests : 0;

    const serviceMetrics: ServiceMetrics = {
      azure: azureStats,
      bedrock: finalBedrockStats,
      system: {
        totalRequests,
        overallErrorRate,
        averageResponseTime,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
    };

    const responseTime = Date.now() - startTime;

    logger.info('Metrics request completed', correlationId, {
      responseTime,
      azureRequests: azureStats.requestCount,
      bedrockRequests: finalBedrockStats.requestCount,
      totalRequests,
    });

    res.status(200).json(serviceMetrics);
  } catch (error: unknown) {
    logger.error('Metrics request failed', correlationId, {
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime: Date.now() - startTime,
    });

    res.status(500).json({
      error: {
        type: 'internal_error',
        message: 'Failed to retrieve metrics',
        correlationId,
      },
    });
  }
};

/**
 * Detailed metrics endpoint handler with comprehensive breakdown.
 *
 * @param req - Request with correlation ID
 * @param res - Express response object
 */
export const detailedMetricsHandler = (
  req: RequestWithCorrelationId,
  res: Response
): void => {
  const { correlationId } = req;
  const startTime = Date.now();

  try {
    logger.info('Detailed metrics request received', correlationId, {
      endpoint: '/metrics/detailed',
      timestamp: new Date().toISOString(),
    });

    // Get basic service metrics
    const basicMetrics = getServiceMetrics();

    // Get all raw metrics
    const allMetrics = metricsCollector.getMetrics();

    // Categorize business metrics
    const businessMetrics = {
      requests: allMetrics.filter(m => m.name.includes('request') && !m.name.includes('error')),
      completions: allMetrics.filter(m => m.name.includes('completion') || m.name.includes('success')),
      errors: allMetrics.filter(m => m.name.includes('error') || m.name.includes('fail')),
      authentication: allMetrics.filter(m => m.name.includes('auth')),
    };

    // Get performance metrics
    const performanceMetrics = allMetrics.filter(m => m.name.startsWith('performance.'));

    const detailedResponse: DetailedMetricsResponse = {
      ...basicMetrics,
      performanceMetrics,
      businessMetrics,
    };

    const responseTime = Date.now() - startTime;

    logger.info('Detailed metrics request completed', correlationId, {
      responseTime,
      performanceMetricsCount: performanceMetrics.length,
      businessMetricsCount: Object.values(businessMetrics).reduce((sum, arr) => sum + arr.length, 0),
    });

    res.status(200).json(detailedResponse);
  } catch (error) {
    logger.error('Detailed metrics request failed', correlationId, {
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime: Date.now() - startTime,
    });

    res.status(500).json({
      error: {
        type: 'internal_error',
        message: 'Failed to retrieve detailed metrics',
        correlationId,
      },
    });
  }
};

/**
 * Calculates service-specific statistics from metrics data.
 *
 * @private
 * @param metrics - Filtered metrics for a specific service
 * @param serviceName - Name of the service for logging
 * @returns Calculated service statistics
 */
function calculateServiceStats(
  metrics: readonly import('../monitoring/metrics.js').MetricDataPoint[]
): ServiceMetrics['azure'] | ServiceMetrics['bedrock'] {
  const requestMetrics = metrics.filter(m => 
    m.name.includes('request') || 
    m.name.includes('completion')
  );

  const errorMetrics = metrics.filter(m => 
    m.name.includes('error') || 
    m.name.includes('fail')
  );

  const performanceMetrics = metrics.filter(m => 
    m.name.startsWith('performance.') && 
    typeof m.value === 'number'
  );

  const requestCount = requestMetrics.length;
  const errorCount = errorMetrics.length;
  const successCount = requestCount - errorCount;
  const errorRate = requestCount > 0 ? (errorCount / requestCount) * 100 : 0;

  // Calculate average latency from performance metrics
  const latencies = performanceMetrics
    .map(m => typeof m.value === 'number' ? m.value : 0)
    .filter(v => v > 0);
  
  const averageLatency = latencies.length > 0 
    ? latencies.reduce((sum, val) => sum + val, 0) / latencies.length 
    : 0;

  // Find last request time
  const timestamps = requestMetrics.map(m => m.timestamp).sort();
  const lastRequestTime = timestamps.length > 0 ? timestamps[timestamps.length - 1] : undefined;

  // Determine service status based on error rate
  let serviceStatus: 'available' | 'degraded' | 'unavailable' = 'available';
  if (errorRate > 50) {
    serviceStatus = 'unavailable';
  } else if (errorRate > 10) {
    serviceStatus = 'degraded';
  }

  return {
    requestCount,
    averageLatency,
    errorRate,
    successCount,
    errorCount,
    lastRequestTime,
    serviceStatus,
  };
}

/**
 * Helper function to get basic service metrics.
 *
 * @private
 * @returns Service metrics with fallback handling
 */
function getServiceMetrics(): ServiceMetrics {
  // This is a simplified version that reuses the main metrics handler logic
  const allMetrics = metricsCollector.getMetrics();

  const azureMetrics = allMetrics.filter(metric => 
    metric.tags?.service === 'azure' || 
    metric.name.includes('azure') ||
    (metric.tags?.service === undefined && !metric.name.includes('bedrock'))
  );

  const bedrockMetrics = allMetrics.filter(metric => 
    metric.tags?.service === 'bedrock' || 
    metric.name.includes('bedrock')
  );

  const azureStats = calculateServiceStats(azureMetrics);
  const bedrockStats = calculateServiceStats(bedrockMetrics);

  // Get Bedrock monitor stats if available
  let bedrockMonitorStats: import('../monitoring/bedrock-monitor.js').BedrockMetrics | undefined;
  
  try {
    const healthMonitor = getHealthMonitor();
    const bedrockMonitor = healthMonitor.getBedrockMonitor();
    bedrockMonitorStats = bedrockMonitor?.getBedrockMetrics();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_error: unknown) {
    // Bedrock monitor not available, use calculated stats
    bedrockMonitorStats = undefined;
  }

  // Merge Bedrock stats with monitor stats if available
  const finalBedrockStats = bedrockMonitorStats ? {
    ...bedrockStats,
    ...bedrockMonitorStats,
  } : bedrockStats;

  const totalRequests = azureStats.requestCount + finalBedrockStats.requestCount;
  const totalErrors = azureStats.errorCount + finalBedrockStats.errorCount;
  const overallErrorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
  
  const totalLatency = (azureStats.averageLatency * azureStats.requestCount) + 
                      (finalBedrockStats.averageLatency * finalBedrockStats.requestCount);
  const averageResponseTime = totalRequests > 0 ? totalLatency / totalRequests : 0;

  return {
    azure: azureStats,
    bedrock: finalBedrockStats,
    system: {
      totalRequests,
      overallErrorRate,
      averageResponseTime,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  };
}