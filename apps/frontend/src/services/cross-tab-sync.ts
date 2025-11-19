/**
 * Cross-Tab Synchronization Service
 *
 * Provides real-time synchronization of conversation changes across multiple browser tabs
 * using the Storage Event API. Implements conflict resolution and event broadcasting.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import type { Conversation } from '../types/index.js';
import { frontendLogger } from '../utils/logger.js';

/**
 * Sync event types
 * Requirement 4.1: Synchronize changes across browser tabs
 */
export type SyncEventType = 'update' | 'delete' | 'create';

/**
 * Sync event data structure
 * Requirement 4.2: Use Storage Event API for communication
 */
export interface SyncEvent {
  /**
   * Event type (update, delete, create)
   */
  type: SyncEventType;

  /**
   * Conversation ID affected by the event
   */
  conversationId: string;

  /**
   * Partial conversation data for updates/creates
   */
  data?: Partial<Conversation>;

  /**
   * Event timestamp (milliseconds since epoch)
   */
  timestamp: number;

  /**
   * Source tab ID that generated the event
   */
  sourceTabId: string;

  /**
   * Sync version for conflict resolution
   */
  syncVersion?: number;
}

/**
 * Sync listener callback function
 */
export type SyncListener = (event: SyncEvent) => void | Promise<void>;

/**
 * Conflict resolution result
 * Requirement 4.4: Detect conflicts when multiple tabs update same conversation
 */
export interface ConflictResolution {
  /**
   * Resolved conversation data
   */
  resolved: Partial<Conversation>;

  /**
   * Resolution strategy used ('local' | 'remote' | 'merge')
   */
  strategy: 'local' | 'remote' | 'merge';

  /**
   * Whether a conflict was detected
   */
  hadConflict: boolean;
}

/**
 * Cross-Tab Synchronization Service
 *
 * Synchronizes conversation changes across multiple browser tabs using the Storage Event API.
 * Implements timestamp-based conflict resolution and supports multiple event listeners.
 *
 * Features:
 * - Real-time event broadcasting to other tabs
 * - Automatic conflict detection and resolution
 * - Multiple listeners per event type
 * - Tab ID generation for source tracking
 * - Graceful error handling
 *
 * Requirements:
 * - 4.1: Update title in all other open tabs within 1 second
 * - 4.2: Remove conversation from all other open tabs within 1 second
 * - 4.3: Use Storage Event API to synchronize changes
 * - 4.4: Detect conflicts when multiple tabs update same conversation
 * - 4.5: Use most recent timestamp to resolve conflicts
 *
 * @example
 * ```typescript
 * const syncService = CrossTabSyncService.getInstance();
 * await syncService.initialize();
 *
 * // Subscribe to update events
 * const unsubscribe = syncService.subscribe('update', (event) => {
 *   console.log('Conversation updated in another tab:', event.conversationId);
 *   // Update local state
 * });
 *
 * // Broadcast an update
 * syncService.broadcastUpdate('conv-123', { title: 'New Title' });
 *
 * // Cleanup
 * unsubscribe();
 * syncService.destroy();
 * ```
 */
export class CrossTabSyncService {
  private static instance: CrossTabSyncService | null = null;
  private readonly SYNC_KEY_PREFIX = 'sync_event_';
  private readonly TAB_ID_KEY = 'tab_id';
  private readonly tabId: string;
  private readonly listeners: Map<SyncEventType, Set<SyncListener>>;
  private isInitialized = false;
  private storageEventHandler: ((event: StorageEvent) => void) | null = null;

  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
    this.tabId = this.generateTabId();
    this.listeners = new Map();

