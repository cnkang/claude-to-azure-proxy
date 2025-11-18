// Logger imported below as frontendLogger
/**
 * Chat Service with Server-Sent Events Support
 *
 * Provides real-time chat functionality with streaming responses using SSE,
 * message sending, and conversation management.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 6.3, 7.3
 */

import { fetchEventSource } from '@microsoft/fetch-event-source';
import type {
  Message,
  StreamChunk,
  ChatRequest,
  FileInfo,
} from '../types/index.js';
import { getSessionManager } from './session.js';
import { frontendLogger } from '../utils/logger.js';
import {
  NetworkError,
  networkErrorHandler,
  networkUtils,
} from '../utils/networkErrorHandler.js';
import { isMemoryHigh, suggestGarbageCollection, getMemoryStats } from '../utils/memoryManager.js';

// API endpoints
const CHAT_SEND_ENDPOINT = '/api/chat/send';
const CHAT_STREAM_ENDPOINT = '/api/chat/stream';
const FILE_UPLOAD_ENDPOINT = '/api/upload';

/**
 * SSE connection states
 */
export type SSEConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'reconnecting';

/**
 * Connection health status
 * 
 * Task 6.2: Enhanced with message timestamp tracking
 * Task 11.4: Added memory usage metrics
 */
export interface ConnectionHealth {
  state: SSEConnectionState;
  lastConnected: Date | null;
  lastMessageTimestamp: Date | null;
  timeSinceLastMessage: number | null;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  nextReconnectDelay: number;
  isOnline: boolean;
  isStale: boolean;
  memoryUsage?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
    percentUsed: number;
  };
}

/**
 * Chat event types
 */
export interface ChatEvents {
  messageStart: (data: { messageId: string; correlationId: string }) => void;
  messageChunk: (data: {
    content: string;
    messageId: string;
    correlationId: string;
  }) => void;
  messageEnd: (data: { messageId: string; correlationId: string }) => void;
  messageError: (data: { _error: string; correlationId: string }) => void;
  connectionStateChange: (state: SSEConnectionState) => void;
  connectionError: (_error: NetworkError) => void;
  connectionHealthChange: (health: ConnectionHealth) => void;
  reconnectAttempt: (
    attempt: number,
    maxAttempts: number,
    delay: number
  ) => void;
}

/**
 * Chat SSE Client for real-time streaming with enhanced error handling
 * 
 * Task 11.2: Memory optimization with proper cleanup
 */
export class ChatSSEClient {
  private abortController: AbortController | null = null;
  private connectionState: SSEConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private readonly maxReconnectDelay = 30000;
  private readonly backoffFactor = 2;
  private reconnectTimer: number | null = null;
  private readonly conversationId: string;
  private readonly eventListeners: Partial<ChatEvents> = {};
  private readonly sessionManager = getSessionManager();
  private lastConnected: Date | null = null;
  private connectionHealthTimer: number | null = null;
  private readonly healthCheckInterval = 30000; // 30 seconds
  private isManuallyDisconnected = false;
  private onlineListener: (() => void) | null = null;
  private offlineListener: (() => void) | null = null;
  
  // Task 1.6: Debounce mechanism to prevent rapid connect() calls
  private lastConnectAttempt: number = 0;
  private readonly connectDebounceMs = 1000; // 1 second debounce
  
  // Task 6.2: Connection health tracking
  private lastMessageTimestamp: Date | null = null;
  private readonly staleConnectionThreshold = 5 * 60 * 1000; // 5 minutes
  
  // Task 11.2: Track if instance has been destroyed for cleanup
  private isDestroyed = false;

  constructor(conversationId: string) {
    this.conversationId = conversationId;
    this.setupNetworkListeners();
  }

  /**
   * Add event listener
   */
  public on<K extends keyof ChatEvents>(
    event: K,
    listener: ChatEvents[K]
  ): void {
    this.eventListeners[event] = listener;
  }

  /**
   * Remove event listener
   */
  public off<K extends keyof ChatEvents>(event: K): void {
    delete this.eventListeners[event];
  }

