/**
 * Enhanced monitoring and logging for Azure OpenAI Responses API
 * Provides comprehensive tracking of reasoning token usage, performance metrics,
 * and security events without exposing sensitive data
 */

import { logger } from '../middleware/logging.js';
import { recordBusinessMetric } from './metrics.js';
import type {
  ResponsesResponse,
  ResponsesCreateParams,
  RequestFormat,
  ResponseFormat,
  SecurityAuditLog,
} from '../types/index.js';

export interface AzureResponsesMetrics {
  readonly requestCount: number;
  readonly successCount: number;
  readonly errorCount: number;
  readonly averageResponseTime: number;
  readonly totalTokensUsed: number;
  readonly reasoningTokensUsed: number;
  readonly averageReasoningTokens: number;
  readonly reasoningEffortDistribution: Record<string, number>;
  readonly formatDistribution: Record<RequestFormat, number>;
  readonly errorDistribution: Record<string, number>;
  readonly circuitBreakerTrips: number;
  readonly retryAttempts: number;
  readonly fallbackUsage: number;
}

export interface RequestMetrics {
  readonly correlationId: string;
  readonly timestamp: string;
  readonly requestFormat: RequestFormat;
  readonly responseFormat: ResponseFormat;
  readonly model: string;
  readonly reasoningEffort?: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly totalTokens: number;
  readonly responseTime: number;
  readonly success: boolean;
  readonly errorType?: string;
  readonly circuitBreakerUsed: boolean;
  readonly retryCount: number;
  readonly fallbackUsed: boolean;
}

export interface SecurityMetrics {
  readonly authenticationAttempts: number;
  readonly authenticationFailures: number;
  readonly rateLimitHits: number;
  readonly suspiciousActivity: number;
  readonly validationErrors: number;
  readonly securityEvents: SecurityEventSummary[];
}

export interface SecurityEventSummary {
  readonly eventType: string;
  readonly count: number;
  readonly lastOccurrence: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Azure Responses API monitoring class
 */
export class AzureResponsesMonitor {
  private static instance: AzureResponsesMonitor | undefined;
  private readonly requestMetrics: RequestMetrics[] = [];
  private readonly securityEvents: SecurityAuditLog[] = [];
  private readonly maxMetricsHistory = 1000;
  private readonly maxSecurityEvents = 500;
  private monitoringInterval?: NodeJS.Timeout;

  private constructor() {}

  public static getInstance(): AzureResponsesMonitor {
    AzureResponsesMonitor.instance ??= new AzureResponsesMonitor();
    return AzureResponsesMonitor.instance;
  }

