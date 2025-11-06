/**
 * Utility Functions Export
 *
 * Central export file for all utility functions including performance,
 * validation, formatting, and helper utilities.
 */

// Analytics utilities
export * from './analytics';

// Performance utilities
export * from './performance';

// Session utilities
export * from './session';

// Re-export commonly used performance hooks
export {
  usePerformanceMonitoring,
  useAsyncPerformanceMonitoring,
  useRerenderTracking,
  usePerformanceBudget,
  useGlobalPerformanceMonitoring,
  usePerformanceRegistration,
} from '../hooks/usePerformanceMonitoring';

// Re-export optimization services
export { indexedDBOptimizer } from '../services/indexeddb-optimization';

// Re-export lazy loading utilities
export {
  withLazyLoading,
  LazyComponentRegistry,
  PreloadOnHover,
  useDynamicImport,
  preloadLazyComponent,
} from '../components/common/LazyComponent';

// Re-export virtualized components
export {
  VirtualizedList,
  useVirtualizedList,
  type VirtualizedListProps,
  type VirtualizedListRef,
  type VirtualizedItemRenderer,
} from '../components/common/VirtualizedList';

// Re-export optimized components
export { OptimizedMessageList } from '../components/chat/OptimizedMessageList';
export { OptimizedConversationList } from '../components/conversation/OptimizedConversationList';

// Re-export performance dashboard
export { PerformanceDashboard } from '../components/common/PerformanceDashboard';
