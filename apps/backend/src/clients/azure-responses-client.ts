/**
 * @fileoverview Azure OpenAI v1 Responses API client implementation.
 *
 * This module provides a type-safe client for interacting with Azure OpenAI's
 * Responses API v1, supporting both streaming and non-streaming requests with
 * comprehensive error handling, retry logic, and monitoring capabilities.
 *
 * @author Claude-to-Azure Proxy Team
 * @version 2.0.0
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { AzureResponsesClient } from './clients/azure-responses-client';
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
} from '../types/index';
import {
  ValidationError,
  AzureOpenAIError,
  ErrorFactory,
} from '../errors/index';
import { v4 as uuidv4 } from 'uuid';
import { performance } from 'node:perf_hooks';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { logger } from '../middleware/logging';
import {
  assertValidResponsesResponse,
  assertValidResponsesStreamChunk,
  validateResponsesCreateParams,
} from '../utils/responses-validator';
import {
  createHTTPConnectionResource,
  createStreamResource,
  type HTTPConnectionResource,
  type StreamResource,
} from '../runtime/resource-manager';
import { memoryManager } from '../utils/memory-manager';

/**
 * Azure OpenAI v1 Responses API client with comprehensive error handling and monitoring.
 * Enhanced for Node.js 24 with improved connection pooling, automatic resource cleanup,
 * and memory management optimizations.
 *
 * This client provides a type-safe interface to Azure OpenAI's Responses API,
 * supporting both streaming and non-streaming requests with built-in retry logic,
 * timeout handling, detailed error reporting, and automatic resource management
 * using Node.js 24's explicit resource management features.
 *
 * @public
 * @class AzureResponsesClient
 *
 * @example
 * ```typescript
 * const config: AzureOpenAIConfig = {
 *   baseURL: 'https://my-resource.openai.azure.com/openai/v1/',
 *   apiKey: 'my-api-key',
 *   // API version automatically handled
 *   deployment: 'gpt-5-codex',
 *   timeout: 30000,
 *   maxRetries: 3
 * };
 *
 * // Using explicit resource management (Node.js 24)
 * using client = new AzureResponsesClient(config);
 * const response = await client.createResponse(params);
 * // Automatic cleanup when leaving scope
 * ```
 */
export class AzureResponsesClient implements AsyncDisposable {
  private readonly client: OpenAI;
  private readonly config: AzureOpenAIConfig;
  private readonly activeConnections = new Set<HTTPConnectionResource>();
  private readonly activeStreams = new Set<StreamResource>();
  private _disposed = false;

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
   * Creates a new Azure Responses API client instance with Node.js 24 enhancements.
   *
   * @param config - Configuration object containing Azure OpenAI settings
   * @throws {Error} When configuration is invalid or client initialization fails
   *
   * @example
   * ```typescript
   * // Traditional usage
   * const client = new AzureResponsesClient(config);
   *
   * // Node.js 24 explicit resource management
   * using client = new AzureResponsesClient(config);
   * // Automatic cleanup when leaving scope
   * ```
   */
  constructor(config: AzureOpenAIConfig) {
    this.validateConfig(config);
    this.config = Object.freeze({ ...config });

    // Initialize OpenAI client with enhanced Node.js 24 configuration
    // Optimized for better connection pooling and resource management
    this.client = new OpenAI({
      baseURL: config.baseURL, // Should be https://resource.openai.azure.com/openai/v1/
      apiKey: config.apiKey,
      timeout: config.timeout,
      maxRetries: config.maxRetries,
      defaultHeaders: {
        'User-Agent': 'claude-to-azure-proxy/2.0.0 (Node.js 24)',
        Connection: 'keep-alive',
        'Keep-Alive': 'timeout=30, max=100',
      },
      // Using latest stable Azure OpenAI API (v1) - no api-version needed
    });

    // Track memory usage for this client instance
    memoryManager.startMonitoring();
  }

