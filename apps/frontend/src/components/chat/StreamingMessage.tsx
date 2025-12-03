/**
 * Streaming Message Component
 *
 * Displays a message that is being streamed in real-time with
 * animated cursor and progressive content display.
 *
 * Requirements: 3.2, 3.4
 */

import React, { memo, useState, useRef, useEffect } from 'react';
import type { JSX } from 'react';
import type { Message } from '../../types/index.js';
import { cn } from '../ui/Glass.js';
import { MessageItem } from './MessageItem.js';

interface StreamingMessageProps {
  readonly message: Partial<Message>;
  readonly onCopyCode?: (code: string) => void;
}

/**
 * Streaming message component with real-time content updates
 */
const StreamingMessageComponent = ({
  message,
  onCopyCode,
}: StreamingMessageProps): JSX.Element => {
  const [displayContent, setDisplayContent] = useState<string>(
    message.content ?? ''
  );
  const [isTyping, setIsTyping] = useState<boolean>(
    message.isComplete !== true
  );
  const contentRef = useRef<string>(message.content ?? '');
  const animationRef = useRef<number | null>(null);

  /**
   * Animate content streaming effect
   */
  useEffect(() => {
    const targetContent = message.content ?? '';

    if (targetContent === contentRef.current) {
      return;
    }

    contentRef.current = targetContent;

    if (message.isComplete === true) {
      setDisplayContent(targetContent);
      setIsTyping(false);
      if (animationRef.current !== null) {
        window.clearTimeout(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    let nextIndex = displayContent.length;
    const targetLength = targetContent.length;

    const step = (): void => {
      if (nextIndex >= targetLength) {
        setIsTyping(false);
        animationRef.current = null;
        return;
      }

      nextIndex += 1;
      setDisplayContent(targetContent.slice(0, nextIndex));
      const currentChar = targetContent.charAt(nextIndex - 1);
      let delay = 30;

      if (currentChar === ' ') {
        delay = 50;
      } else if (currentChar === '\n') {
        delay = 90;
      } else if (/[.!?]/u.test(currentChar)) {
        delay = 160;
      }

      animationRef.current = window.setTimeout(step, delay);
    };

    setIsTyping(true);
    animationRef.current = window.setTimeout(step, 40);

    return (): void => {
      if (animationRef.current !== null) {
        window.clearTimeout(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [displayContent.length, message.content, message.isComplete]);

  /**
   * Clean up animation on unmount
   */
  useEffect(() => {
    return (): void => {
      if (animationRef.current !== null) {
        window.clearTimeout(animationRef.current);
      }
    };
  }, []);

  // Create display message with current content
  const displayMessage: Message = {
    id: message.id ?? 'streaming',
    role: message.role ?? 'assistant',
    content: displayContent,
    timestamp: message.timestamp ?? new Date(),
    conversationId: message.conversationId ?? '',
    correlationId: message.correlationId ?? '',
    isComplete: message.isComplete ?? false,
    files: message.files,
    model: message.model,
    contextTokens: message.contextTokens,
  };

  return (
    <div
      className={cn(
        'relative transition-all duration-200',
        isTyping ? 'opacity-100' : 'opacity-100'
      )}
    >
      <MessageItem
        message={displayMessage}
        isStreaming={isTyping}
        onCopyCode={onCopyCode}
      />

      {/* Streaming status indicator */}
      {isTyping ? (
        <div className="absolute -bottom-6 left-16 flex items-center gap-2 text-xs text-blue-700 dark:text-blue-200 font-medium">
          <div className="w-2 h-2 rounded-full bg-blue-500 dark:bg-blue-400 animate-ping" />
          <span>Streaming...</span>
        </div>
      ) : null}
    </div>
  );
};

StreamingMessageComponent.displayName = 'StreamingMessage';

export const StreamingMessage = memo(StreamingMessageComponent);
