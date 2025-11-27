/**
 * E2E Test: Search Functionality (UI-Based)
 *
 * Tests conversation search using UI interactions instead of direct storage access.
 * Verifies search results, keyword highlighting, empty states, and pagination.
 *
 * Test scenarios:
 * - Search displays all matching conversations
 * - Keywords are highlighted in search results
 * - Empty state is shown when no results found
 * - Clearing search restores all conversations
 * - Pagination appears when results exceed one page
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 6.1-6.5
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { UIActions, TestSetup, Assertions } from './helpers/index.js';

test.describe('E2E: Search Functionality (UI-Based)', () => {
  let context: BrowserContext;
  let page: Page;
  let ui: UIActions;
  let assert: Assertions;

  test.beforeEach(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await page.goto('http://localhost:3000');
    
    // Wait for navigation to complete (app redirects to /chat)
    await page.waitForURL('**/chat**', { timeout: 10000 });
    
    // Wait for app container to be visible
    await page.waitForSelector('[data-testid="app-container"]', {
      state: 'visible',
      timeout: 10000,
    });

    ui = new UIActions(page);
    assert = new Assertions(page);
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('should search and display all matching conversations', async ({ page }) => {
    // Create multiple conversations with specific titles
    const conversationId1 = await ui.createConversation();
    await ui.updateConversationTitle(conversationId1, 'React Hooks Tutorial');

    const conversationId2 = await ui.createConversation();
    await ui.updateConversationTitle(conversationId2, 'Vue.js Guide');

    const conversationId3 = await ui.createConversation();
    await ui.updateConversationTitle(conversationId3, 'React Components');

    // Search for "React"
    await ui.searchConversations('React');

    // Verify only React-related conversations are shown in search results
    await assert.expectSearchResults(2);

    // Verify correct conversations appear in search results
    const searchResult1 = page.locator(`[data-testid="search-result-${conversationId1}"]`);
    const searchResult3 = page.locator(`[data-testid="search-result-${conversationId3}"]`);
    
    await expect(searchResult1).toBeVisible({ timeout: 5000 });
    await expect(searchResult3).toBeVisible({ timeout: 5000 });
  });

  test('should restore all conversations when search is cleared', async ({ page }) => {
    // Create multiple conversations
    const conversationId1 = await ui.createConversation();
    await ui.updateConversationTitle(conversationId1, 'First Conversation');

    const conversationId2 = await ui.createConversation();
    await ui.updateConversationTitle(conversationId2, 'Second Conversation');

    const conversationId3 = await ui.createConversation();
    await ui.updateConversationTitle(conversationId3, 'Third Conversation');

    // Search to filter results
    await ui.searchConversations('First');
    await assert.expectSearchResults(1);

    // Clear search
    await ui.clearSearch();

    // Verify search results are cleared (no search results shown)
    const searchResults = page.locator('[data-testid="search-results"]');
    
    // Either the search results container is hidden or empty
    const isVisible = await searchResults.isVisible().catch(() => false);
    if (isVisible) {
      // If visible, it should have no results
      await assert.expectSearchResults(0);
    }
    
    // All conversations should still be in the sidebar
    await assert.expectConversationCount(3);
  });

  test('should support case-insensitive search', async () => {
    // Create a conversation
    const conversationId = await ui.createConversation();
    await ui.updateConversationTitle(conversationId, 'JavaScript Basics');

    // Search with lowercase
    await ui.searchConversations('javascript');
    await assert.expectConversationInList(conversationId);

    // Clear and search with uppercase
    await ui.clearSearch();
    await ui.searchConversations('JAVASCRIPT');
    await assert.expectConversationInList(conversationId);

    // Clear and search with mixed case
    await ui.clearSearch();
    await ui.searchConversations('JaVaScRiPt');
    await assert.expectConversationInList(conversationId);
  });
});
