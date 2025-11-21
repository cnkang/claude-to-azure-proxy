import { defineConfig, devices } from '@playwright/test';

const isCI = process.env.CI === 'true' || process.env.CI === '1';
const resolveEnv = (value: string | undefined, fallback: string): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback;

/**
 * Playwright configuration for E2E testing
 *
 * This configuration supports:
 * - Multi-browser testing (Chromium, Firefox, WebKit)
 * - Automatic dev server startup
 * - Screenshot and video capture on failure
 * - HTML and JSON test reports
 * - CI/CD integration
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // Test directory
  testDir: './tests/e2e',

  // Maximum time one test can run for
  timeout: 30 * 1000,

  // Test execution settings
  fullyParallel: true,
  forbidOnly: isCI,
  // Retry flaky tests - 2 retries in CI, 1 retry locally for storage-related flakiness
  retries: isCI ? 2 : 1,
  workers: isCI ? 1 : undefined,

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
    ['list'],
    // Add JUnit reporter for CI/CD integration
    ['junit', { outputFile: 'playwright-report/junit.xml' }],
  ],

  // Global setup and teardown for storage cleanup
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',

  // Shared settings for all projects
  use: {
    // Base URL for navigation
    baseURL: resolveEnv(process.env.BASE_URL, 'http://localhost:8080'),

    // Collect trace on failure
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',

    // Browser context options
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,

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
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // Run dev server before starting tests
  webServer: {
    // Start backend only; serves built frontend from dist/
    command: 'pnpm --filter @repo/backend dev',
    url: 'http://localhost:8080',
    reuseExistingServer: !isCI,
    timeout: 180 * 1000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      // Increase Node.js heap size for E2E tests (GitHub Actions has 16GB RAM)
      NODE_OPTIONS: '--max-old-space-size=6144',
      PROXY_API_KEY: resolveEnv(
        process.env.PROXY_API_KEY,
        'dev-proxy-key-123456789012345678901234'
      ),
      AZURE_OPENAI_ENDPOINT: resolveEnv(
        process.env.AZURE_OPENAI_ENDPOINT,
        'https://example.openai.azure.com'
      ),
      AZURE_OPENAI_API_KEY: resolveEnv(
        process.env.AZURE_OPENAI_API_KEY,
        'a'.repeat(32)
      ),
      AZURE_OPENAI_MODEL: resolveEnv(process.env.AZURE_OPENAI_MODEL, 'gpt-4o'),
      ENABLE_CONTENT_SECURITY_VALIDATION: 'false',
    },
  },
});