  /**
   * Creates a non-streaming response using the Responses API with enhanced resource management.
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
    this.ensureNotDisposed();
    validateResponsesCreateParams(params);

    // Create connection resource for tracking
    const connectionResource = createHTTPConnectionResource(
      undefined,
      undefined,
      undefined
    );
    this.activeConnections.add(connectionResource);

    try {
      const requestParams = this.buildRequestParams(
        params,
        false
      ) as ResponseCreateParamsNonStreaming;

      // Make the API call using the OpenAI client with enhanced monitoring
      const startTime = performance.now();
      const response: OpenAIResponse =
        await this.client.responses.create(requestParams);
      const duration = performance.now() - startTime;

      // Log performance metrics
      logger.debug('Azure OpenAI API call completed', '', {
        duration: Math.round(duration),
        model: params.model,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      });

      const normalized = this.normalizeResponsesResponse(response);
      return assertValidResponsesResponse(normalized);
    } catch (error) {
      throw this.handleApiError(error, 'createResponse');
    } finally {
      this.activeConnections.delete(connectionResource);
    }
  }

  /**
   * Creates a streaming response using the Responses API with enhanced resource management.
   *
   * @param params - Request parameters for the Responses API
   * @returns AsyncIterable of response chunks with automatic cleanup
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
   * // Stream automatically cleaned up
   * ```
   */
  public async *createResponseStream(
    params: ResponsesCreateParams
  ): AsyncIterable<ResponsesStreamChunk> {
    this.ensureNotDisposed();
    validateResponsesCreateParams(params);

    const correlationId = uuidv4();

    // Create stream resource for tracking and automatic cleanup
    // Note: We'll create the resource after we have the actual stream
    let streamResource: StreamResource | undefined;

    try {
      const streamParams = this.buildRequestParams(
        params,
        true
      ) as unknown as ResponseCreateParamsStreaming;

      const stream = this.client.responses.stream(streamParams);

      // Create stream resource now that we have the actual stream
      streamResource = createStreamResource(
        stream as unknown as NodeJS.ReadableStream,
        `Azure OpenAI streaming response for model ${params.model}`
      );
      this.activeStreams.add(streamResource);

      let responseId = correlationId;
      let createdAt = Math.floor(Date.now() / 1000);
      const model = this.config.deployment;
      let chunkCount = 0;
      const startTime = performance.now();

      for await (const event of stream as AsyncIterable<ResponseStreamEvent>) {
        // Check memory pressure periodically during streaming
        if (chunkCount % 10 === 0) {
          const memoryMetrics = memoryManager.getMemoryMetrics();
          if (memoryMetrics.pressure.level === 'critical') {
            logger.warn(
              'Critical memory pressure during streaming',
              correlationId,
              {
                heapUsage: memoryMetrics.heap.percentage,
                chunkCount,
              }
            );
          }
        }

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
            chunkCount++;
            yield assertValidResponsesStreamChunk(chunk);
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
            chunkCount++;
            yield assertValidResponsesStreamChunk(chunk);
            break;
          }
          case 'response.reasoning_text.done': {
            const chunk = this.createReasoningDoneChunk(
              event,
              responseId,
              createdAt,
              model
            );
            chunkCount++;
            yield assertValidResponsesStreamChunk(chunk);
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
              chunkCount++;
              yield assertValidResponsesStreamChunk(chunk);
            }
            break;
          }
          case 'response.completed': {
            const chunk = this.createCompletedChunk(event);
            chunkCount++;

            // Log streaming completion metrics
            const duration = performance.now() - startTime;
            logger.debug('Azure OpenAI streaming completed', correlationId, {
              duration: Math.round(duration),
              chunkCount,
              model: params.model,
              responseId,
            });

            yield assertValidResponsesStreamChunk(chunk);
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
    } finally {
      if (streamResource) {
        this.activeStreams.delete(streamResource);
      }
    }
  }

