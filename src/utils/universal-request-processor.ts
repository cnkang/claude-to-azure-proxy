/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types */
import { v4 as uuidv4 } from 'uuid';
// Removed express-validator for security reasons (CVE-2025-56200)
// Using joi validation instead
import type {
  IncomingRequest,
  RequestFormat,
  ResponseFormat,
  UniversalRequest,
  ClaudeRequest,
  ClaudeMessage,
  ClaudeContentBlock,
  OpenAIRequest,
  OpenAIMessage,
  ResponsesCreateParams,
  ReasoningEffort,
  ConversationContext,
  DeepReadonly,
} from '../types/index.js';
import { ValidationError, InternalServerError } from '../errors/index.js';
import { FormatDetectionService } from './format-detection.js';
import { ClaudeToResponsesTransformer } from './claude-to-responses-transformer.js';
import { OpenAIToResponsesTransformer } from './openai-to-responses-transformer.js';
import { createReasoningEffortAnalyzer } from './reasoning-effort-analyzer.js';

/**
 * Result of universal request processing
 */
export interface UniversalProcessingResult {
  readonly responsesParams: ResponsesCreateParams;
  readonly requestFormat: RequestFormat;
  readonly responseFormat: ResponseFormat;
  readonly conversationId: string;
  readonly correlationId: string;
  readonly estimatedComplexity: 'simple' | 'medium' | 'complex';
  readonly reasoningEffort: ReasoningEffort;
  readonly normalizedRequest: UniversalRequest;
}

/**
 * Configuration for universal request processor
 */
export interface UniversalProcessorConfig {
  readonly enableInputValidation: boolean;
  readonly maxRequestSize: number;
  readonly defaultReasoningEffort: ReasoningEffort;
  readonly enableSwiftOptimization: boolean;
  readonly swiftKeywords: readonly string[];
  readonly iosKeywords: readonly string[];
  readonly reasoningBoost: number;
}

/**
 * Universal request processor that handles both Claude and OpenAI formats
 * Routes requests to appropriate transformers and provides unified processing
 */
export class UniversalRequestProcessor {
  private readonly formatDetector: FormatDetectionService;
  private readonly config: UniversalProcessorConfig;
  private readonly reasoningAnalyzer: ReturnType<typeof createReasoningEffortAnalyzer>;

  constructor(config: Readonly<UniversalProcessorConfig>) {
    this.formatDetector = new FormatDetectionService();
    this.config = config;
    this.reasoningAnalyzer = createReasoningEffortAnalyzer();
  }

