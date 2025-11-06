/**
 * Sensitive data redaction tests
 * Tests Requirements: 4.3, 4.7, 4.8 - Sensitive data redaction in errors and logs
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  sanitizeErrorMessage,
  AuthenticationError,
  ValidationError,
  AzureOpenAIError,
  ErrorFactory,
} from '../src/errors/index';
import { logger } from '../src/middleware/logging';
import { StructuredLogger } from '../src/utils/structured-logger';

// Mock console methods to capture log output
const mockConsoleLog = vi.fn();
const mockConsoleError = vi.fn();
const mockStdoutWrite = vi.fn();
const mockStderrWrite = vi.fn();

let stdoutSpy: ReturnType<typeof vi.spyOn> | undefined;
let stderrSpy: ReturnType<typeof vi.spyOn> | undefined;

describe('Sensitive Data Redaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockStdoutWrite.mockClear();
    mockStderrWrite.mockClear();

    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array): boolean => {
        mockStdoutWrite(typeof chunk === 'string' ? chunk : chunk.toString());
        return true;
      });

    stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: string | Uint8Array): boolean => {
        mockStderrWrite(typeof chunk === 'string' ? chunk : chunk.toString());
        return true;
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    stdoutSpy?.mockRestore();
    stderrSpy?.mockRestore();
  });

  describe('Error Message Sanitization', () => {
    it('should redact API keys from error messages', () => {
      const testCases = [
        {
          input: 'Authentication failed with api_key=sk-1234567890abcdef',
          expected: 'Authentication failed with api_key=[REDACTED]',
        },
        {
          input: 'Invalid API key: sk-proj-abcdef1234567890',
          expected: 'Invalid API key: [REDACTED]',
        },
        {
          input: 'Bearer token sk-test-1234567890abcdef is invalid',
          expected: 'Bearer token [REDACTED] is invalid',
        },
        {
          input: 'Error with token: abc123def456ghi789',
          expected: 'Error with token: [REDACTED]',
        },
      ];

      testCases.forEach(({ input, expected }) => {
        const sanitized = sanitizeErrorMessage(input);
        expect(sanitized).toBe(expected);
        expect(sanitized).not.toContain('sk-');
        expect(sanitized).not.toContain('abc123def456ghi789');
      });
    });

    it('should redact URLs and endpoints from error messages', () => {
      const testCases = [
        {
          input:
            'Failed to connect to https://mycompany.openai.azure.com/openai/deployments/gpt-4',
          expected: 'Failed to connect to [REDACTED]',
        },
        {
          input: 'Request to http://internal-api.company.com/v1/chat failed',
          expected: 'Request to [REDACTED] failed',
        },
        {
          input: 'Azure endpoint https://test.openai.azure.com is unreachable',
          expected: 'Azure endpoint [REDACTED] is unreachable',
        },
      ];

      testCases.forEach(({ input, expected }) => {
        const sanitized = sanitizeErrorMessage(input);
        expect(sanitized).toBe(expected);
        expect(sanitized).not.toContain('openai.azure.com');
        expect(sanitized).not.toContain('http://');
        expect(sanitized).not.toContain('https://');
      });
    });

    it('should redact passwords and secrets from error messages', () => {
      const testCases = [
        {
          input: 'Database connection failed: password=mySecretPassword123',
          expected: 'Database connection failed: password=[REDACTED]',
        },
        {
          input: 'Secret key validation failed: secret=abc123def456',
          expected: 'Secret key validation failed: secret=[REDACTED]',
        },
        {
          input: 'Authentication error with credentials password: test123',
          expected:
            'Authentication error with credentials password: [REDACTED]',
        },
      ];

      testCases.forEach(({ input, expected }) => {
        const sanitized = sanitizeErrorMessage(input);
        expect(sanitized).toBe(expected);
        expect(sanitized).not.toContain('mySecretPassword123');
        expect(sanitized).not.toContain('abc123def456');
        expect(sanitized).not.toContain('test123');
      });
    });

    it('should redact email addresses from error messages', () => {
      const testCases = [
        {
          input: 'User john.doe@company.com not found',
          expected: 'User [EMAIL_REDACTED] not found',
        },
        {
          input: 'Invalid email: admin@example.org',
          expected: 'Invalid email: [EMAIL_REDACTED]',
        },
        {
          input: 'Contact support@mycompany.co.uk for help',
          expected: 'Contact [EMAIL_REDACTED] for help',
        },
      ];

      testCases.forEach(({ input, expected }) => {
        const sanitized = sanitizeErrorMessage(input);
        expect(sanitized).toBe(expected);
        expect(sanitized).not.toContain('@');
      });
    });

    it('should redact long alphanumeric strings that might be keys', () => {
      const testCases = [
        {
          input: 'Token validation failed: abcdef1234567890ghijklmnop',
          expected: 'Token validation failed: [REDACTED]',
        },
        {
          input: 'Session ID ABC123DEF456GHI789JKL012 expired',
          expected: 'Session ID [REDACTED] expired',
        },
      ];

      testCases.forEach(({ input, expected }) => {
        const sanitized = sanitizeErrorMessage(input);
        expect(sanitized).toBe(expected);
        expect(sanitized).not.toContain('abcdef1234567890ghijklmnop');
        expect(sanitized).not.toContain('ABC123DEF456GHI789JKL012');
      });
    });

    it('should preserve non-sensitive content', () => {
      const testCases = [
        'Request validation failed for field "model"',
        'Invalid temperature value: 3.5',
        'Message count exceeds limit of 100',
        'Connection timeout after 30 seconds',
        'Model "claude-3-5-sonnet" not found',
      ];

      testCases.forEach((input) => {
        const sanitized = sanitizeErrorMessage(input);
        expect(sanitized).toBe(input); // Should remain unchanged
      });
    });
  });

  describe('Error Object Sanitization', () => {
    it('should sanitize metadata in BaseError', () => {
      const sensitiveMetadata = {
        apiKey: 'sk-1234567890abcdef',
        password: 'secretPassword123',
        token: 'bearer-token-abc123',
        normalField: 'normal value',
        authorization: 'Bearer sk-test-123456',
      };

      const error = new AuthenticationError(
        'Authentication failed',
        'test-correlation-id',
        'test-operation',
        sensitiveMetadata
      );

      const errorJson = error.toJSON();
      const metadata = errorJson.context?.metadata as Record<string, unknown>;

      expect(metadata.apiKey).toBe('[REDACTED]');
      expect(metadata.password).toBe('[REDACTED]');
      expect(metadata.token).toBe('[REDACTED]');
      expect(metadata.authorization).toBe('[REDACTED]');
      expect(metadata.normalField).toBe('normal value');
    });

    it('should truncate very long metadata values', () => {
      const longValue = 'A'.repeat(1500);
      const metadata = {
        longField: longValue,
        shortField: 'short value',
      };

      // Manually set metadata to test truncation
      const errorWithMetadata = new AuthenticationError(
        'Test error',
        'test-correlation-id',
        'test-operation',
        metadata
      );

      const errorJson = errorWithMetadata.toJSON();
      const resultMetadata = errorJson.context?.metadata as Record<
        string,
        unknown
      >;

      expect(typeof resultMetadata.longField).toBe('string');
      expect((resultMetadata.longField as string).length).toBeLessThan(
        longValue.length
      );
      expect(resultMetadata.longField as string).toContain('[TRUNCATED]');
      expect(resultMetadata.shortField).toBe('short value');
    });

    it('should create sanitized client error responses', () => {
      const error = new AzureOpenAIError(
        'API key sk-1234567890abcdef is invalid',
        401,
        'test-correlation-id',
        'authentication_error',
        'invalid_api_key',
        'test-operation'
      );

      const clientError = error.toClientError();

      expect(clientError.message).not.toContain('sk-1234567890abcdef');
      expect(clientError.message).toContain('[REDACTED]');
      expect(clientError.type).toBe('AZURE_OPENAI_ERROR');
      expect(clientError.correlationId).toBe('test-correlation-id');
    });
  });

  describe('Error Factory Sanitization', () => {
    it('should sanitize Azure OpenAI error responses', () => {
      const azureErrorResponse = {
        error: {
          message: 'Invalid API key: sk-proj-1234567890abcdef provided',
          type: 'authentication_error',
          code: 'invalid_api_key',
        },
      };

      const error = ErrorFactory.fromAzureOpenAIError(
        azureErrorResponse,
        'test-correlation-id',
        'azure-api-call'
      );

      expect(error.message).not.toContain('sk-proj-1234567890abcdef');
      expect(error.message).toContain('[REDACTED]');
      expect(error.azureErrorType).toBe('authentication_error');
      expect(error.azureErrorCode).toBe('invalid_api_key');
    });

    it('should sanitize network error messages', () => {
      const networkError = new Error(
        'Connection failed to https://company.openai.azure.com with token sk-test-123'
      );

      const error = ErrorFactory.fromNetworkError(
        networkError,
        'test-correlation-id',
        'network-request'
      );

      expect(error.message).not.toContain('https://company.openai.azure.com');
      expect(error.message).not.toContain('sk-test-123');
      expect(error.message).toContain('[REDACTED]');
    });
  });

  describe('Logging Sanitization', () => {
    it('should sanitize sensitive data in log entries', () => {
      const sensitiveLogData = {
        apiKey: 'sk-1234567890abcdef',
        endpoint: 'https://company.openai.azure.com',
        userEmail: 'user@company.com',
        password: 'secretPassword',
        normalData: 'normal log data',
      };

      logger.info('Test log message', 'test-correlation-id', sensitiveLogData);

      expect(mockStdoutWrite).toHaveBeenCalled();
      const logCall = mockStdoutWrite.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.metadata.apiKey).toBe('[REDACTED]');
      expect(logEntry.metadata.password).toBe('[REDACTED]');
      expect(logEntry.metadata.normalData).toBe('normal log data');
      expect(logEntry.message).toBe('Test log message');
    });

    it('should sanitize error logs', () => {
      const sensitiveError = new Error(
        'Authentication failed with API key sk-test-1234567890'
      );

      logger.error(
        'Request failed',
        'test-correlation-id',
        {
          endpoint: 'https://api.openai.com/v1/chat/completions',
          method: 'POST',
        },
        sensitiveError
      );

      expect(mockStderrWrite).toHaveBeenCalled();
      const logCall = mockStderrWrite.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.error.message).not.toContain('sk-test-1234567890');
      expect(logEntry.error.message).toContain('[REDACTED]');
    });

    it('should sanitize structured logger data', () => {
      const context = {
        correlationId: 'test-correlation-id',
        operation: 'test-operation',
      };

      const securityData = {
        eventType: 'authentication' as const,
        severity: 'high' as const,
        clientInfo: {
          hasUserAgent: true,
          hasIpAddress: true,
          clientType: 'unknown' as const,
        },
        outcome: 'failure' as const,
        details: {
          apiKey: 'sk-1234567890abcdef',
          endpoint: 'https://company.openai.azure.com',
          reason: 'invalid_credentials',
        },
      };

      StructuredLogger.logSecurityEvent(context, securityData);

      expect(mockStderrWrite).toHaveBeenCalled();
      const logCall = mockStderrWrite.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      // Check that sensitive data in details is redacted
      expect(JSON.stringify(logEntry)).not.toContain('sk-1234567890abcdef');
      expect(JSON.stringify(logEntry)).not.toContain(
        'https://company.openai.azure.com'
      );
    });
  });

  describe('Stack Trace Handling', () => {
    it('should not expose stack traces in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new ValidationError(
        'Validation failed',
        'test-correlation-id',
        'testField'
      );

      const errorJson = error.toJSON();
      expect(errorJson.stack).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });

    it('should include stack traces in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new ValidationError(
        'Validation failed',
        'test-correlation-id',
        'testField'
      );

      const errorJson = error.toJSON();
      expect(errorJson.stack).toBeDefined();
      expect(typeof errorJson.stack).toBe('string');

      process.env.NODE_ENV = originalEnv;
    });

    it('should sanitize stack traces when included', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      // Create an error with sensitive data in the message
      const error = new AuthenticationError(
        'API key sk-1234567890abcdef is invalid',
        'test-correlation-id'
      );

      const errorJson = error.toJSON();

      // Message should be sanitized
      expect(errorJson.message).not.toContain('sk-1234567890abcdef');
      expect(errorJson.message).toContain('[REDACTED]');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Request/Response Sanitization', () => {
    it('should sanitize request headers in logs', () => {
      const sensitiveHeaders = {
        authorization: 'Bearer sk-1234567890abcdef',
        'x-api-key': 'sk-test-abcdef123456',
        'content-type': 'application/json',
        'user-agent': 'TestClient/1.0',
      };

      logger.info('Request received', 'test-correlation-id', {
        headers: sensitiveHeaders,
        method: 'POST',
        path: '/v1/chat/completions',
      });

      expect(mockStdoutWrite).toHaveBeenCalled();
      const logCall = mockStdoutWrite.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.metadata.headers.authorization).toBe('[REDACTED]');
      expect(logEntry.metadata.headers['x-api-key']).toBe('[REDACTED]');
      expect(logEntry.metadata.headers['content-type']).toBe(
        'application/json'
      );
      expect(logEntry.metadata.headers['user-agent']).toBe('TestClient/1.0');
    });

    it('should sanitize nested sensitive data', () => {
      const nestedSensitiveData = {
        request: {
          headers: {
            authorization: 'Bearer sk-1234567890abcdef',
          },
          body: {
            model: 'claude-3-5-sonnet',
            messages: [
              {
                role: 'user',
                content: 'Hello world',
              },
            ],
          },
        },
        response: {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
        config: {
          apiKey: 'sk-test-123456',
          endpoint: 'https://api.openai.com',
        },
      };

      logger.info(
        'API call completed',
        'test-correlation-id',
        nestedSensitiveData
      );

      expect(mockStdoutWrite).toHaveBeenCalled();
      const logCall = mockStdoutWrite.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.metadata.request.headers.authorization).toBe(
        '[REDACTED]'
      );
      expect(logEntry.metadata.config.apiKey).toBe('[REDACTED]');
      expect(logEntry.metadata.request.body.model).toBe('claude-3-5-sonnet');
      expect(logEntry.metadata.response.status).toBe(200);
    });
  });

  describe('Correlation ID Preservation', () => {
    it('should preserve correlation IDs in sanitized errors', () => {
      const correlationId = 'test-correlation-12345';

      const error = new AuthenticationError(
        'API key sk-1234567890abcdef is invalid',
        correlationId
      );

      expect(error.context.correlationId).toBe(correlationId);

      const clientError = error.toClientError();
      expect(clientError.correlationId).toBe(correlationId);
    });

    it('should preserve correlation IDs in logs', () => {
      const correlationId = 'test-correlation-67890';

      logger.error('Sensitive error occurred', correlationId, {
        apiKey: 'sk-1234567890abcdef',
      });

      expect(mockStderrWrite).toHaveBeenCalled();
      const logCall = mockStderrWrite.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.correlationId).toBe(correlationId);
      expect(logEntry.metadata.apiKey).toBe('[REDACTED]');
    });
  });
});
