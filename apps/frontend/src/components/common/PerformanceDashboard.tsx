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
  useGlobalPerformanceMonitoring,
  type PerformanceMetrics,
} from '../../hooks/usePerformanceMonitoring';
import { getMemoryUsage } from '../../utils/performance';
import { indexedDBOptimizer } from '../../services/indexeddb-optimization';

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
  <div className={`metric ${status}`}>
    <div className="metric-title">{title}</div>
    <div className="metric-value">
      {value}{unit}
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
  <div className="component-list">
    <h4>Component Performance</h4>
    <div className="component-items">
      {Array.from(metrics.entries()).map(([name, metric]) => (
        <div key={name} className="component-item">
          <div className="component-name">{name}</div>
          <div className="component-stats">
            <span className="render-count">
              Renders: {metric.renderCount}
            </span>
            <span className={`render-time ${metric.averageRenderTime > 16 ? 'slow' : 'fast'}`}>
              Avg: {metric.averageRenderTime.toFixed(2)}ms
            </span>
            {metric.slowRenders > 0 && (
              <span className="slow-renders warning">
                Slow: {metric.slowRenders}
              </span>
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
  const maxUsage = Math.max(...memoryHistory.map(h => h.usage), 50);
  
  return (
    <div className="memory-chart">
      <h4>Memory Usage History</h4>
      <div className="chart-container">
        <svg width="200" height="60" viewBox="0 0 200 60">
          <polyline
            points={memoryHistory
              .map((point, index) => 
                `${(index / (memoryHistory.length - 1)) * 200},${60 - (point.usage / maxUsage) * 60}`
              )
              .join(' ')
            }
            fill="none"
            stroke="#4CAF50"
            strokeWidth="2"
          />
        </svg>
        <div className="chart-labels">
          <span>0%</span>
          <span>{maxUsage.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
});

MemoryChart.displayName = 'MemoryChart';

/**
 * Performance dashboard component
 */
export const PerformanceDashboard = memo<PerformanceDashboardProps>(({
  isVisible = false,
  onToggle,
  position = 'bottom-right',
}) => {
  const { metrics, worstPerformers, totalSlowRenders, clearMetrics } = useGlobalPerformanceMonitoring();
  const [memoryHistory, setMemoryHistory] = useState<Array<{ timestamp: number; usage: number }>>([]);
  const [dbStats, setDbStats] = useState<IndexedDbStats | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Update memory history
  useEffect(() => {
    const updateMemory = () => {
      const memory = getMemoryUsage();
      if (memory) {
        setMemoryHistory(prev => {
          const newHistory = [...prev, { timestamp: Date.now(), usage: memory.percentage }];
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
        // console.error('Failed to get DB stats:', error);
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
        className={`performance-toggle ${position}`}
        onClick={onToggle}
        title="Toggle Performance Dashboard"
        style={{
          position: 'fixed',
          zIndex: 10000,
          padding: '8px',
          background: '#333',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
          ...(position.includes('top') ? { top: '10px' } : { bottom: '10px' }),
          ...(position.includes('left') ? { left: '10px' } : { right: '10px' }),
        }}
      >
        📊 Perf
      </button>

      {/* Dashboard panel */}
      {isVisible && (
        <div
          className={`performance-dashboard ${position}`}
          style={{
            position: 'fixed',
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.9)',
            color: 'white',
            padding: '16px',
            borderRadius: '8px',
            fontSize: '12px',
            fontFamily: 'monospace',
            maxWidth: '400px',
            maxHeight: '80vh',
            overflow: 'auto',
            ...(position.includes('top') ? { top: '50px' } : { bottom: '50px' }),
            ...(position.includes('left') ? { left: '10px' } : { right: '10px' }),
          }}
        >
          <div className="dashboard-header">
            <h3 style={{ margin: '0 0 16px 0', fontSize: '14px' }}>
              Performance Dashboard
            </h3>
            <div className="dashboard-controls">
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                  background: 'transparent',
                  color: 'white',
                  border: '1px solid #666',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '10px',
                  marginRight: '8px',
                }}
              >
                {isExpanded ? 'Collapse' : 'Expand'}
              </button>
              <button
                type="button"
                onClick={clearMetrics}
                style={{
                  background: 'transparent',
                  color: 'white',
                  border: '1px solid #666',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '10px',
                }}
              >
                Clear
              </button>
            </div>
          </div>

          {/* Summary metrics */}
          <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
            <MetricsDisplay
              title="Components"
              value={totalComponents}
              status={totalComponents > 20 ? 'warning' : 'good'}
            />
            <MetricsDisplay
              title="Avg Render"
              value={averageRenderTime.toFixed(2)}
              unit="ms"
              status={averageRenderTime > 16 ? 'critical' : averageRenderTime > 8 ? 'warning' : 'good'}
            />
            <MetricsDisplay
              title="Slow Renders"
              value={totalSlowRenders}
              status={totalSlowRenders > 10 ? 'critical' : totalSlowRenders > 5 ? 'warning' : 'good'}
            />
            <MetricsDisplay
              title="Memory"
              value={currentMemory?.percentage.toFixed(1) || 'N/A'}
              unit="%"
              status={
                currentMemory?.percentage 
                  ? currentMemory.percentage > 80 ? 'critical' : currentMemory.percentage > 60 ? 'warning' : 'good'
                  : 'good'
              }
            />
          </div>

          {isExpanded && (
            <>
              {/* Memory chart */}
              {memoryHistory.length > 1 && (
                <div style={{ marginBottom: '16px' }}>
                  <MemoryChart memoryHistory={memoryHistory} />
                </div>
              )}

              {/* Worst performers */}
              {worstPerformers.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '12px' }}>Worst Performers</h4>
                  {worstPerformers.slice(0, 3).map(metric => (
                    <div key={metric.componentName} style={{ marginBottom: '4px' }}>
                      <span style={{ color: '#ff9800' }}>{metric.componentName}</span>
                      <span style={{ float: 'right' }}>
                        {metric.averageRenderTime.toFixed(2)}ms
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Database stats */}
              {dbStats && (
                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '12px' }}>Database Stats</h4>
                  <div style={{ fontSize: '10px' }}>
                    <div>Conversations: {dbStats.conversationCount}</div>
                    <div>Messages: {dbStats.messageCount}</div>
                    <div>Cache Hit Rate: {(dbStats.cacheHitRate * 100).toFixed(1)}%</div>
                    <div>Storage: {(dbStats.storageUsed / 1024 / 1024).toFixed(1)}MB</div>
                  </div>
                </div>
              )}

              {/* Component list */}
              {metrics.size > 0 && (
                <ComponentPerformanceList metrics={metrics} />
              )}
            </>
          )}
        </div>
      )}

      {/* Styles */}
      <style>{`
        .metric {
          padding: 8px;
          border-radius: 4px;
          text-align: center;
        }
        .metric.good { background: rgba(76, 175, 80, 0.2); }
        .metric.warning { background: rgba(255, 152, 0, 0.2); }
        .metric.critical { background: rgba(244, 67, 54, 0.2); }
        
        .metric-title {
          font-size: 10px;
          opacity: 0.8;
          margin-bottom: 2px;
        }
        
        .metric-value {
          font-size: 12px;
          font-weight: bold;
        }
        
        .component-item {
          padding: 4px 0;
          border-bottom: 1px solid #333;
        }
        
        .component-name {
          font-weight: bold;
          margin-bottom: 2px;
        }
        
        .component-stats {
          font-size: 10px;
          opacity: 0.8;
        }
        
        .component-stats span {
          margin-right: 8px;
        }
        
        .render-time.slow {
          color: #ff9800;
        }
        
        .slow-renders.warning {
          color: #f44336;
        }
        
        .chart-container {
          position: relative;
        }
        
        .chart-labels {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          opacity: 0.6;
        }
      `}</style>
    </>
  );
});

PerformanceDashboard.displayName = 'PerformanceDashboard';
