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
import { useTranslation } from 'react-i18next';
import { Glass } from '../ui/Glass.js';

export interface WelcomeMessageProps {
  readonly modelName?: string;
  readonly suggestions?: readonly string[];
  readonly onSuggestionClick?: (suggestion: string) => void;
}

/**
 * Welcome message component for empty conversations
 */
const WelcomeMessageComponent = ({
  modelName,
  suggestions = [],
  onSuggestionClick,
}: WelcomeMessageProps): JSX.Element => {
  const { t } = useTranslation();
  const displayModelName = modelName ?? t('app.title');
  const primarySuggestion = suggestions[0] ?? t('welcome.startChat');

  return (
    <section
      className="flex flex-col items-center justify-center p-6 sm:p-10 text-center max-w-3xl mx-auto min-h-[50vh]"
      aria-label={t('welcome.title')}
    >
      <Glass
        intensity="low"
        border={true}
        className="w-full bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-blue-950/40 dark:via-slate-900 dark:to-indigo-950/30 shadow-lg"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:text-left text-center gap-6 p-6 sm:p-8">
          <div
            className="flex-shrink-0 text-5xl sm:text-6xl"
            aria-hidden="true"
          >
            🤖
          </div>
          <div className="flex-1">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-blue-700 via-cyan-600 to-indigo-600 dark:from-blue-300 dark:via-cyan-300 dark:to-indigo-300">
              {t('welcome.title')} {displayModelName}
            </h2>
            <p className="text-base sm:text-lg text-gray-700 dark:text-gray-200 mb-5 leading-relaxed">
              {t('welcome.description')}
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 px-5 sm:px-6 py-3 rounded-full bg-gradient-to-r from-blue-600 via-cyan-500 to-indigo-500 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                onClick={(): void => onSuggestionClick?.(primarySuggestion)}
                aria-label={t('welcome.startChat')}
              >
                {t('welcome.startChat')}
                <span aria-hidden="true" className="text-lg">
                  →
                </span>
              </button>
              {suggestions.length > 0 ? (
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  {t('welcome.orTry')}
                  <span className="ml-2 font-medium text-blue-700 dark:text-blue-200">
                    {primarySuggestion}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Glass>

      {suggestions.length > 0 ? (
        <div className="w-full mt-6">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wider">
            {t('welcome.youCanTry')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {suggestions.map((suggestion) => (
              <Glass
                key={suggestion}
                as="button"
                intensity="low"
                border={true}
                className="p-4 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-white/50 dark:hover:bg-white/10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                onClick={(): void => onSuggestionClick?.(suggestion)}
                type="button"
                aria-label={`${t('welcome.suggestion')}: ${suggestion}`}
              >
                {suggestion}
              </Glass>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
};

WelcomeMessageComponent.displayName = 'WelcomeMessage';

export const WelcomeMessage = memo(WelcomeMessageComponent);
