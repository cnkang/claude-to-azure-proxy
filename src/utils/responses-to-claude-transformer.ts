import type {
  ResponsesResponse,
  ResponsesStreamChunk,
  ResponseOutput,
  ClaudeResponse,
  ClaudeStreamChunk,
  ClaudeError,
  ClaudeContentBlock,
  ResponsesAPIError,
} from '../types/index.js';
import { logger } from '../middleware/logging.js';

/**
 * Transforms Azure OpenAI Responses API responses to Claude format
 * 
 * This transformer handles:
 * - Text content extraction from Responses API output array
 * - Reasoning content filtering (excluded from final response)
 * - Usage statistics mapping to Claude format
 * - Error response transformation
 * - Tool call and tool result handling
 * 
 * Requirements: 1.4, 4.1, 4.4, 9.1, 9.2, 9.3
 */
export class ResponsesToClaudeTransformer {
  private readonly correlationId: string;

  constructor(correlationId: string) {
    this.correlationId = correlationId;
  }

  /**
   * Transform Responses API response to Claude format
   * 
   * @param responsesResponse - The Responses API response
   * @returns Claude-formatted response
   */
  public transformResponse(responsesResponse: ResponsesResponse): ClaudeResponse {
    logger.debug('Transforming Responses API response to Claude format', this.correlationId, {
      responseId: responsesResponse.id,
      outputCount: responsesResponse.output.length,
    });

    // Extract text content from output array, excluding reasoning
    const contentBlocks = this.extractContentBlocks(responsesResponse.output);
    
    // Map usage statistics to Claude format
    const usage = this.mapUsageStatistics(responsesResponse.usage);

    // Determine stop reason from output
    const stopReason = this.determineStopReason(responsesResponse.output);

    const claudeResponse: ClaudeResponse = {
      id: responsesResponse.id,
      type: 'message',
      role: 'assistant',
      content: contentBlocks,
      model: 'claude-3-5-sonnet-20241022', // Map to Claude model name
      stop_reason: stopReason,
      usage,
    };

    logger.debug('Successfully transformed response to Claude format', this.correlationId, {
      responseId: claudeResponse.id,
      contentBlockCount: contentBlocks.length,
      stopReason: claudeResponse.stop_reason,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
    });

    return claudeResponse;
  }

  /**
   * Transform Responses API stream chunk to Claude format
   * 
   * @param streamChunk - The Responses API stream chunk
   * @returns Claude-formatted stream chunk
   */
  public transformStreamChunk(streamChunk: ResponsesStreamChunk): ClaudeStreamChunk {
    logger.debug('Transforming Responses API stream chunk to Claude format', this.correlationId, {
      chunkId: streamChunk.id,
      outputCount: streamChunk.output.length,
    });

    // Check if this is the final chunk
    const isComplete = this.isStreamComplete(streamChunk.output);
    
    if (isComplete) {
      const claudeStreamChunk: ClaudeStreamChunk = {
        type: 'message_stop',
        usage: streamChunk.usage ? this.mapUsageStatistics(streamChunk.usage) : undefined,
      };

      logger.debug('Stream completed', this.correlationId, {
        chunkId: streamChunk.id,
        finalUsage: claudeStreamChunk.usage,
      });

      return claudeStreamChunk;
    }

    // Extract text content from current chunk, excluding reasoning
    const textContent = this.extractTextFromOutput(streamChunk.output);

    if (textContent) {
      const claudeStreamChunk: ClaudeStreamChunk = {
        type: 'content_block_delta',
        delta: {
          type: 'text_delta',
          text: textContent,
        },
      };

      logger.debug('Stream chunk transformed', this.correlationId, {
        chunkId: streamChunk.id,
        textLength: textContent.length,
      });

      return claudeStreamChunk;
    }

    // Return empty delta for chunks without text content
    return {
      type: 'content_block_delta',
      delta: {
        type: 'text_delta',
        text: '',
      },
    };
  }

  /**
   * Transform Responses API error to Claude format
   * 
   * @param error - The Responses API error
   * @returns Claude-formatted error
   */
  public transformError(error: ResponsesAPIError): ClaudeError {
    logger.debug('Transforming Responses API error to Claude format', this.correlationId, {
      errorType: error.type,
      errorCode: error.code,
    });

    const claudeErrorType = this.mapErrorType(error.type);
    const sanitizedMessage = this.sanitizeErrorMessage(error.message);

    const claudeError: ClaudeError = {
      type: 'error',
      error: {
        type: claudeErrorType,
        message: sanitizedMessage,
      },
    };

    logger.debug('Error transformed to Claude format', this.correlationId, {
      originalType: error.type,
      claudeType: claudeErrorType,
      messageLength: sanitizedMessage.length,
    });

    return claudeError;
  }

  /**
   * Extract content blocks from Responses API output array
   * Filters out reasoning content and processes text, tool calls, and tool results
   */
  private extractContentBlocks(output: readonly ResponseOutput[]): readonly ClaudeContentBlock[] {
    const contentBlocks: ClaudeContentBlock[] = [];

    for (const outputItem of output) {
      // Skip reasoning content - it should not be included in final response
      if (outputItem.type === 'reasoning') {
        logger.debug('Skipping reasoning content from output', this.correlationId, {
          reasoningStatus: outputItem.reasoning?.status,
          reasoningLength: outputItem.reasoning?.content.length ?? 0,
        });
        continue;
      }

      // Process text content
      if (outputItem.type === 'text' && outputItem.text !== undefined) {
        contentBlocks.push({
          type: 'text',
          text: outputItem.text,
        });
      }

      // Process tool calls
      if (outputItem.type === 'tool_call' && outputItem.tool_call) {
        const toolCall = outputItem.tool_call;
        contentBlocks.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input: this.parseToolArguments(toolCall.function.arguments),
        });
      }

