/**
 * @fileoverview Configuration management module with comprehensive validation and type safety.
 *
 * This module handles loading, validating, and providing type-safe access to all
 * application configuration. It implements fail-fast principles with detailed
 * error messages and prevents runtime configuration modifications through
 * immutable objects.
 *
 * @author Claude-to-Azure Proxy Team
 * @version 1.0.0
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import config from './config/index.js';
 *
 * // Configuration is automatically loaded and validated
 * console.log(`Server will run on port ${config.PORT}`);
 * console.log(`Azure endpoint: ${config.AZURE_OPENAI_ENDPOINT}`);
 * ```
 */

import Joi from 'joi';
import type {
  ValidationError,
  ValidationErrorItem,
  ValidationResult,
} from 'joi';
import { config as dotenvConfig } from 'dotenv';
import { ConfigurationError } from '../errors/index.js';

const shouldLoadDotenv =
  process.env.NODE_ENV !== 'test' &&
  process.env.VITEST === undefined &&
  process.env.VITEST_WORKER_ID === undefined;

if (shouldLoadDotenv) {
  dotenvConfig();
}

/**
 * Configuration interface defining the structure of validated configuration.
 *
 * All properties are required and strictly typed to ensure type safety
 * throughout the application. The configuration is validated at startup
 * and frozen to prevent runtime modifications.
 *
 * @public
 * @interface Config
 *
 * @example
 * ```typescript
 * const config: Config = {
 *   PROXY_API_KEY: 'secure-32-char-api-key-here',
 *   AZURE_OPENAI_ENDPOINT: 'https://your-resource.openai.azure.com',
 *   AZURE_OPENAI_API_KEY: 'your-azure-openai-api-key',
 *   AZURE_OPENAI_MODEL: 'gpt-4-deployment-name',
 *   PORT: 8080,
 *   NODE_ENV: 'production'
 * };
 * ```
 */
export interface Config {
  /**
   * API key for client authentication with the proxy server.
   *
   * This key is used by clients (like Claude Code CLI) to authenticate
   * with the proxy. It should be a secure, randomly generated string
   * of at least 32 characters.
   *
   * @example "abc123def456ghi789jkl012mno345pqr678"
   */
  PROXY_API_KEY: string;

  /**
   * Azure OpenAI endpoint URL for the target resource.
   *
   * Must be a valid HTTPS URL pointing to your Azure OpenAI resource.
   * The URL format is typically: https://{resource-name}.openai.azure.com
   *
   * @example "https://my-openai-resource.openai.azure.com"
   */
  AZURE_OPENAI_ENDPOINT: string;

  /**
   * Azure OpenAI API key for backend authentication.
   *
   * This key is used by the proxy to authenticate with Azure OpenAI.
   * It should be kept secure and never exposed to clients.
   *
   * @example "1234567890abcdef1234567890abcdef"
   */
  AZURE_OPENAI_API_KEY: string;

  /**
   * Azure OpenAI model deployment name.
   *
   * The name of the model deployment in your Azure OpenAI resource.
   * This should match exactly with the deployment name configured
   * in Azure OpenAI Studio.
   *
   * @example "gpt-4" or "gpt-35-turbo-16k"
   */
  AZURE_OPENAI_MODEL: string;

  /**
   * Azure OpenAI API version for Responses API (optional).
   *
   * The API version to use for Azure OpenAI Responses API calls.
   * - For v1 GA API (recommended): Leave undefined or empty
   * - For legacy preview API: Set to "preview"
   *
   * @default undefined (uses GA v1 API)
   * @example "preview" for legacy preview API
   */
  AZURE_OPENAI_API_VERSION?: string;

  /**
   * Request timeout in milliseconds for Azure OpenAI API calls.
   *
   * Maximum time to wait for Azure OpenAI API responses before timing out.
   * Should be set based on expected response times and reasoning complexity.
   *
   * @default 120000
   * @example 120000
   */
  AZURE_OPENAI_TIMEOUT: number;

  /**
   * Maximum number of retry attempts for failed Azure OpenAI API calls.
   *
   * Number of times to retry failed requests before giving up.
   * Uses exponential backoff with jitter for retry delays.
   *
   * @default 3
   * @example 3
   */
  AZURE_OPENAI_MAX_RETRIES: number;

  /**
   * Default reasoning effort level for requests.
   *
   * The default reasoning effort to use when not specified in requests.
   * Can be overridden by intelligent analysis or client specifications.
   *
   * @default "medium"
   * @example "minimal" | "low" | "medium" | "high"
   */
  DEFAULT_REASONING_EFFORT: 'minimal' | 'low' | 'medium' | 'high';

  /**
   * Enable content security validation for request content.
   *
   * When enabled, the proxy will scan request content for potentially
   * malicious patterns like script tags, event handlers, and template
   * injection attempts. Disable for development/code review scenarios
   * where such content is legitimate.
   *
   * @default true
   * @example true | false
   */
  ENABLE_CONTENT_SECURITY_VALIDATION: boolean;

