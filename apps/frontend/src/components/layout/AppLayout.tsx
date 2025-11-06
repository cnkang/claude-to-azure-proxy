/**
 * App Layout Component
 * 
 * Main application layout with responsive design, sidebar, and mobile-first approach.
 * Provides the overall structure for the chat interface.
 * 
 * Requirements: 5.1, 5.2, 5.3, 10.1
 */

import React, { useState, useEffect, type ReactNode } from 'react';
import { isNonEmptyString } from '@repo/shared-utils';
import { useAppContext } from '../../contexts/AppContext.js';
import { useTheme } from '../../contexts/ThemeContext.js';
import { useI18n } from '../../contexts/I18nContext.js';
import { Sidebar } from './Sidebar.js';
import { Header } from './Header.js';
import { ErrorBoundary } from '../common/ErrorBoundary.js';
import { AccessibilityProvider, SkipLink } from '../accessibility/index.js';
import './AppLayout.css';

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

  // Detect screen size for responsive behavior
  useEffect(() => {
    const checkScreenSize = (): void => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      setIsTablet(width >= 768 && width < 1024);
    };

    // Initial check
    checkScreenSize();

    // Listen for resize events
    window.addEventListener('resize', checkScreenSize);
    
    return (): void => {
      window.removeEventListener('resize', checkScreenSize);
    };
  }, []);

  // Auto-close sidebar on mobile when screen size changes
  useEffect(() => {
    if (isMobile && state.ui.sidebarOpen) {
      setSidebarOpen(false);
    }
  }, [isMobile, setSidebarOpen, state.ui.sidebarOpen]);

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

  const layoutClasses = [
    'app-layout',
    `theme-${resolvedTheme}`,
    isRTL ? 'rtl' : 'ltr',
    isMobile ? 'mobile' : '',
    isTablet ? 'tablet' : '',
    state.ui.sidebarOpen ? 'sidebar-open' : 'sidebar-closed',
  ].filter((value): value is string => value.length > 0).join(' ');

  const hasUiError = isNonEmptyString(state.ui.error);
  const currentErrorMessage = hasUiError ? state.ui.error : undefined;

  return (
    <AccessibilityProvider wcagLevel="AAA">
      <div className={layoutClasses} dir={isRTL ? 'rtl' : 'ltr'}>
        {/* Skip to main content link for accessibility */}
        <SkipLink
          targetId="main-content"
          text={t('accessibility.skipToMain')}
        />

        {/* Header */}
        <Header isMobile={isMobile} isTablet={isTablet} />

        {/* Sidebar */}
        <Sidebar
          isOpen={state.ui.sidebarOpen}
          isMobile={isMobile}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Sidebar overlay for mobile */}
        {isMobile && state.ui.sidebarOpen && (
          <div
            className="sidebar-overlay"
            onClick={handleOverlayClick}
            aria-hidden="true"
          />
        )}

        {/* Main content area */}
        <main
          id="main-content"
          className="main-content"
          role="main"
          aria-label={t('accessibility.chatInterface')}
        >
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>

        {/* Loading overlay */}
        {state.ui.isLoading && (
          <div className="loading-overlay" role="status" aria-live="polite">
            <div className="loading-spinner">
              <div className="spinner" />
              <span className="loading-text">{t('loading.default')}</span>
            </div>
          </div>
        )}

        {/* Error notification */}
        {hasUiError && currentErrorMessage !== undefined && (
          <div
            className="error-notification"
            role="alert"
            aria-live="assertive"
          >
            <div className="error-content">
              <span className="error-icon">⚠️</span>
              <span className="error-message">{currentErrorMessage}</span>
              <button
                type="button"
                className="error-close"
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
  padding = 'md'
}: LayoutContainerProps): React.JSX.Element {
  const containerClasses = [
    'layout-container',
    `max-width-${maxWidth}`,
    `padding-${padding}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClasses}>
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
  gap = 'md'
}: ResponsiveGridProps): React.JSX.Element {
  const gridClasses = [
    'responsive-grid',
    `gap-${gap}`,
    className,
  ].filter(Boolean).join(' ');

  const gridStyle = {
    '--grid-columns-mobile': columns.mobile ?? 1,
    '--grid-columns-tablet': columns.tablet ?? 2,
    '--grid-columns-desktop': columns.desktop ?? 3,
  } as React.CSSProperties;

  return (
    <div className={gridClasses} style={gridStyle}>
      {children}
    </div>
  );
}
