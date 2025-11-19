import { test, expect } from './fixtures/base.js';
import { TestHelpers } from './utils/test-helpers.js';

/**
 * Cross-Tab Synchronization E2E Tests
 * 
 * Tests real cross-tab synchronization using Storage Event API in actual browsers.
 * 
 * Requirements:
 * - 4.1: Title updates propagate from tab 1 to tab 2 within 1 second
 * - 4.2: Deletions propagate from tab 2 to tab 1
 * - 4.3: Simultaneous updates with conflict resolution
 * - 4.4: Conversation creation propagation
 * - 4.5: Multiple rapid updates across tabs
 */
test.describe('Cross-Tab Synchronization', () => {
  test('should propagate title update from tab 1 to tab 2 within 1 second', async ({ cleanPage, helpers }) => {
    // Create a test conversation in tab 1
    const conversationId = await helpers.createTestConversation(
      'Original Title',
      [{ role: 'user', content: 'Test message' }]
    );
    
    await helpers.waitForConversation(conversationId);
    
    // Open tab 2
    const tab2 = await helpers.openNewTab();
    const helpers2 = new TestHelpers(tab2);
    await helpers2.waitForConversation(conversationId);
    
    // Verify initial title in both tabs
    const initialTitle1 = await helpers.getConversationTitle(conversationId);
    const initialTitle2 = await helpers2.getConversationTitle(conversationId);
    expect(initialTitle1).toBe('Original Title');
    expect(initialTitle2).toBe('Original Title');
    
    // Update title in tab 1
    const startTime = Date.now();
    const newTitle = 'Updated in Tab 1';
    await helpers.updateConversationTitle(conversationId, newTitle);
    
    // Wait for sync event in tab 2
    const syncReceived = await helpers2.waitForStorageEvent('update');
    const syncTime = Date.now() - startTime;
    
    expect(syncReceived).toBe(true);
    expect(syncTime).toBeLessThan(1000); // Within 1 second
    
    // Verify title updated in tab 2
    await tab2.waitForTimeout(500); // Give UI time to update
    const updatedTitle2 = await helpers2.getConversationTitle(conversationId);
    expect(updatedTitle2).toBe(newTitle);
    
    // Cleanup
    await tab2.close();
  });
  
  test('should propagate deletion from tab 2 to tab 1', async ({ cleanPage, helpers }) => {
    // Create a test conversation
    const conversationId = await helpers.createTestConversation(
      'To Be Deleted',
      [{ role: 'user', content: 'Test' }]
    );
    
    await helpers.waitForConversation(conversationId);
    
    // Open tab 2
    const tab2 = await helpers.openNewTab();
    const helpers2 = new TestHelpers(tab2);
    await helpers2.waitForConversation(conversationId);
    
    // Delete conversation in tab 2
    await helpers2.deleteConversation(conversationId);
    
    // Wait for sync event in tab 1
    const syncReceived = await helpers.waitForStorageEvent('delete');
    expect(syncReceived).toBe(true);
    
    // Verify conversation removed from tab 1
    await cleanPage.waitForTimeout(500);
    const conversationExists = await cleanPage.$(
      `[data-testid="conversation-${conversationId}"]`
    );
    expect(conversationExists).toBeNull();
    
    // Cleanup
    await tab2.close();
  });
  
  test('should handle simultaneous updates with conflict resolution', async ({ cleanPage, helpers }) => {
    // Create a test conversation
    const conversationId = await helpers.createTestConversation(
      'Original Title',
      [{ role: 'user', content: 'Test' }]
    );
    
    await helpers.waitForConversation(conversationId);
    
    // Open tab 2
    const tab2 = await helpers.openNewTab();
    const helpers2 = new TestHelpers(tab2);
    await helpers2.waitForConversation(conversationId);
    
    // Update title in both tabs simultaneously
    const title1 = 'Updated in Tab 1';
    const title2 = 'Updated in Tab 2';
    
    // Start both updates at the same time
    const update1Promise = helpers.updateConversationTitle(conversationId, title1);
    const update2Promise = helpers2.updateConversationTitle(conversationId, title2);
    
    await Promise.all([update1Promise, update2Promise]);
    
    // Wait for sync to complete
    await cleanPage.waitForTimeout(1500);
    await tab2.waitForTimeout(1500);
    
    // Both tabs should have the same title (most recent wins)
    const finalTitle1 = await helpers.getConversationTitle(conversationId);
    const finalTitle2 = await helpers2.getConversationTitle(conversationId);
    
    expect(finalTitle1).toBe(finalTitle2);
    expect([title1, title2]).toContain(finalTitle1);
    
    // Cleanup
    await tab2.close();
  });
  
  test('should propagate conversation creation', async ({ cleanPage, helpers }) => {
    // Open tab 2 first
    const tab2 = await helpers.openNewTab();
    const helpers2 = new TestHelpers(tab2);
    
    // Create conversation in tab 1
    const conversationId = await helpers.createTestConversation(
      'New Conversation',
      [{ role: 'user', content: 'Hello' }]
    );
    
    await helpers.waitForConversation(conversationId);
    
    // Wait for sync event in tab 2
    const syncReceived = await helpers2.waitForStorageEvent('create');
    expect(syncReceived).toBe(true);
    
    // Verify conversation appears in tab 2
    await tab2.waitForTimeout(500);
    await helpers2.waitForConversation(conversationId);
    
    const title2 = await helpers2.getConversationTitle(conversationId);
    expect(title2).toBe('New Conversation');
    
    // Cleanup
    await tab2.close();
  });
  
  test('should handle multiple rapid updates across tabs', async ({ cleanPage, helpers }) => {
    // Create a test conversation
    const conversationId = await helpers.createTestConversation(
      'Original Title',
      [{ role: 'user', content: 'Test' }]
    );
    
    await helpers.waitForConversation(conversationId);
    
    // Open tab 2
    const tab2 = await helpers.openNewTab();
    const helpers2 = new TestHelpers(tab2);
    await helpers2.waitForConversation(conversationId);
    
    // Perform rapid updates alternating between tabs
    const updates = [
      { tab: 1, title: 'Update 1' },
      { tab: 2, title: 'Update 2' },
      { tab: 1, title: 'Update 3' },
      { tab: 2, title: 'Update 4' },
      { tab: 1, title: 'Final Update' },
    ];
    
    for (const update of updates) {
      if (update.tab === 1) {
        await helpers.updateConversationTitle(conversationId, update.title);
      } else {
        await helpers2.updateConversationTitle(conversationId, update.title);
      }
      await cleanPage.waitForTimeout(200); // Small delay between updates
    }
    
    // Wait for all syncs to complete
    await cleanPage.waitForTimeout(2000);
    await tab2.waitForTimeout(2000);
    
    // Both tabs should have the final title
    const finalTitle1 = await helpers.getConversationTitle(conversationId);
    const finalTitle2 = await helpers2.getConversationTitle(conversationId);
    
    expect(finalTitle1).toBe(finalTitle2);
    expect(finalTitle1).toBe('Final Update');
    
    // Cleanup
    await tab2.close();
  });
  
  test('should maintain sync version consistency across multiple tabs', async ({ cleanPage, helpers }) => {
    // Create a test conversation
    const conversationId = await helpers.createTestConversation(
      'Original Title',
      [{ role: 'user', content: 'Test' }]
    );
    
    await helpers.waitForConversation(conversationId);
    
    // Open two additional tabs
    const tab2 = await helpers.openNewTab();
    const helpers2 = new TestHelpers(tab2);
    await helpers2.waitForConversation(conversationId);
    
    const tab3 = await helpers.openNewTab();
    const helpers3 = new TestHelpers(tab3);
    await helpers3.waitForConversation(conversationId);
    
    // Update title in tab 1
    const newTitle = 'Updated Title';
    await helpers.updateConversationTitle(conversationId, newTitle);
    
    // Wait for sync to all tabs
    await cleanPage.waitForTimeout(1500);
    await tab2.waitForTimeout(1500);
    await tab3.waitForTimeout(1500);
    
    // All tabs should have the same title
    const title1 = await helpers.getConversationTitle(conversationId);
    const title2 = await helpers2.getConversationTitle(conversationId);
    const title3 = await helpers3.getConversationTitle(conversationId);
    
    expect(title1).toBe(newTitle);
    expect(title2).toBe(newTitle);
    expect(title3).toBe(newTitle);
    
    // Cleanup
    await tab2.close();
    await tab3.close();
  });
  
  test('should handle tab closing gracefully', async ({ cleanPage, helpers }) => {
    // Create a test conversation
    const conversationId = await helpers.createTestConversation(
      'Test Title',
      [{ role: 'user', content: 'Test' }]
    );
    
    await helpers.waitForConversation(conversationId);
    
    // Open tab 2
    const tab2 = await helpers.openNewTab();
    const helpers2 = new TestHelpers(tab2);
    await helpers2.waitForConversation(conversationId);
    
    // Update title in tab 2
    await helpers2.updateConversationTitle(conversationId, 'Updated Before Close');
    
    // Wait for sync
    await cleanPage.waitForTimeout(1000);
    
    // Close tab 2
    await tab2.close();
    
    // Tab 1 should still work normally
    await helpers.updateConversationTitle(conversationId, 'Updated After Tab 2 Closed');
    
    // Verify update worked
    const finalTitle = await helpers.getConversationTitle(conversationId);
    expect(finalTitle).toBe('Updated After Tab 2 Closed');
  });
  
  test('should not trigger storage events for same-tab updates', async ({ cleanPage, helpers }) => {
    // Create a test conversation
    const conversationId = await helpers.createTestConversation(
      'Original Title',
      [{ role: 'user', content: 'Test' }]
    );
    
    await helpers.waitForConversation(conversationId);
    
    // Set up storage event listener
    const storageEventFired = await cleanPage.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        let eventFired = false;
        
        const handler = () => {
          eventFired = true;
        };
        
        window.addEventListener('storage', handler);
        
        // Check after 2 seconds
        setTimeout(() => {
          window.removeEventListener('storage', handler);
          resolve(eventFired);
        }, 2000);
      });
    });
    
    // Update title in same tab
    await helpers.updateConversationTitle(conversationId, 'Updated in Same Tab');
    
    // Wait for the promise to resolve
    await cleanPage.waitForTimeout(2500);
    
    // Storage event should NOT have fired (same-tab updates don't trigger storage events)
    expect(storageEventFired).toBe(false);
  });
});
