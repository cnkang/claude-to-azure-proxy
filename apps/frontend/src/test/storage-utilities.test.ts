import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationStorage } from '../services/storage.js';
import type { Conversation } from '../types/index.js';

const storage = ConversationStorage.getInstance();
const internals = storage as unknown as {
  isIndexedDBAvailable: boolean;
  db: IDBDatabase | null;
  sessionManager: {
    getSessionId: () => string | null;
    getSessionStoragePrefix: () => string;
    validateConversationAccess: (sessionId: string) => boolean;
  };
  encryptData: (data: string) => Promise<{
    data: ArrayBuffer | string;
    iv: ArrayBuffer | string;
    compressed: boolean;
    timestamp: number;
  }>;
  decryptData: (payload: {
    data: ArrayBuffer | string;
    iv: ArrayBuffer | string;
    compressed: boolean;
    timestamp: number;
  }) => Promise<string>;
  compressData: (data: string) => Promise<string>;
  decompressData: (data: string) => Promise<string>;
  simpleCompress: (data: string) => string;
  simpleDecompress: (data: string) => string;
  estimateLocalStorageUsage: () => number;
  getStorageQuota: () => Promise<{
    used: number;
    quota: number;
    percentage: number;
    available: number;
  }>;
};

const originalNavigatorStorage = Object.getOwnPropertyDescriptor(
  navigator,
  'storage'
);
const originalCompressionStream = (globalThis as Record<string, unknown>)
  .CompressionStream;
const originalDecompressionStream = (globalThis as Record<string, unknown>)
  .DecompressionStream;
const originalCrypto = globalThis.crypto;

const passthroughStreamFactory = (): void => {
  class PassthroughStream {
    private readonly chunks: Uint8Array[] = [];

    public readonly writable = {
      getWriter: () => ({
        write: async (chunk: Uint8Array) => {
          this.chunks.push(chunk);
        },
        close: async () => {},
      }),
    };

    public readonly readable = {
      getReader: () => {
        let index = 0;
        return {
          read: async (): Promise<{ done: boolean; value?: Uint8Array }> => {
            if (index < this.chunks.length) {
              const value = this.chunks[index];
              index += 1;
              return { done: false, value };
            }
            return { done: true, value: undefined };
          },
        };
      },
    };
  }

  (globalThis as Record<string, unknown>).CompressionStream = PassthroughStream;
  (globalThis as Record<string, unknown>).DecompressionStream =
    PassthroughStream;
};

const stubCrypto = (): void => {
  const subtle = {
    encrypt: vi.fn(
      async (_algorithm: unknown, _key: CryptoKey, data: ArrayBuffer) => data
    ),
    decrypt: vi.fn(
      async (_algorithm: unknown, _key: CryptoKey, data: ArrayBuffer) => data
    ),
  };

  const cryptoStub: Crypto = {
    getRandomValues: (array: Uint8Array): Uint8Array => {
      array.fill(1);
      return array;
    },
    subtle: subtle as unknown as SubtleCrypto,
  } as Crypto;

  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: cryptoStub,
  });
};

const createConversation = (id: string, sessionId: string): Conversation => {
  const now = new Date('2024-03-05T05:15:00.000Z');
  return {
    id,
    title: `Utility conversation ${id}`,
    selectedModel: 'gpt-4o',
    createdAt: now,
    updatedAt: now,
    sessionId,
    isStreaming: false,
    messages: [
      {
        id: `${id}-message`,
        role: 'assistant',
        content: 'Utility branch coverage',
        timestamp: now,
        conversationId: id,
        correlationId: `${id}-corr`,
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

beforeEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();

  internals.sessionManager = {
    getSessionId: () => 'session-utils',
    getSessionStoragePrefix: () => 'session-utils',
    validateConversationAccess: () => true,
  };

  internals.isIndexedDBAvailable = false;
  internals.db = null;

  if (originalNavigatorStorage) {
    Object.defineProperty(navigator, 'storage', originalNavigatorStorage);
  } else {
    delete (navigator as unknown as { storage?: unknown }).storage;
  }

  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: originalCrypto,
  });
});

afterEach(() => {
  if (originalNavigatorStorage) {
    Object.defineProperty(navigator, 'storage', originalNavigatorStorage);
  } else {
    delete (navigator as unknown as { storage?: unknown }).storage;
  }

  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: originalCrypto,
  });

  if (originalCompressionStream) {
    (globalThis as Record<string, unknown>).CompressionStream =
      originalCompressionStream;
  } else {
    delete (globalThis as Record<string, unknown>).CompressionStream;
  }

  if (originalDecompressionStream) {
    (globalThis as Record<string, unknown>).DecompressionStream =
      originalDecompressionStream;
  } else {
    delete (globalThis as Record<string, unknown>).DecompressionStream;
  }
});

