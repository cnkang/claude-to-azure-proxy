import type {
  ResponsesStreamChunk,
  ClaudeStreamChunk,
  OpenAIStreamChunk,
  ResponseFormat,
  ResponsesAPIError,
} from '../types/index.js';
import { logger } from '../middleware/logging.js';
import { 
  createResponsesToClaudeTransformer,
} from './responses-to-claude-transformer.js';
import { 
  createResponsesToOpenAITransformer,
} from './responses-to-openai-transformer.js';
import { ValidationError } from '../errors/index.js';

/**
 * Handles streaming responses from Azure OpenAI Responses API
 * 
 * This handler provides:
 * - Streaming support for both Claude and OpenAI formats
 * - Proper event flow and formatting for each client type
 * - Stream error handling and recovery
 * - Chunk transformation and validation
 * 
 * Requirements: 1.4, 4.4, 7.3
 */
export class ResponsesStreamingHandler {
  private readonly correlationId: string;
  private readonly responseFormat: ResponseFormat;
  private readonly claudeTransformer;
  private readonly openAITransformer;

  constructor(correlationId: string, responseFormat: ResponseFormat) {
    this.correlationId = correlationId;
    this.responseFormat = responseFormat;
    this.claudeTransformer = createResponsesToClaudeTransformer(correlationId);
    this.openAITransformer = createResponsesToOpenAITransformer(correlationId);
  }

  /**
   * Process a stream chunk and transform it to the appropriate format
   * 
   * @param chunk - The Responses API stream chunk
   * @returns Transformed stream chunk in the requested format
   */
  public processStreamChunk(
    chunk: ResponsesStreamChunk
  ): ClaudeStreamChunk | OpenAIStreamChunk | readonly ClaudeStreamChunk[] | readonly OpenAIStreamChunk[] {
    logger.debug('Processing stream chunk', this.correlationId, {
      chunkId: chunk.id,
      responseFormat: this.responseFormat,
      outputCount: chunk.output.length,
    });

    try {
      if (this.responseFormat === 'claude') {
        const transformedChunk = this.claudeTransformer.transformStreamChunk(chunk);
        
        logger.debug('Stream chunk transformed to Claude format', this.correlationId, {
          chunkId: chunk.id,
          chunkType: transformedChunk.type,
        });

        return transformedChunk;
      } else {
        const transformedChunk = this.openAITransformer.transformStreamChunk(chunk);
        
        logger.debug('Stream chunk transformed to OpenAI format', this.correlationId, {
          chunkId: chunk.id,
          object: transformedChunk.object,
          choicesCount: transformedChunk.choices.length,
        });

        return transformedChunk;
      }
    } catch (error) {
      logger.error('Failed to transform stream chunk', this.correlationId, {
        chunkId: chunk.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Return error chunk in appropriate format
      return this.createErrorChunk(error);
    }
  }

  /**
   * Handle stream errors and create appropriate error responses
   * 
   * @param error - The error that occurred during streaming
   * @returns Error response in the requested format
   */
  public handleStreamError(error: Readonly<ResponsesAPIError | Error>):
    | readonly ClaudeStreamChunk[]
    | readonly OpenAIStreamChunk[] {
    const { errorType, errorMessage } = this.extractStreamErrorDetails(error);

    logger.error('Handling stream error', this.correlationId, {
      errorType,
      errorMessage,
      responseFormat: this.responseFormat,
    });

    if (this.responseFormat === 'claude') {
      // For Claude format, return proper error chunk and stop
      const errorChunk: ClaudeStreamChunk = {
        type: 'error',
        error: {
          type: 'api_error',
          message: errorMessage,
        },
      };

      const stopChunk: ClaudeStreamChunk = {
        type: 'message_stop',
      };

      return [errorChunk, stopChunk];
    } else {
      // For OpenAI format, return a completion chunk with error finish reason
      const errorChunk: OpenAIStreamChunk = {
        id: `error-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            delta: {
              content: `Error: ${errorMessage}`,
            },
            finish_reason: 'stop',
          },
        ],
      };

      const stopChunk: OpenAIStreamChunk = {
        id: `stop-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
          },
        ],
      };

      return [errorChunk, stopChunk];
    }
  }