  /**
   * Server port number for HTTP connections.
   *
   * The port on which the proxy server will listen for incoming requests.
   * Default is 8080, which is suitable for AWS App Runner deployment.
   * Must be between 1024 and 65535.
   *
   * @default 8080
   * @example 8080
   */
  PORT: number;

  /**
   * Node.js environment setting.
   *
   * Determines the runtime environment and affects logging levels,
   * error handling behavior, and performance optimizations.
   *
   * @default "production"
   * @example "development" | "production" | "test"
   */
  NODE_ENV: 'development' | 'production' | 'test';

  /**
   * AWS Bedrock API key for backend authentication (optional).
   *
   * This key is used by the proxy to authenticate with AWS Bedrock API.
   * When provided, enables AWS Bedrock model support alongside Azure OpenAI.
   * It should be kept secure and never exposed to clients.
   *
   * @example "AKIA1234567890ABCDEF"
   */
  AWS_BEDROCK_API_KEY?: string;

  /**
   * AWS Bedrock region for API calls (optional).
   *
   * The AWS region where Bedrock models are deployed.
   * Currently supports us-west-2 for Qwen models.
   *
   * @default "us-west-2"
   * @example "us-west-2"
   */
  AWS_BEDROCK_REGION?: string;

  /**
   * Request timeout in milliseconds for AWS Bedrock API calls (optional).
   *
   * Maximum time to wait for AWS Bedrock API responses before timing out.
   * Should be set based on expected response times and model complexity.
   *
   * @default 120000
   * @example 120000
   */
  AWS_BEDROCK_TIMEOUT?: number;

  /**
   * Maximum number of retry attempts for failed AWS Bedrock API calls (optional).
   *
   * Number of times to retry failed requests before giving up.
   * Uses exponential backoff with jitter for retry delays.
   *
   * @default 3
   * @example 3
   */
  AWS_BEDROCK_MAX_RETRIES?: number;

  /**
   * Node.js 24 memory management configuration.
   *
   * Enable enhanced memory management features including GC monitoring,
   * memory leak detection, and automatic memory pressure handling.
   *
   * @default true
   * @example true | false
   */
  ENABLE_MEMORY_MANAGEMENT: boolean;

  /**
   * Memory monitoring sample interval in milliseconds.
   *
   * How frequently to collect memory usage samples for analysis.
   * Lower values provide more granular monitoring but use more resources.
   *
   * @default 10000
   * @example 5000 | 10000 | 30000
   */
  MEMORY_SAMPLE_INTERVAL: number;

  /**
   * Memory pressure threshold for triggering warnings (percentage).
   *
   * When heap usage exceeds this percentage, warnings will be logged
   * and memory optimization suggestions will be provided.
   *
   * @default 80
   * @example 70 | 80 | 90
   */
  MEMORY_PRESSURE_THRESHOLD: number;

  /**
   * Enable automatic garbage collection on memory pressure.
   *
   * When enabled, the system will automatically trigger garbage collection
   * when memory pressure exceeds the critical threshold.
   *
   * @default true
   * @example true | false
   */
  ENABLE_AUTO_GC: boolean;

  /**
   * Enable resource leak detection and monitoring.
   *
   * When enabled, the system will track resource usage and detect
   * potential leaks in HTTP connections, streams, and timers.
   *
   * @default true
   * @example true | false
   */
  ENABLE_RESOURCE_MONITORING: boolean;

  /**
   * HTTP server keep-alive timeout in milliseconds.
   *
   * How long to keep HTTP connections alive for reuse.
   * Should be slightly higher than load balancer timeout.
   *
   * @default 65000
   * @example 60000 | 65000 | 75000
   */
  HTTP_KEEP_ALIVE_TIMEOUT: number;

  /**
   * HTTP server headers timeout in milliseconds.
   *
   * Maximum time to wait for request headers to be received.
   * Should be higher than keep-alive timeout.
   *
   * @default 66000
   * @example 61000 | 66000 | 76000
   */
  HTTP_HEADERS_TIMEOUT: number;

  /**
   * Maximum number of concurrent HTTP connections.
   *
   * Limits the number of simultaneous connections to prevent
   * resource exhaustion and ensure stable performance.
   *
   * @default 1000
   * @example 500 | 1000 | 2000
   */
  HTTP_MAX_CONNECTIONS: number;
}

/**
 * Configuration schema using Joi for strict validation
 */
