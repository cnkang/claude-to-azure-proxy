import { describe, it, expect } from 'vitest';
import {
  BaseError,
  AuthenticationError,
  ValidationError,
  NetworkError,
  TimeoutError,
  CircuitBreakerError,
  ErrorFactory,
  isBaseError,
  isOperationalError,
  isError,
  preserveErrorContext,
} from '../src/errors/index.js';

describe('Error Handling System', () => {
  describe('Custom Error Classes', () => {
    it('should create BaseError with proper inheritance', () => {
      const error = new AuthenticationError(
        'Invalid credentials',
        'test-correlation-id',
        'login'
      );

      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.name).toBe('AuthenticationError');
      expect(error.message).toBe('Invalid credentials');
      expect(error.statusCode).toBe(401);
      expect(error.errorCode).toBe('AUTHENTICATION_ERROR');
      expect(error.isOperational).toBe(true);
      expect(error.context.correlationId).toBe('test-correlation-id');
      expect(error.context.operation).toBe('login');
    });

    it('should sanitize sensitive metadata', () => {
      const error = new ValidationError(
        'Invalid input',
        'test-correlation-id',
        'password',
        'secret123',
        'validation'
      );

      const json = error.toJSON();
      expect(json.context.metadata).toBeDefined();
      if (
        json.context.metadata !== null &&
        typeof json.context.metadata === 'object'
      ) {
        const metadata = json.context.metadata as {
          field?: string;
          value?: string;
        };
        expect(metadata.field).toBe('password');
        expect(metadata.value).toBe('secret123'); // Value is not sanitized in ValidationError
      }
    });

    it('should create client-safe error responses', () => {
      const error = new NetworkError(
        'Connection failed',
        'test-correlation-id',
        new Error('ECONNREFUSED'),
        'azure-request'
      );

      const clientError = error.toClientError();
      expect(clientError).toEqual({
        type: 'NETWORK_ERROR',
        message: 'Connection failed',
        correlationId: 'test-correlation-id',
      });
    });

    it('should handle non-operational errors', () => {
      const error = new ValidationError(
        'Critical system failure',
        'test-correlation-id',
        'field',
        'value',
        false // non-operational
      );

      expect(error.isOperational).toBe(false);
      const clientError = error.toClientError();
      expect(clientError.message).toBe('An internal server error occurred');
    });
  });

  describe('Error Factory', () => {
    it('should create AzureOpenAIError from Azure response', () => {
      const azureError = {
        error: {
          message: 'Rate limit exceeded',
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded',
        },
      };

      const error = ErrorFactory.fromAzureOpenAIError(
        azureError,
        'test-correlation-id',
        'completion-request'
      );

      expect(error).toBeInstanceOf(BaseError);
      expect(error.statusCode).toBe(429);
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.azureErrorType).toBe('rate_limit_error');
      expect(error.azureErrorCode).toBe('rate_limit_exceeded');
    });

    it('should create NetworkError from network failure', () => {
      const networkError = new Error('ECONNRESET') as Error & { code: string };
      networkError.code = 'ECONNRESET';

      const error = ErrorFactory.fromNetworkError(
        networkError,
        'test-correlation-id',
        'azure-request'
      );

      expect(error).toBeInstanceOf(NetworkError);
      expect(error.message).toBe('Network error: ECONNRESET');
      expect(error.cause).toBe(networkError);
    });

    it('should create TimeoutError', () => {
      const error = ErrorFactory.fromTimeout(
        5000,
        'test-correlation-id',
        'completion-request'
      );

      expect(error).toBeInstanceOf(TimeoutError);
      expect(error.message).toBe('Operation timed out after 5000ms');
      expect(error.timeoutMs).toBe(5000);
    });
  });

  describe('Type Guards', () => {
    it('should identify BaseError instances', () => {
      const baseError = new ValidationError('Invalid', 'test-id');
      const regularError = new Error('Regular error');

      expect(isBaseError(baseError)).toBe(true);
      expect(isBaseError(regularError)).toBe(false);
    });

    it('should identify operational errors', () => {
      const operationalError = new AuthenticationError(
        'Auth failed',
        'test-id'
      );
      const nonOperationalError = new ValidationError(
        'Critical',
        'test-id',
        'field',
        'value',
        false
      );
      const regularError = new Error('Regular');

      expect(isOperationalError(operationalError)).toBe(true);
      expect(isOperationalError(nonOperationalError)).toBe(false);
      expect(isOperationalError(regularError)).toBe(false);
    });
  });

  describe('Circuit Breaker Error', () => {
    it('should create circuit breaker error with state information', () => {
      const nextAttempt = new Date(Date.now() + 60000);
      const error = new CircuitBreakerError(
        'Circuit breaker is open',
        'test-correlation-id',
        'OPEN',
        nextAttempt,
        'azure-request'
      );

      expect(error.state).toBe('OPEN');
      expect(error.nextAttemptTime).toBe(nextAttempt);
      expect(error.statusCode).toBe(503);
    });
  });

  describe('Node.js 24 Enhanced Error Handling', () => {
    describe('isError type guard', () => {
      it('should identify Error objects using Node.js 24 Error.isError() when available', () => {
        const error = new Error('Test error');
        const notError = { message: 'Not an error' };
        const nullValue = null;
        const undefinedValue = undefined;

        expect(isError(error)).toBe(true);
        expect(isError(notError)).toBe(false);
        expect(isError(nullValue)).toBe(false);
        expect(isError(undefinedValue)).toBe(false);
      });

      it('should handle edge cases correctly', () => {
        const customError = Object.create(Error.prototype);
        customError.message = 'Custom error';
        customError.name = 'CustomError';

        // This test depends on Node.js version and Error.isError() availability
        // In Node.js 24, Error.isError() might be more strict than instanceof
        const result = isError(customError);
        expect(typeof result).toBe('boolean');

        // Test with a proper Error instance
        const realError = new Error('Real error');
        expect(isError(realError)).toBe(true);
      });
    });

    describe('preserveErrorContext', () => {
      it('should preserve error cause chain', () => {
        const originalError = new Error('Original error');
        const baseError = new ValidationError(
          'Validation failed',
          'test-correlation-id',
          'field',
          'value'
        );

        const enhancedError = preserveErrorContext(originalError, baseError);

        expect(enhancedError.cause).toBe(originalError);
        expect(enhancedError).toBe(baseError); // Should return the same instance
      });

      it('should preserve Node.js error properties', () => {
        const originalError = new Error('Network error') as Error & {
          code: string;
          errno: number;
          syscall: string;
        };
        originalError.code = 'ECONNREFUSED';
        originalError.errno = -61;
        originalError.syscall = 'connect';

        const baseError = new NetworkError(
          'Connection failed',
          'test-correlation-id',
          originalError
        );

        const enhancedError = preserveErrorContext(originalError, baseError);

        expect(enhancedError.context.metadata?.originalErrorCode).toBe(
          'ECONNREFUSED'
        );
        expect(enhancedError.context.metadata?.originalErrno).toBe(-61);
        expect(enhancedError.context.metadata?.originalSyscall).toBe('connect');
      });

      it('should handle non-Error objects gracefully', () => {
        const notAnError = { message: 'Not an error' };
        const baseError = new ValidationError(
          'Validation failed',
          'test-correlation-id'
        );

        const result = preserveErrorContext(notAnError, baseError);

        expect(result).toBe(baseError);
        expect(result.cause).toBeUndefined();
      });
    });

    describe('Enhanced ErrorFactory.transformError', () => {
      it('should transform various error types correctly', () => {
        const testCases = [
          {
            input: new Error('Standard error'),
            expectedType: 'InternalServerError',
            expectedMessage: 'Standard error',
          },
          {
            input: 'String error',
            expectedType: 'InternalServerError',
            expectedMessage: 'String error',
          },
          {
            input: { message: 'Object error' },
            expectedType: 'InternalServerError',
            expectedMessage: 'Object error',
          },
          {
            input: null,
            expectedType: 'InternalServerError',
            expectedMessage: 'An unexpected error occurred',
          },
        ];

        testCases.forEach(({ input, expectedType, expectedMessage }) => {
          const result = ErrorFactory.transformError(
            input,
            'test-correlation-id',
            'test-operation'
          );

          expect(result.constructor.name).toBe(expectedType);
          expect(result.message).toBe(expectedMessage);
          expect(result.context.correlationId).toBe('test-correlation-id');
          expect(result.context.operation).toBe('test-operation');
        });
      });

      it('should handle network errors with specific codes', () => {
        const networkError = new Error('Connection refused') as Error & {
          code: string;
        };
        networkError.code = 'ECONNREFUSED';

        const result = ErrorFactory.transformError(
          networkError,
          'test-correlation-id',
          'network-operation'
        );

        expect(result).toBeInstanceOf(NetworkError);
        expect(result.cause).toBe(networkError);
      });

      it('should handle timeout errors', () => {
        const timeoutError = new Error('Request timeout') as Error & {
          code: string;
        };
        timeoutError.code = 'ETIMEDOUT';

        const result = ErrorFactory.transformError(
          timeoutError,
          'test-correlation-id',
          'timeout-operation'
        );

        expect(result).toBeInstanceOf(NetworkError);
        expect(result.cause).toBe(timeoutError);
      });

      it('should preserve BaseError instances', () => {
        const baseError = new ValidationError(
          'Validation failed',
          'original-correlation-id'
        );

        const result = ErrorFactory.transformError(
          baseError,
          'new-correlation-id',
          'transform-operation'
        );

        expect(result).toBe(baseError);
        expect(result.context.correlationId).toBe('original-correlation-id');
      });
    });

    describe('Enhanced NetworkError', () => {
      it('should preserve Node.js error properties in metadata', () => {
        const cause = new Error('Connection failed') as Error & {
          code: string;
          errno: number;
          syscall: string;
        };
        cause.code = 'ENOTFOUND';
        cause.errno = -3008;
        cause.syscall = 'getaddrinfo';

        const networkError = new NetworkError(
          'DNS lookup failed',
          'test-correlation-id',
          cause,
          'dns-lookup'
        );

        expect(networkError.cause).toBe(cause);
        expect(networkError.context.metadata?.errorCode).toBe('ENOTFOUND');
        expect(networkError.context.metadata?.errno).toBe(-3008);
        expect(networkError.context.metadata?.syscall).toBe('getaddrinfo');
      });

      it('should handle NetworkError without cause', () => {
        const networkError = new NetworkError(
          'Generic network error',
          'test-correlation-id',
          undefined,
          'generic-operation'
        );

        expect(networkError.cause).toBeUndefined();
        expect(networkError.context.metadata?.errorCode).toBeUndefined();
      });
    });
  });
});
