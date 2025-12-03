/**
 * Test data factories for consistent test setup
 * Provides reusable test data generators with various configurations
 */

import type {
  ClaudeError,
  OpenAIError,
  OpenAIRequest,
  OpenAIResponse,
  ResponsesResponse,
} from '../src/types/index';
import type { ClaudeRequest } from '../src/types/index';

export interface TestDataOptions {
  readonly seed?: number;
  readonly size?: 'small' | 'medium' | 'large';
  readonly includeOptional?: boolean;
  readonly includeMalicious?: boolean;
}

/**
 * Factory for creating Claude API requests
 */
export class ClaudeRequestFactory {
  private static counter = 0;

  static create(options: TestDataOptions = {}): ClaudeRequest {
    const {
      size = 'medium',
      includeOptional = false,
      seed = ClaudeRequestFactory.counter++,
    } = options;

    const prompts = {
      small: `Test prompt ${seed}`,
      medium: `This is a medium-sized test prompt ${seed} with some additional content to make it more realistic.`,
      large:
        `This is a large test prompt ${seed} `.repeat(100) +
        'End of large prompt.',
    };

    const promptText =
      size === 'small'
        ? prompts.small
        : size === 'medium'
          ? prompts.medium
          : prompts.large;
    const maxTokens = size === 'small' ? 50 : size === 'medium' ? 100 : 500;

    const baseRequest: ClaudeRequest = {
      model: 'gpt-4', // Use supported model but with Claude format structure
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: promptText,
            },
          ],
        },
      ],
      max_tokens: maxTokens,
      // Add Claude-specific indicator to trigger Claude format detection
      'anthropic-version': '2023-06-01',
    };

    if (includeOptional) {
      return {
        ...baseRequest,
        temperature: 0.7,
        top_p: 0.9,
        stop_sequences: ['END', 'STOP'],
        stream: false,
        // Ensure Claude format indicator is preserved
        'anthropic-version': '2023-06-01',
      };
    }

    return baseRequest;
  }

  static createBatch(
    count: number,
    options: TestDataOptions = {}
  ): ClaudeRequest[] {
    return Array.from({ length: count }, (_, i) =>
      ClaudeRequestFactory.create({ ...options, seed: i })
    );
  }

  static createInvalid(
    type: 'missing_field' | 'invalid_type' | 'out_of_range' | 'malicious'
  ): Record<string, unknown> {
    const base = ClaudeRequestFactory.create();

    switch (type) {
      case 'missing_field': {
        const result: Record<string, unknown> = {
          model: base.model,
          max_tokens: base.max_tokens,
        };
        if (base.temperature !== undefined) {
          result.temperature = base.temperature;
        }
        if (base.top_p !== undefined) {
          result.top_p = base.top_p;
        }
        if (base.top_k !== undefined) {
          result.top_k = base.top_k;
        }
        if (base.stop_sequences !== undefined) {
          result.stop_sequences = base.stop_sequences;
        }
        if (base.stream !== undefined) {
          result.stream = base.stream;
        }
        return result;
      }

      case 'invalid_type':
        return {
          ...base,
          max_tokens: 'invalid_number',
        } as Record<string, unknown>;

      case 'out_of_range':
        return {
          ...base,
          max_tokens: 200000, // Exceeds limit
          temperature: 3.0, // Exceeds limit
        } as Record<string, unknown>;

      case 'malicious':
        return {
          ...base,
          prompt: '<script>alert("xss")</script>',
          model: 'claude{{user.secret}}',
        } as Record<string, unknown>;

      default:
        return base as Record<string, unknown>;
    }
  }

  static createEdgeCase(
    type: 'empty' | 'unicode' | 'very_long' | 'special_chars'
  ): ClaudeRequest {
    const base = ClaudeRequestFactory.create();

    let content: string;
    let maxTokens: number | undefined;

    switch (type) {
      case 'empty':
        content = '';
        maxTokens = 1;
        break;

      case 'unicode':
        content = 'Hello 世界 🌍 café naïve résumé ∑∫∆√π';
        break;

      case 'very_long':
        content = 'Very long prompt: ' + 'x'.repeat(50000);
        maxTokens = 131072;
        break;

      case 'special_chars':
        content = 'Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?`~';
        break;

      default:
        content = 'Default test content';
        break;
    }

    return {
      ...base,
      messages: [
        {
          role: 'user',
          content,
        },
      ],
      ...(maxTokens !== undefined &&
        maxTokens > 0 && { max_tokens: maxTokens }),
    };
  }
}