  /**
   * Creates an optimized HTTP agent for Node.js 24 with enhanced connection pooling.
   *
   * @private
   * @returns Optimized HTTP agent configuration
   */
  private createOptimizedHttpAgent(): HttpAgent | HttpsAgent | undefined {
    try {
      const isHttps = this.config.baseURL.startsWith('https://');
      const AgentClass = isHttps ? HttpsAgent : HttpAgent;

      return new AgentClass({
        keepAlive: true,
        keepAliveMsecs: 30000, // 30 seconds
        maxSockets: 50, // Increased for better concurrency
        maxFreeSockets: 10,
        timeout: this.config.timeout,
        // Node.js 24 specific optimizations
        scheduling: 'fifo', // First-in-first-out scheduling
      });
    } catch (error) {
      logger.warn('Failed to create optimized HTTP agent, using default', '', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return undefined;
    }
  }

  /**
   * Ensures the client has not been disposed.
   *
   * @private
   * @throws {Error} When client has been disposed
   */
  private ensureNotDisposed(): void {
    if (this._disposed) {
      throw new Error(
        'AzureResponsesClient has been disposed and cannot be used'
      );
    }
  }

  /**
   * Disposes the client and cleans up all resources.
   * Implements Node.js 24 explicit resource management.
   *
   * @public
   */
  async [Symbol.asyncDispose](): Promise<void> {
    if (this._disposed) {
      return;
    }

    logger.debug('Disposing Azure Responses client', '', {
      activeConnections: this.activeConnections.size,
      activeStreams: this.activeStreams.size,
    });

    // Clean up active connections
    const connectionCleanup = Array.from(this.activeConnections).map(
      async (connection) => {
        try {
          await connection[Symbol.asyncDispose]();
        } catch (error) {
          logger.warn('Failed to dispose connection resource', '', {
            resourceId: connection.resourceInfo.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    );

    // Clean up active streams
    const streamCleanup = Array.from(this.activeStreams).map(async (stream) => {
      try {
        await stream[Symbol.asyncDispose]();
      } catch (error) {
        logger.warn('Failed to dispose stream resource', '', {
          resourceId: stream.resourceInfo.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Wait for all cleanup operations with timeout
    await Promise.race([
      Promise.all([...connectionCleanup, ...streamCleanup]),
      new Promise<void>((resolve) => {
        setTimeout(resolve, 5000); // 5 second timeout
      }),
    ]);

    this.activeConnections.clear();
    this.activeStreams.clear();
    this._disposed = true;

    logger.debug('Azure Responses client disposed', '', {});
  }

  /**
   * Gets current resource statistics for monitoring.
   *
   * @public
   * @returns Resource usage statistics
   */
  public getResourceStats(): {
    readonly activeConnections: number;
    readonly activeStreams: number;
    readonly disposed: boolean;
    readonly memoryMetrics: ReturnType<typeof memoryManager.getMemoryMetrics>;
  } {
    return {
      activeConnections: this.activeConnections.size,
      activeStreams: this.activeStreams.size,
      disposed: this._disposed,
      memoryMetrics: memoryManager.getMemoryMetrics(),
    };
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

  private normalizeResponsesResponse(
    response: OpenAIResponse
  ): ResponsesResponse {
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
      };
    }

    const partialUsage = usage as Partial<OpenAIResponseUsage>;
    const inputTokens = partialUsage.input_tokens ?? 0;
    const outputTokens = partialUsage.output_tokens ?? 0;
    const totalTokens = partialUsage.total_tokens ?? inputTokens + outputTokens;
    const reasoningTokens =
      partialUsage.output_tokens_details?.reasoning_tokens;

    const result: ResponsesResponse['usage'] = {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: totalTokens,
      reasoning_tokens: reasoningTokens,
    };

    return result;
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
            reasoningItem.status === 'in_progress' ||
            reasoningItem.status === 'incomplete'
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
          logger.debug(
            'Unhandled Responses output item',
            'azure-responses-client',
            {
              itemType: item.type,
            }
          );
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
      typeof item.id === 'string' && item.id.length > 0
        ? item.id
        : item.call_id;

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
        type: 'text' as const,
        text: textValue ?? '',
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

    if (typeof config.baseURL !== 'string' || config.baseURL.length === 0) {
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

    if (typeof config.apiKey !== 'string' || config.apiKey.length === 0) {
      throw new ValidationError(
        'Invalid apiKey: must be a non-empty string',
        correlationId,
        'apiKey',
        '[REDACTED]'
      );
    }

    // API version validation removed - using latest stable API

    if (
      typeof config.deployment !== 'string' ||
      config.deployment.length === 0
    ) {
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
      // API version removed - using latest stable API
      deployment: this.config.deployment,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
    };
  }
}
