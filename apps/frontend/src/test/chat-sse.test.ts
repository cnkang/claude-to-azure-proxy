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
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock network utils
vi.mock('../utils/networkErrorHandler.js', () => ({
  NetworkError: class NetworkError extends Error {
    constructor(
      message: string,
      public type: string,
      public options?: { retryable?: boolean; statusCode?: number }
    ) {
      super(message);
      this.retryable = options?.retryable ?? false;
      this.statusCode = options?.statusCode;
    }
    retryable: boolean;
    statusCode?: number;
  },
  networkErrorHandler: {
    classifyError: (error: unknown) => error,
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
});
