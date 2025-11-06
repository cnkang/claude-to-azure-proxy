/**
 * Conversation Management Hook
 *
 * Provides high-level conversation management operations backed by the
 * application context. Persists conversations through the shared storage
 * service (IndexedDB with localStorage fallback) while exposing filtering,
 * searching, and CRUD helpers used by the UI.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  DEFAULT_CONVERSATION_FILTERS,
  useAppContext,
} from '../contexts/AppContext.js';
import { getConversationStorage } from '../services/storage.js';
import { getSessionManager } from '../services/session.js';
import { frontendLogger } from '../utils/logger.js';
import type {
  Conversation,
  ConversationFilters,
  ContextUsage,
  Message,
} from '../types/index.js';

/**
 * Hook state returned alongside conversation data.
 */
interface ConversationManagementState {
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly filters: ConversationFilters;
  readonly searchResults: Conversation[];
  readonly isSearching: boolean;
}

/**
 * Return signature for the `useConversations` hook.
 */
export interface UseConversationsReturn {
  readonly conversations: Conversation[];
  readonly filteredConversations: Conversation[];
  readonly activeConversation: Conversation | null;
  readonly state: ConversationManagementState;
  readonly createConversation: (
    title?: string,
    modelId?: string
  ) => Promise<Conversation>;
  readonly updateConversation: (
    id: string,
    updates: Partial<Conversation>
  ) => Promise<void>;
  readonly deleteConversation: (id: string) => Promise<void>;
  readonly renameConversation: (id: string, newTitle: string) => Promise<void>;
  readonly setActiveConversation: (conversationId: string | null) => void;
  readonly setSearchQuery: (query: string) => void;
  readonly setFilters: (filters: Partial<ConversationFilters>) => void;
  readonly clearFilters: () => void;
  readonly clearSearch: () => void;
  readonly deleteMultipleConversations: (
    conversationIds: string[]
  ) => Promise<void>;
  readonly exportConversations: (conversationIds?: string[]) => Promise<string>;
}

interface ConversationSearchControls {
  readonly searchQuery: string;
  readonly searchResults: Conversation[];
  readonly isSearching: boolean;
  readonly setSearchQuery: (query: string) => void;
  readonly clearSearch: () => void;
}

interface ConversationOrganizationControls {
  readonly sortBy: ConversationFilters['sortBy'];
  readonly sortOrder: ConversationFilters['sortOrder'];
  readonly modelFilter: ConversationFilters['model'];
  readonly dateRangeFilter: ConversationFilters['dateRange'];
  readonly setSorting: (
    sortBy: ConversationFilters['sortBy'],
    sortOrder: ConversationFilters['sortOrder']
  ) => void;
  readonly setModelFilter: (model: string | undefined) => void;
  readonly setDateRangeFilter: (
    dateRange: ConversationFilters['dateRange']
  ) => void;
  readonly clearAllFilters: () => void;
}

const createDefaultContextUsage = (): ContextUsage => ({
  currentTokens: 0,
  maxTokens: 128000,
  warningThreshold: 80,
  canExtend: false,
  isExtended: false,
});

const createNewConversation = (
  sessionId: string,
  title?: string,
  modelId?: string
): Conversation => {
  const now = new Date();

  return {
    id: `conv_${uuidv4()}`,
    title: title?.trim().length ? title.trim() : now.toLocaleString(),
    selectedModel: modelId ?? 'gpt-4o',
    createdAt: now,
    updatedAt: now,
    sessionId,
    messages: [],
    isStreaming: false,
    modelHistory: [],
    contextUsage: createDefaultContextUsage(),
    compressionHistory: [],
  };
};

const normalizeMessage = (message: Message): Message => ({
  ...message,
  timestamp:
    message.timestamp instanceof Date
      ? message.timestamp
      : new Date(message.timestamp),
});

