/**
 * Test data factories for consistent test setup
 * Provides reusable test data generators with various configurations
 */

import type {
  ClaudeCompletionRequest,
  AzureOpenAIResponse,
  AzureOpenAIError,
  AzureOpenAIStreamResponse,
  ClaudeCompletionResponse,
  ClaudeError
} from '../src/types/index.js';

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

  static create(options: TestDataOptions = {}): ClaudeCompletionRequest {
    const {
      size = 'medium',
      includeOptional = false,
      seed = ClaudeRequestFactory.counter++
    } = options;

    const prompts = {
      small: `Test prompt ${seed}`,
      medium: `This is a medium-sized test prompt ${seed} with some additional content to make it more realistic.`,
      large: `This is a large test prompt ${seed} `.repeat(100) + 'End of large prompt.'
    };

    const baseRequest: ClaudeCompletionRequest = {
      model: 'claude-3-5-sonnet-20241022',
      prompt: prompts[size],
      max_tokens: size === 'small' ? 50 : size === 'medium' ? 100 : 500
    };

    if (includeOptional) {
      return {
        ...baseRequest,
        temperature: 0.7,
        top_p: 0.9,
        top_k: 40,
        stop_sequences: ['END', 'STOP'],
        stream: false
      };
    }

    return baseRequest;
  }

  static createBatch(count: number, options: TestDataOptions = {}): ClaudeCompletionRequest[] {
    return Array.from({ length: count }, (_, i) => 
      ClaudeRequestFactory.create({ ...options, seed: i })
    );
  }

  static createInvalid(type: 'missing_field' | 'invalid_type' | 'out_of_range' | 'malicious'): any {
    const base = ClaudeRequestFactory.create();

    switch (type) {
      case 'missing_field':
        const { prompt, ...withoutPrompt } = base;
        return withoutPrompt;

      case 'invalid_type':
        return {
          ...base,
          max_tokens: 'invalid_number'
        };

      case 'out_of_range':
        return {
          ...base,
          max_tokens: 200000, // Exceeds limit
          temperature: 3.0 // Exceeds limit
        };

      case 'malicious':
        return {
          ...base,
          prompt: '<script>alert("xss")</script>',
          model: 'claude{{user.secret}}'
        };

      default:
        return base;
    }
  }

  static createEdgeCase(type: 'empty' | 'unicode' | 'very_long' | 'special_chars'): ClaudeCompletionRequest {
    const base = ClaudeRequestFactory.create();

    switch (type) {
      case 'empty':
        return {
          ...base,
          prompt: '',
          max_tokens: 1
        };

      case 'unicode':
        return {
          ...base,
          prompt: 'Hello 世界 🌍 café naïve résumé ∑∫∆√π'
        };

      case 'very_long':
        return {
          ...base,
          prompt: 'Very long prompt: ' + 'x'.repeat(50000),
          max_tokens: 131072
        };

      case 'special_chars':
        return {
          ...base,
          prompt: 'Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?`~'
        };

      default:
        return base;
    }
  }
}

/**
 * Factory for creating Azure OpenAI responses
 */
export class AzureResponseFactory {
  private static counter = 0;

