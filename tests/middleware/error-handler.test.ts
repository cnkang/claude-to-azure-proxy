import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  ValidationError,
  CircuitBreakerError,
} from '../../src/errors/index.js';
import { EnhancedErrorHandler } from '../../src/middleware/error-handler.js';
import { createMockRequest } from '../types.js';

const {
  executeGracefulDegradation,
  autoAdjustServiceLevel,
  degradeServiceLevel,
  restoreServiceLevel,
  triggerAlert,
  loggerMock,
  getCurrentMemoryMetrics,
  forceGarbageCollection,
  getRequestMemoryInfo,
} = vi.hoisted(() => {
  const executeGracefulDegradation = vi.fn();
  const autoAdjustServiceLevel = vi.fn();
  const degradeServiceLevel = vi.fn();
  const restoreServiceLevel = vi.fn();
  const triggerAlert = vi.fn();
  const getCurrentMemoryMetrics = vi.fn(() => ({
    pressure: { level: 'low', score: 0.3, recommendations: [] },
    heap: { percentage: 30 },
  }));
  const forceGarbageCollection = vi.fn(() => true);
  const getRequestMemoryInfo = vi.fn();
  const loggerMock = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    critical: vi.fn(),
  };

  return {
    executeGracefulDegradation,
    autoAdjustServiceLevel,
    degradeServiceLevel,
    restoreServiceLevel,
    triggerAlert,
    loggerMock,
    getCurrentMemoryMetrics,
    forceGarbageCollection,
    getRequestMemoryInfo,
  };
});

vi.mock('../../src/middleware/logging.js', () => ({
  logger: loggerMock,
}));

vi.mock('../../src/resilience/graceful-degradation.js', () => ({
  gracefulDegradationManager: {
    executeGracefulDegradation,
    autoAdjustServiceLevel,
    degradeServiceLevel,
    restoreServiceLevel,
  },
}));

vi.mock('../../src/monitoring/health-monitor.js', () => ({
  healthMonitor: {
    triggerAlert,
  },
}));

vi.mock('../../src/utils/memory-manager.js', () => ({
  getCurrentMemoryMetrics,
  forceGarbageCollection,
}));

vi.mock('../../src/middleware/memory-management.js', () => ({
  getRequestMemoryInfo,
}));

vi.mock('../../src/config/index.js', () => ({
  default: {
    ENABLE_MEMORY_MANAGEMENT: true,
    ENABLE_AUTO_GC: true,
  },
}));

type ChainableResponse = Response & {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};

const buildRequest = (overrides: Partial<Request> = {}): Request => {
  return {
    ...createMockRequest({
      method: 'POST',
      url: '/v1/completions',
      correlationId: 'error-handler-test',
    }),
    ...overrides,
    headers: overrides.headers ?? {},
    originalUrl: '/v1/completions',
  } as unknown as Request;
};

const createChainableResponse = (): ChainableResponse => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    headersSent: false,
  };

  return res as ChainableResponse;
};

