/**
 * Request format detection service for identifying Claude vs OpenAI request formats
 * Provides accurate format identification and response format determination
 */

import type {
  IncomingRequest,
  RequestFormat,
  ResponseFormat,
} from '../types/index.js';
import { logger } from '../middleware/logging.js';

/**
 * Interface for format detection service
 */
export interface FormatDetector {
  /**
   * Detect the format of an incoming request
   * @param request - The incoming request to analyze
   * @returns The detected request format
   */
  detectRequestFormat(request: Readonly<IncomingRequest>): RequestFormat;

  /**
   * Determine the appropriate response format based on request format
   * @param requestFormat - The detected request format
   * @returns The matching response format
   */
  getResponseFormat(requestFormat: Readonly<RequestFormat>): ResponseFormat;
}

/**
 * Format detection service implementation
 * Analyzes request structure to determine if it's Claude or OpenAI format
 */
export class FormatDetectionService implements FormatDetector {
  /**
   * Detect request format based on request structure and content
   * @param request - The incoming request to analyze
   * @returns The detected request format (defaults to Claude for backward compatibility)
   */
  public detectRequestFormat(
    request: Readonly<IncomingRequest>
  ): RequestFormat {
    try {
      // Validate request structure
      if (!this.isValidRequest(request)) {
        // Default to Claude format for backward compatibility
        return 'claude';
      }

      // Check for Claude format indicators first (more specific)
      if (this.isClaudeFormat(request.body as Readonly<unknown>)) {
        return 'claude';
      }

      // Check for OpenAI format indicators
      if (this.isOpenAIFormat(request.body as Readonly<unknown>)) {
        return 'openai';
      }

      // Default to Claude format for unknown or malformed requests
      return 'claude';
    } catch (error) {
      // Log error but don't throw - default to Claude format for robustness
      logger.warn(
        'Format detection error, defaulting to Claude format',
        'format-detection',
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        }
      );
      return 'claude';
    }
  }

  /**
   * Get response format that matches the request format
   * @param requestFormat - The detected request format
   * @returns The matching response format
   */
  public getResponseFormat(
    requestFormat: Readonly<RequestFormat>
  ): ResponseFormat {
    // Response format always matches request format
    return requestFormat;
  }

  /**
   * Validate basic request structure
   * @param request - The request to validate
   * @returns True if request has valid structure
   */
  private isValidRequest(request: Readonly<IncomingRequest>): boolean {
    return request.body !== null && typeof request.body === 'object';
  }

  /**
   * Check if request body matches Claude API format
   * @param body - The request body to analyze
   * @returns True if body matches Claude format
   */
  private isClaudeFormat(body: Readonly<unknown>): boolean {
    if (!this.isRecord(body)) {
      return false;
    }

    // Check for Claude-specific format indicators
    const claudeIndicators = [
      // Claude-specific headers or version indicators
      'anthropic-version' in body,
      // Claude-specific system message format
      'system' in body && typeof body.system === 'string',
      // Claude model naming convention
      typeof body.model === 'string' && body.model.startsWith('claude-'),
      // Claude content blocks in messages
      this.hasClaudeContentBlocks(body),
      // Claude tool format
      this.hasClaudeToolFormat(body),
    ];

    return claudeIndicators.some((indicator) => indicator);
  }

  /**
   * Check if request body matches OpenAI API format
   * @param body - The request body to analyze
   * @returns True if body matches OpenAI format
   */
  private isOpenAIFormat(body: Readonly<unknown>): boolean {
    if (!this.isRecord(body)) {
      return false;
    }

    // Must not be Claude format first
    if (this.isClaudeFormat(body)) {
      return false;
    }

    // Check for OpenAI-specific format indicators
    const openaiIndicators = [
      // OpenAI-specific parameters
      'max_completion_tokens' in body,
      // OpenAI message structure (simple string content)
      this.hasOpenAIMessageStructure(body),
      // OpenAI tool format
      this.hasOpenAIToolFormat(body),
      // OpenAI response format
      this.hasOpenAIResponseFormat(body),
    ];

    // Strong OpenAI indicators that don't require messages
    const strongOpenAIIndicators = [
      'max_completion_tokens' in body,
      this.hasOpenAIToolFormat(body),
      this.hasOpenAIResponseFormat(body),
    ];

    // If we have strong OpenAI indicators, we don't need messages
    if (strongOpenAIIndicators.some((indicator) => indicator)) {
      return true;
    }

    // For weaker indicators, we need messages array
    const hasMessages = 'messages' in body && Array.isArray(body.messages);
    return hasMessages && openaiIndicators.some((indicator) => indicator);
  }

  /**
   * Check if messages contain Claude-style content blocks
   * @param body - The request body to check
   * @returns True if Claude content blocks are found
   */
  private hasClaudeContentBlocks(body: Readonly<unknown>): boolean {
    if (!this.isRecord(body) || !('messages' in body)) {
      return false;
    }

    const { messages } = body;
    if (!Array.isArray(messages)) {
      return false;
    }

    return messages.some((message: unknown) => {
      const readonlyMessage = message as Readonly<unknown>;
      if (!this.isRecord(readonlyMessage) || !('content' in readonlyMessage)) {
        return false;
      }
      const typedMessage = readonlyMessage;

      const { content } = typedMessage;

      // Check if content is an array of content blocks (Claude format)
      if (Array.isArray(content)) {
        return content.some((block: unknown) => {
          const readonlyBlock = block as Readonly<unknown>;
          if (!this.isRecord(readonlyBlock)) {
            return false;
          }
          const typedBlock = readonlyBlock;
          return (
            'type' in typedBlock &&
            typeof typedBlock.type === 'string' &&
            ['text', 'image', 'tool_use', 'tool_result'].includes(
              typedBlock.type
            )
          );
        });
      }

      return false;
    });
  }

  /**
   * Check if request has Claude tool format
   * @param body - The request body to check
   * @returns True if Claude tool format is found
   */
  private hasClaudeToolFormat(body: Readonly<unknown>): boolean {
    if (!this.isRecord(body) || !('tools' in body)) {
      return false;
    }

    const { tools } = body;
    if (!Array.isArray(tools)) {
      return false;
    }

    return tools.some((tool: unknown) => {
      const readonlyTool = tool as Readonly<unknown>;
      if (!this.isRecord(readonlyTool)) {
        return false;
      }
      const typedTool = readonlyTool;
      return (
        'name' in typedTool &&
        'description' in typedTool &&
        'input_schema' in typedTool
      ); // Claude uses input_schema
    });
  }

  /**
   * Check if messages have OpenAI structure (simple string content)
   * Only returns true if combined with other OpenAI indicators
   * @param body - The request body to check
   * @returns True if OpenAI message structure is found
   */
  private hasOpenAIMessageStructure(body: Readonly<unknown>): boolean {
    if (!this.isRecord(body) || !('messages' in body)) {
      return false;
    }

    const { messages } = body;
    if (!Array.isArray(messages)) {
      return false;
    }

    // Check if all messages have simple string content
    const hasStringContent = messages.every((message: unknown) => {
      const readonlyMessage = message as Readonly<unknown>;
      if (
        !this.isRecord(readonlyMessage) ||
        !('content' in readonlyMessage) ||
        !('role' in readonlyMessage)
      ) {
        return false;
      }
      const typedMessage = readonlyMessage;

      const { content, role } = typedMessage;

      // OpenAI roles include 'tool' which Claude doesn't use
      const validOpenAIRoles = ['user', 'assistant', 'system', 'tool'];
      if (!validOpenAIRoles.includes(role as string)) {
        return false;
      }

      // OpenAI content is typically string or null (for tool messages)
      return typeof content === 'string' || content === null;
    });

    // Simple string content alone is not enough - need other OpenAI indicators
    return (
      hasStringContent &&
      ('max_completion_tokens' in body ||
        this.hasOpenAIToolFormat(body) ||
        this.hasOpenAIResponseFormat(body) ||
        this.hasToolRole(body))
    );
  }

  /**
   * Check for tool role in messages (OpenAI specific)
   * @param body - The request body to check
   * @returns True if tool role is found
   */
  private hasToolRole(body: Readonly<unknown>): boolean {
    if (!this.isRecord(body) || !('messages' in body)) {
      return false;
    }

    const { messages } = body;
    if (!Array.isArray(messages)) {
      return false;
    }

    return messages.some((message: unknown) => {
      const readonlyMessage = message as Readonly<unknown>;
      if (!this.isRecord(readonlyMessage)) {
        return false;
      }
      const typedMessage = readonlyMessage;
      return 'role' in typedMessage && typedMessage.role === 'tool';
    });
  }

  /**
   * Check if request has OpenAI tool format
   * @param body - The request body to check
   * @returns True if OpenAI tool format is found
   */
  private hasOpenAIToolFormat(body: Readonly<unknown>): boolean {
    if (!this.isRecord(body) || !('tools' in body)) {
      return false;
    }

    const { tools } = body;
    if (!Array.isArray(tools)) {
      return false;
    }

    return tools.some((tool: unknown) => {
      const readonlyTool = tool as Readonly<unknown>;
      if (!this.isRecord(readonlyTool)) {
        return false;
      }
      const typedTool = readonlyTool;
      if (
        !('type' in typedTool) ||
        typedTool.type !== 'function' ||
        !('function' in typedTool)
      ) {
        return false;
      }
      const readonlyFunction = typedTool.function as Readonly<unknown>;
      if (!this.isRecord(readonlyFunction)) {
        return false;
      }
      const typedFunction = readonlyFunction;
      return 'name' in typedFunction && 'parameters' in typedFunction; // OpenAI uses parameters
    });
  }

  /**
   * Check if request has OpenAI response format
   * @param body - The request body to check
   * @returns True if OpenAI response format is found
   */
  private hasOpenAIResponseFormat(body: Readonly<unknown>): boolean {
    if (!this.isRecord(body) || !('response_format' in body)) {
      return false;
    }

    const { response_format: responseFormat } = body;
    const readonlyResponseFormat = responseFormat as Readonly<unknown>;
    if (!this.isRecord(readonlyResponseFormat)) {
      return false;
    }
    const typedResponseFormat = readonlyResponseFormat;

    // OpenAI response format structure
    return (
      'type' in typedResponseFormat &&
      ['text', 'json_object'].includes(typedResponseFormat.type as string)
    );
  }

  /**
   * Type guard to check if value is a record
   * @param value - The value to check
   * @returns True if value is a record
   */
  private isRecord(value: Readonly<unknown>): value is Record<string, unknown> {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    return typeof value === 'object' && value !== null;
  }
}

