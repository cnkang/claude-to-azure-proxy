// @vitest-environment happy-dom
/**
 * Lightweight integration checks for AppContext persistence
 *
 * Focuses on:
 * - Persistence status tracking
 * - Search state updates
 * - Cross-tab sync wiring (subscribe/broadcast, apply remote updates/deletes)
 * - Cleanup on unmount
 *
 * Heavy scenarios (full persistence flows) are intentionally excluded to keep memory low.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AppProvider, useAppContext, useConversations } from '../contexts/AppContext.js';
import type { Conversation } from '../types/index.js';
import { getCrossTabSyncService } from '../services/cross-tab-sync.js';
import type { SyncEvent } from '../services/cross-tab-sync.js';

// Mock storage to avoid real persistence
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

// Mock cross-tab sync with resettable listeners
vi.mock('../services/cross-tab-sync.js', () => {
  const listenerMap: Record<string, Set<(event: SyncEvent) => void>> = {
    update: new Set(),
    delete: new Set(),
    create: new Set(),
  };

  const resetListeners = (): void => {
    Object.values(listenerMap).forEach((set) => set.clear());
  };

  const service = {
    initialize: vi.fn(),
    destroy: vi.fn(),
    subscribe: vi.fn(
      (eventType: string, listener: (event: SyncEvent) => void) => {
        (listenerMap[eventType] ??= new Set()).add(listener);
        return () => listenerMap[eventType]?.delete(listener);
      }
    ),
    broadcastUpdate: vi.fn(),
    broadcastDeletion: vi.fn(),
    broadcastCreation: vi.fn(),
    getTabId: vi.fn(() => 'test-tab-id'),
    _triggerEvent: (event: SyncEvent) => {
      listenerMap[event.type]?.forEach((listener) => listener(event));
    },
    __resetListeners: resetListeners,
  };

  return {
    getCrossTabSyncService: vi.fn(() => service),
  };
});

// Mock session context to keep provider lightweight
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

const wrapper = ({ children }: { children: ReactNode }) => (
  <AppProvider>{children}</AppProvider>
);

const createMemoryStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  };
};

const createConversation = (
  overrides: Partial<Conversation> = {}
): Conversation => ({
  id: 'conv-1',
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
  isDirty: false,
  ...overrides,
});

const runAppContextPersistence =
  process.env.RUN_APP_CONTEXT_PERSISTENCE === '1';

const maybeDescribe = runAppContextPersistence ? describe : describe.skip;

maybeDescribe('AppContext Persistence Integration (lightweight)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getCrossTabSyncService() as unknown as { __resetListeners?: () => void })
      .__resetListeners?.();
    // Provide stubbed storages for node environment
    (globalThis as any).localStorage ??= createMemoryStorage();
    (globalThis as any).sessionStorage ??= createMemoryStorage();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('tracks persistence status when added and updated', () => {
    const { result } = renderHook(() => useConversations(), { wrapper });

    act(() => {
      result.current.addConversation(createConversation());
    });

    const initial = result.current.conversationsList[0];
    expect(initial.persistenceStatus).toBe('synced');
    expect(initial.isDirty).toBe(false);

    act(() => {
      result.current.updateConversation('conv-1', {
        persistenceStatus: 'pending',
        isDirty: true,
      });
    });

    const updated = result.current.conversationsList[0];
    expect(updated.persistenceStatus).toBe('pending');
    expect(updated.isDirty).toBe(true);
  });

  it('initializes and updates search state', () => {
    const { result } = renderHook(() => useAppContext(), { wrapper });

    expect(result.current.state.conversations.searchQuery).toBe('');
    expect(result.current.state.conversations.isSearching).toBe(false);

    act(() => {
      result.current.dispatch({
        type: 'SET_SEARCH_QUERY',
        payload: 'test query',
      });
    });

    expect(result.current.state.conversations.searchQuery).toBe('test query');
    expect(result.current.state.conversations.isSearching).toBe(true);

    act(() => {
      result.current.dispatch({
        type: 'SET_SEARCH_RESULTS',
        payload: [createConversation({ id: 'result-1', title: 'Result 1' })],
      });
    });
    expect(result.current.state.conversations.searchResults).toHaveLength(1);
  });

  it('broadcasts creation and deletion events', () => {
    const syncService = getCrossTabSyncService();
    const { result } = renderHook(() => useConversations(), { wrapper });

    act(() => {
      result.current.addConversation(createConversation());
    });
    expect(syncService.broadcastCreation).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({ id: 'conv-1' })
    );

    act(() => {
      result.current.deleteConversation('conv-1');
    });
    expect(syncService.broadcastDeletion).toHaveBeenCalledWith('conv-1');
  });

  it('applies remote update events', () => {
    const syncService = getCrossTabSyncService() as any;
    const { result } = renderHook(() => useConversations(), { wrapper });

    act(() => {
      result.current.addConversation(createConversation());
    });

    const remoteUpdate: SyncEvent = {
      type: 'update',
      conversationId: 'conv-1',
      data: { title: 'Remote Title' },
      timestamp: Date.now(),
      sourceTabId: 'remote',
    };

    act(() => {
      syncService._triggerEvent(remoteUpdate);
    });

    const conv = result.current.conversationsList.find(
      (c: Conversation) => c.id === 'conv-1'
    );
    expect(conv?.title).toBe('Remote Title');
  });

  it('applies remote delete events', () => {
    const syncService = getCrossTabSyncService() as any;
    const { result } = renderHook(() => useConversations(), { wrapper });

    act(() => {
      result.current.addConversation(createConversation());
    });
    expect(result.current.conversationsList).toHaveLength(1);

    const remoteDelete: SyncEvent = {
      type: 'delete',
      conversationId: 'conv-1',
      timestamp: Date.now(),
      sourceTabId: 'remote',
    };

    act(() => {
      syncService._triggerEvent(remoteDelete);
    });

    expect(result.current.conversationsList).toHaveLength(0);
  });

  it('cleans up subscriptions on unmount', () => {
    const syncService = getCrossTabSyncService();
    const unsubscribe = vi.fn();
    vi.mocked(syncService.subscribe).mockReturnValue(unsubscribe);

    const { unmount } = renderHook(() => useAppContext(), { wrapper });
    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(3);
    expect(syncService.destroy).toHaveBeenCalled();
  });
});