const configSchema = Joi.object<Config>({
  // Required proxy API key for client authentication
  PROXY_API_KEY: Joi.string()
    .min(32)
    .max(256)
    .required()
    .description('API key for client authentication with the proxy'),

  // Required Azure OpenAI endpoint URL
  AZURE_OPENAI_ENDPOINT: Joi.string()
    .uri({ scheme: ['https'] })
    .required()
    .description('Azure OpenAI endpoint URL (must be HTTPS)'),

  // Required Azure OpenAI API key
  AZURE_OPENAI_API_KEY: Joi.string()
    .min(32)
    .max(256)
    .required()
    .description('Azure OpenAI API key for backend authentication'),

  // Required Azure OpenAI model deployment name
  AZURE_OPENAI_MODEL: Joi.string()
    .min(1)
    .max(100)
    .pattern(/^[a-zA-Z0-9-_]+$/)
    .required()
    .description('Azure OpenAI model deployment name'),

  // Optional Azure OpenAI API version (for legacy preview API)
  AZURE_OPENAI_API_VERSION: Joi.string()
    .min(1)
    .max(50)
    .optional()
    .allow('')
    .description(
      'Azure OpenAI API version (optional: "preview" for legacy API, empty for GA v1 API)'
    ),

  // Optional timeout with default value and range validation
  AZURE_OPENAI_TIMEOUT: Joi.number()
    .integer()
    .min(5000)
    .max(300000)
    .default(120000)
    .description('Request timeout in milliseconds (default: 120000)'),

  // Optional max retries with default value and range validation
  AZURE_OPENAI_MAX_RETRIES: Joi.number()
    .integer()
    .min(0)
    .max(10)
    .default(3)
    .description('Maximum retry attempts (default: 3)'),

  // Optional default reasoning effort with validation
  DEFAULT_REASONING_EFFORT: Joi.string()
    .valid('minimal', 'low', 'medium', 'high')
    .default('medium')
    .description('Default reasoning effort level'),

  // Optional content security validation flag
  ENABLE_CONTENT_SECURITY_VALIDATION: Joi.boolean()
    .default(true)
    .description(
      'Enable content security validation (disable for code review scenarios)'
    ),

  // Optional port with default value and range validation
  PORT: Joi.number()
    .integer()
    .min(1024)
    .max(65535)
    .default(8080)
    .description('Server port number (default: 8080 for AWS App Runner)'),

  // Optional Node environment
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('production')
    .description('Node.js environment'),

  // Optional AWS Bedrock API key
  AWS_BEDROCK_API_KEY: Joi.string()
    .min(16)
    .max(256)
    .optional()
    .description('AWS Bedrock API key for backend authentication (optional)'),

  // Optional AWS Bedrock region
  AWS_BEDROCK_REGION: Joi.string()
    .valid('us-west-2', 'us-east-1', 'eu-west-1')
    .default('us-west-2')
    .optional()
    .description('AWS Bedrock region (default: us-west-2)'),

  // Optional AWS Bedrock timeout
  AWS_BEDROCK_TIMEOUT: Joi.number()
    .integer()
    .min(5000)
    .max(300000)
    .default(120000)
    .optional()
    .description(
      'AWS Bedrock request timeout in milliseconds (default: 120000)'
    ),

  // Optional AWS Bedrock max retries
  AWS_BEDROCK_MAX_RETRIES: Joi.number()
    .integer()
    .min(0)
    .max(10)
    .default(3)
    .optional()
    .description('AWS Bedrock maximum retry attempts (default: 3)'),

  // Node.js 24 memory management configuration
  ENABLE_MEMORY_MANAGEMENT: Joi.boolean()
    .default(true)
    .description('Enable Node.js 24 enhanced memory management features'),

  MEMORY_SAMPLE_INTERVAL: Joi.number()
    .integer()
    .min(1000)
    .max(60000)
    .default(10000)
    .description(
      'Memory monitoring sample interval in milliseconds (default: 10000)'
    ),

  MEMORY_PRESSURE_THRESHOLD: Joi.number()
    .integer()
    .min(50)
    .max(95)
    .default(80)
    .description('Memory pressure threshold percentage (default: 80)'),

  ENABLE_AUTO_GC: Joi.boolean()
    .default(true)
    .description('Enable automatic garbage collection on memory pressure'),

  ENABLE_RESOURCE_MONITORING: Joi.boolean()
    .default(true)
    .description('Enable resource leak detection and monitoring'),

  // HTTP server optimization configuration
  HTTP_KEEP_ALIVE_TIMEOUT: Joi.number()
    .integer()
    .min(30000)
    .max(300000)
    .default(65000)
    .description('HTTP keep-alive timeout in milliseconds (default: 65000)'),

  HTTP_HEADERS_TIMEOUT: Joi.number()
    .integer()
    .min(30000)
    .max(300000)
    .default(66000)
    .description('HTTP headers timeout in milliseconds (default: 66000)'),

  HTTP_MAX_CONNECTIONS: Joi.number()
    .integer()
    .min(100)
    .max(10000)
    .default(1000)
    .description('Maximum concurrent HTTP connections (default: 1000)'),
});

/**
 * Validates and creates the configuration object
 * @returns Validated and frozen configuration object
 * @throws Error if validation fails with detailed error messages
 */