/**
 * Request format analyzer for Claude format detection
 */
export class ClaudeFormatAnalyzer {
  /**
   * Analyze if request matches Claude format with detailed checks
   * @param body - The request body to analyze
   * @returns True if request matches Claude format
   */
  public static analyze(body: Readonly<unknown>): boolean {
    if (!ClaudeFormatAnalyzer.isRecord(body)) {
      return false;
    }

    // Check for Claude-specific indicators
    const indicators = [
      ClaudeFormatAnalyzer.hasAnthropicVersion(body),
      ClaudeFormatAnalyzer.hasSystemMessage(body),
      ClaudeFormatAnalyzer.hasContentBlocks(body),
      ClaudeFormatAnalyzer.hasClaudeTools(body),
      ClaudeFormatAnalyzer.hasMaxTokensOnly(body),
    ];

    return indicators.some((indicator) => indicator);
  }

  /**
   * Check for anthropic-version header
   */
  private static hasAnthropicVersion(
    body: Readonly<Record<string, unknown>>
  ): boolean {
    return 'anthropic-version' in body;
  }

  /**
   * Check for Claude system message format
   */
  private static hasSystemMessage(
    body: Readonly<Record<string, unknown>>
  ): boolean {
    return 'system' in body && typeof body.system === 'string';
  }