  /**
   * Connect to SSE stream with enhanced error handling
   * 
   * Subtask 1.1: Connection state validation
   * Subtask 1.2: AbortController lifecycle management
   * Subtask 1.3: Event handler registration timing
   * Task 1.6: Debounce mechanism to prevent rapid connect() calls
   * Task 11.2: Check if destroyed before connecting
   */
  public connect(): void {
    // Task 11.2: Prevent operations on destroyed instances
    if (this.isDestroyed) {
      frontendLogger.warn('Cannot connect: client has been destroyed', {
        metadata: { conversationId: this.conversationId },
      });
      return;
    }
    
    // Task 1.6: Debounce rapid connect() calls
    const now = Date.now();
    const timeSinceLastAttempt = now - this.lastConnectAttempt;
    
    if (timeSinceLastAttempt < this.connectDebounceMs) {
      frontendLogger.warn('Connect() called too soon, debouncing', {
        metadata: {
          conversationId: this.conversationId,
          timeSinceLastAttempt,
          debounceMs: this.connectDebounceMs,
        },
      });
      return;
    }
    
    this.lastConnectAttempt = now;

    // Subtask 1.1: Check if connection is already 'connected' or 'connecting'
    if (
      this.connectionState === 'connected' ||
      this.connectionState === 'connecting'
    ) {
      frontendLogger.warn('Connection already active, skipping connect()', {
        metadata: {
          conversationId: this.conversationId,
          currentState: this.connectionState,
        },
      });
      return;
    }

    // Subtask 1.1: Check if AbortController exists and is not aborted
    if (this.abortController && !this.abortController.signal.aborted) {
      frontendLogger.warn('AbortController exists, connection may be active', {
        metadata: {
          conversationId: this.conversationId,
          aborted: this.abortController.signal.aborted,
        },
      });
      return;
    }

    // Check if online
    if (!networkUtils.isOnline()) {
      const networkError = new NetworkError(
        'Cannot connect while offline',
        'connection_failed',
        { retryable: true }
      );
      this.handleConnectionError(networkError);
      return;
    }

    this.isManuallyDisconnected = false;
    this.setConnectionState('connecting');

    const sessionId = this.sessionManager.getSessionId();
    if (!sessionId) {
      const networkError = new NetworkError('No active session', 'unauthorized', {
        retryable: false,
      });
      this.handleConnectionError(networkError);
      return;
    }

    const url = `${CHAT_STREAM_ENDPOINT}/${this.conversationId}`;
    
    // Subtask 1.2: Create fresh AbortController for each connection attempt
    this.abortController = new AbortController();

    fetchEventSource(url, {
      method: 'GET',
      headers: {
        'x-session-id': sessionId,
      },
      signal: this.abortController.signal,
      
      onopen: async (response) => {
        if (response.ok) {
          frontendLogger.info('SSE connection established', {
            metadata: { conversationId: this.conversationId },
          });

          this.lastConnected = new Date();
          // Task 6.2: Initialize lastMessageTimestamp when connection opens
          this.lastMessageTimestamp = new Date();
          this.setConnectionState('connected');
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;
          this.emitHealthChange();
          this.startHealthCheck();
        } else {
          // Handle non-OK responses
          const errorText = await response.text();
          let errorMessage = 'SSE connection failed';
          
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.error?.message || errorMessage;
          } catch {
            errorMessage = errorText || errorMessage;
          }

          throw new NetworkError(
            errorMessage,
            response.status === 401 ? 'unauthorized' : 'connection_failed',
            {
              statusCode: response.status,
              retryable: response.status >= 500,
            }
          );
        }
      },

      onmessage: (event) => {
        // Task 9.1: Add comprehensive logging for SSE message handling
        frontendLogger.log('🔵 [SSE] Raw message received:', event);
        frontendLogger.log('🔵 [SSE] Data:', event.data);
        frontendLogger.log('🔵 [SSE] Type:', typeof event.data);
        
        try {
          const data = JSON.parse(event.data) as StreamChunk;
          frontendLogger.log('🔵 [SSE] Parsed data:', data);
          frontendLogger.log('🔵 [SSE] Chunk type:', data.type);
          frontendLogger.log('🔵 [SSE] Message ID:', data.messageId);
          frontendLogger.log('🔵 [SSE] Content:', data.content);
          
          this.handleStreamChunk(data);
          
          frontendLogger.log('🔵 [SSE] handleStreamChunk completed');
        } catch (error) {
          frontendLogger.error('🔴 [SSE] Parse error:', error);
          frontendLogger.error('Failed to parse SSE message', {
            metadata: {
              conversationId: this.conversationId,
              eventData: event.data,
            },
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      },

      onerror: (error) => {
        const networkError =
          error instanceof NetworkError
            ? error
            : networkErrorHandler.classifyError(error);

        frontendLogger.error('SSE connection error', {
          metadata: { conversationId: this.conversationId },
          error: networkError,
        });

        this.handleConnectionError(networkError);
        
        // Throw to stop the connection
        throw networkError;
      },

      openWhenHidden: true, // Keep connection open when tab is hidden
    }).catch((error) => {
      // Handle errors that weren't caught by onerror
      if (!this.isManuallyDisconnected) {
        const networkError =
          error instanceof NetworkError
            ? error
            : networkErrorHandler.classifyError(error);

        frontendLogger.error('Failed to connect to SSE stream', {
          metadata: { conversationId: this.conversationId },
          error: networkError,
        });

        this.handleConnectionError(networkError);
      }
    });
  }

  /**
   * Disconnect from SSE stream
   * 
   * Subtask 1.2: Properly clean up AbortController
   * Task 1.6: Reset debounce timer on disconnect
   * Task 11.2: Enhanced cleanup to prevent memory leaks
   */
  public disconnect(): void {
    this.isManuallyDisconnected = true;
    this.clearReconnectTimer();
    this.stopHealthCheck();
    this.removeNetworkListeners();

    // Subtask 1.2: Properly clean up AbortController and nullify it
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.setConnectionState('disconnected');
    this.reconnectAttempts = 0;
    
    // Task 1.6: Reset debounce timer to allow immediate reconnection
    this.lastConnectAttempt = 0;
  }
  
  /**
   * Destroy the client and release all resources
   * 
   * Task 11.2: Complete cleanup to prevent memory leaks
   * - Remove all event listeners
   * - Clear all timers
   * - Nullify all references
   * - Mark as destroyed to prevent further use
   */
  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    
    frontendLogger.info('Destroying ChatSSEClient', {
      metadata: { conversationId: this.conversationId },
    });
    
    // Disconnect if still connected
    this.disconnect();
    
    // Remove all event listeners to break closure references
    this.removeAllListeners();
    
    // Mark as destroyed
    this.isDestroyed = true;
    
    // Nullify references to help garbage collection
    this.lastConnected = null;
    this.lastMessageTimestamp = null;
  }
  
  /**
   * Remove all event listeners
   * 
   * Task 11.2: Cleanup method to remove all registered listeners
   */
  private removeAllListeners(): void {
    // Clear all event listeners
    const eventKeys = Object.keys(this.eventListeners) as Array<keyof ChatEvents>;
    for (const key of eventKeys) {
      delete this.eventListeners[key];
    }
  }
  
  /**
   * Check if client has been destroyed
   * 
   * Task 11.2: Prevent operations on destroyed instances
   */
  public isClientDestroyed(): boolean {
    return this.isDestroyed;
  }

  /**
   * Get current connection state
   */
  public getConnectionState(): SSEConnectionState {
    return this.connectionState;
  }

  /**
   * Get connection health information
   * 
   * Task 6.2: Expose connection health with message timestamp tracking
   * Task 11.4: Include memory usage metrics
   */
  public getConnectionHealth(): ConnectionHealth {
    const now = Date.now();
    const timeSinceLastMessage = this.lastMessageTimestamp
      ? now - this.lastMessageTimestamp.getTime()
      : null;
    
    const isStale = timeSinceLastMessage !== null && 
                    timeSinceLastMessage > this.staleConnectionThreshold;

    // Task 11.4: Get memory usage if available (Chrome/Edge only)
    let memoryUsage: ConnectionHealth['memoryUsage'];
    const perfWithMemory = performance as Performance & {
      memory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
      };
    };
    if (perfWithMemory.memory) {
      const memory = perfWithMemory.memory;
      memoryUsage = {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
        percentUsed: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100,
      };
      
      // Task 11.4: Log warning if memory usage is high
      if (memoryUsage.percentUsed > 80) {
        frontendLogger.warn('High memory usage detected', {
          metadata: {
            conversationId: this.conversationId,
            percentUsed: memoryUsage.percentUsed.toFixed(2),
            usedMB: (memoryUsage.usedJSHeapSize / 1024 / 1024).toFixed(2),
            limitMB: (memoryUsage.jsHeapSizeLimit / 1024 / 1024).toFixed(2),
          },
        });
      }
    }

    return {
      state: this.connectionState,
      lastConnected: this.lastConnected,
      lastMessageTimestamp: this.lastMessageTimestamp,
      timeSinceLastMessage,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      nextReconnectDelay: this.reconnectDelay,
      isOnline: networkUtils.isOnline(),
      isStale,
      memoryUsage,
    };
  }

