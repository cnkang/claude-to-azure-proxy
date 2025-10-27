/**
 * @fileoverview AWS Bedrock Converse API client implementation.
 *
 * This client mirrors the behaviour of {@link AzureResponsesClient} and reuses
 * the shared Responses API validation helpers to guarantee consistent request
 * and response handling across cloud providers.
 */

import axios, {
  type AxiosInstance,
  type AxiosResponse,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios';
import { v4 as uuidv4 } from 'uuid';

import type {
  AWSBedrockConfig,

  ResponsesCreateParams,
  ResponsesResponse,
  ResponsesStreamChunk,
  ResponseOutput,
  ResponseUsage,
  BedrockConverseRequest,
  BedrockMessage,
  BedrockSystemMessage,
  BedrockToolConfig,
  BedrockToolUse,
  BedrockUsage,
  BedrockContentBlock,
  BedrockConverseResponse,
  BedrockStreamChunk,

  BedrockStream,
} from '../types/index.js';
import {
  ValidationError,
  AzureOpenAIError,
  ErrorFactory,
} from '../errors/index.js';
import { logger } from '../middleware/logging.js';
import {
  assertValidResponsesResponse,
  assertValidResponsesStreamChunk,
  validateResponsesCreateParams,
} from '../utils/responses-validator.js';

/**
 * AWS Bedrock Converse API client with validation shared with the Azure client.
 */
export class AWSBedrockClient {
  private readonly client: AxiosInstance;
  private readonly config: AWSBedrockConfig;

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
        'Authorization': `Bearer ${config.apiKey}`,
        'User-Agent': 'claude-to-azure-proxy/1.0.0',
        'X-Amzn-Bedrock-Accept': 'application/json',
        'X-Amzn-Bedrock-Region': config.region,
      },
    });

    this.setupRetryInterceptor();
  }

  /**
   * Creates a non-streaming response using the Converse API.
   */
  public async createResponse(
    params: ResponsesCreateParams
  ): Promise<ResponsesResponse> {
    validateResponsesCreateParams(params);

    try {
      const modelId = this.getBedrockModelId(params.model);
      const request = this.buildBedrockRequest(params);

      const response: AxiosResponse<BedrockConverseResponse> =
        await this.client.post(`/model/${modelId}/converse`, request);

      const normalized = this.transformBedrockResponse(
        response.data,
        params.model
      );

      return assertValidResponsesResponse(normalized);
    } catch (error) {
      throw this.handleApiError(error, 'createResponse');
    }
  }

  /**
   * Creates a streaming response using the Converse API.
   */
  public async *createResponseStream(
    params: ResponsesCreateParams
  ): AsyncIterable<ResponsesStreamChunk> {
    validateResponsesCreateParams(params);

    const correlationId = uuidv4();

    try {
      const modelId = this.getBedrockModelId(params.model);
      const request = this.buildBedrockRequest(params);

      const response = await this.client.post<BedrockStream>(
        `/model/${modelId}/converse-stream`,
        request,
        {
          responseType: 'stream',
          headers: {
            'Accept': 'application/vnd.amazon.eventstream',
          },
        }
      );

      let responseId = correlationId;
      let createdAt = Math.floor(Date.now() / 1000);
      const model = params.model;

      for await (const event of this.parseEventStream(
        response.data,
        correlationId
      )) {
        if (event.messageStart) {
          responseId = correlationId;
          createdAt = Math.floor(Date.now() / 1000);
          continue;
        }

        if (event.contentBlockStart?.start.toolUse !== undefined) {
          const chunk = this.createToolUseChunk(
            event.contentBlockStart.start.toolUse,
            responseId,
            createdAt,
            model
          );
          yield assertValidResponsesStreamChunk(chunk, correlationId);
          continue;
        }

        if (event.contentBlockDelta?.delta.text !== undefined) {
          const chunk = this.createTextDeltaChunk(
            event.contentBlockDelta.delta.text,
            responseId,
            createdAt,
            model
          );
          yield assertValidResponsesStreamChunk(chunk, correlationId);
          continue;
        }

        if (event.metadata?.usage !== undefined) {
          const chunk = this.createUsageChunk(
            event.metadata.usage,
            responseId,
            createdAt,
            model
          );
          yield assertValidResponsesStreamChunk(chunk, correlationId);
          continue;
        }

        if (event.messageStop !== undefined) {
          const chunk = this.createCompletionChunk(
            responseId,
            createdAt,
            model,
            event.metadata?.usage,
            event.messageStop.stopReason
          );
          yield assertValidResponsesStreamChunk(chunk, correlationId);
          continue;
        }

        if (event.message !== undefined) {
          const outputs = this.transformContentBlocks(
            event.message.content
          );
          if (outputs.length > 0) {
            const chunk: ResponsesStreamChunk = {
              id: responseId,
              object: 'response.chunk',
              created: createdAt,
              model,
              output: outputs,
            };
            yield assertValidResponsesStreamChunk(chunk, correlationId);
          }
          continue;
        }

        logger.debug(
          'Unhandled AWS Bedrock stream event',
          correlationId,
          {
            keys: Object.keys(event),
          }
        );
      }
    } catch (error) {
      throw this.handleApiError(error, 'createResponseStream');
    }
  }

  private buildBedrockRequest(
    params: ResponsesCreateParams
  ): BedrockConverseRequest {
    const messages: BedrockMessage[] = [];
    const systemMessages: BedrockSystemMessage[] = [];

    if (typeof params.input === 'string') {
      messages.push({
        role: 'user',
        content: [{ text: params.input }],
      });
    } else {
      for (const message of params.input) {
        if (message.role === 'system') {
          systemMessages.push({ text: message.content });
        } else {
          messages.push({
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: [{ text: message.content }],
          });
        }
      }
    }

    const inferenceConfig =
      params.max_output_tokens !== undefined ||
      params.temperature !== undefined ||
      params.top_p !== undefined ||
      params.stop !== undefined
        ? ({
            ...(params.max_output_tokens !== undefined && {
              maxTokens: params.max_output_tokens,
            }),
            ...(params.temperature !== undefined && {
              temperature: params.temperature,
            }),
            ...(params.top_p !== undefined && { topP: params.top_p }),
            ...(params.stop !== undefined && { stopSequences: params.stop }),
          } as const)
        : undefined;

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
    const outputs = this.transformContentBlocks(response.output.message.content);
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
        const resultContent = this.serializeToolBlocks(block.toolResult.content);
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

    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        return ErrorFactory.fromTimeout(
          this.config.timeout,
          correlationId,
          operation
        );
      }

      if (
        error.message.includes('network') ||
        error.message.includes('ECONNREFUSED') ||
        (error as Error & { code?: string }).code === 'ECONNRESET'
      ) {
        return ErrorFactory.fromNetworkError(error, correlationId, operation);
      }
    }

    if (this.isAxiosError(error)) {
      const status = error.response?.status ?? 500;
      const rawData = error.response?.data;
      let message = error.message;

      if (rawData !== undefined && typeof rawData === 'object' && rawData !== null) {
        try {
          message = JSON.stringify(rawData);
        } catch {
          message = '[Unserializable AWS Bedrock error payload]';
        }
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

    if (typeof config.baseURL !== 'string' || config.baseURL.length === 0) {
      throw new ValidationError(
        'Invalid baseURL: must be a non-empty string',
        correlationId,
        'baseURL',
        config.baseURL,
        true,
        'AWSBedrockClient.validateConfig'
      );
    }

    if (!config.baseURL.startsWith('https://')) {
      throw new ValidationError(
        'Invalid baseURL: must use HTTPS protocol',
        correlationId,
        'baseURL',
        config.baseURL,
        true,
        'AWSBedrockClient.validateConfig'
      );
    }

    if (typeof config.apiKey !== 'string' || config.apiKey.length === 0) {
      throw new ValidationError(
        'Invalid apiKey: must be a non-empty string',
        correlationId,
        'apiKey',
        '[REDACTED]',
        true,
        'AWSBedrockClient.validateConfig'
      );
    }

    if (typeof config.region !== 'string' || config.region.length === 0) {
      throw new ValidationError(
        'Invalid region: must be a non-empty string',
        correlationId,
        'region',
        config.region,
        true,
        'AWSBedrockClient.validateConfig'
      );
    }

    if (typeof config.timeout !== 'number' || config.timeout <= 0) {
      throw new ValidationError(
        'Invalid timeout: must be a positive number',
        correlationId,
        'timeout',
        config.timeout,
        true,
        'AWSBedrockClient.validateConfig'
      );
    }

    if (typeof config.maxRetries !== 'number' || config.maxRetries < 0) {
      throw new ValidationError(
        'Invalid maxRetries: must be a non-negative number',
        correlationId,
        'maxRetries',
        config.maxRetries,
        true,
        'AWSBedrockClient.validateConfig'
      );
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
          return Promise.reject(
            this.handleApiError(error, 'awsBedrockRetry')
          );
        }

        const retryCount = config.__retryCount ?? 0;
        if (
          retryCount >= this.config.maxRetries ||
          !this.shouldRetry(axiosError)
        ) {
          return Promise.reject(
            this.handleApiError(error, 'awsBedrockRetry')
          );
        }

        config.__retryCount = retryCount + 1;
        const delay = Math.min(1000 * Math.pow(2, retryCount), 8000);

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
    if (status !== undefined) {
      if (status >= 500 || status === 429) {
        return true;
      }
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
  public getConfig(): Omit<AWSBedrockConfig, 'apiKey'> & { apiKey: '[REDACTED]' } {
    return {
      baseURL: this.config.baseURL,
      apiKey: '[REDACTED]',
      region: this.config.region,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
    };
  }
}
