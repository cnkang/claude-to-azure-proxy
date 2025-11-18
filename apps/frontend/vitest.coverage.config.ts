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
          execArgv: ['--max-old-space-size=4096'],
        },
      },
      
      // Disable file parallelism for coverage
      fileParallelism: false,
      
      // Increase timeouts for coverage collection
      testTimeout: 30000,
      hookTimeout: 30000,
      teardownTimeout: 60000,
      
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
