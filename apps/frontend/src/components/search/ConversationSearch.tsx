/**
 * ConversationSearch Component
 *
 * Main search interface for conversations with full WCAG 2.2 AAA compliance.
 * Provides debounced search input, results display, and keyboard navigation.
 *
 * Requirements:
 * - 8.1: Searches within 500ms with debouncing
 * - 8.8: Shows "No results found" with suggestions
 * - WCAG 2.2 AAA: Full accessibility compliance
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { frontendLogger } from '../../utils/logger';
import { useTranslation } from 'react-i18next';
import { ConversationSearchService } from '../../services/conversation-search';
import { getConversationStorage } from '../../services/storage';
import type { SearchResponse } from '../../services/conversation-search';
import { SearchResultItem } from './SearchResultItem';
import { SearchPagination } from './SearchPagination';
import { useSearchWithPrefetch } from '../../hooks/useSearchWithPrefetch';
import './ConversationSearch.css';

interface ConversationSearchProps {
  onResultSelect?: (conversationId: string, messageId?: string) => void;
  onConversationChange?: () => void; // Callback when conversations change (for cache invalidation)
  className?: string;
}

export function ConversationSearch({
  onResultSelect,
  onConversationChange,
  className = '',
}: ConversationSearchProps): React.ReactElement {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(
    null
  );
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [focusedResultIndex, setFocusedResultIndex] = useState(-1);

  const searchServiceRef = useRef<ConversationSearchService | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  // Initialize search service and prefetch hook
  useEffect(() => {
    const initializeSearch = async () => {
      try {
        const storage = getConversationStorage();
        const service = new ConversationSearchService(storage);
        await service.initialize();
        searchServiceRef.current = service;
      } catch (err) {
        frontendLogger.error('Failed to initialize search service', {
          error: err instanceof Error ? err : new Error(String(err)),
        });
        setError(t('search.initializationError'));
      }
    };

    initializeSearch();

    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [t]);

  // Initialize prefetch hook (Requirement 8.10, 6.1)
  const { searchWithPrefetch, clearCache, isCached, prefetchStatus } =
    useSearchWithPrefetch(searchServiceRef.current!, {
      initialPages: 3, // Prefetch first 3 pages (Requirement 8.10)
      maxCacheSize: 100,
      debug: false,
    });

  // Clear cache when conversations change (Requirement: cache invalidation)
  useEffect(() => {
    if (onConversationChange) {
      clearCache();
    }
  }, [onConversationChange, clearCache]);

  // Debounced search function with prefetching (300ms debounce - Requirement 8.1)
  const performSearch = useCallback(
    async (searchQuery: string, page: number = 0) => {
      if (!searchServiceRef.current) {
        return;
      }

      if (searchQuery.trim().length === 0) {
        setSearchResponse(null);
        setError(null);
        return;
      }

      // Check if result is cached (Requirement 6.1: instant results for cache hits)
      const cached = isCached(searchQuery, page);

      // Show loading indicator only for cache misses or during prefetch
      if (!cached) {
        setIsSearching(true);
      }

      setError(null);

      try {
        // Use prefetch-enabled search (Requirement 8.10)
        const response = await searchWithPrefetch(searchQuery, page);

        setSearchResponse(response);
        setFocusedResultIndex(-1);
      } catch (err) {
        frontendLogger.error('Search failed', {
          error: err instanceof Error ? err : new Error(String(err)),
        });
        setError(t('search.searchError'));
        setSearchResponse(null);
      } finally {
        setIsSearching(false);
      }
    },
    [t, searchWithPrefetch, isCached]
  );

  // Handle search input change with debouncing
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    setCurrentPage(0);

    // Clear previous debounce timer
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new debounce timer (300ms - Requirement 8.1)
    debounceTimerRef.current = window.setTimeout(() => {
      performSearch(newQuery, 0);
    }, 300);
  };

  const handleClearSearch = () => {
    setQuery('');
    setSearchResponse(null);
    setError(null);
    setFocusedResultIndex(-1);
    searchInputRef.current?.focus();
  };

  // Handle page change
  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    performSearch(query, newPage);

    // Scroll to top of results
    if (resultsContainerRef.current) {
      resultsContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Handle result selection
  const handleResultSelect = (conversationId: string, messageId?: string) => {
    if (onResultSelect) {
      onResultSelect(conversationId, messageId);
    }
  };

  // Keyboard navigation (Requirement: WCAG 2.2 AAA)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!searchResponse || searchResponse.results.length === 0) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (focusedResultIndex < searchResponse.results.length - 1) {
          setFocusedResultIndex(focusedResultIndex + 1);
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (focusedResultIndex > 0) {
          setFocusedResultIndex(focusedResultIndex - 1);
        } else if (focusedResultIndex === 0) {
          setFocusedResultIndex(-1);
          searchInputRef.current?.focus();
        }
        break;

      case 'Enter':
        if (focusedResultIndex >= 0) {
          const result = searchResponse.results[focusedResultIndex];
          const firstMatch = result.matches[0];
          handleResultSelect(
            result.conversationId,
            firstMatch.messageId !== 'title' ? firstMatch.messageId : undefined
          );
        }
        break;

      case 'Escape':
        e.preventDefault();
        setQuery('');
        setSearchResponse(null);
        setError(null);
        setFocusedResultIndex(-1);
        searchInputRef.current?.focus();
        break;

      case 'Home':
        e.preventDefault();
        setFocusedResultIndex(0);
        break;

      case 'End':
        e.preventDefault();
        setFocusedResultIndex(searchResponse.results.length - 1);
        break;
    }
  };

  const hasResults = searchResponse && searchResponse.results.length > 0;
  const showNoResults =
    !isSearching &&
    query.trim().length > 0 &&
    searchResponse?.results.length === 0;
  const statusText = isSearching
    ? t('search.searching')
    : hasResults
      ? t('search.resultsCount', {
          count: searchResponse?.pagination.totalResults,
        })
      : showNoResults
        ? t('search.noResults', { query })
        : '';

  return (
    <div className={`conversation-search ${className}`} role="search">
      {/* Search input */}
      <div className="search-header">
        <label htmlFor="search-input" className="sr-only">
          {t('search.label')}
        </label>
        <input
          id="search-input"
          ref={searchInputRef}
          type="search"
          value={query}
          onChange={handleSearchChange}
          placeholder={t('search.placeholder')}
          className="search-input"
          role="searchbox"
          aria-label={t('search.ariaLabel')}
          aria-describedby="search-instructions"
          aria-controls="search-results"
          aria-activedescendant={
            focusedResultIndex >= 0
              ? `result-${searchResponse?.results[focusedResultIndex]?.conversationId}`
              : undefined
          }
          autoComplete="off"
          onKeyDown={handleKeyDown}
          data-testid="search-input"
        />
        {query.trim().length > 0 && (
          <button
            type="button"
            className="search-clear-btn"
            onClick={handleClearSearch}
            aria-label={t('common.clear')}
            data-testid="search-clear-btn"
          >
            {t('common.clear')}
          </button>
        )}

        {/* Screen reader instructions */}
        <div id="search-instructions" className="sr-only">
          {t('search.instructions')}
        </div>

        {/* Search statistics */}
        {hasResults && (
          <div className="search-stats" aria-live="polite" aria-atomic="true">
            <span className="stats-count">
              {t('search.resultsCount', {
                count: searchResponse.pagination.totalResults,
              })}
            </span>
            <span className="stats-time">({searchResponse.searchTime}ms)</span>
            {/* Show cache indicator for instant results (Requirement 6.1) */}
            {isCached(query, currentPage) && (
              <span className="stats-cached" title={t('search.cachedResult')}>
                ⚡
              </span>
            )}
          </div>
        )}
      </div>

      {statusText && (
        <div
          className="conversation-search-status"
          role="status"
          aria-live="polite"
          data-testid="conversation-search-status"
        >
          {statusText}
        </div>
      )}

      {/* Loading indicator - shows for initial search (cache miss) */}
      {isSearching && (
        <div
          className="search-loading"
          role="status"
          aria-label={t('search.searching')}
          aria-live="polite"
        >
          <div className="loading-spinner" aria-hidden="true" />
          <span className="sr-only">{t('search.searching')}</span>
        </div>
      )}

      {/* Prefetch progress indicator (Requirement 8.10) */}
      {prefetchStatus.isPrefetching && !isSearching && (
        <div
          className="search-prefetching"
          role="status"
          aria-label={t('search.prefetching')}
          aria-live="polite"
        >
          <div className="prefetch-indicator">
            <span className="prefetch-text">
              {t('search.prefetchingPages', {
                current: prefetchStatus.prefetchedPages,
                total: prefetchStatus.totalPages,
              })}
            </span>
            <div className="prefetch-progress">
              <div
                className="prefetch-progress-bar"
                style={{
                  width: `${(prefetchStatus.prefetchedPages / prefetchStatus.totalPages) * 100}%`,
                }}
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="search-error" role="alert" aria-live="assertive">
          <p>{error}</p>
        </div>
      )}

      {/* Search results */}
      {hasResults && (
        <>
          <div
            id="search-results"
            ref={resultsContainerRef}
            className="search-results"
            role="region"
            aria-label={t('search.resultsLabel')}
            aria-live="polite"
            aria-atomic="false"
            data-testid="search-results"
          >
            {searchResponse.results.map((result, index) => (
              <SearchResultItem
                key={result.conversationId}
                result={result}
                query={query}
                isFocused={index === focusedResultIndex}
                onSelect={handleResultSelect}
              />
            ))}
          </div>

          {/* Pagination */}
          {searchResponse.pagination.totalPages > 1 && (
            <SearchPagination
              currentPage={searchResponse.pagination.currentPage}
              totalPages={searchResponse.pagination.totalPages}
              hasNextPage={searchResponse.pagination.hasNextPage}
              hasPreviousPage={searchResponse.pagination.hasPreviousPage}
              onPageChange={handlePageChange}
            />
          )}
        </>
      )}

      {/* No results message (Requirement 8.8) */}
      {showNoResults && (
        <div
          className="no-results"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid="search-no-results"
        >
          <p className="no-results-message">
            {t('search.noResults', { query })}
          </p>
          <div className="search-suggestions">
            <p className="suggestions-title">{t('search.suggestionsTitle')}</p>
            <ul className="suggestions-list">
              <li>{t('search.suggestion1')}</li>
              <li>{t('search.suggestion2')}</li>
              <li>{t('search.suggestion3')}</li>
              <li>{t('search.suggestion4')}</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
