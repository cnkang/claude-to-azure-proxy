/**
 * App Context Provider
 *
 * Provides global application state management including conversations, UI state,
 * and configuration. This is the root context that combines all other contexts.
 *
 * Requirements: 1.1, 5.1, 5.2, 5.3, 10.1
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import type {
  AppState,
  ConfigState,
  Conversation,
  ConversationFilters,
} from '../types/index.js';
import { useSessionContext } from './SessionContext';
import { getCrossTabSyncService } from '../services/cross-tab-sync.js';
import type { SyncEvent } from '../services/cross-tab-sync.js';
import { getSessionManager } from '../services/session.js';
import { getConversationStorage } from '../services/storage.js';
import { frontendLogger } from '../utils/logger.js';
import { BREAKPOINTS } from '../constants/breakpoints.js';

/**
 * App actions
 */
export type AppAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_SIDEBAR_OPEN'; payload: boolean }
  | { type: 'SET_THEME'; payload: 'light' | 'dark' | 'auto' }
  | { type: 'SET_LANGUAGE'; payload: 'en' | 'zh' }
  | { type: 'SET_CONFIG'; payload: Partial<ConfigState> }
  | { type: 'SET_CONVERSATIONS'; payload: Map<string, Conversation> }
  | { type: 'SET_ACTIVE_CONVERSATION'; payload: string | null }
  | { type: 'SET_CONVERSATIONS_LOADING'; payload: boolean }
  | { type: 'SET_CONVERSATIONS_ERROR'; payload: string | null }
  | { type: 'SET_CONVERSATION_FILTERS'; payload: ConversationFilters }
  | { type: 'ADD_CONVERSATION'; payload: Conversation }
  | {
      type: 'UPDATE_CONVERSATION';
      payload: { id: string; updates: Partial<Conversation> };
    }
  | { type: 'DELETE_CONVERSATION'; payload: string }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'SET_SEARCH_RESULTS'; payload: Conversation[] }
  | { type: 'SET_SEARCH_ERROR'; payload: string | null }
  | { type: 'RESET_STATE' };

/**
 * App context type
 */
export interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;

  // Computed values
  activeConversation: import('../types/index.js').Conversation | null;
  conversationsList: import('../types/index.js').Conversation[];

  // Actions
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: 'light' | 'dark' | 'auto') => void;
  setLanguage: (language: 'en' | 'zh') => void;
  setActiveConversation: (conversationId: string | null) => void;
  addConversation: (
    conversation: import('../types/index.js').Conversation
  ) => Promise<void>;
  updateConversation: (
    id: string,
    updates: Partial<import('../types/index.js').Conversation>
  ) => void;
  deleteConversation: (id: string) => void;
  resetState: () => void;
}

// Moved to a separate constants file to avoid Fast Refresh issues
// Fast Refresh requires that files only export React components
const DEFAULT_CONVERSATION_FILTERS: ConversationFilters = {
  searchQuery: '',
  model: undefined,
  dateRange: undefined,
  sortBy: 'updatedAt',
  sortOrder: 'desc',
};

/**
 * Initial app state
 */
const createInitialState = (): AppState => ({
  session: {
    sessionId: '',
    preferences: {
      theme: 'auto',
      language: 'en',
      selectedModel: 'gpt-4',
    },
    createdAt: new Date(),
  },
  conversations: {
    conversations: new Map(),
    activeConversationId: null,
    isLoading: false,
    error: undefined,
    filters: DEFAULT_CONVERSATION_FILTERS,
    searchQuery: '',
    searchResults: [],
    isSearching: false,
    searchError: undefined,
  },
  ui: {
    theme: 'auto',
    language: 'en',
    // Requirement 21.1: Sidebar open by default on desktop (> 1024px), closed on mobile/tablet (≤ 1024px)
    sidebarOpen: typeof window !== 'undefined' ? window.innerWidth > BREAKPOINTS.TABLET : false,
    isLoading: false,
    error: undefined,
  },
  config: {
    availableModels: [],
    maxFileSize: 10 * 1024 * 1024, // 10MB
    supportedFileTypes: [],
    features: {
      fileUpload: true,
      imageUpload: true,
      codeHighlighting: true,
      streamingResponses: true,
    },
  },
});