const normalizeConversation = (conversation: Conversation): Conversation => ({
  ...conversation,
  messages: conversation.messages.map(normalizeMessage),
  modelHistory: conversation.modelHistory ?? [],
  compressionHistory: conversation.compressionHistory ?? [],
  contextUsage: conversation.contextUsage ?? createDefaultContextUsage(),
});

const buildConversationMap = (
  conversations: Conversation[]
): Map<string, Conversation> => {
  const map = new Map<string, Conversation>();
  conversations.forEach((conversation) => {
    const normalized = normalizeConversation(conversation);
    map.set(normalized.id, normalized);
  });
  return map;
};

const serializeConversationForExport = (
  conversation: Conversation
): Record<string, unknown> => ({
  id: conversation.id,
  title: conversation.title,
  selectedModel: conversation.selectedModel,
  createdAt: conversation.createdAt.toISOString(),
  updatedAt: conversation.updatedAt.toISOString(),
  sessionId: conversation.sessionId,
  modelHistory: conversation.modelHistory,
  contextUsage: conversation.contextUsage,
  parentConversationId: conversation.parentConversationId,
  compressionHistory: conversation.compressionHistory,
  messages: conversation.messages.map((message) => ({
    ...message,
    timestamp: message.timestamp.toISOString(),
  })),
});

let hasHydratedConversations = false;
let lastHydrationError: string | null = null;

/**
 * Main conversation management hook implementation.
 */
