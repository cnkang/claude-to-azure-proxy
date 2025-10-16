/**
 * @fileoverview Azure OpenAI v1 Responses API client implementation.
 *
 * This module provides a type-safe client for interacting with Azure OpenAI's
 * Responses API v1, supporting both streaming and non-streaming requests with
 * comprehensive error handling, retry logic, and monitoring capabilities.
 *
 * @author Claude-to-Azure Proxy Team
 * @version 1.0.0
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { AzureResponsesClient } from './clients/azure-responses-client.js';
 *
 * const client = new AzureResponsesClient(config);
 * const response = await client.createResponse({
 *   model: 'gpt-5-codex',
 *   input: [{ role: 'user', content: 'Hello, world!' }],
 *   reasoning: { effort: 'medium' }
 * });
 * ```
 */

import { OpenAI } from 'openai';
import type {
  AzureOpenAIConfig,
  ResponsesCreateParams,
  ResponsesResponse,
  ResponsesStreamChunk,
} from '../types/index.js';
import {
  ValidationError,
  AzureOpenAIError,
  ErrorFactory,
  ServiceUnavailableError,
} from '../errors/index.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Azure OpenAI v1 Responses API client with comprehensive error handling and monitoring.
 *
 * This client provides a type-safe interface to Azure OpenAI's Responses API,
 * supporting both streaming and non-streaming requests with built-in retry logic,
 * timeout handling, and detailed error reporting.
 *
 * @public
 * @class AzureResponsesClient
 *
 * @example
 * ```typescript
 * const config: AzureOpenAIConfig = {
 *   baseURL: 'https://my-resource.openai.azure.com/openai/v1/',
 *   apiKey: 'my-api-key',
 *   apiVersion: '2025-04-01-preview',
 *   deployment: 'gpt-5-codex',
 *   timeout: 30000,
 *   maxRetries: 3
 * };
 *
 * const client = new AzureResponsesClient(config);
 * ```
 */
export class AzureResponsesClient {
  private readonly client: OpenAI;
  private readonly config: AzureOpenAIConfig;

  /**
   * Creates a new Azure Responses API client instance.
   *
   * @param config - Configuration object containing Azure OpenAI settings
   * @throws {Error} When configuration is invalid or client initialization fails
   *
   * @example
   * ```typescript
   * const client = new AzureResponsesClient({
   *   baseURL: 'https://my-resource.openai.azure.com/openai/v1/',
   *   apiKey: 'my-api-key',
   *   apiVersion: 'preview',
   *   deployment: 'gpt-5-codex',
   *   timeout: 30000,
   *   maxRetries: 3
   * });
   * ```
   */
  constructor(config: AzureOpenAIConfig) {
    this.validateConfig(config);
    this.config = Object.freeze({ ...config });

    // Initialize OpenAI client with Azure Responses API configuration
    // GA v1 API: No api-version needed (recommended)
    // Legacy preview API: Requires api-version=preview
    this.client = new OpenAI({
      baseURL: config.baseURL, // Should be https://resource.openai.azure.com/openai/v1/
      apiKey: config.apiKey,
      timeout: config.timeout,
      maxRetries: config.maxRetries,
      defaultHeaders: {
        'User-Agent': 'claude-to-azure-proxy/1.0.0',
      },
      // Only add api-version for legacy preview API
      ...(config.apiVersion !== undefined &&
        config.apiVersion.length > 0 &&
        config.apiVersion !== 'v1' && {
          defaultQuery: {
            'api-version': config.apiVersion,
          },
        }),
    });
  }

  /**
   * Creates a non-streaming response using the Responses API.
   *
   * @param params - Request parameters for the Responses API
   * @returns Promise resolving to the API response
   * @throws {ResponsesAPIError} When the API request fails
   * @throws {Error} When request validation or processing fails
   *
   * @example
   * ```typescript
   * const response = await client.createResponse({
   *   model: 'gpt-5-codex',
   *   input: [{ role: 'user', content: 'Write a TypeScript function' }],
   *   max_output_tokens: 1000,
   *   reasoning: { effort: 'medium' },
   *   temperature: 0.7
   * });
   * ```
   */
  public async createResponse(
    params: ResponsesCreateParams
  ): Promise<ResponsesResponse> {
    this.validateRequestParams(params);

    try {
      const requestParams = this.buildRequestParams(params, false);

      // Make the API call using the OpenAI client
      const response = await this.client.responses.create(requestParams);

      return this.validateAndTransformResponse(response);
    } catch (error) {
      throw this.handleApiError(error, 'createResponse');
    }
  }

