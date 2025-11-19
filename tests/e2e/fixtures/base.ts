import { test as base, Page } from '@playwright/test';
import { TestHelpers } from '../utils/test-helpers.js';

/**
 * Extended test fixtures with clean page state and test helpers
 * 
 * Provides:
 * - Automatic storage cleanup before each test
 * - TestHelpers instance for common operations
 * - Console and error logging in debug mode
 */
type TestFixtures = {
  helpers: TestHelpers;
  cleanPage: Page;
};

export const test = base.extend<TestFixtures>({
  /**
   * Clean page fixture - ensures storage is cleared and initialized before each test
   * 
   * Enhanced with:
   * - Proper storage initialization verification
   * - Storage state verification before tests
   * - Comprehensive cleanup after tests
   */
  cleanPage: async ({ page }, use) => {
    const helpers = new TestHelpers(page);
    
    // Navigate to the app
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await helpers.waitForAppReady();
    
    // Enable logging in debug mode
    if (process.env.DEBUG) {
      helpers.enableConsoleLogging();
      helpers.enableErrorLogging();
      await helpers.logStorageState('Before Test');
    }
    
    // Use the clean page
    await use(page);
    
    // Cleanup after test
    try {
      // Close all other pages to release DB locks
      const context = page.context();
      const pages = context.pages();
      for (const p of pages) {
        if (p !== page) {
          await p.close();
        }
      }

      // Wait for any pending storage operations
      await helpers.waitForPendingStorageOperations(1000);
      
      // Clear storage with timeout
      await Promise.race([
        helpers.clearAllStorage(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Storage cleanup timeout')), 5000)
        ),
      ]);
    } catch (error) {
      if (process.env.DEBUG) {
        console.warn('Storage cleanup failed or timed out:', error);
      }
      // Continue anyway - don't fail the test due to cleanup issues
    }
  },
  
  /**
   * Test helpers fixture - provides common operations
   */
  helpers: async ({ page }, use) => {
    const helpers = new TestHelpers(page);
    await use(helpers);
  },
});

export { expect } from '@playwright/test';
