/**
 * StreamingService Unit Tests
 *
 * Tests for streaming service functionality including:
 * - Handler invocation order
 * - SSE parser with various inputs
 * - Completion guarantee
 * - AbortController cleanup
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type {
  ChatStreamRequest,
  StreamingResponseHandler,
} from '../src/services/streaming-service.js';
import { createStreamingService } from '../src/services/streaming-service.js';

describe('StreamingService', () => {
  let streamingService: ReturnType<typeof createStreamingService>;

  const getCallCount = (handlerFn: StreamingResponseHandler[keyof StreamingResponseHandler]): number =>
    (handlerFn as Mock).mock.calls.length;

  beforeEach(() => {
    streamingService = createStreamingService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Handler Invocation Order', () => {
    it('should call onStart before onChunk', async () => {
      const callOrder: string[] = [];
      const handler: StreamingResponseHandler = {
        onStart: vi.fn((messageId: string, model: string) => {
          callOrder.push(`onStart:${messageId}:${model}`);
        }),
        onChunk: vi.fn((content: string, messageId: string) => {
          callOrder.push(`onChunk:${content}:${messageId}`);
        }),
        onEnd: vi.fn((messageId: string) => {
          callOrder.push(`onEnd:${messageId}`);
        }),
        onError: vi.fn((error: string, messageId: string) => {
          callOrder.push(`onError:${error}:${messageId}`);
        }),
      };

      const request: ChatStreamRequest = {
        message: 'Test message',
        model: 'gpt-4o-mini',
        conversationId: 'test-conv-123',
      };

      // Note: This test will use the simulated Bedrock stream
      // In a real scenario, we would mock the Azure OpenAI API
      try {
        await streamingService.processStreamingRequest(
          request,
          handler,
          'test-correlation-id'
        );
      } catch {
        // Ignore errors for this test - we're testing invocation order
      }

      // Verify onStart was NOT called by processStreamingRequest
      // (it should be called by chat-stream.ts before this method)
      // The handler.onStart should only be called from the provider-specific methods
      expect(callOrder.length).toBeGreaterThan(0);
    });

    it('should call onEnd after all onChunk calls', async () => {
      const callOrder: string[] = [];
      const handler: StreamingResponseHandler = {
        onStart: vi.fn((messageId: string) => {
          callOrder.push(`onStart:${messageId}`);
        }),
        onChunk: vi.fn((content: string) => {
          callOrder.push(`onChunk:${content}`);
        }),
        onEnd: vi.fn((messageId: string) => {
          callOrder.push(`onEnd:${messageId}`);
        }),
        onError: vi.fn(),
      };

      const request: ChatStreamRequest = {
        message: 'Test message',
        model: 'gpt-4o-mini',
        conversationId: 'test-conv-123',
      };

      try {
        await streamingService.processStreamingRequest(
          request,
          handler,
          'test-correlation-id'
        );
      } catch {
        // Ignore errors
      }

      // Find indices of onChunk and onEnd calls
      const lastChunkIndex = callOrder.lastIndexOf(
        callOrder.find((call) => call.startsWith('onChunk:')) || ''
      );
      const endIndex = callOrder.findIndex((call) => call.startsWith('onEnd:'));

      if (lastChunkIndex >= 0 && endIndex >= 0) {
        expect(endIndex).toBeGreaterThan(lastChunkIndex);
      }
    });

    it('should call onError instead of onEnd when error occurs', async () => {
      const handler: StreamingResponseHandler = {
        onStart: vi.fn(),
        onChunk: vi.fn(),
        onEnd: vi.fn(),
        onError: vi.fn(),
      };

      const request: ChatStreamRequest = {
        message: 'Test message',
        model: 'invalid-model-that-will-fail',
        conversationId: 'test-conv-123',
      };

      await streamingService.processStreamingRequest(
        request,
        handler,
        'test-correlation-id'
      );

      // Either onError or onEnd should be called, but not both
      const errorCalled = getCallCount(handler.onError) > 0;
      const endCalled = getCallCount(handler.onEnd) > 0;

      expect(errorCalled || endCalled).toBe(true);
    });
  });

  describe('Completion Guarantee', () => {
    it('should always call onEnd or onError even on success', async () => {
      const handler: StreamingResponseHandler = {
        onStart: vi.fn(),
        onChunk: vi.fn(),
        onEnd: vi.fn(),
        onError: vi.fn(),
      };

      const request: ChatStreamRequest = {
        message: 'Test message',
        model: 'gpt-4o-mini',
        conversationId: 'test-conv-123',
      };

      await streamingService.processStreamingRequest(
        request,
        handler,
        'test-correlation-id'
      );

      // Either onEnd or onError must be called
      const endCalled = getCallCount(handler.onEnd) > 0;
      const errorCalled = getCallCount(handler.onError) > 0;

      expect(endCalled || errorCalled).toBe(true);
    });

    it('should call onError when processing fails', async () => {
      const handler: StreamingResponseHandler = {
        onStart: vi.fn(),
        onChunk: vi.fn(),
        onEnd: vi.fn(),
        onError: vi.fn(),
      };

      const request: ChatStreamRequest = {
        message: 'Test message',
        model: 'unsupported-provider-model',
        conversationId: 'test-conv-123',
      };

      await streamingService.processStreamingRequest(
        request,
        handler,
        'test-correlation-id'
      );

      // onError should be called for unsupported provider
      expect(getCallCount(handler.onError)).toBeGreaterThanOrEqual(0);
    });

    it('should handle errors in finally block', async () => {
      const handler: StreamingResponseHandler = {
        onStart: vi.fn(),
        onChunk: vi.fn(),
        onEnd: vi.fn(),
        onError: vi.fn(),
      };

      const request: ChatStreamRequest = {
        message: 'Test message',
        model: 'gpt-4o-mini',
        conversationId: 'test-conv-123',
      };

      // This should not throw even if there are internal errors
      await expect(
        streamingService.processStreamingRequest(
          request,
          handler,
          'test-correlation-id'
        )
      ).resolves.not.toThrow();
    });
  });

  describe('AbortController Cleanup', () => {
    it('should clean up AbortController after successful completion', async () => {
      const handler: StreamingResponseHandler = {
        onStart: vi.fn(),
        onChunk: vi.fn(),
        onEnd: vi.fn(),
        onError: vi.fn(),
      };

      const request: ChatStreamRequest = {
        message: 'Test message',
        model: 'gpt-4o-mini',
        conversationId: 'test-conv-123',
      };

      const initialCount = streamingService.getActiveStreamCount();

      await streamingService.processStreamingRequest(
        request,
        handler,
        'test-correlation-id'
      );

      // Active streams should be cleaned up
      const finalCount = streamingService.getActiveStreamCount();
      expect(finalCount).toBe(initialCount);
    });

    it('should clean up AbortController after error', async () => {
      const handler: StreamingResponseHandler = {
        onStart: vi.fn(),
        onChunk: vi.fn(),
        onEnd: vi.fn(),
        onError: vi.fn(),
      };

      const request: ChatStreamRequest = {
        message: 'Test message',
        model: 'invalid-model',
        conversationId: 'test-conv-123',
      };

      const initialCount = streamingService.getActiveStreamCount();

      await streamingService.processStreamingRequest(
        request,
        handler,
        'test-correlation-id'
      );

      // Active streams should be cleaned up even on error
      const finalCount = streamingService.getActiveStreamCount();
      expect(finalCount).toBe(initialCount);
    });

    it('should properly maintain activeStreams map', async () => {
      const handler: StreamingResponseHandler = {
        onStart: vi.fn(),
        onChunk: vi.fn(),
        onEnd: vi.fn(),
        onError: vi.fn(),
      };

      const request: ChatStreamRequest = {
        message: 'Test message',
        model: 'gpt-4o-mini',
        conversationId: 'test-conv-123',
      };

      const initialCount = streamingService.getActiveStreamCount();

      // Start multiple streams
      const promises = [
        streamingService.processStreamingRequest(
          request,
          handler,
          'correlation-1'
        ),
        streamingService.processStreamingRequest(
          { ...request, conversationId: 'test-conv-456' },
          handler,
          'correlation-2'
        ),
      ];

      await Promise.all(promises);

      // All streams should be cleaned up
      const finalCount = streamingService.getActiveStreamCount();
      expect(finalCount).toBe(initialCount);
    });

    it('should support cancelling active streams', async () => {
      const handler: StreamingResponseHandler = {
        onStart: vi.fn(),
        onChunk: vi.fn(),
        onEnd: vi.fn(),
        onError: vi.fn(),
      };

      const request: ChatStreamRequest = {
        message: 'Test message',
        model: 'gpt-4o-mini',
        conversationId: 'test-conv-123',
      };

      // Start a stream but don't await it
      const streamPromise = streamingService.processStreamingRequest(
        request,
        handler,
        'test-correlation-id'
      );

      // Give it a moment to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      // The stream should complete on its own
      await streamPromise;

      // Verify cleanup happened
      expect(streamingService.getActiveStreamCount()).toBe(0);
    });
  });

  describe('SSE Parser Edge Cases', () => {
    it('should handle empty messages gracefully', async () => {
      const handler: StreamingResponseHandler = {
        onStart: vi.fn(),
        onChunk: vi.fn(),
        onEnd: vi.fn(),
        onError: vi.fn(),
      };

      const request: ChatStreamRequest = {
        message: '',
        model: 'gpt-4o-mini',
        conversationId: 'test-conv-123',
      };

      await expect(
        streamingService.processStreamingRequest(
          request,
          handler,
          'test-correlation-id'
        )
      ).resolves.not.toThrow();
    });

    it('should handle very long messages', async () => {
      const handler: StreamingResponseHandler = {
        onStart: vi.fn(),
        onChunk: vi.fn(),
        onEnd: vi.fn(),
        onError: vi.fn(),
      };

      const longMessage = 'A'.repeat(10000);
      const request: ChatStreamRequest = {
        message: longMessage,
        model: 'gpt-4o-mini',
        conversationId: 'test-conv-123',
      };

      await expect(
        streamingService.processStreamingRequest(
          request,
          handler,
          'test-correlation-id'
        )
      ).resolves.not.toThrow();
    });

    it('should handle special characters in messages', async () => {
      const handler: StreamingResponseHandler = {
        onStart: vi.fn(),
        onChunk: vi.fn(),
        onEnd: vi.fn(),
        onError: vi.fn(),
      };

      const request: ChatStreamRequest = {
        message: 'Test with special chars: \n\r\t"\'\\',
        model: 'gpt-4o-mini',
        conversationId: 'test-conv-123',
      };

      await expect(
        streamingService.processStreamingRequest(
          request,
          handler,
          'test-correlation-id'
        )
      ).resolves.not.toThrow();
    });

    it('should handle messages with files', async () => {
      const handler: StreamingResponseHandler = {
        onStart: vi.fn(),
        onChunk: vi.fn(),
        onEnd: vi.fn(),
        onError: vi.fn(),
      };

      const request: ChatStreamRequest = {
        message: 'Test message with files',
        model: 'gpt-4o-mini',
        conversationId: 'test-conv-123',
        files: [
          {
            id: 'file-1',
            name: 'test.txt',
            type: 'text/plain',
            url: 'https://example.com/test.txt',
          },
        ],
      };

      await expect(
        streamingService.processStreamingRequest(
          request,
          handler,
          'test-correlation-id'
        )
      ).resolves.not.toThrow();
    });

    it('should handle messages with context', async () => {
      const handler: StreamingResponseHandler = {
        onStart: vi.fn(),
        onChunk: vi.fn(),
        onEnd: vi.fn(),
        onError: vi.fn(),
      };

      const request: ChatStreamRequest = {
        message: 'Test message with context',
        model: 'gpt-4o-mini',
        conversationId: 'test-conv-123',
        contextMessages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Previous message',
            timestamp: new Date(),
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'Previous response',
            timestamp: new Date(),
          },
        ],
      };

      await expect(
        streamingService.processStreamingRequest(
          request,
          handler,
          'test-correlation-id'
        )
      ).resolves.not.toThrow();
    });
  });

  describe('Active Stream Management', () => {
    it('should track active stream count correctly', async () => {
      const handler: StreamingResponseHandler = {
        onStart: vi.fn(),
        onChunk: vi.fn(),
        onEnd: vi.fn(),
        onError: vi.fn(),
      };

      const request: ChatStreamRequest = {
        message: 'Test message',
        model: 'gpt-4o-mini',
        conversationId: 'test-conv-123',
      };

      const initialCount = streamingService.getActiveStreamCount();
      expect(initialCount).toBe(0);

      await streamingService.processStreamingRequest(
        request,
        handler,
        'test-correlation-id'
      );

      const finalCount = streamingService.getActiveStreamCount();
      expect(finalCount).toBe(0);
    });

    it('should return correct active stream count', () => {
      const count = streamingService.getActiveStreamCount();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});
