/**
 * Fallback mechanisms for Azure OpenAI service failures
 * Provides graceful degradation when the Responses API is unavailable
 */

type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends ReadonlyArray<infer U>
  ? readonly DeepReadonly<U>[]
  : T extends object
  ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
  : T;

import { logger } from '../middleware/logging.js';
import { gracefulDegradationManager } from '../resilience/graceful-degradation.js';
import { AzureErrorMapper, type ErrorMappingContext } from './azure-error-mapper.js';
import type {
  ClaudeRequest,
  ClaudeResponse,
  ClaudeError,
  OpenAIRequest,
  OpenAIResponse,
  OpenAIError,
  ResponseFormat,
  UniversalRequest,
  UniversalResponse,
} from '../types/index.js';

export interface FallbackContext {
  readonly correlationId: string;
  readonly operation: string;
  readonly requestFormat: ResponseFormat;
  readonly originalRequest: UniversalRequest;
  readonly error: Error;
  readonly attempt: number;
}

export interface FallbackResult {
  readonly success: boolean;
  readonly response?: UniversalResponse;
  readonly error?: ClaudeError | OpenAIError;
  readonly fallbackUsed: string;
  readonly degraded: boolean;
}

/**
 * Fallback handler for Azure OpenAI service failures
 */
export class FallbackHandler {
  /**
   * Execute fallback strategy when Azure OpenAI is unavailable
   */
  public static async executeFallback(context: DeepReadonly<FallbackContext>): Promise<FallbackResult> {
    logger.warn('Executing fallback strategy', context.correlationId, {
      operation: context.operation,
      requestFormat: context.requestFormat,
      error: context.error.message,
      attempt: context.attempt,
    });

    // Try graceful degradation first
    try {
      const degradationResult = await gracefulDegradationManager.executeGracefulDegradation({
        correlationId: context.correlationId,
        operation: context.operation,
        error: context.error,
        attempt: context.attempt,
        metadata: {
          requestFormat: context.requestFormat,
          originalRequest: this.sanitizeRequest(context.originalRequest),
        },
      });

      if (degradationResult.success && degradationResult.data !== null && degradationResult.data !== undefined) {
        return {
          success: true,
          response: degradationResult.data as UniversalResponse,
          fallbackUsed: degradationResult.fallbackUsed,
          degraded: degradationResult.degraded,
        };
      }
    } catch (degradationError) {
      logger.warn('Graceful degradation failed', context.correlationId, {
        error: degradationError instanceof Error ? degradationError.message : 'Unknown error',
      });
    }

    // Fall back to static responses
    return this.createStaticFallbackResponse(context);
  }

  /**
   * Create static fallback response based on request format
   */
  private static createStaticFallbackResponse(context: DeepReadonly<FallbackContext>): FallbackResult {
    if (context.requestFormat === 'claude') {
      return this.createClaudeFallbackResponse(context);
    } else {
      return this.createOpenAIFallbackResponse(context);
    }
  }

  /**
   * Create Claude-format fallback response
   */
  private static createClaudeFallbackResponse(context: DeepReadonly<FallbackContext>): FallbackResult {
    const claudeRequest = context.originalRequest as ClaudeRequest;
    
    // Check if this is a service unavailable error
    if (this.isServiceUnavailableError(context.error)) {
      const error: ClaudeError = {
        type: 'error',
        error: {
          type: 'api_error',
          message: 'The service is temporarily overloaded. Please try again in a few moments.',
        },
      };

      return {
        success: false,
        error,
        fallbackUsed: 'service_unavailable_error',
        degraded: true,
      };
    }

    // Create a helpful fallback response
    const fallbackResponse: ClaudeResponse = {
      id: `fallback_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: this.generateFallbackMessage(claudeRequest),
        },
      ],
      model: claudeRequest.model || 'claude-3-5-sonnet-20241022',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: this.estimateInputTokens(claudeRequest),
        output_tokens: 50, // Estimated tokens for fallback message
      },
    };

    logger.info('Created Claude fallback response', context.correlationId, {
      fallbackType: 'static_response',
      model: fallbackResponse.model,
    });

    return {
      success: true,
      response: fallbackResponse,
      fallbackUsed: 'static_claude_response',
      degraded: true,
    };
  }

  /**
   * Create OpenAI-format fallback response
   */
  private static createOpenAIFallbackResponse(context: DeepReadonly<FallbackContext>): FallbackResult {
    const openAIRequest = context.originalRequest as OpenAIRequest;

    // Check if this is a service unavailable error
    if (this.isServiceUnavailableError(context.error)) {
      const error: OpenAIError = {
        error: {
          message: 'The service is temporarily overloaded. Please try again in a few moments.',
          type: 'server_error',
          code: 'service_unavailable',
        },
      };

      return {
        success: false,
        error,
        fallbackUsed: 'service_unavailable_error',
        degraded: true,
      };
    }

    // Create a helpful fallback response
    const fallbackResponse: OpenAIResponse = {
      id: `fallback_${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: openAIRequest.model || 'gpt-4',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: this.generateFallbackMessage(openAIRequest),
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: this.estimateInputTokens(openAIRequest),
        completion_tokens: 50, // Estimated tokens for fallback message
        total_tokens: this.estimateInputTokens(openAIRequest) + 50,
      },
    };

    logger.info('Created OpenAI fallback response', context.correlationId, {
      fallbackType: 'static_response',
      model: fallbackResponse.model,
    });

    return {
      success: true,
      response: fallbackResponse,
      fallbackUsed: 'static_openai_response',
      degraded: true,
    };
  }