describe('EnhancedErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('formats validation errors with field information', async () => {
    const handler = new EnhancedErrorHandler({ exposeStackTrace: false });
    const req = buildRequest();
    const res = createChainableResponse();
    const next = vi.fn();
    const error = new ValidationError(
      'Invalid model',
      'error-handler-test',
      'model',
      'unsupported'
    );

    await handler.handleError(error, req, res as unknown as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(error.statusCode);
    expect(res.json.mock.calls[0]?.[0].error.field).toBe('model');
    expect(next).not.toHaveBeenCalled();
  });

  it('maps Node.js networking errors to service unavailable responses', async () => {
    const handler = new EnhancedErrorHandler({ enableGracefulDegradation: false });
    const req = buildRequest();
    const res = createChainableResponse();
    const next = vi.fn();
    const nodeError = Object.assign(new Error('reset'), { code: 'ECONNRESET' });

    await handler.handleError(nodeError, req, res as unknown as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json.mock.calls[0]?.[0].error.type).toBe('service_unavailable');
  });

  it('uses graceful degradation responses for unknown errors', async () => {
    executeGracefulDegradation.mockResolvedValue({
      success: true,
      data: {
        error: {
          type: 'graceful_degradation',
          message: 'Serving cached response',
          correlationId: 'error-handler-test',
        },
      },
    });

    const handler = new EnhancedErrorHandler({ enableGracefulDegradation: true });
    const req = buildRequest();
    const res = createChainableResponse();

    await handler.handleError(new Error('boom'), req, res as unknown as Response, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0]?.[0].error.type).toBe('graceful_degradation');
  });

  it('triggers health alerts for circuit breaker failures and adjusts service level', async () => {
    const handler = new EnhancedErrorHandler({ enableHealthMonitoring: true });
    const req = buildRequest();
    const res = createChainableResponse();
    const error = new CircuitBreakerError(
      'Circuit open',
      'error-handler-test',
      'OPEN',
      new Date(),
      'responses.create'
    );

    await handler.handleError(error, req, res as unknown as Response, vi.fn());

    expect(triggerAlert).toHaveBeenCalled();
    expect(autoAdjustServiceLevel).toHaveBeenCalledWith('error-handler-test');
  });

  it('degrades service level when non-operational errors occur', async () => {
    const handler = new EnhancedErrorHandler({ enableHealthMonitoring: false });
    const req = buildRequest();
    const res = createChainableResponse();
    const nonOperational = new ValidationError(
      'Critical validation failure',
      'error-handler-test',
      'payload',
      'invalid',
      false
    );

    await handler.handleError(nonOperational, req, res as unknown as Response, vi.fn());

    expect(degradeServiceLevel).toHaveBeenCalledWith(
      expect.stringContaining('Critical error'),
      'error-handler-test'
    );
  });

  describe('Node.js 24 Features', () => {
    it('should gather memory information during error handling', async () => {
      const handler = new EnhancedErrorHandler();
      const req = buildRequest();
      const res = createChainableResponse();
      const error = new Error('Test error');

      // Mock memory information
      getRequestMemoryInfo.mockReturnValue({
        startMemory: { heapUsed: 50 * 1024 * 1024 },
        memoryDelta: 10 * 1024 * 1024,
        duration: 1000,
        pressureDetected: false,
        resourcesCleanedUp: true,
      });

      await handler.handleError(error, req, res as unknown as Response, vi.fn());

      expect(getCurrentMemoryMetrics).toHaveBeenCalled();
      expect(getRequestMemoryInfo).toHaveBeenCalledWith(req);
    });

    it('should handle memory pressure during error scenarios', async () => {
      const handler = new EnhancedErrorHandler();
      const req = buildRequest();
      const res = createChainableResponse();
      const error = new Error('Test error');

      // Mock high memory pressure
      getCurrentMemoryMetrics.mockReturnValue({
        pressure: { level: 'critical', score: 0.95, recommendations: [] },
        heap: { percentage: 95 },
      });

      getRequestMemoryInfo.mockReturnValue({
        pressureDetected: true,
        resourcesCleanedUp: true,
      });

      await handler.handleError(error, req, res as unknown as Response, vi.fn());

      expect(forceGarbageCollection).toHaveBeenCalled();
      expect(loggerMock.warn).toHaveBeenCalledWith(
        'Memory pressure detected during error handling',
        'error-handler-test',
        expect.objectContaining({
          action: 'triggering_garbage_collection',
        })
      );
    });

    it('should handle Node.js 24 specific error codes', async () => {
      const handler = new EnhancedErrorHandler();
      const req = buildRequest();
      const res = createChainableResponse();
      
      // Test ENOMEM error
      const memoryError = new Error('Out of memory') as Error & { code: string };
      memoryError.code = 'ENOMEM';

      await handler.handleError(memoryError, req, res as unknown as Response, vi.fn());

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          type: 'memory_exhausted',
          message: 'Server memory temporarily exhausted',
        }),
      });
    });

    it('should handle ERR_OUT_OF_RANGE error', async () => {
      const handler = new EnhancedErrorHandler();
      const req = buildRequest();
      const res = createChainableResponse();
      
      const rangeError = new Error('Value out of range') as Error & { code: string };
      rangeError.code = 'ERR_OUT_OF_RANGE';

      await handler.handleError(rangeError, req, res as unknown as Response, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          type: 'invalid_request',
          message: 'Request parameter out of valid range',
        }),
      });
    });

    it('should handle ERR_INVALID_ARG_TYPE error', async () => {
      const handler = new EnhancedErrorHandler();
      const req = buildRequest();
      const res = createChainableResponse();
      
      const typeError = new Error('Invalid argument type') as Error & { code: string };
      typeError.code = 'ERR_INVALID_ARG_TYPE';

      await handler.handleError(typeError, req, res as unknown as Response, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          type: 'invalid_request',
          message: 'Invalid request parameter type',
        }),
      });
    });

    it('should include Node.js version in error logs', async () => {
      const handler = new EnhancedErrorHandler();
      const req = buildRequest();
      const res = createChainableResponse();
      const error = new Error('Test error');

      await handler.handleError(error, req, res as unknown as Response, vi.fn());

      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.stringContaining('Unhandled error'),
        'error-handler-test',
        expect.objectContaining({
          nodeVersion: process.version,
          heapUsed: expect.any(Number),
          heapTotal: expect.any(Number),
        }),
        error
      );
    });

    it('should handle memory metrics gathering errors gracefully', async () => {
      const handler = new EnhancedErrorHandler();
      const req = buildRequest();
      const res = createChainableResponse();
      const error = new Error('Test error');

      // Mock memory metrics error
      getCurrentMemoryMetrics.mockImplementation(() => {
        throw new Error('Memory metrics error');
      });

      await handler.handleError(error, req, res as unknown as Response, vi.fn());

      // Should not throw and should still handle the original error
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalled();
    });

    it('should warn when GC is not available during memory pressure', async () => {
      const handler = new EnhancedErrorHandler();
      const req = buildRequest();
      const res = createChainableResponse();
      const error = new Error('Test error');

      // Mock memory pressure but GC not available
      getCurrentMemoryMetrics.mockReturnValue({
        pressure: { level: 'critical', score: 0.95, recommendations: [] },
        heap: { percentage: 95 },
      });

      getRequestMemoryInfo.mockReturnValue({
        pressureDetected: true,
        resourcesCleanedUp: true,
      });

      forceGarbageCollection.mockReturnValue(false);

      await handler.handleError(error, req, res as unknown as Response, vi.fn());

      expect(loggerMock.warn).toHaveBeenCalledWith(
        'Could not trigger garbage collection during memory pressure',
        'error-handler-test',
        expect.objectContaining({
          suggestion: 'Consider running with --expose-gc flag',
        })
      );
    });
  });
});