  /**
   * Check for Claude content blocks
   */
  private static hasContentBlocks(
    body: Readonly<Record<string, unknown>>
  ): boolean {
    if (!('messages' in body) || !Array.isArray(body.messages)) {
      return false;
    }

    return body.messages.some((message: unknown) => {
      const readonlyMessage = message as Readonly<unknown>;
      if (
        !ClaudeFormatAnalyzer.isRecord(readonlyMessage) ||
        !('content' in readonlyMessage)
      ) {
        return false;
      }
      const typedMessage = readonlyMessage;

      return (
        Array.isArray(typedMessage.content) &&
        (typedMessage.content as unknown[]).some((block: unknown) => {
          const readonlyBlock = block as Readonly<unknown>;
          if (!ClaudeFormatAnalyzer.isRecord(readonlyBlock)) {
            return false;
          }
          const typedBlock = readonlyBlock;
          return 'type' in typedBlock;
        })
      );
    });
  }

  /**
   * Check for Claude tool format
   */
  private static hasClaudeTools(
    body: Readonly<Record<string, unknown>>
  ): boolean {
    if (!('tools' in body) || !Array.isArray(body.tools)) {
      return false;
    }

    return body.tools.some((tool: unknown) => {
      const readonlyTool = tool as Readonly<unknown>;
      if (!ClaudeFormatAnalyzer.isRecord(readonlyTool)) {
        return false;
      }
      const typedTool = readonlyTool;
      return 'input_schema' in typedTool;
    });
  }