  static create(options: TestDataOptions = {}): AzureOpenAIResponse {
    const {
      size = 'medium',
      includeOptional = false,
      seed = AzureResponseFactory.counter++
    } = options;

    const contents = {
      small: `Response ${seed}`,
      medium: `This is a medium response ${seed} with some content.`,
      large: `This is a large response ${seed} `.repeat(200) + 'End of response.'
    };

    const baseResponse: AzureOpenAIResponse = {
      id: `chatcmpl-${seed}`,
      object: 'chat.completion',
      created: 1640995200 + seed,
      model: 'gpt-4',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: contents[size]
        },
        finish_reason: 'stop'
      }]
    };

    if (includeOptional) {
      return {
        ...baseResponse,
        usage: {
          prompt_tokens: 10 + seed,
          completion_tokens: 15 + seed,
          total_tokens: 25 + (seed * 2)
        },
        system_fingerprint: `fp_${seed}`
      };
    }

    return baseResponse;
  }

  static createBatch(count: number, options: TestDataOptions = {}): AzureOpenAIResponse[] {
    return Array.from({ length: count }, (_, i) => 
      AzureResponseFactory.create({ ...options, seed: i })
    );
  }

  static createWithFinishReason(reason: 'stop' | 'length' | 'content_filter'): AzureOpenAIResponse {
    const response = AzureResponseFactory.create();
    return {
      ...response,
      choices: [{
        ...response.choices[0],
        finish_reason: reason
      }]
    };
  }

  static createWithNullContent(): AzureOpenAIResponse {
    const response = AzureResponseFactory.create();
    return {
      ...response,
      choices: [{
        ...response.choices[0],
        message: {
          ...response.choices[0].message,
          content: null
        },
        finish_reason: 'content_filter'
      }]
    };
  }

  static createWithMultipleChoices(count: number): AzureOpenAIResponse {
    const response = AzureResponseFactory.create();
    const choices = Array.from({ length: count }, (_, i) => ({
      index: i,
      message: {
        role: 'assistant' as const,
        content: `Choice ${i} content`
      },
      finish_reason: 'stop' as const
    }));

    return {
      ...response,
      choices
    };
  }

  static createMalformed(type: 'missing_id' | 'invalid_object' | 'empty_choices' | 'invalid_choice'): any {
    const base = AzureResponseFactory.create();

    switch (type) {
      case 'missing_id':
        const { id, ...withoutId } = base;
        return withoutId;

      case 'invalid_object':
        return {
          ...base,
          object: 'invalid_object'
        };

      case 'empty_choices':
        return {
          ...base,
          choices: []
        };

      case 'invalid_choice':
        return {
          ...base,
          choices: [{
            index: 'invalid',
            message: 'not_an_object',
            finish_reason: 'invalid'
          }]
        };

      default:
        return base;
    }
  }
}

/**
 * Factory for creating Azure OpenAI errors
 */
export class AzureErrorFactory {
  static create(type: string = 'invalid_request_error', message?: string): AzureOpenAIError {
    const messages = {
      'invalid_request_error': 'The request is invalid',
      'authentication_error': 'Invalid API key',
      'permission_error': 'Permission denied',
      'not_found_error': 'Resource not found',
      'rate_limit_error': 'Rate limit exceeded',
      'api_error': 'Internal API error',
      'overloaded_error': 'Service overloaded'
    };

    return {
      error: {
        message: message || messages[type] || 'Unknown error',
        type,
        code: `${type}_code`
      }
    };
  }

  static createBatch(types: string[]): AzureOpenAIError[] {
    return types.map(type => AzureErrorFactory.create(type));
  }

  static createWithSensitiveData(): AzureOpenAIError {
    return {
      error: {
        message: 'Error with email user@example.com and Bearer token123',
        type: 'invalid_request_error',
        code: 'sensitive_data'
      }
    };
  }
}

/**
 * Factory for creating Azure OpenAI stream responses
 */
export class AzureStreamResponseFactory {
  private static counter = 0;

  static create(options: { content?: string; isComplete?: boolean; seed?: number } = {}): AzureOpenAIStreamResponse {
    const {
      content = 'Stream content',
      isComplete = false,
      seed = AzureStreamResponseFactory.counter++
    } = options;

    return {
      id: `chatcmpl-stream-${seed}`,
      object: 'chat.completion.chunk',
      created: 1640995200 + seed,
      model: 'gpt-4',
      choices: [{
        index: 0,
        delta: {
          role: 'assistant',
          content: isComplete ? undefined : content
        },
        finish_reason: isComplete ? 'stop' : null
      }]
    };
  }

  static createSequence(contents: string[]): AzureOpenAIStreamResponse[] {
    const responses = contents.map((content, i) => 
      AzureStreamResponseFactory.create({ content, seed: i })
    );

    // Add completion marker
    responses.push(AzureStreamResponseFactory.create({ isComplete: true, seed: contents.length }));

    return responses;
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
      seed = ClaudeResponseFactory.counter++
    } = options;

