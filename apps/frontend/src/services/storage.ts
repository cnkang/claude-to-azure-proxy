/**
 * IndexedDB Storage System with Encryption
 *
 * Provides secure local storage for conversation data using IndexedDB with Web Crypto API
 * encryption, data compression, and fallback to localStorage when IndexedDB is unavailable.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.5
 */

import type { Conversation, Message } from '../types/index.js';
import { getSessionManager } from './session.js';
import { frontendLogger } from '../utils/logger.js';
import {
  measureAsync,
  OperationType,
} from '../utils/performance-metrics.js';

// Storage configuration
const DB_NAME = 'claude-proxy-storage';
const DB_VERSION = 1;
const CONVERSATIONS_STORE = 'conversations';
const MESSAGES_STORE = 'messages';
const METADATA_STORE = 'metadata';

// Encryption configuration
const ENCRYPTION_ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM

// Compression configuration
const COMPRESSION_THRESHOLD = 1024; // Compress data larger than 1KB
// const _COMPRESSION_LEVEL = 6; // Balanced compression level

// Storage quota thresholds
const QUOTA_WARNING_THRESHOLD = 0.8; // 80%
// const _QUOTA_CRITICAL_THRESHOLD = 0.95; // 95%
const CLEANUP_BATCH_SIZE = 10; // Number of old conversations to clean up at once

/**
 * Encrypted data structure
 */
interface EncryptedData {
  data: ArrayBuffer;
  iv: ArrayBuffer;
  compressed: boolean;
  timestamp: number;
}

/**
 * Storage metadata
 */
interface StorageMetadata {
  version: number;
  sessionId: string;
  createdAt: number;
  lastAccessed: number;
  encryptionKeyId: string;
  totalSize: number;
  conversationCount: number;
}

/**
 * Storage quota information
 */
export interface StorageQuota {
  used: number;
  quota: number;
  percentage: number;
  available: number;
}

/**
 * Storage statistics
 */
export interface StorageStats {
  conversationCount: number;
  messageCount: number;
  totalSize: number;
  oldestConversation?: Date;
  newestConversation?: Date;
  quota: StorageQuota;
}

/**
 * Cleanup result
 */
export interface CleanupResult {
  conversationsRemoved: number;
  messagesRemoved: number;
  bytesFreed: number;
  success: boolean;
  error?: string;
}

/**
 * Delete result with detailed statistics
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */
export interface DeleteResult {
  success: boolean;
  conversationRemoved: boolean;
  messagesRemoved: number;
  metadataRemoved: boolean;
  bytesFreed: number;
  error?: string;
}

/**
 * ConversationStorage class providing secure IndexedDB storage with encryption
 */
export class ConversationStorage {
  private static instance: ConversationStorage | null = null;
  private db: IDBDatabase | null = null;
  private encryptionKey: CryptoKey | null = null;
  private keyId: string | null = null;
  private isIndexedDBAvailable = true;
  private readonly sessionManager = getSessionManager();

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get singleton instance of ConversationStorage
   */
  public static getInstance(): ConversationStorage {
    ConversationStorage.instance ??= new ConversationStorage();
    return ConversationStorage.instance;
  }

  /**
   * Initialize the storage system
   */
  public async initialize(): Promise<void> {
    try {
      // Initialize encryption key (required for both IndexedDB and localStorage)
      await this.initializeEncryption();

      // Check if IndexedDB is available
      if (!this.isIndexedDBSupported()) {
        this.isIndexedDBAvailable = false;
        frontendLogger.warn(
          'IndexedDB not available, falling back to localStorage'
        );
        return;
      }

      // Open IndexedDB database
      await this.openDatabase();

      // Initialize metadata
      await this.initializeMetadata();
    } catch (error) {
      frontendLogger.error('Failed to initialize storage', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      this.isIndexedDBAvailable = false;
      // Fallback to localStorage will be used (encryption key should already be initialized)
    }
  }

  /**
   * Check if IndexedDB is supported
   */
  private isIndexedDBSupported(): boolean {
    try {
      return 'indexedDB' in window && window.indexedDB !== null;
    } catch {
      return false;
    }
  }

  /**
   * Initialize encryption key
   */
  private async initializeEncryption(): Promise<void> {
    try {
      const sessionId = this.sessionManager.getSessionId();
      if (!sessionId) {
        throw new Error('No active session for encryption key generation');
      }

      this.keyId = `key_${sessionId}`;

      // Try to load existing key from sessionStorage
      const storedKey = sessionStorage.getItem(`encryption_key_${this.keyId}`);

      if (storedKey !== null) {
        // Import existing key
        const keyData: unknown = JSON.parse(storedKey);
        if (!Array.isArray(keyData)) {
          throw new Error('Invalid stored key format');
        }
        this.encryptionKey = await crypto.subtle.importKey(
          'raw',
          new Uint8Array(keyData as number[]),
          { name: ENCRYPTION_ALGORITHM },
          false,
          ['encrypt', 'decrypt']
        );
      } else {
        // Generate new key
        this.encryptionKey = await crypto.subtle.generateKey(
          {
            name: ENCRYPTION_ALGORITHM,
            length: KEY_LENGTH,
          },
          true,
          ['encrypt', 'decrypt']
        );

        // Export and store key
        const exportedKey = await crypto.subtle.exportKey(
          'raw',
          this.encryptionKey
        );
        sessionStorage.setItem(
          `encryption_key_${this.keyId}`,
          JSON.stringify(Array.from(new Uint8Array(exportedKey)))
        );
      }
    } catch (error) {
      frontendLogger.error('Failed to initialize encryption', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw new Error('Encryption initialization failed');
    }
  }

  /**
   * Open IndexedDB database
   */
  private async openDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (): void => {
        reject(new Error(`Failed to open database: ${request.error?.message}`));
      };

      request.onsuccess = (): void => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event): void => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create conversations store
        if (!db.objectStoreNames.contains(CONVERSATIONS_STORE)) {
          const conversationsStore = db.createObjectStore(CONVERSATIONS_STORE, {
            keyPath: 'id',
          });
          conversationsStore.createIndex('sessionId', 'sessionId', {
            unique: false,
          });
          conversationsStore.createIndex('createdAt', 'createdAt', {
            unique: false,
          });
          conversationsStore.createIndex('updatedAt', 'updatedAt', {
            unique: false,
          });
        }

        // Create messages store
        if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
          const messagesStore = db.createObjectStore(MESSAGES_STORE, {
            keyPath: 'id',
          });
          messagesStore.createIndex('conversationId', 'conversationId', {
            unique: false,
          });
          messagesStore.createIndex('timestamp', 'timestamp', {
            unique: false,
          });
        }