  /**
   * Creates a streaming response using the Responses API.
   *
   * @param params - Request parameters for the Responses API
   * @returns AsyncIterable of response chunks
   * @throws {ResponsesAPIError} When the API request fails
   * @throws {Error} When request validation or processing fails
   *
   * @example
   * ```typescript
   * const stream = client.createResponseStream({
   *   model: 'gpt-5-codex',
   *   input: [{ role: 'user', content: 'Explain async/await' }],
   *   reasoning: { effort: 'low' },
   *   stream: true
   * });
   *
   * for await (const chunk of stream) {
   *   console.log(chunk.output);
   * }
   * ```
   */
  public async *createResponseStream(
    params: ResponsesCreateParams
  ): AsyncIterable<ResponsesStreamChunk> {
    this.validateRequestParams(params);

    const correlationId = uuidv4();

    try {
      // Create streaming request parameters
      const streamParams = {
        ...params,
        stream: true,
      };

      // Make streaming request to Azure OpenAI Responses API
      const stream = await this.client.responses.create(streamParams);

      // Process the stream and yield chunks
      for await (const chunk of stream) {
        // Validate chunk structure
        if (!chunk || typeof chunk !== 'object') {
          continue;
        }

        // Transform OpenAI stream chunk to our ResponsesStreamChunk format
        const responsesChunk: ResponsesStreamChunk = {
          id: chunk.id || correlationId,
          object: 'response.chunk',
          created: chunk.created || Math.floor(Date.now() / 1000),
          model: params.model,
          output: Array.isArray(chunk.output) ? chunk.output : [],
          usage: chunk.usage,
        };

        yield responsesChunk;
      }
    } catch (error) {
      if (error instanceof Error) {
        throw ErrorFactory.fromAzureOpenAIError(
          error,
          correlationId,
          'createResponseStream'
        );
      }
      throw new AzureOpenAIError(
        'Unknown error during streaming request',
        correlationId,
        undefined,
        'createResponseStream'
      );
    }
  }

  /**
   * Validates the Azure OpenAI configuration.
   *
   * @private
   * @param config - Configuration to validate
   * @throws {Error} When configuration is invalid
   */
  private validateConfig(config: AzureOpenAIConfig): void {
    const correlationId = uuidv4();

    if (!config.baseURL || typeof config.baseURL !== 'string') {
      throw new ValidationError(
        'Invalid baseURL: must be a non-empty string',
        correlationId,
        'baseURL',
        config.baseURL
      );
    }

    if (!config.baseURL.startsWith('https://')) {
      throw new ValidationError(
        'Invalid baseURL: must use HTTPS protocol',
        correlationId,
        'baseURL',
        config.baseURL
      );
    }

    if (!config.apiKey || typeof config.apiKey !== 'string') {
      throw new ValidationError(
        'Invalid apiKey: must be a non-empty string',
        correlationId,
        'apiKey',
        '[REDACTED]'
      );
    }

    if (
      config.apiVersion !== undefined &&
      (typeof config.apiVersion !== 'string' || config.apiVersion.length === 0)
    ) {
      throw new ValidationError(
        'Invalid apiVersion: must be a non-empty string when provided',
        correlationId,
        'apiVersion',
        config.apiVersion
      );
    }

    if (!config.deployment || typeof config.deployment !== 'string') {
      throw new ValidationError(
        'Invalid deployment: must be a non-empty string',
        correlationId,
        'deployment',
        config.deployment
      );
    }

    if (typeof config.timeout !== 'number' || config.timeout <= 0) {
      throw new ValidationError(
        'Invalid timeout: must be a positive number',
        correlationId,
        'timeout',
        config.timeout
      );
    }

    if (typeof config.maxRetries !== 'number' || config.maxRetries < 0) {
      throw new ValidationError(
        'Invalid maxRetries: must be a non-negative number',
        correlationId,
        'maxRetries',
        config.maxRetries
      );
    }
  }

