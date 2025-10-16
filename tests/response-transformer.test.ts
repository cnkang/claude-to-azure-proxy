import { describe, it, expect } from 'vitest';
import {
  transformAzureResponseToClaude,
  transformAzureResponseByFormat,
  createErrorResponseByFormat,
  transformAzureStreamResponseToClaude,
  validateResponseIntegrity,
  createDefensiveResponseHandler,
  extractErrorInfo,
  isAzureOpenAIResponse as isOpenAIResponse,
  isAzureOpenAIStreamResponse as isOpenAIStreamResponse,
  isAzureOpenAIError as isOpenAIError,
} from '../src/utils/response-transformer.js';
import type {
  OpenAIResponse,
  OpenAIStreamChunk,
  OpenAIError,
  ClaudeResponse,
  ClaudeError,
  ResponseSizeLimits,
} from '../src/types/index.js';

describe('Response Transformer', () => {
  const mockCorrelationId = 'test-correlation-id';

  describe('Type Guards', () => {
    describe('isOpenAIResponse', () => {
      it('should validate correct Azure OpenAI response', () => {
        const validResponse: OpenAIResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1640995200,
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
        };

        expect(isOpenAIResponse(validResponse)).toBe(true);
      });

      it('should reject invalid response structures', () => {
        expect(isOpenAIResponse(null)).toBe(false);
        expect(isOpenAIResponse(undefined)).toBe(false);
        expect(isOpenAIResponse('string')).toBe(false);
        expect(isOpenAIResponse({})).toBe(false);
        expect(isOpenAIResponse({ id: 'test' })).toBe(false);
      });

      it('should reject response with invalid choices', () => {
        const invalidResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1640995200,
          model: 'gpt-4',
          choices: [{ invalid: 'choice' }],
        };

        expect(isOpenAIResponse(invalidResponse)).toBe(false);
      });
    });

    describe('isOpenAIStreamResponse', () => {
      it('should validate correct Azure OpenAI stream response', () => {
        const validStreamResponse: OpenAIStreamChunk = {
          id: 'chatcmpl-123',
          object: 'chat.completion.chunk',
          created: 1640995200,
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                content: 'Hello',
              },
              finish_reason: null,
            },
          ],
        };

        expect(isOpenAIStreamResponse(validStreamResponse)).toBe(true);
      });

      it('should reject invalid stream response structures', () => {
        expect(isOpenAIStreamResponse(null)).toBe(false);
        expect(isOpenAIStreamResponse({ object: 'chat.completion' })).toBe(
          false
        );
      });
    });

    describe('isOpenAIError', () => {
      it('should validate correct Azure OpenAI error response', () => {
        const validError: OpenAIError = {
          error: {
            message: 'Invalid request',
            type: 'invalid_request_error',
            code: 'invalid_parameter',
          },
        };

        expect(isOpenAIError(validError)).toBe(true);
      });

      it('should reject invalid error structures', () => {
        expect(isOpenAIError(null)).toBe(false);
        expect(isOpenAIError({ error: 'string' })).toBe(false);
        expect(isOpenAIError({ error: {} })).toBe(false);
      });
    });
  });

  describe('transformAzureResponseToClaude', () => {
    it('should transform successful Azure OpenAI response to Claude format', () => {
      const azureResponse: OpenAIResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1640995200,
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
      };

      const result = transformAzureResponseToClaude(
        azureResponse,
        200,
        mockCorrelationId
      );

      expect(result.statusCode).toBe(200);
      expect(result.headers['Content-Type']).toBe('application/json');
      expect(result.headers['X-Correlation-ID']).toBe(mockCorrelationId);

      const claudeResponse = result.claudeResponse as ClaudeResponse;
      expect(claudeResponse.id).toBe('chatcmpl-123');
      expect(claudeResponse.type).toBe('message');
      expect(claudeResponse.role).toBe('assistant');
      expect(claudeResponse.content).toHaveLength(1);
      expect(claudeResponse.content[0].type).toBe('text');
      expect(claudeResponse.content[0].text).toBe('Hello, world!');
      expect(claudeResponse.model).toBe('claude-3-5-sonnet-20241022');
      expect(claudeResponse.stop_reason).toBe('end_turn');
      expect(claudeResponse.usage).toEqual({
        input_tokens: 10,
        output_tokens: 5,
      });
    });

    it('should transform Azure OpenAI error to Claude error format', () => {
      const azureError: OpenAIError = {
        error: {
          message: 'Invalid request parameter',
          type: 'invalid_request_error',
          code: 'invalid_parameter',
        },
      };

      const result = transformAzureResponseToClaude(
        azureError,
        400,
        mockCorrelationId
      );

      expect(result.statusCode).toBe(400);
      const claudeError = result.claudeResponse as ClaudeError;
      expect(claudeError.type).toBe('error');
      expect(claudeError.error.type).toBe('invalid_request_error');
      expect(claudeError.error.message).toBe('Invalid request parameter');
    });

    it('should handle null content in Azure response', () => {
      const azureResponse: OpenAIResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1640995200,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
            },
            finish_reason: 'content_filter',
          },
        ],
      };

      const result = transformAzureResponseToClaude(
        azureResponse,
        200,
        mockCorrelationId
      );

      const claudeResponse = result.claudeResponse as ClaudeResponse;
      expect(claudeResponse.content[0].text).toBe('');
      expect(claudeResponse.stop_reason).toBe('end_turn');
    });

    it('should sanitize sensitive content', () => {
      const azureResponse: OpenAIResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1640995200,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content:
                'Contact me at user@example.com or use Bearer abc123token',
            },
            finish_reason: 'stop',
          },
        ],
      };

      const result = transformAzureResponseToClaude(
        azureResponse,
        200,
        mockCorrelationId
      );

      const claudeResponse = result.claudeResponse as ClaudeResponse;
      expect(claudeResponse.content[0].text).toContain('[EMAIL_REDACTED]');
      expect(claudeResponse.content[0].text).toContain('[TOKEN_REDACTED]');
      expect(claudeResponse.content[0].text).not.toContain('user@example.com');
      expect(claudeResponse.content[0].text).not.toContain('abc123token');
    });

    it('should enforce response size limits', () => {
      const largeContent = 'x'.repeat(1000);
      const azureResponse: OpenAIResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1640995200,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: largeContent,
            },
            finish_reason: 'stop',
          },
        ],
      };

      const strictLimits: ResponseSizeLimits = {
        maxResponseSize: 500,
        maxCompletionLength: 100,
        maxChoicesCount: 1,
      };

      const result = transformAzureResponseToClaude(
        azureResponse,
        200,
        mockCorrelationId,
        strictLimits
      );

      expect(result.statusCode).toBe(500);
      const claudeError = result.claudeResponse as ClaudeError;
      expect(claudeError.type).toBe('error');
      expect(claudeError.error.type).toBe('api_error');
    });

    it('should handle malformed response gracefully', () => {
      const malformedResponse = { invalid: 'structure' };

      const result = transformAzureResponseToClaude(
        malformedResponse,
        200,
        mockCorrelationId
      );

      expect(result.statusCode).toBe(500);
      const claudeError = result.claudeResponse as ClaudeError;
      expect(claudeError.type).toBe('error');
      expect(claudeError.error.type).toBe('api_error');
    });

    it('should handle response with no choices', () => {
      const azureResponse: OpenAIResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1640995200,
        model: 'gpt-4',
        choices: [],
      };

      const result = transformAzureResponseToClaude(
        azureResponse,
        200,
        mockCorrelationId
      );

      expect(result.statusCode).toBe(500);
      const claudeError = result.claudeResponse as ClaudeError;
      expect(claudeError.type).toBe('error');
    });
  });

  describe('transformAzureStreamResponseToClaude', () => {
    it('should transform Azure stream response to Claude format', () => {
      const azureStreamResponse: OpenAIStreamChunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1640995200,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
              content: 'Hello',
            },
            finish_reason: null,
          },
        ],
      };

      const result = transformAzureStreamResponseToClaude(
        azureStreamResponse,
        mockCorrelationId
      );

      expect(result.isComplete).toBe(false);
      expect(result.claudeStreamResponse.type).toBe('content_block_delta');
      expect(result.claudeStreamResponse.delta?.text).toBe('Hello');
    });

    it('should handle stream completion', () => {
      const azureStreamResponse: OpenAIStreamChunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1640995200,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
          },
        ],
      };

      const result = transformAzureStreamResponseToClaude(
        azureStreamResponse,
        mockCorrelationId
      );

      expect(result.isComplete).toBe(true);
      expect(result.claudeStreamResponse.type).toBe('message_stop');
    });

    it('should handle malformed stream response gracefully', () => {
      const malformedResponse = { invalid: 'structure' };

      const result = transformAzureStreamResponseToClaude(
        malformedResponse,
        mockCorrelationId
      );

      expect(result.isComplete).toBe(true);
      expect(result.claudeStreamResponse.type).toBe('message_stop');
    });
  });

  describe('validateResponseIntegrity', () => {
    it('should validate correct response structure', () => {
      const validResponse: OpenAIResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1640995200,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello',
            },
            finish_reason: 'stop',
          },
        ],
      };

      expect(() =>
        validateResponseIntegrity(validResponse, mockCorrelationId)
      ).not.toThrow();
      expect(validateResponseIntegrity(validResponse, mockCorrelationId)).toBe(
        true
      );
    });

    it('should throw validation error for missing id', () => {
      const invalidResponse = {
        object: 'chat.completion',
        created: 1640995200,
        model: 'gpt-4',
        choices: [],
      };

      expect(() =>
        validateResponseIntegrity(invalidResponse, mockCorrelationId)
      ).toThrow();
    });

    it('should throw validation error for non-object response', () => {
      expect(() =>
        validateResponseIntegrity(null, mockCorrelationId)
      ).toThrow();
      expect(() =>
        validateResponseIntegrity('string', mockCorrelationId)
      ).toThrow();
    });
  });

  describe('createDefensiveResponseHandler', () => {
    it('should handle successful transformation', () => {
      const handler = createDefensiveResponseHandler(mockCorrelationId);
      const azureResponse: OpenAIResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1640995200,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello',
            },
            finish_reason: 'stop',
          },
        ],
      };

      const result = handler(azureResponse, 200);

      expect(result.statusCode).toBe(200);
      const claudeResponse = result.claudeResponse as ClaudeResponse;
      expect(claudeResponse.type).toBe('message');
    });

    it('should provide fallback for failed transformation', () => {
      const handler = createDefensiveResponseHandler(mockCorrelationId);
      const malformedResponse = { invalid: 'structure' };

      const result = handler(malformedResponse, 200);

      // The normal transformation function handles errors internally and returns 500
      // The defensive handler only provides 503 fallback when the transformation throws
      expect(result.statusCode).toBe(500);
      const claudeError = result.claudeResponse as ClaudeError;
      expect(claudeError.type).toBe('error');
      expect(claudeError.error.type).toBe('api_error');
    });

    it('should handle errors from transformation function gracefully', () => {
      // Create a response with size limit violation
      const strictLimits: ResponseSizeLimits = {
        maxResponseSize: 10, // Very small limit
        maxCompletionLength: 1,
        maxChoicesCount: 1,
      };

      const handlerWithLimits = createDefensiveResponseHandler(
        mockCorrelationId,
        strictLimits
      );

      const largeResponse = {
        id: 'test-id-that-exceeds-the-size-limit-significantly',
        object: 'chat.completion',
        created: 1640995200,
        model: 'gpt-4',
        choices: [],
      };

      const result = handlerWithLimits(largeResponse, 200);

      // The transformation function handles the size limit error internally and returns 500
      expect(result.statusCode).toBe(500);
      const claudeError = result.claudeResponse as ClaudeError;
      expect(claudeError.type).toBe('error');
      expect(claudeError.error.type).toBe('api_error');
    });
  });

  describe('extractErrorInfo', () => {
    it('should extract error information with correct status codes', () => {
      const testCases = [
        { type: 'invalid_request_error', expectedStatus: 400 },
        { type: 'authentication_error', expectedStatus: 401 },
        { type: 'permission_error', expectedStatus: 403 },
        { type: 'not_found_error', expectedStatus: 404 },
        { type: 'rate_limit_error', expectedStatus: 429 },
        { type: 'api_error', expectedStatus: 503 },
        { type: 'overloaded_error', expectedStatus: 503 },
        { type: 'unknown_error', expectedStatus: 500 },
      ];

      testCases.forEach(({ type, expectedStatus }) => {
        const azureError: OpenAIError = {
          error: {
            message: `Test ${type}`,
            type,
            code: 'test_code',
          },
        };

        const result = extractErrorInfo(azureError);

        expect(result.type).toBe(type);
        expect(result.message).toBe(`Test ${type}`);
        expect(result.statusCode).toBe(expectedStatus);
      });
    });

    it('should sanitize error messages', () => {
      const azureError: OpenAIError = {
        error: {
          message: 'Error with email user@example.com and Bearer token123',
          type: 'invalid_request_error',
        },
      };

      const result = extractErrorInfo(azureError);

      expect(result.message).toContain('[EMAIL_REDACTED]');
      expect(result.message).toContain('[TOKEN_REDACTED]');
      expect(result.message).not.toContain('user@example.com');
      expect(result.message).not.toContain('token123');
    });
  });

  describe('Finish Reason Mapping', () => {
    it('should map Azure finish reasons to Claude format', () => {
      const testCases = [
        { azure: 'stop', claude: 'end_turn' },
        { azure: 'length', claude: 'max_tokens' },
        { azure: 'content_filter', claude: 'end_turn' },
        { azure: null, claude: null },
      ];

      testCases.forEach(({ azure, claude }) => {
        const azureResponse: OpenAIResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1640995200,
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Test',
              },
              finish_reason: azure as 'stop' | 'length' | 'content_filter',
            },
          ],
        };

        const result = transformAzureResponseToClaude(
          azureResponse,
          200,
          mockCorrelationId
        );
        const { claudeResponse } = result;
        expect(claudeResponse).toBeDefined();
        if (claudeResponse.type !== 'message') {
          throw new Error('Expected message response');
        }

        expect(claudeResponse.stop_reason).toBe(claude);
      });
    });
  });

  describe('Content Sanitization', () => {
    it('should sanitize various sensitive patterns', () => {
      const sensitiveContent = `
        Email: user@example.com
        Credit Card: 1234-5678-9012-3456
        SSN: 123-45-6789
        Bearer Token: Bearer abc123def456
        API Key: api_key=secret123
      `;

      const azureResponse: OpenAIResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1640995200,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: sensitiveContent,
            },
            finish_reason: 'stop',
          },
        ],
      };

      const result = transformAzureResponseToClaude(
        azureResponse,
        200,
        mockCorrelationId
      );
      const claudeResponse = result.claudeResponse as ClaudeResponse;

      expect(claudeResponse.content[0].text).toContain('[EMAIL_REDACTED]');
      expect(claudeResponse.content[0].text).toContain('[CARD_REDACTED]');
      expect(claudeResponse.content[0].text).toContain('[SSN_REDACTED]');
      expect(claudeResponse.content[0].text).toContain('[TOKEN_REDACTED]');
      expect(claudeResponse.content[0].text).toContain('[KEY_REDACTED]');

      expect(claudeResponse.content[0].text).not.toContain('user@example.com');
      expect(claudeResponse.content[0].text).not.toContain(
        '1234-5678-9012-3456'
      );
      expect(claudeResponse.content[0].text).not.toContain('123-45-6789');
      expect(claudeResponse.content[0].text).not.toContain('abc123def456');
      expect(claudeResponse.content[0].text).not.toContain('secret123');
    });
  });

  describe('Format-Aware Response Transformation', () => {
    describe('transformAzureResponseByFormat', () => {
      it('should transform to Claude format when requested', () => {
        const azureResponse: OpenAIResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1640995200,
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
        };

        const result = transformAzureResponseByFormat(
          azureResponse,
          200,
          mockCorrelationId,
          'claude'
        );

        expect(result.format).toBe('claude');
        expect(result.statusCode).toBe(200);
        expect(result.response).toHaveProperty('type', 'message');
        expect(result.response).toHaveProperty('role', 'assistant');
        expect(result.response).toHaveProperty('content');
        expect(Array.isArray((result.response as ClaudeResponse).content)).toBe(
          true
        );
      });

      it('should transform to OpenAI format when requested', () => {
        const azureResponse: OpenAIResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1640995200,
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
        };

        const result = transformAzureResponseByFormat(
          azureResponse,
          200,
          mockCorrelationId,
          'openai'
        );

        expect(result.format).toBe('openai');
        expect(result.statusCode).toBe(200);
        expect(result.response).toHaveProperty('id', 'chatcmpl-123');
        expect(result.response).toHaveProperty('object', 'chat.completion');
        expect(result.response).toHaveProperty('choices');
        expect(Array.isArray((result.response as OpenAIResponse).choices)).toBe(
          true
        );
      });

      it('should handle errors in Claude format', () => {
        const azureError: OpenAIError = {
          error: {
            message: 'Invalid request',
            type: 'invalid_request_error',
          },
        };

        const result = transformAzureResponseByFormat(
          azureError,
          400,
          mockCorrelationId,
          'claude'
        );

        expect(result.format).toBe('claude');
        expect(result.statusCode).toBe(400);
        expect(result.response).toHaveProperty('type', 'error');
        expect((result.response as ClaudeError).error).toHaveProperty(
          'type',
          'invalid_request_error'
        );
      });

      it('should handle errors in OpenAI format', () => {
        const azureError: OpenAIError = {
          error: {
            message: 'Invalid request',
            type: 'invalid_request_error',
          },
        };

        const result = transformAzureResponseByFormat(
          azureError,
          400,
          mockCorrelationId,
          'openai'
        );

        expect(result.format).toBe('openai');
        expect(result.statusCode).toBe(400);
        expect(result.response).toHaveProperty('error');
        expect((result.response as OpenAIError).error).toHaveProperty(
          'type',
          'invalid_request_error'
        );
        expect(result.response).not.toHaveProperty('type'); // Should not have Claude-style root type
      });
    });

    describe('createErrorResponseByFormat', () => {
      it('should create Claude format error', () => {
        const result = createErrorResponseByFormat(
          'invalid_request_error',
          'Test error message',
          400,
          mockCorrelationId,
          'claude'
        );

        expect(result.format).toBe('claude');
        expect(result.statusCode).toBe(400);
        expect(result.response).toHaveProperty('type', 'error');
        expect((result.response as ClaudeError).error).toHaveProperty(
          'type',
          'invalid_request_error'
        );
        expect((result.response as ClaudeError).error).toHaveProperty(
          'message',
          'Test error message'
        );
        expect(result.headers).toHaveProperty(
          'Content-Type',
          'application/json'
        );
        expect(result.headers).toHaveProperty(
          'X-Correlation-ID',
          mockCorrelationId
        );
      });

      it('should create OpenAI format error', () => {
        const result = createErrorResponseByFormat(
          'authentication_error',
          'Authentication failed',
          401,
          mockCorrelationId,
          'openai'
        );

        expect(result.format).toBe('openai');
        expect(result.statusCode).toBe(401);
        expect(result.response).toHaveProperty('error');
        expect((result.response as OpenAIError).error).toHaveProperty(
          'type',
          'authentication_error'
        );
        expect((result.response as OpenAIError).error).toHaveProperty(
          'message',
          'Authentication failed'
        );
        expect(result.response).not.toHaveProperty('type'); // Should not have Claude-style root type
        expect(result.headers).toHaveProperty(
          'Content-Type',
          'application/json'
        );
        expect(result.headers).toHaveProperty(
          'X-Correlation-ID',
          mockCorrelationId
        );
      });

      it('should sanitize error messages', () => {
        const result = createErrorResponseByFormat(
          'api_error',
          'Error with user@example.com and Bearer abc123',
          500,
          mockCorrelationId,
          'claude'
        );

        const errorMessage = (result.response as ClaudeError).error.message;
        expect(errorMessage).toContain('[EMAIL_REDACTED]');
        expect(errorMessage).toContain('[TOKEN_REDACTED]');
        expect(errorMessage).not.toContain('user@example.com');
        expect(errorMessage).not.toContain('abc123');
      });
    });
  });
});