export function useConversations(): UseConversationsReturn {
  const {
    state,
    dispatch,
    conversationsList,
    activeConversation,
    addConversation,
    updateConversation: updateConversationInContext,
    deleteConversation: deleteConversationInContext,
    setActiveConversation,
  } = useAppContext();

  const conversationState = state.conversations;
  const filters = conversationState.filters;

  const storageRef = useRef(getConversationStorage());
  const storageReadyRef = useRef(false);
  const sessionManagerRef = useRef(getSessionManager());

  const ensureStorageReady = useCallback(async (): Promise<void> => {
    if (storageReadyRef.current) {
      return;
    }
    await storageRef.current.initialize();
    storageReadyRef.current = true;
  }, []);

  const persistConversation = useCallback(
    async (conversation: Conversation): Promise<void> => {
      try {
        await ensureStorageReady();
        await storageRef.current.storeConversation(conversation);
      } catch (error) {
        storageReadyRef.current = false;
        frontendLogger.error('Failed to persist conversation', {
          metadata: { conversationId: conversation.id },
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    },
    [ensureStorageReady]
  );

  const removeConversation = useCallback(
    async (conversationId: string): Promise<void> => {
      try {
        await ensureStorageReady();
        await storageRef.current.deleteConversation(conversationId);
      } catch (error) {
        storageReadyRef.current = false;
        frontendLogger.error('Failed to delete conversation from storage', {
          metadata: { conversationId },
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    },
    [ensureStorageReady]
  );

  /**
   * Hydrate conversations from the storage service on first use.
   */
  useEffect(() => {
    if (hasHydratedConversations) {
      if (lastHydrationError !== null) {
        dispatch({
          type: 'SET_CONVERSATIONS_ERROR',
          payload: lastHydrationError,
        });
      }
      return;
    }

    let cancelled = false;

    const hydrate = async (): Promise<void> => {
      dispatch({ type: 'SET_CONVERSATIONS_LOADING', payload: true });

      try {
        await ensureStorageReady();

        const stored = await storageRef.current.getAllConversations();
        if (cancelled) {
          return;
        }

        if (stored.length > 0) {
          const map = buildConversationMap(stored);
          dispatch({ type: 'SET_CONVERSATIONS', payload: map });
        }

        dispatch({ type: 'SET_CONVERSATIONS_ERROR', payload: null });
        lastHydrationError = null;
      } catch (error) {
        const normalizedError =
          error instanceof Error
            ? error
            : new Error('Failed to load conversations');

        frontendLogger.error('Conversation hydration failed', {
          metadata: { operation: 'hydrateConversations' },
          error: normalizedError,
        });

        lastHydrationError = normalizedError.message;

        if (!cancelled) {
          dispatch({
            type: 'SET_CONVERSATIONS_ERROR',
            payload: normalizedError.message,
          });
        }
      } finally {
        if (!cancelled) {
          dispatch({ type: 'SET_CONVERSATIONS_LOADING', payload: false });
        }
        hasHydratedConversations = true;
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [dispatch, ensureStorageReady]);

  const updateFilters = useCallback(
    (updater: (current: ConversationFilters) => ConversationFilters): void => {
      const nextFilters = updater(conversationState.filters);
      dispatch({ type: 'SET_CONVERSATION_FILTERS', payload: nextFilters });
    },
    [conversationState.filters, dispatch]
  );

  const setSearchQuery = useCallback(
    (query: string): void => {
      updateFilters((current) => ({
        ...current,
        searchQuery: query,
      }));
    },
    [updateFilters]
  );

  const setFilters = useCallback(
    (partial: Partial<ConversationFilters>): void => {
      updateFilters((current) => ({
        ...current,
        ...partial,
      }));
    },
    [updateFilters]
  );

  const clearFilters = useCallback((): void => {
    updateFilters(() => ({ ...DEFAULT_CONVERSATION_FILTERS }));
  }, [updateFilters]);

  const clearSearch = useCallback((): void => {
    updateFilters((current) => ({
      ...current,
      searchQuery: '',
    }));
  }, [updateFilters]);

  const filteredConversations = useMemo(() => {
    let results = [...conversationsList];
    const { searchQuery, model, sortBy, sortOrder, dateRange } = filters;

    if (model) {
      results = results.filter(
        (conversation) => conversation.selectedModel === model
      );
    }

    const query = searchQuery.trim().toLowerCase();
    if (query.length > 0) {
      results = results.filter((conversation) => {
        if (conversation.title.toLowerCase().includes(query)) {
          return true;
        }

        return conversation.messages.some((message) =>
          message.content.toLowerCase().includes(query)
        );
      });
    }

    if (dateRange) {
      const start = dateRange.start.getTime();
      const end = dateRange.end.getTime();
      results = results.filter((conversation) => {
        const updated = conversation.updatedAt.getTime();
        return updated >= start && updated <= end;
      });
    }

    results.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'createdAt':
          comparison = a.createdAt.getTime() - b.createdAt.getTime();
          break;
        case 'title':
          comparison = a.title.localeCompare(b.title, undefined, {
            sensitivity: 'base',
          });
          break;
        case 'updatedAt':
        default:
          comparison = a.updatedAt.getTime() - b.updatedAt.getTime();
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return results;
  }, [conversationsList, filters]);

  const createConversationHandler = useCallback(
    async (title?: string, modelId?: string): Promise<Conversation> => {
      const sessionId = sessionManagerRef.current.getSessionId() ?? 'anonymous';
      const conversation = normalizeConversation(
        createNewConversation(sessionId, title, modelId)
      );

      addConversation(conversation);
      await persistConversation(conversation);

      return conversation;
    },
    [addConversation, persistConversation]
  );

  const updateConversationHandler = useCallback(
    async (
      conversationId: string,
      updates: Partial<Conversation>
    ): Promise<void> => {
      const existing = state.conversations.conversations.get(conversationId);
      if (!existing) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      const merged: Conversation = normalizeConversation({
        ...existing,
        ...updates,
        messages: updates.messages ?? existing.messages,
        modelHistory: updates.modelHistory ?? existing.modelHistory,
        compressionHistory:
          updates.compressionHistory ?? existing.compressionHistory,
        contextUsage:
          updates.contextUsage ??
          existing.contextUsage ??
          createDefaultContextUsage(),
        updatedAt: updates.updatedAt ?? new Date(),
      });

      updateConversationInContext(conversationId, updates);
      await persistConversation(merged);
    },
    [
      persistConversation,
      state.conversations.conversations,
      updateConversationInContext,
    ]
  );

  const renameConversationHandler = useCallback(
    async (conversationId: string, newTitle: string): Promise<void> => {
      const trimmed = newTitle.trim();
      if (trimmed.length === 0) {
        throw new Error('Conversation title cannot be empty');
      }

      await updateConversationHandler(conversationId, {
        title: trimmed,
      });
    },
    [updateConversationHandler]
  );

  const deleteConversationHandler = useCallback(
    async (conversationId: string): Promise<void> => {
      deleteConversationInContext(conversationId);
      await removeConversation(conversationId);
    },
    [deleteConversationInContext, removeConversation]
  );

  const deleteMultipleConversations = useCallback(
    async (conversationIds: string[]): Promise<void> => {
      await Promise.all(
        conversationIds.map(async (conversationId) => {
          await deleteConversationHandler(conversationId);
        })
      );
    },
    [deleteConversationHandler]
  );

  const exportConversations = useCallback(
    async (conversationIds?: string[]): Promise<string> => {
      const source =
        conversationIds && conversationIds.length > 0
          ? conversationsList.filter((conversation) =>
              conversationIds.includes(conversation.id)
            )
          : conversationsList;

      const payload = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        conversationCount: source.length,
        conversations: source.map(serializeConversationForExport),
      };

      return JSON.stringify(payload, null, 2);
    },
    [conversationsList]
  );

  const hookState = useMemo<ConversationManagementState>(
    () => ({
      isLoading: conversationState.isLoading,
      error: conversationState.error ?? lastHydrationError,
      filters,
      searchResults: filteredConversations,
      isSearching: filters.searchQuery.trim().length > 0,
    }),
    [
      conversationState.error,
      conversationState.isLoading,
      filteredConversations,
      filters,
    ]
  );

  return {
    conversations: conversationsList,
    filteredConversations,
    activeConversation,
    state: hookState,
    createConversation: createConversationHandler,
    updateConversation: updateConversationHandler,
    deleteConversation: deleteConversationHandler,
    renameConversation: renameConversationHandler,
    setActiveConversation,
    setSearchQuery,
    setFilters,
    clearFilters,
    clearSearch,
    deleteMultipleConversations,
    exportConversations,
  };
}

/**
 * Helper hook for conversation organization controls (sorting, filtering).
 */
export function useConversationOrganization(): ConversationOrganizationControls {
  const { state, setFilters, clearFilters } = useConversations();

  const setSorting = useCallback(
    (
      sortBy: ConversationFilters['sortBy'],
      sortOrder: ConversationFilters['sortOrder']
    ) => {
      setFilters({ sortBy, sortOrder });
    },
    [setFilters]
  );

  const setModelFilter = useCallback(
    (model: string | undefined) => {
      setFilters({ model });
    },
    [setFilters]
  );

  const setDateRangeFilter = useCallback(
    (dateRange: ConversationFilters['dateRange']) => {
      setFilters({ dateRange });
    },
    [setFilters]
  );

  return {
    sortBy: state.filters.sortBy,
    sortOrder: state.filters.sortOrder,
    modelFilter: state.filters.model,
    dateRangeFilter: state.filters.dateRange,
    setSorting,
    setModelFilter,
    setDateRangeFilter,
    clearAllFilters: clearFilters,
  };
}

/**
 * Helper hook for conversation search controls.
 */
export function useConversationSearch(): ConversationSearchControls {
  const { state, filteredConversations, setSearchQuery, clearSearch } =
    useConversations();

  const trimmedQuery = state.filters.searchQuery.trim();

  return {
    searchQuery: state.filters.searchQuery,
    searchResults: filteredConversations,
    isSearching: trimmedQuery.length > 0,
    setSearchQuery,
    clearSearch,
  };
}