  /**
   * Record a request/response cycle
   */
  public recordRequest(
    params: ResponsesCreateParams,
    response: ResponsesResponse | null,
    metadata: {
      correlationId: string;
      requestFormat: RequestFormat;
      responseFormat: ResponseFormat;
      responseTime: number;
      success: boolean;
      errorType?: string;
      circuitBreakerUsed: boolean;
      retryCount: number;
      fallbackUsed: boolean;
    }
  ): void {
    const requestMetric: RequestMetrics = {
      correlationId: metadata.correlationId,
      timestamp: new Date().toISOString(),
      requestFormat: metadata.requestFormat,
      responseFormat: metadata.responseFormat,
      model: params.model,
      reasoningEffort: params.reasoning?.effort,
      inputTokens: response?.usage.prompt_tokens ?? 0,
      outputTokens: response?.usage.completion_tokens ?? 0,
      reasoningTokens: response?.usage.reasoning_tokens ?? 0,
      totalTokens: response?.usage.total_tokens ?? 0,
      responseTime: metadata.responseTime,
      success: metadata.success,
      errorType: metadata.errorType,
      circuitBreakerUsed: metadata.circuitBreakerUsed,
      retryCount: metadata.retryCount,
      fallbackUsed: metadata.fallbackUsed,
    };

    // Store request metric
    this.requestMetrics.push(requestMetric);
    if (this.requestMetrics.length > this.maxMetricsHistory) {
      this.requestMetrics.shift();
    }

    // Record business metrics
    recordBusinessMetric('requests_total', 'requests', 1, {
      format: metadata.requestFormat,
      model: params.model,
      success: metadata.success.toString(),
    });

    if (metadata.success && response) {
      recordBusinessMetric('tokens_used', 'completions', response.usage.total_tokens, {
        model: params.model,
        reasoning_effort: params.reasoning?.effort ?? 'none',
      });

      const reasoningTokens = response.usage.reasoning_tokens;
      if (typeof reasoningTokens === 'number' && reasoningTokens > 0) {
        recordBusinessMetric('reasoning_tokens_used', 'completions', reasoningTokens, {
          model: params.model,
          reasoning_effort: params.reasoning?.effort ?? 'none',
        });
      }
    }

    if (!metadata.success) {
      recordBusinessMetric('errors_total', 'errors', 1, {
        error_type: metadata.errorType ?? 'unknown',
        format: metadata.requestFormat,
      });
    }

    if (metadata.circuitBreakerUsed) {
      recordBusinessMetric('circuit_breaker_trips', 'errors', 1, {
        model: params.model,
      });
    }

    if (metadata.retryCount > 0) {
      recordBusinessMetric('retry_attempts', 'requests', metadata.retryCount, {
        model: params.model,
      });
    }

    if (metadata.fallbackUsed) {
      recordBusinessMetric('fallback_usage', 'requests', 1, {
        model: params.model,
      });
    }

    // Log structured request data (without sensitive information)
    logger.info('Azure Responses API request completed', metadata.correlationId, {
      model: params.model,
      requestFormat: metadata.requestFormat,
      responseFormat: metadata.responseFormat,
      reasoningEffort: params.reasoning?.effort,
      responseTime: metadata.responseTime,
      success: metadata.success,
      inputTokens: requestMetric.inputTokens,
      outputTokens: requestMetric.outputTokens,
      reasoningTokens: requestMetric.reasoningTokens,
      totalTokens: requestMetric.totalTokens,
      circuitBreakerUsed: metadata.circuitBreakerUsed,
      retryCount: metadata.retryCount,
      fallbackUsed: metadata.fallbackUsed,
      errorType: metadata.errorType,
    });
  }

  /**
   * Record a security event
   */
  public recordSecurityEvent(event: SecurityAuditLog): void {
    // Store security event
    this.securityEvents.push(event);
    if (this.securityEvents.length > this.maxSecurityEvents) {
      this.securityEvents.shift();
    }

    // Record security metrics
    recordBusinessMetric('security_events', 'authentication', 1, {
      event_type: event.eventType,
      client_type: event.clientInfo.clientType,
    });

    const hasUserAgent =
      typeof event.clientInfo.userAgent === 'string' && event.clientInfo.userAgent.length > 0;
    const hasIpAddress =
      typeof event.clientInfo.ipAddress === 'string' && event.clientInfo.ipAddress.length > 0;

    // Log security event (without sensitive data)
    logger.warn('Security event recorded', event.correlationId, {
      eventType: event.eventType,
      clientType: event.clientInfo.clientType,
      hasUserAgent,
      hasIpAddress,
      detailsCount: Object.keys(event.details).length,
    });
  }

