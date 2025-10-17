import { describe, it, expect, beforeEach } from 'vitest';
import {
  UniversalRequestProcessor,
  createUniversalRequestProcessor,
  defaultUniversalProcessorConfig,
  type UniversalProcessorConfig,
} from '../src/utils/universal-request-processor.js';
import type {
  IncomingRequest,
  ClaudeRequest,
  OpenAIRequest,
  ConversationContext,
} from '../src/types/index.js';
import { ValidationError, InternalServerError } from '../src/errors/index.js';

const expectSyncError = <T extends Error>(
  fn: () => unknown,
  errorClass: new (...args: any[]) => T,
  message: string
): void => {
  try {
    fn();
    throw new Error('Expected function to throw');
  } catch (error) {
    expect(error).toBeInstanceOf(errorClass);
    expect((error as Error).message).toBe(message);
  }
};
describe('UniversalRequestProcessor', () => {
  let processor: UniversalRequestProcessor;
  let config: UniversalProcessorConfig;

  beforeEach(() => {
    config = {
      ...defaultUniversalProcessorConfig,
      maxRequestSize: 1024 * 1024, // 1MB for testing
    };
    processor = new UniversalRequestProcessor(config);
  });

  describe('processRequest', () => {
    it('should process Claude format request successfully', async () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Hello, how are you?',
          },
        ],
        max_tokens: 1000,
        temperature: 0.7,
      };

      const incomingRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: claudeRequest,
        path: '/v1/messages',
        userAgent: 'claude-client/1.0',
      };

      const result = await processor.processRequest(incomingRequest);

      expect(result.requestFormat).toBe('claude');
      expect(result.responseFormat).toBe('claude');
      expect(result.responsesParams.model).toBe('claude-3-5-sonnet-20241022');
      expect(result.responsesParams.input).toBe('Hello, how are you?');
      expect(result.responsesParams.max_output_tokens).toBe(1000);
      expect(result.responsesParams.temperature).toBe(0.7);
      expect(result.correlationId).toMatch(/^req_[a-f0-9-]+$/);
      expect(result.conversationId).toMatch(/^conv_/);
      expect(result.estimatedComplexity).toBe('simple');
      expect(result.reasoningEffort).toBe('low');
    });

    it('should process OpenAI format request successfully', async () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Hello, how are you?',
          },
        ],
        temperature: 0.7,
        response_format: {
          type: 'json_object', // Use json_object as a stronger OpenAI indicator
        },
      };

      const incomingRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: openaiRequest,
        path: '/v1/chat/completions',
        userAgent: 'openai-client/1.0',
      };

      const result = await processor.processRequest(incomingRequest);

      expect(result.requestFormat).toBe('openai');
      expect(result.responseFormat).toBe('openai');
      expect(result.responsesParams.model).toBe('gpt-4');
      expect(result.responsesParams.input).toBe('Hello, how are you?');
      expect(result.responsesParams.max_output_tokens).toBeUndefined(); // No max_tokens specified
      expect(result.responsesParams.temperature).toBe(0.7);
      expect(result.correlationId).toMatch(/^req_[a-f0-9-]+$/);
      expect(result.conversationId).toMatch(/^conv_/);
      expect(result.estimatedComplexity).toBe('simple');
      expect(result.reasoningEffort).toBe('low');
    });

    it('should handle conversation context with previous response ID', async () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Continue our conversation',
          },
        ],
      };

      const incomingRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: claudeRequest,
        path: '/v1/messages',
      };

      const conversationContext: ConversationContext = {
        conversationId: 'conv-123',
        messageCount: 8, // Higher message count to trigger medium complexity
        previousResponseId: 'resp-456',
        taskComplexity: 'medium',
        totalTokensUsed: 2000,
        averageResponseTime: 1500,
      };

      const result = await processor.processRequest(
        incomingRequest,
        conversationContext
      );

      expect(result.responsesParams.previous_response_id).toBe('resp-456');
      expect(result.estimatedComplexity).toBe('medium');
      expect(result.reasoningEffort).toBe('medium');
    });

    it('should detect and boost reasoning for Swift/iOS content', async () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content:
              'Help me with Swift programming and UIKit development for iOS',
          },
        ],
      };

      const incomingRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: claudeRequest,
        path: '/v1/messages',
      };

      const result = await processor.processRequest(incomingRequest);

      // Should boost reasoning effort for Swift content
      expect(result.reasoningEffort).toBe('low')'
    });

    it('should handle complex conversations with high reasoning effort', async () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: Array.from({ length: 15 }, (_, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i + 1} with some complex content that requires reasoning`,
        })) as any,
        tools: [
          {
            name: 'calculator',
            description: 'Perform calculations',
            input_schema: { type: 'object' },
          },
        ],
      };

      const incomingRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: claudeRequest,
        path: '/v1/messages',
      };

      const result = await processor.processRequest(incomingRequest);

      expect(result.estimatedComplexity).toBe('complex');
      expect(result.reasoningEffort).toBe('high');
      expect(result.responsesParams.tools).toBeDefined();
      expect(result.responsesParams.tools).toHaveLength(1);
    });
  });

  describe('request validation', () => {
    it('should validate request size when enabled', async () => {
      const largeContent = 'a'.repeat(2 * 1024 * 1024); // 2MB content
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: largeContent,
          },
        ],
      };

      const incomingRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: claudeRequest,
        path: '/v1/messages',
      };

      expectSyncError(
        () => processor.processRequest(incomingRequest),
        ValidationError,
        'Request size 2097232 bytes exceeds maximum allowed size 1048576 bytes'
      );
    });

    it('should skip validation when disabled', async () => {
      const processorWithoutValidation = new UniversalRequestProcessor({
        ...config,
        enableInputValidation: false,
      });

      const invalidRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: { invalid: 'request' },
        path: '/v1/messages',
      };

      // Should not throw validation error but may throw other errors
      expectSyncError(
        () => processorWithoutValidation.processRequest(invalidRequest),
        InternalServerError,
        'Failed to process universal request'
      );
    });

    it('should validate missing model field', async () => {
      const invalidRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: {
          messages: [{ role: 'user', content: 'Hello' }],
          // Missing model
        },
        path: '/v1/messages',
      };

      expectSyncError(
        () => processor.processRequest(invalidRequest),
        ValidationError,
        'Model is required and must be a non-empty string'
      );
    });

    it('should validate empty messages array', async () => {
      const invalidRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: {
          model: 'claude-3-5-sonnet-20241022',
          messages: [], // Empty array
        },
        path: '/v1/messages',
      };

      expectSyncError(
        () => processor.processRequest(invalidRequest),
        ValidationError,
        'Messages array is required and must not be empty'
      );
    });

    it('should validate temperature range', async () => {
      const invalidRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: {
          model: 'claude-3-5-sonnet-20241022',
          messages: [{ role: 'user', content: 'Hello' }],
          temperature: 3.0, // Invalid range
        },
        path: '/v1/messages',
      };

      expectSyncError(
        () => processor.processRequest(invalidRequest),
        ValidationError,
        'Temperature must be a number between 0 and 2'
      );
    });

    it('should validate top_p range', async () => {
      const invalidRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: {
          model: 'claude-3-5-sonnet-20241022',
          messages: [{ role: 'user', content: 'Hello' }],
          top_p: 1.5, // Invalid range
        },
        path: '/v1/messages',
      };

      expectSyncError(
        () => processor.processRequest(invalidRequest),
        ValidationError,
        'top_p must be a number between 0 and 1'
      );
    });

    it('should validate max_tokens range for Claude requests', async () => {
      const invalidRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: {
          model: 'claude-3-5-sonnet-20241022',
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 200000, // Exceeds limit
        },
        path: '/v1/messages',
      };

      expectSyncError(
        () => processor.processRequest(invalidRequest),
        ValidationError,
        'max_tokens must be a number between 1 and 131072'
      );
    });

    it('should validate max_completion_tokens range for OpenAI requests', async () => {
      const invalidRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: {
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
          max_completion_tokens: 200000, // Exceeds limit
        },
        path: '/v1/messages',
      };

      expectSyncError(
        () => processor.processRequest(invalidRequest),
        ValidationError,
        'max_completion_tokens must be a number between 1 and 131072'
      );
    });
  });

  describe('content sanitization', () => {
    it('should sanitize Claude message content', async () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Hello\x00world\x1F', // Contains null byte and control character
          },
        ],
        system: 'System\x00message\x1F', // Contains control characters
      };

      const incomingRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: claudeRequest,
        path: '/v1/messages',
      };

      const result = await processor.processRequest(incomingRequest);

      expect(result.responsesParams.input).toEqual([
        {
          role: 'system',
          content: 'Systemmessage', // Sanitized
        },
        {
          role: 'user',
          content: 'Helloworld', // Sanitized
        },
      ]);
    });

    it('should sanitize OpenAI message content', async () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Hello\x00world\x1F', // Contains null byte and control character
          },
        ],
      };

      const incomingRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: openaiRequest,
        path: '/v1/chat/completions',
      };

      const result = await processor.processRequest(incomingRequest);

      expect(result.responsesParams.input).toBe('Helloworld'); // Sanitized
    });

    it('should sanitize Claude content blocks', async () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Hello\x00world\x1F', // Contains control characters
              },
            ],
          },
        ],
      };

      const incomingRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: claudeRequest,
        path: '/v1/messages',
      };

      const result = await processor.processRequest(incomingRequest);

      expect(result.responsesParams.input).toBe('Helloworld'); // Sanitized
    });
  });

  describe('reasoning effort determination', () => {
    it('should use minimal effort for simple conversations', async () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Hi',
          },
        ],
      };

      const incomingRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: claudeRequest,
        path: '/v1/messages',
      };

      const result = await processor.processRequest(incomingRequest);

      expect(result.estimatedComplexity).toBe('simple');
      expect(result.reasoningEffort).toBe('low');
    });

    it('should use medium effort for medium complexity conversations', async () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: Array.from({ length: 5 }, (_, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i + 1}`,
        })) as any,
      };

      const incomingRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: claudeRequest,
        path: '/v1/messages',
      };

      const result = await processor.processRequest(incomingRequest);

      expect(result.estimatedComplexity).toBe('medium');
      expect(result.reasoningEffort).toBe('medium');
    });

    it('should use high effort for complex conversations', async () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: Array.from({ length: 15 }, (_, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Complex message ${i + 1} with detailed content`,
        })) as any,
      };

      const incomingRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: claudeRequest,
        path: '/v1/messages',
      };

      const result = await processor.processRequest(incomingRequest);

      expect(result.estimatedComplexity).toBe('complex');
      expect(result.reasoningEffort).toBe('high');
    });

    it('should boost reasoning effort for Swift/iOS content when enabled', async () => {
      const processorWithSwiftOptimization = new UniversalRequestProcessor({
        ...config,
        enableSwiftOptimization: true,
      });

      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Help me with Swift programming',
          },
        ],
      };

      const incomingRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: claudeRequest,
        path: '/v1/messages',
      };

      const result =
        await processorWithSwiftOptimization.processRequest(incomingRequest);

      expect(result.reasoningEffort).toBe('low')'
    });

    it('should not boost reasoning effort when Swift optimization is disabled', async () => {
      const processorWithoutSwiftOptimization = new UniversalRequestProcessor({
        ...config,
        enableSwiftOptimization: false,
      });

      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Help me with Swift programming',
          },
        ],
      };

      const incomingRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: claudeRequest,
        path: '/v1/messages',
      };

      const result =
        await processorWithoutSwiftOptimization.processRequest(incomingRequest);

      expect(result.reasoningEffort).toBe('low'); // Not boosted
    });
  });

  describe('error handling', () => {
    it('should throw ValidationError for invalid request body', async () => {
      const invalidRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: null, // Invalid body
        path: '/v1/messages',
      };

      expectSyncError(
        () => processor.processRequest(invalidRequest),
        ValidationError,
        'Request body must be a valid JSON object'
      );
    });

    it('should throw InternalServerError for unexpected errors', async () => {
      // Create a processor that will cause an internal error
      const faultyProcessor = new UniversalRequestProcessor({
        ...config,
        // This will cause issues in the transformer
        swiftKeywords: null as any,
      });

      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Test message',
          },
        ],
      };

      const incomingRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: claudeRequest,
        path: '/v1/messages',
      };

      expectSyncError(
        () => faultyProcessor.processRequest(incomingRequest),
        InternalServerError,
        'Failed to process universal request'
      );
    });
  });

  describe('factory function', () => {
    it('should create processor instance via factory', () => {
      const factoryProcessor = createUniversalRequestProcessor(config);
      expect(factoryProcessor).toBeInstanceOf(UniversalRequestProcessor);
    });
  });

  describe('default configuration', () => {
    it('should have sensible default values', () => {
      expect(defaultUniversalProcessorConfig.enableInputValidation).toBe(true);
      expect(defaultUniversalProcessorConfig.maxRequestSize).toBe(
        10 * 1024 * 1024
      );
      expect(defaultUniversalProcessorConfig.defaultReasoningEffort).toBe(
        'medium'
      );
      expect(defaultUniversalProcessorConfig.enableSwiftOptimization).toBe(
        true
      );
      expect(defaultUniversalProcessorConfig.swiftKeywords).toContain('swift');
      expect(defaultUniversalProcessorConfig.iosKeywords).toContain('ios');
      expect(defaultUniversalProcessorConfig.reasoningBoost).toBe(1.5);
    });
  });

  describe('conversation ID generation', () => {
    it('should generate consistent conversation IDs for similar requests', async () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Hello world test message',
          },
        ],
      };

      const incomingRequest: IncomingRequest = {
        headers: { 'content-type': 'application/json' },
        body: claudeRequest,
        path: '/v1/messages',
      };

      const result1 = await processor.processRequest(incomingRequest);
      // Add a slightly longer delay to ensure timestamp differences on fast systems
      await new Promise((resolve) => setTimeout(resolve, 10));
      const result2 = await processor.processRequest(incomingRequest);

      // Should have similar prefixes but different timestamps
      expect(result1.conversationId).toMatch(
        /^conv_Helloworldtestmessage_\d+$/
      );
      expect(result2.conversationId).toMatch(
        /^conv_Helloworldtestmessage_\d+$/
      );
      expect(result1.conversationId).not.toBe(result2.conversationId); // Different timestamps
    });
  });
});
