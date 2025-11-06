import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['../setup.ts'],
    include: ['**/*.{bench,benchmark,perf}.{js,ts}'],
    exclude: ['node_modules/', 'dist/'],

    // Performance testing specific configuration
    testTimeout: 60000, // 1 minute for performance tests
    hookTimeout: 30000,

    // Memory monitoring for Node.js 24
    logHeapUsage: true,

    // Benchmark configuration
    benchmark: {
      include: ['**/*.{bench,benchmark}.{js,ts}'],
      exclude: ['node_modules/', 'dist/'],
      reporters: ['verbose', 'json'],
      outputFile: {
        json: './performance-results.json',
      },
    },

    // Node.js 24 specific performance testing
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true,
        useAtomics: true,
        // Enable Node.js 24 worker thread optimizations
        minThreads: 1,
        maxThreads: 4,
      },
    },
  },

  esbuild: {
    target: 'node24',
    platform: 'node',
    format: 'esm',
  },
});
