/**
 * Session Context Provider
 *
 * Provides session management context to the entire React application
 * with automatic session validation and isolation.
 *
 * Requirements: 13.2, 13.3, 13.5
 */

import type React from 'react';
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import { type UseSessionReturn, useSession } from '../hooks/useSession.js';
import type { UserPreferences } from '../types/index.js';

/**
 * Session context type
 */
export interface SessionContextType extends UseSessionReturn {
  // Additional context-specific properties
  isInitialized: boolean;
  error: string | null;
}

/**
 * Session context
 */
const SessionContext = createContext<SessionContextType | null>(null);

/**
 * Session provider props
 */
export interface SessionProviderProps {
  children: ReactNode;
}

/**
 * Session provider component
 */
export function SessionProvider({
  children,
}: SessionProviderProps): React.JSX.Element {
  const sessionHook = useSession();
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize session context
  useEffect(() => {
    if (!sessionHook.isLoading) {
      setIsInitialized(true);

      // Check for storage availability
      if (!sessionHook.storageAvailable.sessionStorage) {
        setError(
          'Session storage is not available. Some features may not work properly.'
        );
      } else if (!sessionHook.storageAvailable.localStorage) {
        setError(
          'Local storage is not available. Preferences will not be saved.'
        );
      } else {
        setError(null);
      }
    }
  }, [sessionHook.isLoading, sessionHook.storageAvailable]);

  // Handle session validation errors
  useEffect(() => {
    if (!sessionHook.isSessionValid && isInitialized) {
      setError(
        'Session validation failed. Your session has been reset for security.'
      );

      // Clear error after 5 seconds
      const timer = setTimeout((): void => {
        setError(null);
      }, 5000);

      return (): void => clearTimeout(timer);
    }

    return undefined;
  }, [sessionHook.isSessionValid, isInitialized]);

  const contextValue: SessionContextType = {
    ...sessionHook,
    isInitialized,
    error,
  };

  return (
    <SessionContext.Provider value={contextValue}>
      {children}
    </SessionContext.Provider>
  );
}

/**
 * Hook to use session context
 */
export function useSessionContext(): SessionContextType {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error('useSessionContext must be used within a SessionProvider');
  }

  return context;
}

/**
 * HOC to provide session context to components
 */
export function withSession<P extends object>(
  Component: React.ComponentType<P>
): React.ComponentType<P> {
  const WrappedComponent = (props: P): React.JSX.Element => (
    <SessionProvider>
      <Component {...props} />
    </SessionProvider>
  );

  WrappedComponent.displayName = `withSession(${Component.displayName ?? Component.name})`;

  return WrappedComponent;
}

/**
 * Session guard component that only renders children when session is valid
 */
export interface SessionGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
  requireValidSession?: boolean;
}

export function SessionGuard({
  children,
  fallback = null,
  requireValidSession = true,
}: SessionGuardProps): React.JSX.Element {
  const { isInitialized, isSessionValid, session } = useSessionContext();

  // Show fallback while initializing
  if (!isInitialized) {
    return <>{fallback ?? null}</>;
  }

  // Show fallback if session is required but invalid
  if (
    requireValidSession !== null &&
    requireValidSession !== undefined &&
    (!isSessionValid || session === null)
  ) {
    return <>{fallback ?? null}</>;
  }

  return <>{children}</>;
}

/**
 * Component to display session information (for debugging)
 */
export interface SessionDebugInfoProps {
  className?: string;
}

export function SessionDebugInfo({
  className,
}: SessionDebugInfoProps): React.JSX.Element | null {
  const { session, sessionId, isSessionValid, storageUsage } =
    useSessionContext();

  // Only show in development
  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <div
      className={className}
      style={{
        fontSize: '12px',
        fontFamily: 'monospace',
        padding: '8px',
        backgroundColor: '#f5f5f5',
        border: '1px solid #ddd',
        borderRadius: '4px',
        margin: '8px 0',
      }}
    >
      <div>
        <strong>Session Debug Info:</strong>
      </div>
      <div>Session ID: {sessionId ?? 'None'}</div>
      <div>Valid: {isSessionValid ? 'Yes' : 'No'}</div>
      <div>Created: {session?.createdAt.toLocaleString() ?? 'N/A'}</div>
      <div>Theme: {session?.preferences.theme ?? 'N/A'}</div>
      <div>Language: {session?.preferences.language ?? 'N/A'}</div>
      <div>Model: {session?.preferences.selectedModel ?? 'N/A'}</div>
      <div>
        Storage: {storageUsage.used} / {storageUsage.quota} bytes
      </div>
    </div>
  );
}

/**
 * Hook for session-aware error handling
 */
export function useSessionError(): {
  sessionError: string | null;
  hasSessionError: boolean;
  handleSessionError: (_errorMessage: string) => void;
} {
  const { error, isSessionValid, resetSession } = useSessionContext();

  const handleSessionError = (_errorMessage: string): void => {
    if (!isSessionValid) {
      // Session is invalid, reset it
      resetSession();
    }
  };

  return {
    sessionError: error,
    hasSessionError: error !== null,
    handleSessionError,
  };
}

/**
 * Hook for session preferences management
 */
export function useSessionPreferences(): {
  preferences: UserPreferences | undefined;
  setTheme: (theme: UserPreferences['theme']) => void;
  setLanguage: (language: UserPreferences['language']) => void;
  setSelectedModel: (selectedModel: string) => void;
  updatePreferences: (preferences: Partial<UserPreferences>) => void;
} {
  const { session, updatePreferences } = useSessionContext();

  const setTheme = (theme: UserPreferences['theme']): void => {
    updatePreferences({ theme });
  };

  const setLanguage = (language: UserPreferences['language']): void => {
    updatePreferences({ language });
  };

  const setSelectedModel = (selectedModel: string): void => {
    updatePreferences({ selectedModel });
  };

  return {
    preferences: session?.preferences,
    setTheme,
    setLanguage,
    setSelectedModel,
    updatePreferences,
  };
}
