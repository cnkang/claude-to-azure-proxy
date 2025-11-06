/**
 * Streaming Service
 *
 * Provides streaming response processing with model routing integration.
 * Handles real-time AI model responses with proper session isolation.
 *
 * Requirements: 3.2, 16.3, 16.4, 16.5
 */

import type { Request as _Request, Response as _Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import type {
  RequestWithCorrelationId as _RequestWithCorrelationId,
  UniversalRequest,
  ClaudeRequest,
  OpenAIRequest,
  ClaudeStreamChunk as _ClaudeStreamChunk,
  OpenAIStreamChunk,
  ModelProvider as _ModelProvider,
} from '../types/index.js';
import {
  ValidationError,
  InternalServerError as _InternalServerError,
} from '../errors/index.js';
import { logger } from '../middleware/logging.js';
import { getModelRoutingService } from './model-routing-service.js';
import {
  getContextManagementService,
  type ContextMessage,
} from './context-management-service.js';

/**
 * Stream chunk for SSE communication
 */
export interface StreamChunk {
  readonly type: 'start' | 'chunk' | 'end' | 'error';
  readonly content?: string;
  readonly messageId?: string;
  readonly correlationId: string;
  readonly timestamp: number;
  readonly model?: string;
  readonly usage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
  };
}

/**
 * Chat request with context
 */
export interface ChatStreamRequest {
  readonly message: string;
  readonly model: string;
  readonly conversationId: string;
  readonly files?: Array<{
    readonly id: string;
    readonly name: string;
    readonly type: string;
    readonly url: string;
  }>;
  readonly contextMessages?: readonly ContextMessage[];
}

/**
 * Streaming response handler
 */
export interface StreamingResponseHandler {
  onStart: (messageId: string, model: string) => void;
  onChunk: (content: string, messageId: string) => void;
  onEnd: (messageId: string, usage?: StreamChunk['usage']) => void;
  onError: (error: string, messageId: string) => void;
}

/**
 * Streaming service class
 */
export class StreamingService {
  private readonly modelRoutingService = getModelRoutingService();
  private readonly contextService = getContextManagementService();
  private readonly activeStreams = new Map<string, AbortController>();

  /**
   * Processes a streaming chat request with model routing
   */
  public async processStreamingRequest(
    request: ChatStreamRequest,
    handler: StreamingResponseHandler,
    correlationId: string
  ): Promise<void> {
    const messageId = uuidv4();
    const abortController = new AbortController();
    this.activeStreams.set(messageId, abortController);

    try {
      logger.info('Processing streaming request', correlationId, {
        conversationId: request.conversationId,
        model: request.model,
        messageLength: request.message.length,
        hasFiles: !!request.files?.length,
        hasContext: !!request.contextMessages?.length,
      });

      // Build conversation context
      const contextMessages = await this.buildConversationContext(
        request.contextMessages || [],
        request.message,
        request.files,
        correlationId
      );

      // Create universal request
      const universalRequest = this.createUniversalRequest(
        request.message,
        request.model,
        contextMessages,
        request.files
      );

      // Route the request to appropriate provider
      const routingResult = await this.modelRoutingService.routeModelRequest(
        request.model,
        universalRequest,
        correlationId
      );

      // Send start event
      handler.onStart(messageId, routingResult.decision.backendModel);

      // Process streaming response based on provider
      switch (routingResult.decision.provider) {
        case 'azure':
          await this.processAzureOpenAIStream(
            universalRequest,
            routingResult,
            messageId,
            handler,
            abortController.signal,
            correlationId
          );
          break;
        case 'bedrock':
          await this.processAWSBedrockStream(
            universalRequest,
            routingResult,
            messageId,
            handler,
            abortController.signal,
            correlationId
          );
          break;
        default:
          throw new ValidationError(
            `Unsupported provider: ${routingResult.decision.provider}`,
            correlationId,
            'provider',
            routingResult.decision.provider
          );
      }
    } catch (error) {
      logger.error('Streaming request failed', correlationId, {
        messageId,
        conversationId: request.conversationId,
        error: error instanceof Error ? error.message : String(error),
      });

      handler.onError(
        error instanceof Error ? error.message : 'Unknown streaming error',
        messageId
      );
    } finally {
      this.activeStreams.delete(messageId);
    }
  }

  /**
   * Cancels an active stream
   */
  public cancelStream(messageId: string): boolean {
    const controller = this.activeStreams.get(messageId);
    if (controller) {
      controller.abort();
      this.activeStreams.delete(messageId);
      return true;
    }
    return false;
  }

