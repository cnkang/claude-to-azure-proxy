# Performance Monitoring Guide

## Overview

This guide covers performance monitoring, metrics collection, and optimization strategies for the application.

## Performance Metrics System

### Metrics Collection

**Location**: `apps/frontend/src/utils/performance-metrics.ts`

**Features**:
- Singleton pattern for centralized metrics
- Rolling window of last 100 operations per type
- Automatic cleanup to prevent memory leaks
- Statistical analysis (average, min, max, percentiles)
- Success rate tracking
- Performance target violation detection

### Operation Types and Targets

| Operation | Target Latency | Description |
|-----------|---------------|-------------|
| TITLE_UPDATE | <500ms | Conversation title updates |
| DELETION | <500ms | Conversation deletion |
| SEARCH | <500ms | Search operations |
| CROSS_TAB_SYNC | <1000ms | Cross-tab synchronization |
| INTEGRITY_CHECK | <5000ms | Data integrity validation |
| STORAGE_READ | <100ms | Storage read operations |
| STORAGE_WRITE | <200ms | Storage write operations |
| ENCRYPTION | <50ms | Data encryption |
| DECRYPTION | <50ms | Data decryption |

### Recording Metrics

**Manual Recording**:
```typescript
import { getPerformanceMetrics, OperationType } from '../utils/performance-metrics';

const metrics = getPerformanceMetrics();

// Record successful operation
metrics.record(OperationType.TITLE_UPDATE, 245, true);

// Record failed operation
metrics.record(OperationType.DELETION, 1200, false, 'Storage full');
```

**Using Measurement Helpers**:
```typescript
import { measureAsync, OperationType } from '../utils/performance-metrics';

// Measure async operation
const result = await measureAsync(
  OperationType.SEARCH,
  async () => {
    return await searchService.search(query);
  },
  { query, userId: 'user123' }
);
```

**Wrapper Function**:
```typescript
import { withMetrics, OperationType } from '../utils/performance-metrics';

const measuredFunction = withMetrics(
  OperationType.STORAGE_WRITE,
  async (data) => {
    return await storage.write(data);
  }
);
```

### Viewing Metrics

**Get Statistics**:
```typescript
const metrics = getPerformanceMetrics();

// Get stats for specific operation
const stats = metrics.getStats(OperationType.TITLE_UPDATE);
console.log(`Average: ${stats.averageLatency}ms`);
console.log(`P95: ${stats.p95Latency}ms`);
console.log(`Success rate: ${stats.successRate}%`);

// Get all statistics
const allStats = metrics.getAllStats();

// Check for violations
const violations = metrics.getPerformanceViolations();
if (violations.size > 0) {
  console.warn('Performance targets exceeded:', violations);
}
```

**Export Metrics**:
```typescript
const exported = metrics.exportMetrics();
// Send to monitoring service or save for analysis
```

## Performance Dashboard

### Accessing the Dashboard

1. Open the application
2. Click the "📊 Perf" button (bottom-right)
3. Click "Expand" for detailed metrics
4. Metrics update every 5 seconds

### Dashboard Features

**Persistence Metrics Display**:
- Success rate percentage
- Average latency
- P95 latency (color-coded)
- Total operations count
- Failed operations count

**Status Colors**:
- 🟢 Green - Latency ≤ target (good)
- 🟠 Orange - Latency ≤ 1.5× target (warning)
- 🔴 Red - Latency > 1.5× target (critical)

### Memory Monitoring

The dashboard also displays:
- Current memory usage
- Memory usage trend chart
- Heap size limits
- Garbage collection events

## Logging

### Correlation IDs

All operations generate unique correlation IDs for request tracing:
```typescript
const correlationId = crypto.randomUUID();
```

Correlation IDs are included in all log messages for debugging and distributed tracing.

### Log Levels

- **info** - Successful operations, normal flow
- **warn** - Performance violations, non-critical issues
- **error** - Operation failures, critical errors

### Log Metadata

All logs include:
- Correlation ID
- Operation type
- Duration/latency
- Timestamp
- Backend type (indexeddb/localstorage)
- Error details (if applicable)
- Statistics (for completion logs)

### Example Logs

**Title Update Success**:
```json
{
  "level": "info",
  "message": "Title update completed",
  "correlationId": "abc-123",
  "conversationId": "conv-456",
  "duration": 245,
  "backend": "indexeddb",
  "timestamp": "2024-11-17T10:30:00.000Z"
}
```

**Deletion with Statistics**:
```json
{
  "level": "info",
  "message": "Conversation deleted",
  "correlationId": "def-789",
  "conversationId": "conv-456",
  "duration": 380,
  "messagesRemoved": 42,
  "bytesFreed": 15360,
  "timestamp": "2024-11-17T10:31:00.000Z"
}
```

## Performance Optimization

### Memory Management

