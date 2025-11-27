/**
 * SearchResultItem Component
 *
 * Displays a single search result with highlighted keywords and context.
 * Fully accessible with keyboard navigation support.
 *
 * Requirements:
 * - 8.2: Displays matching conversations with highlighted keywords
 * - 8.3: Opens conversation and scrolls to match on click
 * - 8.7: Shows context (100 chars before/after keyword)
 * - WCAG 2.2 AAA: Full accessibility compliance
 */

import React, { useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SearchResult } from '../../services/conversation-search';
import { cn } from '../ui/Glass.js';
import { highlightKeywords, parseSearchQuery } from '../../utils/highlight.js';

interface SearchResultItemProps {
  result: SearchResult;
  query: string;
  isFocused: boolean;
  onSelect: (conversationId: string, messageId?: string) => void;
}

export function SearchResultItem({
  result,
  query,
  isFocused,
  onSelect,
}: SearchResultItemProps): React.ReactElement {
  const { t } = useTranslation();
  const itemRef = useRef<HTMLDivElement>(null);

  // Parse query into keywords for highlighting
  const keywords = useMemo(() => parseSearchQuery(query), [query]);

  // Scroll into view when focused
  useEffect(() => {
    if (isFocused && itemRef.current) {
      itemRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [isFocused]);

  // Handle click on result
  const handleClick = () => {
    const firstMatch = result.matches[0];
    onSelect(
      result.conversationId,
      firstMatch.messageId !== 'title' ? firstMatch.messageId : undefined
    );
  };

  // Handle keyboard activation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  // Format timestamp
  const formatTimestamp = (timestamp: Date): string => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return t('search.today');
    } else if (days === 1) {
      return t('search.yesterday');
    } else if (days < 7) {
      return t('search.daysAgo', { count: days });
    } else {
      return timestamp.toLocaleDateString();
    }
  };

  return (
    <div
      ref={itemRef}
      id={`result-${result.conversationId}`}
      className={cn(
        "p-4 rounded-xl border transition-all duration-200 cursor-pointer outline-none",
        isFocused 
          ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 shadow-sm ring-2 ring-blue-500/50" 
          : "bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
      )}
      data-testid={`search-result-${result.conversationId}`}
      role="button"
      aria-labelledby={`result-title-${result.conversationId}`}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {/* Conversation Title with Highlighting */}
      <h3 id={`result-title-${result.conversationId}`} className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {highlightKeywords(result.conversationTitle, keywords)}
      </h3>

      {/* Match Count */}
      <div className="flex items-center gap-2 mb-3 text-xs text-gray-700 dark:text-gray-300">
        <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
          {t('search.matchCount', { count: result.totalMatches })}
        </span>
        <span
          className="font-mono text-[10px] opacity-75"
          aria-label={t('search.relevanceScore')}
        >
          Score: {Math.round(result.relevanceScore * 10) / 10}
        </span>
      </div>

      {/* Match Previews (show first 3 matches) */}
      <div className="space-y-3">
        {result.matches.slice(0, 3).map((match, index) => (
          <div key={`${match.messageId}-${index}`} className="text-sm">
            {/* Match Context with Highlighting (Requirement 8.7, 8.1) */}
            <p className="match-context text-gray-700 dark:text-gray-300 leading-relaxed bg-gray-50 dark:bg-gray-900/50 p-2 rounded-lg border border-gray-100 dark:border-gray-800">
              {match.context.before && <span className="opacity-70">...</span>}
              {highlightKeywords(
                (match.context.before || '') +
                  match.context.keyword +
                  (match.context.after || ''),
                keywords
              )}
              {match.context.after && <span className="opacity-70">...</span>}
            </p>

            {/* Match Metadata */}
            <div className="flex items-center gap-2 mt-1 text-xs text-gray-700">
              <span className="font-medium uppercase tracking-wider text-[10px]">
                {match.role === 'user'
                  ? t('search.you')
                  : t('search.assistant')}
              </span>
              <span className="text-gray-300 dark:text-gray-300" aria-hidden="true">
                •
              </span>
              <time
                dateTime={match.timestamp.toISOString()}
              >
                {formatTimestamp(match.timestamp)}
              </time>
              {match.highlights.length > 1 && (
                <>
                  <span className="text-gray-300 dark:text-gray-300" aria-hidden="true">
                    •
                  </span>
                  <span>
                    {t('search.highlightCount', {
                      count: match.highlights.length,
                    })}
                  </span>
                </>
              )}
            </div>
          </div>
        ))}

        {/* Show "more matches" indicator */}
        {result.matches.length > 3 && (
          <p className="text-xs text-blue-700 dark:text-blue-200 font-medium pt-1">
            {t('search.moreMatches', { count: result.matches.length - 3 })}
          </p>
        )}
      </div>
    </div>
  );
}