  /**
   * Gets active stream count
   */
  public getActiveStreamCount(): number {
    return this.activeStreams.size;
  }

  /**
   * Builds conversation context with token management
   */
  private async buildConversationContext(
    contextMessages: readonly ContextMessage[],
    currentMessage: string,
    files?: ChatStreamRequest['files'],
    correlationId?: string
  ): Promise<readonly ContextMessage[]> {
    const messages: ContextMessage[] = [...contextMessages];

    // Add current user message
    const userMessage: ContextMessage = {
      id: uuidv4(),
      role: 'user',
      content: this.formatUserMessage(currentMessage, files),
      timestamp: new Date(),
    };

    messages.push(userMessage);

    // Check if context needs compression
    const model = 'gpt-4o-mini'; // Default model for context calculation
    const contextUsage = this.contextService.calculateContextUsage(
      messages,
      model
    );

    if (contextUsage.utilizationPercentage > 80) {
      logger.info(
        'Context approaching limits, considering compression',
        correlationId || '',
        {
          utilizationPercentage: contextUsage.utilizationPercentage,
          currentTokens: contextUsage.currentTokens,
          maxTokens: contextUsage.maxTokens,
        }
      );

      // Auto-compress if over 90% utilization
      if (contextUsage.utilizationPercentage > 90) {
        const compressionResult = await this.contextService.compressContext(
          messages.slice(0, -1), // Don't compress the current message
          {
            method: 'ai-summary',
            targetReduction: 50,
            preserveRecent: 3,
            preserveImportant: true,
          },
          correlationId || ''
        );

        // Replace compressed messages with summary
        const compressedMessage: ContextMessage = {
          id: uuidv4(),
          role: 'system',
          content: compressionResult.compressedContent,
          timestamp: new Date(),
        };

        return [compressedMessage, userMessage];
      }
    }

    return messages;
  }

  /**
   * Formats user message with file attachments
   */
  private formatUserMessage(
    message: string,
    files?: ChatStreamRequest['files']
  ): string {
    if (!files || files.length === 0) {
      return message;
    }

    const fileDescriptions = files
      .map((file) => `[File: ${file.name} (${file.type})]`)
      .join('\n');

    return `${message}\n\n${fileDescriptions}`;
  }

  /**
   * Creates universal request from chat parameters
   */
  private createUniversalRequest(
    message: string,
    model: string,
    contextMessages: readonly ContextMessage[],
    _files?: ChatStreamRequest['files']
  ): UniversalRequest {
    // Convert context messages to Claude format (more universal)
    const claudeMessages = contextMessages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const claudeRequest: ClaudeRequest = {
      model,
      messages: claudeMessages,
      max_tokens: 4000,
      temperature: 0.7,
      stream: true,
    };

    return claudeRequest;
  }

