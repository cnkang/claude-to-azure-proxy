import { defineConfig } from 'vitest/config';
import type { UserConfig } from 'vitest/config';

/**
 * Base Vitest configuration for all projects
 * Provides common test settings, coverage thresholds, and performance optimizations
 */
export const baseVitestConfig: UserConfig = {
  test: {
    globals: true,
    environment: 'node',

    /* Coverage Configuration */
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'build/',
        'coverage/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/test-*',
        '**/*.test.*',
        '**/*.spec.*',
        '**/setup.*',
        '**/fixtures/**',
        '**/mocks/**',
      ],
      thresholds: {
        global: {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
      },
      all: true,
      clean: true,
      cleanOnRerun: true,
    },

    /* Test Execution */
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
    isolate: true,

    /* Performance */
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
        isolate: true,
      },
    },

    /* Reporting */
    reporter: ['verbose', 'json', 'html'],
    outputFile: {
      json: './coverage/test-results.json',
      html: './coverage/test-results.html',
    },

    /* File Patterns */
    include: ['**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules/', 'dist/', 'build/', 'coverage/', '**/*.d.ts'],

    /* Watch Mode */
    watchExclude: ['node_modules/', 'dist/', 'build/', 'coverage/'],

    /* Environment Variables */
    env: {
      NODE_ENV: 'test',
    },
  },

  /* ESBuild Configuration */
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
};

export default defineConfig(baseVitestConfig);
