/**
 * @fileoverview Monitoring module exports for comprehensive system monitoring.
 *
 * This module provides a centralized export point for all monitoring functionality
 * including health monitoring, metrics collection, performance profiling, and
 * service-specific monitoring for both Azure OpenAI and AWS Bedrock.
 *
 * @author Claude-to-Azure Proxy Team
 * @version 1.0.0
 * @since 1.0.0
 */

// Health monitoring
export {
  HealthMonitor,
  getHealthMonitor,
  healthMonitor,
  type RegisteredHealthCheck,
  type RegisteredHealthCheckResult,
  type HealthAlert,
} from './health-monitor.js';

// Metrics collection
export {
  InMemoryMetricCollector,
  PerformanceTimer,
  SystemResourceMonitor,
  metricsCollector,
  resourceMonitor,
  createTimer,
  recordBusinessMetric,
  type MetricDataPoint,
  type PerformanceMetric,
  type ResourceMetric,
  type BusinessMetric,
  type MetricCollector,
} from './metrics.js';

// Performance profiling
export {
  PerformanceProfiler,
  performanceProfiler,
  profileOperation,
  startMemoryLeakDetection,
  type PerformanceProfile,
  type CPUProfile,
  type MemoryProfile,
  type EventLoopProfile,
  type GCProfile,
  type PerformanceMark,
  type PerformanceMeasure,
  type MemoryLeakDetection,
  type MemorySample,
} from './performance-profiler.js';

// Azure OpenAI monitoring
export {
  AzureResponsesMonitor,
  createHealthCheckHandler,
} from './azure-responses-monitor.js';

// AWS Bedrock monitoring
export {
  BedrockMonitor,
  createBedrockTimer,
  recordBedrockBusinessMetric,
  type BedrockMetrics,
  type BedrockRequestTracker,
} from './bedrock-monitor.js';
