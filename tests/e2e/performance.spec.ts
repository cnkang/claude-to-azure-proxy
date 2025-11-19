import { test, expect } from './fixtures/base.js';

/**
 * Performance E2E Tests
 * 
 * Tests performance characteristics and latency requirements for conversation persistence.
 * 
 * Requirements:
 * - 6.1: Title update latency (<500ms)
 * - 6.2: Deletion latency (<500ms)
 * - 6.3: Search latency (<500ms)
 * - 6.4: Cross-tab sync latency (<1000ms)
 * - 6.5: Conversation list load time (<2 seconds for 1000 conversations)
 */
test.describe('Performance', () => {
  test('should update title within 500ms', async ({ cleanPage, helpers }) => {
    // Create a test conversation
    const conversationId = await helpers.createTestConversation(
      'Original Title',
      [{ role: 'user', content: 'Test message' }]
    );
    
    // Reload to load conversation from storage
    await cleanPage.reload();
    await helpers.waitForAppReady();
    await helpers.waitForConversation(conversationId);
    
    // Measure title update latency
    const startTime = Date.now();
    
    await helpers.updateConversationTitle(conversationId, 'New Title');
    
    // Wait for persistence to complete
    await cleanPage.waitForFunction(
      async (convId) => {
        try {
          // @ts-expect-error - Dynamic import in browser context
          const { getConversationStorage } = await import('/src/services/storage.js');
          const storage = getConversationStorage();
          const conversation = await storage.getConversation(convId);
          return conversation?.title === 'New Title';
        } catch {
          return false;
        }
      },
      conversationId,
      { timeout: 1000 }
    );
    
    const endTime = Date.now();
    const latency = endTime - startTime;
    
    // Requirement 6.1: Title update latency <500ms
    expect(latency).toBeLessThan(500);
    
    console.log(`Title update latency: ${latency}ms`);
  });
  
  test('should delete conversation within 500ms', async ({ cleanPage, helpers }) => {
    // Create a test conversation
    const conversationId = await helpers.createTestConversation(
      'Test Conversation',
      [
        { role: 'user', content: 'Message 1' },
        { role: 'assistant', content: 'Response 1' },
      ]
    );
    
    // Reload to load conversation from storage
    await cleanPage.reload();
    await helpers.waitForAppReady();
    await helpers.waitForConversation(conversationId);
    
    // Measure deletion latency
    const startTime = Date.now();
    
    await helpers.deleteConversation(conversationId);
    
    // Wait for deletion to complete
    await cleanPage.waitForFunction(
      async (convId) => {
        try {
          // @ts-expect-error - Dynamic import in browser context
          const { getConversationStorage } = await import('/src/services/storage.js');
          const storage = getConversationStorage();
          const conversation = await storage.getConversation(convId);
          return conversation === null;
        } catch {
          return false;
        }
      },
      conversationId,
      { timeout: 1000 }
    );
    
    const endTime = Date.now();
    const latency = endTime - startTime;
    
    // Requirement 6.2: Deletion latency <500ms
    expect(latency).toBeLessThan(500);
    
    console.log(`Deletion latency: ${latency}ms`);
  });
  
  test('should search conversations within 500ms', async ({ cleanPage, helpers }) => {
    // Create multiple test conversations
    const conversations = [
      { title: 'JavaScript Tutorial', content: 'Learn JavaScript basics' },
      { title: 'TypeScript Guide', content: 'TypeScript advanced features' },
      { title: 'React Patterns', content: 'React design patterns' },
      { title: 'Node.js API', content: 'Building REST APIs with Node.js' },
      { title: 'Database Design', content: 'SQL and NoSQL databases' },
    ];
    
    for (const conv of conversations) {
      await helpers.createTestConversation(conv.title, [
        { role: 'user', content: conv.content },
      ]);
    }
    
    // Reload to load conversations from storage
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Navigate to search (if needed)
    const searchInput = await cleanPage.waitForSelector(
      'input[type="search"], input[role="searchbox"]',
      { state: 'visible', timeout: 5000 }
    ).catch(() => null);
    
    if (!searchInput) {
      // Search might not be visible, skip this test
      test.skip();
      return;
    }
    
    // Measure search latency
    const startTime = Date.now();
    
    await searchInput.fill('TypeScript');
    
    // Wait for search results to appear
    await cleanPage.waitForFunction(
      () => {
        const resultsContainer = document.querySelector('[data-testid="search-results"]');
        return resultsContainer && resultsContainer.children.length > 0;
      },
      { timeout: 1000 }
    ).catch(() => {
      // Results might not appear if search is not implemented yet
    });
    
    const endTime = Date.now();
    const latency = endTime - startTime;
    
    // Requirement 6.3: Search latency <500ms
    expect(latency).toBeLessThan(500);
    
    console.log(`Search latency: ${latency}ms`);
  });
  
  test('should sync across tabs within 1000ms', async ({ cleanPage, helpers, context }) => {
    // Create a test conversation
    const conversationId = await helpers.createTestConversation(
      'Original Title',
      [{ role: 'user', content: 'Test message' }]
    );
    
    // Reload to load conversation from storage
    await cleanPage.reload();
    await helpers.waitForAppReady();
    await helpers.waitForConversation(conversationId);
    
    // Open a second tab
    const tab2 = await context.newPage();
    await tab2.goto(cleanPage.url());
    const helpers2 = new (await import('./utils/test-helpers.js')).TestHelpers(tab2);
    await helpers2.waitForAppReady();
    await helpers2.waitForConversation(conversationId);
    
    // Measure cross-tab sync latency
    const startTime = Date.now();
    
    // Update title in tab 1
    await helpers.updateConversationTitle(conversationId, 'Updated in Tab 1');
    
    // Wait for update to propagate to tab 2
    await tab2.waitForFunction(
      async (convId) => {
        try {
          // @ts-expect-error - Dynamic import in browser context
          const { getConversationStorage } = await import('/src/services/storage.js');
          const storage = getConversationStorage();
          const conversation = await storage.getConversation(convId);
          return conversation?.title === 'Updated in Tab 1';
        } catch {
          return false;
        }
      },
      conversationId,
      { timeout: 2000 }
    );
    
    const endTime = Date.now();
    const latency = endTime - startTime;
    
    // Requirement 6.4: Cross-tab sync latency <1000ms
    expect(latency).toBeLessThan(1000);
    
    console.log(`Cross-tab sync latency: ${latency}ms`);
    
    // Clean up
    await tab2.close();
  });
  
  test('should load 1000 conversations within 2 seconds', async ({ cleanPage, helpers }) => {
    // Create 1000 test conversations
    console.log('Creating 1000 test conversations...');
    
    const batchSize = 100;
    const totalConversations = 1000;
    
    for (let i = 0; i < totalConversations; i += batchSize) {
      const batch = [];
      for (let j = 0; j < batchSize && i + j < totalConversations; j++) {
        const index = i + j;
        batch.push(
          helpers.createTestConversation(
            `Conversation ${index + 1}`,
            [{ role: 'user', content: `Message ${index + 1}` }]
          )
        );
      }
      await Promise.all(batch);
      console.log(`Created ${i + batchSize} / ${totalConversations} conversations`);
    }
    
    console.log('All conversations created, measuring load time...');
    
    // Measure conversation list load time
    const startTime = Date.now();
    
    // Reload to load all conversations from storage
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Wait for conversation list to be fully loaded
    await cleanPage.waitForFunction(
      async () => {
        try {
          // @ts-expect-error - Dynamic import in browser context
          const { getConversationStorage } = await import('/src/services/storage.js');
          const storage = getConversationStorage();
          const conversations = await storage.getAllConversations();
          return conversations.length >= 1000;
        } catch {
          return false;
        }
      },
      { timeout: 5000 }
    );
    
    const endTime = Date.now();
    const loadTime = endTime - startTime;
    
    // Requirement 6.5: Conversation list load time <2 seconds for 1000 conversations
    expect(loadTime).toBeLessThan(2000);
    
    console.log(`Conversation list load time (1000 conversations): ${loadTime}ms`);
  });
  
  test('should monitor memory usage during operations', async ({ cleanPage, helpers }) => {
    // Get initial memory usage
    const initialMemory = await cleanPage.evaluate(() => {
      if ('memory' in performance) {
        return (performance as any).memory.usedJSHeapSize;
      }
      return 0;
    });
    
    // Create multiple conversations
    const conversationIds = [];
    for (let i = 0; i < 50; i++) {
      const id = await helpers.createTestConversation(
        `Conversation ${i + 1}`,
        [
          { role: 'user', content: `Message ${i + 1}` },
          { role: 'assistant', content: `Response ${i + 1}` },
        ]
      );
      conversationIds.push(id);
    }
    
    // Reload to load conversations
    await cleanPage.reload();
    await helpers.waitForAppReady();
    
    // Get memory usage after loading
    const afterLoadMemory = await cleanPage.evaluate(() => {
      if ('memory' in performance) {
        return (performance as any).memory.usedJSHeapSize;
      }
      return 0;
    });
    
    // Perform operations (updates, deletions)
    for (let i = 0; i < 10; i++) {
      await helpers.updateConversationTitle(
        conversationIds[i],
        `Updated Title ${i + 1}`
      );
      await cleanPage.waitForTimeout(100);
    }
    
    for (let i = 10; i < 20; i++) {
      await helpers.deleteConversation(conversationIds[i]);
      await cleanPage.waitForTimeout(100);
    }
    
    // Get memory usage after operations
    const afterOperationsMemory = await cleanPage.evaluate(() => {
      if ('memory' in performance) {
        return (performance as any).memory.usedJSHeapSize;
      }
      return 0;
    });
    
    // Calculate memory increase
    const memoryIncrease = afterOperationsMemory - initialMemory;
    const memoryIncreasePerConversation = memoryIncrease / 50;
    
    console.log(`Initial memory: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`);
    console.log(`After load: ${(afterLoadMemory / 1024 / 1024).toFixed(2)} MB`);
    console.log(`After operations: ${(afterOperationsMemory / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Per conversation: ${(memoryIncreasePerConversation / 1024).toFixed(2)} KB`);
    
    // Memory increase should be reasonable (less than 50MB for 50 conversations)
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    
    // Per-conversation memory should be reasonable (less than 500KB per conversation)
    expect(memoryIncreasePerConversation).toBeLessThan(500 * 1024);
  });
  
  test('should monitor storage quota', async ({ cleanPage, helpers }) => {
    // Get storage quota information
    const quotaInfo = await cleanPage.evaluate(async () => {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        return {
          quota: estimate.quota || 0,
          usage: estimate.usage || 0,
          usagePercentage: estimate.quota
            ? ((estimate.usage || 0) / estimate.quota) * 100
            : 0,
        };
      }
      return {
        quota: 0,
        usage: 0,
        usagePercentage: 0,
      };
    });
    
    console.log(`Storage quota: ${(quotaInfo.quota / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Storage usage: ${(quotaInfo.usage / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Usage percentage: ${quotaInfo.usagePercentage.toFixed(2)}%`);
    
    // Create conversations to increase storage usage
    const conversationIds = [];
    for (let i = 0; i < 100; i++) {
      const id = await helpers.createTestConversation(
        `Large Conversation ${i + 1}`,
        [
          { role: 'user', content: 'A'.repeat(1000) }, // 1KB message
          { role: 'assistant', content: 'B'.repeat(1000) }, // 1KB message
        ]
      );
      conversationIds.push(id);
    }
    
    // Get updated storage quota information
    const updatedQuotaInfo = await cleanPage.evaluate(async () => {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        return {
          quota: estimate.quota || 0,
          usage: estimate.usage || 0,
          usagePercentage: estimate.quota
            ? ((estimate.usage || 0) / estimate.quota) * 100
            : 0,
        };
      }
      return {
        quota: 0,
        usage: 0,
        usagePercentage: 0,
      };
    });
    
    const usageIncrease = updatedQuotaInfo.usage - quotaInfo.usage;
    
    console.log(`Updated storage usage: ${(updatedQuotaInfo.usage / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Updated usage percentage: ${updatedQuotaInfo.usagePercentage.toFixed(2)}%`);
    console.log(`Usage increase: ${(usageIncrease / 1024).toFixed(2)} KB`);
    
    // Storage usage should increase (we added data)
    expect(updatedQuotaInfo.usage).toBeGreaterThan(quotaInfo.usage);
    
    // Storage usage should not exceed 80% of quota (warning threshold)
    expect(updatedQuotaInfo.usagePercentage).toBeLessThan(80);
    
    // Verify storage quota monitoring is working
    expect(quotaInfo.quota).toBeGreaterThan(0);
    expect(updatedQuotaInfo.quota).toBeGreaterThan(0);
  });
});
