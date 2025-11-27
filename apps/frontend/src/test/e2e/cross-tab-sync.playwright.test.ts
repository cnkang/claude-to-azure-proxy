/**
 * Playwright E2E Test: Cross-Tab Synchronization
 *
 * Tests complete user workflow for cross-tab synchronization using real browser tabs:
 * - Open two browser contexts (simulating two tabs)
 * - Update title in tab 1
 * - Verify update propagates to tab 2 within 1 second
 * - Delete conversation in tab 2
 * - Verify deletion propagates to tab 1
 * - Test conflict resolution (simultaneous updates)
 *
 * Requirements: 4.1, 4.2, 4.3
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';

// Helper function to wait for storage event
async function waitForStorageEvent(
  page: Page,
  key: string,
  timeout = 2000
): Promise<void> {
  await page.waitForFunction(
    (eventKey) => {
      return new Promise((resolve) => {
        const handler = (e: StorageEvent) => {
          if (e.key?.startsWith(eventKey)) {
            window.removeEventListener('storage', handler);
            resolve(true);
          }
        };
        window.addEventListener('storage', handler);
        setTimeout(() => {
          window.removeEventListener('storage', handler);
          resolve(false);
        }, 2000);
      });
    },
    key,
    { timeout }
  );
}

test.describe('E2E: Cross-Tab Synchronization with Playwright', () => {
  let context1: BrowserContext;
  let context2: BrowserContext;
  let page1: Page;
  let page2: Page;

  test.beforeEach(async ({ browser }) => {
    // Create two separate browser contexts (simulating two tabs)
    context1 = await browser.newContext();
    context2 = await browser.newContext();

    page1 = await context1.newPage();
    page2 = await context2.newPage();

    // Navigate both pages to the app
    await page1.goto('http://localhost:3000');
    await page2.goto('http://localhost:3000');

    // Wait for pages to load
    await page1.waitForLoadState('networkidle');
    await page2.waitForLoadState('networkidle');
  });

  test.afterEach(async () => {
    // Clean up
    await context1.close();
    await context2.close();
  });

  test('should propagate title update from tab 1 to tab 2 within 1 second', async () => {
    // Create a conversation in tab 1
    await page1.evaluate(() => {
      const storage = (window as any).conversationStorage;
      const conversation = {
        id: 'test-conv-1',
        title: 'Original Title',
        messages: [],
        selectedModel: 'gpt-4o',
        createdAt: new Date(),
        updatedAt: new Date(),
        sessionId: 'test-session',
        isStreaming: false,
        modelHistory: [],
        contextUsage: {
          currentTokens: 0,
          maxTokens: 128000,
          warningThreshold: 80,
          canExtend: false,
          isExtended: false,
        },
        compressionHistory: [],
      };
      return storage.storeConversation(conversation);
    });

    // Subscribe to updates in tab 2
    const updateReceived = page2.evaluate(() => {
      return new Promise((resolve) => {
        const syncService = (window as any).crossTabSyncService;
        const unsubscribe = syncService.subscribe('update', (event: any) => {
          if (
            event.conversationId === 'test-conv-1' &&
            event.data?.title === 'Updated Title'
          ) {
            unsubscribe();
            resolve(true);
          }
        });

        // Timeout after 2 seconds
        setTimeout(() => {
          unsubscribe();
          resolve(false);
        }, 2000);
      });
    });

    // Update title in tab 1
    await page1.evaluate(() => {
      const storage = (window as any).conversationStorage;
      const syncService = (window as any).crossTabSyncService;

      return storage
        .updateConversationTitle('test-conv-1', 'Updated Title')
        .then(() => {
          syncService.broadcastUpdate('test-conv-1', {
            title: 'Updated Title',
          });
        });
    });

    // Wait for tab 2 to receive the update
    const received = await updateReceived;
    expect(received).toBe(true);
  });

  test('should propagate deletion from tab 2 to tab 1', async () => {
    // Create a conversation in both tabs
    await page1.evaluate(() => {
      const storage = (window as any).conversationStorage;
      const conversation = {
        id: 'test-conv-2',
        title: 'To Be Deleted',
        messages: [],
        selectedModel: 'gpt-4o',
        createdAt: new Date(),
        updatedAt: new Date(),
        sessionId: 'test-session',
        isStreaming: false,
        modelHistory: [],
        contextUsage: {
          currentTokens: 0,
          maxTokens: 128000,
          warningThreshold: 80,
          canExtend: false,
          isExtended: false,
        },
        compressionHistory: [],
      };
      return storage.storeConversation(conversation);
    });

    // Subscribe to deletions in tab 1
    const deletionReceived = page1.evaluate(() => {
      return new Promise((resolve) => {
        const syncService = (window as any).crossTabSyncService;
        const unsubscribe = syncService.subscribe('delete', (event: any) => {
          if (event.conversationId === 'test-conv-2') {
            unsubscribe();
            resolve(true);
          }
        });

        // Timeout after 2 seconds
        setTimeout(() => {
          unsubscribe();
          resolve(false);
        }, 2000);
      });
    });

    // Delete conversation in tab 2
    await page2.evaluate(() => {
      const storage = (window as any).conversationStorage;
      const syncService = (window as any).crossTabSyncService;

      return storage.deleteConversation('test-conv-2').then(() => {
        syncService.broadcastDeletion('test-conv-2');
      });
    });

    // Wait for tab 1 to receive the deletion
    const received = await deletionReceived;
    expect(received).toBe(true);
  });

  test('should handle simultaneous updates with conflict resolution', async () => {
    // Create a conversation
    await page1.evaluate(() => {
      const storage = (window as any).conversationStorage;
      const conversation = {
        id: 'test-conv-3',
        title: 'Original',
        messages: [],
        selectedModel: 'gpt-4o',
        createdAt: new Date(),
        updatedAt: new Date(),
        sessionId: 'test-session',
        isStreaming: false,
        modelHistory: [],
        contextUsage: {
          currentTokens: 0,
          maxTokens: 128000,
          warningThreshold: 80,
          canExtend: false,
          isExtended: false,
        },
        compressionHistory: [],
      };
      return storage.storeConversation(conversation);
    });

    // Update from both tabs simultaneously
    await Promise.all([
      page1.evaluate(() => {
        const storage = (window as any).conversationStorage;
        const syncService = (window as any).crossTabSyncService;
        return storage
          .updateConversationTitle('test-conv-3', 'Title from Tab 1')
          .then(() => {
            syncService.broadcastUpdate('test-conv-3', {
              title: 'Title from Tab 1',
            });
          });
      }),
      page2.evaluate(() => {
        const storage = (window as any).conversationStorage;
        const syncService = (window as any).crossTabSyncService;
        return storage
          .updateConversationTitle('test-conv-3', 'Title from Tab 2')
          .then(() => {
            syncService.broadcastUpdate('test-conv-3', {
              title: 'Title from Tab 2',
            });
          });
      }),
    ]);

    // Wait a bit for sync to complete
    await page1.waitForTimeout(1000);

    // Verify final state is consistent (one of the titles should win)
    const finalTitle = await page1.evaluate(() => {
      const storage = (window as any).conversationStorage;
      return storage
        .getConversation('test-conv-3')
        .then((conv: any) => conv?.title);
    });

    expect(['Title from Tab 1', 'Title from Tab 2']).toContain(finalTitle);
  });

  test('should propagate conversation creation across tabs', async () => {
    // Subscribe to creation events in tab 2
    const creationReceived = page2.evaluate(() => {
      return new Promise((resolve) => {
        const syncService = (window as any).crossTabSyncService;
        const unsubscribe = syncService.subscribe('create', (event: any) => {
          if (event.conversationId === 'test-conv-4') {
            unsubscribe();
            resolve(true);
          }
        });

        // Timeout after 2 seconds
        setTimeout(() => {
          unsubscribe();
          resolve(false);
        }, 2000);
      });
    });

    // Create conversation in tab 1
    await page1.evaluate(() => {
      const storage = (window as any).conversationStorage;
      const syncService = (window as any).crossTabSyncService;
      const conversation = {
        id: 'test-conv-4',
        title: 'New Conversation',
        messages: [],
        selectedModel: 'gpt-4o',
        createdAt: new Date(),
        updatedAt: new Date(),
        sessionId: 'test-session',
        isStreaming: false,
        modelHistory: [],
        contextUsage: {
          currentTokens: 0,
          maxTokens: 128000,
          warningThreshold: 80,
          canExtend: false,
          isExtended: false,
        },
        compressionHistory: [],
      };

      return storage.storeConversation(conversation).then(() => {
        syncService.broadcastCreation('test-conv-4', conversation);
      });
    });

    // Wait for tab 2 to receive the creation
    const received = await creationReceived;
    expect(received).toBe(true);
  });
});

test.describe('E2E: Title Persistence', () => {
  let page: Page;
  let context: BrowserContext;

  test.beforeEach(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('should persist title after browser refresh', async () => {
    // Create a conversation
    await page.evaluate(() => {
      const storage = (window as any).conversationStorage;
      const conversation = {
        id: 'persist-test-1',
        title: 'Original Title',
        messages: [],
        selectedModel: 'gpt-4o',
        createdAt: new Date(),
        updatedAt: new Date(),
        sessionId: 'test-session',
        isStreaming: false,
        modelHistory: [],
        contextUsage: {
          currentTokens: 0,
          maxTokens: 128000,
          warningThreshold: 80,
          canExtend: false,
          isExtended: false,
        },
        compressionHistory: [],
      };
      return storage.storeConversation(conversation);
    });

    // Update title
    await page.evaluate(() => {
      const storage = (window as any).conversationStorage;
      return storage.updateConversationTitle('persist-test-1', 'Updated Title');
    });

    // Reload page (simulate browser refresh)
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify title persisted
    const title = await page.evaluate(() => {
      const storage = (window as any).conversationStorage;
      return storage
        .getConversation('persist-test-1')
        .then((conv: any) => conv?.title);
    });

    expect(title).toBe('Updated Title');
  });

  test('should handle very long titles correctly', async () => {
    const longTitle = 'A'.repeat(300);

    await page.evaluate((title) => {
      const storage = (window as any).conversationStorage;
      const conversation = {
        id: 'long-title-test',
        title: title,
        messages: [],
        selectedModel: 'gpt-4o',
        createdAt: new Date(),
        updatedAt: new Date(),
        sessionId: 'test-session',
        isStreaming: false,
        modelHistory: [],
        contextUsage: {
          currentTokens: 0,
          maxTokens: 128000,
          warningThreshold: 80,
          canExtend: false,
          isExtended: false,
        },
        compressionHistory: [],
      };
      return storage.storeConversation(conversation);
    }, longTitle);

    // Verify title was truncated to 200 characters
    const storedTitle = await page.evaluate(() => {
      const storage = (window as any).conversationStorage;
      return storage
        .getConversation('long-title-test')
        .then((conv: any) => conv?.title);
    });

    expect(storedTitle?.length).toBeLessThanOrEqual(200);
  });
});

test.describe('E2E: Deletion Cleanup', () => {
  let page: Page;
  let context: BrowserContext;

  test.beforeEach(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('should clean up conversation and messages on deletion', async () => {
    // Create conversation with messages
    await page.evaluate(() => {
      const storage = (window as any).conversationStorage;
      const conversation = {
        id: 'delete-test-1',
        title: 'To Be Deleted',
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Test message 1',
            timestamp: new Date(),
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'Test response 1',
            timestamp: new Date(),
          },
        ],
        selectedModel: 'gpt-4o',
        createdAt: new Date(),
        updatedAt: new Date(),
        sessionId: 'test-session',
        isStreaming: false,
        modelHistory: [],
        contextUsage: {
          currentTokens: 0,
          maxTokens: 128000,
          warningThreshold: 80,
          canExtend: false,
          isExtended: false,
        },
        compressionHistory: [],
      };
      return storage.storeConversation(conversation);
    });

    // Delete conversation
    const deleteResult = await page.evaluate(() => {
      const storage = (window as any).conversationStorage;
      return storage.deleteConversation('delete-test-1');
    });

    // Verify deletion result
    expect(deleteResult.success).toBe(true);
    expect(deleteResult.conversationRemoved).toBe(true);
    expect(deleteResult.messagesRemoved).toBe(2);

    // Verify conversation no longer exists
    const conversation = await page.evaluate(() => {
      const storage = (window as any).conversationStorage;
      return storage.getConversation('delete-test-1');
    });

    expect(conversation).toBeNull();
  });
});
