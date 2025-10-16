import { describe, it, expect, beforeEach } from 'vitest';
import {
  ResponsesStreamingHandler,
  createResponsesStreamingHandler,
  ResponsesStreamProcessor,
  createResponsesStreamProcessor,
} from '../src/utils/responses-streaming-handler.js';
import type {
  ResponsesStreamChunk,
  ResponsesAPIError,
  ClaudeStreamChunk,
  OpenAIStreamChunk,
} from '../src/types/index.js';

describe('ResponsesStreamingHandler', () => {
  let claudeHandler: ResponsesStreamingHandler;
  let openAIHandler: ResponsesStreamingHandler;
  const correlationId = 'test-correlation-id';

  beforeEach(() => {
    claudeHandler = new ResponsesStreamingHandler(correlationId, 'claude');
    openAIHandler = new ResponsesStreamingHandler(correlationId, 'openai');
  });

  describe('processStreamChunk', () => {
    it('should process Claude format stream chunk correctly', () => {
      const chunk: ResponsesStreamChunk = {
        id: 'chunk-123',
        object: 'response.chunk',
        created: 1234567890,
        model: 'gpt-4',
        output: [
          {
            type: 'text',
            text: 'Hello world',
          },
        ],
      };

      const result = claudeHandler.processStreamChunk(chunk) as ClaudeStreamChunk;

      expect(result).toEqual({
        type: 'content_block_delta',
        delta: {
          type: 'text_delta',
          text: 'Hello world',
        },
      });
    });

    it('should process OpenAI format stream chunk correctly', () => {
      const chunk: ResponsesStreamChunk = {
        id: 'chunk-123',
        object: 'response.chunk',
        created: 1234567890,
        model: 'gpt-4',
        output: [
          {
            type: 'text',
            text: 'Hello world',
          },
        ],
      };

      const result = openAIHandler.processStreamChunk(chunk) as OpenAIStreamChunk;

      expect(result).toEqual({
        id: 'chunk-123',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            delta: {
              content: 'Hello world',
            },
            finish_reason: null,
          },
        ],
      });
    });

    it('should handle completion chunk for Claude format', () => {
      const chunk: ResponsesStreamChunk = {
        id: 'chunk-123',
        object: 'response.chunk',
        created: 1234567890,
        model: 'gpt-4',
        output: [
          {
            type: 'reasoning',
            reasoning: {
              content: 'Thinking complete',
              status: 'completed',
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      const result = claudeHandler.processStreamChunk(chunk) as ClaudeStreamChunk;

      expect(result).toEqual({
        type: 'message_stop',
        usage: {
          input_tokens: 10,
          output_tokens: 5,
        },
      });
    });

    it('should handle completion chunk for OpenAI format', () => {
      const chunk: ResponsesStreamChunk = {
        id: 'chunk-123',
        object: 'response.chunk',
        created: 1234567890,
        model: 'gpt-4',
        output: [
          {
            type: 'reasoning',
            reasoning: {
              content: 'Thinking complete',
              status: 'completed',
            },
          },
        ],
      };

      const result = openAIHandler.processStreamChunk(chunk) as OpenAIStreamChunk;

      expect(result).toEqual({
        id: 'chunk-123',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
          },
        ],
      });
    });
  });

  describe('handleStreamError', () => {
    it('should handle error for Claude format', () => {
      const error: ResponsesAPIError = {
        type: 'server_error',
        code: 'internal_error',
        message: 'Internal server error',
      };

      const result = claudeHandler.handleStreamError(error) as readonly ClaudeStreamChunk[];

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('error');
      expect(result[0]).toHaveProperty('error.message', 'Internal server error');
      expect(result[1].type).toBe('message_stop');
    });

    it('should handle error for OpenAI format', () => {
      const error: ResponsesAPIError = {
        type: 'server_error',
        code: 'internal_error',
        message: 'Internal server error',
      };

      const result = openAIHandler.handleStreamError(error) as readonly OpenAIStreamChunk[];

      expect(result).toHaveLength(2);
      expect(result[0].object).toBe('chat.completion.chunk');
      expect(result[0].choices[0].delta?.content).toContain('Internal server error');
      expect(result[1].choices[0].finish_reason).toBe('stop');
    });

    it('should handle generic Error for Claude format', () => {
      const error = new Error('Generic error');

      const result = claudeHandler.handleStreamError(error) as readonly ClaudeStreamChunk[];

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('error');
      expect(result[0]).toHaveProperty('error.message', 'Generic error');
      expect(result[1].type).toBe('message_stop');
    });
  });

  describe('createStreamStart', () => {
    it('should create Claude stream start event', () => {
      const result = claudeHandler.createStreamStart('resp-123', 'gpt-4') as ClaudeStreamChunk;

      expect(result).toEqual({
        type: 'message_start',
        message: {
          id: 'resp-123',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: null,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
          },
        },
      });
    });

    it('should create OpenAI stream start event', () => {
      const result = openAIHandler.createStreamStart('resp-123', 'gpt-4') as OpenAIStreamChunk;

      expect(result.id).toBe('resp-123');
      expect(result.object).toBe('chat.completion.chunk');
      expect(result.model).toBe('gpt-4');
      expect(result.choices[0].delta.role).toBe('assistant');
      expect(result.choices[0].finish_reason).toBeNull();
    });
  });

  describe('createClaudeContentBlockStart', () => {
    it('should create Claude content block start event', () => {
      const result = claudeHandler.createClaudeContentBlockStart(0);

      expect(result).toEqual({
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'text',
          text: '',
        },
      });
    });

    it('should throw error for OpenAI format', () => {
      expect(() => {
        openAIHandler.createClaudeContentBlockStart(0);
      }).toThrow('Content block start is only supported for Claude format');
    });
  });

  describe('createClaudeContentBlockStop', () => {
    it('should create Claude content block stop event', () => {
      const result = claudeHandler.createClaudeContentBlockStop(0);

      expect(result).toEqual({
        type: 'content_block_stop',
        index: 0,
      });
    });

    it('should throw error for OpenAI format', () => {
      expect(() => {
        openAIHandler.createClaudeContentBlockStop(0);
      }).toThrow('Content block stop is only supported for Claude format');
    });
  });

  describe('validateStreamChunk', () => {
    it('should validate correct stream chunk', () => {
      const chunk: ResponsesStreamChunk = {
        id: 'chunk-123',
        object: 'response.chunk',
        created: 1234567890,
        model: 'gpt-4',
        output: [],
      };

      expect(claudeHandler.validateStreamChunk(chunk)).toBe(true);
    });

    it('should reject invalid stream chunk - not an object', () => {
      expect(claudeHandler.validateStreamChunk('invalid')).toBe(false);
      expect(claudeHandler.validateStreamChunk(null)).toBe(false);
    });

    it('should reject invalid stream chunk - missing fields', () => {
      const invalidChunk = {
        id: 'chunk-123',
        // missing object field
        created: 1234567890,
        model: 'gpt-4',
        output: [],
      };

      expect(claudeHandler.validateStreamChunk(invalidChunk)).toBe(false);
    });

    it('should reject invalid stream chunk - wrong object type', () => {
      const invalidChunk = {
        id: 'chunk-123',
        object: 'wrong-type',
        created: 1234567890,
        model: 'gpt-4',
        output: [],
      };

      expect(claudeHandler.validateStreamChunk(invalidChunk)).toBe(false);
    });

    it('should reject invalid stream chunk - output not array', () => {
      const invalidChunk = {
        id: 'chunk-123',
        object: 'response.chunk',
        created: 1234567890,
        model: 'gpt-4',
        output: 'not-array',
      };

      expect(claudeHandler.validateStreamChunk(invalidChunk)).toBe(false);
    });
  });

  describe('isStreamComplete', () => {
    it('should detect completion with reasoning status completed', () => {
      const chunk: ResponsesStreamChunk = {
        id: 'chunk-123',
        object: 'response.chunk',
        created: 1234567890,
        model: 'gpt-4',
        output: [
          {
            type: 'reasoning',
            reasoning: {
              content: 'Thinking complete',
              status: 'completed',
            },
          },
        ],
      };

      expect(claudeHandler.isStreamComplete(chunk)).toBe(true);
    });

    it('should not detect completion with text and no reasoning', () => {
      const chunk: ResponsesStreamChunk = {
        id: 'chunk-123',
        object: 'response.chunk',
        created: 1234567890,
        model: 'gpt-4',
        output: [
          {
            type: 'text',
            text: 'Partial answer',
          },
        ],
      };

      expect(claudeHandler.isStreamComplete(chunk)).toBe(false);
    });

    it('should not detect completion with ongoing reasoning', () => {
      const chunk: ResponsesStreamChunk = {
        id: 'chunk-123',
        object: 'response.chunk',
        created: 1234567890,
        model: 'gpt-4',
        output: [
          {
            type: 'text',
            text: 'Partial answer',
          },
          {
            type: 'reasoning',
            reasoning: {
              content: 'Still thinking...',
              status: 'in_progress',
            },
          },
        ],
      };

      expect(claudeHandler.isStreamComplete(chunk)).toBe(false);
    });

    it('should not detect completion with no text content', () => {
      const chunk: ResponsesStreamChunk = {
        id: 'chunk-123',
        object: 'response.chunk',
        created: 1234567890,
        model: 'gpt-4',
        output: [],
      };

      expect(claudeHandler.isStreamComplete(chunk)).toBe(false);
    });
  });

  describe('factory functions', () => {
    it('should create streaming handler instance', () => {
      const handler = createResponsesStreamingHandler(correlationId, 'claude');
      expect(handler).toBeInstanceOf(ResponsesStreamingHandler);
    });

    it('should create stream processor instance', () => {
      const processor = createResponsesStreamProcessor(correlationId, 'openai');
      expect(processor).toBeInstanceOf(ResponsesStreamProcessor);
    });
  });
});