/**
 * Factory for creating Azure OpenAI responses
 */
export class AzureResponseFactory {
  private static counter = 0;

  static create(options: TestDataOptions = {}): OpenAIResponse {
    const {
      size = 'medium',
      includeOptional = false,
      seed = AzureResponseFactory.counter++,
    } = options;

    const contents = {
      small: `Response ${seed}`,
      medium: `This is a medium response ${seed} with some content.`,
      large:
        `This is a large response ${seed} `.repeat(200) + 'End of response.',
    };

    const contentText =
      size === 'small'
        ? contents.small
        : size === 'medium'
          ? contents.medium
          : contents.large;

    const baseResponse: OpenAIResponse = {
      id: `chatcmpl-${seed}`,
      object: 'chat.completion',
      created: 1640995200 + seed,
      model: 'gpt-4',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: contentText,
          },
          finish_reason: 'stop',
        },
      ],
    };

    if (includeOptional) {
      return {
        ...baseResponse,
        usage: {
          prompt_tokens: 10 + seed,
          completion_tokens: 15 + seed,
          total_tokens: 25 + seed * 2,
        },
        system_fingerprint: `fp_${seed}`,
      };
    }

    return baseResponse;
  }

  static createBatch(
    count: number,
    options: TestDataOptions = {}
  ): OpenAIResponse[] {
    return Array.from({ length: count }, (_, i) =>
      AzureResponseFactory.create({ ...options, seed: i })
    );
  }

  static createWithFinishReason(
    reason: 'stop' | 'length' | 'content_filter'
  ): OpenAIResponse {
    const response = AzureResponseFactory.create();
    return {
      ...response,
      choices: [
        {
          ...response.choices[0],
          finish_reason: reason,
        },
      ],
    };
  }

  static createWithNullContent(): OpenAIResponse {
    const response = AzureResponseFactory.create();
    return {
      ...response,
      choices: [
        {
          ...response.choices[0],
          message: {
            ...response.choices[0].message,
            content: null,
          },
          finish_reason: 'content_filter',
        },
      ],
    };
  }

  static createWithMultipleChoices(count: number): OpenAIResponse {
    const response = AzureResponseFactory.create();
    const choices = Array.from({ length: count }, (_, i) => ({
      index: i,
      message: {
        role: 'assistant' as const,
        content: `Choice ${i} content`,
      },
      finish_reason: 'stop' as const,
    }));

    return {
      ...response,
      choices,
    };
  }

  static createMalformed(
    type: 'missing_id' | 'invalid_object' | 'empty_choices' | 'invalid_choice'
  ): Record<string, unknown> {
    const base = AzureResponseFactory.create();

    switch (type) {
      case 'missing_id': {
        const result: Record<string, unknown> = {
          object: base.object,
          created: base.created,
          model: base.model,
          choices: base.choices,
        };
        if (base.usage !== undefined) {
          result.usage = base.usage;
        }
        if (base.system_fingerprint !== undefined) {
          result.system_fingerprint = base.system_fingerprint;
        }
        return result;
      }

      case 'invalid_object':
        return {
          ...base,
          object: 'invalid_object',
        } as Record<string, unknown>;

      case 'empty_choices':
        return {
          ...base,
          choices: [],
        } as Record<string, unknown>;

      case 'invalid_choice':
        return {
          ...base,
          choices: [
            {
              index: 'invalid',
              message: 'not_an_object',
              finish_reason: 'invalid',
            },
          ],
        } as Record<string, unknown>;

      default:
        return base as Record<string, unknown>;
    }
  }
}

/**
 * Factory for creating Azure OpenAI errors
 */
export class AzureErrorFactory {
  static create(type = 'invalid_request_error', message?: string): OpenAIError {
    const messages: Record<string, string> = {
      invalid_request_error: 'The request is invalid',
      authentication_error: 'Invalid API key',
      permission_error: 'Permission denied',
      not_found_error: 'Resource not found',
      rate_limit_error: 'Rate limit exceeded',
      api_error: 'Internal API error',
      overloaded_error: 'Service overloaded',
    };

    const defaultMessage = messages[type] ?? 'Unknown error';
    return {
      error: {
        message: message ?? defaultMessage,
        type,
        code: `${type}_code`,
      },
    };
  }