  /**
   * Check for max_tokens without max_completion_tokens (Claude style)
   */
  private static hasMaxTokensOnly(
    body: Readonly<Record<string, unknown>>
  ): boolean {
    return 'max_tokens' in body && !('max_completion_tokens' in body);
  }

  private static isRecord(
    value: Readonly<unknown>
  ): value is Record<string, unknown> {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    return typeof value === 'object' && value !== null;
  }
}

/**
 * Request format analyzer for OpenAI format detection
 */
export class OpenAIFormatAnalyzer {
  /**
   * Analyze if request matches OpenAI format with detailed checks
   * @param body - The request body to analyze
   * @returns True if request matches OpenAI format
   */
  public static analyze(body: Readonly<unknown>): boolean {
    if (!OpenAIFormatAnalyzer.isRecord(body)) {
      return false;
    }

    // Must not be Claude format
    if (ClaudeFormatAnalyzer.analyze(body)) {
      return false;
    }

    // Check for OpenAI-specific indicators
    const indicators = [
      OpenAIFormatAnalyzer.hasMaxCompletionTokens(body),
      OpenAIFormatAnalyzer.hasSimpleMessageStructure(body),
      OpenAIFormatAnalyzer.hasOpenAITools(body),
      OpenAIFormatAnalyzer.hasOpenAIResponseFormat(body),
      OpenAIFormatAnalyzer.hasToolRole(body),
    ];

    // Must have messages for both formats
    const hasMessages = 'messages' in body && Array.isArray(body.messages);

    return hasMessages && indicators.some((indicator) => indicator);
  }

  /**
   * Check for max_completion_tokens (OpenAI style)
   */
  private static hasMaxCompletionTokens(
    body: Readonly<Record<string, unknown>>
  ): boolean {
    return 'max_completion_tokens' in body;
  }

