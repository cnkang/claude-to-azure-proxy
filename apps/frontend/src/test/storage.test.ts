import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationStorage } from '../services/storage.js';
import type { Conversation } from '../types/index.js';
import { frontendLogger } from '../utils/logger.js';

const createConversation = (id: string, sessionId: string): Conversation => {
  const now = new Date('2024-02-10T10:00:00.000Z');
  return {
    id,
    title: `Conversation ${id}`,
    selectedModel: 'gpt-4o',
    createdAt: now,
    updatedAt: now,
    sessionId,
    isStreaming: false,
    messages: [
      {
        id: `${id}-msg`,
        role: 'user',
        content: 'Persist this message securely',
        timestamp: now,
        correlationId: `${id}-corr`,
        conversationId: id,
        isComplete: true,
      },
    ],
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
};

describe('ConversationStorage local fallback', () => {
  let originalIndexedDB: typeof indexedDB;
  let storage: ConversationStorage;

  beforeEach(async () => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();

    originalIndexedDB = window.indexedDB;
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: null,
    });

    storage = ConversationStorage.getInstance();
    await storage.initialize();

    // Ensure we operate in fallback mode
    (
      storage as unknown as { isIndexedDBAvailable: boolean }
    ).isIndexedDBAvailable = false;
    (storage as unknown as { db: IDBDatabase | null }).db = null;

    const localStorageInstance = window.localStorage as unknown as {
      store: Record<string, string>;
      key?: (index: number) => string | null;
    };
    localStorageInstance.key = (index: number): string | null => {
      const keys = Object.keys(localStorageInstance.store);
      return keys[index] ?? null;
    };
    Object.defineProperty(window.localStorage, 'length', {
      configurable: true,
      get: () => Object.keys(localStorageInstance.store).length,
    });

    // Don't mock encryption/decryption - let it use the crypto.subtle mock from setup.ts
    // This ensures the encryption/decryption logic works correctly in tests
  });

  afterEach(() => {
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: originalIndexedDB,
    });
  });

  it('stores, retrieves, and deletes conversations using local storage fallback', async () => {
    const sessionManager = (
      storage as unknown as {
        sessionManager: {
          getSessionId: () => string;
          getSessionStoragePrefix: () => string;
        };
      }
    ).sessionManager;
    const sessionId = sessionManager.getSessionId();
    const sessionPrefix = sessionManager.getSessionStoragePrefix();
    const conversation = createConversation('conv-local', sessionId);
    await storage.storeConversation(conversation);

    const storedRaw = localStorage.getItem(
      `${sessionPrefix}_conversation_conv-local`
    );
    expect(storedRaw).not.toBeNull();

    const fetched = await storage.getConversation('conv-local');
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe('conv-local');
    expect(fetched?.messages[0].content).toBe('Persist this message securely');

    const allConversations = await storage.getAllConversations();
    expect(allConversations.some((item) => item.id === 'conv-local')).toBe(
      true
    );

    await storage.deleteConversation('conv-local');
    const afterDelete = await storage.getConversation('conv-local');
    expect(afterDelete).toBeNull();
  });

  it('tracks cleanup statistics and quota usage', async () => {
    const sessionId = (
      storage as unknown as {
        sessionManager: { getSessionId: () => string };
      }
    ).sessionManager.getSessionId();
    const conversations = Array.from({ length: 3 }, (_, index) =>
      createConversation(`conv-${index}`, sessionId)
    );

    for (const conversation of conversations) {
      await storage.storeConversation(conversation);
    }

    const stats = await storage.getStorageStats();
    expect(stats.conversationCount).toBeGreaterThan(0);
    expect(stats.quota.used).toBeGreaterThan(0);

    const cleanup = await storage.performCleanup();
    expect(cleanup.success).toBe(true);
    expect(cleanup.conversationsRemoved).toBeGreaterThanOrEqual(0);
  });

  it('clears all stored data for current session', async () => {
    const sessionManager = (
      storage as unknown as {
        sessionManager: {
          getSessionId: () => string;
          getSessionStoragePrefix: () => string;
        };
      }
    ).sessionManager;
    const sessionId = sessionManager.getSessionId();
    const prefix = sessionManager.getSessionStoragePrefix();

    await storage.storeConversation(
      createConversation('conv-clear', sessionId)
    );
    expect(
      localStorage.getItem(`${prefix}_conversation_conv-clear`)
    ).not.toBeNull();

    await storage.clearAllData();
    expect(
      localStorage.getItem(`${prefix}_conversation_conv-clear`)
    ).toBeNull();
  });

  it('calculates cleanup necessity based on storage quota', async () => {
    const originalStorage = Object.getOwnPropertyDescriptor(
      navigator,
      'storage'
    );
    const estimateMock = vi.fn().mockResolvedValue({
      usage: 9000,
      quota: 10000,
    });

    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        estimate: estimateMock,
      },
    });

    const result = await storage.isCleanupNeeded();
    expect(result).toBe(true);
    expect(estimateMock).toHaveBeenCalled();

    if (originalStorage) {
      Object.defineProperty(navigator, 'storage', originalStorage);
    } else {
      Reflect.deleteProperty(
        navigator as unknown as { storage?: unknown },
        'storage'
      );
    }
  });

  it('computes storage statistics with stored conversations', async () => {
    const sessionManager = (
      storage as unknown as {
        sessionManager: { getSessionId: () => string };
      }
    ).sessionManager;
    const sessionId = sessionManager.getSessionId();

    await storage.storeConversation(
      createConversation('conv-stats', sessionId)
    );

    const stats = await storage.getStorageStats();
    expect(stats.conversationCount).toBeGreaterThan(0);
    expect(stats.messageCount).toBeGreaterThan(0);
    expect(stats.quota.used).toBeGreaterThanOrEqual(0);
  });

  it('falls back to default quota when navigator storage is unavailable', async () => {
    const originalStorage = Object.getOwnPropertyDescriptor(
      navigator,
      'storage'
    );
    if (originalStorage) {
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: undefined,
      });
    } else {
      Reflect.deleteProperty(
        navigator as unknown as { storage?: unknown },
        'storage'
      );
    }

    const quota = await storage.getStorageQuota();
    expect(quota.quota).toBe(5 * 1024 * 1024);
    expect(quota.percentage).toBeGreaterThanOrEqual(0);

    if (originalStorage) {
      Object.defineProperty(navigator, 'storage', originalStorage);
    }
  });

  it('reports no cleanup needed when usage below threshold', async () => {
    const originalStorage = Object.getOwnPropertyDescriptor(
      navigator,
      'storage'
    );
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        estimate: vi.fn().mockResolvedValue({
          usage: 1000,
          quota: 10000,
        }),
      },
    });

    const result = await storage.isCleanupNeeded();
    expect(result).toBe(false);

    if (originalStorage) {
      Object.defineProperty(navigator, 'storage', originalStorage);
    } else {
      Reflect.deleteProperty(
        navigator as unknown as { storage?: unknown },
        'storage'
      );
    }
  });

  it('exports stored data in structured JSON format', async () => {
    const conversation = createConversation('export', 'session-utils');
    const getAllSpy = vi
      .spyOn(storage, 'getAllConversations')
      .mockResolvedValue([conversation]);
    const statsSpy = vi.spyOn(storage, 'getStorageStats').mockResolvedValue({
      conversationCount: 1,
      messageCount: 1,
      totalSize: 1024,
      oldestConversation: conversation.createdAt,
      newestConversation: conversation.updatedAt,
      quota: { used: 1024, quota: 2048, percentage: 50, available: 1024 },
    });

    const exportJson = await storage.exportData();
    const parsed = JSON.parse(exportJson);
    expect(parsed.version).toBe('1.0');
    expect(parsed.conversations[0].messages[0].timestamp).toContain(
      '2024-02-10'
    );

    getAllSpy.mockRestore();
    statsSpy.mockRestore();
  });

  it('logs and rethrows when exporting data fails', async () => {
    const exportError = new Error('storage offline');
    const getAllSpy = vi
      .spyOn(storage, 'getAllConversations')
      .mockRejectedValue(exportError);
    const loggerSpy = vi.spyOn(frontendLogger, 'error');

    await expect(storage.exportData()).rejects.toThrow(
      'Failed to export conversation data'
    );

    expect(loggerSpy).toHaveBeenCalledWith(
      'Failed to export data',
      expect.objectContaining({ error: exportError })
    );

    getAllSpy.mockRestore();
  });

  it('handles storage stats failure gracefully', async () => {
    const originalGetAll = storage.getAllConversations.bind(storage);
    (
      storage as unknown as {
        getAllConversations: () => Promise<Conversation[]>;
      }
    ).getAllConversations = vi.fn(async () => {
      throw new Error('failed');
    });

    const stats = await storage.getStorageStats();
    expect(stats.conversationCount).toBe(0);
    expect(stats.quota.quota).toBeGreaterThanOrEqual(0);

    (
      storage as unknown as {
        getAllConversations: () => Promise<Conversation[]>;
      }
    ).getAllConversations = originalGetAll;
  });

  it('deletes conversation keys that may not exist without throwing', async () => {
    const result = await storage.deleteConversation('missing-id');
    expect(result).toBeDefined();
    expect(result.success).toBe(false);
    expect(result.conversationRemoved).toBe(false);
  });

  it('returns cleanup success when no conversations are stored', async () => {
    const cleanup = await storage.performCleanup();
    expect(cleanup.success).toBe(true);
    expect(cleanup.conversationsRemoved).toBe(0);
  });

  describe('updateConversationTitle', () => {
    it('updates conversation title atomically with validation', async () => {
      const sessionManager = (
        storage as unknown as {
          sessionManager: {
            getSessionId: () => string;
            getSessionStoragePrefix: () => string;
          };
        }
      ).sessionManager;
      const sessionId = sessionManager.getSessionId();
      const conversation = createConversation('conv-title-update', sessionId);

      await storage.storeConversation(conversation);

      const newTitle = 'Updated Title';
      await storage.updateConversationTitle('conv-title-update', newTitle);

      const updated = await storage.getConversation('conv-title-update');
      expect(updated).not.toBeNull();
      expect(updated?.title).toBe(newTitle);
      expect(updated?.updatedAt.getTime()).toBeGreaterThan(
        conversation.updatedAt.getTime()
      );
    });

    it('validates title length - rejects empty title', async () => {
      const sessionManager = (
        storage as unknown as {
          sessionManager: {
            getSessionId: () => string;
          };
        }
      ).sessionManager;
      const sessionId = sessionManager.getSessionId();
      const conversation = createConversation('conv-empty-title', sessionId);

      await storage.storeConversation(conversation);

      await expect(
        storage.updateConversationTitle('conv-empty-title', '')
      ).rejects.toThrow('Title must be between 1 and 200 characters');
    });

    it('validates title length - rejects title over 200 characters', async () => {
      const sessionManager = (
        storage as unknown as {
          sessionManager: {
            getSessionId: () => string;
          };
        }
      ).sessionManager;
      const sessionId = sessionManager.getSessionId();
      const conversation = createConversation('conv-long-title', sessionId);

      await storage.storeConversation(conversation);

      const longTitle = 'a'.repeat(201);
      await expect(
        storage.updateConversationTitle('conv-long-title', longTitle)
      ).rejects.toThrow('Title must be between 1 and 200 characters');
    });

    it('sanitizes title to prevent XSS attacks', async () => {
      const sessionManager = (
        storage as unknown as {
          sessionManager: {
            getSessionId: () => string;
          };
        }
      ).sessionManager;
      const sessionId = sessionManager.getSessionId();
      const conversation = createConversation('conv-xss-title', sessionId);

      await storage.storeConversation(conversation);

      const maliciousTitle = '<script>alert("XSS")</script>Safe Title';
      await storage.updateConversationTitle('conv-xss-title', maliciousTitle);

      const updated = await storage.getConversation('conv-xss-title');
      expect(updated).not.toBeNull();
      expect(updated?.title).toBe('Safe Title');
      expect(updated?.title).not.toContain('<script>');
      expect(updated?.title).not.toContain('alert');
    });

    it('sanitizes title - removes javascript: protocol', async () => {
      const sessionManager = (
        storage as unknown as {
          sessionManager: {
            getSessionId: () => string;
          };
        }
      ).sessionManager;
      const sessionId = sessionManager.getSessionId();
      const conversation = createConversation('conv-js-protocol', sessionId);

      await storage.storeConversation(conversation);

      const maliciousTitle = 'javascript:void(0) Safe Title';
      await storage.updateConversationTitle('conv-js-protocol', maliciousTitle);

      const updated = await storage.getConversation('conv-js-protocol');
      expect(updated).not.toBeNull();
      expect(updated?.title).not.toContain('javascript:');
    });

    it('sanitizes title - removes event handlers', async () => {
      const sessionManager = (
        storage as unknown as {
          sessionManager: {
            getSessionId: () => string;
          };
        }
      ).sessionManager;
      const sessionId = sessionManager.getSessionId();
      const conversation = createConversation('conv-event-handler', sessionId);

      await storage.storeConversation(conversation);

      const maliciousTitle = 'onclick=alert(1) Safe Title';
      await storage.updateConversationTitle(
        'conv-event-handler',
        maliciousTitle
      );

      const updated = await storage.getConversation('conv-event-handler');
      expect(updated).not.toBeNull();
      expect(updated?.title).not.toContain('onclick=');
    });

    it('trims whitespace and normalizes spaces', async () => {
      const sessionManager = (
        storage as unknown as {
          sessionManager: {
            getSessionId: () => string;
          };
        }
      ).sessionManager;
      const sessionId = sessionManager.getSessionId();
      const conversation = createConversation('conv-whitespace', sessionId);

      await storage.storeConversation(conversation);

      const titleWithSpaces = '  Multiple   Spaces   Title  ';
      await storage.updateConversationTitle('conv-whitespace', titleWithSpaces);

      const updated = await storage.getConversation('conv-whitespace');
      expect(updated).not.toBeNull();
      expect(updated?.title).toBe('Multiple Spaces Title');
    });

    it('throws error when conversation not found', async () => {
      await expect(
        storage.updateConversationTitle('non-existent', 'New Title')
      ).rejects.toThrow('Failed to update conversation title');
    });

    it('logs successful title update', async () => {
      const sessionManager = (
        storage as unknown as {
          sessionManager: {
            getSessionId: () => string;
          };
        }
      ).sessionManager;
      const sessionId = sessionManager.getSessionId();
      const conversation = createConversation('conv-log-success', sessionId);

      await storage.storeConversation(conversation);

      const loggerSpy = vi.spyOn(frontendLogger, 'info');

      await storage.updateConversationTitle('conv-log-success', 'New Title');

      // Check for the completion log message
      expect(loggerSpy).toHaveBeenCalledWith(
        'Title update completed successfully',
        expect.objectContaining({
          metadata: expect.objectContaining({
            conversationId: 'conv-log-success',
            sanitizedTitleLength: 9,
          }),
        })
      );

      loggerSpy.mockRestore();
    });

    it('logs error when title update fails', async () => {
      const loggerSpy = vi.spyOn(frontendLogger, 'error');

      await expect(
        storage.updateConversationTitle('non-existent', 'New Title')
      ).rejects.toThrow();

      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed to update conversation title in localStorage',
        expect.objectContaining({
          metadata: expect.objectContaining({
            conversationId: 'non-existent',
          }),
          error: expect.any(Error),
        })
      );

      loggerSpy.mockRestore();
    });

    it('accepts title at minimum length (1 character)', async () => {
      const sessionManager = (
        storage as unknown as {
          sessionManager: {
            getSessionId: () => string;
          };
        }
      ).sessionManager;
      const sessionId = sessionManager.getSessionId();
      const conversation = createConversation('conv-min-length', sessionId);

      await storage.storeConversation(conversation);

      await storage.updateConversationTitle('conv-min-length', 'A');

      const updated = await storage.getConversation('conv-min-length');
      expect(updated).not.toBeNull();
      expect(updated?.title).toBe('A');
    });

    it('accepts title at maximum length (200 characters)', async () => {
      const sessionManager = (
        storage as unknown as {
          sessionManager: {
            getSessionId: () => string;
          };
        }
      ).sessionManager;
      const sessionId = sessionManager.getSessionId();
      const conversation = createConversation('conv-max-length', sessionId);

      await storage.storeConversation(conversation);

      const maxTitle = 'a'.repeat(200);
      await storage.updateConversationTitle('conv-max-length', maxTitle);

      const updated = await storage.getConversation('conv-max-length');
      expect(updated).not.toBeNull();
      expect(updated?.title).toBe(maxTitle);
      expect(updated?.title.length).toBe(200);
    });
  });
});
