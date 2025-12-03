import { beforeEach, describe, expect, it } from 'vitest';
import { ValidationError } from '../src/errors/index';
import type {
  ClaudeContentBlock,
  ClaudeMessage,
  ClaudeRequest,
  ConversationContext,
} from '../src/types/index';
import {
  ClaudeToResponsesTransformer,
  createClaudeToResponsesTransformer,
  transformClaudeToResponses,
} from '../src/utils/claude-to-responses-transformer';

describe('ClaudeToResponsesTransformer', () => {
  let transformer: ClaudeToResponsesTransformer;
  const correlationId = 'test-correlation-id';

  beforeEach(() => {
    transformer = new ClaudeToResponsesTransformer(correlationId);
  });

  describe('transformRequest', () => {
    it('should transform basic Claude request to Responses API format', () => {
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
        top_p: 0.9,
      };

      const result = transformer.transformRequest(claudeRequest);

      expect(result).toEqual({
        model: 'claude-3-5-sonnet-20241022',
        input: 'Hello, how are you?',
        reasoning: {
          effort: 'medium',
        },
        max_output_tokens: 1000,
        temperature: 0.7,
        top_p: 0.9,
      });
    });

    it('should handle Claude request with system message', () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'What is TypeScript?',
          },
        ],
        system: 'You are a helpful programming assistant.',
      };

      const result = transformer.transformRequest(claudeRequest);

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

    it('should handle Claude request with content blocks', () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Explain this code:',
              },
              {
                type: 'text',
                text: 'function hello() { console.log("Hello"); }',
              },
            ],
          },
        ],
      };

      const result = transformer.transformRequest(claudeRequest);

      expect(result.input).toBe(
        'Explain this code:\nfunction hello() { console.log("Hello"); }'
      );
    });

    it('should handle conversation context with previous response ID', () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
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
        claudeRequest,
        'high',
        conversationContext
      );

      expect(result.previous_response_id).toBe('resp-456');
      expect(result.reasoning?.effort).toBe('high');
    });

    it('should transform Claude tools to Responses API format', () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Use the calculator tool',
          },
        ],
        tools: [
          {
            name: 'calculator',
            description: 'Perform mathematical calculations',
            input_schema: {
              type: 'object',
              properties: {
                expression: {
                  type: 'string',
                },
              },
              required: ['expression'],
            },
          },
        ],
        tool_choice: {
          type: 'tool',
          name: 'calculator',
        },
      };

      const result = transformer.transformRequest(claudeRequest);

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
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Stream this response',
          },
        ],
        stream: true,
      };

      const result = transformer.transformRequest(claudeRequest);

      expect(result.stream).toBe(true);
    });

    it('should handle tool use and tool result content blocks', () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'tool-123',
                name: 'calculator',
                input: { expression: '2 + 2' },
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool-123',
                content: '4',
              },
            ],
          },
        ],
      };

      const result = transformer.transformRequest(claudeRequest);

      expect(result.input).toEqual([
        {
          role: 'assistant',
          content: '[Tool Use: calculator]',
        },
        {
          role: 'user',
          content: '[Tool Result: 4]',
        },
      ]);
    });
  });

  describe('validation', () => {
    it('should throw ValidationError for missing model', () => {
      const invalidRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      } as ClaudeRequest;

      expect(() => transformer.transformRequest(invalidRequest)).toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for empty messages array', () => {
      const invalidRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [],
      };

      expect(() => transformer.transformRequest(invalidRequest)).toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for invalid message role', () => {
      const invalidRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'invalid', content: 'Hello' }],
      } as ClaudeRequest;

      expect(() => transformer.transformRequest(invalidRequest)).toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for missing message content', () => {
      const invalidRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user' }],
      } as ClaudeRequest;

      expect(() => transformer.transformRequest(invalidRequest)).toThrow(
        ValidationError
      );
    });

    it('should handle invalid content block with default text', () => {
      const requestWithMissingText: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                // Missing text property will be handled with default
              } as ClaudeContentBlock,
            ],
          },
        ],
      };

      // Missing text property is now handled with default content
      const result = transformer.transformRequest(requestWithMissingText);
      expect(result).toBeDefined();
      expect(result.input).toContain(
        '[Content was processed and converted to text]'
      );
    });
  });

  describe('complexity estimation', () => {
    it('should estimate simple complexity for short single message', () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Hi',
          },
        ],
      };

      const complexity =
        transformer.estimateConversationComplexity(claudeRequest);
      expect(complexity).toBe('simple');
    });

    it('should estimate medium complexity for multiple messages', () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How are you?' },
          { role: 'assistant', content: 'I am doing well, thank you!' },
          { role: 'user', content: 'What can you help me with?' },
        ],
      };

      const complexity =
        transformer.estimateConversationComplexity(claudeRequest);
      expect(complexity).toBe('medium');
    });

    it('should estimate complex complexity for many messages', () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: Array.from({ length: 15 }, (_, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i + 1}`,
        })) as ClaudeMessage[],
      };

      const complexity =
        transformer.estimateConversationComplexity(claudeRequest);
      expect(complexity).toBe('complex');
    });

    it('should estimate medium complexity for tool usage', () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Calculate 2 + 2',
          },
        ],
        tools: [
          {
            name: 'calculator',
            description: 'Perform calculations',
            input_schema: { type: 'object' },
          },
        ],
      };

      const complexity =
        transformer.estimateConversationComplexity(claudeRequest);
      expect(complexity).toBe('medium');
    });

    it('should estimate complex complexity for long content', () => {
      const longContent = 'a'.repeat(15000);
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: longContent,
          },
        ],
      };

      const complexity =
        transformer.estimateConversationComplexity(claudeRequest);
      expect(complexity).toBe('complex');
    });

    it('should consider conversation context in complexity estimation', () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
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
        claudeRequest,
        conversationContext
      );
      expect(complexity).toBe('complex');
    });
  });

  describe('conversation ID generation', () => {
    it('should generate conversation ID from first user message', () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Hello world, this is a test message',
          },
        ],
      };

      const conversationId = transformer.generateConversationId(claudeRequest);
      expect(conversationId).toMatch(/^conv_Helloworldthisisatestmessage_\d+$/);
    });

    it('should generate UUID-based conversation ID when no user message', () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'assistant',
            content: 'I am an assistant',
          },
        ],
      };

      const conversationId = transformer.generateConversationId(claudeRequest);
      expect(conversationId).toMatch(/^conv_[a-f0-9-]+$/);
    });

    it('should handle content blocks in conversation ID generation', () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Hello from content blocks',
              },
            ],
          },
        ],
      };

      const conversationId = transformer.generateConversationId(claudeRequest);
      expect(conversationId).toMatch(/^conv_Hellofromcontentblocks_\d+$/);
    });
  });

  describe('factory functions', () => {
    it('should create transformer instance via factory', () => {
      const factoryTransformer =
        createClaudeToResponsesTransformer(correlationId);
      expect(factoryTransformer).toBeInstanceOf(ClaudeToResponsesTransformer);
    });

    it('should transform request via utility function', () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Test message',
          },
        ],
      };

      const result = transformClaudeToResponses(
        claudeRequest,
        correlationId,
        'high'
      );
      expect(result.reasoning?.effort).toBe('high');
      expect(result.input).toBe('Test message');
    });
  });

  describe('parameter mapping', () => {
    it('should map all Claude parameters correctly', () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 2000,
        temperature: 0.8,
        top_p: 0.95,
        stream: true,
      };

      const result = transformer.transformRequest(claudeRequest, 'low');

      expect(result.model).toBe('claude-3-5-sonnet-20241022');
      expect(result.max_output_tokens).toBe(2000);
      expect(result.temperature).toBe(0.8);
      expect(result.top_p).toBe(0.95);
      expect(result.stream).toBe(true);
      expect(result.reasoning?.effort).toBe('low');
    });

    it('should handle optional parameters correctly', () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Test' }],
        // No optional parameters
      };

      const result = transformer.transformRequest(claudeRequest);

      expect(result.max_output_tokens).toBeUndefined();
      expect(result.temperature).toBeUndefined();
      expect(result.top_p).toBeUndefined();
      expect(result.stream).toBeUndefined();
      expect(result.reasoning?.effort).toBe('medium'); // Default
    });
  });

  describe('tool choice transformation', () => {
    it('should transform auto tool choice', () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Test' }],
        tool_choice: 'auto',
      };

      const result = transformer.transformRequest(claudeRequest);
      expect(result.tool_choice).toBe('auto');
    });

    it('should transform any tool choice to auto', () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Test' }],
        tool_choice: 'any',
      };

      const result = transformer.transformRequest(claudeRequest);
      expect(result.tool_choice).toBe('auto');
    });

    it('should transform specific tool choice', () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Test' }],
        tool_choice: {
          type: 'tool',
          name: 'calculator',
        },
      };

      const result = transformer.transformRequest(claudeRequest);
      expect(result.tool_choice).toEqual({
        type: 'function',
        function: {
          name: 'calculator',
        },
      });
    });
  });
});
