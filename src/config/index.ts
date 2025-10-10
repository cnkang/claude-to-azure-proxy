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

// Load environment variables from .env file
dotenvConfig();

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
    PORT: process.env.PORT,
    NODE_ENV: process.env.NODE_ENV,
  };

  // Validate against schema
  const validationResult: ValidationResult<Config> =
    configSchema.validate(envVars, {
      abortEarly: false, // Collect all validation errors
      allowUnknown: false, // Reject unknown environment variables
      stripUnknown: false,
    });

  const validationError: ValidationError | undefined = validationResult.error;
  const validatedValueRaw: unknown = validationResult.value;

  // Implement fail-fast principle with detailed error messages
  if (validationError) {
    const errorDetails: readonly ValidationErrorItem[] =
      validationError.details;
    const errorMessages: string[] = [];
    for (const detail of errorDetails) {
      const key = detail.path[0];
      const message = detail.message;
      const context = detail.context;
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
      '  - PORT: Server port number (1024-65535, default: 8080)',
      '  - NODE_ENV: Node.js environment (development|production|test, default: production)',
    ].join('\n');

    throw new Error(errorMessage);
  }

  if (validatedValueRaw === undefined) {
    throw new Error('Configuration validation produced no value');
  }

  assertIsConfig(validatedValueRaw);
  const validatedValue: Config = validatedValueRaw;

  // Freeze configuration to prevent runtime modifications
  return Object.freeze(validatedValue);
}

export interface SanitizedConfig {
  readonly AZURE_OPENAI_ENDPOINT: string;
  readonly AZURE_OPENAI_MODEL: string;
  readonly PORT: number;
  readonly NODE_ENV: 'development' | 'production' | 'test';
  readonly PROXY_API_KEY: '[REDACTED]';
  readonly AZURE_OPENAI_API_KEY: '[REDACTED]';
}

function assertIsConfig(value: unknown): asserts value is Config {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Configuration value is not an object');
  }

  const candidate = value as { [K in keyof Config]?: unknown };

  if (typeof candidate.PROXY_API_KEY !== 'string') {
    throw new Error(
      'Configuration key PROXY_API_KEY is missing or not a string'
    );
  }

  if (typeof candidate.AZURE_OPENAI_ENDPOINT !== 'string') {
    throw new Error(
      'Configuration key AZURE_OPENAI_ENDPOINT is missing or not a string'
    );
  }

  if (typeof candidate.AZURE_OPENAI_API_KEY !== 'string') {
    throw new Error(
      'Configuration key AZURE_OPENAI_API_KEY is missing or not a string'
    );
  }

  if (typeof candidate.AZURE_OPENAI_MODEL !== 'string') {
    throw new Error(
      'Configuration key AZURE_OPENAI_MODEL is missing or not a string'
    );
  }

  if (typeof candidate.PORT !== 'number') {
    throw new Error('Configuration key PORT is missing or not a number');
  }

  if (typeof candidate.NODE_ENV !== 'string') {
    throw new Error('Configuration key NODE_ENV is missing or not a string');
  }
}

function sanitizeConfig(value: Readonly<Config>): SanitizedConfig {
  return {
    AZURE_OPENAI_ENDPOINT: value.AZURE_OPENAI_ENDPOINT,
    AZURE_OPENAI_MODEL: value.AZURE_OPENAI_MODEL,
    PORT: value.PORT,
    NODE_ENV: value.NODE_ENV,
    PROXY_API_KEY: '[REDACTED]',
    AZURE_OPENAI_API_KEY: '[REDACTED]',
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

export default configurationBootstrap.config!;
