/**
 * React hook for session management
 *
 * Provides session state and management functions for React components
 * with automatic session validation and isolation.
 *
 * Requirements: 13.2, 13.3, 13.5
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSessionManager, sessionUtils } from '../services/session.js';
import type { SessionState, UserPreferences } from '../types/index.js';
import { frontendLogger } from '../utils/logger.js';

/**
 * Session hook return type
 */
export interface UseSessionReturn {
  // Session state
  session: SessionState | null;
  sessionId: string | null;
  isSessionValid: boolean;
  isLoading: boolean;

  // Session actions
  updatePreferences: (preferences: Partial<UserPreferences>) => void;
  resetSession: () => void;
  validateConversationAccess: (conversationSessionId: string) => boolean;
  generateConversationId: () => string;
  getSessionStoragePrefix: () => string;

  // Storage utilities
  storageAvailable: {
    sessionStorage: boolean;
    localStorage: boolean;
  };
  storageUsage: {
    used: number;
    quota: number;
  };
  clearAllSessionData: () => void;
}

/**
 * Custom hook for session management
 */
export function useSession(): UseSessionReturn {
  const [session, setSession] = useState<SessionState | null>(null);
  const [isSessionValid, setIsSessionValid] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [storageUsage, setStorageUsage] = useState<{
    used: number;
    quota: number;
  }>({ used: 0, quota: 0 });

  const sessionManagerRef = useRef(getSessionManager());
  const storageAvailableRef = useRef({
    sessionStorage: sessionUtils.isSessionStorageAvailable(),
    localStorage: sessionUtils.isLocalStorageAvailable(),
  });

  /**
   * Initialize session state
   */
  const initializeSession = useCallback((): void => {
    const sessionManager = sessionManagerRef.current;
    const currentSession = sessionManager.getCurrentSession();

    setSession(currentSession);
    setIsSessionValid(currentSession !== null);
    setIsLoading(false);

    // Update storage usage
    setStorageUsage(sessionUtils.getSessionStorageUsage());
  }, []);

  /**
   * Handle session invalidation
   */
  const handleSessionInvalidated = useCallback(
    (_event: CustomEvent): void => {
      setIsSessionValid(false);

      // Reinitialize session after invalidation
      setTimeout(() => {
        initializeSession();
        setIsSessionValid(true);
      }, 100);

      if (import.meta.env.DEV) {
        // Session invalidated
      }
    },
    [initializeSession]
  );

  /**
   * Handle session reset
   */
  const handleSessionReset = useCallback(
    (event: CustomEvent): void => {
      initializeSession();

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.info('Session reset:', event.detail);
      }
    },
    [initializeSession]
  );

  /**
   * Update user preferences
   */
  const updatePreferences = useCallback(
    (preferences: Partial<UserPreferences>): void => {
      const sessionManager = sessionManagerRef.current;
      sessionManager.updatePreferences(preferences);

      // Update local state
      const updatedSession = sessionManager.getCurrentSession();
      setSession(updatedSession);

      // Update storage usage
      setStorageUsage(sessionUtils.getSessionStorageUsage());
    },
    []
  );

  /**
   * Reset session
   */
  const resetSession = useCallback((): void => {
    const sessionManager = sessionManagerRef.current;
    sessionManager.resetSession();

    // Session reset event will trigger reinitialization
  }, []);

  /**
   * Validate conversation access
   */
  const validateConversationAccess = useCallback(
    (conversationSessionId: string): boolean => {
      const sessionManager = sessionManagerRef.current;
      return sessionManager.validateConversationAccess(conversationSessionId);
    },
    []
  );

  /**
   * Generate conversation ID
   */
  const generateConversationId = useCallback((): string => {
    const sessionManager = sessionManagerRef.current;
    return sessionManager.generateConversationId();
  }, []);

  /**
   * Get session storage prefix
   */
  const getSessionStoragePrefix = useCallback((): string => {
    const sessionManager = sessionManagerRef.current;
    return sessionManager.getSessionStoragePrefix();
  }, []);

  /**
   * Clear all session data
   */
  const clearAllSessionData = useCallback((): void => {
    sessionUtils.clearAllSessionData();

    // Reset session after clearing data
    resetSession();
  }, [resetSession]);

  /**
   * Update storage usage periodically
   */
  const updateStorageUsage = useCallback((): void => {
    setStorageUsage(sessionUtils.getSessionStorageUsage());
  }, []);

  // Initialize session on mount
  useEffect(() => {
    initializeSession();
  }, [initializeSession]);

  // Set up event listeners for session events
  useEffect(() => {
    const handleSessionInvalidatedEvent = (evt: Event): void => {
      handleSessionInvalidated(evt as CustomEvent);
    };

    const handleSessionResetEvent = (evt: Event): void => {
      handleSessionReset(evt as CustomEvent);
    };

    window.addEventListener(
      'sessionInvalidated',
      handleSessionInvalidatedEvent
    );
    window.addEventListener('sessionReset', handleSessionResetEvent);

    return (): void => {
      window.removeEventListener(
        'sessionInvalidated',
        handleSessionInvalidatedEvent
      );
      window.removeEventListener('sessionReset', handleSessionResetEvent);
    };
  }, [handleSessionInvalidated, handleSessionReset]);

  // Update storage usage periodically
  useEffect(() => {
    const interval = setInterval(updateStorageUsage, 30000); // Every 30 seconds

    return (): void => clearInterval(interval);
  }, [updateStorageUsage]);

  // Cleanup on unmount
  useEffect(() => {
    return (): void => {
      // Note: We don't destroy the session manager here as it's a singleton
      // and might be used by other components
    };
  }, []);

  return {
    // Session state
    session,
    sessionId: session?.sessionId ?? null,
    isSessionValid,
    isLoading,

    // Session actions
    updatePreferences,
    resetSession,
    validateConversationAccess,
    generateConversationId,
    getSessionStoragePrefix,

    // Storage utilities
    storageAvailable: storageAvailableRef.current,
    storageUsage,
    clearAllSessionData,
  };
}

