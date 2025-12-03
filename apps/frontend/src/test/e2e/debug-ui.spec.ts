/**
 * E2E Test: Debug UI Structure
 *
 * Test to understand the actual UI structure
 */

import { test } from '@playwright/test';

test.describe('E2E: Debug UI Structure', () => {
  test('should show UI structure after clicking new conversation', async ({
    page,
  }) => {
    await page.goto('http://localhost:3000');

    // Wait for navigation to complete (app redirects to /chat)
    await page.waitForURL('**/chat**', { timeout: 10000 });

    // Wait for app container to be visible
    await page.waitForSelector('[data-testid="app-container"]', {
      state: 'visible',
      timeout: 10000,
    });

    console.info('=== Page loaded ===');

    // Take screenshot before
    await page.screenshot({
      path: 'test-results/debug-before-click.png',
      fullPage: true,
    });

    // Click new conversation button
    const newButton = page.locator('[data-testid="new-conversation-button"]');
    await newButton.click();

    // Wait for any changes
    await page.waitForTimeout(3000);

    // Take screenshot after
    await page.screenshot({
      path: 'test-results/debug-after-click.png',
      fullPage: true,
    });

    // Log all conversation items
    const conversations = page.locator('[data-testid^="conversation-item-"]');
    const count = await conversations.count();
    console.info(`Found ${count} conversation items`);

    // Log all data-testid attributes
    const allTestIds = await page.evaluate(() => {
      const elements = document.querySelectorAll('[data-testid]');
      return Array.from(elements).map((el) => ({
        testId: el.getAttribute('data-testid'),
        tag: el.tagName,
        text: el.textContent?.substring(0, 50),
      }));
    });

    console.info('=== All data-testid elements ===');
    console.info(JSON.stringify(allTestIds, null, 2));
  });
});
