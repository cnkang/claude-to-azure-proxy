/**
 * @fileoverview Resource management utility with Node.js 24 explicit resource management
 * using Symbol.dispose and Symbol.asyncDispose for automatic cleanup.
 *
 * This module provides comprehensive resource management capabilities including:
 * - Automatic resource cleanup using Symbol.dispose
 * - HTTP connection management and cleanup
 * - Streaming response resource management
 * - Resource lifecycle tracking and monitoring
 *
 * @author Claude-to-Azure Proxy Team
 * @version 1.0.0
 * @since 1.0.0
 */

import { logger } from '../middleware/logging.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';

/**
 * Resource types that can be managed.
 *
 * @public
 * @type ResourceType
 */
export type ResourceType =
  | 'http_connection'
  | 'stream'
  | 'timer'
  | 'file_handle'
  | 'socket'
  | 'custom';

/**
 * Resource information interface.
 *
 * @public
 * @interface ResourceInfo
 */
export interface ResourceInfo {
  /** Unique resource identifier */
  readonly id: string;
  /** Resource type */
  readonly type: ResourceType;
  /** Resource creation timestamp */
  readonly createdAt: number;
  /** Resource description */
  readonly description: string;
  /** Whether resource is currently active */
  readonly active: boolean;
  /** Resource metadata */
  readonly metadata: Record<string, unknown>;
}

/**
 * Resource cleanup function type.
 *
 * @public
 * @type ResourceCleanupFn
 */
export type ResourceCleanupFn = () => void | Promise<void>;

/**
 * Disposable resource interface with explicit resource management.
 *
 * @public
 * @interface DisposableResource
 */
export interface DisposableResource extends Disposable {
  /** Resource information */
  readonly resourceInfo: ResourceInfo;
  /** Whether resource has been disposed */
  readonly disposed: boolean;
  /** Dispose the resource synchronously */
  [Symbol.dispose](): void;
}

/**
 * Async disposable resource interface.
 *
 * @public
 * @interface AsyncDisposableResource
 */
export interface AsyncDisposableResource extends AsyncDisposable {
  /** Resource information */
  readonly resourceInfo: ResourceInfo;
  /** Whether resource has been disposed */
  readonly disposed: boolean;
  /** Dispose the resource asynchronously */
  [Symbol.asyncDispose](): Promise<void>;
}

/**
 * Resource manager configuration.
 *
 * @public
 * @interface ResourceManagerConfig
 */
export interface ResourceManagerConfig {
  /** Maximum number of resources to track */
  readonly maxResources: number;
  /** Resource cleanup timeout in milliseconds */
  readonly cleanupTimeout: number;
  /** Enable resource lifecycle logging */
  readonly enableLogging: boolean;
  /** Enable resource leak detection */
  readonly enableLeakDetection: boolean;
  /** Resource leak detection interval in milliseconds */
  readonly leakDetectionInterval: number;
}

/**
 * Default resource manager configuration.
 */
const DEFAULT_CONFIG: ResourceManagerConfig = {
  maxResources: 1000,
  cleanupTimeout: 5000,
  enableLogging: true,
  enableLeakDetection: true,
  leakDetectionInterval: 60000, // 1 minute
};

/**
 * Base disposable resource implementation.
 *
 * @public
 * @class BaseDisposableResource
 */
export class BaseDisposableResource implements DisposableResource {
  private _disposed = false;
  private readonly cleanupFn: ResourceCleanupFn;
  public readonly resourceInfo: ResourceInfo;

  constructor(
    type: ResourceType,
    description: string,
    cleanupFn: ResourceCleanupFn,
    metadata: Record<string, unknown> = {}
  ) {
    this.resourceInfo = {
      id: this.generateResourceId(type),
      type,
      createdAt: Date.now(),
      description,
      active: true,
      metadata,
    };
    this.cleanupFn = cleanupFn;
  }

  public get disposed(): boolean {
    return this._disposed;
  }