        // Create metadata store
        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          db.createObjectStore(METADATA_STORE, { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Initialize storage metadata
   */
  private async initializeMetadata(): Promise<void> {
    if (!this.db || !this.keyId) {
      return;
    }

    const sessionId = this.sessionManager.getSessionId();
    if (!sessionId) {
      return;
    }

    try {
      const transaction = this.db.transaction([METADATA_STORE], 'readwrite');
      const store = transaction.objectStore(METADATA_STORE);

      const metadata: StorageMetadata = {
        version: DB_VERSION,
        sessionId,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        encryptionKeyId: this.keyId,
        totalSize: 0,
        conversationCount: 0,
      };

      await this.promisifyRequest(store.put({ key: 'metadata', ...metadata }));
    } catch (error) {
      frontendLogger.error('Failed to initialize metadata', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * Encrypt data using Web Crypto API
   */
  private async encryptData(data: string): Promise<EncryptedData> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    try {
      // Compress data if it's large enough
      const shouldCompress = data.length > COMPRESSION_THRESHOLD;
      let processedData = data;

      if (shouldCompress === true) {
        processedData = await this.compressData(data);
      }

      // Generate random IV
      const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

      // Encrypt data
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(processedData);

      const encryptedData = await crypto.subtle.encrypt(
        {
          name: ENCRYPTION_ALGORITHM,
          iv: iv,
        },
        this.encryptionKey,
        encodedData
      );

      return {
        data: encryptedData,
        iv: iv.buffer,
        compressed: shouldCompress,
        timestamp: Date.now(),
      };
    } catch (error) {
      frontendLogger.error('Encryption failed', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Serialize EncryptedData for storage (convert ArrayBuffers to arrays)
   */
  private serializeEncryptedData(encryptedData: EncryptedData): unknown {
    return {
      data: Array.from(new Uint8Array(encryptedData.data)),
      iv: Array.from(new Uint8Array(encryptedData.iv)),
      compressed: encryptedData.compressed,
      timestamp: encryptedData.timestamp,
    };
  }

  /**
   * Deserialize EncryptedData from storage (convert arrays back to ArrayBuffers)
   */
  private deserializeEncryptedData(serialized: {
    data: number[];
    iv: number[];
    compressed: boolean;
    timestamp: number;
  }): EncryptedData {
    return {
      data: new Uint8Array(serialized.data).buffer,
      iv: new Uint8Array(serialized.iv).buffer,
      compressed: serialized.compressed,
      timestamp: serialized.timestamp,
    };
  }

  /**
   * Decrypt data using Web Crypto API
   */
  private async decryptData(encryptedData: EncryptedData): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    try {
      // Decrypt data
      const decryptedData = await crypto.subtle.decrypt(
        {
          name: ENCRYPTION_ALGORITHM,
          iv: encryptedData.iv,
        },
        this.encryptionKey,
        encryptedData.data
      );

      // Decode decrypted data
      const decoder = new TextDecoder();
      let processedData = decoder.decode(decryptedData);

      // Decompress if needed
      if (encryptedData.compressed) {
        processedData = await this.decompressData(processedData);
      }

      return processedData;
    } catch (error) {
      frontendLogger.error('Decryption failed', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Compress data using built-in compression
   */
  private async compressData(data: string): Promise<string> {
    try {
      // Use CompressionStream if available (modern browsers)
      if ('CompressionStream' in window) {
        const stream = new CompressionStream('gzip');
        const writer = stream.writable.getWriter();
        const reader = stream.readable.getReader();

        const encoder = new TextEncoder();
        const chunks: Uint8Array[] = [];

        // Start compression
        const writePromise = writer
          .write(encoder.encode(data))
          .then(() => writer.close());

        // Read compressed chunks
        const readPromise = (async (): Promise<void> => {
          let result;
          while (!(result = await reader.read()).done) {
            chunks.push(result.value);
          }
        })();

        await Promise.all([writePromise, readPromise]);

        // Combine chunks and encode as base64
        const totalLength = chunks.reduce(
          (sum, chunk) => sum + chunk.length,
          0
        );
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }

        return btoa(String.fromCharCode(...combined));
      } else {
        // Fallback: simple string compression using LZ-like algorithm
        return this.simpleCompress(data);
      }
    } catch (error) {
      frontendLogger.warn('Compression failed, using uncompressed data', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return data;
    }
  }

  /**
   * Decompress data
   */
  private async decompressData(compressedData: string): Promise<string> {
    try {
      // Use DecompressionStream if available
      if ('DecompressionStream' in window) {
        const stream = new DecompressionStream('gzip');
        const writer = stream.writable.getWriter();
        const reader = stream.readable.getReader();

        // Convert base64 to Uint8Array
        const binaryString = atob(compressedData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const chunks: Uint8Array[] = [];

        // Start decompression
        const writePromise = writer.write(bytes).then(() => writer.close());

        // Read decompressed chunks
        const readPromise = (async (): Promise<void> => {
          let result;
          while (!(result = await reader.read()).done) {
            chunks.push(result.value);
          }
        })();

        await Promise.all([writePromise, readPromise]);

        // Combine chunks and decode
        const totalLength = chunks.reduce(
          (sum, chunk) => sum + chunk.length,
          0
        );
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }

        const decoder = new TextDecoder();
        return decoder.decode(combined);
      } else {
        // Fallback: simple decompression
        return this.simpleDecompress(compressedData);
      }
    } catch (error) {
      frontendLogger.warn('Decompression failed, treating as uncompressed', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return compressedData;
    }
  }

  /**
   * Simple compression fallback for older browsers
   */
  private simpleCompress(data: string): string {
    // Simple run-length encoding for repeated characters
    return data.replace(/(.)\1{2,}/g, (match, char) => {
      return `${char}${match.length}${char}`;
    });
  }

  /**
   * Simple decompression fallback
   */
  private simpleDecompress(data: string): string {
    // Reverse simple run-length encoding
    return data.replace(/(.)\d+\1/g, (match, char) => {
      const count = parseInt(match.slice(1, -1), 10);
      return char.repeat(count);
    });
  }

  /**
   * Convert IDBRequest to Promise
   */
  private promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = (): void => resolve(request.result);
      request.onerror = (): void => reject(request.error);
    });
  }

  /**
   * Store conversation in IndexedDB or localStorage fallback
   */
  public async storeConversation(conversation: Conversation): Promise<void> {
    if (this.isIndexedDBAvailable && this.db) {
      await this.storeConversationIndexedDB(conversation);
    } else {
      await this.storeConversationLocalStorage(conversation);
    }
  }

  /**
   * Store conversation in IndexedDB
   */
  private async storeConversationIndexedDB(
    conversation: Conversation
  ): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // Validate session access
      if (
        !this.sessionManager.validateConversationAccess(conversation.sessionId)
      ) {
        throw new Error('Invalid session access to conversation');
      }

      // Separate messages from conversation for efficient storage
      const { messages, ...conversationData } = conversation;

      // Encrypt conversation data
      const encryptedConversation = await this.encryptData(
        JSON.stringify(conversationData)
      );

      // Store conversation
      const transaction = this.db.transaction(
        [CONVERSATIONS_STORE, MESSAGES_STORE],
        'readwrite'
      );
      const conversationStore = transaction.objectStore(CONVERSATIONS_STORE);
      const messageStore = transaction.objectStore(MESSAGES_STORE);

      await this.promisifyRequest(
        conversationStore.put({
          id: conversation.id,
          sessionId: conversation.sessionId,
          createdAt: conversation.createdAt.getTime(),
          updatedAt: conversation.updatedAt.getTime(),
          encryptedData: encryptedConversation,
        })
      );

      // Store messages separately for efficient querying
      for (const message of messages) {
        const encryptedMessage = await this.encryptData(
          JSON.stringify(message)
        );
        await this.promisifyRequest(
          messageStore.put({
            id: message.id,
            conversationId: conversation.id,
            timestamp: message.timestamp.getTime(),
            encryptedData: encryptedMessage,
          })
        );
      }

      // Update metadata
      await this.updateStorageMetadata();
    } catch (error) {
      frontendLogger.error('Failed to store conversation in IndexedDB', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw new Error('Failed to store conversation');
    }
  }

  /**
   * Store conversation in localStorage fallback
   */
  private async storeConversationLocalStorage(
    conversation: Conversation
  ): Promise<void> {
    try {
      const sessionPrefix = this.sessionManager.getSessionStoragePrefix();
      const key = `${sessionPrefix}_conversation_${conversation.id}`;

      // Encrypt conversation data
      const encryptedData = await this.encryptData(
        JSON.stringify(conversation)
      );

      localStorage.setItem(
        key,
        JSON.stringify({
          id: conversation.id,
          sessionId: conversation.sessionId,
          createdAt: conversation.createdAt.getTime(),
          updatedAt: conversation.updatedAt.getTime(),
          encryptedData: this.serializeEncryptedData(encryptedData),
        })
      );
    } catch (error) {
      frontendLogger.error('Failed to store conversation in localStorage', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw new Error('Failed to store conversation');
    }
  }

  /**
   * Retrieve conversation from storage
   */
  public async getConversation(
    conversationId: string
  ): Promise<Conversation | null> {
    if (this.isIndexedDBAvailable && this.db) {
      return await this.getConversationIndexedDB(conversationId);
    } else {
      return await this.getConversationLocalStorage(conversationId);
    }
  }

  /**
   * Retrieve conversation from IndexedDB
   */
  private async getConversationIndexedDB(
    conversationId: string
  ): Promise<Conversation | null> {
    if (!this.db) {
      return null;
    }

    try {
      const transaction = this.db.transaction(
        [CONVERSATIONS_STORE, MESSAGES_STORE],
        'readonly'
      );
      const conversationStore = transaction.objectStore(CONVERSATIONS_STORE);
      const messageStore = transaction.objectStore(MESSAGES_STORE);

      // Get conversation data
      const conversationResult = await this.promisifyRequest(
        conversationStore.get(conversationId)
      );
      if (!conversationResult) {
        return null;
      }

      // Validate session access
      if (
        !this.sessionManager.validateConversationAccess(
          conversationResult.sessionId
        )
      ) {
        return null;
      }

      // Decrypt conversation data
      const conversationData = JSON.parse(
        await this.decryptData(conversationResult.encryptedData)
      );

      // Get messages
      const messageIndex = messageStore.index('conversationId');
      const messageResults = await this.promisifyRequest(
        messageIndex.getAll(conversationId)
      );

      const messages: Message[] = [];
      for (const messageResult of messageResults) {
        const messageData = JSON.parse(
          await this.decryptData(messageResult.encryptedData)
        );
        messages.push({
          ...messageData,
          timestamp: new Date(messageData.timestamp),
        });
      }

      // Sort messages by timestamp
      messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      return {
        ...conversationData,
        messages,
        createdAt: new Date(conversationData.createdAt),
        updatedAt: new Date(conversationData.updatedAt),
      };
    } catch (error) {
      frontendLogger.error('Failed to get conversation from IndexedDB', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return null;
    }
  }

  /**
   * Retrieve conversation from localStorage
   */
  private async getConversationLocalStorage(
    conversationId: string
  ): Promise<Conversation | null> {
    try {
      const sessionPrefix = this.sessionManager.getSessionStoragePrefix();
      const key = `${sessionPrefix}_conversation_${conversationId}`;

      const stored = localStorage.getItem(key);
      if (!stored) {
        return null;
      }

      const storedData = JSON.parse(stored);

      // Validate session access
      if (
        !this.sessionManager.validateConversationAccess(storedData.sessionId)
      ) {
        return null;
      }

      // Decrypt conversation data
      const encryptedData = this.deserializeEncryptedData(storedData.encryptedData);
      const conversationData = JSON.parse(
        await this.decryptData(encryptedData)
      );

      return {
        ...conversationData,
        createdAt: new Date(conversationData.createdAt),
        updatedAt: new Date(conversationData.updatedAt),
        messages: conversationData.messages.map((msg: Omit<Message, 'timestamp'> & { timestamp: string | Date }) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        })),
      };
    } catch (error) {
      frontendLogger.error('Failed to get conversation from localStorage', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return null;
    }
  }

  /**
   * Get all conversations for current session
   */
  public async getAllConversations(): Promise<Conversation[]> {
    if (this.isIndexedDBAvailable && this.db) {
      return await this.getAllConversationsIndexedDB();
    } else {
      return await this.getAllConversationsLocalStorage();
    }
  }

  /**
   * Get all conversations from IndexedDB
   */
  private async getAllConversationsIndexedDB(): Promise<Conversation[]> {
    if (!this.db) {
      return [];
    }

    try {
      const sessionId = this.sessionManager.getSessionId();
      if (!sessionId) {
        return [];
      }

      const transaction = this.db.transaction(
        [CONVERSATIONS_STORE],
        'readonly'
      );
      const store = transaction.objectStore(CONVERSATIONS_STORE);
      const index = store.index('sessionId');

      const results = await this.promisifyRequest(index.getAll(sessionId));
      const conversations: Conversation[] = [];

      for (const result of results) {
        try {
          const _conversationData = JSON.parse(
            await this.decryptData(result.encryptedData)
          );

          // Get messages for this conversation
          const conversation = await this.getConversationIndexedDB(result.id);
          if (conversation) {
            conversations.push(conversation);
          }
        } catch (error) {
          frontendLogger.error('Failed to decrypt conversation', {
            metadata: { conversationId: result.id },
            error: error instanceof Error ? error : new Error(String(error)),
          });
          // Skip corrupted conversations
        }
      }

      // Sort by updatedAt descending
      conversations.sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
      );

      return conversations;
    } catch (error) {
      frontendLogger.error('Failed to get all conversations from IndexedDB', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return [];
    }
  }

  /**
   * Get all conversations from localStorage
   */
  private async getAllConversationsLocalStorage(): Promise<Conversation[]> {
    try {
      const sessionPrefix = this.sessionManager.getSessionStoragePrefix();
      const conversations: Conversation[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key !== null && key.startsWith(`${sessionPrefix}_conversation_`)) {
          const stored = localStorage.getItem(key);
          if (stored) {
            try {
              const storedData = JSON.parse(stored);
              const encryptedData = this.deserializeEncryptedData(storedData.encryptedData);
              const conversationData = JSON.parse(
                await this.decryptData(encryptedData)
              );

              conversations.push({
                ...conversationData,
                createdAt: new Date(conversationData.createdAt),
                updatedAt: new Date(conversationData.updatedAt),
                messages: conversationData.messages.map((msg: Omit<Message, 'timestamp'> & { timestamp: string | Date }) => ({
                  ...msg,
                  timestamp: new Date(msg.timestamp),
                })),
              });
            } catch (error) {
              frontendLogger.error('Failed to decrypt conversation from key', {
                metadata: { key },
                error:
                  error instanceof Error ? error : new Error(String(error)),
              });
              // Skip corrupted conversations
            }
          }
        }
      }

      // Sort by updatedAt descending
      conversations.sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
      );

      return conversations;
    } catch (error) {
      frontendLogger.error(
        'Failed to get all conversations from localStorage',
        { error: error instanceof Error ? error : new Error(String(error)) }
      );
      return [];
    }
  }

  /**
   * Update conversation title atomically with validation
   * 
   * Requirements: 1.1, 1.3, 1.5
   * - Validates title length (1-200 characters)
   * - Sanitizes input to prevent XSS attacks
   * - Uses IndexedDB transaction for atomicity
   * - Handles both IndexedDB and localStorage backends
   * - Leverages existing encryption before storage
   * 
   * @param conversationId - ID of the conversation to update
   * @param newTitle - New title for the conversation
   * @throws {Error} If validation fails or storage operation fails
   */
  public async updateConversationTitle(
    conversationId: string,
    newTitle: string
  ): Promise<void> {
    const correlationId = crypto.randomUUID();
    
    // Log operation start
    frontendLogger.info('Starting title update', {
      metadata: {
        correlationId,
        conversationId,
        titleLength: newTitle.length,
        backend: this.isIndexedDBAvailable ? 'indexeddb' : 'localstorage',
      },
    });

    // Measure operation with performance metrics
    return await measureAsync(
      OperationType.TITLE_UPDATE,
      async () => {
        // Validate title length (Requirement 1.1)
        if (newTitle.length < 1 || newTitle.length > 200) {
          throw new Error('Title must be between 1 and 200 characters');
        }

        // Sanitize title to prevent XSS attacks (Requirement 1.1)
        const sanitizedTitle = this.sanitizeTitle(newTitle);

        if (this.isIndexedDBAvailable && this.db) {
          await this.updateConversationTitleIndexedDB(conversationId, sanitizedTitle, correlationId);
        } else {
          await this.updateConversationTitleLocalStorage(conversationId, sanitizedTitle, correlationId);
        }

        // Log success
        frontendLogger.info('Title update completed successfully', {
          metadata: {
            correlationId,
            conversationId,
            sanitizedTitleLength: sanitizedTitle.length,
          },
        });
      },
      { correlationId, conversationId }
    );
  }

  /**
   * Sanitize title to prevent XSS attacks
   * Removes HTML tags and dangerous characters
   * 
   * @param title - Title to sanitize
   * @returns Sanitized title
   */
  private sanitizeTitle(title: string): string {
    // Remove script tags and their content
    let sanitized = title.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    // Remove style tags and their content
    sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    
    // Remove all remaining HTML tags
    sanitized = sanitized.replace(/<[^>]*>/g, '');
    
    // Remove script-related content
    sanitized = sanitized.replace(/javascript:/gi, '');
    sanitized = sanitized.replace(/on\w+\s*=/gi, '');
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    // Replace multiple spaces with single space
    sanitized = sanitized.replace(/\s+/g, ' ');
    
    return sanitized;
  }

  /**
   * Update conversation title in IndexedDB using atomic transaction
   * 
   * @param conversationId - ID of the conversation to update
   * @param sanitizedTitle - Sanitized title
   * @param correlationId - Correlation ID for logging
   */
  private async updateConversationTitleIndexedDB(
    conversationId: string,
    sanitizedTitle: string,
    correlationId: string
  ): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // Start atomic transaction (Requirement 1.3)
      const transaction = this.db.transaction(
        [CONVERSATIONS_STORE],
        'readwrite'
      );
      const store = transaction.objectStore(CONVERSATIONS_STORE);

      // Get existing conversation
      const existingRecord = await this.promisifyRequest(
        store.get(conversationId)
      );

      if (!existingRecord) {
        throw new Error('Conversation not found');
      }

      // Validate session access
      if (
        !this.sessionManager.validateConversationAccess(existingRecord.sessionId)
      ) {
        throw new Error('Invalid session access to conversation');
      }

      // Decrypt existing conversation data
      const conversationData = JSON.parse(
        await this.decryptData(existingRecord.encryptedData)
      );

      // Update title and timestamp
      conversationData.title = sanitizedTitle;
      conversationData.updatedAt = Date.now();

      // Re-encrypt conversation data (Requirement 1.1 - leverage existing encryption)
      const encryptedConversation = await this.encryptData(
        JSON.stringify(conversationData)
      );

      // Update conversation in store atomically
      await this.promisifyRequest(
        store.put({
          id: conversationId,
          sessionId: existingRecord.sessionId,
          createdAt: existingRecord.createdAt,
          updatedAt: conversationData.updatedAt,
          encryptedData: encryptedConversation,
        })
      );

      // Update metadata
      await this.updateStorageMetadata();

      frontendLogger.info('Conversation title updated in IndexedDB', {
        metadata: {
          correlationId,
          conversationId,
          titleLength: sanitizedTitle.length,
        },
      });
    } catch (error) {
      frontendLogger.error('Failed to update conversation title in IndexedDB', {
        metadata: { correlationId, conversationId },
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw new Error('Failed to update conversation title');
    }
  }

  /**
   * Update conversation title in localStorage
   * 
   * @param conversationId - ID of the conversation to update
   * @param sanitizedTitle - Sanitized title
   * @param correlationId - Correlation ID for logging
   */
  private async updateConversationTitleLocalStorage(
    conversationId: string,
    sanitizedTitle: string,
    correlationId: string
  ): Promise<void> {
    try {
      const sessionPrefix = this.sessionManager.getSessionStoragePrefix();
      const key = `${sessionPrefix}_conversation_${conversationId}`;

      const stored = localStorage.getItem(key);
      if (!stored) {
        throw new Error('Conversation not found');
      }

      const storedData = JSON.parse(stored);

      // Validate session access
      if (
        !this.sessionManager.validateConversationAccess(storedData.sessionId)
      ) {
        throw new Error('Invalid session access to conversation');
      }

      // Decrypt existing conversation data
      const decryptedEncryptedData = this.deserializeEncryptedData(storedData.encryptedData);
      const conversationData = JSON.parse(
        await this.decryptData(decryptedEncryptedData)
      );

      // Update title and timestamp
      conversationData.title = sanitizedTitle;
      conversationData.updatedAt = Date.now();

      // Re-encrypt conversation data
      const newEncryptedData = await this.encryptData(
        JSON.stringify(conversationData)
      );

      // Update in localStorage
      localStorage.setItem(
        key,
        JSON.stringify({
          id: conversationId,
          sessionId: storedData.sessionId,
          createdAt: storedData.createdAt,
          updatedAt: conversationData.updatedAt,
          encryptedData: this.serializeEncryptedData(newEncryptedData),
        })
      );

      frontendLogger.info('Conversation title updated in localStorage', {
        metadata: {
          correlationId,
          conversationId,
          titleLength: sanitizedTitle.length,
        },
      });
    } catch (error) {
      frontendLogger.error('Failed to update conversation title in localStorage', {
        metadata: { correlationId, conversationId },
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw new Error('Failed to update conversation title');
    }
  }

  /**
   * Delete conversation from storage with complete cleanup tracking
   * 
   * Requirements: 2.1, 2.2, 2.3, 2.4
   * - Removes conversation record from storage within 500ms
   * - Removes all associated message data
   * - Removes all associated metadata
   * - Returns detailed statistics (messagesRemoved, bytesFreed)
   * - Logs deletion operations with conversation ID and timestamp
   * 
   * @param conversationId - ID of the conversation to delete
   * @returns DeleteResult with detailed cleanup statistics
   */
  public async deleteConversation(conversationId: string): Promise<DeleteResult> {
    const correlationId = crypto.randomUUID();
    
    // Log operation start
    frontendLogger.info('Starting conversation deletion', {
      metadata: {
        correlationId,
        conversationId,
        backend: this.isIndexedDBAvailable ? 'indexeddb' : 'localstorage',
      },
    });

    // Measure operation with performance metrics
    return await measureAsync(
      OperationType.DELETION,
      async () => {
        const result = this.isIndexedDBAvailable && this.db
          ? await this.deleteConversationIndexedDB(conversationId, correlationId)
          : await this.deleteConversationLocalStorage(conversationId, correlationId);

        // Log result
        if (result.success) {
          frontendLogger.info('Conversation deletion completed successfully', {
            metadata: {
              correlationId,
              conversationId,
              messagesRemoved: result.messagesRemoved,
              bytesFreed: result.bytesFreed,
            },
          });
        } else {
          frontendLogger.error('Conversation deletion failed', {
            metadata: {
              correlationId,
              conversationId,
              error: result.error,
            },
          });
        }

        return result;
      },
      { correlationId, conversationId }
    );
  }

  /**
   * Delete conversation from IndexedDB with complete cleanup tracking
   * 
   * Requirements: 2.1, 2.2, 2.3, 2.4
   * 
   * @param conversationId - ID of the conversation to delete
   * @param correlationId - Correlation ID for logging
   * @returns DeleteResult with detailed cleanup statistics
   */
  private async deleteConversationIndexedDB(
    conversationId: string,
    correlationId: string
  ): Promise<DeleteResult> {
    if (!this.db) {
      return {
        success: false,
        conversationRemoved: false,
        messagesRemoved: 0,
        metadataRemoved: false,
        bytesFreed: 0,
        error: 'Database not initialized',
      };
    }

    const startTime = Date.now();
    let conversationRemoved = false;
    let messagesRemoved = 0;
    let metadataRemoved = false;
    let bytesFreed = 0;

    try {
      // Get conversation data before deletion to calculate size (Requirement 2.4)
      const conversation = await this.getConversationIndexedDB(conversationId);
      
      if (!conversation) {
        // Conversation doesn't exist
        return {
          success: false,
          conversationRemoved: false,
          messagesRemoved: 0,
          metadataRemoved: false,
          bytesFreed: 0,
          error: 'Conversation not found',
        };
      }

      bytesFreed = this.estimateConversationSize(conversation);

      const transaction = this.db.transaction(
        [CONVERSATIONS_STORE, MESSAGES_STORE, METADATA_STORE],
        'readwrite'
      );
      const conversationStore = transaction.objectStore(CONVERSATIONS_STORE);
      const messageStore = transaction.objectStore(MESSAGES_STORE);

      // Delete all messages for this conversation (Requirement 2.2)
      const messageIndex = messageStore.index('conversationId');
      const messageResults = await this.promisifyRequest(
        messageIndex.getAll(conversationId)
      );

      for (const messageResult of messageResults) {
        await this.promisifyRequest(messageStore.delete(messageResult.id));
        messagesRemoved++;
      }

      // Delete conversation record (Requirement 2.1)
      await this.promisifyRequest(conversationStore.delete(conversationId));
      conversationRemoved = true;

      // Update metadata - this removes conversation from metadata counts (Requirement 2.3)
      await this.updateStorageMetadata();
      metadataRemoved = true;

      const duration = Date.now() - startTime;

      // Log deletion operation with conversation ID and timestamp (Requirement 2.5)
      frontendLogger.info('Conversation deleted from IndexedDB', {
        metadata: {
          correlationId,
          conversationId,
          messagesRemoved,
          bytesFreed,
          duration,
          timestamp: new Date().toISOString(),
        },
      });

      return {
        success: true,
        conversationRemoved,
        messagesRemoved,
        metadataRemoved,
        bytesFreed,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Log deletion failure (Requirement 2.5)
      frontendLogger.error('Failed to delete conversation from IndexedDB', {
        metadata: {
          correlationId,
          conversationId,
          timestamp: new Date().toISOString(),
        },
        error: error instanceof Error ? error : new Error(String(error)),
      });

      return {
        success: false,
        conversationRemoved,
        messagesRemoved,
        metadataRemoved,
        bytesFreed,
        error: errorMessage,
      };
    }
  }

  /**
   * Delete conversation from localStorage with complete cleanup tracking
   * 
   * Requirements: 2.1, 2.2, 2.3, 2.4
   * 
   * @param conversationId - ID of the conversation to delete
   * @returns DeleteResult with detailed cleanup statistics
   */
  private async deleteConversationLocalStorage(
    conversationId: string,
    correlationId: string
  ): Promise<DeleteResult> {
    const startTime = Date.now();
    let conversationRemoved = false;
    let messagesRemoved = 0;
    const metadataRemoved = true; // localStorage doesn't have separate metadata store
    let bytesFreed = 0;

    try {
      const sessionPrefix = this.sessionManager.getSessionStoragePrefix();
      const key = `${sessionPrefix}_conversation_${conversationId}`;

      // Get conversation data before deletion to calculate size and message count (Requirement 2.4)
      const conversation = await this.getConversationLocalStorage(conversationId);
      
      if (!conversation) {
        // Conversation doesn't exist
        return {
          success: false,
          conversationRemoved: false,
          messagesRemoved: 0,
          metadataRemoved: false,
          bytesFreed: 0,
          error: 'Conversation not found',
        };
      }

      bytesFreed = this.estimateConversationSize(conversation);
      messagesRemoved = conversation.messages.length; // All messages are stored with conversation in localStorage (Requirement 2.2)

      // Delete conversation (includes all messages in localStorage) (Requirement 2.1, 2.2)
      localStorage.removeItem(key);
      conversationRemoved = true;

      const duration = Date.now() - startTime;

      // Log deletion operation with conversation ID and timestamp (Requirement 2.5)
      frontendLogger.info('Conversation deleted from localStorage', {
        metadata: {
          correlationId,
          conversationId,
          messagesRemoved,
          bytesFreed,
          duration,
          timestamp: new Date().toISOString(),
        },
      });

      return {
        success: true,
        conversationRemoved,
        messagesRemoved,
        metadataRemoved,
        bytesFreed,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Log deletion failure (Requirement 2.5)
      frontendLogger.error('Failed to delete conversation from localStorage', {
        metadata: {
          correlationId,
          conversationId,
          timestamp: new Date().toISOString(),
        },
        error: error instanceof Error ? error : new Error(String(error)),
      });

      return {
        success: false,
        conversationRemoved,
        messagesRemoved,
        metadataRemoved,
        bytesFreed,
        error: errorMessage,
      };
    }
  }

  /**
   * Update storage metadata
   */
  private async updateStorageMetadata(): Promise<void> {
    if (!this.db || !this.keyId) {
      return;
    }

    try {
      const sessionId = this.sessionManager.getSessionId();
      if (!sessionId) {
        return;
      }

      // Calculate storage statistics
      const stats = await this.getStorageStats();

      const transaction = this.db.transaction([METADATA_STORE], 'readwrite');
      const store = transaction.objectStore(METADATA_STORE);

      const metadata: StorageMetadata = {
        version: DB_VERSION,
        sessionId,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        encryptionKeyId: this.keyId,
        totalSize: stats.totalSize,
        conversationCount: stats.conversationCount,
      };

      await this.promisifyRequest(store.put({ key: 'metadata', ...metadata }));
    } catch (error) {
      frontendLogger.error('Failed to update storage metadata', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * Get storage quota information
   */
  public async getStorageQuota(): Promise<StorageQuota> {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const used = estimate.usage ?? 0;
        const quota = estimate.quota ?? 0;

        return {
          used,
          quota,
          percentage: quota > 0 ? (used / quota) * 100 : 0,
          available: Math.max(0, quota - used),
        };
      } else {
        // Fallback estimation for older browsers
        const used = this.estimateLocalStorageUsage();
        const quota = 5 * 1024 * 1024; // Estimate 5MB for localStorage

        return {
          used,
          quota,
          percentage: (used / quota) * 100,
          available: Math.max(0, quota - used),
        };
      }
    } catch (error) {
      frontendLogger.error('Failed to get storage quota', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return {
        used: 0,
        quota: 0,
        percentage: 0,
        available: 0,
      };
    }
  }

  /**
   * Estimate localStorage usage
   */
  private estimateLocalStorageUsage(): number {
    try {
      let totalSize = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          totalSize += key.length + (value?.length ?? 0);
        }
      }
      return totalSize;
    } catch {
      return 0;
    }
  }

  /**
   * Get storage statistics
   */
  public async getStorageStats(): Promise<StorageStats> {
    try {
      const conversations = await this.getAllConversations();
      const quota = await this.getStorageQuota();

      let messageCount = 0;
      let oldestDate: Date | undefined;
      let newestDate: Date | undefined;

      for (const conversation of conversations) {
        messageCount += conversation.messages.length;

        if (!oldestDate || conversation.createdAt < oldestDate) {
          oldestDate = conversation.createdAt;
        }

        if (!newestDate || conversation.updatedAt > newestDate) {
          newestDate = conversation.updatedAt;
        }
      }

      return {
        conversationCount: conversations.length,
        messageCount,
        totalSize: quota.used,
        oldestConversation: oldestDate,
        newestConversation: newestDate,
        quota,
      };
    } catch (error) {
      frontendLogger.error('Failed to get storage stats', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      const quota = await this.getStorageQuota();
      return {
        conversationCount: 0,
        messageCount: 0,
        totalSize: 0,
        quota,
      };
    }
  }

  /**
   * Check if storage cleanup is needed
   */
  public async isCleanupNeeded(): Promise<boolean> {
    const quota = await this.getStorageQuota();
    return quota.percentage >= QUOTA_WARNING_THRESHOLD * 100;
  }

  /**
   * Perform storage cleanup
   */
  public async performCleanup(): Promise<CleanupResult> {
    try {
      const conversations = await this.getAllConversations();

      if (conversations.length === 0) {
        return {
          conversationsRemoved: 0,
          messagesRemoved: 0,
          bytesFreed: 0,
          success: true,
        };
      }

      // Sort by last updated (oldest first)
      const sortedConversations = conversations.sort(
        (a, b) => a.updatedAt.getTime() - b.updatedAt.getTime()
      );

      // Calculate how many conversations to remove
      const quota = await this.getStorageQuota();
      const targetPercentage = QUOTA_WARNING_THRESHOLD * 0.8; // Clean to 64% (80% of 80%)
      const targetUsage = quota.quota * targetPercentage;
      const bytesToFree = quota.used - targetUsage;

      let conversationsRemoved = 0;
      let messagesRemoved = 0;
      let bytesFreed = 0;

      // Remove oldest conversations until we free enough space
      for (const conversation of sortedConversations) {
        if (
          bytesFreed >= bytesToFree &&
          conversationsRemoved >= CLEANUP_BATCH_SIZE
        ) {
          break;
        }

        try {
          // Delete conversation and get detailed statistics
          const deleteResult = await this.deleteConversation(conversation.id);

          if (deleteResult.success) {
            conversationsRemoved++;
            messagesRemoved += deleteResult.messagesRemoved;
            bytesFreed += deleteResult.bytesFreed;
          } else {
            frontendLogger.error('Failed to delete conversation during cleanup', {
              metadata: { conversationId: conversation.id, error: deleteResult.error },
            });
          }
        } catch (error) {
          frontendLogger.error('Failed to delete conversation during cleanup', {
            metadata: { conversationId: conversation.id },
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }

      return {
        conversationsRemoved,
        messagesRemoved,
        bytesFreed,
        success: true,
      };
    } catch (error) {
      frontendLogger.error('Storage cleanup failed', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return {
        conversationsRemoved: 0,
        messagesRemoved: 0,
        bytesFreed: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Estimate conversation size in bytes
   */
  private estimateConversationSize(conversation: Conversation): number {
    try {
      const jsonString = JSON.stringify(conversation);
      return new Blob([jsonString]).size;
    } catch {
      // Fallback estimation
      return conversation.messages.length * 1000; // Rough estimate: 1KB per message
    }
  }

  /**
   * Clear all storage data for current session
   */
  public async clearAllData(): Promise<void> {
    try {
      if (this.isIndexedDBAvailable && this.db) {
        await this.clearAllDataIndexedDB();
      } else {
        this.clearAllDataLocalStorage();
      }
    } catch (error) {
      frontendLogger.error('Failed to clear all data', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw new Error('Failed to clear storage data');
    }
  }

  /**
   * Clear all data from IndexedDB
   */
  private async clearAllDataIndexedDB(): Promise<void> {
    if (!this.db) {
      return;
    }

    const sessionId = this.sessionManager.getSessionId();
    if (!sessionId) {
      return;
    }

    const transaction = this.db.transaction(
      [CONVERSATIONS_STORE, MESSAGES_STORE],
      'readwrite'
    );
    const conversationStore = transaction.objectStore(CONVERSATIONS_STORE);
    const messageStore = transaction.objectStore(MESSAGES_STORE);

    // Get all conversations for current session
    const conversationIndex = conversationStore.index('sessionId');
    const conversations = await this.promisifyRequest(
      conversationIndex.getAll(sessionId)
    );

    // Delete all conversations and their messages
    for (const conversation of conversations) {
      await this.promisifyRequest(conversationStore.delete(conversation.id));

      // Delete messages for this conversation
      const messageIndex = messageStore.index('conversationId');
      const messages = await this.promisifyRequest(
        messageIndex.getAll(conversation.id)
      );

      for (const message of messages) {
        await this.promisifyRequest(messageStore.delete(message.id));
      }
    }

    // Update metadata
    await this.updateStorageMetadata();
  }

  /**
   * Clear all data from localStorage
   */
  private clearAllDataLocalStorage(): void {
    const sessionPrefix = this.sessionManager.getSessionStoragePrefix();
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`${sessionPrefix}_conversation_`)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));
  }

  /**
   * Export all conversation data
   */
  public async exportData(): Promise<string> {
    try {
      const conversations = await this.getAllConversations();
      const stats = await this.getStorageStats();

      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        sessionId: this.sessionManager.getSessionId(),
        statistics: stats,
        conversations: conversations.map((conv) => ({
          ...conv,
          createdAt: conv.createdAt.toISOString(),
          updatedAt: conv.updatedAt.toISOString(),
          messages: conv.messages.map((msg) => ({
            ...msg,
            timestamp: msg.timestamp.toISOString(),
          })),
        })),
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      frontendLogger.error('Failed to export data', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw new Error('Failed to export conversation data');
    }
  }

  /**
   * Get storage backend type
   * Used by search service to determine search strategy
   */
  public getStorageBackend(): 'indexeddb' | 'localstorage' | null {
    if (this.isIndexedDBAvailable && this.db !== null) {
      return 'indexeddb';
    } else if (!this.isIndexedDBAvailable) {
      return 'localstorage';
    }
    return null;
  }

  /**
   * Get IndexedDB database instance
   * Used by search service for full-text index operations
   */
  public async getDatabase(): Promise<IDBDatabase | null> {
    if (!this.isIndexedDBAvailable) {
      return null;
    }

    // If database is not open, try to open it
    if (!this.db) {
      try {
        await this.openDatabase();
      } catch (error) {
        frontendLogger.error('Failed to open database', {
          error: error instanceof Error ? error : new Error(String(error)),
        });
        return null;
      }
    }

    return this.db;
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    this.encryptionKey = null;
    this.keyId = null;
    ConversationStorage.instance = null;
  }
}

/**
 * Get the global conversation storage instance
 */
export function getConversationStorage(): ConversationStorage {
  return ConversationStorage.getInstance();
}

/**
 * Storage utility functions
 */
export const storageUtils = {
  /**
   * Check if Web Crypto API is available
   */
  isWebCryptoAvailable(): boolean {
    return 'crypto' in window && 'subtle' in window.crypto;
  },

  /**
   * Check if Compression Streams are available
   */
  isCompressionAvailable(): boolean {
    return 'CompressionStream' in window && 'DecompressionStream' in window;
  },

  /**
   * Format bytes to human readable string
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) {
      return '0 Bytes';
    }

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  /**
   * Calculate compression ratio
   */
  calculateCompressionRatio(
    originalSize: number,
    compressedSize: number
  ): number {
    if (originalSize === 0) {
      return 0;
    }
    return ((originalSize - compressedSize) / originalSize) * 100;
  },
};
