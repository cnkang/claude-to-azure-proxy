/**
 * Tests for Azure OpenAI error mapping functionality
 */

import { describe, expect, it } from 'vitest';
import {
  AuthenticationError,
  AzureOpenAIError,
  NetworkError,
  RateLimitError,
  ServiceUnavailableError,
  TimeoutError,
  ValidationError,
} from '../src/errors/index';
import {
  AzureErrorMapper,
  type ErrorMappingContext,
} from '../src/utils/azure-error-mapper';

describe('AzureErrorMapper', () => {
  const mockCorrelationId = 'test-correlation-id';
  const mockOperation = 'test-operation';

  describe('mapError', () => {
    it('should map Azure OpenAI authentication error correctly', () => {
      const context: ErrorMappingContext = {
        correlationId: mockCorrelationId,
        operation: mockOperation,
        requestFormat: 'claude',
        originalError: {
          error: {
            type: 'authentication_error',
            message: 'Invalid API key',
            code: 'invalid_api_key',
          },
        },
      };

      const result = AzureErrorMapper.mapError(context);

      expect(result.error).toBeInstanceOf(AuthenticationError);
      expect(result.error.message).toBe('Invalid API key');
      expect(result.error.statusCode).toBe(401);
      expect(result.clientResponse).toEqual({
        type: 'error',
        error: {
          type: 'authentication_error',
          message: 'Invalid API key',
        },
      });
    });

    it('should map Azure OpenAI rate limit error correctly', () => {
      const context: ErrorMappingContext = {
        correlationId: mockCorrelationId,
        operation: mockOperation,
        requestFormat: 'openai',
        originalError: {
          error: {
            type: 'rate_limit_error',
            message: 'Rate limit exceeded',
            retry_after: 60,
          },
        },
      };

      const result = AzureErrorMapper.mapError(context);

      expect(result.error).toBeInstanceOf(RateLimitError);
      expect(result.error.statusCode).toBe(429);
      expect((result.error as RateLimitError).retryAfter).toBe(60);
      expect(result.clientResponse).toEqual({
        error: {
          message: 'Rate limit exceeded',
          type: 'rate_limit_exceeded',
          code: 'rate_limit_error',
        },
      });
    });

    it('should map Azure OpenAI validation error correctly', () => {
      const context: ErrorMappingContext = {
        correlationId: mockCorrelationId,
        operation: mockOperation,
        requestFormat: 'claude',
        originalError: {
          error: {
            type: 'invalid_request_error',
            message: 'Invalid model parameter',
            param: 'model',
          },
        },
      };

      const result = AzureErrorMapper.mapError(context);

      expect(result.error).toBeInstanceOf(ValidationError);
      expect(result.error.statusCode).toBe(400);
      expect((result.error as ValidationError).field).toBe('model');
      expect(result.clientResponse).toEqual({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'Invalid model parameter',
        },
      });
    });

    it('should map Azure OpenAI service unavailable error correctly', () => {
      const context: ErrorMappingContext = {
        correlationId: mockCorrelationId,
        operation: mockOperation,
        requestFormat: 'claude',
        originalError: {
          error: {
            type: 'overloaded_error',
            message: 'Service is overloaded',
            retry_after: 300,
          },
        },
      };

      const result = AzureErrorMapper.mapError(context);

      expect(result.error).toBeInstanceOf(ServiceUnavailableError);
      expect(result.error.statusCode).toBe(503);
      expect((result.error as ServiceUnavailableError).retryAfter).toBe(300);
    });

    it('should map network errors correctly', () => {
      const networkError = new Error('Connection refused');
      (networkError as any).code = 'ECONNREFUSED';

      const context: ErrorMappingContext = {
        correlationId: mockCorrelationId,
        operation: mockOperation,
        requestFormat: 'claude',
        originalError: networkError,
      };

      const result = AzureErrorMapper.mapError(context);

      expect(result.error).toBeInstanceOf(NetworkError);
      expect(result.error.statusCode).toBe(503);
      expect(result.clientResponse).toEqual({
        type: 'error',
        error: {
          type: 'api_error',
          message:
            'Network error occurred while communicating with Azure OpenAI',
        },
      });
    });

    it('should map timeout errors correctly', () => {
      const timeoutError = new Error('Request timeout');
      (timeoutError as any).code = 'ETIMEDOUT';

      const context: ErrorMappingContext = {
        correlationId: mockCorrelationId,
        operation: mockOperation,
        requestFormat: 'openai',
        originalError: timeoutError,
      };

      const result = AzureErrorMapper.mapError(context);

      expect(result.error).toBeInstanceOf(TimeoutError);
      expect(result.error.statusCode).toBe(408);
      expect(result.clientResponse).toEqual({
        error: {
          message: 'Request to Azure OpenAI timed out',
          type: 'server_error',
          code: 'timeout_error',
        },
      });
    });

    it('should handle unknown errors gracefully', () => {
      const context: ErrorMappingContext = {
        correlationId: mockCorrelationId,
        operation: mockOperation,
        requestFormat: 'claude',
        originalError: 'unknown error',
      };

      const result = AzureErrorMapper.mapError(context);

      expect(result.error).toBeInstanceOf(AzureOpenAIError);
      expect(result.error.statusCode).toBe(500);
      expect(result.clientResponse).toEqual({
        type: 'error',
        error: {
          type: 'api_error',
          message: 'An unknown error occurred',
        },
      });
    });

    it('should create different response formats for Claude vs OpenAI', () => {
      const azureError = {
        error: {
          type: 'api_error',
          message: 'Test error',
        },
      };

      const claudeContext: ErrorMappingContext = {
        correlationId: mockCorrelationId,
        operation: mockOperation,
        requestFormat: 'claude',
        originalError: azureError,
      };

      const openaiContext: ErrorMappingContext = {
        correlationId: mockCorrelationId,
        operation: mockOperation,
        requestFormat: 'openai',
        originalError: azureError,
      };

      const claudeResult = AzureErrorMapper.mapError(claudeContext);
      const openaiResult = AzureErrorMapper.mapError(openaiContext);

      // Claude format
      expect(claudeResult.clientResponse).toEqual({
        type: 'error',
        error: {
          type: 'overloaded_error',
          message: 'Test error',
        },
      });

      // OpenAI format
      expect(openaiResult.clientResponse).toEqual({
        error: {
          message: 'Test error',
          type: 'server_error',
          code: 'service_unavailable_error',
        },
      });
    });
  });

  describe('createFallbackError', () => {
    it('should create fallback error for Claude format', () => {
      const result = AzureErrorMapper.createFallbackError(
        mockCorrelationId,
        'claude',
        mockOperation
      );

      expect(result.error).toBeInstanceOf(AzureOpenAIError);
      expect(result.clientResponse).toEqual({
        type: 'error',
        error: {
          type: 'api_error',
          message: 'An unexpected error occurred',
        },
      });
    });

    it('should create fallback error for OpenAI format', () => {
      const result = AzureErrorMapper.createFallbackError(
        mockCorrelationId,
        'openai',
        mockOperation
      );

      expect(result.error).toBeInstanceOf(AzureOpenAIError);
      expect(result.clientResponse).toEqual({
        error: {
          message: 'An unexpected error occurred',
          type: 'server_error',
          code: 'azure_openai_error',
        },
      });
    });
  });

  describe('error type mapping', () => {
    it('should map all Azure error types to appropriate status codes', () => {
      const errorTypes = [
        { type: 'invalid_request_error', expectedStatus: 400 },
        { type: 'authentication_error', expectedStatus: 401 },
        { type: 'permission_error', expectedStatus: 401 },
        { type: 'not_found_error', expectedStatus: 400 },
        { type: 'rate_limit_error', expectedStatus: 429 },
        { type: 'api_error', expectedStatus: 503 },
        { type: 'overloaded_error', expectedStatus: 503 },
        { type: 'unknown_error', expectedStatus: 500 },
      ];

      for (const { type, expectedStatus } of errorTypes) {
        const context: ErrorMappingContext = {
          correlationId: mockCorrelationId,
          operation: mockOperation,
          requestFormat: 'claude',
          originalError: {
            error: {
              type,
              message: `Test ${type}`,
            },
          },
        };

        const result = AzureErrorMapper.mapError(context);
        expect(result.error.statusCode).toBe(expectedStatus);
      }
    });
  });

  describe('retry-after extraction', () => {
    it('should extract retry-after from Azure error response', () => {
      const context: ErrorMappingContext = {
        correlationId: mockCorrelationId,
        operation: mockOperation,
        requestFormat: 'claude',
        originalError: {
          error: {
            type: 'rate_limit_error',
            message: 'Rate limit exceeded',
            retry_after: 120,
          },
        },
      };

      const result = AzureErrorMapper.mapError(context);
      expect((result.error as RateLimitError).retryAfter).toBe(120);
    });

    it('should use default retry-after values when not provided', () => {
      const testCases = [
        { type: 'rate_limit_error', expectedRetryAfter: 60 },
        { type: 'overloaded_error', expectedRetryAfter: 300 },
        { type: 'api_error', expectedRetryAfter: 60 },
      ];

      for (const { type, expectedRetryAfter } of testCases) {
        const context: ErrorMappingContext = {
          correlationId: mockCorrelationId,
          operation: mockOperation,
          requestFormat: 'claude',
          originalError: {
            error: {
              type,
              message: `Test ${type}`,
            },
          },
        };

        const result = AzureErrorMapper.mapError(context);

        if (
          result.error instanceof RateLimitError ||
          result.error instanceof ServiceUnavailableError
        ) {
          expect(result.error.retryAfter).toBe(expectedRetryAfter);
        }
      }
    });
  });
});
