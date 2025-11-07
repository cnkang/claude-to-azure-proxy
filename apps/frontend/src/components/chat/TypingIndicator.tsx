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
import './TypingIndicator.css';

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

  return (
    <div
      className={`typing-indicator ${size}`}
      role="status"
      aria-live="polite"
    >
      <div className="typing-avatar">
        <div className="avatar assistant">🤖</div>
      </div>
      <div className="typing-content">
        <div className="typing-message">{displayMessage}</div>
        <div className="typing-dots">
          <span className="dot dot-1" />
          <span className="dot dot-2" />
          <span className="dot dot-3" />
        </div>
      </div>
    </div>
  );
};

TypingIndicatorComponent.displayName = 'TypingIndicator';

export const TypingIndicator = memo(TypingIndicatorComponent);