  [Symbol.dispose](): void {
    if (this._disposed) {
      return;
    }

    try {
      const result = this.cleanupFn();
      if (result instanceof Promise) {
        logger.warn('Sync dispose called on async resource', '', {
          resourceId: this.resourceInfo.id,
          type: this.resourceInfo.type,
        });
        // Handle async cleanup in sync context (not ideal but necessary)
        result.catch((error: unknown) => {
          logger.error('Async cleanup failed in sync dispose', '', {
            resourceId: this.resourceInfo.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      }

      this._disposed = true;

      if (DEFAULT_CONFIG.enableLogging) {
        logger.debug('Resource disposed', '', {
          resourceId: this.resourceInfo.id,
          type: this.resourceInfo.type,
          description: this.resourceInfo.description,
          lifetime: Date.now() - this.resourceInfo.createdAt,
        });
      }
    } catch (error) {
      logger.error('Resource disposal failed', '', {
        resourceId: this.resourceInfo.id,
        type: this.resourceInfo.type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this._disposed = true; // Mark as disposed even if cleanup failed
    }
  }

  private generateResourceId(type: ResourceType): string {
    return `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Base async disposable resource implementation.
 *
 * @public
 * @class BaseAsyncDisposableResource
 */
export class BaseAsyncDisposableResource implements AsyncDisposableResource {
  private _disposed = false;
  private readonly cleanupFn: ResourceCleanupFn;
  public readonly resourceInfo: ResourceInfo;

  constructor(
    type: ResourceType,
    description: string,
    cleanupFn: ResourceCleanupFn,
    metadata: Record<string, unknown> = {}
  ) {
    this.resourceInfo = {
      id: this.generateResourceId(type),
      type,
      createdAt: Date.now(),
      description,
      active: true,
      metadata,
    };
    this.cleanupFn = cleanupFn;
  }

  public get disposed(): boolean {
    return this._disposed;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this._disposed) {
      return;
    }

    try {
      const result = this.cleanupFn();
      if (result instanceof Promise) {
        await result;
      }

      this._disposed = true;

      if (DEFAULT_CONFIG.enableLogging) {
        logger.debug('Async resource disposed', '', {
          resourceId: this.resourceInfo.id,
          type: this.resourceInfo.type,
          description: this.resourceInfo.description,
          lifetime: Date.now() - this.resourceInfo.createdAt,
        });
      }
    } catch (error) {
      logger.error('Async resource disposal failed', '', {
        resourceId: this.resourceInfo.id,
        type: this.resourceInfo.type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this._disposed = true; // Mark as disposed even if cleanup failed
    }
  }

  private generateResourceId(type: ResourceType): string {
    return `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * HTTP connection resource for managing HTTP connections with automatic cleanup.
 *
 * @public
 * @class HTTPConnectionResource
 */
export class HTTPConnectionResource extends BaseAsyncDisposableResource {
  private readonly request?: Readonly<IncomingMessage>;
  private readonly response?: Readonly<ServerResponse>;
  private readonly socket?: Readonly<Socket>;

  constructor(
    request?: Readonly<IncomingMessage>,
    response?: Readonly<ServerResponse>,
    socket?: Readonly<Socket>
  ) {
    const description = `HTTP connection ${request?.method ?? 'unknown'} ${request?.url ?? 'unknown'}`;

    super(
      'http_connection',
      description,
      async () => {
        await this.cleanup();
      },
      {
        method: request?.method,
        url: request?.url,
        remoteAddress: socket?.remoteAddress,
        remotePort: socket?.remotePort,
      }
    );

    this.request = request;
    this.response = response;
    this.socket = socket;
  }

  private async cleanup(): Promise<void> {
    const cleanupPromises: Promise<void>[] = [];

    // Close response if not already closed
    if (
      this.response &&
      !this.response.destroyed &&
      !this.response.headersSent
    ) {
      cleanupPromises.push(
        new Promise<void>((resolve) => {
          this.response!.end(() => resolve());
        })
      );
    }

    // Destroy request if not already destroyed
    if (this.request && !this.request.destroyed) {
      this.request.destroy();
    }

    // Close socket if not already closed
    if (this.socket && !this.socket.destroyed) {
      cleanupPromises.push(
        new Promise<void>((resolve) => {
          this.socket!.end(() => resolve());
        })
      );
    }

    // Wait for all cleanup operations with timeout
    if (cleanupPromises.length > 0) {
      await Promise.race([
        Promise.all(cleanupPromises),
        new Promise<void>((resolve) => {
          setTimeout(resolve, DEFAULT_CONFIG.cleanupTimeout);
        }),
      ]);
    }
  }
}

/**
 * Stream resource for managing readable/writable streams with automatic cleanup.
 *
 * @public
 * @class StreamResource
 */
export class StreamResource extends BaseAsyncDisposableResource {
  private readonly stream: NodeJS.ReadableStream | NodeJS.WritableStream;

  constructor(
    stream: Readonly<NodeJS.ReadableStream | NodeJS.WritableStream>,
    description: string = 'Stream resource'
  ) {
    super(
      'stream',
      description,
      async () => {
        await this.cleanup();
      },
      {
        readable:
          'readable' in stream && typeof stream.readable === 'boolean'
            ? stream.readable
            : false,
        writable:
          'writable' in stream && typeof stream.writable === 'boolean'
            ? stream.writable
            : false,
        destroyed: 'destroyed' in stream ? stream.destroyed : false,
      }
    );

    this.stream = stream;
  }

  private async cleanup(): Promise<void> {
    if ('destroyed' in this.stream && this.stream.destroyed === true) {
      return;
    }

    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (
          'destroy' in this.stream &&
          typeof this.stream.destroy === 'function'
        ) {
          (this.stream.destroy as () => void)();
        }
        resolve();
      }, DEFAULT_CONFIG.cleanupTimeout);

      if ('end' in this.stream && typeof this.stream.end === 'function') {
        (this.stream.end as (callback?: () => void) => void)(() => {
          clearTimeout(timeout);
          resolve();
        });
      } else if (
        'destroy' in this.stream &&
        typeof this.stream.destroy === 'function'
      ) {
        (this.stream.destroy as () => void)();
        clearTimeout(timeout);
        resolve();
      } else {
        clearTimeout(timeout);
        resolve();
      }
    });
  }
}

/**
 * Timer resource for managing timers with automatic cleanup.
 *
 * @public
 * @class TimerResource
 */
export class TimerResource extends BaseDisposableResource {
  private readonly timerId: NodeJS.Timeout | NodeJS.Immediate;
  private readonly timerType: 'timeout' | 'interval' | 'immediate';

  constructor(
    timerId: NodeJS.Timeout | NodeJS.Immediate,
    timerType: 'timeout' | 'interval' | 'immediate',
    description: string = `${timerType} timer`
  ) {
    const timerMetadata: Record<string, unknown> = {
      timerType,
    };

    if (typeof timerId === 'number') {
      timerMetadata.timerId = timerId;
    } else {
      const descriptor = (timerId as { [Symbol.toStringTag]?: string })[
        Symbol.toStringTag
      ];
      if (descriptor !== undefined) {
        timerMetadata.timerHandleType = descriptor;
      }

      if (typeof (timerId as NodeJS.Timeout).hasRef === 'function') {
        timerMetadata.hasRef = (timerId as NodeJS.Timeout).hasRef();
      }
    }

    super(
      'timer',
      description,
      () => {
        this.cleanup();
      },
      timerMetadata
    );

    this.timerId = timerId;
    this.timerType = timerType;
  }

  private cleanup(): void {
    try {
      if (this.timerType === 'immediate') {
        clearImmediate(this.timerId as NodeJS.Immediate);
      } else {
        clearTimeout(this.timerId as NodeJS.Timeout);
      }
    } catch (error) {
      logger.warn('Timer cleanup failed', '', {
        timerType: this.timerType,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * Resource manager class for tracking and managing disposable resources.
 *
 * @public
 * @class ResourceManager
 */
export class ResourceManager implements AsyncDisposable {
  private readonly config: ResourceManagerConfig;
  private readonly resources = new Map<
    string,
    DisposableResource | AsyncDisposableResource
  >();
  private leakDetectionInterval?: NodeJS.Timeout;
  private _disposed = false;

  constructor(config: Partial<ResourceManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.enableLeakDetection) {
      this.startLeakDetection();
    }
  }

  /**
   * Registers a disposable resource for tracking.
   *
   * @public
   * @param resource - Resource to register
   */
  public registerResource(
    resource: Readonly<DisposableResource> | Readonly<AsyncDisposableResource>
  ): void {
    if (this._disposed) {
      logger.warn('Cannot register resource on disposed manager', '', {
        resourceId: resource.resourceInfo.id,
      });
      return;
    }

    if (this.resources.size >= this.config.maxResources) {
      logger.warn('Resource limit reached, cleaning up oldest resources', '', {
        currentCount: this.resources.size,
        maxResources: this.config.maxResources,
      });
      this.cleanupOldestResources(Math.floor(this.config.maxResources * 0.1));
    }

    this.resources.set(resource.resourceInfo.id, resource);

    if (this.config.enableLogging) {
      logger.debug('Resource registered', '', {
        resourceId: resource.resourceInfo.id,
        type: resource.resourceInfo.type,
        description: resource.resourceInfo.description,
        totalResources: this.resources.size,
      });
    }
  }

  /**
   * Unregisters a resource from tracking.
   *
   * @public
   * @param resourceId - Resource ID to unregister
   */
  public unregisterResource(resourceId: string): void {
    const removed = this.resources.delete(resourceId);

    if (removed && this.config.enableLogging) {
      logger.debug('Resource unregistered', '', {
        resourceId,
        totalResources: this.resources.size,
      });
    }
  }

  /**
   * Gets information about all tracked resources.
   *
   * @public
   * @returns Array of resource information
   */
  public getResourceInfo(): readonly ResourceInfo[] {
    return Array.from(this.resources.values()).map((resource) => ({
      ...resource.resourceInfo,
      active: !resource.disposed,
    }));
  }

  /**
   * Gets resource statistics.
   *
   * @public
   * @returns Resource statistics
   */
  public getResourceStats(): {
    readonly total: number;
    readonly active: number;
    readonly disposed: number;
    readonly byType: Record<ResourceType, number>;
    readonly oldestResource?: ResourceInfo;
  } {
    const resources = Array.from(this.resources.values());
    const active = resources.filter((r) => !r.disposed);
    const disposed = resources.filter((r) => r.disposed);

    const byType: Record<ResourceType, number> = {
      http_connection: 0,
      stream: 0,
      timer: 0,
      file_handle: 0,
      socket: 0,
      custom: 0,
    };

    for (const resource of resources) {
      byType[resource.resourceInfo.type] += 1;
    }

    const oldestResource = resources
      .filter((r) => !r.disposed)
      .sort(
        (a, b) => a.resourceInfo.createdAt - b.resourceInfo.createdAt
      )[0]?.resourceInfo;

    return {
      total: resources.length,
      active: active.length,
      disposed: disposed.length,
      byType,
      oldestResource,
    };
  }

  /**
   * Cleans up disposed resources from tracking.
   *
   * @public
   * @returns Number of resources cleaned up
   */
  public cleanupDisposedResources(): number {
    const initialSize = this.resources.size;

    for (const [id, resource] of this.resources.entries()) {
      if (resource.disposed) {
        this.resources.delete(id);
      }
    }

    const cleanedUp = initialSize - this.resources.size;

    if (cleanedUp > 0 && this.config.enableLogging) {
      logger.debug('Disposed resources cleaned up', '', {
        cleanedUp,
        remaining: this.resources.size,
      });
    }

    return cleanedUp;
  }

  /**
   * Forces disposal of all tracked resources.
   *
   * @public
   */
  public async disposeAllResources(): Promise<void> {
    const resources = Array.from(this.resources.values());
    const disposePromises: Promise<void>[] = [];

    for (const resource of resources) {
      if (!resource.disposed) {
        if (Symbol.asyncDispose in resource) {
          disposePromises.push(resource[Symbol.asyncDispose]());
        } else if (Symbol.dispose in resource) {
          try {
            resource[Symbol.dispose]();
          } catch (error) {
            logger.error('Resource disposal failed', '', {
              resourceId: resource.resourceInfo.id,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
      }
    }

    if (disposePromises.length > 0) {
      await Promise.allSettled(disposePromises);
    }

    this.resources.clear();

    if (this.config.enableLogging) {
      logger.info('All resources disposed', '', {
        resourceCount: resources.length,
      });
    }
  }

  /**
   * Disposes the resource manager and all tracked resources.
   *
   * @public
   */
  async [Symbol.asyncDispose](): Promise<void> {
    if (this._disposed) {
      return;
    }

    if (this.leakDetectionInterval) {
      clearInterval(this.leakDetectionInterval);
      this.leakDetectionInterval = undefined;
    }

    await this.disposeAllResources();
    this._disposed = true;

    if (this.config.enableLogging) {
      logger.info('Resource manager disposed', '', {});
    }
  } /**
   
* Starts leak detection monitoring.
   *
   * @private
   */
  private startLeakDetection(): void {
    this.leakDetectionInterval = setInterval(() => {
      this.detectResourceLeaks();
    }, this.config.leakDetectionInterval);
  }

  /**
   * Detects potential resource leaks.
   *
   * @private
   */
  private detectResourceLeaks(): void {
    const stats = this.getResourceStats();
    const now = Date.now();
    const oldResourceThreshold = 5 * 60 * 1000; // 5 minutes

    // Check for resources that have been active for too long
    const oldResources = Array.from(this.resources.values()).filter(
      (resource) =>
        !resource.disposed &&
        now - resource.resourceInfo.createdAt > oldResourceThreshold
    );

    if (oldResources.length > 0) {
      logger.warn('Potential resource leaks detected', '', {
        oldResourceCount: oldResources.length,
        totalActive: stats.active,
        oldestResourceAge: stats.oldestResource
          ? now - stats.oldestResource.createdAt
          : 0,
        resourcesByType: stats.byType,
      });
    }

    // Check for excessive resource usage
    if (stats.active > this.config.maxResources * 0.8) {
      logger.warn('High resource usage detected', '', {
        activeResources: stats.active,
        maxResources: this.config.maxResources,
        utilizationPercent: Math.round(
          (stats.active / this.config.maxResources) * 100
        ),
      });
    }

    // Clean up disposed resources periodically
    this.cleanupDisposedResources();
  }

  /**
   * Cleans up the oldest resources to make room for new ones.
   *
   * @private
   * @param count - Number of resources to clean up
   */
  private cleanupOldestResources(count: number): void {
    const resources = Array.from(this.resources.values())
      .filter((r) => !r.disposed)
      .sort((a, b) => a.resourceInfo.createdAt - b.resourceInfo.createdAt)
      .slice(0, count);

    for (const resource of resources) {
      try {
        if (Symbol.asyncDispose in resource) {
          resource[Symbol.asyncDispose]().catch((error: unknown) => {
            logger.error('Async resource cleanup failed', '', {
              resourceId: resource.resourceInfo.id,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          });
        } else if (Symbol.dispose in resource) {
          resource[Symbol.dispose]();
        }
      } catch (error) {
        logger.error('Resource cleanup failed', '', {
          resourceId: resource.resourceInfo.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }
}

/**
 * Global resource manager instance.
 */
export const resourceManager = new ResourceManager();

/**
 * Creates an HTTP connection resource with automatic cleanup.
 *
 * @public
 * @param request - HTTP request object
 * @param response - HTTP response object
 * @param socket - Socket connection
 * @returns HTTP connection resource
 */
export function createHTTPConnectionResource(
  request?: Readonly<IncomingMessage>,
  response?: Readonly<ServerResponse>,
  socket?: Readonly<Socket>
): HTTPConnectionResource {
  const resource = new HTTPConnectionResource(request, response, socket);
  resourceManager.registerResource(resource);
  return resource;
}

/**
 * Creates a stream resource with automatic cleanup.
 *
 * @public
 * @param stream - Stream to manage
 * @param description - Resource description
 * @returns Stream resource
 */
export function createStreamResource(
  stream: Readonly<NodeJS.ReadableStream | NodeJS.WritableStream>,
  description?: string
): StreamResource {
  const resource = new StreamResource(stream, description);
  resourceManager.registerResource(resource);
  return resource;
}

/**
 * Creates a timer resource with automatic cleanup.
 *
 * @public
 * @param timerId - Timer ID
 * @param timerType - Timer type
 * @param description - Resource description
 * @returns Timer resource
 */
export function createTimerResource(
  timerId: NodeJS.Timeout | NodeJS.Immediate,
  timerType: 'timeout' | 'interval' | 'immediate',
  description?: string
): TimerResource {
  const resource = new TimerResource(timerId, timerType, description);
  resourceManager.registerResource(resource);
  return resource;
}

/**
 * Creates a custom disposable resource.
 *
 * @public
 * @param type - Resource type
 * @param description - Resource description
 * @param cleanupFn - Cleanup function
 * @param metadata - Resource metadata
 * @returns Disposable resource
 */
export function createDisposableResource(
  type: ResourceType,
  description: string,
  cleanupFn: ResourceCleanupFn,
  metadata?: Readonly<Record<string, unknown>>
): BaseDisposableResource {
  const resource = new BaseDisposableResource(
    type,
    description,
    cleanupFn,
    metadata
  );
  resourceManager.registerResource(resource);
  return resource;
}

/**
 * Creates a custom async disposable resource.
 *
 * @public
 * @param type - Resource type
 * @param description - Resource description
 * @param cleanupFn - Async cleanup function
 * @param metadata - Resource metadata
 * @returns Async disposable resource
 */
export function createAsyncDisposableResource(
  type: ResourceType,
  description: string,
  cleanupFn: ResourceCleanupFn,
  metadata?: Readonly<Record<string, unknown>>
): BaseAsyncDisposableResource {
  const resource = new BaseAsyncDisposableResource(
    type,
    description,
    cleanupFn,
    metadata
  );
  resourceManager.registerResource(resource);
  return resource;
}

/**
 * Utility function to wrap a function with automatic resource management.
 *
 * @public
 * @param fn - Function to wrap
 * @param resources - Resources to manage during function execution
 * @returns Wrapped function result
 */
export async function withResources<T>(
  fn: () => Promise<T>,
  ...resources: readonly (DisposableResource | AsyncDisposableResource)[]
): Promise<T> {
  // Register all resources
  for (const resource of resources) {
    resourceManager.registerResource(resource);
  }

  try {
    return await fn();
  } finally {
    // Dispose all resources
    const disposePromises: Promise<void>[] = [];

    for (const resource of resources) {
      if (!resource.disposed) {
        if (Symbol.asyncDispose in resource) {
          disposePromises.push(resource[Symbol.asyncDispose]());
        } else if (Symbol.dispose in resource) {
          try {
            resource[Symbol.dispose]();
          } catch (error) {
            logger.error('Resource disposal failed in withResources', '', {
              resourceId: resource.resourceInfo.id,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
      }
    }

    if (disposePromises.length > 0) {
      await Promise.allSettled(disposePromises);
    }
  }
}

/**
 * Utility function to create a managed timeout with automatic cleanup.
 *
 * @public
 * @param callback - Callback function
 * @param delay - Delay in milliseconds
 * @param description - Timer description
 * @returns Timer resource
 */
export function createManagedTimeout(
  callback: () => void,
  delay: number,
  description?: string
): TimerResource {
  const timerId = setTimeout(callback, delay);
  return createTimerResource(timerId, 'timeout', description);
}

/**
 * Utility function to create a managed interval with automatic cleanup.
 *
 * @public
 * @param callback - Callback function
 * @param interval - Interval in milliseconds
 * @param description - Timer description
 * @returns Timer resource
 */
export function createManagedInterval(
  callback: () => void,
  interval: number,
  description?: string
): TimerResource {
  const timerId = setInterval(callback, interval);
  return createTimerResource(timerId, 'interval', description);
}

/**
 * Utility function to create a managed immediate with automatic cleanup.
 *
 * @public
 * @param callback - Callback function
 * @param description - Timer description
 * @returns Timer resource
 */
export function createManagedImmediate(
  callback: () => void,
  description?: string
): TimerResource {
  const timerId = setImmediate(callback);
  return createTimerResource(timerId, 'immediate', description);
}

/**
 * Gets current resource statistics from the global resource manager.
 *
 * @public
 * @returns Resource statistics
 */
export function getResourceStats(): ReturnType<
  ResourceManager['getResourceStats']
> {
  return resourceManager.getResourceStats();
}

/**
 * Gets information about all tracked resources.
 *
 * @public
 * @returns Array of resource information
 */
export function getAllResourceInfo(): readonly ResourceInfo[] {
  return resourceManager.getResourceInfo();
}

/**
 * Forces cleanup of all disposed resources.
 *
 * @public
 * @returns Number of resources cleaned up
 */
export function cleanupDisposedResources(): number {
  return resourceManager.cleanupDisposedResources();
}

/**
 * Forces disposal of all tracked resources.
 *
 * @public
 */
export async function disposeAllResources(): Promise<void> {
  await resourceManager.disposeAllResources();
}