function createConfig(): Readonly<Config> {
  // Extract environment variables
  const envVars = {
    PROXY_API_KEY: process.env.PROXY_API_KEY,
    AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT,
    AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY,
    AZURE_OPENAI_MODEL: process.env.AZURE_OPENAI_MODEL,
    // Convert empty string to undefined for optional API version
    AZURE_OPENAI_API_VERSION:
      process.env.AZURE_OPENAI_API_VERSION === ''
        ? undefined
        : process.env.AZURE_OPENAI_API_VERSION,
    AZURE_OPENAI_TIMEOUT: process.env.AZURE_OPENAI_TIMEOUT,
    AZURE_OPENAI_MAX_RETRIES: process.env.AZURE_OPENAI_MAX_RETRIES,
    DEFAULT_REASONING_EFFORT: process.env.DEFAULT_REASONING_EFFORT,
    ENABLE_CONTENT_SECURITY_VALIDATION:
      process.env.ENABLE_CONTENT_SECURITY_VALIDATION,
    PORT: process.env.PORT,
    NODE_ENV: process.env.NODE_ENV,
    AWS_BEDROCK_API_KEY: process.env.AWS_BEDROCK_API_KEY,
    AWS_BEDROCK_REGION: process.env.AWS_BEDROCK_REGION,
    AWS_BEDROCK_TIMEOUT: process.env.AWS_BEDROCK_TIMEOUT,
    AWS_BEDROCK_MAX_RETRIES: process.env.AWS_BEDROCK_MAX_RETRIES,
    // Node.js 24 configuration
    ENABLE_MEMORY_MANAGEMENT: process.env.ENABLE_MEMORY_MANAGEMENT,
    MEMORY_SAMPLE_INTERVAL: process.env.MEMORY_SAMPLE_INTERVAL,
    MEMORY_PRESSURE_THRESHOLD: process.env.MEMORY_PRESSURE_THRESHOLD,
    ENABLE_AUTO_GC: process.env.ENABLE_AUTO_GC,
    ENABLE_RESOURCE_MONITORING: process.env.ENABLE_RESOURCE_MONITORING,
    HTTP_KEEP_ALIVE_TIMEOUT: process.env.HTTP_KEEP_ALIVE_TIMEOUT,
    HTTP_HEADERS_TIMEOUT: process.env.HTTP_HEADERS_TIMEOUT,
    HTTP_MAX_CONNECTIONS: process.env.HTTP_MAX_CONNECTIONS,
  };

  // Validate against schema
  const validationResult: ValidationResult<Config> = configSchema.validate(
    envVars,
    {
      abortEarly: false, // Collect all validation errors
      allowUnknown: false, // Reject unknown environment variables
      stripUnknown: false,
    }
  );

  const validationError: ValidationError | undefined = validationResult.error;
  const validatedValueRaw: unknown = validationResult.value;

  // Implement fail-fast principle with detailed error messages
  if (validationError) {
    const errorDetails: readonly ValidationErrorItem[] =
      validationError.details;
    const errorMessages: string[] = [];
    for (const detail of errorDetails) {
      const { path, message, context } = detail;
      const key = path[0];
      const hasContextValue =
        context?.value !== undefined && context.value !== null;

      const receivedValue = hasContextValue
        ? JSON.stringify(context.value)
        : undefined;

      const formattedMessage = `${key}: ${message}${receivedValue !== undefined ? ` (received: ${receivedValue})` : ''}`;
      errorMessages.push(formattedMessage);
    }

    const errorMessage = [
      'Configuration validation failed:',
      ...errorMessages.map((msg) => `  - ${msg}`),
      '',
      'Required environment variables:',
      '  - PROXY_API_KEY: API key for client authentication (32-256 characters)',
      '  - AZURE_OPENAI_ENDPOINT: Azure OpenAI endpoint URL (must be HTTPS)',
      '  - AZURE_OPENAI_API_KEY: Azure OpenAI API key (32-256 characters)',
      '  - AZURE_OPENAI_MODEL: Azure OpenAI model deployment name (alphanumeric, hyphens, underscores)',
      '',
      'Optional environment variables:',
      '  - AZURE_OPENAI_API_VERSION: API version (optional: "preview" for legacy API, empty for GA)',
      '  - AZURE_OPENAI_TIMEOUT: Request timeout in ms (5000-300000, default: 120000)',
      '  - AZURE_OPENAI_MAX_RETRIES: Max retry attempts (0-10, default: 3)',
      '  - DEFAULT_REASONING_EFFORT: Default reasoning effort (minimal|low|medium|high, default: medium)',
      '  - ENABLE_CONTENT_SECURITY_VALIDATION: Enable content security validation (true|false, default: true)',
      '  - PORT: Server port number (1024-65535, default: 8080)',
      '  - NODE_ENV: Node.js environment (development|production|test, default: production)',
      '  - AWS_BEDROCK_API_KEY: AWS Bedrock API key (optional, 16-256 characters)',
      '  - AWS_BEDROCK_REGION: AWS Bedrock region (optional, default: us-west-2)',
      '  - AWS_BEDROCK_TIMEOUT: AWS Bedrock request timeout in ms (optional, 5000-300000, default: 120000)',
      '  - AWS_BEDROCK_MAX_RETRIES: AWS Bedrock max retry attempts (optional, 0-10, default: 3)',
      '',
      'Node.js 24 Configuration (optional):',
      '  - ENABLE_MEMORY_MANAGEMENT: Enable memory management features (true|false, default: true)',
      '  - MEMORY_SAMPLE_INTERVAL: Memory sampling interval in ms (1000-60000, default: 10000)',
      '  - MEMORY_PRESSURE_THRESHOLD: Memory pressure threshold % (50-95, default: 80)',
      '  - ENABLE_AUTO_GC: Enable automatic garbage collection (true|false, default: true)',
      '  - ENABLE_RESOURCE_MONITORING: Enable resource monitoring (true|false, default: true)',
      '  - HTTP_KEEP_ALIVE_TIMEOUT: HTTP keep-alive timeout in ms (30000-300000, default: 65000)',
      '  - HTTP_HEADERS_TIMEOUT: HTTP headers timeout in ms (30000-300000, default: 66000)',
      '  - HTTP_MAX_CONNECTIONS: Maximum HTTP connections (100-10000, default: 1000)',
    ].join('\n');

    throw new ConfigurationError(
      errorMessage,
      'config-validation',
      'configuration_validation'
    );
  }

  if (validatedValueRaw === undefined) {
    throw new ConfigurationError(
      'Configuration validation produced no value',
      'config-validation',
      'configuration_validation'
    );
  }

  assertIsConfig(validatedValueRaw);
  const validatedValue: Config = validatedValueRaw;

  // Freeze configuration to prevent runtime modifications
  return Object.freeze(validatedValue);
}

