/**
 * Performance Dashboard Component
 *
 * Development tool for monitoring React component performance,
 * memory usage, and rendering patterns in real-time.
 *
 * Requirements: 5.4
 */

import React, { useState, memo, useEffect } from 'react';
import {
  type PerformanceMetrics,
  useGlobalPerformanceMonitoring,
} from '../../hooks/usePerformanceMonitoring.js';
import { indexedDBOptimizer } from '../../services/indexeddb-optimization.js';
import {
  type MetricStats,
  OperationType,
  getPerformanceMetrics,
} from '../../utils/performance-metrics.js';
import { getMemoryUsage } from '../../utils/performance.js';
import { Glass, cn } from '../ui/Glass.js';

interface IndexedDbStats {
  conversationCount: number;
  messageCount: number;
  cacheHitRate: number;
  storageUsed: number;
}

/**
 * Performance dashboard props
 */
interface PerformanceDashboardProps {
  isVisible?: boolean;
  onToggle?: () => void;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

/**
 * Performance metrics display component
 */
const MetricsDisplay = memo<{
  title: string;
  value: string | number;
  unit?: string;
  status?: 'good' | 'warning' | 'critical';
}>(({ title, value, unit = '', status = 'good' }) => (
  <div
    className={cn(
      'p-2 rounded-lg text-center border',
      status === 'good' && 'bg-green-500/20 border-green-500/30 text-green-100',
      status === 'warning' &&
        'bg-amber-500/20 border-amber-500/30 text-amber-100',
      status === 'critical' && 'bg-red-500/20 border-red-500/30 text-red-100'
    )}
  >
    <div className="text-[10px] opacity-80 mb-0.5">{title}</div>
    <div className="text-xs font-bold">
      {value}
      {unit}
    </div>
  </div>
));

MetricsDisplay.displayName = 'MetricsDisplay';

/**
 * Component performance list
 */
const ComponentPerformanceList = memo<{
  metrics: Map<string, PerformanceMetrics>;
}>(({ metrics }) => (
  <div className="space-y-2">
    <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
      Component Performance
    </h4>
    <div className="space-y-1 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
      {Array.from(metrics.entries()).map(([name, metric]) => (
        <div key={name} className="py-1 border-b border-gray-700 last:border-0">
          <div className="text-xs font-bold mb-0.5">{name}</div>
          <div className="flex items-center gap-3 text-[10px] opacity-80">
            <span>Renders: {metric.renderCount}</span>
            <span
              className={cn(
                metric.averageRenderTime > 16
                  ? 'text-amber-400'
                  : 'text-green-400'
              )}
            >
              Avg: {metric.averageRenderTime.toFixed(2)}ms
            </span>
            {metric.slowRenders > 0 && (
              <span className="text-red-400">Slow: {metric.slowRenders}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  </div>
));

ComponentPerformanceList.displayName = 'ComponentPerformanceList';

/**
 * Memory usage chart (simplified)
 */
const MemoryChart = memo<{
  memoryHistory: Array<{ timestamp: number; usage: number }>;
}>(({ memoryHistory }) => {
  const maxUsage = Math.max(...memoryHistory.map((h) => h.usage), 50);

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
        Memory Usage History
      </h4>
      <div className="relative h-[60px] w-full bg-gray-900/50 rounded border border-gray-700">
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 200 60"
          preserveAspectRatio="none"
        >
          <title>Memory usage history</title>
          <polyline
            points={memoryHistory
              .map(
                (point, index) =>
                  `${(index / (memoryHistory.length - 1)) * 200},${60 - (point.usage / maxUsage) * 60}`
              )
              .join(' ')}
            fill="none"
            stroke="#4CAF50"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="absolute inset-0 flex justify-between items-end px-1 pb-0.5 text-[9px] text-gray-700 pointer-events-none">
          <span>0%</span>
          <span>{maxUsage.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
});

MemoryChart.displayName = 'MemoryChart';

/**
 * Persistence metrics display component
 *
 * Task 9.3: Display persistence metrics (avg latency, success rate)
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
const PersistenceMetrics = memo(() => {
  const [persistenceStats, setPersistenceStats] = useState<
    Map<OperationType, MetricStats>
  >(new Map());

  useEffect(() => {
    const updateStats = () => {
      const metrics = getPerformanceMetrics();
      setPersistenceStats(metrics.getAllStats());
    };

    updateStats();
    const interval = setInterval(updateStats, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, []);

  // Filter to show only persistence-related operations
  const persistenceOperations = [
    OperationType.TITLE_UPDATE,
    OperationType.DELETION,
    OperationType.SEARCH,
    OperationType.CROSS_TAB_SYNC,
    OperationType.INTEGRITY_CHECK,
  ];

  const getStatusColorClass = (latency: number, target: number): string => {
    if (latency <= target) {
      return 'text-green-400';
    } // Green - good
    if (latency <= target * 1.5) {
      return 'text-amber-400';
    } // Orange - warning
    return 'text-red-400'; // Red - critical
  };

  const getStatusBgClass = (latency: number, target: number): string => {
    if (latency <= target) {
      return 'bg-green-500/20 text-green-300';
    }
    if (latency <= target * 1.5) {
      return 'bg-amber-500/20 text-amber-300';
    }
    return 'bg-red-500/20 text-red-300';
  };

  return (
    <div className="space-y-2 mb-4">
      <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
        Persistence Performance
      </h4>
      <div className="grid grid-cols-1 gap-2">
        {persistenceOperations.map((opType) => {
          const stats = persistenceStats.get(opType);
          if (!stats || stats.total === 0) {
            return null;
          }

          const target =
            {
              [OperationType.TITLE_UPDATE]: 500,
              [OperationType.DELETION]: 500,
              [OperationType.SEARCH]: 500,
              [OperationType.CROSS_TAB_SYNC]: 1000,
              [OperationType.INTEGRITY_CHECK]: 5000,
              [OperationType.STORAGE_READ]: 100,
              [OperationType.STORAGE_WRITE]: 200,
              [OperationType.ENCRYPTION]: 50,
              [OperationType.DECRYPTION]: 50,
            }[opType] || 500;

          const statusColorClass = getStatusColorClass(
            stats.p95Latency,
            target
          );
          const statusBgClass = getStatusBgClass(stats.p95Latency, target);

          return (
            <div
              key={opType}
              className="bg-white/5 p-2 rounded border border-white/10"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold">
                  {opType.replace(/_/g, ' ').toUpperCase()}
                </span>
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded text-[9px]',
                    statusBgClass
                  )}
                >
                  {stats.successRate.toFixed(1)}%
                </span>
              </div>
              <div className="space-y-1 text-[10px] opacity-80">
                <div className="flex justify-between">
                  <span>Avg:</span>
                  <span>{stats.averageLatency.toFixed(0)}ms</span>
                </div>
                <div className="flex justify-between">
                  <span>P95:</span>
                  <span className={statusColorClass}>
                    {stats.p95Latency.toFixed(0)}ms
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Total:</span>
                  <span>{stats.total}</span>
                </div>
                <div className="flex justify-between">
                  <span>Failed:</span>
                  <span
                    className={
                      stats.failed > 0 ? 'text-red-400' : 'text-green-400'
                    }
                  >
                    {stats.failed}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

PersistenceMetrics.displayName = 'PersistenceMetrics';

/**
 * Performance dashboard component
 */
export const PerformanceDashboard = memo<PerformanceDashboardProps>(
  ({ isVisible = false, onToggle, position = 'bottom-right' }) => {
    const { metrics, worstPerformers, totalSlowRenders, clearMetrics } =
      useGlobalPerformanceMonitoring();
    const [memoryHistory, setMemoryHistory] = useState<
      Array<{ timestamp: number; usage: number }>
    >([]);
    const [dbStats, setDbStats] = useState<IndexedDbStats | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);

    // Update memory history
    useEffect(() => {
      const updateMemory = () => {
        const memory = getMemoryUsage();
        if (memory) {
          setMemoryHistory((prev) => {
            const newHistory = [
              ...prev,
              { timestamp: Date.now(), usage: memory.percentage },
            ];
            return newHistory.slice(-20); // Keep last 20 data points
          });
        }
      };

      updateMemory();
      const interval = setInterval(updateMemory, 2000);
      return () => clearInterval(interval);
    }, []);

    // Update database stats
    useEffect(() => {
      const updateDbStats = async () => {
        try {
          const stats = await indexedDBOptimizer.getStats();
          setDbStats(stats);
        } catch (_error) {
          // Failed to get DB stats
        }
      };

      updateDbStats();
      const interval = setInterval(updateDbStats, 10000);
      return () => clearInterval(interval);
    }, []);

    // Don't render in production
    if (process.env.NODE_ENV === 'production') {
      return null;
    }

    const currentMemory = getMemoryUsage();
    const totalComponents = metrics.size;
    const metricValues = Array.from(metrics.values());
    const averageRenderTime =
      metricValues.reduce((sum, metric) => sum + metric.averageRenderTime, 0) /
      Math.max(metricValues.length, 1);

    return (
      <>
        {/* Toggle button */}
        <button
          type="button"
          onClick={onToggle}
          title="Toggle Performance Dashboard"
          className={cn(
            'fixed z-[10000] px-2 py-1 bg-gray-800 text-white border border-gray-700 rounded shadow-lg text-xs font-mono hover:bg-gray-700 transition-colors',
            position.includes('top') ? 'top-2.5' : 'bottom-2.5',
            position.includes('left') ? 'left-2.5' : 'right-2.5'
          )}
        >
          📊 Perf
        </button>

        {/* Dashboard panel */}
        {isVisible && (
          <Glass
            className={cn(
              'fixed z-[9999] p-4 text-xs font-mono w-[400px] max-h-[80vh] overflow-auto flex flex-col gap-4 shadow-2xl',
              position.includes('top') ? 'top-[50px]' : 'bottom-[50px]',
              position.includes('left') ? 'left-2.5' : 'right-2.5'
            )}
            intensity="high"
            border={true}
          >
            <div className="flex items-center justify-between border-b border-gray-700 pb-2">
              <h3 className="text-sm font-bold text-white">
                Performance Dashboard
              </h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="px-2 py-1 bg-transparent border border-gray-600 rounded text-[10px] text-gray-300 hover:bg-white/10 transition-colors"
                >
                  {isExpanded ? 'Collapse' : 'Expand'}
                </button>
                <button
                  type="button"
                  onClick={clearMetrics}
                  className="px-2 py-1 bg-transparent border border-gray-600 rounded text-[10px] text-gray-300 hover:bg-white/10 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Summary metrics */}
            <div className="grid grid-cols-2 gap-2">
              <MetricsDisplay
                title="Components"
                value={totalComponents}
                status={totalComponents > 20 ? 'warning' : 'good'}
              />
              <MetricsDisplay
                title="Avg Render"
                value={averageRenderTime.toFixed(2)}
                unit="ms"
                status={
                  averageRenderTime > 16
                    ? 'critical'
                    : averageRenderTime > 8
                      ? 'warning'
                      : 'good'
                }
              />
              <MetricsDisplay
                title="Slow Renders"
                value={totalSlowRenders}
                status={
                  totalSlowRenders > 10
                    ? 'critical'
                    : totalSlowRenders > 5
                      ? 'warning'
                      : 'good'
                }
              />
              <MetricsDisplay
                title="Memory"
                value={currentMemory?.percentage.toFixed(1) || 'N/A'}
                unit="%"
                status={
                  currentMemory?.percentage
                    ? currentMemory.percentage > 80
                      ? 'critical'
                      : currentMemory.percentage > 60
                        ? 'warning'
                        : 'good'
                    : 'good'
                }
              />
            </div>

            {isExpanded && (
              <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-200">
                {/* Persistence metrics - Task 9.3 */}
                <PersistenceMetrics />

                {/* Memory chart */}
                {memoryHistory.length > 1 && (
                  <MemoryChart memoryHistory={memoryHistory} />
                )}

                {/* Worst performers */}
                {worstPerformers.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                      Worst Performers
                    </h4>
                    <div className="space-y-1">
                      {worstPerformers.slice(0, 3).map((metric) => (
                        <div
                          key={metric.componentName}
                          className="flex justify-between text-[10px]"
                        >
                          <span className="text-amber-400 font-medium">
                            {metric.componentName}
                          </span>
                          <span className="text-gray-300">
                            {metric.averageRenderTime.toFixed(2)}ms
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Database stats */}
                {dbStats && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                      Database Stats
                    </h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-gray-300">
                      <div className="flex justify-between">
                        <span>Conversations:</span>
                        <span>{dbStats.conversationCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Messages:</span>
                        <span>{dbStats.messageCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Cache Hit Rate:</span>
                        <span>{(dbStats.cacheHitRate * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Storage:</span>
                        <span>
                          {(dbStats.storageUsed / 1024 / 1024).toFixed(1)}MB
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Component list */}
                {metrics.size > 0 && (
                  <ComponentPerformanceList metrics={metrics} />
                )}
              </div>
            )}
          </Glass>
        )}
      </>
    );
  }
);

PerformanceDashboard.displayName = 'PerformanceDashboard';