  /**
   * Force reconnection
   */
  public forceReconnect(): void {
    if (
      this.connectionState === 'connected' ||
      this.connectionState === 'connecting'
    ) {
      this.disconnect();
    }

    // Reset reconnect attempts for manual reconnection
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;

    setTimeout(() => {
      this.connect();
    }, 100);
  }



  /**
   * Handle incoming stream chunks
   * 
   * Task 6.1: Handle heartbeat messages
   * Task 6.2: Update lastMessageTimestamp on every message
   * Task 9.1: Add comprehensive logging for message flow
   */
  private handleStreamChunk(chunk: StreamChunk): void {
    // Task 6.2: Update timestamp on every message received
    this.lastMessageTimestamp = new Date();

    // Task 9.1: Log chunk handling
    frontendLogger.log('🔵 [SSE] handleStreamChunk called with:', chunk);
    frontendLogger.log('🔵 [SSE] Event listeners registered:', Object.keys(this.eventListeners));

    switch (chunk.type) {
      case 'start':
        frontendLogger.log('🔵 [SSE] Handling START event');
        frontendLogger.log('🔵 [SSE] messageStart listener exists:', !!this.eventListeners.messageStart);
        this.eventListeners.messageStart?.({
          messageId: chunk.messageId ?? '',
          correlationId: chunk.correlationId,
        });
        frontendLogger.log('🔵 [SSE] messageStart callback invoked');
        break;

      case 'chunk':
        frontendLogger.log('🔵 [SSE] Handling CHUNK event');
        frontendLogger.log('🔵 [SSE] messageChunk listener exists:', !!this.eventListeners.messageChunk);
        frontendLogger.log('🔵 [SSE] Chunk content:', chunk.content);
        this.eventListeners.messageChunk?.({
          content: chunk.content ?? '',
          messageId: chunk.messageId ?? '',
          correlationId: chunk.correlationId,
        });
        frontendLogger.log('🔵 [SSE] messageChunk callback invoked');
        break;

      case 'end':
        frontendLogger.log('🔵 [SSE] Handling END event');
        frontendLogger.log('🔵 [SSE] messageEnd listener exists:', !!this.eventListeners.messageEnd);
        this.eventListeners.messageEnd?.({
          messageId: chunk.messageId ?? '',
          correlationId: chunk.correlationId,
        });
        frontendLogger.log('🔵 [SSE] messageEnd callback invoked');
        break;

      case 'error':
        frontendLogger.log('🔵 [SSE] Handling ERROR event');
        frontendLogger.log('🔵 [SSE] messageError listener exists:', !!this.eventListeners.messageError);
        this.eventListeners.messageError?.({
          _error: chunk.content ?? 'Unknown error',
          correlationId: chunk.correlationId,
        });
        frontendLogger.log('🔵 [SSE] messageError callback invoked');
        break;

      case 'heartbeat':
        // Task 6.1: Handle heartbeat messages
        // Heartbeat messages keep the connection alive and update lastMessageTimestamp
        // No need to emit events for heartbeats
        frontendLogger.log('🔵 [SSE] Handling HEARTBEAT event');
        frontendLogger.log('Heartbeat received', {
          metadata: {
            conversationId: this.conversationId,
            timestamp: chunk.timestamp,
          },
        });
        break;

      default:
        frontendLogger.warn('🟡 [SSE] Unknown stream chunk type:', chunk.type);
        frontendLogger.warn('Unknown stream chunk type', {
          metadata: {
            conversationId: this.conversationId,
            chunkType: chunk.type,
          },
        });
    }
  }

