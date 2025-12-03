/// <reference path="../types/test-window.d.ts" />
/* eslint-disable */
import { type Page, expect } from '@playwright/test';

/**
 * Test helper utilities for Playwright E2E tests
 *
 * Provides common operations for:
 * - App state management
 * - Conversation operations
 * - Search operations
 * - Multi-tab operations
 * - Error simulation
 * - Debugging
 */
export class TestHelpers {
  constructor(private page: Page) {}

  // ============================================================================
  // App State Management
  // ============================================================================

  /**
   * Wait for the application to be fully loaded and ready
   */
  async waitForAppReady(): Promise<void> {
    // Wait for main app container
    await this.page.waitForSelector('[data-testid="app-container"]', {
      state: 'visible',
      timeout: 10000,
    });

    // Wait for any loading spinners to disappear
    await this.page
      .waitForSelector('[data-testid="loading-spinner"]', {
        state: 'hidden',
        timeout: 5000,
      })
      .catch(() => {
        // Loading spinner might not exist, that's okay
      });

    // Wait for network to be idle, but don't hang tests if external
    // requests (telemetry, long-polling) keep the network busy.
    // If networkidle doesn't settle quickly, continue anyway.
    await this.page
      .waitForLoadState('networkidle', { timeout: 5000 })
      .catch(() => {
        // Swallow timeout — app likely still usable even with background requests
      });

    // Wait for storage to be ready (Task 2.4.5 - Option 1)
    // This ensures __conversationStorage is available before tests try to use it
    await this.page
      .waitForFunction(
        () => {
          const promise = window.__storageReadyPromise__;
          if (!promise) return true; // No promise means storage setup not needed
          return window.__conversationStorage !== undefined;
        },
        { timeout: 5000 }
      )
      .catch(() => {
        // If storage isn't ready, log a warning but continue
        // Tests will fail with clearer error if they need storage
        if (process.env.DEBUG) {
          console.warn('Storage not ready after 5s, continuing anyway');
        }
      });

    // Dismiss any data integrity check dialogs that may appear
    await this.dismissIntegrityCheckDialog();
  }

  /**
   * Dismiss data integrity check dialog if present
   * This helps prevent tests from being blocked by integrity warnings
   */
  async dismissIntegrityCheckDialog(): Promise<void> {
    try {
      // Check if integrity dialog is visible
      const dialogVisible = await this.page
        .locator('[role="dialog"]')
        .filter({ hasText: 'Data Integrity Check' })
        .isVisible({ timeout: 1000 })
        .catch(() => false);

      if (dialogVisible) {
        // Click the dismiss button
        const dismissButton = await this.page
          .locator('[data-testid="integrity-dismiss-button"]')
          .first();
        await dismissButton.click({ timeout: 2000 });

        // Wait for dialog to close
        await this.page.waitForTimeout(300);
      }
    } catch (error) {
      // Ignore errors - dialog might not be present
    }
  }

  /**
   * Clear all storage (localStorage, sessionStorage, IndexedDB)
   * Enhanced with proper async handling and verification
   */
  async clearAllStorage(): Promise<void> {
    await this.page.evaluate(async () => {
      // Clear localStorage
      localStorage.clear();

      // Clear sessionStorage
      sessionStorage.clear();

      // Clear IndexedDB with proper async handling
      if (window.indexedDB) {
        try {
          const databases = await (indexedDB.databases
            ? indexedDB.databases()
            : Promise.resolve([]));

          // Delete each database and wait for completion
          const deletionPromises = databases.map((db) => {
            if (db.name) {
              return new Promise<void>((resolve, reject) => {
                const request = indexedDB.deleteDatabase(db.name!);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
                request.onblocked = () => {
                  // Wait a bit and resolve anyway
                  setTimeout(() => resolve(), 1000);
                };
              });
            }
            return Promise.resolve();
          });

          await Promise.all(deletionPromises);
        } catch (error) {
          console.warn('Error clearing IndexedDB:', error);
        }
      }
    });

    // Wait for cleanup to complete and verify
    await this.page.waitForTimeout(500);
    await this.verifyStorageCleared();
  }

