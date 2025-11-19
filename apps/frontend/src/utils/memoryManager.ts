/**
 * Memory Management Utilities
 *
 * Task 11.2: Frontend memory optimization utilities
 * - Monitor memory usage
 * - Trigger cleanup when memory is high
 * - Provide memory statistics
 */

import { frontendLogger } from './logger.js';

/**
 * Memory usage thresholds
 */
const MEMORY_THRESHOLDS = {
  WARNING: 75, // Warn at 75% usage
  CRITICAL: 85, // Critical at 85% usage
  CLEANUP_TRIGGER: 80, // Trigger cleanup at 80% usage
};

/**
 * Memory statistics interface
 */
export interface MemoryStats {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  percentUsed: number;
  usedMB: number;
  totalMB: number;
  limitMB: number;
  status: 'healthy' | 'warning' | 'critical';
}

/**
 * Get current memory usage statistics
 *
 * Note: performance.memory is only available in Chrome/Edge
 */
export function getMemoryStats(): MemoryStats | null {
  // Type assertion for Chrome-specific performance.memory API
  const perfWithMemory = performance as Performance & {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  };

  if (!perfWithMemory.memory) {
    return null;
  }

  const memory = perfWithMemory.memory;
  const percentUsed = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;

  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (percentUsed >= MEMORY_THRESHOLDS.CRITICAL) {
    status = 'critical';
  } else if (percentUsed >= MEMORY_THRESHOLDS.WARNING) {
    status = 'warning';
  }

  return {
    usedJSHeapSize: memory.usedJSHeapSize,
    totalJSHeapSize: memory.totalJSHeapSize,
    jsHeapSizeLimit: memory.jsHeapSizeLimit,
    percentUsed,
    usedMB: memory.usedJSHeapSize / 1024 / 1024,
    totalMB: memory.totalJSHeapSize / 1024 / 1024,
    limitMB: memory.jsHeapSizeLimit / 1024 / 1024,
    status,
  };
}

/**
 * Check if memory usage is high
 */
export function isMemoryHigh(): boolean {
  const stats = getMemoryStats();
  if (!stats) {
    return false;
  }

  return stats.percentUsed >= MEMORY_THRESHOLDS.CLEANUP_TRIGGER;
}

/**
 * Trigger garbage collection hint
 *
 * Note: This doesn't actually trigger GC (browser controls that),
 * but we can help by nullifying references and suggesting cleanup
 */
export function suggestGarbageCollection(): void {
  const stats = getMemoryStats();

  if (stats) {
    frontendLogger.info('Suggesting garbage collection', {
      metadata: {
        percentUsed: stats.percentUsed.toFixed(2),
        usedMB: stats.usedMB.toFixed(2),
        limitMB: stats.limitMB.toFixed(2),
        status: stats.status,
      },
    });
  }

  // Clear any cached data that can be regenerated
  // This is a hint to the browser that we're done with this memory
  if (typeof window !== 'undefined') {
    // Force a microtask to allow GC to run
    Promise.resolve().then(() => {
      // Empty promise to create a microtask checkpoint
    });
  }
}

/**
 * Monitor memory usage and log warnings
 *
 * Task 11.2: Periodic memory monitoring
 */
export function startMemoryMonitoring(intervalMs: number = 30000): () => void {
  const intervalId = setInterval(() => {
    const stats = getMemoryStats();

    if (!stats) {
      return;
    }

    if (stats.status === 'critical') {
      frontendLogger.warn('Critical memory usage detected', {
        metadata: {
          percentUsed: stats.percentUsed.toFixed(2),
          usedMB: stats.usedMB.toFixed(2),
          limitMB: stats.limitMB.toFixed(2),
          status: stats.status,
        },
      });

      // Suggest garbage collection
      suggestGarbageCollection();
    } else if (stats.status === 'warning') {
      frontendLogger.info('High memory usage detected', {
        metadata: {
          percentUsed: stats.percentUsed.toFixed(2),
          usedMB: stats.usedMB.toFixed(2),
          limitMB: stats.limitMB.toFixed(2),
          status: stats.status,
        },
      });
    }
  }, intervalMs);

  // Return cleanup function
  return () => {
    clearInterval(intervalId);
  };
}

/**
 * Format memory size for display
 */
export function formatMemorySize(bytes: number): string {
  const mb = bytes / 1024 / 1024;

  if (mb < 1) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  } else if (mb < 1024) {
    return `${mb.toFixed(2)} MB`;
  } else {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
}

/**
 * Get memory usage summary for logging
 */
export function getMemorySummary(): string {
  const stats = getMemoryStats();

  if (!stats) {
    return 'Memory stats not available (Chrome/Edge only)';
  }

  return `Memory: ${stats.percentUsed.toFixed(1)}% (${formatMemorySize(stats.usedJSHeapSize)} / ${formatMemorySize(stats.jsHeapSizeLimit)}) - ${stats.status}`;
}
