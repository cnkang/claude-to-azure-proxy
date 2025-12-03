/**
 * Performance Monitoring Hook
 *
 * Hook for monitoring React component performance, memory usage,
 * and rendering patterns to identify optimization opportunities.
 *
 * Requirements: 5.4
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { PerformanceMonitor, getMemoryUsage } from '../utils/performance';

/**
 * Performance metrics interface
 */
export interface PerformanceMetrics {
  renderCount: number;
  averageRenderTime: number;
  lastRenderTime: number;
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  } | null;
  slowRenders: number;
  componentName: string;
}

/**
 * Performance monitoring options
 */
interface PerformanceMonitoringOptions {
  enabled?: boolean;
  slowRenderThreshold?: number;
  memoryCheckInterval?: number;
  logSlowRenders?: boolean;
  trackMemory?: boolean;
}

/**
 * Hook for monitoring component performance
 */
export function usePerformanceMonitoring(
  componentName: string,
  options: PerformanceMonitoringOptions = {}
): PerformanceMetrics {
  const {
    enabled = process.env.NODE_ENV === 'development',
    slowRenderThreshold = 16, // 60fps threshold
    memoryCheckInterval = 5000, // 5 seconds
    logSlowRenders = true,
    trackMemory = true,
  } = options;

  const renderCount = useRef(0);
  const renderTimes = useRef<number[]>([]);
  const slowRenders = useRef(0);
  const lastRenderStart = useRef(performance.now());
  const [memoryUsage, setMemoryUsage] = useState<{
    used: number;
    total: number;
    percentage: number;
  } | null>(null);

  // Track render start time
  useEffect(() => {
    if (!enabled) {
      return;
    }

    lastRenderStart.current = performance.now();
  });

  // Track render completion
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const renderTime = performance.now() - lastRenderStart.current;
    renderCount.current += 1;
    renderTimes.current.push(renderTime);

    // Keep only last 100 render times for average calculation
    if (renderTimes.current.length > 100) {
      renderTimes.current.shift();
    }

    // Track slow renders
    if (renderTime > slowRenderThreshold) {
      slowRenders.current += 1;

      if (logSlowRenders) {
      }
    }
  });

  // Monitor memory usage
  useEffect(() => {
    if (!enabled || !trackMemory) {
      return;
    }

    const updateMemoryUsage = () => {
      const memory = getMemoryUsage();
      if (memory) {
        setMemoryUsage(memory);

        // Warn about high memory usage
        if (memory.percentage > 80) {
        }
      }
    };

    updateMemoryUsage();
    const interval = setInterval(updateMemoryUsage, memoryCheckInterval);

    return () => clearInterval(interval);
  }, [enabled, trackMemory, memoryCheckInterval]);

  // Calculate metrics
  const averageRenderTime =
    renderTimes.current.length > 0
      ? renderTimes.current.reduce((sum, time) => sum + time, 0) /
        renderTimes.current.length
      : 0;

  const lastRenderTime =
    renderTimes.current[renderTimes.current.length - 1] || 0;

  return {
    renderCount: renderCount.current,
    averageRenderTime,
    lastRenderTime,
    memoryUsage,
    slowRenders: slowRenders.current,
    componentName,
  };
}

/**
 * Hook for monitoring async operations performance
 */
export function useAsyncPerformanceMonitoring() {
  const activeOperations = useRef(new Map<string, number>());

  const startOperation = useCallback((operationName: string): string => {
    const operationId = `${operationName}_${Date.now()}_${Math.random()}`;
    activeOperations.current.set(operationId, performance.now());
    PerformanceMonitor.startMeasurement(operationId);
    return operationId;
  }, []);

  const endOperation = useCallback((operationId: string): number => {
    const startTime = activeOperations.current.get(operationId);
    if (startTime === undefined) {
      return 0;
    }

    activeOperations.current.delete(operationId);
    return PerformanceMonitor.endMeasurement(operationId);
  }, []);

  const measureAsync = useCallback(
    async <T>(operationName: string, asyncFn: () => Promise<T>): Promise<T> => {
      const operationId = startOperation(operationName);
      try {
        const result = await asyncFn();
        endOperation(operationId);
        return result;
      } catch (error) {
        endOperation(operationId);
        throw error;
      }
    },
    [startOperation, endOperation]
  );

  return {
    startOperation,
    endOperation,
    measureAsync,
  };
}

/**
 * Hook for monitoring component re-render causes
 */
