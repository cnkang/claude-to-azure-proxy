import { logger } from '../../utils/logger.js';
import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { List } from 'react-window';
import { MessageItem } from './MessageItem.js';
import { TypingIndicator } from './TypingIndicator.js';
import { StreamingMessage } from './StreamingMessage.js';
import { WelcomeMessage } from './WelcomeMessage.js';
import type { Message } from '../../types/index.js';
import { Glass } from '../ui/Glass.js';

export interface MessageListProps {
  readonly messages: Message[];
  readonly streamingMessage?: Partial<Message>;
  readonly isLoading?: boolean;
  readonly onCopyCode?: (code: string) => void;
  readonly onRetryMessage?: (messageId: string) => void;
  readonly enableVirtualScrolling?: boolean;
  readonly itemHeight?: number;
  readonly autoScrollEnabled?: boolean;
  readonly containerRefCallback?: (element: HTMLDivElement | null) => void;
  readonly modelName?: string;
  readonly suggestions?: readonly string[];
  readonly onSuggestionClick?: (suggestion: string) => void;
  readonly highlightKeywords?: string[]; // Task 6.4: Keywords to highlight (Requirement 8.4)
}

export interface MessageListHandle {
  scrollToBottom: () => void;
}

interface VirtualizedRowProps {
  readonly index: number;
  readonly style: React.CSSProperties;
  readonly data?: {
    readonly messages: Message[];
    readonly onCopyCode?: (code: string) => void;
    readonly onRetryMessage?: (messageId: string) => void;
    readonly highlightKeywords?: string[]; // Task 6.4
  };
}

const VIRTUAL_SCROLL_THRESHOLD = 60;

const VirtualizedRow = memo<VirtualizedRowProps>(({ index, style, data }) => {
  if (!data) {
    return <div style={style} />;
  }

  const messagesList = data.messages;
  if (index < 0 || index >= messagesList.length) {
    return <div style={style} />;
  }

  const message = messagesList.at(index);
  if (!message) {
    return <div style={style} />;
  }

  return (
    <div style={style}>
      <div className="px-4 py-2">
        <MessageItem
          message={message}
          onCopyCode={data.onCopyCode}
          onRetryMessage={data.onRetryMessage}
          highlightKeywords={data.highlightKeywords}
        />
      </div>
    </div>
  );
});

VirtualizedRow.displayName = 'VirtualizedRow';

