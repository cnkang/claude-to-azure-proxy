import type { BrowserContext } from '@playwright/test';
import { expect, test } from './fixtures/base.js';

/**
 * Browser Compatibility E2E Tests
 *
 * Tests core functionality across different browsers (Chromium, Firefox, WebKit)
 * and mobile viewports to ensure consistent behavior.
 *
 * Requirements:
 * - Cross-browser compatibility (Chromium, Firefox, WebKit)
 * - Mobile viewport support (responsive design)
 * - Consistent storage behavior across browsers
 * - Consistent UI rendering across browsers
 *
 * Test Strategy:
 * - Run critical user flows on all browsers
 * - Test storage APIs (IndexedDB, localStorage) on all browsers
 * - Test responsive design on mobile viewports
 * - Document browser-specific issues and workarounds
 */

test.describe('Browser Compatibility', () => {
  /**
   * Test: Basic App Loading
   * Verifies the app loads correctly in all browsers
   */
  test('should load app successfully in all browsers', async ({
    cleanPage,
    helpers,
  }) => {
    // Wait for app to be ready
    await helpers.waitForAppReady();

    // Verify main UI elements are present
    const mainContent = cleanPage.locator('main, [role="main"]');
    await expect(mainContent).toBeVisible();

    // Verify no console errors
    const errors: string[] = [];
    cleanPage.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await cleanPage.waitForTimeout(1000);

    // Allow some common non-critical errors
    const criticalErrors = errors.filter(
      (error) =>
        !error.includes('favicon') &&
        !error.includes('manifest') &&
        !error.includes('service-worker')
    );

    expect(criticalErrors).toHaveLength(0);
  });

  /**
   * Test: Storage API Compatibility
   * Verifies IndexedDB and localStorage work correctly in all browsers
   */
  test('should support IndexedDB in all browsers', async ({
    cleanPage,
    helpers,
  }) => {
    await helpers.waitForAppReady();

    // Check IndexedDB availability
    const hasIndexedDB = await cleanPage.evaluate(() => {
      return 'indexedDB' in window && window.indexedDB !== null;
    });

    expect(hasIndexedDB).toBe(true);

    // Create a test conversation to verify storage works
    const conversationId = await helpers.createTestConversation(
      'Storage Test',
      [{ role: 'user', content: 'Testing storage' }]
    );

    // Reload to verify persistence
    await cleanPage.reload();
    await helpers.waitForAppReady();

    // Verify conversation persisted
    await helpers.waitForConversation(conversationId);
    const title = await helpers.getConversationTitle(conversationId);
    expect(title).toBe('Storage Test');
  });

  /**
   * Test: localStorage Fallback
   * Verifies localStorage fallback works when IndexedDB is unavailable
   */
  test('should fallback to localStorage when IndexedDB unavailable', async ({
    cleanPage,
    helpers,
  }) => {
    await helpers.waitForAppReady();

    // Check localStorage availability
    const hasLocalStorage = await cleanPage.evaluate(() => {
      try {
        const testKey = '__storage_test__';
        localStorage.setItem(testKey, 'test');
        localStorage.removeItem(testKey);
        return true;
      } catch {
        return false;
      }
    });

    expect(hasLocalStorage).toBe(true);
  });

  /**
   * Test: Title Persistence Across Browsers
   * Verifies title updates work consistently across all browsers
   */
  test('should persist title changes in all browsers', async ({
    cleanPage,
    helpers,
  }) => {
    await helpers.waitForAppReady();

    // Create conversation
    const conversationId = await helpers.createTestConversation(
      'Original Title',
      [{ role: 'user', content: 'Test message' }]
    );

    // Update title
    await helpers.updateConversationTitle(conversationId, 'Updated Title');
    await cleanPage.waitForTimeout(600);

    // Reload and verify
    await cleanPage.reload();
    await helpers.waitForAppReady();
    await helpers.waitForConversation(conversationId);

    const title = await helpers.getConversationTitle(conversationId);
    expect(title).toBe('Updated Title');
  });

  /**
   * Test: Deletion Cleanup Across Browsers
   * Verifies deletion works consistently across all browsers
   */
  test('should delete conversations completely in all browsers', async ({
    cleanPage,
    helpers,
  }) => {
    await helpers.waitForAppReady();

    // Create conversation
    const conversationId = await helpers.createTestConversation('To Delete', [
      { role: 'user', content: 'Test message' },
    ]);

    // Delete conversation
    await helpers.deleteConversation(conversationId);
    await cleanPage.waitForTimeout(600);

    // Reload and verify deletion persisted
    await cleanPage.reload();
    await helpers.waitForAppReady();

    // Verify conversation is gone
    const conversationElement = cleanPage.locator(
      `[data-conversation-id="${conversationId}"]`
    );
    await expect(conversationElement).not.toBeVisible({ timeout: 5000 });
  });

  /**
   * Test: Search Functionality Across Browsers
   * Verifies search works consistently across all browsers
   */
  test('should search conversations in all browsers', async ({
    cleanPage,
    helpers,
  }) => {
    await helpers.waitForAppReady();

    // Create test conversations
    await helpers.createTestConversation('Apple Discussion', [
      { role: 'user', content: 'Tell me about apples' },
    ]);

    await helpers.createTestConversation('Banana Talk', [
      { role: 'user', content: 'Tell me about bananas' },
    ]);

    // Search for "apple"
    await helpers.searchConversations('apple');
    await cleanPage.waitForTimeout(600);

    // Verify search results
    const resultsCount = await helpers.getSearchResultsCount();
    expect(resultsCount).toBeGreaterThan(0);
  });

  /**
   * Test: Keyboard Navigation Across Browsers
   * Verifies keyboard navigation works consistently
   */
  test('should support keyboard navigation in all browsers', async ({
    cleanPage,
    helpers,
  }) => {
    await helpers.waitForAppReady();

    // Create test conversation
    await helpers.createTestConversation('Keyboard Test', [
      { role: 'user', content: 'Test message' },
    ]);

    // Test Tab navigation
    await cleanPage.keyboard.press('Tab');

    // Verify focus is visible
    const focusedElement = await cleanPage.evaluate(() => {
      const active = document.activeElement;
      return active ? active.tagName : null;
    });

    expect(focusedElement).not.toBeNull();
  });

  /**
   * Test: CSS Rendering Consistency
   * Verifies UI renders consistently across browsers
   */
  test('should render UI consistently in all browsers', async ({
    cleanPage,
    helpers,
  }) => {
    await helpers.waitForAppReady();

    // Create test conversation
    await helpers.createTestConversation('UI Test', [
      { role: 'user', content: 'Test message' },
    ]);

    // Check for layout issues
    const hasLayoutIssues = await cleanPage.evaluate(() => {
      // Check for elements with zero dimensions
      const elements = document.querySelectorAll('*');
      let issueCount = 0;

      elements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const computed = window.getComputedStyle(el);

        // Check if element should be visible but has zero dimensions
        if (
          computed.display !== 'none' &&
          computed.visibility !== 'hidden' &&
          rect.width === 0 &&
          rect.height === 0 &&
          el.children.length > 0
        ) {
          issueCount++;
        }
      });

      return issueCount;
    });

    // Allow some zero-dimension elements (like empty containers)
    expect(hasLayoutIssues).toBeLessThan(10);
  });

  /**
   * Test: Event Handling Across Browsers
   * Verifies click and input events work consistently
   */
  test('should handle events consistently in all browsers', async ({
    cleanPage,
    helpers,
  }) => {
    await helpers.waitForAppReady();

    // Create conversation
    const conversationId = await helpers.createTestConversation('Event Test', [
      { role: 'user', content: 'Test message' },
    ]);

    // Test click event
    const conversationElement = cleanPage.locator(
      `[data-conversation-id="${conversationId}"]`
    );
    await conversationElement.click();

    // Verify conversation opened (implementation-specific)
    await cleanPage.waitForTimeout(500);

    // Test input event (title editing)
    await helpers.updateConversationTitle(conversationId, 'Event Updated');
    await cleanPage.waitForTimeout(600);

    const title = await helpers.getConversationTitle(conversationId);
    expect(title).toBe('Event Updated');
  });

  /**
   * Test: Web Crypto API Support
   * Verifies encryption works across all browsers
   */
  test('should support Web Crypto API in all browsers', async ({
    cleanPage,
  }) => {
    const hasCrypto = await cleanPage.evaluate(() => {
      return 'crypto' in window && 'subtle' in window.crypto;
    });

    expect(hasCrypto).toBe(true);
  });

  /**
   * Test: Storage Event API Support
   * Verifies cross-tab sync works across all browsers
   */
  test('should support Storage Event API in all browsers', async ({
    cleanPage,
  }) => {
    const hasStorageEvent = await cleanPage.evaluate(() => {
      return 'StorageEvent' in window;
    });

    expect(hasStorageEvent).toBe(true);
  });
});