  /**
   * Create stream start event for the appropriate format
   * 
   * @param responseId - The response ID from the Responses API
   * @param model - The model name
   * @returns Stream start chunk in the requested format
   */
  public createStreamStart(responseId: string, model: string): ClaudeStreamChunk | OpenAIStreamChunk {
    logger.debug('Creating stream start event', this.correlationId, {
      responseId,
      model,
      responseFormat: this.responseFormat,
    });

    if (this.responseFormat === 'claude') {
      return {
        type: 'message_start',
        message: {
          id: responseId,
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: null,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
          },
        },
      };
    } else {
      return {
        id: responseId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
            },
            finish_reason: null,
          },
        ],
      };
    }
  }

  /**
   * Create content block start event for Claude format
   * 
   * @param index - The content block index
   * @returns Claude content block start chunk
   */
  public createClaudeContentBlockStart(index: number): ClaudeStreamChunk {
    if (this.responseFormat !== 'claude') {
      throw new ValidationError(
        'Content block start is only supported for Claude format',
        this.correlationId,
        'response_format',
        this.responseFormat,
        true,
        'streaming_format_validation'
      );
    }

    logger.debug('Creating Claude content block start', this.correlationId, {
      index,
    });

    return {
      type: 'content_block_start',
      index,
      content_block: {
        type: 'text',
        text: '',
      },
    };
  }

  /**
   * Create content block stop event for Claude format
   * 
   * @param index - The content block index
   * @returns Claude content block stop chunk
   */
  public createClaudeContentBlockStop(index: number): ClaudeStreamChunk {
    if (this.responseFormat !== 'claude') {
      throw new ValidationError(
        'Content block stop is only supported for Claude format',
        this.correlationId,
        'response_format',
        this.responseFormat,
        true,
        'streaming_format_validation'
      );
    }

    logger.debug('Creating Claude content block stop', this.correlationId, {
      index,
    });

    return {
      type: 'content_block_stop',
      index,
    };
  }

  /**
   * Validate stream chunk structure
   * 
   * @param chunk - The chunk to validate
   * @returns True if the chunk is valid
   */
  public validateStreamChunk(chunk: unknown): chunk is ResponsesStreamChunk {
    if (typeof chunk !== 'object' || chunk === null) {
      logger.warn('Invalid stream chunk: not an object', this.correlationId);
      return false;
    }

    const typedChunk = chunk as Record<string, unknown>;

    // Check required fields
    if (
      typeof typedChunk.id !== 'string' ||
      typedChunk.object !== 'response.chunk' ||
      typeof typedChunk.created !== 'number' ||
      typeof typedChunk.model !== 'string' ||
      !Array.isArray(typedChunk.output)
    ) {
      logger.warn('Invalid stream chunk: missing or invalid required fields', this.correlationId, {
        id: typeof typedChunk.id,
        object: typedChunk.object,
        created: typeof typedChunk.created,
        model: typeof typedChunk.model,
        output: Array.isArray(typedChunk.output),
      });
      return false;
    }

    return true;
  }

  /**
   * Check if a stream chunk indicates completion
   * 
   * @param chunk - The stream chunk to check
   * @returns True if the stream is complete
   */
  public isStreamComplete(chunk: ResponsesStreamChunk): boolean {
    // Check if there's reasoning with completed status
    const reasoningOutput = chunk.output.find(item => item.type === 'reasoning');
    
    if (reasoningOutput?.reasoning?.status === 'completed') {
      logger.debug('Stream completed: reasoning finished', this.correlationId, {
        chunkId: chunk.id,
      });
      return true;
    }

    // Stream is NOT complete if we have ongoing reasoning
    const hasOngoingReasoning = chunk.output.some(
      item => item.type === 'reasoning' && item.reasoning?.status === 'in_progress'
    );

    if (hasOngoingReasoning) {
      logger.debug('Stream not complete: ongoing reasoning', this.correlationId, {
        chunkId: chunk.id,
      });
      return false;
    }

    // For simple text chunks without reasoning, they are not completion signals
    // Only reasoning completion or explicit completion signals should end the stream
    return false;
  }

  /**
   * Extract normalized error details for logging and response creation
   */
  private extractStreamErrorDetails(
    error: Readonly<ResponsesAPIError | Error>
  ): { readonly errorType: string; readonly errorMessage: string } {
    if (this.isResponsesAPIError(error)) {
      return {
        errorType: error.type,
        errorMessage: error.message,
      };
    }

    if (error instanceof Error) {
      return {
        errorType: 'generic',
        errorMessage: error.message,
      };
    }

    return {
      errorType: 'unknown',
      errorMessage: 'Unknown streaming error',
    };
  }

  private isResponsesAPIError(error: unknown): error is ResponsesAPIError {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const candidate = error as { readonly type?: unknown; readonly message?: unknown };

    return typeof candidate.type === 'string' && typeof candidate.message === 'string';
  }

  /**
   * Create an error chunk in the appropriate format
   */
  private createErrorChunk(error: unknown):
    | readonly ClaudeStreamChunk[]
    | readonly OpenAIStreamChunk[] {
    const errorMessage = error instanceof Error ? error.message : 'Unknown streaming error';

    if (this.responseFormat === 'claude') {
      return [
        {
          type: 'error',
          error: {
            type: 'api_error',
            message: errorMessage,
          },
        },
        {
          type: 'message_stop',
        },
      ];
    } else {
      return [
        {
          id: `error-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              delta: {
                content: `Error: ${errorMessage}`,
              },
              finish_reason: null,
            },
          ],
        },
        {
          id: `stop-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop',
            },
          ],
        },
      ];
    }
  }
}

