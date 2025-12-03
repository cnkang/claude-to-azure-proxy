/**
 * Storage Hook
 *
 * React hook for interacting with the IndexedDB storage system with encryption.
 * Provides a clean interface for components to store and retrieve conversation data.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.5
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type CleanupResult,
  type StorageQuota,
  type StorageStats,
  getConversationStorage,
} from '../services/storage.js';
import type { Conversation } from '../types/index.js';
import { frontendLogger } from '../utils/logger.js';

/**
 * Storage hook state
 */
interface StorageState {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  quota: StorageQuota | null;
  stats: StorageStats | null;
}

/**
 * Storage hook return type
 */
export interface UseStorageReturn {
  // State
  state: StorageState;

  // Storage operations
  storeConversation: (conversation: Conversation) => Promise<void>;
  getConversation: (conversationId: string) => Promise<Conversation | null>;
  getAllConversations: () => Promise<Conversation[]>;
  deleteConversation: (conversationId: string) => Promise<void>;

  // Data management
  clearAllData: () => Promise<void>;
  exportData: () => Promise<string>;

  // Quota and cleanup
  refreshQuota: () => Promise<void>;
  refreshStats: () => Promise<void>;
  performCleanup: () => Promise<CleanupResult>;
  isCleanupNeeded: () => Promise<boolean>;

  // Utilities
  initialize: () => Promise<void>;
  destroy: () => void;
}

export interface StorageQuotaHookState {
  readonly quota: StorageQuota | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
  readonly isWarning: boolean;
  readonly isCritical: boolean;
}

/**
 * Custom hook for storage operations
 */
