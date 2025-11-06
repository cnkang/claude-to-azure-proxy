import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationStorage } from '../services/storage.js';

describe('ConversationStorage initialization', () => {
  const storage = ConversationStorage.getInstance();
  const internals = storage as unknown as {
    initializeEncryption: () => Promise<void>;
    initializeMetadata: () => Promise<void>;
    isIndexedDBAvailable: boolean;
    db: IDBDatabase | null;
  };

  const originalIndexedDB = globalThis.indexedDB;

  afterEach(() => {
    internals.isIndexedDBAvailable = false;
    internals.db = null;
    if (originalIndexedDB) {
      globalThis.indexedDB = originalIndexedDB;
    } else {
      delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    }
    vi.restoreAllMocks();
  });

  it('initializes IndexedDB when available', async () => {
    internals.initializeEncryption = vi.fn(async () => {});
    internals.initializeMetadata = vi.fn(async () => {});

    const request = {
      onsuccess: null as IDBOpenDBRequest['onsuccess'],
      onerror: null as IDBOpenDBRequest['onerror'],
      onupgradeneeded: null as IDBOpenDBRequest['onupgradeneeded'],
      result: {
        createObjectStore: vi.fn(() => ({
          createIndex: vi.fn(),
        })),
        objectStoreNames: {
          contains: () => false,
        },
      } as unknown as IDBDatabase,
    } as unknown as IDBOpenDBRequest;

    const openSpy = vi.fn(() => {
      queueMicrotask(() => {
        request.onupgradeneeded?.({
          target: request,
        } as unknown as IDBVersionChangeEvent);
        request.onsuccess?.({ target: request } as Event);
      });
      return request;
    });

    globalThis.indexedDB = {
      open: openSpy,
    } as unknown as IDBFactory;

    await storage.initialize();

    expect(openSpy).toHaveBeenCalled();
    expect(internals.isIndexedDBAvailable).toBe(true);
    expect(internals.db).toBe(request.result);
  });

  it('falls back gracefully when IndexedDB open fails', async () => {
    internals.initializeEncryption = vi.fn(async () => {});
    internals.initializeMetadata = vi.fn(async () => {});

    globalThis.indexedDB = {
      open: vi.fn(() => {
        throw new Error('open failed');
      }),
    } as unknown as IDBFactory;

    await storage.initialize();

    expect(internals.isIndexedDBAvailable).toBe(false);
    expect(internals.db).toBeNull();
  });
});
