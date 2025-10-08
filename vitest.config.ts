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
      ]
    },
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules/', 'dist/']
  },
  esbuild: {
    target: 'node22'
  },
  resolve: {
    alias: [
      { find: '@', replacement: new URL('./src', import.meta.url).pathname },
      { find: 'supertest', replacement: new URL('./tests/utils/mock-supertest.ts', import.meta.url).pathname }
    ]
  }
});
