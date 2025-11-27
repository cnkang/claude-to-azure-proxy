import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Frontend E2E testing
 *
 * This configuration supports:
 * - Cross-tab synchronization testing
 * - Storage event testing (localStorage, IndexedDB)
 * - Multi-browser testing
 * - Automatic dev server startup
 */
export default defineConfig({
  // Test directory
  testDir: './src/test/e2e',

  // Maximum time one test can run for
  timeout: 30 * 1000,

  // Test execution settings
  fullyParallel: false, // Run tests sequentially for storage tests
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1, // Use single worker for storage tests to avoid conflicts

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],

  // Shared settings for all projects
  use: {
    // Base URL for navigation
    baseURL: 'http://localhost:3000',

    // Collect trace on failure
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',

    // Browser context options
    viewport: { width: 1280, height: 720 },

    // Timeout for actions - increased for storage operations
    actionTimeout: 10 * 1000,
    navigationTimeout: 30 * 1000,

    // Clear storage state before each test to ensure isolation
    storageState: undefined,
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Run dev server before starting tests
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