export interface SanitizedConfig {
  readonly AZURE_OPENAI_ENDPOINT: string;
  readonly AZURE_OPENAI_MODEL: string;
  readonly AZURE_OPENAI_API_VERSION?: string;
  readonly AZURE_OPENAI_TIMEOUT: number;
  readonly AZURE_OPENAI_MAX_RETRIES: number;
  readonly DEFAULT_REASONING_EFFORT: 'minimal' | 'low' | 'medium' | 'high';
  readonly ENABLE_CONTENT_SECURITY_VALIDATION: boolean;
  readonly PORT: number;
  readonly NODE_ENV: 'development' | 'production' | 'test';
  readonly PROXY_API_KEY: '[REDACTED]';
  readonly AZURE_OPENAI_API_KEY: '[REDACTED]';
  readonly AWS_BEDROCK_API_KEY?: '[REDACTED]';
  readonly AWS_BEDROCK_REGION?: string;
  readonly AWS_BEDROCK_TIMEOUT?: number;
  readonly AWS_BEDROCK_MAX_RETRIES?: number;
  readonly ENABLE_MEMORY_MANAGEMENT: boolean;
  readonly MEMORY_SAMPLE_INTERVAL: number;
  readonly MEMORY_PRESSURE_THRESHOLD: number;
  readonly ENABLE_AUTO_GC: boolean;
  readonly ENABLE_RESOURCE_MONITORING: boolean;
  readonly HTTP_KEEP_ALIVE_TIMEOUT: number;
  readonly HTTP_HEADERS_TIMEOUT: number;
  readonly HTTP_MAX_CONNECTIONS: number;
}

