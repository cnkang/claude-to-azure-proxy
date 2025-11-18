import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    
    // Test timeout settings for async operations
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 300000,  // 5 minutes for cleanup - allow worker to finish
    
    // Ensure proper cleanup between tests
    clearMocks: true,
    restoreMocks: true,
    
    // Retry flaky tests once
    retry: 1,
    
    // Use forks pool with aggressive memory settings
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        isolate: true,
        execArgv: [
          '--max-old-space-size=4096',  // 4GB heap
          '--expose-gc',
        ],
      },
    },
    
    // Keep isolation enabled
    isolate: true,
    
    // Sequence tests to reduce memory pressure
    sequence: {
      shuffle: false,
      concurrent: false,
    },
    
    // Disable file parallelism
    fileParallelism: false,
    
    // Don't bail on worker errors if tests passed
    bail: 0,
    
    // Pass with no tests to handle edge cases
    passWithNoTests: true,
    
    typecheck: {
      enabled: false,
    },
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [
      'node_modules/',
      'dist/',
      'coverage/',
      '**/*.playwright.test.ts', // Exclude Playwright tests from vitest
    ],
    coverage: {
      enabled: false,  // Disabled by default, enable with --coverage flag
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      clean: true,
      cleanOnRerun: true,
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/test-*',
        '**/*.test.*',
        '**/*.spec.*',
        '**/*.css',
        'src/i18n/**/*.json',
        'src/test/**',
        'src/main.tsx',
      ],
      include: [
        'src/**/*.{ts,tsx}',
      ],
      all: true,
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
      // Optimize coverage collection to prevent timeout
      perFile: true,
      skipFull: false,
      100: false,
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@repo/shared-types': resolve(
        __dirname,
        '../../packages/shared-types/src'
      ),
      '@repo/shared-utils': resolve(
        __dirname,
        '../../packages/shared-utils/src'
      ),
    },
  },
});