export function useStorage(): UseStorageReturn {
  const [state, setState] = useState<StorageState>({
    isInitialized: false,
    isLoading: false,
    error: null,
    quota: null,
    stats: null,
  });

  const storageRef = useRef(getConversationStorage());
  const initializationPromiseRef = useRef<Promise<void> | null>(null);

  /**
   * Update state helper
   */
  const updateState = useCallback((updates: Partial<StorageState>): void => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  /**
   * Handle errors consistently
   */
  const handleError = useCallback(
    (caughtError: unknown, operation: string): void => {
      const normalizedError =
        caughtError instanceof Error
          ? caughtError
          : new Error(
              typeof caughtError === 'string'
                ? caughtError
                : `${operation} failed`
            );
      const errorMessage = normalizedError.message;

      frontendLogger.error(`Storage ${operation} error`, {
        error: normalizedError,
        metadata: {
          operation,
        },
      });

      updateState({ error: errorMessage, isLoading: false });
    },
    [updateState]
  );

  /**
   * Initialize storage system
   */
  const initialize = useCallback(async (): Promise<void> => {
    // Prevent multiple initialization attempts
    if (initializationPromiseRef.current) {
      return initializationPromiseRef.current;
    }

    if (state.isInitialized) {
      return;
    }

    updateState({ isLoading: true, error: null });

    const initPromise = (async (): Promise<void> => {
      try {
        await storageRef.current.initialize();

        // Load initial quota and stats
        const [quota, stats] = await Promise.all([
          storageRef.current.getStorageQuota(),
          storageRef.current.getStorageStats(),
        ]);

        updateState({
          isInitialized: true,
          isLoading: false,
          error: null,
          quota,
          stats,
        });
      } catch (error) {
        handleError(error, 'initialization');
      }
    })();

    initializationPromiseRef.current = initPromise;
    return initPromise;
  }, [state.isInitialized, updateState, handleError]);

  /**
   * Store conversation
   */
  const storeConversation = useCallback(
    async (conversation: Conversation): Promise<void> => {
      if (!state.isInitialized) {
        await initialize();
      }

      updateState({ isLoading: true, error: null });

      try {
        await storageRef.current.storeConversation(conversation);

        // Refresh stats after storing
        const stats = await storageRef.current.getStorageStats();
        updateState({ isLoading: false, stats });
      } catch (error) {
        handleError(error, 'store conversation');
      }
    },
    [state.isInitialized, initialize, updateState, handleError]
  );

  /**
   * Get conversation
   */
  const getConversation = useCallback(
    async (conversationId: string): Promise<Conversation | null> => {
      if (!state.isInitialized) {
        await initialize();
      }

      updateState({ isLoading: true, error: null });

      try {
        const conversation =
          await storageRef.current.getConversation(conversationId);
        updateState({ isLoading: false });
        return conversation;
      } catch (error) {
        handleError(error, 'get conversation');
        return null;
      }
    },
    [state.isInitialized, initialize, updateState, handleError]
  );

  /**
   * Get all conversations
   */
  const getAllConversations = useCallback(async (): Promise<Conversation[]> => {
    if (!state.isInitialized) {
      await initialize();
    }

    updateState({ isLoading: true, error: null });

    try {
      const conversations = await storageRef.current.getAllConversations();
      updateState({ isLoading: false });
      return conversations;
    } catch (error) {
      handleError(error, 'get all conversations');
      return [];
    }
  }, [state.isInitialized, initialize, updateState, handleError]);

  /**
   * Delete conversation
   */
  const deleteConversation = useCallback(
    async (conversationId: string): Promise<void> => {
      if (!state.isInitialized) {
        await initialize();
      }

      updateState({ isLoading: true, error: null });

      try {
        await storageRef.current.deleteConversation(conversationId);

        // Refresh stats after deletion
        const stats = await storageRef.current.getStorageStats();
        updateState({ isLoading: false, stats });
      } catch (error) {
        handleError(error, 'delete conversation');
      }
    },
    [state.isInitialized, initialize, updateState, handleError]
  );

  /**
   * Clear all data
   */
  const clearAllData = useCallback(async (): Promise<void> => {
    if (!state.isInitialized) {
      await initialize();
    }

    updateState({ isLoading: true, error: null });

    try {
      await storageRef.current.clearAllData();

      // Refresh quota and stats after clearing
      const [quota, stats] = await Promise.all([
        storageRef.current.getStorageQuota(),
        storageRef.current.getStorageStats(),
      ]);

      updateState({ isLoading: false, quota, stats });
    } catch (error) {
      handleError(error, 'clear all data');
    }
  }, [state.isInitialized, initialize, updateState, handleError]);

  /**
   * Export data
   */
  const exportData = useCallback(async (): Promise<string> => {
    if (!state.isInitialized) {
      await initialize();
    }

    updateState({ isLoading: true, error: null });

    try {
      const exportedData = await storageRef.current.exportData();
      updateState({ isLoading: false });
      return exportedData;
    } catch (error) {
      handleError(error, 'export data');
      return '';
    }
  }, [state.isInitialized, initialize, updateState, handleError]);

  /**
   * Refresh storage quota
   */
  const refreshQuota = useCallback(async (): Promise<void> => {
    if (!state.isInitialized) {
      return;
    }

    try {
      const quota = await storageRef.current.getStorageQuota();
      updateState({ quota });
    } catch (error) {
      handleError(error, 'refresh quota');
    }
  }, [state.isInitialized, updateState, handleError]);

  /**
   * Refresh storage statistics
   */
  const refreshStats = useCallback(async (): Promise<void> => {
    if (!state.isInitialized) {
      return;
    }

    try {
      const stats = await storageRef.current.getStorageStats();
      updateState({ stats });
    } catch (error) {
      handleError(error, 'refresh stats');
    }
  }, [state.isInitialized, updateState, handleError]);

  /**
   * Perform storage cleanup
   */
  const performCleanup = useCallback(async (): Promise<CleanupResult> => {
    if (!state.isInitialized) {
      await initialize();
    }

    updateState({ isLoading: true, error: null });

    try {
      const result = await storageRef.current.performCleanup();

      // Refresh quota and stats after cleanup
      const [quota, stats] = await Promise.all([
        storageRef.current.getStorageQuota(),
        storageRef.current.getStorageStats(),
      ]);

      updateState({ isLoading: false, quota, stats });
      return result;
    } catch (error) {
      handleError(error, 'cleanup');
      return {
        conversationsRemoved: 0,
        messagesRemoved: 0,
        bytesFreed: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Cleanup failed',
      };
    }
  }, [state.isInitialized, initialize, updateState, handleError]);

  /**
   * Check if cleanup is needed
   */
  const isCleanupNeeded = useCallback(async (): Promise<boolean> => {
    if (!state.isInitialized) {
      await initialize();
    }

    try {
      return await storageRef.current.isCleanupNeeded();
    } catch (error) {
      handleError(error, 'cleanup check');
      return false;
    }
  }, [state.isInitialized, initialize, handleError]);

  /**
   * Destroy storage instance
   */
  const destroy = useCallback((): void => {
    storageRef.current.destroy();
    initializationPromiseRef.current = null;
    updateState({
      isInitialized: false,
      isLoading: false,
      error: null,
      quota: null,
      stats: null,
    });
  }, [updateState]);

  /**
   * Auto-initialize on mount
   */
  useEffect(() => {
    initialize().catch((error) => {
      frontendLogger.error('Auto-initialization failed', {
        error:
          error instanceof Error
            ? error
            : new Error('Auto-initialization failed'),
      });
    });
  }, [initialize]);

  /**
   * Periodic quota refresh
   */
  useEffect(() => {
    if (!state.isInitialized) {
      return;
    }

    const interval = setInterval(() => {
      refreshQuota().catch((error) => {
        frontendLogger.error('Periodic quota refresh failed', {
          error:
            error instanceof Error
              ? error
              : new Error('Periodic quota refresh failed'),
        });
      });
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [state.isInitialized, refreshQuota]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      // Don't destroy the storage instance on unmount as it's a singleton
      // Just clear the initialization promise
      initializationPromiseRef.current = null;
    };
  }, []);

  return {
    state,
    storeConversation,
    getConversation,
    getAllConversations,
    deleteConversation,
    clearAllData,
    exportData,
    refreshQuota,
    refreshStats,
    performCleanup,
    isCleanupNeeded,
    initialize,
    destroy,
  };
}

/**
 * Storage context hook for quota monitoring
 */
export function useStorageQuota(): StorageQuotaHookState {
  const { state, refreshQuota } = useStorage();
  const quota = state.quota;
  const isWarning = quota !== null && quota.percentage >= 80;
  const isCritical = quota !== null && quota.percentage >= 95;

  return {
    quota,
    isLoading: state.isLoading,
    error: state.error,
    refresh: refreshQuota,
    isWarning,
    isCritical,
  };
}

/**
 * Storage statistics hook
 */
export function useStorageStats() {
  const { state, refreshStats } = useStorage();

  return {
    stats: state.stats,
    isLoading: state.isLoading,
    error: state.error,
    refresh: refreshStats,
  };
}

/**
 * Storage cleanup hook
 */
export function useStorageCleanup() {
  const { performCleanup, isCleanupNeeded, state } = useStorage();
  const [isCleanupInProgress, setIsCleanupInProgress] = useState(false);
  const [lastCleanupResult, setLastCleanupResult] =
    useState<CleanupResult | null>(null);

  const performCleanupWithState =
    useCallback(async (): Promise<CleanupResult> => {
      setIsCleanupInProgress(true);
      try {
        const result = await performCleanup();
        setLastCleanupResult(result);
        return result;
      } finally {
        setIsCleanupInProgress(false);
      }
    }, [performCleanup]);

  return {
    performCleanup: performCleanupWithState,
    isCleanupNeeded,
    isCleanupInProgress,
    lastCleanupResult,
    quota: state.quota,
    stats: state.stats,
  };
}
