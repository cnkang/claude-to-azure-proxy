import { test, expect } from './fixtures/base.js';

/**
 * Title Persistence E2E Tests
 * 
 * Tests conversation title persistence across browser refresh and various scenarios.
 * 
 * Requirements:
 * - 1.1: Title changes persist across browser refresh
 * - 1.2: Title updates complete within 500ms
 * - 1.3: Title validation (1-200 characters)
 * - 1.4: XSS prevention in titles
 * - 1.5: Error handling for title updates
 */
test.describe('Title Persistence', () => {
  test('should persist title changes across browser refresh', async ({ cleanPage, helpers }) => {
    // Create a test conversation
    const conversationId = await helpers.createTestConversation(
      'Original Title',
      [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]
    );
    
    // Reload to load conversation from storage
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Wait for conversation to appear
    await helpers.waitForConversation(conversationId);
    
    // Update the title
    const newTitle = 'Updated Title';
    await helpers.updateConversationTitle(conversationId, newTitle);
    
    // Wait for save to complete (debounce + persistence)
    await cleanPage.waitForTimeout(600);
    
    // Verify title updated in UI
    const titleAfterUpdate = await helpers.getConversationTitle(conversationId);
    expect(titleAfterUpdate).toBe(newTitle);
    
    // Refresh the browser
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Verify title persisted after refresh
    await helpers.waitForConversation(conversationId);
    const titleAfterRefresh = await helpers.getConversationTitle(conversationId);
    expect(titleAfterRefresh).toBe(newTitle);
  });
  
  test('should handle debounced title updates with rapid typing', async ({ cleanPage, helpers }) => {
    // Create a test conversation
    const conversationId = await helpers.createTestConversation(
      'Original Title',
      [{ role: 'user', content: 'Test message' }]
    );
    
    // Reload to load conversation from storage
    await cleanPage.reload();
    await helpers.waitForAppReady();
    await helpers.waitForConversation(conversationId);
    
    // Find the conversation item
    const conversationItem = await cleanPage.waitForSelector(
      `.conversation-list-item:has-text("Original Title")`
    );
    
    // Click the edit button
    const editButton = await conversationItem.waitForSelector(
      'button[aria-label*="Rename"]'
    );
    await editButton.click();
    
    // Wait for input to appear
    const inputElement = await conversationItem.waitForSelector('input.conversation-title-input');
    
    // Clear existing text
    await inputElement.fill('');
    
    // Type rapidly (simulating fast typing)
    const finalTitle = 'Rapidly Typed Title';
    await inputElement.type(finalTitle, { delay: 50 }); // Fast typing
    
    // Press Enter to save
    await inputElement.press('Enter');
    
    // Wait for debounce and save
    await cleanPage.waitForTimeout(600);
    
    // Refresh and verify
    await cleanPage.reload();
    await helpers.waitForAppReady();
    await helpers.waitForConversation(conversationId);
    
    const titleAfterRefresh = await helpers.getConversationTitle(conversationId);
    expect(titleAfterRefresh).toBe(finalTitle);
  });
  
  test('should handle multiple sequential title updates', async ({ cleanPage, helpers }) => {
    // Create a test conversation
    const conversationId = await helpers.createTestConversation(
      'Title 1',
      [{ role: 'user', content: 'Test' }]
    );
    
    // Reload to load conversation from storage
    await cleanPage.reload();
    await helpers.waitForAppReady();
    await helpers.waitForConversation(conversationId);
    
    // Update title multiple times
    const titles = ['Title 2', 'Title 3', 'Final Title'];
    
    for (const title of titles) {
      await helpers.updateConversationTitle(conversationId, title);
      await cleanPage.waitForTimeout(600); // Wait for debounce + save
    }
    
    // Refresh and verify final title
    await cleanPage.reload();
    await helpers.waitForAppReady();
    await helpers.waitForConversation(conversationId);
    
    const finalTitle = await helpers.getConversationTitle(conversationId);
    expect(finalTitle).toBe('Final Title');
  });
  
  test('should display title correctly in UI after refresh', async ({ cleanPage, helpers }) => {
    // Create conversation with special characters in title
    const specialTitle = 'Title with "quotes" & <symbols>';
    const conversationId = await helpers.createTestConversation(
      specialTitle,
      [{ role: 'user', content: 'Test' }]
    );
    
    // Reload to load conversation from storage
    await cleanPage.reload();
    await helpers.waitForAppReady();
    await helpers.waitForConversation(conversationId);
    
    // Verify title displays correctly
    const titleBeforeRefresh = await helpers.getConversationTitle(conversationId);
    expect(titleBeforeRefresh).toBe(specialTitle);
    
    // Refresh again
    await cleanPage.reload();
    await helpers.waitForAppReady();
    await helpers.waitForConversation(conversationId);
    
    // Verify title still displays correctly (XSS prevention - Requirement 1.4)
    const titleAfterRefresh = await helpers.getConversationTitle(conversationId);
    expect(titleAfterRefresh).toBe(specialTitle);
  });
  
  test('should handle empty title gracefully', async ({ cleanPage, helpers }) => {
    // Create a test conversation
    const conversationId = await helpers.createTestConversation(
      'Original Title',
      [{ role: 'user', content: 'Test' }]
    );
    
    // Reload to load conversation from storage
    await cleanPage.reload();
    await helpers.waitForAppReady();
    await helpers.waitForConversation(conversationId);
    
    // Find the conversation item
    const conversationItem = await cleanPage.waitForSelector(
      `.conversation-list-item:has-text("Original Title")`
    );
    
    // Click the edit button
    const editButton = await conversationItem.waitForSelector(
      'button[aria-label*="Rename"]'
    );
    await editButton.click();
    
    // Wait for input to appear
    const inputElement = await conversationItem.waitForSelector('input.conversation-title-input');
    
    // Try to set empty title
    await inputElement.fill('');
    await inputElement.press('Enter');
    
    // Wait for validation (Requirement 1.3: 1-200 characters)
    await cleanPage.waitForTimeout(600);
    
    // Should either show error or revert to original title
    const titleAfterEmpty = await helpers.getConversationTitle(conversationId);
    expect(titleAfterEmpty.length).toBeGreaterThan(0);
    
    // Verify it didn't save empty title
    await cleanPage.reload();
    await helpers.waitForAppReady();
    await helpers.waitForConversation(conversationId);
    
    const titleAfterRefresh = await helpers.getConversationTitle(conversationId);
    expect(titleAfterRefresh.length).toBeGreaterThan(0);
  });
  
  test('should handle very long title (200 characters)', async ({ cleanPage, helpers }) => {
    // Create a test conversation
    const conversationId = await helpers.createTestConversation(
      'Short Title',
      [{ role: 'user', content: 'Test' }]
    );
    
    // Reload to load conversation from storage
    await cleanPage.reload();
    await helpers.waitForAppReady();
    await helpers.waitForConversation(conversationId);
    
    // Create a 200-character title (Requirement 1.3: max 200 characters)
    const longTitle = 'A'.repeat(200);
    await helpers.updateConversationTitle(conversationId, longTitle);
    
    // Wait for save
    await cleanPage.waitForTimeout(600);
    
    // Refresh and verify
    await cleanPage.reload();
    await helpers.waitForAppReady();
    await helpers.waitForConversation(conversationId);
    
    const titleAfterRefresh = await helpers.getConversationTitle(conversationId);
    expect(titleAfterRefresh).toBe(longTitle);
    expect(titleAfterRefresh.length).toBe(200);
  });
  
  test('should persist title with other conversation data', async ({ cleanPage, helpers }) => {
    // Create conversation with multiple messages
    const conversationId = await helpers.createTestConversation(
      'Original Title',
      [
        { role: 'user', content: 'Message 1' },
        { role: 'assistant', content: 'Response 1' },
        { role: 'user', content: 'Message 2' },
        { role: 'assistant', content: 'Response 2' },
      ]
    );
    
    // Reload to load conversation from storage
    await cleanPage.reload();
    await helpers.waitForAppReady();
    await helpers.waitForConversation(conversationId);
    
    // Update title
    const newTitle = 'Updated Title with Messages';
    await helpers.updateConversationTitle(conversationId, newTitle);
    
    // Wait for save
    await cleanPage.waitForTimeout(600);
    
    // Refresh
    await cleanPage.reload();
    await helpers.waitForAppReady();
    await helpers.waitForConversation(conversationId);
    
    // Verify title persisted
    const titleAfterRefresh = await helpers.getConversationTitle(conversationId);
    expect(titleAfterRefresh).toBe(newTitle);
    
    // Verify messages still exist by checking the conversation in storage
    const messageCount = await cleanPage.evaluate(async (convId) => {
      const storage = (window as any).__conversationStorage;
      if (!storage) {
        return 0;
      }
      const conversation = await storage.getConversation(convId);
      return conversation?.messages?.length || 0;
    }, conversationId);
    
    expect(messageCount).toBe(4);
  });
});