const MessageListComponent = forwardRef<MessageListHandle, MessageListProps>(
  (
    {
      messages,
      streamingMessage,
      isLoading = false,
      onCopyCode,
      onRetryMessage,
      enableVirtualScrolling = true,
      itemHeight = 128,
      autoScrollEnabled = true,
      containerRefCallback,
      modelName,
      suggestions = [],
      onSuggestionClick,
      highlightKeywords,
    }: MessageListProps,
    ref
  ): JSX.Element => {
    const { t } = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<List>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const [showScrollButton, setShowScrollButton] = useState(false);

    const shouldUseVirtualScrolling =
      enableVirtualScrolling && messages.length > VIRTUAL_SCROLL_THRESHOLD;

    const handleScroll = useCallback((): void => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
      const isNearBottom = distanceFromBottom < 80;

      setAutoScroll(isNearBottom);
      // Show scroll button when user has scrolled up more than 100px from bottom
      setShowScrollButton(distanceFromBottom > 100);
    }, []);

    const handleVirtualScroll = useCallback(
      ({
        scrollOffset,
        scrollUpdateWasRequested,
      }: {
        scrollOffset: number;
        scrollUpdateWasRequested: boolean;
      }): void => {
        const listInstance = listRef.current;
        if (listInstance === null || scrollUpdateWasRequested === true) {
          return;
        }

        const totalHeight = messages.length * itemHeight;
        const heightProp = listInstance.props.height;
        let viewportHeight = 0;
        if (typeof heightProp === 'number') {
          viewportHeight = heightProp;
        } else if (typeof heightProp === 'string') {
          const parsed = Number(heightProp);
          viewportHeight = Number.isFinite(parsed) ? parsed : 0;
        }
        const distanceFromBottom =
          totalHeight - (scrollOffset + viewportHeight);

        setAutoScroll(distanceFromBottom < itemHeight * 2);
        // Show scroll button when user has scrolled up more than 100px from bottom
        setShowScrollButton(distanceFromBottom > 100);
      },
      [itemHeight, messages.length]
    );

    const scrollToBottomRegular = useCallback((): void => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    }, []);

    const scrollToBottomVirtual = useCallback((): void => {
      if (!listRef.current || messages.length === 0) {
        return;
      }

      listRef.current.scrollToItem(messages.length - 1, 'end');
      setShowScrollButton(false);
    }, [messages.length]);

    const handleScrollButtonClick = useCallback((): void => {
      setAutoScroll(true);
      if (shouldUseVirtualScrolling) {
        scrollToBottomVirtual();
      } else {
        scrollToBottomRegular();
      }
      setShowScrollButton(false);
    }, [
      shouldUseVirtualScrolling,
      scrollToBottomVirtual,
      scrollToBottomRegular,
    ]);

    useEffect(() => {
      if (!autoScrollEnabled || !autoScroll) {
        return;
      }

      if (shouldUseVirtualScrolling) {
        scrollToBottomVirtual();
      } else {
        scrollToBottomRegular();
      }
    }, [
      autoScroll,
      autoScrollEnabled,
      messages.length,
      streamingMessage?.content,
      shouldUseVirtualScrolling,
      scrollToBottomRegular,
      scrollToBottomVirtual,
    ]);

    const virtualizedData = useMemo(
      () => ({
        messages,
        onCopyCode,
        onRetryMessage,
        highlightKeywords,
      }),
      [messages, onCopyCode, onRetryMessage, highlightKeywords]
    );

    useEffect(() => {
      if (containerRefCallback) {
        containerRefCallback(containerRef.current);
        return (): void => {
          containerRefCallback(null);
        };
      }

      return undefined;
    }, [containerRefCallback]);

    useImperativeHandle(
      ref,
      () => ({
        scrollToBottom: (): void => {
          if (shouldUseVirtualScrolling) {
            scrollToBottomVirtual();
          } else {
            scrollToBottomRegular();
          }
        },
      }),
      [scrollToBottomRegular, scrollToBottomVirtual, shouldUseVirtualScrolling]
    );

    // Debug logging
    logger.log('🟢 [MessageList] Rendering:', {
      messageCount: messages.length,
      hasStreaming: !!streamingMessage,
      isLoading,
      shouldUseVirtualScrolling,
    });

    // Task 15.3: Conditional rendering logic
    // Show welcome message when conversation is empty (no messages) and not loading
    // Note: We ignore streamingMessage here because SSE START events can create
    // a streaming message placeholder before any user message is sent
    const shouldShowWelcome = messages.length === 0 && !isLoading;
    // Only show streaming message if there are existing messages in the conversation
    // This ensures streaming only appears after user has sent at least one message
    const shouldShowStreaming = streamingMessage && messages.length > 0;

    return (
      <div
        className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent p-4 pb-20"
        ref={containerRef}
        onScroll={shouldUseVirtualScrolling ? undefined : handleScroll}
      >
        {/* Task 15.4: Show welcome message for empty conversations */}
        {shouldShowWelcome ? (
          <WelcomeMessage
            modelName={modelName}
            suggestions={suggestions}
            onSuggestionClick={onSuggestionClick}
          />
        ) : null}

        {/* Only show message list if there are messages */}
        {messages.length > 0 ? (
          shouldUseVirtualScrolling ? (
            <List
              ref={listRef}
              height={
                containerRef.current?.clientHeight ??
                itemHeight * Math.min(messages.length, 10)
              }
              itemCount={messages.length}
              itemSize={itemHeight}
              width="100%"
              itemData={virtualizedData}
              onScroll={handleVirtualScroll}
            >
              {VirtualizedRow}
            </List>
          ) : (
            <div className="flex flex-col gap-6 max-w-4xl mx-auto">
              {messages.map((message) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  onCopyCode={onCopyCode}
                  onRetryMessage={onRetryMessage}
                  highlightKeywords={highlightKeywords}
                />
              ))}
            </div>
          )
        ) : null}

        {/* Task 15.3: Only show streaming message if appropriate */}
        {shouldShowStreaming ? (
          <div className="max-w-4xl mx-auto mt-6">
            <StreamingMessage
              message={streamingMessage}
              onCopyCode={onCopyCode}
            />
          </div>
        ) : null}

        {isLoading ? (
          <div className="max-w-4xl mx-auto mt-6">
            <TypingIndicator />
          </div>
        ) : null}

        {showScrollButton ? (
          <Glass 
            intensity="low"
            className="fixed bottom-24 right-8 z-20 rounded-full cursor-pointer hover:scale-110 transition-transform duration-200"
          >
            <button
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200"
              onClick={handleScrollButtonClick}
              type="button"
              aria-label={t('chat.scrollToBottom')}
            >
              <span className="text-lg">↓</span>
              <span>{t('chat.scrollToBottom')}</span>
            </button>
          </Glass>
        ) : null}
      </div>
    );
  }
);

MessageListComponent.displayName = 'MessageList';

export const MessageList = memo(MessageListComponent);
