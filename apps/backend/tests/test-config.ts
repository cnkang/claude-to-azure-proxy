/**
 * Centralized test configuration and mocking setup
 * This file provides consistent configuration mocking across all test files
 */

import type { Config } from '../src/config/index';
import type { ServerConfig } from '../src/types/index';

/**
 * Standard test configuration that satisfies all validation requirements
 */
export const testConfig: Config = {
  PROXY_API_KEY: 'test-api-key-12345678901234567890123456789012',
  AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
  AZURE_OPENAI_API_KEY: 'test-azure-key-12345678901234567890123456789012',
  AZURE_OPENAI_MODEL: 'gpt-5-codex',

  AZURE_OPENAI_TIMEOUT: 60000,
  AZURE_OPENAI_MAX_RETRIES: 3,
  DEFAULT_REASONING_EFFORT: 'medium',
  PORT: 3000,
  NODE_ENV: 'test',
};

/**
 * Server configuration for tests
 */
export const testServerConfig: ServerConfig = {
  port: testConfig.PORT,
  nodeEnv: testConfig.NODE_ENV,
  proxyApiKey: testConfig.PROXY_API_KEY,
  azureOpenAI: {
    endpoint: testConfig.AZURE_OPENAI_ENDPOINT,
    apiKey: testConfig.AZURE_OPENAI_API_KEY,
    model: testConfig.AZURE_OPENAI_MODEL,
  },
};

/**
 * Valid API key for test authentication
 */
export const validApiKey = testConfig.PROXY_API_KEY;

/**
 * Mock configuration factory for vi.mock()
 */
export const createMockConfig = (overrides: Partial<Config> = {}) => ({
  default: { ...testConfig, ...overrides },
  sanitizedConfig: {
    AZURE_OPENAI_ENDPOINT: testConfig.AZURE_OPENAI_ENDPOINT,
    AZURE_OPENAI_MODEL: testConfig.AZURE_OPENAI_MODEL,

    AZURE_OPENAI_TIMEOUT: testConfig.AZURE_OPENAI_TIMEOUT,
    AZURE_OPENAI_MAX_RETRIES: testConfig.AZURE_OPENAI_MAX_RETRIES,
    DEFAULT_REASONING_EFFORT: testConfig.DEFAULT_REASONING_EFFORT,
    PORT: testConfig.PORT,
    NODE_ENV: testConfig.NODE_ENV,
    PROXY_API_KEY: '[REDACTED]',
    AZURE_OPENAI_API_KEY: '[REDACTED]',
  },
  createAzureOpenAIConfig: () => ({
    baseURL: `${testConfig.AZURE_OPENAI_ENDPOINT}/openai/v1/`,
    apiKey: testConfig.AZURE_OPENAI_API_KEY,
    deployment: testConfig.AZURE_OPENAI_MODEL,
    timeout: testConfig.AZURE_OPENAI_TIMEOUT,
    maxRetries: testConfig.AZURE_OPENAI_MAX_RETRIES,
  }),
  // Add Bedrock configuration functions for testing
  isAWSBedrockConfigured: () => false, // Default to false for tests
  createAWSBedrockConfig: () => ({
    baseURL: 'https://bedrock-runtime.us-west-2.amazonaws.com',
    apiKey: 'test-bedrock-key',
    region: 'us-west-2',
    timeout: 120000,
    maxRetries: 3,
  }),
});

/**
 * Setup environment variables for tests that don't use mocking
 */
export const setupTestEnvironment = (): void => {
  process.env.PROXY_API_KEY = testConfig.PROXY_API_KEY;
  process.env.AZURE_OPENAI_ENDPOINT = testConfig.AZURE_OPENAI_ENDPOINT;
  process.env.AZURE_OPENAI_API_KEY = testConfig.AZURE_OPENAI_API_KEY;
  process.env.AZURE_OPENAI_MODEL = testConfig.AZURE_OPENAI_MODEL;
  process.env.AZURE_OPENAI_TIMEOUT = testConfig.AZURE_OPENAI_TIMEOUT.toString();
  process.env.AZURE_OPENAI_MAX_RETRIES =
    testConfig.AZURE_OPENAI_MAX_RETRIES.toString();
  process.env.DEFAULT_REASONING_EFFORT = testConfig.DEFAULT_REASONING_EFFORT;
  process.env.PORT = testConfig.PORT.toString();
  process.env.NODE_ENV = testConfig.NODE_ENV;
};

/**
 * Clean up environment variables after tests
 */
export const cleanupTestEnvironment = (): void => {
  const keysToClear: Array<keyof NodeJS.ProcessEnv> = [
    'PROXY_API_KEY',
    'AZURE_OPENAI_ENDPOINT',
    'AZURE_OPENAI_API_KEY',
    'AZURE_OPENAI_MODEL',
    'AZURE_OPENAI_TIMEOUT',
    'AZURE_OPENAI_MAX_RETRIES',
    'DEFAULT_REASONING_EFFORT',
    'PORT',
    'NODE_ENV',
  ];

  for (const key of keysToClear) {
    Reflect.deleteProperty(process.env, key);
  }
};
