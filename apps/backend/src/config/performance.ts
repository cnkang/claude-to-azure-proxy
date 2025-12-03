/**
 * Performance optimization configuration for Node.js 24
 * Configures optimal garbage collection settings and HTTP performance enhancements
 */

import type { Agent as HttpAgent } from 'node:http';
import type { Agent as HttpsAgent } from 'node:https';
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { logger } from '../middleware/logging';

/**
 * Performance configuration interface
 */
export interface PerformanceConfig {
  readonly gc: {
    readonly maxOldSpaceSize: number;
    readonly maxNewSpaceSize: number;
    readonly enableOptimizations: boolean;
    readonly exposeGC: boolean;
  };
  readonly http: {
    readonly keepAlive: boolean;
    readonly keepAliveMsecs: number;
    readonly maxSockets: number;
    readonly maxFreeSockets: number;
    readonly timeout: number;
    readonly headersTimeout: number;
    readonly requestTimeout: number;
  };
  readonly streaming: {
    readonly highWaterMark: number;
    readonly objectMode: boolean;
    readonly enableBackpressure: boolean;
    readonly maxConcurrentStreams: number;
  };
  readonly monitoring: {
    readonly enableProfiling: boolean;
    readonly memoryMonitoring: boolean;
    readonly gcMonitoring: boolean;
    readonly performanceMarks: boolean;
  };
}

/**
 * Get optimal performance configuration for Node.js 24
 */
export function getPerformanceConfig(): PerformanceConfig {
  const cpuCount = cpus().length;
  const isProduction = process.env.NODE_ENV === 'production';
  const memoryLimit = Number.parseInt(process.env.MEMORY_LIMIT ?? '1024', 10);

  return {
    gc: {
      // Optimize heap sizes for Node.js 24
      maxOldSpaceSize: Math.min(memoryLimit * 0.8, 2048), // 80% of available memory, max 2GB
      maxNewSpaceSize: Math.min(memoryLimit * 0.1, 256), // 10% of available memory, max 256MB
      enableOptimizations: true,
      exposeGC: !isProduction, // Only expose GC in development/testing
    },
    http: {
      keepAlive: true,
      keepAliveMsecs: 30000, // 30 seconds
      maxSockets: cpuCount * 4, // 4 sockets per CPU core
      maxFreeSockets: cpuCount * 2, // 2 free sockets per CPU core
      timeout: 120000, // 2 minutes
      headersTimeout: 60000, // 1 minute
      requestTimeout: 300000, // 5 minutes for streaming responses
    },
    streaming: {
      highWaterMark: 64 * 1024, // 64KB buffer for optimal performance
      objectMode: false,
      enableBackpressure: true,
      maxConcurrentStreams: cpuCount * 2, // 2 concurrent streams per CPU core
    },
    monitoring: {
      enableProfiling: !isProduction,
      memoryMonitoring: true,
      gcMonitoring: true,
      performanceMarks: !isProduction,
    },
  };
}

/**
 * Apply Node.js 24 garbage collection optimizations
 */
export function configureGarbageCollection(
  config: PerformanceConfig['gc']
): void {
  // Set V8 flags for optimal garbage collection
  const v8Flags = [
    `--max-old-space-size=${config.maxOldSpaceSize}`,
    `--max-semi-space-size=${config.maxNewSpaceSize}`,
  ];

  if (config.enableOptimizations) {
    v8Flags.push(
      '--optimize-for-size', // Optimize for memory usage
      '--gc-interval=100', // More frequent GC for better memory management
      '--incremental-marking', // Enable incremental marking
      '--concurrent-marking', // Enable concurrent marking
      '--parallel-scavenge' // Enable parallel scavenging
    );
  }

  if (config.exposeGC) {
    v8Flags.push('--expose-gc');
  }

  // Note: V8 flags must be set at startup, this is for documentation
  logger.info('Recommended V8 flags', '', { flags: v8Flags.join(' ') });
}

/**
 * Configure HTTP agent for optimal performance
 */