  /**
   * Generate appropriate fallback message based on request content
   */
  private static generateFallbackMessage(
    request: DeepReadonly<UniversalRequest>
  ): string {
    const messages = 'messages' in request ? request.messages : [];
    const lastMessage = messages[messages.length - 1];
    
    // Analyze the request to provide contextual fallback
    if (this.isCodeRequest(lastMessage)) {
      return 'I apologize, but I\'m experiencing temporary difficulties processing your coding request. The service should be restored shortly. Please try again in a few moments.';
    }

    if (this.isQuestionRequest(lastMessage)) {
      return 'I\'m currently experiencing technical difficulties and cannot process your question at the moment. Please try again shortly, and I\'ll be happy to help.';
    }

    // Generic fallback message
    return 'I apologize, but I\'m temporarily unable to process your request due to technical difficulties. Please try again in a few moments.';
  }

  /**
   * Check if request is code-related
   */
  private static isCodeRequest(message: unknown): boolean {
    if (message === null || message === undefined || typeof message !== 'object') {
      return false;
    }

    const messageObj = message as { content?: unknown };
    const content = typeof messageObj.content === 'string' 
      ? messageObj.content 
      : Array.isArray(messageObj.content) 
        ? messageObj.content.map(block => 
            typeof block === 'object' && block !== null && 'text' in block 
              ? (block as { text: string }).text 
              : ''
          ).join(' ')
        : '';

    const codeIndicators = [
      'function',
      'class',
      'import',
      'export',
      'const',
      'let',
      'var',
      'def',
      'public',
      'private',
      'async',
      'await',
      '```',
      'code',
      'programming',
      'debug',
      'error',
      'bug',
    ];

    return codeIndicators.some(indicator => 
      content.toLowerCase().includes(indicator)
    );
  }

  /**
   * Check if request is a question
   */
  private static isQuestionRequest(message: unknown): boolean {
    if (message === null || message === undefined || typeof message !== 'object') {
      return false;
    }

    const messageObj = message as { content?: unknown };
    const content = typeof messageObj.content === 'string' 
      ? messageObj.content 
      : Array.isArray(messageObj.content) 
        ? messageObj.content.map(block => 
            typeof block === 'object' && block !== null && 'text' in block 
              ? (block as { text: string }).text 
              : ''
          ).join(' ')
        : '';

    const questionIndicators = [
      '?',
      'what',
      'how',
      'why',
      'when',
      'where',
      'who',
      'which',
      'can you',
      'could you',
      'would you',
      'explain',
      'tell me',
    ];

    return questionIndicators.some(indicator => 
      content.toLowerCase().includes(indicator)
    );
  }

  /**
   * Estimate input tokens for fallback usage calculation
   */
  private static estimateInputTokens(request: DeepReadonly<UniversalRequest>): number {
    const messages = 'messages' in request ? request.messages : [];
    let totalLength = 0;

    for (const message of messages) {
      if (typeof message.content === 'string') {
        totalLength += message.content.length;
      } else if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (typeof block === 'object' && block !== null && 'text' in block) {
            totalLength += (block as { text: string }).text.length;
          }
        }
      }
    }

    // Rough estimation: 4 characters per token
    return Math.ceil(totalLength / 4);
  }

  /**
   * Check if error indicates service unavailability
   */
  private static isServiceUnavailableError(error: DeepReadonly<Error>): boolean {
    const unavailableIndicators = [
      'service unavailable',
      'overloaded',
      'rate limit',
      'too many requests',
      'temporarily unavailable',
      'circuit breaker',
      'timeout',
    ];

    const errorMessage = error.message.toLowerCase();
    const errorName = error.name.toLowerCase();

    return unavailableIndicators.some(
      indicator => errorMessage.includes(indicator) || errorName.includes(indicator)
    );
  }

  /**
   * Sanitize request for logging (remove sensitive data)
   */
  private static sanitizeRequest(request: DeepReadonly<UniversalRequest>): Record<string, unknown> {
    return {
      model: 'model' in request ? request.model : 'unknown',
      messageCount: 'messages' in request ? request.messages.length : 0,
      hasTools: 'tools' in request && request.tools ? request.tools.length > 0 : false,
      stream: 'stream' in request ? request.stream : false,
      maxTokens: 'max_tokens' in request ? request.max_tokens : undefined,
    };
  }

  /**
   * Check if fallback should be used based on error type
   */
  public static shouldUseFallback(error: DeepReadonly<Error>): boolean {
    const fallbackTriggers = [
      'NETWORK_ERROR',
      'TIMEOUT_ERROR',
      'SERVICE_UNAVAILABLE_ERROR',
      'CIRCUIT_BREAKER_ERROR',
      'overloaded_error',
      'api_error',
      'server_error',
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
    ];

    const errorMessage = error.message;
    const errorName = error.name;

    return fallbackTriggers.some(
      trigger => errorMessage.includes(trigger) || errorName.includes(trigger)
    );
  }

  /**
   * Create error response when fallback also fails
   */
  public static createFallbackError(
    context: DeepReadonly<FallbackContext>
  ): ClaudeError | OpenAIError {
    const mappingContext: ErrorMappingContext = {
      correlationId: context.correlationId,
      operation: context.operation,
      requestFormat: context.requestFormat,
      originalError: context.error,
    };

    const mappedError = AzureErrorMapper.mapError(mappingContext);
    return mappedError.clientResponse;
  }
}