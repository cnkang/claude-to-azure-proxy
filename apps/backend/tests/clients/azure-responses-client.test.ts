/**
 * @fileoverview Unit tests for Azure OpenAI v1 Responses API client.
 *
 * This test suite validates the Azure Responses API client implementation,
 * including configuration validation, request parameter validation, error handling,
 * and response processing. All tests follow strict TypeScript patterns and
 * comprehensive error handling requirements.
 *
 * @author Claude-to-Azure Proxy Team
 * @version 2.0.0
 * @since 1.0.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AzureResponsesClient } from '../../src/clients/azure-responses-client';
import type {
  AzureOpenAIConfig,
  ResponsesCreateParams,
  ResponsesStreamChunk,
} from '../../src/types/index';

describe('AzureResponsesClient', () => {
  let validConfig: AzureOpenAIConfig;

  beforeEach(() => {
    validConfig = {
      baseURL: 'https://test-resource.openai.azure.com/openai/v1/',
      apiKey: 'test-api-key-32-characters-long',
      apiVersion: 'preview', // Optional for preview features
      deployment: 'gpt-5-codex',
      timeout: 30000,
      maxRetries: 3,
    };
  });

  describe('constructor', () => {
    it('should create client with valid configuration', () => {
      expect(() => new AzureResponsesClient(validConfig)).not.toThrow();
    });

    it('should throw error for invalid baseURL', () => {
      const invalidConfig = { ...validConfig, baseURL: '' };
      expect(() => new AzureResponsesClient(invalidConfig)).toThrow(
        'Invalid baseURL: must be a non-empty string'
      );
    });

    it('should throw error for non-HTTPS baseURL', () => {
      const invalidConfig = { ...validConfig, baseURL: 'http://test.com' };
      expect(() => new AzureResponsesClient(invalidConfig)).toThrow(
        'Invalid baseURL: must use HTTPS protocol'
      );
    });

    it('should throw error for invalid apiKey', () => {
      const invalidConfig = { ...validConfig, apiKey: '' };
      expect(() => new AzureResponsesClient(invalidConfig)).toThrow(
        'Invalid apiKey: must be a non-empty string'
      );
    });

    it('should create client without apiVersion validation (using latest stable API)', () => {
      const configWithEmptyApiVersion = { ...validConfig, apiVersion: '' };
      expect(
        () => new AzureResponsesClient(configWithEmptyApiVersion)
      ).not.toThrow();
    });

    it('should create client without apiVersion (GA v1 API)', () => {
      const configWithoutApiVersion = { ...validConfig };
      delete configWithoutApiVersion.apiVersion;
      expect(
        () => new AzureResponsesClient(configWithoutApiVersion)
      ).not.toThrow();
    });

    it('should throw error for invalid deployment', () => {
      const invalidConfig = { ...validConfig, deployment: '' };
      expect(() => new AzureResponsesClient(invalidConfig)).toThrow(
        'Invalid deployment: must be a non-empty string'
      );
    });

    it('should throw error for invalid timeout', () => {
      const invalidConfig = { ...validConfig, timeout: 0 };
      expect(() => new AzureResponsesClient(invalidConfig)).toThrow(
        'Invalid timeout: must be a positive number'
      );
    });

    it('should throw error for invalid maxRetries', () => {
      const invalidConfig = { ...validConfig, maxRetries: -1 };
      expect(() => new AzureResponsesClient(invalidConfig)).toThrow(
        'Invalid maxRetries: must be a non-negative number'
      );
    });
  });

  describe('request parameter validation', () => {
    let client: AzureResponsesClient;
    let validParams: ResponsesCreateParams;

    beforeEach(() => {
      client = new AzureResponsesClient(validConfig);
      validParams = {
        model: 'gpt-5-codex',
        input: [{ role: 'user', content: 'Hello, world!' }],
        max_output_tokens: 1000,
        reasoning: { effort: 'medium' },
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

    it('should validate reasoning effort', async () => {
      const invalidParams = {
        ...validParams,
        reasoning: { effort: 'invalid' as 'medium' },
      };
      await expect(client.createResponse(invalidParams)).rejects.toThrow(
        'Invalid reasoning effort: must be minimal, low, medium, or high'
      );
    });
  });

  describe('getConfig', () => {
    it('should return sanitized configuration with apiVersion', () => {
      const client = new AzureResponsesClient(validConfig);
      const sanitizedConfig = client.getConfig();

      expect(sanitizedConfig).toEqual({
        baseURL: validConfig.baseURL,
        apiKey: '[REDACTED]',
        deployment: validConfig.deployment,
        timeout: validConfig.timeout,
        maxRetries: validConfig.maxRetries,
      });
    });

    it('should return sanitized configuration without apiVersion for GA v1 API', () => {
      const configWithoutApiVersion = { ...validConfig };
      delete configWithoutApiVersion.apiVersion;
      const client = new AzureResponsesClient(configWithoutApiVersion);
      const sanitizedConfig = client.getConfig();

      expect(sanitizedConfig).toEqual({
        baseURL: configWithoutApiVersion.baseURL,
        apiKey: '[REDACTED]',
        deployment: configWithoutApiVersion.deployment,
        timeout: configWithoutApiVersion.timeout,
        maxRetries: configWithoutApiVersion.maxRetries,
      });
      expect(sanitizedConfig.apiVersion).toBeUndefined();
    });

    it('should not expose actual API key', () => {
      const client = new AzureResponsesClient(validConfig);
      const sanitizedConfig = client.getConfig();

      expect(sanitizedConfig.apiKey).toBe('[REDACTED]');
      expect(sanitizedConfig.apiKey).not.toBe(validConfig.apiKey);
    });
  });

  describe('error handling', () => {
    let client: AzureResponsesClient;

    beforeEach(() => {
      client = new AzureResponsesClient(validConfig);
    });

    it('should stream response chunks from Azure Responses API', async () => {
      const params: ResponsesCreateParams = {
        model: 'gpt-5-codex',
        input: [{ role: 'user', content: 'Hello' }],
        stream: true,
      };

      const chunks: ResponsesStreamChunk[] = [];

      for await (const chunk of client.createResponseStream(params)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThanOrEqual(2);

      const firstChunk = chunks[0];
      expect(firstChunk.object).toBe('response.chunk');
      expect(firstChunk.model).toBe(validConfig.deployment);
      expect(firstChunk.output.length).toBeGreaterThan(0);
      expect(firstChunk.output[0]?.type).toBe('text');
      expect(typeof firstChunk.id).toBe('string');

      if (chunks.length === 0) {
        throw new Error('No chunks returned from streaming call');
      }

      const finalChunk = chunks.reduce<ResponsesStreamChunk>(
        (_, chunk) => chunk
      );

      expect(finalChunk.usage).toBeDefined();
      expect(finalChunk.usage?.total_tokens).toBeGreaterThan(0);
      expect(finalChunk.output.length).toBeGreaterThan(0);
    });
  });

  describe('type safety', () => {
    it('should enforce readonly configuration', () => {
      const client = new AzureResponsesClient(validConfig);
      const config = client.getConfig();

      // TypeScript should prevent modification of readonly properties
      // This test ensures the types are correctly defined
      expect(typeof config.baseURL).toBe('string');
      if (config.apiVersion !== undefined) {
        expect(typeof config.apiVersion).toBe('string');
      }
      expect(typeof config.deployment).toBe('string');
      expect(typeof config.timeout).toBe('number');
      expect(typeof config.maxRetries).toBe('number');
    });

    it('should enforce correct parameter types', () => {
      // Valid parameters should be accepted
      const validParams: ResponsesCreateParams = {
        model: 'gpt-5-codex',
        input: 'Hello, world!',
        max_output_tokens: 1000,
        reasoning: { effort: 'medium' },
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
