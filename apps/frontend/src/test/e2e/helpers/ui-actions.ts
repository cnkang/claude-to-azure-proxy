/**
 * UI Actions Helper for E2E Tests
 *
 * Provides high-level UI interaction methods that encapsulate common user actions.
 * All interactions use data-testid attributes for reliable element selection.
 *
 * @module UIActions
 */

import type { Page } from '@playwright/test';

/**
 * Helper class for performing UI actions in E2E tests
 */
export class UIActions {
  constructor(private readonly page: Page) {}

  /**
   * Creates a new conversation through the UI by clicking the "New Conversation" button
   * @returns The ID of the created conversation
   * @throws Error if conversation creation fails or times out
   */
  async createConversation(): Promise<string> {
    // Get current conversation count
    const beforeCount = await this.page
      .locator('[data-testid^="conversation-item-"]')
      .count();

    // Click "New Conversation" button
    await this.page.click('[data-testid="new-conversation-button"]');

    // Wait for new conversation to appear
    await this.page.waitForTimeout(1000);

    // Get new conversation count
    const afterCount = await this.page
      .locator('[data-testid^="conversation-item-"]')
      .count();

    if (afterCount <= beforeCount) {
      throw new Error('No new conversation was created');
    }

    // Get the first conversation (newest one)
    const firstConversation = this.page
      .locator('[data-testid^="conversation-item-"]')
      .first();

    // Extract conversation ID from data-testid
    const testId = await firstConversation.getAttribute('data-testid');
    if (!testId) {
      throw new Error('Failed to get conversation ID after creation');
    }

    const conversationId = testId.replace('conversation-item-', '');
    return conversationId;
  }

  /**
   * Updates the title of a conversation through the UI
   * @param conversationId The ID of the conversation to update
   * @param newTitle The new title to set
   * @throws Error if title update fails or times out
   */
  async updateConversationTitle(
    conversationId: string,
    newTitle: string
  ): Promise<void> {
    // Find the conversation item
    const conversationItem = this.page.locator(
      `[data-testid="conversation-item-${conversationId}"]`
    );

    // Click the options button (⋯) to open dropdown menu/dialog
    const optionsButton = conversationItem.locator(
      `[data-testid="conversation-options-${conversationId}"]`
    );
    await optionsButton.click();

    // Wait for menu/dialog to appear and be ready
    await this.page.waitForTimeout(800);

    // Find the rename button using testid (more reliable than role)
    const renameButton = this.page.locator(
      '[data-testid="dropdown-item-rename"]'
    );

    // Wait for it to be visible
    await renameButton.waitFor({ state: 'visible', timeout: 5000 });

    // Click using JavaScript to bypass overlay issues
    await renameButton.evaluate((el) => (el as HTMLElement).click());

    // Wait for input to appear (it appears after rename button is clicked)
    const input = this.page.locator('[data-testid="conversation-title-input"]');
    await input.waitFor({ state: 'visible', timeout: 5000 });

    // Clear and type new title
    await input.fill(newTitle);

    // Save the title (press Enter)
    await input.press('Enter');

    // Wait for title to update in the UI
    await this.page.waitForTimeout(500);
  }

  /**
   * Deletes a conversation through the UI using the dropdown menu
   * @param conversationId The ID of the conversation to delete
   * @throws Error if deletion fails or times out
   */
  async deleteConversation(conversationId: string): Promise<void> {
    // Find the conversation item and ensure it's visible
    const conversationItem = this.page.locator(
      `[data-testid="conversation-item-${conversationId}"]`
    );

    // Wait for conversation item to be visible (important if we just cleared search)
    await conversationItem.waitFor({ state: 'visible', timeout: 10000 });

    // Scroll into view if needed
    await conversationItem.scrollIntoViewIfNeeded();
    await this.page.waitForTimeout(300);

    // Click the options button (⋯) to open dropdown menu/dialog
    const optionsButton = conversationItem.locator(
      `[data-testid="conversation-options-${conversationId}"]`
    );

    // Ensure options button is visible and clickable
    await optionsButton.waitFor({ state: 'visible', timeout: 10000 });
    await optionsButton.click({ force: true });

    // Wait for menu/dialog to appear and be ready
    await this.page.waitForTimeout(800);

    // Find the delete button using testid (more reliable than role)
    const deleteButton = this.page.locator(
      '[data-testid="dropdown-item-delete"]'
    );

    // Wait for it to be visible
    await deleteButton.waitFor({ state: 'visible', timeout: 5000 });

    // Click using JavaScript to bypass overlay issues
    await deleteButton.evaluate((el) => (el as HTMLElement).click());

    // Wait for confirmation dialog to appear
    await this.page.waitForTimeout(800);

    // Click confirm button in the dialog - use JavaScript click to bypass overlay
    const confirmButton = this.page.getByRole('button', {
      name: /delete|confirm/i,
    });
    await confirmButton.waitFor({ state: 'visible', timeout: 5000 });
    await confirmButton.evaluate((el) => (el as HTMLElement).click());

    // Wait for conversation to disappear from the list
    await this.page.waitForSelector(
      `[data-testid="conversation-item-${conversationId}"]`,
      { state: 'detached', timeout: 5000 }
    );
  }