  /**
   * Processes Azure OpenAI streaming response
   */
  private async processAzureOpenAIStream(
    request: UniversalRequest,
    routingResult: any,
    messageId: string,
    handler: StreamingResponseHandler,
    signal: AbortSignal,
    correlationId: string
  ): Promise<void> {
    try {
      // Transform request to Azure OpenAI format
      const azureRequest = this.transformToAzureOpenAIRequest(
        request,
        routingResult
      );

      // Make streaming request to Azure OpenAI
      const response = await axios.post(
        `${routingResult.providerEndpoint}/openai/deployments/${routingResult.decision.backendModel}/chat/completions?api-version=2024-02-01`,
        azureRequest,
        {
          headers: {
            ...routingResult.providerHeaders,
            Accept: 'text/event-stream',
          },
          responseType: 'stream',
          signal,
          timeout: 120000,
        }
      );

      let accumulatedContent = '';
      const inputTokens = 0;
      const outputTokens = 0;

      // Process SSE stream
      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();

            if (data === '[DONE]') {
              handler.onEnd(messageId, {
                inputTokens,
                outputTokens,
                totalTokens: inputTokens + outputTokens,
              });
              return;
            }

            try {
              const parsed = JSON.parse(data) as OpenAIStreamChunk;

              if (parsed.choices?.[0]?.delta?.content) {
                const content = parsed.choices[0].delta.content;
                accumulatedContent += content;
                handler.onChunk(content, messageId);
              }

              // Extract usage information if available (usage is not typically in stream chunks)
              // Usage information is usually sent in the final chunk or separately
            } catch (_parseError) {
              // Ignore parsing errors for non-JSON lines
            }
          }
        }
      });

      response.data.on('error', (error: Error) => {
        logger.error('Azure OpenAI stream error', correlationId, {
          messageId,
          error: error.message,
        });
        handler.onError(error.message, messageId);
      });

      response.data.on('end', () => {
        if (accumulatedContent) {
          handler.onEnd(messageId, {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
          });
        }
      });
    } catch (error) {
      logger.error('Azure OpenAI streaming failed', correlationId, {
        messageId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (axios.isAxiosError(error)) {
        const errorMessage =
          error.response?.data?.error?.message || error.message;
        handler.onError(errorMessage, messageId);
      } else {
        handler.onError('Azure OpenAI streaming failed', messageId);
      }
    }
  }

  /**
   * Processes AWS Bedrock streaming response
   */
  private async processAWSBedrockStream(
    request: UniversalRequest,
    routingResult: any,
    messageId: string,
    handler: StreamingResponseHandler,
    signal: AbortSignal,
    correlationId: string
  ): Promise<void> {
    try {
      // For now, simulate Bedrock streaming since AWS SDK integration is complex
      // In production, this would use AWS SDK for Bedrock Runtime

      logger.info('Simulating AWS Bedrock streaming response', correlationId, {
        messageId,
        model: routingResult.decision.backendModel,
      });

      const simulatedResponse = `I understand your request. This is a simulated response from ${routingResult.decision.backendModel} via AWS Bedrock. In a production environment, this would connect to the actual Bedrock service using AWS SDK.`;

      const words = simulatedResponse.split(' ');

      for (let i = 0; i < words.length; i++) {
        if (signal.aborted) {
          break;
        }

        const content = words[i] + (i < words.length - 1 ? ' ' : '');
        handler.onChunk(content, messageId);

        // Simulate processing delay
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (!signal.aborted) {
        handler.onEnd(messageId, {
          inputTokens: Math.floor(JSON.stringify(request).length / 4),
          outputTokens: Math.floor(simulatedResponse.length / 4),
          totalTokens: Math.floor(
            (JSON.stringify(request).length + simulatedResponse.length) / 4
          ),
        });
      }
    } catch (error) {
      logger.error('AWS Bedrock streaming failed', correlationId, {
        messageId,
        error: error instanceof Error ? error.message : String(error),
      });
      handler.onError('AWS Bedrock streaming failed', messageId);
    }
  }

  /**
   * Transforms universal request to Azure OpenAI format
   */
  private transformToAzureOpenAIRequest(
    request: UniversalRequest,
    routingResult: any
  ): any {
    if ('messages' in request) {
      // Claude format - transform to OpenAI
      return {
        messages: request.messages.map((msg) => ({
          role: msg.role,
          content:
            typeof msg.content === 'string'
              ? msg.content
              : JSON.stringify(msg.content),
        })),
        max_tokens:
          request.max_tokens ||
          routingResult.transformationParams.maxTokens ||
          4000,
        temperature:
          request.temperature ||
          routingResult.transformationParams.temperature ||
          0.7,
        top_p: request.top_p || routingResult.transformationParams.topP,
        stream: true,
        stop: 'stop_sequences' in request ? request.stop_sequences : undefined,
      };
    }

    // Already in OpenAI format
    if ('messages' in request && 'model' in request) {
      const openAIRequest = request as OpenAIRequest;
      return {
        model: openAIRequest.model,
        messages: openAIRequest.messages,
        max_tokens:
          openAIRequest.max_tokens || openAIRequest.max_completion_tokens,
        temperature: openAIRequest.temperature,
        top_p: openAIRequest.top_p,
        stream: true,
        tools: openAIRequest.tools,
        tool_choice: openAIRequest.tool_choice,
        response_format: openAIRequest.response_format,
      };
    }

    // Fallback for other request types
    return {
      model: 'gpt-4o-mini',
      messages: [],
      stream: true,
    };
  }
}

/**
 * Global streaming service instance
 */
let streamingService: StreamingService | null = null;

/**
 * Gets the global streaming service instance
 */
export function getStreamingService(): StreamingService {
  if (!streamingService) {
    streamingService = new StreamingService();
  }
  return streamingService;
}

/**
 * Creates a new streaming service instance
 */
export function createStreamingService(): StreamingService {
  return new StreamingService();
}
