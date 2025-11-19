/**
 * Chat SSE Client Tests
 *
 * Tests for the ChatSSEClient with @microsoft/fetch-event-source
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatSSEClient } from '../services/chat.js';
import * as fetchEventSourceModule from '@microsoft/fetch-event-source';

// Mock the session manager
vi.mock('../services/session.js', () => ({
  getSessionManager: () => ({
    getSessionId: () => 'test-session-id',
  }),
}));

// Mock the logger
vi.mock('../utils/logger.js', () => ({
  frontendLogger: {
    log: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
  logger: {
    log: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock network utils
vi.mock('../utils/networkErrorHandler.js', () => ({
  NetworkError: class NetworkError extends Error {
    constructor(
      message: string,
      public type: string,
      public options?: {
        retryable?: boolean;
        statusCode?: number;
        originalError?: Error;
        metadata?: unknown;
      }
    ) {
      super(message);
      this.type = type;
      this.retryable = options?.retryable ?? this.isRetryableByDefault(type);
      this.statusCode = options?.statusCode;
      this.originalError = options?.originalError;
    }
    retryable: boolean;
    statusCode?: number;
    originalError?: Error;

    private isRetryableByDefault(type: string): boolean {
      const retryableTypes = [
        'connection_failed',
        'timeout',
        'server_error',
        'rate_limited',
      ];
      return retryableTypes.includes(type);
    }
  },
  networkErrorHandler: {
    classifyError: (error: unknown) => error,
    executeWithRetry: async (fn: () => Promise<unknown>) => {
      return await fn();
    },
    fetchWithRetry: async (url: string, options: RequestInit) => {
      return await fetch(url, options);
    },
  },
  networkUtils: {
    isOnline: () => true,
  },
}));

describe('ChatSSEClient', () => {
  let client: ChatSSEClient;
  let fetchEventSourceSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Spy on fetchEventSource
    fetchEventSourceSpy = vi.spyOn(fetchEventSourceModule, 'fetchEventSource');
    fetchEventSourceSpy.mockResolvedValue(undefined);

    client = new ChatSSEClient('test-conversation-id');
  });

  afterEach(() => {
    client.disconnect();
    vi.clearAllMocks();
  });

  it('should create a ChatSSEClient instance', () => {
    expect(client).toBeDefined();
    expect(client.getConnectionState()).toBe('disconnected');
  });

  it('should connect with x-session-id header', () => {
    client.connect();

    expect(fetchEventSourceSpy).toHaveBeenCalledWith(
      '/api/chat/stream/test-conversation-id',
      expect.objectContaining({
        method: 'GET',
        headers: {
          'x-session-id': 'test-session-id',
        },
      })
    );
  });

  it('should set connection state to connecting when connect is called', () => {
    client.connect();
    expect(client.getConnectionState()).toBe('connecting');
  });

  it('should handle successful connection', async () => {
    const mockOnOpen = vi.fn();
    client.on('connectionStateChange', mockOnOpen);

    fetchEventSourceSpy.mockImplementation(async (_url, options) => {
      // Simulate successful connection
      await options.onopen?.({
        ok: true,
        status: 200,
        text: async () => '',
      } as Response);
    });

    client.connect();

    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(client.getConnectionState()).toBe('connected');
  });

  it('should handle connection errors', async () => {
    const mockOnError = vi.fn();
    client.on('connectionError', mockOnError);

    fetchEventSourceSpy.mockImplementation(async (_url, options) => {
      // Simulate error
      const error = new Error('Connection failed');
      options.onerror?.(error);
      throw error;
    });

    client.connect();

    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockOnError).toHaveBeenCalled();
  });

  it('should disconnect and abort the connection', () => {
    client.connect();
    client.disconnect();

    expect(client.getConnectionState()).toBe('disconnected');
  });

  it('should not reconnect when manually disconnected', async () => {
    fetchEventSourceSpy.mockImplementation(async (_url, options) => {
      // Simulate error
      const error = new Error('Connection failed');
      options.onerror?.(error);
      throw error;
    });

    client.connect();
    client.disconnect();

    // Wait for potential reconnection attempts
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should only be called once (initial connection)
    expect(fetchEventSourceSpy).toHaveBeenCalledTimes(1);
  });

  it('should provide connection health information', () => {
    const health = client.getConnectionHealth();

    expect(health).toMatchObject({
      state: 'disconnected',
      lastConnected: null,
      reconnectAttempts: 0,
      maxReconnectAttempts: 5,
      isOnline: true,
    });
  });

  it('should handle message events', async () => {
    const mockOnMessageStart = vi.fn();
    client.on('messageStart', mockOnMessageStart);

    fetchEventSourceSpy.mockImplementation(async (_url, options) => {
      // Simulate successful connection
      await options.onopen?.({
        ok: true,
        status: 200,
        text: async () => '',
      } as Response);

      // Simulate message event
      options.onmessage?.({
        data: JSON.stringify({
          type: 'start',
          messageId: 'msg-123',
          correlationId: 'corr-123',
        }),
      } as MessageEvent);
    });

    client.connect();

    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockOnMessageStart).toHaveBeenCalledWith({
      messageId: 'msg-123',
      correlationId: 'corr-123',
    });
  });

  it('should handle non-OK responses in onopen', async () => {
    const mockOnError = vi.fn();
    client.on('connectionError', mockOnError);

    fetchEventSourceSpy.mockImplementation(async (_url, options) => {
      // Simulate non-OK response
      await options.onopen?.({
        ok: false,
        status: 401,
        text: async () =>
          JSON.stringify({
            error: { message: 'Unauthorized' },
          }),
      } as Response);
    });

    client.connect();

    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockOnError).toHaveBeenCalled();
  });

  it('should force reconnect when requested', async () => {
    fetchEventSourceSpy.mockImplementation(async (_url, options) => {
      await options.onopen?.({
        ok: true,
        status: 200,
        text: async () => '',
      } as Response);
    });

    client.connect();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(client.getConnectionState()).toBe('connected');

    client.forceReconnect();
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Should have been called twice (initial + reconnect)
    expect(fetchEventSourceSpy).toHaveBeenCalledTimes(2);
  });

  // Task 1.6: Tests for debounce mechanism
  describe('Debounce Mechanism (Task 1.6)', () => {
    it('should debounce rapid connect() calls', async () => {
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);
      });

      // Call connect() multiple times rapidly
      client.connect();
      client.connect();
      client.connect();

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should only be called once due to debouncing
      expect(fetchEventSourceSpy).toHaveBeenCalledTimes(1);
    });

    it('should allow connect() after debounce period', async () => {
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);
      });

      // First connect
      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Disconnect
      client.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Wait for debounce period (1000ms)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Second connect after debounce period
      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should be called twice (once initially, once after debounce period)
      expect(fetchEventSourceSpy).toHaveBeenCalledTimes(2);
    });

    it('should log warning when connect() is debounced', async () => {
      // Import the mocked logger
      const loggerModule = await import('../utils/logger.js');
      const { frontendLogger } = loggerModule;

      client.connect();
      client.connect(); // This should be debounced

      expect(frontendLogger.warn).toHaveBeenCalledWith(
        'Connect() called too soon, debouncing',
        expect.objectContaining({
          metadata: expect.objectContaining({
            conversationId: 'test-conversation-id',
          }),
        })
      );
    });
  });

  // Subtask 1.4: Tests for connection lifecycle fixes
  describe('Connection Lifecycle Fixes (Task 1)', () => {
    it('should prevent duplicate connections when already connected', async () => {
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);
      });

      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(client.getConnectionState()).toBe('connected');

      // Try to connect again while already connected
      client.connect();

      // Should only be called once
      expect(fetchEventSourceSpy).toHaveBeenCalledTimes(1);
    });

    it('should prevent duplicate connections when already connecting', () => {
      client.connect();
      expect(client.getConnectionState()).toBe('connecting');

      // Try to connect again while connecting
      client.connect();

      // Should only be called once
      expect(fetchEventSourceSpy).toHaveBeenCalledTimes(1);
    });

    it('should create fresh AbortController on each connection attempt', async () => {
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);
      });

      // First connection
      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Disconnect
      client.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Second connection should create new AbortController
      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should have been called twice with fresh AbortController each time
      expect(fetchEventSourceSpy).toHaveBeenCalledTimes(2);
      expect(client.getConnectionState()).toBe('connected');
    });

    it('should properly clean up AbortController on disconnect', async () => {
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);
      });

      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(client.getConnectionState()).toBe('connected');

      // Disconnect should clean up AbortController
      client.disconnect();

      expect(client.getConnectionState()).toBe('disconnected');

      // Should be able to connect again after cleanup
      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(client.getConnectionState()).toBe('connected');
      expect(fetchEventSourceSpy).toHaveBeenCalledTimes(2);
    });

    it('should properly clean up AbortController on connection error', async () => {
      const mockOnError = vi.fn();
      client.on('connectionError', mockOnError);

      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        // Simulate error
        const error = new Error('Connection failed');
        options.onerror?.(error);
        throw error;
      });

      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockOnError).toHaveBeenCalled();

      // Should be able to connect again after error cleanup
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);
      });

      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(client.getConnectionState()).toBe('connected');
    });

    it('should register event handlers before connection establishment', async () => {
      const events: string[] = [];

      client.on('connectionStateChange', (state) => {
        events.push(`state:${state}`);
      });

      client.on('messageStart', () => {
        events.push('messageStart');
      });

      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        // Simulate successful connection
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);

        // Immediately send a message
        options.onmessage?.({
          data: JSON.stringify({
            type: 'start',
            messageId: 'msg-123',
            correlationId: 'corr-123',
          }),
        } as MessageEvent);
      });

      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify events were captured in correct order
      expect(events).toContain('state:connecting');
      expect(events).toContain('state:connected');
      expect(events).toContain('messageStart');

      // State changes should happen before message
      const connectingIndex = events.indexOf('state:connecting');
      const connectedIndex = events.indexOf('state:connected');
      const messageIndex = events.indexOf('messageStart');

      expect(connectingIndex).toBeLessThan(connectedIndex);
      expect(connectedIndex).toBeLessThan(messageIndex);
    });

    it('should not create connection if AbortController exists and is not aborted', async () => {
      // Mock implementation that keeps connection open
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);
        // Don't throw, keep connection open
      });

      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(client.getConnectionState()).toBe('connected');

      // Try to connect again - should be prevented
      client.connect();

      // Should only be called once
      expect(fetchEventSourceSpy).toHaveBeenCalledTimes(1);
    });
  });
});

/**
 * ChatService Tests (Task 2)
 *
 * Tests for connection readiness check, connection pooling, and error propagation
 */
