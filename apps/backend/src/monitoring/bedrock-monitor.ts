/**
 * @fileoverview AWS Bedrock monitoring and metrics collection.
 *
 * This module provides comprehensive monitoring capabilities for AWS Bedrock
 * integration, including request tracking, performance metrics, and health
 * status validation. It follows the same patterns as Azure OpenAI monitoring
 * for consistency.
 *
 * @author Claude-to-Azure Proxy Team
 * @version 2.0.0
 * @since 1.0.0
 */

import axios, { type AxiosInstance } from 'axios';
import { ConfigurationError } from '../errors/index';
import { logger } from '../middleware/logging';
import type { AWSBedrockConfig, HealthCheckResult } from '../types/index';
import { createTimer, metricsCollector } from './metrics';

/**
 * Bedrock-specific metrics interface for tracking service performance.
 *
 * @public
 * @interface BedrockMetrics
 */
export interface BedrockMetrics {
  /** Total number of requests made to Bedrock */
  readonly requestCount: number;
  /** Average response time in milliseconds */
  readonly averageLatency: number;
  /** Error rate as percentage (0-100) */
  readonly errorRate: number;
  /** Total number of successful requests */
  readonly successCount: number;
  /** Total number of failed requests */
  readonly errorCount: number;
  /** Last request timestamp */
  readonly lastRequestTime?: string;
  /** Service availability status */
  readonly serviceStatus: 'available' | 'degraded' | 'unavailable';
}

/**
 * Bedrock request tracking data for correlation and analysis.
 *
 * @public
 * @interface BedrockRequestTracker
 */
export interface BedrockRequestTracker {
  /** Unique correlation ID for request tracing */
  readonly correlationId: string;
  /** Service identifier for distinguishing from Azure OpenAI */
  readonly serviceId: 'bedrock';
  /** Requested model name */
  readonly model: string;
  /** Request start timestamp */
  readonly startTime: number;
  /** Request end timestamp (set when completed) */
  readonly endTime?: number;
  /** Request duration in milliseconds */
  readonly duration?: number;
  /** Whether the request was successful */
  readonly success?: boolean;
  /** Error type if request failed */
  readonly errorType?: string;
  /** Request type (streaming or non-streaming) */
  readonly requestType: 'streaming' | 'non-streaming';
}

/**
 * AWS Bedrock monitoring class with comprehensive tracking capabilities.
 *
 * @public
 * @class BedrockMonitor
 */
export class BedrockMonitor {
  private readonly config: AWSBedrockConfig;
  private readonly requestTrackers: Map<string, BedrockRequestTracker> =
    new Map();
  private readonly metrics: BedrockMetrics;
  private axiosInstance?: AxiosInstance;
  private healthCheckInitialized = false;

  /**
   * Creates a new Bedrock monitor instance.
   *
   * @param config - AWS Bedrock configuration
   */
  constructor(config: AWSBedrockConfig) {
    this.config = config;
    this.metrics = {
      requestCount: 0,
      averageLatency: 0,
      errorRate: 0,
      successCount: 0,
      errorCount: 0,
      serviceStatus: 'available',
    };
  }

  /**
   * Tracks a Bedrock request with distinct correlation ID and service identifier.
   * Requirement 4.1: Add Bedrock-specific request tracking with distinct correlation IDs and service identifiers
   *
   * @param correlationId - Unique correlation ID for request tracing
   * @param model - Requested model name
   * @param requestType - Type of request (streaming or non-streaming)
   */
  public trackBedrockRequest(
    correlationId: string,
    model: string,
    requestType: 'streaming' | 'non-streaming'
  ): void {
    const tracker: BedrockRequestTracker = {
      correlationId,
      serviceId: 'bedrock',
      model,
      startTime: Date.now(),
      requestType,
    };

    this.requestTrackers.set(correlationId, tracker);

    // Log request start with service identifier (Requirement 4.1)
    logger.info('Bedrock request started', correlationId, {
      serviceId: 'bedrock',
      model,
      requestType,
      timestamp: new Date().toISOString(),
    });

    // Record business metric for request tracking
    metricsCollector.recordBusiness({
      name: 'bedrock_request_started',
      value: 1,
      timestamp: new Date().toISOString(),
      category: 'requests',
      count: 1,
      tags: {
        service: 'bedrock',
        model,
        requestType,
      },
    });
  }

