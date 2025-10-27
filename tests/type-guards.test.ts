import { describe, it, expect } from 'vitest';
import {
  isRecord,
  isString,
  isNumber,
  isReasoningEffort,
  isRequestFormat,
  isResponseFormat,
  isResponseMessage,
  isResponsesResponse,
  isResponsesStreamChunk,
  isAzureOpenAIErrorResponse,
  isOpenAIResponse,
  isClaudeResponse,
  isOpenAIError,
  isClaudeError,
  isHealthCheckResult,
  isIncomingRequest,
  isAuthenticationResult,
  isAuthenticationMethod,
  AuthenticationResult,
  AuthenticationMethod,
} from '../src/types/index.js';

describe('runtime type guards', () => {
  it('validates primitive helpers', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isString('value')).toBe(true);
    expect(isNumber(5)).toBe(true);
    expect(isReasoningEffort('medium')).toBe(true);
    expect(isReasoningEffort('extreme')).toBe(false);
    expect(isRequestFormat('claude')).toBe(true);
    expect(isResponseFormat('openai')).toBe(true);
  });

  it('validates response payloads', () => {
    const responseMessage = { role: 'user', content: 'hello' };
    expect(isResponseMessage(responseMessage)).toBe(true);

    const responsesResponse = {
      id: 'resp_123',
      object: 'response',
      created: Date.now(),
      model: 'gpt-4',
      output: [],
      usage: {
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2,
      },
    };
    expect(isResponsesResponse(responsesResponse)).toBe(true);
    expect(isResponsesResponse({ ...responsesResponse, output: undefined })).toBe(false);

    const streamChunk = {
      id: 'resp_chunk',
      object: 'response.chunk',
      created: Date.now(),
      model: 'gpt-4',
      output: [],
    };
    expect(isResponsesStreamChunk(streamChunk)).toBe(true);
  });

  it('validates API specific structures', () => {
    const azureError = { error: { code: '429', message: 'Rate limit' } };
    expect(isAzureOpenAIErrorResponse(azureError)).toBe(true);

    const openaiResponse = {
      id: 'chatcmpl',
      object: 'chat.completion',
      created: Date.now(),
      model: 'gpt-4o',
      choices: [],
    };
    expect(isOpenAIResponse(openaiResponse)).toBe(true);
    expect(isOpenAIError({ error: { message: 'boom', type: 'server_error' } })).toBe(true);

    const claudeResponse = {
      id: 'resp',
      type: 'message',
      role: 'assistant',
      content: [],
      model: 'claude-3',
    };
    expect(isClaudeResponse(claudeResponse)).toBe(true);
    expect(isClaudeError({ type: 'error', error: { type: 'api_error', message: 'fail' } })).toBe(true);
  });

  it('validates health and request metadata structures', () => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: 123,
      memory: {
        used: 1,
        total: 2,
        percentage: 50,
      },
    };
    expect(isHealthCheckResult(health)).toBe(true);

    const incoming = {
      headers: {},
      body: {},
      path: '/v1/completions',
    };
    expect(isIncomingRequest(incoming)).toBe(true);
  });

  it('checks authentication enums safely', () => {
    expect(isAuthenticationResult(AuthenticationResult.SUCCESS)).toBe(true);
    expect(isAuthenticationResult('unknown')).toBe(false);
    expect(isAuthenticationMethod(AuthenticationMethod.BEARER_TOKEN)).toBe(true);
    expect(isAuthenticationMethod('invalid')).toBe(false);
  });
});
