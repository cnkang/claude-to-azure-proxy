/**
 * E2E Test: Basic UI Verification
 *
 * Simple test to verify basic UI elements and interactions work
 */

import { test, expect, type Page } from '@playwright/test';

test.describe('E2E: Basic UI Verification', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();
    await page.goto('http://localhost:3000');
    
    // Wait for navigation to complete (app redirects to /chat)
    await page.waitForURL('**/chat**', { timeout: 10000 });
    
    // Wait for app container to be visible instead of networkidle
    await page.waitForSelector('[data-testid="app-container"]', {
      state: 'visible',
      timeout: 10000,
    });
  });

  test('should load the application', async () => {
    // Wait for navigation to complete (app redirects to /chat)
    await page.waitForURL('**/chat**', { timeout: 10000 });
    
    // Check if app container is visible
    const appContainer = page.locator('[data-testid="app-container"]');
    await expect(appContainer).toBeVisible({ timeout: 10000 });
  });

  test('should have new conversation button', async () => {
    // Check if new conversation button exists
    const newButton = page.locator('[data-testid="new-conversation-button"]');
    await expect(newButton).toBeVisible({ timeout: 10000 });
  });

  test('should be able to click new conversation button', async () => {
    const newButton = page.locator('[data-testid="new-conversation-button"]');
    await newButton.click();
    
    // Wait a bit for any action to complete
    await page.waitForTimeout(2000);
    
    // Check if any conversation items appear
    const conversations = page.locator('[data-testid^="conversation-item-"]');
    const count = await conversations.count();
    
    console.log(`Found ${count} conversations after clicking new button`);
  });
});
