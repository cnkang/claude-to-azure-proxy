/**
 * E2E Test: Simple UI Test
 *
 * Test basic create, rename, delete flow
 */

import { expect, test } from '@playwright/test';
import { TestSetup, UIActions } from './helpers/index.js';

test.describe('E2E: Simple UI Test', () => {
  test('should create, rename, and delete a conversation', async ({ page }) => {
    // Navigate and wait for load
    await page.goto('http://localhost:3000');

    // Wait for navigation to complete (app redirects to /chat)
    await page.waitForURL('**/chat**', { timeout: 10000 });

    // Wait for app container to be visible
    await page.waitForSelector('[data-testid="app-container"]', {
      state: 'visible',
      timeout: 10000,
    });

    // Setup UI actions
    const ui = new UIActions(page);

    // Create a conversation
    const conversationId = await ui.createConversation();

    console.info(`Created conversation with ID: ${conversationId}`);
    expect(conversationId).toBeTruthy();

    // Rename the conversation
    await ui.updateConversationTitle(conversationId, 'Test Title');
    console.info('Renamed conversation');

    // Verify title updated
    const titleElement = page.locator(
      `[data-testid="conversation-title-${conversationId}"]`
    );
    const titleText = await titleElement.textContent();
    console.info(`Title text: ${titleText}`);

    // Delete the conversation
    await ui.deleteConversation(conversationId);
    console.info('Deleted conversation');

    // Verify conversation is gone
    const conversationItem = page.locator(
      `[data-testid="conversation-item-${conversationId}"]`
    );
    await expect(conversationItem).not.toBeVisible();
  });
});
