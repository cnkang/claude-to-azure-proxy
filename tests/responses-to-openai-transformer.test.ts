import { describe, it, expect, beforeEach } from 'vitest';
import {
  ResponsesToOpenAITransformer,
  createResponsesToOpenAITransformer,
  transformResponsesToOpenAI,
  transformResponsesStreamToOpenAI,
  transformResponsesErrorToOpenAI,
} from '../src/utils/responses-to-openai-transformer.js';
import type {
  ResponsesResponse,
  ResponsesStreamChunk,
  ResponsesAPIError,
} from '../src/types/index.js';

describe('ResponsesToOpenAITransformer', () => {
  let transformer: ResponsesToOpenAITransformer;
  const correlationId = 'test-correlation-id';

  beforeEach(() => {
    transformer = new ResponsesToOpenAITransformer(correlationId);
  });

  describe('transformResponse', () => {
    it('should transform basic text response correctly', () => {
      const responsesResponse: ResponsesResponse = {
        id: 'resp-123',
        object: 'response',
        created: 1234567890,
        model: 'gpt-4',
        output: [
          {
            type: 'text',
            text: 'Hello, world!',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      const result = transformer.transformResponse(responsesResponse);

      expect(result).toEqual({
        id: 'resp-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello, world!',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      });
    });

    it('should exclude reasoning content from final response', () => {
      const responsesResponse: ResponsesResponse = {
        id: 'resp-123',
        object: 'response',
        created: 1234567890,
        model: 'gpt-4',
        output: [
          {
            type: 'reasoning',
            reasoning: {
              content: 'Let me think about this...',
              status: 'completed',
            },
          },
          {
            type: 'text',
            text: 'Final answer',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
          reasoning_tokens: 20,
        },
      };

      const result = transformer.transformResponse(responsesResponse);

      expect(result.choices[0].message.content).toBe('Final answer');
    });

    it('should handle tool calls correctly', () => {
      const responsesResponse: ResponsesResponse = {
        id: 'resp-123',
        object: 'response',
        created: 1234567890,
        model: 'gpt-4',
        output: [
          {
            type: 'tool_call',
            tool_call: {
              id: 'call-123',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"location": "New York"}',
              },
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      const result = transformer.transformResponse(responsesResponse);

      expect(result.choices[0].message.tool_calls).toEqual([
        {
          id: 'call-123',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"location": "New York"}',
          },
        },
      ]);
      expect(result.choices[0].finish_reason).toBe('tool_calls');
    });

    it('should handle mixed content correctly', () => {
      const responsesResponse: ResponsesResponse = {
        id: 'resp-123',
        object: 'response',
        created: 1234567890,
        model: 'gpt-4',
        output: [
          {
            type: 'text',
            text: 'I need to check the weather. ',
          },
          {
            type: 'tool_call',
            tool_call: {
              id: 'call-123',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"location": "New York"}',
              },
            },
          },
          {
            type: 'text',
            text: 'Let me get that for you.',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      const result = transformer.transformResponse(responsesResponse);

      expect(result.choices[0].message.content).toBe(
        'I need to check the weather. Let me get that for you.'
      );
      expect(result.choices[0].message.tool_calls).toEqual([
        {
          id: 'call-123',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"location": "New York"}',
          },
        },
      ]);
      expect(result.choices[0].finish_reason).toBe('tool_calls');
    });

    it('should handle empty content correctly', () => {
      const responsesResponse: ResponsesResponse = {
        id: 'resp-123',
        object: 'response',
        created: 1234567890,
        model: 'gpt-4',
        output: [],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 0,
          total_tokens: 10,
        },
      };

      const result = transformer.transformResponse(responsesResponse);

      expect(result.choices[0].message.content).toBeNull();
    });
  });

  describe('transformStreamChunk', () => {
    it('should transform text stream chunk correctly', () => {
      const streamChunk: ResponsesStreamChunk = {
        id: 'chunk-123',
        object: 'response.chunk',
        created: 1234567890,
        model: 'gpt-4',
        output: [
          {
            type: 'text',
            text: 'Hello',
          },
        ],
      };

      const result = transformer.transformStreamChunk(streamChunk);

      expect(result).toEqual({
        id: 'chunk-123',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            delta: {
              content: 'Hello',
            },
            finish_reason: null,
          },
        ],
      });
    });

    it('should handle completion chunk correctly', () => {
      const streamChunk: ResponsesStreamChunk = {
        id: 'chunk-123',
        object: 'response.chunk',
        created: 1234567890,
        model: 'gpt-4',
        output: [
          {
            type: 'reasoning',
            reasoning: {
              content: 'Thinking complete',
              status: 'completed',
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      const result = transformer.transformStreamChunk(streamChunk);

      expect(result).toEqual({
        id: 'chunk-123',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
          },
        ],
      });
    });

    it('should handle tool call stream chunk correctly', () => {
      const streamChunk: ResponsesStreamChunk = {
        id: 'chunk-123',
        object: 'response.chunk',
        created: 1234567890,
        model: 'gpt-4',
        output: [
          {
            type: 'tool_call',
            tool_call: {
              id: 'call-123',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"location": "New York"}',
              },
            },
          },
        ],
      };

      const result = transformer.transformStreamChunk(streamChunk);

      expect(result.choices[0].delta.tool_calls).toEqual([
        {
          id: 'call-123',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"location": "New York"}',
          },
        },
      ]);
    });

    it('should skip reasoning content in streaming', () => {
      const streamChunk: ResponsesStreamChunk = {
        id: 'chunk-123',
        object: 'response.chunk',
        created: 1234567890,
        model: 'gpt-4',
        output: [
          {
            type: 'reasoning',
            reasoning: {
              content: 'Still thinking...',
              status: 'in_progress',
            },
          },
        ],
      };

      const result = transformer.transformStreamChunk(streamChunk);

      expect(result.choices[0].delta).toEqual({
        role: 'assistant',
      });
    });

    it('should handle empty stream chunk', () => {
      const streamChunk: ResponsesStreamChunk = {
        id: 'chunk-123',
        object: 'response.chunk',
        created: 1234567890,
        model: 'gpt-4',
        output: [],
      };

      const result = transformer.transformStreamChunk(streamChunk);

      expect(result.choices[0].delta).toEqual({
        role: 'assistant',
      });
    });
  });

  describe('transformError', () => {
    it('should transform invalid_request error correctly', () => {
      const error: ResponsesAPIError = {
        type: 'invalid_request',
        code: 'invalid_parameter',
        message: 'The parameter is invalid',
        param: 'temperature',
      };

      const result = transformer.transformError(error);

      expect(result).toEqual({
        error: {
          message: 'The parameter is invalid',
          type: 'invalid_request_error',
          code: 'invalid_parameter',
          param: 'temperature',
        },
      });
    });

    it('should transform authentication error correctly', () => {
      const error: ResponsesAPIError = {
        type: 'authentication',
        code: 'invalid_api_key',
        message: 'Invalid API key provided',
      };

      const result = transformer.transformError(error);

      expect(result).toEqual({
        error: {
          message: 'Invalid API key provided',
          type: 'authentication_error',
          code: 'invalid_api_key',
          param: undefined,
        },
      });
    });

    it('should transform rate_limit error correctly', () => {
      const error: ResponsesAPIError = {
        type: 'rate_limit',
        code: 'rate_limit_exceeded',
        message: 'Rate limit exceeded',
      };

      const result = transformer.transformError(error);

      expect(result).toEqual({
        error: {
          message: 'Rate limit exceeded',
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded',
          param: undefined,
        },
      });
    });

    it('should transform server_error to api_error', () => {
      const error: ResponsesAPIError = {
        type: 'server_error',
        code: 'internal_error',
        message: 'Internal server error',
      };

      const result = transformer.transformError(error);

      expect(result).toEqual({
        error: {
          message: 'Internal server error',
          type: 'api_error',
          code: 'internal_error',
          param: undefined,
        },
      });
    });

    it('should sanitize sensitive information in error messages', () => {
      const error: ResponsesAPIError = {
        type: 'authentication',
        code: 'invalid_api_key',
        message:
          'Invalid API key: sk-1234567890abcdef and email user@example.com',
      };

      const result = transformer.transformError(error);

      expect(result.error.message).toBe(
        'Invalid API key: api_key=[REDACTED] and email [EMAIL_REDACTED]'
      );
    });
  });

  describe('factory functions', () => {
    it('should create transformer instance', () => {
      const transformer = createResponsesToOpenAITransformer(correlationId);
      expect(transformer).toBeInstanceOf(ResponsesToOpenAITransformer);
    });

    it('should transform response using convenience function', () => {
      const responsesResponse: ResponsesResponse = {
        id: 'resp-123',
        object: 'response',
        created: 1234567890,
        model: 'gpt-4',
        output: [
          {
            type: 'text',
            text: 'Test response',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      const result = transformResponsesToOpenAI(
        responsesResponse,
        correlationId
      );

      expect(result.id).toBe('resp-123');
      expect(result.choices[0].message.content).toBe('Test response');
    });

    it('should transform stream chunk using convenience function', () => {
      const streamChunk: ResponsesStreamChunk = {
        id: 'chunk-123',
        object: 'response.chunk',
        created: 1234567890,
        model: 'gpt-4',
        output: [
          {
            type: 'text',
            text: 'Stream text',
          },
        ],
      };

      const result = transformResponsesStreamToOpenAI(
        streamChunk,
        correlationId
      );

      expect(result.choices[0].delta.content).toBe('Stream text');
    });

    it('should transform error using convenience function', () => {
      const error: ResponsesAPIError = {
        type: 'invalid_request',
        code: 'test_error',
        message: 'Test error message',
      };

      const result = transformResponsesErrorToOpenAI(error, correlationId);

      expect(result).toEqual({
        error: {
          message: 'Test error message',
          type: 'invalid_request_error',
          code: 'test_error',
          param: undefined,
        },
      });
    });
  });
});
