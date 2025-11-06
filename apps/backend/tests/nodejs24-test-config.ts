/**
 * Node.js 24 specific test configuration
 * Extends the base test configuration with Node.js 24 features
 */

import { testConfig, createMockConfig } from './test-config';
import type { Config } from '../src/config/index';

/**
 * Node.js 24 enhanced test configuration
 */
export const nodejs24TestConfig: Config & {
  readonly NODE_VERSION: string;
  readonly V8_VERSION: string;
  readonly ENABLE_GC_MONITORING: boolean;
  readonly ENABLE_PERFORMANCE_PROFILING: boolean;
  readonly MEMORY_LEAK_DETECTION: boolean;
} = {
  ...testConfig,
  NODE_VERSION: '24.0.0',
  V8_VERSION: '13.6.0',
  ENABLE_GC_MONITORING: true,
  ENABLE_PERFORMANCE_PROFILING: true,
  MEMORY_LEAK_DETECTION: true,
};

/**
 * Node.js 24 specific environment setup
 */
export const setupNodeJS24TestEnvironment = (): void => {
  // Set Node.js 24 specific environment variables
  process.env.NODE_VERSION = nodejs24TestConfig.NODE_VERSION;
  process.env.V8_VERSION = nodejs24TestConfig.V8_VERSION;
  process.env.ENABLE_GC_MONITORING =
    nodejs24TestConfig.ENABLE_GC_MONITORING.toString();
  process.env.ENABLE_PERFORMANCE_PROFILING =
    nodejs24TestConfig.ENABLE_PERFORMANCE_PROFILING.toString();
  process.env.MEMORY_LEAK_DETECTION =
    nodejs24TestConfig.MEMORY_LEAK_DETECTION.toString();

  // Configure Node.js 24 specific flags
  if (nodejs24TestConfig.ENABLE_GC_MONITORING) {
    // Note: --trace-gc is not allowed in NODE_OPTIONS, so we skip this for now
    // GC monitoring will be handled through PerformanceObserver instead
  }

  // Set up base test environment
  Object.entries(testConfig).forEach(([key, value]) => {
    if (typeof value === 'string' || typeof value === 'number') {
      process.env[key] = value.toString();
    }
  });
};

/**
 * Enhanced mock configuration factory for Node.js 24 features
 */
export const createNodeJS24MockConfig = (overrides: Partial<Config> = {}) => ({
  ...createMockConfig(overrides),
  nodejs24Features: {
    gcMonitoring: nodejs24TestConfig.ENABLE_GC_MONITORING,
    performanceProfiling: nodejs24TestConfig.ENABLE_PERFORMANCE_PROFILING,
    memoryLeakDetection: nodejs24TestConfig.MEMORY_LEAK_DETECTION,
  },
  // Node.js 24 specific configuration methods
  isNodeJS24FeaturesEnabled: () => true,
  getNodeJSVersion: () => nodejs24TestConfig.NODE_VERSION,
  getV8Version: () => nodejs24TestConfig.V8_VERSION,
});

/**
 * Test utilities for Node.js 24 feature validation
 */
export const nodejs24TestUtils = {
  /**
   * Check if running on Node.js 24+
   */
  isNodeJS24(): boolean {
    const version = process.version;
    const majorVersion = parseInt(version.slice(1, 10).split('.')[0], 10);
    return majorVersion >= 24;
  },

  /**
   * Check if V8 version supports expected features
   */
  isV8Compatible(): boolean {
    const v8Version = process.versions.v8;
    const majorVersion = parseInt(v8Version.split('.', 10)[0], 10);
    return majorVersion >= 13;
  },

  /**
   * Validate Node.js 24 environment
   */
  validateNodeJS24Environment(): void {
    if (!this.isNodeJS24()) {
      throw new Error(`Node.js 24+ required, but running ${process.version}`);
    }

    if (!this.isV8Compatible()) {
      throw new Error(`V8 13.6+ required, but running ${process.versions.v8}`);
    }
  },

  /**
   * Get Node.js 24 specific capabilities
   */
  getCapabilities(): {
    readonly explicitResourceManagement: boolean;
    readonly enhancedGC: boolean;
    readonly improvedAsyncPerformance: boolean;
    readonly betterErrorHandling: boolean;
  } {
    return {
      explicitResourceManagement: this.isNodeJS24(),
      enhancedGC: this.isNodeJS24(),
      improvedAsyncPerformance: this.isNodeJS24(),
      betterErrorHandling: this.isNodeJS24(),
    };
  },
};

/**
 * Clean up Node.js 24 specific environment variables
 */
export const cleanupNodeJS24TestEnvironment = (): void => {
  delete process.env.NODE_VERSION;
  delete process.env.V8_VERSION;
  delete process.env.ENABLE_GC_MONITORING;
  delete process.env.ENABLE_PERFORMANCE_PROFILING;
  delete process.env.MEMORY_LEAK_DETECTION;

  // Clean up Node.js options
  if (process.env.NODE_OPTIONS) {
    process.env.NODE_OPTIONS = process.env.NODE_OPTIONS.replace(
      /\s*--trace-gc\s*/g,
      ''
    ).trim();

    if (!process.env.NODE_OPTIONS) {
      delete process.env.NODE_OPTIONS;
    }
  }
};
