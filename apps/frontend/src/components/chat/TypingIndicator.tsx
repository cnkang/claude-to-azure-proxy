/**
 * Typing Indicator Component
 *
 * Displays animated typing indicator when AI is generating a response.
 *
 * Requirements: 3.4
 */

import React, { memo } from 'react';
import type { JSX } from 'react';
import { useI18n } from '../../contexts/I18nContext.js';
import { cn } from '../ui/Glass.js';

interface TypingIndicatorProps {
  readonly message?: string;
  readonly size?: 'small' | 'medium' | 'large';
}

/**
 * Typing indicator component with animated dots
 */
const TypingIndicatorComponent = ({
  message,
  size = 'medium',
}: TypingIndicatorProps): JSX.Element => {
  const { t } = useI18n();
  const displayMessage = message ?? t('chat.aiTyping');

  const sizeClasses = {
    small: 'text-xs',
    medium: 'text-sm',
    large: 'text-base',
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-2xl bg-white/50 dark:bg-gray-800/50 w-fit",
        sizeClasses[size]
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center text-lg shadow-sm">
          🤖
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <div className="text-gray-700 dark:text-gray-300 font-medium">
          {displayMessage}
        </div>
        <div className="flex gap-1">
          <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
          <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
          <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" />
        </div>
      </div>
    </div>
  );
};

TypingIndicatorComponent.displayName = 'TypingIndicator';

export const TypingIndicator = memo(TypingIndicatorComponent);
