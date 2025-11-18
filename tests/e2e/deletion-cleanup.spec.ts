import { test, expect } from './fixtures/base.js';

/**
 * Deletion Cleanup E2E Tests
 * 
 * Tests complete conversation deletion and cleanup in real browsers.
 * 
 * Requirements:
 * - 2.1: Complete removal of conversation and all messages
 * - 2.2: Deleted conversation doesn't reload after refresh
 * - 2.3: No orphaned messages remain after deletion
 * - 2.4: Accurate deletion statistics
 * - 2.5: Error handling for deletion failures
 * - 3.3: Orphaned data cleanup
 */
test.describe('Deletion Cleanup', () => {
  test('should completely remove conversation and all messages', async ({ cleanPage, helpers }) => {
    // Create conversation with multiple messages
    const conversationId = await helpers.createTestConversation(
      'To Be Deleted',
      [
        { role: 'user', content: 'Message 1' },
        { role: 'assistant', content: 'Response 1' },
        { role: 'user', content: 'Message 2' },
        { role: 'assistant', content: 'Response 2' },
      ]
    );
    
    await helpers.waitForConversation(conversationId);
    
    // Delete the conversation
    await helpers.deleteConversation(conversationId);
    
    // Verify conversation removed from UI
    const conversationExists = await cleanPage.$(
      `[data-testid="conversation-${conversationId}"]`
    );
    expect(conversationExists).toBeNull();
    
    // Verify data removed from storage
    const dataExists = await cleanPage.evaluate(async (id) => {
      const storage = (window as any).__conversationStorage;
      if (!storage) return false;
      
      const conversation = await storage.getConversation(id);
      return conversation !== null;
    }, conversationId);
    
    expect(dataExists).toBe(false);
  });
  
  test('should not reload deleted conversation after refresh', async ({ cleanPage, helpers }) => {
    // Create and delete conversation
    const conversationId = await helpers.createTestConversation(
      'Deleted Conversation',
      [{ role: 'user', content: 'Test' }]
    );
    
    await helpers.waitForConversation(conversationId);
    await helpers.deleteConversation(conversationId);
    
    // Refresh browser
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Verify conversation doesn't reappear
    const conversationExists = await cleanPage.$(
      `[data-testid="conversation-${conversationId}"]`
    );
    expect(conversationExists).toBeNull();
  });
  
  test('should leave no orphaned messages after deletion', async ({ cleanPage, helpers }) => {
    // Create conversation
    const conversationId = await helpers.createTestConversation(
      'Test Conversation',
      [
        { role: 'user', content: 'Message 1' },
        { role: 'assistant', content: 'Response 1' },
      ]
    );
    
    await helpers.waitForConversation(conversationId);
    
    // Delete conversation
    await helpers.deleteConversation(conversationId);
    
    // Check for orphaned messages in storage
    const orphanedMessages = await cleanPage.evaluate(async (id) => {
      const storage = (window as any).__conversationStorage;
      if (!storage) return [];
      
      // Check IndexedDB for orphaned messages
      const db = await storage.getDatabase();
      if (!db) return [];
      
      const transaction = db.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      const allMessages = await new Promise<any[]>((resolve) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve([]);
      });
      
      // Filter messages that belong to deleted conversation
      return allMessages.filter((msg: any) => msg.conversationId === id);
    }, conversationId);
    
    expect(orphanedMessages.length).toBe(0);
  });
  
  test('should return accurate deletion statistics', async ({ cleanPage, helpers }) => {
    // Create conversation with known number of messages
    const conversationId = await helpers.createTestConversation(
      'Test Conversation',
      [
        { role: 'user', content: 'Message 1' },
        { role: 'assistant', content: 'Response 1' },
        { role: 'user', content: 'Message 2' },
      ]
    );
    
    await helpers.waitForConversation(conversationId);
    
    // Delete and capture statistics
    const deleteStats = await cleanPage.evaluate(async (id) => {
      const storage = (window as any).__conversationStorage;
      if (!storage) return null;
      
      return await storage.deleteConversationComplete(id);
    }, conversationId);
    
    // Verify statistics
    expect(deleteStats).not.toBeNull();
    expect(deleteStats.success).toBe(true);
    expect(deleteStats.conversationRemoved).toBe(true);
    expect(deleteStats.messagesRemoved).toBe(3);
    expect(deleteStats.bytesFreed).toBeGreaterThan(0);
  });
  
  test('should handle deletion of conversation with no messages', async ({ cleanPage, helpers }) => {
    // Create conversation with no messages
    const conversationId = await helpers.createTestConversation(
      'Empty Conversation',
      []
    );
    
    await helpers.waitForConversation(conversationId);
    
    // Delete conversation
    await helpers.deleteConversation(conversationId);
    
    // Verify deletion succeeded
    const conversationExists = await cleanPage.$(
      `[data-testid="conversation-${conversationId}"]`
    );
    expect(conversationExists).toBeNull();
  });
  
  test('should handle deletion of non-existent conversation', async ({ cleanPage, helpers }) => {
    const nonExistentId = 'non-existent-conversation-id';
    
    // Try to delete non-existent conversation
    const deleteResult = await cleanPage.evaluate(async (id) => {
      const storage = (window as any).__conversationStorage;
      if (!storage) return null;
      
      try {
        return await storage.deleteConversationComplete(id);
      } catch (error) {
        return { error: (error as Error).message };
      }
    }, nonExistentId);
    
    // Should handle gracefully (either return error or indicate not found)
    expect(deleteResult).not.toBeNull();
    if ('error' in deleteResult) {
      expect(deleteResult.error).toBeTruthy();
    } else {
      expect(deleteResult.success).toBe(false);
    }
  });
  
  test('should handle multiple independent deletions', async ({ cleanPage, helpers }) => {
    // Create multiple conversations
    const conv1Id = await helpers.createTestConversation(
      'Conversation 1',
      [{ role: 'user', content: 'Test 1' }]
    );
    
    const conv2Id = await helpers.createTestConversation(
      'Conversation 2',
      [{ role: 'user', content: 'Test 2' }]
    );
    
    const conv3Id = await helpers.createTestConversation(
      'Conversation 3',
      [{ role: 'user', content: 'Test 3' }]
    );
    
    await helpers.waitForConversation(conv1Id);
    await helpers.waitForConversation(conv2Id);
    await helpers.waitForConversation(conv3Id);
    
    // Delete conversations independently
    await helpers.deleteConversation(conv1Id);
    await cleanPage.waitForTimeout(500);
    
    await helpers.deleteConversation(conv3Id);
    await cleanPage.waitForTimeout(500);
    
    // Verify correct conversations deleted
    const conv1Exists = await cleanPage.$(`[data-testid="conversation-${conv1Id}"]`);
    const conv2Exists = await cleanPage.$(`[data-testid="conversation-${conv2Id}"]`);
    const conv3Exists = await cleanPage.$(`[data-testid="conversation-${conv3Id}"]`);
    
    expect(conv1Exists).toBeNull();
    expect(conv2Exists).not.toBeNull(); // Should still exist
    expect(conv3Exists).toBeNull();
    
    // Refresh and verify persistence
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    const conv2ExistsAfterRefresh = await cleanPage.$(
      `[data-testid="conversation-${conv2Id}"]`
    );
    expect(conv2ExistsAfterRefresh).not.toBeNull();
  });
});