/**
 * Factory function to create streaming handler instance
 */
export function createResponsesStreamingHandler(
  correlationId: string,
  responseFormat: ResponseFormat
): ResponsesStreamingHandler {
  return new ResponsesStreamingHandler(correlationId, responseFormat);
}

/**
 * Stream processor for handling async iterables from Responses API
 */
export class ResponsesStreamProcessor {
  private readonly handler: ResponsesStreamingHandler;
  private readonly correlationId: string;

  constructor(correlationId: string, responseFormat: ResponseFormat) {
    this.correlationId = correlationId;
    this.handler = createResponsesStreamingHandler(correlationId, responseFormat);
  }

  /**
   * Process an async iterable of Responses API stream chunks
   * 
   * @param stream - The async iterable of stream chunks
   * @returns Async generator of transformed chunks
   */
  public async* processStream(
    stream: AsyncIterable<ResponsesStreamChunk>
  ): AsyncGenerator<ClaudeStreamChunk | OpenAIStreamChunk, void, unknown> {
    logger.debug('Starting stream processing', this.correlationId);

    let chunkCount = 0;
    let hasStarted = false;

    try {
      for await (const chunk of stream) {
        chunkCount++;

        // Validate chunk structure
        if (!this.handler.validateStreamChunk(chunk)) {
          logger.warn('Skipping invalid stream chunk', this.correlationId, {
            chunkNumber: chunkCount,
          });
          continue;
        }

        logger.debug('Processing stream chunk', this.correlationId, {
          chunkNumber: chunkCount,
          chunkId: chunk.id,
        });

        // Send stream start event if this is the first chunk
        if (!hasStarted) {
          const startChunk = this.handler.createStreamStart(chunk.id, chunk.model);
          yield startChunk;
          hasStarted = true;

          logger.debug('Sent stream start event', this.correlationId, {
            responseId: chunk.id,
            model: chunk.model,
          });
        }

        // Process and yield the transformed chunk
        const transformedChunk = this.handler.processStreamChunk(chunk);
        if (Array.isArray(transformedChunk)) {
          for (const item of transformedChunk) {
            yield item;
          }
        } else {
          yield transformedChunk as ClaudeStreamChunk | OpenAIStreamChunk;
        }

        // Check if stream is complete
        if (this.handler.isStreamComplete(chunk)) {
          logger.debug('Stream processing completed', this.correlationId, {
            totalChunks: chunkCount,
            finalChunkId: chunk.id,
          });
          break;
        }
      }
    } catch (error) {
      logger.error('Error during stream processing', this.correlationId, {
        error: error instanceof Error ? error.message : 'Unknown error',
        processedChunks: chunkCount,
      });

      // Yield error chunk
      const errorChunks = this.handler.handleStreamError(
        error instanceof Error ? error : new Error('Stream processing failed')
      );
      for (const item of errorChunks) {
        yield item;
      }
    }

    logger.debug('Stream processing finished', this.correlationId, {
      totalChunks: chunkCount,
    });
  }
}

/**
 * Factory function to create stream processor instance
 */
export function createResponsesStreamProcessor(
  correlationId: string,
  responseFormat: ResponseFormat
): ResponsesStreamProcessor {
  return new ResponsesStreamProcessor(correlationId, responseFormat);
}
