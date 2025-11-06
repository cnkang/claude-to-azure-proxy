import type {
  ResponsesResponse,
  ResponsesStreamChunk,
  ResponseOutput,
  OpenAIResponse,
  OpenAIStreamChunk,
  OpenAIError,
  OpenAIMessage,
  OpenAIChoice,
  OpenAIToolCall,
  ResponsesAPIError,
} from '../types/index';
import { logger } from '../middleware/logging';

/**
 * Transforms Azure OpenAI Responses API responses to OpenAI format
 *
 * This transformer handles:
 * - Response structure mapping to OpenAI choices array
 * - Usage statistics mapping to OpenAI format
 * - Tool call transformation
 * - Error response transformation
 * - Streaming response handling
 *
 * Requirements: 1.4, 10.5, 10.6
 */
export class ResponsesToOpenAITransformer {
  private readonly correlationId: string;

  constructor(correlationId: string) {
    this.correlationId = correlationId;
  }

  /**
   * Transform Responses API response to OpenAI format
   *
   * @param responsesResponse - The Responses API response
   * @returns OpenAI-formatted response
   */
  public transformResponse(
    responsesResponse: ResponsesResponse
  ): OpenAIResponse {
    logger.debug(
      'Transforming Responses API response to OpenAI format',
      this.correlationId,
      {
        responseId: responsesResponse.id,
        outputCount: responsesResponse.output.length,
      }
    );

    // Create OpenAI message from output
    const message = this.createOpenAIMessage(responsesResponse.output);

    // Determine finish reason
    const finishReason = this.determineFinishReason(responsesResponse.output);

    // Create choices array (OpenAI format always has choices)
    const choices: readonly OpenAIChoice[] = [
      {
        index: 0,
        message,
        finish_reason: finishReason,
      },
    ];

    const openAIResponse: OpenAIResponse = {
      id: responsesResponse.id,
      object: 'chat.completion',
      created: responsesResponse.created,
      model: responsesResponse.model,
      choices,
      usage: {
        prompt_tokens: responsesResponse.usage.prompt_tokens,
        completion_tokens: responsesResponse.usage.completion_tokens,
        total_tokens: responsesResponse.usage.total_tokens,
      },
    };

    logger.debug(
      'Successfully transformed response to OpenAI format',
      this.correlationId,
      {
        responseId: openAIResponse.id,
        choicesCount: choices.length,
        finishReason,
        promptTokens: openAIResponse.usage?.prompt_tokens,
        completionTokens: openAIResponse.usage?.completion_tokens,
      }
    );

    return openAIResponse;
  }

  /**
   * Transform Responses API stream chunk to OpenAI format
   *
   * @param streamChunk - The Responses API stream chunk
   * @returns OpenAI-formatted stream chunk
   */
  public transformStreamChunk(
    streamChunk: ResponsesStreamChunk
  ): OpenAIStreamChunk {
    logger.debug(
      'Transforming Responses API stream chunk to OpenAI format',
      this.correlationId,
      {
        chunkId: streamChunk.id,
        outputCount: streamChunk.output.length,
      }
    );

    // Check if this is the final chunk
    const isComplete = this.isStreamComplete(streamChunk.output);

    if (isComplete) {
      const choices: readonly OpenAIChoice[] = [
        {
          index: 0,
          delta: {},
          finish_reason: this.determineFinishReason(streamChunk.output),
        },
      ];

      const openAIStreamChunk: OpenAIStreamChunk = {
        id: streamChunk.id,
        object: 'chat.completion.chunk',
        created: streamChunk.created,
        model: streamChunk.model,
        choices,
      };

      logger.debug('Stream completed', this.correlationId, {
        chunkId: streamChunk.id,
        finishReason: choices[0]?.finish_reason ?? 'unknown',
      });

      return openAIStreamChunk;
    }

    // Extract text content from current chunk, excluding reasoning
    const textContent = this.extractTextFromOutput(streamChunk.output);
    const toolCalls = this.extractToolCallsFromOutput(streamChunk.output);

    // Create delta object
    let delta: Partial<OpenAIMessage>;

    if (textContent) {
      delta = { content: textContent };
    } else if (toolCalls.length > 0) {
      delta = { tool_calls: toolCalls };
    } else {
      // If no content, set role for first chunk
      delta = { role: 'assistant' };
    }

    const choices: readonly OpenAIChoice[] = [
      {
        index: 0,
        delta,
        finish_reason: null,
      },
    ];

    const openAIStreamChunk: OpenAIStreamChunk = {
      id: streamChunk.id,
      object: 'chat.completion.chunk',
      created: streamChunk.created,
      model: streamChunk.model,
      choices,
    };

    logger.debug('Stream chunk transformed', this.correlationId, {
      chunkId: streamChunk.id,
      hasContent: !!textContent,
      toolCallsCount: toolCalls.length,
    });

    return openAIStreamChunk;
  }

  /**
   * Transform Responses API error to OpenAI format
   *
   * @param error - The Responses API error
   * @returns OpenAI-formatted error
   */
  public transformError(error: ResponsesAPIError): OpenAIError {
    logger.debug(
      'Transforming Responses API error to OpenAI format',
      this.correlationId,
      {
        errorType: error.type,
        errorCode: error.code,
      }
    );

    const openAIErrorType = this.mapErrorType(error.type);
    const sanitizedMessage = this.sanitizeErrorMessage(error.message);

    const openAIError: OpenAIError = {
      error: {
        message: sanitizedMessage,
        type: openAIErrorType,
        code: error.code,
        param: error.param,
      },
    };

    logger.debug('Error transformed to OpenAI format', this.correlationId, {
      originalType: error.type,
      openAIType: openAIErrorType,
      messageLength: sanitizedMessage.length,
    });

    return openAIError;
  }