      // Process tool results
      if (outputItem.type === 'tool_result' && outputItem.tool_result) {
        const toolResult = outputItem.tool_result;
        contentBlocks.push({
          type: 'tool_result',
          tool_use_id: toolResult.tool_call_id,
          content: toolResult.content,
          is_error: toolResult.is_error ?? false,
        });
      }
    }

    // Ensure we have at least one content block
    if (contentBlocks.length === 0) {
      logger.warn('No content blocks extracted from output, adding empty text block', this.correlationId);
      contentBlocks.push({
        type: 'text',
        text: '',
      });
    }

    return contentBlocks;
  }

  /**
   * Extract text content from output array for streaming
   */
  private extractTextFromOutput(output: readonly ResponseOutput[]): string {
    for (const outputItem of output) {
      // Skip reasoning content in streaming
      if (outputItem.type === 'reasoning') {
        continue;
      }

      // Return first text content found
      if (outputItem.type === 'text' && outputItem.text !== undefined) {
        return outputItem.text;
      }
    }

    return '';
  }

  /**
   * Map Responses API usage statistics to Claude format
   */
  private mapUsageStatistics(usage: {
    readonly prompt_tokens: number;
    readonly completion_tokens: number;
    readonly total_tokens: number;
    readonly reasoning_tokens?: number;
  }): { readonly input_tokens: number; readonly output_tokens: number } {
    return {
      input_tokens: usage.prompt_tokens,
      output_tokens: usage.completion_tokens,
    };
  }

  /**
   * Determine stop reason from Responses API output
   */
  private determineStopReason(
    output: readonly ResponseOutput[]
  ): 'end_turn' | 'max_tokens' | 'tool_use' | null {
    // Check if there are any tool calls
    const hasToolCalls = output.some(item => item.type === 'tool_call');
    if (hasToolCalls) {
      return 'tool_use';
    }

    // For now, default to end_turn for completed responses
    // In a real implementation, we would need additional metadata from the API
    // to determine if the response was truncated due to max_tokens
    return 'end_turn';
  }

  /**
   * Check if stream is complete based on output
   */
  private isStreamComplete(output: readonly ResponseOutput[]): boolean {
    // Stream is complete when we have reasoning with completed status
    const reasoningOutput = output.find(item => item.type === 'reasoning');
    
    if (reasoningOutput?.reasoning?.status === 'completed') {
      return true;
    }

    // Stream is NOT complete if we have ongoing reasoning
    const hasOngoingReasoning = output.some(
      item => item.type === 'reasoning' && item.reasoning?.status === 'in_progress'
    );

    if (hasOngoingReasoning) {
      return false;
    }

    // For simple text chunks without reasoning, they are not completion signals
    // Only reasoning completion or explicit completion signals should end the stream
    return false;
  }

  /**
   * Map Responses API error type to Claude error type
   */
  private mapErrorType(
    errorType: 'invalid_request' | 'authentication' | 'rate_limit' | 'server_error'
  ): 'invalid_request_error' | 'authentication_error' | 'rate_limit_error' | 'api_error' {
    switch (errorType) {
      case 'invalid_request':
        return 'invalid_request_error';
      case 'authentication':
        return 'authentication_error';
      case 'rate_limit':
        return 'rate_limit_error';
      case 'server_error':
      default:
        return 'api_error';
    }
  }

  /**
   * Sanitize error message to remove sensitive information
   */
  private sanitizeErrorMessage(message: string): string {
    // Remove potential API keys, tokens, and other sensitive data
    return message
      .replace(/sk-[A-Za-z0-9\-._~+/]+=*/gi, 'api_key=[REDACTED]')
      .replace(/api[_-]?key[:\s=]+[A-Za-z0-9\-._~+/]+=*/gi, 'api_key=[REDACTED]')
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
      .replace(/token[:\s=]+[A-Za-z0-9\-._~+/]+=*/gi, 'token=[REDACTED]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]');
  }

  /**
   * Parse tool arguments from JSON string
   */
  private parseToolArguments(argumentsJson: string): Record<string, unknown> {
    try {
      return JSON.parse(argumentsJson) as Record<string, unknown>;
    } catch (error) {
      logger.warn('Failed to parse tool arguments, returning empty object', this.correlationId, {
        argumentsJson,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {};
    }
  }
}

/**
 * Factory function to create transformer instance
 */
export function createResponsesToClaudeTransformer(
  correlationId: string
): ResponsesToClaudeTransformer {
  return new ResponsesToClaudeTransformer(correlationId);
}

/**
 * Convenience function to transform a Responses API response to Claude format
 */
export function transformResponsesToClaude(
  responsesResponse: ResponsesResponse,
  correlationId: string
): ClaudeResponse {
  const transformer = createResponsesToClaudeTransformer(correlationId);
  return transformer.transformResponse(responsesResponse);
}

/**
 * Convenience function to transform a Responses API stream chunk to Claude format
 */
export function transformResponsesStreamToClaude(
  streamChunk: ResponsesStreamChunk,
  correlationId: string
): ClaudeStreamChunk {
  const transformer = createResponsesToClaudeTransformer(correlationId);
  return transformer.transformStreamChunk(streamChunk);
}

/**
 * Convenience function to transform a Responses API error to Claude format
 */
export function transformResponsesErrorToClaude(
  error: ResponsesAPIError,
  correlationId: string
): ClaudeError {
  const transformer = createResponsesToClaudeTransformer(correlationId);
  return transformer.transformError(error);
}