function assertIsConfig(value: unknown): asserts value is Config {
  if (typeof value !== 'object' || value === null) {
    throw new ConfigurationError(
      'Configuration value is not an object',
      'config-validation',
      'configuration_validation'
    );
  }

  const candidate = value as { [K in keyof Config]?: unknown };

  if (typeof candidate.PROXY_API_KEY !== 'string') {
    throw new ConfigurationError(
      'Configuration key PROXY_API_KEY is missing or not a string',
      'config-validation',
      'configuration_validation'
    );
  }

  if (typeof candidate.AZURE_OPENAI_ENDPOINT !== 'string') {
    throw new ConfigurationError(
      'Configuration key AZURE_OPENAI_ENDPOINT is missing or not a string',
      'config-validation',
      'configuration_validation'
    );
  }

  if (typeof candidate.AZURE_OPENAI_API_KEY !== 'string') {
    throw new ConfigurationError(
      'Configuration key AZURE_OPENAI_API_KEY is missing or not a string',
      'config-validation',
      'configuration_validation'
    );
  }

  if (typeof candidate.AZURE_OPENAI_MODEL !== 'string') {
    throw new ConfigurationError(
      'Configuration key AZURE_OPENAI_MODEL is missing or not a string',
      'config-validation',
      'configuration_validation'
    );
  }

  if (typeof candidate.PORT !== 'number') {
    throw new ConfigurationError(
      'Configuration key PORT is missing or not a number',
      'config-validation',
      'configuration_validation'
    );
  }

  if (typeof candidate.NODE_ENV !== 'string') {
    throw new ConfigurationError(
      'Configuration key NODE_ENV is missing or not a string',
      'config-validation',
      'configuration_validation'
    );
  }

  if (
    candidate.AZURE_OPENAI_API_VERSION !== undefined &&
    typeof candidate.AZURE_OPENAI_API_VERSION !== 'string'
  ) {
    throw new Error(
      'Configuration key AZURE_OPENAI_API_VERSION must be a string when provided'
    );
  }

  if (typeof candidate.AZURE_OPENAI_TIMEOUT !== 'number') {
    throw new Error(
      'Configuration key AZURE_OPENAI_TIMEOUT is missing or not a number'
    );
  }

  if (typeof candidate.AZURE_OPENAI_MAX_RETRIES !== 'number') {
    throw new Error(
      'Configuration key AZURE_OPENAI_MAX_RETRIES is missing or not a number'
    );
  }

  if (typeof candidate.DEFAULT_REASONING_EFFORT !== 'string') {
    throw new Error(
      'Configuration key DEFAULT_REASONING_EFFORT is missing or not a string'
    );
  }

  if (typeof candidate.ENABLE_CONTENT_SECURITY_VALIDATION !== 'boolean') {
    throw new Error(
      'Configuration key ENABLE_CONTENT_SECURITY_VALIDATION is missing or not a boolean'
    );
  }

  if (
    candidate.AWS_BEDROCK_API_KEY !== undefined &&
    typeof candidate.AWS_BEDROCK_API_KEY !== 'string'
  ) {
    throw new ConfigurationError(
      'Configuration key AWS_BEDROCK_API_KEY must be a string when provided',
      'config-validation',
      'configuration_validation'
    );
  }

  if (
    candidate.AWS_BEDROCK_REGION !== undefined &&
    typeof candidate.AWS_BEDROCK_REGION !== 'string'
  ) {
    throw new ConfigurationError(
      'Configuration key AWS_BEDROCK_REGION must be a string when provided',
      'config-validation',
      'configuration_validation'
    );
  }

  if (
    candidate.AWS_BEDROCK_TIMEOUT !== undefined &&
    typeof candidate.AWS_BEDROCK_TIMEOUT !== 'number'
  ) {
    throw new ConfigurationError(
      'Configuration key AWS_BEDROCK_TIMEOUT must be a number when provided',
      'config-validation',
      'configuration_validation'
    );
  }

  if (
    candidate.AWS_BEDROCK_MAX_RETRIES !== undefined &&
    typeof candidate.AWS_BEDROCK_MAX_RETRIES !== 'number'
  ) {
    throw new ConfigurationError(
      'Configuration key AWS_BEDROCK_MAX_RETRIES must be a number when provided',
      'config-validation',
      'configuration_validation'
    );
  }

  // Node.js 24 configuration validation
  if (typeof candidate.ENABLE_MEMORY_MANAGEMENT !== 'boolean') {
    throw new ConfigurationError(
      'Configuration key ENABLE_MEMORY_MANAGEMENT is missing or not a boolean',
      'config-validation',
      'configuration_validation'
    );
  }

  if (typeof candidate.MEMORY_SAMPLE_INTERVAL !== 'number') {
    throw new ConfigurationError(
      'Configuration key MEMORY_SAMPLE_INTERVAL is missing or not a number',
      'config-validation',
      'configuration_validation'
    );
  }

  if (typeof candidate.MEMORY_PRESSURE_THRESHOLD !== 'number') {
    throw new ConfigurationError(
      'Configuration key MEMORY_PRESSURE_THRESHOLD is missing or not a number',
      'config-validation',
      'configuration_validation'
    );
  }

  if (typeof candidate.ENABLE_AUTO_GC !== 'boolean') {
    throw new ConfigurationError(
      'Configuration key ENABLE_AUTO_GC is missing or not a boolean',
      'config-validation',
      'configuration_validation'
    );
  }

  if (typeof candidate.ENABLE_RESOURCE_MONITORING !== 'boolean') {
    throw new ConfigurationError(
      'Configuration key ENABLE_RESOURCE_MONITORING is missing or not a boolean',
      'config-validation',
      'configuration_validation'
    );
  }

  if (typeof candidate.HTTP_KEEP_ALIVE_TIMEOUT !== 'number') {
    throw new ConfigurationError(
      'Configuration key HTTP_KEEP_ALIVE_TIMEOUT is missing or not a number',
      'config-validation',
      'configuration_validation'
    );
  }

  if (typeof candidate.HTTP_HEADERS_TIMEOUT !== 'number') {
    throw new ConfigurationError(
      'Configuration key HTTP_HEADERS_TIMEOUT is missing or not a number',
      'config-validation',
      'configuration_validation'
    );
  }

  if (typeof candidate.HTTP_MAX_CONNECTIONS !== 'number') {
    throw new ConfigurationError(
      'Configuration key HTTP_MAX_CONNECTIONS is missing or not a number',
      'config-validation',
      'configuration_validation'
    );
  }
}