  /**
   * Create OpenAI message from Responses API output array
   */
  private createOpenAIMessage(
    output: readonly ResponseOutput[]
  ): OpenAIMessage {
    let content = '';
    const toolCalls: OpenAIToolCall[] = [];

    for (const outputItem of output) {
      // Skip reasoning content - it should not be included in final response
      if (outputItem.type === 'reasoning') {
        logger.debug(
          'Skipping reasoning content from output',
          this.correlationId,
          {
            reasoningStatus: outputItem.reasoning?.status,
            reasoningLength: outputItem.reasoning?.content.length ?? 0,
          }
        );
        continue;
      }

      // Collect text content
      if (outputItem.type === 'text' && outputItem.text !== undefined) {
        content += outputItem.text;
      }

      // Collect tool calls
      if (outputItem.type === 'tool_call' && outputItem.tool_call) {
        const toolCall = outputItem.tool_call;
        toolCalls.push({
          id: toolCall.id,
          type: 'function',
          function: {
            name: toolCall.function.name,
            arguments: toolCall.function.arguments,
          },
        });
      }
    }

    // Create message with tool calls if present
    if (toolCalls.length > 0) {
      const message: OpenAIMessage = {
        role: 'assistant',
        content: content || null,
        tool_calls: toolCalls,
      };
      return message;
    }

    // Create message without tool calls
    const message: OpenAIMessage = {
      role: 'assistant',
      content: content || null,
    };

    return message;
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
   * Extract tool calls from output array for streaming
   */
  private extractToolCallsFromOutput(
    output: readonly ResponseOutput[]
  ): readonly OpenAIToolCall[] {
    const toolCalls: OpenAIToolCall[] = [];

    for (const outputItem of output) {
      if (outputItem.type === 'tool_call' && outputItem.tool_call) {
        const toolCall = outputItem.tool_call;
        toolCalls.push({
          id: toolCall.id,
          type: 'function',
          function: {
            name: toolCall.function.name,
            arguments: toolCall.function.arguments,
          },
        });
      }
    }

    return toolCalls;
  }

  /**
   * Determine OpenAI finish reason from Responses API output
   */
  private determineFinishReason(
    output: readonly ResponseOutput[]
  ): 'stop' | 'length' | 'content_filter' | 'tool_calls' | null {
    // Check if there are any tool calls
    const hasToolCalls = output.some((item) => item.type === 'tool_call');
    if (hasToolCalls) {
      return 'tool_calls';
    }

    // For now, default to stop for completed responses
    // In a real implementation, we would need additional metadata from the API
    // to determine if the response was truncated due to max_tokens or content_filter
    return 'stop';
  }

  /**
   * Check if stream is complete based on output
   */
  private isStreamComplete(output: readonly ResponseOutput[]): boolean {
    // Stream is complete when we have reasoning with completed status
    const reasoningOutput = output.find((item) => item.type === 'reasoning');

    if (reasoningOutput?.reasoning?.status === 'completed') {
      return true;
    }

    // Stream is NOT complete if we have ongoing reasoning
    const hasOngoingReasoning = output.some(
      (item) =>
        item.type === 'reasoning' && item.reasoning?.status === 'in_progress'
    );

    if (hasOngoingReasoning) {
      return false;
    }

    // For simple text chunks without reasoning, they are not completion signals
    // Only reasoning completion or explicit completion signals should end the stream
    return false;
  }

  /**
   * Map Responses API error type to OpenAI error type
   */
  private mapErrorType(
    errorType:
      | 'invalid_request'
      | 'authentication'
      | 'rate_limit'
      | 'server_error'
  ): string {
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
      .replace(
        /api[_-]?key[:\s=]+[A-Za-z0-9\-._~+/]+=*/gi,
        'api_key=[REDACTED]'
      )
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
      .replace(/token[:\s=]+[A-Za-z0-9\-._~+/]+=*/gi, 'token=[REDACTED]')
      .replace(
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        '[EMAIL_REDACTED]'
      );
  }
}

/**
 * Factory function to create transformer instance
 */
export function createResponsesToOpenAITransformer(
  correlationId: string
): ResponsesToOpenAITransformer {
  return new ResponsesToOpenAITransformer(correlationId);
}

/**
 * Convenience function to transform a Responses API response to OpenAI format
 */
export function transformResponsesToOpenAI(
  responsesResponse: ResponsesResponse,
  correlationId: string
): OpenAIResponse {
  const transformer = createResponsesToOpenAITransformer(correlationId);
  return transformer.transformResponse(responsesResponse);
}

/**
 * Convenience function to transform a Responses API stream chunk to OpenAI format
 */
export function transformResponsesStreamToOpenAI(
  streamChunk: ResponsesStreamChunk,
  correlationId: string
): OpenAIStreamChunk {
  const transformer = createResponsesToOpenAITransformer(correlationId);
  return transformer.transformStreamChunk(streamChunk);
}

/**
 * Convenience function to transform a Responses API error to OpenAI format
 */
export function transformResponsesErrorToOpenAI(
  error: ResponsesAPIError,
  correlationId: string
): OpenAIError {
  const transformer = createResponsesToOpenAITransformer(correlationId);
  return transformer.transformError(error);
}
