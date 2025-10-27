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
} = vi.hoisted(() => {
  const executeGracefulDegradation = vi.fn();
  const autoAdjustServiceLevel = vi.fn();
  const degradeServiceLevel = vi.fn();
  const restoreServiceLevel = vi.fn();
  const triggerAlert = vi.fn();
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
});