function sanitizeConfig(value: Readonly<Config>): SanitizedConfig {
  return {
    AZURE_OPENAI_ENDPOINT: value.AZURE_OPENAI_ENDPOINT,
    AZURE_OPENAI_MODEL: value.AZURE_OPENAI_MODEL,
    AZURE_OPENAI_API_VERSION: value.AZURE_OPENAI_API_VERSION,
    AZURE_OPENAI_TIMEOUT: value.AZURE_OPENAI_TIMEOUT,
    AZURE_OPENAI_MAX_RETRIES: value.AZURE_OPENAI_MAX_RETRIES,
    DEFAULT_REASONING_EFFORT: value.DEFAULT_REASONING_EFFORT,
    ENABLE_CONTENT_SECURITY_VALIDATION:
      value.ENABLE_CONTENT_SECURITY_VALIDATION,
    PORT: value.PORT,
    NODE_ENV: value.NODE_ENV,
    PROXY_API_KEY: '[REDACTED]',
    AZURE_OPENAI_API_KEY: '[REDACTED]',
    AWS_BEDROCK_API_KEY:
      value.AWS_BEDROCK_API_KEY !== undefined ? '[REDACTED]' : undefined,
    AWS_BEDROCK_REGION: value.AWS_BEDROCK_REGION,
    AWS_BEDROCK_TIMEOUT: value.AWS_BEDROCK_TIMEOUT,
    AWS_BEDROCK_MAX_RETRIES: value.AWS_BEDROCK_MAX_RETRIES,
    ENABLE_MEMORY_MANAGEMENT: value.ENABLE_MEMORY_MANAGEMENT,
    MEMORY_SAMPLE_INTERVAL: value.MEMORY_SAMPLE_INTERVAL,
    MEMORY_PRESSURE_THRESHOLD: value.MEMORY_PRESSURE_THRESHOLD,
    ENABLE_AUTO_GC: value.ENABLE_AUTO_GC,
    ENABLE_RESOURCE_MONITORING: value.ENABLE_RESOURCE_MONITORING,
    HTTP_KEEP_ALIVE_TIMEOUT: value.HTTP_KEEP_ALIVE_TIMEOUT,
    HTTP_HEADERS_TIMEOUT: value.HTTP_HEADERS_TIMEOUT,
    HTTP_MAX_CONNECTIONS: value.HTTP_MAX_CONNECTIONS,
  };
}

/**
 * Validated and frozen configuration object
 * Implements fail-fast principle - will throw on module load if configuration is invalid
 */
const configurationBootstrap: {
  config: Readonly<Config> | null;
  sanitized: SanitizedConfig | null;
} = (() => {
  try {
    const validatedConfig = createConfig();
    return {
      config: validatedConfig,
      sanitized: sanitizeConfig(validatedConfig),
    };
  } catch (error) {
    process.stderr.write('FATAL: Configuration validation failed\n');
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
    // This return will never be reached, but TypeScript needs it
    return { config: null, sanitized: null };
  }
})();

export const sanitizedConfig = configurationBootstrap.sanitized!;

/**
 * Creates an AzureOpenAIConfig from the validated configuration.
 *
 * @param config - Validated configuration object
 * @returns Azure OpenAI client configuration
 */
export function createAzureOpenAIConfig(
  config: Readonly<Config>
): import('../types/index.js').AzureOpenAIConfig {
  // Ensure endpoint ends with /openai/v1/
  let baseURL = config.AZURE_OPENAI_ENDPOINT;
  if (!baseURL.endsWith('/')) {
    baseURL += '/';
  }
  if (!baseURL.endsWith('openai/v1/')) {
    baseURL += 'openai/v1/';
  }

  return {
    baseURL,
    apiKey: config.AZURE_OPENAI_API_KEY,
    ...(config.AZURE_OPENAI_API_VERSION !== undefined && {
      apiVersion: config.AZURE_OPENAI_API_VERSION,
    }),
    deployment: config.AZURE_OPENAI_MODEL,
    timeout: config.AZURE_OPENAI_TIMEOUT,
    maxRetries: config.AZURE_OPENAI_MAX_RETRIES,
  };
}

/**
 * Creates an AWSBedrockConfig from the validated configuration.
 *
 * @param config - Validated configuration object
 * @returns AWS Bedrock client configuration
 * @throws ConfigurationError if AWS Bedrock is not configured
 */
export function createAWSBedrockConfig(
  config: Readonly<Config>
): import('../types/index.js').AWSBedrockConfig {
  if (config.AWS_BEDROCK_API_KEY === undefined) {
    throw new ConfigurationError(
      'AWS Bedrock API key is required to create Bedrock configuration',
      'config-validation',
      'bedrock_configuration'
    );
  }

  const region = config.AWS_BEDROCK_REGION ?? 'us-west-2';
  const baseURL = `https://bedrock-runtime.${region}.amazonaws.com`;

  return {
    baseURL,
    apiKey: config.AWS_BEDROCK_API_KEY,
    region,
    timeout: config.AWS_BEDROCK_TIMEOUT ?? 120000,
    maxRetries: config.AWS_BEDROCK_MAX_RETRIES ?? 3,
  };
}