  /**
   * Process incoming request and transform to Responses API format
   */
  public processRequest(
    request: Readonly<IncomingRequest>,
    conversationContext?: Readonly<ConversationContext>
  ): Promise<UniversalProcessingResult> {
    const correlationId = this.generateCorrelationId();

    try {
      // Validate request size if enabled
      if (this.config.enableInputValidation) {
        this.validateRequestSize(request, correlationId);
      }

      // Detect request format
      const requestFormat = this.formatDetector.detectRequestFormat(request);
      const responseFormat =
        this.formatDetector.getResponseFormat(requestFormat);

      // Validate and sanitize request body
      const validatedRequest = this.validateAndSanitizeRequest(
        request.body,
        requestFormat,
        correlationId
      );

      // Estimate complexity and determine reasoning effort
      const estimatedComplexity = this.estimateComplexity(
        validatedRequest,
        conversationContext,
        requestFormat
      );
      const reasoningEffort = this.determineReasoningEffort(
        validatedRequest,
        estimatedComplexity,
        requestFormat,
        conversationContext
      );

      // Generate conversation ID
      const conversationId = this.generateConversationId(
        validatedRequest,
        requestFormat
      );

      // Transform request based on format
      const responsesParams = this.transformRequest(
        validatedRequest,
        reasoningEffort,
        conversationContext,
        correlationId,
        requestFormat
      );

      return Promise.resolve({
        responsesParams,
        requestFormat,
        responseFormat,
        conversationId,
        correlationId,
        estimatedComplexity,
        reasoningEffort,
        normalizedRequest: validatedRequest,
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }

      throw new InternalServerError(
        'Failed to process universal request',
        correlationId,
        'processRequest',
        {
          originalError:
            error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Validate request size
   */
  private validateRequestSize(
    request: Readonly<IncomingRequest>,
    correlationId: Readonly<string>
  ): void {
    const requestString = JSON.stringify(request.body);
    const sizeInBytes = Buffer.byteLength(requestString, 'utf8');

    if (sizeInBytes > this.config.maxRequestSize) {
      throw new ValidationError(
        `Request size ${sizeInBytes} bytes exceeds maximum allowed size ${this.config.maxRequestSize} bytes`,
        correlationId,
        'request_size',
        sizeInBytes
      );
    }
  }

  /**
   * Validate and sanitize request body based on format
   */
  private validateAndSanitizeRequest(
    body: unknown,
    format: Readonly<RequestFormat>,
    correlationId: Readonly<string>
  ): UniversalRequest {
    if (!this.config.enableInputValidation) {
      return body as UniversalRequest;
    }

    // Basic structure validation
    if (body === null || body === undefined || typeof body !== 'object') {
      throw new ValidationError(
        'Request body must be a valid JSON object',
        correlationId,
        'body',
        body
      );
    }

    const requestBody = body as Record<string, unknown>;
    const normalizedBody = this.normalizeLegacyRequest(
      requestBody,
      format
    );

    this.ensureNoMaliciousContent(normalizedBody, format, correlationId);

    // Common validations for both formats
    this.validateCommonFields(normalizedBody, correlationId);

    // Format-specific validation
    if (format === 'claude') {
      return this.validateClaudeRequest(normalizedBody, correlationId);
    } else {
      return this.validateOpenAIRequest(normalizedBody, correlationId);
    }
  }

  private normalizeLegacyRequest(
    body: DeepReadonly<Record<string, unknown>>,
    format: Readonly<RequestFormat>
  ): Record<string, unknown> {
    if (format === 'claude') {
      const prompt = body.prompt;
      const messages = body.messages;

      if (
        (messages === undefined || messages === null) &&
        typeof prompt === 'string' &&
        prompt.trim().length > 0
      ) {
        const transformedMessages = [
          {
            role: 'user' as const,
            content: prompt,
          },
        ];

        return {
          ...body,
          messages: transformedMessages,
        };
      }
    }

    return body;
  }

  /**
   * Validate common fields present in both formats
   */
  private validateCommonFields(
    body: Readonly<Record<string, unknown>>,
    correlationId: Readonly<string>
  ): void {
    // Model validation
    if (
      body.model === null ||
      body.model === undefined ||
      body.model === '' ||
      typeof body.model !== 'string' ||
      body.model.trim().length === 0
    ) {
      throw new ValidationError(
        'Model is required and must be a non-empty string',
        correlationId,
        'model',
        body.model
      );
    }

    // Messages validation
    if (
      body.messages === null ||
      body.messages === undefined ||
      !Array.isArray(body.messages) ||
      body.messages.length === 0
    ) {
      throw new ValidationError(
        'Messages array is required and must not be empty',
        correlationId,
        'messages',
        body.messages
      );
    }

    // Optional parameter validations
    if (
      body.temperature !== undefined &&
      (typeof body.temperature !== 'number' ||
        body.temperature < 0 ||
        body.temperature > 2)
    ) {
      throw new ValidationError(
        'Temperature must be a number between 0 and 2',
        correlationId,
        'temperature',
        body.temperature
      );
    }

    if (
      body.top_p !== undefined &&
      (typeof body.top_p !== 'number' || body.top_p < 0 || body.top_p > 1)
    ) {
      throw new ValidationError(
        'top_p must be a number between 0 and 1',
        correlationId,
        'top_p',
        body.top_p
      );
    }

    if (body.stream !== undefined && typeof body.stream !== 'boolean') {
      throw new ValidationError(
        'stream must be a boolean',
        correlationId,
        'stream',
        body.stream
      );
    }
  }

  /**
   * Validate Claude-specific request structure
   */
  private validateClaudeRequest(
    body: Readonly<Record<string, unknown>>,
    correlationId: Readonly<string>
  ): ClaudeRequest {
    // Max tokens validation (Claude uses max_tokens)
    if (
      body.max_tokens !== undefined &&
      (typeof body.max_tokens !== 'number' ||
        body.max_tokens < 1 ||
        body.max_tokens > 131072)
    ) {
      throw new ValidationError(
        'max_tokens must be a number between 1 and 131072',
        correlationId,
        'max_tokens',
        body.max_tokens
      );
    }

    // System message validation
    if (body.system !== undefined && typeof body.system !== 'string') {
      throw new ValidationError(
        'system must be a string',
        correlationId,
        'system',
        body.system
      );
    }

    // Sanitize and return as Claude request
    return this.sanitizeClaudeRequest(body as unknown as ClaudeRequest);
  }

  /**
   * Validate OpenAI-specific request structure
   */
  private validateOpenAIRequest(
    body: Readonly<Record<string, unknown>>,
    correlationId: Readonly<string>
  ): OpenAIRequest {
    // Max tokens validation (OpenAI uses max_tokens, but we also accept max_completion_tokens)
    const maxTokensField =
      body.max_completion_tokens !== undefined
        ? 'max_completion_tokens'
        : 'max_tokens';
    const maxTokensValue = body.max_completion_tokens ?? body.max_tokens;

    if (
      maxTokensValue !== undefined &&
      (typeof maxTokensValue !== 'number' ||
        maxTokensValue < 1 ||
        maxTokensValue > 131072)
    ) {
      throw new ValidationError(
        `${maxTokensField} must be a number between 1 and 131072`,
        correlationId,
        maxTokensField,
        maxTokensValue
      );
    }

    // Sanitize and return as OpenAI request
    return this.sanitizeOpenAIRequest(body as unknown as OpenAIRequest);
  }

  /**
   * Sanitize Claude request content
   */
  private sanitizeClaudeRequest(
    request: Readonly<DeepReadonly<ClaudeRequest>>
  ): ClaudeRequest {
    // Sanitize message content
    const sanitizedMessages = request.messages.map((message: Readonly<DeepReadonly<ClaudeMessage>>) => ({
      ...message,
      content: this.sanitizeContent(message.content),
    }));

    const hasSystemMessage =
      typeof request.system === 'string' && request.system.trim().length > 0;
    const sanitizedSystem = hasSystemMessage
      ? this.sanitizeString(request.system)
      : undefined;

    return {
      ...request,
      messages: sanitizedMessages,
      ...(sanitizedSystem !== undefined ? { system: sanitizedSystem } : {}),
    };
  }

  /**
   * Sanitize OpenAI request content
   */
  private sanitizeOpenAIRequest(
    request: Readonly<DeepReadonly<OpenAIRequest>>
  ): OpenAIRequest {
    // Sanitize message content
    const sanitizedMessages = request.messages.map((message: Readonly<DeepReadonly<OpenAIMessage>>) => {
      // Type guard for content - safely handle any type
       
      const messageContent = message.content as unknown;
      let sanitizedContent: unknown = messageContent;
      
      if (typeof messageContent === 'string' && messageContent.length > 0) {
        sanitizedContent = this.sanitizeString(messageContent);
      }
      
      return {
        ...message,
        content: sanitizedContent,
      };
    });

    return {
      ...request,
      messages: sanitizedMessages,
    } as OpenAIRequest;
  }

  /**
   * Sanitize string content
   */
  private sanitizeString(content: Readonly<string>): string {
    let sanitized = content;

    // Remove script tags entirely
    sanitized = sanitized.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');

    // Remove potentially dangerous tags while preserving text content
    sanitized = sanitized.replace(/<[^>]+>/g, '');

    // Remove null bytes and control characters except newlines and tabs
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    return sanitized;
  }

  /**
   * Sanitize Claude content (string or content blocks)
   */
  private sanitizeContent(
    content: Readonly<DeepReadonly<
      | string
      | readonly ClaudeContentBlock[]
    >>
  ): string | readonly ClaudeContentBlock[] {
    if (typeof content === 'string') {
      return this.sanitizeString(content);
    }

    return content.map((block) => {
      if (block.type === 'text') {
        return {
          ...block,
          text:
            typeof block.text === 'string' && block.text.length > 0
              ? this.sanitizeString(block.text)
              : block.text,
        };
      }
      return block;
    });
  }

  private ensureNoMaliciousContent(
    body: Record<string, unknown>,
    format: Readonly<RequestFormat>,
    correlationId: Readonly<string>
  ): void {
    const checkString = (value: unknown, field: string): void => {
      if (typeof value !== 'string') {
        return;
      }

      if (!this.containsMaliciousContent(value)) {
        return;
      }

      throw new ValidationError(
        'Request contains invalid or potentially harmful content',
        correlationId,
        field,
        '[REDACTED]'
      );
    };

    const inspectContentBlocks = (
      content: unknown,
      field: string
    ): void => {
      if (typeof content === 'string') {
        checkString(content, field);
        return;
      }

      if (Array.isArray(content)) {
        content.forEach((item, index) => {
          const nestedField = `${field}[${index}]`;
          if (typeof item === 'string') {
            checkString(item, nestedField);
          } else if (
            typeof item === 'object' &&
            item !== null &&
            'text' in (item as Record<string, unknown>)
          ) {
            checkString((item as { text?: unknown }).text, `${nestedField}.text`);
          }
        });
      }
    };

    if (format === 'claude') {
      checkString(body.prompt, 'prompt');
      checkString(body.system, 'system');

      if (Array.isArray(body.messages)) {
        body.messages.forEach((message, index) => {
          if (typeof message === 'object' && message !== null) {
            const record = message as Record<string, unknown>;
            inspectContentBlocks(record.content, `messages[${index}].content`);
          }
        });
      }
    } else {
      if (Array.isArray(body.messages)) {
        body.messages.forEach((message, index) => {
          if (typeof message === 'object' && message !== null) {
            const record = message as Record<string, unknown>;
            inspectContentBlocks(record.content, `messages[${index}].content`);
          }
        });
      }
    }
  }

  private containsMaliciousContent(value: string): boolean {
    const patterns: readonly RegExp[] = [
      /<script[\s\S]*?>[\s\S]*?<\/script>/i,
      /javascript:\s*/i,
      /data:text\//i,
      /on[a-z]+\s*=/i,
      /\{\{[^}]*\}\}/,
    ];

    return patterns.some((pattern) => pattern.test(value));
  }

  /**
   * Estimate conversation complexity
   */
  private estimateComplexity(
    request: Readonly<DeepReadonly<UniversalRequest>>,
    context: Readonly<DeepReadonly<ConversationContext> | undefined>,
    format: Readonly<RequestFormat>
  ): 'simple' | 'medium' | 'complex' {
    // Use format-specific complexity estimation
    if (format === 'claude') {
      const transformer = new ClaudeToResponsesTransformer('temp');
      return transformer.estimateConversationComplexity(
        request as ClaudeRequest,
        context
      );
    }

    const transformer = new OpenAIToResponsesTransformer('temp');
    return transformer.estimateConversationComplexity(
      request as OpenAIRequest,
      context
    );
  }

  /**
   * Determine reasoning effort based on complexity and content
   */
  private determineReasoningEffort(
    request: Readonly<DeepReadonly<UniversalRequest>>,
    complexity: Readonly<'simple' | 'medium' | 'complex'>,
    format: Readonly<RequestFormat>,
    conversationContext?: Readonly<DeepReadonly<ConversationContext>>
  ): ReasoningEffort {
    let baseEffort: ReasoningEffort = (() => {
      switch (complexity) {
        case 'simple':
          return 'minimal';
        case 'medium':
          return 'medium';
        case 'complex':
          return 'high';
        default:
          return this.config.defaultReasoningEffort;
      }
    })();

    if (format === 'claude') {
      const analyzerEffort = this.reasoningAnalyzer.analyzeRequest(
        request as ClaudeRequest,
        conversationContext
      );
      if (analyzerEffort !== undefined) {
        baseEffort = analyzerEffort;
      }
    }

    // Check for Swift/iOS content optimization
    if (
      this.config.enableSwiftOptimization &&
      this.detectSwiftIOSContent(request, format)
    ) {
      // Boost reasoning effort for Swift/iOS development
      switch (baseEffort) {
        case 'minimal':
          baseEffort = 'low';
          break;
        case 'medium':
          baseEffort = 'high';
          break;
        // 'high' stays 'high'
        // 'low' would become 'medium' but it's not possible from the first switch
      }
    }

    return baseEffort;
  }

  /**
   * Detect Swift/iOS development content
   */
  private detectSwiftIOSContent(
    request: Readonly<DeepReadonly<UniversalRequest>>,
    format: Readonly<RequestFormat>
  ): boolean {
    const allKeywords = [
      ...this.config.swiftKeywords,
      ...this.config.iosKeywords,
    ];

    if (format === 'openai') {
      const transformer = new OpenAIToResponsesTransformer('temp');
      return transformer.detectSwiftIOSContent(request as OpenAIRequest);
    }

    // For Claude requests, check message content
    return (request as ClaudeRequest).messages.some((message) => {
        const content =
          typeof message.content === 'string'
            ? message.content
            : Array.isArray(message.content)
              ? message.content
                  .filter(
                    (block: Readonly<DeepReadonly<ClaudeContentBlock>>): block is {
                      readonly type: 'text';
                      readonly text?: string;
                    } =>
                      block.type === 'text' && typeof block.text === 'string'
                  )
                  .map((block) => block.text ?? '')
                  .join(' ')
              : '';

        return allKeywords.some((keyword) =>
          content.toLowerCase().includes(keyword.toLowerCase())
        );
      });
  }

  /**
   * Generate conversation ID
   */
  private generateConversationId(
    request: Readonly<DeepReadonly<UniversalRequest>>,
    format: Readonly<RequestFormat>
  ): string {
    if (format === 'claude') {
      const transformer = new ClaudeToResponsesTransformer('temp');
      return transformer.generateConversationId(request as ClaudeRequest);
    }

    const transformer = new OpenAIToResponsesTransformer('temp');
    return transformer.generateConversationId(request as OpenAIRequest);
  }

  /**
   * Transform request to Responses API format
   */
  private transformRequest(
    request: Readonly<DeepReadonly<UniversalRequest>>,
    reasoningEffort: Readonly<ReasoningEffort>,
    conversationContext: Readonly<DeepReadonly<ConversationContext> | undefined>,
    correlationId: Readonly<string>,
    format: Readonly<RequestFormat>
  ): ResponsesCreateParams {
    if (format === 'claude') {
      const transformer = new ClaudeToResponsesTransformer(correlationId);
      return transformer.transformRequest(
        request as ClaudeRequest,
        reasoningEffort,
        conversationContext
      );
    }

    const transformer = new OpenAIToResponsesTransformer(correlationId);
    return transformer.transformRequest(
      request as OpenAIRequest,
      reasoningEffort,
      conversationContext
    );
  }
  /**
   * Generate correlation ID for request tracking
   */
  private generateCorrelationId(): string {
    return `req_${uuidv4()}`;
  }
}

// Express-validator removed for security reasons (CVE-2025-56200)
// Validation now handled by joi validators in route handlers

/**
 * Factory function to create universal request processor
 */
export function createUniversalRequestProcessor(
  config: Readonly<UniversalProcessorConfig>
): UniversalRequestProcessor {
  return new UniversalRequestProcessor(config);
}

/**
 * Default configuration for universal request processor
 */
export const defaultUniversalProcessorConfig: UniversalProcessorConfig = {
  enableInputValidation: true,
  maxRequestSize: 10 * 1024 * 1024, // 10MB
  defaultReasoningEffort: 'medium',
  enableSwiftOptimization: true,
  swiftKeywords: [
    'swift',
    'ios',
    'xcode',
    'uikit',
    'swiftui',
    'foundation',
    'cocoa',
    'objective-c',
    'appkit',
    'core data',
    'combine',
    'async/await',
    'actor',
    '@main',
    'import UIKit',
    'import SwiftUI',
  ],
  iosKeywords: [
    'ios',
    'iphone',
    'ipad',
    'watchos',
    'tvos',
    'macos',
    'app store',
    'testflight',
    'provisioning',
    'certificate',
    'bundle identifier',
  ],
  reasoningBoost: 1.5,
};
