import { describe, it, expect, beforeEach } from 'vitest';
import {
  transformAzureResponseToClaude,
  transformAzureStreamResponseToClaude,
  validateResponseIntegrity,
  createDefensiveResponseHandler,
  extractErrorInfo,
  isAzureOpenAIResponse,
  isAzureOpenAIStreamResponse,
  isAzureOpenAIError
} from '../src/utils/response-transformer.js';
import type {
  AzureOpenAIResponse,
  AzureOpenAIStreamResponse,
  AzureOpenAIError,
  ClaudeCompletionResponse,
  ClaudeError,
  ResponseSizeLimits
} from '../src/types/index.js';

describe('Response Transformer', () => {
  const mockCorrelationId = 'test-correlation-id';
  
  describe('Type Guards', () => {
    describe('isAzureOpenAIResponse', () => {
      it('should validate correct Azure OpenAI response', () => {
        const validResponse: AzureOpenAIResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1640995200,
          model: 'gpt-4',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello, world!'
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15
          }
        };
        
        expect(isAzureOpenAIResponse(validResponse)).toBe(true);
      });
      
      it('should reject invalid response structures', () => {
        expect(isAzureOpenAIResponse(null)).toBe(false);
        expect(isAzureOpenAIResponse(undefined)).toBe(false);
        expect(isAzureOpenAIResponse('string')).toBe(false);
        expect(isAzureOpenAIResponse({})).toBe(false);
        expect(isAzureOpenAIResponse({ id: 'test' })).toBe(false);
      });
      
      it('should reject response with invalid choices', () => {
        const invalidResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1640995200,
          model: 'gpt-4',
          choices: [{ invalid: 'choice' }]
        };
        
        expect(isAzureOpenAIResponse(invalidResponse)).toBe(false);
      });
    });
    
    describe('isAzureOpenAIStreamResponse', () => {
      it('should validate correct Azure OpenAI stream response', () => {
        const validStreamResponse: AzureOpenAIStreamResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion.chunk',
          created: 1640995200,
          model: 'gpt-4',
          choices: [{
            index: 0,
            delta: {
              role: 'assistant',
              content: 'Hello'
            },
            finish_reason: null
          }]
        };
        
        expect(isAzureOpenAIStreamResponse(validStreamResponse)).toBe(true);
      });
      
      it('should reject invalid stream response structures', () => {
        expect(isAzureOpenAIStreamResponse(null)).toBe(false);
        expect(isAzureOpenAIStreamResponse({ object: 'chat.completion' })).toBe(false);
      });
    });
    
    describe('isAzureOpenAIError', () => {
      it('should validate correct Azure OpenAI error response', () => {
        const validError: AzureOpenAIError = {
          error: {
            message: 'Invalid request',
            type: 'invalid_request_error',
            code: 'invalid_parameter'
          }
        };
        
        expect(isAzureOpenAIError(validError)).toBe(true);
      });
      
      it('should reject invalid error structures', () => {
        expect(isAzureOpenAIError(null)).toBe(false);
        expect(isAzureOpenAIError({ error: 'string' })).toBe(false);
        expect(isAzureOpenAIError({ error: {} })).toBe(false);
      });
    });
  });
  
  describe('transformAzureResponseToClaude', () => {
    it('should transform successful Azure OpenAI response to Claude format', () => {
      const azureResponse: AzureOpenAIResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1640995200,
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello, world!'
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15
        }
      };
      
      const result = transformAzureResponseToClaude(azureResponse, 200, mockCorrelationId);
      
      expect(result.statusCode).toBe(200);
      expect(result.headers['Content-Type']).toBe('application/json');
      expect(result.headers['X-Correlation-ID']).toBe(mockCorrelationId);
      
      const claudeResponse = result.claudeResponse as ClaudeCompletionResponse;
      expect(claudeResponse.id).toBe('chatcmpl-123');
      expect(claudeResponse.type).toBe('completion');
      expect(claudeResponse.completion).toBe('Hello, world!');
      expect(claudeResponse.model).toBe('claude-3-5-sonnet-20241022');
      expect(claudeResponse.stop_reason).toBe('stop_sequence');
      expect(claudeResponse.usage).toEqual({
        input_tokens: 10,
        output_tokens: 5
      });
    });
    
    it('should transform Azure OpenAI error to Claude error format', () => {
      const azureError: AzureOpenAIError = {
        error: {
          message: 'Invalid request parameter',
          type: 'invalid_request_error',
          code: 'invalid_parameter'
        }
      };
      
      const result = transformAzureResponseToClaude(azureError, 400, mockCorrelationId);
      
      expect(result.statusCode).toBe(400);
      const claudeError = result.claudeResponse as ClaudeError;
      expect(claudeError.type).toBe('error');
      expect(claudeError.error.type).toBe('invalid_request_error');
      expect(claudeError.error.message).toBe('Invalid request parameter');
    });
    
    it('should handle null content in Azure response', () => {
      const azureResponse: AzureOpenAIResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1640995200,
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: null
          },
          finish_reason: 'content_filter'
        }]
      };
      
      const result = transformAzureResponseToClaude(azureResponse, 200, mockCorrelationId);
      
      const claudeResponse = result.claudeResponse as ClaudeCompletionResponse;
      expect(claudeResponse.completion).toBe('');
      expect(claudeResponse.stop_reason).toBe('stop_sequence');
    });
    
    it('should sanitize sensitive content', () => {
      const azureResponse: AzureOpenAIResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1640995200,
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Contact me at user@example.com or use Bearer abc123token'
          },
          finish_reason: 'stop'
        }]
      };
      
      const result = transformAzureResponseToClaude(azureResponse, 200, mockCorrelationId);
      
      const claudeResponse = result.claudeResponse as ClaudeCompletionResponse;
      expect(claudeResponse.completion).toContain('[EMAIL_REDACTED]');
      expect(claudeResponse.completion).toContain('[TOKEN_REDACTED]');
      expect(claudeResponse.completion).not.toContain('user@example.com');
      expect(claudeResponse.completion).not.toContain('abc123token');
    });
    
    it('should enforce response size limits', () => {
      const largeContent = 'x'.repeat(1000);
      const azureResponse: AzureOpenAIResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1640995200,
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: largeContent
          },
          finish_reason: 'stop'
        }]
      };
      
      const strictLimits: ResponseSizeLimits = {
        maxResponseSize: 500,
        maxCompletionLength: 100,
        maxChoicesCount: 1
      };
      
      const result = transformAzureResponseToClaude(azureResponse, 200, mockCorrelationId, strictLimits);
      
      expect(result.statusCode).toBe(500);
      const claudeError = result.claudeResponse as ClaudeError;
      expect(claudeError.type).toBe('error');
      expect(claudeError.error.type).toBe('internal_error');
    });
    
    it('should handle malformed response gracefully', () => {
      const malformedResponse = { invalid: 'structure' };
      
      const result = transformAzureResponseToClaude(malformedResponse, 200, mockCorrelationId);
      
      expect(result.statusCode).toBe(500);
      const claudeError = result.claudeResponse as ClaudeError;
      expect(claudeError.type).toBe('error');
      expect(claudeError.error.type).toBe('internal_error');
    });
    
    it('should handle response with no choices', () => {
      const azureResponse: AzureOpenAIResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1640995200,
        model: 'gpt-4',
        choices: []
      };
      
      const result = transformAzureResponseToClaude(azureResponse, 200, mockCorrelationId);
      
      expect(result.statusCode).toBe(500);
      const claudeError = result.claudeResponse as ClaudeError;
      expect(claudeError.type).toBe('error');
    });
  });
  
  describe('transformAzureStreamResponseToClaude', () => {
    it('should transform Azure stream response to Claude format', () => {
      const azureStreamResponse: AzureOpenAIStreamResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1640995200,
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: {
            role: 'assistant',
            content: 'Hello'
          },
          finish_reason: null
        }]
      };
      
      const result = transformAzureStreamResponseToClaude(azureStreamResponse, mockCorrelationId);
      
      expect(result.isComplete).toBe(false);
      expect(result.claudeStreamResponse.type).toBe('completion');
      expect(result.claudeStreamResponse.completion).toBe('Hello');
      expect(result.claudeStreamResponse.model).toBe('claude-3-5-sonnet-20241022');
      expect(result.claudeStreamResponse.stop_reason).toBe(null);
    });
    
    it('should handle stream completion', () => {
      const azureStreamResponse: AzureOpenAIStreamResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1640995200,
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: {},
          finish_reason: 'stop'
        }]
      };
      
      const result = transformAzureStreamResponseToClaude(azureStreamResponse, mockCorrelationId);
      
      expect(result.isComplete).toBe(true);
      expect(result.claudeStreamResponse.stop_reason).toBe('stop_sequence');
    });
    
    it('should handle malformed stream response gracefully', () => {
      const malformedResponse = { invalid: 'structure' };
      
      const result = transformAzureStreamResponseToClaude(malformedResponse, mockCorrelationId);
      
      expect(result.isComplete).toBe(true);
      expect(result.claudeStreamResponse.completion).toBe('');
      expect(result.claudeStreamResponse.stop_reason).toBe('stop_sequence');
    });
  });
  
  describe('validateResponseIntegrity', () => {
    it('should validate correct response structure', () => {
      const validResponse: AzureOpenAIResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1640995200,
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello'
          },
          finish_reason: 'stop'
        }]
      };
      
      expect(() => validateResponseIntegrity(validResponse, mockCorrelationId)).not.toThrow();
      expect(validateResponseIntegrity(validResponse, mockCorrelationId)).toBe(true);
    });
    
    it('should throw validation error for missing id', () => {
      const invalidResponse = {
        object: 'chat.completion',
        created: 1640995200,
        model: 'gpt-4',
        choices: []
      };
      
      expect(() => validateResponseIntegrity(invalidResponse, mockCorrelationId)).toThrow();
    });
    
    it('should throw validation error for non-object response', () => {
      expect(() => validateResponseIntegrity(null, mockCorrelationId)).toThrow();
      expect(() => validateResponseIntegrity('string', mockCorrelationId)).toThrow();
    });
  });
  
  describe('createDefensiveResponseHandler', () => {
    it('should handle successful transformation', () => {
      const handler = createDefensiveResponseHandler(mockCorrelationId);
      const azureResponse: AzureOpenAIResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1640995200,
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello'
          },
          finish_reason: 'stop'
        }]
      };
      
      const result = handler(azureResponse, 200);
      
      expect(result.statusCode).toBe(200);
      const claudeResponse = result.claudeResponse as ClaudeCompletionResponse;
      expect(claudeResponse.type).toBe('completion');
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
      expect(claudeError.error.type).toBe('internal_error');
    });
    
    it('should handle errors from transformation function gracefully', () => {
      const handler = createDefensiveResponseHandler(mockCorrelationId);
      
      // Create a response with size limit violation
      const strictLimits: ResponseSizeLimits = {
        maxResponseSize: 10, // Very small limit
        maxCompletionLength: 1,
        maxChoicesCount: 1
      };
      
      const handlerWithLimits = createDefensiveResponseHandler(mockCorrelationId, strictLimits);
      
      const largeResponse = {
        id: 'test-id-that-exceeds-the-size-limit-significantly',
        object: 'chat.completion',
        created: 1640995200,
        model: 'gpt-4',
        choices: []
      };
      
      const result = handlerWithLimits(largeResponse, 200);
      
      // The transformation function handles the size limit error internally and returns 500
      expect(result.statusCode).toBe(500);
      const claudeError = result.claudeResponse as ClaudeError;
      expect(claudeError.type).toBe('error');
      expect(claudeError.error.type).toBe('internal_error');
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
        { type: 'unknown_error', expectedStatus: 500 }
      ];
      
      testCases.forEach(({ type, expectedStatus }) => {
        const azureError: AzureOpenAIError = {
          error: {
            message: `Test ${type}`,
            type,
            code: 'test_code'
          }
        };
        
        const result = extractErrorInfo(azureError);
        
        expect(result.type).toBe(type);
        expect(result.message).toBe(`Test ${type}`);
        expect(result.statusCode).toBe(expectedStatus);
      });
    });
    
    it('should sanitize error messages', () => {
      const azureError: AzureOpenAIError = {
        error: {
          message: 'Error with email user@example.com and Bearer token123',
          type: 'invalid_request_error'
        }
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
        { azure: 'stop', claude: 'stop_sequence' },
        { azure: 'length', claude: 'max_tokens' },
        { azure: 'content_filter', claude: 'stop_sequence' },
        { azure: null, claude: null }
      ];
      
      testCases.forEach(({ azure, claude }) => {
        const azureResponse: AzureOpenAIResponse = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1640995200,
          model: 'gpt-4',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: 'Test'
            },
            finish_reason: azure as any
          }]
        };
        
        const result = transformAzureResponseToClaude(azureResponse, 200, mockCorrelationId);
        const claudeResponse = result.claudeResponse as ClaudeCompletionResponse;
        
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
      
      const azureResponse: AzureOpenAIResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1640995200,
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: sensitiveContent
          },
          finish_reason: 'stop'
        }]
      };
      
      const result = transformAzureResponseToClaude(azureResponse, 200, mockCorrelationId);
      const claudeResponse = result.claudeResponse as ClaudeCompletionResponse;
      
      expect(claudeResponse.completion).toContain('[EMAIL_REDACTED]');
      expect(claudeResponse.completion).toContain('[CARD_REDACTED]');
      expect(claudeResponse.completion).toContain('[SSN_REDACTED]');
      expect(claudeResponse.completion).toContain('[TOKEN_REDACTED]');
      expect(claudeResponse.completion).toContain('[KEY_REDACTED]');
      
      expect(claudeResponse.completion).not.toContain('user@example.com');
      expect(claudeResponse.completion).not.toContain('1234-5678-9012-3456');
      expect(claudeResponse.completion).not.toContain('123-45-6789');
      expect(claudeResponse.completion).not.toContain('abc123def456');
      expect(claudeResponse.completion).not.toContain('secret123');
    });
  });
});