/**
 * App reducer
 */
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_LOADING':
      return {
        ...state,
        ui: {
          ...state.ui,
          isLoading: action.payload,
        },
      };

    case 'SET_ERROR':
      return {
        ...state,
        ui: {
          ...state.ui,
          error: action.payload ?? undefined,
        },
      };

    case 'SET_SIDEBAR_OPEN':
      return {
        ...state,
        ui: {
          ...state.ui,
          sidebarOpen: action.payload,
        },
      };

    case 'SET_THEME':
      return {
        ...state,
        ui: {
          ...state.ui,
          theme: action.payload,
        },
        session: {
          ...state.session,
          preferences: {
            ...state.session.preferences,
            theme: action.payload,
          },
        },
      };

    case 'SET_LANGUAGE':
      return {
        ...state,
        ui: {
          ...state.ui,
          language: action.payload,
        },
        session: {
          ...state.session,
          preferences: {
            ...state.session.preferences,
            language: action.payload,
          },
        },
      };

    case 'SET_CONFIG':
      return {
        ...state,
        config: {
          ...state.config,
          ...action.payload,
        },
      };

    case 'SET_CONVERSATIONS': {
      const newConversations = action.payload;
      const currentActiveId = state.conversations.activeConversationId;

      // Preserve active ID only if it exists in the new conversations map
      // This prevents activeConversationId from pointing to a non-existent conversation
      // while ensuring we don't reset it unnecessarily if the conversation still exists
      const nextActiveId =
        currentActiveId && newConversations.has(currentActiveId)
          ? currentActiveId
          : null;

      return {
        ...state,
        conversations: {
          ...state.conversations,
          conversations: newConversations,
          activeConversationId: nextActiveId,
        },
      };
    }

    case 'SET_ACTIVE_CONVERSATION':
      return {
        ...state,
        conversations: {
          ...state.conversations,
          activeConversationId: action.payload,
        },
      };

    case 'SET_CONVERSATIONS_LOADING':
      return {
        ...state,
        conversations: {
          ...state.conversations,
          isLoading: action.payload,
        },
      };

    case 'SET_CONVERSATIONS_ERROR':
      return {
        ...state,
        conversations: {
          ...state.conversations,
          error: action.payload ?? undefined,
        },
      };

    case 'SET_CONVERSATION_FILTERS':
      return {
        ...state,
        conversations: {
          ...state.conversations,
          filters: action.payload,
        },
      };

    case 'ADD_CONVERSATION':
      return {
        ...state,
        conversations: {
          ...state.conversations,
          conversations: new Map(state.conversations.conversations).set(
            action.payload.id,
            action.payload
          ),
          activeConversationId: action.payload.id,
        },
      };

    case 'UPDATE_CONVERSATION': {
      const updatedConversations = new Map(state.conversations.conversations);
      const existingConversation = updatedConversations.get(action.payload.id);

      if (existingConversation) {
        const updatedConversation = {
          ...existingConversation,
          ...action.payload.updates,
          updatedAt: new Date(),
        };

        // Task 11.2: Enforce message history limit to prevent unbounded memory growth
        // Keep only the last 100 messages to prevent memory leaks in long conversations
        const MAX_MESSAGES_PER_CONVERSATION = 100;
        if (
          updatedConversation.messages &&
          updatedConversation.messages.length > MAX_MESSAGES_PER_CONVERSATION
        ) {
          // Keep the most recent messages
          updatedConversation.messages = updatedConversation.messages.slice(
            -MAX_MESSAGES_PER_CONVERSATION
          );

          // Messages trimmed for memory optimization
          // Monitoring: conversationId, originalCount, trimmedCount tracked internally
        }

        updatedConversations.set(action.payload.id, updatedConversation);
      }

      return {
        ...state,
        conversations: {
          ...state.conversations,
          conversations: updatedConversations,
        },
      };
    }

    case 'DELETE_CONVERSATION': {
      const updatedConversations = new Map(state.conversations.conversations);
      updatedConversations.delete(action.payload);

      // If we're deleting the active conversation, set active to null
      const activeConversationId =
        state.conversations.activeConversationId === action.payload
          ? null
          : state.conversations.activeConversationId;

      return {
        ...state,
        conversations: {
          ...state.conversations,
          conversations: updatedConversations,
          activeConversationId,
        },
      };
    }

    case 'SET_SEARCH_QUERY':
      return {
        ...state,
        conversations: {
          ...state.conversations,
          searchQuery: action.payload,
          isSearching: action.payload.trim().length > 0,
        },
      };

    case 'SET_SEARCH_RESULTS':
      return {
        ...state,
        conversations: {
          ...state.conversations,
          searchResults: action.payload,
        },
      };

    case 'SET_SEARCH_ERROR':
      return {
        ...state,
        conversations: {
          ...state.conversations,
          searchError: action.payload ?? undefined,
        },
      };

    case 'RESET_STATE':
      return createInitialState();

    default:
      return state;
  }
}

