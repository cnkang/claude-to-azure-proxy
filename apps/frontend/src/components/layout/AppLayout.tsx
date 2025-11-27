/**
 * App Layout Component
 *
 * Main application layout with responsive design, sidebar, and mobile-first approach.
 * Provides the overall structure for the chat interface.
 *
 * Requirements: 5.1, 5.2, 5.3, 10.1
 */

import React, { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { isNonEmptyString } from '@repo/shared-utils';
import { useAppContext } from '../../contexts/AppContext.js';
import { useTheme } from '../../contexts/ThemeContext.js';
import { useI18n } from '../../contexts/I18nContext.js';
import { Sidebar } from './Sidebar.js';
import { Header } from './Header.js';
import { ErrorBoundary } from '../common/ErrorBoundary.js';
import { AccessibilityProvider, SkipLink } from '../accessibility/index.js';
import { cn } from '../ui/Glass.js';
import { debounce } from '../../utils/performance.js';

/**
 * Responsive breakpoints (in pixels)
 * Mobile: < 768px
 * Tablet: 768px - 1024px
 * Desktop: > 1024px
 */
const BREAKPOINTS = {
  MOBILE: 768,
  TABLET: 1024,
} as const;

/**
 * App layout props
 */
export interface AppLayoutProps {
  children: ReactNode;
}

/**
 * App layout component
 */
export function AppLayout({ children }: AppLayoutProps): React.JSX.Element {
  const { state, setSidebarOpen, setError } = useAppContext();
  const { resolvedTheme } = useTheme();
  const { isRTL, t } = useI18n();
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [isTablet, setIsTablet] = useState<boolean>(false);
  const prevIsMobileRef = useRef<boolean>(false);

  // Check screen size and update responsive state
  const checkScreenSize = useCallback((): void => {
    const width = window.innerWidth;
    const newIsMobile = width < BREAKPOINTS.MOBILE;
    const newIsTablet = width >= BREAKPOINTS.MOBILE && width < BREAKPOINTS.TABLET;
    
    setIsMobile(newIsMobile);
    setIsTablet(newIsTablet);
  }, []);

  // Create debounced version of checkScreenSize for performance
  const debouncedCheckScreenSize = useMemo(
    () => debounce(checkScreenSize, 300),
    [checkScreenSize]
  );

  // Detect screen size for responsive behavior
  useEffect(() => {
    // Initial check (not debounced for immediate feedback)
    checkScreenSize();

    // Listen for resize and orientation change events (debounced)
    window.addEventListener('resize', debouncedCheckScreenSize);
    window.addEventListener('orientationchange', debouncedCheckScreenSize);

    return (): void => {
      window.removeEventListener('resize', debouncedCheckScreenSize);
      window.removeEventListener('orientationchange', debouncedCheckScreenSize);
    };
  }, [checkScreenSize, debouncedCheckScreenSize]);

  // Auto-close sidebar when transitioning TO mobile (not when already mobile)
  useEffect(() => {
    // Only close sidebar when transitioning from non-mobile to mobile
    if (isMobile && !prevIsMobileRef.current && state.ui.sidebarOpen) {
      setSidebarOpen(false);
    }
    
    // Update previous mobile state
    prevIsMobileRef.current = isMobile;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, setSidebarOpen]);
  // Note: state.ui.sidebarOpen is intentionally excluded to prevent infinite loops
  // We only want to close the sidebar when transitioning TO mobile, not when it opens/closes

  // Handle sidebar overlay click on mobile
  const handleOverlayClick = (): void => {
    if (isMobile === true) {
      setSidebarOpen(false);
    }
  };

  // Handle escape key to close sidebar on mobile
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && isMobile && state.ui.sidebarOpen) {
        setSidebarOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return (): void => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobile, state.ui.sidebarOpen, setSidebarOpen]);

  const hasUiError = isNonEmptyString(state.ui.error);
  const currentErrorMessage = hasUiError ? state.ui.error : undefined;

  return (
    <AccessibilityProvider wcagLevel="AAA">
      <div
        className={cn(
          "flex flex-col h-screen w-full overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-black text-gray-900 dark:text-gray-100 transition-colors duration-300",
          resolvedTheme === 'dark' ? 'dark' : '',
          isRTL ? 'rtl' : 'ltr'
        )}
        dir={isRTL ? 'rtl' : 'ltr'}
        data-testid="app-container"
      >
        {/* Skip to main content link for accessibility */}
        <SkipLink
          targetId="main-content"
          text={t('accessibility.skipToMain')}
        />

        <div className="flex flex-1 overflow-hidden relative">
          {/* Sidebar */}
          <Sidebar
            isOpen={state.ui.sidebarOpen}
            isMobile={isMobile}
            onClose={() => setSidebarOpen(false)}
          />

          {/* Sidebar overlay for mobile */}
          {isMobile && state.ui.sidebarOpen && (
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300"
              onClick={handleOverlayClick}
              aria-hidden="true"
            />
          )}

          {/* Main content area with header */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header - only in main content area */}
            <Header isMobile={isMobile} isTablet={isTablet} />

            {/* Main content */}
            <main
              id="main-content"
              className="flex-1 relative z-10 overflow-y-auto scroll-smooth"
              role="main"
              aria-label={t('accessibility.chatInterface')}
            >
              <div className="min-h-full p-4 md:p-6 max-w-7xl mx-auto w-full">
                <ErrorBoundary>{children}</ErrorBoundary>
              </div>
            </main>
          </div>
        </div>

        {/* Loading overlay */}
        {state.ui.isLoading && (
          <div
            className="fixed inset-0 bg-white/50 dark:bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center"
            role="status"
            aria-live="polite"
            data-testid="loading-spinner"
          >
            <div className="flex flex-col items-center gap-4 p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-lg font-medium text-gray-700 dark:text-gray-200">{t('loading.default')}</span>
            </div>
          </div>
        )}

        {/* Error notification */}
        {hasUiError && currentErrorMessage !== undefined && (
          <div
            className="fixed bottom-4 right-4 z-50 animate-slide-up"
            role="alert"
            aria-live="assertive"
            data-testid="error-message"
          >
            <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl shadow-lg text-red-700 dark:text-red-300 max-w-md">
              <span className="text-xl">⚠️</span>
              <span className="flex-1 text-sm font-medium">{currentErrorMessage}</span>
              <button
                type="button"
                className="p-1 hover:bg-red-100 dark:hover:bg-red-800/30 rounded-full transition-colors"
                onClick={() => setError(null)}
                aria-label={t('accessibility.closeError')}
              >
                ×
              </button>
            </div>
          </div>
        )}
      </div>
    </AccessibilityProvider>
  );
}

