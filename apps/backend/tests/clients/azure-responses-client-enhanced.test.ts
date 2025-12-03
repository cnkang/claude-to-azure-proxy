import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EnhancedAzureResponsesClient } from '../../src/clients/azure-responses-client-enhanced';
import type {
  ResponsesCreateParams,
  ResponsesResponse,
  UniversalRequest,
} from '../../src/types/index';
import { testServerConfig } from '../test-config';

const axiosMocks = vi.hoisted(() => {
  const request = vi.fn();
  const get = vi.fn();
  const requestInterceptors = { use: vi.fn() };
  const responseInterceptors = { use: vi.fn() };
  const axiosInstance = {
    request,
    get,
    interceptors: {
      request: requestInterceptors,
      response: responseInterceptors,
    },
  } as const;
  const create = vi.fn(() => axiosInstance);
  const isAxiosError = (error: unknown): boolean =>
    Boolean((error as { isAxiosError?: boolean }).isAxiosError);
  return {
    request,
    get,
    requestInterceptors,
    responseInterceptors,
    create,
    isAxiosError,
  };
});

vi.mock('axios', () => ({
  default: {
    create: axiosMocks.create,
    isAxiosError: axiosMocks.isAxiosError,
  },
  create: axiosMocks.create,
  isAxiosError: axiosMocks.isAxiosError,
}));

const registryMocks = vi.hoisted(() => {
  const circuitBreaker = {
    execute: vi.fn(),
    reset: vi.fn(),
    getMetrics: vi.fn(() => ({ state: 'CLOSED', failureCount: 0 })),
  };
  const getCircuitBreaker = vi.fn(() => circuitBreaker);
  return { circuitBreaker, getCircuitBreaker };
});

vi.mock('../../src/resilience/circuit-breaker.js', () => ({
  circuitBreakerRegistry: {
    getCircuitBreaker: registryMocks.getCircuitBreaker,
  },
}));

const retryStrategyMocks = vi.hoisted(() => {
  const executeWithRetry = vi.fn();
  const getMetrics = vi.fn(() => ({ attempts: 1, totalDurationMs: 5 }));
  const resetMetrics = vi.fn();

  class MockAzureRetryStrategy {
    executeWithRetry = executeWithRetry;
    getMetrics = getMetrics;
    resetMetrics = resetMetrics;
  }

  return {
    AzureRetryStrategy: MockAzureRetryStrategy,
    executeWithRetry,
    getMetrics,
    resetMetrics,
  };
});

vi.mock('../../src/utils/azure-retry-strategy.js', () => ({
  AzureRetryStrategy: retryStrategyMocks.AzureRetryStrategy,
  AzureRetryContext: class {},
}));

const fallbackMocks = vi.hoisted(() => ({
  executeFallback: vi.fn(),
  createFallbackError: vi.fn(() => ({
    error: {
      type: 'api_error',
      message: 'Fallback failed',
      correlationId: 'test-correlation',
    },
  })),
}));

vi.mock('../../src/utils/fallback-handler.js', () => ({
  FallbackHandler: fallbackMocks,
}));

const errorMapperMocks = vi.hoisted(() => ({
  mapError: vi.fn(() => ({
    clientResponse: {
      error: {
        type: 'api_error',
        message: 'Mapped error',
        correlationId: 'test-correlation',
      },
    },
  })),
}));

vi.mock('../../src/utils/azure-error-mapper.js', () => ({
  AzureErrorMapper: errorMapperMocks,
}));

const errorFactoryMocks = vi.hoisted(() => ({
  fromAzureOpenAIError: vi.fn(() => {
    const error = new Error('Azure failure');
    (error as Record<string, unknown>).azureErrorType = 'throttle';
    return error;
  }),
}));

vi.mock('../../src/errors/index.js', () => ({
  ErrorFactory: errorFactoryMocks,
}));