describe('ChatService', () => {
  let chatService: ReturnType<
    typeof import('../services/chat.js').getChatService
  >;
  let fetchEventSourceSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    // Import and get chat service
    const chatModule = await import('../services/chat.js');
    chatService = chatModule.getChatService();

    // Spy on fetchEventSource
    fetchEventSourceSpy = vi.spyOn(fetchEventSourceModule, 'fetchEventSource');
    fetchEventSourceSpy.mockResolvedValue(undefined);

    // Mock fetch for sendMessage
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        messageId: 'test-message-id',
        status: 'processing',
      }),
    } as Response);
  });

  afterEach(() => {
    chatService.disconnectAllSSE();
    vi.clearAllMocks();
  });

  // Subtask 2.1: Connection readiness check tests
  describe('Connection Readiness Check (Subtask 2.1)', () => {
    it('should wait for connection to be ready before sending message', async () => {
      // Mock connection that becomes ready after delay
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        setTimeout(async () => {
          await options.onopen?.({
            ok: true,
            status: 200,
            text: async () => '',
          } as Response);
        }, 100);
      });

      // Get connection and start connecting
      const connection = chatService.getSSEConnection('test-conv-id');
      connection.connect();

      // Send message - should wait for connection
      const promise = chatService.sendMessage({
        message: 'test message',
        model: 'gpt-4',
        conversationId: 'test-conv-id',
      });

      // Wait for message to be sent
      const result = await promise;

      expect(result.messageId).toBe('test-message-id');
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/chat/send',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should timeout if connection takes too long', async () => {
      // Mock connection that never becomes ready
      fetchEventSourceSpy.mockImplementation(async () => {
        // Never call onopen - connection stays in 'connecting' state
        await new Promise((resolve) => setTimeout(resolve, 10000)); // Hang for 10 seconds
      });

      // Get connection and start connecting
      const connection = chatService.getSSEConnection('test-conv-id');
      connection.connect();

      // Send message - should timeout after 5 seconds
      await expect(
        chatService.sendMessage({
          message: 'test message',
          model: 'gpt-4',
          conversationId: 'test-conv-id',
        })
      ).rejects.toThrow(/timeout/i);
    }, 10000); // Increase test timeout to 10 seconds

    it('should throw error if connection fails', async () => {
      // Mock connection that fails
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        const error = new Error('Connection failed');
        options.onerror?.(error);
        throw error;
      });

      // Get connection and start connecting
      const connection = chatService.getSSEConnection('test-conv-id');
      connection.connect();

      // Wait for connection to fail
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Send message - should fail
      await expect(
        chatService.sendMessage({
          message: 'test message',
          model: 'gpt-4',
          conversationId: 'test-conv-id',
        })
      ).rejects.toThrow(/not available/i);
    });

    it('should send message immediately if connection is already ready', async () => {
      // Mock successful connection
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);
      });

      // Get connection and wait for it to be ready
      const connection = chatService.getSSEConnection('test-conv-id');
      connection.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(connection.getConnectionState()).toBe('connected');

      // Send message - should not wait
      const startTime = Date.now();
      await chatService.sendMessage({
        message: 'test message',
        model: 'gpt-4',
        conversationId: 'test-conv-id',
      });
      const elapsed = Date.now() - startTime;

      // Should be fast since connection is already ready
      expect(elapsed).toBeLessThan(1000);
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  // Subtask 2.2: Connection pooling tests
  describe('Connection Pooling (Subtask 2.2)', () => {
    it('should reuse existing active connection', async () => {
      // Mock successful connection
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);
      });

      // Get connection twice
      const connection1 = chatService.getSSEConnection('test-conv-id');
      connection1.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const connection2 = chatService.getSSEConnection('test-conv-id');

      // Should be the same instance
      expect(connection1).toBe(connection2);
      expect(fetchEventSourceSpy).toHaveBeenCalledTimes(1);
    });

    it('should create new connection if existing is disconnected', async () => {
      // Mock successful connection
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);
      });

      // Get connection and disconnect it
      const connection1 = chatService.getSSEConnection('test-conv-id');
      connection1.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));
      connection1.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Get connection again - should create new one
      const connection2 = chatService.getSSEConnection('test-conv-id');

      // Should be different instance
      expect(connection1).not.toBe(connection2);
    });

    it('should create new connection if existing is in error state', async () => {
      const NetworkErrorClass = (
        await import('../utils/networkErrorHandler.js')
      ).NetworkError;

      // Mock failed connection with retryable error
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        const error = new NetworkErrorClass(
          'Connection failed',
          'connection_failed',
          {
            retryable: true,
          }
        );
        options.onerror?.(error);
        throw error;
      });

      // Get connection and let it fail
      const connection1 = chatService.getSSEConnection('test-conv-id');
      connection1.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should be in error or reconnecting state
      const state = connection1.getConnectionState();
      expect(['error', 'reconnecting', 'disconnected']).toContain(state);

      // Mock successful connection for retry
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);
      });

      // Get connection again - should create new one if in error/disconnected
      const connection2 = chatService.getSSEConnection('test-conv-id');

      // If connection was in error/disconnected, should be different instance
      if (state === 'error' || state === 'disconnected') {
        expect(connection1).not.toBe(connection2);
      }
    });

    it('should reuse connection in connecting state', () => {
      // Get connection while connecting
      const connection1 = chatService.getSSEConnection('test-conv-id');
      connection1.connect();

      expect(connection1.getConnectionState()).toBe('connecting');

      // Get connection again - should reuse
      const connection2 = chatService.getSSEConnection('test-conv-id');

      // Should be the same instance
      expect(connection1).toBe(connection2);
      expect(fetchEventSourceSpy).toHaveBeenCalledTimes(1);
    });

    it('should reuse connection in reconnecting state', async () => {
      const NetworkErrorClass = (
        await import('../utils/networkErrorHandler.js')
      ).NetworkError;

      // Mock failed connection that will reconnect (retryable error)
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        const error = new NetworkErrorClass(
          'Connection failed',
          'connection_failed',
          {
            retryable: true,
          }
        );
        options.onerror?.(error);
        throw error;
      });

      // Get connection and let it fail (will trigger reconnect)
      const connection1 = chatService.getSSEConnection('test-conv-id');
      connection1.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Connection should be in reconnecting or error state
      const state = connection1.getConnectionState();
      expect(['reconnecting', 'error']).toContain(state);

      // Get connection again - should reuse if in reconnecting
      const connection2 = chatService.getSSEConnection('test-conv-id');

      // If in reconnecting state, should be same instance
      if (state === 'reconnecting') {
        expect(connection1).toBe(connection2);
      }
    });

    it('should clean up disconnected connection from pool', async () => {
      // Mock successful connection
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);
      });

      // Get connection
      const connection = chatService.getSSEConnection('test-conv-id');
      connection.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Disconnect - should trigger cleanup
      connection.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Get connection again - should create new one
      const newConnection = chatService.getSSEConnection('test-conv-id');

      // Should be different instance
      expect(connection).not.toBe(newConnection);
    });
  });

  // Subtask 2.3: Error propagation tests
  describe('Error Propagation (Subtask 2.3)', () => {
    it('should propagate connection errors to registered callbacks', async () => {
      const errorCallback = vi.fn();
      const unsubscribe = chatService.onConnectionError(errorCallback);

      const NetworkErrorClass = (
        await import('../utils/networkErrorHandler.js')
      ).NetworkError;

      // Mock failed connection with retryable error
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        const error = new NetworkErrorClass(
          'Connection failed',
          'connection_failed',
          {
            retryable: true,
          }
        );
        options.onerror?.(error);
        throw error;
      });

      // Get connection and let it fail
      const connection = chatService.getSSEConnection('test-conv-id');
      connection.connect();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Error callback should have been called
      expect(errorCallback).toHaveBeenCalled();
      expect(errorCallback).toHaveBeenCalledWith(
        'test-conv-id',
        expect.any(Object)
      );

      unsubscribe();
    });

    it('should provide user-friendly error messages', async () => {
      const errorCallback = vi.fn();
      chatService.onConnectionError(errorCallback);

      // Mock network error
      const NetworkErrorClass = (
        await import('../utils/networkErrorHandler.js')
      ).NetworkError;
      const networkError = new NetworkErrorClass(
        'Network error',
        'connection_failed',
        { retryable: true }
      );

      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        options.onerror?.(networkError);
        throw networkError;
      });

      // Get connection and let it fail
      const connection = chatService.getSSEConnection('test-conv-id');
      connection.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should have user-friendly message
      expect(errorCallback).toHaveBeenCalledWith(
        'test-conv-id',
        expect.objectContaining({
          message: expect.stringContaining('check your internet connection'),
        })
      );
    });

    it('should handle multiple error callbacks', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      chatService.onConnectionError(callback1);
      chatService.onConnectionError(callback2);

      // Mock failed connection
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        const error = new Error('Connection failed');
        options.onerror?.(error);
        throw error;
      });

      // Get connection and let it fail
      const connection = chatService.getSSEConnection('test-conv-id');
      connection.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Both callbacks should have been called
      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should allow unsubscribing from error callbacks', async () => {
      const errorCallback = vi.fn();
      const unsubscribe = chatService.onConnectionError(errorCallback);

      // Unsubscribe immediately
      unsubscribe();

      // Mock failed connection
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        const error = new Error('Connection failed');
        options.onerror?.(error);
        throw error;
      });

      // Get connection and let it fail
      const connection = chatService.getSSEConnection('test-conv-id');
      connection.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Callback should not have been called
      expect(errorCallback).not.toHaveBeenCalled();
    });

    it('should provide actionable guidance for different error types', async () => {
      const errorCallback = vi.fn();
      chatService.onConnectionError(errorCallback);

      const NetworkErrorClass = (
        await import('../utils/networkErrorHandler.js')
      ).NetworkError;

      // Test timeout error
      const timeoutError = new NetworkErrorClass('Timeout', 'timeout', {
        retryable: true,
      });

      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        options.onerror?.(timeoutError);
        throw timeoutError;
      });

      const connection = chatService.getSSEConnection('test-conv-id');
      connection.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(errorCallback).toHaveBeenCalledWith(
        'test-conv-id',
        expect.objectContaining({
          message: expect.stringContaining('internet speed'),
        })
      );
    });

    it('should handle callback errors gracefully', async () => {
      const throwingCallback = vi.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });
      const normalCallback = vi.fn();

      chatService.onConnectionError(throwingCallback);
      chatService.onConnectionError(normalCallback);

      // Mock failed connection
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        const error = new Error('Connection failed');
        options.onerror?.(error);
        throw error;
      });

      // Get connection and let it fail
      const connection = chatService.getSSEConnection('test-conv-id');
      connection.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Both callbacks should have been called despite error in first one
      expect(throwingCallback).toHaveBeenCalled();
      expect(normalCallback).toHaveBeenCalled();
    });
  });
});