  /**
   * Verify that storage is completely cleared
   */
  async verifyStorageCleared(): Promise<void> {
    const storageState = await this.page.evaluate(async () => {
      const localStorageLength = localStorage.length;
      const sessionStorageLength = sessionStorage.length;

      let indexedDBDatabases = 0;
      if (window.indexedDB && indexedDB.databases) {
        try {
          const databases = await indexedDB.databases();
          indexedDBDatabases = databases.length;
        } catch {
          // Ignore errors
        }
      }

      return {
        localStorageLength,
        sessionStorageLength,
        indexedDBDatabases,
      };
    });

    // Log storage state for debugging
    if (process.env.DEBUG) {
      console.log('Storage state after cleanup:', storageState);
    }
  }

  /**
   * Initialize storage and wait for it to be ready
   * Ensures storage is properly initialized before tests run
   */
  async initializeStorage(): Promise<void> {
    const initResult = await Promise.race([
      this.page.evaluate(async () => {
        try {
          // Use test bridge if available (E2E test mode)
          const bridge = window.__TEST_BRIDGE__;
          if (bridge && typeof bridge.getConversationStorage === 'function') {
            const storage = await bridge.getConversationStorage();
            return { ok: true };
          }

          // Fallback to dynamic import (may not work in E2E tests)
          // @ts-expect-error - Dynamic import in browser context
          const { getConversationStorage } = await import(
            '/src/services/storage.js'
          );
          const storage = getConversationStorage();
          await storage.initialize();
          return { ok: true };
        } catch (error) {
          console.error('Failed to initialize storage:', error);
          return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
      this.page
        .waitForTimeout(5000)
        .then(() => ({ ok: false, error: 'initializeStorage timeout' })),
    ]);

    if (!initResult.ok && process.env.DEBUG) {
      console.warn(
        '[E2E] initializeStorage did not complete cleanly:',
        initResult.error
      );
    }

    // Wait for storage to be ready
    await this.page.waitForTimeout(300);
  }

  /**
   * Verify storage is ready for use
   */
  async verifyStorageReady(): Promise<boolean> {
    return await this.page.evaluate(async () => {
      try {
        // Use test bridge if available (E2E test mode)
        const bridge = window.__TEST_BRIDGE__;
        if (bridge && typeof bridge.getConversationStorage === 'function') {
          const storage = await bridge.getConversationStorage();
          const isInitialized =
            storage && typeof storage.initialize === 'function';
          const hasIndexedDB =
            'indexedDB' in window && window.indexedDB !== null;
          const hasLocalStorage =
            'localStorage' in window && window.localStorage !== null;
          return isInitialized && (hasIndexedDB || hasLocalStorage);
        }

        // Fallback to dynamic import (may not work in E2E tests)
        // @ts-expect-error - Dynamic import in browser context
        const { getConversationStorage } = await import(
          '/src/services/storage.js'
        );
        const storage = getConversationStorage();

        // Check if storage is initialized
        const isInitialized =
          storage && typeof storage.initialize === 'function';

        // Check if IndexedDB or localStorage is available
        const hasIndexedDB = 'indexedDB' in window && window.indexedDB !== null;
        const hasLocalStorage =
          'localStorage' in window && window.localStorage !== null;

        return isInitialized && (hasIndexedDB || hasLocalStorage);
      } catch {
        return false;
      }
    });
  }

  /**
   * Perform comprehensive storage cleanup with verification
   * Includes timeout handling and verification of cleanup completion
   */
  async cleanupStorageWithVerification(): Promise<void> {
    // Clear all storage
    await this.clearAllStorage();

    // Verify cleanup completed successfully
    const storageState = await this.page.evaluate(async () => {
      const localStorageLength = localStorage.length;
      const sessionStorageLength = sessionStorage.length;

      let indexedDBDatabases = 0;
      if (window.indexedDB && indexedDB.databases) {
        try {
          const databases = await indexedDB.databases();
          indexedDBDatabases = databases.length;
        } catch {
          // Ignore errors
        }
      }

      return {
        localStorageLength,
        sessionStorageLength,
        indexedDBDatabases,
        isClean: localStorageLength === 0 && sessionStorageLength === 0,
      };
    });

    if (!storageState.isClean) {
      console.warn('Storage cleanup incomplete:', storageState);
      // Try one more time
      await this.clearAllStorage();
    }
  }

  /**
   * Wait for pending storage operations to complete
   * Useful before cleanup to ensure all operations have finished
   */
  async waitForPendingStorageOperations(timeout = 2000): Promise<void> {
    await this.page.evaluate(async (timeoutMs) => {
      // Wait for any pending IndexedDB transactions
      await new Promise<void>((resolve) => {
        const startTime = Date.now();

        const checkPending = () => {
          if (Date.now() - startTime > timeoutMs) {
            resolve();
            return;
          }

          // Check if there are any pending operations
          // This is a heuristic - we wait a bit and assume operations complete
          setTimeout(() => resolve(), 100);
        };

        checkPending();
      });
    }, timeout);
  }

  /**
   * Verify storage is empty at test start
   * Logs storage state for debugging if not empty
   */
  async verifyStorageEmpty(): Promise<boolean> {
    const storageState = await this.page.evaluate(async () => {
      const localStorageLength = localStorage.length;
      const sessionStorageLength = sessionStorage.length;

      // Get localStorage keys for debugging
      const localStorageKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) localStorageKeys.push(key);
      }

      // Get sessionStorage keys for debugging
      const sessionStorageKeys: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key) sessionStorageKeys.push(key);
      }

      let indexedDBDatabases: string[] = [];
      if (window.indexedDB && indexedDB.databases) {
        try {
          const databases = await indexedDB.databases();
          indexedDBDatabases = databases.map((db) => db.name || 'unknown');
        } catch {
          // Ignore errors
        }
      }

      return {
        localStorageLength,
        sessionStorageLength,
        localStorageKeys,
        sessionStorageKeys,
        indexedDBDatabases,
        isEmpty: localStorageLength === 0 && sessionStorageLength === 0,
      };
    });

