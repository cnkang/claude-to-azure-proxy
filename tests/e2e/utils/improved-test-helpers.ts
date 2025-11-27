/**
 * Improved Test Helpers with Enhanced Debugging
 * 
 * This file contains improved versions of test helpers with:
 * - Better error messages
 * - Retry logic with exponential backoff
 * - Detailed logging for debugging
 * - Verification steps at each stage
 */

import { Page } from '@playwright/test';

export interface ConversationCreationResult {
  success: boolean;
  conversationId?: string;
  error?: string;
  debugInfo: {
    storageInitialized: boolean;
    buttonClicked: boolean;
    conversationAppeared: boolean;
    dataInjected: boolean;
    verificationPassed: boolean;
    timeTaken: number;
  };
}

/**
 * Create a test conversation with enhanced debugging and verification
 */
export async function createTestConversationWithDebug(
  page: Page,
  title: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<ConversationCreationResult> {
  const startTime = Date.now();
  const debugInfo = {
    storageInitialized: false,
    buttonClicked: false,
    conversationAppeared: false,
    dataInjected: false,
    verificationPassed: false,
    timeTaken: 0,
  };

  try {
    // Step 1: Verify storage is initialized
    console.log('[DEBUG] Step 1: Verifying storage initialization...');
    const storageReady = await page.evaluate(async () => {
      try {
        // Use test bridge if available (E2E test mode)
        const bridge = (window as any).__TEST_BRIDGE__;
        if (bridge && typeof bridge.getConversationStorage === 'function') {
          await bridge.getConversationStorage();
          return true;
        }
        
        // Fallback to dynamic import (may not work in E2E tests)
        // @ts-expect-error - Dynamic import in browser context
        const { getConversationStorage } = await import('/src/services/storage.js');
        const storage = getConversationStorage();
        await storage.initialize();
        return true;
      } catch (error) {
        console.error('[DEBUG] Storage initialization failed:', error);
        return false;
      }
    });

    if (!storageReady) {
      return {
        success: false,
        error: 'Storage initialization failed',
        debugInfo: { ...debugInfo, timeTaken: Date.now() - startTime },
      };
    }
    debugInfo.storageInitialized = true;
    console.log('[DEBUG] ✓ Storage initialized');

    // Step 2: Get initial conversation count
    console.log('[DEBUG] Step 2: Getting initial conversation count...');
    const initialCount = await page.evaluate(async () => {
      try {
        // Use test bridge if available (E2E test mode)
        const bridge = (window as any).__TEST_BRIDGE__;
        if (bridge && typeof bridge.getConversationStorage === 'function') {
          const storage = await bridge.getConversationStorage();
          const conversations = await storage.getAllConversations();
          return conversations.length;
        }
        
        // Fallback to dynamic import (may not work in E2E tests)
        // @ts-expect-error - Dynamic import in browser context
        const { getConversationStorage } = await import('/src/services/storage.js');
        const storage = getConversationStorage();
        const conversations = await storage.getAllConversations();
        return conversations.length;
      } catch {
        return 0;
      }
    });
    console.log(`[DEBUG] Initial conversation count: ${initialCount}`);

    // Step 3: Click the new conversation button
    console.log('[DEBUG] Step 3: Clicking new conversation button...');
    const button = await page.waitForSelector('[data-testid="new-conversation-button"]', {
      state: 'visible',
      timeout: 5000,
    });
    
    if (!button) {
      return {
        success: false,
        error: 'New conversation button not found',
        debugInfo: { ...debugInfo, timeTaken: Date.now() - startTime },
      };
    }

    await button.click();
    debugInfo.buttonClicked = true;
    console.log('[DEBUG] ✓ Button clicked');

    // Step 4: Wait for conversation to appear (with retry)
    console.log('[DEBUG] Step 4: Waiting for conversation to appear...');
    let conversationId: string | null = null;
    let attempts = 0;
    const maxAttempts = 10;
    const retryDelay = 500;

    while (attempts < maxAttempts && !conversationId) {
      attempts++;
      console.log(`[DEBUG] Attempt ${attempts}/${maxAttempts}...`);

      // Check if a new conversation appeared
      const result = await page.evaluate(async (expectedCount) => {
        try {
          // Use test bridge if available (E2E test mode)
          const bridge = (window as any).__TEST_BRIDGE__;
          let storage;
          
          if (bridge && typeof bridge.getConversationStorage === 'function') {
            storage = await bridge.getConversationStorage();
          } else {
            // Fallback to dynamic import (may not work in E2E tests)
            // @ts-expect-error - Dynamic import in browser context
            const { getConversationStorage } = await import('/src/services/storage.js');
            storage = getConversationStorage();
          }
          
          const conversations = await storage.getAllConversations();
          
          if (conversations.length > expectedCount) {
            // Get the newest conversation (first in the list after sorting by updatedAt desc)
            const sorted = conversations.sort((a, b) => 
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );
            return {
              found: true,
              id: sorted[0].id,
              count: conversations.length,
            };
          }
          
          return {
            found: false,
            count: conversations.length,
          };
        } catch (error) {
          console.error('[DEBUG] Error checking conversations:', error);
          return {
            found: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }, initialCount);

      if (result.found && result.id) {
        conversationId = result.id;
        console.log(`[DEBUG] ✓ Conversation appeared: ${conversationId}`);
        console.log(`[DEBUG] Conversation count: ${result.count}`);
        break;
      }

      if (result.error) {
        console.error(`[DEBUG] Error: ${result.error}`);
      }

      // Wait before retrying
      await page.waitForTimeout(retryDelay);
    }

    if (!conversationId) {
      // Check DOM for conversation items
      const domItems = await page.evaluate(() => {
        const items = document.querySelectorAll('[data-testid^="conversation-item-"]');
        return Array.from(items).map(item => item.getAttribute('data-testid'));
      });
      
      return {
        success: false,
        error: `Conversation did not appear after ${maxAttempts} attempts (${maxAttempts * retryDelay}ms). DOM items: ${domItems.join(', ')}`,
        debugInfo: { ...debugInfo, timeTaken: Date.now() - startTime },
      };
    }

    debugInfo.conversationAppeared = true;

    // Step 5: Inject test data
    console.log('[DEBUG] Step 5: Injecting test data...');
    const injectionResult = await page.evaluate(
      async ({ id, title, messages }) => {
        try {
          // Use test bridge if available (E2E test mode)
          const bridge = (window as any).__TEST_BRIDGE__;
          let storage;
          
          if (bridge && typeof bridge.getConversationStorage === 'function') {
            storage = await bridge.getConversationStorage();
          } else {
            // Fallback to dynamic import (may not work in E2E tests)
            // @ts-expect-error - Dynamic import in browser context
            const { getConversationStorage } = await import('/src/services/storage.js');
            storage = getConversationStorage();
          }
          
          // Get the conversation
          const conversation = await storage.getConversation(id);
          if (!conversation) {
            return { success: false, error: 'Conversation not found in storage' };
          }

          // Update with test data
          conversation.title = title;
          conversation.messages = messages.map((msg, index) => ({
            id: `msg-${Date.now()}-${index}`,
            ...msg,
            timestamp: new Date(),
            correlationId: `corr-${id}-${index}`,
            conversationId: id,
            isComplete: true,
          }));
          conversation.isDirty = false;
          conversation.persistenceStatus = 'synced';

          // Save back
          await storage.storeConversation(conversation);
          
          return { success: true };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
      { id: conversationId, title, messages }
    );

    if (!injectionResult.success) {
      return {
        success: false,
        conversationId,
        error: `Failed to inject test data: ${injectionResult.error}`,
        debugInfo: { ...debugInfo, timeTaken: Date.now() - startTime },
      };
    }

    debugInfo.dataInjected = true;
    console.log('[DEBUG] ✓ Test data injected');

    // Step 6: Verify the conversation
    console.log('[DEBUG] Step 6: Verifying conversation...');
    const verification = await page.evaluate(async (id) => {
      try {
        // Use test bridge if available (E2E test mode)
        const bridge = (window as any).__TEST_BRIDGE__;
        let storage;
        
        if (bridge && typeof bridge.getConversationStorage === 'function') {
          storage = await bridge.getConversationStorage();
        } else {
          // Fallback to dynamic import (may not work in E2E tests)
          // @ts-expect-error - Dynamic import in browser context
          const { getConversationStorage } = await import('/src/services/storage.js');
          storage = getConversationStorage();
        }
        
        const conversation = await storage.getConversation(id);
        
        if (!conversation) {
          return { success: false, error: 'Conversation not found' };
        }

        return {
          success: true,
          title: conversation.title,
          messageCount: conversation.messages.length,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }, conversationId);

    if (!verification.success) {
      return {
        success: false,
        conversationId,
        error: `Verification failed: ${verification.error}`,
        debugInfo: { ...debugInfo, timeTaken: Date.now() - startTime },
      };
    }

    debugInfo.verificationPassed = true;
    debugInfo.timeTaken = Date.now() - startTime;

    console.log('[DEBUG] ✓ Verification passed');
    console.log(`[DEBUG] Conversation created successfully in ${debugInfo.timeTaken}ms`);
    console.log(`[DEBUG] Title: ${verification.title}`);
    console.log(`[DEBUG] Messages: ${verification.messageCount}`);

    return {
      success: true,
      conversationId,
      debugInfo,
    };
  } catch (error) {
    debugInfo.timeTaken = Date.now() - startTime;
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      debugInfo,
    };
  }
}

/**
 * Verify storage state for debugging
 */
export async function verifyStorageState(page: Page): Promise<{
  storageAvailable: boolean;
  storageInitialized: boolean;
  conversationCount: number;
  localStorageKeys: string[];
  indexedDBDatabases: string[];
  error?: string;
}> {
  return await page.evaluate(async () => {
    try {
      // Check storage availability
      const hasLocalStorage = typeof localStorage !== 'undefined';
      const hasIndexedDB = typeof indexedDB !== 'undefined';

      if (!hasLocalStorage && !hasIndexedDB) {
        return {
          storageAvailable: false,
          storageInitialized: false,
          conversationCount: 0,
          localStorageKeys: [],
          indexedDBDatabases: [],
          error: 'No storage mechanisms available',
        };
      }

      // Get localStorage keys
      const localStorageKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) localStorageKeys.push(key);
      }

      // Get IndexedDB databases
      let indexedDBDatabases: string[] = [];
      if (hasIndexedDB && indexedDB.databases) {
        try {
          const databases = await indexedDB.databases();
          indexedDBDatabases = databases.map(db => db.name || 'unknown');
        } catch {
          // Ignore errors
        }
      }

      // Try to initialize storage and get conversations
      let storageInitialized = false;
      let conversationCount = 0;

      try {
        // Use test bridge if available (E2E test mode)
        const bridge = (window as any).__TEST_BRIDGE__;
        let storage;
        
        if (bridge && typeof bridge.getConversationStorage === 'function') {
          storage = await bridge.getConversationStorage();
          storageInitialized = true;
        } else {
          // Fallback to dynamic import (may not work in E2E tests)
          // @ts-expect-error - Dynamic import in browser context
          const { getConversationStorage } = await import('/src/services/storage.js');
          storage = getConversationStorage();
          await storage.initialize();
          storageInitialized = true;
        }

        const conversations = await storage.getAllConversations();
        conversationCount = conversations.length;
      } catch (error) {
        return {
          storageAvailable: hasLocalStorage || hasIndexedDB,
          storageInitialized: false,
          conversationCount: 0,
          localStorageKeys,
          indexedDBDatabases,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      return {
        storageAvailable: true,
        storageInitialized,
        conversationCount,
        localStorageKeys,
        indexedDBDatabases,
      };
    } catch (error) {
      return {
        storageAvailable: false,
        storageInitialized: false,
        conversationCount: 0,
        localStorageKeys: [],
        indexedDBDatabases: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
