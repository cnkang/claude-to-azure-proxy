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
});