export async function createOptimizedHTTPAgent(
  config: PerformanceConfig['http']
): Promise<{
  httpAgent: HttpAgent;
  httpsAgent: HttpsAgent;
}> {
  const { Agent: HttpAgent } = await import('node:http');
  const { Agent: HttpsAgent } = await import('node:https');

  const agentOptions = {
    keepAlive: config.keepAlive,
    keepAliveMsecs: config.keepAliveMsecs,
    maxSockets: config.maxSockets,
    maxFreeSockets: config.maxFreeSockets,
    timeout: config.timeout,
    // Node.js 24 specific optimizations
    scheduling: 'lifo' as const, // Last-in-first-out for better cache locality
    family: 0, // Allow both IPv4 and IPv6
  };

  return {
    httpAgent: new HttpAgent(agentOptions),
    httpsAgent: new HttpsAgent({
      ...agentOptions,
      // HTTPS specific optimizations
      secureProtocol: 'TLSv1_3_method', // Use TLS 1.3 for better performance
      honorCipherOrder: true,
      ciphers: [
        'TLS_AES_256_GCM_SHA384',
        'TLS_CHACHA20_POLY1305_SHA256',
        'TLS_AES_128_GCM_SHA256',
      ].join(':'),
    }),
  };
}

/**
 * Performance monitoring utilities
 */
export class PerformanceMonitor {
  private readonly marks = new Map<string, number>();
  private readonly measures = new Map<string, number>();

  /**
   * Mark the start of a performance measurement
   */
  public mark(name: string): void {
    this.marks.set(name, performance.now());
    if (typeof performance.mark === 'function') {
      performance.mark(name);
    }
  }

  /**
   * Measure the time since a mark
   */
  public measure(name: string, startMark: string): number {
    const startTime = this.marks.get(startMark);
    if (startTime === undefined) {
      throw new Error(`Mark '${startMark}' not found`);
    }

    const duration = performance.now() - startTime;
    this.measures.set(name, duration);

    if (typeof performance.measure === 'function') {
      performance.measure(name, startMark);
    }

    return duration;
  }

  /**
   * Get all measurements
   */
  public getMeasures(): ReadonlyMap<string, number> {
    return new Map(this.measures);
  }

  /**
   * Clear all marks and measures
   */
  public clear(): void {
    this.marks.clear();
    this.measures.clear();

    if (typeof performance.clearMarks === 'function') {
      performance.clearMarks();
    }
    if (typeof performance.clearMeasures === 'function') {
      performance.clearMeasures();
    }
  }
}

/**
 * Global performance monitor instance
 */
export const performanceMonitor = new PerformanceMonitor();

/**
 * Memory pressure detection and handling
 */
export class MemoryPressureHandler {
  private readonly thresholds = {
    warning: 0.8, // 80% of max heap
    critical: 0.9, // 90% of max heap
  };

  private isHandlingPressure = false;

  /**
   * Check current memory pressure level
   */
  public checkMemoryPressure(): 'normal' | 'warning' | 'critical' {
    const memUsage = process.memoryUsage();
    const heapUsedRatio = memUsage.heapUsed / memUsage.heapTotal;

    if (heapUsedRatio >= this.thresholds.critical) {
      return 'critical';
    }

    if (heapUsedRatio >= this.thresholds.warning) {
      return 'warning';
    }

    return 'normal';
  }

  /**
   * Handle memory pressure by triggering garbage collection
   */
  public async handleMemoryPressure(): Promise<void> {
    if (this.isHandlingPressure) {
      return; // Already handling pressure
    }

    this.isHandlingPressure = true;

    try {
      const pressureLevel = this.checkMemoryPressure();

      if (pressureLevel === 'critical') {
        // Force immediate garbage collection
        if (global.gc) {
          global.gc();
        }

        // Wait for GC to complete
        await new Promise((resolve) => setImmediate(resolve));
      } else if (pressureLevel === 'warning') {
        // Schedule garbage collection on next tick
        process.nextTick(() => {
          if (global.gc) {
            global.gc();
          }
        });
      }
    } finally {
      this.isHandlingPressure = false;
    }
  }
}

/**
 * Global memory pressure handler instance
 */
export const memoryPressureHandler = new MemoryPressureHandler();

/**
 * Initialize performance optimizations
 */
export function initializePerformanceOptimizations(): PerformanceConfig {
  const config = getPerformanceConfig();

  // Configure garbage collection
  configureGarbageCollection(config.gc);

  // Set up memory pressure monitoring
  if (config.monitoring.memoryMonitoring) {
    setInterval(() => {
      memoryPressureHandler.handleMemoryPressure().catch((error: unknown) => {
        logger.error('Memory pressure handler failed', '', { error });
      });
    }, 30000); // Check every 30 seconds
  }

  // Set up performance monitoring
  if (config.monitoring.performanceMarks) {
    performanceMonitor.mark('application-start');
  }

  return config;
}

export default getPerformanceConfig;