  /**
   * Validates request parameters before sending to the API.
   *
   * @private
   * @param params - Request parameters to validate
   * @throws {Error} When parameters are invalid
   */
  private validateRequestParams(params: ResponsesCreateParams): void {
    const correlationId = uuidv4();

    if (!params.model || typeof params.model !== 'string') {
      throw new ValidationError(
        'Invalid model: must be a non-empty string',
        correlationId,
        'model',
        params.model
      );
    }

    if (typeof params.input === 'string') {
      if (params.input.length === 0) {
        throw new ValidationError(
          'Invalid input: string input cannot be empty',
          correlationId,
          'input',
          '[EMPTY_STRING]'
        );
      }
    } else if (Array.isArray(params.input)) {
      if (params.input.length === 0) {
        throw new ValidationError(
          'Invalid input: message array cannot be empty',
          correlationId,
          'input',
          '[EMPTY_ARRAY]'
        );
      }

      for (const [index, message] of params.input.entries()) {
        if (typeof message !== 'object' || message === null) {
          throw new ValidationError(
            `Invalid message at index ${index}: must be an object`,
            correlationId,
            `input[${index}]`,
            message
          );
        }

        const messageObj = message as Record<string, unknown>;

        if (
          typeof messageObj.role !== 'string' ||
          !['user', 'assistant', 'system'].includes(messageObj.role)
        ) {
          throw new ValidationError(
            `Invalid message role at index ${index}: must be user, assistant, or system`,
            correlationId,
            `input[${index}].role`,
            messageObj.role
          );
        }

        if (
          typeof messageObj.content !== 'string' ||
          messageObj.content.length === 0
        ) {
          throw new ValidationError(
            `Invalid message content at index ${index}: must be a non-empty string`,
            correlationId,
            `input[${index}].content`,
            messageObj.content
          );
        }
      }
    } else {
      throw new ValidationError(
        'Invalid input: must be a string or array of messages',
        correlationId,
        'input',
        typeof params.input
      );
    }

    if (
      params.max_output_tokens !== undefined &&
      (typeof params.max_output_tokens !== 'number' ||
        params.max_output_tokens <= 0)
    ) {
      throw new ValidationError(
        'Invalid max_output_tokens: must be a positive number',
        correlationId,
        'max_output_tokens',
        params.max_output_tokens
      );
    }

    if (
      params.temperature !== undefined &&
      (typeof params.temperature !== 'number' ||
        params.temperature < 0 ||
        params.temperature > 2)
    ) {
      throw new ValidationError(
        'Invalid temperature: must be a number between 0 and 2',
        correlationId,
        'temperature',
        params.temperature
      );
    }

    if (
      params.top_p !== undefined &&
      (typeof params.top_p !== 'number' || params.top_p < 0 || params.top_p > 1)
    ) {
      throw new ValidationError(
        'Invalid top_p: must be a number between 0 and 1',
        correlationId,
        'top_p',
        params.top_p
      );
    }

    if (
      params.reasoning !== undefined &&
      (typeof params.reasoning.effort !== 'string' ||
        !['minimal', 'low', 'medium', 'high'].includes(params.reasoning.effort))
    ) {
      throw new ValidationError(
        'Invalid reasoning effort: must be minimal, low, medium, or high',
        correlationId,
        'reasoning.effort',
        params.reasoning.effort
      );
    }
  }

  /**
   * Builds request parameters for the OpenAI client.
   *
   * @private
   * @param params - Original request parameters
   * @param stream - Whether this is a streaming request
   * @returns Formatted parameters for the OpenAI client
   */
  private buildRequestParams(
    params: ResponsesCreateParams,
    stream: boolean
  ): Record<string, unknown> {
    return {
      model: this.config.deployment, // Use deployment name instead of model
      input: params.input,
      max_output_tokens: params.max_output_tokens ?? 4000,
      reasoning: params.reasoning,
      stream,
      temperature: params.temperature,
      top_p: params.top_p,
      previous_response_id: params.previous_response_id,
      stop: params.stop,
      tools: params.tools,
      tool_choice: params.tool_choice,
      response_format: params.response_format,
    };
  }

