/**
 * @fileoverview Unit tests for AWS Bedrock Converse API client.
 *
 * This test suite validates the AWS Bedrock client implementation,
 * including configuration validation, request parameter validation, error handling,
 * and response processing. All tests follow strict TypeScript patterns and
 * comprehensive error handling requirements.
 *
 * @author Claude-to-Azure Proxy Team
 * @version 1.0.0
 * @since 1.0.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AWSBedrockClient } from '../../src/clients/aws-bedrock-client.js';
import type {
  AWSBedrockConfig,
  ResponsesCreateParams,
} from '../../src/types/index.js';

describe('AWSBedrockClient', () => {
  let validConfig: AWSBedrockConfig;

  beforeEach(() => {
    validConfig = {
      baseURL: 'https://bedrock-runtime.us-west-2.amazonaws.com',
      apiKey: 'test-bedrock-api-key-32-characters-long',
      region: 'us-west-2',
      timeout: 30000,
      maxRetries: 3,
    };
  });

  describe('constructor', () => {
    it('should create client with valid configuration', () => {
      expect(() => new AWSBedrockClient(validConfig)).not.toThrow();
    });

    it('should throw error for invalid baseURL', () => {
      const invalidConfig = { ...validConfig, baseURL: '' };
      expect(() => new AWSBedrockClient(invalidConfig)).toThrow(
        'Invalid baseURL: must be a non-empty string'
      );
    });

    it('should throw error for non-HTTPS baseURL', () => {
      const invalidConfig = { ...validConfig, baseURL: 'http://test.com' };
      expect(() => new AWSBedrockClient(invalidConfig)).toThrow(
        'Invalid baseURL: must use HTTPS protocol'
      );
    });

    it('should throw error for invalid apiKey', () => {
      const invalidConfig = { ...validConfig, apiKey: '' };
      expect(() => new AWSBedrockClient(invalidConfig)).toThrow(
        'Invalid apiKey: must be a non-empty string'
      );
    });

    it('should throw error for invalid region', () => {
      const invalidConfig = { ...validConfig, region: '' };
      expect(() => new AWSBedrockClient(invalidConfig)).toThrow(
        'Invalid region: must be a non-empty string'
      );
    });

    it('should throw error for invalid timeout', () => {
      const invalidConfig = { ...validConfig, timeout: 0 };
      expect(() => new AWSBedrockClient(invalidConfig)).toThrow(
        'Invalid timeout: must be a positive number'
      );
    });

    it('should throw error for invalid maxRetries', () => {
      const invalidConfig = { ...validConfig, maxRetries: -1 };
      expect(() => new AWSBedrockClient(invalidConfig)).toThrow(
        'Invalid maxRetries: must be a non-negative number'
      );
    });
  });

  describe('request parameter validation', () => {
    let client: AWSBedrockClient;
    let validParams: ResponsesCreateParams;

    beforeEach(() => {
      client = new AWSBedrockClient(validConfig);
      validParams = {
        model: 'qwen.qwen3-coder-480b-a35b-v1:0',
        input: [{ role: 'user', content: 'Hello, world!' }],
        max_output_tokens: 1000,
        temperature: 0.7,
        top_p: 0.9,
      };
    });

    it('should validate model parameter', async () => {
      const invalidParams = { ...validParams, model: '' };
      await expect(client.createResponse(invalidParams)).rejects.toThrow(
        'Invalid model: must be a non-empty string'
      );
    });

    it('should validate input parameter - missing input', async () => {
      const invalidParams = {
        ...validParams,
        input: undefined as unknown as string,
      };
      await expect(client.createResponse(invalidParams)).rejects.toThrow(
        'Invalid input: must be a string or array of messages'
      );
    });

    it('should validate input parameter - empty string', async () => {
      const invalidParams = { ...validParams, input: '' };
      await expect(client.createResponse(invalidParams)).rejects.toThrow(
        'Invalid input: string input cannot be empty'
      );
    });

    it('should validate input parameter - empty array', async () => {
      const invalidParams = { ...validParams, input: [] };
      await expect(client.createResponse(invalidParams)).rejects.toThrow(
        'Invalid input: message array cannot be empty'
      );
    });

    it('should validate message role', async () => {
      const invalidParams = {
        ...validParams,
        input: [{ role: 'invalid' as 'user', content: 'Hello' }],
      };
      await expect(client.createResponse(invalidParams)).rejects.toThrow(
        'Invalid message role at index 0: must be user, assistant, or system'
      );
    });

    it('should validate message content', async () => {
      const invalidParams = {
        ...validParams,
        input: [{ role: 'user', content: '' }],
      };
      await expect(client.createResponse(invalidParams)).rejects.toThrow(
        'Invalid message content at index 0: must be a non-empty string'
      );
    });

    it('should validate max_output_tokens', async () => {
      const invalidParams = { ...validParams, max_output_tokens: 0 };
      await expect(client.createResponse(invalidParams)).rejects.toThrow(
        'Invalid max_output_tokens: must be a positive number'
      );
    });

    it('should validate temperature range', async () => {
      const invalidParams = { ...validParams, temperature: 3.0 };
      await expect(client.createResponse(invalidParams)).rejects.toThrow(
        'Invalid temperature: must be a number between 0 and 2'
      );
    });

    it('should validate top_p range', async () => {
      const invalidParams = { ...validParams, top_p: 1.5 };
      await expect(client.createResponse(invalidParams)).rejects.toThrow(
        'Invalid top_p: must be a number between 0 and 1'
      );
    });
  });

  describe('getConfig', () => {
    it('should return sanitized configuration', () => {
      const client = new AWSBedrockClient(validConfig);
      const sanitizedConfig = client.getConfig();

      expect(sanitizedConfig).toEqual({
        baseURL: validConfig.baseURL,
        apiKey: '[REDACTED]',
        region: validConfig.region,
        timeout: validConfig.timeout,
        maxRetries: validConfig.maxRetries,
      });
    });

    it('should not expose actual API key', () => {
      const client = new AWSBedrockClient(validConfig);
      const sanitizedConfig = client.getConfig();

      expect(sanitizedConfig.apiKey).toBe('[REDACTED]');
      expect(sanitizedConfig.apiKey).not.toBe(validConfig.apiKey);
    });
  });

  describe('error handling', () => {
    let client: AWSBedrockClient;

    beforeEach(() => {
      client = new AWSBedrockClient(validConfig);
    });

    it('should handle timeout errors', async () => {
      const params: ResponsesCreateParams = {
        model: 'qwen.qwen3-coder-480b-a35b-v1:0',
        input: [{ role: 'user', content: 'Hello' }],
      };

      // Mock axios to simulate timeout
      vi.spyOn(client['client'], 'post').mockRejectedValue(
        new Error('timeout of 30000ms exceeded')
      );

      await expect(client.createResponse(params)).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      const params: ResponsesCreateParams = {
        model: 'qwen.qwen3-coder-480b-a35b-v1:0',
        input: [{ role: 'user', content: 'Hello' }],
      };

      // Mock axios to simulate network error
      const networkError = new Error('ECONNREFUSED');
      (networkError as any).code = 'ECONNREFUSED';
      vi.spyOn(client['client'], 'post').mockRejectedValue(networkError);

      await expect(client.createResponse(params)).rejects.toThrow();
    });

    it('should handle API errors with proper status codes', async () => {
      const params: ResponsesCreateParams = {
        model: 'qwen.qwen3-coder-480b-a35b-v1:0',
        input: [{ role: 'user', content: 'Hello' }],
      };

      // Mock axios to simulate API error
      const apiError = {
        isAxiosError: true,
        response: {
          status: 400,
          data: { error: { message: 'Invalid request' } },
        },
        message: 'Request failed with status code 400',
      };
      vi.spyOn(client['client'], 'post').mockRejectedValue(apiError);

      await expect(client.createResponse(params)).rejects.toThrow();
    });
  });

  describe('request transformation', () => {
    let client: AWSBedrockClient;

    beforeEach(() => {
      client = new AWSBedrockClient(validConfig);
    });

    it('should transform string input to Bedrock format', () => {
      const params: ResponsesCreateParams = {
        model: 'qwen.qwen3-coder-480b-a35b-v1:0',
        input: 'Hello, world!',
      };

      const bedrockRequest = client['buildBedrockRequest'](params);

      expect(bedrockRequest.messages).toEqual([
        {
          role: 'user',
          content: [{ text: 'Hello, world!' }],
        },
      ]);
    });

    it('should transform message array to Bedrock format', () => {
      const params: ResponsesCreateParams = {
        model: 'qwen.qwen3-coder-480b-a35b-v1:0',
        input: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How are you?' },
        ],
      };

      const bedrockRequest = client['buildBedrockRequest'](params);

      expect(bedrockRequest.messages).toEqual([
        { role: 'user', content: [{ text: 'Hello' }] },
        { role: 'assistant', content: [{ text: 'Hi there!' }] },
        { role: 'user', content: [{ text: 'How are you?' }] },
      ]);
    });

    it('should handle system messages separately', () => {
      const params: ResponsesCreateParams = {
        model: 'qwen.qwen3-coder-480b-a35b-v1:0',
        input: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'Hello' },
        ],
      };

      const bedrockRequest = client['buildBedrockRequest'](params);

      expect(bedrockRequest.system).toEqual([
        { text: 'You are a helpful assistant' },
      ]);
      expect(bedrockRequest.messages).toEqual([
        { role: 'user', content: [{ text: 'Hello' }] },
      ]);
    });

    it('should include inference config when parameters are provided', () => {
      const params: ResponsesCreateParams = {
        model: 'qwen.qwen3-coder-480b-a35b-v1:0',
        input: 'Hello',
        max_output_tokens: 1000,
        temperature: 0.7,
        top_p: 0.9,
        stop: ['END', 'STOP'],
      };

      const bedrockRequest = client['buildBedrockRequest'](params);

      expect(bedrockRequest.inferenceConfig).toEqual({
        maxTokens: 1000,
        temperature: 0.7,
        topP: 0.9,
        stopSequences: ['END', 'STOP'],
      });
    });
  });

  describe('response transformation', () => {
    let client: AWSBedrockClient;

    beforeEach(() => {
      client = new AWSBedrockClient(validConfig);
    });

    it('should transform Bedrock response to Responses format', () => {
      const bedrockResponse = {
        responseId: 'bedrock-response-123',
        output: {
          message: {
            role: 'assistant' as const,
            content: [{ text: 'Hello there!' }],
          },
        },
        stopReason: 'end_turn' as const,
        usage: {
          inputTokens: 10,
          outputTokens: 15,
          totalTokens: 25,
        },
        metrics: {
          latencyMs: 1500,
        },
      };

      const transformed = client['transformBedrockResponse'](
        bedrockResponse,
        'qwen-3-coder'
      );

      expect(transformed.id).toBe('bedrock-response-123');
      expect(transformed.object).toBe('response');
      expect(transformed.model).toBe('qwen-3-coder');
      expect(transformed.output).toEqual([
        {
          type: 'text',
          text: 'Hello there!',
        },
      ]);
      expect(transformed.usage).toEqual({
        prompt_tokens: 10,
        completion_tokens: 15,
        total_tokens: 25,
      });
    });

    it('should handle tool use in response', () => {
      const bedrockResponse = {
        responseId: 'bedrock-response-456',
        output: {
          message: {
            role: 'assistant' as const,
            content: [
              {
                toolUse: {
                  toolUseId: 'tool-123',
                  name: 'get_weather',
                  input: { location: 'San Francisco' },
                },
              },
            ],
          },
        },
        stopReason: 'tool_use' as const,
        usage: {
          inputTokens: 20,
          outputTokens: 5,
          totalTokens: 25,
        },
        metrics: {
          latencyMs: 800,
        },
      };

      const transformed = client['transformBedrockResponse'](
        bedrockResponse,
        'qwen-3-coder'
      );

      expect(transformed.output).toEqual([
        {
          type: 'tool_call',
          tool_call: {
            id: 'tool-123',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: JSON.stringify({ location: 'San Francisco' }),
            },
          },
        },
      ]);
    });
  });

  describe('type safety', () => {
    it('should enforce readonly configuration', () => {
      const client = new AWSBedrockClient(validConfig);
      const config = client.getConfig();

      // TypeScript should prevent modification of readonly properties
      expect(typeof config.baseURL).toBe('string');
      expect(typeof config.region).toBe('string');
      expect(typeof config.timeout).toBe('number');
      expect(typeof config.maxRetries).toBe('number');
    });

    it('should enforce correct parameter types', () => {
      // Valid parameters should be accepted
      const validParams: ResponsesCreateParams = {
        model: 'qwen.qwen3-coder-480b-a35b-v1:0',
        input: 'Hello, world!',
        max_output_tokens: 1000,
        temperature: 0.7,
        top_p: 0.9,
        stream: false,
      };

      // This should not throw a TypeScript error
      expect(typeof validParams.model).toBe('string');
      expect(
        Array.isArray(validParams.input) ||
          typeof validParams.input === 'string'
      ).toBe(true);
    });
  });
});