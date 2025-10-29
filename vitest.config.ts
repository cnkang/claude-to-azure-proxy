import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/coverage/**'
      ],
      thresholds: {
        global: {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90
        }
      }
    },
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules/', 'dist/'],
    // Node.js 24 specific test configuration
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true,
        useAtomics: true
      }
    },
    // Enhanced test timeout for Node.js 24 performance testing
    testTimeout: 30000,
    hookTimeout: 10000,
    // Memory leak detection configuration
    logHeapUsage: true,
    // Performance testing configuration
    benchmark: {
      include: ['tests/**/*.{bench,benchmark}.{js,ts}'],
      exclude: ['node_modules/', 'dist/']
    }
  },
  esbuild: {
    target: 'node24',
    // Enable Node.js 24 specific optimizations
    platform: 'node',
    format: 'esm',
    // Use Node.js 24 features
    supported: {
      'top-level-await': true,
      'import-meta': true,
      'dynamic-import': true
    }
  },
  resolve: {
    alias: [
      { find: '@', replacement: new URL('./src', import.meta.url).pathname },
      { find: 'supertest', replacement: new URL('./tests/utils/mock-supertest.ts', import.meta.url).pathname }
    ]
  },
  // Node.js 24 specific optimizations
  optimizeDeps: {
    include: ['vitest/globals'],
    exclude: ['@vitest/coverage-v8']
  }
});
