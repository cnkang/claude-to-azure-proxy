/**
 * E2E Test: Deletion Cleanup (UI-Based)
 *
 * Tests conversation deletion and cleanup using UI interactions.
 * Verifies that deleted conversations and their messages are properly removed from the UI.
 *
 * Test scenarios:
 * - Conversation and messages are removed from UI after deletion
 * - Deleted conversations don't appear in search results
 * - UI updates immediately after deletion
 *
 * Requirements: 4.1, 4.2, 4.3, 6.1-6.5
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { UIActions, Assertions, TestSetup } from './helpers/index.js';

test.describe('E2E: Deletion Cleanup (UI-Based)', () => {
  let ui: UIActions;
  let assert: Assertions;

  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('http://localhost:3000');
    
    // Wait for navigation to complete (app redirects to /chat)
    await page.waitForURL('**/chat**', { timeout: 10000 });
    
    // Wait for app container to be visible
    await page.waitForSelector('[data-testid="app-container"]', {
      state: 'visible',
      timeout: 10000,
    });

    // Wait a bit for the app to fully initialize
    await page.waitForTimeout(1000);

    ui = new UIActions(page);
    assert = new Assertions(page);

    // Note: We don't clear conversations in beforeEach to avoid flaky issues
    // Tests should be written to handle existing conversations and use unique titles
  });

  test('should remove conversation and messages from UI after deletion', async ({ page }) => {
    // Create a conversation
    const conversationId = await ui.createConversation();

    // Update the title to make it identifiable
    await ui.updateConversationTitle(conversationId, 'Test Conversation for Deletion');

    // Verify conversation is visible
    await assert.expectConversationInList(conversationId);

    // Delete the conversation through the UI (using dropdown menu)
    await ui.deleteConversation(conversationId);

    // Verify conversation is removed from the list
    await assert.expectConversationNotInList(conversationId);
  });

  test('should exclude deleted conversations from search results', async ({ page }) => {
    // Create multiple conversations with unique titles
    const conversationId1 = await ui.createConversation();
    await ui.updateConversationTitle(conversationId1, 'Python Tutorial XYZ');

    const conversationId2 = await ui.createConversation();
    await ui.updateConversationTitle(conversationId2, 'Python Best Practices XYZ');

    const conversationId3 = await ui.createConversation();
    await ui.updateConversationTitle(conversationId3, 'Python Data Science XYZ');

    // Wait for conversations to be indexed
    await page.waitForTimeout(1000);

    // Get the count of conversations before search
    const initialCount = await page.locator('[data-testid^="conversation-item-"]').count();

    // Search for "Python XYZ" - should find all 3 Python conversations
    await ui.searchConversations('Python XYZ');
    await page.waitForTimeout(1500);

    // Check if search results are shown
    const searchResults = page.locator('[data-testid="search-results"]');
    const isVisible = await searchResults.isVisible().catch(() => false);

    if (isVisible) {
      // Verify we have 3 search results
      const searchResultCount = await page.locator('[data-testid^="search-result-"]').count();
      expect(searchResultCount).toBe(3);
    } else {
      // If filtering conversation list, verify the 3 Python conversations are visible
      await assert.expectConversationInList(conversationId1);
      await assert.expectConversationInList(conversationId2);
      await assert.expectConversationInList(conversationId3);
    }

    // IMPORTANT: Clear search before deleting to ensure conversation is visible and clickable
    await ui.clearSearch();
    await page.waitForTimeout(1000);

    // Delete one conversation (now it's visible in the full list)
    await ui.deleteConversation(conversationId2);

    // Search again for "Python XYZ" - should now find only 2
    await ui.searchConversations('Python XYZ');
    await page.waitForTimeout(1500);

    const isStillVisible = await searchResults.isVisible().catch(() => false);
    if (isStillVisible) {
      // Verify we now have 2 search results
      const searchResultCount = await page.locator('[data-testid^="search-result-"]').count();
      expect(searchResultCount).toBe(2);
    } else {
      // If filtering conversation list, verify only 2 Python conversations are visible
      const visibleCount = await page.locator('[data-testid^="conversation-item-"]').count();
      expect(visibleCount).toBe(initialCount - 1);
    }

    // Verify the deleted conversation is not in results
    await assert.expectConversationNotInList(conversationId2);

    // Verify the other conversations are still in results
    await assert.expectConversationInList(conversationId1);
    await assert.expectConversationInList(conversationId3);
  });

  test('should update UI immediately after deletion without page refresh', async ({ page }) => {
    // Create a conversation
    const conversationId = await ui.createConversation();

    // Verify conversation is visible
    await assert.expectConversationInList(conversationId);

    // Get initial conversation count
    const initialCount = await page
      .locator('[data-testid^="conversation-item-"]')
      .count();

    // Delete the conversation
    await ui.deleteConversation(conversationId);

    // Verify UI updated immediately (no page refresh needed)
    await assert.expectConversationNotInList(conversationId);

    // Verify conversation count decreased
    const finalCount = await page
      .locator('[data-testid^="conversation-item-"]')
      .count();
    expect(finalCount).toBe(initialCount - 1);
  });

  test('should persist deletion after page refresh', async ({ page }) => {
    // Create a conversation with a unique title
    const conversationId = await ui.createConversation();
    await ui.updateConversationTitle(conversationId, 'Conversation to Delete and Verify');

    // Verify conversation is visible
    await assert.expectConversationInList(conversationId);

    // Delete the conversation
    await ui.deleteConversation(conversationId);

    // Verify deletion
    await assert.expectConversationNotInList(conversationId);

    // Navigate to the same URL to verify persistence (more reliable than reload)
    const currentUrl = page.url();
    await page.goto(currentUrl);
    await page.waitForSelector('[data-testid="app-container"]', {
      state: 'visible',
      timeout: 10000,
    });
    await page.waitForTimeout(1000); // Wait for app to fully initialize

    // Verify conversation is still deleted after refresh
    await assert.expectConversationNotInList(conversationId);
  });
});