**Rolling Window**:
- Maximum 100 entries per operation type
- ~9 operation types × 100 entries = 900 total
- Each entry ~200 bytes
- Total memory ~180KB maximum

**Cleanup**:
- Automatic cleanup of old entries
- Metrics cleared on page refresh
- Export available for historical analysis

### CPU Usage

**Metric Recording**: O(1) constant time
**Statistics Calculation**: O(n log n) for sorting (n ≤ 100)
**Dashboard Updates**: Every 5 seconds
**Impact**: Minimal on application performance

### Storage Optimization

**Compression**:
- Large conversations automatically compressed
- Reduces storage quota usage
- Transparent to application code

**Lazy Loading**:
- Conversation details loaded on demand
- Efficient IndexedDB queries
- Pagination for large datasets

**Quota Monitoring**:
- Track storage usage
- Alert when approaching limits
- Automatic cleanup of old data

## Performance Targets

### Latency Requirements

All operations must meet 95th percentile targets:
- Title updates: <500ms
- Deletions: <500ms
- Search: <500ms
- Cross-tab sync: <1000ms
- Integrity checks: <5000ms

### Resource Usage

**Memory**:
- Application heap: <100MB typical
- Peak usage: <200MB
- Metrics overhead: <1MB

**Storage**:
- IndexedDB: Unlimited (browser-dependent)
- localStorage: 5-10MB limit
- Compression ratio: ~3:1 for text

**Network**:
- API calls: <2s timeout
- Retry with exponential backoff
- Circuit breaker for repeated failures

## Monitoring Integration

### External Services

Metrics can be exported to:
- Sentry (error tracking)
- DataDog (APM)
- New Relic (performance monitoring)
- Custom monitoring solutions

**Export Format**:
```typescript
{
  "timestamp": "2024-11-17T10:30:00.000Z",
  "operations": {
    "TITLE_UPDATE": {
      "count": 127,
      "successRate": 98.5,
      "averageLatency": 245,
      "p95Latency": 380,
      "p99Latency": 450
    }
    // ... other operations
  }
}
```

### Alerting

**Performance Violations**:
```typescript
const violations = metrics.getPerformanceViolations();
if (violations.size > 0) {
  // Send alert to monitoring service
  alertService.send({
    severity: 'warning',
    message: 'Performance targets exceeded',
    violations: Array.from(violations)
  });
}
```

**Error Rate Monitoring**:
```typescript
const stats = metrics.getStats(OperationType.TITLE_UPDATE);
if (stats.successRate < 95) {
  // Alert on high error rate
  alertService.send({
    severity: 'critical',
    message: 'High error rate detected',
    operation: 'TITLE_UPDATE',
    successRate: stats.successRate
  });
}
```

## Best Practices

### Measurement

1. **Measure at boundaries** - Measure at service/API boundaries
2. **Include metadata** - Add context for debugging
3. **Use helpers** - Use `measureAsync` and `withMetrics`
4. **Avoid over-measurement** - Don't measure trivial operations

### Optimization

1. **Profile first** - Use metrics to identify bottlenecks
2. **Optimize hot paths** - Focus on frequently-called code
3. **Batch operations** - Combine multiple operations when possible
4. **Use caching** - Cache expensive computations
5. **Lazy load** - Load data on demand

### Monitoring

1. **Set realistic targets** - Based on user experience requirements
2. **Monitor trends** - Look for degradation over time
3. **Alert on violations** - Proactive issue detection
4. **Review regularly** - Weekly performance reviews
5. **Document changes** - Track performance impact of changes

## Troubleshooting

### High Latency

**Symptoms**: Operations consistently exceed targets

**Diagnosis**:
1. Check P95/P99 latencies
2. Review recent entries for patterns
3. Check for network issues
4. Verify storage performance

**Solutions**:
- Optimize database queries
- Add caching layer
- Reduce payload sizes
- Implement pagination

### Memory Leaks

**Symptoms**: Memory usage grows over time

**Diagnosis**:
1. Monitor heap size in dashboard
2. Check for retained objects
3. Review event listener cleanup
4. Verify metrics cleanup

**Solutions**:
- Ensure proper cleanup in `afterEach`
- Remove event listeners
- Clear caches periodically
- Use WeakMap for object references

### Storage Quota Exceeded

**Symptoms**: Storage operations fail

**Diagnosis**:
1. Check storage usage
2. Review conversation sizes
3. Verify compression is working

**Solutions**:
- Enable compression
- Implement data cleanup
- Archive old conversations
- Use IndexedDB instead of localStorage

## Resources

- [Performance Metrics Implementation](../../apps/frontend/src/utils/performance-metrics.ts)
- [Performance Dashboard Component](../../apps/frontend/src/components/common/PerformanceDashboard.tsx)
- [Web Performance APIs](https://developer.mozilla.org/en-US/docs/Web/API/Performance)
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)
