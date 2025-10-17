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
  Response as OpenAIResponse,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseFunctionToolCall,
  ResponseOutputItem,
  ResponseOutputMessage,
  ResponseReasoningItem,
  ResponseStreamEvent,
  ResponseTextDeltaEvent,
  ResponseReasoningTextDeltaEvent,
  ResponseReasoningTextDoneEvent,
  ResponseCompletedEvent,
  ResponseOutputItemAddedEvent,
  ResponseUsage as OpenAIResponseUsage,
} from 'openai/resources/responses/responses';
import type {
  AzureOpenAIConfig,
  ResponsesCreateParams,
  ResponsesResponse,
  ResponsesStreamChunk,
  ResponseOutput,
} from '../types/index.js';
import {
  ValidationError,
  AzureOpenAIError,
  ErrorFactory,
} from '../errors/index.js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../middleware/logging.js';

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
  private static readonly ignoredStreamEvents = new Set<string>([
    'response.in_progress',
    'response.output_text.done',
    'response.output_item.done',
    'response.content_part.added',
    'response.content_part.done',
    'response.reasoning_summary.part.added',
    'response.reasoning_summary.part.done',
    'response.reasoning_summary.text.delta',
    'response.reasoning_summary.text.done',
  ]);

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
      const requestParams = this.buildRequestParams(
        params,
        false
      ) as ResponseCreateParamsNonStreaming;

      // Make the API call using the OpenAI client
      const response: OpenAIResponse = await this.client.responses.create(
        requestParams
      );

      const normalized = this.normalizeResponsesResponse(response);

      return this.validateAndTransformResponse(normalized);
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
      const streamParams = this.buildRequestParams(
        params,
        true
      ) as unknown as ResponseCreateParamsStreaming;

      const stream = this.client.responses.stream(streamParams);

      let responseId = correlationId;
      let createdAt = Math.floor(Date.now() / 1000);
      const model = this.config.deployment;

      for await (const event of stream as AsyncIterable<ResponseStreamEvent>) {
        switch (event.type) {
          case 'response.created': {
            responseId = event.response.id;
            createdAt = this.normalizeTimestamp(event.response.created_at);
            break;
          }
          case 'response.output_text.delta': {
            const chunk = this.createTextDeltaChunk(
              event,
              responseId,
              createdAt,
              model
            );
            yield this.validateAndTransformStreamChunk(chunk);
            break;
          }
          case 'response.reasoning_text.delta': {
            const chunk = this.createReasoningDeltaChunk(
              event,
              responseId,
              createdAt,
              model,
              'in_progress'
            );
            yield this.validateAndTransformStreamChunk(chunk);
            break;
          }
          case 'response.reasoning_text.done': {
            const chunk = this.createReasoningDoneChunk(
              event,
              responseId,
              createdAt,
              model
            );
            yield this.validateAndTransformStreamChunk(chunk);
            break;
          }
          case 'response.output_item.added': {
            const chunk = this.createOutputItemChunk(
              event,
              responseId,
              createdAt,
              model
            );
            if (chunk !== undefined) {
              yield this.validateAndTransformStreamChunk(chunk);
            }
            break;
          }
          case 'response.completed': {
            const chunk = this.createCompletedChunk(event);
            yield this.validateAndTransformStreamChunk(chunk);
            break;
          }
          case 'response.failed': {
            throw ErrorFactory.fromAzureOpenAIError(
              new Error(`Response ${event.response.id} failed`),
              correlationId,
              'createResponseStream'
            );
          }
          case 'error': {
            throw ErrorFactory.fromAzureOpenAIError(
              new Error(
                'message' in event && typeof event.message === 'string'
                  ? event.message
                  : 'Response stream error'
              ),
              correlationId,
              'createResponseStream'
            );
          }
          default: {
            // Ignore other event types but keep debug trace for observability
            if (!AzureResponsesClient.ignoredStreamEvents.has(event.type)) {
              logger.debug('Unhandled Responses stream event', correlationId, {
                eventType: event.type,
              });
            }
            break;
          }
        }
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
        500,
        correlationId,
        undefined,
        undefined,
        'createResponseStream'
      );
    }
  }

  private createTextDeltaChunk(
    event: ResponseTextDeltaEvent,
    responseId: string,
    createdAt: number,
    model: string
  ): ResponsesStreamChunk {
    return {
      id: responseId,
      object: 'response.chunk',
      created: createdAt,
      model,
      output: [
        {
          type: 'text',
          text: event.delta,
        },
      ],
    };
  }

  private createReasoningDeltaChunk(
    event: ResponseReasoningTextDeltaEvent,
    responseId: string,
    createdAt: number,
    model: string,
    status: 'in_progress' | 'completed'
  ): ResponsesStreamChunk {
    return {
      id: responseId,
      object: 'response.chunk',
      created: createdAt,
      model,
      output: [
        {
          type: 'reasoning',
          reasoning: {
            content: event.delta,
            status,
          },
        },
      ],
    };
  }

  private createReasoningDoneChunk(
    event: ResponseReasoningTextDoneEvent,
    responseId: string,
    createdAt: number,
    model: string
  ): ResponsesStreamChunk {
    return {
      id: responseId,
      object: 'response.chunk',
      created: createdAt,
      model,
      output: [
        {
          type: 'reasoning',
          reasoning: {
            content: event.text,
            status: 'completed',
          },
        },
      ],
    };
  }

  private createOutputItemChunk(
    event: ResponseOutputItemAddedEvent,
    responseId: string,
    createdAt: number,
    model: string
  ): ResponsesStreamChunk | undefined {
    const outputs = this.transformOutputItems([event.item]);
    if (outputs.length === 0) {
      return undefined;
    }

    return {
      id: responseId,
      object: 'response.chunk',
      created: createdAt,
      model,
      output: outputs,
    };
  }

  private createCompletedChunk(
    event: ResponseCompletedEvent
  ): ResponsesStreamChunk {
    const normalized = this.normalizeResponsesResponse(event.response);

    return {
      ...normalized,
      object: 'response.chunk',
      model: normalized.model,
    };
  }

  private normalizeResponsesResponse(response: OpenAIResponse): ResponsesResponse {
    const output = this.transformOutputItems(response.output);
    const usage = this.transformUsage(response.usage);

    return {
      id: response.id,
      object: 'response',
      created: this.normalizeTimestamp(response.created_at),
      model:
        typeof response.model === 'string'
          ? response.model
          : this.config.deployment,
      output,
      usage,
    };
  }

  private transformUsage(
    usage: OpenAIResponseUsage | undefined
  ): ResponsesResponse['usage'] {
    if (usage === undefined) {
      return {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        reasoning_tokens: undefined,
      };
    }

    const partialUsage = usage as Partial<OpenAIResponseUsage>;
    const inputTokens = partialUsage.input_tokens ?? 0;
    const outputTokens = partialUsage.output_tokens ?? 0;
    const totalTokens = partialUsage.total_tokens ?? inputTokens + outputTokens;
    const reasoningTokens =
      partialUsage.output_tokens_details?.reasoning_tokens;

    return {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: totalTokens,
      reasoning_tokens: reasoningTokens,
    };
  }

  private transformOutputItems(
    items: readonly ResponseOutputItem[]
  ): ResponsesResponse['output'] {
    const outputs: ResponseOutput[] = [];

    for (const item of items) {
      switch (item.type) {
        case 'message': {
          const messageItem: ResponseOutputMessage = item;
          for (const content of messageItem.content) {
            if (content.type === 'output_text') {
              outputs.push({
                type: 'text',
                text: content.text,
              });
            }
          }
          break;
        }
        case 'reasoning': {
          const reasoningItem: ResponseReasoningItem = item;
          const reasoningContent = Array.isArray(reasoningItem.content)
            ? reasoningItem.content.map((content) => content.text).join('')
            : '';

          const status: 'in_progress' | 'completed' =
            reasoningItem.status === 'in_progress' || reasoningItem.status === 'incomplete'
              ? 'in_progress'
              : 'completed';

          outputs.push({
            type: 'reasoning',
            reasoning: {
              content: reasoningContent,
              status,
            },
          });
          break;
        }
        case 'function_call': {
          outputs.push(this.transformFunctionToolCall(item));
          break;
        }
        default: {
          const legacyOutput = this.transformLegacyOutputItem(item);
          if (legacyOutput !== undefined) {
            outputs.push(legacyOutput);
            break;
          }
          logger.debug('Unhandled Responses output item', 'azure-responses-client', {
            itemType: item.type,
          });
          break;
        }
      }
    }

    return outputs;
  }

  private transformFunctionToolCall(
    item: ResponseFunctionToolCall
  ): ResponseOutput {
    const callId =
      typeof item.id === 'string' && item.id.length > 0 ? item.id : item.call_id;

    return {
      type: 'tool_call',
      tool_call: {
        id: callId,
        type: 'function',
        function: {
          name: item.name,
          arguments: item.arguments,
        },
      },
    };
  }

  private transformLegacyOutputItem(item: unknown): ResponseOutput | undefined {
    if (
      typeof item === 'object' &&
      item !== null &&
      'type' in item &&
      (item as { type?: unknown }).type === 'text'
    ) {
      const textValue =
        'text' in (item as Record<string, unknown>) &&
        typeof (item as { text?: unknown }).text === 'string'
          ? (item as { text?: string }).text
          : '';

      return {
        type: 'text',
        text: textValue,
      };
    }

    return undefined;
  }

  private normalizeTimestamp(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return Math.floor(Date.now() / 1000);
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
    const input =
      typeof params.input === 'string'
        ? params.input
        : params.input.map((message) => ({
            role: message.role,
            content: message.content,
          }));

    const request: Record<string, unknown> = {
      model: this.config.deployment, // Use deployment name instead of model
      input,
      max_output_tokens: params.max_output_tokens ?? 4000,
      stream,
    };



    if (params.reasoning !== undefined) {
      request.reasoning = params.reasoning;
    }
    if (params.temperature !== undefined) {
      request.temperature = params.temperature;
    }
    if (params.top_p !== undefined) {
      request.top_p = params.top_p;
    }
    if (params.previous_response_id !== undefined) {
      request.previous_response_id = params.previous_response_id;
    }
    if (params.stop !== undefined) {
      request.stop = params.stop;
    }
    if (params.tools !== undefined) {
      request.tools = params.tools;
    }
    if (params.tool_choice !== undefined) {
      request.tool_choice = params.tool_choice;
    }
    if (params.response_format !== undefined) {
      request.response_format = params.response_format;
    }

    return request;
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