  /**
   * Completes a Bedrock request tracking with performance metrics.
   * Requirement 4.2: Implement separate performance metrics collection for AWS Bedrock vs Azure OpenAI
   *
   * @param correlationId - Request correlation ID
   * @param success - Whether the request was successful
   * @param errorType - Error type if request failed
   */
  public completeBedrockRequest(
    correlationId: string,
    success: boolean,
    errorType?: string
  ): void {
    const tracker = this.requestTrackers.get(correlationId);
    if (!tracker) {
      logger.warn('Bedrock request tracker not found', correlationId, {
        serviceId: 'bedrock',
      });
      return;
    }

    const endTime = Date.now();
    const duration = endTime - tracker.startTime;

    // Update tracker with completion data
    const completedTracker: BedrockRequestTracker = {
      ...tracker,
      endTime,
      duration,
      success,
      errorType,
    };

    this.requestTrackers.set(correlationId, completedTracker);

    // Update metrics (Requirement 4.2)
    this.updateMetrics(duration, success);

    // Log request completion with structured data (Requirement 4.4)
    logger.info('Bedrock request completed', correlationId, {
      serviceId: 'bedrock',
      model: tracker.model,
      requestType: tracker.requestType,
      duration,
      success,
      errorType,
      timestamp: new Date().toISOString(),
    });

    // Record performance metric with service distinction (Requirement 4.2)
    // Simulate timer completion with actual duration
    const performanceMetric = {
      name: 'bedrock_request',
      value: duration,
      timestamp: new Date().toISOString(),
      duration,
      success,
      errorType,
      correlationId,
      unit: 'ms' as const,
    };
    metricsCollector.recordPerformance(performanceMetric);

    // Record business metric for completion
    metricsCollector.recordBusiness({
      name: success ? 'bedrock_request_success' : 'bedrock_request_error',
      value: 1,
      timestamp: new Date().toISOString(),
      category: success ? 'completions' : 'errors',
      count: 1,
      tags: {
        service: 'bedrock',
        model: tracker.model,
        requestType: tracker.requestType,
        ...(errorType !== undefined && errorType !== '' ? { errorType } : {}),
      },
    });

    // Clean up completed tracker after a delay to allow for metrics collection
    setTimeout(() => {
      this.requestTrackers.delete(correlationId);
    }, 60000); // Keep for 1 minute for debugging
  }

  /**
   * Gets current Bedrock metrics with service distinction.
   * Requirement 4.5: Create metrics endpoints that distinguish between Azure and Bedrock usage
   *
   * @returns Current Bedrock metrics
   */
  public getBedrockMetrics(): BedrockMetrics {
    return { ...this.metrics };
  }

  /**
   * Checks AWS Bedrock service health status.
   * Requirement 4.3: Extend health check endpoint to include AWS Bedrock service status validation
   *
   * @returns Bedrock health status
   */
  public async checkBedrockHealth(): Promise<HealthCheckResult['awsBedrock']> {
    try {
      this.initializeHealthClient();

      if (!this.axiosInstance) {
        return {
          status: 'disconnected',
        };
      }

      const startTime = Date.now();

      // Use a simple model list request for health check
      // This is a lightweight operation that validates connectivity and authentication
      const response = await this.axiosInstance.get('/foundation-models', {
        timeout: 5000, // 5 second timeout for health check
        headers: {
          Accept: 'application/json',
        },
      });

      const responseTime = Date.now() - startTime;

      if (response.status === 200) {
        this.updateServiceStatus('available');
        return {
          status: 'connected',
          responseTime,
        };
      }

      this.updateServiceStatus('degraded');
      return { status: 'disconnected' };
    } catch (error) {
      this.updateServiceStatus('unavailable');

      // Log health check failure without exposing sensitive data (Requirement 4.4)
      logger.warn('Bedrock health check failed', '', {
        serviceId: 'bedrock',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });

      return { status: 'disconnected' };
    }
  }

  /**
   * Gets active request trackers for monitoring purposes.
   *
   * @returns Map of active request trackers
   */
  public getActiveRequests(): ReadonlyMap<string, BedrockRequestTracker> {
    return new Map(this.requestTrackers);
  }