/**
 * App context
 */
const AppContext = createContext<AppContextType | null>(null);

/**
 * App provider props
 */
export interface AppProviderProps {
  children: ReactNode;
}

/**
 * App provider component
 */
export function AppProvider({ children }: AppProviderProps): React.JSX.Element {
  const [state, dispatch] = useReducer(appReducer, createInitialState());
  const { session, updatePreferences } = useSessionContext();
  const sessionManagerRef = useRef(getSessionManager());

  // Sync session data with app state
  useEffect(() => {
    if (session) {
      dispatch({
        type: 'SET_THEME',
        payload: session.preferences.theme,
      });
      dispatch({
        type: 'SET_LANGUAGE',
        payload: session.preferences.language,
      });
    }
  }, [session]);

  // Load conversations from storage on mount
  useEffect(() => {
    const loadConversations = async (): Promise<void> => {
      try {
        const storage = getConversationStorage();

        // Initialize storage
        await storage.initialize();

        // Load all conversations
        const conversations = await storage.getAllConversations();

        if (conversations.length > 0) {
          // Convert array to Map
          const conversationsMap = new Map(
            conversations.map((conv) => [conv.id, conv])
          );

          dispatch({
            type: 'SET_CONVERSATIONS',
            payload: conversationsMap,
          });

          // Set the most recent conversation as active
          dispatch({
            type: 'SET_ACTIVE_CONVERSATION',
            payload: conversations[0].id,
          });
        }
      } catch (_error) {
        // Failed to load conversations from storage - error handled silently
        dispatch({
          type: 'SET_CONVERSATIONS_ERROR',
          payload: 'Failed to load conversations',
        });
      }
    };

    void loadConversations();
  }, []);

  // Cross-tab synchronization (Requirements: 4.1, 4.2, 4.3)
  const syncServiceRef = useRef(getCrossTabSyncService());
  // Keep a ref to conversations for event handlers to avoid dependency cycles
  const conversationsRef = useRef(state.conversations.conversations);
  useEffect(() => {
    conversationsRef.current = state.conversations.conversations;
  }, [state.conversations.conversations]);

  useEffect(() => {
    const syncService = syncServiceRef.current;

    // Initialize cross-tab sync service
    syncService.initialize();

    // Helper to normalize date strings from JSON
    const normalizeDate = (date: string | Date | undefined): Date => {
      if (!date) {
        return new Date();
      }
      return date instanceof Date ? date : new Date(date);
    };

    // Helper to normalize conversation data from sync events
    const normalizeSyncData = (
      data: Partial<Conversation>
    ): Partial<Conversation> => {
      const normalized = { ...data };
      if (normalized.createdAt) {
        normalized.createdAt = normalizeDate(normalized.createdAt);
      }
      if (normalized.updatedAt) {
        normalized.updatedAt = normalizeDate(normalized.updatedAt);
      }
      if (normalized.messages) {
        normalized.messages = normalized.messages.map((msg) => ({
          ...msg,
          timestamp: normalizeDate(msg.timestamp),
        }));
      }
      return normalized;
    };

    // Subscribe to update events
    const unsubscribeUpdate = syncService.subscribe(
      'update',
      (event: SyncEvent) => {
        frontendLogger.info('Received cross-tab update event', {
          metadata: {
            conversationId: event.conversationId,
            sourceTabId: event.sourceTabId,
          },
        });

        // Update conversation in state if it exists
        // Use ref to check existence without triggering re-subscription
        if (event.data && conversationsRef.current.has(event.conversationId)) {
          const existingConversation = conversationsRef.current.get(
            event.conversationId
          );

          if (existingConversation) {
            const normalizedUpdates = normalizeSyncData(event.data);

            // Conflict resolution: use service's robust resolution (Requirement 4.4)
            const resolution = syncService.resolveConflict(
              existingConversation,
              normalizedUpdates
            );

            if (resolution.strategy === 'remote') {
              // Remote change is newer or merged, apply it
              dispatch({
                type: 'UPDATE_CONVERSATION',
                payload: {
                  id: event.conversationId,
                  updates: resolution.resolved,
                },
              });

              frontendLogger.info('Applied remote update', {
                metadata: {
                  conversationId: event.conversationId,
                  strategy: resolution.strategy,
                },
              });
            } else {
              // Local change is newer, ignore remote update
              frontendLogger.info(
                'Ignored remote update (conflict resolved locally)',
                {
                  metadata: {
                    conversationId: event.conversationId,
                    strategy: resolution.strategy,
                  },
                }
              );
            }
          }
        }
      }
    );

    // Subscribe to delete events
    const unsubscribeDelete = syncService.subscribe(
      'delete',
      (event: SyncEvent) => {
        frontendLogger.info('Received cross-tab delete event', {
          metadata: {
            conversationId: event.conversationId,
            sourceTabId: event.sourceTabId,
          },
        });

        // Delete conversation from state
        dispatch({
          type: 'DELETE_CONVERSATION',
          payload: event.conversationId,
        });
      }
    );

    // Subscribe to create events
    const unsubscribeCreate = syncService.subscribe(
      'create',
      (event: SyncEvent) => {
        frontendLogger.info('Received cross-tab create event', {
          metadata: {
            conversationId: event.conversationId,
            sourceTabId: event.sourceTabId,
          },
        });

        // Add conversation to state if data is provided
        if (event.data) {
          // Check if we already have it (to avoid duplicates/overwrites)
          if (conversationsRef.current.has(event.conversationId)) {
            return;
          }

          // Use provided data directly instead of fetching from storage
          // This is faster and avoids race conditions
          const normalizedConversation = normalizeSyncData(
            event.data
          ) as Conversation;

          // Ensure required fields exist
          if (normalizedConversation.id && normalizedConversation.title) {
            dispatch({
              type: 'ADD_CONVERSATION',
              payload: normalizedConversation,
            });
          } else {
            // Fallback to storage if data is incomplete
            const storage = getConversationStorage();
            storage
              .getConversation(event.conversationId)
              .then((conversation) => {
                if (conversation) {
                  dispatch({
                    type: 'ADD_CONVERSATION',
                    payload: conversation,
                  });
                }
              })
              .catch(() => {
                // Failed to load conversation - error handled silently
              });
          }
        }
      }
    );

    // Cleanup on unmount
    return () => {
      unsubscribeUpdate();
      unsubscribeDelete();
      unsubscribeCreate();
      syncService.destroy();

      frontendLogger.info('Cross-tab sync service cleaned up');
    };
  }, []); // Empty dependency array - run once on mount

  // Computed values
  const activeConversationId = state.conversations.activeConversationId;
  const activeConversation =
    activeConversationId !== null
      ? (state.conversations.conversations.get(activeConversationId) ?? null)
      : null;

  const conversationsList = Array.from(
    state.conversations.conversations.values()
  ).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  // Action creators
  const setLoading = (loading: boolean): void => {
    dispatch({ type: 'SET_LOADING', payload: loading });
  };

  const setError = (error: string | null): void => {
    dispatch({ type: 'SET_ERROR', payload: error });
  };

  const setSidebarOpen = (open: boolean): void => {
    dispatch({ type: 'SET_SIDEBAR_OPEN', payload: open });
  };

  const setTheme = (theme: 'light' | 'dark' | 'auto'): void => {
    dispatch({ type: 'SET_THEME', payload: theme });
    updatePreferences({ theme });
  };

  const setLanguage = (language: 'en' | 'zh'): void => {
    dispatch({ type: 'SET_LANGUAGE', payload: language });
    updatePreferences({ language });
  };

  const setActiveConversation = (conversationId: string | null): void => {
    dispatch({ type: 'SET_ACTIVE_CONVERSATION', payload: conversationId });
  };

  const addConversation = async (
    conversation: import('../types/index.js').Conversation
  ): Promise<void> => {
    const sessionManager = sessionManagerRef.current;
    const resolvedSessionId =
      session?.sessionId ?? sessionManager.getSessionId();

    if (!resolvedSessionId) {
      frontendLogger.error('Cannot store conversation without active session', {
        metadata: { conversationId: conversation.id },
      });
      return;
    }

    const normalizedConversation: Conversation = {
      ...conversation,
      sessionId: resolvedSessionId,
    };

    if (conversation.sessionId !== resolvedSessionId) {
      frontendLogger.warn('Normalized conversation session to active session', {
        metadata: {
          conversationId: conversation.id,
          providedSessionId: conversation.sessionId,
          resolvedSessionId,
        },
      });
    }

    dispatch({ type: 'ADD_CONVERSATION', payload: normalizedConversation });

    // Broadcast to other tabs (Requirement 4.1)
    const syncService = syncServiceRef.current;
    syncService.broadcastCreation(
      normalizedConversation.id,
      normalizedConversation
    );

    try {
      const storage = getConversationStorage();
      await storage.initialize();
      await storage.storeConversation(normalizedConversation);
    } catch (error) {
      frontendLogger.error('Failed to store conversation', {
        metadata: {
          conversationId: conversation.id,
          sessionId: resolvedSessionId,
        },
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  };

  const updateConversation = (
    id: string,
    updates: Partial<import('../types/index.js').Conversation>
  ): void => {
    dispatch({ type: 'UPDATE_CONVERSATION', payload: { id, updates } });

    // Persist to storage
    const conversation = state.conversations.conversations.get(id);
    if (conversation) {
      const updatedConversation = {
        ...conversation,
        ...updates,
        updatedAt: new Date(),
      };

      const storage = getConversationStorage();
      storage.storeConversation(updatedConversation).catch(() => {
        // Failed to update conversation in storage - error handled silently
      });

      // Broadcast to other tabs (Requirement 4.2)
      const syncService = syncServiceRef.current;
      syncService.broadcastUpdate(id, updates);
    }
  };

  const deleteConversation = (id: string): void => {
    dispatch({ type: 'DELETE_CONVERSATION', payload: id });

    // Delete from storage
    const storage = getConversationStorage();
    storage.deleteConversation(id).catch(() => {
      // Failed to delete conversation from storage - error handled silently
    });

    // Broadcast to other tabs (Requirement 4.2)
    const syncService = syncServiceRef.current;
    syncService.broadcastDeletion(id);
  };

  const resetState = (): void => {
    dispatch({ type: 'RESET_STATE' });
  };

  const contextValue: AppContextType = {
    state,
    dispatch,
    activeConversation,
    conversationsList,
    setLoading,
    setError,
    setSidebarOpen,
    setTheme,
    setLanguage,
    setActiveConversation,
    addConversation,
    updateConversation,
    deleteConversation,
    resetState,
  };

  return (
    <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>
  );
}

/**
 * Hook to use app context
 */
export function useAppContext(): AppContextType {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }

  return context;
}

/**
 * Hook for UI state management
 */
export function useUI(): {
  ui: AppState['ui'];
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: 'light' | 'dark' | 'auto') => void;
  setLanguage: (language: 'en' | 'zh') => void;
} {
  const { state, setLoading, setError, setSidebarOpen, setTheme, setLanguage } =
    useAppContext();

  return {
    ui: state.ui,
    setLoading,
    setError,
    setSidebarOpen,
    setTheme,
    setLanguage,
  };
}

/**
 * Hook for conversation management
 */
export function useConversations(): {
  conversations: AppState['conversations'];
  activeConversation: Conversation | null;
  conversationsList: Conversation[];
  setActiveConversation: (conversationId: string | null) => void;
  addConversation: (conversation: Conversation) => Promise<void>;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  deleteConversation: (conversationId: string) => void;
} {
  const {
    state,
    activeConversation,
    conversationsList,
    setActiveConversation,
    addConversation,
    updateConversation,
    deleteConversation,
  } = useAppContext();

  return {
    conversations: state.conversations,
    activeConversation,
    conversationsList,
    setActiveConversation,
    addConversation,
    updateConversation,
    deleteConversation,
  };
}

/**
 * Hook for configuration management
 */
export function useConfig(): {
  config: AppState['config'];
  setConfig: (config: Partial<ConfigState>) => void;
} {
  const { state, dispatch } = useAppContext();

  const setConfig = (config: Partial<ConfigState>): void => {
    dispatch({ type: 'SET_CONFIG', payload: config });
  };

  return {
    config: state.config,
    setConfig,
  };
}