/**
 * Task 5.4: Error Handling Tests
 *
 * Tests for error classification, exponential backoff, and error message mapping
 */
describe('Error Handling (Task 5)', () => {
  describe('Error Classification (Task 5.1)', () => {
    it('should classify network errors as retryable', async () => {
      const { NetworkError } = await import('../utils/networkErrorHandler.js');

      const networkError = new NetworkError(
        'Network connection failed',
        'connection_failed',
        { retryable: true }
      );

      expect(networkError.retryable).toBe(true);
      expect(networkError.type).toBe('connection_failed');
    });

    it('should classify authentication errors as non-retryable', async () => {
      const { NetworkError } = await import('../utils/networkErrorHandler.js');

      const authError = new NetworkError(
        'Authentication required',
        'unauthorized',
        { retryable: false }
      );

      expect(authError.retryable).toBe(false);
      expect(authError.type).toBe('unauthorized');
    });

    it('should classify 5xx server errors as retryable', async () => {
      const { NetworkError } = await import('../utils/networkErrorHandler.js');

      const serverError = new NetworkError(
        'Server error: 500',
        'server_error',
        { statusCode: 500, retryable: true }
      );

      expect(serverError.retryable).toBe(true);
      expect(serverError.type).toBe('server_error');
      expect(serverError.statusCode).toBe(500);
    });

    it('should classify 4xx client errors as non-retryable', async () => {
      const { NetworkError } = await import('../utils/networkErrorHandler.js');

      const clientError = new NetworkError(
        'Invalid request data',
        'validation_error',
        { statusCode: 400, retryable: false }
      );

      expect(clientError.retryable).toBe(false);
      expect(clientError.type).toBe('validation_error');
      expect(clientError.statusCode).toBe(400);
    });

    it('should classify timeout errors as retryable', async () => {
      const { NetworkError } = await import('../utils/networkErrorHandler.js');

      const timeoutError = new NetworkError('Request timed out', 'timeout', {
        retryable: true,
      });

      expect(timeoutError.retryable).toBe(true);
      expect(timeoutError.type).toBe('timeout');
    });

    it('should classify rate limit errors as retryable', async () => {
      const { NetworkError } = await import('../utils/networkErrorHandler.js');

      const rateLimitError = new NetworkError(
        'Too many requests',
        'rate_limited',
        { statusCode: 429, retryable: true }
      );

      expect(rateLimitError.retryable).toBe(true);
      expect(rateLimitError.type).toBe('rate_limited');
      expect(rateLimitError.statusCode).toBe(429);
    });

    it('should use default retryable value based on error type', async () => {
      const { NetworkError } = await import('../utils/networkErrorHandler.js');

      // Test default retryable for connection_failed (should be true)
      const error1 = new NetworkError('Connection failed', 'connection_failed');
      expect(error1.retryable).toBe(true);

      // Test default retryable for unauthorized (should be false)
      const error2 = new NetworkError('Unauthorized', 'unauthorized');
      expect(error2.retryable).toBe(false);

      // Test default retryable for server_error (should be true)
      const error3 = new NetworkError('Server error', 'server_error');
      expect(error3.retryable).toBe(true);
    });
  });

  describe('Exponential Backoff (Task 5.2)', () => {
    let client: ChatSSEClient;
    let fetchEventSourceSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      fetchEventSourceSpy = vi.spyOn(
        fetchEventSourceModule,
        'fetchEventSource'
      );
      client = new ChatSSEClient('test-conversation-id');
    });

    afterEach(() => {
      client.disconnect();
      vi.clearAllMocks();
    });

    it('should calculate exponential backoff delay', async () => {
      const { NetworkError } = await import('../utils/networkErrorHandler.js');
      const reconnectDelays: number[] = [];

      // Mock failed connection that triggers reconnection
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        const error = new NetworkError(
          'Connection failed',
          'connection_failed',
          {
            retryable: true,
          }
        );
        options.onerror?.(error);
        throw error;
      });

      // Track reconnection attempts
      client.on('reconnectAttempt', (_attempt, _maxAttempts, delay) => {
        reconnectDelays.push(delay);
      });

      // Trigger initial connection failure
      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Wait for multiple reconnection attempts
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Verify exponential backoff pattern
      // Each delay should be roughly 2x the previous (with jitter)
      if (reconnectDelays.length >= 2) {
        for (let i = 1; i < reconnectDelays.length; i++) {
          // Allow for jitter (±1000ms), so check if roughly doubled
          const ratio = reconnectDelays[i] / reconnectDelays[i - 1];
          // With jitter, ratio can be as low as 1.2x or as high as 3x
          expect(ratio).toBeGreaterThan(1.2); // Should be at least 1.2x
          expect(ratio).toBeLessThan(3.5); // But not more than 3.5x due to jitter
        }
      }
    }, 10000);

    it('should cap maximum delay at 30 seconds', async () => {
      const { NetworkError } = await import('../utils/networkErrorHandler.js');
      const reconnectDelays: number[] = [];

      // Mock failed connection
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        const error = new NetworkError(
          'Connection failed',
          'connection_failed',
          {
            retryable: true,
          }
        );
        options.onerror?.(error);
        throw error;
      });

      // Track reconnection attempts
      client.on('reconnectAttempt', (_attempt, _maxAttempts, delay) => {
        reconnectDelays.push(delay);
      });

      // Trigger connection failure
      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Wait for multiple reconnection attempts
      await new Promise((resolve) => setTimeout(resolve, 10000));

      // Verify no delay exceeds 31 seconds (30s max + 1s jitter)
      for (const delay of reconnectDelays) {
        expect(delay).toBeLessThanOrEqual(31000);
      }
    }, 15000);

    it('should reset attempts on successful connection', async () => {
      const { NetworkError } = await import('../utils/networkErrorHandler.js');
      let connectionAttempts = 0;

      // Mock connection that fails first, then succeeds
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        connectionAttempts++;

        if (connectionAttempts === 1) {
          // First attempt fails
          const error = new NetworkError(
            'Connection failed',
            'connection_failed',
            {
              retryable: true,
            }
          );
          options.onerror?.(error);
          throw error;
        } else {
          // Subsequent attempts succeed
          await options.onopen?.({
            ok: true,
            status: 200,
            text: async () => '',
          } as Response);
        }
      });

      // Trigger connection
      client.connect();

      // Wait for failure and reconnection
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify connection is now successful
      expect(client.getConnectionState()).toBe('connected');

      // Verify reconnect attempts were reset
      const health = client.getConnectionHealth();
      expect(health.reconnectAttempts).toBe(0);
    }, 5000);

    it('should add jitter to prevent thundering herd', async () => {
      const { NetworkError } = await import('../utils/networkErrorHandler.js');
      const reconnectDelays: number[] = [];

      // Mock failed connection
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        const error = new NetworkError(
          'Connection failed',
          'connection_failed',
          {
            retryable: true,
          }
        );
        options.onerror?.(error);
        throw error;
      });

      // Track reconnection attempts
      client.on('reconnectAttempt', (_attempt, _maxAttempts, delay) => {
        reconnectDelays.push(delay);
      });

      // Trigger connection failure
      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Wait for a few reconnection attempts
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Verify delays are not exact multiples (jitter is applied)
      if (reconnectDelays.length >= 2) {
        // Check that delays are not exactly 2x each other
        for (let i = 1; i < reconnectDelays.length; i++) {
          const expectedDelay = reconnectDelays[i - 1] * 2;
          const actualDelay = reconnectDelays[i];

          // Should not be exactly 2x due to jitter
          expect(actualDelay).not.toBe(expectedDelay);

          // But should be within reasonable range (1.5x to 3x)
          expect(actualDelay).toBeGreaterThan(expectedDelay * 0.75);
          expect(actualDelay).toBeLessThan(expectedDelay * 1.5);
        }
      }
    }, 5000);
  });

  describe('User-Friendly Error Messages (Task 5.3)', () => {
    let chatService: ReturnType<
      typeof import('../services/chat.js').getChatService
    >;

    beforeEach(async () => {
      const chatModule = await import('../services/chat.js');
      chatService = chatModule.getChatService();
    });

    afterEach(() => {
      chatService.disconnectAllSSE();
    });

    it('should map connection_failed to user-friendly message', async () => {
      const { NetworkError } = await import('../utils/networkErrorHandler.js');
      const errorCallback = vi.fn();
      chatService.onConnectionError(errorCallback);

      const fetchEventSourceSpy = vi.spyOn(
        fetchEventSourceModule,
        'fetchEventSource'
      );
      const error = new NetworkError('Connection failed', 'connection_failed', {
        retryable: true,
      });

      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        options.onerror?.(error);
        throw error;
      });

      const connection = chatService.getSSEConnection('test-conv-id');
      connection.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(errorCallback).toHaveBeenCalledWith(
        'test-conv-id',
        expect.objectContaining({
          message: expect.stringMatching(
            /unable to establish connection|check your internet connection/i
          ),
        })
      );
    });

    it('should map timeout to user-friendly message with actionable guidance', async () => {
      const { NetworkError } = await import('../utils/networkErrorHandler.js');
      const errorCallback = vi.fn();
      chatService.onConnectionError(errorCallback);

      const fetchEventSourceSpy = vi.spyOn(
        fetchEventSourceModule,
        'fetchEventSource'
      );
      const error = new NetworkError('Timeout', 'timeout', { retryable: true });

      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        options.onerror?.(error);
        throw error;
      });

      const connection = chatService.getSSEConnection('test-conv-id');
      connection.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(errorCallback).toHaveBeenCalledWith(
        'test-conv-id',
        expect.objectContaining({
          message: expect.stringMatching(/timeout|internet speed/i),
        })
      );
    });

    it('should map unauthorized to user-friendly message', async () => {
      const { NetworkError } = await import('../utils/networkErrorHandler.js');
      const errorCallback = vi.fn();
      chatService.onConnectionError(errorCallback);

      const fetchEventSourceSpy = vi.spyOn(
        fetchEventSourceModule,
        'fetchEventSource'
      );
      const error = new NetworkError('Unauthorized', 'unauthorized', {
        retryable: false,
      });

      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        options.onerror?.(error);
        throw error;
      });

      const connection = chatService.getSSEConnection('test-conv-id');
      connection.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(errorCallback).toHaveBeenCalledWith(
        'test-conv-id',
        expect.objectContaining({
          message: expect.stringMatching(
            /authentication|session.*expired|refresh.*page/i
          ),
        })
      );
    });

    it('should map server_error to user-friendly message', async () => {
      const { NetworkError } = await import('../utils/networkErrorHandler.js');
      const errorCallback = vi.fn();
      chatService.onConnectionError(errorCallback);

      const fetchEventSourceSpy = vi.spyOn(
        fetchEventSourceModule,
        'fetchEventSource'
      );
      const error = new NetworkError('Server error', 'server_error', {
        retryable: true,
      });

      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        options.onerror?.(error);
        throw error;
      });

      const connection = chatService.getSSEConnection('test-conv-id');
      connection.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(errorCallback).toHaveBeenCalledWith(
        'test-conv-id',
        expect.objectContaining({
          message: expect.stringMatching(/server error|try again/i),
        })
      );
    });

    it('should map rate_limited to user-friendly message', async () => {
      const { NetworkError } = await import('../utils/networkErrorHandler.js');
      const errorCallback = vi.fn();
      chatService.onConnectionError(errorCallback);

      const fetchEventSourceSpy = vi.spyOn(
        fetchEventSourceModule,
        'fetchEventSource'
      );
      const error = new NetworkError('Too many requests', 'rate_limited', {
        retryable: true,
      });

      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        options.onerror?.(error);
        throw error;
      });

      const connection = chatService.getSSEConnection('test-conv-id');
      connection.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(errorCallback).toHaveBeenCalledWith(
        'test-conv-id',
        expect.objectContaining({
          message: expect.stringMatching(/too many requests|wait.*moment/i),
        })
      );
    });

    it('should include actionable guidance for all error types', async () => {
      const { NetworkError } = await import('../utils/networkErrorHandler.js');
      const errorTypes: Array<{ type: string; expectedGuidance: RegExp }> = [
        { type: 'connection_failed', expectedGuidance: /check.*internet/i },
        { type: 'timeout', expectedGuidance: /internet speed|try again/i },
        { type: 'unauthorized', expectedGuidance: /refresh.*page|log in/i },
        { type: 'server_error', expectedGuidance: /try again/i },
        { type: 'rate_limited', expectedGuidance: /wait.*moment/i },
      ];

      for (const { type, expectedGuidance } of errorTypes) {
        const errorCallback = vi.fn();
        chatService.onConnectionError(errorCallback);

        const fetchEventSourceSpy = vi.spyOn(
          fetchEventSourceModule,
          'fetchEventSource'
        );
        const error = new NetworkError(`Test ${type}`, type as any, {
          retryable: true,
        });

        fetchEventSourceSpy.mockImplementation(async (_url, options) => {
          options.onerror?.(error);
          throw error;
        });

        const connection = chatService.getSSEConnection(`test-conv-${type}`);
        connection.connect();
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(errorCallback).toHaveBeenCalledWith(
          `test-conv-${type}`,
          expect.objectContaining({
            message: expect.stringMatching(expectedGuidance),
          })
        );

        // Cleanup
        connection.disconnect();
        vi.clearAllMocks();
      }
    });

    it('should indicate retryable errors in error object', async () => {
      const { NetworkError } = await import('../utils/networkErrorHandler.js');
      const errorCallback = vi.fn();
      chatService.onConnectionError(errorCallback);

      const fetchEventSourceSpy = vi.spyOn(
        fetchEventSourceModule,
        'fetchEventSource'
      );
      const retryableError = new NetworkError(
        'Connection failed',
        'connection_failed',
        {
          retryable: true,
        }
      );

      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        options.onerror?.(retryableError);
        throw retryableError;
      });

      const connection = chatService.getSSEConnection('test-conv-id');
      connection.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(errorCallback).toHaveBeenCalledWith(
        'test-conv-id',
        expect.objectContaining({
          retryable: true,
        })
      );
    });

    it('should indicate non-retryable errors in error object', async () => {
      const { NetworkError } = await import('../utils/networkErrorHandler.js');
      const errorCallback = vi.fn();
      chatService.onConnectionError(errorCallback);

      const fetchEventSourceSpy = vi.spyOn(
        fetchEventSourceModule,
        'fetchEventSource'
      );
      const nonRetryableError = new NetworkError(
        'Unauthorized',
        'unauthorized',
        {
          retryable: false,
        }
      );

      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        options.onerror?.(nonRetryableError);
        throw nonRetryableError;
      });

      const connection = chatService.getSSEConnection('test-conv-id');
      connection.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(errorCallback).toHaveBeenCalledWith(
        'test-conv-id',
        expect.objectContaining({
          retryable: false,
        })
      );
    });
  });
});