/**
 * Type guard to validate if a value is a valid Config object
 */
export function isValidConfig(value: unknown): value is Config {
  try {
    assertIsConfig(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates environment variable value with proper type checking
 */
export function validateEnvironmentVariable(
  name: string,
  value: string | undefined,
  required: boolean = true
): string | undefined {
  if (required && (value === undefined || value === '')) {
    throw new Error(
      `Required environment variable ${name} is missing or empty`
    );
  }

  if (value === undefined || value === '') {
    return undefined;
  }

  return value.trim();
}

/**
 * Validates numeric environment variable with range checking
 */
export function validateNumericEnvironmentVariable(
  name: string,
  value: string | undefined,
  min?: number,
  max?: number,
  defaultValue?: number
): number {
  if (value === undefined || value === '') {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Required numeric environment variable ${name} is missing`);
  }

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    throw new Error(
      `Environment variable ${name} must be a valid number, got: ${value}`
    );
  }

  if (min !== undefined && numericValue < min) {
    throw new Error(
      `Environment variable ${name} must be >= ${min}, got: ${numericValue}`
    );
  }

  if (max !== undefined && numericValue > max) {
    throw new Error(
      `Environment variable ${name} must be <= ${max}, got: ${numericValue}`
    );
  }

  return numericValue;
}

/**
 * Checks if AWS Bedrock is configured and available
 *
 * @param config - Validated configuration object
 * @returns True if AWS Bedrock is configured with required settings
 */
export function isAWSBedrockConfigured(config: Readonly<Config>): boolean {
  return config.AWS_BEDROCK_API_KEY !== undefined;
}

/**
 * Creates a configuration validation summary for debugging
 */
export function getConfigurationSummary(): Record<string, unknown> {
  const { config } = configurationBootstrap;
  if (config === null) {
    return { error: 'Configuration not loaded' };
  }

  const {
    NODE_ENV,
    PORT,
    PROXY_API_KEY,
    AZURE_OPENAI_ENDPOINT,
    AZURE_OPENAI_API_KEY,
    AZURE_OPENAI_MODEL,
    AZURE_OPENAI_API_VERSION,
    AZURE_OPENAI_TIMEOUT,
    AZURE_OPENAI_MAX_RETRIES,
    DEFAULT_REASONING_EFFORT,
    AWS_BEDROCK_API_KEY,
    AWS_BEDROCK_REGION,
    AWS_BEDROCK_TIMEOUT,
    AWS_BEDROCK_MAX_RETRIES,
    ENABLE_MEMORY_MANAGEMENT,
    MEMORY_SAMPLE_INTERVAL,
    MEMORY_PRESSURE_THRESHOLD,
    ENABLE_AUTO_GC,
    ENABLE_RESOURCE_MONITORING,
    HTTP_KEEP_ALIVE_TIMEOUT,
    HTTP_HEADERS_TIMEOUT,
    HTTP_MAX_CONNECTIONS,
  } = config;

  return {
    nodeEnv: NODE_ENV,
    port: PORT,
    hasProxyApiKey: Boolean(PROXY_API_KEY),
    hasAzureEndpoint: Boolean(AZURE_OPENAI_ENDPOINT),
    hasAzureApiKey: Boolean(AZURE_OPENAI_API_KEY),
    azureModel: AZURE_OPENAI_MODEL,
    azureApiVersion: AZURE_OPENAI_API_VERSION,
    timeout: AZURE_OPENAI_TIMEOUT,
    maxRetries: AZURE_OPENAI_MAX_RETRIES,
    defaultReasoningEffort: DEFAULT_REASONING_EFFORT,
    hasBedrockApiKey: AWS_BEDROCK_API_KEY !== undefined,
    bedrockRegion: AWS_BEDROCK_REGION,
    bedrockTimeout: AWS_BEDROCK_TIMEOUT,
    bedrockMaxRetries: AWS_BEDROCK_MAX_RETRIES,
    memoryManagementEnabled: ENABLE_MEMORY_MANAGEMENT,
    memorySampleInterval: MEMORY_SAMPLE_INTERVAL,
    memoryPressureThreshold: MEMORY_PRESSURE_THRESHOLD,
    autoGcEnabled: ENABLE_AUTO_GC,
    resourceMonitoringEnabled: ENABLE_RESOURCE_MONITORING,
    httpKeepAliveTimeout: HTTP_KEEP_ALIVE_TIMEOUT,
    httpHeadersTimeout: HTTP_HEADERS_TIMEOUT,
    httpMaxConnections: HTTP_MAX_CONNECTIONS,
  };
}

export default configurationBootstrap.config!;
