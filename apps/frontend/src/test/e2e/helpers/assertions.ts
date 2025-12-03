/**
 * Assertions Helper for E2E Tests
 *
 * Provides custom assertion methods for common UI verification patterns.
 * All assertions use Playwright's expect API with appropriate timeouts.
 *
 * @module Assertions
 */

import { type Page, expect } from '@playwright/test';

/**
 * Helper class for performing UI assertions in E2E tests
 */
export class Assertions {
  constructor(private readonly page: Page) {}

  /**
   * Asserts that a conversation appears in the list
   * @param conversationId The ID of the conversation to check
   * @param timeout Maximum time to wait in milliseconds (defaults to 5000ms)
   * @throws AssertionError if conversation is not visible within timeout
   */
  async expectConversationInList(
    conversationId: string,
    timeout = 5000
  ): Promise<void> {
    const conversation = this.page.locator(
      `[data-testid="conversation-item-${conversationId}"]`
    );
    await expect(conversation).toBeVisible({ timeout });
  }

  /**
   * Asserts that a conversation does not appear in the list
   * @param conversationId The ID of the conversation to check
   * @param timeout Maximum time to wait in milliseconds (defaults to 5000ms)
   * @throws AssertionError if conversation is visible within timeout
   */
  async expectConversationNotInList(
    conversationId: string,
    timeout = 5000
  ): Promise<void> {
    const conversation = this.page.locator(
      `[data-testid="conversation-item-${conversationId}"]`
    );
    await expect(conversation).not.toBeVisible({ timeout });
  }

  /**
   * Asserts that a conversation has a specific title
   * @param conversationId The ID of the conversation to check
   * @param expectedTitle The expected title text
   * @param timeout Maximum time to wait in milliseconds (defaults to 5000ms)
   * @throws AssertionError if title does not match within timeout
   */
  async expectConversationTitle(
    conversationId: string,
    expectedTitle: string,
    timeout = 5000
  ): Promise<void> {
    const titleElement = this.page.locator(
      `[data-testid="conversation-title-${conversationId}"]`
    );
    await expect(titleElement).toHaveText(expectedTitle, { timeout });
  }

  /**
   * Asserts the number of visible conversations in the list
   * @param expectedCount The expected number of conversations
   * @param timeout Maximum time to wait in milliseconds (defaults to 5000ms)
   * @throws AssertionError if count does not match within timeout
   */
  async expectConversationCount(
    expectedCount: number,
    timeout = 5000
  ): Promise<void> {
    const conversations = this.page.locator(
      '[data-testid^="conversation-item-"]'
    );
    await expect(conversations).toHaveCount(expectedCount, { timeout });
  }

  /**
   * Asserts the number of search results
   * @param expectedCount The expected number of results
   * @param timeout Maximum time to wait in milliseconds (defaults to 5000ms)
   * @throws AssertionError if count does not match within timeout
   */
  async expectSearchResults(
    expectedCount: number,
    timeout = 5000
  ): Promise<void> {
    // Search results are shown in a separate search results container
    const results = this.page.locator('[data-testid^="search-result-"]');
    await expect(results).toHaveCount(expectedCount, { timeout });
  }

  /**
   * Asserts that a keyword is highlighted in search results
   * @param keyword The keyword that should be highlighted
   * @param timeout Maximum time to wait in milliseconds (defaults to 5000ms)
   * @throws AssertionError if keyword is not highlighted within timeout
   */
  async expectHighlightedKeyword(
    keyword: string,
    timeout = 5000
  ): Promise<void> {
    // Look for highlighted text (typically in <mark> or <span> with highlight class)
    const highlighted = this.page.locator(
      `mark:has-text("${keyword}"), .highlight:has-text("${keyword}"), .search-highlight:has-text("${keyword}")`
    );
    await expect(highlighted.first()).toBeVisible({ timeout });
  }

  /**
   * Asserts that an empty state message is displayed
   * @param timeout Maximum time to wait in milliseconds (defaults to 5000ms)
   * @throws AssertionError if empty state is not visible within timeout
   */
  async expectEmptyState(timeout = 5000): Promise<void> {
    // Look for common empty state indicators
    const emptyState = this.page.locator(
      '[data-testid="empty-state"], .empty-state, [role="status"]:has-text(/no.*found|no.*results/i)'
    );
    await expect(emptyState.first()).toBeVisible({ timeout });
  }

  /**
   * Asserts that pagination controls are visible
   * @param timeout Maximum time to wait in milliseconds (defaults to 5000ms)
   * @throws AssertionError if pagination is not visible within timeout
   */
  async expectPaginationVisible(timeout = 5000): Promise<void> {
    const pagination = this.page.locator(
      '[data-testid="pagination"], [role="navigation"][aria-label*="pagination" i]'
    );
    await expect(pagination).toBeVisible({ timeout });
  }

  /**
   * Asserts that a conversation is selected/active
   * @param conversationId The ID of the conversation to check
   * @param timeout Maximum time to wait in milliseconds (defaults to 5000ms)
   * @throws AssertionError if conversation is not selected within timeout
   */
  async expectConversationSelected(
    conversationId: string,
    timeout = 5000
  ): Promise<void> {
    const conversation = this.page.locator(
      `[data-testid="conversation-item-${conversationId}"][aria-selected="true"]`
    );
    await expect(conversation).toBeVisible({ timeout });
  }

  /**
   * Asserts that the UI is in a loading state
   * @param timeout Maximum time to wait in milliseconds (defaults to 5000ms)
   * @throws AssertionError if loading indicator is not visible within timeout
   */
  async expectLoadingState(timeout = 5000): Promise<void> {
    const loading = this.page.locator(
      '[data-testid="loading-spinner"], [role="status"][aria-live="polite"]'
    );
    await expect(loading).toBeVisible({ timeout });
  }

  /**
   * Asserts that an error message is displayed
   * @param timeout Maximum time to wait in milliseconds (defaults to 5000ms)
   * @throws AssertionError if error message is not visible within timeout
   */
  async expectErrorMessage(timeout = 5000): Promise<void> {
    const error = this.page.locator(
      '[data-testid="error-message"], [role="alert"]'
    );
    await expect(error).toBeVisible({ timeout });
  }

  /**
   * Asserts that a specific text is visible on the page
   * @param text The text to look for
   * @param timeout Maximum time to wait in milliseconds (defaults to 5000ms)
   * @throws AssertionError if text is not visible within timeout
   */
  async expectTextVisible(text: string, timeout = 5000): Promise<void> {
    await expect(this.page.getByText(text)).toBeVisible({ timeout });
  }

  /**
   * Asserts that a specific text is not visible on the page
   * @param text The text to look for
   * @param timeout Maximum time to wait in milliseconds (defaults to 5000ms)
   * @throws AssertionError if text is visible within timeout
   */
  async expectTextNotVisible(text: string, timeout = 5000): Promise<void> {
    await expect(this.page.getByText(text)).not.toBeVisible({ timeout });
  }
}
