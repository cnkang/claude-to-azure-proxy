/**
 * Welcome Message Component
 *
 * Displays a friendly welcome message when a conversation is empty,
 * providing conversation starters and guidance to users.
 *
 * Requirements: 9.1, 9.2, UX 1, Accessibility 1
 */

import React, { memo } from 'react';
import type { JSX } from 'react';
import './WelcomeMessage.css';

export interface WelcomeMessageProps {
  readonly modelName?: string;
  readonly suggestions?: readonly string[];
  readonly onSuggestionClick?: (suggestion: string) => void;
}

/**
 * Welcome message component for empty conversations
 */
const WelcomeMessageComponent = ({
  modelName = 'AI 助手',
  suggestions = [],
  onSuggestionClick,
}: WelcomeMessageProps): JSX.Element => {
  return (
    <div className="welcome-message" role="region" aria-label="欢迎消息">
      <div className="welcome-icon" aria-hidden="true">
        💬
      </div>
      <h2 className="welcome-title">欢迎使用 {modelName}</h2>
      <p className="welcome-description">
        我可以帮你回答问题、编写代码、翻译文本等。开始对话吧！
      </p>
      {suggestions.length > 0 ? (
        <div className="welcome-suggestions">
          <p className="suggestions-title">你可以试试：</p>
          <div className="suggestions-list">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                className="suggestion-button"
                onClick={(): void => onSuggestionClick?.(suggestion)}
                type="button"
                aria-label={`建议: ${suggestion}`}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

WelcomeMessageComponent.displayName = 'WelcomeMessage';

export const WelcomeMessage = memo(WelcomeMessageComponent);