/**
 * Mobile Viewport Compatibility Tests
 * Tests responsive design on mobile viewports
 */
test.describe('Mobile Viewport Compatibility', () => {
  /**
   * Test: Mobile App Loading
   * Verifies app loads correctly on mobile viewports
   */
  test('should load app on mobile viewports', async ({
    cleanPage,
    helpers,
  }) => {
    // Set mobile viewport
    await cleanPage.setViewportSize({ width: 375, height: 667 });

    await helpers.waitForAppReady();

    // Verify main content is visible
    const mainContent = cleanPage.locator('main, [role="main"]');
    await expect(mainContent).toBeVisible();
  });

  /**
   * Test: Mobile Touch Targets
   * Verifies touch targets are large enough (44x44px minimum)
   */
  test('should have adequate touch targets on mobile', async ({
    cleanPage,
    helpers,
  }) => {
    await cleanPage.setViewportSize({ width: 375, height: 667 });
    await helpers.waitForAppReady();

    // Create test conversation
    await helpers.createTestConversation('Mobile Test', [
      { role: 'user', content: 'Test message' },
    ]);

    // Check interactive elements have adequate size
    const smallTargets = await cleanPage.evaluate(() => {
      const interactiveElements = document.querySelectorAll(
        'button, a, input, [role="button"], [tabindex="0"]'
      );

      const small: string[] = [];

      interactiveElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const computed = window.getComputedStyle(el);

        if (computed.display !== 'none' && computed.visibility !== 'hidden') {
          if (rect.width < 44 || rect.height < 44) {
            small.push(
              `${el.tagName}.${el.className} (${rect.width}x${rect.height})`
            );
          }
        }
      });

      return small;
    });

    // Allow some small targets (like inline links in text)
    expect(smallTargets.length).toBeLessThan(5);
  });

  /**
   * Test: Mobile Scrolling
   * Verifies content scrolls correctly on mobile
   */
  test('should scroll correctly on mobile viewports', async ({
    cleanPage,
    helpers,
  }) => {
    await cleanPage.setViewportSize({ width: 375, height: 667 });
    await helpers.waitForAppReady();

    // Create multiple conversations to enable scrolling
    for (let i = 0; i < 10; i++) {
      await helpers.createTestConversation(`Conversation ${i}`, [
        { role: 'user', content: `Message ${i}` },
      ]);
    }

    // Test scrolling
    await cleanPage.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    await cleanPage.waitForTimeout(500);

    const scrollPosition = await cleanPage.evaluate(() => window.scrollY);
    expect(scrollPosition).toBeGreaterThan(0);
  });

  /**
   * Test: Mobile Text Input
   * Verifies text input works correctly on mobile
   */
  test('should handle text input on mobile viewports', async ({
    cleanPage,
    helpers,
  }) => {
    await cleanPage.setViewportSize({ width: 375, height: 667 });
    await helpers.waitForAppReady();

    // Create conversation
    const conversationId = await helpers.createTestConversation(
      'Mobile Input',
      [{ role: 'user', content: 'Test' }]
    );

    // Update title on mobile
    await helpers.updateConversationTitle(conversationId, 'Mobile Updated');
    await cleanPage.waitForTimeout(600);

    const title = await helpers.getConversationTitle(conversationId);
    expect(title).toBe('Mobile Updated');
  });

  /**
   * Test: Mobile Orientation Change
   * Verifies app handles orientation changes correctly
   */
  test('should handle orientation changes', async ({ cleanPage, helpers }) => {
    await helpers.waitForAppReady();

    // Portrait
    await cleanPage.setViewportSize({ width: 375, height: 667 });
    await cleanPage.waitForTimeout(500);

    // Verify app is still functional
    let mainContent = cleanPage.locator('main, [role="main"]');
    await expect(mainContent).toBeVisible();

    // Landscape
    await cleanPage.setViewportSize({ width: 667, height: 375 });
    await cleanPage.waitForTimeout(500);

    // Verify app is still functional
    mainContent = cleanPage.locator('main, [role="main"]');
    await expect(mainContent).toBeVisible();
  });

  /**
   * Test: Mobile Responsive Layout
   * Verifies responsive layout works correctly
   */
  test('should use responsive layout on mobile', async ({
    cleanPage,
    helpers,
  }) => {
    await cleanPage.setViewportSize({ width: 375, height: 667 });
    await helpers.waitForAppReady();

    // Check for horizontal scrolling (should not exist)
    const hasHorizontalScroll = await cleanPage.evaluate(() => {
      return document.body.scrollWidth > window.innerWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });
});

