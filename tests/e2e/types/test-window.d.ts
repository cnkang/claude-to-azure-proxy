import type { ConversationStorage } from './test-window.types';

type BroadcastType =
  | 'broadcastCreation'
  | 'broadcastUpdate'
  | 'broadcastDeletion';

export interface SyncBroadcast {
  readonly type: BroadcastType;
  readonly conversationId: string;
}

export interface SyncMonitor {
  broadcasts: SyncBroadcast[];
  creations: number;
  updates: number;
  deletions: number;
  storageEvents: string[];
}

export interface TestBridge {
  getConversationStorage(): Promise<ConversationStorage>;
  getSessionManager(): {
    getSessionId(): string;
  };
}

declare global {
  interface Window {
    __E2E_TEST_MODE__?: boolean;
    __E2E_USE_LOCAL_STORAGE__?: boolean;
    __E2E_SEED_CONVERSATIONS__?: boolean;
    __storageReadyPromise__?: Promise<void>;
    __resolveStorageReady__?: () => void;
    __conversationStorage?: ConversationStorage;
    __TEST_BRIDGE__?: TestBridge;
    __syncMonitor?: SyncMonitor;
    __playwright_localstorage_hook_installed?: boolean;
    __playwright_localstorage_events?: Array<{
      key: string | null;
      value: string | null;
    }>;
  }
}