describe('ConversationStorage low-level utilities', () => {
  it('compresses and decompresses using simple fallback when streams are unavailable', async () => {
    delete (globalThis as Record<string, unknown>).CompressionStream;
    delete (globalThis as Record<string, unknown>).DecompressionStream;

    const sample = 'aaaaabbbbccccddddeeee';
    const compressed = await internals.compressData.call(storage, sample);
    expect(compressed).not.toBe(sample);

    const decompressed = await internals.decompressData.call(
      storage,
      compressed
    );
    expect(decompressed).toBe(sample);
  });

  it('uses CompressionStream and DecompressionStream when available', async () => {
    passthroughStreamFactory();

    const sample = 'stream-based compression';
    const compressed = await internals.compressData.call(storage, sample);
    expect(typeof compressed).toBe('string');
    expect(compressed).not.toBe(sample);

    const decompressed = await internals.decompressData.call(
      storage,
      compressed
    );
    expect(decompressed).toBe(sample);
  });

  it('encrypts and decrypts payloads, delegating to compression helpers when needed', async () => {
    stubCrypto();

    const compressSpy = vi
      .spyOn(internals, 'compressData')
      .mockResolvedValue('compressed-data');
    const decompressSpy = vi
      .spyOn(internals, 'decompressData')
      .mockResolvedValue('restored-data');

    const originalKey = (
      internals as unknown as { encryptionKey: CryptoKey | null }
    ).encryptionKey;
    (
      internals as unknown as { encryptionKey: CryptoKey | null }
    ).encryptionKey = {} as CryptoKey;

    const encrypted = await internals.encryptData.call(
      storage,
      'x'.repeat(2048)
    );
    expect(encrypted.compressed).toBe(true);
    expect(compressSpy).toHaveBeenCalled();

    const decrypted = await internals.decryptData.call(storage, encrypted);
    expect(decompressSpy).toHaveBeenCalled();
    expect(decrypted).toBe('restored-data');

    (
      internals as unknown as { encryptionKey: CryptoKey | null }
    ).encryptionKey = originalKey ?? null;
  });

  it('throws descriptive errors when encryption or decryption prerequisites fail', async () => {
    const originalKey = (
      internals as unknown as { encryptionKey: CryptoKey | null }
    ).encryptionKey;
    (
      internals as unknown as { encryptionKey: CryptoKey | null }
    ).encryptionKey = null;
    await expect(internals.encryptData.call(storage, 'data')).rejects.toThrow(
      'Encryption key not initialized'
    );

    (
      internals as unknown as { encryptionKey: CryptoKey | null }
    ).encryptionKey = {} as CryptoKey;
    stubCrypto();
    const encryptedPayload = {
      data: new ArrayBuffer(0),
      iv: new ArrayBuffer(0),
      compressed: false,
      timestamp: Date.now(),
    };
    (
      internals as unknown as { encryptionKey: CryptoKey | null }
    ).encryptionKey = null;
    await expect(
      internals.decryptData.call(storage, encryptedPayload)
    ).rejects.toThrow('Encryption key not initialized');

    (
      internals as unknown as { encryptionKey: CryptoKey | null }
    ).encryptionKey = originalKey ?? null;
  });

  it('estimates local storage usage and falls back when navigator storage is unavailable', async () => {
    localStorage.setItem('sample-key', 'sample-value');
    const estimated = internals.estimateLocalStorageUsage();
    expect(Number.isFinite(estimated)).toBe(true);

    const quotaBefore = await storage.getStorageQuota();
    expect(quotaBefore.quota).toBeGreaterThan(0);

    if (originalNavigatorStorage) {
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: undefined,
      });
    } else {
      delete (navigator as unknown as { storage?: unknown }).storage;
    }

    const quotaFallback = await storage.getStorageQuota();
    expect(quotaFallback.quota).toBe(5 * 1024 * 1024);
  });

  it('handles localStorage failures gracefully when storing conversations', async () => {
    const encryptSpy = vi
      .spyOn(internals, 'encryptData')
      .mockRejectedValue(new Error('encryption failure'));

    await expect(
      storage.storeConversation(
        createConversation('local-error', 'session-utils')
      )
    ).rejects.toThrow('Failed to store conversation');

    encryptSpy.mockRestore();
  });

  it('validates session access when retrieving conversations from localStorage', async () => {
    const conversation = createConversation('local-session', 'session-utils');
    const encryptSpy = vi
      .spyOn(internals, 'encryptData')
      .mockImplementation(async (data: string) => ({
        data,
        iv: 'iv',
        compressed: false,
        timestamp: Date.now(),
      }));
    const decryptSpy = vi
      .spyOn(internals, 'decryptData')
      .mockImplementation(async (payload: { data: string }) => payload.data);

    await storage.storeConversation(conversation);
    internals.sessionManager.validateConversationAccess = () => false;

    const fetched = await storage.getConversation('local-session');
    expect(fetched).toBeNull();

    internals.sessionManager.validateConversationAccess = () => true;
    encryptSpy.mockRestore();
    decryptSpy.mockRestore();
  });

  it('computes simple compression and decompression helpers explicitly', () => {
    const compressed = internals.simpleCompress('zzzzqqq');
    expect(compressed).toContain('z');

    const restored = internals.simpleDecompress(compressed);
    expect(restored).toBe('zzzzqqq');
  });
});
