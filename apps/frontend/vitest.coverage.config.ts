import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

/**
 * Vitest configuration for coverage testing
 * Optimized to prevent worker timeout while collecting coverage
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // Override pool settings for coverage
      pool: 'forks',
      poolOptions: {
        forks: {
          singleFork: true,  // Single fork prevents worker timeout
          isolate: true,
          execArgv: ['--max-old-space-size=16384', '--expose-gc'],
          maxForks: 1,
          minForks: 1,
        },
      },
      
      // Disable all parallelism for coverage
      fileParallelism: false,
      maxConcurrency: 1,
      maxWorkers: 1,
      minWorkers: 1,
      
      // Increase timeouts for coverage collection
      testTimeout: 120000,
      hookTimeout: 120000,
      teardownTimeout: 180000,
      
      // Disable watch mode
      watch: false,
      
      // Enable coverage
      coverage: {
        enabled: true,
        provider: 'v8',
        reporter: ['text', 'json', 'html', 'lcov'],
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
        perFile: true,
        skipFull: false,
      },
    },
  })
);
