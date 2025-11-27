import { test as base, Page } from '@playwright/test';
import { TestHelpers } from '../utils/test-helpers.js';

/**
 * Extended test fixtures with clean page state and test helpers
 *
 * Provides:
 * - Automatic storage cleanup before each test
 * - TestHelpers instance for common operations
 * - Console and error logging in debug mode
 */
type TestFixtures = {
  helpers: TestHelpers;
  cleanPage: Page;
};

export const test = base.extend<TestFixtures>({
  /**
   * Clean page fixture - ensures storage is cleared and initialized before each test
   *
   * Enhanced with:
   * - Proper storage initialization verification
   * - Storage state verification before tests
   * - Comprehensive cleanup after tests
   */
  cleanPage: async ({ page }, use) => {
    const helpers = new TestHelpers(page);
    // Ensure test mode flag is set before any app scripts run
    await page.addInitScript(() => {
      (window as Window & { __E2E_TEST_MODE__?: boolean }).__E2E_TEST_MODE__ =
        true;
      // Force localStorage storage path to avoid IndexedDB quirks in Safari/WebKit/Firefox E2E
      (window as Window & { __E2E_USE_LOCAL_STORAGE__?: boolean }).__E2E_USE_LOCAL_STORAGE__ =
        true;
      // Force English locale so pluralization is consistent across browsers
      try {
        window.localStorage.setItem('i18nextLng', 'en');
      } catch {
        // ignore
      }
    });

    // Pre-seed conversations in storage for search scenarios (runs in page context)
    await page.addInitScript(() => {
      (async () => {
        try {
          const shouldSeed =
            (window as Window & { __E2E_SEED_CONVERSATIONS__?: boolean })
              .__E2E_SEED_CONVERSATIONS__ === true;
          if (!shouldSeed) {
            return;
          }
          
          // Wait for storage to be ready (App.tsx sets this up)
          const storageReadyPromise = (window as any).__storageReadyPromise__;
          if (storageReadyPromise) {
            await storageReadyPromise;
          }
          
          // Use the test bridge that App.tsx sets up
          const testBridge = (window as any).__TEST_BRIDGE__;
          if (!testBridge) {
            console.error('Test bridge not available for seeding');
            return;
          }
          
          const sessionManager = testBridge.getSessionManager();
          const sessionId = sessionManager.getSessionId();
          const storage = await testBridge.getConversationStorage();

          const now = new Date();
          const seed = [
            {
              id: 'seed-conv-1',
              title: 'Project Planning Discussion',
              messages: [
                {
                  id: 'msg-seed-1',
                  role: 'user',
                  content: 'Let’s discuss the project timeline',
                  timestamp: now,
                  correlationId: 'corr-seed-1',
                  conversationId: 'seed-conv-1',
                  isComplete: true,
                },
                {
                  id: 'msg-seed-2',
                  role: 'assistant',
                  content: 'Sure, I can help with project planning',
                  timestamp: now,
                  correlationId: 'corr-seed-2',
                  conversationId: 'seed-conv-1',
                  isComplete: true,
                },
              ],
              selectedModel: 'gpt-4',
              createdAt: now,
              updatedAt: now,
              sessionId,
              isStreaming: false,
              modelHistory: [],
              persistenceStatus: 'synced',
            },
            {
              id: 'seed-conv-2',
              title: 'Budget Review',
              messages: [
                {
                  id: 'msg-seed-3',
                  role: 'user',
                  content: 'Please review the project budget',
                  timestamp: now,
                  correlationId: 'corr-seed-3',
                  conversationId: 'seed-conv-2',
                  isComplete: true,
                },
                {
                  id: 'msg-seed-4',
                  role: 'assistant',
                  content: 'I will analyze the budget details',
                  timestamp: now,
                  correlationId: 'corr-seed-4',
                  conversationId: 'seed-conv-2',
                  isComplete: true,
                },
              ],
              selectedModel: 'gpt-4',
              createdAt: now,
              updatedAt: now,
              sessionId,
              isStreaming: false,
              modelHistory: [],
              persistenceStatus: 'synced',
            },
            {
              id: 'seed-conv-3',
              title: 'Team Meeting Notes',
              messages: [
                {
                  id: 'msg-seed-5',
                  role: 'user',
                  content: 'Here are the meeting notes',
                  timestamp: now,
                  correlationId: 'corr-seed-5',
                  conversationId: 'seed-conv-3',
                  isComplete: true,
                },
                {
                  id: 'msg-seed-6',
                  role: 'assistant',
                  content: 'Thanks for sharing the notes',
                  timestamp: now,
                  correlationId: 'corr-seed-6',
                  conversationId: 'seed-conv-3',
                  isComplete: true,
                },
              ],
              selectedModel: 'gpt-4',
              createdAt: now,
              updatedAt: now,
              sessionId,
              isStreaming: false,
              modelHistory: [],
              persistenceStatus: 'synced',
            },
          ];

          for (const conv of seed) {
            await storage.storeConversation(conv);
          }
        } catch (_error) {
          // Swallow errors in seed to avoid blocking tests
        }
      })();
    });

    // Mock backend API responses in E2E mode to avoid auth/session dependencies
    await page.route('**/api/**', async (route) => {
      const url = route.request().url();

      // Mock config endpoint with minimal data
      if (url.includes('/api/config')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            availableModels: ['gpt-4o'],
            features: {},
            correlationId: 'e2e-config',
          }),
        });
        return;
      }

      // Mock chat stream endpoints with SSE-like empty response
      if (url.includes('/api/chat/stream')) {
        await route.fulfill({
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
          body: 'data: {"type":"start"}\n\ndata: {"type":"end"}\n\n',
        });
        return;
      }

      // Mock chat send/simple endpoints
      if (url.includes('/api/chat/')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ correlationId: 'e2e-chat' }),
        });
        return;
      }

      // Mock conversations endpoints
      if (url.includes('/api/conversations')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ conversations: [], pagination: {} }),
        });
        return;
      }

      // Default mock for other /api/* requests
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, correlationId: 'e2e-default' }),
      });
    });

    // Set E2E test mode flag BEFORE navigation so App.tsx can detect it
    await page.addInitScript(() => {
      (window as any).__E2E_TEST_MODE__ = true;
      
      // Create a promise that will be resolved when storage is ready
      (window as any).__storageReadyPromise__ = new Promise((resolve) => {
        (window as any).__resolveStorageReady__ = resolve;
      });
    });

    // Navigate to the app
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await helpers.waitForAppReady();

    // Enable logging in debug mode
    const isDebug = Boolean(process.env.DEBUG);
    if (isDebug) {
      helpers.enableConsoleLogging();
      helpers.enableErrorLogging();
      await helpers.logStorageState('Before Test');
    }

    // Use the clean page
    await use(page);

    // Cleanup after test
    try {
      // Close all other pages to release DB locks
      const context = page.context();
      const pages = context.pages();
      for (const p of pages) {
        if (p !== page) {
          await p.close();
        }
      }

      // Wait for any pending storage operations
      await helpers.waitForPendingStorageOperations(1000);

      // Clear storage with timeout
      await Promise.race([
        helpers.clearAllStorage(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Storage cleanup timeout')), 5000)
        ),
      ]);
    } catch (error) {
      if (isDebug) {
        // eslint-disable-next-line no-console
        console.warn('Storage cleanup failed or timed out:', error);
      }
      // Continue anyway - don't fail the test due to cleanup issues
    }
  },

  /**
   * Test helpers fixture - provides common operations
   */
  helpers: async ({ page }, use) => {
    const helpers = new TestHelpers(page);
    await use(helpers);
  },
});

export { expect } from '@playwright/test';
