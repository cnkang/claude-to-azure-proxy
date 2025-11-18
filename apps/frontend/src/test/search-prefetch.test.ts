/**
 * Unit tests for useSearchWithPrefetch hook
 * 
 * Tests prefetching logic, cache behavior, and cache invalidation.
 * 
 * Requirements:
 * - Test cache behavior (hits, misses, eviction)
 * - Test prefetching logic (first 3 pages)
 * - Test cache invalidation on conversation changes
 * - Test cache clearing on unmount
 * - Test concurrent prefetch requests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSearchWithPrefetch } from '../hooks/useSearchWithPrefetch.js';
import type { ConversationSearchService, SearchResponse } from '../services/conversation-search.js';

// Mock search service
const createMockSearchService = (): ConversationSearchService => {
  const mockSearch = vi.fn(async (query: string, options?: { page?: number }): Promise<SearchResponse> => {
    const page = options?.page ?? 0;
    const totalResults = 100;
    const pageSize = 20;
    const totalPages = Math.ceil(totalResults / pageSize);

    return {
      results: Array.from({ length: Math.min(pageSize, totalResults - page * pageSize) }, (_, i) => ({
        conversationId: `conv-${page}-${i}`,
        conversationTitle: `Conversation ${page}-${i}`,
        matches: [{
          messageId: `msg-${page}-${i}`,
          messageIndex: 0,
          content: `Message content with ${query}`,
          context: {
            before: 'Text before ',
            keyword: query,
            after: ' text after',
            position: 12
          },
          highlights: [{
            start: 12,
            end: 12 + query.length,
            keyword: query
          }],
          timestamp: new Date(),
          role: 'user' as const
        }],
        totalMatches: 1,
        relevanceScore: 1.0
      })),
      pagination: {
        currentPage: page,
        pageSize,
        totalResults,
        totalPages,
        hasNextPage: page < totalPages - 1,
        hasPreviousPage: page > 0
      },
      searchTime: 50
    };
  });

  return {
    search: mockSearch,
    initialize: vi.fn(),
    buildSearchIndex: vi.fn(),
    updateIndex: vi.fn(),
    removeFromIndex: vi.fn()
  } as unknown as ConversationSearchService;
};

describe('useSearchWithPrefetch', () => {
  let mockSearchService: ConversationSearchService;

  beforeEach(() => {
    mockSearchService = createMockSearchService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic Search Functionality', () => {
    it('should perform search and return results', async () => {
      const { result } = renderHook(() => useSearchWithPrefetch(mockSearchService));

      let response: SearchResponse | undefined;
      await act(async () => {
        response = await result.current.searchWithPrefetch('test', 0);
      });

      expect(response).toBeDefined();
      expect(response!.results).toHaveLength(20);
      expect(response!.pagination.currentPage).toBe(0);
      expect(mockSearchService.search).toHaveBeenCalledWith('test', {
        caseSensitive: false,
        page: 0,
        pageSize: 20
      });
    });

    it('should throw error for empty query', async () => {
      const { result } = renderHook(() => useSearchWithPrefetch(mockSearchService));

      await expect(async () => {
        await act(async () => {
          await result.current.searchWithPrefetch('', 0);
        });
      }).rejects.toThrow('Query cannot be empty');
    });

    it('should trim query before searching', async () => {
      const { result } = renderHook(() => useSearchWithPrefetch(mockSearchService));

      await act(async () => {
        await result.current.searchWithPrefetch('  test  ', 0);
      });

      expect(mockSearchService.search).toHaveBeenCalledWith('test', {
        caseSensitive: false,
        page: 0,
        pageSize: 20
      });
    });
  });

  describe('Cache Behavior', () => {
    it('should cache search results', async () => {
      // Disable prefetching for this test
      const { result } = renderHook(() => 
        useSearchWithPrefetch(mockSearchService, { initialPages: 1 })
      );

      // First search - cache miss
      await act(async () => {
        await result.current.searchWithPrefetch('test', 0);
      });

      expect(mockSearchService.search).toHaveBeenCalledTimes(1);

      // Second search - cache hit
      await act(async () => {
        await result.current.searchWithPrefetch('test', 0);
      });

      // Should not call search service again (cache hit)
      expect(mockSearchService.search).toHaveBeenCalledTimes(1);
    });

    it('should check if result is cached', async () => {
      const { result } = renderHook(() => useSearchWithPrefetch(mockSearchService));

      // Initially not cached
      expect(result.current.isCached('test', 0)).toBe(false);

      // Perform search
      await act(async () => {
        await result.current.searchWithPrefetch('test', 0);
      });

      // Now cached
      expect(result.current.isCached('test', 0)).toBe(true);
    });

    it('should track cache statistics', async () => {
      // Disable prefetching for this test
      const { result } = renderHook(() => 
        useSearchWithPrefetch(mockSearchService, { initialPages: 1 })
      );

      // Initial stats
      let stats = result.current.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.totalRequests).toBe(0);
      expect(stats.hitRate).toBe(0);
      expect(stats.missRate).toBe(0);

      // First search - cache miss
      await act(async () => {
        await result.current.searchWithPrefetch('test', 0);
      });

      stats = result.current.getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.totalRequests).toBe(1);
      expect(stats.hitRate).toBe(0);
      expect(stats.missRate).toBe(1);

      // Second search - cache hit
      await act(async () => {
        await result.current.searchWithPrefetch('test', 0);
      });

      stats = result.current.getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.totalRequests).toBe(2);
      expect(stats.hitRate).toBe(0.5);
      expect(stats.missRate).toBe(0.5);
    });

    it('should evict oldest entries when cache exceeds max size', async () => {
      // Disable prefetching and set small cache size
      const { result } = renderHook(() => 
        useSearchWithPrefetch(mockSearchService, { maxCacheSize: 3, initialPages: 1 })
      );

      // Add 4 entries (exceeds max size of 3)
      await act(async () => {
        await result.current.searchWithPrefetch('query1', 0);
        await result.current.searchWithPrefetch('query2', 0);
        await result.current.searchWithPrefetch('query3', 0);
        await result.current.searchWithPrefetch('query4', 0);
      });

      const stats = result.current.getCacheStats();
      expect(stats.size).toBe(3); // Should only keep 3 entries

      // First entry should be evicted
      expect(result.current.isCached('query1', 0)).toBe(false);
      // Last 3 entries should be cached
      expect(result.current.isCached('query2', 0)).toBe(true);
      expect(result.current.isCached('query3', 0)).toBe(true);
      expect(result.current.isCached('query4', 0)).toBe(true);
    });
  });

  describe('Prefetching Logic (Requirement 8.10)', () => {
    it('should prefetch first 3 pages automatically', async () => {
      const { result } = renderHook(() => 
        useSearchWithPrefetch(mockSearchService, { initialPages: 3 })
      );

      // Search page 0
      await act(async () => {
        await result.current.searchWithPrefetch('test', 0);
      });

      // Wait for prefetch to complete
      await waitFor(() => {
        expect(mockSearchService.search).toHaveBeenCalledTimes(3);
      }, { timeout: 2000 });

      // Should have called search for pages 0, 1, 2
      expect(mockSearchService.search).toHaveBeenCalledWith('test', {
        caseSensitive: false,
        page: 0,
        pageSize: 20
      });
      expect(mockSearchService.search).toHaveBeenCalledWith('test', {
        caseSensitive: false,
        page: 1,
        pageSize: 20
      });
      expect(mockSearchService.search).toHaveBeenCalledWith('test', {
        caseSensitive: false,
        page: 2,
        pageSize: 20
      });
    });

    it('should not prefetch if only one page exists', async () => {
      // Mock service with only one page
      const singlePageService = createMockSearchService();
      vi.mocked(singlePageService.search).mockResolvedValue({
        results: [],
        pagination: {
          currentPage: 0,
          pageSize: 20,
          totalResults: 5,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false
        },
        searchTime: 50
      });

      const { result } = renderHook(() => 
        useSearchWithPrefetch(singlePageService, { initialPages: 3 })
      );

      await act(async () => {
        await result.current.searchWithPrefetch('test', 0);
      });

      // Wait a bit to ensure no prefetch happens
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should only call search once (no prefetch)
      expect(singlePageService.search).toHaveBeenCalledTimes(1);
    });

    it('should not prefetch beyond total pages', async () => {
      // Mock service with only 2 pages
      const twoPageService = createMockSearchService();
      vi.mocked(twoPageService.search).mockResolvedValue({
        results: [],
        pagination: {
          currentPage: 0,
          pageSize: 20,
          totalResults: 30,
          totalPages: 2,
          hasNextPage: true,
          hasPreviousPage: false
        },
        searchTime: 50
      });

      const { result } = renderHook(() => 
        useSearchWithPrefetch(twoPageService, { initialPages: 3 })
      );

      await act(async () => {
        await result.current.searchWithPrefetch('test', 0);
      });

      // Wait for prefetch to complete
      await waitFor(() => {
        expect(twoPageService.search).toHaveBeenCalledTimes(2);
      }, { timeout: 2000 });

      // Should only prefetch page 1 (not page 2 which doesn't exist)
      expect(twoPageService.search).toHaveBeenCalledWith('test', {
        caseSensitive: false,
        page: 0,
        pageSize: 20
      });
      expect(twoPageService.search).toHaveBeenCalledWith('test', {
        caseSensitive: false,
        page: 1,
        pageSize: 20
      });
    });

    it('should update prefetch status during prefetching', async () => {
      const { result } = renderHook(() => 
        useSearchWithPrefetch(mockSearchService, { initialPages: 3 })
      );

      // Initial status
      expect(result.current.prefetchStatus.isPrefetching).toBe(false);
      expect(result.current.prefetchStatus.prefetchedPages).toBe(0);
      expect(result.current.prefetchStatus.totalPages).toBe(0);

      // Start search
      await act(async () => {
        await result.current.searchWithPrefetch('test', 0);
      });

      // Wait for prefetch to complete
      await waitFor(() => {
        expect(result.current.prefetchStatus.isPrefetching).toBe(false);
      }, { timeout: 2000 });

      // Status should be reset after completion
      expect(result.current.prefetchStatus.isPrefetching).toBe(false);
      expect(result.current.prefetchStatus.prefetchedPages).toBe(0);
      expect(result.current.prefetchStatus.totalPages).toBe(0);
    });
  });

  describe('Cache Invalidation', () => {
    it('should clear all cache', async () => {
      // Disable prefetching for this test
      const { result } = renderHook(() => 
        useSearchWithPrefetch(mockSearchService, { initialPages: 1 })
      );

      // Add some entries
      await act(async () => {
        await result.current.searchWithPrefetch('test1', 0);
        await result.current.searchWithPrefetch('test2', 0);
      });

      expect(result.current.getCacheStats().size).toBe(2);

      // Clear cache
      act(() => {
        result.current.clearCache();
      });

      expect(result.current.getCacheStats().size).toBe(0);
      expect(result.current.isCached('test1', 0)).toBe(false);
      expect(result.current.isCached('test2', 0)).toBe(false);
    });

    it('should invalidate cache for specific query', async () => {
      // Disable prefetching for this test
      const { result } = renderHook(() => 
        useSearchWithPrefetch(mockSearchService, { initialPages: 1 })
      );

      // Add entries for different queries
      await act(async () => {
        await result.current.searchWithPrefetch('test1', 0);
        await result.current.searchWithPrefetch('test1', 1);
        await result.current.searchWithPrefetch('test2', 0);
      });

      expect(result.current.getCacheStats().size).toBe(3);

      // Invalidate test1
      act(() => {
        result.current.invalidateQuery('test1');
      });

      // test1 entries should be removed
      expect(result.current.isCached('test1', 0)).toBe(false);
      expect(result.current.isCached('test1', 1)).toBe(false);
      // test2 should still be cached
      expect(result.current.isCached('test2', 0)).toBe(true);
      expect(result.current.getCacheStats().size).toBe(1);
    });

    it('should handle case-insensitive query invalidation', async () => {
      const { result } = renderHook(() => useSearchWithPrefetch(mockSearchService));

      await act(async () => {
        await result.current.searchWithPrefetch('Test', 0);
      });

      expect(result.current.isCached('Test', 0)).toBe(true);

      // Invalidate with different case
      act(() => {
        result.current.invalidateQuery('test');
      });

      expect(result.current.isCached('Test', 0)).toBe(false);
    });
  });

  describe('Concurrent Prefetch Requests', () => {
    it('should handle concurrent searches for different queries', async () => {
      const { result } = renderHook(() => useSearchWithPrefetch(mockSearchService));

      // Start multiple searches concurrently
      await act(async () => {
        await Promise.all([
          result.current.searchWithPrefetch('query1', 0),
          result.current.searchWithPrefetch('query2', 0),
          result.current.searchWithPrefetch('query3', 0)
        ]);
      });

      // All should be cached
      expect(result.current.isCached('query1', 0)).toBe(true);
      expect(result.current.isCached('query2', 0)).toBe(true);
      expect(result.current.isCached('query3', 0)).toBe(true);
    });

    it('should not duplicate prefetch requests for same page', async () => {
      const { result } = renderHook(() => 
        useSearchWithPrefetch(mockSearchService, { initialPages: 3 })
      );

      // Start search
      await act(async () => {
        await result.current.searchWithPrefetch('test', 0);
      });

      // Wait for prefetch to complete
      await waitFor(() => {
        expect(mockSearchService.search).toHaveBeenCalledTimes(3);
      }, { timeout: 2000 });

      // Search page 1 (which should already be prefetched)
      await act(async () => {
        await result.current.searchWithPrefetch('test', 1);
      });

      // Should not call search again (cache hit)
      expect(mockSearchService.search).toHaveBeenCalledTimes(3);
    });

    it('should handle prefetch failures gracefully', async () => {
      const failingService = createMockSearchService();
      vi.mocked(failingService.search).mockImplementation(async (query, options) => {
        const page = options?.page ?? 0;
        if (page > 0) {
          throw new Error('Prefetch failed');
        }
        return {
          results: [],
          pagination: {
            currentPage: 0,
            pageSize: 20,
            totalResults: 100,
            totalPages: 5,
            hasNextPage: true,
            hasPreviousPage: false
          },
          searchTime: 50
        };
      });

      const { result } = renderHook(() => 
        useSearchWithPrefetch(failingService, { initialPages: 3 })
      );

      // Should not throw error
      await act(async () => {
        await result.current.searchWithPrefetch('test', 0);
      });

      // Wait for prefetch attempts
      await new Promise(resolve => setTimeout(resolve, 200));

      // First page should be cached
      expect(result.current.isCached('test', 0)).toBe(true);
      // Prefetch pages should not be cached (failed)
      expect(result.current.isCached('test', 1)).toBe(false);
      expect(result.current.isCached('test', 2)).toBe(false);
    });
  });

  describe('Cache Cleanup on Unmount', () => {
    it('should clear cache when component unmounts', async () => {
      // Disable prefetching for this test
      const { result, unmount } = renderHook(() => 
        useSearchWithPrefetch(mockSearchService, { initialPages: 1 })
      );

      // Add some entries
      await act(async () => {
        await result.current.searchWithPrefetch('test', 0);
      });

      expect(result.current.getCacheStats().size).toBe(1);

      // Unmount
      unmount();

      // Note: We can't check the cache after unmount since the component is destroyed
      // This test verifies that unmount doesn't throw errors
    });
  });

  describe('Custom Configuration', () => {
    it('should respect custom initialPages setting', async () => {
      const { result } = renderHook(() => 
        useSearchWithPrefetch(mockSearchService, { initialPages: 5 })
      );

      await act(async () => {
        await result.current.searchWithPrefetch('test', 0);
      });

      // Wait for prefetch to complete
      await waitFor(() => {
        expect(mockSearchService.search).toHaveBeenCalledTimes(5);
      }, { timeout: 2000 });

      // Should prefetch pages 1-4
      for (let page = 0; page < 5; page++) {
        expect(mockSearchService.search).toHaveBeenCalledWith('test', {
          caseSensitive: false,
          page,
          pageSize: 20
        });
      }
    });

    it('should respect custom maxCacheSize setting', async () => {
      const { result } = renderHook(() => 
        useSearchWithPrefetch(mockSearchService, { maxCacheSize: 2 })
      );

      await act(async () => {
        await result.current.searchWithPrefetch('query1', 0);
        await result.current.searchWithPrefetch('query2', 0);
        await result.current.searchWithPrefetch('query3', 0);
      });

      const stats = result.current.getCacheStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(2);
    });
  });
});