  static createBatch(types: readonly string[]): OpenAIError[] {
    return types.map((type) => AzureErrorFactory.create(type));
  }

  static createWithSensitiveData(): OpenAIError {
    return {
      error: {
        message: 'Error with email user@example.com and Bearer token123',
        type: 'invalid_request_error',
        code: 'sensitive_data',
      },
    };
  }
}

/**
 * Factory for creating Azure OpenAI stream responses
 */
export class AzureStreamResponseFactory {
  private static counter = 0;

  static create(
    options: { content?: string; isComplete?: boolean; seed?: number } = {}
  ): AzureOpenAIStreamResponse {
    const {
      content = 'Stream content',
      isComplete = false,
      seed = AzureStreamResponseFactory.counter++,
    } = options;

    return {
      id: `chatcmpl-stream-${seed}`,
      object: 'chat.completion.chunk',
      created: 1640995200 + seed,
      model: 'gpt-4',
      choices: [
        {
          index: 0,
          delta: {
            role: 'assistant',
            content: isComplete ? undefined : content,
          },
          finish_reason: isComplete ? 'stop' : null,
        },
      ],
    };
  }

  static createSequence(
    contents: readonly string[]
  ): AzureOpenAIStreamResponse[] {
    const responses = contents.map((content, i) =>
      AzureStreamResponseFactory.create({ content, seed: i })
    );

    // Add completion marker
    responses.push(
      AzureStreamResponseFactory.create({
        isComplete: true,
        seed: contents.length,
      })
    );

    return responses;
  }
}

/**
 * Factory for creating OpenAI format requests
 */
export class OpenAIRequestFactory {
  private static readonly counter = 0;

  static create(
    options: {
      includeOptional?: boolean;
      language?: string;
      complexity?: 'simple' | 'medium' | 'complex';
    } = {}
  ): OpenAIRequest {
    const {
      includeOptional = false,
      language = 'typescript',
      complexity = 'medium',
    } = options;

    const prompt = (() => {
      switch (complexity) {
        case 'simple':
          return `Write a simple ${language} function`;
        case 'complex':
          return `Design a scalable ${language} microservice architecture with database integration`;
        case 'medium':
        default:
          return `Create a ${language} class with methods and error handling`;
      }
    })();

    const baseRequest: OpenAIRequest = {
      model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    };

    if (includeOptional) {
      return {
        ...baseRequest,
        max_tokens: 1000,
        temperature: 0.7,
        top_p: 0.9,
        stream: false,
      };
    }

    return baseRequest;
  }

  static createMultiTurn(turnCount: number): OpenAIRequest {
    const messages: OpenAIRequest['messages'] = [];

    for (let i = 0; i < turnCount; i++) {
      messages.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content:
          i % 2 === 0 ? `User message ${i + 1}` : `Assistant response ${i + 1}`,
      });
    }

    // Ensure last message is from user
    if (messages[messages.length - 1]?.role !== 'user') {
      messages.push({
        role: 'user',
        content: 'Continue the conversation',
      });
    }

    return {
      model: 'gpt-4',
      messages,
    };
  }
}

/**
 * Factory for creating Claude responses
 */
export class ClaudeResponseFactory {
  private static counter = 0;

  static create(options: TestDataOptions = {}): ClaudeCompletionResponse {
    const {
      size = 'medium',
      includeOptional = false,
      seed = ClaudeResponseFactory.counter++,
    } = options;

    const completions = {
      small: `Claude response ${seed}`,
      medium: `This is a Claude response ${seed} with some content.`,
      large: `This is a large Claude response ${seed} `.repeat(100) + 'End.',
    };

    const completionText =
      size === 'small'
        ? completions.small
        : size === 'medium'
          ? completions.medium
          : completions.large;

    const baseResponse: ClaudeCompletionResponse = {
      id: `claude-${seed}`,
      type: 'completion',
      completion: completionText,
      model: 'claude-3-5-sonnet-20241022',
      stop_reason: 'stop_sequence',
    };

    if (includeOptional) {
      return {
        ...baseResponse,
        usage: {
          input_tokens: 10 + seed,
          output_tokens: 15 + seed,
        },
      };
    }

    return baseResponse;
  }

