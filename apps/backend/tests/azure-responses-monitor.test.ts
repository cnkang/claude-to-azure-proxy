/**
 * Tests for Azure Responses API monitoring functionality
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  AzureResponsesMonitor,
  createHealthCheckHandler,
} from '../src/monitoring/azure-responses-monitor';
import type {
  ResponsesCreateParams,
  ResponsesResponse,
  SecurityAuditLog,
} from '../src/types/index';

// Mock logger
vi.mock('../src/middleware/logging.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock metrics collector
vi.mock('../src/monitoring/metrics.js', () => ({
  metricsCollector: {
    recordBusiness: vi.fn(),
  },
  createTimer: vi.fn(),
  recordBusinessMetric: vi.fn(),
}));

describe('AzureResponsesMonitor', () => {
  let monitor: AzureResponsesMonitor;

  beforeEach(() => {
    monitor = AzureResponsesMonitor.getInstance();
    monitor.clearMetrics(); // Start with clean state
  });

  afterEach(() => {
    vi.clearAllMocks();
    monitor.stopMonitoring();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = AzureResponsesMonitor.getInstance();
      const instance2 = AzureResponsesMonitor.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('recordRequest', () => {
    const mockParams: ResponsesCreateParams = {
      model: 'claude-3-5-sonnet-20241022',
      input: 'Test message',
      max_output_tokens: 1000,
      reasoning: { effort: 'medium' },
    };

    const mockResponse: ResponsesResponse = {
      id: 'resp_123',
      object: 'response',
      created: Date.now(),
      model: 'claude-3-5-sonnet-20241022',
      output: [
        { type: 'text', text: 'Test response' },
        {
          type: 'reasoning',
          reasoning: { content: 'Test reasoning', status: 'completed' },
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
        reasoning_tokens: 15,
      },
    };

    const mockMetadata = {
      correlationId: 'test-correlation-id',
      requestFormat: 'claude' as const,
      responseFormat: 'claude' as const,
      responseTime: 1500,
      success: true,
      circuitBreakerUsed: false,
      retryCount: 0,
      fallbackUsed: false,
    };

    it('should record successful request', () => {
      monitor.recordRequest(mockParams, mockResponse, mockMetadata);

      const metrics = monitor.getMetrics();
      expect(metrics.requestCount).toBe(1);
      expect(metrics.successCount).toBe(1);
      expect(metrics.errorCount).toBe(0);
      expect(metrics.totalTokensUsed).toBe(30);
      expect(metrics.reasoningTokensUsed).toBe(15);
      expect(metrics.averageResponseTime).toBe(1500);
    });

    it('should record failed request', () => {
      const failedMetadata = {
        ...mockMetadata,
        success: false,
        errorType: 'rate_limit_error',
      };

      monitor.recordRequest(mockParams, null, failedMetadata);

      const metrics = monitor.getMetrics();
      expect(metrics.requestCount).toBe(1);
      expect(metrics.successCount).toBe(0);
      expect(metrics.errorCount).toBe(1);
      expect(metrics.errorDistribution['rate_limit_error']).toBe(1);
    });

    it('should track reasoning effort distribution', () => {
      // Record requests with different reasoning efforts
      monitor.recordRequest(mockParams, mockResponse, mockMetadata);

      const highEffortParams = {
        ...mockParams,
        reasoning: { effort: 'high' as const },
      };
      monitor.recordRequest(highEffortParams, mockResponse, mockMetadata);

      const noReasoningParams = { ...mockParams, reasoning: undefined };
      monitor.recordRequest(noReasoningParams, mockResponse, mockMetadata);

      const metrics = monitor.getMetrics();
      expect(metrics.reasoningEffortDistribution['medium']).toBe(1);
      expect(metrics.reasoningEffortDistribution['high']).toBe(1);
      expect(metrics.reasoningEffortDistribution['none']).toBe(1);
    });

    it('should track format distribution', () => {
      monitor.recordRequest(mockParams, mockResponse, mockMetadata);

      const openaiMetadata = {
        ...mockMetadata,
        requestFormat: 'openai' as const,
      };
      monitor.recordRequest(mockParams, mockResponse, openaiMetadata);

      const metrics = monitor.getMetrics();
      expect(metrics.formatDistribution['claude']).toBe(1);
      expect(metrics.formatDistribution['openai']).toBe(1);
    });

    it('should track circuit breaker and retry usage', () => {
      const retryMetadata = {
        ...mockMetadata,
        circuitBreakerUsed: true,
        retryCount: 2,
        fallbackUsed: true,
      };

      monitor.recordRequest(mockParams, mockResponse, retryMetadata);

      const metrics = monitor.getMetrics();
      expect(metrics.circuitBreakerTrips).toBe(1);
      expect(metrics.retryAttempts).toBe(2);
      expect(metrics.fallbackUsage).toBe(1);
    });

    it('should maintain metrics history limit', () => {
      // Record more than the max history limit
      for (let i = 0; i < 1100; i++) {
        monitor.recordRequest(mockParams, mockResponse, {
          ...mockMetadata,
          correlationId: `test-${i}`,
        });
      }

      const metrics = monitor.getMetrics();
      // Should not exceed the limit
      expect(metrics.requestCount).toBeLessThanOrEqual(1000);
    });
  });

  describe('recordSecurityEvent', () => {
    const mockSecurityEvent: SecurityAuditLog = {
      timestamp: new Date().toISOString(),
      correlationId: 'test-correlation-id',
      eventType: 'authentication',
      clientInfo: {
        userAgent: 'test-agent',
        ipAddress: '127.0.0.1',
        clientType: 'unknown',
      },
      details: {
        result: 'failure',
        reason: 'invalid_credentials',
      },
    };

    it('should record security event', () => {
      monitor.recordSecurityEvent(mockSecurityEvent);

      const securityMetrics = monitor.getSecurityMetrics();
      expect(securityMetrics.authenticationAttempts).toBe(1);
      expect(securityMetrics.authenticationFailures).toBe(1);
    });

    it('should track different event types', () => {
      monitor.recordSecurityEvent(mockSecurityEvent);

      const rateLimitEvent = {
        ...mockSecurityEvent,
        eventType: 'rate_limit' as const,
      };
      monitor.recordSecurityEvent(rateLimitEvent);

      const suspiciousEvent = {
        ...mockSecurityEvent,
        eventType: 'suspicious_activity' as const,
      };
      monitor.recordSecurityEvent(suspiciousEvent);

      const securityMetrics = monitor.getSecurityMetrics();
      expect(securityMetrics.authenticationAttempts).toBe(1);
      expect(securityMetrics.rateLimitHits).toBe(1);
      expect(securityMetrics.suspiciousActivity).toBe(1);
    });

    it('should create event summaries', () => {
      // Record multiple events of the same type
      monitor.recordSecurityEvent(mockSecurityEvent);
      monitor.recordSecurityEvent({
        ...mockSecurityEvent,
        timestamp: new Date(Date.now() + 1000).toISOString(),
      });

      const securityMetrics = monitor.getSecurityMetrics();
      const authEvents = securityMetrics.securityEvents.find(
        (e) => e.eventType === 'authentication'
      );

      expect(authEvents).toBeDefined();
      expect(authEvents!.count).toBe(2);
      expect(authEvents!.severity).toBe('medium');
    });

    it('should maintain security events history limit', () => {
      // Record more than the max security events limit
      for (let i = 0; i < 600; i++) {
        monitor.recordSecurityEvent({
          ...mockSecurityEvent,
          correlationId: `test-${i}`,
        });
      }

      const securityMetrics = monitor.getSecurityMetrics();
      // Should not exceed the limit significantly
      expect(securityMetrics.authenticationAttempts).toBeLessThanOrEqual(500);
    });
  });

  describe('getPerformanceInsights', () => {
    it('should identify slow requests', () => {
      const slowMetadata = {
        correlationId: 'slow-request',
        requestFormat: 'claude' as const,
        responseFormat: 'claude' as const,
        responseTime: 10000, // 10 seconds
        success: true,
        circuitBreakerUsed: false,
        retryCount: 0,
        fallbackUsed: false,
      };

      const mockParams: ResponsesCreateParams = {
        model: 'claude-3-5-sonnet-20241022',
        input: 'Test message',
      };

      const mockResponse: ResponsesResponse = {
        id: 'resp_123',
        object: 'response',
        created: Date.now(),
        model: 'claude-3-5-sonnet-20241022',
        output: [{ type: 'text', text: 'Test response' }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      monitor.recordRequest(mockParams, mockResponse, slowMetadata);

      const insights = monitor.getPerformanceInsights();
      expect(insights.slowRequests.length).toBe(1);
      expect(insights.slowRequests[0].responseTime).toBe(10000);
    });

    it('should identify high token usage', () => {
      const highTokenMetadata = {
        correlationId: 'high-token-request',
        requestFormat: 'claude' as const,
        responseFormat: 'claude' as const,
        responseTime: 1000,
        success: true,
        circuitBreakerUsed: false,
        retryCount: 0,
        fallbackUsed: false,
      };

      const mockParams: ResponsesCreateParams = {
        model: 'claude-3-5-sonnet-20241022',
        input: 'Test message',
      };

      const highTokenResponse: ResponsesResponse = {
        id: 'resp_123',
        object: 'response',
        created: Date.now(),
        model: 'claude-3-5-sonnet-20241022',
        output: [{ type: 'text', text: 'Test response' }],
        usage: {
          prompt_tokens: 2000,
          completion_tokens: 3000,
          total_tokens: 5000, // High token usage
        },
      };

      monitor.recordRequest(mockParams, highTokenResponse, highTokenMetadata);

      const insights = monitor.getPerformanceInsights();
      expect(insights.highTokenUsage.length).toBe(1);
      expect(insights.highTokenUsage[0].totalTokens).toBe(5000);
    });

    it('should calculate reasoning efficiency', () => {
      const reasoningParams: ResponsesCreateParams = {
        model: 'claude-3-5-sonnet-20241022',
        input: 'Test message',
        reasoning: { effort: 'high' },
      };

      const reasoningResponse: ResponsesResponse = {
        id: 'resp_123',
        object: 'response',
        created: Date.now(),
        model: 'claude-3-5-sonnet-20241022',
        output: [
          { type: 'text', text: 'Test response' },
          {
            type: 'reasoning',
            reasoning: { content: 'Test reasoning', status: 'completed' },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 50,
          reasoning_tokens: 20,
        },
      };

      const reasoningMetadata = {
        correlationId: 'reasoning-request',
        requestFormat: 'claude' as const,
        responseFormat: 'claude' as const,
        responseTime: 2000,
        success: true,
        circuitBreakerUsed: false,
        retryCount: 0,
        fallbackUsed: false,
      };

      monitor.recordRequest(
        reasoningParams,
        reasoningResponse,
        reasoningMetadata
      );

      const insights = monitor.getPerformanceInsights();
      expect(insights.reasoningEfficiency.length).toBe(1);
      expect(insights.reasoningEfficiency[0].effort).toBe('high');
      expect(insights.reasoningEfficiency[0].averageTokens).toBe(20);
      expect(insights.reasoningEfficiency[0].averageResponseTime).toBe(2000);
    });
  });

  describe('monitoring lifecycle', () => {
    it('should start and stop monitoring', () => {
      expect(() => monitor.startMonitoring(1000)).not.toThrow();
      expect(() => monitor.stopMonitoring()).not.toThrow();
    });

    it('should not start monitoring twice', () => {
      monitor.startMonitoring(1000);
      monitor.startMonitoring(1000); // Should not throw or create duplicate intervals
      monitor.stopMonitoring();
    });

    it('should clear metrics', () => {
      const mockParams: ResponsesCreateParams = {
        model: 'claude-3-5-sonnet-20241022',
        input: 'Test message',
      };

      const mockResponse: ResponsesResponse = {
        id: 'resp_123',
        object: 'response',
        created: Date.now(),
        model: 'claude-3-5-sonnet-20241022',
        output: [{ type: 'text', text: 'Test response' }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      const mockMetadata = {
        correlationId: 'test-correlation-id',
        requestFormat: 'claude' as const,
        responseFormat: 'claude' as const,
        responseTime: 1500,
        success: true,
        circuitBreakerUsed: false,
        retryCount: 0,
        fallbackUsed: false,
      };

      monitor.recordRequest(mockParams, mockResponse, mockMetadata);

      let metrics = monitor.getMetrics();
      expect(metrics.requestCount).toBe(1);

      monitor.clearMetrics();

      metrics = monitor.getMetrics();
      expect(metrics.requestCount).toBe(0);
    });
  });
});

describe('createHealthCheckHandler', () => {
  it('should create health check handler', () => {
    const handler = createHealthCheckHandler();
    expect(typeof handler).toBe('function');
  });

  it('should return health check data', () => {
    const handler = createHealthCheckHandler();
    const result = handler('test-correlation-id');

    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('uptime');
    expect(result).toHaveProperty('version');
    expect(result).toHaveProperty('environment');
    expect(result).toHaveProperty('services');
    expect(result).toHaveProperty('metrics');

    expect(['healthy', 'unhealthy', 'degraded']).toContain(result.status);
    expect(typeof result.uptime).toBe('number');
    expect(result.services).toHaveProperty('azureOpenAI');
    expect(result.metrics).toHaveProperty('requests');
    expect(result.metrics).toHaveProperty('tokens');
    expect(result.metrics).toHaveProperty('memory');
  });

  it('should determine health status based on metrics', () => {
    const monitor = AzureResponsesMonitor.getInstance();

    // Record some failed requests to affect health status
    const mockParams: ResponsesCreateParams = {
      model: 'claude-3-5-sonnet-20241022',
      input: 'Test message',
    };

    const failedMetadata = {
      correlationId: 'failed-request',
      requestFormat: 'claude' as const,
      responseFormat: 'claude' as const,
      responseTime: 1000,
      success: false,
      errorType: 'api_error',
      circuitBreakerUsed: false,
      retryCount: 0,
      fallbackUsed: false,
    };

    // Record multiple failed requests
    for (let i = 0; i < 15; i++) {
      monitor.recordRequest(mockParams, null, {
        ...failedMetadata,
        correlationId: `failed-${i}`,
      });
    }

    const handler = createHealthCheckHandler();
    const result = handler('test-correlation-id');

    // Should be unhealthy due to high error rate
    expect(result.status).toBe('unhealthy');
  });
});