  /**
   * Handle connection errors with enhanced retry logic
   * 
   * Subtask 1.2: Ensure AbortController cleanup on errors
   */
  private handleConnectionError(error: NetworkError): void {
    this.setConnectionState('error');
    this.eventListeners.connectionError?.(error);
    this.emitHealthChange();

    // Subtask 1.2: Properly clean up AbortController on error
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Don't reconnect if manually disconnected
    if (this.isManuallyDisconnected) {
      this.setConnectionState('disconnected');
      // Task 1.6: Reset debounce timer
      this.lastConnectAttempt = 0;
      return;
    }

    // Don't reconnect for non-retryable errors
    if (!error.retryable) {
      frontendLogger.error('Non-retryable error, not attempting reconnection', {
        metadata: {
          conversationId: this.conversationId,
          errorType: error.type,
        },
        error,
      });
      this.setConnectionState('disconnected');
      // Task 1.6: Reset debounce timer to allow manual reconnection
      this.lastConnectAttempt = 0;
      return;
    }

    // Check if we should attempt reconnection
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    } else {
      frontendLogger.error('Max reconnection attempts reached', {
        metadata: {
          conversationId: this.conversationId,
          attempts: this.reconnectAttempts,
          errorType: error.type,
        },
        error,
      });
      this.setConnectionState('disconnected');
      this.emitHealthChange();
      // Task 1.6: Reset debounce timer to allow manual reconnection
      this.lastConnectAttempt = 0;
    }
  }

  /**
   * Schedule reconnection with exponential backoff and jitter
   */
  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.setConnectionState('reconnecting');

    // Calculate delay with exponential backoff
    const baseDelay = Math.min(
      this.reconnectDelay *
        Math.pow(this.backoffFactor, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 1000;
    const delay = baseDelay + jitter;

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectAttempts++;

      frontendLogger.info('Attempting SSE reconnection', {
        metadata: {
          conversationId: this.conversationId,
          attempt: this.reconnectAttempts,
          maxAttempts: this.maxReconnectAttempts,
          delay: Math.round(delay),
          isOnline: networkUtils.isOnline(),
        },
      });

      // Emit reconnect attempt event
      this.eventListeners.reconnectAttempt?.(
        this.reconnectAttempts,
        this.maxReconnectAttempts,
        Math.round(delay)
      );

      this.emitHealthChange();
      this.connect();
    }, delay);
  }

  /**
   * Clear reconnection timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Set connection state and notify listeners
   */
  private setConnectionState(state: SSEConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      this.eventListeners.connectionStateChange?.(state);
    }
  }

  /**
   * Setup network status listeners
   */
  private setupNetworkListeners(): void {
    this.onlineListener = () => {
      frontendLogger.info('Network came online, attempting reconnection', {
        metadata: { conversationId: this.conversationId },
      });

      if (
        this.connectionState === 'error' ||
        this.connectionState === 'disconnected'
      ) {
        // Reset reconnect attempts when coming back online
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.connect();
      }

      this.emitHealthChange();
    };

    this.offlineListener = () => {
      frontendLogger.warn('Network went offline', {
        metadata: { conversationId: this.conversationId },
      });

      this.clearReconnectTimer();
      this.setConnectionState('error');
      this.emitHealthChange();
    };

    window.addEventListener('online', this.onlineListener);
    window.addEventListener('offline', this.offlineListener);
  }

  /**
   * Remove network status listeners
   */
  private removeNetworkListeners(): void {
    if (this.onlineListener) {
      window.removeEventListener('online', this.onlineListener);
      this.onlineListener = null;
    }

    if (this.offlineListener) {
      window.removeEventListener('offline', this.offlineListener);
      this.offlineListener = null;
    }
  }

  /**
   * Start connection health monitoring
   * 
   * Task 6.3: Implement stale connection detection
   * - Check if no message received for 5 minutes
   * - Force reconnection if connection is stale
   * - Log stale connection detection
   */
  private startHealthCheck(): void {
    this.stopHealthCheck();

    this.connectionHealthTimer = window.setInterval(() => {
      // Task 6.3: Check if connection is stale based on last message timestamp
      if (this.connectionState === 'connected' && this.lastMessageTimestamp) {
        const timeSinceLastMessage = Date.now() - this.lastMessageTimestamp.getTime();

        // If no message received for more than 5 minutes, consider connection stale
        if (timeSinceLastMessage > this.staleConnectionThreshold) {
          frontendLogger.warn(
            'SSE connection is stale (no messages for 5 minutes), forcing reconnection',
            {
              metadata: {
                conversationId: this.conversationId,
                timeSinceLastMessage: Math.round(timeSinceLastMessage / 1000),
                staleThreshold: Math.round(this.staleConnectionThreshold / 1000),
              },
            }
          );

          this.forceReconnect();
        }
      }

      this.emitHealthChange();
    }, this.healthCheckInterval);
  }

  /**
   * Stop connection health monitoring
   */
  private stopHealthCheck(): void {
    if (this.connectionHealthTimer) {
      clearInterval(this.connectionHealthTimer);
      this.connectionHealthTimer = null;
    }
  }

  /**
   * Emit connection health change event
   */
  private emitHealthChange(): void {
    this.eventListeners.connectionHealthChange?.(this.getConnectionHealth());
  }
}

