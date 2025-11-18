import { defineConfig, devices } from '@playwright/test';

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
  forbidOnly: !!process.env.CI,
  // Retry flaky tests - 2 retries in CI, 1 retry locally for storage-related flakiness
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  
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
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    
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
    
    // Mobile viewports for responsive testing
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
  
  // Run dev server before starting tests
  webServer: {
    command: 'pnpm --filter @repo/frontend dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