    const completions = {
      small: `Claude response ${seed}`,
      medium: `This is a Claude response ${seed} with some content.`,
      large: `This is a large Claude response ${seed} `.repeat(100) + 'End.'
    };

    const baseResponse: ClaudeCompletionResponse = {
      id: `claude-${seed}`,
      type: 'completion',
      completion: completions[size],
      model: 'claude-3-5-sonnet-20241022',
      stop_reason: 'stop_sequence'
    };

    if (includeOptional) {
      return {
        ...baseResponse,
        usage: {
          input_tokens: 10 + seed,
          output_tokens: 15 + seed
        }
      };
    }

    return baseResponse;
  }

  static createError(type: string = 'invalid_request_error', message?: string): ClaudeError {
    return {
      type: 'error',
      error: {
        type,
        message: message || `Claude error: ${type}`
      }
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
      'javascript:alert(1)',
      '<iframe src="javascript:alert(1)"></iframe>',
      '<body onload=alert(1)>',
      '<div onclick="alert(1)">Click me</div>',
      '<a href="javascript:alert(1)">Link</a>'
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
      '<script>{{user.data}}</script>'
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
      'Tab\x09Separated'
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
      "' OR 'a'='a"
    ];
  }

  static getPathTraversalPayloads(): string[] {
    return [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config\\sam',
      '....//....//....//etc/passwd',
      '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '..%252f..%252f..%252fetc%252fpasswd',
      '..%c0%af..%c0%af..%c0%afetc%c0%afpasswd'
    ];
  }

  static createMaliciousObject(): any {
    return {
      xss: '<script>alert("xss")</script>',
      injection: '{{user.secret}}',
      sql: "'; DROP TABLE users; --",
      path: '../../../etc/passwd',
      control: 'Hello\x00World',
      nested: {
        deep: {
          malicious: '<img onerror=alert(1) src=x>',
          normal: 'Safe content'
        }
      },
      array: [
        'Safe item',
        '<script>alert("array xss")</script>',
        { nested: 'javascript:alert(1)' }
      ]
    };
  }
}

/**
 * Factory for creating performance test data
 */
export class PerformanceDataFactory {
  static createLargeRequest(sizeKB: number): ClaudeCompletionRequest {
    const promptSize = sizeKB * 1024;
    const prompt = 'x'.repeat(promptSize);

    return {
      model: 'claude-3-5-sonnet-20241022',
      prompt,
      max_tokens: 100
    };
  }

  static createLargeResponse(sizeKB: number): AzureOpenAIResponse {
    const contentSize = sizeKB * 1024;
    const content = 'x'.repeat(contentSize);

    return {
      id: 'chatcmpl-large',
      object: 'chat.completion',
      created: 1640995200,
      model: 'gpt-4',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content
        },
        finish_reason: 'stop'
      }]
    };
  }

  static createDeepObject(depth: number): any {
    if (depth === 0) {
      return 'Deep content with <script>alert("deep")</script>';
    }

    return {
      [`level${depth}`]: PerformanceDataFactory.createDeepObject(depth - 1),
      safe: `Safe content at level ${depth}`
    };
  }

  static createWideObject(width: number): any {
    const obj: any = {};
    
    for (let i = 0; i < width; i++) {
      obj[`field${i}`] = i % 10 === 0 ? 
        '<script>alert("wide")</script>' : 
        `Safe content ${i}`;
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
      'claude-api-' + 'y'.repeat(40)
    ];
  }

  static getInvalidApiKeys(): string[] {
    return [
      '',
      'short',
      'a'.repeat(10), // Too short
      null as any,
      undefined as any,
      123 as any,
      {} as any,
      [] as any
    ];
  }

  static createAuthHeaders(type: 'bearer' | 'api-key', key: string): Record<string, string> {
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
      {} // No auth headers
    ];
  }
}

/**
 * Utility functions for test data
 */
export class TestDataUtils {
  static randomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
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

  static randomChoice<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  static createCorrelationId(): string {
    return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  static createTimestamp(): string {
    return new Date().toISOString();
  }

  static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// All factories are already exported above with their class declarations