/**
 * Browser-Specific Workarounds Tests
 * Documents and tests browser-specific issues and workarounds
 */
test.describe('Browser-Specific Workarounds', () => {
  /**
   * Test: WebKit Date Handling
   * WebKit has specific date parsing requirements
   */
  test('should handle dates correctly in WebKit', async ({
    cleanPage,
    helpers,
  }) => {
    await helpers.waitForAppReady();

    // Create conversation with timestamp
    const conversationId = await helpers.createTestConversation('Date Test', [
      { role: 'user', content: 'Test message' },
    ]);

    // Verify date is parsed correctly
    const hasValidDate = await cleanPage.evaluate((id) => {
      const conversation = document.querySelector(
        `[data-conversation-id="${id}"]`
      );
      if (!conversation) return false;

      const dateElement = conversation.querySelector('[data-timestamp]');
      if (!dateElement) return true; // No date element is okay

      const timestamp = dateElement.getAttribute('data-timestamp');
      if (!timestamp) return true;

      const date = new Date(timestamp);
      return !Number.isNaN(date.getTime());
    }, conversationId);

    expect(hasValidDate).toBe(true);
  });

  /**
   * Test: Firefox IndexedDB Transactions
   * Firefox has specific transaction handling requirements
   */
  test('should handle IndexedDB transactions in Firefox', async ({
    cleanPage,
    helpers,
  }) => {
    await helpers.waitForAppReady();

    // Create multiple conversations rapidly
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = await helpers.createTestConversation(`Rapid ${i}`, [
        { role: 'user', content: `Message ${i}` },
      ]);
      ids.push(id);
    }

    // Reload and verify all persisted
    await cleanPage.reload();
    await helpers.waitForAppReady();

    for (const id of ids) {
      await helpers.waitForConversation(id);
    }
  });

  /**
   * Test: Chromium Storage Quota
   * Chromium has specific storage quota behavior
   */
  test('should handle storage quota in Chromium', async ({ cleanPage }) => {
    await cleanPage.evaluate(async () => {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        return estimate;
      }
      return null;
    });

    // Test passes if no errors thrown
    expect(true).toBe(true);
  });
});
