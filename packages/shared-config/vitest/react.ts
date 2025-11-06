import { defineConfig, mergeConfig } from 'vitest/config';
import type { UserConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { baseVitestConfig } from './base';

/**
 * React-specific Vitest configuration
 * Extends base configuration with React Testing Library and happy-dom environment
 */
export const reactVitestConfig: UserConfig = mergeConfig(baseVitestConfig, {
  plugins: [react()],

  test: {
    environment: 'happy-dom',

    /* React Testing Library setup */
    setupFiles: ['./src/test/setup.ts'],

    /* Coverage thresholds adjusted for frontend */
    coverage: {
      ...baseVitestConfig.test?.coverage,
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
      exclude: [
        ...(baseVitestConfig.test?.coverage?.exclude || []),
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/assets/**',
        'src/test/**',
        '**/*.stories.*',
        '**/*.config.*',
      ],
    },

    /* Browser-like environment */
    globals: true,

    /* File patterns for React */
    include: [
      'src/**/*.{test,spec}.{js,ts,jsx,tsx}',
      'tests/**/*.{test,spec}.{js,ts,jsx,tsx}',
    ],

    /* Mock browser APIs */
    mockReset: true,
    clearMocks: true,
    restoreMocks: true,

    /* Performance settings for DOM testing */
    testTimeout: 15000,
    hookTimeout: 10000,
  },

  /* Resolve configuration for React */
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      '@repo/shared-types': new URL(
        '../../packages/shared-types/src',
        import.meta.url
      ).pathname,
      '@repo/shared-utils': new URL(
        '../../packages/shared-utils/src',
        import.meta.url
      ).pathname,
    },
  },

  /* ESBuild for React */
  esbuild: {
    target: 'es2022',
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
});

export default defineConfig(reactVitestConfig);