  static createError(
    type = 'invalid_request_error',
    message?: string
  ): ClaudeError {
    return {
      type: 'error',
      error: {
        type,
        message: message ?? `Claude error: ${type}`,
      },
    };
  }
}

/**
 * Factory for creating malicious/security test data
 */
export class MaliciousDataFactory {
  static getXSSPayloads(): string[] {
    return [
      '<script>alert("xss")</script>',
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(1)>',
      // eslint-disable-next-line no-script-url
      'javascript:alert(1)',
      '<iframe src="javascript:alert(1)"></iframe>',
      '<body onload=alert(1)>',
      '<div onclick="alert(1)">Click me</div>',
      '<a href="javascript:alert(1)">Link</a>',
    ];
  }

  static getInjectionPayloads(): string[] {
    return [
      '{{user.password}}',
      '${user.secret}',
      '#{user.token}',
      '<%= user.data %>',
      '{{#each users}}{{password}}{{/each}}',
      '${7*7}',
      '{{constructor.constructor("alert(1)")()}}',
      '<script>{{user.data}}</script>',
    ];
  }

  static getControlCharacters(): string[] {
    return [
      'Hello\x00World',
      'Test\x01String',
      'Content\x02Here',
      'Data\x1FEnd',
      'Text\x7FMore',
      'Line\x0ABreak',
      'Tab\x09Separated',
    ];
  }

  static getSQLInjectionPayloads(): string[] {
    return [
      "'; DROP TABLE users; --",
      "' OR '1'='1",
      "' UNION SELECT * FROM users --",
      "'; INSERT INTO users VALUES ('hacker', 'password'); --",
      "' OR 1=1 --",
      "admin'--",
      "' OR 'a'='a",
    ];
  }

  static getPathTraversalPayloads(): string[] {
    return [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config\\sam',
      '....//....//....//etc/passwd',
      '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '..%252f..%252f..%252fetc%252fpasswd',
      '..%c0%af..%c0%af..%c0%afetc%c0%afpasswd',
    ];
  }

  static createMaliciousObject(): Record<string, unknown> {
    return {
      xss: '<script>alert("xss")</script>',
      injection: '{{user.secret}}',
      sql: "'; DROP TABLE users; --",
      path: '../../../etc/passwd',
      control: 'Hello\x00World',
      nested: {
        deep: {
          malicious: '<img onerror=alert(1) src=x>',
          normal: 'Safe content',
        },
      },
      array: [
        'Safe item',
        '<script>alert("array xss")</script>',
        // eslint-disable-next-line no-script-url
        { nested: 'javascript:alert(1)' },
      ],
    };
  }
}

/**
 * Factory for creating performance test data
 */
export class PerformanceDataFactory {
  static createLargeRequest(sizeKB: number): ClaudeRequest {
    const promptSize = sizeKB * 1024;
    const content = 'x'.repeat(promptSize);

    return {
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        {
          role: 'user',
          content,
        },
      ],
      max_tokens: 100,
    };
  }

  static createLargeResponse(sizeKB: number): OpenAIResponse {
    const contentSize = sizeKB * 1024;
    const content = 'x'.repeat(contentSize);

    return {
      id: 'chatcmpl-large',
      object: 'chat.completion',
      created: 1640995200,
      model: 'gpt-4',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content,
          },
          finish_reason: 'stop',
        },
      ],
    };
  }

  static createDeepObject(depth: number): Record<string, unknown> | string {
    if (depth === 0) {
      return 'Deep content with <script>alert("deep")</script>';
    }

    const levelKey = `level${depth}`;
    const result: Record<string, unknown> = {
      safe: `Safe content at level ${depth}`,
    };
    result[levelKey] = PerformanceDataFactory.createDeepObject(depth - 1);
    return result;
  }

  static createWideObject(width: number): Record<string, unknown> {
    const obj: Record<string, unknown> = {};

    for (let i = 0; i < width; i++) {
      const fieldKey = `field${i}`;
      obj[fieldKey] =
        i % 10 === 0 ? '<script>alert("wide")</script>' : `Safe content ${i}`;
    }

    return obj;
  }
}

