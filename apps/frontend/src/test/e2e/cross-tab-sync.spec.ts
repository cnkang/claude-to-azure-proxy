/**
 * E2E Test: Cross-Tab Synchronization (UI-Based)
 *
 * Tests cross-tab synchronization using UI interactions instead of direct storage access.
 * Verifies that changes made in one browser tab propagate to other tabs within 1 second.
 *
 * Test scenarios:
 * - Title updates propagate from tab 1 to tab 2
 * - Conversation deletion propagates from tab 2 to tab 1
 * - New conversation creation propagates from tab 1 to tab 2
 * - Simultaneous updates are handled gracefully
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.1-6.5
 */

import { type BrowserContext, type Page, expect, test } from '@playwright/test';
import { Assertions, TestSetup, UIActions } from './helpers/index.js';

test.describe('E2E: Cross-Tab Synchronization (UI-Based)', () => {
  let context1: BrowserContext;
  let context2: BrowserContext;
  let page1: Page;
  let page2: Page;
  let ui1: UIActions;
  let ui2: UIActions;
  let assert1: Assertions;
  let assert2: Assertions;

  test.beforeEach(async ({ browser }) => {
    // Create a single browser context (to share storage between tabs)
    const sharedContext = await browser.newContext();
    context1 = sharedContext;
    context2 = sharedContext;

    // Create two pages in the same context (simulating two tabs)
    page1 = await sharedContext.newPage();
    page2 = await sharedContext.newPage();

    // Navigate both pages
    await page1.goto('http://localhost:3000');
    await page2.goto('http://localhost:3000');

    // Wait for navigation to complete (app redirects to /chat)
    await page1.waitForURL('**/chat**', { timeout: 10000 });
    await page2.waitForURL('**/chat**', { timeout: 10000 });

    // Wait for app containers to be visible
    await page1.waitForSelector('[data-testid="app-container"]', {
      state: 'visible',
      timeout: 10000,
    });
    await page2.waitForSelector('[data-testid="app-container"]', {
      state: 'visible',
      timeout: 10000,
    });

    // Initialize UI actions and assertions
    ui1 = new UIActions(page1);
    ui2 = new UIActions(page2);
    assert1 = new Assertions(page1);
    assert2 = new Assertions(page2);
  });

  test.afterEach(async () => {
    // Clean up the shared context (this closes both pages)
    await context1.close();
  });

  test('should propagate title update from tab 1 to tab 2 within 1 second', async () => {
    // Create a conversation in tab 1
    const conversationId = await ui1.createConversation();
    expect(conversationId).toBeTruthy();

    // Wait for conversation to appear in tab 2
    await TestSetup.waitForStorageSync(page2, 1000);
    await assert2.expectConversationInList(conversationId);

    // Update title in tab 1
    const newTitle = 'Updated Title from Tab 1';
    await ui1.updateConversationTitle(conversationId, newTitle);

    // Verify update propagates to tab 2 within 1 second
    await TestSetup.waitForStorageSync(page2, 1000);
    await assert2.expectConversationTitle(conversationId, newTitle);
  });

  test('should propagate conversation deletion from tab 2 to tab 1', async () => {
    // Create a conversation in tab 1
    const conversationId = await ui1.createConversation();
    expect(conversationId).toBeTruthy();

    // Wait for conversation to appear in tab 2
    await TestSetup.waitForStorageSync(page2, 1000);
    await assert2.expectConversationInList(conversationId);

    // Delete conversation in tab 2
    await ui2.deleteConversation(conversationId);

    // Verify deletion propagates to tab 1 within 1 second
    await TestSetup.waitForStorageSync(page1, 1000);
    await assert1.expectConversationNotInList(conversationId);
  });

  test('should propagate new conversation creation from tab 1 to tab 2', async () => {
    // Create a conversation in tab 1
    const conversationId = await ui1.createConversation();
    expect(conversationId).toBeTruthy();

    // Verify conversation appears in tab 2 within 1 second
    await TestSetup.waitForStorageSync(page2, 1000);
    await assert2.expectConversationInList(conversationId);
  });

  test('should handle simultaneous updates gracefully without crashing', async () => {
    // Create a conversation in tab 1
    const conversationId = await ui1.createConversation();
    expect(conversationId).toBeTruthy();

    // Wait for conversation to appear in tab 2
    await TestSetup.waitForStorageSync(page2, 1000);
    await assert2.expectConversationInList(conversationId);

    // Select the conversation in tab 2
    await ui2.selectConversation(conversationId);

    // Update title from both tabs simultaneously
    const title1 = 'Title from Tab 1';
    const title2 = 'Title from Tab 2';

    await Promise.all([
      ui1.updateConversationTitle(conversationId, title1),
      ui2.updateConversationTitle(conversationId, title2),
    ]);

    // Wait for sync to complete (longer wait for simultaneous updates)
    await TestSetup.waitForStorageSync(page1, 2000);
    await TestSetup.waitForStorageSync(page2, 2000);

    // Verify that one of the titles won (no crash, consistent state)
    // We don't care which one wins, just that the system didn't crash
    const finalTitleInTab1 = await page1
      .locator(`[data-testid="conversation-title-${conversationId}"]`)
      .textContent();
    const finalTitleInTab2 = await page2
      .locator(`[data-testid="conversation-title-${conversationId}"]`)
      .textContent();

    // Both tabs should show the same title (consistency)
    // Note: Due to race conditions, they might not always be the same immediately
    // The important thing is that the system didn't crash
    if (finalTitleInTab1 !== finalTitleInTab2) {
      // Wait a bit more and check again
      await TestSetup.waitForStorageSync(page1, 1000);
      await TestSetup.waitForStorageSync(page2, 1000);

      const retryTitle1 = await page1
        .locator(`[data-testid="conversation-title-${conversationId}"]`)
        .textContent();
      const retryTitle2 = await page2
        .locator(`[data-testid="conversation-title-${conversationId}"]`)
        .textContent();

      expect(retryTitle1).toBe(retryTitle2);
    }

    // The final title should be one of the two titles we set
    expect([title1, title2]).toContain(finalTitleInTab1);
  });

  test('should update UI automatically without page refresh when storage events occur', async () => {
    // Create a conversation in tab 1
    const conversationId = await ui1.createConversation();
    expect(conversationId).toBeTruthy();

    // Verify conversation appears in tab 2 without refresh
    await TestSetup.waitForStorageSync(page2, 1000);
    await assert2.expectConversationInList(conversationId);

    // Update title in tab 1
    const newTitle = 'Auto-Updated Title';
    await ui1.updateConversationTitle(conversationId, newTitle);

    // Verify UI in tab 2 updates automatically (no refresh needed)
    await TestSetup.waitForStorageSync(page2, 1000);
    await assert2.expectConversationTitle(conversationId, newTitle);

    // Delete in tab 1
    await ui1.deleteConversation(conversationId);

    // Verify UI in tab 2 updates automatically (no refresh needed)
    await TestSetup.waitForStorageSync(page2, 1000);
    await assert2.expectConversationNotInList(conversationId);
  });
});
