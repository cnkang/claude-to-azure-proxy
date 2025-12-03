import { beforeEach, describe, expect, it } from 'vitest';
import type {
  ResponsesAPIError,
  ResponsesResponse,
  ResponsesStreamChunk,
} from '../src/types/index';
import {
  ResponsesToClaudeTransformer,
  createResponsesToClaudeTransformer,
  transformResponsesErrorToClaude,
  transformResponsesStreamToClaude,
  transformResponsesToClaude,
} from '../src/utils/responses-to-claude-transformer';

describe('ResponsesToClaudeTransformer', () => {
  let transformer: ResponsesToClaudeTransformer;
  const correlationId = 'test-correlation-id';

  beforeEach(() => {
    transformer = new ResponsesToClaudeTransformer(correlationId);
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
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Hello, world!',
          },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 5,
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

      expect(result.content).toEqual([
        {
          type: 'text',
          text: 'Final answer',
        },
      ]);
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

      expect(result.content).toEqual([
        {
          type: 'tool_use',
          id: 'call-123',
          name: 'get_weather',
          input: { location: 'New York' },
        },
      ]);
      expect(result.stop_reason).toBe('tool_use');
    });

    it('should handle tool results correctly', () => {
      const responsesResponse: ResponsesResponse = {
        id: 'resp-123',
        object: 'response',
        created: 1234567890,
        model: 'gpt-4',
        output: [
          {
            type: 'tool_result',
            tool_result: {
              tool_call_id: 'call-123',
              content: 'Weather is sunny',
              is_error: false,
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

      expect(result.content).toEqual([
        {
          type: 'tool_result',
          tool_use_id: 'call-123',
          content: 'Weather is sunny',
          is_error: false,
        },
      ]);
    });

    it('should handle empty output by adding empty text block', () => {
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

      expect(result.content).toEqual([
        {
          type: 'text',
          text: '',
        },
      ]);
    });

    it('should handle invalid tool arguments gracefully', () => {
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
                arguments: 'invalid json',
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

      expect(result.content).toEqual([
        {
          type: 'tool_use',
          id: 'call-123',
          name: 'get_weather',
          input: {}, // Should default to empty object
        },
      ]);
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
        type: 'content_block_delta',
        delta: {
          type: 'text_delta',
          text: 'Hello',
        },
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
        type: 'message_stop',
        usage: {
          input_tokens: 10,
          output_tokens: 5,
        },
      });
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

      expect(result).toEqual({
        type: 'content_block_delta',
        delta: {
          type: 'text_delta',
          text: '',
        },
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

      expect(result).toEqual({
        type: 'content_block_delta',
        delta: {
          type: 'text_delta',
          text: '',
        },
      });
    });
  });

  describe('transformError', () => {
    it('should transform invalid_request error correctly', () => {
      const error: ResponsesAPIError = {
        type: 'invalid_request',
        code: 'invalid_parameter',
        message: 'The parameter is invalid',
      };

      const result = transformer.transformError(error);

      expect(result).toEqual({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'The parameter is invalid',
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
        type: 'error',
        error: {
          type: 'authentication_error',
          message: 'Invalid API key provided',
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
        type: 'error',
        error: {
          type: 'rate_limit_error',
          message: 'Rate limit exceeded',
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
        type: 'error',
        error: {
          type: 'api_error',
          message: 'Internal server error',
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
      const transformer = createResponsesToClaudeTransformer(correlationId);
      expect(transformer).toBeInstanceOf(ResponsesToClaudeTransformer);
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

      const result = transformResponsesToClaude(
        responsesResponse,
        correlationId
      );

      expect(result.id).toBe('resp-123');
      expect(result.content[0]).toEqual({
        type: 'text',
        text: 'Test response',
      });
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

      const result = transformResponsesStreamToClaude(
        streamChunk,
        correlationId
      );

      expect(result).toEqual({
        type: 'content_block_delta',
        delta: {
          type: 'text_delta',
          text: 'Stream text',
        },
      });
    });

    it('should transform error using convenience function', () => {
      const error: ResponsesAPIError = {
        type: 'invalid_request',
        code: 'test_error',
        message: 'Test error message',
      };

      const result = transformResponsesErrorToClaude(error, correlationId);

      expect(result).toEqual({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'Test error message',
        },
      });
    });
  });
});
