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
import { useAppContext } from '../contexts/AppContext.js';
import { DEFAULT_CONVERSATION_FILTERS } from '../constants/filters.js';
import { getConversationStorage } from '../services/storage.js';
import { getSessionManager } from '../services/session.js';
import { getCrossTabSyncService } from '../services/cross-tab-sync.js';
import { getRetryManager } from '../utils/retry-manager.js';
import { createPersistenceError } from '../errors/persistence-error.js';
import { frontendLogger } from '../utils/logger.js';
import type {
  Conversation,
  ConversationFilters,
  ContextUsage,
  Message,
} from '../types/index.js';
import type { SyncEvent } from '../services/cross-tab-sync.js';

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
  const syncServiceRef = useRef(getCrossTabSyncService());
  const retryManagerRef = useRef(getRetryManager());

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

  const _removeConversation = useCallback(
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

  /**
   * Initialize cross-tab synchronization and subscribe to sync events
   * Requirement 4.1: Update local state when remote changes detected
   * Requirement 4.2: Broadcast local changes to other tabs
   * Requirement 4.3: Handle race conditions
   */
  useEffect(() => {
    const syncService = syncServiceRef.current;

    // Initialize sync service
    if (!syncService.isReady()) {
      try {
        syncService.initialize();
      } catch (error) {
        frontendLogger.error('Failed to initialize cross-tab sync', {
          error: error instanceof Error ? error : new Error(String(error)),
        });
        return;
      }
    }

    // Handle update events from other tabs
    const handleUpdate = async (event: SyncEvent): Promise<void> => {
      try {
        const existing = state.conversations.conversations.get(
          event.conversationId
        );

        if (!existing) {
          // Conversation doesn't exist locally, ignore
          return;
        }

        // Resolve conflicts using timestamp-based resolution
        const resolution = syncService.resolveConflict(existing, event.data ?? {});

        if (resolution.hadConflict) {
          frontendLogger.info('Resolved cross-tab update conflict', {
            metadata: {
              conversationId: event.conversationId,
              strategy: resolution.strategy,
            },
          });
        }

        // Update local state with resolved data
        if (resolution.strategy === 'remote') {
          updateConversationInContext(event.conversationId, resolution.resolved);
        }
      } catch (error) {
        frontendLogger.error('Failed to handle cross-tab update', {
          error: error instanceof Error ? error : new Error(String(error)),
          metadata: {
            conversationId: event.conversationId,
          },
        });
      }
    };

    // Handle delete events from other tabs
    const handleDelete = async (event: SyncEvent): Promise<void> => {
      try {
        const existing = state.conversations.conversations.get(
          event.conversationId
        );

        if (!existing) {
          // Already deleted locally, ignore
          return;
        }

        // Remove from local state
        deleteConversationInContext(event.conversationId);

        frontendLogger.info('Conversation deleted in another tab', {
          metadata: {
            conversationId: event.conversationId,
          },
        });
      } catch (error) {
        frontendLogger.error('Failed to handle cross-tab deletion', {
          error: error instanceof Error ? error : new Error(String(error)),
          metadata: {
            conversationId: event.conversationId,
          },
        });
      }
    };

    // Handle create events from other tabs
    const handleCreate = async (event: SyncEvent): Promise<void> => {
      try {
        const existing = state.conversations.conversations.get(
          event.conversationId
        );

        if (existing) {
          // Already exists locally, ignore
          return;
        }

        if (!event.data) {
          frontendLogger.warn('Create event missing conversation data', {
            metadata: {
              conversationId: event.conversationId,
            },
          });
          return;
        }

        // Add to local state
        const conversation = normalizeConversation(event.data as Conversation);
        addConversation(conversation);

        frontendLogger.info('Conversation created in another tab', {
          metadata: {
            conversationId: event.conversationId,
          },
        });
      } catch (error) {
        frontendLogger.error('Failed to handle cross-tab creation', {
          error: error instanceof Error ? error : new Error(String(error)),
          metadata: {
            conversationId: event.conversationId,
          },
        });
      }
    };

    // Subscribe to sync events
    const unsubscribeUpdate = syncService.subscribe('update', handleUpdate);
    const unsubscribeDelete = syncService.subscribe('delete', handleDelete);
    const unsubscribeCreate = syncService.subscribe('create', handleCreate);

    // Cleanup on unmount
    return () => {
      unsubscribeUpdate();
      unsubscribeDelete();
      unsubscribeCreate();
    };
  }, [
    state.conversations.conversations,
    updateConversationInContext,
    deleteConversationInContext,
    addConversation,
  ]);

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

      // Broadcast creation to other tabs
      // Requirement 4.2: Broadcast local changes to other tabs
      syncServiceRef.current.broadcastCreation(conversation.id, conversation);

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

      // Broadcast update to other tabs
      // Requirement 4.2: Broadcast local changes to other tabs
      syncServiceRef.current.broadcastUpdate(conversationId, updates);
    },
    [
      persistConversation,
      state.conversations.conversations,
      updateConversationInContext,
    ]
  );

  /**
   * Rename conversation with optimistic update and rollback
   * 
   * Requirements: 1.1, 1.3, 3.1, 3.4
   * - Apply optimistic UI update immediately via AppContext
   * - Persist to storage asynchronously using atomic method
   * - Rollback on failure by restoring previous title
   * - Show error message on failure
   * - Use RetryManager for automatic retries
   */
  const renameConversationHandler = useCallback(
    async (conversationId: string, newTitle: string): Promise<void> => {
      const trimmed = newTitle.trim();
      
      // Validate title
      if (trimmed.length === 0) {
        const error = createPersistenceError(
          new Error('Conversation title cannot be empty'),
          conversationId
        );
        dispatch({
          type: 'SET_CONVERSATIONS_ERROR',
          payload: error.getUserMessage(),
        });
        throw error;
      }

      if (trimmed.length > 200) {
        const error = createPersistenceError(
          new Error('Conversation title cannot exceed 200 characters'),
          conversationId
        );
        dispatch({
          type: 'SET_CONVERSATIONS_ERROR',
          payload: error.getUserMessage(),
        });
        throw error;
      }

      // Get existing conversation for rollback
      const existing = state.conversations.conversations.get(conversationId);
      if (!existing) {
        const error = createPersistenceError(
          new Error(`Conversation ${conversationId} not found`),
          conversationId
        );
        dispatch({
          type: 'SET_CONVERSATIONS_ERROR',
          payload: error.getUserMessage(),
        });
        throw error;
      }

      const previousTitle = existing.title;
      const _previousStatus = existing.persistenceStatus;

      // Optimistic update - update UI immediately (Requirement 3.1)
      updateConversationInContext(conversationId, {
        title: trimmed,
        persistenceStatus: 'pending',
        isDirty: true,
        updatedAt: new Date(),
      });

      try {
        // Persist to storage asynchronously with retry (Requirement 1.3)
        await retryManagerRef.current.execute(
          async () => {
            await ensureStorageReady();
            await storageRef.current.updateConversationTitle(conversationId, trimmed);
          }
        );

        // Update persistence status to synced
        updateConversationInContext(conversationId, {
          persistenceStatus: 'synced',
          isDirty: false,
          lastSyncedAt: new Date(),
          syncVersion: (existing.syncVersion ?? 0) + 1,
        });

        // Broadcast update to other tabs (Requirement 4.2)
        syncServiceRef.current.broadcastUpdate(conversationId, {
          title: trimmed,
          updatedAt: new Date(),
        });

        // Clear any previous errors
        dispatch({
          type: 'SET_CONVERSATIONS_ERROR',
          payload: null,
        });

        frontendLogger.info('Conversation renamed successfully', {
          metadata: {
            conversationId,
            newTitle: trimmed,
            previousTitle,
          },
        });
      } catch (error) {
        // Rollback optimistic update on failure (Requirement 3.4)
        updateConversationInContext(conversationId, {
          title: previousTitle,
          persistenceStatus: 'error',
          isDirty: false,
        });

        // Show error message to user
        const persistenceError = createPersistenceError(error, conversationId);
        dispatch({
          type: 'SET_CONVERSATIONS_ERROR',
          payload: persistenceError.getUserMessage(),
        });

        frontendLogger.error('Failed to rename conversation', {
          metadata: {
            conversationId,
            newTitle: trimmed,
            previousTitle,
          },
          error: persistenceError,
        });

        throw persistenceError;
      }
    },
    [
      state.conversations.conversations,
      updateConversationInContext,
      ensureStorageReady,
      dispatch,
    ]
  );

  /**
   * Delete conversation with optimistic update and rollback
   * 
   * Requirements: 2.1, 2.2, 2.3, 3.1, 3.4
   * - Remove from UI immediately via AppContext
   * - Delete from storage asynchronously
   * - Restore on failure by re-adding to context
   * - Show error message on failure
   * - Use RetryManager for automatic retries
   */
  const deleteConversationHandler = useCallback(
    async (conversationId: string): Promise<void> => {
      // Get existing conversation for rollback
      const existing = state.conversations.conversations.get(conversationId);
      if (!existing) {
        const error = createPersistenceError(
          new Error(`Conversation ${conversationId} not found`),
          conversationId
        );
        dispatch({
          type: 'SET_CONVERSATIONS_ERROR',
          payload: error.getUserMessage(),
        });
        throw error;
      }

      // Optimistic removal from UI (Requirement 3.1)
      deleteConversationInContext(conversationId);

      try {
        // Delete from storage asynchronously with retry (Requirement 2.1, 2.2, 2.3)
        const deleteResult = await retryManagerRef.current.execute(
          async () => {
            await ensureStorageReady();
            return await storageRef.current.deleteConversation(conversationId);
          }
        );

        if (!deleteResult.success) {
          throw createPersistenceError(
            new Error(deleteResult.error || 'Deletion failed'),
            conversationId
          );
        }

        // Broadcast deletion to other tabs (Requirement 4.2)
        syncServiceRef.current.broadcastDeletion(conversationId);

        // Clear any previous errors
        dispatch({
          type: 'SET_CONVERSATIONS_ERROR',
          payload: null,
        });

        frontendLogger.info('Conversation deleted successfully', {
          metadata: {
            conversationId,
            messagesRemoved: deleteResult.messagesRemoved,
            bytesFreed: deleteResult.bytesFreed,
          },
        });
      } catch (error) {
        // Restore conversation in UI on failure (Requirement 3.4)
        addConversation(existing);

        // Show error message to user
        const persistenceError = createPersistenceError(error, conversationId);
        dispatch({
          type: 'SET_CONVERSATIONS_ERROR',
          payload: persistenceError.getUserMessage(),
        });

        frontendLogger.error('Failed to delete conversation', {
          metadata: {
            conversationId,
          },
          error: persistenceError,
        });

        throw persistenceError;
      }
    },
    [
      state.conversations.conversations,
      deleteConversationInContext,
      addConversation,
      ensureStorageReady,
      dispatch,
    ]
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
