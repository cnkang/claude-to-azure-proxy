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
  OpenAIRequest as _OpenAIRequest,
  ClaudeStreamChunk as _ClaudeStreamChunk,
  OpenAIStreamChunk as _OpenAIStreamChunk,
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
 *
 * Task 6.1: Added 'heartbeat' type for connection health monitoring
 */
export interface StreamChunk {
  readonly type: 'start' | 'chunk' | 'end' | 'error' | 'heartbeat';
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
   *
   * Task 9.6.1: Accept messageId parameter to ensure consistent ID throughout the flow
   */
  public async processStreamingRequest(
    request: ChatStreamRequest,
    handler: StreamingResponseHandler,
    correlationId: string,
    messageId?: string
  ): Promise<void> {
    // Use provided messageId or generate new one (for backward compatibility)
    const streamMessageId = messageId || uuidv4();
    const abortController = new AbortController();
    this.activeStreams.set(streamMessageId, abortController);

    let completionHandled = false;
    let abortReason: string | undefined;

    // Log AbortController creation
    logger.debug(
      '[ABORT-DEBUG] AbortController created for streaming request',
      correlationId,
      {
        messageId: streamMessageId,
        providedMessageId: messageId,
        signalAborted: abortController.signal.aborted,
        activeStreamsCount: this.activeStreams.size,
        timestamp: new Date().toISOString(),
      }
    );

    // Add abort event listener to track when and why signal gets aborted
    abortController.signal.addEventListener('abort', () => {
      abortReason = abortController.signal.reason || 'No reason provided';
      logger.warn(
        '[ABORT-DEBUG] AbortController signal aborted',
        correlationId,
        {
          messageId: streamMessageId,
          reason: abortReason,
          timestamp: new Date().toISOString(),
          stackTrace: new Error().stack,
        }
      );
    });

    try {
      // Check signal state at entry
      if (abortController.signal.aborted) {
        logger.error(
          '[ABORT-DEBUG] Signal already aborted at entry',
          correlationId,
          {
            messageId: streamMessageId,
            reason: abortController.signal.reason,
            timestamp: new Date().toISOString(),
          }
        );
        throw new Error(
          `Request aborted at entry: ${abortController.signal.reason}`
        );
      }

      logger.info('Processing streaming request', correlationId, {
        messageId: streamMessageId,
        providedMessageId: messageId,
        conversationId: request.conversationId,
        model: request.model,
        messageLength: request.message.length,
        hasFiles: !!request.files?.length,
        hasContext: !!request.contextMessages?.length,
        signalAborted: abortController.signal.aborted,
      });

      // Check signal state before building context
      if (abortController.signal.aborted) {
        logger.error(
          '[ABORT-DEBUG] Signal aborted before building context',
          correlationId,
          {
            messageId: streamMessageId,
            reason: abortController.signal.reason,
            timestamp: new Date().toISOString(),
          }
        );
        throw new Error(
          `Request aborted before context: ${abortController.signal.reason}`
        );
      }

      // Build conversation context
      const contextMessages = await this.buildConversationContext(
        request.contextMessages || [],
        request.message,
        request.files,
        correlationId
      );

      // Check signal state after building context
      if (abortController.signal.aborted) {
        logger.error(
          '[ABORT-DEBUG] Signal aborted after building context',
          correlationId,
          {
            messageId: streamMessageId,
            reason: abortController.signal.reason,
            timestamp: new Date().toISOString(),
          }
        );
        throw new Error(
          `Request aborted after context: ${abortController.signal.reason}`
        );
      }

      // Create universal request
      const universalRequest = this.createUniversalRequest(
        request.message,
        request.model,
        contextMessages,
        request.files
      );

      // Check signal state before routing
      if (abortController.signal.aborted) {
        logger.error(
          '[ABORT-DEBUG] Signal aborted before routing',
          correlationId,
          {
            messageId: streamMessageId,
            reason: abortController.signal.reason,
            timestamp: new Date().toISOString(),
          }
        );
        throw new Error(
          `Request aborted before routing: ${abortController.signal.reason}`
        );
      }

      // Route the request to appropriate provider
      const routingResult = await this.modelRoutingService.routeModelRequest(
        request.model,
        universalRequest,
        correlationId
      );

      // Check signal state after routing
      if (abortController.signal.aborted) {
        logger.error(
          '[ABORT-DEBUG] Signal aborted after routing',
          correlationId,
          {
            messageId: streamMessageId,
            reason: abortController.signal.reason,
            timestamp: new Date().toISOString(),
          }
        );
        throw new Error(
          `Request aborted after routing: ${abortController.signal.reason}`
        );
      }

      // Note: onStart is called by the handler in chat-stream.ts before this method is invoked
      // Do not call handler.onStart here to avoid duplicate start events

      // Log signal state before processing
      logger.debug(
        '[ABORT-DEBUG] Starting provider-specific streaming',
        correlationId,
        {
          messageId: streamMessageId,
          provider: routingResult.decision.provider,
          signalAborted: abortController.signal.aborted,
          timestamp: new Date().toISOString(),
        }
      );

      // Process streaming response based on provider
      switch (routingResult.decision.provider) {
        case 'azure':
          await this.processAzureOpenAIStream(
            universalRequest,
            routingResult,
            streamMessageId,
            handler,
            abortController.signal,
            correlationId
          );
          break;
        case 'bedrock':
          await this.processAWSBedrockStream(
            universalRequest,
            routingResult,
            streamMessageId,
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

      // Check signal state before marking completion
      if (abortController.signal.aborted) {
        logger.warn(
          '[ABORT-DEBUG] Signal aborted before marking completion',
          correlationId,
          {
            messageId: streamMessageId,
            reason: abortController.signal.reason,
            timestamp: new Date().toISOString(),
          }
        );
      }

      // Mark completion as handled if we reach here successfully
      completionHandled = true;
      logger.debug(
        '[ABORT-DEBUG] Streaming request completed successfully',
        correlationId,
        {
          messageId: streamMessageId,
          signalAborted: abortController.signal.aborted,
          abortReason,
          timestamp: new Date().toISOString(),
        }
      );
    } catch (error) {
      logger.error(
        '[ABORT-DEBUG] Streaming request failed in processStreamingRequest',
        correlationId,
        {
          messageId: streamMessageId,
          conversationId: request.conversationId,
          error: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : 'unknown',
          signalAborted: abortController.signal.aborted,
          signalReason: abortController.signal.reason || abortReason,
          timestamp: new Date().toISOString(),
        }
      );

      // Only call onError if completion hasn't been handled yet
      if (!completionHandled) {
        completionHandled = true;
        handler.onError(
          error instanceof Error ? error.message : 'Unknown streaming error',
          streamMessageId
        );
      }
    } finally {
      // Always clean up resources in finally block
      // This ensures cleanup happens on both success and error paths

      // Log cleanup timing with race condition detection
      const wasAborted = abortController.signal.aborted;
      const finalAbortReason = abortController.signal.reason || abortReason;
      const cleanupStartTime = Date.now();

      logger.debug(
        '[ABORT-DEBUG] Streaming request cleanup starting',
        correlationId,
        {
          messageId: streamMessageId,
          completionHandled,
          signalAborted: wasAborted,
          signalReason: finalAbortReason,
          activeStreamsCount: this.activeStreams.size,
          timestamp: new Date().toISOString(),
        }
      );

      // Check if there's a race condition - signal aborted but completion handled
      if (wasAborted && completionHandled) {
        logger.warn(
          '[ABORT-DEBUG] Potential race condition detected',
          correlationId,
          {
            messageId: streamMessageId,
            description:
              'Signal was aborted but completion was handled successfully',
            abortReason: finalAbortReason,
            timestamp: new Date().toISOString(),
          }
        );
      }

      // Remove from active streams before aborting to prevent re-entry
      const wasInActiveStreams = this.activeStreams.has(streamMessageId);
      this.activeStreams.delete(streamMessageId);

      logger.debug('[ABORT-DEBUG] Removed from active streams', correlationId, {
        messageId: streamMessageId,
        wasInActiveStreams,
        remainingActiveStreams: this.activeStreams.size,
        timestamp: new Date().toISOString(),
      });

      // CRITICAL FIX: Only abort if completion was NOT handled successfully
      // If completion was handled, the stream finished normally and we should NOT abort
      if (!completionHandled && !abortController.signal.aborted) {
        logger.debug(
          '[ABORT-DEBUG] Aborting controller in finally block (stream did not complete)',
          correlationId,
          {
            messageId: streamMessageId,
            timestamp: new Date().toISOString(),
          }
        );
        abortController.abort(
          'Cleanup in finally block - stream did not complete'
        );
      } else if (completionHandled) {
        logger.debug(
          '[ABORT-DEBUG] Skipping abort - stream completed successfully',
          correlationId,
          {
            messageId: streamMessageId,
            timestamp: new Date().toISOString(),
          }
        );
      } else {
        logger.debug(
          '[ABORT-DEBUG] Controller already aborted, skipping abort call',
          correlationId,
          {
            messageId: streamMessageId,
            existingReason: finalAbortReason,
            timestamp: new Date().toISOString(),
          }
        );
      }

      const cleanupDuration = Date.now() - cleanupStartTime;
      logger.debug(
        '[ABORT-DEBUG] Streaming request cleanup completed',
        correlationId,
        {
          messageId: streamMessageId,
          completionHandled,
          wasAborted,
          finalAbortReason,
          activeStreamsCount: this.activeStreams.size,
          cleanupDuration,
          timestamp: new Date().toISOString(),
        }
      );
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
    let completed = false;
    let buffer = ''; // Buffer for accumulating partial chunks

    try {
      // Transform request to Azure OpenAI format
      const azureRequest = this.transformToAzureOpenAIRequest(
        request,
        routingResult
      );

      // Log request lifecycle: Before axios request creation
      logger.info(
        '[ABORT-DEBUG] Azure OpenAI streaming request starting',
        correlationId,
        {
          messageId,
          endpoint: `${routingResult.providerEndpoint}/openai/v1/responses`,
          model: routingResult.decision.backendModel,
          maxOutputTokens: azureRequest.max_output_tokens,
          signalAborted: signal.aborted,
          signalReason: signal.reason,
          timestamp: new Date().toISOString(),
        }
      );

      // Check AbortController signal state before request
      if (signal.aborted) {
        logger.error(
          '[ABORT-DEBUG] AbortController signal already aborted before request',
          correlationId,
          {
            messageId,
            reason: signal.reason,
            timestamp: new Date().toISOString(),
            stackTrace: new Error().stack,
          }
        );
        throw new Error(`Request aborted before starting: ${signal.reason}`);
      }

      // Make streaming request to Azure OpenAI using v1 responses endpoint
      // Use configured timeout from environment (default 120000ms)
      const configuredTimeout = process.env.AZURE_OPENAI_TIMEOUT
        ? parseInt(process.env.AZURE_OPENAI_TIMEOUT, 10)
        : 120000;

      const requestStartTime = Date.now();
      logger.debug(
        '[ABORT-DEBUG] Creating axios streaming request',
        correlationId,
        {
          messageId,
          timeout: configuredTimeout,
          signalAborted: signal.aborted,
          signalReason: signal.reason,
          requestStartTime,
          timestamp: new Date().toISOString(),
        }
      );

      // Check signal immediately before axios call
      if (signal.aborted) {
        logger.error(
          '[ABORT-DEBUG] Signal aborted immediately before axios call',
          correlationId,
          {
            messageId,
            reason: signal.reason,
            timestamp: new Date().toISOString(),
          }
        );
        throw new Error(`Request aborted before axios call: ${signal.reason}`);
      }

      const response = await axios.post(
        `${routingResult.providerEndpoint}/openai/v1/responses`,
        azureRequest,
        {
          headers: {
            ...routingResult.providerHeaders,
            Accept: 'text/event-stream',
          },
          responseType: 'stream',
          signal,
          timeout: configuredTimeout,
        }
      );

      // Check signal immediately after axios call
      if (signal.aborted) {
        logger.warn(
          '[ABORT-DEBUG] Signal aborted immediately after axios call',
          correlationId,
          {
            messageId,
            reason: signal.reason,
            timestamp: new Date().toISOString(),
          }
        );
      }

      // Log successful response headers
      const requestDuration = Date.now() - requestStartTime;
      logger.info(
        '[ABORT-DEBUG] Azure OpenAI streaming response received',
        correlationId,
        {
          messageId,
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers['content-type'],
          transferEncoding: response.headers['transfer-encoding'],
          requestDuration,
          signalAborted: signal.aborted,
          signalReason: signal.reason,
          timestamp: new Date().toISOString(),
        }
      );

      let accumulatedContent = '';
      let inputTokens = 0;
      let outputTokens = 0;
      let chunkCount = 0;
      const streamStartTime = Date.now();

      // Process SSE stream with robust parser for Responses API
      response.data.on('data', (chunk: Buffer) => {
        if (completed) {
          return;
        }

        // Check signal state at start of data handler
        if (signal.aborted) {
          logger.warn(
            '[ABORT-DEBUG] Signal aborted in data handler',
            correlationId,
            {
              messageId,
              chunkNumber: chunkCount + 1,
              reason: signal.reason,
              timestamp: new Date().toISOString(),
            }
          );
          return;
        }

        chunkCount++;
        const chunkSize = chunk.length;

        // Log chunk reception (throttled to avoid log spam)
        if (chunkCount === 1 || chunkCount % 10 === 0) {
          logger.debug('[ABORT-DEBUG] SSE data chunk received', correlationId, {
            messageId,
            chunkNumber: chunkCount,
            chunkSize,
            bufferSize: buffer.length,
            signalAborted: signal.aborted,
            signalReason: signal.reason,
            elapsedTime: Date.now() - streamStartTime,
            timestamp: new Date().toISOString(),
          });
        }

        try {
          // Append chunk to buffer
          buffer += chunk.toString();

          // Split by both LF and CRLF line endings
          const lines = buffer.split(/\r?\n/);

          // Keep the last incomplete line in the buffer
          buffer = lines.pop() || '';

          // Process complete lines
          for (const line of lines) {
            if (!line.trim()) {
              continue;
            } // Skip empty lines

            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();

              if (data === '[DONE]') {
                completed = true;
                const streamDuration = Date.now() - streamStartTime;
                logger.info(
                  'SSE stream completed with [DONE] marker',
                  correlationId,
                  {
                    messageId,
                    chunkCount,
                    streamDuration,
                    contentLength: accumulatedContent.length,
                    inputTokens,
                    outputTokens,
                    signalAborted: signal.aborted,
                  }
                );
                handler.onEnd(messageId, {
                  inputTokens,
                  outputTokens,
                  totalTokens: inputTokens + outputTokens,
                });
                return;
              }

              try {
                const parsed = JSON.parse(data);

                // Handle Responses API format
                if (
                  parsed.type === 'response.output_text.delta' &&
                  parsed.delta
                ) {
                  // Text delta from Responses API
                  const content = parsed.delta;
                  accumulatedContent += content;
                  outputTokens = Math.floor(accumulatedContent.length / 4); // Rough token estimate
                  handler.onChunk(content, messageId);
                } else if (
                  parsed.type === 'response.completed' &&
                  parsed.response
                ) {
                  // Final response with usage information
                  completed = true;
                  const streamDuration = Date.now() - streamStartTime;
                  if (parsed.response.usage) {
                    inputTokens = parsed.response.usage.input_tokens || 0;
                    outputTokens = parsed.response.usage.output_tokens || 0;
                  }
                  logger.info(
                    'SSE stream completed with response.completed',
                    correlationId,
                    {
                      messageId,
                      chunkCount,
                      streamDuration,
                      contentLength: accumulatedContent.length,
                      inputTokens,
                      outputTokens,
                      signalAborted: signal.aborted,
                    }
                  );
                  handler.onEnd(messageId, {
                    inputTokens,
                    outputTokens,
                    totalTokens: inputTokens + outputTokens,
                  });
                  return;
                }
                // Ignore other event types (response.created, response.in_progress, etc.)
              } catch (parseError) {
                logger.warn('Failed to parse SSE data', correlationId, {
                  messageId,
                  data: data.substring(0, 100), // Log first 100 chars
                  error:
                    parseError instanceof Error
                      ? parseError.message
                      : String(parseError),
                });
                // Continue processing other lines
              }
            } else if (line.startsWith('event: ')) {
              // Handle SSE event type
              const eventType = line.slice(7).trim();
              logger.debug('SSE event received', correlationId, {
                messageId,
                eventType,
              });
            } else if (line.startsWith('id: ')) {
              // Handle SSE event ID
              const eventId = line.slice(4).trim();
              logger.debug('SSE event ID received', correlationId, {
                messageId,
                eventId,
              });
            }
          }
        } catch (error) {
          logger.error('Error processing SSE chunk', correlationId, {
            messageId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

      response.data.on('error', (error: Error) => {
        if (completed) {
          return;
        }

        const streamDuration = Date.now() - streamStartTime;
        logger.error(
          '[ABORT-DEBUG] Azure OpenAI stream error event',
          correlationId,
          {
            messageId,
            error: error.message,
            errorName: error.name,
            chunkCount,
            streamDuration,
            signalAborted: signal.aborted,
            signalReason: signal.reason,
            timestamp: new Date().toISOString(),
          }
        );
        completed = true;
        handler.onError(error.message, messageId);
      });

      response.data.on('end', () => {
        if (completed) {
          return;
        }

        const streamDuration = Date.now() - streamStartTime;

        // Check signal state at stream end
        if (signal.aborted) {
          logger.warn(
            '[ABORT-DEBUG] Signal aborted at stream end',
            correlationId,
            {
              messageId,
              reason: signal.reason,
              streamDuration,
              timestamp: new Date().toISOString(),
            }
          );
        }

        // Mark as completed and send final message
        completed = true;
        handler.onEnd(messageId, {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        });

        logger.info(
          '[ABORT-DEBUG] Azure OpenAI stream end event',
          correlationId,
          {
            messageId,
            contentLength: accumulatedContent.length,
            estimatedTokens: outputTokens,
            chunkCount,
            streamDuration,
            signalAborted: signal.aborted,
            signalReason: signal.reason,
            timestamp: new Date().toISOString(),
          }
        );
      });
    } catch (error) {
      if (completed) {
        return;
      }

      // Log detailed error information with cancellation detection
      if (axios.isAxiosError(error)) {
        const isCanceled =
          error.code === 'ERR_CANCELED' || error.message.includes('canceled');
        const isTimeout =
          error.code === 'ECONNABORTED' || error.message.includes('timeout');

        logger.error(
          '[ABORT-DEBUG] Azure OpenAI streaming failed (axios error)',
          correlationId,
          {
            messageId,
            error: error.message,
            errorCode: error.code,
            errorName: error.name,
            isCanceled,
            isTimeout,
            status: error.response?.status,
            statusText: error.response?.statusText,
            responseData: error.response?.data,
            requestUrl: error.config?.url,
            requestMethod: error.config?.method,
            signalAborted: signal.aborted,
            signalReason: signal.reason,
            timestamp: new Date().toISOString(),
            // Additional abort debugging
            wasSignalAbortedBeforeError: signal.aborted,
            abortReasonAtError: signal.reason,
            errorStack: error.stack,
          }
        );

        // If canceled, check if it was due to our AbortController
        if (isCanceled) {
          logger.warn(
            '[ABORT-DEBUG] Request was canceled - analyzing cause',
            correlationId,
            {
              messageId,
              signalAborted: signal.aborted,
              signalReason: signal.reason,
              errorMessage: error.message,
              wasAbortControllerTriggered: signal.aborted,
              timestamp: new Date().toISOString(),
            }
          );
        }
      } else if (error instanceof Error) {
        logger.error(
          '[ABORT-DEBUG] Azure OpenAI streaming failed (error)',
          correlationId,
          {
            messageId,
            error: error.message,
            errorName: error.name,
            errorStack: error.stack,
            signalAborted: signal.aborted,
            signalReason: signal.reason,
            timestamp: new Date().toISOString(),
          }
        );
      } else {
        logger.error(
          '[ABORT-DEBUG] Azure OpenAI streaming failed (unknown)',
          correlationId,
          {
            messageId,
            error: String(error),
            signalAborted: signal.aborted,
            signalReason: signal.reason,
            timestamp: new Date().toISOString(),
          }
        );
      }

      completed = true;

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
    let completed = false;

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

      if (!signal.aborted && !completed) {
        completed = true;
        handler.onEnd(messageId, {
          inputTokens: Math.floor(JSON.stringify(request).length / 4),
          outputTokens: Math.floor(simulatedResponse.length / 4),
          totalTokens: Math.floor(
            (JSON.stringify(request).length + simulatedResponse.length) / 4
          ),
        });
      }
    } catch (error) {
      if (completed) {
        return;
      }

      logger.error('AWS Bedrock streaming failed', correlationId, {
        messageId,
        error: error instanceof Error ? error.message : String(error),
      });

      completed = true;
      handler.onError('AWS Bedrock streaming failed', messageId);
    } finally {
      // Ensure completion is always handled
      if (!completed && !signal.aborted) {
        completed = true;
        handler.onEnd(messageId, {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        });
      }
    }
  }

  /**
   * Transforms universal request to Azure OpenAI Responses API format
   */
  private transformToAzureOpenAIRequest(
    request: UniversalRequest,
    routingResult: any
  ): any {
    // Responses API uses 'input' instead of 'messages'
    // and 'max_output_tokens' instead of 'max_tokens' or 'max_completion_tokens'

    let inputMessages: any[] = [];

    if ('messages' in request) {
      // Claude format - transform to Responses API
      inputMessages = request.messages.map((msg) => ({
        role: msg.role,
        content:
          typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content),
      }));
    }

    // Calculate max_output_tokens (minimum 16)
    let maxOutputTokens = 4000;
    if ('max_tokens' in request && request.max_tokens) {
      maxOutputTokens = Math.max(16, request.max_tokens);
    } else if (
      'max_completion_tokens' in request &&
      request.max_completion_tokens
    ) {
      maxOutputTokens = Math.max(16, request.max_completion_tokens);
    } else if (routingResult.transformationParams.maxTokens) {
      maxOutputTokens = Math.max(
        16,
        routingResult.transformationParams.maxTokens
      );
    }

    const responsesRequest: any = {
      model: routingResult.decision.backendModel,
      input: inputMessages,
      max_output_tokens: maxOutputTokens,
      stream: true,
    };

    // Add optional parameters only if supported by the model
    // Note: Some models (like gpt-5) don't support temperature
    // We'll let the API handle parameter validation
    if ('temperature' in request && request.temperature !== undefined) {
      responsesRequest.temperature = request.temperature;
    } else if (routingResult.transformationParams.temperature !== undefined) {
      responsesRequest.temperature =
        routingResult.transformationParams.temperature;
    }

    if ('top_p' in request && request.top_p !== undefined) {
      responsesRequest.top_p = request.top_p;
    } else if (routingResult.transformationParams.topP !== undefined) {
      responsesRequest.top_p = routingResult.transformationParams.topP;
    }

    // Add tools if present and supported
    if ('tools' in request && request.tools && request.tools.length > 0) {
      responsesRequest.tools = request.tools;
      if ('tool_choice' in request && request.tool_choice) {
        responsesRequest.tool_choice = request.tool_choice;
      }
    }

    return responsesRequest;
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