  /**
   * Get comprehensive metrics
   */
  public getMetrics(): AzureResponsesMetrics {
    const totalRequests = this.requestMetrics.length;
    const successfulRequests = this.requestMetrics.filter(m => m.success);
    const failedRequests = this.requestMetrics.filter(m => !m.success);

    const totalResponseTime = this.requestMetrics.reduce((sum, m) => sum + m.responseTime, 0);
    const totalTokens = successfulRequests.reduce((sum, m) => sum + m.totalTokens, 0);
    const totalReasoningTokens = successfulRequests.reduce((sum, m) => sum + m.reasoningTokens, 0);

    // Calculate reasoning effort distribution
    const reasoningEffortDistributionMap = new Map<string, number>();
    for (const metric of this.requestMetrics) {
      const effortKey = metric.reasoningEffort ?? 'none';
      const currentCount = reasoningEffortDistributionMap.get(effortKey) ?? 0;
      reasoningEffortDistributionMap.set(effortKey, currentCount + 1);
    }
    const reasoningEffortDistribution = Object.fromEntries(
      reasoningEffortDistributionMap
    ) as Record<string, number>;

    // Calculate format distribution
    const formatDistribution: Record<RequestFormat, number> = { claude: 0, openai: 0 };
    for (const metric of this.requestMetrics) {
      if (metric.requestFormat === 'claude') {
        formatDistribution.claude += 1;
      } else {
        formatDistribution.openai += 1;
      }
    }

    // Calculate error distribution
    const errorDistributionMap = new Map<string, number>();
    for (const metric of failedRequests) {
      const errorType = metric.errorType ?? 'unknown';
      const currentCount = errorDistributionMap.get(errorType) ?? 0;
      errorDistributionMap.set(errorType, currentCount + 1);
    }
    const errorDistribution = Object.fromEntries(errorDistributionMap) as Record<string, number>;

    return {
      requestCount: totalRequests,
      successCount: successfulRequests.length,
      errorCount: failedRequests.length,
      averageResponseTime: totalRequests > 0 ? totalResponseTime / totalRequests : 0,
      totalTokensUsed: totalTokens,
      reasoningTokensUsed: totalReasoningTokens,
      averageReasoningTokens: successfulRequests.length > 0 ? totalReasoningTokens / successfulRequests.length : 0,
      reasoningEffortDistribution,
      formatDistribution,
      errorDistribution,
      circuitBreakerTrips: this.requestMetrics.filter(m => m.circuitBreakerUsed).length,
      retryAttempts: this.requestMetrics.reduce((sum, m) => sum + m.retryCount, 0),
      fallbackUsage: this.requestMetrics.filter(m => m.fallbackUsed).length,
    };
  }

  /**
   * Get security metrics
   */
  public getSecurityMetrics(): SecurityMetrics {
    const authAttempts = this.securityEvents.filter(e => e.eventType === 'authentication').length;
    const authFailures = this.securityEvents.filter(e => 
      e.eventType === 'authentication' && 
      e.details.result !== 'success'
    ).length;
    const rateLimitHits = this.securityEvents.filter(e => e.eventType === 'rate_limit').length;
    const suspiciousActivity = this.securityEvents.filter(e => e.eventType === 'suspicious_activity').length;
    const validationErrors = this.securityEvents.filter(e => e.eventType === 'validation').length;

    // Create event summaries
    const eventSummaries = new Map<string, SecurityEventSummary>();
    for (const event of this.securityEvents) {
      const existing = eventSummaries.get(event.eventType);
      if (existing) {
        eventSummaries.set(event.eventType, {
          ...existing,
          count: existing.count + 1,
          lastOccurrence: event.timestamp > existing.lastOccurrence ? event.timestamp : existing.lastOccurrence,
        });
      } else {
        eventSummaries.set(event.eventType, {
          eventType: event.eventType,
          count: 1,
          lastOccurrence: event.timestamp,
          severity: this.getEventSeverity(event.eventType),
        });
      }
    }

    return {
      authenticationAttempts: authAttempts,
      authenticationFailures: authFailures,
      rateLimitHits,
      suspiciousActivity,
      validationErrors,
      securityEvents: Array.from(eventSummaries.values()),
    };
  }

