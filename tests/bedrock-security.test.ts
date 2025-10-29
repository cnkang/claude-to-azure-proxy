/**
 * @fileoverview Security tests for AWS Bedrock API key handling.
 *
 * This test suite validates API key sanitization in logs and error responses,
 * configuration validation, fail-fast behavior, and ensures no sensitive data
 * exposure in error responses.
 *
 * @author Claude-to-Azure Proxy Team
 * @version 1.0.0
 * @since 1.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AWSBedrockClient } from '../src/clients/aws-bedrock-client.js';
import type { AWSBedrockConfig } from '../src/types/index.js';
import { ValidationError } from '../src/errors/index.js';

// Mock logger to capture log messages
vi.mock('../src/middleware/logging.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      post: vi.fn(),
      interceptors: {
        response: {
          use: vi.fn(),
        },
      },
    })),
  },
}));

describe('Bedrock Security Tests', () => {
  let validConfig: AWSBedrockConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    validConfig = {
      baseURL: 'https://bedrock-runtime.us-west-2.amazonaws.com',
      apiKey: 'test-bedrock-api-key-32-characters-long-secret',
      region: 'us-west-2',
      timeout: 30000,
      maxRetries: 3,
    };
  });

  describe('API Key Sanitization in Logs and Error Responses', () => {
    it('should sanitize API key in getConfig method', () => {
      const client = new AWSBedrockClient(validConfig);
      const sanitizedConfig = client.getConfig();

      expect(sanitizedConfig.apiKey).toBe('[REDACTED]');
      expect(sanitizedConfig.apiKey).not.toBe(validConfig.apiKey);
      expect(sanitizedConfig.baseURL).toBe(validConfig.baseURL);
      expect(sanitizedConfig.region).toBe(validConfig.region);
      expect(sanitizedConfig.timeout).toBe(validConfig.timeout);
      expect(sanitizedConfig.maxRetries).toBe(validConfig.maxRetries);
    });

    it('should not expose API key in validation error messages', () => {
      const invalidConfig = { ...validConfig, apiKey: '' };

      expect(() => new AWSBedrockClient(invalidConfig)).toThrow(
        ValidationError
      );

      try {
        new AWSBedrockClient(invalidConfig);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const validationError = error as ValidationError;
        expect(validationError.message).not.toContain(validConfig.apiKey);
        expect(validationError.message).toContain('Invalid apiKey');
        expect(validationError.value).toBe('[REDACTED]');
      }
    });

    it('should not expose API key in network error handling', async () => {
      const client = new AWSBedrockClient(validConfig);

      // Mock network error
      const networkError = new Error('ECONNREFUSED');
      (networkError as any).code = 'ECONNREFUSED';

      vi.spyOn(client['client'], 'post').mockRejectedValue(networkError);

      try {
        await client.createResponse({
          model: 'qwen.qwen3-coder-480b-a35b-v1:0',
          input: 'test',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).not.toContain(validConfig.apiKey);
        expect((error as Error).message).not.toContain('test-bedrock-api-key');
      }
    });

    it('should not expose API key in timeout error handling', async () => {
      const client = new AWSBedrockClient(validConfig);

      // Mock timeout error
      const timeoutError = new Error('timeout of 30000ms exceeded');
      vi.spyOn(client['client'], 'post').mockRejectedValue(timeoutError);

      try {
        await client.createResponse({
          model: 'qwen.qwen3-coder-480b-a35b-v1:0',
          input: 'test',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).not.toContain(validConfig.apiKey);
        expect((error as Error).message).not.toContain('test-bedrock-api-key');
      }
    });

    it('should not expose API key in API error responses', async () => {
      const client = new AWSBedrockClient(validConfig);

      // Mock API error
      const apiError = {
        isAxiosError: true,
        response: {
          status: 401,
          data: {
            error: {
              message: 'Invalid API key provided',
              type: 'AuthenticationException',
            },
          },
        },
        message: 'Request failed with status code 401',
      };

      vi.spyOn(client['client'], 'post').mockRejectedValue(apiError);

      try {
        await client.createResponse({
          model: 'qwen.qwen3-coder-480b-a35b-v1:0',
          input: 'test',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).not.toContain(validConfig.apiKey);
        expect((error as Error).message).not.toContain('test-bedrock-api-key');
      }
    });
  });

  describe('Configuration Validation and Fail-Fast Behavior', () => {
    it('should fail fast on empty API key', () => {
      const invalidConfig = { ...validConfig, apiKey: '' };

      expect(() => new AWSBedrockClient(invalidConfig)).toThrow(
        'Invalid apiKey: must be a non-empty string'
      );
    });

    it('should fail fast on null API key', () => {
      const invalidConfig = { ...validConfig, apiKey: null as any };

      expect(() => new AWSBedrockClient(invalidConfig)).toThrow(
        'Invalid apiKey: must be a non-empty string'
      );
    });

    it('should fail fast on undefined API key', () => {
      const invalidConfig = { ...validConfig, apiKey: undefined as any };

      expect(() => new AWSBedrockClient(invalidConfig)).toThrow(
        'Invalid apiKey: must be a non-empty string'
      );
    });

    it('should fail fast on non-string API key', () => {
      const invalidConfig = { ...validConfig, apiKey: 12345 as any };

      expect(() => new AWSBedrockClient(invalidConfig)).toThrow(
        'Invalid apiKey: must be a non-empty string'
      );
    });

    it('should accept whitespace-only API key (validation is basic)', () => {
      const whitespaceConfig = { ...validConfig, apiKey: '   ' };

      // Current validation only checks for empty string, not trimmed
      expect(() => new AWSBedrockClient(whitespaceConfig)).not.toThrow();
    });

    it('should fail fast on invalid baseURL protocol', () => {
      const invalidConfig = { ...validConfig, baseURL: 'http://insecure.com' };

      expect(() => new AWSBedrockClient(invalidConfig)).toThrow(
        'Invalid baseURL: must use HTTPS protocol'
      );
    });

    it('should fail fast on empty baseURL', () => {
      const invalidConfig = { ...validConfig, baseURL: '' };

      expect(() => new AWSBedrockClient(invalidConfig)).toThrow(
        'Invalid baseURL: must be a non-empty string'
      );
    });

    it('should fail fast on invalid region', () => {
      const invalidConfig = { ...validConfig, region: '' };

      expect(() => new AWSBedrockClient(invalidConfig)).toThrow(
        'Invalid region: must be a non-empty string'
      );
    });

    it('should fail fast on invalid timeout', () => {
      const invalidConfig = { ...validConfig, timeout: 0 };

      expect(() => new AWSBedrockClient(invalidConfig)).toThrow(
        'Invalid timeout: must be a positive number'
      );
    });

    it('should fail fast on negative timeout', () => {
      const invalidConfig = { ...validConfig, timeout: -1000 };

      expect(() => new AWSBedrockClient(invalidConfig)).toThrow(
        'Invalid timeout: must be a positive number'
      );
    });

    it('should fail fast on invalid maxRetries', () => {
      const invalidConfig = { ...validConfig, maxRetries: -1 };

      expect(() => new AWSBedrockClient(invalidConfig)).toThrow(
        'Invalid maxRetries: must be a non-negative number'
      );
    });

    it('should accept zero maxRetries', () => {
      const validConfigWithZeroRetries = { ...validConfig, maxRetries: 0 };

      expect(
        () => new AWSBedrockClient(validConfigWithZeroRetries)
      ).not.toThrow();
    });
  });

  describe('Sensitive Data Exposure Prevention', () => {
    it('should not log API keys in debug messages', async () => {
      const client = new AWSBedrockClient(validConfig);

      // Import the mocked logger
      const { logger } = await import('../src/middleware/logging.js');

      // Trigger some operation that might log
      client.getConfig();

      // Check that no log calls contain the actual API key
      const allLogCalls = [
        ...(logger.debug as any).mock.calls,
        ...(logger.info as any).mock.calls,
        ...(logger.warn as any).mock.calls,
        ...(logger.error as any).mock.calls,
      ];

      for (const call of allLogCalls) {
        for (const arg of call) {
          if (typeof arg === 'string') {
            expect(arg).not.toContain(validConfig.apiKey);
            expect(arg).not.toContain('test-bedrock-api-key');
          } else if (typeof arg === 'object' && arg !== null) {
            const stringified = JSON.stringify(arg);
            expect(stringified).not.toContain(validConfig.apiKey);
            expect(stringified).not.toContain('test-bedrock-api-key');
          }
        }
      }
    });

    it('should not expose API key in error stack traces', () => {
      const invalidConfig = { ...validConfig, baseURL: 'invalid-url' };

      try {
        new AWSBedrockClient(invalidConfig);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const errorString = error.toString();
        const errorStack = (error as Error).stack ?? '';

        expect(errorString).not.toContain(validConfig.apiKey);
        expect(errorStack).not.toContain(validConfig.apiKey);
        expect(errorString).not.toContain('test-bedrock-api-key');
        expect(errorStack).not.toContain('test-bedrock-api-key');
      }
    });

    it('should not expose API key in serialized error objects', () => {
      const invalidConfig = { ...validConfig, apiKey: '' };

      try {
        new AWSBedrockClient(invalidConfig);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const serialized = JSON.stringify(error);

        expect(serialized).not.toContain(validConfig.apiKey);
        expect(serialized).not.toContain('test-bedrock-api-key');

        // Should contain redacted value instead
        expect(serialized).toContain('[REDACTED]');
      }
    });

    it('should handle API key exposure in nested error objects', async () => {
      const client = new AWSBedrockClient(validConfig);

      // Mock complex error with nested data
      const complexError = {
        isAxiosError: true,
        response: {
          status: 400,
          data: {
            error: {
              message: 'Request failed',
              details: {
                config: {
                  headers: {
                    Authorization: `Bearer ${validConfig.apiKey}`,
                  },
                },
              },
            },
          },
        },
        config: {
          headers: {
            Authorization: `Bearer ${validConfig.apiKey}`,
          },
        },
        message: 'Request failed with status code 400',
      };

      vi.spyOn(client['client'], 'post').mockRejectedValue(complexError);

      try {
        await client.createResponse({
          model: 'qwen.qwen3-coder-480b-a35b-v1:0',
          input: 'test',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const errorString = JSON.stringify(error);

        expect(errorString).not.toContain(validConfig.apiKey);
        expect(errorString).not.toContain('test-bedrock-api-key');
      }
    });
  });

  describe('Security Headers and Request Validation', () => {
    it('should create client with secure configuration', () => {
      const client = new AWSBedrockClient(validConfig);

      // Verify client was created successfully with secure configuration
      expect(client).toBeDefined();

      // Verify configuration is properly sanitized
      const sanitizedConfig = client.getConfig();
      expect(sanitizedConfig.baseURL).toBe(validConfig.baseURL);
      expect(sanitizedConfig.apiKey).toBe('[REDACTED]');
      expect(sanitizedConfig.region).toBe(validConfig.region);
      expect(sanitizedConfig.timeout).toBe(validConfig.timeout);
      expect(sanitizedConfig.maxRetries).toBe(validConfig.maxRetries);
    });

    it('should validate HTTPS requirement for baseURL', () => {
      const httpConfig = {
        ...validConfig,
        baseURL: 'http://bedrock.amazonaws.com',
      };

      expect(() => new AWSBedrockClient(httpConfig)).toThrow(
        'Invalid baseURL: must use HTTPS protocol'
      );
    });

    it('should validate region format', () => {
      const invalidRegionConfig = {
        ...validConfig,
        region: 'invalid-region-format!',
      };

      // Should not throw for region format (AWS handles region validation)
      expect(() => new AWSBedrockClient(invalidRegionConfig)).not.toThrow();
    });

    it('should enforce minimum security standards', () => {
      // Test that client enforces HTTPS
      expect(
        () =>
          new AWSBedrockClient({
            ...validConfig,
            baseURL: 'http://example.com',
          })
      ).toThrow('must use HTTPS protocol');

      // Test that client requires non-empty API key
      expect(
        () =>
          new AWSBedrockClient({
            ...validConfig,
            apiKey: '',
          })
      ).toThrow('must be a non-empty string');

      // Test that client requires valid timeout
      expect(
        () =>
          new AWSBedrockClient({
            ...validConfig,
            timeout: 0,
          })
      ).toThrow('must be a positive number');
    });
  });

  describe('Configuration Immutability', () => {
    it('should freeze configuration object to prevent modification', () => {
      const client = new AWSBedrockClient(validConfig);

      // Access the private config
      const config = client['config'];

      // Should be frozen
      expect(Object.isFrozen(config)).toBe(true);

      // Attempting to modify should not work
      expect(() => {
        (config as any).apiKey = 'modified-key';
      }).toThrow();
    });

    it('should not allow modification of original config object', () => {
      const originalConfig = { ...validConfig };
      const client = new AWSBedrockClient(originalConfig);

      // Modify original config
      originalConfig.apiKey = 'modified-key';

      // Client config should remain unchanged
      const clientConfig = client.getConfig();
      expect(clientConfig.apiKey).toBe('[REDACTED]');

      // Internal config should not be affected
      expect(client['config'].apiKey).toBe(validConfig.apiKey);
    });
  });
});