  /**
   * Validates and transforms the API response.
   *
   * @private
   * @param response - Raw response from the API
   * @returns Validated and typed response
   * @throws {Error} When response validation fails
   */
  private validateAndTransformResponse(response: unknown): ResponsesResponse {
    if (!this.isValidResponsesResponse(response)) {
      const correlationId = uuidv4();
      throw new ValidationError(
        'Invalid API response format',
        correlationId,
        'response',
        typeof response,
        true,
        'validateAndTransformResponse'
      );
    }

    return response;
  }

  /**
   * Validates and transforms a streaming response chunk.
   *
   * @private
   * @param chunk - Raw chunk from the streaming API
   * @returns Validated and typed chunk
   * @throws {Error} When chunk validation fails
   */
  private validateAndTransformStreamChunk(
    chunk: unknown
  ): ResponsesStreamChunk {
    if (!this.isValidResponsesStreamChunk(chunk)) {
      const correlationId = uuidv4();
      throw new ValidationError(
        'Invalid streaming response chunk format',
        correlationId,
        'chunk',
        typeof chunk,
        true,
        'validateAndTransformStreamChunk'
      );
    }

    return chunk;
  }

  /**
   * Type guard for ResponsesResponse.
   *
   * @private
   * @param value - Value to check
   * @returns True if value is a valid ResponsesResponse
   */
  private isValidResponsesResponse(value: unknown): value is ResponsesResponse {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const candidate = value as Record<string, unknown>;

    return (
      'id' in candidate &&
      'object' in candidate &&
      'created' in candidate &&
      'model' in candidate &&
      'output' in candidate &&
      'usage' in candidate &&
      typeof candidate.id === 'string' &&
      candidate.object === 'response' &&
      typeof candidate.created === 'number' &&
      typeof candidate.model === 'string' &&
      Array.isArray(candidate.output) &&
      typeof candidate.usage === 'object' &&
      candidate.usage !== null
    );
  }

  /**
   * Type guard for ResponsesStreamChunk.
   *
   * @private
   * @param value - Value to check
   * @returns True if value is a valid ResponsesStreamChunk
   */
  private isValidResponsesStreamChunk(
    value: unknown
  ): value is ResponsesStreamChunk {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const candidate = value as Record<string, unknown>;

    return (
      'id' in candidate &&
      'object' in candidate &&
      'created' in candidate &&
      'model' in candidate &&
      'output' in candidate &&
      typeof candidate.id === 'string' &&
      candidate.object === 'response.chunk' &&
      typeof candidate.created === 'number' &&
      typeof candidate.model === 'string' &&
      Array.isArray(candidate.output)
    );
  }

  /**
   * Handles and transforms API errors into standardized format.
   *
   * @private
   * @param error - Original error from the API
   * @param operation - Name of the operation that failed
   * @returns Standardized error instance
   */
  private handleApiError(error: unknown, operation: string): Error {
    const correlationId = uuidv4();

    // Handle direct Error instances first (including our validation errors)
    if (error instanceof Error) {
      // If it's already one of our custom errors, just re-throw it
      if (
        error instanceof ValidationError ||
        error instanceof AzureOpenAIError
      ) {
        return error;
      }

      if (error.message.includes('timeout')) {
        return ErrorFactory.fromTimeout(
          this.config.timeout,
          correlationId,
          operation
        );
      }

      if (
        error.message.includes('network') ||
        error.message.includes('ECONNREFUSED')
      ) {
        return ErrorFactory.fromNetworkError(error, correlationId, operation);
      }
    }

    // Handle OpenAI SDK errors using existing error factory
    if (error !== null && typeof error === 'object' && 'error' in error) {
      return ErrorFactory.fromAzureOpenAIError(error, correlationId, operation);
    }

    // Default error
    return new AzureOpenAIError(
      `Unknown error during ${operation}`,
      500,
      correlationId,
      'unknown_error',
      'unknown',
      operation
    );
  }

  /**
   * Gets the current client configuration (sanitized).
   *
   * @returns Sanitized configuration object
   */
  public getConfig(): Omit<AzureOpenAIConfig, 'apiKey'> & {
    apiKey: '[REDACTED]';
  } {
    return {
      baseURL: this.config.baseURL,
      apiKey: '[REDACTED]',
      ...(this.config.apiVersion !== undefined && {
        apiVersion: this.config.apiVersion,
      }),
      deployment: this.config.deployment,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
    };
  }
}
