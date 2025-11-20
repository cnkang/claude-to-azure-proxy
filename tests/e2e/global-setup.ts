/// <reference lib="dom" />
/* eslint-disable no-console, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-condition */
/**
 * Global setup for Playwright E2E tests
 *
 * This file runs once before all tests to:
 * - Verify the application is accessible
 * - Clear any existing storage state
 * - Set up test environment
 */

import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    typeof config.use?.baseURL === 'string' && config.use.baseURL.length > 0
      ? config.use.baseURL
      : 'http://localhost:8080';

  console.log('🚀 Starting global setup...');
  console.log(`📍 Base URL: ${baseURL}`);

  // Launch browser to verify application is accessible
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to base URL to verify application is running
    await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('✅ Application is accessible');

    // Clear all storage to ensure clean state
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

    console.log('✅ Storage cleared');
  } catch (rawError: unknown) {
    const error =
      rawError instanceof Error ? rawError : new Error(String(rawError));
    console.error('❌ Global setup failed:', error);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }

  console.log('✅ Global setup complete');
}

export default globalSetup;
