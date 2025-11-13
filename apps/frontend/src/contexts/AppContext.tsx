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
  type ReactNode,
} from 'react';
import type {
  AppState,
  ConfigState,
  Conversation,
  ConversationFilters,
} from '../types/index.js';
import { useSessionContext } from './SessionContext';

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
  ) => void;
  updateConversation: (
    id: string,
    updates: Partial<import('../types/index.js').Conversation>
  ) => void;
  deleteConversation: (id: string) => void;
  resetState: () => void;
}

export const DEFAULT_CONVERSATION_FILTERS: ConversationFilters = {
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
  },
  ui: {
    theme: 'auto',
    language: 'en',
    sidebarOpen: true,
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

    case 'SET_CONVERSATIONS':
      return {
        ...state,
        conversations: {
          ...state.conversations,
          conversations: action.payload,
        },
      };

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
        if (updatedConversation.messages && updatedConversation.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
          // Keep the most recent messages
          updatedConversation.messages = updatedConversation.messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
          
          // Log when messages are trimmed for monitoring
          console.info('[Memory Optimization] Trimmed message history', {
            conversationId: action.payload.id,
            originalCount: (action.payload.updates.messages?.length ?? 0),
            trimmedCount: updatedConversation.messages.length,
            maxMessages: MAX_MESSAGES_PER_CONVERSATION,
          });
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
        const { ConversationStorage } = await import('../services/storage.js');
        const storage = ConversationStorage.getInstance();
        
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
      } catch (error) {
        console.error('Failed to load conversations from storage', error);
      }
    };

    void loadConversations();
  }, []);

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

  const addConversation = (
    conversation: import('../types/index.js').Conversation
  ): void => {
    dispatch({ type: 'ADD_CONVERSATION', payload: conversation });
    
    // Persist to storage
    import('../services/storage.js').then(({ ConversationStorage }) => {
      const storage = ConversationStorage.getInstance();
      storage.storeConversation(conversation).catch((error) => {
        console.error('Failed to store conversation', error);
      });
    }).catch(() => undefined);
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
      
      import('../services/storage.js').then(({ ConversationStorage }) => {
        const storage = ConversationStorage.getInstance();
        storage.storeConversation(updatedConversation).catch((error) => {
          console.error('Failed to update conversation in storage', error);
        });
      }).catch(() => undefined);
    }
  };

  const deleteConversation = (id: string): void => {
    dispatch({ type: 'DELETE_CONVERSATION', payload: id });
    
    // Delete from storage
    import('../services/storage.js').then(({ ConversationStorage }) => {
      const storage = ConversationStorage.getInstance();
      storage.deleteConversation(id).catch((error) => {
        console.error('Failed to delete conversation from storage', error);
      });
    }).catch(() => undefined);
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
  addConversation: (conversation: Conversation) => void;
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
