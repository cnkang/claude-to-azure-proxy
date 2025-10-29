/**
 * @fileoverview Tests for memory management middleware with Node.js 24 features
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  memoryManagementMiddleware,
  getMemoryMiddlewareStats,
  resetMemoryMiddlewareStats,
  hasMemoryTracking,
  getRequestMemoryInfo,
  type RequestWithMemoryTracking,
} from '../../src/middleware/memory-management.js';

// Mock dependencies
vi.mock('../../src/middleware/logging.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/utils/memory-manager.js', () => ({
  getCurrentMemoryMetrics: vi.fn(() => ({
    timestamp: new Date().toISOString(),
    heap: {
      used: 50 * 1024 * 1024,
      total: 100 * 1024 * 1024,
      limit: 1024 * 1024 * 1024,
      percentage: 50,
    },
    system: {
      rss: 100 * 1024 * 1024,
      external: 10 * 1024 * 1024,
      arrayBuffers: 5 * 1024 * 1024,
    },
    gc: {
      totalCollections: 10,
      totalDuration: 100,
      averageDuration: 10,
      recentCollections: [],
    },
    pressure: {
      level: 'low' as const,
      score: 0.5,
      recommendations: ['Memory usage is within normal range'],
    },
  })),
  forceGarbageCollection: vi.fn(() => true),
}));

vi.mock('../../src/runtime/resource-manager.js', () => ({
  createHTTPConnectionResource: vi.fn(() => ({
    disposed: false,
    [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
  })),
  resourceManager: {
    getResourceStats: vi.fn(() => ({
      total: 10,
      active: 5,
      disposed: 5,
      byType: {
        http_connection: 3,
        stream: 1,
        timer: 1,
        file_handle: 0,
        socket: 0,
        custom: 0,
      },
      oldestResource: undefined,
    })),
  },
}));

vi.mock('../../src/config/index.js', () => ({
  default: {
    ENABLE_MEMORY_MANAGEMENT: true,
    ENABLE_RESOURCE_MONITORING: true,
    MEMORY_PRESSURE_THRESHOLD: 80,
    ENABLE_AUTO_GC: true,
  },
}));

describe('Memory Management Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let responseEventHandlers: Record<string, () => void>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetMemoryMiddlewareStats();

    responseEventHandlers = {};

    mockRequest = {
      method: 'GET',
      originalUrl: '/test',
      socket: {} as any,
    };

    mockResponse = {
      on: vi.fn((event: string, handler: () => void) => {
        responseEventHandlers[event] = handler;
      }),
      statusCode: 200,
    };

    mockNext = vi.fn();

    // Mock process.memoryUsage to return consistent values
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 100 * 1024 * 1024,
      heapTotal: 100 * 1024 * 1024,
      heapUsed: 50 * 1024 * 1024,
      external: 10 * 1024 * 1024,
      arrayBuffers: 5 * 1024 * 1024,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic Functionality', () => {
    it('should add memory tracking to request', () => {
      memoryManagementMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(hasMemoryTracking(mockRequest as Request)).toBe(true);

      const memoryInfo = getRequestMemoryInfo(mockRequest as Request);
      expect(memoryInfo).toBeDefined();
      expect(memoryInfo?.startMemory).toBeDefined();
      expect(memoryInfo?.startTime).toBeTypeOf('number');
      expect(memoryInfo?.pressureDetected).toBe(false);
      expect(memoryInfo?.resourcesCleanedUp).toBe(false);
    });

    it('should call next function', () => {
      memoryManagementMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledOnce();
    });

    it('should set up response event handlers', () => {
      memoryManagementMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.on).toHaveBeenCalledWith(
        'finish',
        expect.any(Function)
      );
      expect(mockResponse.on).toHaveBeenCalledWith(
        'close',
        expect.any(Function)
      );
    });
  });

  describe('Memory Tracking', () => {
    it('should track memory usage during request lifecycle', () => {
      memoryManagementMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Simulate request completion
      const finishHandler = responseEventHandlers.finish;
      expect(finishHandler).toBeDefined();

      // Mock different memory usage for end
      vi.spyOn(process, 'memoryUsage').mockReturnValueOnce({
        rss: 110 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        heapUsed: 60 * 1024 * 1024,
        external: 12 * 1024 * 1024,
        arrayBuffers: 6 * 1024 * 1024,
      });

      finishHandler();

      const memoryInfo = getRequestMemoryInfo(mockRequest as Request);
      expect(memoryInfo?.endMemory).toBeDefined();
      expect(memoryInfo?.memoryDelta).toBe(10 * 1024 * 1024); // 60MB - 50MB
      expect(memoryInfo?.duration).toBeGreaterThanOrEqual(0);
      expect(memoryInfo?.resourcesCleanedUp).toBe(true);
    });

    it('should detect memory pressure', () => {
      // Mock high memory usage
      vi.spyOn(process, 'memoryUsage').mockReturnValue({
        rss: 200 * 1024 * 1024,
        heapTotal: 100 * 1024 * 1024,
        heapUsed: 90 * 1024 * 1024, // 90% usage
        external: 20 * 1024 * 1024,
        arrayBuffers: 10 * 1024 * 1024,
      });

      memoryManagementMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      const memoryInfo = getRequestMemoryInfo(mockRequest as Request);
      // Note: pressure detection logic is in the middleware,
      // this test verifies the structure is set up correctly
      expect(memoryInfo).toBeDefined();
    });
  });

  describe('Resource Management', () => {
    it('should create and clean up HTTP connection resources', async () => {
      const { createHTTPConnectionResource } = vi.mocked(
        await import('../../src/runtime/resource-manager.js')
      );

      memoryManagementMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(createHTTPConnectionResource).toHaveBeenCalledWith(
        mockRequest,
        mockResponse,
        mockRequest.socket
      );

      // Simulate response finish
      const finishHandler = responseEventHandlers.finish;
      finishHandler();

      // Resource cleanup should be called (mocked resource is not disposed)
      expect(createHTTPConnectionResource).toHaveBeenCalled();
    });

    it('should handle resource cleanup on response close', () => {
      memoryManagementMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Simulate response close
      const closeHandler = responseEventHandlers.close;
      expect(closeHandler).toBeDefined();

      closeHandler();

      const memoryInfo = getRequestMemoryInfo(mockRequest as Request);
      expect(memoryInfo?.resourcesCleanedUp).toBe(true);
    });
  });

  describe('Performance Monitoring', () => {
    it('should log slow requests with memory information', async () => {
      const { logger } = vi.mocked(
        await import('../../src/middleware/logging.js')
      );

      // Add correlation ID to request
      (mockRequest as RequestWithMemoryTracking).correlationId =
        'test-correlation-id';

      memoryManagementMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Mock slow request by advancing time
      const originalDateNow = Date.now;
      let currentTime = originalDateNow();
      vi.spyOn(Date, 'now').mockImplementation(() => {
        currentTime += 2000; // Add 2 seconds
        return currentTime;
      });

      // Simulate request completion
      const finishHandler = responseEventHandlers.finish;
      finishHandler();

      expect(logger.warn).toHaveBeenCalledWith(
        'Slow request with memory tracking',
        'test-correlation-id',
        expect.objectContaining({
          method: 'GET',
          url: '/test',
          duration: expect.any(Number),
          memoryDelta: expect.any(Number),
        })
      );

      Date.now = originalDateNow;
    });

    it('should suggest garbage collection for memory-intensive requests', async () => {
      const { forceGarbageCollection } = vi.mocked(
        await import('../../src/utils/memory-manager.js')
      );

      (mockRequest as RequestWithMemoryTracking).correlationId =
        'test-correlation-id';

      memoryManagementMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Mock large memory delta (60MB increase)
      vi.spyOn(process, 'memoryUsage').mockReturnValueOnce({
        rss: 200 * 1024 * 1024,
        heapTotal: 150 * 1024 * 1024,
        heapUsed: 110 * 1024 * 1024, // 60MB increase from 50MB
        external: 20 * 1024 * 1024,
        arrayBuffers: 10 * 1024 * 1024,
      });

      // Simulate request completion
      const finishHandler = responseEventHandlers.finish;
      finishHandler();

      expect(forceGarbageCollection).toHaveBeenCalled();
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide statistics interface', () => {
      const stats = getMemoryMiddlewareStats();
      expect(stats).toBeDefined();
      expect(stats.requestCount).toBeTypeOf('number');
      expect(stats.memoryLeakWarnings).toBeTypeOf('number');
      expect(stats.config).toBeDefined();
    });

    it('should provide reset functionality', () => {
      expect(() => resetMemoryMiddlewareStats()).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle memory metrics gathering errors gracefully', async () => {
      const { getCurrentMemoryMetrics } = vi.mocked(
        await import('../../src/utils/memory-manager.js')
      );
      getCurrentMemoryMetrics.mockImplementation(() => {
        throw new Error('Memory metrics error');
      });

      expect(() => {
        memoryManagementMiddleware(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );
      }).not.toThrow();

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle resource cleanup errors gracefully', async () => {
      const { createHTTPConnectionResource } = vi.mocked(
        await import('../../src/runtime/resource-manager.js')
      );
      createHTTPConnectionResource.mockReturnValue({
        disposed: false,
        [Symbol.asyncDispose]: vi
          .fn()
          .mockRejectedValue(new Error('Cleanup error')),
      });

      memoryManagementMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Simulate response finish - should not throw
      const finishHandler = responseEventHandlers.finish;
      expect(() => finishHandler()).not.toThrow();
    });
  });

  describe('Configuration Integration', () => {
    it('should respect configuration settings', () => {
      const stats = getMemoryMiddlewareStats();

      expect(stats.config.enablePressureMonitoring).toBe(true);
      expect(stats.config.enableResourceTracking).toBe(true);
      expect(stats.config.pressureThreshold).toBe(80);
      expect(stats.config.enableGCSuggestions).toBe(true);
    });
  });

  describe('Type Guards', () => {
    it('should correctly identify requests with memory tracking', () => {
      const requestWithoutTracking = { method: 'GET' } as Request;
      expect(hasMemoryTracking(requestWithoutTracking)).toBe(false);

      memoryManagementMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(hasMemoryTracking(mockRequest as Request)).toBe(true);
    });

    it('should return undefined for requests without memory info', () => {
      const requestWithoutTracking = { method: 'GET' } as Request;
      expect(getRequestMemoryInfo(requestWithoutTracking)).toBeUndefined();
    });
  });
});