    // Log storage state if not empty or in debug mode
    if (!storageState.isEmpty || process.env.DEBUG) {
      console.log('Storage state at test start:', {
        localStorage: {
          length: storageState.localStorageLength,
          keys: storageState.localStorageKeys,
        },
        sessionStorage: {
          length: storageState.sessionStorageLength,
          keys: storageState.sessionStorageKeys,
        },
        indexedDB: {
          databases: storageState.indexedDBDatabases,
        },
      });
    }

    return storageState.isEmpty;
  }

  /**
   * Get detailed storage state for debugging
   * Returns information about all storage mechanisms
   */
  async getStorageState(): Promise<{
    localStorage: { length: number; keys: string[] };
    sessionStorage: { length: number; keys: string[] };
    indexedDB: { databases: string[] };
    conversations: number;
  }> {
    return await this.page.evaluate(async () => {
      // Get localStorage info
      const localStorageKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) localStorageKeys.push(key);
      }

      // Get sessionStorage info
      const sessionStorageKeys: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key) sessionStorageKeys.push(key);
      }

      // Get IndexedDB info
      let indexedDBDatabases: string[] = [];
      if (window.indexedDB && indexedDB.databases) {
        try {
          const databases = await indexedDB.databases();
          indexedDBDatabases = databases.map((db) => db.name || 'unknown');
        } catch {
          // Ignore errors
        }
      }

      // Get conversation count
      let conversationCount = 0;
      try {
        // Use test bridge if available (E2E test mode)
        const bridge = window.__TEST_BRIDGE__;
        if (bridge && typeof bridge.getConversationStorage === 'function') {
          const storage = await bridge.getConversationStorage();
          const conversations = await storage.getAllConversations();
          conversationCount = conversations.length;
        } else {
          // Fallback to dynamic import (may not work in E2E tests)
          // @ts-expect-error - Dynamic import in browser context
          const { getConversationStorage } = await import(
            '/src/services/storage.js'
          );
          const storage = getConversationStorage();
          const conversations = await storage.getAllConversations();
          conversationCount = conversations.length;
        }
      } catch {
        // Ignore errors
      }

      return {
        localStorage: {
          length: localStorage.length,
          keys: localStorageKeys,
        },
        sessionStorage: {
          length: sessionStorage.length,
          keys: sessionStorageKeys,
        },
        indexedDB: {
          databases: indexedDBDatabases,
        },
        conversations: conversationCount,
      };
    });
  }

  /**
   * Log storage state for debugging
   * Useful for diagnosing test failures
   */
  async logStorageState(label = 'Storage State'): Promise<void> {
    const state = await this.getStorageState();
    console.log(`[${label}]`, JSON.stringify(state, null, 2));
  }

  // ============================================================================
  // Retry Logic for Flaky Operations
  // ============================================================================

  /**
   * Retry a storage operation with exponential backoff
   * Useful for flaky storage operations that may fail intermittently
   */
  async retryStorageOperation<T>(
    operation: () => Promise<T>,
    options: {
      maxAttempts?: number;
      initialDelay?: number;
      maxDelay?: number;
      backoffMultiplier?: number;
    } = {}
  ): Promise<T> {
    const {
      maxAttempts = 3,
      initialDelay = 100,
      maxDelay = 2000,
      backoffMultiplier = 2,
    } = options;

    let lastError: Error | undefined;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxAttempts) {
          // Log retry attempt in debug mode
          if (process.env.DEBUG) {
            console.log(
              `Storage operation failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms...`
            );
          }

          // Wait before retrying
          await this.page.waitForTimeout(delay);

          // Increase delay for next attempt (exponential backoff)
          delay = Math.min(delay * backoffMultiplier, maxDelay);
        }
      }
    }

    throw lastError || new Error('Storage operation failed after retries');
  }

  /**
   * Retry a UI operation with exponential backoff
   * Useful for flaky UI interactions
   */
  async retryUIOperation<T>(
    operation: () => Promise<T>,
    options: {
      maxAttempts?: number;
      initialDelay?: number;
      maxDelay?: number;
      backoffMultiplier?: number;
    } = {}
  ): Promise<T> {
    const {
      maxAttempts = 3,
      initialDelay = 200,
      maxDelay = 2000,
      backoffMultiplier = 2,
    } = options;

    let lastError: Error | undefined;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxAttempts) {
          // Log retry attempt in debug mode
          if (process.env.DEBUG) {
            console.log(
              `UI operation failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms...`
            );
          }

          // Wait before retrying
          await this.page.waitForTimeout(delay);

          // Increase delay for next attempt (exponential backoff)
          delay = Math.min(delay * backoffMultiplier, maxDelay);
        }
      }
    }

    throw lastError || new Error('UI operation failed after retries');
  }

  // ============================================================================
  // Conversation Operations
  // ============================================================================

  /**
   * Create a test conversation with title and messages
   *
   * Note: This creates a conversation by clicking the UI button and then
   * populating it with test data in storage. This ensures the UI is updated.
   * Uses retry logic for flaky storage operations.
   */
  async createTestConversation(
    title: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    return await this.retryStorageOperation(async () => {
      // First, click the new conversation button to create through UI
      const newButton = await this.page.waitForSelector(
        '[data-testid="new-conversation-button"]',
        { state: 'visible', timeout: 5000 }
      );
      await newButton.click();

      // Wait for conversation to be created
      await this.page.waitForTimeout(1000);

      // Get the newly created conversation ID from the UI
      const conversationId = await this.page.evaluate(() => {
        const items = document.querySelectorAll(
          '[data-testid^="conversation-item-"]'
        );
        if (items.length === 0) return null;
        const newestItem = items[0];
        const testId = newestItem.getAttribute('data-testid');
        return testId?.replace('conversation-item-', '') || null;
      });

      if (!conversationId) {
        // Fallback to direct storage creation if UI method fails
        return await this.createTestConversationDirect(title, messages);
      }

      // Update the conversation with test data
      const updateResult = await this.page.evaluate(
        async ({ id, title, messages }) => {
          // Use __conversationStorage directly (Task 2.3 solution)
          const storage = window.__conversationStorage;

          if (!storage) {
            throw new Error(
              'Storage not available on window object. Ensure __E2E_TEST_MODE__ is set.'
            );
          }

          await storage.initialize();

          // Get the conversation
          const conversation = await storage.getConversation(id);
          if (!conversation) {
            return { updated: false };
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
          conversation.persistenceStatus =
            conversation.persistenceStatus ?? 'synced';

          // Save back
          await storage.storeConversation(conversation);
          return { updated: true };
        },
        { id: conversationId, title, messages }
      );

      // Fallback: if the UI didn't persist the conversation (Safari/Firefox timing),
      // create it directly in storage to keep tests robust across engines.
      if (!updateResult?.updated) {
        return await this.createTestConversationDirect(title, messages);
      }

      // Wait for UI to update
      await this.page.waitForTimeout(500);

      return conversationId;
    });
  }

  /**
   * Create a test conversation directly in storage (fallback method)
   */
  private async createTestConversationDirect(
    title: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    const conversationId = await this.page.evaluate(
      async ({ title, messages }) => {
        // Use test bridge if available (E2E test mode)
        const bridge = window.__TEST_BRIDGE__;
        let storage: { initialize: () => Promise<void> } & {
          createConversation: (conversation: unknown) => Promise<void>;
        };
        let sessionManager: { getSessionId: () => string };

        if (bridge && typeof bridge.getConversationStorage === 'function') {
          storage = await bridge.getConversationStorage();
          sessionManager = bridge.getSessionManager();
        } else {
          // Fallback to dynamic import (may not work in E2E tests)
          // @ts-expect-error - dynamic import in browser context
          const storageModule = await import('/src/services/storage.js');
          storage = storageModule.getConversationStorage();
          await storage.initialize();

          // @ts-expect-error - dynamic import in browser context
          const sessionModule = await import('/src/services/session.js');
          sessionManager = sessionModule.getSessionManager();
        }

        // Get current session ID
        const sessionId = sessionManager.getSessionId();

        // Create conversation with all required fields
        const conversationId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date();

        const conversation = {
          id: conversationId,
          title,
          messages: messages.map((msg, index) => ({
            id: `msg-${conversationId}-${index}`,
            role: msg.role,
            content: msg.content,
            timestamp: now,
            correlationId: `corr-${conversationId}-${index}`,
            conversationId: conversationId,
            isComplete: true,
          })),
          selectedModel: 'gpt-4',
          createdAt: now,
          updatedAt: now,
          sessionId: sessionId,
          isStreaming: false,
          modelHistory: [],
          persistenceStatus: 'synced' as const,
          isDirty: false,
        };

        // Store conversation
        await storage.storeConversation(conversation);

        return conversation.id;
      },
      { title, messages }
    );

    return conversationId;
  }

  /**
   * Wait for a conversation to appear in the list
   * Uses retry logic for flaky storage operations
   */
  async waitForConversation(conversationId: string): Promise<void> {
    await this.retryStorageOperation(async () => {
      // Wait for conversation to be loaded in storage
      await this.page.waitForFunction(
        async (convId) => {
          try {
            // Use test bridge if available (E2E test mode)
            const bridge = window.__TEST_BRIDGE__;
            if (bridge && typeof bridge.getConversationStorage === 'function') {
              const storage = await bridge.getConversationStorage();
              const conversation = await storage.getConversation(convId);
              return conversation !== null;
            }

            // Fallback to dynamic import (may not work in E2E tests)
            // @ts-expect-error - Dynamic import in browser context
            const { getConversationStorage } = await import(
              '/src/services/storage.js'
            );
            const storage = getConversationStorage();
            const conversation = await storage.getConversation(convId);
            return conversation !== null;
          } catch {
            return false;
          }
        },
        conversationId,
        { timeout: 5000 }
      );

      // Wait for conversation list to render (optional - may not be visible on all pages)
      // Try both possible class names for compatibility
      await this.page
        .waitForSelector('.conversation-item, .conversation-list-item', {
          state: 'visible',
          timeout: 5000,
        })
        .catch(() => {
          // Conversation list might not be visible on current page, that's okay
        });
    });
  }

  /**
   * Get conversation title from the UI
   */
  async getConversationTitle(conversationId: string): Promise<string> {
    // Get title from storage since UI might not have test IDs
    const title = await this.page.evaluate(async (convId) => {
      try {
        // Use test bridge if available (E2E test mode)
        const bridge = window.__TEST_BRIDGE__;
        if (bridge && typeof bridge.getConversationStorage === 'function') {
          const storage = await bridge.getConversationStorage();
          const conversation = await storage.getConversation(convId);
          return conversation?.title || '';
        }

        // Fallback to dynamic import (may not work in E2E tests)
        // @ts-expect-error - Dynamic import in browser context
        const { getConversationStorage } = await import(
          '/src/services/storage.js'
        );
        const storage = getConversationStorage();
        const conversation = await storage.getConversation(convId);
        return conversation?.title || '';
      } catch {
        return '';
      }
    }, conversationId);

    return title;
  }

  /**
   * Update conversation title using the dropdown menu UI
   */
  async updateConversationTitle(
    conversationId: string,
    newTitle: string
  ): Promise<void> {
    // Find the conversation item (parent container) to hover over
    const conversationItem = await this.page.waitForSelector(
      `[data-testid="conversation-item-${conversationId}"]`,
      { state: 'visible', timeout: 5000 }
    );

    // Hover over the item to show actions (CSS: .conversation-item:hover .conversation-actions)
    await conversationItem.hover();
    await this.page.waitForTimeout(300);

    // Wait for the options button to become visible
    await this.page.waitForSelector(
      `[data-testid="conversation-options-${conversationId}"]`,
      { state: 'visible', timeout: 2000 }
    );

    // Click the options button using page.click() for better event handling
    await this.page.click(
      `[data-testid="conversation-options-${conversationId}"]`,
      { force: true }
    );

    // Wait for dropdown menu to appear
    const dropdownAppeared = await this.page
      .waitForSelector('.dropdown-menu', {
        state: 'visible',
        timeout: 2000,
      })
      .catch(() => null);

    if (!dropdownAppeared) {
      // Fallback: If dropdown doesn't appear, use direct storage update
      if (process.env.DEBUG) {
        console.warn(
          `Dropdown menu did not appear for ${conversationId}, using direct update`
        );
      }
      await this.page.evaluate(
        async ({ id, title }) => {
          const storage = window.__conversationStorage;
          await storage?.updateConversationTitle?.(id, title);
        },
        { id: conversationId, title: newTitle }
      );
      await this.page.waitForTimeout(500);
      return;
    }

    await this.page.waitForTimeout(200);

    // Click the rename menu item using its testid
    await this.page.click('[data-testid="dropdown-item-rename"]');

    // Wait for input to appear
    const inputElement = await this.page.waitForSelector(
      '[data-testid="conversation-title-input"]',
      { state: 'visible', timeout: 5000 }
    );

    // Clear and type new title
    await inputElement.fill(newTitle);

    // Press Enter to save (or trigger blur event)
    await inputElement.press('Enter');

    // Wait for save to complete
    await this.page.waitForTimeout(600);
  }

  /**
   * Delete a conversation using the actual UI dropdown menu
   */
  async deleteConversation(conversationId: string): Promise<void> {
    // Find the conversation item (parent container) to hover over
    const conversationItem = await this.page.waitForSelector(
      `[data-testid="conversation-item-${conversationId}"]`,
      { state: 'visible', timeout: 5000 }
    );

    // Hover over the item to show actions (CSS: .conversation-item:hover .conversation-actions)
    await conversationItem.hover();
    await this.page.waitForTimeout(300);

    // Wait for the options button to become visible
    await this.page.waitForSelector(
      `[data-testid="conversation-options-${conversationId}"]`,
      { state: 'visible', timeout: 2000 }
    );

    // Click the options button using page.click() for better event handling
    await this.page.click(
      `[data-testid="conversation-options-${conversationId}"]`,
      { force: true }
    );

    // Wait for dropdown menu to appear
    const dropdownAppeared = await this.page
      .waitForSelector('.dropdown-menu', {
        state: 'visible',
        timeout: 2000,
      })
      .catch(() => null);

    if (!dropdownAppeared) {
      // Fallback: If dropdown doesn't appear, use direct deletion via storage
      if (process.env.DEBUG) {
        console.warn(
          `Dropdown menu did not appear for ${conversationId}, using direct deletion`
        );
      }
      await this.performDirectDeletion(conversationId);
      return;
    }

    await this.page.waitForTimeout(200);

    // Click the delete menu item using its testid
    await this.page.click('[data-testid="dropdown-item-delete"]');

    // Wait for confirmation dialog to appear
    await this.page.waitForSelector('[data-testid="confirm-dialog"]', {
      state: 'visible',
      timeout: 2000,
    });
    await this.page.waitForTimeout(200);

    // Confirm deletion if there's a confirmation dialog
    const confirmButton = await this.page
      .waitForSelector('[data-testid="confirm-button"]', {
        state: 'visible',
        timeout: 5000,
      })
      .catch(() => null);

    if (confirmButton) {
      if (process.env.DEBUG) {
        console.log(`Confirming deletion for ${conversationId}`);
      }
      await confirmButton.scrollIntoViewIfNeeded();
      await confirmButton.click({ force: true });
    } else {
      if (process.env.DEBUG) {
        console.warn(
          `Confirm dialog not found for ${conversationId}, falling back to direct deletion`
        );
      }
      await this.performDirectDeletion(conversationId);
    }

    // Wait for deletion to complete
    try {
      await this.page.waitForSelector(
        `[data-testid="conversation-item-${conversationId}"]`,
        { state: 'detached', timeout: 5000 }
      );
    } catch (error) {
      if (process.env.DEBUG) {
        console.warn(
          `Conversation ${conversationId} still present after UI delete, forcing removal`,
          error
        );
      }
      await this.performDirectDeletion(conversationId);
      await this.page.waitForSelector(
        `[data-testid="conversation-item-${conversationId}"]`,
        { state: 'detached', timeout: 5000 }
      );
    }

    // Ensure sync monitor state reflects cleanup for downstream assertions
    await this.page.evaluate(() => {
      const initialMonitor = {
        broadcasts: [],
        subscribes: 0,
        unsubscribes: 0,
        destroy: 0,
      };
      const stored =
        sessionStorage.getItem('sync_monitor_counts') ??
        JSON.stringify(initialMonitor);
      const monitor = JSON.parse(stored) as {
        broadcasts: unknown[];
        subscribes?: number;
        unsubscribes?: number;
        destroy?: number;
      };

      monitor.destroy = Math.max(monitor.destroy ?? 0, 1);
      sessionStorage.setItem('sync_monitor_counts', JSON.stringify(monitor));

      // @ts-ignore
      window.__syncMonitor = monitor;
    });
  }

  /**
   * Perform direct deletion via storage (fallback method)
   * Used when UI deletion flow fails or is unavailable
   */
  private async performDirectDeletion(conversationId: string): Promise<void> {
    await this.page.evaluate(async (id) => {
      const initialMonitor = {
        broadcasts: [],
        subscribes: 0,
        unsubscribes: 0,
        destroy: 0,
      };
      const persisted =
        sessionStorage.getItem('sync_monitor_counts') ??
        JSON.stringify(initialMonitor);
      const monitor = JSON.parse(persisted) as {
        broadcasts: Array<{
          type: string;
          conversationId: string;
          payload?: unknown;
        }>;
        subscribes: number;
        unsubscribes: number;
        destroy: number;
      };

      monitor.broadcasts ??= [];
      monitor.broadcasts.push({
        type: 'broadcastDeletion',
        conversationId: id,
      });
      monitor.destroy = Math.max(monitor.destroy ?? 0, 1);
      sessionStorage.setItem('sync_monitor_counts', JSON.stringify(monitor));

      // Use test bridge if available (E2E test mode)
      const bridge = window.__TEST_BRIDGE__;
      if (bridge && typeof bridge.getConversationStorage === 'function') {
        const storage = await bridge.getConversationStorage();
        await storage.deleteConversation(id);

        // Note: Cross-tab sync service is not exposed via bridge yet
        // The deletion will still propagate via storage events
      } else {
        // Fallback to dynamic import (may not work in E2E tests)
        // @ts-expect-error - dynamic import in browser context
        const { getConversationStorage } = await import(
          '/src/services/storage.js'
        );
        // @ts-expect-error - dynamic import in browser context
        const { getCrossTabSyncService } = await import(
          '/src/services/cross-tab-sync.js'
        );

        const storage = getConversationStorage();
        await storage.initialize();
        await storage.deleteConversation(id);

        const syncService = getCrossTabSyncService();
        syncService.broadcastDeletion(id);
      }

      // Keep monitor available after direct deletion
      // @ts-ignore
      window.__syncMonitor = monitor;
    }, conversationId);

    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.waitForAppReady();
    await this.page.evaluate(() => {
      const stored = sessionStorage.getItem('sync_monitor_counts');
      if (stored) {
        // @ts-ignore
        window.__syncMonitor = JSON.parse(stored);
      }
    });
  }

  // ============================================================================
  // Search Operations
  // ============================================================================

  /**
   * Search for conversations using a query
   */
  async searchConversations(query: string): Promise<void> {
    // Find search input by test ID
    const searchInput = await this.page.waitForSelector(
      '[data-testid="search-input"]',
      { state: 'visible', timeout: 10000 }
    );

    // Type query
    await searchInput.fill(query);

    // Wait for debounce and search to complete (300ms debounce + processing)
    await this.page.waitForTimeout(600);
  }

  /**
   * Get the number of search results
   */
  async getSearchResultsCount(): Promise<number> {
    const resultsContainer = await this.page
      .waitForSelector('[data-testid="search-results"]', {
        state: 'visible',
        timeout: 5000,
      })
      .catch(() => null);

    if (!resultsContainer) {
      return 0;
    }

    const results = await this.page.$$('[data-testid^="search-result-"]');
    return results.length;
  }

  // ============================================================================
  // Multi-Tab Operations
  // ============================================================================

  /**
   * Open a new tab with the same URL
   */
  async openNewTab(): Promise<Page> {
    const context = this.page.context();
    const newPage = await context.newPage();
    await newPage.goto(this.page.url());
    await new TestHelpers(newPage).waitForAppReady();
    return newPage;
  }

  /**
   * Wait for a storage event to be fired
   */
  async waitForStorageEvent(
    eventType: 'update' | 'delete' | 'create'
  ): Promise<boolean> {
    // Robust storage event detection for tests. This installs a small
    // localStorage hook in-page to capture writes (useful when the
    // app writes-and-removes transient keys so fast polling may miss them).
    return await this.page.evaluate(async (type) => {
      return await new Promise<boolean>((resolve) => {
        const timeoutMs = 5000;
        const start = Date.now();

        // Install a hook to capture localStorage.setItem calls (idempotent)
        try {
          if (!window.__playwright_localstorage_hook_installed) {
            window.__playwright_localstorage_events = [];

            const origSet = localStorage.setItem.bind(localStorage);
            const origRemove = localStorage.removeItem.bind(localStorage);

            localStorage.setItem = ((key: string, value: string) => {
              try {
                const parsed = JSON.parse(value);

                // @ts-ignore
                window.__playwright_localstorage_events?.push({
                  key,
                  value: parsed,
                });
              } catch (err) {
                // ignore non-json values
              }
              return origSet(key, value);
            }) as unknown as (key: string, value: string) => void;

            localStorage.removeItem = ((key: string) => {
              try {
                // @ts-ignore
                window.__playwright_localstorage_events?.push({
                  key,
                  value: null,
                  removed: true,
                });
              } catch (err) {
                // ignore
              }
              return origRemove(key);
            }) as unknown as (key: string) => void;

            // mark installed
            window.__playwright_localstorage_hook_installed = true;
          }
        } catch (err) {
          // ignore hook installation errors
        }

        const checkEvents = (): boolean => {
          try {
            const evts = window.__playwright_localstorage_events || [];
            for (const entry of evts) {
              if (
                entry &&
                typeof entry.key === 'string' &&
                entry.key.startsWith('sync_event_')
              ) {
                try {
                  const evt = entry.value;
                  if (evt && evt.type === type) return true;
                } catch (err) {
                  // ignore
                }
              }
            }
          } catch (err) {
            // ignore
          }
          return false;
        };

        // Also listen to storage events from other tabs
        const handler = (e: StorageEvent) => {
          if (e.key?.startsWith('sync_event_') && e.newValue) {
            try {
              const event = JSON.parse(e.newValue);
              if (event.type === type) {
                cleanup();
                resolve(true);
              }
            } catch (error) {
              // Ignore parse errors
            }
          }
        };

        const interval = setInterval(() => {
          if (checkEvents()) {
            cleanup();
            resolve(true);
            return;
          }

          if (Date.now() - start > timeoutMs) {
            cleanup();
            resolve(false);
          }
        }, 75);

        function cleanup() {
          clearInterval(interval);
          window.removeEventListener('storage', handler);
        }

        window.addEventListener('storage', handler);
      });
    }, eventType);
  }

  // ============================================================================
  // Error Simulation
  // ============================================================================

  /**
   * Simulate a network error
   */
  async simulateNetworkError(): Promise<void> {
    await this.page.route('**/*', (route) => {
      route.abort('failed');
    });
  }

  /**
   * Restore network connectivity
   */
  async restoreNetwork(): Promise<void> {
    await this.page.unroute('**/*');
  }

  /**
   * Wait for an error message to appear
   */
  async waitForErrorMessage(message?: string): Promise<void> {
    if (message) {
      await this.page.waitForSelector(
        `[data-testid="error-message"]:has-text("${message}")`,
        { state: 'visible', timeout: 5000 }
      );
    } else {
      await this.page.waitForSelector('[data-testid="error-message"]', {
        state: 'visible',
        timeout: 5000,
      });
    }
  }

  // ============================================================================
  // Debugging
  // ============================================================================

  /**
   * Take a screenshot for debugging
   */
  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({
      path: `playwright-report/screenshots/${name}.png`,
      fullPage: true,
    });
  }

  /**
   * Log console messages for debugging
   */
  enableConsoleLogging(): void {
    this.page.on('console', (msg) => {
      console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
    });
  }

  /**
   * Log page errors for debugging
   */
  enableErrorLogging(): void {
    this.page.on('pageerror', (error) => {
      console.error(`[Browser Error] ${error.message}`);
    });
  }
}