describe('ResponsesStreamProcessor', () => {
  let processor: ResponsesStreamProcessor;
  const correlationId = 'test-correlation-id';

  beforeEach(() => {
    processor = new ResponsesStreamProcessor(correlationId, 'claude');
  });

  describe('processStream', () => {
    it('should process stream with multiple chunks', async () => {
      const chunks: ResponsesStreamChunk[] = [
        {
          id: 'chunk-1',
          object: 'response.chunk',
          created: 1234567890,
          model: 'gpt-4',
          output: [
            {
              type: 'text',
              text: 'Hello',
            },
          ],
        },
        {
          id: 'chunk-2',
          object: 'response.chunk',
          created: 1234567891,
          model: 'gpt-4',
          output: [
            {
              type: 'text',
              text: ' world',
            },
          ],
        },
        {
          id: 'chunk-3',
          object: 'response.chunk',
          created: 1234567892,
          model: 'gpt-4',
          output: [
            {
              type: 'reasoning',
              reasoning: {
                content: 'Complete',
                status: 'completed',
              },
            },
          ],
        },
      ];

      async function* mockStream() {
        for (const chunk of chunks) {
          yield chunk;
        }
      }

      const results: (ClaudeStreamChunk | OpenAIStreamChunk)[] = [];
      for await (const result of processor.processStream(mockStream())) {
        results.push(result);
      }

      // Should have: start event, 2 content chunks, completion chunk
      expect(results).toHaveLength(4);
      
      // First should be start event
      expect((results[0] as ClaudeStreamChunk).type).toBe('message_start');
      
      // Next two should be content deltas
      expect((results[1] as ClaudeStreamChunk).type).toBe('content_block_delta');
      expect((results[1] as ClaudeStreamChunk).delta?.text).toBe('Hello');
      
      expect((results[2] as ClaudeStreamChunk).type).toBe('content_block_delta');
      expect((results[2] as ClaudeStreamChunk).delta?.text).toBe(' world');
      
      // Last should be completion
      expect((results[3] as ClaudeStreamChunk).type).toBe('message_stop');
    });

    it('should handle stream with invalid chunks', async () => {
      const chunks = [
        {
          id: 'chunk-1',
          object: 'response.chunk',
          created: 1234567890,
          model: 'gpt-4',
          output: [
            {
              type: 'text',
              text: 'Hello',
            },
          ],
        },
        // Invalid chunk
        {
          id: 'invalid',
          object: 'wrong-type',
          created: 1234567891,
          model: 'gpt-4',
          output: [],
        },
        {
          id: 'chunk-2',
          object: 'response.chunk',
          created: 1234567892,
          model: 'gpt-4',
          output: [
            {
              type: 'reasoning',
              reasoning: {
                content: 'Complete',
                status: 'completed',
              },
            },
          ],
        },
      ];

      async function* mockStream() {
        for (const chunk of chunks) {
          yield chunk as ResponsesStreamChunk;
        }
      }

      const results: (ClaudeStreamChunk | OpenAIStreamChunk)[] = [];
      for await (const result of processor.processStream(mockStream())) {
        results.push(result);
      }

      expect(results.length).toBeGreaterThanOrEqual(2);
      expect((results[0] as ClaudeStreamChunk).type).toBe('message_start');
      expect((results[results.length - 1] as ClaudeStreamChunk).type).toBe('message_stop');
    });

    it('should handle stream errors', async () => {
      async function* mockStream() {
        yield {
          id: 'chunk-1',
          object: 'response.chunk',
          created: 1234567890,
          model: 'gpt-4',
          output: [
            {
              type: 'text',
              text: 'Hello',
            },
          ],
        } as ResponsesStreamChunk;
        
        throw new Error('Stream error');
      }

      const results: (ClaudeStreamChunk | OpenAIStreamChunk)[] = [];
      for await (const result of processor.processStream(mockStream())) {
        results.push(result);
      }

      // Should have: start event, content chunk, error event, stop event
      expect(results).toHaveLength(4);
      
      expect((results[2] as ClaudeStreamChunk).type).toBe('error');
      expect((results[3] as ClaudeStreamChunk).type).toBe('message_stop');
    });

    it('should handle empty stream', async () => {
      async function* mockStream() {
        // Empty stream
        return;
      }

      const results: (ClaudeStreamChunk | OpenAIStreamChunk)[] = [];
      for await (const result of processor.processStream(mockStream())) {
        results.push(result);
      }

      // Should have no results for empty stream
      expect(results).toHaveLength(0);
    });
  });
});
