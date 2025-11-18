import { defineConfig } from 'vitest/config';
import baseConfig from '../../packages/shared-config/vitest/base';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    exclude: [
      ...(baseConfig.test?.exclude ?? []),
      'tests/performance/**',
      'tests/integration/end-to-end-integration.test.ts',
      'tests/integration/build-deployment-validation.test.ts',
      'tests/integration/frontend-serving.test.ts',
      'tests/build-pipeline.test.ts',
      'tests/routes/frontend-endpoints.test.ts',
    ],
    // Node.js 24 specific test configuration
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
        isolate: true,
        useAtomics: true,
        // Limit worker count to prevent excessive heap usage during heavy suites
        maxThreads: 1,
        minThreads: 1,
      },
    },
    // Run specs sequentially per worker to avoid concurrent heap spikes
    fileParallelism: false,
    nodeOptions: ['--expose-gc'],
    // Enhanced test timeout for Node.js 24 performance testing
    testTimeout: 30000,
    hookTimeout: 10000,
    teardownTimeout: 20000,
    // Memory leak detection configuration
    logHeapUsage: true,
    // Performance testing configuration
    benchmark: {
      include: ['tests/**/*.{bench,benchmark}.{js,ts}'],
      exclude: ['node_modules/', 'dist/'],
    },
  },
  esbuild: {
    target: 'node24',
    platform: 'node',
    format: 'esm',
    supported: {
      'top-level-await': true,
      'import-meta': true,
      'dynamic-import': true,
    },
  },
  resolve: {
    alias: [
      { find: '@', replacement: new URL('./src', import.meta.url).pathname },
      {
        find: '@repo/shared-types',
        replacement: new URL('../../packages/shared-types/src', import.meta.url)
          .pathname,
      },
      {
        find: '@repo/shared-utils',
        replacement: new URL('../../packages/shared-utils/src', import.meta.url)
          .pathname,
      },
    ],
  },
});
