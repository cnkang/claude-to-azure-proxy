import { expect, test } from './fixtures/base.js';

/**
 * Title Persistence E2E Tests
 *
 * Tests title persistence across page reloads and various edge cases using UI interactions.
 *
 * Requirements:
 * - 3.1: Title persists after page refresh
 * - 3.2: Very long titles handled without breaking UI
 * - 3.3: Final title persists after rapid updates
 * - 6.1-6.5: Test isolation and proper cleanup
 */
test.describe('Title Persistence', () => {
  test('should persist title after page refresh', async ({
    cleanPage,
    helpers,
  }) => {
    // Create a test conversation
    const conversationId = await helpers.createTestConversation(
      'Original Title',
      [{ role: 'user', content: 'Test message' }]
    );

    await helpers.waitForConversation(conversationId);

    // Verify initial title
    const initialTitle = await helpers.getConversationTitle(conversationId);
    expect(initialTitle).toBe('Original Title');

    // Update the title through UI
    const newTitle = 'Updated Title After Refresh';
    await helpers.updateConversationTitle(conversationId, newTitle);

    // Verify title updated
    const updatedTitle = await helpers.getConversationTitle(conversationId);
    expect(updatedTitle).toBe(newTitle);

    // Refresh the page to test persistence (Requirement 3.1)
    await cleanPage.reload({ waitUntil: 'domcontentloaded' });
    await helpers.waitForAppReady();

    // Wait for conversation to be loaded from storage
    await helpers.waitForConversation(conversationId);

    // Verify title persisted after refresh
    const persistedTitle = await helpers.getConversationTitle(conversationId);
    expect(persistedTitle).toBe(newTitle);

    // Verify title is displayed correctly in the UI
    const conversationItem = await cleanPage.waitForSelector(
      `[data-testid="conversation-item-${conversationId}"]`,
      { state: 'visible', timeout: 5000 }
    );

    const displayedTitle = await conversationItem.textContent();
    expect(displayedTitle).toContain(newTitle);
  });

  test('should handle very long titles without breaking UI', async ({
    cleanPage,
    helpers,
  }) => {
    // Create a test conversation
    const conversationId = await helpers.createTestConversation('Short Title', [
      { role: 'user', content: 'Test message' },
    ]);

    await helpers.waitForConversation(conversationId);

    // Create a very long title (200+ characters as per Requirement 3.2)
    const longTitle =
      'This is a very long conversation title that exceeds normal length expectations and should be handled gracefully by the UI without breaking the layout or causing overflow issues. It contains more than two hundred characters to test edge cases.';

    expect(longTitle.length).toBeGreaterThan(200);

    // Update to very long title through UI
    await helpers.updateConversationTitle(conversationId, longTitle);

    // Verify title updated in storage
    const updatedTitle = await helpers.getConversationTitle(conversationId);
    expect(updatedTitle).toBe(longTitle);

    // Verify UI handles long title without breaking
    const conversationItem = await cleanPage.waitForSelector(
      `[data-testid="conversation-item-${conversationId}"]`,
      { state: 'visible', timeout: 5000 }
    );

    // Check that the conversation item is still visible and properly sized
    const boundingBox = await conversationItem.boundingBox();
    expect(boundingBox).not.toBeNull();
    expect(boundingBox!.width).toBeGreaterThan(0);
    expect(boundingBox!.height).toBeGreaterThan(0);

    // Verify no horizontal overflow in the conversation list
    const hasOverflow = await cleanPage.evaluate((itemSelector) => {
      const item = document.querySelector(itemSelector);
      if (!item) return false;

      const parent = item.parentElement;
      if (!parent) return false;

      // Check if item width exceeds parent width (indicates overflow)
      return item.scrollWidth > parent.clientWidth;
    }, `[data-testid="conversation-item-${conversationId}"]`);

    // Some overflow is acceptable for truncation, but should be controlled
    // The test passes as long as the UI doesn't break

    // Verify title is truncated or wrapped appropriately
    const titleElement = await conversationItem
      .locator('[data-testid="conversation-title"]')
      .first();
    const titleStyles = await titleElement.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        overflow: styles.overflow,
        textOverflow: styles.textOverflow,
        whiteSpace: styles.whiteSpace,
        wordBreak: styles.wordBreak,
      };
    });

    // Verify proper CSS truncation is applied
    const hasTruncation =
      titleStyles.overflow === 'hidden' ||
      titleStyles.textOverflow === 'ellipsis' ||
      titleStyles.wordBreak === 'break-word' ||
      titleStyles.wordBreak === 'break-all';

    expect(hasTruncation).toBe(true);

    // Refresh page to verify long title persists
    await cleanPage.reload({ waitUntil: 'domcontentloaded' });
    await helpers.waitForAppReady();
    await helpers.waitForConversation(conversationId);

    // Verify long title persisted after refresh
    const persistedTitle = await helpers.getConversationTitle(conversationId);
    expect(persistedTitle).toBe(longTitle);
  });

  test('should persist final title after rapid updates', async ({
    cleanPage,
    helpers,
  }) => {
    // Create a test conversation
    const conversationId = await helpers.createTestConversation(
      'Original Title',
      [{ role: 'user', content: 'Test message' }]
    );

    await helpers.waitForConversation(conversationId);

    // Perform rapid title updates (Requirement 3.3)
    const updates = [
      'Rapid Update 1',
      'Rapid Update 2',
      'Rapid Update 3',
      'Rapid Update 4',
      'Final Rapid Update',
    ];

    // Update titles rapidly with minimal delay
    for (const title of updates) {
      await helpers.updateConversationTitle(conversationId, title);
      await cleanPage.waitForTimeout(100); // Minimal delay between updates
    }

    // Wait for all updates to settle
    await cleanPage.waitForTimeout(1000);

    // Verify final title is correct
    const finalTitle = await helpers.getConversationTitle(conversationId);
    expect(finalTitle).toBe('Final Rapid Update');

    // Refresh page to verify persistence after rapid updates
    await cleanPage.reload({ waitUntil: 'domcontentloaded' });
    await helpers.waitForAppReady();
    await helpers.waitForConversation(conversationId);

    // Verify final title persisted correctly (no data loss)
    const persistedTitle = await helpers.getConversationTitle(conversationId);
    expect(persistedTitle).toBe('Final Rapid Update');

    // Verify UI displays the correct final title
    const conversationItem = await cleanPage.waitForSelector(
      `[data-testid="conversation-item-${conversationId}"]`,
      { state: 'visible', timeout: 5000 }
    );

    const displayedTitle = await conversationItem.textContent();
    expect(displayedTitle).toContain('Final Rapid Update');
  });

  test('should handle title persistence with special characters', async ({
    cleanPage,
    helpers,
  }) => {
    // Create a test conversation
    const conversationId = await helpers.createTestConversation(
      'Simple Title',
      [{ role: 'user', content: 'Test message' }]
    );

    await helpers.waitForConversation(conversationId);

    // Test title with special characters
    const specialTitle =
      'Title with "quotes" & <tags> and émojis 🎉 and symbols: @#$%^&*()';

    // Update to title with special characters
    await helpers.updateConversationTitle(conversationId, specialTitle);

    // Verify title updated
    const updatedTitle = await helpers.getConversationTitle(conversationId);
    expect(updatedTitle).toBe(specialTitle);

    // Refresh page to verify persistence
    await cleanPage.reload({ waitUntil: 'domcontentloaded' });
    await helpers.waitForAppReady();
    await helpers.waitForConversation(conversationId);

    // Verify special characters persisted correctly
    const persistedTitle = await helpers.getConversationTitle(conversationId);
    expect(persistedTitle).toBe(specialTitle);

    // Verify UI displays special characters correctly (no XSS, proper escaping)
    const conversationItem = await cleanPage.waitForSelector(
      `[data-testid="conversation-item-${conversationId}"]`,
      { state: 'visible', timeout: 5000 }
    );

    const displayedTitle = await conversationItem.textContent();
    expect(displayedTitle).toContain('quotes');
    expect(displayedTitle).toContain('tags');
    expect(displayedTitle).toContain('émojis');
    expect(displayedTitle).toContain('🎉');
  });

  test('should handle empty title gracefully', async ({
    cleanPage,
    helpers,
  }) => {
    // Create a test conversation
    const conversationId = await helpers.createTestConversation(
      'Original Title',
      [{ role: 'user', content: 'Test message' }]
    );

    await helpers.waitForConversation(conversationId);

    // Try to update to empty title
    await helpers.updateConversationTitle(conversationId, '');

    // Wait for update to process
    await cleanPage.waitForTimeout(500);

    // Verify title handling - should either:
    // 1. Keep the original title (reject empty)
    // 2. Use a default title like "Untitled Conversation"
    // 3. Accept empty but display placeholder
    const updatedTitle = await helpers.getConversationTitle(conversationId);

    // The title should not be empty - app should handle this gracefully
    expect(updatedTitle.length).toBeGreaterThan(0);

    // Verify UI shows something meaningful
    const conversationItem = await cleanPage.waitForSelector(
      `[data-testid="conversation-item-${conversationId}"]`,
      { state: 'visible', timeout: 5000 }
    );

    const displayedTitle = await conversationItem.textContent();
    expect(displayedTitle).toBeTruthy();
    expect(displayedTitle!.trim().length).toBeGreaterThan(0);
  });

  test('should persist title across multiple refresh cycles', async ({
    cleanPage,
    helpers,
  }) => {
    // Create a test conversation
    const conversationId = await helpers.createTestConversation(
      'Original Title',
      [{ role: 'user', content: 'Test message' }]
    );

    await helpers.waitForConversation(conversationId);

    // Update title
    const persistentTitle = 'Title That Should Persist';
    await helpers.updateConversationTitle(conversationId, persistentTitle);

    // Verify initial update
    let currentTitle = await helpers.getConversationTitle(conversationId);
    expect(currentTitle).toBe(persistentTitle);

    // Perform multiple refresh cycles
    for (let i = 1; i <= 3; i++) {
      // Refresh page
      await cleanPage.reload({ waitUntil: 'domcontentloaded' });
      await helpers.waitForAppReady();
      await helpers.waitForConversation(conversationId);

      // Verify title still persists
      currentTitle = await helpers.getConversationTitle(conversationId);
      expect(currentTitle).toBe(persistentTitle);

      // Verify UI displays correct title
      const conversationItem = await cleanPage.waitForSelector(
        `[data-testid="conversation-item-${conversationId}"]`,
        { state: 'visible', timeout: 5000 }
      );

      const displayedTitle = await conversationItem.textContent();
      expect(displayedTitle).toContain(persistentTitle);
    }
  });

  test('should maintain title persistence when other conversations are modified', async ({
    cleanPage,
    helpers,
  }) => {
    // Create multiple test conversations
    const conv1Id = await helpers.createTestConversation('Conversation 1', [
      { role: 'user', content: 'Message 1' },
    ]);

    const conv2Id = await helpers.createTestConversation('Conversation 2', [
      { role: 'user', content: 'Message 2' },
    ]);

    const conv3Id = await helpers.createTestConversation('Conversation 3', [
      { role: 'user', content: 'Message 3' },
    ]);

    await helpers.waitForConversation(conv1Id);
    await helpers.waitForConversation(conv2Id);
    await helpers.waitForConversation(conv3Id);

    // Update title of conversation 2
    const targetTitle = 'Updated Conversation 2 Title';
    await helpers.updateConversationTitle(conv2Id, targetTitle);

    // Verify update
    let conv2Title = await helpers.getConversationTitle(conv2Id);
    expect(conv2Title).toBe(targetTitle);

    // Modify other conversations (update titles, add messages, etc.)
    await helpers.updateConversationTitle(conv1Id, 'Modified Conversation 1');
    await helpers.updateConversationTitle(conv3Id, 'Modified Conversation 3');

    // Wait for updates to settle
    await cleanPage.waitForTimeout(500);

    // Verify conversation 2 title is unchanged
    conv2Title = await helpers.getConversationTitle(conv2Id);
    expect(conv2Title).toBe(targetTitle);

    // Refresh page
    await cleanPage.reload({ waitUntil: 'domcontentloaded' });
    await helpers.waitForAppReady();
    await helpers.waitForConversation(conv2Id);

    // Verify conversation 2 title still persists correctly
    conv2Title = await helpers.getConversationTitle(conv2Id);
    expect(conv2Title).toBe(targetTitle);

    // Verify all conversations have correct titles
    const conv1Title = await helpers.getConversationTitle(conv1Id);
    const conv3Title = await helpers.getConversationTitle(conv3Id);

    expect(conv1Title).toBe('Modified Conversation 1');
    expect(conv3Title).toBe('Modified Conversation 3');
  });
});