  /**
   * Get performance insights
   */
  public getPerformanceInsights(): {
    slowRequests: RequestMetrics[];
    highTokenUsage: RequestMetrics[];
    reasoningEfficiency: {
      effort: string;
      averageTokens: number;
      averageResponseTime: number;
      count: number;
    }[];
  } {
    const slowThreshold = 5000; // 5 seconds
    const highTokenThreshold = 4000; // 4k tokens

    const slowRequests = this.requestMetrics
      .filter(m => m.responseTime > slowThreshold)
      .sort((a, b) => b.responseTime - a.responseTime)
      .slice(0, 10);

    const highTokenUsage = this.requestMetrics
      .filter(m => m.totalTokens > highTokenThreshold)
      .sort((a, b) => b.totalTokens - a.totalTokens)
      .slice(0, 10);

    // Calculate reasoning efficiency by effort level
    const reasoningEfforts = new Map<string, { totalTokens: number; totalTime: number; count: number }>();
    
    for (const metric of this.requestMetrics.filter(m => m.success && m.reasoningTokens > 0)) {
      const effort = metric.reasoningEffort ?? 'none';
      const existing = reasoningEfforts.get(effort) ?? { totalTokens: 0, totalTime: 0, count: 0 };
      
      reasoningEfforts.set(effort, {
        totalTokens: existing.totalTokens + metric.reasoningTokens,
        totalTime: existing.totalTime + metric.responseTime,
        count: existing.count + 1,
      });
    }

    const reasoningEfficiency = Array.from(reasoningEfforts.entries()).map(([effort, data]) => ({
      effort,
      averageTokens: data.count > 0 ? data.totalTokens / data.count : 0,
      averageResponseTime: data.count > 0 ? data.totalTime / data.count : 0,
      count: data.count,
    }));

    return {
      slowRequests,
      highTokenUsage,
      reasoningEfficiency,
    };
  }

  /**
   * Start continuous monitoring
   */
  public startMonitoring(intervalMs: number = 60000): void {
    if (this.monitoringInterval) {
      return;
    }

    this.monitoringInterval = setInterval(() => {
      this.logPeriodicMetrics();
    }, intervalMs);

    logger.info('Azure Responses API monitoring started', '', {
      intervalMs,
    });
  }

  /**
   * Stop monitoring
   */
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    logger.info('Azure Responses API monitoring stopped', '');
  }

  /**
   * Clear all metrics
   */
  public clearMetrics(): void {
    this.requestMetrics.length = 0;
    this.securityEvents.length = 0;
    
    logger.info('Azure Responses API metrics cleared', '');
  }

  /**
   * Log periodic metrics summary
   */
  private logPeriodicMetrics(): void {
    const metrics = this.getMetrics();
    const securityMetrics = this.getSecurityMetrics();

    logger.info('Azure Responses API periodic metrics', '', {
      requests: {
        total: metrics.requestCount,
        successful: metrics.successCount,
        failed: metrics.errorCount,
        successRate: metrics.requestCount > 0 ? (metrics.successCount / metrics.requestCount * 100).toFixed(1) + '%' : '0%',
      },
      performance: {
        averageResponseTime: Math.round(metrics.averageResponseTime),
        circuitBreakerTrips: metrics.circuitBreakerTrips,
        retryAttempts: metrics.retryAttempts,
        fallbackUsage: metrics.fallbackUsage,
      },
      tokens: {
        total: metrics.totalTokensUsed,
        reasoning: metrics.reasoningTokensUsed,
        averageReasoning: Math.round(metrics.averageReasoningTokens),
        reasoningPercentage: metrics.totalTokensUsed > 0 ? (metrics.reasoningTokensUsed / metrics.totalTokensUsed * 100).toFixed(1) + '%' : '0%',
      },
      formats: metrics.formatDistribution,
      reasoningEfforts: metrics.reasoningEffortDistribution,
      security: {
        authAttempts: securityMetrics.authenticationAttempts,
        authFailures: securityMetrics.authenticationFailures,
        rateLimitHits: securityMetrics.rateLimitHits,
        suspiciousActivity: securityMetrics.suspiciousActivity,
      },
    });

    // Log warnings for concerning metrics
    if (metrics.errorCount > metrics.successCount) {
      logger.warn('High error rate detected', '', {
        errorRate: (metrics.errorCount / metrics.requestCount * 100).toFixed(1) + '%',
        errorDistribution: metrics.errorDistribution,
      });
    }

    if (metrics.averageResponseTime > 10000) {
      logger.warn('High average response time detected', '', {
        averageResponseTime: Math.round(metrics.averageResponseTime),
      });
    }

    if (securityMetrics.authenticationFailures > 10) {
      logger.warn('High authentication failure rate detected', '', {
        failures: securityMetrics.authenticationFailures,
        attempts: securityMetrics.authenticationAttempts,
      });
    }
  }

