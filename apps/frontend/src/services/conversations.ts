/**
 * Conversations API Service
 *
 * Provides conversation management functionality including creation,
 * retrieval, update, and deletion of conversations.
 *
 * Requirements: 9.1, 9.2, Core Functionality
 */

import type {
  ConversationRequest,
  ConversationResponse,
  Conversation,
} from '../types/index.js';
import { getSessionManager } from './session.js';
import { frontendLogger } from '../utils/logger.js';
import {
  NetworkError,
  networkErrorHandler,
} from '../utils/networkErrorHandler.js';
import { getConversationStorage } from './storage.js';

// API endpoints
const CONVERSATIONS_ENDPOINT = '/api/conversations';

/**
 * Create a new conversation
 */
export async function createConversation(
  request: ConversationRequest = {}
): Promise<ConversationResponse> {
  // In E2E/test mode, bypass network and create locally to keep UI responsive
  const isE2ETestMode =
    typeof window !== 'undefined' &&
    (window as Window & { __E2E_TEST_MODE__?: boolean }).__E2E_TEST_MODE__;

  if (isE2ETestMode) {
    const sessionManager = getSessionManager();
    const sessionId = sessionManager.getSessionId();

    if (!sessionId) {
      throw new NetworkError('No active session', 'unauthorized', {
        retryable: false,
      });
    }

    const storage = getConversationStorage();
    await storage.initialize();

    const now = new Date();
    const conversationId = `test-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;

    const storedConversation: Conversation = {
      id: conversationId,
      title: request.title ?? 'New Conversation',
      messages: [],
      selectedModel: request.initialModel ?? 'gpt-4o',
      createdAt: now,
      updatedAt: now,
      sessionId,
      isStreaming: false,
      modelHistory: [],
    };

    await storage.storeConversation(storedConversation);

    const conversationResponse: ConversationResponse = {
      id: storedConversation.id,
      title: storedConversation.title,
      model: storedConversation.selectedModel,
      createdAt: storedConversation.createdAt.toISOString(),
      updatedAt: storedConversation.updatedAt.toISOString(),
      messageCount: storedConversation.messages.length,
    };

    return conversationResponse;
  }

  return networkErrorHandler.executeWithRetry(
    async () => {
      const sessionManager = getSessionManager();
      const sessionId = sessionManager.getSessionId();

      if (!sessionId) {
        throw new NetworkError('No active session', 'unauthorized', {
          retryable: false,
        });
      }

      // Generate correlation ID for request tracking
      const correlationId = crypto.randomUUID();

      frontendLogger.info('Creating new conversation', {
        metadata: {
          correlationId,
          title: request.title,
          initialModel: request.initialModel,
        },
      });

      // Send request to backend
      const response = await networkErrorHandler.fetchWithRetry(
        CONVERSATIONS_ENDPOINT,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-ID': sessionId,
          },
          body: JSON.stringify(request),
        },
        {
          timeout: 10000, // 10 second timeout
          retryConfig: {
            maxAttempts: 3,
            retryableErrors: ['connection_failed', 'timeout', 'server_error'],
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new NetworkError(
          errorData.error?.message || 'Failed to create conversation',
          'server_error',
          {
            retryable: response.status >= 500,
            statusCode: response.status,
          }
        );
      }

      const result = (await response.json()) as ConversationResponse;

      frontendLogger.info('Conversation created successfully', {
        metadata: {
          correlationId,
          conversationId: result.id,
          title: result.title,
        },
      });

      return result;
    },
    {
      retryConfig: {
        maxAttempts: 2,
      },
      onError: (error) => {
        frontendLogger.error('Failed to create conversation', {
          error,
        });
      },
    }
  );
}

/**
 * Get all conversations for the current session
 */
export async function getConversations(
  options: {
    limit?: number;
    offset?: number;
    search?: string;
  } = {}
): Promise<{
  conversations: ConversationResponse[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}> {
  return networkErrorHandler.executeWithRetry(
    async () => {
      const sessionManager = getSessionManager();
      const sessionId = sessionManager.getSessionId();

      if (!sessionId) {
        throw new NetworkError('No active session', 'unauthorized', {
          retryable: false,
        });
      }

      // Build query parameters
      const params = new URLSearchParams();
      if (options.limit) {
        params.append('limit', options.limit.toString());
      }
      if (options.offset) {
        params.append('offset', options.offset.toString());
      }
      if (options.search) {
        params.append('search', options.search);
      }

      const url = `${CONVERSATIONS_ENDPOINT}?${params.toString()}`;

      // Send request to backend
      const response = await networkErrorHandler.fetchWithRetry(
        url,
        {
          method: 'GET',
          headers: {
            'X-Session-ID': sessionId,
          },
        },
        {
          timeout: 10000,
          retryConfig: {
            maxAttempts: 3,
            retryableErrors: ['connection_failed', 'timeout', 'server_error'],
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new NetworkError(
          errorData.error?.message || 'Failed to get conversations',
          'server_error',
          {
            retryable: response.status >= 500,
            statusCode: response.status,
          }
        );
      }

      return await response.json();
    },
    {
      retryConfig: {
        maxAttempts: 2,
      },
      onError: (error) => {
        frontendLogger.error('Failed to get conversations', {
          error,
        });
      },
    }
  );
}

/**
 * Delete a conversation
 */
export async function deleteConversation(
  conversationId: string
): Promise<void> {
  return networkErrorHandler.executeWithRetry(
    async () => {
      const sessionManager = getSessionManager();
      const sessionId = sessionManager.getSessionId();

      if (!sessionId) {
        throw new NetworkError('No active session', 'unauthorized', {
          retryable: false,
        });
      }

      const correlationId = crypto.randomUUID();

      frontendLogger.info('Deleting conversation', {
        metadata: {
          correlationId,
          conversationId,
        },
      });

      // Send request to backend
      const response = await networkErrorHandler.fetchWithRetry(
        `${CONVERSATIONS_ENDPOINT}/${conversationId}`,
        {
          method: 'DELETE',
          headers: {
            'X-Session-ID': sessionId,
          },
        },
        {
          timeout: 10000,
          retryConfig: {
            maxAttempts: 3,
            retryableErrors: ['connection_failed', 'timeout', 'server_error'],
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new NetworkError(
          errorData.error?.message || 'Failed to delete conversation',
          'server_error',
          {
            retryable: response.status >= 500,
            statusCode: response.status,
          }
        );
      }

      frontendLogger.info('Conversation deleted successfully', {
        metadata: {
          correlationId,
          conversationId,
        },
      });
    },
    {
      retryConfig: {
        maxAttempts: 2,
      },
      onError: (error) => {
        frontendLogger.error('Failed to delete conversation', {
          error,
        });
      },
    }
  );
}

/**
 * Update a conversation (title or model)
 */
export async function updateConversation(
  conversationId: string,
  updates: {
    title?: string;
    selectedModel?: string;
  }
): Promise<ConversationResponse> {
  return networkErrorHandler.executeWithRetry(
    async () => {
      const sessionManager = getSessionManager();
      const sessionId = sessionManager.getSessionId();

      if (!sessionId) {
        throw new NetworkError('No active session', 'unauthorized', {
          retryable: false,
        });
      }

      const correlationId = crypto.randomUUID();

      frontendLogger.info('Updating conversation', {
        metadata: {
          correlationId,
          conversationId,
          updates,
        },
      });

      // Send request to backend
      const response = await networkErrorHandler.fetchWithRetry(
        `${CONVERSATIONS_ENDPOINT}/${conversationId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-ID': sessionId,
          },
          body: JSON.stringify(updates),
        },
        {
          timeout: 10000,
          retryConfig: {
            maxAttempts: 3,
            retryableErrors: ['connection_failed', 'timeout', 'server_error'],
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new NetworkError(
          errorData.error?.message || 'Failed to update conversation',
          'server_error',
          {
            retryable: response.status >= 500,
            statusCode: response.status,
          }
        );
      }

      const result = (await response.json()) as ConversationResponse;

      frontendLogger.info('Conversation updated successfully', {
        metadata: {
          correlationId,
          conversationId,
        },
      });

      return result;
    },
    {
      retryConfig: {
        maxAttempts: 2,
      },
      onError: (error) => {
        frontendLogger.error('Failed to update conversation', {
          error,
        });
      },
    }
  );
}
