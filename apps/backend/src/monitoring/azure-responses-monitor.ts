/**
 * Enhanced monitoring and logging for Azure OpenAI Responses API
 * Provides comprehensive tracking of reasoning token usage, performance metrics,
 * and security events without exposing sensitive data
 */

import { logger } from '../middleware/logging';
import type {
  RequestFormat,
  ResponseFormat,
  ResponsesCreateParams,
  ResponsesResponse,
  SecurityAuditLog,
} from '../types/index';
import { recordBusinessMetric } from './metrics';

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

type RequestMetadata = {
  correlationId: string;
  requestFormat: RequestFormat;
  responseFormat: ResponseFormat;
  responseTime: number;
  success: boolean;
  errorType?: string;
  circuitBreakerUsed: boolean;
  retryCount: number;
  fallbackUsed: boolean;
};

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
    metadata: RequestMetadata
  ): void {
    const requestMetric = this.buildRequestMetric(params, response, metadata);

    this.storeRequestMetric(requestMetric);
    this.recordUsageMetrics(params, response, metadata);
    this.recordReliabilityMetrics(params.model, metadata);
    this.logRequestOutcome(requestMetric, params, metadata);
  }

  private buildRequestMetric(
    params: ResponsesCreateParams,
    response: ResponsesResponse | null,
    metadata: RequestMetadata
  ): RequestMetrics {
    return {
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
  }

  private storeRequestMetric(requestMetric: RequestMetrics): void {
    this.requestMetrics.push(requestMetric);
    if (this.requestMetrics.length > this.maxMetricsHistory) {
      this.requestMetrics.shift();
    }
  }

  private recordUsageMetrics(
    params: ResponsesCreateParams,
    response: ResponsesResponse | null,
    metadata: RequestMetadata
  ): void {
    recordBusinessMetric('requests_total', 'requests', 1, {
      format: metadata.requestFormat,
      model: params.model,
      success: metadata.success.toString(),
    });

    if (!metadata.success || response === null) {
      return;
    }

    const reasoningEffort = params.reasoning?.effort ?? 'none';
    recordBusinessMetric('tokens_used', 'completions', response.usage.total_tokens, {
      model: params.model,
      reasoning_effort: reasoningEffort,
    });

    const reasoningTokens = response.usage.reasoning_tokens;
    if (typeof reasoningTokens === 'number' && reasoningTokens > 0) {
      recordBusinessMetric(
        'reasoning_tokens_used',
        'completions',
        reasoningTokens,
        {
          model: params.model,
          reasoning_effort: reasoningEffort,
        }
      );
    }
  }

  private recordReliabilityMetrics(model: string, metadata: RequestMetadata): void {
    if (!metadata.success) {
      recordBusinessMetric('errors_total', 'errors', 1, {
        error_type: metadata.errorType ?? 'unknown',
        format: metadata.requestFormat,
      });
    }

    if (metadata.circuitBreakerUsed) {
      recordBusinessMetric('circuit_breaker_trips', 'errors', 1, {
        model,
      });
    }

    if (metadata.retryCount > 0) {
      recordBusinessMetric('retry_attempts', 'requests', metadata.retryCount, {
        model,
      });
    }

    if (metadata.fallbackUsed) {
      recordBusinessMetric('fallback_usage', 'requests', 1, {
        model,
      });
    }
  }

  private logRequestOutcome(
    requestMetric: RequestMetrics,
    params: ResponsesCreateParams,
    metadata: RequestMetadata
  ): void {
    logger.info(
      'Azure Responses API request completed',
      metadata.correlationId,
      {
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
      }
    );
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
      typeof event.clientInfo.userAgent === 'string' &&
      event.clientInfo.userAgent.length > 0;
    const hasIpAddress =
      typeof event.clientInfo.ipAddress === 'string' &&
      event.clientInfo.ipAddress.length > 0;

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
    const summary = this.summarizeRequestMetrics();
    const reasoningEffortDistribution = this.buildDistributionFromMetrics(
      this.requestMetrics,
      (metric) => metric.reasoningEffort ?? 'none'
    );
    const formatDistribution = this.buildDistributionFromMetrics(
      this.requestMetrics,
      (metric) => metric.requestFormat
    ) as Record<RequestFormat, number>;
    const errorDistribution = this.buildDistributionFromMetrics(
      this.requestMetrics.filter((metric) => !metric.success),
      (metric) => metric.errorType ?? 'unknown'
    );

    return {
      requestCount: summary.totalRequests,
      successCount: summary.successCount,
      errorCount: summary.errorCount,
      averageResponseTime:
        summary.totalRequests > 0
          ? summary.totalResponseTime / summary.totalRequests
          : 0,
      totalTokensUsed: summary.totalTokens,
      reasoningTokensUsed: summary.totalReasoningTokens,
      averageReasoningTokens:
        summary.successCount > 0
          ? summary.totalReasoningTokens / summary.successCount
          : 0,
      reasoningEffortDistribution,
      formatDistribution,
      errorDistribution,
      circuitBreakerTrips: summary.circuitBreakerTrips,
      retryAttempts: summary.retryAttempts,
      fallbackUsage: summary.fallbackUsage,
    };
  }

  private summarizeRequestMetrics(): {
    totalRequests: number;
    successCount: number;
    errorCount: number;
    totalResponseTime: number;
    totalTokens: number;
    totalReasoningTokens: number;
    circuitBreakerTrips: number;
    retryAttempts: number;
    fallbackUsage: number;
  } {
    return this.requestMetrics.reduce(
      (acc, metric) => {
        acc.totalRequests += 1;
        acc.totalResponseTime += metric.responseTime;
        acc.retryAttempts += metric.retryCount;

        if (metric.circuitBreakerUsed) {
          acc.circuitBreakerTrips += 1;
        }

        if (metric.fallbackUsed) {
          acc.fallbackUsage += 1;
        }

        if (metric.success) {
          acc.successCount += 1;
          acc.totalTokens += metric.totalTokens;
          acc.totalReasoningTokens += metric.reasoningTokens;
        } else {
          acc.errorCount += 1;
        }

        return acc;
      },
      {
        totalRequests: 0,
        successCount: 0,
        errorCount: 0,
        totalResponseTime: 0,
        totalTokens: 0,
        totalReasoningTokens: 0,
        circuitBreakerTrips: 0,
        retryAttempts: 0,
        fallbackUsage: 0,
      }
    );
  }

  private buildDistributionFromMetrics(
    metrics: RequestMetrics[],
    selector: (metric: RequestMetrics) => string
  ): Record<string, number> {
    return metrics.reduce((acc, metric) => {
      const key = selector(metric);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Get security metrics
   */
  public getSecurityMetrics(): SecurityMetrics {
    const authAttempts = this.securityEvents.filter(
      (e) => e.eventType === 'authentication'
    ).length;
    const authFailures = this.securityEvents.filter(
      (e) => e.eventType === 'authentication' && e.details.result !== 'success'
    ).length;
    const rateLimitHits = this.securityEvents.filter(
      (e) => e.eventType === 'rate_limit'
    ).length;
    const suspiciousActivity = this.securityEvents.filter(
      (e) => e.eventType === 'suspicious_activity'
    ).length;
    const validationErrors = this.securityEvents.filter(
      (e) => e.eventType === 'validation'
    ).length;

    // Create event summaries
    const eventSummaries = new Map<string, SecurityEventSummary>();
    for (const event of this.securityEvents) {
      const existing = eventSummaries.get(event.eventType);
      if (existing) {
        eventSummaries.set(event.eventType, {
          ...existing,
          count: existing.count + 1,
          lastOccurrence:
            event.timestamp > existing.lastOccurrence
              ? event.timestamp
              : existing.lastOccurrence,
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
      .filter((m) => m.responseTime > slowThreshold)
      .sort((a, b) => b.responseTime - a.responseTime)
      .slice(0, 10);

    const highTokenUsage = this.requestMetrics
      .filter((m) => m.totalTokens > highTokenThreshold)
      .sort((a, b) => b.totalTokens - a.totalTokens)
      .slice(0, 10);

    // Calculate reasoning efficiency by effort level
    const reasoningEfforts = new Map<
      string,
      { totalTokens: number; totalTime: number; count: number }
    >();

    for (const metric of this.requestMetrics.filter(
      (m) => m.success && m.reasoningTokens > 0
    )) {
      const effort = metric.reasoningEffort ?? 'none';
      const existing = reasoningEfforts.get(effort) ?? {
        totalTokens: 0,
        totalTime: 0,
        count: 0,
      };

      reasoningEfforts.set(effort, {
        totalTokens: existing.totalTokens + metric.reasoningTokens,
        totalTime: existing.totalTime + metric.responseTime,
        count: existing.count + 1,
      });
    }

    const reasoningEfficiency = Array.from(reasoningEfforts.entries()).map(
      ([effort, data]) => ({
        effort,
        averageTokens: data.count > 0 ? data.totalTokens / data.count : 0,
        averageResponseTime: data.count > 0 ? data.totalTime / data.count : 0,
        count: data.count,
      })
    );

    return {
      slowRequests,
      highTokenUsage,
      reasoningEfficiency,
    };
  }

  /**
   * Start continuous monitoring
   */
  public startMonitoring(intervalMs = 60000): void {
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
        successRate:
          metrics.requestCount > 0
            ? `${((metrics.successCount / metrics.requestCount) * 100).toFixed(1)}%`
            : '0%',
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
        reasoningPercentage:
          metrics.totalTokensUsed > 0
            ? `${(
                (metrics.reasoningTokensUsed / metrics.totalTokensUsed) *
                100
              ).toFixed(1)}%`
            : '0%',
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
        errorRate: `${((metrics.errorCount / metrics.requestCount) * 100).toFixed(1)}%`,
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
  private getEventSeverity(
    eventType: string
  ): 'low' | 'medium' | 'high' | 'critical' {
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
    readonly circuitBreakers: Record<
      string,
      {
        readonly status: 'closed' | 'open' | 'half_open';
        readonly failureCount: number;
        readonly lastFailure?: string;
      }
    >;
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

const determineHealthStatus = (
  metrics: AzureResponsesMetrics,
  memoryPercentage: number
): 'healthy' | 'unhealthy' | 'degraded' => {
  if (
    (metrics.errorCount > metrics.successCount && metrics.requestCount > 10) ||
    memoryPercentage > 90
  ) {
    return 'unhealthy';
  }

  if (
    metrics.circuitBreakerTrips > 0 ||
    metrics.fallbackUsage > 0 ||
    memoryPercentage > 80
  ) {
    return 'degraded';
  }

  return 'healthy';
};

const buildServiceStatus = (
  metrics: AzureResponsesMetrics
): HealthCheckData['services'] => ({
  azureOpenAI: {
    status: metrics.errorCount === 0 ? 'connected' : 'degraded',
    responseTime: metrics.averageResponseTime,
    lastCheck: new Date().toISOString(),
  },
  circuitBreakers: {},
});

const buildMetricsSnapshot = (
  metrics: AzureResponsesMetrics,
  memoryUsage: NodeJS.MemoryUsage,
  memoryPercentage: number
): HealthCheckData['metrics'] => ({
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
});

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
    const memoryPercentage =
      (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    const status = determineHealthStatus(metrics, memoryPercentage);

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime,
      version: process.env.npm_package_version ?? '1.0.0',
      environment: process.env.NODE_ENV ?? 'development',
      services: buildServiceStatus(metrics),
      metrics: buildMetricsSnapshot(metrics, memoryUsage, memoryPercentage),
    };
  };
}

// Export singleton instance
export const azureResponsesMonitor = AzureResponsesMonitor.getInstance();
