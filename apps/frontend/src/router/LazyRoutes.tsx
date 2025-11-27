/**
 * Lazy Route Components
 *
 * Code-split route components with lazy loading for improved performance.
 * Implements React.lazy() with proper loading states and error boundaries.
 *
 * Requirements: 5.4
 */

import { lazy } from 'react';
import {
  withLazyLoading,
  LazyComponentRegistry,
} from '../components/common/LazyComponent';
import { sendAnalyticsEvent } from '../utils/analytics';

/**
 * Lazy-loaded page components
 */
export const LazyChatPage = withLazyLoading(
  lazy(() => import('../pages/ChatPage')),
  {
    loadingMessage: 'Loading chat interface...',
    className: 'chat-page-loading',
    retryable: true,
  }
);

export const LazySettingsPage = withLazyLoading(
  lazy(() => import('../pages/SettingsPage')),
  {
    loadingMessage: 'Loading settings...',
    className: 'settings-page-loading',
    retryable: true,
  }
);

/**
 * Lazy-loaded component chunks
 */
export const LazyConversationManager = withLazyLoading(
  lazy(() => import('../components/conversation/ConversationManager')),
  {
    loadingMessage: 'Loading conversations...',
    className: 'conversation-manager-loading',
  }
);

export const LazyOptimizedConversationList = withLazyLoading(
  lazy(() =>
    import('../components/conversation/OptimizedConversationList').then(
      (m) => ({ default: m.OptimizedConversationList })
    )
  ),
  {
    loadingMessage: 'Loading conversation list...',
    className: 'conversation-list-loading',
  }
);

export const LazyOptimizedMessageList = withLazyLoading(
  lazy(() =>
    import('../components/chat/OptimizedMessageList').then((m) => ({
      default: m.OptimizedMessageList,
    }))
  ),
  {
    loadingMessage: 'Loading messages...',
    className: 'message-list-loading',
  }
);

export const LazyContextManager = withLazyLoading(
  lazy(() =>
    import('../components/chat/ContextManager').then((m) => ({
      default: m.ContextManager,
    }))
  ),
  {
    loadingMessage: 'Loading context manager...',
    className: 'context-manager-loading',
  }
);

export const LazyFileUpload = withLazyLoading(
  lazy(() =>
    import('../components/chat/FileUpload').then((m) => ({
      default: m.FileUpload,
    }))
  ),
  {
    loadingMessage: 'Loading file upload...',
    className: 'file-upload-loading',
  }
);

export const LazyModelSelector = withLazyLoading(
  lazy(() => import('../components/common/ModelSelector')),
  {
    loadingMessage: 'Loading model selector...',
    className: 'model-selector-loading',
  }
);

/**
 * Lazy-loaded demo components (for development/testing)
 */
export const LazyModelDemo = withLazyLoading(
  lazy(() => import('../components/common/ModelDemo')),
  {
    loadingMessage: 'Loading model demo...',
    className: 'model-demo-loading',
  }
);

export const LazyThemeDemo = withLazyLoading(
  lazy(() => import('../components/common/ThemeDemo')),
  {
    loadingMessage: 'Loading theme demo...',
    className: 'theme-demo-loading',
  }
);

export const LazyConversationDemo = withLazyLoading(
  lazy(() => import('../components/conversation/ConversationDemo')),
  {
    loadingMessage: 'Loading conversation demo...',
    className: 'conversation-demo-loading',
  }
);

/**
 * Preload functions for route prefetching
 */
export const preloadRoutes = {
  chatPage: () =>
    LazyComponentRegistry.preload(
      'ChatPage',
      () => import('../pages/ChatPage')
    ),
  settingsPage: () =>
    LazyComponentRegistry.preload(
      'SettingsPage',
      () => import('../pages/SettingsPage')
    ),
  conversationManager: () =>
    LazyComponentRegistry.preload(
      'ConversationManager',
      () => import('../components/conversation/ConversationManager')
    ),
  optimizedConversationList: () =>
    LazyComponentRegistry.preload(
      'OptimizedConversationList',
      () => import('../components/conversation/OptimizedConversationList')
    ),
  optimizedMessageList: () =>
    LazyComponentRegistry.preload(
      'OptimizedMessageList',
      () => import('../components/chat/OptimizedMessageList')
    ),
  contextManager: () =>
    LazyComponentRegistry.preload(
      'ContextManager',
      () => import('../components/chat/ContextManager')
    ),
  fileUpload: () =>
    LazyComponentRegistry.preload(
      'FileUpload',
      () => import('../components/chat/FileUpload')
    ),
  modelSelector: () =>
    LazyComponentRegistry.preload(
      'ModelSelector',
      () => import('../components/common/ModelSelector')
    ),
};

/**
 * Preload critical components on app initialization
 */
export const preloadCriticalComponents = async (): Promise<void> => {
  // Preload the most commonly used components
  await Promise.allSettled([
    preloadRoutes.chatPage(),
    preloadRoutes.conversationManager(),
    preloadRoutes.optimizedMessageList(),
  ]);
};

/**
 * Preload components based on user interaction patterns
 */
export const preloadOnUserAction = {
  /**
   * Preload settings when user hovers over settings button
   */
  onSettingsHover: () => preloadRoutes.settingsPage(),

  /**
   * Preload conversation components when user starts typing
   */
  onMessageInput: () =>
    Promise.allSettled([
      preloadRoutes.optimizedMessageList(),
      preloadRoutes.fileUpload(),
    ]),

  /**
   * Preload context manager when conversation gets long
   */
  onLongConversation: () => preloadRoutes.contextManager(),

  /**
   * Preload model selector when user shows interest in models
   */
  onModelInterest: () => preloadRoutes.modelSelector(),
};

/**
 * Route-based preloading strategy
 */
export const routePreloadStrategy = {
  /**
   * Preload components likely to be needed on chat page
   */
  onChatPageLoad: () =>
    Promise.allSettled([
      preloadRoutes.optimizedConversationList(),
      preloadRoutes.optimizedMessageList(),
      preloadRoutes.fileUpload(),
    ]),

  /**
   * Preload components likely to be needed on settings page
   */
  onSettingsPageLoad: () =>
    Promise.allSettled([
      preloadRoutes.modelSelector(),
      preloadRoutes.contextManager(),
    ]),
};

/**
 * Performance monitoring for lazy loading
 */
export const lazyLoadingMetrics = {
  /**
   * Track component load times
   */
  trackLoadTime: (componentName: string, startTime: number) => {
    const loadTime = performance.now() - startTime;

    // Report to analytics if available
    sendAnalyticsEvent('lazy_component_load', {
      component_name: componentName,
      load_time: Math.round(loadTime),
    });
  },

  /**
   * Track preload effectiveness
   */
  trackPreloadHit: (componentName: string) => {
    sendAnalyticsEvent('preload_hit', {
      component_name: componentName,
    });
  },

  /**
   * Track preload miss (component loaded without preload)
   */
  trackPreloadMiss: (componentName: string) => {
    sendAnalyticsEvent('preload_miss', {
      component_name: componentName,
    });
  },
};

// Bundle analysis moved to separate file to avoid Fast Refresh issues
// Import from '../utils/bundleAnalysis' instead
