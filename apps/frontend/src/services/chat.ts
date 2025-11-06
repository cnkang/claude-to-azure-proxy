/**
 * Chat Service with Server-Sent Events Support
 *
 * Provides real-time chat functionality with streaming responses using SSE,
 * message sending, and conversation management.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 6.3, 7.3
 */

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
 */
export interface ConnectionHealth {
  state: SSEConnectionState;
  lastConnected: Date | null;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  nextReconnectDelay: number;
  isOnline: boolean;
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
 */
export class ChatSSEClient {
  private eventSource: EventSource | null = null;
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
   */
  public connect(): void {
    if (
      this.connectionState === 'connected' ||
      this.connectionState === 'connecting'
    ) {
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

    try {
      const sessionId = this.sessionManager.getSessionId();
      if (!sessionId) {
        throw new NetworkError('No active session', 'unauthorized', {
          retryable: false,
        });
      }

      const url = `${CHAT_STREAM_ENDPOINT}/${this.conversationId}?sessionId=${encodeURIComponent(sessionId)}`;

      this.eventSource = new EventSource(url);
      this.setupEventHandlers();
      this.startHealthCheck();
    } catch (error) {
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
  }

  /**
   * Disconnect from SSE stream
   */
  public disconnect(): void {
    this.isManuallyDisconnected = true;
    this.clearReconnectTimer();
    this.stopHealthCheck();
    this.removeNetworkListeners();

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.setConnectionState('disconnected');
    this.reconnectAttempts = 0;
  }

  /**
   * Get current connection state
   */
  public getConnectionState(): SSEConnectionState {
    return this.connectionState;
  }

  /**
   * Get connection health information
   */
  public getConnectionHealth(): ConnectionHealth {
    return {
      state: this.connectionState,
      lastConnected: this.lastConnected,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      nextReconnectDelay: this.reconnectDelay,
      isOnline: networkUtils.isOnline(),
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
   * Setup event handlers for EventSource
   */
  private setupEventHandlers(): void {
    if (!this.eventSource) {
      return;
    }

    this.eventSource.onopen = (): void => {
      frontendLogger.info('SSE connection established', {
        metadata: { conversationId: this.conversationId },
      });

      this.lastConnected = new Date();
      this.setConnectionState('connected');
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
      this.emitHealthChange();
    };

    this.eventSource.onmessage = (event): void => {
      try {
        const data = JSON.parse(event.data) as StreamChunk;
        this.handleStreamChunk(data);
      } catch (error) {
        frontendLogger.error('Failed to parse SSE message', {
          metadata: {
            conversationId: this.conversationId,
            eventData: event.data,
          },
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    };

    this.eventSource.onerror = (event): void => {
      const networkError = new NetworkError(
        'SSE connection error',
        'connection_failed',
        { retryable: true }
      );

      frontendLogger.error('SSE connection error', {
        metadata: { conversationId: this.conversationId, event },
        error: networkError,
      });

      this.handleConnectionError(networkError);
    };
  }

  /**
   * Handle incoming stream chunks
   */
  private handleStreamChunk(chunk: StreamChunk): void {
    switch (chunk.type) {
      case 'start':
        this.eventListeners.messageStart?.({
          messageId: chunk.messageId ?? '',
          correlationId: chunk.correlationId,
        });
        break;

      case 'chunk':
        this.eventListeners.messageChunk?.({
          content: chunk.content ?? '',
          messageId: chunk.messageId ?? '',
          correlationId: chunk.correlationId,
        });
        break;

      case 'end':
        this.eventListeners.messageEnd?.({
          messageId: chunk.messageId ?? '',
          correlationId: chunk.correlationId,
        });
        break;

      case 'error':
        this.eventListeners.messageError?.({
          _error: chunk.content ?? 'Unknown error',
          correlationId: chunk.correlationId,
        });
        break;

      default:
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
   */
  private handleConnectionError(error: NetworkError): void {
    this.setConnectionState('error');
    this.eventListeners.connectionError?.(error);
    this.emitHealthChange();

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    // Don't reconnect if manually disconnected
    if (this.isManuallyDisconnected) {
      this.setConnectionState('disconnected');
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
   */
  private startHealthCheck(): void {
    this.stopHealthCheck();

    this.connectionHealthTimer = window.setInterval(() => {
      // Check if connection is stale
      if (this.connectionState === 'connected' && this.lastConnected) {
        const timeSinceLastConnect = Date.now() - this.lastConnected.getTime();

        // If no activity for more than 5 minutes, consider connection stale
        if (timeSinceLastConnect > 300000) {
          frontendLogger.warn(
            'SSE connection appears stale, forcing reconnection',
            {
              metadata: {
                conversationId: this.conversationId,
                timeSinceLastConnect: Math.round(timeSinceLastConnect / 1000),
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
 * Chat service for sending messages and managing conversations
 */
export class ChatService {
  private static instance: ChatService | null = null;
  private readonly sessionManager = getSessionManager();
  private readonly activeConnections = new Map<string, ChatSSEClient>();

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

        // Upload files if provided
        let uploadedFiles: FileInfo[] | undefined;
        if (request.files && request.files.length > 0) {
          uploadedFiles = await this.uploadFiles(request.files);
        }

        // Generate correlation ID for request tracking
        const correlationId = crypto.randomUUID();

        // Prepare chat request
        const chatRequest: ChatRequest = {
          message: request.message,
          model: request.model,
          conversationId: request.conversationId,
          correlationId,
          files: uploadedFiles,
          contextMessages: request.contextMessages,
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
   */
  public getSSEConnection(conversationId: string): ChatSSEClient {
    let connection = this.activeConnections.get(conversationId);

    if (!connection) {
      connection = new ChatSSEClient(conversationId);
      this.activeConnections.set(conversationId, connection);

      // Clean up connection when it's disconnected
      connection.on('connectionStateChange', (state) => {
        if (state === 'disconnected') {
          this.activeConnections.delete(conversationId);
        }
      });
    }

    return connection;
  }

  /**
   * Disconnect SSE connection for conversation
   */
  public disconnectSSE(conversationId: string): void {
    const connection = this.activeConnections.get(conversationId);
    if (connection) {
      connection.disconnect();
      this.activeConnections.delete(conversationId);
    }
  }

  /**
   * Disconnect all SSE connections
   */
  public disconnectAllSSE(): void {
    for (const [conversationId, connection] of this.activeConnections) {
      connection.disconnect();
      this.activeConnections.delete(conversationId);
    }
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
