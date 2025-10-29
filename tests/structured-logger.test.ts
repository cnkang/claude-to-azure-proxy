import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StructuredLogger } from '../src/utils/structured-logger.js';
import type { SecurityEventContext, StructuredSecurityEvent, GCLogEntry } from '../src/utils/structured-logger.js';

// Mock the logger using vi.hoisted
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    security: vi.fn(),
  },
}));

vi.mock('../src/middleware/logging.js', () => ({
  logger: mockLogger,
}));

// Mock performance APIs for Node.js 24 features
const { 
  mockPerformanceObserver,
  mockPerformanceMark,
  mockPerformanceMeasure,
  mockPerformanceGetEntriesByName 
} = vi.hoisted(() => ({
  mockPerformanceObserver: vi.fn(),
  mockPerformanceMark: vi.fn(),
  mockPerformanceMeasure: vi.fn(),
  mockPerformanceGetEntriesByName: vi.fn(() => []),
}));

vi.mock('node:perf_hooks', () => ({
  performance: {
    mark: mockPerformanceMark,
    measure: mockPerformanceMeasure,
    getEntriesByName: mockPerformanceGetEntriesByName,
    timeOrigin: Date.now(),
  },
  PerformanceObserver: mockPerformanceObserver,
}));

describe('StructuredLogger Node.js 24 Enhancements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPerformanceObserver.mockImplementation((_callback) => ({
      observe: vi.fn(),
      disconnect: vi.fn(),
    }));
  });

  afterEach(() => {
    StructuredLogger.stopEnhancedMonitoring();
  });

  describe('Enhanced Monitoring', () => {
    it('should start enhanced monitoring with Node.js 24 features', () => {
      StructuredLogger.startEnhancedMonitoring();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Enhanced monitoring started with Node.js 24 features',
        '',
        expect.objectContaining({
          gcMonitoring: expect.any(Boolean),
          performanceMonitoring: expect.any(Boolean),
        })
      );
    });

    it('should not start monitoring twice', () => {
      StructuredLogger.startEnhancedMonitoring();
      StructuredLogger.startEnhancedMonitoring();

      // Should only be called once
      expect(mockLogger.info).toHaveBeenCalledTimes(1);
    });

    it('should stop enhanced monitoring', () => {
      StructuredLogger.startEnhancedMonitoring();
      StructuredLogger.stopEnhancedMonitoring();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Enhanced monitoring stopped',
        '',
        {}
      );
    });
  });

  describe('Security Event Logging', () => {
    it('should log security events with proper structure', () => {
      const context: SecurityEventContext = {
        correlationId: 'test-correlation-id',
        operation: 'authentication',
        source: 'auth-middleware',
        metadata: { userId: 'user123' },
      };

      const event: StructuredSecurityEvent = {
        eventType: 'authentication_failure',
        severity: 'high',
        clientInfo: { ip: '192.168.1.1' },
        outcome: 'blocked',
        details: { reason: 'invalid_credentials' },
      };

      StructuredLogger.logSecurityEvent(context, event);

      expect(mockLogger.security).toHaveBeenCalledWith(
        'Security event recorded: authentication',
        'test-correlation-id',
        'authentication_failure',
        'high',
        'authentication',
        expect.objectContaining({
          context: { userId: 'user123' },
          clientInfo: { ip: '192.168.1.1' },
          outcome: 'blocked',
          details: { reason: 'invalid_credentials' },
        })
      );
    });

    it('should handle missing correlation ID', () => {
      const context: SecurityEventContext = {
        correlationId: '',
        operation: 'test-operation',
      };

      const event: StructuredSecurityEvent = {
        eventType: 'test_event',
        severity: 'low',
      };

      StructuredLogger.logSecurityEvent(context, event);

      expect(mockLogger.security).toHaveBeenCalledWith(
        'Security event recorded: test-operation',
        'unknown',
        'test_event',
        'low',
        'test-operation',
        expect.any(Object)
      );
    });
  });

  describe('Performance Metrics Logging', () => {
    it('should log performance metrics', () => {
      const operation = 'database_query';
      const duration = 150;
      const correlationId = 'perf-test-id';
      const metadata = { query: 'SELECT * FROM users' };

      StructuredLogger.logPerformanceMetrics(operation, duration, correlationId, metadata);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Performance metrics recorded',
        correlationId,
        expect.objectContaining({
          operation,
          duration,
          correlationId,
          metadata,
          timestamp: expect.any(String),
        })
      );
    });

    it('should warn about slow operations', () => {
      const operation = 'slow_operation';
      const duration = 2000; // 2 seconds
      const correlationId = 'slow-test-id';

      StructuredLogger.logPerformanceMetrics(operation, duration, correlationId);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Slow operation detected',
        correlationId,
        expect.objectContaining({
          operation,
          duration,
          threshold: 1000,
        })
      );
    });
  });

  describe('Garbage Collection Event Logging', () => {
    it('should log GC events with proper details', () => {
      const gcEntry: GCLogEntry = {
        type: '2', // Mark-Sweep-Compact
        duration: 50,
        timestamp: new Date().toISOString(),
        heapBefore: 100 * 1024 * 1024,
        heapAfter: 80 * 1024 * 1024,
        freedMemory: 20 * 1024 * 1024,
      };

      StructuredLogger.logGCEvent(gcEntry);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Garbage collection completed: 2',
        '',
        expect.objectContaining({
          ...gcEntry,
          gcTypeName: 'Mark-Sweep-Compact',
        })
      );
    });

    it('should warn about long GC pauses', () => {
      const gcEntry: GCLogEntry = {
        type: '2',
        duration: 150, // Long pause
        timestamp: new Date().toISOString(),
        heapBefore: 200 * 1024 * 1024,
        heapAfter: 150 * 1024 * 1024,
        freedMemory: 50 * 1024 * 1024,
      };

      StructuredLogger.logGCEvent(gcEntry);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Garbage collection completed: 2',
        '',
        expect.objectContaining({
          ...gcEntry,
          gcTypeName: 'Mark-Sweep-Compact',
          threshold: 100,
        })
      );
    });

    it('should handle unknown GC types', () => {
      const gcEntry: GCLogEntry = {
        type: '99', // Unknown type
        duration: 25,
        timestamp: new Date().toISOString(),
        heapBefore: 50 * 1024 * 1024,
        heapAfter: 45 * 1024 * 1024,
        freedMemory: 5 * 1024 * 1024,
      };

      StructuredLogger.logGCEvent(gcEntry);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Garbage collection completed: 99',
        '',
        expect.objectContaining({
          ...gcEntry,
          gcTypeName: 'Unknown',
        })
      );
    });
  });

  describe('Performance Marks and Measures', () => {
    it('should create performance marks', () => {
      const markName = 'operation_start';

      StructuredLogger.mark(markName);

      expect(mockPerformanceMark).toHaveBeenCalledWith(markName);
    });

    it('should handle mark creation errors gracefully', () => {
      mockPerformanceMark.mockImplementationOnce(() => {
        throw new Error('Performance API not available');
      });

      StructuredLogger.mark('test_mark');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Failed to create performance mark',
        '',
        expect.objectContaining({
          name: 'test_mark',
          error: 'Performance API not available',
        })
      );
    });

    it('should create performance measures', () => {
      const measureName = 'operation_duration';
      const startMark = 'operation_start';
      const endMark = 'operation_end';
      const correlationId = 'measure-test-id';

      mockPerformanceGetEntriesByName.mockReturnValueOnce([
        {
          name: measureName,
          duration: 100,
          startTime: 1000,
        },
      ]);

      const duration = StructuredLogger.measure(measureName, startMark, endMark, correlationId);

      expect(mockPerformanceMeasure).toHaveBeenCalledWith(measureName, startMark, endMark);
      expect(duration).toBe(100);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Performance metrics recorded',
        correlationId,
        expect.objectContaining({
          operation: measureName,
          duration: 100,
          correlationId,
          metadata: {
            startMark,
            endMark,
            startTime: 1000,
          },
        })
      );
    });

    it('should handle measure creation errors gracefully', () => {
      mockPerformanceMeasure.mockImplementationOnce(() => {
        throw new Error('Invalid mark names');
      });

      const duration = StructuredLogger.measure('test_measure', 'start', 'end');

      expect(duration).toBe(0);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Failed to create performance measure',
        '',
        expect.objectContaining({
          name: 'test_measure',
          error: 'Invalid mark names',
        })
      );
    });
  });

  describe('Memory Usage Logging', () => {
    const originalMemoryUsage = process.memoryUsage;

    beforeEach(() => {
      process.memoryUsage = vi.fn(() => ({
        rss: 100 * 1024 * 1024,
        heapTotal: 80 * 1024 * 1024,
        heapUsed: 40 * 1024 * 1024, // 50% usage
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024,
      }));
    });

    afterEach(() => {
      process.memoryUsage = originalMemoryUsage;
    });

    it('should log normal memory usage as debug', () => {
      const correlationId = 'memory-test-id';
      const operation = 'test-operation';

      StructuredLogger.logMemoryUsage(correlationId, operation);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Memory usage monitoring',
        correlationId,
        expect.objectContaining({
          operation,
          memory: expect.objectContaining({
            heapUsagePercent: 50,
          }),
        })
      );
    });

    it('should log elevated memory usage as info', () => {
      process.memoryUsage = vi.fn(() => ({
        rss: 100 * 1024 * 1024,
        heapTotal: 80 * 1024 * 1024,
        heapUsed: 56 * 1024 * 1024, // 70% usage
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024,
      }));

      const correlationId = 'memory-elevated-test-id';

      StructuredLogger.logMemoryUsage(correlationId);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Memory usage monitoring',
        correlationId,
        expect.objectContaining({
          memory: expect.objectContaining({
            heapUsagePercent: 70,
          }),
        })
      );
    });

    it('should warn about high memory usage', () => {
      process.memoryUsage = vi.fn(() => ({
        rss: 100 * 1024 * 1024,
        heapTotal: 80 * 1024 * 1024,
        heapUsed: 72 * 1024 * 1024, // 90% usage
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024,
      }));

      const correlationId = 'memory-high-test-id';

      StructuredLogger.logMemoryUsage(correlationId);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'High memory usage detected',
        correlationId,
        expect.objectContaining({
          memory: expect.objectContaining({
            heapUsagePercent: 90,
          }),
        })
      );
    });
  });
});
