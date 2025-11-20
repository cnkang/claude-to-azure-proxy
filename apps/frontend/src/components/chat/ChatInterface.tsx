import { logger } from '../../utils/logger.js';
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
import { useConversations } from '../../hooks/useConversations';
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
  readonly highlightKeywords?: string[]; // Keywords to highlight in messages (Requirement 8.3, 8.4)
  readonly scrollToMessageId?: string; // Message ID to scroll to on mount (Requirement 8.3)
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
    highlightKeywords,
    scrollToMessageId,
  }) => {
    const { t } = useI18n();
    const { updateConversation: updateConversationWithPersistence } =
      useConversations();
    const { announce } = useScreenReaderAnnouncer();
    const [isLoading, setIsLoading] = useState(false);
    const [streamingMessage, setStreamingMessage] = useState<
      Partial<Message> | undefined
    >();
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const chatService = getChatService();

    /**
     * Task 6.4: Keyword highlighting state
     * - Track current occurrence index for navigation
     * - Calculate total occurrences across all messages
     */
    const [currentOccurrenceIndex, setCurrentOccurrenceIndex] = useState(0);
    const [totalOccurrences, setTotalOccurrences] = useState(0);
    const messagesContainerRef = useRef<HTMLDivElement>(null);

    /**
     * Task 12.5: Focus management
     * - Ref to input area for returning focus after sending
     */
    const inputAreaRef = useRef<HTMLDivElement>(null);

    /**
     * Task 1.6: Get SSE connection reference
     * - Connection is retrieved once per conversation
     * - Ref is updated when conversation.id changes
     */
    const sseConnectionRef = useRef(
      getChatService().getSSEConnection(conversation.id)
    );

    // Update connection ref when conversation changes
    useEffect(() => {
      sseConnectionRef.current = getChatService().getSSEConnection(
        conversation.id
      );
    }, [conversation.id]);

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

          await updateConversationWithPersistence(updatedConversation.id, {
            messages: updatedConversation.messages,
            isStreaming: updatedConversation.isStreaming,
          });
          onConversationUpdate?.(updatedConversation);

          // Announce message sent to screen readers
          announce('chat.messageSent', 'polite');

          // Task 12.5: Return focus to input after sending
          // Use setTimeout to ensure DOM updates complete first
          setTimeout(() => {
            const inputElement =
              inputAreaRef.current?.querySelector('textarea, input');
            if (inputElement instanceof HTMLElement) {
              inputElement.focus();
            }
          }, 100);

          // Send message to backend
          logger.log('🟢 [ChatInterface] Sending message to backend');

          // Task 10 Fix: Transform messages to match backend ContextMessage interface
          // Backend expects: { id, role, content, timestamp }
          // Frontend Message has extra fields (conversationId, correlationId, isComplete, etc.)
          // that cause validation issues when serialized
          const contextMessages: Message[] = conversation.messages
            .slice(-10) // Last 10 messages for context
            .map((msg) => ({
              ...msg,
              timestamp:
                msg.timestamp instanceof Date
                  ? msg.timestamp
                  : new Date(msg.timestamp),
            }));

          const { messageId, correlationId } = await chatService.sendMessage({
            message: content,
            model: conversation.selectedModel,
            conversationId: conversation.id,
            files, // Pass File[] directly
            contextMessages, // Send only required fields with proper serialization
          });

          logger.log(
            '🟢 [ChatInterface] Message sent, received messageId:',
            messageId
          );
          logger.log('🟢 [ChatInterface] Correlation ID:', correlationId);

          // Create streaming message placeholder
          const streamingMsg = chatUtils.createStreamingMessage(
            messageId,
            conversation.id,
            correlationId
          );
          logger.log(
            '🟢 [ChatInterface] Created streaming message placeholder:',
            streamingMsg
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
          await updateConversationWithPersistence(errorConversation.id, {
            messages: errorConversation.messages,
            isStreaming: errorConversation.isStreaming,
          });
          onConversationUpdate?.(errorConversation);
        } finally {
          setIsLoading(false);
        }
      },
      [
        conversation,
        chatService,
        updateConversationWithPersistence,
        onConversationUpdate,
        t,
        announce,
      ]
    );

    /**
     * Handle streaming message start
     *
     * Task 9.3: Add missing messageStart handler to initialize streaming message
     * Fix: Only create streaming message if there's a pending user message
     */
    const handleMessageStart = useCallback(
      (data: { messageId: string; correlationId: string }): void => {
        logger.log('🟢 [ChatInterface] handleMessageStart called with:', data);

        // Check if the last message is from the user (indicating we're waiting for a response)
        const lastMessage =
          conversation.messages[conversation.messages.length - 1];
        const isWaitingForResponse = lastMessage?.role === 'user';

        if (!isWaitingForResponse) {
          logger.log(
            '🟡 [ChatInterface] Ignoring START event - no pending user message'
          );
          return;
        }

        // Create streaming message placeholder if it doesn't exist
        setStreamingMessage((prev) => {
          if (prev && prev.id === data.messageId) {
            logger.log('🟢 [ChatInterface] Streaming message already exists');
            return prev;
          }

          const streamingMsg = chatUtils.createStreamingMessage(
            data.messageId,
            conversation.id,
            data.correlationId
          );
          logger.log(
            '🟢 [ChatInterface] Created streaming message from START event:',
            streamingMsg
          );
          return streamingMsg;
        });
      },
      [conversation.id, conversation.messages]
    );

    /**
     * Handle streaming message updates
     *
     * Task 9.1: Add comprehensive logging for message flow
     * Task 9.3: Fix React state update - use functional setState to avoid stale closure
     */
    const handleMessageChunk = useCallback(
      (data: {
        content: string;
        messageId: string;
        correlationId: string;
      }): void => {
        logger.log('🟢 [ChatInterface] handleMessageChunk called with:', data);

        setStreamingMessage((prev) => {
          logger.log('🟢 [ChatInterface] setStreamingMessage - prev:', prev);
          logger.log(
            '🟢 [ChatInterface] Checking messageId match:',
            prev?.id,
            '===',
            data.messageId
          );

          if (!prev || prev.id !== data.messageId) {
            logger.log(
              '🟡 [ChatInterface] Message ID mismatch or no prev message, skipping update'
            );
            return prev;
          }

          const updated = {
            ...prev,
            content: (prev.content ?? '') + data.content,
          };

          logger.log('🟢 [ChatInterface] Updated streaming message:', updated);
          return updated;
        });
      },
      [] // Empty deps is correct - we use functional setState to avoid stale closure
    );

    /**
     * Handle streaming message completion
     *
     * Task 9.1: Add comprehensive logging for message flow
     */
    const handleMessageEnd = useCallback(
      async (data: {
        messageId: string;
        correlationId: string;
      }): Promise<void> => {
        logger.log('🟢 [ChatInterface] handleMessageEnd called with:', data);
        logger.log(
          '🟢 [ChatInterface] Current streamingMessage:',
          streamingMessage
        );

        if (streamingMessage?.id !== data.messageId) {
          logger.log(
            '🟡 [ChatInterface] Message ID mismatch in handleMessageEnd, skipping'
          );
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

        logger.log(
          '🟢 [ChatInterface] Complete message created:',
          completeMessage
        );

        // Update conversation with complete message
        const updatedConversation: Conversation = {
          ...conversation,
          messages: [...conversation.messages, completeMessage],
          updatedAt: new Date(),
          isStreaming: false,
        };

        logger.log(
          '🟢 [ChatInterface] Updating conversation with complete message'
        );
        await updateConversationWithPersistence(updatedConversation.id, {
          messages: updatedConversation.messages,
          isStreaming: updatedConversation.isStreaming,
        });
        onConversationUpdate?.(updatedConversation);

        // Announce response received to screen readers
        announce('chat.responseReceived', 'polite');

        // Clear streaming message
        logger.log(
          '🟢 [ChatInterface] Clearing streaming message and loading state'
        );
        setStreamingMessage(undefined);
        setIsLoading(false);
      },
      [
        streamingMessage,
        conversation,
        updateConversationWithPersistence,
        onConversationUpdate,
        announce,
      ]
    );

    /**
     * Handle streaming errors
     */
    const handleMessageError = useCallback(
      async (data: {
        _error: string;
        correlationId: string;
      }): Promise<void> => {
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
        await updateConversationWithPersistence(errorConversation.id, {
          messages: errorConversation.messages,
          isStreaming: errorConversation.isStreaming,
        });
        onConversationUpdate?.(errorConversation);
      },
      [conversation, updateConversationWithPersistence, onConversationUpdate]
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
      // // logger.log('Code copied:', _code.length, 'characters');
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
          void updateConversationWithPersistence(clearedRetryConversation.id, {
            messages: clearedRetryConversation.messages,
          });
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
        updateConversationWithPersistence,
      ]
    );

    /**
     * Setup SSE connection - only on mount and conversationId change
     *
     * Task 1.6: Fix frequent connect() calls from React components
     * - Removed callback dependencies to prevent re-running on every render
     * - Connection only established on mount and when conversationId changes
     * - Event listeners are updated separately without reconnecting
     */
    useEffect(() => {
      const connection = sseConnectionRef.current;

      // Connect to SSE stream only once per conversation
      connection.connect();

      return (): void => {
        // Cleanup listeners when conversation changes
        connection.off('messageStart');
        connection.off('messageChunk');
        connection.off('messageEnd');
        connection.off('messageError');
        connection.off('connectionStateChange');
        connection.off('connectionError');
      };
    }, [conversation.id]); // Only depend on conversation.id

    /**
     * Update event listeners when callbacks change
     *
     * Task 1.6: Separate event listener updates from connection lifecycle
     * Task 9.3: Add messageStart event listener
     * - Event listeners are updated without triggering reconnection
     * - This allows callbacks to stay fresh without reconnecting
     */
    useEffect(() => {
      const connection = sseConnectionRef.current;

      // Update event listeners with latest callbacks
      connection.on('messageStart', handleMessageStart);
      connection.on('messageChunk', handleMessageChunk);
      connection.on('messageEnd', handleMessageEnd);
      connection.on('messageError', handleMessageError);
      connection.on('connectionStateChange', handleConnectionStateChange);
      connection.on('connectionError', handleConnectionError);

      // No cleanup needed - listeners will be updated on next render
    }, [
      handleMessageStart,
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

    /**
     * Task 6.4: Calculate total keyword occurrences
     * Requirement 8.4: Count all keyword occurrences across messages
     */
    useEffect(() => {
      if (!highlightKeywords || highlightKeywords.length === 0) {
        setTotalOccurrences(0);
        return;
      }

      let count = 0;
      const messages = [...conversation.messages];
      if (streamingMessage) {
        messages.push(streamingMessage as Message);
      }

      for (const message of messages) {
        const content = message.content?.toLowerCase() || '';
        for (const keyword of highlightKeywords) {
          const keywordLower = keyword.toLowerCase();
          let position = 0;
          while ((position = content.indexOf(keywordLower, position)) !== -1) {
            count++;
            position += keyword.length;
          }
        }
      }

      setTotalOccurrences(count);
      setCurrentOccurrenceIndex(count > 0 ? 1 : 0);
    }, [conversation.messages, streamingMessage, highlightKeywords]);

    /**
     * Task 6.4: Scroll to message on mount
     * Requirement 8.3: Scroll to first occurrence automatically
     */
    useEffect(() => {
      if (scrollToMessageId && messagesContainerRef.current) {
        // Find the message element
        const messageElement = messagesContainerRef.current.querySelector(
          `[data-message-id="${scrollToMessageId}"]`
        );

        if (messageElement) {
          // Scroll to message with smooth behavior
          messageElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });

          // Announce to screen readers
          announce('chat.scrolledToMatch', 'polite');
        }
      }
    }, [scrollToMessageId, announce]);

    /**
     * Task 6.4: Navigate to next/previous keyword occurrence
     * Requirement 8.5: Navigation controls to jump between occurrences
     */
    const navigateToOccurrence = useCallback(
      (direction: 'next' | 'previous') => {
        if (totalOccurrences === 0 || !messagesContainerRef.current) {
          return;
        }

        let newIndex = currentOccurrenceIndex;
        if (direction === 'next') {
          newIndex =
            currentOccurrenceIndex < totalOccurrences
              ? currentOccurrenceIndex + 1
              : 1;
        } else {
          newIndex =
            currentOccurrenceIndex > 1
              ? currentOccurrenceIndex - 1
              : totalOccurrences;
        }

        setCurrentOccurrenceIndex(newIndex);

        // Find and scroll to the nth occurrence
        const allHighlights =
          messagesContainerRef.current.querySelectorAll('.keyword-highlight');
        const targetHighlight = allHighlights[newIndex - 1];

        if (targetHighlight) {
          targetHighlight.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });

          // Add temporary focus indicator
          targetHighlight.classList.add('keyword-highlight-active');
          setTimeout(() => {
            targetHighlight.classList.remove('keyword-highlight-active');
          }, 2000);

          // Announce to screen readers
          announce(
            t('chat.navigatedToOccurrence', {
              current: newIndex,
              total: totalOccurrences,
            }),
            'polite'
          );
        }
      },
      [currentOccurrenceIndex, totalOccurrences, announce, t]
    );

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
              <h2 className="conversation-title" id="conversation-title">
                {conversation.title}
              </h2>
              <div
                className="conversation-meta"
                role="status"
                aria-live="polite"
              >
                <span className="model-badge">
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

          {/* Keyword Navigation Controls (Task 6.4) */}
          {highlightKeywords &&
            highlightKeywords.length > 0 &&
            totalOccurrences > 0 && (
              <div
                className="keyword-navigation"
                role="toolbar"
                aria-label={t('chat.keywordNavigation')}
              >
                <span className="occurrence-counter" aria-live="polite">
                  {t('chat.occurrenceCounter', {
                    current: currentOccurrenceIndex,
                    total: totalOccurrences,
                  })}
                </span>
                <button
                  type="button"
                  className="nav-button nav-previous"
                  onClick={() => navigateToOccurrence('previous')}
                  aria-label={t('chat.previousOccurrence')}
                  disabled={totalOccurrences === 0}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="nav-button nav-next"
                  onClick={() => navigateToOccurrence('next')}
                  aria-label={t('chat.nextOccurrence')}
                  disabled={totalOccurrences === 0}
                >
                  ↓
                </button>
              </div>
            )}

          {/* Message List */}
          <section
            ref={messagesContainerRef}
            className="chat-messages"
            role="log"
            aria-live="polite"
            aria-atomic="false"
            aria-relevant="additions text"
            aria-label={t('chat.messageHistory')}
            aria-describedby="conversation-title"
          >
            <OptimizedMessageList
              messages={conversation.messages}
              streamingMessage={streamingMessage}
              isLoading={isLoading}
              onCopyCode={handleCopyCode}
              onRetryMessage={handleRetryMessage}
              enableVirtualScrolling={false}
              itemHeight={120}
              autoScroll={true}
              modelName={conversation.selectedModel}
              suggestions={[
                '介绍一下你自己',
                '帮我写一段代码',
                '翻译一段文本',
                '解释一个概念',
              ]}
              onSuggestionClick={handleSendMessage}
              highlightKeywords={highlightKeywords}
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
            ref={inputAreaRef}
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
