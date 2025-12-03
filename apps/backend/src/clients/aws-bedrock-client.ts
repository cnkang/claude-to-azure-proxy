/**
 * @fileoverview AWS Bedrock Converse API client implementation.
 *
 * This client mirrors the behaviour of {@link AzureResponsesClient} and reuses
 * the shared Responses API validation helpers to guarantee consistent request
 * and response handling across cloud providers.
 */

import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { performance } from 'node:perf_hooks';
import axios, {
  type AxiosInstance,
  type AxiosResponse,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios';
import { v4 as uuidv4 } from 'uuid';

import {
  AzureOpenAIError,
  ErrorFactory,
  ValidationError,
} from '../errors/index';
import { logger } from '../middleware/logging';
import {
  type HTTPConnectionResource,
  type StreamResource,
  createHTTPConnectionResource,
  createStreamResource,
} from '../runtime/resource-manager';
import type {
  AWSBedrockConfig,
  BedrockContentBlock,
  BedrockConverseRequest,
  BedrockConverseResponse,
  BedrockMessage,
  BedrockStream,
  BedrockStreamChunk,
  BedrockSystemMessage,
  BedrockToolConfig,
  BedrockToolUse,
  BedrockUsage,
  ResponseOutput,
  ResponseUsage,
  ResponsesCreateParams,
  ResponsesResponse,
  ResponsesStreamChunk,
} from '../types/index';
import {
  createAbortError,
  isAbortError,
  registerAbortListener,
  throwIfAborted,
} from '../utils/abort-utils';
import { memoryManager } from '../utils/memory-manager';
import {
  assertValidResponsesResponse,
  assertValidResponsesStreamChunk,
  validateResponsesCreateParams,
} from '../utils/responses-validator';

/**
 * AWS Bedrock Converse API client with validation shared with the Azure client.
 * Enhanced for Node.js 24 with improved streaming response handling, automatic
 * resource cleanup, and optimized error handling.
 */
export class AWSBedrockClient implements AsyncDisposable {
  private readonly client: AxiosInstance;
  private readonly config: AWSBedrockConfig;
  private readonly activeConnections = new Set<HTTPConnectionResource>();
  private readonly activeStreams = new Set<StreamResource>();
  private _disposed = false;

  private static readonly ignoredStreamEvents = new Set<string>([
    'messageStart',
    'contentBlockStart',
    'contentBlockStop',
  ]);

  constructor(config: AWSBedrockConfig) {
    this.validateConfig(config);
    this.config = Object.freeze({ ...config });

    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        'User-Agent': 'claude-to-azure-proxy/2.0.0 (Node.js 24)',
        'X-Amzn-Bedrock-Accept': 'application/json',
        'X-Amzn-Bedrock-Region': config.region,
        Connection: 'keep-alive',
        'Keep-Alive': 'timeout=30, max=100',
      },
      // Enhanced HTTP agent configuration for Node.js 24
      httpAgent: this.createOptimizedHttpAgent(),
      httpsAgent: this.createOptimizedHttpsAgent(),
    });

    this.setupRetryInterceptor();

    // Track memory usage for this client instance
    memoryManager.startMonitoring();
  }

  /**
   * Creates a non-streaming response using the Converse API with enhanced resource management.
   */
  public async createResponse(
    params: ResponsesCreateParams,
    signal?: AbortSignal
  ): Promise<ResponsesResponse> {
    this.ensureNotDisposed();
    validateResponsesCreateParams(params);
    const abortContext = this.createAbortContext(signal);

    const connectionResource = this.createTrackedConnection(signal);

    try {
      const modelId = this.getBedrockModelId(params.model);
      const request = this.buildBedrockRequest(params);

      // Make the API call with enhanced monitoring
      const startTime = performance.now();
      const response: AxiosResponse<BedrockConverseResponse> =
        await this.client.post(`/model/${modelId}/converse`, request, {
          signal,
        });
      const duration = performance.now() - startTime;

      // Log performance metrics
      const { inputTokens, outputTokens } = response.data.usage;

      logger.debug('AWS Bedrock API call completed', '', {
        duration: Math.round(duration),
        model: params.model,
        modelId,
        inputTokens,
        outputTokens,
      });

      const normalized = this.transformBedrockResponse(
        response.data,
        params.model
      );

      return assertValidResponsesResponse(normalized);
    } catch (error) {
      if (isAbortError(error)) {
        abortContext.markAborted();
        throw error;
      }
      throw this.handleApiError(error, 'createResponse');
    } finally {
      abortContext.cleanup();
      await this.cleanupConnectionResource(connectionResource, abortContext.aborted());
    }
  }

  /**
   * Creates a streaming response using the Converse API with optimized streaming handling.
   */
  public async *createResponseStream(
    params: ResponsesCreateParams,
    signal?: AbortSignal
  ): AsyncIterable<ResponsesStreamChunk> {
    this.ensureNotDisposed();
    validateResponsesCreateParams(params);
    throwIfAborted(signal);

    const correlationId = uuidv4();
    const { response, modelId } = await this.requestStreamingResponse(
      params,
      signal
    );

    const streamResource = this.createTrackedStreamResource(
      response.data,
      params.model
    );
    const abortContext = this.createStreamAbortContext(response.data, signal);

    try {
      yield* this.streamResponseEvents({
        abortContext,
        correlationId,
        model: params.model,
        modelId,
        signal,
        startTime: performance.now(),
        stream: response.data,
      });
    } catch (error) {
      if (isAbortError(error)) {
        abortContext.markAborted();
        throw error;
      }
      throw this.handleApiError(error, 'createResponseStream');
    } finally {
      abortContext.cleanup();
      await this.cleanupStreamResource(streamResource, abortContext.aborted());
    }
  }

  private async requestStreamingResponse(
    params: ResponsesCreateParams,
    signal?: AbortSignal
  ): Promise<{
    modelId: string;
    response: AxiosResponse<BedrockStream>;
  }> {
    const modelId = this.getBedrockModelId(params.model);
    const request = this.buildBedrockRequest(params);

    const response = await this.client.post<BedrockStream>(
      `/model/${modelId}/converse-stream`,
      request,
      {
        responseType: 'stream',
        headers: {
          Accept: 'application/vnd.amazon.eventstream',
        },
        signal,
      }
    );

    return { modelId, response };
  }

  private createTrackedStreamResource(
    stream: BedrockStream['data'],
    model: string
  ): StreamResource {
    const resource = createStreamResource(
      stream,
      `AWS Bedrock streaming response for model ${model}`
    );
    this.activeStreams.add(resource);
    return resource;
  }

  private createStreamAbortContext(
    stream: BedrockStream['data'],
    signal?: AbortSignal
  ): {
    aborted: () => boolean;
    cleanup: () => void;
    markAborted: () => void;
  } {
    let aborted = false;
    const removeAbortListener = registerAbortListener(signal, () => {
      aborted = true;
      if (typeof stream.destroy === 'function') {
        stream.destroy(createAbortError(signal?.reason));
      }
    });

    if (signal?.aborted) {
      removeAbortListener();
      if (typeof stream.destroy === 'function') {
        stream.destroy(createAbortError(signal.reason));
      }
      throw createAbortError(signal.reason);
    }

    return {
      aborted: () => aborted,
      cleanup: removeAbortListener,
      markAborted: () => {
        aborted = true;
      },
    };
  }

  private async *streamResponseEvents(params: {
    abortContext: { aborted: () => boolean };
    correlationId: string;
    model: string;
    modelId: string;
    signal?: AbortSignal;
    startTime: number;
    stream: BedrockStream['data'];
  }): AsyncIterable<ResponsesStreamChunk> {
    let responseId = params.correlationId;
    let createdAt = Math.floor(Date.now() / 1000);
    let chunkCount = 0;

    for await (const event of this.parseEventStream(
      params.stream,
      params.correlationId
    )) {
      throwIfAborted(params.signal);
      this.logStreamingMemoryPressure(chunkCount, params.correlationId);

      const result = this.transformStreamEvent(event, {
        correlationId: params.correlationId,
        createdAt,
        model: params.model,
        responseId,
      });

      if (result.kind === 'reset') {
        responseId = result.responseId;
        createdAt = result.createdAt;
        continue;
      }

      if (result.kind === 'completion') {
        chunkCount++;
        this.logStreamCompletion({
          chunkCount,
          correlationId: params.correlationId,
          durationMs: performance.now() - params.startTime,
          model: params.model,
          modelId: params.modelId,
          responseId,
        });
        yield assertValidResponsesStreamChunk(result.chunk);
        continue;
      }

      if (result.kind === 'chunks') {
        chunkCount += result.chunks.length;
        for (const chunk of result.chunks) {
          yield assertValidResponsesStreamChunk(chunk);
        }
        continue;
      }

      this.logUnhandledStreamEvent(event, params.correlationId);
    }
  }

  private transformStreamEvent(
    event: BedrockStreamChunk,
    context: {
      correlationId: string;
      createdAt: number;
      model: string;
      responseId: string;
    }
  ):
    | { kind: 'chunks'; chunks: ResponsesStreamChunk[] }
    | { kind: 'completion'; chunk: ResponsesStreamChunk }
    | { kind: 'none' }
    | { kind: 'reset'; createdAt: number; responseId: string } {
    if (event.messageStart) {
      return {
        kind: 'reset',
        responseId: context.correlationId,
        createdAt: Math.floor(Date.now() / 1000),
      };
    }

    if (event.contentBlockStart?.start.toolUse !== undefined) {
      return {
        kind: 'chunks',
        chunks: [
          this.createToolUseChunk(
            event.contentBlockStart.start.toolUse,
            context.responseId,
            context.createdAt,
            context.model
          ),
        ],
      };
    }

    if (event.contentBlockDelta?.delta.text !== undefined) {
      return {
        kind: 'chunks',
        chunks: [
          this.createTextDeltaChunk(
            event.contentBlockDelta.delta.text,
            context.responseId,
            context.createdAt,
            context.model
          ),
        ],
      };
    }

    if (event.metadata?.usage !== undefined) {
      return {
        kind: 'chunks',
        chunks: [
          this.createUsageChunk(
            event.metadata.usage,
            context.responseId,
            context.createdAt,
            context.model
          ),
        ],
      };
    }

    if (event.messageStop !== undefined) {
      return {
        kind: 'completion',
        chunk: this.createCompletionChunk(
          context.responseId,
          context.createdAt,
          context.model,
          event.metadata?.usage,
          event.messageStop.stopReason
        ),
      };
    }

    if (event.message !== undefined) {
      const outputs = this.transformContentBlocks(event.message.content);
      if (outputs.length > 0) {
        return {
          kind: 'chunks',
          chunks: [
            {
              id: context.responseId,
              object: 'response.chunk',
              created: context.createdAt,
              model: context.model,
              output: outputs,
            },
          ],
        };
      }
    }

    return { kind: 'none' };
  }

  private logStreamCompletion(params: {
    chunkCount: number;
    correlationId: string;
    durationMs: number;
    model: string;
    modelId: string;
    responseId: string;
  }): void {
    logger.debug('AWS Bedrock streaming completed', params.correlationId, {
      duration: Math.round(params.durationMs),
      chunkCount: params.chunkCount,
      model: params.model,
      modelId: params.modelId,
      responseId: params.responseId,
    });
  }

  private logUnhandledStreamEvent(
    event: BedrockStreamChunk,
    correlationId: string
  ): void {
    logger.debug('Unhandled AWS Bedrock stream event', correlationId, {
      keys: Object.keys(event),
    });
  }

  private logStreamingMemoryPressure(
    chunkCount: number,
    correlationId: string
  ): void {
    if (chunkCount % 10 !== 0) {
      return;
    }

    const memoryMetrics = memoryManager.getMemoryMetrics();
    if (memoryMetrics.pressure.level !== 'critical') {
      return;
    }

    logger.warn('Critical memory pressure during Bedrock streaming', correlationId, {
      heapUsage: memoryMetrics.heap.percentage,
      chunkCount,
    });
  }

  private async cleanupStreamResource(
    streamResource: StreamResource,
    aborted: boolean
  ): Promise<void> {
    this.activeStreams.delete(streamResource);

    if (!aborted || streamResource.disposed) {
      return;
    }

    try {
      await streamResource[Symbol.asyncDispose]();
    } catch (disposeError) {
      logger.warn('Failed to dispose aborted Bedrock stream resource', '', {
        error:
          disposeError instanceof Error
            ? disposeError.message
            : 'Unknown error',
      });
    }
  }

  /**
   * Creates an optimized HTTP agent for Node.js 24.
   *
   * @private
   * @returns Optimized HTTP agent
   */
  private createOptimizedHttpAgent(): HttpAgent | undefined {
    try {
      return new HttpAgent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50,
        maxFreeSockets: 10,
        timeout: this.config.timeout,
        scheduling: 'fifo',
      });
    } catch (error) {
      logger.warn('Failed to create optimized HTTP agent', '', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return undefined;
    }
  }

  /**
   * Creates an optimized HTTPS agent for Node.js 24.
   *
   * @private
   * @returns Optimized HTTPS agent
   */
  private createOptimizedHttpsAgent(): HttpsAgent | undefined {
    try {
      return new HttpsAgent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 50,
        maxFreeSockets: 10,
        timeout: this.config.timeout,
        scheduling: 'fifo',
      });
    } catch (error) {
      logger.warn('Failed to create optimized HTTPS agent', '', {
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
      throw new Error('AWSBedrockClient has been disposed and cannot be used');
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

    logger.debug('Disposing AWS Bedrock client', '', {
      activeConnections: this.activeConnections.size,
      activeStreams: this.activeStreams.size,
    });

    // Clean up active connections
    const connectionCleanup = Array.from(this.activeConnections).map(
      async (connection) => {
        try {
          await connection[Symbol.asyncDispose]();
        } catch (error) {
          logger.warn('Failed to dispose Bedrock connection resource', '', {
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
        logger.warn('Failed to dispose Bedrock stream resource', '', {
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

    logger.debug('AWS Bedrock client disposed', '', {});
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

  private buildBedrockRequest(
    params: ResponsesCreateParams
  ): BedrockConverseRequest {
    const { messages, systemMessages } = this.buildMessageBlocks(params);
    const inferenceConfig = this.buildInferenceConfig(params);
    const toolConfig = this.buildToolConfig(params);

    return {
      messages,
      ...(systemMessages.length > 0 && {
        system: systemMessages as readonly BedrockSystemMessage[],
      }),
      ...(inferenceConfig !== undefined && { inferenceConfig }),
      ...(toolConfig !== undefined && { toolConfig }),
    };
  }

  private buildMessageBlocks(
    params: ResponsesCreateParams
  ): {
    messages: BedrockMessage[];
    systemMessages: BedrockSystemMessage[];
  } {
    if (typeof params.input === 'string') {
      return {
        messages: [
          {
            role: 'user',
            content: [{ text: params.input }],
          },
        ],
        systemMessages: [],
      };
    }

    const messages: BedrockMessage[] = [];
    const systemMessages: BedrockSystemMessage[] = [];

    for (const message of params.input) {
      if (message.role === 'system') {
        systemMessages.push({ text: message.content });
        continue;
      }

      messages.push({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: [{ text: message.content }],
      });
    }

    return { messages, systemMessages };
  }

  private buildInferenceConfig(
    params: ResponsesCreateParams
  ): BedrockConverseRequest['inferenceConfig'] | undefined {
    if (
      params.max_output_tokens === undefined &&
      params.temperature === undefined &&
      params.top_p === undefined &&
      params.stop === undefined
    ) {
      return undefined;
    }

    return {
      ...(params.max_output_tokens !== undefined && {
        maxTokens: params.max_output_tokens,
      }),
      ...(params.temperature !== undefined && {
        temperature: params.temperature,
      }),
      ...(params.top_p !== undefined && { topP: params.top_p }),
      ...(params.stop !== undefined && { stopSequences: params.stop }),
    } as const;
  }

  private buildToolConfig(
    params: ResponsesCreateParams
  ): BedrockToolConfig | undefined {
    if (params.tools === undefined && params.tool_choice === undefined) {
      return undefined;
    }

    const tools = params.tools?.map((tool) => ({
      toolSpec: {
        name: tool.function.name,
        description: tool.function.description,
        inputSchema: {
          json: tool.function.parameters,
        },
      },
    }));

    const toolChoice =
      params.tool_choice === undefined
        ? undefined
        : params.tool_choice === 'auto'
          ? ({ auto: {} } as const)
          : params.tool_choice === 'none'
            ? ({ any: {} } as const)
            : ({
                tool: { name: params.tool_choice.function.name },
              } as const);

    return {
      ...(tools !== undefined && {
        tools,
      }),
      ...(toolChoice !== undefined && { toolChoice }),
    };
  }

  private transformBedrockResponse(
    response: BedrockConverseResponse,
    requestedModel: string
  ): ResponsesResponse {
    const outputs = this.transformContentBlocks(
      response.output.message.content
    );
    const usage = this.normalizeUsage(response.usage);

    const normalized: ResponsesResponse = {
      id: response.responseId,
      object: 'response',
      created: Math.floor(Date.now() / 1000),
      model: requestedModel,
      output: outputs,
      usage,
    };

    return normalized;
  }

  private transformContentBlocks(
    blocks: readonly BedrockContentBlock[]
  ): ResponseOutput[] {
    const outputs: ResponseOutput[] = [];

    for (const block of blocks) {
      if (block.text !== undefined) {
        outputs.push({
          type: 'text',
          text: block.text,
        });
        continue;
      }

      if (block.toolUse !== undefined) {
        outputs.push(this.createToolOutput(block.toolUse));
        continue;
      }

      if (block.toolResult !== undefined) {
        const resultContent = this.serializeToolBlocks(
          block.toolResult.content
        );
        outputs.push({
          type: 'tool_result',
          tool_result: {
            tool_call_id: block.toolResult.toolUseId,
            content: resultContent,
            is_error: block.toolResult.status === 'error',
          },
        });
      }
    }

    return outputs;
  }

  private createToolOutput(tool: BedrockToolUse): ResponseOutput {
    return {
      type: 'tool_call',
      tool_call: {
        id: tool.toolUseId,
        type: 'function',
        function: {
          name: tool.name,
          arguments: JSON.stringify(tool.input),
        },
      },
    };
  }

  private createTextDeltaChunk(
    text: string,
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
          text,
        },
      ],
    };
  }

  private createToolUseChunk(
    toolUse: BedrockToolUse,
    responseId: string,
    createdAt: number,
    model: string
  ): ResponsesStreamChunk {
    return {
      id: responseId,
      object: 'response.chunk',
      created: createdAt,
      model,
      output: [this.createToolOutput(toolUse)],
    };
  }

  private createUsageChunk(
    usage: BedrockUsage,
    responseId: string,
    createdAt: number,
    model: string
  ): ResponsesStreamChunk {
    return {
      id: responseId,
      object: 'response.chunk',
      created: createdAt,
      model,
      output: [],
      usage: this.normalizeUsage(usage),
    };
  }

  private createCompletionChunk(
    responseId: string,
    createdAt: number,
    model: string,
    usage: BedrockUsage | undefined,
    stopReason: string
  ): ResponsesStreamChunk {
    const normalizedUsage =
      usage !== undefined ? this.normalizeUsage(usage) : undefined;

    return {
      id: responseId,
      object: 'response.chunk',
      created: createdAt,
      model,
      output: [
        {
          type: 'reasoning',
          reasoning: {
            content: stopReason,
            status: 'completed',
          },
        },
      ],
      ...(normalizedUsage !== undefined && { usage: normalizedUsage }),
    };
  }

  private normalizeUsage(usage: BedrockUsage): ResponseUsage {
    return {
      prompt_tokens: usage.inputTokens,
      completion_tokens: usage.outputTokens,
      total_tokens: usage.totalTokens,
    };
  }

  private serializeToolBlocks(
    blocks: readonly BedrockContentBlock[] | undefined
  ): string {
    if (blocks === undefined || blocks.length === 0) {
      return '';
    }

    const parts: string[] = [];

    for (const block of blocks) {
      if (block.text !== undefined) {
        parts.push(block.text);
      } else if (block.toolUse !== undefined) {
        parts.push(JSON.stringify(block.toolUse));
      }
    }

    return parts.join('\n');
  }

  private async *parseEventStream(
    stream: BedrockStream,
    correlationId: string
  ): AsyncIterable<BedrockStreamChunk> {
    let buffer = '';

    for await (const chunk of stream as AsyncIterable<Buffer | string>) {
      buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (line.length > 0) {
          yield this.parseStreamLine(line, correlationId);
        }

        newlineIndex = buffer.indexOf('\n');
      }
    }

    const trailing = buffer.trim();
    if (trailing.length > 0) {
      yield this.parseStreamLine(trailing, correlationId);
    }
  }

  private parseStreamLine(
    line: string,
    correlationId: string
  ): BedrockStreamChunk {
    try {
      return JSON.parse(line) as BedrockStreamChunk;
    } catch (error) {
      logger.warn('Failed to parse Bedrock stream chunk', correlationId, {
        line,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {};
    }
  }

  private handleApiError(error: unknown, operation: string): Error {
    const correlationId = uuidv4();

    if (error instanceof ValidationError || error instanceof AzureOpenAIError) {
      return error;
    }

    const standardError = this.tryMapStandardError(error, correlationId, operation);
    if (standardError !== undefined) {
      return standardError;
    }

    const axiosError = this.tryMapAxiosError(error, correlationId, operation);
    if (axiosError !== undefined) {
      return axiosError;
    }

    return this.buildUnknownError(operation, correlationId);
  }

  private tryMapStandardError(
    error: unknown,
    correlationId: string,
    operation: string
  ): Error | undefined {
    if (!(error instanceof Error)) {
      return undefined;
    }

    if (error.message.includes('timeout')) {
      return ErrorFactory.fromTimeout(this.config.timeout, correlationId, operation);
    }

    if (
      error.message.includes('network') ||
      error.message.includes('ECONNREFUSED') ||
      (error as Error & { code?: string }).code === 'ECONNRESET'
    ) {
      return ErrorFactory.fromNetworkError(error, correlationId, operation);
    }

    return undefined;
  }

  private tryMapAxiosError(
    error: unknown,
    correlationId: string,
    operation: string
  ): Error | undefined {
    if (!this.isAxiosError(error)) {
      return undefined;
    }

    const status = error.response?.status ?? 500;
    const rawData = error.response?.data;
    let { message } = error;

    if (rawData !== undefined && typeof rawData === 'object' && rawData !== null) {
      message = this.serializeAxiosPayload(rawData);
    }

    return new AzureOpenAIError(
      message,
      status,
      correlationId,
      'bedrock_error',
      error.code ?? 'unknown',
      operation
    );
  }

  private serializeAxiosPayload(rawData: unknown): string {
    try {
      return JSON.stringify(rawData);
    } catch {
      return '[Unserializable AWS Bedrock error payload]';
    }
  }

  private buildUnknownError(operation: string, correlationId: string): AzureOpenAIError {
    return new AzureOpenAIError(
      `Unknown error during ${operation}`,
      500,
      correlationId,
      'unknown_error',
      'unknown',
      operation
    );
  }

  private validateConfig(config: AWSBedrockConfig): void {
    const correlationId = uuidv4();

    this.assertValidHttpsUrl(config.baseURL, correlationId);
    this.assertNonEmptyString(config.apiKey, 'apiKey', correlationId, '[REDACTED]');
    this.assertNonEmptyString(config.region, 'region', correlationId);
    this.assertPositiveNumber(config.timeout, 'timeout', correlationId);
    this.assertNonNegativeNumber(config.maxRetries, 'maxRetries', correlationId);
  }

  private assertValidHttpsUrl(
    value: unknown,
    correlationId: string
  ): asserts value is string {
    this.assertNonEmptyString(value, 'baseURL', correlationId);

    if (typeof value === 'string' && !value.startsWith('https://')) {
      throw new ValidationError(
        'Invalid baseURL: must use HTTPS protocol',
        correlationId,
        'baseURL',
        value,
        true,
        'AWSBedrockClient.validateConfig'
      );
    }
  }

  private assertNonEmptyString(
    value: unknown,
    field: string,
    correlationId: string,
    safeValue?: string
  ): asserts value is string {
    if (typeof value === 'string' && value.length > 0) {
      return;
    }

    throw new ValidationError(
      `Invalid ${field}: must be a non-empty string`,
      correlationId,
      field,
      safeValue ?? value,
      true,
      'AWSBedrockClient.validateConfig'
    );
  }

  private assertPositiveNumber(
    value: unknown,
    field: string,
    correlationId: string
  ): asserts value is number {
    if (typeof value === 'number' && value > 0) {
      return;
    }

    throw new ValidationError(
      `Invalid ${field}: must be a positive number`,
      correlationId,
      field,
      value,
      true,
      'AWSBedrockClient.validateConfig'
    );
  }

  private assertNonNegativeNumber(
    value: unknown,
    field: string,
    correlationId: string
  ): asserts value is number {
    if (typeof value === 'number' && value >= 0) {
      return;
    }

    throw new ValidationError(
      `Invalid ${field}: must be a non-negative number`,
      correlationId,
      field,
      value,
      true,
      'AWSBedrockClient.validateConfig'
    );
  }

  private createAbortContext(signal?: AbortSignal): {
    aborted: () => boolean;
    cleanup: () => void;
    markAborted: () => void;
  } {
    let aborted = false;
    const removeAbortListener = registerAbortListener(signal, () => {
      aborted = true;
    });

    if (signal?.aborted) {
      removeAbortListener();
      throw createAbortError(signal.reason);
    }

    return {
      aborted: () => aborted,
      cleanup: removeAbortListener,
      markAborted: () => {
        aborted = true;
      },
    };
  }

  private createTrackedConnection(signal?: AbortSignal): HTTPConnectionResource {
    const connectionResource = createHTTPConnectionResource(
      undefined,
      undefined,
      undefined
    );
    this.activeConnections.add(connectionResource);

    throwIfAborted(signal);
    return connectionResource;
  }

  private async cleanupConnectionResource(
    connectionResource: HTTPConnectionResource,
    aborted: boolean
  ): Promise<void> {
    this.activeConnections.delete(connectionResource);

    if (!aborted || connectionResource.disposed) {
      return;
    }

    try {
      await connectionResource[Symbol.asyncDispose]();
    } catch (disposeError) {
      logger.warn('Failed to dispose aborted Bedrock connection', '', {
        error:
          disposeError instanceof Error
            ? disposeError.message
            : 'Unknown error',
      });
    }
  }

  private setupRetryInterceptor(): void {
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const axiosError = error as AxiosError;
        const config = axiosError.config as
          | (InternalAxiosRequestConfig & { __retryCount?: number })
          | undefined;

        if (config === undefined) {
          return Promise.reject(this.handleApiError(error, 'awsBedrockRetry'));
        }

        const retryCount = config.__retryCount ?? 0;
        if (
          retryCount >= this.config.maxRetries ||
          !this.shouldRetry(axiosError)
        ) {
          return Promise.reject(this.handleApiError(error, 'awsBedrockRetry'));
        }

        config.__retryCount = retryCount + 1;
        const delay = Math.min(1000 * 2 ** retryCount, 8000);

        logger.warn('Retrying AWS Bedrock request', uuidv4(), {
          attempt: config.__retryCount,
          status: axiosError.response?.status,
        });

        await new Promise<void>((resolve) => {
          setTimeout(resolve, delay);
        });

        return this.client.request(config);
      }
    );
  }

  private shouldRetry(error: AxiosError): boolean {
    const status = error.response?.status;
    if (status !== undefined && (status >= 500 || status === 429)) {
      return true;
    }

    const code = error.code ?? '';
    return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].some(
      (retryable) => code.includes(retryable)
    );
  }

  private getBedrockModelId(model: string): string {
    return model;
  }

  private isAxiosError(error: unknown): error is AxiosError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'isAxiosError' in error &&
      (error as { isAxiosError?: boolean }).isAxiosError === true
    );
  }

  /**
   * Returns sanitized configuration with API key redacted for logging.
   */
  public getConfig(): Omit<AWSBedrockConfig, 'apiKey'> & {
    apiKey: '[REDACTED]';
  } {
    return {
      baseURL: this.config.baseURL,
      apiKey: '[REDACTED]',
      region: this.config.region,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
    };
  }
}
