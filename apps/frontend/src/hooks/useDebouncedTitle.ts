/**
 * Debounced Title Update Hook
 *
 * Provides debounced title updates to reduce unnecessary persistence operations.
 * Requirements: 1.1, 6.1
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { frontendLogger } from '../utils/logger.js';

/**
 * Debounced title hook configuration
 */
export interface DebouncedTitleConfig {
  delay?: number; // milliseconds
  onUpdate: (title: string) => Promise<void>;
  onError?: (error: Error) => void;
}

/**
 * Debounced title hook return type
 */
export interface DebouncedTitleReturn {
  title: string;
  setTitle: (newTitle: string) => void;
  isSaving: boolean;
  error: Error | null;
  clearError: () => void;
}

/**
 * Hook for debounced title updates
 *
 * Debounces title input changes (300ms default) and only persists after user stops typing.
 * Shows "saving..." indicator during persistence.
 * Cancels pending updates on unmount.
 *
 * Requirements: 1.1, 6.1
 *
 * @param initialTitle - Initial title value
 * @param config - Configuration options
 * @returns Debounced title state and setters
 */
export function useDebouncedTitle(
  initialTitle: string,
  config: DebouncedTitleConfig
): DebouncedTitleReturn {
  const { delay = 300, onUpdate, onError } = config;

  const [title, setTitleState] = useState(initialTitle);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const timeoutRef = useRef<number | null>(null);
  const pendingTitleRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  // Update title state when initial title changes
  useEffect(() => {
    setTitleState(initialTitle);
  }, [initialTitle]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;

      // Cancel pending timeout
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  /**
   * Set title with debouncing
   */
  const setTitle = useCallback(
    (newTitle: string) => {
      // Update local state immediately for responsive UI
      setTitleState(newTitle);
      setError(null);

      // Store pending title
      pendingTitleRef.current = newTitle;

      // Clear previous timeout
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout for debounced update
      timeoutRef.current = window.setTimeout(async () => {
        if (!isMountedRef.current) {
          return;
        }

        const titleToSave = pendingTitleRef.current;
        if (titleToSave === null) {
          return;
        }

        // Clear pending title
        pendingTitleRef.current = null;

        // Skip if title hasn't changed
        if (titleToSave === initialTitle) {
          return;
        }

        setIsSaving(true);

        try {
          await onUpdate(titleToSave);

          if (isMountedRef.current) {
            setIsSaving(false);
            setError(null);
          }

          frontendLogger.info('Title updated successfully', {
            metadata: {
              titleLength: titleToSave.length,
            },
          });
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));

          if (isMountedRef.current) {
            setIsSaving(false);
            setError(error);
          }

          frontendLogger.error('Failed to update title', {
            error,
          });

          // Call error handler if provided
          if (onError) {
            onError(error);
          }
        }
      }, delay);
    },
    [delay, initialTitle, onUpdate, onError]
  );

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    title,
    setTitle,
    isSaving,
    error,
    clearError,
  };
}
