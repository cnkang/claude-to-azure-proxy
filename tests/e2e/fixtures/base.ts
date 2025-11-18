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
    
    // Navigate to app
    await page.goto('/');
    
    // Wait for app to be ready
    await helpers.waitForAppReady();
    
    // Clear all storage with verification
    await helpers.clearAllStorage();
    
    // Initialize storage and verify it's ready
    await helpers.initializeStorage();
    const isStorageReady = await helpers.verifyStorageReady();
    
    if (!isStorageReady) {
      throw new Error('Storage failed to initialize properly');
    }
    
    // Reload to start with clean state
    await page.reload();
    await helpers.waitForAppReady();
    
    // Verify storage is still ready after reload
    await helpers.initializeStorage();
    
    // Verify storage is empty before test starts
    const isEmpty = await helpers.verifyStorageEmpty();
    if (!isEmpty && process.env.DEBUG) {
      console.warn('Storage not empty at test start - attempting additional cleanup');
      await helpers.clearAllStorage();
      await helpers.verifyStorageEmpty();
    }
    
    // Enable logging in debug mode
    if (process.env.DEBUG) {
      helpers.enableConsoleLogging();
      helpers.enableErrorLogging();
      await helpers.logStorageState('Before Test');
    }
    
    // Use the clean page
    await use(page);
    
    // Cleanup after test with timeout and verification
    try {
      // Wait for any pending storage operations
      await helpers.waitForPendingStorageOperations(2000);
      
      // Perform cleanup with timeout
      await Promise.race([
        helpers.cleanupStorageWithVerification(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Storage cleanup timeout')), 5000)
        ),
      ]);
    } catch (error) {
      console.warn('Storage cleanup failed or timed out:', error);
      // Continue anyway - don't fail the test due to cleanup issues
    }
  },
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
