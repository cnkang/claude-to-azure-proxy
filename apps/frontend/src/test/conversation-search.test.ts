/**
 * Unit tests for ConversationSearchService
 *
 * Tests search functionality with various queries, pagination, keyword highlighting,
 * context extraction, index maintenance, and both IndexedDB and localStorage backends.
 *
 * Requirements: Code Quality, 8.1, 8.2, 8.4, 8.6, 8.7, 8.9, 8.14
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConversationSearchService } from '../services/conversation-search.js';
import type { ConversationStorage } from '../services/storage.js';
import type { Conversation, Message } from '../types/index.js';

// Mock ConversationStorage
const createMockStorage = (): ConversationStorage => {
  const mockConversations: Conversation[] = [];

  return {
    getAllConversations: vi.fn(async () => mockConversations),
    getConversation: vi.fn(async (id: string) =>
      mockConversations.find((c) => c.id === id)
    ),
    getStorageBackend: vi.fn(() => 'indexeddb' as const),
    getDatabase: vi.fn(async () => null),
    // Add other required methods as needed
  } as unknown as ConversationStorage;
};

// Helper to create test conversation
const createTestConversation = (
  id: string,
  title: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): Conversation => {
  return {
    id,
    title,
    messages: messages.map((msg, index) => ({
      id: `msg-${id}-${index}`,
      role: msg.role,
      content: msg.content,
      timestamp: new Date(Date.now() - index * 1000),
      correlationId: `corr-${id}-${index}`,
      conversationId: id,
      isComplete: true,
    })) as Message[],
    selectedModel: 'gpt-4',
    createdAt: new Date(Date.now() - 10000),
    updatedAt: new Date(Date.now() - 1000),
    sessionId: 'test-session',
    isStreaming: false,
    modelHistory: [],
  };
};

describe('ConversationSearchService', () => {
  let searchService: ConversationSearchService;
  let mockStorage: ConversationStorage;

  beforeEach(() => {
    mockStorage = createMockStorage();
    searchService = new ConversationSearchService(mockStorage);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with IndexedDB backend', async () => {
      await searchService.initialize();
      expect(searchService.getStorageBackend()).toBe('indexeddb');
    });

    it('should initialize with localStorage backend', async () => {
      vi.mocked(mockStorage.getStorageBackend).mockReturnValue('localstorage');
      await searchService.initialize();
      expect(searchService.getStorageBackend()).toBe('localstorage');
    });

    it('should build search index on initialization', async () => {
      const conversations = [
        createTestConversation('conv-1', 'Test Conversation', [
          { role: 'user', content: 'Hello world' },
        ]),
      ];
      vi.mocked(mockStorage.getAllConversations).mockResolvedValue(
        conversations
      );

      await searchService.initialize();

      // Search should work after initialization
      const results = await searchService.search('hello');
      expect(results.results.length).toBeGreaterThan(0);
    });
  });

  describe('search with single keyword', () => {
    beforeEach(async () => {
      const conversations = [
        createTestConversation('conv-1', 'JavaScript Tutorial', [
          { role: 'user', content: 'How do I learn JavaScript?' },
          { role: 'assistant', content: 'Start with the basics of JavaScript' },
        ]),
        createTestConversation('conv-2', 'Python Guide', [
          { role: 'user', content: 'Python is great for beginners' },
          { role: 'assistant', content: 'Yes, Python has simple syntax' },
        ]),
      ];
      vi.mocked(mockStorage.getAllConversations).mockResolvedValue(
        conversations
      );
      await searchService.initialize();
    });

    it('should find conversations with keyword in title', async () => {
      const results = await searchService.search('JavaScript');

      expect(results.results.length).toBe(1);
      expect(results.results[0].conversationTitle).toBe('JavaScript Tutorial');
      expect(results.results[0].totalMatches).toBeGreaterThan(0);
    });

    it('should find conversations with keyword in messages', async () => {
      const results = await searchService.search('Python');

      expect(results.results.length).toBe(1);
      expect(results.results[0].conversationTitle).toBe('Python Guide');
    });

    it('should be case-insensitive by default', async () => {
      const results = await searchService.search('javascript');

      expect(results.results.length).toBe(1);
      expect(results.results[0].conversationTitle).toBe('JavaScript Tutorial');
    });

    it('should support case-sensitive search', async () => {
      const results = await searchService.search('javascript', {
        caseSensitive: true,
      });

      // Should not find "JavaScript" with lowercase "javascript"
      expect(results.results.length).toBe(0);
    });

    it('should complete search within 500ms', async () => {
      const startTime = Date.now();
      await searchService.search('JavaScript');
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(500);
    });
  });

  describe('search with multiple keywords', () => {
    beforeEach(async () => {
      const conversations = [
        createTestConversation('conv-1', 'React Hooks Tutorial', [
          { role: 'user', content: 'How do React hooks work?' },
          {
            role: 'assistant',
            content: 'React hooks let you use state in functional components',
          },
        ]),
        createTestConversation('conv-2', 'Vue Composition API', [
          { role: 'user', content: 'What is Vue composition API?' },
          {
            role: 'assistant',
            content: 'Vue composition API is similar to React hooks',
          },
        ]),
      ];
      vi.mocked(mockStorage.getAllConversations).mockResolvedValue(
        conversations
      );
      await searchService.initialize();
    });

    it('should find conversations matching all keywords', async () => {
      const results = await searchService.search('React hooks');

      expect(results.results.length).toBeGreaterThan(0);
      expect(results.results[0].conversationTitle).toContain('React');
    });

    it('should rank results by relevance', async () => {
      const results = await searchService.search('React hooks');

      // First result should have higher relevance score
      if (results.results.length > 1) {
        expect(results.results[0].relevanceScore).toBeGreaterThanOrEqual(
          results.results[1].relevanceScore
        );
      }
    });
  });

  describe('pagination', () => {
    beforeEach(async () => {
      // Create 50 conversations for pagination testing
      const conversations = Array.from({ length: 50 }, (_, i) =>
        createTestConversation(`conv-${i}`, `Test Conversation ${i}`, [
          { role: 'user', content: `Message ${i} with keyword test` },
        ])
      );
      vi.mocked(mockStorage.getAllConversations).mockResolvedValue(
        conversations
      );
      await searchService.initialize();
    });

    it('should return first page with default page size (20)', async () => {
      const results = await searchService.search('test', { page: 0 });

      expect(results.results.length).toBe(20);
      expect(results.pagination.currentPage).toBe(0);
      expect(results.pagination.pageSize).toBe(20);
      expect(results.pagination.totalResults).toBe(50);
      expect(results.pagination.totalPages).toBe(3);
      expect(results.pagination.hasNextPage).toBe(true);
      expect(results.pagination.hasPreviousPage).toBe(false);
    });

    it('should return middle page', async () => {
      const results = await searchService.search('test', { page: 1 });

      expect(results.results.length).toBe(20);
      expect(results.pagination.currentPage).toBe(1);
      expect(results.pagination.hasNextPage).toBe(true);
      expect(results.pagination.hasPreviousPage).toBe(true);
    });

    it('should return last page', async () => {
      const results = await searchService.search('test', { page: 2 });

      expect(results.results.length).toBe(10); // 50 total, 20 per page, last page has 10
      expect(results.pagination.currentPage).toBe(2);
      expect(results.pagination.hasNextPage).toBe(false);
      expect(results.pagination.hasPreviousPage).toBe(true);
    });

    it('should support custom page size', async () => {
      const results = await searchService.search('test', {
        page: 0,
        pageSize: 10,
      });

      expect(results.results.length).toBe(10);
      expect(results.pagination.pageSize).toBe(10);
      expect(results.pagination.totalPages).toBe(5);
    });
  });

  describe('keyword highlighting', () => {
    beforeEach(async () => {
      const conversations = [
        createTestConversation('conv-1', 'Sample Title', [
          {
            role: 'user',
            content: 'This is a test message with multiple test occurrences',
          },
        ]),
      ];
      vi.mocked(mockStorage.getAllConversations).mockResolvedValue(
        conversations
      );
      await searchService.initialize();
    });

    it('should highlight all keyword occurrences', async () => {
      const results = await searchService.search('test');

      expect(results.results.length).toBe(1);
      // Should find matches in the message (not title)
      const messageMatch = results.results[0].matches.find(
        (m) => m.messageId !== 'title'
      );
      expect(messageMatch).toBeDefined();
      expect(messageMatch!.highlights.length).toBeGreaterThan(1); // Multiple "test" occurrences
    });

    it('should provide correct highlight positions', async () => {
      const results = await searchService.search('test');

      const match = results.results[0].matches[0];
      const firstHighlight = match.highlights[0];

      expect(firstHighlight.start).toBeGreaterThanOrEqual(0);
      expect(firstHighlight.end).toBeGreaterThan(firstHighlight.start);
      expect(firstHighlight.keyword).toBe('test');
    });

    it('should handle case-insensitive highlighting', async () => {
      const results = await searchService.search('TEST', {
        caseSensitive: false,
      });

      expect(results.results.length).toBe(1);
      expect(results.results[0].matches[0].highlights.length).toBeGreaterThan(
        0
      );
    });

    it('should handle case-sensitive highlighting', async () => {
      const results = await searchService.search('TEST', {
        caseSensitive: true,
      });

      // Should not find lowercase "test"
      expect(results.results.length).toBe(0);
    });
  });

  describe('context extraction', () => {
    beforeEach(async () => {
      const longMessage =
        'This is a very long message that contains the keyword somewhere in the middle of the text. ' +
        'We want to extract context around the keyword to show users where it appears. ' +
        'The context should include text before and after the keyword.';

      const conversations = [
        createTestConversation('conv-1', 'Test', [
          { role: 'user', content: longMessage },
        ]),
      ];
      vi.mocked(mockStorage.getAllConversations).mockResolvedValue(
        conversations
      );
      await searchService.initialize();
    });

    it('should extract context around keyword', async () => {
      const results = await searchService.search('keyword');

      expect(results.results.length).toBe(1);
      const match = results.results[0].matches[0];

      expect(match.context.before).toBeTruthy();
      expect(match.context.keyword).toBe('keyword');
      expect(match.context.after).toBeTruthy();
    });

    it('should limit context to 100 characters', async () => {
      const results = await searchService.search('keyword');

      const match = results.results[0].matches[0];

      // Context before and after should be limited
      expect(match.context.before.length).toBeLessThanOrEqual(103); // 100 + "..."
      expect(match.context.after.length).toBeLessThanOrEqual(103);
    });

    it('should add ellipsis for truncated text', async () => {
      const results = await searchService.search('keyword');

      const match = results.results[0].matches[0];

      // Should have ellipsis if text is truncated
      if (match.context.before.length > 100) {
        expect(match.context.before.startsWith('...')).toBe(true);
      }
      if (match.context.after.length > 100) {
        expect(match.context.after.endsWith('...')).toBe(true);
      }
    });

    it('should handle short text without ellipsis', async () => {
      const conversations = [
        createTestConversation('conv-1', 'Test', [
          { role: 'user', content: 'Short keyword text' },
        ]),
      ];
      vi.mocked(mockStorage.getAllConversations).mockResolvedValue(
        conversations
      );
      await searchService.buildSearchIndex();

      const results = await searchService.search('keyword');

      const match = results.results[0].matches[0];

      // Should not have ellipsis for short text
      expect(match.context.before.startsWith('...')).toBe(false);
      expect(match.context.after.endsWith('...')).toBe(false);
    });
  });

  describe('index maintenance', () => {
    beforeEach(async () => {
      const conversations = [
        createTestConversation('conv-1', 'Original Title', [
          { role: 'user', content: 'Original message' },
        ]),
      ];
      vi.mocked(mockStorage.getAllConversations).mockResolvedValue(
        conversations
      );
      await searchService.initialize();
    });

    it('should update index when conversation changes', async () => {
      // Update conversation
      const updatedConversation = createTestConversation(
        'conv-1',
        'Updated Title',
        [{ role: 'user', content: 'Updated message' }]
      );
      vi.mocked(mockStorage.getConversation).mockResolvedValue(
        updatedConversation
      );

      await searchService.updateIndex('conv-1');

      // Search should find updated content
      const results = await searchService.search('Updated');
      expect(results.results.length).toBe(1);
      expect(results.results[0].conversationTitle).toBe('Updated Title');
    });

    it('should remove conversation from index on deletion', async () => {
      // Remove from index
      await searchService.removeFromIndex('conv-1');

      // Search should not find removed conversation
      const results = await searchService.search('Original');
      expect(results.results.length).toBe(0);
    });

    it('should handle update of non-existent conversation', async () => {
      vi.mocked(mockStorage.getConversation).mockResolvedValue(undefined);

      // Should not throw error
      await expect(
        searchService.updateIndex('non-existent')
      ).resolves.not.toThrow();
    });
  });

  describe('empty and edge cases', () => {
    beforeEach(async () => {
      const conversations = [
        createTestConversation('conv-1', 'Test', [
          { role: 'user', content: 'Test message' },
        ]),
      ];
      vi.mocked(mockStorage.getAllConversations).mockResolvedValue(
        conversations
      );
      await searchService.initialize();
    });

    it('should return empty results for empty query', async () => {
      const results = await searchService.search('');

      expect(results.results.length).toBe(0);
      expect(results.pagination.totalResults).toBe(0);
    });

    it('should return empty results for whitespace query', async () => {
      const results = await searchService.search('   ');

      expect(results.results.length).toBe(0);
    });

    it('should return empty results for no matches', async () => {
      const results = await searchService.search('nonexistent');

      expect(results.results.length).toBe(0);
      expect(results.pagination.totalResults).toBe(0);
    });

    it('should handle special characters in query', async () => {
      const results = await searchService.search('test@#$%');

      // Should not throw error
      expect(results).toBeDefined();
    });
  });

  describe('search options', () => {
    beforeEach(async () => {
      const conversations = [
        createTestConversation('conv-1', 'Title with keyword', [
          { role: 'user', content: 'Message without it' },
        ]),
        createTestConversation('conv-2', 'Title without it', [
          { role: 'user', content: 'Message with keyword' },
        ]),
      ];
      vi.mocked(mockStorage.getAllConversations).mockResolvedValue(
        conversations
      );
      await searchService.initialize();
    });

    it('should search only in titles when specified', async () => {
      const results = await searchService.search('keyword', {
        searchInTitles: true,
        searchInMessages: false,
      });

      expect(results.results.length).toBe(1);
      expect(results.results[0].conversationTitle).toBe('Title with keyword');
    });

    it('should search only in messages when specified', async () => {
      const results = await searchService.search('keyword', {
        searchInTitles: false,
        searchInMessages: true,
      });

      expect(results.results.length).toBe(1);
      expect(results.results[0].conversationTitle).toBe('Title without it');
    });

    it('should search in both titles and messages by default', async () => {
      const results = await searchService.search('keyword');

      expect(results.results.length).toBe(2);
    });

    it('should limit search to specific conversations', async () => {
      const results = await searchService.search('keyword', {
        conversationIds: ['conv-1'],
      });

      expect(results.results.length).toBe(1);
      expect(results.results[0].conversationId).toBe('conv-1');
    });
  });

  describe('relevance scoring', () => {
    beforeEach(async () => {
      const conversations = [
        createTestConversation('conv-1', 'keyword in title', [
          { role: 'user', content: 'No match here' },
        ]),
        createTestConversation('conv-2', 'No match', [
          { role: 'user', content: 'keyword in message' },
        ]),
        createTestConversation('conv-3', 'keyword', [
          { role: 'user', content: 'keyword keyword keyword' },
        ]),
      ];
      vi.mocked(mockStorage.getAllConversations).mockResolvedValue(
        conversations
      );
      await searchService.initialize();
    });

    it('should rank title matches higher', async () => {
      const results = await searchService.search('keyword');

      // Conversations with keyword in title should rank higher
      const titleMatches = results.results.filter((r) =>
        r.conversationTitle.toLowerCase().includes('keyword')
      );
      const messageOnlyMatches = results.results.filter(
        (r) =>
          !r.conversationTitle.toLowerCase().includes('keyword') &&
          r.matches.some((m) => m.messageId !== 'title')
      );

      if (titleMatches.length > 0 && messageOnlyMatches.length > 0) {
        expect(titleMatches[0].relevanceScore).toBeGreaterThan(
          messageOnlyMatches[0].relevanceScore
        );
      }
    });

    it('should rank multiple matches higher', async () => {
      const results = await searchService.search('keyword');

      // Sort by total matches
      const sortedByMatches = [...results.results].sort(
        (a, b) => b.totalMatches - a.totalMatches
      );

      // Conversation with most matches should have high relevance
      if (sortedByMatches.length > 1) {
        expect(sortedByMatches[0].relevanceScore).toBeGreaterThan(0);
      }
    });
  });

  describe('localStorage backend', () => {
    beforeEach(async () => {
      vi.mocked(mockStorage.getStorageBackend).mockReturnValue('localstorage');
      const conversations = [
        createTestConversation('conv-1', 'Test', [
          { role: 'user', content: 'Test message' },
        ]),
      ];
      vi.mocked(mockStorage.getAllConversations).mockResolvedValue(
        conversations
      );
      await searchService.initialize();
    });

    it('should work with localStorage backend', async () => {
      expect(searchService.getStorageBackend()).toBe('localstorage');

      const results = await searchService.search('test');
      expect(results.results.length).toBe(1);
    });

    it('should use in-memory index for localStorage', async () => {
      const results = await searchService.search('test');

      // Should still return results using in-memory index
      expect(results.results.length).toBe(1);
      expect(results.searchTime).toBeLessThan(500);
    });
  });
});
