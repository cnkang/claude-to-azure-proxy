import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    globals: true,
    environment: 'node',
    testTimeout: 10000,
  },
});
