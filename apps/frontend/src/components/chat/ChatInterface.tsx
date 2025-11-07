/**
 * Chat Interface Component
 *
 * Main chat interface with message display, streaming support, file upload,
 * and real-time communication via Server-Sent Events.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import React, { memo, useCallback, useState, useRef, useEffect } from 'react';
import { useI18n } from '../../contexts/I18nContext';
import { useAppContext } from '../../contexts/AppContext';
import {
  getChatService,
  chatUtils,
  type SSEConnectionState,
} from '../../services/chat';
import { OptimizedMessageList } from './OptimizedMessageList';
import { MessageInput } from './MessageInput';
import { TypingIndicator } from './TypingIndicator';
import { useScreenReaderAnnouncer, KeyboardNavigation } from '../accessibility';
import { frontendLogger } from '../../utils/logger';
import type {
  Conversation,
  Message,
  FileInfo,
  ClientConfig,
} from '../../types/index';
import './ChatInterface.css';

interface ChatInterfaceProps {
  readonly conversation: Conversation;
  readonly config: ClientConfig;
  readonly onModelChange?: (_modelId: string) => void;
  readonly onConversationUpdate?: (conversation: Conversation) => void;
}

/**
 * Main chat interface component with streaming support
 */
export const ChatInterface = memo<ChatInterfaceProps>(
  ({
    conversation,
    config,
    onModelChange: _onModelChange,
    onConversationUpdate,
  }) => {
    const { t } = useI18n();
    const { updateConversation } = useAppContext();
    const { announce } = useScreenReaderAnnouncer();
    const [isLoading, setIsLoading] = useState(false);
    const [streamingMessage, setStreamingMessage] = useState<
      Partial<Message> | undefined
    >();
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const chatService = getChatService();
    const sseConnectionRef = useRef(
      getChatService().getSSEConnection(conversation.id)
    );

    /**
     * Handle sending a new message
     */
    const handleSendMessage = useCallback(
      async (content: string, files?: File[]): Promise<void> => {
        if (!content.trim() && (files?.length ?? 0) === 0) {
          return;
        }

        try {
          setIsLoading(true);
          setConnectionError(null);

          // Create user message (convert files to FileInfo for display)
          const fileInfos: FileInfo[] | undefined = files?.map((file) => ({
            id: crypto.randomUUID(),
            name: file.name,
            type: file.type,
            size: file.size,
          }));

          const userMessage = chatUtils.createUserMessage(
            content,
            conversation.id,
            fileInfos
          );

          // Update conversation with user message
          const updatedConversation: Conversation = {
            ...conversation,
            messages: [...conversation.messages, userMessage],
            updatedAt: new Date(),
            isStreaming: true,
          };

          updateConversation(updatedConversation.id, updatedConversation);
          onConversationUpdate?.(updatedConversation);

          // Announce message sent to screen readers
          announce('chat.messageSent', 'polite');

          // Send message to backend
          const { messageId, correlationId } = await chatService.sendMessage({
            message: content,
            model: conversation.selectedModel,
            conversationId: conversation.id,
            files, // Pass File[] directly
            contextMessages: conversation.messages.slice(-10), // Last 10 messages for context
          });

          // Create streaming message placeholder
          const streamingMsg = chatUtils.createStreamingMessage(
            messageId,
            conversation.id,
            correlationId
          );
          setStreamingMessage(streamingMsg);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : t('chat.sendError');
          setConnectionError(errorMessage);

          // Remove streaming state
          const errorConversation: Conversation = {
            ...conversation,
            isStreaming: false,
          };
          updateConversation(errorConversation.id, errorConversation);
          onConversationUpdate?.(errorConversation);
        } finally {
          setIsLoading(false);
        }
      },
      [
        conversation,
        chatService,
        updateConversation,
        onConversationUpdate,
        t,
        announce,
      ]
    );

    /**
     * Handle streaming message updates
     */
    const handleMessageChunk = useCallback(
      (data: {
        content: string;
        messageId: string;
        correlationId: string;
      }): void => {
        setStreamingMessage((prev) => {
          if (!prev || prev.id !== data.messageId) {
            return prev;
          }

          return {
            ...prev,
            content: (prev.content ?? '') + data.content,
          };
        });
      },
      []
    );

    /**
     * Handle streaming message completion
     */
    const handleMessageEnd = useCallback(
      (data: { messageId: string; correlationId: string }): void => {
        if (streamingMessage?.id !== data.messageId) {
          return;
        }

        // Create complete message
        const completeMessage: Message = {
          id: data.messageId,
          role: 'assistant',
          content: streamingMessage.content ?? '',
          timestamp: new Date(),
          conversationId: conversation.id,
          correlationId: data.correlationId,
          isComplete: true,
          model: conversation.selectedModel,
        };

        // Update conversation with complete message
        const updatedConversation: Conversation = {
          ...conversation,
          messages: [...conversation.messages, completeMessage],
          updatedAt: new Date(),
          isStreaming: false,
        };

        updateConversation(updatedConversation.id, updatedConversation);
        onConversationUpdate?.(updatedConversation);

        // Announce response received to screen readers
        announce('chat.responseReceived', 'polite');

        // Clear streaming message
        setStreamingMessage(undefined);
        setIsLoading(false);
      },
      [
        streamingMessage,
        conversation,
        updateConversation,
        onConversationUpdate,
        announce,
      ]
    );

    /**
     * Handle streaming errors
     */
    const handleMessageError = useCallback(
      (data: { _error: string; correlationId: string }): void => {
        setConnectionError(data._error);
        setStreamingMessage(undefined);
        setIsLoading(false);

        const lastIndex = conversation.messages.length - 1;
        const updatedMessages = conversation.messages.map((msg, index) => {
          if (index === lastIndex && msg.role === 'user') {
            return { ...msg, retryable: true };
          }
          return msg;
        });

        // Remove streaming state
        const errorConversation: Conversation = {
          ...conversation,
          messages: updatedMessages,
          isStreaming: false,
        };
        updateConversation(errorConversation.id, errorConversation);
        onConversationUpdate?.(errorConversation);
      },
      [conversation, updateConversation, onConversationUpdate]
    );

    /**
     * Handle connection state changes
     */
    const handleConnectionStateChange = useCallback(
      (state: SSEConnectionState): void => {
        if (state === 'error') {
          setConnectionError(t('chat.connectionError'));
        } else if (state === 'reconnecting') {
          setConnectionError(t('chat.retryingConnection'));
        } else if (state === 'connected') {
          setConnectionError(null);
        }
      },
      [t]
    );

    /**
     * Handle connection errors
     */
    const handleConnectionError = useCallback((error: Error): void => {
      setConnectionError(error.message);
      setIsLoading(false);
      setStreamingMessage(undefined);
    }, []);

    /**
     * Handle code copy
     */
    const handleCopyCode = useCallback((_code: string): void => {
      // Could add analytics or notifications here
      // // console.log('Code copied:', _code.length, 'characters');
    }, []);

    /**
     * Retry failed message
     */
    const handleRetryMessage = useCallback(
      (messageId: string): void => {
        // Find the message and retry sending
        const message = conversation.messages.find(
          (candidate: Message) => candidate.id === messageId
        );
        if (message?.role === 'user') {
          const clearedRetryConversation: Conversation = {
            ...conversation,
            messages: conversation.messages.map((candidate: Message) =>
              candidate.id === messageId
                ? { ...candidate, retryable: false }
                : candidate
            ),
          };
          updateConversation(
            clearedRetryConversation.id,
            clearedRetryConversation
          );
          onConversationUpdate?.(clearedRetryConversation);

          // Convert FileInfo[] back to File[] for retry (this is a limitation - we lose the actual file data)
          // In a real implementation, you'd want to store the original File objects
          const files = message.files?.map(
            (fileInfo: FileInfo) =>
              new File([], fileInfo.name, { type: fileInfo.type })
          );
          handleSendMessage(message.content, files).catch(
            (retryError: unknown) => {
              frontendLogger.error('Failed to retry sending message', {
                metadata: { messageId },
                error:
                  retryError instanceof Error
                    ? retryError
                    : new Error(String(retryError)),
              });
            }
          );
        }
      },
      [
        conversation,
        handleSendMessage,
        onConversationUpdate,
        updateConversation,
      ]
    );

    /**
     * Setup SSE connection
     */
    useEffect(() => {
      const connection = sseConnectionRef.current;

      // Setup event listeners
      connection.on('messageChunk', handleMessageChunk);
      connection.on('messageEnd', handleMessageEnd);
      connection.on('messageError', handleMessageError);
      connection.on('connectionStateChange', handleConnectionStateChange);
      connection.on('connectionError', handleConnectionError);

      // Connect to SSE stream
      connection.connect();

      return (): void => {
        // Cleanup listeners but keep connection for other components
        connection.off('messageChunk');
        connection.off('messageEnd');
        connection.off('messageError');
        connection.off('connectionStateChange');
        connection.off('connectionError');
      };
    }, [
      conversation.id,
      handleMessageChunk,
      handleMessageEnd,
      handleMessageError,
      handleConnectionStateChange,
      handleConnectionError,
    ]);

    /**
     * Cleanup on unmount
     */
    useEffect(() => {
      return (): void => {
        // Disconnect SSE when component unmounts
        chatService.disconnectSSE(conversation.id);
      };
    }, [conversation.id, chatService]);

    return (
      <KeyboardNavigation
        onEscape={() => {
          // Handle escape key - could close modals, clear input, etc.
        }}
        className="chat-interface"
      >
        <div
          className="chat-interface-content"
          role="main"
          aria-label={t('accessibility.chatInterface')}
        >
          {/* Connection Error Banner */}
          {connectionError !== null ? (
            <div
              className="connection-error"
              role="alert"
              aria-live="assertive"
            >
              <span className="error-icon" aria-hidden="true">
                ⚠️
              </span>
              <span className="error-message">{connectionError}</span>
              <button
                type="button"
                className="retry-button"
                onClick={(): void => {
                  setConnectionError(null);
                  sseConnectionRef.current.connect();
                  announce('chat.retryingConnection', 'polite');
                }}
                aria-label={t('chat.retry')}
              >
                {t('chat.retry')}
              </button>
            </div>
          ) : null}

          {/* Chat Header */}
          <header className="chat-header" role="banner">
            <div className="conversation-info">
              <h1 className="conversation-title" id="conversation-title">
                {conversation.title}
              </h1>
              <div
                className="conversation-meta"
                role="status"
                aria-live="polite"
              >
                <span
                  className="model-badge"
                  aria-label={t('chat.currentModel', {
                    model: conversation.selectedModel,
                  })}
                >
                  {conversation.selectedModel}
                </span>
                <span
                  className="message-count"
                  aria-label={t('chat.messageCount', {
                    count: conversation.messages.length,
                  })}
                >
                  {t('chat.messageCount', {
                    count: conversation.messages.length,
                  })}
                </span>
                {conversation.contextUsage ? (
                  <span
                    className="context-usage"
                    aria-label={t('context.usage.tooltip', {
                      current: conversation.contextUsage.currentTokens,
                      max: conversation.contextUsage.maxTokens,
                      percentage: Math.round(
                        (conversation.contextUsage.currentTokens /
                          conversation.contextUsage.maxTokens) *
                          100
                      ),
                    })}
                  >
                    {Math.round(
                      (conversation.contextUsage.currentTokens /
                        conversation.contextUsage.maxTokens) *
                        100
                    )}
                    %
                  </span>
                ) : null}
              </div>
            </div>
          </header>

          {/* Message List */}
          <section
            className="chat-messages"
            role="log"
            aria-live="polite"
            aria-label={t('chat.messageHistory')}
            aria-describedby="conversation-title"
          >
            <OptimizedMessageList
              messages={conversation.messages}
              streamingMessage={streamingMessage}
              isLoading={isLoading}
              onCopyCode={handleCopyCode}
              onRetryMessage={handleRetryMessage}
              enableVirtualScrolling={true}
              itemHeight={120}
              autoScroll={true}
            />
          </section>

          {/* Loading Indicator */}
          {isLoading && !streamingMessage ? (
            <div className="chat-loading" role="status" aria-live="polite">
              <TypingIndicator />
              <span className="sr-only">{t('chat.aiTyping')}</span>
            </div>
          ) : null}

          {/* Message Input */}
          <section
            className="chat-input"
            role="form"
            aria-label={t('chat.messageInput')}
          >
            <MessageInput
              onSendMessage={handleSendMessage}
              disabled={isLoading || connectionError !== null}
              acceptedFileTypes={config.supportedFileTypes}
              maxFileSize={config.maxFileSize}
              maxFiles={5}
            />
          </section>
        </div>
      </KeyboardNavigation>
    );
  }
);

ChatInterface.displayName = 'ChatInterface';
