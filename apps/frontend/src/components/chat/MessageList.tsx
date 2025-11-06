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
import { FixedSizeList as List } from 'react-window';
import { MessageItem } from './MessageItem.js';
import { TypingIndicator } from './TypingIndicator.js';
import { StreamingMessage } from './StreamingMessage.js';
import type { Message } from '../../types/index.js';
import './MessageList.css';

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
      <div className="virtualized-message">
        <MessageItem
          message={message}
          onCopyCode={data.onCopyCode}
          onRetryMessage={data.onRetryMessage}
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
    }: MessageListProps,
    ref
  ): JSX.Element => {
    const containerRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<List>(null);
    const [autoScroll, setAutoScroll] = useState(true);

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
  }, []);

  const handleVirtualScroll = useCallback(
    ({ scrollOffset, scrollUpdateWasRequested }: { scrollOffset: number; scrollUpdateWasRequested: boolean }): void => {
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
      const distanceFromBottom = totalHeight - (scrollOffset + viewportHeight);

      setAutoScroll(distanceFromBottom < itemHeight * 2);
    },
    [itemHeight, messages.length]
  );

  const scrollToBottomVirtual = useCallback((): void => {
    if (!listRef.current || messages.length === 0) {
      return;
    }

    listRef.current.scrollToItem(messages.length - 1, 'end');
  }, [messages.length]);

  const scrollToBottomRegular = useCallback((): void => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, []);

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
    }),
    [messages, onCopyCode, onRetryMessage]
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

  return (
    <div
      className="message-list-container"
      ref={containerRef}
      onScroll={shouldUseVirtualScrolling ? undefined : handleScroll}
    >
      {shouldUseVirtualScrolling ? (
        <List
          ref={listRef}
          height={containerRef.current?.clientHeight ?? itemHeight * Math.min(messages.length, 10)}
          itemCount={messages.length}
          itemSize={itemHeight}
          width="100%"
          itemData={virtualizedData}
          onScroll={handleVirtualScroll}
        >
          {VirtualizedRow}
        </List>
      ) : (
        <div className="message-list">
          {messages.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              onCopyCode={onCopyCode}
              onRetryMessage={onRetryMessage}
            />
          ))}
        </div>
      )}

      {streamingMessage ? (
        <StreamingMessage message={streamingMessage} onCopyCode={onCopyCode} />
      ) : null}

      {isLoading ? <TypingIndicator /> : null}
    </div>
  );
  }
);

MessageListComponent.displayName = 'MessageList';

export const MessageList = memo(MessageListComponent);