export function useRerenderTracking(
  componentName: string,
  props: Record<string, unknown>,
  enabled = process.env.NODE_ENV === 'development'
) {
  const previousProps = useRef<Record<string, unknown> | undefined>(undefined);
  const renderCount = useRef(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    renderCount.current += 1;

    if (previousProps.current && renderCount.current > 1) {
      const changedProps: string[] = [];

      // Check for changed props
      Object.keys(props).forEach((key) => {
        if (previousProps.current![key] !== props[key]) {
          changedProps.push(key);
        }
      });

      // Check for removed props
      Object.keys(previousProps.current).forEach((key) => {
        if (!(key in props)) {
          changedProps.push(`-${key}`);
        }
      });

      if (changedProps.length > 0) {
        // Props changed
      } else {
        // No prop changes detected
      }
    }

    previousProps.current = { ...props };
  });
}

/**
 * Hook for performance budget monitoring
 */
export function usePerformanceBudget(
  budgets: {
    maxRenderTime?: number;
    maxMemoryUsage?: number;
    maxRenderCount?: number;
  },
  onBudgetExceeded?: (metric: string, value: number, budget: number) => void
) {
  const {
    maxRenderTime = 16,
    maxMemoryUsage = 80, // percentage
    maxRenderCount = 100,
  } = budgets;

  const checkBudget = useCallback(
    (metrics: PerformanceMetrics) => {
      // Check render time budget
      if (metrics.lastRenderTime > maxRenderTime) {
        onBudgetExceeded?.('renderTime', metrics.lastRenderTime, maxRenderTime);
      }

      // Check memory usage budget
      if (
        metrics.memoryUsage &&
        metrics.memoryUsage.percentage > maxMemoryUsage
      ) {
        onBudgetExceeded?.(
          'memoryUsage',
          metrics.memoryUsage.percentage,
          maxMemoryUsage
        );
      }

      // Check render count budget
      if (metrics.renderCount > maxRenderCount) {
        onBudgetExceeded?.('renderCount', metrics.renderCount, maxRenderCount);
      }
    },
    [maxRenderTime, maxMemoryUsage, maxRenderCount, onBudgetExceeded]
  );

  return { checkBudget };
}

/**
 * Global performance monitoring state
 */
class GlobalPerformanceMonitor {
  private static instance: GlobalPerformanceMonitor;
  private readonly metrics = new Map<string, PerformanceMetrics>();
  private readonly subscribers = new Set<
    (metrics: Map<string, PerformanceMetrics>) => void
  >();

  static getInstance(): GlobalPerformanceMonitor {
    if (!GlobalPerformanceMonitor.instance) {
      GlobalPerformanceMonitor.instance = new GlobalPerformanceMonitor();
    }
    return GlobalPerformanceMonitor.instance;
  }

  updateMetrics(componentName: string, metrics: PerformanceMetrics): void {
    this.metrics.set(componentName, metrics);
    this.notifySubscribers();
  }

  getMetrics(): Map<string, PerformanceMetrics> {
    return new Map(this.metrics);
  }

  subscribe(
    callback: (metrics: Map<string, PerformanceMetrics>) => void
  ): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private notifySubscribers(): void {
    this.subscribers.forEach((callback) => callback(this.getMetrics()));
  }

  getWorstPerformers(limit = 5): PerformanceMetrics[] {
    return Array.from(this.metrics.values())
      .sort((a, b) => b.averageRenderTime - a.averageRenderTime)
      .slice(0, limit);
  }

  getTotalSlowRenders(): number {
    return Array.from(this.metrics.values()).reduce(
      (total, metrics) => total + metrics.slowRenders,
      0
    );
  }

  clear(): void {
    this.metrics.clear();
    this.notifySubscribers();
  }
}

/**
 * Hook for global performance monitoring
 */
export function useGlobalPerformanceMonitoring() {
  const monitor = GlobalPerformanceMonitor.getInstance();
  const [metrics, setMetrics] = useState<Map<string, PerformanceMetrics>>(
    monitor.getMetrics()
  );

  useEffect(() => {
    return monitor.subscribe(setMetrics);
  }, [monitor]);

  return {
    metrics,
    worstPerformers: monitor.getWorstPerformers(),
    totalSlowRenders: monitor.getTotalSlowRenders(),
    clearMetrics: () => monitor.clear(),
  };
}

/**
 * Performance monitoring context for component registration
 */
export function usePerformanceRegistration(
  componentName: string,
  metrics: PerformanceMetrics
): void {
  useEffect(() => {
    const monitor = GlobalPerformanceMonitor.getInstance();
    monitor.updateMetrics(componentName, metrics);
  }, [componentName, metrics]);
}