/**
 * Task 6: Connection Health Monitoring Tests
 *
 * Tests for heartbeat message handling, connection health tracking, and stale connection detection
 */
describe('Connection Health Monitoring (Task 6)', () => {
  let client: ChatSSEClient;
  let fetchEventSourceSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchEventSourceSpy = vi.spyOn(fetchEventSourceModule, 'fetchEventSource');
    fetchEventSourceSpy.mockResolvedValue(undefined);
    client = new ChatSSEClient('test-conversation-id');
  });

  afterEach(() => {
    client.disconnect();
    vi.clearAllMocks();
  });

  // Task 6.1: Heartbeat message handling tests
  describe('Heartbeat Message Handling (Task 6.1)', () => {
    it('should handle heartbeat messages without emitting events', async () => {
      const mockOnMessageStart = vi.fn();
      const mockOnMessageChunk = vi.fn();
      const mockOnMessageEnd = vi.fn();
      const mockOnMessageError = vi.fn();

      client.on('messageStart', mockOnMessageStart);
      client.on('messageChunk', mockOnMessageChunk);
      client.on('messageEnd', mockOnMessageEnd);
      client.on('messageError', mockOnMessageError);

      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        // Simulate successful connection
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);

        // Simulate heartbeat message
        options.onmessage?.({
          data: JSON.stringify({
            type: 'heartbeat',
            correlationId: 'heartbeat',
            timestamp: Date.now(),
          }),
        } as MessageEvent);
      });

      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Heartbeat should not trigger any message events
      expect(mockOnMessageStart).not.toHaveBeenCalled();
      expect(mockOnMessageChunk).not.toHaveBeenCalled();
      expect(mockOnMessageEnd).not.toHaveBeenCalled();
      expect(mockOnMessageError).not.toHaveBeenCalled();
    });

    it('should update lastMessageTimestamp on heartbeat', async () => {
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);

        // Simulate heartbeat message
        options.onmessage?.({
          data: JSON.stringify({
            type: 'heartbeat',
            correlationId: 'heartbeat',
            timestamp: Date.now(),
          }),
        } as MessageEvent);
      });

      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const health = client.getConnectionHealth();
      expect(health.lastMessageTimestamp).not.toBeNull();
      expect(health.lastMessageTimestamp).toBeInstanceOf(Date);
    });

    it('should log heartbeat messages at debug level', async () => {
      const loggerModule = await import('../utils/logger.js');
      const { frontendLogger } = loggerModule;

      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);

        options.onmessage?.({
          data: JSON.stringify({
            type: 'heartbeat',
            correlationId: 'heartbeat',
            timestamp: Date.now(),
          }),
        } as MessageEvent);
      });

      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(frontendLogger.log).toHaveBeenCalledWith(
        'Heartbeat received',
        expect.objectContaining({
          metadata: expect.objectContaining({
            conversationId: 'test-conversation-id',
          }),
        })
      );
    });
  });

  // Task 6.2: Connection health tracking tests
  describe('Connection Health Tracking (Task 6.2)', () => {
    it('should track lastMessageTimestamp on connection open', async () => {
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);
      });

      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const health = client.getConnectionHealth();
      expect(health.lastMessageTimestamp).not.toBeNull();
      expect(health.lastMessageTimestamp).toBeInstanceOf(Date);
    });

    it('should update lastMessageTimestamp on every message received', async () => {
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);

        // Send multiple messages with delays
        setTimeout(() => {
          options.onmessage?.({
            data: JSON.stringify({
              type: 'start',
              messageId: 'msg-1',
              correlationId: 'corr-1',
              timestamp: Date.now(),
            }),
          } as MessageEvent);
        }, 100);

        setTimeout(() => {
          options.onmessage?.({
            data: JSON.stringify({
              type: 'chunk',
              content: 'test',
              messageId: 'msg-1',
              correlationId: 'corr-1',
              timestamp: Date.now(),
            }),
          } as MessageEvent);
        }, 200);
      });

      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const health1 = client.getConnectionHealth();
      const timestamp1 = health1.lastMessageTimestamp;

      // Wait for second message (needs to be after the 200ms setTimeout in mock)
      await new Promise((resolve) => setTimeout(resolve, 300));

      const health2 = client.getConnectionHealth();
      const timestamp2 = health2.lastMessageTimestamp;

      // Timestamp should have been updated
      expect(timestamp2).not.toBeNull();
      expect(timestamp1).not.toBeNull();
      if (timestamp1 && timestamp2) {
        expect(timestamp2.getTime()).toBeGreaterThan(timestamp1.getTime());
      }
    });

    it('should expose getConnectionHealth() method with all required fields', () => {
      const health = client.getConnectionHealth();

      expect(health).toHaveProperty('state');
      expect(health).toHaveProperty('lastConnected');
      expect(health).toHaveProperty('lastMessageTimestamp');
      expect(health).toHaveProperty('timeSinceLastMessage');
      expect(health).toHaveProperty('reconnectAttempts');
      expect(health).toHaveProperty('maxReconnectAttempts');
      expect(health).toHaveProperty('nextReconnectDelay');
      expect(health).toHaveProperty('isOnline');
      expect(health).toHaveProperty('isStale');
    });

    it('should calculate timeSinceLastMessage correctly', async () => {
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);
      });

      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      const health = client.getConnectionHealth();
      expect(health.timeSinceLastMessage).not.toBeNull();
      if (health.timeSinceLastMessage !== null) {
        expect(health.timeSinceLastMessage).toBeGreaterThan(0);
        expect(health.timeSinceLastMessage).toBeLessThan(200); // Should be less than 200ms
      }
    });

    it('should return null for timeSinceLastMessage when no messages received', () => {
      const health = client.getConnectionHealth();
      expect(health.lastMessageTimestamp).toBeNull();
      expect(health.timeSinceLastMessage).toBeNull();
    });

    it('should indicate connection is not stale when messages are recent', async () => {
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);
      });

      client.connect();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const health = client.getConnectionHealth();
      expect(health.isStale).toBe(false);
    });
  });

  // Task 6.3: Stale connection detection tests
  describe('Stale Connection Detection (Task 6.3)', () => {
    it('should detect stale connection after 5 minutes of no messages', async () => {
      vi.useFakeTimers();

      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);
      });

      client.connect();
      await vi.advanceTimersByTimeAsync(50);

      expect(client.getConnectionState()).toBe('connected');

      // Fast-forward 5 minutes
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      const health = client.getConnectionHealth();
      expect(health.isStale).toBe(true);

      vi.useRealTimers();
    });

    it('should force reconnection when connection is stale', async () => {
      vi.useFakeTimers();

      let connectionAttempts = 0;
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        connectionAttempts++;
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);
      });

      client.connect();
      await vi.advanceTimersByTimeAsync(50);

      expect(connectionAttempts).toBe(1);
      expect(client.getConnectionState()).toBe('connected');

      // Fast-forward past stale threshold (5 minutes) and trigger health check
      // Health check runs every 30 seconds, so advance to 5 min + 30 sec
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 30 * 1000 + 200);

      // Should have triggered reconnection (forceReconnect has 100ms delay)
      await vi.advanceTimersByTimeAsync(200);

      // Should have triggered reconnection
      expect(connectionAttempts).toBeGreaterThan(1);

      vi.useRealTimers();
    });

    it('should log stale connection detection', async () => {
      vi.useFakeTimers();

      const loggerModule = await import('../utils/logger.js');
      const { frontendLogger } = loggerModule;

      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);
      });

      client.connect();
      await vi.advanceTimersByTimeAsync(50);

      // Fast-forward past stale threshold and health check interval
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 30 * 1000);

      expect(frontendLogger.warn).toHaveBeenCalledWith(
        expect.stringMatching(/stale.*5 minutes.*reconnection/i),
        expect.objectContaining({
          metadata: expect.objectContaining({
            conversationId: 'test-conversation-id',
            timeSinceLastMessage: expect.any(Number),
            staleThreshold: expect.any(Number),
          }),
        })
      );

      vi.useRealTimers();
    });

    it('should not detect stale connection if messages are being received', async () => {
      vi.useFakeTimers();

      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);

        // Send heartbeat every minute
        const heartbeatInterval = setInterval(() => {
          options.onmessage?.({
            data: JSON.stringify({
              type: 'heartbeat',
              correlationId: 'heartbeat',
              timestamp: Date.now(),
            }),
          } as MessageEvent);
        }, 60 * 1000);

        // Clean up interval when connection closes
        return () => clearInterval(heartbeatInterval);
      });

      client.connect();
      await vi.advanceTimersByTimeAsync(50);

      // Fast-forward 10 minutes (with heartbeats every minute)
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(60 * 1000);
      }

      const health = client.getConnectionHealth();
      expect(health.isStale).toBe(false);
      expect(client.getConnectionState()).toBe('connected');

      vi.useRealTimers();
    });

    it('should reset stale detection after reconnection', async () => {
      vi.useFakeTimers();

      let connectionAttempts = 0;
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        connectionAttempts++;
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);
      });

      client.connect();
      await vi.advanceTimersByTimeAsync(50);

      // Fast-forward to trigger stale detection and health check
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 30 * 1000 + 200);

      // Allow time for forceReconnect to execute
      await vi.advanceTimersByTimeAsync(200);

      // Should have reconnected
      expect(connectionAttempts).toBeGreaterThan(1);

      // Wait a bit after reconnection
      await vi.advanceTimersByTimeAsync(1000);

      const health = client.getConnectionHealth();
      expect(health.isStale).toBe(false);

      vi.useRealTimers();
    });

    it('should emit health change events during stale detection', async () => {
      vi.useFakeTimers();

      const healthChangeCallback = vi.fn();
      client.on('connectionHealthChange', healthChangeCallback);

      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);
      });

      client.connect();
      await vi.advanceTimersByTimeAsync(50);

      // Clear previous calls
      healthChangeCallback.mockClear();

      // Fast-forward to trigger health check
      await vi.advanceTimersByTimeAsync(30 * 1000);

      // Should have emitted health change event
      expect(healthChangeCallback).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  // Integration test: Full health monitoring flow
  describe('Health Monitoring Integration', () => {
    it('should maintain healthy connection with regular heartbeats', async () => {
      vi.useFakeTimers();

      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);

        // Simulate backend sending heartbeats every 30 seconds
        const heartbeatInterval = setInterval(() => {
          options.onmessage?.({
            data: JSON.stringify({
              type: 'heartbeat',
              correlationId: 'heartbeat',
              timestamp: Date.now(),
            }),
          } as MessageEvent);
        }, 30 * 1000);

        return () => clearInterval(heartbeatInterval);
      });

      client.connect();
      await vi.advanceTimersByTimeAsync(50);

      expect(client.getConnectionState()).toBe('connected');

      // Fast-forward 10 minutes with heartbeats
      for (let i = 0; i < 20; i++) {
        await vi.advanceTimersByTimeAsync(30 * 1000);
      }

      // Connection should still be healthy
      const health = client.getConnectionHealth();
      expect(health.state).toBe('connected');
      expect(health.isStale).toBe(false);
      expect(health.lastMessageTimestamp).not.toBeNull();

      vi.useRealTimers();
    });

    it('should detect and recover from stale connection', async () => {
      vi.useFakeTimers();

      let connectionAttempts = 0;
      fetchEventSourceSpy.mockImplementation(async (_url, options) => {
        connectionAttempts++;
        await options.onopen?.({
          ok: true,
          status: 200,
          text: async () => '',
        } as Response);

        // Only send heartbeats on second connection
        if (connectionAttempts > 1) {
          const heartbeatInterval = setInterval(() => {
            options.onmessage?.({
              data: JSON.stringify({
                type: 'heartbeat',
                correlationId: 'heartbeat',
                timestamp: Date.now(),
              }),
            } as MessageEvent);
          }, 30 * 1000);

          return () => clearInterval(heartbeatInterval);
        }
      });

      client.connect();
      await vi.advanceTimersByTimeAsync(50);

      expect(connectionAttempts).toBe(1);

      // Fast-forward to trigger stale detection (no heartbeats on first connection)
      // Health check runs every 30 seconds
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 30 * 1000 + 200);

      // Allow time for forceReconnect to execute
      await vi.advanceTimersByTimeAsync(200);

      // Should have reconnected
      expect(connectionAttempts).toBeGreaterThan(1);

      // Fast-forward with heartbeats on new connection
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(30 * 1000);
      }

      // Connection should be healthy now
      const health = client.getConnectionHealth();
      expect(health.state).toBe('connected');
      expect(health.isStale).toBe(false);

      vi.useRealTimers();
    });
  });
});
