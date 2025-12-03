import { beforeEach, describe, expect, it } from 'vitest';
import { ValidationError } from '../src/errors/index';
import type {
  ConversationContext,
  OpenAIMessage,
  OpenAIRequest,
} from '../src/types/index';
import {
  OpenAIToResponsesTransformer,
  createOpenAIToResponsesTransformer,
  transformOpenAIToResponses,
} from '../src/utils/openai-to-responses-transformer';

describe('OpenAIToResponsesTransformer', () => {
  let transformer: OpenAIToResponsesTransformer;
  const correlationId = 'test-correlation-id';

  beforeEach(() => {
    transformer = new OpenAIToResponsesTransformer(correlationId);
  });

  describe('transformRequest', () => {
    it('should transform basic OpenAI request to Responses API format', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Hello, how are you?',
          },
        ],
        max_tokens: 1000,
        temperature: 0.7,
        top_p: 0.9,
      };

      const result = transformer.transformRequest(openaiRequest);

      expect(result).toEqual({
        model: 'gpt-4',
        input: 'Hello, how are you?',
        reasoning: {
          effort: 'medium',
        },
        max_output_tokens: 1000,
        temperature: 0.7,
        top_p: 0.9,
      });
    });

    it('should handle OpenAI request with system message', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful programming assistant.',
          },
          {
            role: 'user',
            content: 'What is TypeScript?',
          },
        ],
      };

      const result = transformer.transformRequest(openaiRequest);

      expect(result.input).toEqual([
        {
          role: 'system',
          content: 'You are a helpful programming assistant.',
        },
        {
          role: 'user',
          content: 'What is TypeScript?',
        },
      ]);
    });

    it('should handle OpenAI request with tool calls', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Calculate 2 + 2',
          },
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call-123',
                type: 'function',
                function: {
                  name: 'calculator',
                  arguments: '{"expression": "2 + 2"}',
                },
              },
            ],
          },
        ],
      };

      const result = transformer.transformRequest(openaiRequest);

      expect(result.input).toEqual([
        {
          role: 'user',
          content: 'Calculate 2 + 2',
        },
        {
          role: 'assistant',
          content: '[Tool Call: calculator({"expression": "2 + 2"})]',
        },
      ]);
    });

    it('should handle OpenAI request with tool messages', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Calculate 2 + 2',
          },
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call-123',
                type: 'function',
                function: {
                  name: 'calculator',
                  arguments: '{"expression": "2 + 2"}',
                },
              },
            ],
          },
          {
            role: 'tool',
            content: '4',
            tool_call_id: 'call-123',
          },
        ],
      };

      const result = transformer.transformRequest(openaiRequest);

      expect(result.input).toEqual([
        {
          role: 'user',
          content: 'Calculate 2 + 2',
        },
        {
          role: 'assistant',
          content: '[Tool Call: calculator({"expression": "2 + 2"})]',
        },
        {
          role: 'user',
          content: '[Tool Result for call-123]: 4',
        },
      ]);
    });

    it('should handle conversation context with previous response ID', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Continue the conversation',
          },
        ],
      };

      const conversationContext: ConversationContext = {
        conversationId: 'conv-123',
        messageCount: 3,
        previousResponseId: 'resp-456',
        taskComplexity: 'medium',
        totalTokensUsed: 1500,
        averageResponseTime: 2000,
      };

      const result = transformer.transformRequest(
        openaiRequest,
        'high',
        conversationContext
      );

      expect(result.previous_response_id).toBe('resp-456');
      expect(result.reasoning?.effort).toBe('high');
    });

    it('should transform OpenAI tools to Responses API format', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Use the calculator tool',
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'calculator',
              description: 'Perform mathematical calculations',
              parameters: {
                type: 'object',
                properties: {
                  expression: {
                    type: 'string',
                  },
                },
                required: ['expression'],
              },
            },
          },
        ],
        tool_choice: {
          type: 'function',
          function: {
            name: 'calculator',
          },
        },
      };

      const result = transformer.transformRequest(openaiRequest);

      expect(result.tools).toEqual([
        {
          type: 'function',
          function: {
            name: 'calculator',
            description: 'Perform mathematical calculations',
            parameters: {
              type: 'object',
              properties: {
                expression: {
                  type: 'string',
                },
              },
              required: ['expression'],
            },
          },
        },
      ]);

      expect(result.tool_choice).toEqual({
        type: 'function',
        function: {
          name: 'calculator',
        },
      });
    });

    it('should handle streaming parameter', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Stream this response',
          },
        ],
        stream: true,
      };

      const result = transformer.transformRequest(openaiRequest);

      expect(result.stream).toBe(true);
    });

    it('should handle response format transformation', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Return JSON',
          },
        ],
        response_format: {
          type: 'json_object',
        },
      };

      const result = transformer.transformRequest(openaiRequest);

      expect(result.response_format).toEqual({
        type: 'json_object',
      });
    });
  });

  describe('validation', () => {
    it('should throw ValidationError for missing model', () => {
      const invalidRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      } as OpenAIRequest;

      expect(() => transformer.transformRequest(invalidRequest)).toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for empty messages array', () => {
      const invalidRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [],
      };

      expect(() => transformer.transformRequest(invalidRequest)).toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for invalid message role', () => {
      const invalidRequest = {
        model: 'gpt-4',
        messages: [{ role: 'invalid', content: 'Hello' }],
      } as OpenAIRequest;

      expect(() => transformer.transformRequest(invalidRequest)).toThrow(
        ValidationError
      );
    });

    it('should handle missing message content with default sanitization', () => {
      const requestWithMissingContent = {
        model: 'gpt-4',
        messages: [{ role: 'user' }], // Missing content will be sanitized
      } as OpenAIRequest;

      // Missing content is now handled with default sanitization
      const result = transformer.transformRequest(requestWithMissingContent);
      expect(result).toBeDefined();
      expect(result.input).toContain(
        '[Content was sanitized and removed for security]'
      );
    });

    it('should throw ValidationError for invalid tool call structure', () => {
      const invalidRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call-123',
                type: 'function',
                function: {
                  name: 'calculator',
                  // Missing arguments
                },
              } as any,
            ],
          },
        ],
      };

      expect(() => transformer.transformRequest(invalidRequest)).toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for tool message without tool_call_id', () => {
      const invalidRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'tool',
            content: 'Result',
            // Missing tool_call_id
          } as any,
        ],
      };

      expect(() => transformer.transformRequest(invalidRequest)).toThrow(
        ValidationError
      );
    });
  });

  describe('complexity estimation', () => {
    it('should estimate simple complexity for short single message', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Hi',
          },
        ],
      };

      const complexity =
        transformer.estimateConversationComplexity(openaiRequest);
      expect(complexity).toBe('simple');
    });

    it('should estimate medium complexity for multiple messages', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How are you?' },
          { role: 'assistant', content: 'I am doing well, thank you!' },
          { role: 'user', content: 'What can you help me with?' },
        ],
      };

      const complexity =
        transformer.estimateConversationComplexity(openaiRequest);
      expect(complexity).toBe('medium');
    });

    it('should estimate complex complexity for many messages', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: Array.from({ length: 15 }, (_, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i + 1}`,
        })) as OpenAIMessage[],
      };

      const complexity =
        transformer.estimateConversationComplexity(openaiRequest);
      expect(complexity).toBe('complex');
    });

    it('should estimate medium complexity for tool usage', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Calculate 2 + 2',
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'calculator',
              description: 'Perform calculations',
              parameters: { type: 'object' },
            },
          },
        ],
      };

      const complexity =
        transformer.estimateConversationComplexity(openaiRequest);
      expect(complexity).toBe('medium');
    });

    it('should estimate medium complexity for tool calls in messages', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Calculate something',
          },
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call-123',
                type: 'function',
                function: {
                  name: 'calculator',
                  arguments: '{}',
                },
              },
            ],
          },
        ],
      };

      const complexity =
        transformer.estimateConversationComplexity(openaiRequest);
      expect(complexity).toBe('medium');
    });

    it('should estimate complex complexity for long content', () => {
      const longContent = 'a'.repeat(15000);
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: longContent,
          },
        ],
      };

      const complexity =
        transformer.estimateConversationComplexity(openaiRequest);
      expect(complexity).toBe('complex');
    });

    it('should consider conversation context in complexity estimation', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Simple question',
          },
        ],
      };

      const conversationContext: ConversationContext = {
        conversationId: 'conv-123',
        messageCount: 25, // High message count
        taskComplexity: 'complex',
        totalTokensUsed: 5000,
        averageResponseTime: 3000,
      };

      const complexity = transformer.estimateConversationComplexity(
        openaiRequest,
        conversationContext
      );
      expect(complexity).toBe('complex');
    });
  });

  describe('Swift/iOS content detection', () => {
    it('should detect Swift keywords in content', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Help me with Swift programming and UIKit development',
          },
        ],
      };

      const isSwiftContent = transformer.detectSwiftIOSContent(openaiRequest);
      expect(isSwiftContent).toBe(true);
    });

    it('should detect iOS keywords in content', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content:
              'I need help with iPhone app development for the App Store',
          },
        ],
      };

      const isSwiftContent = transformer.detectSwiftIOSContent(openaiRequest);
      expect(isSwiftContent).toBe(true);
    });

    it('should detect Xcode-specific content', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'How do I configure Xcode for SwiftUI development?',
          },
        ],
      };

      const isSwiftContent = transformer.detectSwiftIOSContent(openaiRequest);
      expect(isSwiftContent).toBe(true);
    });

    it('should not detect Swift content in regular messages', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Help me with Python programming',
          },
        ],
      };

      const isSwiftContent = transformer.detectSwiftIOSContent(openaiRequest);
      expect(isSwiftContent).toBe(false);
    });

    it('should handle null content in messages', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call-123',
                type: 'function',
                function: {
                  name: 'calculator',
                  arguments: '{}',
                },
              },
            ],
          },
        ],
      };

      const isSwiftContent = transformer.detectSwiftIOSContent(openaiRequest);
      expect(isSwiftContent).toBe(false);
    });
  });

  describe('conversation ID generation', () => {
    it('should generate conversation ID from first user message', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Hello world, this is a test message',
          },
        ],
      };

      const conversationId = transformer.generateConversationId(openaiRequest);
      expect(conversationId).toMatch(/^conv_Helloworldthisisatestmessage_\d+$/);
    });

    it('should generate UUID-based conversation ID when no user message', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'assistant',
            content: 'I am an assistant',
          },
        ],
      };

      const conversationId = transformer.generateConversationId(openaiRequest);
      expect(conversationId).toMatch(/^conv_[a-f0-9-]+$/);
    });

    it('should handle null content in conversation ID generation', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: null,
          },
        ],
      };

      const conversationId = transformer.generateConversationId(openaiRequest);
      expect(conversationId).toMatch(/^conv_[a-f0-9-]+$/);
    });
  });

  describe('factory functions', () => {
    it('should create transformer instance via factory', () => {
      const factoryTransformer =
        createOpenAIToResponsesTransformer(correlationId);
      expect(factoryTransformer).toBeInstanceOf(OpenAIToResponsesTransformer);
    });

    it('should transform request via utility function', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Test message',
          },
        ],
      };

      const result = transformOpenAIToResponses(
        openaiRequest,
        correlationId,
        'high'
      );
      expect(result.reasoning?.effort).toBe('high');
      expect(result.input).toBe('Test message');
    });
  });

  describe('parameter mapping', () => {
    it('should map all OpenAI parameters correctly', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 2000,
        temperature: 0.8,
        top_p: 0.95,
        stream: true,
      };

      const result = transformer.transformRequest(openaiRequest, 'low');

      expect(result.model).toBe('gpt-4');
      expect(result.max_output_tokens).toBe(2000);
      expect(result.temperature).toBe(0.8);
      expect(result.top_p).toBe(0.95);
      expect(result.stream).toBe(true);
      expect(result.reasoning?.effort).toBe('low');
    });

    it('should handle optional parameters correctly', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
        // No optional parameters
      };

      const result = transformer.transformRequest(openaiRequest);

      expect(result.max_output_tokens).toBeUndefined();
      expect(result.temperature).toBeUndefined();
      expect(result.top_p).toBeUndefined();
      expect(result.stream).toBeUndefined();
      expect(result.reasoning?.effort).toBe('medium'); // Default
    });
  });

  describe('tool choice transformation', () => {
    it('should transform auto tool choice', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
        tool_choice: 'auto',
      };

      const result = transformer.transformRequest(openaiRequest);
      expect(result.tool_choice).toBe('auto');
    });

    it('should transform none tool choice', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
        tool_choice: 'none',
      };

      const result = transformer.transformRequest(openaiRequest);
      expect(result.tool_choice).toBe('none');
    });

    it('should transform specific tool choice', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
        tool_choice: {
          type: 'function',
          function: {
            name: 'calculator',
          },
        },
      };

      const result = transformer.transformRequest(openaiRequest);
      expect(result.tool_choice).toEqual({
        type: 'function',
        function: {
          name: 'calculator',
        },
      });
    });
  });

  describe('response format transformation', () => {
    it('should transform text response format', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
        response_format: {
          type: 'text',
        },
      };

      const result = transformer.transformRequest(openaiRequest);
      expect(result.response_format).toEqual({
        type: 'text',
      });
    });

    it('should transform json_object response format', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
        response_format: {
          type: 'json_object',
        },
      };

      const result = transformer.transformRequest(openaiRequest);
      expect(result.response_format).toEqual({
        type: 'json_object',
      });
    });

    it('should default to text for unknown response format', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
        response_format: {
          type: 'unknown' as any,
        },
      };

      const result = transformer.transformRequest(openaiRequest);
      expect(result.response_format).toEqual({
        type: 'text',
      });
    });
  });
});
