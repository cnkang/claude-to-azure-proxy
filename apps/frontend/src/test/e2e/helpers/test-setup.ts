/**
 * Test Setup Helper for E2E Tests
 *
 * Provides utilities for test initialization, cleanup, and environment setup.
 * Ensures proper test isolation by clearing storage and resetting state.
 *
 * @module TestSetup
 */

import type { Page } from '@playwright/test';
import { UIActions } from './ui-actions.js';

/**
 * Helper class for setting up and tearing down E2E test environments
 */
export class TestSetup {
  /**
   * Clears all browser storage (localStorage, sessionStorage, IndexedDB)
   * @param page The Playwright page instance
   * @throws Error if storage clearing fails
   */
  static async clearStorage(page: Page): Promise<void> {
    await page.evaluate(() => {
      // Clear localStorage
      localStorage.clear();

      // Clear sessionStorage
      sessionStorage.clear();
    });

    // Clear IndexedDB databases
    await page.evaluate(async () => {
      const databases = await indexedDB.databases();
      for (const db of databases) {
        if (db.name) {
          indexedDB.deleteDatabase(db.name);
        }
      }
    });
  }

  /**
   * Sets up a clean test environment with cleared storage and loaded app
   * @param page The Playwright page instance
   * @param url The URL to navigate to (defaults to http://localhost:3000)
   * @returns UIActions instance for interacting with the UI
   * @throws Error if setup fails
   */
  static async setup(page: Page, url = 'http://localhost:3000'): Promise<UIActions> {
    // Navigate to app
    await page.goto(url);

    // Wait for navigation to complete (app redirects to /chat)
    await page.waitForURL('**/chat**', { timeout: 10000 });

    // Wait for the app container to be visible (don't wait for networkidle as it may timeout)
    await page.waitForSelector('[data-testid="app-container"]', {
      state: 'visible',
      timeout: 10000,
    });

    // Return UI actions helper
    return new UIActions(page);
  }

  /**
   * Performs cleanup after a test
   * @param page The Playwright page instance
   */
  static async cleanup(page: Page): Promise<void> {
    // Clear storage to prevent test pollution
    await this.clearStorage(page);
  }

  /**
   * Waits for storage events to propagate between tabs
   * @param page The Playwright page instance
   * @param delayMs The delay in milliseconds (defaults to 500ms)
   */
  static async waitForStorageSync(page: Page, delayMs = 500): Promise<void> {
    await page.waitForTimeout(delayMs);
  }

  /**
   * Waits for a specific condition to be true
   * @param page The Playwright page instance
   * @param condition A function that returns true when the condition is met
   * @param timeout Maximum time to wait in milliseconds (defaults to 5000ms)
   * @throws Error if condition is not met within timeout
   */
  static async waitForCondition(
    page: Page,
    condition: () => Promise<boolean>,
    timeout = 5000
  ): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await page.waitForTimeout(100);
    }
    throw new Error(`Condition not met within ${timeout}ms`);
  }

  /**
   * Takes a screenshot for debugging purposes
   * @param page The Playwright page instance
   * @param name The name for the screenshot file
   */
  static async takeDebugScreenshot(page: Page, name: string): Promise<void> {
    await page.screenshot({
      path: `test-results/debug-${name}-${Date.now()}.png`,
      fullPage: true,
    });
  }
}
