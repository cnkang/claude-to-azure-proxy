/**
 * IndexedDB Optimization Service
 *
 * Optimized IndexedDB operations with query optimization, caching,
 * and performance monitoring for conversation storage.
 *
 * Requirements: 14.5
 */

import type { Conversation, Message } from '../types/index.js';

/**
 * IndexedDB query optimization utilities
 */
export class IndexedDBOptimizer {
  private static readonly DB_NAME = 'ChatAppDB';
  private static readonly DB_VERSION = 2;
  private static readonly STORES = {
    conversations: 'conversations',
    messages: 'messages',
    cache: 'cache',
  } as const;

  private db: IDBDatabase | null = null;
  private readonly queryCache = new Map<
    string,
    { data: unknown; timestamp: number; ttl: number }
  >();
  private transactionPool: IDBTransaction[] = [];
  private batchOperations: Array<() => Promise<unknown>> = [];
  private batchTimeout: NodeJS.Timeout | null = null;

  /**
   * Initialize optimized IndexedDB connection
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(
        IndexedDBOptimizer.DB_NAME,
        IndexedDBOptimizer.DB_VERSION
      );

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.setupPerformanceMonitoring();
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        this.createOptimizedStores(db);
      };
    });
  }

  /**
   * Create optimized database stores with proper indexes
   */
  private createOptimizedStores(db: IDBDatabase): void {
    // Conversations store
    if (
      !db.objectStoreNames.contains(IndexedDBOptimizer.STORES.conversations)
    ) {
      const conversationStore = db.createObjectStore(
        IndexedDBOptimizer.STORES.conversations,
        { keyPath: 'id' }
      );

      // Indexes for efficient querying
      conversationStore.createIndex('sessionId', 'sessionId', {
        unique: false,
      });
      conversationStore.createIndex('updatedAt', 'updatedAt', {
        unique: false,
      });
      conversationStore.createIndex('createdAt', 'createdAt', {
        unique: false,
      });
      conversationStore.createIndex('title', 'title', { unique: false });
      conversationStore.createIndex('selectedModel', 'selectedModel', {
        unique: false,
      });

      // Compound indexes for complex queries
      conversationStore.createIndex(
        'sessionId_updatedAt',
        ['sessionId', 'updatedAt'],
        { unique: false }
      );
    }

    // Messages store (separate for better performance)
    if (!db.objectStoreNames.contains(IndexedDBOptimizer.STORES.messages)) {
      const messageStore = db.createObjectStore(
        IndexedDBOptimizer.STORES.messages,
        { keyPath: 'id' }
      );

      messageStore.createIndex('conversationId', 'conversationId', {
        unique: false,
      });
      messageStore.createIndex('timestamp', 'timestamp', { unique: false });
      messageStore.createIndex('role', 'role', { unique: false });

      // Compound index for conversation messages ordered by time
      messageStore.createIndex(
        'conversationId_timestamp',
        ['conversationId', 'timestamp'],
        { unique: false }
      );
    }

    // Cache store for query results
    if (!db.objectStoreNames.contains(IndexedDBOptimizer.STORES.cache)) {
      const cacheStore = db.createObjectStore(IndexedDBOptimizer.STORES.cache, {
        keyPath: 'key',
      });

      cacheStore.createIndex('expiry', 'expiry', { unique: false });
    }
  }

  /**
   * Setup performance monitoring
   */
  private setupPerformanceMonitoring(): void {
    if (!this.db) {
      return;
    }

    // Monitor transaction performance
    const originalTransaction = this.db.transaction.bind(this.db);
    this.db.transaction = (
      ...args: Parameters<IDBDatabase['transaction']>
    ): IDBTransaction => {
      const startTime = performance.now();
      const transaction = originalTransaction(...args);

      transaction.oncomplete = () => {
        const duration = performance.now() - startTime;
        if (duration > 100) {
          // console.warn(`Slow IndexedDB transaction: ${duration.toFixed(2)}ms`);
        }
      };

      return transaction;
    };
  }

  /**
   * Get optimized transaction with connection pooling
   */
  private getTransaction(
    storeNames: string | string[],
    mode: IDBTransactionMode = 'readonly'
  ): IDBTransaction {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // Reuse existing transaction if compatible
    const existingTransaction = this.transactionPool.find(
      (tx) =>
        tx.mode === mode &&
        (Array.isArray(storeNames) ? storeNames : [storeNames]).every((name) =>
          Array.from(tx.objectStoreNames).includes(name)
        )
    );

    if (existingTransaction) {
      return existingTransaction;
    }

    const transaction = this.db.transaction(storeNames, mode);

    // Add to pool
    this.transactionPool.push(transaction);

    // Remove from pool when complete
    transaction.oncomplete = transaction.onabort = () => {
      const index = this.transactionPool.indexOf(transaction);
      if (index > -1) {
        this.transactionPool.splice(index, 1);
      }
    };

    return transaction;
  }