/**
 * Layout container for specific sections
 */
export interface LayoutContainerProps {
  children: ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function LayoutContainer({
  children,
  className = '',
  maxWidth = 'full',
  padding = 'md',
}: LayoutContainerProps): React.JSX.Element {
  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-full',
  };

  const paddingClasses = {
    none: 'p-0',
    sm: 'p-2',
    md: 'p-4',
    lg: 'p-6',
  };

  return (
    <div className={cn(
      "mx-auto w-full",
      maxWidthClasses[maxWidth],
      paddingClasses[padding],
      className
    )}>
      {children}
    </div>
  );
}

/**
 * Responsive grid component
 */
export interface ResponsiveGridProps {
  children: ReactNode;
  className?: string;
  columns?: {
    mobile?: number;
    tablet?: number;
    desktop?: number;
  };
  gap?: 'sm' | 'md' | 'lg';
}

export function ResponsiveGrid({
  children,
  className = '',
  columns = { mobile: 1, tablet: 2, desktop: 3 },
  gap = 'md',
}: ResponsiveGridProps): React.JSX.Element {
  const gapClasses = {
    sm: 'gap-2',
    md: 'gap-4',
    lg: 'gap-6',
  };

  const gridStyle = {
    '--grid-cols-mobile': columns.mobile ?? 1,
    '--grid-cols-tablet': columns.tablet ?? 2,
    '--grid-cols-desktop': columns.desktop ?? 3,
  } as React.CSSProperties;

  return (
    <div 
      className={cn(
        "grid",
        "grid-cols-[repeat(var(--grid-cols-mobile),minmax(0,1fr))]",
        "md:grid-cols-[repeat(var(--grid-cols-tablet),minmax(0,1fr))]",
        "lg:grid-cols-[repeat(var(--grid-cols-desktop),minmax(0,1fr))]",
        gapClasses[gap],
        className
      )} 
      style={gridStyle}
    >
      {children}
    </div>
  );
}