const loggerMocks = vi.hoisted(() => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../src/middleware/logging.js', () => loggerMocks);

describe('EnhancedAzureResponsesClient', () => {
  const sampleResponse: ResponsesResponse = {
    id: 'resp_123',
    object: 'response',
    created: Date.now(),
    model: 'gpt-4o',
    output: [],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    },
  };

  const sampleParams: ResponsesCreateParams = {
    model: 'gpt-4o',
    input: 'hello world',
  };

  const sampleRequest: UniversalRequest = {
    model: 'claude-3',
    messages: [],
  } as unknown as UniversalRequest;

  beforeEach(() => {
    vi.clearAllMocks();
    axiosMocks.request.mockReset();
    axiosMocks.get.mockReset();
    registryMocks.circuitBreaker.execute.mockReset();
    retryStrategyMocks.executeWithRetry.mockReset();
    fallbackMocks.executeFallback.mockReset();
  });

  it('creates axios client with expected defaults', () => {
    new EnhancedAzureResponsesClient();

    expect(axiosMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: expect.stringContaining(
          testServerConfig.azureOpenAI?.endpoint ?? ''
        ),
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Bearer '),
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('executes completion requests through the circuit breaker', async () => {
    axiosMocks.request.mockResolvedValue({ data: sampleResponse });
    registryMocks.circuitBreaker.execute.mockImplementation(
      async (operation) => ({
        success: true,
        data: await operation(),
        metrics: registryMocks.circuitBreaker.getMetrics(),
      })
    );

    const client = new EnhancedAzureResponsesClient();
    const result = await client.createCompletion(
      sampleParams,
      'corr-1',
      'claude',
      sampleRequest
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(sampleResponse);
    expect(fallbackMocks.executeFallback).not.toHaveBeenCalled();
  });

  it('falls back when circuit breaker execution fails', async () => {
    retryStrategyMocks.executeWithRetry.mockResolvedValue({
      success: false,
      error: new Error('retry failure'),
      attempts: 3,
      totalDurationMs: 45,
    });
    fallbackMocks.executeFallback.mockResolvedValue({
      success: true,
      response: sampleResponse as unknown as UniversalRequest,
      fallbackUsed: 'static_response',
      degraded: true,
    });

    const client = new EnhancedAzureResponsesClient({
      enableCircuitBreaker: false,
    });
    const result = await client.createCompletion(
      sampleParams,
      'corr-2',
      'openai',
      sampleRequest
    );

    expect(fallbackMocks.executeFallback).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.metadata.fallbackUsed).toBe(true);
  });

  it('uses retry strategy when circuit breaker is disabled', async () => {
    retryStrategyMocks.executeWithRetry.mockResolvedValue({
      success: true,
      data: sampleResponse,
      attempts: 2,
      totalDurationMs: 25,
    });

    const client = new EnhancedAzureResponsesClient({
      enableCircuitBreaker: false,
    });
    const result = await client.createCompletion(
      sampleParams,
      'corr-3',
      'claude',
      sampleRequest
    );

    expect(retryStrategyMocks.executeWithRetry).toHaveBeenCalled();
    expect(result.metadata.retryUsed).toBe(true);
  });

  it('maps errors when retries are exhausted and fallback is disabled', async () => {
    retryStrategyMocks.executeWithRetry.mockResolvedValue({
      success: false,
      error: new Error('timeout'),
      attempts: 3,
      totalDurationMs: 60,
    });

    const client = new EnhancedAzureResponsesClient({
      enableCircuitBreaker: false,
      enableFallback: false,
    });
    const result = await client.createCompletion(
      sampleParams,
      'corr-4',
      'openai',
      sampleRequest
    );

    expect(result.success).toBe(false);
    expect(errorMapperMocks.mapError).toHaveBeenCalled();
    expect(result.error!.error.message).toBe('Mapped error');
  });

  it('provides circuit breaker and retry metrics', () => {
    const client = new EnhancedAzureResponsesClient();
    const metrics = client.getMetrics();

    expect(metrics.retry).toEqual(retryStrategyMocks.getMetrics());
    expect(metrics.circuitBreaker).toEqual(
      registryMocks.circuitBreaker.getMetrics()
    );
  });

  it('resets retry and circuit breaker metrics', () => {
    const client = new EnhancedAzureResponsesClient();
    client.resetMetrics();

    expect(retryStrategyMocks.resetMetrics).toHaveBeenCalled();
    expect(registryMocks.circuitBreaker.reset).toHaveBeenCalled();
  });

  it('reports health check results', async () => {
    axiosMocks.get.mockResolvedValue({ status: 200 });
    const client = new EnhancedAzureResponsesClient();
    const healthy = await client.healthCheck('corr-health');
    expect(healthy.healthy).toBe(true);

    axiosMocks.get.mockRejectedValue(new Error('network'));
    const unhealthy = await client.healthCheck('corr-health');
    expect(unhealthy.healthy).toBe(false);
  });
});