/**
 * Error callback type for connection errors
 */
export type ConnectionErrorCallback = (
  conversationId: string,
  error: NetworkError
) => void;

/**
 * Chat service for sending messages and managing conversations
 * 
 * Task 11.2: Memory optimization with connection pool limits
 */
export class ChatService {
  private static instance: ChatService | null = null;
  private readonly sessionManager = getSessionManager();
  private readonly activeConnections = new Map<string, ChatSSEClient>();
  
  // Subtask 2.3: Error callback for propagating errors to UI layer
  private readonly errorCallbacks: ConnectionErrorCallback[] = [];
  
  // Task 11.2: Connection pool configuration
  private readonly maxActiveConnections = 10; // Limit to 10 concurrent conversations
  private readonly connectionAccessTimes = new Map<string, number>(); // Track last access for LRU

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): ChatService {
    ChatService.instance ??= new ChatService();
    return ChatService.instance;
  }

  /**
   * Send a chat message with enhanced error handling
   * 
   * Subtask 2.1: Implement connection readiness check before sending messages
   */
  public async sendMessage(request: {
    message: string;
    model: string;
    conversationId: string;
    files?: File[];
    contextMessages?: Message[];
  }): Promise<{ messageId: string; correlationId: string }> {
    return networkErrorHandler.executeWithRetry(
      async () => {
        const sessionId = this.sessionManager.getSessionId();
        if (!sessionId) {
          throw new NetworkError('No active session', 'unauthorized', {
            retryable: false,
          });
        }

        // Subtask 2.1: Wait for SSE connection to be ready before sending message
        const sseConnection = this.getSSEConnection(request.conversationId);
        await this.waitForConnectionReady(sseConnection, request.conversationId);

        // Upload files if provided
        let uploadedFiles: FileInfo[] | undefined;
        if (request.files && request.files.length > 0) {
          uploadedFiles = await this.uploadFiles(request.files);
        }

        // Generate correlation ID for request tracking
        const correlationId = crypto.randomUUID();

        // Task 10 Fix: Transform contextMessages to only include role and content
        // Backend validation expects only these fields, but Message type has many more
        const transformedContextMessages = request.contextMessages?.map(msg => ({
          role: msg.role,
          content: msg.content,
        }));

        // Prepare chat request
        const chatRequest: ChatRequest = {
          message: request.message,
          model: request.model,
          conversationId: request.conversationId,
          correlationId,
          files: uploadedFiles,
          contextMessages: transformedContextMessages,
        };

        // Send request to backend with retry logic
        const response = await networkErrorHandler.fetchWithRetry(
          CHAT_SEND_ENDPOINT,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Session-ID': sessionId,
            },
            body: JSON.stringify(chatRequest),
          },
          {
            timeout: 60000, // 60 second timeout for chat messages
            retryConfig: {
              maxAttempts: 3,
              retryableErrors: ['connection_failed', 'timeout', 'server_error'],
            },
          }
        );

        const result = (await response.json()) as {
          messageId: string;
          status: string;
        };

        return {
          messageId: result.messageId,
          correlationId,
        };
      },
      {
        retryConfig: {
          maxAttempts: 2, // Fewer retries for the overall operation
        },
        onError: (error) => {
          frontendLogger.error('Failed to send chat message', {
            metadata: { conversationId: request.conversationId },
            error,
          });
        },
      }
    );
  }

  /**
   * Wait for SSE connection to be ready before sending message
   * 
   * Subtask 2.1: Connection readiness check with timeout
   * - Wait for connection state to be 'connected' before sending
   * - Add timeout (5 seconds) for connection establishment
   * - Throw clear error if connection fails or times out
   */
  private async waitForConnectionReady(
    connection: ChatSSEClient,
    conversationId: string
  ): Promise<void> {
    const maxWaitTime = 5000; // 5 seconds timeout
    const checkInterval = 100; // Check every 100ms
    const startTime = Date.now();

    while (true) {
      const state = connection.getConnectionState();
      const elapsed = Date.now() - startTime;

      // Connection is ready
      if (state === 'connected') {
        frontendLogger.info('SSE connection ready for message send', {
          metadata: {
            conversationId,
            waitTime: elapsed,
          },
        });
        return;
      }

      // Connection failed
      if (state === 'error' || state === 'disconnected') {
        throw new NetworkError(
          `SSE connection is not available (state: ${state}, waited: ${elapsed}ms). Please check your connection and try again.`,
          'connection_failed',
          {
            retryable: true,
          }
        );
      }

      // Timeout exceeded
      if (elapsed > maxWaitTime) {
        throw new NetworkError(
          `SSE connection timeout after ${elapsed}ms (state: ${state}). The connection took too long to establish.`,
          'timeout',
          {
            retryable: true,
          }
        );
      }

      // Wait before checking again
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }
  }

  /**
   * Upload files for chat with enhanced error handling
   */
  public async uploadFiles(files: File[]): Promise<FileInfo[]> {
    const sessionId = this.sessionManager.getSessionId();
    if (!sessionId) {
      throw new NetworkError('No active session', 'unauthorized', {
        retryable: false,
      });
    }

    const uploadedFiles: FileInfo[] = [];

    for (const file of files) {
      try {
        const result = await networkErrorHandler.executeWithRetry(
          async () => {
            const formData = new FormData();
            formData.append('file', file);

            const response = await networkErrorHandler.fetchWithRetry(
              FILE_UPLOAD_ENDPOINT,
              {
                method: 'POST',
                headers: {
                  'X-Session-ID': sessionId,
                },
                body: formData,
              },
              {
                timeout: 120000, // 2 minute timeout for file uploads
                retryConfig: {
                  maxAttempts: 2,
                  retryableErrors: [
                    'connection_failed',
                    'timeout',
                    'server_error',
                  ],
                },
              }
            );

            return (await response.json()) as FileInfo;
          },
          {
            retryConfig: {
              maxAttempts: 1, // Don't retry the overall operation
            },
            onError: (error) => {
              frontendLogger.error('Failed to upload file', {
                metadata: { fileName: file.name, fileSize: file.size },
                error,
              });
            },
          }
        );

        uploadedFiles.push(result);
      } catch (error) {
        // Re-throw with file context
        const networkError =
          error instanceof NetworkError
            ? error
            : networkErrorHandler.classifyError(error);

        throw new NetworkError(
          `Failed to upload file "${file.name}": ${networkError.message}`,
          networkError.type,
          {
            statusCode: networkError.statusCode,
            retryable: networkError.retryable,
            originalError: networkError,
          }
        );
      }
    }

    return uploadedFiles;
  }

  /**
   * Get or create SSE connection for conversation
   * 
   * Subtask 2.2: Fix connection pooling to properly reuse existing connections
   * - Check activeConnections map before creating new instance
   * - Verify existing connection is active before returning
   * - Create new connection only if none exists or existing is inactive
   * 
   * Task 11.2: Implement connection pool size limit with LRU eviction
   * - Limit to maxActiveConnections (10) concurrent connections
   * - Evict least recently used connection when limit reached
   * - Track access times for LRU policy
   */
  public getSSEConnection(conversationId: string): ChatSSEClient {
    // Task 11.2: Update access time for LRU tracking
    this.connectionAccessTimes.set(conversationId, Date.now());
    
    // Subtask 2.2: Check if connection already exists in the pool
    let connection = this.activeConnections.get(conversationId);

    // Subtask 2.2: Verify existing connection is active before returning
    if (connection) {
      // Task 11.2: Check if connection has been destroyed
      if (connection.isClientDestroyed()) {
        frontendLogger.warn('Connection was destroyed, creating new one', {
          metadata: { conversationId },
        });
        this.activeConnections.delete(conversationId);
        this.connectionAccessTimes.delete(conversationId);
        connection = undefined;
      } else {
        const state = connection.getConnectionState();
        
        // Connection is active or attempting to connect - reuse it
        if (
          state === 'connected' ||
          state === 'connecting' ||
          state === 'reconnecting'
        ) {
          frontendLogger.info('Reusing existing SSE connection', {
            metadata: {
              conversationId,
              connectionState: state,
            },
          });
          return connection;
        }

        // Connection is in error or disconnected state - clean it up
        frontendLogger.info('Existing connection is inactive, creating new one', {
          metadata: {
            conversationId,
            oldConnectionState: state,
          },
        });
        
        // Disconnect old connection and remove from pool
        connection.disconnect();
        connection.destroy(); // Task 11.2: Properly destroy to release resources
        this.activeConnections.delete(conversationId);
        this.connectionAccessTimes.delete(conversationId);
        connection = undefined;
      }
    }

    // Subtask 2.2: Create new connection only if none exists or existing is inactive
    if (!connection) {
      // Task 11.2: Enforce connection pool size limit
      if (this.activeConnections.size >= this.maxActiveConnections) {
        this.evictLeastRecentlyUsedConnection(conversationId);
      }
      
      frontendLogger.info('Creating new SSE connection', {
        metadata: { 
          conversationId,
          currentPoolSize: this.activeConnections.size,
          maxPoolSize: this.maxActiveConnections,
        },
      });

      connection = new ChatSSEClient(conversationId);
      this.activeConnections.set(conversationId, connection);

      // Clean up connection when it's disconnected
      connection.on('connectionStateChange', (state) => {
        if (state === 'disconnected') {
          frontendLogger.info('SSE connection disconnected, removing from pool', {
            metadata: { conversationId },
          });
          
          // Task 11.2: Properly destroy connection to release resources
          const conn = this.activeConnections.get(conversationId);
          if (conn) {
            conn.destroy();
          }
          
          this.activeConnections.delete(conversationId);
          this.connectionAccessTimes.delete(conversationId);
        }
      });

      // Subtask 2.3: Subscribe to error events for error propagation
      connection.on('connectionError', (error) => {
        this.handleConnectionError(conversationId, error);
      });
    }

    return connection;
  }
  
  /**
   * Evict least recently used connection to make room for new one
   * 
   * Task 11.2: LRU eviction policy for connection pool
   * - Find connection with oldest access time
   * - Disconnect and destroy it
   * - Remove from pool
   * - Suggest garbage collection if memory is high
   */
  private evictLeastRecentlyUsedConnection(excludeConversationId: string): void {
    let oldestConversationId: string | null = null;
    let oldestAccessTime = Infinity;
    
    // Find least recently used connection (excluding the one we're about to create)
    for (const [convId, accessTime] of this.connectionAccessTimes.entries()) {
      if (convId !== excludeConversationId && accessTime < oldestAccessTime) {
        oldestAccessTime = accessTime;
        oldestConversationId = convId;
      }
    }
    
    if (oldestConversationId) {
      const connection = this.activeConnections.get(oldestConversationId);
      
      // Task 11.2: Get memory stats before eviction
      const memoryBefore = getMemoryStats();
      
      frontendLogger.info('Evicting least recently used connection', {
        metadata: {
          evictedConversationId: oldestConversationId,
          lastAccessTime: new Date(oldestAccessTime).toISOString(),
          currentPoolSize: this.activeConnections.size,
          maxPoolSize: this.maxActiveConnections,
          memoryUsage: memoryBefore ? `${memoryBefore.percentUsed.toFixed(2)}%` : 'N/A',
        },
      });
      
      if (connection) {
        connection.disconnect();
        connection.destroy();
      }
      
      this.activeConnections.delete(oldestConversationId);
      this.connectionAccessTimes.delete(oldestConversationId);
      
      // Task 11.2: Suggest garbage collection if memory is high
      if (isMemoryHigh()) {
        frontendLogger.info('High memory usage detected after eviction, suggesting GC', {
          metadata: {
            memoryUsage: memoryBefore ? `${memoryBefore.percentUsed.toFixed(2)}%` : 'N/A',
          },
        });
        suggestGarbageCollection();
      }
    }
  }

  /**
   * Disconnect SSE connection for conversation
   * 
   * Task 11.2: Properly destroy connection to release resources
   */
  public disconnectSSE(conversationId: string): void {
    const connection = this.activeConnections.get(conversationId);
    if (connection) {
      connection.disconnect();
      connection.destroy(); // Task 11.2: Properly destroy to release resources
      this.activeConnections.delete(conversationId);
      this.connectionAccessTimes.delete(conversationId);
    }
  }

  /**
   * Disconnect all SSE connections
   * 
   * Task 11.2: Properly destroy all connections to release resources
   */
  public disconnectAllSSE(): void {
    for (const [conversationId, connection] of this.activeConnections) {
      connection.disconnect();
      connection.destroy(); // Task 11.2: Properly destroy to release resources
      this.activeConnections.delete(conversationId);
      this.connectionAccessTimes.delete(conversationId);
    }
  }
  
  /**
   * Get connection pool statistics
   * 
   * Task 11.2: Expose pool metrics for monitoring
   */
  public getConnectionPoolStats(): {
    activeConnections: number;
    maxConnections: number;
    utilizationPercent: number;
    oldestConnectionAge: number | null;
  } {
    const now = Date.now();
    let oldestAccessTime: number | null = null;
    
    for (const accessTime of this.connectionAccessTimes.values()) {
      if (oldestAccessTime === null || accessTime < oldestAccessTime) {
        oldestAccessTime = accessTime;
      }
    }
    
    const oldestConnectionAge = oldestAccessTime ? now - oldestAccessTime : null;
    
    return {
      activeConnections: this.activeConnections.size,
      maxConnections: this.maxActiveConnections,
      utilizationPercent: (this.activeConnections.size / this.maxActiveConnections) * 100,
      oldestConnectionAge,
    };
  }

  /**
   * Register error callback for connection errors
   * 
   * Subtask 2.3: Allow React components to subscribe to connection errors
   */
  public onConnectionError(callback: ConnectionErrorCallback): () => void {
    this.errorCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.errorCallbacks.indexOf(callback);
      if (index > -1) {
        this.errorCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Handle connection errors and propagate to UI layer
   * 
   * Subtask 2.3: Propagate errors from ChatSSEClient to React components
   * - Subscribe to ChatSSEClient error events in ChatService
   * - Propagate errors to React components via callbacks
   * - Ensure error messages are user-friendly and actionable
   */
  private handleConnectionError(
    conversationId: string,
    error: NetworkError
  ): void {
    // Log the error
    frontendLogger.error('SSE connection error', {
      metadata: {
        conversationId,
        errorType: error.type,
        retryable: error.retryable,
      },
      error,
    });

    // Create user-friendly error message
    const userFriendlyError = this.createUserFriendlyError(error);

    // Propagate to all registered callbacks
    for (const callback of this.errorCallbacks) {
      try {
        callback(conversationId, userFriendlyError);
      } catch (callbackError) {
        frontendLogger.error('Error in connection error callback', {
          metadata: { conversationId },
          error:
            callbackError instanceof Error
              ? callbackError
              : new Error(String(callbackError)),
        });
      }
    }
  }

  /**
   * Create user-friendly error messages from technical errors
   * 
   * Subtask 2.3: Ensure error messages are user-friendly and actionable
   */
  private createUserFriendlyError(error: NetworkError): NetworkError {
    let userMessage: string;
    let actionableGuidance: string;

    switch (error.type) {
      case 'connection_failed':
        userMessage = 'Unable to establish connection to the chat service.';
        actionableGuidance =
          'Please check your internet connection and try again.';
        break;

      case 'timeout':
        userMessage = 'Connection timeout.';
        actionableGuidance =
          'The connection is taking too long. Please check your internet speed and try again.';
        break;

      case 'unauthorized':
        userMessage = 'Authentication failed.';
        actionableGuidance =
          'Your session may have expired. Please refresh the page and log in again.';
        break;

      case 'server_error':
        userMessage = 'Server error occurred.';
        actionableGuidance =
          'The server encountered an error. Please try again in a few moments.';
        break;

      case 'rate_limited':
        userMessage = 'Too many requests.';
        actionableGuidance =
          'You are sending messages too quickly. Please wait a moment and try again.';
        break;

      default:
        userMessage = 'An unexpected error occurred.';
        actionableGuidance = 'Please try again or contact support if the issue persists.';
    }

    // Combine message with actionable guidance
    const fullMessage = `${userMessage} ${actionableGuidance}`;

    return new NetworkError(fullMessage, error.type, {
      statusCode: error.statusCode,
      retryable: error.retryable,
      originalError: error,
    });
  }

  /**
   * Validate file for upload
   */
  public validateFile(
    file: File,
    config: { maxSize: number; allowedTypes: string[] }
  ): { valid: boolean; error?: string } {
    // Check file size
    if (file.size > config.maxSize) {
      return {
        valid: false,
        error: `File size (${this.formatFileSize(file.size)}) exceeds maximum allowed size (${this.formatFileSize(config.maxSize)})`,
      };
    }

    // Check file type
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!config.allowedTypes.includes(fileExtension)) {
      return {
        valid: false,
        error: `File type "${fileExtension}" is not allowed. Supported types: ${config.allowedTypes.join(', ')}`,
      };
    }

    // Check file name
    if (!/^[a-zA-Z0-9._-]+$/.test(file.name)) {
      return {
        valid: false,
        error:
          'File name contains invalid characters. Only letters, numbers, dots, underscores, and hyphens are allowed.',
      };
    }

    return { valid: true };
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) {
      return '0 Bytes';
    }

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

/**
 * Get the global chat service instance
 */
export function getChatService(): ChatService {
  return ChatService.getInstance();
}

/**
 * Chat utility functions
 */
export const chatUtils = {
  /**
   * Generate message ID
   */
  generateMessageId(): string {
    return `msg_${Date.now()}_${crypto.randomUUID()}`;
  },

  /**
   * Estimate message tokens (rough approximation)
   */
  estimateMessageTokens(message: Message): number {
    let tokens = Math.ceil(message.content.length / 4); // ~4 chars per token

    // Add tokens for files
    if (message.files) {
      tokens += message.files.length * 100; // Estimate 100 tokens per file
    }

    return tokens;
  },

  /**
   * Check if message is complete
   */
  isMessageComplete(message: Partial<Message>): message is Message {
    return Boolean(
      message.id &&
        message.role &&
        message.content &&
        message.timestamp &&
        message.correlationId &&
        message.conversationId &&
        message.isComplete !== false
    );
  },

  /**
   * Create user message
   */
  createUserMessage(
    content: string,
    conversationId: string,
    files?: FileInfo[]
  ): Message {
    return {
      id: this.generateMessageId(),
      role: 'user',
      content,
      timestamp: new Date(),
      conversationId,
      correlationId: crypto.randomUUID(),
      isComplete: true,
      files,
    };
  },

  /**
   * Create streaming assistant message
   */
  createStreamingMessage(
    messageId: string,
    conversationId: string,
    correlationId: string
  ): Partial<Message> {
    return {
      id: messageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      conversationId,
      correlationId,
      isComplete: false,
    };
  },
};
