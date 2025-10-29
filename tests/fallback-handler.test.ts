import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FallbackHandler } from '../src/utils/fallback-handler.js';
import type { FallbackContext } from '../src/utils/fallback-handler.js';
import type { ClaudeRequest, OpenAIRequest } from '../src/types/index.js';

const { executeGracefulDegradation, mapAzureError, loggerMock } = vi.hoisted(
  () => {
    const executeGracefulDegradation = vi.fn();
    const mapAzureError = vi.fn(() => ({
      clientResponse: {
        error: {
          type: 'api_error',
          message: 'Fallback unavailable',
        },
      },
    }));

    const loggerMock = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    return { executeGracefulDegradation, mapAzureError, loggerMock };
  }
);

vi.mock('../src/middleware/logging.js', () => ({
  logger: loggerMock,
}));

vi.mock('../src/resilience/graceful-degradation.js', () => ({
  gracefulDegradationManager: {
    executeGracefulDegradation,
  },
}));

vi.mock('../src/utils/azure-error-mapper.js', () => ({
  AzureErrorMapper: {
    mapError: mapAzureError,
  },
}));

const createClaudeContext = (
  text: string,
  errorMessage: string
): FallbackContext => {
  const claudeRequest: ClaudeRequest = {
    model: 'claude-3-5-sonnet-20241022',
    messages: [
      {
        role: 'user',
        content: text,
      },
    ],
  };

  return {
    correlationId: 'fallback-test',
    operation: 'responses.create',
    requestFormat: 'claude',
    originalRequest: claudeRequest,
    error: new Error(errorMessage),
    attempt: 1,
  };
};

const createOpenAIContext = (
  text: string,
  errorMessage: string
): FallbackContext => {
  const openAIRequest: OpenAIRequest = {
    model: 'gpt-4',
    messages: [
      {
        role: 'user',
        content: text,
      },
    ],
  };

  return {
    correlationId: 'fallback-test',
    operation: 'responses.create',
    requestFormat: 'openai',
    originalRequest: openAIRequest,
    error: new Error(errorMessage),
    attempt: 1,
  };
};

describe('FallbackHandler', () => {
  beforeEach(() => {
    executeGracefulDegradation.mockReset();
    mapAzureError.mockClear();
  });

  it('uses graceful degradation result when available', async () => {
    executeGracefulDegradation.mockResolvedValue({
      success: true,
      data: {
        id: 'degraded-response',
        object: 'response',
        output: [],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
      fallbackUsed: 'cached_response',
      degraded: true,
    });

    const context = createClaudeContext('help me debug', 'temporary issue');
    const result = await FallbackHandler.executeFallback(context);

    expect(result.success).toBe(true);
    expect(result.fallbackUsed).toBe('cached_response');
    expect(result.degraded).toBe(true);
  });

  it('returns Claude service-unavailable error when infrastructure is overloaded', async () => {
    executeGracefulDegradation.mockRejectedValue(
      new Error('degradation failed')
    );
    const context = createClaudeContext(
      'regular request',
      'Service Unavailable'
    );

    const result = await FallbackHandler.executeFallback(context);

    expect(result.success).toBe(false);
    expect(result.error!.error.type).toBe('api_error');
    expect(result.fallbackUsed).toBe('service_unavailable_error');
    expect(result.degraded).toBe(true);
  });

  it('creates OpenAI-formatted fallback responses when degradation is not available', async () => {
    executeGracefulDegradation.mockResolvedValue({
      success: false,
      data: null,
      fallbackUsed: 'none',
      degraded: false,
    });
    const context = createOpenAIContext(
      'Please summarize this paragraph',
      'transient failure'
    );

    const result = await FallbackHandler.executeFallback(context);

    expect(result.success).toBe(true);
    expect(result.response?.object).toBe('chat.completion');
    expect(result.response?.usage?.prompt_tokens).toBeGreaterThan(0);
  });

  it('generates contextual fallback messages for coding requests', async () => {
    executeGracefulDegradation.mockResolvedValue({
      success: false,
      data: null,
      fallbackUsed: 'none',
      degraded: false,
    });
    const context = createClaudeContext(
      '```ts\nfunction add(a, b) { return a + b; }\n```',
      'network error'
    );

    const result = await FallbackHandler.executeFallback(context);
    const message = (result.response?.content?.[0] as { text: string }).text;

    expect(message).toContain('coding request');
  });

  it('estimates input tokens to keep usage metadata consistent', async () => {
    executeGracefulDegradation.mockResolvedValue({
      success: false,
      data: null,
      fallbackUsed: 'none',
      degraded: false,
    });
    const text = 'a'.repeat(40);
    const context = createClaudeContext(text, 'transient issue');

    const result = await FallbackHandler.executeFallback(context);
    expect(result.success).toBe(true);
    expect(result.response?.usage?.input_tokens).toBe(10);
  });

  it('detects fallback-worthy errors and maps fallback failures to Azure errors', () => {
    const shouldFallback = FallbackHandler.shouldUseFallback(
      new Error('NETWORK_ERROR: reset')
    );
    expect(shouldFallback).toBe(true);

    const context = createOpenAIContext('hello', 'hard failure');
    const mapped = FallbackHandler.createFallbackError(context);
    expect(mapped.error.type).toBe('api_error');
    expect(mapAzureError).toHaveBeenCalled();
  });
});