  /**
   * Check for simple message structure (string content)
   * Only returns true if combined with other OpenAI indicators
   */
  private static hasSimpleMessageStructure(
    body: Readonly<Record<string, unknown>>
  ): boolean {
    if (!('messages' in body) || !Array.isArray(body.messages)) {
      return false;
    }

    // Check if all messages have simple string content
    const hasStringContent = body.messages.every((message: unknown) => {
      const readonlyMessage = message as Readonly<unknown>;
      if (
        !OpenAIFormatAnalyzer.isRecord(readonlyMessage) ||
        !('content' in readonlyMessage)
      ) {
        return false;
      }
      const typedMessage = readonlyMessage;

      const { content } = typedMessage;
      return typeof content === 'string' || content === null;
    });

    // Simple string content alone is not enough - need other OpenAI indicators
    return (
      hasStringContent &&
      (OpenAIFormatAnalyzer.hasMaxCompletionTokens(body) ||
        OpenAIFormatAnalyzer.hasOpenAITools(body) ||
        OpenAIFormatAnalyzer.hasOpenAIResponseFormat(body) ||
        OpenAIFormatAnalyzer.hasToolRole(body))
    );
  }

  /**
   * Check for OpenAI tool format
   */
  private static hasOpenAITools(
    body: Readonly<Record<string, unknown>>
  ): boolean {
    if (!('tools' in body) || !Array.isArray(body.tools)) {
      return false;
    }

    return body.tools.some((tool: unknown) => {
      const readonlyTool = tool as Readonly<unknown>;
      if (!OpenAIFormatAnalyzer.isRecord(readonlyTool)) {
        return false;
      }
      const typedTool = readonlyTool;
      if (
        !('type' in typedTool) ||
        typedTool.type !== 'function' ||
        !('function' in typedTool)
      ) {
        return false;
      }
      const readonlyFunction = typedTool.function as Readonly<unknown>;
      if (!OpenAIFormatAnalyzer.isRecord(readonlyFunction)) {
        return false;
      }
      const typedFunction = readonlyFunction;
      return 'parameters' in typedFunction;
    });
  }

  /**
   * Check for OpenAI response format
   */
  private static hasOpenAIResponseFormat(
    body: Readonly<Record<string, unknown>>
  ): boolean {
    if (!('response_format' in body)) {
      return false;
    }

    const { response_format: responseFormat } = body;
    const readonlyResponseFormat = responseFormat as Readonly<unknown>;
    if (!OpenAIFormatAnalyzer.isRecord(readonlyResponseFormat)) {
      return false;
    }
    const typedResponseFormat = readonlyResponseFormat;
    return (
      'type' in typedResponseFormat &&
      ['text', 'json_object'].includes(typedResponseFormat.type as string)
    );
  }

  /**
   * Check for tool role in messages (OpenAI specific)
   */
  private static hasToolRole(body: Readonly<Record<string, unknown>>): boolean {
    if (!('messages' in body) || !Array.isArray(body.messages)) {
      return false;
    }

    return body.messages.some((message: unknown) => {
      const readonlyMessage = message as Readonly<unknown>;
      if (!OpenAIFormatAnalyzer.isRecord(readonlyMessage)) {
        return false;
      }
      const typedMessage = readonlyMessage;
      return 'role' in typedMessage && typedMessage.role === 'tool';
    });
  }

  private static isRecord(
    value: Readonly<unknown>
  ): value is Record<string, unknown> {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    return typeof value === 'object' && value !== null;
  }
}

/**
 * Factory function to create format detection service
 * @returns A new format detection service instance
 */
export function createFormatDetectionService(): FormatDetectionService {
  return new FormatDetectionService();
}

/**
 * Utility function to detect request format from raw request
 * @param request - The incoming request
 * @returns The detected request format
 */
export function detectRequestFormat(
  request: Readonly<IncomingRequest>
): RequestFormat {
  const detector = createFormatDetectionService();
  return detector.detectRequestFormat(request);
}

/**
 * Utility function to get response format from request format
 * @param requestFormat - The request format
 * @returns The matching response format
 */
export function getResponseFormat(
  requestFormat: Readonly<RequestFormat>
): ResponseFormat {
  const detector = createFormatDetectionService();
  return detector.getResponseFormat(requestFormat);
}
