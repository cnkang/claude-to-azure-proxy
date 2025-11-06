import { defineConfig, mergeConfig } from 'vitest/config';
import type { UserConfig } from 'vitest/config';
import { baseVitestConfig } from './base';

/**
 * Node.js-specific Vitest configuration
 * Extends base configuration with Node.js-specific settings and optimizations
 */
export const nodeVitestConfig: UserConfig = mergeConfig(baseVitestConfig, {
  test: {
    environment: 'node',

    /* Node.js specific settings */
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true,
        useAtomics: true,
      },
    },

    /* Enhanced timeouts for Node.js performance testing */
    testTimeout: 30000,
    hookTimeout: 10000,

    /* Memory leak detection */
    logHeapUsage: true,

    /* Performance testing */
    benchmark: {
      include: ['**/*.{bench,benchmark}.{js,ts}'],
      exclude: ['node_modules/', 'dist/', 'build/'],
    },

    /* Node.js globals */
    globals: true,

    /* Setup files */
    setupFiles: ['./tests/setup.ts'],

    /* File patterns */
    include: ['tests/**/*.{test,spec}.{js,ts}', 'src/**/*.{test,spec}.{js,ts}'],
  },

  /* Resolve configuration for Node.js */
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

  /* ESBuild for Node.js */
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
});

export default defineConfig(nodeVitestConfig);
