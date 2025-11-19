/**
 * useSearchWithPrefetch Hook
 *
 * Custom hook for managing search with automatic prefetching and caching.
 * Implements intelligent caching strategy with automatic prefetching of first 3 pages.
 *
 * Requirements:
 * - 8.10: Loads first 3 pages immediately, lazy-loads additional pages
 * - 6.1: Target sub-100ms proxy overhead for cached results
 * - 6.2: Efficient memory usage for search results
 *
 * Features:
 * - Automatic prefetching of first 3 pages on initial search
 * - In-memory caching with Map for O(1) lookup
 * - Cache invalidation on conversation changes
 * - Automatic cache cleanup on unmount
 * - Concurrent prefetch request handling
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  ConversationSearchService,
  SearchResponse,
} from '../services/conversation-search';
import { frontendLogger } from '../utils/logger';

interface UseSearchWithPrefetchOptions {
  /**
   * Number of pages to prefetch automatically (default: 3)
   */
  initialPages?: number;

  /**
   * Maximum cache size in number of entries (default: 100)
   */
  maxCacheSize?: number;

  /**
   * Enable debug logging (default: false)
   */
  debug?: boolean;
}

interface UseSearchWithPrefetchResult {
  /**
   * Search with automatic prefetching
   */
  searchWithPrefetch: (query: string, page?: number) => Promise<SearchResponse>;

  /**
   * Clear all cached results
   */
  clearCache: () => void;

  /**
   * Invalidate cache for specific query
   */
  invalidateQuery: (query: string) => void;

  /**
   * Check if result is cached
   */
  isCached: (query: string, page: number) => boolean;

  /**
   * Get cache statistics
   */
  getCacheStats: () => CacheStats;

  /**
   * Prefetch status for current query
   */
  prefetchStatus: PrefetchStatus;
}

interface CacheStats {
  size: number;
  maxSize: number;
  hitRate: number;
  missRate: number;
  totalRequests: number;
}

interface PrefetchStatus {
  isPrefetching: boolean;
  prefetchedPages: number;
  totalPages: number;
}

/**
 * Custom hook for search with prefetching and caching
 *
 * @param searchService - ConversationSearchService instance
 * @param options - Configuration options
 * @returns Search functions and cache management utilities
 *
 * @example
 * ```typescript
 * const { searchWithPrefetch, clearCache, prefetchStatus } = useSearchWithPrefetch(
 *   searchService,
 *   { initialPages: 3, maxCacheSize: 100 }
 * );
 *
 * // Perform search with automatic prefetching
 * const response = await searchWithPrefetch('keyword', 0);
 *
 * // Clear cache when conversations change
 * clearCache();
 * ```
 */
