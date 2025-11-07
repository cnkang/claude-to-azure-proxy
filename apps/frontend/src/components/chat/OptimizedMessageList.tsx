import React, {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useRef,
} from 'react';
import {
  MessageList,
  type MessageListHandle,
  type MessageListProps,
} from './MessageList.js';

export interface OptimizedMessageListRef {
  scrollToBottom: () => void;
  scrollToTop: () => void;
  scrollToMessage: (messageId: string) => void;
  getScrollPosition: () => number;
}

interface OptimizedMessageListProps extends MessageListProps {
  readonly className?: string;
  readonly autoScroll?: boolean;
}

const OptimizedMessageListComponent = forwardRef<
  OptimizedMessageListRef,
  OptimizedMessageListProps
>(({ className = '', autoScroll, autoScrollEnabled, ...props }, ref) => {
  const listHandleRef = useRef<MessageListHandle>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const registerContainer = useCallback(
    (element: HTMLDivElement | null): void => {
      containerRef.current = element;
    },
    []
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToBottom: (): void => {
        listHandleRef.current?.scrollToBottom();
      },
      scrollToTop: (): void => {
        containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      },
      scrollToMessage: (messageId: string): void => {
        const container = containerRef.current;
        if (!container) {
          return;
        }

        const target = container.querySelector<HTMLElement>(
          `[data-message-id='${messageId}']`
        );
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      },
      getScrollPosition: (): number => {
        return containerRef.current?.scrollTop ?? 0;
      },
    }),
    []
  );

  return (
    <div className={`optimized-message-list ${className}`}>
      <MessageList
        {...props}
        ref={listHandleRef}
        autoScrollEnabled={autoScrollEnabled ?? autoScroll ?? true}
        containerRefCallback={registerContainer}
      />
    </div>
  );
});

OptimizedMessageListComponent.displayName = 'OptimizedMessageList';

export const OptimizedMessageList = memo(OptimizedMessageListComponent);
