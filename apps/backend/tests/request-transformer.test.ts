import { describe, expect, it } from 'vitest';
import {
  type ClaudeCompletionRequest,
  RequestTransformationError,
  SecurityError,
  ValidationError,
  createAzureHeaders,
  transformClaudeToAzureRequest,
  transformRequest,
  validateClaudeRequest,
  validateRequestSize,
} from '../src/utils/request-transformer';

describe('Request Transformer', () => {
  const validClaudeRequest: ClaudeCompletionRequest = {
    model: 'claude-3-5-sonnet-20241022',
    prompt: 'Hello, world!',
    max_tokens: 100,
    temperature: 0.7,
    top_p: 0.9,
    stop_sequences: ['\\n\\n'],
  };

  const azureModel = 'gpt-5-codex';
  const azureApiKey = 'test-api-key-1234567890';

  describe('validateClaudeRequest', () => {
    it('should validate a correct Claude request', () => {
      const result = validateClaudeRequest(validClaudeRequest);
      expect(result).toEqual(validClaudeRequest);
    });

    it('should allow max_tokens to be undefined when not provided', () => {
      const requestWithoutMaxTokens = {
        model: 'claude-3-5-sonnet-20241022',
        prompt: 'Hello, world!',
        // max_tokens intentionally omitted
      };

      const result = validateClaudeRequest(requestWithoutMaxTokens);
      expect(result.max_tokens).toBeUndefined();
    });

    it('should validate chat completion request with string content', () => {
      const chatRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user' as const,
            content: 'Hello, world!',
          },
        ],
        max_tokens: 100,
      };

      const result = validateClaudeRequest(chatRequest);
      expect(result).toEqual(chatRequest);
    });

    it('should validate chat completion request with content blocks', () => {
      const chatRequestWithBlocks = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user' as const,
            content: [
              {
                type: 'text' as const,
                text: '你好啊',
              },
            ],
          },
        ],
        max_tokens: 100,
      };

      const result = validateClaudeRequest(chatRequestWithBlocks);
      expect(result).toEqual(chatRequestWithBlocks);
    });

    it('should validate chat completion request with multiple content blocks', () => {
      const chatRequestWithMultipleBlocks = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user' as const,
            content: [
              {
                type: 'text' as const,
                text: 'First part: ',
              },
              {
                type: 'text' as const,
                text: '你好啊',
              },
            ],
          },
        ],
        max_tokens: 100,
      };

      const result = validateClaudeRequest(chatRequestWithMultipleBlocks);
      expect(result).toEqual(chatRequestWithMultipleBlocks);
    });

    it('should allow max_tokens to be undefined for chat completion requests', () => {
      const chatRequestWithoutMaxTokens = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user' as const,
            content: 'Hello, world!',
          },
        ],
        // max_tokens intentionally omitted
      };

      const result = validateClaudeRequest(chatRequestWithoutMaxTokens);
      expect(result.max_tokens).toBeUndefined();
    });

    it('should throw ValidationError for missing required fields', () => {
      const invalidRequest = {
        model: 'claude-3-5-sonnet-20241022',
        // missing prompt and max_tokens
      };

      expect(() => validateClaudeRequest(invalidRequest)).toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for invalid model name', () => {
      const invalidRequest = {
        ...validClaudeRequest,
        model: 'invalid@model#name',
      };

      expect(() => validateClaudeRequest(invalidRequest)).toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for empty prompt', () => {
      const invalidRequest = {
        ...validClaudeRequest,
        prompt: '',
      };

      expect(() => validateClaudeRequest(invalidRequest)).toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for max_tokens out of range', () => {
      const invalidRequest = {
        ...validClaudeRequest,
        max_tokens: 200000, // exceeds 131072 limit
      };

      expect(() => validateClaudeRequest(invalidRequest)).toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for temperature out of range', () => {
      const invalidRequest = {
        ...validClaudeRequest,
        temperature: 3.0, // exceeds limit
      };

      expect(() => validateClaudeRequest(invalidRequest)).toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for top_p out of range', () => {
      const invalidRequest = {
        ...validClaudeRequest,
        top_p: 1.5, // exceeds limit
      };

      expect(() => validateClaudeRequest(invalidRequest)).toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for too many stop sequences', () => {
      const invalidRequest = {
        ...validClaudeRequest,
        stop_sequences: ['\\n', '\\n\\n', 'END', 'STOP', 'FINISH'], // too many
      };

      expect(() => validateClaudeRequest(invalidRequest)).toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for empty content blocks array', () => {
      const invalidChatRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user' as const,
            content: [], // empty array not allowed
          },
        ],
        max_tokens: 100,
      };

      expect(() => validateClaudeRequest(invalidChatRequest)).toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for invalid content block type', () => {
      const invalidChatRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user' as const,
            content: [
              {
                type: 'image' as 'text', // invalid type for testing
                text: 'Hello',
              },
            ],
          },
        ],
        max_tokens: 100,
      };

      expect(() => validateClaudeRequest(invalidChatRequest)).toThrow(
        ValidationError
      );
    });

    it('should handle content block with empty text (sanitized)', () => {
      const requestWithEmptyText = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user' as const,
            content: [
              {
                type: 'text' as const,
                text: '', // empty text is now allowed and will be sanitized
              },
            ],
          },
        ],
        max_tokens: 100,
      };

      // Empty text is now allowed and will be sanitized with default content
      const result = validateClaudeRequest(requestWithEmptyText);
      expect(result).toBeDefined();
      expect(result.messages[0].content).toBeDefined();
    });

    it('should throw ValidationError for request with both prompt and messages', () => {
      const invalidRequest = {
        model: 'claude-3-5-sonnet-20241022',
        prompt: 'Hello',
        messages: [
          {
            role: 'user' as const,
            content: 'World',
          },
        ],
        max_tokens: 100,
      };

      expect(() => validateClaudeRequest(invalidRequest)).toThrow(
        ValidationError
      );
    });

    it('should sanitize prompt by removing control characters', () => {
      const requestWithControlChars = {
        ...validClaudeRequest,
        prompt: 'Hello\x00\x01world\x7F',
      };

      const result = validateClaudeRequest(requestWithControlChars);
      expect(result.prompt).toBe('Helloworld');
    });

    it('should sanitize content blocks by removing control characters', () => {
      const chatRequestWithControlChars = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user' as const,
            content: [
              {
                type: 'text' as const,
                text: 'Hello\x00\x01world\x7F',
              },
            ],
          },
        ],
        max_tokens: 100,
      };

      const result = validateClaudeRequest(chatRequestWithControlChars);
      expect(result.messages[0].content[0].text).toBe('Helloworld');
    });

    it('should throw SecurityError for template injection patterns', () => {
      const maliciousRequest = {
        ...validClaudeRequest,
        prompt: 'Hello {{constructor}} world',
      };

      expect(() => validateClaudeRequest(maliciousRequest)).toThrow(
        SecurityError
      );
    });

    it('should throw SecurityError for script tags', () => {
      const maliciousRequest = {
        ...validClaudeRequest,
        prompt: 'Hello <script>alert("xss")</script> world',
      };

      expect(() => validateClaudeRequest(maliciousRequest)).toThrow(
        SecurityError
      );
    });

    it('should throw SecurityError for javascript protocol', () => {
      const maliciousRequest = {
        ...validClaudeRequest,
        prompt: 'Click here: javascript:alert("xss")',
      };

      expect(() => validateClaudeRequest(maliciousRequest)).toThrow(
        SecurityError
      );
    });

    it('should strip unknown properties', () => {
      const requestWithExtra = {
        ...validClaudeRequest,
        unknownProperty: 'should be removed',
        anotherUnknown: 123,
      };

      const result = validateClaudeRequest(requestWithExtra);
      expect(result).not.toHaveProperty('unknownProperty');
      expect(result).not.toHaveProperty('anotherUnknown');
    });
  });

  describe('transformClaudeToAzureRequest', () => {
    it('should transform Claude request to Azure OpenAI format', () => {
      const result = transformClaudeToAzureRequest(
        validClaudeRequest,
        azureModel
      );

      expect(result.model).toBe(azureModel);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toEqual({
        role: 'user',
        content: validClaudeRequest.prompt,
      });
      expect(result.max_completion_tokens).toBe(validClaudeRequest.max_tokens);
      expect(result.temperature).toBe(validClaudeRequest.temperature);
      expect(result.top_p).toBe(validClaudeRequest.top_p);
      expect(result.stop).toEqual(validClaudeRequest.stop_sequences);
      expect(result.user).toBeDefined();
    });

    it('should transform chat completion request with string content', () => {
      const chatRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user' as const,
            content: 'Hello, world!',
          },
        ],
        max_tokens: 100,
      };

      const result = transformClaudeToAzureRequest(chatRequest, azureModel);

      expect(result.model).toBe(azureModel);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toEqual({
        role: 'user',
        content: 'Hello, world!',
      });
      expect(result.max_completion_tokens).toBe(100);
    });

    it('should transform chat completion request with content blocks to string', () => {
      const chatRequestWithBlocks = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user' as const,
            content: [
              {
                type: 'text' as const,
                text: '你好啊',
              },
            ],
          },
        ],
        max_tokens: 100,
      };

      const result = transformClaudeToAzureRequest(
        chatRequestWithBlocks,
        azureModel
      );

      expect(result.model).toBe(azureModel);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toEqual({
        role: 'user',
        content: '你好啊',
      });
      expect(result.max_completion_tokens).toBe(100);
    });

    it('should transform multiple content blocks to concatenated string', () => {
      const chatRequestWithMultipleBlocks = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user' as const,
            content: [
              {
                type: 'text' as const,
                text: 'First part: ',
              },
              {
                type: 'text' as const,
                text: '你好啊',
              },
            ],
          },
        ],
        max_tokens: 100,
      };

      const result = transformClaudeToAzureRequest(
        chatRequestWithMultipleBlocks,
        azureModel
      );

      expect(result.model).toBe(azureModel);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toEqual({
        role: 'user',
        content: 'First part: \n你好啊',
      });
      expect(result.max_completion_tokens).toBe(100);
    });

    it('should handle minimal Claude request', () => {
      const minimalRequest: ClaudeCompletionRequest = {
        model: 'claude-3-5-sonnet-20241022',
        prompt: 'Hello',
        max_tokens: 50,
      };

      const result = transformClaudeToAzureRequest(minimalRequest, azureModel);

      expect(result.model).toBe(azureModel);
      expect(result.messages[0].content).toBe('Hello');
      expect(result.max_completion_tokens).toBe(50);
      expect(result.temperature).toBeUndefined();
      expect(result.top_p).toBeUndefined();
      expect(result.stop).toBeUndefined();
    });

    it('should not include max_completion_tokens when max_tokens is not provided', () => {
      const requestWithoutMaxTokens = {
        model: 'claude-3-5-sonnet-20241022',
        prompt: 'Hello',
        // max_tokens intentionally omitted
      } as ClaudeCompletionRequest;

      const result = transformClaudeToAzureRequest(
        requestWithoutMaxTokens,
        azureModel
      );

      expect(result.model).toBe(azureModel);
      expect(result.messages[0].content).toBe('Hello');
      expect(result.max_completion_tokens).toBeUndefined();
      expect(result.temperature).toBeUndefined();
      expect(result.top_p).toBeUndefined();
      expect(result.stop).toBeUndefined();
    });

    it('should handle empty stop_sequences array', () => {
      const requestWithEmptyStop = {
        ...validClaudeRequest,
        stop_sequences: [] as readonly string[],
      };

      const result = transformClaudeToAzureRequest(
        requestWithEmptyStop,
        azureModel
      );
      expect(result.stop).toBeUndefined();
    });
  });

  describe('createAzureHeaders', () => {
    it('should create proper Azure OpenAI headers', () => {
      const headers = createAzureHeaders(azureApiKey);

      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['api-key']).toBe(azureApiKey);
      expect(headers['User-Agent']).toBe('claude-to-azure-proxy/2.0.0');
      expect(headers['X-Request-ID']).toBeDefined();
      expect(headers['X-Request-ID']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    });

    it('should use provided request ID', () => {
      const customRequestId = 'custom-request-id';
      const headers = createAzureHeaders(azureApiKey, customRequestId);

      expect(headers['X-Request-ID']).toBe(customRequestId);
    });

    it('should throw SecurityError for invalid API key', () => {
      expect(() => createAzureHeaders('')).toThrow(SecurityError);
      expect(() => createAzureHeaders('short')).toThrow(SecurityError);
      expect(() => createAzureHeaders(null as unknown as string)).toThrow(
        SecurityError
      );
    });
  });

  describe('validateRequestSize', () => {
    it('should pass for normal-sized requests', () => {
      expect(() => validateRequestSize(validClaudeRequest)).not.toThrow();
    });

    it('should throw ValidationError for oversized requests', () => {
      const largeRequest = {
        ...validClaudeRequest,
        prompt: 'x'.repeat(10 * 1024 * 1024 + 1), // Over 10MB
      };

      expect(() => validateRequestSize(largeRequest)).toThrow(ValidationError);
    });
  });

  describe('transformRequest (integration)', () => {
    it('should successfully transform a valid request', () => {
      const result = transformRequest(
        validClaudeRequest,
        azureModel,
        azureApiKey
      );

      expect(result.azureRequest).toBeDefined();
      expect(result.headers).toBeDefined();
      expect(result.requestId).toBeDefined();

      const azureReq = result.azureRequest;
      expect(azureReq.model).toBe(azureModel);
      expect(azureReq.messages[0].content).toBe(validClaudeRequest.prompt);
      expect(azureReq.max_completion_tokens).toBe(
        validClaudeRequest.max_tokens
      );

      expect(result.headers['api-key']).toBe(azureApiKey);
      expect(result.headers['X-Request-ID']).toBe(result.requestId);
    });

    it('should throw ValidationError for invalid input', () => {
      const invalidRequest = {
        model: 'invalid@model',
        prompt: '',
        max_tokens: -1,
      };

      expect(() =>
        transformRequest(invalidRequest, azureModel, azureApiKey)
      ).toThrow(ValidationError);
    });

    it('should throw SecurityError for malicious input', () => {
      const maliciousRequest = {
        ...validClaudeRequest,
        prompt: 'Hello {{__proto__}} world',
      };

      expect(() =>
        transformRequest(maliciousRequest, azureModel, azureApiKey)
      ).toThrow(SecurityError);
    });

    it('should throw ValidationError for oversized request', () => {
      const largeRequest = {
        ...validClaudeRequest,
        prompt: 'x'.repeat(10 * 1024 * 1024 + 1), // Over 10MB
      };

      expect(() =>
        transformRequest(largeRequest, azureModel, azureApiKey)
      ).toThrow(ValidationError);
    });

    it('should handle transformation errors gracefully', () => {
      // Test with null input to trigger unexpected error path
      expect(() =>
        transformRequest(null as unknown, azureModel, azureApiKey)
      ).toThrow(RequestTransformationError);
    });
  });

  describe('Error Classes', () => {
    it('should create RequestTransformationError with proper properties', () => {
      const error = new RequestTransformationError(
        'Test message',
        'TEST_CODE',
        { detail: 'test' }
      );

      expect(error.name).toBe('RequestTransformationError');
      expect(error.message).toBe('Test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.details).toEqual({ detail: 'test' });
    });

    it('should create ValidationError as subclass', () => {
      const error = new ValidationError('Validation failed', { field: 'test' });

      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error instanceof RequestTransformationError).toBe(true);
    });

    it('should create SecurityError as subclass', () => {
      const error = new SecurityError('Security violation');

      expect(error.name).toBe('SecurityError');
      expect(error.code).toBe('SECURITY_ERROR');
      expect(error instanceof RequestTransformationError).toBe(true);
    });
  });

  describe('Immutability', () => {
    it('should return readonly objects', () => {
      const result = transformRequest(
        validClaudeRequest,
        azureModel,
        azureApiKey
      );

      // TypeScript should enforce readonly, but we can test runtime behavior
      expect(() => {
        (result as { requestId: string }).requestId = 'modified';
      }).not.toThrow(); // JavaScript allows this, but TypeScript prevents it

      // Test that the original request is not modified
      const originalPrompt = validClaudeRequest.prompt;
      transformRequest(validClaudeRequest, azureModel, azureApiKey);
      expect(validClaudeRequest.prompt).toBe(originalPrompt);
    });

    it('should not modify input objects', () => {
      const inputRequest = { ...validClaudeRequest };
      const originalPrompt = inputRequest.prompt;

      transformRequest(inputRequest, azureModel, azureApiKey);

      expect(inputRequest.prompt).toBe(originalPrompt);
      expect(inputRequest).toEqual(validClaudeRequest);
    });
  });

  describe('Edge Cases', () => {
    it('should handle Unicode characters in prompt', () => {
      const unicodeRequest = {
        ...validClaudeRequest,
        prompt: 'Hello 世界 🌍 émojis',
      };

      const result = transformRequest(unicodeRequest, azureModel, azureApiKey);
      const azureReq = result.azureRequest;
      expect(azureReq.messages[0].content).toBe('Hello 世界 🌍 émojis');
    });

    it('should handle very long valid prompts', () => {
      const longPrompt = 'x'.repeat(50000); // 50KB, within limits
      const longRequest = {
        ...validClaudeRequest,
        prompt: longPrompt,
      };

      expect(() =>
        transformRequest(longRequest, azureModel, azureApiKey)
      ).not.toThrow();
    });

    it('should handle large valid requests up to 10MB', () => {
      const largePrompt = 'x'.repeat(5 * 1024 * 1024); // 5MB, within 10MB limit
      const largeRequest = {
        ...validClaudeRequest,
        prompt: largePrompt,
      };

      expect(() =>
        transformRequest(largeRequest, azureModel, azureApiKey)
      ).not.toThrow();
    });

    it('should handle max_tokens up to 131072', () => {
      const maxTokensRequest = {
        ...validClaudeRequest,
        max_tokens: 131072, // GPT-5-Codex maximum
      };

      const result = transformRequest(
        maxTokensRequest,
        azureModel,
        azureApiKey
      );
      const azureReq = result.azureRequest;
      expect(azureReq.max_completion_tokens).toBe(131072);
    });

    it('should handle boundary values for numeric parameters', () => {
      const boundaryRequest = {
        ...validClaudeRequest,
        max_tokens: 1, // minimum
        temperature: 0, // minimum
        top_p: 0, // minimum
        top_k: 1, // minimum
      };

      expect(() =>
        transformRequest(boundaryRequest, azureModel, azureApiKey)
      ).not.toThrow();
    });

    it('should handle maximum boundary values', () => {
      const maxBoundaryRequest = {
        ...validClaudeRequest,
        max_tokens: 131072, // maximum for GPT-5-Codex
        temperature: 2, // maximum
        top_p: 1, // maximum
        top_k: 100, // maximum
      };

      expect(() =>
        transformRequest(maxBoundaryRequest, azureModel, azureApiKey)
      ).not.toThrow();
    });
  });
});