  /**
   * Clears completed request trackers and resets metrics.
   */
  public clearMetrics(): void {
    this.requestTrackers.clear();
    Object.assign(this.metrics, {
      requestCount: 0,
      averageLatency: 0,
      errorRate: 0,
      successCount: 0,
      errorCount: 0,
      lastRequestTime: undefined,
      serviceStatus: 'available' as const,
    });

    logger.info('Bedrock metrics cleared', '', {
      serviceId: 'bedrock',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Updates internal metrics with new request data.
   *
   * @private
   * @param duration - Request duration in milliseconds
   * @param success - Whether the request was successful
   */
  private updateMetrics(duration: number, success: boolean): void {
    const newRequestCount = this.metrics.requestCount + 1;
    const newSuccessCount = success
      ? this.metrics.successCount + 1
      : this.metrics.successCount;
    const newErrorCount = success
      ? this.metrics.errorCount
      : this.metrics.errorCount + 1;

    // Calculate new average latency
    const totalLatency =
      this.metrics.averageLatency * this.metrics.requestCount + duration;
    const newAverageLatency = totalLatency / newRequestCount;

    // Calculate new error rate
    const newErrorRate = (newErrorCount / newRequestCount) * 100;

    // Update service status based on error rate
    let serviceStatus: BedrockMetrics['serviceStatus'] = 'available';
    if (newErrorRate > 50) {
      serviceStatus = 'unavailable';
    } else if (newErrorRate > 10) {
      serviceStatus = 'degraded';
    }

    Object.assign(this.metrics, {
      requestCount: newRequestCount,
      averageLatency: newAverageLatency,
      errorRate: newErrorRate,
      successCount: newSuccessCount,
      errorCount: newErrorCount,
      lastRequestTime: new Date().toISOString(),
      serviceStatus,
    });
  }

  /**
   * Updates service status.
   *
   * @private
   * @param status - New service status
   */
  private updateServiceStatus(status: BedrockMetrics['serviceStatus']): void {
    if (this.metrics.serviceStatus !== status) {
      logger.info('Bedrock service status changed', '', {
        serviceId: 'bedrock',
        previousStatus: this.metrics.serviceStatus,
        newStatus: status,
        timestamp: new Date().toISOString(),
      });

      Object.assign(this.metrics, { serviceStatus: status });
    }
  }

  /**
   * Initializes the health check HTTP client.
   *
   * @private
   */
  private initializeHealthClient(): void {
    if (this.healthCheckInitialized) {
      return;
    }

    this.healthCheckInitialized = true;

    try {
      if (
        this.config.baseURL.length === 0 ||
        !this.config.baseURL.startsWith('https://')
      ) {
        throw new ConfigurationError(
          'Bedrock endpoint must use HTTPS',
          'bedrock-health-init',
          'bedrock_health_initialization'
        );
      }

      this.axiosInstance = axios.create({
        baseURL: this.config.baseURL,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'claude-to-azure-proxy/2.0.0',
          'X-Amzn-Bedrock-Region': this.config.region,
        },
      });
    } catch (error) {
      this.axiosInstance = undefined;
      logger.warn('Failed to initialize Bedrock health client', '', {
        serviceId: 'bedrock',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * Utility function to create a Bedrock performance timer.
 *
 * @param operationName - Name of the Bedrock operation being timed
 * @param correlationId - Request correlation ID
 * @returns New performance timer instance
 *
 * @example
 * ```typescript
 * const timer = createBedrockTimer('converse_request', correlationId);
 * // ... perform Bedrock operation ...
 * timer.stop(true); // success = true
 * ```
 */
export function createBedrockTimer(
  operationName: string,
  correlationId: string
): ReturnType<typeof createTimer> {
  return createTimer(`bedrock_${operationName}`, correlationId);
}

/**
 * Utility function to record a Bedrock business metric.
 *
 * @param name - Metric name
 * @param category - Metric category
 * @param count - Counter value
 * @param tags - Optional metadata tags including service identifier
 *
 * @example
 * ```typescript
 * recordBedrockBusinessMetric('model_requests', 'requests', 1, {
 *   model: 'qwen-3-coder',
 *   requestType: 'streaming'
 * });
 * ```
 */
export function recordBedrockBusinessMetric(
  name: string,
  category: 'requests' | 'completions' | 'authentication' | 'errors',
  count: number,
  tags?: Record<string, string>
): void {
  metricsCollector.recordBusiness({
    name: `bedrock_${name}`,
    value: count,
    timestamp: new Date().toISOString(),
    category,
    count,
    tags: {
      service: 'bedrock',
      ...tags,
    },
  });
}
