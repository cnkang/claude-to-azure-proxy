import { expect, test } from './fixtures/base.js';

/**
 * Diagnostic Tests
 *
 * These tests help diagnose issues with the application:
 * 1. Check if conversations can be created and stored
 * 2. Check if conversations appear in the sidebar
 * 3. Check if search component is accessible
 */

test.describe('Diagnostic Tests', () => {
  test('should check if sidebar is visible and open', async ({
    cleanPage,
    helpers,
  }) => {
    await helpers.waitForAppReady();

    // Check if sidebar exists
    const sidebar = await cleanPage.locator('[data-testid="sidebar"]').count();
    console.log('Sidebar count:', sidebar);

    if (sidebar > 0) {
      const sidebarElement = cleanPage.locator('[data-testid="sidebar"]');
      const isVisible = await sidebarElement.isVisible();
      console.log('Sidebar visible:', isVisible);

      // Check sidebar classes
      const classes = await sidebarElement.getAttribute('class');
      console.log('Sidebar classes:', classes);
    }

    expect(sidebar).toBeGreaterThan(0);
  });

  test('should check if new conversation button works', async ({
    cleanPage,
    helpers,
  }) => {
    await helpers.waitForAppReady();

    // Find new conversation button
    const newButton = cleanPage.locator(
      '[data-testid="new-conversation-button"]'
    );
    const buttonExists = await newButton.count();
    console.log('New conversation button count:', buttonExists);

    if (buttonExists > 0) {
      const isVisible = await newButton.isVisible();
      console.log('New conversation button visible:', isVisible);

      if (isVisible) {
        // Click to create a conversation
        await newButton.click();

        // Wait for conversation to be created
        await cleanPage.waitForTimeout(2000);

        // Check if conversation list has items
        const conversationsList = cleanPage.locator(
          '[data-testid="conversations-list"]'
        );
        const listExists = await conversationsList.count();
        console.log('Conversations list count:', listExists);

        if (listExists > 0) {
          const items = await conversationsList.locator('li').count();
          console.log('Conversation items count:', items);
        }
      }
    }

    expect(buttonExists).toBeGreaterThan(0);
  });

  test('should check storage service availability', async ({
    cleanPage,
    helpers,
  }) => {
    await helpers.waitForAppReady();

    // Check if storage service is available via window.__TEST_BRIDGE__
    const storageAvailable = await cleanPage.evaluate(async () => {
      const testBridge = window.__TEST_BRIDGE__;
      if (!testBridge) {
        return {
          available: false as const,
          error: 'Test bridge not available',
        };
      }

      try {
        const storage = await testBridge.getConversationStorage();
        if (!storage) {
          return {
            available: false as const,
            error: 'Storage instance is null',
          };
        }

        return { available: true as const, error: null };
      } catch (error) {
        return {
          available: false as const,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    console.log('Storage available:', storageAvailable);
    expect(storageAvailable.available).toBe(true);
  });

  test('should check if test conversation can be created', async ({
    cleanPage,
    helpers,
  }) => {
    await helpers.waitForAppReady();

    // Try to create a test conversation
    try {
      const conversationId = await helpers.createTestConversation(
        'Diagnostic Test',
        [{ role: 'user', content: 'Test message' }]
      );

      console.log('Created conversation ID:', conversationId);

      // Check if it's in storage using window.__TEST_BRIDGE__
      const inStorage = await cleanPage.evaluate(async (id) => {
        try {
          const testBridge = window.__TEST_BRIDGE__;
          if (!testBridge) {
            return false;
          }

          const storage = await testBridge.getConversationStorage();
          const conversation = await storage.getConversation(id);
          return conversation !== null;
        } catch {
          return false;
        }
      }, conversationId);

      console.log('Conversation in storage:', inStorage);

      // Wait a bit for UI to update
      await cleanPage.waitForTimeout(1000);

      // Check if it appears in the sidebar
      const conversationItem = await cleanPage
        .locator(`[data-testid="conversation-item-${conversationId}"]`)
        .count();

      console.log('Conversation in sidebar:', conversationItem > 0);

      // Take a screenshot for debugging
      await cleanPage.screenshot({
        path: 'diagnostic-conversation-created.png',
      });

      expect(inStorage).toBe(true);
    } catch (error) {
      console.error('Failed to create test conversation:', error);

      // Take a screenshot of the error state
      await cleanPage.screenshot({ path: 'diagnostic-error.png' });

      throw error;
    }
  });

  test('should check if search component exists anywhere', async ({
    cleanPage,
    helpers,
  }) => {
    await helpers.waitForAppReady();

    // Check for search input
    const searchInput = await cleanPage
      .locator('[data-testid="search-input"]')
      .count();
    console.log('Search input count:', searchInput);

    // Check for search input by ID
    const searchById = await cleanPage.locator('#search-input').count();
    console.log('Search input by ID count:', searchById);

    // Check for any search-related elements
    const searchElements = await cleanPage.locator('[role="search"]').count();
    console.log('Search role elements count:', searchElements);

    // Check for conversation-search class
    const searchClass = await cleanPage.locator('.conversation-search').count();
    console.log('Conversation search class count:', searchClass);

    // Take a screenshot
    await cleanPage.screenshot({ path: 'diagnostic-search-check.png' });

    // Log page content for debugging
    const bodyText = await cleanPage.locator('body').textContent();
    console.log(
      'Page contains "search":',
      bodyText?.toLowerCase().includes('search')
    );
  });

  test('should check page structure', async ({ cleanPage, helpers }) => {
    await helpers.waitForAppReady();

    // Get all data-testid attributes on the page
    const testIds = await cleanPage.evaluate(() => {
      const elements = document.querySelectorAll('[data-testid]');
      return Array.from(elements).map((el) => el.getAttribute('data-testid'));
    });

    console.log('Available test IDs:', testIds);

    // Get main structure
    const structure = await cleanPage.evaluate(() => {
      const main = document.querySelector('main');
      const sidebar = document.querySelector('[data-testid="sidebar"]');
      const header = document.querySelector('header');

      return {
        hasMain: !!main,
        hasSidebar: !!sidebar,
        hasHeader: !!header,
        mainChildren: main?.children.length || 0,
        sidebarChildren: sidebar?.children.length || 0,
      };
    });

    console.log('Page structure:', structure);

    expect(structure.hasMain).toBe(true);
  });
});
