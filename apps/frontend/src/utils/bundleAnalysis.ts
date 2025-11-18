/**
 * Bundle analysis utilities
 * Moved from LazyRoutes to avoid Fast Refresh issues
 */

import { LazyComponentRegistry } from '../components/common/LazyComponent';

export const bundleAnalysis = {
  /**
   * Get loaded component statistics
   */
  getLoadedComponents: () => LazyComponentRegistry.getLoadedComponents(),

  /**
   * Estimate bundle size impact
   */
  estimateBundleSize: () => {
    const loadedComponents = LazyComponentRegistry.getLoadedComponents();
    return {
      loadedCount: loadedComponents.length,
      estimatedSizeKB: loadedComponents.length * 50, // Rough estimate
      loadedComponents,
    };
  },

  /**
   * Clear component registry (for testing)
   */
  clearRegistry: () => LazyComponentRegistry.clear(),
};