  /**
   * Get event severity level
   */
  private getEventSeverity(eventType: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (eventType) {
      case 'suspicious_activity':
        return 'high';
      case 'authentication':
        return 'medium';
      case 'rate_limit':
        return 'medium';
      case 'validation':
        return 'low';
      default:
        return 'low';
    }
  }
}

/**
 * Health check endpoint data
 */
export interface HealthCheckData {
  readonly status: 'healthy' | 'unhealthy' | 'degraded';
  readonly timestamp: string;
  readonly uptime: number;
  readonly version: string;
  readonly environment: string;
  readonly services: {
    readonly azureOpenAI: {
      readonly status: 'connected' | 'disconnected' | 'degraded';
      readonly responseTime?: number;
      readonly lastCheck: string;
    };
    readonly circuitBreakers: Record<string, {
      readonly status: 'closed' | 'open' | 'half_open';
      readonly failureCount: number;
      readonly lastFailure?: string;
    }>;
  };
  readonly metrics: {
    readonly requests: {
      readonly total: number;
      readonly successful: number;
      readonly failed: number;
      readonly averageResponseTime: number;
    };
    readonly tokens: {
      readonly total: number;
      readonly reasoning: number;
    };
    readonly memory: {
      readonly used: number;
      readonly total: number;
      readonly percentage: number;
    };
  };
}

/**
 * Create health check endpoint handler
 */
export function createHealthCheckHandler() {
  const monitor = AzureResponsesMonitor.getInstance();
  const startTime = Date.now();

  return (): HealthCheckData => {
    const metrics = monitor.getMetrics();
    const memoryUsage = process.memoryUsage();
    const uptime = (Date.now() - startTime) / 1000;

    // Determine overall health status
    let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    
    if (metrics.errorCount > metrics.successCount && metrics.requestCount > 10) {
      status = 'unhealthy';
    } else if (metrics.circuitBreakerTrips > 0 || metrics.fallbackUsage > 0) {
      status = 'degraded';
    }

    const memoryPercentage = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    if (memoryPercentage > 90) {
      status = 'unhealthy';
    } else if (memoryPercentage > 80) {
      status = status === 'healthy' ? 'degraded' : status;
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime,
      version: process.env.npm_package_version ?? '1.0.0',
      environment: process.env.NODE_ENV ?? 'development',
      services: {
        azureOpenAI: {
          status: metrics.errorCount === 0 ? 'connected' : 'degraded',
          responseTime: metrics.averageResponseTime,
          lastCheck: new Date().toISOString(),
        },
        circuitBreakers: {}, // Would be populated with actual circuit breaker states
      },
      metrics: {
        requests: {
          total: metrics.requestCount,
          successful: metrics.successCount,
          failed: metrics.errorCount,
          averageResponseTime: metrics.averageResponseTime,
        },
        tokens: {
          total: metrics.totalTokensUsed,
          reasoning: metrics.reasoningTokensUsed,
        },
        memory: {
          used: memoryUsage.heapUsed,
          total: memoryUsage.heapTotal,
          percentage: memoryPercentage,
        },
      },
    };
  };
}

// Export singleton instance
export const azureResponsesMonitor = AzureResponsesMonitor.getInstance();
