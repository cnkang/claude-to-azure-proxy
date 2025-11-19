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

import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { SearchResult } from '../../services/conversation-search';
import './SearchResultItem.css';

interface SearchResultItemProps {
  result: SearchResult;
  query: string;
  isFocused: boolean;
  onSelect: (conversationId: string, messageId?: string) => void;
}

export function SearchResultItem({
  result,
  isFocused,
  onSelect,
}: SearchResultItemProps): React.ReactElement {
  const { t } = useTranslation();
  const itemRef = useRef<HTMLDivElement>(null);

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

  // Highlight keywords in text (Requirement 8.2)
  // Note: This function is currently unused but kept for future enhancement
  // const highlightText = (text: string, highlights: Array<{ start: number; end: number; keyword: string }>): React.ReactElement[] => {
  //   if (highlights.length === 0) {
  //     return [<span key="0">{text}</span>];
  //   }

  //   const segments: React.ReactElement[] = [];
  //   let lastIndex = 0;

  //   // Sort highlights by start position
  //   const sortedHighlights = [...highlights].sort((a, b) => a.start - b.start);

  //   sortedHighlights.forEach((highlight, index) => {
  //     // Add text before highlight
  //     if (highlight.start > lastIndex) {
  //       segments.push(
  //         <span key={`text-${index}`}>
  //           {text.substring(lastIndex, highlight.start)}
  //         </span>
  //       );
  //     }

  //     // Add highlighted text
  //     segments.push(
  //       <mark key={`mark-${index}`} className="search-highlight">
  //         {text.substring(highlight.start, highlight.end)}
  //       </mark>
  //     );

  //     lastIndex = highlight.end;
  //   });

  //   // Add remaining text
  //   if (lastIndex < text.length) {
  //     segments.push(
  //       <span key="text-end">
  //         {text.substring(lastIndex)}
  //       </span>
  //     );
  //   }

  //   return segments;
  // };

  return (
    <div
      ref={itemRef}
      id={`result-${result.conversationId}`}
      className={`search-result-item ${isFocused ? 'focused' : ''}`}
      role="button"
      aria-labelledby={`result-title-${result.conversationId}`}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {/* Conversation Title */}
      <h3 id={`result-title-${result.conversationId}`} className="result-title">
        {result.conversationTitle}
      </h3>

      {/* Match Count */}
      <div className="result-meta">
        <span className="match-count">
          {t('search.matchCount', { count: result.totalMatches })}
        </span>
        <span
          className="relevance-score"
          aria-label={t('search.relevanceScore')}
        >
          {Math.round(result.relevanceScore * 10) / 10}
        </span>
      </div>

      {/* Match Previews (show first 3 matches) */}
      <div className="result-matches">
        {result.matches.slice(0, 3).map((match, index) => (
          <div key={`${match.messageId}-${index}`} className="match-item">
            {/* Match Context with Highlighting (Requirement 8.7) */}
            <p className="match-context">
              {match.context.before && (
                <span className="context-before">{match.context.before}</span>
              )}
              <mark className="search-highlight context-keyword">
                {match.context.keyword}
              </mark>
              {match.context.after && (
                <span className="context-after">{match.context.after}</span>
              )}
            </p>

            {/* Match Metadata */}
            <div className="match-meta">
              <span className="match-role">
                {match.role === 'user'
                  ? t('search.you')
                  : t('search.assistant')}
              </span>
              <span className="match-separator" aria-hidden="true">
                •
              </span>
              <time
                className="match-timestamp"
                dateTime={match.timestamp.toISOString()}
              >
                {formatTimestamp(match.timestamp)}
              </time>
              {match.highlights.length > 1 && (
                <>
                  <span className="match-separator" aria-hidden="true">
                    •
                  </span>
                  <span className="match-highlight-count">
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
          <p className="more-matches">
            {t('search.moreMatches', { count: result.matches.length - 3 })}
          </p>
        )}
      </div>
    </div>
  );
}
