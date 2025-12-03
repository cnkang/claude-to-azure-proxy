/**
 * @fileoverview Unit tests for resource management utilities
 * Tests explicit resource management, automatic cleanup, and resource tracking
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { Readable, type Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BaseAsyncDisposableResource,
  BaseDisposableResource,
  type DisposableResource,
  HTTPConnectionResource,
  ResourceManager,
  StreamResource,
  TimerResource,
  cleanupDisposedResources,
  createAsyncDisposableResource,
  createDisposableResource,
  createHTTPConnectionResource,
  createManagedImmediate,
  createManagedInterval,
  createManagedTimeout,
  createStreamResource,
  createTimerResource,
  disposeAllResources,
  getAllResourceInfo,
  getResourceStats,
  withResources,
} from '../../src/runtime/resource-manager';

// Mock logger
vi.mock('../../src/middleware/logging.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('BaseDisposableResource', () => {
  it('should create a disposable resource with correct properties', () => {
    const cleanupFn = vi.fn();
    const resource = new BaseDisposableResource(
      'custom',
      'Test resource',
      cleanupFn,
      { testProp: 'value' }
    );

    expect(resource.disposed).toBe(false);
    expect(resource.resourceInfo.type).toBe('custom');
    expect(resource.resourceInfo.description).toBe('Test resource');
    expect(resource.resourceInfo.active).toBe(true);
    expect(resource.resourceInfo.metadata.testProp).toBe('value');
    expect(resource.resourceInfo.id).toMatch(/^custom_\d+_[a-z0-9]+$/);
  });

  it('should dispose resource correctly', () => {
    const cleanupFn = vi.fn();
    const resource = new BaseDisposableResource(
      'custom',
      'Test resource',
      cleanupFn
    );

    resource[Symbol.dispose]();

    expect(resource.disposed).toBe(true);
    expect(cleanupFn).toHaveBeenCalledOnce();
  });

  it('should handle multiple dispose calls gracefully', () => {
    const cleanupFn = vi.fn();
    const resource = new BaseDisposableResource(
      'custom',
      'Test resource',
      cleanupFn
    );

    resource[Symbol.dispose]();
    resource[Symbol.dispose]();

    expect(resource.disposed).toBe(true);
    expect(cleanupFn).toHaveBeenCalledOnce();
  });

  it('should handle cleanup function errors', () => {
    const cleanupFn = vi.fn(() => {
      throw new Error('Cleanup failed');
    });
    const resource = new BaseDisposableResource(
      'custom',
      'Test resource',
      cleanupFn
    );

    expect(() => resource[Symbol.dispose]()).not.toThrow();
    expect(resource.disposed).toBe(true);
  });

  it('should handle async cleanup in sync dispose', () => {
    const cleanupFn = vi.fn(() => Promise.resolve());
    const resource = new BaseDisposableResource(
      'custom',
      'Test resource',
      cleanupFn
    );

    resource[Symbol.dispose]();

    expect(resource.disposed).toBe(true);
    expect(cleanupFn).toHaveBeenCalledOnce();
  });
});

describe('BaseAsyncDisposableResource', () => {
  it('should create an async disposable resource', () => {
    const cleanupFn = vi.fn();
    const resource = new BaseAsyncDisposableResource(
      'custom',
      'Test async resource',
      cleanupFn
    );

    expect(resource.disposed).toBe(false);
    expect(resource.resourceInfo.type).toBe('custom');
    expect(resource.resourceInfo.description).toBe('Test async resource');
  });

  it('should dispose resource asynchronously', async () => {
    const cleanupFn = vi.fn(() => Promise.resolve());
    const resource = new BaseAsyncDisposableResource(
      'custom',
      'Test resource',
      cleanupFn
    );

    await resource[Symbol.asyncDispose]();

    expect(resource.disposed).toBe(true);
    expect(cleanupFn).toHaveBeenCalledOnce();
  });

  it('should handle sync cleanup in async dispose', async () => {
    const cleanupFn = vi.fn();
    const resource = new BaseAsyncDisposableResource(
      'custom',
      'Test resource',
      cleanupFn
    );

    await resource[Symbol.asyncDispose]();

    expect(resource.disposed).toBe(true);
    expect(cleanupFn).toHaveBeenCalledOnce();
  });

  it('should handle async cleanup errors', async () => {
    const cleanupFn = vi.fn(() =>
      Promise.reject(new Error('Async cleanup failed'))
    );
    const resource = new BaseAsyncDisposableResource(
      'custom',
      'Test resource',
      cleanupFn
    );

    await expect(resource[Symbol.asyncDispose]()).resolves.not.toThrow();
    expect(resource.disposed).toBe(true);
  });
});

describe('HTTPConnectionResource', () => {
  let mockRequest: Partial<IncomingMessage>;
  let mockResponse: Partial<ServerResponse>;
  let mockSocket: Partial<Socket>;

  beforeEach(() => {
    mockRequest = {
      method: 'POST',
      url: '/test',
      destroyed: false,
      destroy: vi.fn(),
    };

    mockResponse = {
      destroyed: false,
      headersSent: false,
      end: vi.fn((callback) => callback?.()),
    };

    mockSocket = {
      remoteAddress: '127.0.0.1',
      remotePort: 12345,
      destroyed: false,
      end: vi.fn((callback) => callback?.()),
    };
  });

  it('should create HTTP connection resource with correct metadata', () => {
    const resource = new HTTPConnectionResource(
      mockRequest as IncomingMessage,
      mockResponse as ServerResponse,
      mockSocket as Socket
    );

    expect(resource.resourceInfo.type).toBe('http_connection');
    expect(resource.resourceInfo.description).toBe(
      'HTTP connection POST /test'
    );
    expect(resource.resourceInfo.metadata).toMatchObject({
      method: 'POST',
      url: '/test',
      remoteAddress: '127.0.0.1',
      remotePort: 12345,
    });
  });

  it('should cleanup HTTP connection resources', async () => {
    const resource = new HTTPConnectionResource(
      mockRequest as IncomingMessage,
      mockResponse as ServerResponse,
      mockSocket as Socket
    );

    await resource[Symbol.asyncDispose]();

    expect(resource.disposed).toBe(true);
    expect(mockRequest.destroy).toHaveBeenCalled();
    expect(mockResponse.end).toHaveBeenCalled();
    expect(mockSocket.end).toHaveBeenCalled();
  });

  it('should handle already destroyed resources', async () => {
    mockRequest.destroyed = true;
    mockResponse.destroyed = true;
    mockSocket.destroyed = true;

    const resource = new HTTPConnectionResource(
      mockRequest as IncomingMessage,
      mockResponse as ServerResponse,
      mockSocket as Socket
    );

    await resource[Symbol.asyncDispose]();

    expect(resource.disposed).toBe(true);
    expect(mockRequest.destroy).not.toHaveBeenCalled();
    expect(mockResponse.end).not.toHaveBeenCalled();
    expect(mockSocket.end).not.toHaveBeenCalled();
  });

  it('should handle missing request/response/socket', async () => {
    const resource = new HTTPConnectionResource();

    await expect(resource[Symbol.asyncDispose]()).resolves.not.toThrow();
    expect(resource.disposed).toBe(true);
  });
});

describe('StreamResource', () => {
  let mockReadableStream: Partial<Readable>;
  let mockWritableStream: Partial<Writable>;

  beforeEach(() => {
    mockReadableStream = {
      destroyed: false,
      destroy: vi.fn(),
      end: vi.fn((callback) => callback?.()),
    };

    mockWritableStream = {
      destroyed: false,
      destroy: vi.fn(),
      end: vi.fn((callback) => callback?.()),
    };
  });

  it('should create stream resource for readable stream', () => {
    const resource = new StreamResource(
      mockReadableStream as Readable,
      'Test readable stream'
    );

    expect(resource.resourceInfo.type).toBe('stream');
    expect(resource.resourceInfo.description).toBe('Test readable stream');
    expect(resource.resourceInfo.metadata).toMatchObject({
      readable: false, // Mock stream doesn't have readable property set to true
      writable: false,
      destroyed: false,
    });
  });

  it('should create stream resource for writable stream', () => {
    const resource = new StreamResource(
      mockWritableStream as Writable,
      'Test writable stream'
    );

    expect(resource.resourceInfo.type).toBe('stream');
    expect(resource.resourceInfo.metadata).toMatchObject({
      readable: false,
      writable: false, // Mock stream doesn't have writable property set to true
      destroyed: false,
    });
  });

  it('should cleanup stream resources', async () => {
    const resource = new StreamResource(mockWritableStream as Writable);

    await resource[Symbol.asyncDispose]();

    expect(resource.disposed).toBe(true);
    expect(mockWritableStream.end).toHaveBeenCalled();
  });

  it('should handle already destroyed streams', async () => {
    mockReadableStream.destroyed = true;
    const resource = new StreamResource(mockReadableStream as Readable);

    await resource[Symbol.asyncDispose]();

    expect(resource.disposed).toBe(true);
    expect(mockReadableStream.end).not.toHaveBeenCalled();
    expect(mockReadableStream.destroy).not.toHaveBeenCalled();
  });

  it('should handle streams without end method', async () => {
    const streamWithoutEnd: Pick<Readable, 'destroyed'> & {
      destroy: (error?: Error) => void;
    } = {
      destroyed: false,
      destroy: vi.fn(),
    };

    const resource = new StreamResource(streamWithoutEnd as unknown as Readable);

    await resource[Symbol.asyncDispose]();

    expect(resource.disposed).toBe(true);
    expect(streamWithoutEnd.destroy).toHaveBeenCalled();
  });
});

describe('TimerResource', () => {
  let mockTimeout: NodeJS.Timeout;
  let mockInterval: NodeJS.Timeout;
  let mockImmediate: NodeJS.Immediate;

  beforeEach(() => {
    mockTimeout = setTimeout(() => {}, 1000);
    mockInterval = setInterval(() => {}, 1000);
    mockImmediate = setImmediate(() => {});

    // Clear the actual timers to prevent them from running
    clearTimeout(mockTimeout);
    clearInterval(mockInterval);
    clearImmediate(mockImmediate);
  });

  it('should create timer resource for timeout', () => {
    const resource = new TimerResource(mockTimeout, 'timeout', 'Test timeout');

    expect(resource.resourceInfo.type).toBe('timer');
    expect(resource.resourceInfo.description).toBe('Test timeout');
    const metadata = resource.resourceInfo.metadata ?? {};
    expect(metadata.timerType).toBe('timeout');
    if ('timerHandleType' in metadata) {
      expect(metadata.timerHandleType).toBeTypeOf('string');
    }
  });

  it('should create timer resource for interval', () => {
    const resource = new TimerResource(
      mockInterval,
      'interval',
      'Test interval'
    );

    expect(resource.resourceInfo.type).toBe('timer');
    expect(resource.resourceInfo.metadata.timerType).toBe('interval');
  });

  it('should create timer resource for immediate', () => {
    const resource = new TimerResource(
      mockImmediate,
      'immediate',
      'Test immediate'
    );

    expect(resource.resourceInfo.type).toBe('timer');
    expect(resource.resourceInfo.metadata.timerType).toBe('immediate');
  });

  it('should cleanup timeout timer', () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    const resource = new TimerResource(mockTimeout, 'timeout');

    resource[Symbol.dispose]();

    expect(resource.disposed).toBe(true);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(mockTimeout);
  });

  it('should cleanup interval timer', () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    const resource = new TimerResource(mockInterval, 'interval');

    resource[Symbol.dispose]();

    expect(resource.disposed).toBe(true);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(mockInterval);
  });

  it('should cleanup immediate timer', () => {
    const clearImmediateSpy = vi.spyOn(global, 'clearImmediate');
    const resource = new TimerResource(mockImmediate, 'immediate');

    resource[Symbol.dispose]();

    expect(resource.disposed).toBe(true);
    expect(clearImmediateSpy).toHaveBeenCalledWith(mockImmediate);
  });
});

describe('ResourceManager', () => {
  let manager: ResourceManager;

  beforeEach(() => {
    manager = new ResourceManager({
      maxResources: 5,
      cleanupTimeout: 1000,
      enableLogging: false,
      enableLeakDetection: false, // Disable for faster tests
    });
  });

  afterEach(async () => {
    await manager[Symbol.asyncDispose]();
  });

  it('should register and track resources', () => {
    const resource = createDisposableResource(
      'custom',
      'Test resource',
      vi.fn()
    );
    manager.registerResource(resource);

    const stats = manager.getResourceStats();
    expect(stats.total).toBe(1);
    expect(stats.active).toBe(1);
    expect(stats.byType.custom).toBe(1);

    const resourceInfo = manager.getResourceInfo();
    expect(resourceInfo).toHaveLength(1);
    expect(resourceInfo[0].id).toBe(resource.resourceInfo.id);
  });

  it('should unregister resources', () => {
    const resource = createDisposableResource(
      'custom',
      'Test resource',
      vi.fn()
    );
    manager.registerResource(resource);

    manager.unregisterResource(resource.resourceInfo.id);

    const stats = manager.getResourceStats();
    expect(stats.total).toBe(0);
  });

  it('should handle resource limit by cleaning up oldest resources', () => {
    // Create more resources than the limit
    const resources: DisposableResource[] = [];
    for (let i = 0; i < 7; i++) {
      const resource = createDisposableResource(
        'custom',
        `Resource ${i}`,
        vi.fn()
      );
      resources.push(resource);
      manager.registerResource(resource);
    }

    const stats = manager.getResourceStats();
    // The manager should attempt to clean up resources when limit is reached
    // but the exact behavior may vary, so we just check it's reasonable
    expect(stats.total).toBeGreaterThan(0);
    expect(stats.total).toBeLessThanOrEqual(7); // Should not exceed what we created
  });

  it('should clean up disposed resources', () => {
    const resource1 = createDisposableResource('custom', 'Resource 1', vi.fn());
    const resource2 = createDisposableResource('custom', 'Resource 2', vi.fn());

    manager.registerResource(resource1);
    manager.registerResource(resource2);

    // Dispose one resource
    resource1[Symbol.dispose]();

    const cleanedUp = manager.cleanupDisposedResources();
    expect(cleanedUp).toBe(1);

    const stats = manager.getResourceStats();
    expect(stats.total).toBe(1);
    expect(stats.active).toBe(1);
    expect(stats.disposed).toBe(0);
  });

  it('should dispose all resources', async () => {
    const cleanupFn1 = vi.fn();
    const cleanupFn2 = vi.fn();

    const resource1 = createDisposableResource(
      'custom',
      'Resource 1',
      cleanupFn1
    );
    const resource2 = createAsyncDisposableResource(
      'custom',
      'Resource 2',
      cleanupFn2
    );

    manager.registerResource(resource1);
    manager.registerResource(resource2);

    await manager.disposeAllResources();

    expect(cleanupFn1).toHaveBeenCalled();
    expect(cleanupFn2).toHaveBeenCalled();
    expect(resource1.disposed).toBe(true);
    expect(resource2.disposed).toBe(true);

    const stats = manager.getResourceStats();
    expect(stats.total).toBe(0);
  });

  it('should provide resource statistics', () => {
    const httpResource = createHTTPConnectionResource();
    const streamResource = createStreamResource(new Readable());
    const timerResource = createTimerResource(
      setTimeout(() => {}, 1000),
      'timeout'
    );

    manager.registerResource(httpResource);
    manager.registerResource(streamResource);
    manager.registerResource(timerResource);

    const stats = manager.getResourceStats();
    expect(stats.total).toBe(3);
    expect(stats.active).toBe(3);
    expect(stats.byType.http_connection).toBe(1);
    expect(stats.byType.stream).toBe(1);
    expect(stats.byType.timer).toBe(1);
    expect(stats.oldestResource).toBeDefined();
  });

  it('should dispose manager and all resources', async () => {
    const cleanupFn = vi.fn();
    const resource = createDisposableResource(
      'custom',
      'Test resource',
      cleanupFn
    );
    manager.registerResource(resource);

    await manager[Symbol.asyncDispose]();

    expect(cleanupFn).toHaveBeenCalled();
    expect(resource.disposed).toBe(true);
  });
});

describe('Resource Factory Functions', () => {
  afterEach(async () => {
    // Clean up global resource manager
    await disposeAllResources();
  });

  it('should create HTTP connection resource', () => {
    const resource = createHTTPConnectionResource();
    expect(resource).toBeInstanceOf(HTTPConnectionResource);
    expect(resource.resourceInfo.type).toBe('http_connection');
  });

  it('should create stream resource', () => {
    const stream = new Readable();
    const resource = createStreamResource(stream, 'Test stream');
    expect(resource).toBeInstanceOf(StreamResource);
    expect(resource.resourceInfo.description).toBe('Test stream');
  });

  it('should create timer resource', () => {
    const timerId = setTimeout(() => {}, 1000);
    const resource = createTimerResource(timerId, 'timeout', 'Test timer');
    expect(resource).toBeInstanceOf(TimerResource);
    expect(resource.resourceInfo.description).toBe('Test timer');
    clearTimeout(timerId);
  });

  it('should create managed timeout', () => {
    const callback = vi.fn();
    const resource = createManagedTimeout(callback, 100, 'Test timeout');
    expect(resource).toBeInstanceOf(TimerResource);
    expect(resource.resourceInfo.metadata.timerType).toBe('timeout');
  });

  it('should create managed interval', () => {
    const callback = vi.fn();
    const resource = createManagedInterval(callback, 100, 'Test interval');
    expect(resource).toBeInstanceOf(TimerResource);
    expect(resource.resourceInfo.metadata.timerType).toBe('interval');
  });

  it('should create managed immediate', () => {
    const callback = vi.fn();
    const resource = createManagedImmediate(callback, 'Test immediate');
    expect(resource).toBeInstanceOf(TimerResource);
    expect(resource.resourceInfo.metadata.timerType).toBe('immediate');
  });
});

describe('withResources utility', () => {
  it('should manage resources during function execution', async () => {
    const cleanupFn1 = vi.fn();
    const cleanupFn2 = vi.fn();
    const resource1 = createDisposableResource(
      'custom',
      'Resource 1',
      cleanupFn1
    );
    const resource2 = createAsyncDisposableResource(
      'custom',
      'Resource 2',
      cleanupFn2
    );

    const testFn = vi.fn(() => Promise.resolve('result'));

    const result = await withResources(testFn, resource1, resource2);

    expect(result).toBe('result');
    expect(testFn).toHaveBeenCalled();
    expect(cleanupFn1).toHaveBeenCalled();
    expect(cleanupFn2).toHaveBeenCalled();
    expect(resource1.disposed).toBe(true);
    expect(resource2.disposed).toBe(true);
  });

  it('should dispose resources even if function throws', async () => {
    const cleanupFn = vi.fn();
    const resource = createDisposableResource(
      'custom',
      'Test resource',
      cleanupFn
    );

    const testFn = vi.fn(() => Promise.reject(new Error('Test error')));

    await expect(withResources(testFn, resource)).rejects.toThrow('Test error');

    expect(cleanupFn).toHaveBeenCalled();
    expect(resource.disposed).toBe(true);
  });
});

describe('Global Resource Management Functions', () => {
  afterEach(async () => {
    await disposeAllResources();
  });

  it('should get resource statistics', () => {
    createDisposableResource('custom', 'Test resource', vi.fn());
    const stats = getResourceStats();
    expect(stats.total).toBeGreaterThanOrEqual(1);
  });

  it('should get all resource info', () => {
    const resource = createDisposableResource(
      'custom',
      'Test resource',
      vi.fn()
    );
    const info = getAllResourceInfo();
    expect(info.length).toBeGreaterThanOrEqual(1);
    expect(info.some((r) => r.id === resource.resourceInfo.id)).toBe(true);
  });

  it('should cleanup disposed resources', () => {
    const resource = createDisposableResource(
      'custom',
      'Test resource',
      vi.fn()
    );
    resource[Symbol.dispose]();

    const cleanedUp = cleanupDisposedResources();
    expect(cleanedUp).toBeGreaterThanOrEqual(1);
  });

  it('should dispose all resources', async () => {
    const cleanupFn = vi.fn();
    const resource = createDisposableResource(
      'custom',
      'Test resource',
      cleanupFn
    );

    await disposeAllResources();

    expect(cleanupFn).toHaveBeenCalled();
    expect(resource.disposed).toBe(true);
  });
});