export function useSearchWithPrefetch(
  searchService: ConversationSearchService,
  options: UseSearchWithPrefetchOptions = {}
): UseSearchWithPrefetchResult {
  const { initialPages = 3, maxCacheSize = 100, debug = false } = options;

  // Cache state: Map<cacheKey, SearchResponse>
  const [cache, setCache] = useState<Map<string, SearchResponse>>(new Map());

  // Prefetch status
  const [prefetchStatus, setPrefetchStatus] = useState<PrefetchStatus>({
    isPrefetching: false,
    prefetchedPages: 0,
    totalPages: 0,
  });

  // Cache statistics
  const statsRef = useRef({
    hits: 0,
    misses: 0,
    totalRequests: 0,
  });

  // Track ongoing prefetch requests to avoid duplicates
  const prefetchingRef = useRef<Set<string>>(new Set());

  /**
   * Generate cache key from query and page
   */
  const getCacheKey = useCallback((query: string, page: number): string => {
    return `${query.toLowerCase().trim()}:${page}`;
  }, []);

  /**
   * Check if result is cached
   */
  const isCached = useCallback(
    (query: string, page: number): boolean => {
      const key = getCacheKey(query, page);
      return cache.has(key);
    },
    [cache, getCacheKey]
  );

  /**
   * Get cache statistics
   */
  const getCacheStats = useCallback((): CacheStats => {
    const { hits, misses, totalRequests } = statsRef.current;
    return {
      size: cache.size,
      maxSize: maxCacheSize,
      hitRate: totalRequests > 0 ? hits / totalRequests : 0,
      missRate: totalRequests > 0 ? misses / totalRequests : 0,
      totalRequests,
    };
  }, [cache.size, maxCacheSize]);

  /**
   * Evict oldest entries if cache exceeds max size
   */
  const evictOldestEntries = useCallback(
    (newCache: Map<string, SearchResponse>) => {
      if (newCache.size <= maxCacheSize) {
        return newCache;
      }

      // Convert to array and keep only the most recent entries
      const entries = Array.from(newCache.entries());
      const entriesToKeep = entries.slice(-maxCacheSize);

      if (debug) {
        frontendLogger.info('Cache eviction', {
          metadata: {
            evicted: entries.length - entriesToKeep.length,
            remaining: entriesToKeep.length,
          },
        });
      }

      return new Map(entriesToKeep);
    },
    [maxCacheSize, debug]
  );

  /**
   * Prefetch additional pages in the background
   */
  const prefetchPages = useCallback(
    async (
      query: string,
      startPage: number,
      endPage: number
    ): Promise<void> => {
      const pagesToPrefetch: number[] = [];

      // Determine which pages need prefetching
      for (let page = startPage; page <= endPage; page++) {
        const key = getCacheKey(query, page);
        if (!cache.has(key) && !prefetchingRef.current.has(key)) {
          pagesToPrefetch.push(page);
          prefetchingRef.current.add(key);
        }
      }

      if (pagesToPrefetch.length === 0) {
        return;
      }

      if (debug) {
        frontendLogger.info('Starting prefetch', {
          metadata: {
            query,
            pages: pagesToPrefetch,
            count: pagesToPrefetch.length,
          },
        });
      }

      // Update prefetch status
      setPrefetchStatus((prev) => ({
        ...prev,
        isPrefetching: true,
        totalPages: pagesToPrefetch.length,
      }));

      // Prefetch pages concurrently
      const prefetchPromises = pagesToPrefetch.map(async (page) => {
        const key = getCacheKey(query, page);

        try {
          const response = await searchService.search(query, {
            caseSensitive: false,
            page,
            pageSize: 20,
          });

          // Add to cache
          setCache((prev) => {
            const newCache = new Map(prev);
            newCache.set(key, response);
            return evictOldestEntries(newCache);
          });

          // Update prefetch status
          setPrefetchStatus((prev) => ({
            ...prev,
            prefetchedPages: prev.prefetchedPages + 1,
          }));

          if (debug) {
            frontendLogger.info('Prefetch completed', {
              metadata: { query, page, cacheKey: key },
            });
          }
        } catch (error) {
          frontendLogger.warn('Prefetch failed', {
            metadata: { query, page },
            error: error instanceof Error ? error : new Error(String(error)),
          });
        } finally {
          prefetchingRef.current.delete(key);
        }
      });

      await Promise.allSettled(prefetchPromises);

      // Reset prefetch status
      setPrefetchStatus({
        isPrefetching: false,
        prefetchedPages: 0,
        totalPages: 0,
      });
    },
    [cache, getCacheKey, searchService, evictOldestEntries, debug]
  );

  /**
   * Search with automatic prefetching
   *
   * Requirement 8.10: Loads first 3 pages immediately, lazy-loads additional pages
   * Requirement 6.1: Target sub-100ms for cached results
   */
  const searchWithPrefetch = useCallback(
    async (query: string, page: number = 0): Promise<SearchResponse> => {
      const trimmedQuery = query.trim();

      if (trimmedQuery.length === 0) {
        throw new Error('Query cannot be empty');
      }

      const cacheKey = getCacheKey(trimmedQuery, page);
      statsRef.current.totalRequests++;

      // Check cache first (Requirement 6.1: sub-100ms for cache hits)
      if (cache.has(cacheKey)) {
        statsRef.current.hits++;

        if (debug) {
          frontendLogger.info('Cache hit', {
            metadata: { query: trimmedQuery, page, cacheKey },
          });
        }

        return cache.get(cacheKey)!;
      }

      // Cache miss - perform search
      statsRef.current.misses++;

      if (debug) {
        frontendLogger.info('Cache miss', {
          metadata: { query: trimmedQuery, page, cacheKey },
        });
      }

      const startTime = Date.now();
      const response = await searchService.search(trimmedQuery, {
        caseSensitive: false,
        page,
        pageSize: 20,
      });
      const searchTime = Date.now() - startTime;

      // Cache the result
      setCache((prev) => {
        const newCache = new Map(prev);
        newCache.set(cacheKey, response);
        return evictOldestEntries(newCache);
      });

      if (debug) {
        frontendLogger.info('Search completed', {
          metadata: {
            query: trimmedQuery,
            page,
            searchTime,
            totalResults: response.pagination.totalResults,
          },
        });
      }

      // Prefetch next pages if this is the first page (Requirement 8.10)
      if (page === 0 && response.pagination.totalPages > 1) {
        const pagesToPrefetch = Math.min(
          initialPages - 1,
          response.pagination.totalPages - 1
        );

        if (pagesToPrefetch > 0) {
          // Prefetch in background (don't await)
          prefetchPages(trimmedQuery, 1, pagesToPrefetch).catch((error) => {
            frontendLogger.error('Prefetch error', {
              error: error instanceof Error ? error : new Error(String(error)),
            });
          });
        }
      }

      return response;
    },
    [
      cache,
      getCacheKey,
      searchService,
      evictOldestEntries,
      initialPages,
      prefetchPages,
      debug,
    ]
  );

  /**
   * Clear all cached results
   */
  const clearCache = useCallback(() => {
    setCache(new Map());
    prefetchingRef.current.clear();
    statsRef.current = { hits: 0, misses: 0, totalRequests: 0 };

    if (debug) {
      frontendLogger.info('Cache cleared');
    }
  }, [debug]);

  /**
   * Invalidate cache for specific query
   */
  const invalidateQuery = useCallback(
    (query: string) => {
      const trimmedQuery = query.toLowerCase().trim();

      setCache((prev) => {
        const newCache = new Map(prev);
        let removedCount = 0;

        // Remove all entries matching the query
        for (const key of newCache.keys()) {
          if (key.startsWith(`${trimmedQuery}:`)) {
            newCache.delete(key);
            removedCount++;
          }
        }

        if (debug && removedCount > 0) {
          frontendLogger.info('Cache invalidated', {
            metadata: { query: trimmedQuery, removedCount },
          });
        }

        return newCache;
      });
    },
    [debug]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearCache();
    };
  }, [clearCache]);

  return {
    searchWithPrefetch,
    clearCache,
    invalidateQuery,
    isCached,
    getCacheStats,
    prefetchStatus,
  };
}
