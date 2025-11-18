/**
 * Integration tests for AppContext persistence features
 * 
 * Tests persistence status updates, search state management, cross-tab sync integration,
 * conflict resolution, and cleanup on unmount.
 * 
 * Requirements: Code Quality, 1.1, 2.1, 4.1, 4.2, 4.3, 8.1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AppProvider, useAppContext, useConversations } from '../contexts/AppContext.js';
import type { Conversation } from '../types/index.js';
import { getCrossTabSyncService } from '../services/cross-tab-sync.js';
import type { SyncEvent } from '../services/cross-tab-sync.js';

// Mock services
vi.mock('../services/storage.js', () => ({
  ConversationStorage: {
    getInstance: vi.fn(() => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      getAllConversations: vi.fn().mockResolvedValue([]),
      getConversation: vi.fn().mockResolvedValue(null),
      storeConversation: vi.fn().mockResolvedValue(undefined),
      deleteConversation: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

vi.mock('../services/cross-tab-sync.js', () => {
  const listeners = new Map<string, Set<(event: SyncEvent) => void>>();
  
  return {
    getCrossTabSyncService: vi.fn(() => ({
      initialize: vi.fn(),
      destroy: vi.fn(),
      subscribe: vi.fn((eventType: string, listener: (event: SyncEvent) => void) => {
        if (!listeners.has(eventType)) {
          listeners.set(eventType, new Set());
        }
        listeners.get(eventType)?.add(listener);
        
        return () => {
          listeners.get(eventType)?.delete(listener);
        };
      }),
      broadcastUpdate: vi.fn(),
      broadcastDeletion: vi.fn(),
      broadcastCreation: vi.fn(),
      getTabId: vi.fn(() => 'test-tab-id'),
      // Helper to trigger events for testing
      _triggerEvent: (event: SyncEvent) => {
        const eventListeners = listeners.get(event.type);
        if (eventListeners) {
          eventListeners.forEach(listener => listener(event));
        }
      },
    })),
  };
});

vi.mock('../contexts/SessionContext.js', () => ({
  useSessionContext: vi.fn(() => ({
    session: {
      sessionId: 'test-session',
      preferences: {
        theme: 'auto',
        language: 'en',
        selectedModel: 'gpt-4',
      },
      createdAt: new Date(),
    },
    updatePreferences: vi.fn(),
  })),
  SessionProvider: ({ children }: { children: ReactNode }) => children,
}));

describe('AppContext Persistence Integration', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppProvider>{children}</AppProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear localStorage
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Persistence Status Updates', () => {
    it('should track persistence status in conversation state', () => {
      const { result } = renderHook(() => useConversations(), { wrapper });

      const testConversation: Conversation = {
        id: 'test-conv-1',
        title: 'Test Conversation',
        messages: [],
        selectedModel: 'gpt-4',
        createdAt: new Date(),
        updatedAt: new Date(),
        sessionId: 'test-session',
        isStreaming: false,
        modelHistory: [],
        persistenceStatus: 'synced',
        lastSyncedAt: new Date(),
        syncVersion: 1,
        isDirty: false,
      };

      act(() => {
        result.current.addConversation(testConversation);
      });

      expect(result.current.conversationsList).toHaveLength(1);
      expect(result.current.conversationsList[0].persistenceStatus).toBe('synced');
      expect(result.current.conversationsList[0].lastSyncedAt).toBeDefined();
      expect(result.current.conversationsList[0].syncVersion).toBe(1);
      expect(result.current.conversationsList[0].isDirty).toBe(false);
    });

    it('should update persistence status when conversation is modified', () => {
      const { result } = renderHook(() => useConversations(), { wrapper });

      const testConversation: Conversation = {
        id: 'test-conv-1',
        title: 'Test Conversation',
        messages: [],
        selectedModel: 'gpt-4',
        createdAt: new Date(),
        updatedAt: new Date(),
        sessionId: 'test-session',
        isStreaming: false,
        modelHistory: [],
        persistenceStatus: 'synced',
        syncVersion: 1,
      };

      act(() => {
        result.current.addConversation(testConversation);
      });

      act(() => {
        result.current.updateConversation('test-conv-1', {
          title: 'Updated Title',
          persistenceStatus: 'pending',
          isDirty: true,
        });
      });

      const updatedConv = result.current.conversationsList[0];
      expect(updatedConv.title).toBe('Updated Title');
      expect(updatedConv.persistenceStatus).toBe('pending');
      expect(updatedConv.isDirty).toBe(true);
    });
  });

  describe('Search State Management', () => {
    it('should initialize with empty search state', () => {
      const { result } = renderHook(() => useAppContext(), { wrapper });

      expect(result.current.state.conversations.searchQuery).toBe('');
      expect(result.current.state.conversations.searchResults).toEqual([]);
      expect(result.current.state.conversations.isSearching).toBe(false);
      expect(result.current.state.conversations.searchError).toBeUndefined();
    });

    it('should update search query and set isSearching flag', () => {
      const { result } = renderHook(() => useAppContext(), { wrapper });

      act(() => {
        result.current.dispatch({
          type: 'SET_SEARCH_QUERY',
          payload: 'test query',
        });
      });

      expect(result.current.state.conversations.searchQuery).toBe('test query');
      expect(result.current.state.conversations.isSearching).toBe(true);
    });

    it('should clear isSearching flag when query is empty', () => {
      const { result } = renderHook(() => useAppContext(), { wrapper });

      act(() => {
        result.current.dispatch({
          type: 'SET_SEARCH_QUERY',
          payload: 'test query',
        });
      });

      expect(result.current.state.conversations.isSearching).toBe(true);

      act(() => {
        result.current.dispatch({
          type: 'SET_SEARCH_QUERY',
          payload: '',
        });
      });

      expect(result.current.state.conversations.isSearching).toBe(false);
    });

    it('should update search results', () => {
      const { result } = renderHook(() => useAppContext(), { wrapper });

      const searchResults: Conversation[] = [
        {
          id: 'result-1',
          title: 'Search Result 1',
          messages: [],
          selectedModel: 'gpt-4',
          createdAt: new Date(),
          updatedAt: new Date(),
          sessionId: 'test-session',
          isStreaming: false,
          modelHistory: [],
        },
      ];

      act(() => {
        result.current.dispatch({
          type: 'SET_SEARCH_RESULTS',
          payload: searchResults,
        });
      });

      expect(result.current.state.conversations.searchResults).toEqual(searchResults);
    });

    it('should handle search errors', () => {
      const { result } = renderHook(() => useAppContext(), { wrapper });

      act(() => {
        result.current.dispatch({
          type: 'SET_SEARCH_ERROR',
          payload: 'Search failed',
        });
      });

      expect(result.current.state.conversations.searchError).toBe('Search failed');

      act(() => {
        result.current.dispatch({
          type: 'SET_SEARCH_ERROR',
          payload: null,
        });
      });

      expect(result.current.state.conversations.searchError).toBeUndefined();
    });
  });

  describe('Cross-Tab Sync Integration', () => {
    it('should initialize cross-tab sync service on mount', () => {
      const syncService = getCrossTabSyncService();
      
      renderHook(() => useAppContext(), { wrapper });

      expect(syncService.initialize).toHaveBeenCalled();
    });

    it('should subscribe to sync events on mount', () => {
      const syncService = getCrossTabSyncService();
      
      renderHook(() => useAppContext(), { wrapper });

      expect(syncService.subscribe).toHaveBeenCalledWith('update', expect.any(Function));
      expect(syncService.subscribe).toHaveBeenCalledWith('delete', expect.any(Function));
      expect(syncService.subscribe).toHaveBeenCalledWith('create', expect.any(Function));
    });

    it('should broadcast updates to other tabs', () => {
      const syncService = getCrossTabSyncService();
      const { result } = renderHook(() => useConversations(), { wrapper });

      const testConversation: Conversation = {
        id: 'test-conv-1',
        title: 'Test Conversation',
        messages: [],
        selectedModel: 'gpt-4',
        createdAt: new Date(),
        updatedAt: new Date(),
        sessionId: 'test-session',
        isStreaming: false,
        modelHistory: [],
      };

      act(() => {
        result.current.addConversation(testConversation);
      });

      expect(syncService.broadcastCreation).toHaveBeenCalledWith(
        'test-conv-1',
        expect.objectContaining({ id: 'test-conv-1' })
      );
    });

    it('should broadcast deletions to other tabs', () => {
      const syncService = getCrossTabSyncService();
      const { result } = renderHook(() => useConversations(), { wrapper });

      const testConversation: Conversation = {
        id: 'test-conv-1',
        title: 'Test Conversation',
        messages: [],
        selectedModel: 'gpt-4',
        createdAt: new Date(),
        updatedAt: new Date(),
        sessionId: 'test-session',
        isStreaming: false,
        modelHistory: [],
      };

      act(() => {
        result.current.addConversation(testConversation);
      });

      act(() => {
        result.current.deleteConversation('test-conv-1');
      });

      expect(syncService.broadcastDeletion).toHaveBeenCalledWith('test-conv-1');
    });

    it('should receive and apply remote updates', async () => {
      const syncService = getCrossTabSyncService() as any;
      const { result } = renderHook(() => useConversations(), { wrapper });

      const testConversation: Conversation = {
        id: 'test-conv-1',
        title: 'Original Title',
        messages: [],
        selectedModel: 'gpt-4',
        createdAt: new Date(),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
        sessionId: 'test-session',
        isStreaming: false,
        modelHistory: [],
      };

      act(() => {
        result.current.addConversation(testConversation);
      });

      // Simulate remote update event with newer timestamp
      const remoteUpdateEvent: SyncEvent = {
        type: 'update',
        conversationId: 'test-conv-1',
        data: { title: 'Updated by Remote Tab' },
        timestamp: new Date('2024-01-01T00:01:00Z').getTime(),
        sourceTabId: 'remote-tab-id',
      };

      await act(async () => {
        syncService._triggerEvent(remoteUpdateEvent);
        await waitFor(() => {
          const conv = result.current.conversationsList.find(c => c.id === 'test-conv-1');
          expect(conv?.title).toBe('Updated by Remote Tab');
        });
      });
    });

    it('should receive and apply remote deletions', async () => {
      const syncService = getCrossTabSyncService() as any;
      const { result } = renderHook(() => useConversations(), { wrapper });

      const testConversation: Conversation = {
        id: 'test-conv-1',
        title: 'Test Conversation',
        messages: [],
        selectedModel: 'gpt-4',
        createdAt: new Date(),
        updatedAt: new Date(),
        sessionId: 'test-session',
        isStreaming: false,
        modelHistory: [],
      };

      act(() => {
        result.current.addConversation(testConversation);
      });

      expect(result.current.conversationsList).toHaveLength(1);

      // Simulate remote delete event
      const remoteDeleteEvent: SyncEvent = {
        type: 'delete',
        conversationId: 'test-conv-1',
        timestamp: Date.now(),
        sourceTabId: 'remote-tab-id',
      };

      await act(async () => {
        syncService._triggerEvent(remoteDeleteEvent);
        await waitFor(() => {
          expect(result.current.conversationsList).toHaveLength(0);
        });
      });
    });
  });

  describe('Conflict Resolution', () => {
    it('should apply remote update when remote timestamp is newer', async () => {
      const syncService = getCrossTabSyncService() as any;
      const { result } = renderHook(() => useConversations(), { wrapper });

      const oldDate = new Date('2024-01-01T00:00:00Z');
      const newDate = new Date('2024-01-01T00:01:00Z');

      const testConversation: Conversation = {
        id: 'test-conv-1',
        title: 'Local Title',
        messages: [],
        selectedModel: 'gpt-4',
        createdAt: oldDate,
        updatedAt: oldDate,
        sessionId: 'test-session',
        isStreaming: false,
        modelHistory: [],
      };

      act(() => {
        result.current.addConversation(testConversation);
      });

      // Remote update with newer timestamp
      const remoteUpdateEvent: SyncEvent = {
        type: 'update',
        conversationId: 'test-conv-1',
        data: { title: 'Remote Title (Newer)' },
        timestamp: newDate.getTime(),
        sourceTabId: 'remote-tab-id',
      };

      await act(async () => {
        syncService._triggerEvent(remoteUpdateEvent);
        await waitFor(() => {
          const conv = result.current.conversationsList.find(c => c.id === 'test-conv-1');
          expect(conv?.title).toBe('Remote Title (Newer)');
        });
      });
    });

    it('should ignore remote update when local timestamp is newer', async () => {
      const syncService = getCrossTabSyncService() as any;
      const { result } = renderHook(() => useConversations(), { wrapper });

      const oldDate = new Date('2024-01-01T00:00:00Z');
      const newDate = new Date('2024-01-01T00:01:00Z');

      const testConversation: Conversation = {
        id: 'test-conv-1',
        title: 'Local Title (Newer)',
        messages: [],
        selectedModel: 'gpt-4',
        createdAt: newDate,
        updatedAt: newDate,
        sessionId: 'test-session',
        isStreaming: false,
        modelHistory: [],
      };

      act(() => {
        result.current.addConversation(testConversation);
      });

      // Remote update with older timestamp
      const remoteUpdateEvent: SyncEvent = {
        type: 'update',
        conversationId: 'test-conv-1',
        data: { title: 'Remote Title (Older)' },
        timestamp: oldDate.getTime(),
        sourceTabId: 'remote-tab-id',
      };

      await act(async () => {
        syncService._triggerEvent(remoteUpdateEvent);
        // Wait a bit to ensure event is processed
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      const conv = result.current.conversationsList.find(c => c.id === 'test-conv-1');
      expect(conv?.title).toBe('Local Title (Newer)');
    });
  });

  describe('Cleanup on Unmount', () => {
    it('should unsubscribe from sync events on unmount', () => {
      const syncService = getCrossTabSyncService();
      const unsubscribeMock = vi.fn();
      
      vi.mocked(syncService.subscribe).mockReturnValue(unsubscribeMock);

      const { unmount } = renderHook(() => useAppContext(), { wrapper });

      unmount();

      // Should call unsubscribe for each event type (update, delete, create)
      expect(unsubscribeMock).toHaveBeenCalledTimes(3);
    });

    it('should destroy sync service on unmount', () => {
      const syncService = getCrossTabSyncService();

      const { unmount } = renderHook(() => useAppContext(), { wrapper });

      unmount();

      expect(syncService.destroy).toHaveBeenCalled();
    });
  });
});
