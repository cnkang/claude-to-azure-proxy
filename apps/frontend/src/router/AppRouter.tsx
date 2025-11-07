/**
 * App Router Component
 *
 * Main application router with route definitions and navigation structure.
 * Handles routing between chat interface and settings pages.
 *
 * Requirements: 1.1, 5.1, 5.2, 5.3, 10.1
 */

import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout.js';
import { useI18n } from '../contexts/I18nContext.js';
import {
  LazyChatPage,
  LazySettingsPage,
  preloadCriticalComponents,
  routePreloadStrategy,
  preloadOnUserAction,
} from './LazyRoutes.js';
import { PreloadOnHover } from '../components/common/LazyComponent.js';

/**
 * Loading component for route transitions
 */
function RouteLoading(): React.JSX.Element {
  const { t } = useI18n();

  return (
    <div className="route-loading">
      <div className="loading-content">
        <div className="loading-spinner">
          <div className="spinner" />
        </div>
        <p className="loading-text">{t('common.loading')}</p>
      </div>
    </div>
  );
}

/**
 * Not found page component
 */
function NotFoundPage(): React.JSX.Element {
  const { t } = useI18n();

  return (
    <div className="not-found-page">
      <div className="not-found-content">
        <div className="not-found-icon">🔍</div>
        <h1 className="not-found-title">{t('notFound.title')}</h1>
        <p className="not-found-description">{t('notFound.description')}</p>
        <a href="/" className="not-found-link">
          {t('notFound.goHome')}
        </a>
      </div>
    </div>
  );
}

/**
 * Route guard component for protected routes
 */
interface RouteGuardProps {
  children: React.ReactNode;
  requireSession?: boolean;
}

function RouteGuard({
  children,
  requireSession: _requireSession = true,
}: RouteGuardProps): React.JSX.Element {
  // For now, we'll just render children
  // In the future, this could check for session validity
  return <>{children}</>;
}

/**
 * Route preloader component
 */
interface RoutePreloaderProps {
  children: React.ReactNode;
  onLoad?: () => void;
}

function RoutePreloader({
  children,
  onLoad,
}: RoutePreloaderProps): React.JSX.Element {
  React.useEffect(() => {
    onLoad?.();
  }, [onLoad]);

  return <>{children}</>;
}

/**
 * App router component with lazy loading and preloading
 */
export function AppRouter(): React.JSX.Element {
  // Preload critical components on app initialization
  useEffect(() => {
    preloadCriticalComponents().catch(() => {
      /* Ignore preload errors */
    });
  }, []);

  return (
    <BrowserRouter>
      <AppLayout>
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            {/* Default route - redirect to chat */}
            <Route path="/" element={<Navigate to="/chat" replace />} />

            {/* Chat interface with preloading */}
            <Route
              path="/chat"
              element={
                <RouteGuard>
                  <RoutePreloader
                    onLoad={() => routePreloadStrategy.onChatPageLoad()}
                  >
                    <LazyChatPage />
                  </RoutePreloader>
                </RouteGuard>
              }
            />

            {/* Conversation-specific route */}
            <Route
              path="/chat/:conversationId"
              element={
                <RouteGuard>
                  <RoutePreloader
                    onLoad={() => routePreloadStrategy.onChatPageLoad()}
                  >
                    <LazyChatPage />
                  </RoutePreloader>
                </RouteGuard>
              }
            />

            {/* Settings page with preloading */}
            <Route
              path="/settings"
              element={
                <RouteGuard>
                  <PreloadOnHover preload={preloadOnUserAction.onSettingsHover}>
                    <RoutePreloader
                      onLoad={() => routePreloadStrategy.onSettingsPageLoad()}
                    >
                      <LazySettingsPage />
                    </RoutePreloader>
                  </PreloadOnHover>
                </RouteGuard>
              }
            />

            {/* 404 Not Found */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </AppLayout>
    </BrowserRouter>
  );
}

/**
 * Hook for programmatic navigation
 */
export interface AppNavigation {
  readonly navigate: (path: string) => void;
  readonly navigateToChat: (conversationId?: string) => void;
  readonly navigateToSettings: () => void;
  readonly goBack: () => void;
  readonly goForward: () => void;
}

export function useAppNavigation(): AppNavigation {
  const navigate = (path: string): void => {
    window.location.href = path;
  };

  const navigateToChat = (conversationId?: string): void => {
    if (typeof conversationId === 'string' && conversationId.length > 0) {
      navigate(`/chat/${conversationId}`);
    } else {
      navigate('/chat');
    }
  };

  const navigateToSettings = (): void => {
    navigate('/settings');
  };

  const goBack = (): void => {
    window.history.back();
  };

  const goForward = (): void => {
    window.history.forward();
  };

  return {
    navigate,
    navigateToChat,
    navigateToSettings,
    goBack,
    goForward,
  };
}

/**
 * Hook for current route information
 */
export interface CurrentRoute {
  readonly path: string;
  readonly search: string;
  readonly hash: string;
  readonly isChat: boolean;
  readonly isSettings: boolean;
  readonly conversationId: string | null;
  readonly fullUrl: string;
}

export function useCurrentRoute(): CurrentRoute {
  const path = window.location.pathname;
  const search = window.location.search;
  const hash = window.location.hash;

  const isChat = path.startsWith('/chat');
  const isSettings = path === '/settings';
  const conversationMatch = path.match(/^\/chat\/(.+)$/);
  const conversationId =
    conversationMatch !== null ? conversationMatch[1] : null;

  return {
    path,
    search,
    hash,
    isChat,
    isSettings,
    conversationId,
    fullUrl: window.location.href,
  };
}

/**
 * Breadcrumb data hook
 */
export interface BreadcrumbDescriptor {
  readonly label: string;
  readonly href?: string;
  readonly active: boolean;
}

export function useBreadcrumbs(): BreadcrumbDescriptor[] {
  const { t } = useI18n();
  const { isChat, isSettings, conversationId } = useCurrentRoute();

  const breadcrumbs: BreadcrumbDescriptor[] = [];

  if (isChat === true) {
    breadcrumbs.push({
      label: t('navigation.chat'),
      href: '/chat',
      active: conversationId === null,
    });

    if (conversationId !== null) {
      breadcrumbs.push({
        label: t('navigation.conversation'),
        active: true,
      });
    }
  } else if (isSettings === true) {
    breadcrumbs.push({
      label: t('navigation.settings'),
      active: true,
    });
  }

  return breadcrumbs;
}