/**
 * Hook for session-aware storage operations
 */
export function useSessionStorage<T>(
  key: string,
  defaultValue: T
): [T, (value: T) => void] {
  const { getSessionStoragePrefix, isSessionValid } = useSession();
  const [storedValue, setStoredValue] = useState<T>(defaultValue);

  // Get the session-prefixed key
  const getStorageKey = useCallback((): string => {
    try {
      const prefix = getSessionStoragePrefix();
      return `${prefix}_${key}`;
    } catch {
      // Fallback to unprefixed key if no session
      return key;
    }
  }, [getSessionStoragePrefix, key]);

  // Load value from storage
  const loadValue = useCallback((): T => {
    if (!sessionUtils.isSessionStorageAvailable() || isSessionValid === false) {
      return defaultValue;
    }

    try {
      const storageKey = getStorageKey();
      const item = sessionStorage.getItem(storageKey);
      return item !== null ? (JSON.parse(item) as T) : defaultValue;
    } catch (_error) {
      frontendLogger.warn('Failed to load from session storage', {
        metadata: { key },
        error: _error instanceof Error ? _error : new Error(String(_error)),
      });
      return defaultValue;
    }
  }, [getStorageKey, defaultValue, isSessionValid, key]);

  // Save value to storage
  const saveValue = useCallback(
    (value: T): void => {
      if (
        !sessionUtils.isSessionStorageAvailable() ||
        isSessionValid === false
      ) {
        setStoredValue(value);
        return;
      }

      try {
        const storageKey = getStorageKey();
        sessionStorage.setItem(storageKey, JSON.stringify(value));
        setStoredValue(value);
      } catch (_error) {
        frontendLogger.error('Failed to save to session storage', {
          metadata: { key },
          error: _error instanceof Error ? _error : new Error(String(_error)),
        });
        setStoredValue(value);
      }
    },
    [getStorageKey, isSessionValid, key]
  );

  // Load initial value
  useEffect(() => {
    setStoredValue(loadValue());
  }, [loadValue]);

  return [storedValue, saveValue];
}

/**
 * Hook for conversation isolation validation
 */
export function useConversationIsolation(): {
  validateConversation: (conversationId: string) => boolean;
  createConversationId: () => string;
  filterSessionConversations: <T extends { id: string }>(
    conversations: T[]
  ) => T[];
} {
  const { validateConversationAccess, generateConversationId } = useSession();

  /**
   * Validate that a conversation belongs to the current session
   */
  const validateConversation = useCallback(
    (conversationId: string): boolean => {
      // Extract session ID from conversation ID
      const parts = conversationId.split('_');
      if (parts.length < 2 || parts[0] !== 'conv') {
        return false;
      }

      // Reconstruct session ID from conversation ID
      const sessionIdParts = parts.slice(1, -2); // Remove 'conv', timestamp, and random parts
      const conversationSessionId = sessionIdParts.join('_');

      return validateConversationAccess(conversationSessionId);
    },
    [validateConversationAccess]
  );

  /**
   * Create a new conversation ID for the current session
   */
  const createConversationId = useCallback((): string => {
    return generateConversationId();
  }, [generateConversationId]);

  /**
   * Filter conversations to only include those from the current session
   */
  const filterSessionConversations = useCallback(
    <T extends { id: string }>(conversations: T[]): T[] => {
      return conversations.filter((conversation) =>
        validateConversation(conversation.id)
      );
    },
    [validateConversation]
  );

  return {
    validateConversation,
    createConversationId,
    filterSessionConversations,
  };
}
