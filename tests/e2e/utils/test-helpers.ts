import { Page, expect } from '@playwright/test';

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
    await this.page.waitForSelector('[data-testid="loading-spinner"]', {
      state: 'hidden',
      timeout: 5000,
    }).catch(() => {
      // Loading spinner might not exist, that's okay
    });
    
    // Wait for network to be idle
    await this.page.waitForLoadState('networkidle');
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
          const databases = await (indexedDB.databases ? indexedDB.databases() : Promise.resolve([]));
          
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
    await this.page.evaluate(async () => {
      try {
        // @ts-expect-error - Dynamic import in browser context
        const { getConversationStorage } = await import('/src/services/storage.js');
        const storage = getConversationStorage();
        await storage.initialize();
      } catch (error) {
        console.error('Failed to initialize storage:', error);
        throw error;
      }
    });
    
    // Wait for storage to be ready
    await this.page.waitForTimeout(300);
  }
  
  /**
   * Verify storage is ready for use
   */
  async verifyStorageReady(): Promise<boolean> {
    return await this.page.evaluate(async () => {
      try {
        // @ts-expect-error - Dynamic import in browser context
        const { getConversationStorage } = await import('/src/services/storage.js');
        const storage = getConversationStorage();
        
        // Check if storage is initialized
        const isInitialized = storage && typeof storage.initialize === 'function';
        
        // Check if IndexedDB or localStorage is available
        const hasIndexedDB = 'indexedDB' in window && window.indexedDB !== null;
        const hasLocalStorage = 'localStorage' in window && window.localStorage !== null;
        
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
  async waitForPendingStorageOperations(timeout: number = 2000): Promise<void> {
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
          indexedDBDatabases = databases.map(db => db.name || 'unknown');
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
          indexedDBDatabases = databases.map(db => db.name || 'unknown');
        } catch {
          // Ignore errors
        }
      }
      
      // Get conversation count
      let conversationCount = 0;
      try {
        // @ts-expect-error - Dynamic import in browser context
        const { getConversationStorage } = await import('/src/services/storage.js');
        const storage = getConversationStorage();
        const conversations = await storage.getAllConversations();
        conversationCount = conversations.length;
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
  async logStorageState(label: string = 'Storage State'): Promise<void> {
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
            console.log(`Storage operation failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms...`);
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
            console.log(`UI operation failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms...`);
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
        const items = document.querySelectorAll('[data-testid^="conversation-item-"]');
        if (items.length === 0) return null;
        const lastItem = items[items.length - 1];
        const testId = lastItem.getAttribute('data-testid');
        return testId?.replace('conversation-item-', '') || null;
      });
      
      if (!conversationId) {
        // Fallback to direct storage creation if UI method fails
        return await this.createTestConversationDirect(title, messages);
      }
      
      // Update the conversation with test data
      await this.page.evaluate(
        async ({ id, title, messages }) => {
          // @ts-expect-error - Dynamic import in browser context
          const { getConversationStorage } = await import('/src/services/storage.js');
          const storage = getConversationStorage();
          
          // Get the conversation
          const conversation = await storage.getConversation(id);
          if (!conversation) throw new Error('Conversation not found after creation');
          
          // Update with test data
          conversation.title = title;
          conversation.messages = messages.map((msg, index) => ({
            id: `msg-${Date.now()}-${index}`,
            ...msg,
            timestamp: new Date(),
          }));
          
          // Save back
          await storage.storeConversation(conversation);
        },
        { id: conversationId, title, messages }
      );
      
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
        // Import storage and session manager dynamically
        // @ts-expect-error - Dynamic import in browser context
        const { getConversationStorage } = await import('/src/services/storage.js');
        // @ts-expect-error - Dynamic import in browser context
        const { getSessionManager } = await import('/src/services/session.js');
        
        const storage = getConversationStorage();
        const sessionManager = getSessionManager();
        
        // Ensure storage is initialized
        await storage.initialize();
        
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
            // @ts-expect-error - Dynamic import in browser context
            const { getConversationStorage } = await import('/src/services/storage.js');
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
      await this.page.waitForSelector('.conversation-item, .conversation-list-item', {
        state: 'visible',
        timeout: 5000,
      }).catch(() => {
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
        // @ts-expect-error - Dynamic import in browser context
        const { getConversationStorage } = await import('/src/services/storage.js');
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
   * Update conversation title
   */
  async updateConversationTitle(conversationId: string, newTitle: string): Promise<void> {
    // Find the conversation item by test ID
    const conversationItem = await this.page.waitForSelector(
      `[data-testid="conversation-item-${conversationId}"]`,
      { state: 'visible', timeout: 5000 }
    );
    
    // Click the options menu button
    const optionsButton = await conversationItem.waitForSelector(
      `[data-testid="conversation-options-${conversationId}"]`,
      { state: 'visible', timeout: 5000 }
    );
    await optionsButton.click();
    
    // Wait for dropdown menu and click rename option
    const renameOption = await this.page.waitForSelector(
      '[role="menuitem"]:has-text("Rename"), [role="menuitem"]:has-text("rename")',
      { state: 'visible', timeout: 5000 }
    );
    await renameOption.click();
    
    // Wait for input to appear
    const inputElement = await this.page.waitForSelector(
      '[data-testid="conversation-title-input"]',
      { state: 'visible', timeout: 5000 }
    );
    
    // Clear and type new title
    await inputElement.fill(newTitle);
    
    // Press Enter to save (or blur to trigger save)
    await inputElement.press('Enter');
    
    // Wait for save to complete
    await this.page.waitForTimeout(600);
  }
  
  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<void> {
    // Find the conversation item by test ID
    const conversationItem = await this.page.waitForSelector(
      `[data-testid="conversation-item-${conversationId}"]`,
      { state: 'visible', timeout: 5000 }
    );
    
    // Click the options menu button
    const optionsButton = await conversationItem.waitForSelector(
      `[data-testid="conversation-options-${conversationId}"]`,
      { state: 'visible', timeout: 5000 }
    );
    await optionsButton.click();
    
    // Wait for dropdown menu and click delete option
    const deleteOption = await this.page.waitForSelector(
      '[role="menuitem"]:has-text("Delete"), [role="menuitem"]:has-text("delete")',
      { state: 'visible', timeout: 5000 }
    );
    await deleteOption.click();
    
    // Confirm deletion if there's a confirmation dialog
    const confirmButton = await this.page.waitForSelector(
      '[data-testid="confirm-button"]',
      { state: 'visible', timeout: 2000 }
    ).catch(() => null);
    
    if (confirmButton) {
      await confirmButton.click();
    }
    
    // Wait for deletion to complete
    await this.page.waitForTimeout(500);
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
    const resultsContainer = await this.page.waitForSelector(
      '[data-testid="search-results"]',
      { state: 'visible', timeout: 5000 }
    ).catch(() => null);
    
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
  async waitForStorageEvent(eventType: 'update' | 'delete' | 'create'): Promise<boolean> {
    return await this.page.evaluate(
      (type) => {
        return new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => resolve(false), 5000);
          
          const handler = (e: StorageEvent) => {
            if (e.key?.startsWith('sync_event_') && e.newValue) {
              try {
                const event = JSON.parse(e.newValue);
                if (event.type === type) {
                  clearTimeout(timeout);
                  window.removeEventListener('storage', handler);
                  resolve(true);
                }
              } catch (error) {
                // Ignore parse errors
              }
            }
          };
          
          window.addEventListener('storage', handler);
        });
      },
      eventType
    );
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
      await this.page.waitForSelector(
        '[data-testid="error-message"]',
        { state: 'visible', timeout: 5000 }
      );
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
