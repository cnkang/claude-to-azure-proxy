/// <reference lib="dom" />
/* eslint-disable no-console, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-condition */
/**
 * Global teardown for Playwright E2E tests
 *
 * This file runs once after all tests to:
 * - Clean up any remaining test data
 * - Log test execution summary
 * - Perform final cleanup
 */

import { chromium, FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig): Promise<void> {
  const baseURL =
    typeof config.use?.baseURL === 'string' && config.use.baseURL.length > 0
      ? config.use.baseURL
      : 'http://localhost:8080';

  console.log('🧹 Starting global teardown...');

  // Launch browser for final cleanup
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to application
    await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Clear all storage
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // Clear IndexedDB databases
    await page.evaluate(async () => {
      const databases = (await indexedDB.databases?.()) ?? [];
      const databaseNames = databases
        .map((db) => db?.name)
        .filter(
          (name): name is string => typeof name === 'string' && name.length > 0
        );

      for (const name of databaseNames) {
        indexedDB.deleteDatabase(name);
      }
    });

    console.log('✅ Final storage cleanup complete');
  } catch (rawError: unknown) {
    const error =
      rawError instanceof Error ? rawError : new Error(String(rawError));
    console.error('⚠️  Global teardown warning:', error);
    // Don't throw - teardown failures shouldn't fail the test suite
  } finally {
    await context.close();
    await browser.close();
  }

  console.log('✅ Global teardown complete');
}

export default globalTeardown;
