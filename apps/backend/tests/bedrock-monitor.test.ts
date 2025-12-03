/**
 * @fileoverview Tests for AWS Bedrock monitoring and metrics collection.
 *
 * This test suite validates the BedrockMonitor class functionality including
 * request tracking, performance metrics, health status validation, and
 * structured logging without exposing sensitive data.
 *
 * @author Claude-to-Azure Proxy Team
 * @version 2.0.0
 * @since 1.0.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BedrockMonitor,
  createBedrockTimer,
  recordBedrockBusinessMetric,
} from '../src/monitoring/bedrock-monitor';
import type { AWSBedrockConfig } from '../src/types/index';

// Mock axios for Bedrock health checks
vi.mock('axios', () => ({
  default: {
    create: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
  },
  create: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
}));
const mockedAxios = vi.mocked(await import('axios'));

// Mock the metrics collector
vi.mock('../src/monitoring/metrics.js', () => ({
  metricsCollector: {
    recordPerformance: vi.fn(),
    recordBusiness: vi.fn(),
  },
  createTimer: vi.fn(() => ({
    stop: vi.fn(() => ({
      name: 'bedrock_request',
      value: 100,
      timestamp: new Date().toISOString(),
      duration: 100,
      success: true,
      correlationId: 'test-correlation-id',
      unit: 'ms',
    })),
  })),
}));

// Mock the logger
vi.mock('../src/middleware/logging.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('BedrockMonitor', () => {
  let bedrockMonitor: BedrockMonitor;
  let mockConfig: AWSBedrockConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      baseURL: 'https://bedrock-runtime.us-west-2.amazonaws.com',
      apiKey: 'test-bedrock-api-key',
      region: 'us-west-2',
      timeout: 5000,
      maxRetries: 3,
    };

    bedrockMonitor = new BedrockMonitor(mockConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Request Tracking', () => {
    it('should track Bedrock request with distinct correlation ID and service identifier', () => {
      // Requirement 4.1: Add Bedrock-specific request tracking with distinct correlation IDs and service identifiers
      const correlationId = 'test-correlation-123';
      const model = 'qwen.qwen3-coder-480b-a35b-v1:0';
      const requestType = 'streaming';

      bedrockMonitor.trackBedrockRequest(correlationId, model, requestType);

      const activeRequests = bedrockMonitor.getActiveRequests();
      expect(activeRequests.has(correlationId)).toBe(true);

      const tracker = activeRequests.get(correlationId);
      expect(tracker).toBeDefined();
      expect(tracker!.correlationId).toBe(correlationId);
      expect(tracker!.serviceId).toBe('bedrock');
      expect(tracker!.model).toBe(model);
      expect(tracker!.requestType).toBe(requestType);
      expect(tracker!.startTime).toBeGreaterThan(0);
    });

    it('should complete Bedrock request tracking with performance metrics', () => {
      // Requirement 4.2: Implement separate performance metrics collection for AWS Bedrock vs Azure OpenAI
      const correlationId = 'test-correlation-456';
      const model = 'qwen-3-coder';

      // Start tracking
      bedrockMonitor.trackBedrockRequest(correlationId, model, 'non-streaming');

      // Complete tracking
      bedrockMonitor.completeBedrockRequest(correlationId, true);

      const metrics = bedrockMonitor.getBedrockMetrics();
      expect(metrics.requestCount).toBe(1);
      expect(metrics.successCount).toBe(1);
      expect(metrics.errorCount).toBe(0);
      expect(metrics.errorRate).toBe(0);
      expect(metrics.averageLatency).toBeGreaterThanOrEqual(0); // Changed to >= 0 since it could be 0 for very fast operations
      expect(metrics.serviceStatus).toBe('available');
    });

    it('should handle failed request tracking', () => {
      const correlationId = 'test-correlation-789';
      const model = 'qwen-3-coder';
      const errorType = 'timeout_error';

      bedrockMonitor.trackBedrockRequest(correlationId, model, 'streaming');
      bedrockMonitor.completeBedrockRequest(correlationId, false, errorType);

      const metrics = bedrockMonitor.getBedrockMetrics();
      expect(metrics.requestCount).toBe(1);
      expect(metrics.successCount).toBe(0);
      expect(metrics.errorCount).toBe(1);
      expect(metrics.errorRate).toBe(100);
      expect(metrics.serviceStatus).toBe('unavailable');
    });

    it('should handle completion of non-existent request gracefully', () => {
      const nonExistentId = 'non-existent-correlation-id';

      // Should not throw error
      expect(() => {
        bedrockMonitor.completeBedrockRequest(nonExistentId, true);
      }).not.toThrow();

      const metrics = bedrockMonitor.getBedrockMetrics();
      expect(metrics.requestCount).toBe(0);
    });
  });

  describe('Health Check', () => {
    it('should check AWS Bedrock service health status successfully', async () => {
      // Requirement 4.3: Extend health check endpoint to include AWS Bedrock service status validation
      const mockAxiosInstance = {
        get: vi.fn().mockResolvedValue({
          status: 200,
          data: { foundationModels: [] },
        }),
      };

      // Mock axios.create to return our mock instance
      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      // Mock the default axios import to have the create method
      mockedAxios.default = {
        create: vi.fn().mockReturnValue(mockAxiosInstance),
      } as any;

      const healthStatus = await bedrockMonitor.checkBedrockHealth();

      expect(healthStatus.status).toBe('connected');
      expect(healthStatus.responseTime).toBeGreaterThanOrEqual(0);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/foundation-models', {
        timeout: 5000,
        headers: {
          Accept: 'application/json',
        },
      });
    });

    it('should handle Bedrock health check failure', async () => {
      // Create a fresh monitor instance to avoid state pollution
      const freshMonitor = new BedrockMonitor(mockConfig);

      const mockAxiosInstance = {
        get: vi.fn().mockRejectedValue(new Error('Connection failed')),
      };

      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);
      mockedAxios.default = {
        create: vi.fn().mockReturnValue(mockAxiosInstance),
      } as any;

      const healthStatus = await freshMonitor.checkBedrockHealth();

      expect(healthStatus.status).toBe('disconnected');
      expect(healthStatus.responseTime).toBeUndefined();
    });

    it('should handle Bedrock health check timeout', async () => {
      // Create a fresh monitor instance to avoid state pollution
      const freshMonitor = new BedrockMonitor(mockConfig);

      const mockAxiosInstance = {
        get: vi.fn().mockRejectedValue({
          code: 'ECONNABORTED',
          message: 'timeout of 5000ms exceeded',
        }),
      };

      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);
      mockedAxios.default = {
        create: vi.fn().mockReturnValue(mockAxiosInstance),
      } as any;

      const healthStatus = await freshMonitor.checkBedrockHealth();

      expect(healthStatus.status).toBe('disconnected');
    });

    it('should validate HTTPS endpoint requirement', async () => {
      const invalidConfig = {
        ...mockConfig,
        baseURL: 'http://bedrock-runtime.us-west-2.amazonaws.com', // HTTP instead of HTTPS
      };

      const invalidMonitor = new BedrockMonitor(invalidConfig);
      const healthStatus = await invalidMonitor.checkBedrockHealth();

      expect(healthStatus.status).toBe('disconnected');
    });
  });

  describe('Metrics Collection', () => {
    it('should provide service-distinguished metrics', () => {
      // Requirement 4.5: Create metrics endpoints that distinguish between Azure and Bedrock usage
      const correlationId1 = 'test-1';
      const correlationId2 = 'test-2';

      bedrockMonitor.trackBedrockRequest(
        correlationId1,
        'qwen-3-coder',
        'streaming'
      );
      bedrockMonitor.completeBedrockRequest(correlationId1, true);

      bedrockMonitor.trackBedrockRequest(
        correlationId2,
        'qwen-3-coder',
        'non-streaming'
      );
      bedrockMonitor.completeBedrockRequest(
        correlationId2,
        false,
        'rate_limit_error'
      );

      const metrics = bedrockMonitor.getBedrockMetrics();

      expect(metrics.requestCount).toBe(2);
      expect(metrics.successCount).toBe(1);
      expect(metrics.errorCount).toBe(1);
      expect(metrics.errorRate).toBe(50);
      expect(metrics.serviceStatus).toBe('degraded'); // 50% error rate = degraded
      expect(metrics.lastRequestTime).toBeDefined();
    });

    it('should calculate service status based on error rate', () => {
      // Test available status (low error rate)
      bedrockMonitor.trackBedrockRequest('test-1', 'qwen-3-coder', 'streaming');
      bedrockMonitor.completeBedrockRequest('test-1', true);

      let metrics = bedrockMonitor.getBedrockMetrics();
      expect(metrics.serviceStatus).toBe('available');

      // Test degraded status (medium error rate)
      for (let i = 2; i <= 10; i++) {
        bedrockMonitor.trackBedrockRequest(
          `test-${i}`,
          'qwen-3-coder',
          'streaming'
        );
        bedrockMonitor.completeBedrockRequest(`test-${i}`, i <= 8); // 20% error rate
      }

      metrics = bedrockMonitor.getBedrockMetrics();
      expect(metrics.serviceStatus).toBe('degraded');

      // Test unavailable status (high error rate)
      for (let i = 11; i <= 20; i++) {
        bedrockMonitor.trackBedrockRequest(
          `test-${i}`,
          'qwen-3-coder',
          'streaming'
        );
        bedrockMonitor.completeBedrockRequest(
          `test-${i}`,
          false,
          'service_error'
        ); // High error rate
      }

      metrics = bedrockMonitor.getBedrockMetrics();
      expect(metrics.serviceStatus).toBe('unavailable');
    });

    it('should clear metrics correctly', () => {
      bedrockMonitor.trackBedrockRequest(
        'test-clear',
        'qwen-3-coder',
        'streaming'
      );
      bedrockMonitor.completeBedrockRequest('test-clear', true);

      let metrics = bedrockMonitor.getBedrockMetrics();
      expect(metrics.requestCount).toBe(1);

      bedrockMonitor.clearMetrics();

      metrics = bedrockMonitor.getBedrockMetrics();
      expect(metrics.requestCount).toBe(0);
      expect(metrics.successCount).toBe(0);
      expect(metrics.errorCount).toBe(0);
      expect(metrics.errorRate).toBe(0);
      expect(metrics.averageLatency).toBe(0);
      expect(metrics.serviceStatus).toBe('available');
      expect(metrics.lastRequestTime).toBeUndefined();

      const activeRequests = bedrockMonitor.getActiveRequests();
      expect(activeRequests.size).toBe(0);
    });
  });

  describe('Utility Functions', () => {
    it('should create Bedrock performance timer', () => {
      const timer = createBedrockTimer('converse_request', 'test-correlation');
      expect(timer).toBeDefined();
      expect(typeof timer.stop).toBe('function');
    });

    it('should record Bedrock business metric with service identifier', async () => {
      recordBedrockBusinessMetric('model_requests', 'requests', 1, {
        model: 'qwen-3-coder',
        requestType: 'streaming',
      });

      // Verify the metric was recorded with service tag
      const { metricsCollector } = await import('../src/monitoring/metrics.js');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(metricsCollector.recordBusiness).toHaveBeenCalledWith({
        name: 'bedrock_model_requests',
        value: 1,
        timestamp: expect.any(String),
        category: 'requests',
        count: 1,
        tags: {
          service: 'bedrock',
          model: 'qwen-3-coder',
          requestType: 'streaming',
        },
      });
    });
  });

  describe('Structured Logging', () => {
    it('should log Bedrock operations without exposing sensitive data', async () => {
      // Requirement 4.4: Add structured logging for Bedrock operations without exposing sensitive data
      const { logger } = await import('../src/middleware/logging.js');
      const correlationId = 'test-logging';

      bedrockMonitor.trackBedrockRequest(
        correlationId,
        'qwen-3-coder',
        'streaming'
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Bedrock request started',
        correlationId,
        expect.objectContaining({
          serviceId: 'bedrock',
          model: 'qwen-3-coder',
          requestType: 'streaming',
          timestamp: expect.any(String),
        })
      );

      bedrockMonitor.completeBedrockRequest(correlationId, true);

      expect(logger.info).toHaveBeenCalledWith(
        'Bedrock request completed',
        correlationId,
        expect.objectContaining({
          serviceId: 'bedrock',
          model: 'qwen-3-coder',
          requestType: 'streaming',
          duration: expect.any(Number),
          success: true,
          timestamp: expect.any(String),
        })
      );
    });

    it('should log health check failures without exposing sensitive data', async () => {
      const { logger } = await import('../src/middleware/logging.js');

      // Create a fresh monitor instance to avoid state pollution
      const freshMonitor = new BedrockMonitor(mockConfig);

      const mockAxiosInstance = {
        get: vi.fn().mockRejectedValue(new Error('Authentication failed')),
      };

      // Mock axios.create to return our mock instance
      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      // Mock the default axios import to have the create method
      mockedAxios.default = {
        create: vi.fn().mockReturnValue(mockAxiosInstance),
      } as any;

      await freshMonitor.checkBedrockHealth();

      expect(logger.warn).toHaveBeenCalledWith(
        'Bedrock health check failed',
        '',
        expect.objectContaining({
          serviceId: 'bedrock',
          error: 'Authentication failed',
          timestamp: expect.any(String),
        })
      );

      // Verify no sensitive data (API keys, etc.) are logged
      const logCalls = vi.mocked(logger.warn).mock.calls;
      const loggedData = logCalls.map((call) => JSON.stringify(call));
      const combinedLogs = loggedData.join(' ');

      expect(combinedLogs).not.toContain('test-bedrock-api-key');
      expect(combinedLogs).not.toContain('Bearer');
    });
  });
});