    // Initialize listener sets for each event type
    this.listeners.set('update', new Set());
    this.listeners.set('delete', new Set());
    this.listeners.set('create', new Set());
  }

  /**
   * Get singleton instance of CrossTabSyncService
   */
  public static getInstance(): CrossTabSyncService {
    CrossTabSyncService.instance ??= new CrossTabSyncService();
    return CrossTabSyncService.instance;
  }

  /**
   * Initialize the cross-tab synchronization service
   * Requirement 4.3: Use Storage Event API to synchronize changes
   */
  public initialize(): void {
    if (this.isInitialized) {
      frontendLogger.warn('CrossTabSyncService already initialized');
      return;
    }

    try {
      // Create storage event handler
      this.storageEventHandler = this.handleStorageEvent.bind(this);

      // Listen for storage events from other tabs
      window.addEventListener('storage', this.storageEventHandler);

      this.isInitialized = true;

      frontendLogger.info('CrossTabSyncService initialized', {
        metadata: {
          tabId: this.tabId,
        },
      });
    } catch (error) {
      frontendLogger.error('Failed to initialize CrossTabSyncService', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  /**
   * Generate unique tab ID for source tracking
   * Requirement 4.1: Add tab ID generation for source tracking
   */
  private generateTabId(): string {
    // Try to get existing tab ID from sessionStorage
    const existingTabId = sessionStorage.getItem(this.TAB_ID_KEY);
    if (existingTabId !== null) {
      return existingTabId;
    }

    // Generate new tab ID using crypto.randomUUID()
    const newTabId = crypto.randomUUID();
    sessionStorage.setItem(this.TAB_ID_KEY, newTabId);

    return newTabId;
  }

  /**
   * Get current tab ID
   */
  public getTabId(): string {
    return this.tabId;
  }

  /**
   * Broadcast conversation update to other tabs
   * Requirement 4.1: Update title in all other open tabs within 1 second
   * Requirement 4.2: Use localStorage as communication channel
   */
  public broadcastUpdate(
    conversationId: string,
    updates: Partial<Conversation>
  ): void {
    this.broadcastEvent({
      type: 'update',
      conversationId,
      data: updates,
      timestamp: Date.now(),
      sourceTabId: this.tabId,
      syncVersion: (updates as { syncVersion?: number }).syncVersion,
    });

    frontendLogger.info('Broadcasted conversation update', {
      metadata: {
        conversationId,
        tabId: this.tabId,
        hasTitle: 'title' in updates,
      },
    });
  }

  /**
   * Broadcast conversation deletion to other tabs
   * Requirement 4.2: Remove conversation from all other open tabs within 1 second
   */
  public broadcastDeletion(conversationId: string): void {
    this.broadcastEvent({
      type: 'delete',
      conversationId,
      timestamp: Date.now(),
      sourceTabId: this.tabId,
    });

    frontendLogger.info('Broadcasted conversation deletion', {
      metadata: {
        conversationId,
        tabId: this.tabId,
      },
    });
  }

  /**
   * Broadcast conversation creation to other tabs
   * Requirement 4.1: Synchronize changes across browser tabs
   */
  public broadcastCreation(
    conversationId: string,
    conversation: Partial<Conversation>
  ): void {
    this.broadcastEvent({
      type: 'create',
      conversationId,
      data: conversation,
      timestamp: Date.now(),
      sourceTabId: this.tabId,
      syncVersion: (conversation as { syncVersion?: number }).syncVersion,
    });

    frontendLogger.info('Broadcasted conversation creation', {
      metadata: {
        conversationId,
        tabId: this.tabId,
      },
    });
  }

  /**
   * Broadcast sync event to other tabs using localStorage
   * Requirement 4.2: Use localStorage as communication channel
   */
  private broadcastEvent(event: SyncEvent): void {
    try {
      // Use localStorage to trigger storage event in other tabs
      const key = `${this.SYNC_KEY_PREFIX}${event.conversationId}_${Date.now()}`;
      const value = JSON.stringify(event);

      localStorage.setItem(key, value);

      // Clean up the transient key. For E2E/dev we optionally keep the key for
      // a short window so tests can reliably observe it. Set `VITE_E2E_KEEP_SYNC_KEY_MS`
      // in the frontend environment to a positive integer (milliseconds) to enable.
      // Default behavior (not set or 0) removes the key immediately.
      const keepMsRaw = import.meta.env?.VITE_E2E_KEEP_SYNC_KEY_MS;
      const keepMs = Number(keepMsRaw ?? 0) || 0;

      setTimeout(() => {
        try {
          localStorage.removeItem(key);
        } catch (error) {
          // Ignore cleanup errors
          frontendLogger.warn('Failed to cleanup sync event key', {
            error: error instanceof Error ? error : new Error(String(error)),
            metadata: { key },
          });
        }
      }, keepMs);
    } catch (error) {
      frontendLogger.error('Failed to broadcast sync event', {
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: {
          eventType: event.type,
          conversationId: event.conversationId,
        },
      });
    }
  }

  /**
   * Subscribe to sync events
   * Requirement 4.1: Support multiple listeners per event type
   *
   * @param eventType - Type of event to listen for
   * @param listener - Callback function to invoke when event occurs
   * @returns Unsubscribe function to remove the listener
   */
  public subscribe(
    eventType: SyncEventType,
    listener: SyncListener
  ): () => void {
    const listeners = this.listeners.get(eventType);
    if (!listeners) {
      throw new Error(`Invalid event type: ${eventType}`);
    }

    listeners.add(listener);

    frontendLogger.info('Subscribed to sync events', {
      metadata: {
        eventType,
        listenerCount: listeners.size,
      },
    });

    // Return unsubscribe function
    return () => {
      listeners.delete(listener);
      frontendLogger.info('Unsubscribed from sync events', {
        metadata: {
          eventType,
          listenerCount: listeners.size,
        },
      });
    };
  }

  /**
   * Handle incoming storage events from other tabs
   * Requirement 4.3: Use Storage Event API to synchronize changes
   */
  private handleStorageEvent(event: StorageEvent): void {
    // Only process sync events
    if (!event.key?.startsWith(this.SYNC_KEY_PREFIX)) {
      return;
    }

    // Ignore events from same tab (shouldn't happen, but be safe)
    if (event.newValue === null) {
      return;
    }

    try {
      const syncEvent: SyncEvent = JSON.parse(event.newValue);

      // Ignore events from this tab
      if (syncEvent.sourceTabId === this.tabId) {
        return;
      }

      frontendLogger.info('Received sync event from another tab', {
        metadata: {
          eventType: syncEvent.type,
          conversationId: syncEvent.conversationId,
          sourceTabId: syncEvent.sourceTabId,
          currentTabId: this.tabId,
        },
      });

      // Notify listeners
      this.notifyListeners(syncEvent);
    } catch (error) {
      frontendLogger.error('Failed to handle storage event', {
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: {
          key: event.key,
        },
      });
    }
  }

  /**
   * Notify all listeners for a specific event type
   * Requirement 4.1: Handle listener errors gracefully
   */
  private notifyListeners(event: SyncEvent): void {
    const listeners = this.listeners.get(event.type);
    if (!listeners || listeners.size === 0) {
      return;
    }

    // Notify each listener, catching errors to prevent one failure from affecting others
    for (const listener of listeners) {
      try {
        // Execute listener (may be async)
        const result = listener(event);

        // Handle async listeners
        if (result instanceof Promise) {
          result.catch((error) => {
            frontendLogger.error('Sync listener error (async)', {
              error: error instanceof Error ? error : new Error(String(error)),
              metadata: {
                eventType: event.type,
                conversationId: event.conversationId,
              },
            });
          });
        }
      } catch (error) {
        frontendLogger.error('Sync listener error (sync)', {
          error: error instanceof Error ? error : new Error(String(error)),
          metadata: {
            eventType: event.type,
            conversationId: event.conversationId,
          },
        });
      }
    }
  }

  /**
   * Resolve conflicts when multiple tabs update same conversation
   * Requirement 4.4: Detect conflicts when multiple tabs update same conversation
   * Requirement 4.5: Use most recent timestamp to resolve conflicts
   *
   * @param local - Local conversation data
   * @param remote - Remote conversation data from sync event
   * @returns Conflict resolution result
   */
  public resolveConflict(
    local: Partial<Conversation>,
    remote: Partial<Conversation>
  ): ConflictResolution {
    // Check if there's actually a conflict
    const localTimestamp = local.updatedAt?.getTime() ?? 0;
    const remoteTimestamp = remote.updatedAt?.getTime() ?? 0;

    // No conflict if timestamps are the same or one is missing
    if (
      localTimestamp === remoteTimestamp ||
      localTimestamp === 0 ||
      remoteTimestamp === 0
    ) {
      return {
        resolved: remote,
        strategy: 'remote',
        hadConflict: false,
      };
    }

    // Conflict detected - use timestamp-based resolution
    // Requirement 4.5: Use most recent timestamp to resolve conflicts
    const useRemote = remoteTimestamp > localTimestamp;

    frontendLogger.info('Conflict detected and resolved', {
      metadata: {
        conversationId: local.id ?? remote.id,
        localTimestamp,
        remoteTimestamp,
        strategy: useRemote ? 'remote' : 'local',
      },
    });

    return {
      resolved: useRemote ? remote : local,
      strategy: useRemote ? 'remote' : 'local',
      hadConflict: true,
    };
  }

  /**
   * Check if service is initialized
   */
  public isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Destroy the service and cleanup resources
   */
  public destroy(): void {
    if (!this.isInitialized) {
      return;
    }

    try {
      // Remove storage event listener
      if (this.storageEventHandler !== null) {
        window.removeEventListener('storage', this.storageEventHandler);
        this.storageEventHandler = null;
      }

      // Clear all listeners
      this.listeners.forEach((listeners) => listeners.clear());

      this.isInitialized = false;

      frontendLogger.info('CrossTabSyncService destroyed', {
        metadata: {
          tabId: this.tabId,
        },
      });
    } catch (error) {
      frontendLogger.error('Failed to destroy CrossTabSyncService', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }
}

/**
 * Get singleton instance of CrossTabSyncService
 */
export function getCrossTabSyncService(): CrossTabSyncService {
  return CrossTabSyncService.getInstance();
}