/**
 * Factory for creating authentication test data
 */
export class AuthTestDataFactory {
  static getValidApiKeys(): string[] {
    return [
      'a'.repeat(32),
      'b'.repeat(64),
      'test-api-key-12345678901234567890123456789012',
      'sk-' + 'x'.repeat(48),
      'claude-api-' + 'y'.repeat(40),
    ];
  }

  static getInvalidApiKeys(): unknown[] {
    return [
      '',
      'short',
      'a'.repeat(10), // Too short
      null,
      undefined,
      123,
      {},
      [],
    ];
  }

  static createAuthHeaders(
    type: 'bearer' | 'api-key',
    key: string
  ): Record<string, string> {
    if (type === 'bearer') {
      return { authorization: `Bearer ${key}` };
    } else {
      return { 'x-api-key': key };
    }
  }

  static createMalformedAuthHeaders(): Record<string, string>[] {
    return [
      { authorization: 'Bearer' }, // Missing token
      { authorization: 'Basic dGVzdA==' }, // Wrong type
      { authorization: 'bearer token' }, // Wrong case
      { 'x-api-key': '' }, // Empty key
      { 'X-API-KEY': 'test' }, // Wrong case
      {}, // No auth headers
    ];
  }
}

/**
 * Factory for creating Responses API responses
 */
export class ResponsesResponseFactory {
  private static counter = 0;

  static create(
    options: {
      content?: string;
      includeReasoning?: boolean;
      includeUsage?: boolean;
      includeToolCalls?: boolean;
      reasoningContent?: string;
    } = {}
  ): ResponsesResponse {
    const {
      content = 'Test response content',
      includeReasoning = false,
      includeUsage = true,
      includeToolCalls = false,
      reasoningContent = 'Test reasoning content',
    } = options;

    const responseId = `resp-${Date.now()}-${ResponsesResponseFactory.counter++}`;

    const output: ResponsesResponse['output'] = [
      {
        type: 'text',
        text: content,
      },
    ];

    if (includeReasoning) {
      output.unshift({
        type: 'reasoning',
        reasoning: {
          content: reasoningContent,
          status: 'completed',
        },
      });
    }

    if (includeToolCalls) {
      output.push({
        type: 'tool_call',
        tool_call: {
          id: `${responseId}-tool`,
          type: 'function',
          function: {
            name: 'test_function',
            arguments: JSON.stringify({ value: 1 }),
          },
        },
      });
    }

    const response: ResponsesResponse = {
      id: responseId,
      object: 'response',
      created: Math.floor(Date.now() / 1000),
      model: 'gpt-5-codex',
      output,
      usage: includeUsage
        ? {
            input_tokens: 10,
            output_tokens: 20,
            total_tokens: 30,
            reasoning_tokens: includeReasoning ? 5 : undefined,
          }
        : {
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
          },
    };

    return response;
  }

  static createStreamChunk(
    options: {
      content?: string;
      isComplete?: boolean;
      includeReasoning?: boolean;
    } = {}
  ): ResponsesStreamChunk {
    const {
      content = 'Stream chunk',
      isComplete = false,
      includeReasoning = false,
    } = options;

    const chunkId = `resp_stream_${Date.now()}_${ResponsesResponseFactory.counter++}`;

    const output: ResponsesStreamChunk['output'] = [];

    if (includeReasoning && !isComplete) {
      output.push({
        type: 'reasoning',
        reasoning: {
          content: 'Reasoning in progress...',
          status: 'in_progress',
        },
      });
    }

    if (!isComplete) {
      output.push({
        type: 'text',
        text: content,
      });
    }

    const streamChunk: ResponsesStreamChunk = {
      id: chunkId,
      object: 'response.chunk',
      created: Math.floor(Date.now() / 1000),
      model: 'gpt-5-codex',
      output,
    };

    if (isComplete) {
      streamChunk.usage = {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };
    }

    return streamChunk;
  }
}

/**
 * Utility functions for test data
 */
export class TestDataUtils {
  static randomString(length: number): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  static randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  static randomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  static randomChoice<T>(array: readonly T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  static createCorrelationId(): string {
    return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  static createTimestamp(): string {
    return new Date().toISOString();
  }

  static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// All factories are already exported above with their class declarations