  /**
   * Searches for conversations using the search input
   * @param query The search query string
   * @throws Error if search fails or times out
   */
  async searchConversations(query: string): Promise<void> {
    // Find the search input using data-testid
    const searchInput = this.page.locator('[data-testid="search-input"]');

    // Wait for it to be visible
    await searchInput.waitFor({ state: 'visible', timeout: 5000 });

    // Click to focus
    await searchInput.click();

    // Clear any existing text and type query
    await searchInput.fill(query);

    // Wait for debounce delay (typical search debounce is 300-500ms)
    await this.page.waitForTimeout(800);
  }

  /**
   * Clears the search input to show all conversations
   * @throws Error if clearing search fails
   */
  async clearSearch(): Promise<void> {
    const searchInput = this.page.locator('[data-testid="search-input"]');
    await searchInput.fill('');
    await this.page.waitForTimeout(800);
  }

  /**
   * Clears all conversations through the UI by deleting them one by one
   * @throws Error if clearing conversations fails
   */
  async clearAllConversations(): Promise<void> {
    // Get all conversation items
    const conversations = this.page.locator(
      '[data-testid^="conversation-item-"]'
    );
    const count = await conversations.count();

    // Delete each conversation (always delete the first one since list shrinks)
    for (let i = 0; i < count; i++) {
      const firstConversation = this.page
        .locator('[data-testid^="conversation-item-"]')
        .first();

      // Extract conversation ID from data-testid
      const testId = await firstConversation.getAttribute('data-testid');
      if (testId) {
        const conversationId = testId.replace('conversation-item-', '');
        await this.deleteConversation(conversationId);
      }
    }
  }

  /**
   * Sends a message in the current conversation
   * @param message The message text to send
   * @throws Error if sending message fails or times out
   */
  async sendMessage(message: string): Promise<void> {
    // Find the message input (textarea)
    const messageInput = this.page.locator('textarea').first();

    // Type message
    await messageInput.fill(message);

    // Find and click send button (look for button with send icon or text)
    const sendButton = this.page
      .locator('button')
      .filter({ hasText: /send|submit|➤|→/i })
      .first();
    await sendButton.click();

    // Wait for message to appear in the conversation
    await this.page.waitForTimeout(1000);
  }

  /**
   * Gets the current conversation ID from the URL or UI
   * @returns The current conversation ID or null if none
   */
  async getCurrentConversationId(): Promise<string | null> {
    // Try to get from URL first
    const url = this.page.url();
    const match = url.match(/\/conversation\/([^/?]+)/);
    if (match) {
      return match[1];
    }

    // Try to get from active conversation in sidebar
    const activeConversation = this.page.locator(
      '[data-testid^="conversation-item-"][aria-selected="true"]'
    );
    const testId = await activeConversation.getAttribute('data-testid');
    if (testId) {
      return testId.replace('conversation-item-', '');
    }

    return null;
  }

  /**
   * Selects a conversation from the list
   * @param conversationId The ID of the conversation to select
   * @throws Error if selection fails or times out
   */
  async selectConversation(conversationId: string): Promise<void> {
    // Click the conversation item itself (not just the button)
    const conversationItem = this.page.locator(
      `[data-testid="conversation-item-${conversationId}"]`
    );
    await conversationItem.click();

    // Wait a bit for the selection to take effect
    await this.page.waitForTimeout(500);

    // Optionally verify it's selected (but don't fail if aria-selected isn't set immediately)
    // The conversation should be active now
  }
}
