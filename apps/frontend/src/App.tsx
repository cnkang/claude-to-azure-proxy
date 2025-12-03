/**
 * Main App Component
 *
 * Root application component with all context providers and routing.
 * Sets up the complete application structure with theme, i18n, state management,
 * error handling, notifications, and performance monitoring.
 *
 * Requirements: 1.1, 5.1, 5.2, 5.3, 10.1, 6.3, 7.3, 5.4
 */

import type React from 'react';
import { useEffect, useState } from 'react';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { IntegrityCheckInitializer } from './components/common/IntegrityCheckInitializer';
import { NotificationProvider } from './components/common/NotificationSystem';
import { PerformanceDashboard } from './components/common/PerformanceDashboard';
import { AppProvider } from './contexts/AppContext';
import { I18nProvider } from './contexts/I18nContext';
import { SessionProvider } from './contexts/SessionContext';
import { ThemeProvider } from './contexts/ThemeContext';
import {
  usePerformanceMonitoring,
  usePerformanceRegistration,
} from './hooks/usePerformanceMonitoring';
import { AppRouter } from './router/AppRouter';
import { indexedDBOptimizer } from './services/indexeddb-optimization';
import { getSessionManager } from './services/session';
import { getConversationStorage } from './services/storage';
import { reportAnalyticsException } from './utils/analytics';
import { frontendLogger } from './utils/logger';
import { startMemoryMonitoring } from './utils/memoryManager';

declare global {
  interface Window {
    __E2E_TEST_MODE__?: boolean;
    __conversationStorage?: ReturnType<typeof getConversationStorage>;
    __TEST_BRIDGE__?: {
      getConversationStorage: () => Promise<
        ReturnType<typeof getConversationStorage>
      >;
      getSessionManager: () => ReturnType<typeof getSessionManager>;
    };
    __resolveStorageReady__?: (
      storage: ReturnType<typeof getConversationStorage>
    ) => void;
  }
}

/**
 * Main App component with all providers, error handling, and performance monitoring
 */
function App(): React.JSX.Element {
  const [showPerformanceDashboard, setShowPerformanceDashboard] =
    useState(false);

  // Set up test bridge for E2E tests (Task 2.3 & 2.4.5)
  // This needs to run inside the component to ensure __E2E_TEST_MODE__ is set
  useEffect(() => {
    if (typeof window !== 'undefined' && window.__E2E_TEST_MODE__ === true) {
      const initializeStorage = async () => {
        const storage = getConversationStorage();

        // Initialize storage first
        await storage.initialize?.();

        // Expose storage directly on window for E2E tests
        if (!window.__conversationStorage) {
          window.__conversationStorage = storage;
        }

        // Also set up test bridge for backward compatibility
        if (!window.__TEST_BRIDGE__) {
          window.__TEST_BRIDGE__ = {
            getConversationStorage: async () => storage,
            getSessionManager,
          };
        }

        // Resolve the storage ready promise if it exists
        if (window.__resolveStorageReady__) {
          window.__resolveStorageReady__(storage);
        }
      };

      void initializeStorage();
    }
  }, []);

  // Performance monitoring for the root App component
  const performanceMetrics = usePerformanceMonitoring('App', {
    enabled: true,
    slowRenderThreshold: 16,
    trackMemory: true,
    logSlowRenders: true,
  });

  // Register performance metrics globally
  usePerformanceRegistration('App', performanceMetrics);

  // Initialize IndexedDB optimization and memory monitoring on app start
  useEffect(() => {
    let cleanupInterval: ReturnType<typeof setInterval> | undefined;
    let stopMemoryMonitoring: (() => void) | undefined;

    const initializeOptimizations = async (): Promise<void> => {
      try {
        await indexedDBOptimizer.initialize();

        // Schedule periodic cleanup (every 24 hours)
        cleanupInterval = setInterval(
          () => {
            indexedDBOptimizer.cleanup(30).catch((cleanupError: unknown) => {
              frontendLogger.error('IndexedDB cleanup failed', {
                error:
                  cleanupError instanceof Error
                    ? cleanupError
                    : new Error(String(cleanupError)),
              });
            });
          },
          24 * 60 * 60 * 1000
        );

        // Task 11.4: Start memory monitoring (every 30 seconds)
        stopMemoryMonitoring = startMemoryMonitoring(30000);
        frontendLogger.info('Memory monitoring started', {
          metadata: {
            interval: '30 seconds',
          },
        });
      } catch (error) {
        frontendLogger.error('Failed to initialize IndexedDB optimization', {
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    };

    initializeOptimizations().catch(() => undefined);

    return (): void => {
      if (cleanupInterval !== undefined) {
        clearInterval(cleanupInterval);
      }

      // Task 11.4: Stop memory monitoring on unmount
      if (stopMemoryMonitoring) {
        stopMemoryMonitoring();
      }
    };
  }, []);

  // Performance budget monitoring
  useEffect(() => {
    const memoryUsage = performanceMetrics.memoryUsage?.percentage;
    if (typeof memoryUsage === 'number' && memoryUsage > 90) {
      frontendLogger.warn('Critical memory usage detected', {
        percentage: memoryUsage,
      });

      if (process.env.NODE_ENV === 'development') {
        const maybeGc = (window as typeof window & { gc?: () => void }).gc;
        if (typeof maybeGc === 'function') {
          maybeGc();
        }
      }
    }
  }, [performanceMetrics.memoryUsage]);

  return (
    <ErrorBoundary
      resetOnPropsChange={true}
      onError={(error, _errorInfo) => {
        // Enhanced error reporting with performance context
        frontendLogger.error('App error boundary captured exception', {
          metadata: {
            componentStack: _errorInfo.componentStack,
            performanceMetrics,
          },
          error,
        });

        // Report performance metrics with error for debugging
        reportAnalyticsException({
          description: error.message,
          fatal: false,
          custom_map: {
            render_count: performanceMetrics.renderCount,
            avg_render_time: performanceMetrics.averageRenderTime,
            memory_usage: performanceMetrics.memoryUsage?.percentage ?? 0,
          },
        });
      }}
    >
      <div className="min-h-screen w-full bg-gradient-to-br from-indigo-50 via-white to-cyan-100 dark:from-gray-900 dark:via-gray-800 dark:to-slate-900 transition-colors duration-500">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-300/30 dark:bg-purple-900/20 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-70 animate-blob" />
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-yellow-300/30 dark:bg-yellow-900/20 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-70 animate-blob animation-delay-2000" />
          <div className="absolute -bottom-8 left-1/3 w-96 h-96 bg-pink-300/30 dark:bg-pink-900/20 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-3xl opacity-70 animate-blob animation-delay-4000" />
        </div>

        <div className="relative z-10 h-full">
          <SessionProvider>
            <AppProvider>
              <ThemeProvider>
                <I18nProvider>
                  <NotificationProvider
                    maxNotifications={5}
                    defaultDuration={5000}
                  >
                    {/* Data Integrity Check on Startup */}
                    <IntegrityCheckInitializer />

                    <AppRouter />

                    {/* Performance Dashboard (development only) */}
                    <PerformanceDashboard
                      isVisible={showPerformanceDashboard}
                      onToggle={() =>
                        setShowPerformanceDashboard(!showPerformanceDashboard)
                      }
                      position="bottom-left"
                    />
                  </NotificationProvider>
                </I18nProvider>
              </ThemeProvider>
            </AppProvider>
          </SessionProvider>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default App;