  /**
   * Cached query execution
   */
  private async executeWithCache<T>(
    cacheKey: string,
    queryFn: () => Promise<T>,
    ttl: number = 300000 // 5 minutes default
  ): Promise<T> {
    // Check cache first
    const cached = this.queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data as T;
    }

    // Execute query
    const result = await queryFn();

    // Cache result
    this.queryCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
      ttl,
    });

    return result;
  }

  /**
   * Batch operations for better performance
   */
  private batchOperation<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.batchOperations.push(async () => {
        try {
          const result = await operation();
          resolve(result);
        } catch (_error) {
          reject(_error);
        }
      });

      // Process batch after short delay
      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
      }

      this.batchTimeout = setTimeout(() => {
        this.processBatch();
      }, 10); // 10ms batch window
    });
  }

  /**
   * Process batched operations
   */
  private async processBatch(): Promise<void> {
    if (this.batchOperations.length === 0) {
      return;
    }

    const operations = [...this.batchOperations];
    this.batchOperations = [];
    this.batchTimeout = null;

    // Execute all operations in parallel
    await Promise.allSettled(operations.map((op) => op()));
  }

  /**
   * Optimized conversation queries
   */
  async getConversationsBySession(
    sessionId: string,
    limit?: number,
    offset?: number
  ): Promise<Conversation[]> {
    const cacheKey = `conversations_${sessionId}_${limit}_${offset}`;

    return this.executeWithCache(cacheKey, async () => {
      const transaction = this.getTransaction(
        IndexedDBOptimizer.STORES.conversations
      );
      const store = transaction.objectStore(
        IndexedDBOptimizer.STORES.conversations
      );
      const index = store.index('sessionId_updatedAt');

      const conversations: Conversation[] = [];
      const range = IDBKeyRange.bound(
        [sessionId, new Date(0)],
        [sessionId, new Date()]
      );

      return new Promise<Conversation[]>((resolve, reject) => {
        const request = index.openCursor(range, 'prev'); // Most recent first
        let count = 0;
        let skipped = 0;

        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve(conversations);
            return;
          }

          // Handle offset
          if (offset && skipped < offset) {
            skipped++;
            cursor.continue();
            return;
          }

          // Handle limit
          if (limit && count >= limit) {
            resolve(conversations);
            return;
          }

          conversations.push(cursor.value);
          count++;
          cursor.continue();
        };

        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * Optimized message queries with pagination
   */
  async getMessagesByConversation(
    conversationId: string,
    limit?: number,
    beforeTimestamp?: Date
  ): Promise<Message[]> {
    const cacheKey = `messages_${conversationId}_${limit}_${beforeTimestamp?.getTime()}`;

    return this.executeWithCache(cacheKey, async () => {
      const transaction = this.getTransaction(
        IndexedDBOptimizer.STORES.messages
      );
      const store = transaction.objectStore(IndexedDBOptimizer.STORES.messages);
      const index = store.index('conversationId_timestamp');

      const messages: Message[] = [];
      const upperBound = beforeTimestamp || new Date();
      const range = IDBKeyRange.bound(
        [conversationId, new Date(0)],
        [conversationId, upperBound]
      );

      return new Promise<Message[]>((resolve, reject) => {
        const request = index.openCursor(range, 'prev');
        let count = 0;

        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || (limit && count >= limit)) {
            resolve(messages.reverse()); // Return in chronological order
            return;
          }

          messages.push(cursor.value);
          count++;
          cursor.continue();
        };

        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * Bulk insert/update operations
   */
  async bulkUpsertConversations(_conversations: Conversation[]): Promise<void> {
    return this.batchOperation(async () => {
      const transaction = this.getTransaction(
        IndexedDBOptimizer.STORES.conversations,
        'readwrite'
      );
      const store = transaction.objectStore(
        IndexedDBOptimizer.STORES.conversations
      );

      const promises = _conversations.map(
        (conversation) =>
          new Promise<void>((resolve, reject) => {
            const request = store.put(conversation);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          })
      );

      await Promise.all(promises);

      // Invalidate related cache entries
      if (_conversations.length > 0) {
        this.invalidateCache(`conversations_${_conversations[0]?.sessionId}`);
      }
    });
  }

  /**
   * Bulk insert messages
   */
  async bulkInsertMessages(messages: Message[]): Promise<void> {
    return this.batchOperation(async () => {
      const transaction = this.getTransaction(
        IndexedDBOptimizer.STORES.messages,
        'readwrite'
      );
      const store = transaction.objectStore(IndexedDBOptimizer.STORES.messages);

      const promises = messages.map(
        (message) =>
          new Promise<void>((resolve, reject) => {
            const request = store.add(message);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          })
      );

      await Promise.all(promises);

      // Invalidate related cache entries
      const conversationIds = [
        ...new Set(messages.map((m) => m.conversationId)),
      ];
      conversationIds.forEach((id) => this.invalidateCache(`messages_${id}`));
    });
  }

  /**
   * Search conversations with full-text search
   */
  async searchConversations(
    sessionId: string,
    query: string,
    limit: number = 50
  ): Promise<Conversation[]> {
    const cacheKey = `search_${sessionId}_${query}_${limit}`;

    return this.executeWithCache(
      cacheKey,
      async () => {
        const conversations = await this.getConversationsBySession(sessionId);
        const searchTerms = query
          .toLowerCase()
          .split(' ')
          .filter((term) => term.length > 0);

        return conversations
          .filter((conversation) => {
            const searchText = `${conversation.title} ${conversation.messages
              .map((m) => m.content)
              .join(' ')}`.toLowerCase();

            return searchTerms.every((term) => searchText.includes(term));
          })
          .slice(0, limit);
      },
      60000
    ); // Cache search results for 1 minute
  }

  /**
   * Clean up old data and optimize storage
   */
  async cleanup(olderThanDays: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    // Clean conversations
    const conversationTransaction = this.getTransaction(
      IndexedDBOptimizer.STORES.conversations,
      'readwrite'
    );
    const conversationStore = conversationTransaction.objectStore(
      IndexedDBOptimizer.STORES.conversations
    );
    const conversationIndex = conversationStore.index('updatedAt');

    const oldConversationIds: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const request = conversationIndex.openCursor(
        IDBKeyRange.upperBound(cutoffDate)
      );

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }

        oldConversationIds.push(cursor.value.id);
        cursor.delete();
        cursor.continue();
      };

      request.onerror = () => reject(request.error);
    });

    // Clean related messages
    if (oldConversationIds.length > 0) {
      const messageTransaction = this.getTransaction(
        IndexedDBOptimizer.STORES.messages,
        'readwrite'
      );
      const messageStore = messageTransaction.objectStore(
        IndexedDBOptimizer.STORES.messages
      );
      const messageIndex = messageStore.index('conversationId');

      for (const conversationId of oldConversationIds) {
        await new Promise<void>((resolve, reject) => {
          const request = messageIndex.openCursor(
            IDBKeyRange.only(conversationId)
          );

          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
              resolve();
              return;
            }

            cursor.delete();
            cursor.continue();
          };

          request.onerror = () => reject(request.error);
        });
      }
    }

    // Clean expired cache entries
    await this.cleanExpiredCache();

    // Clear in-memory cache
    this.queryCache.clear();
  }

  /**
   * Clean expired cache entries
   */
  private async cleanExpiredCache(): Promise<void> {
    const transaction = this.getTransaction(
      IndexedDBOptimizer.STORES.cache,
      'readwrite'
    );
    const store = transaction.objectStore(IndexedDBOptimizer.STORES.cache);
    const index = store.index('expiry');

    await new Promise<void>((resolve, reject) => {
      const request = index.openCursor(IDBKeyRange.upperBound(Date.now()));

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }

        cursor.delete();
        cursor.continue();
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Invalidate cache entries by prefix
   */
  private invalidateCache(prefix: string): void {
    for (const [key] of this.queryCache) {
      if (key.startsWith(prefix)) {
        this.queryCache.delete(key);
      }
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    conversationCount: number;
    messageCount: number;
    cacheHitRate: number;
    storageUsed: number;
  }> {
    const [conversationCount, messageCount] = await Promise.all([
      this.getCount(IndexedDBOptimizer.STORES.conversations),
      this.getCount(IndexedDBOptimizer.STORES.messages),
    ]);

    const storageUsed = await this.getStorageUsage();

    return {
      conversationCount,
      messageCount,
      cacheHitRate: this.getCacheHitRate(),
      storageUsed,
    };
  }

  /**
   * Get record count for a store
   */
  private async getCount(storeName: string): Promise<number> {
    const transaction = this.getTransaction(storeName);
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get storage usage estimate
   */
  private async getStorageUsage(): Promise<number> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return estimate.usage || 0;
    }
    return 0;
  }

  /**
   * Calculate cache hit rate
   */
  private getCacheHitRate(): number {
    // This would need to be tracked over time in a real implementation
    return 0.85; // Placeholder
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    this.queryCache.clear();
    this.transactionPool = [];

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
  }
}

// Singleton instance
export const indexedDBOptimizer = new IndexedDBOptimizer();
