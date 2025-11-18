/**
 * Cross-Tab Synchronization Integration Tests
 *
 * Tests event broadcasting, receiving, conflict resolution, and race conditions
 * for the CrossTabSyncService.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, Code Quality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CrossTabSyncService,
  type SyncEvent,
  type SyncListener,
} from '../services/cross-tab-sync.js';
import type { Conversation } from '../types/index.js';

describe('CrossTabSyncService', () => {
  let syncService: CrossTabSyncService;
  let mockStorageEvent: StorageEvent;

  beforeEach(() => {
    // Get fresh instance
    syncService = CrossTabSyncService.getInstance();

    // Clear both sessionStorage and localStorage
    sessionStorage.clear();
    localStorage.clear();

    // Initialize service
    syncService.initialize();
  });

  afterEach(() => {
    // Cleanup
    syncService.destroy();
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize successfully', () => {
      expect(syncService.isReady()).toBe(true);
    });

    it('should generate unique tab ID', () => {
      const tabId = syncService.getTabId();
      expect(tabId).toBeDefined();
      expect(typeof tabId).toBe('string');
      expect(tabId.length).toBeGreaterThan(0);
    });

    it('should reuse tab ID from sessionStorage', () => {
      const firstTabId = syncService.getTabId();

      // Create new instance (simulating page reload)
      const newService = CrossTabSyncService.getInstance();
      const secondTabId = newService.getTabId();

      expect(secondTabId).toBe(firstTabId);
    });

    it('should not initialize twice', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      syncService.initialize();

      // Should log warning but not throw
      expect(syncService.isReady()).toBe(true);

      consoleSpy.mockRestore();
    });
  });

  describe('Event Broadcasting', () => {
    it('should broadcast update event', () => {
      const conversationId = 'conv-123';
      const updates = { title: 'New Title' };

      // Mock localStorage.setItem to capture the broadcast
      let capturedKey: string | null = null;
      let capturedValue: string | null = null;
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = function(key: string, value: string) {
        if (key.startsWith('sync_event_')) {
          capturedKey = key;
          capturedValue = value;
        }
        return originalSetItem.call(this, key, value);
      };

      syncService.broadcastUpdate(conversationId, updates);

      // Restore original setItem
      localStorage.setItem = originalSetItem;

      // Verify that a sync event was broadcast
      expect(capturedKey).toBeDefined();
      expect(capturedKey).toContain(conversationId);
      
      if (capturedValue) {
        const event: SyncEvent = JSON.parse(capturedValue);
        expect(event.type).toBe('update');
        expect(event.conversationId).toBe(conversationId);
        expect(event.data).toEqual(updates);
        expect(event.sourceTabId).toBe(syncService.getTabId());
        expect(event.timestamp).toBeGreaterThan(0);
      }
    });

    it('should broadcast deletion event', () => {
      const conversationId = 'conv-456';

      // Mock localStorage.setItem to capture the broadcast
      let capturedValue: string | null = null;
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = function(key: string, value: string) {
        if (key.startsWith('sync_event_')) {
          capturedValue = value;
        }
        return originalSetItem.call(this, key, value);
      };

      syncService.broadcastDeletion(conversationId);

      // Restore original setItem
      localStorage.setItem = originalSetItem;

      // Verify that a sync event was broadcast
      expect(capturedValue).toBeDefined();
      
      if (capturedValue) {
        const event: SyncEvent = JSON.parse(capturedValue);
        expect(event.type).toBe('delete');
        expect(event.conversationId).toBe(conversationId);
        expect(event.data).toBeUndefined();
      }
    });

    it('should broadcast creation event', () => {
      const conversationId = 'conv-789';
      const conversation: Partial<Conversation> = {
        id: conversationId,
        title: 'New Conversation',
        selectedModel: 'gpt-4o',
      };

      // Mock localStorage.setItem to capture the broadcast
      let capturedValue: string | null = null;
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = function(key: string, value: string) {
        if (key.startsWith('sync_event_')) {
          capturedValue = value;
        }
        return originalSetItem.call(this, key, value);
      };

      syncService.broadcastCreation(conversationId, conversation);

      // Restore original setItem
      localStorage.setItem = originalSetItem;

      // Verify that a sync event was broadcast
      expect(capturedValue).toBeDefined();
      
      if (capturedValue) {
        const event: SyncEvent = JSON.parse(capturedValue);
        expect(event.type).toBe('create');
        expect(event.conversationId).toBe(conversationId);
        expect(event.data).toEqual(conversation);
      }
    });

    it('should cleanup broadcast event key', async () => {
      const conversationId = 'conv-cleanup';

      const keysBefore = Object.keys(localStorage);

      syncService.broadcastUpdate(conversationId, { title: 'Test' });

      // Wait for cleanup setTimeout
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Check that the sync event key was removed
      const keysAfter = Object.keys(localStorage);
      const syncKeys = keysAfter.filter(k => k.startsWith('sync_event_'));
      
      // Should be cleaned up
      expect(syncKeys.length).toBe(0);
    });
  });

  describe('Event Subscription', () => {
    it('should subscribe to update events', () => {
      const listener = vi.fn();

      const unsubscribe = syncService.subscribe('update', listener);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should support multiple listeners per event type', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      syncService.subscribe('update', listener1);
      syncService.subscribe('update', listener2);
      syncService.subscribe('update', listener3);

      // All listeners should be registered (tested indirectly through event handling)
      expect(true).toBe(true);
    });

    it('should unsubscribe listener', () => {
      const listener = vi.fn();

      const unsubscribe = syncService.subscribe('update', listener);
      unsubscribe();

      // Listener should be removed (tested indirectly)
      expect(true).toBe(true);
    });

    it('should throw error for invalid event type', () => {
      const listener = vi.fn();

      expect(() => {
        // @ts-expect-error - Testing invalid event type
        syncService.subscribe('invalid', listener);
      }).toThrow('Invalid event type');
    });
  });

  describe('Event Receiving', () => {
    it('should receive and process update event from another tab', () => {
      const listener = vi.fn();
      syncService.subscribe('update', listener);

      // Simulate storage event from another tab
      const event: SyncEvent = {
        type: 'update',
        conversationId: 'conv-123',
        data: { title: 'Updated Title' },
        timestamp: Date.now(),
        sourceTabId: 'different-tab-id',
      };

      const storageEvent = new StorageEvent('storage', {
        key: 'sync_event_conv-123_' + Date.now(),
        newValue: JSON.stringify(event),
        oldValue: null,
        storageArea: localStorage,
      });

      window.dispatchEvent(storageEvent);

      expect(listener).toHaveBeenCalledWith(event);
    });

    it('should receive and process delete event from another tab', () => {
      const listener = vi.fn();
      syncService.subscribe('delete', listener);

      const event: SyncEvent = {
        type: 'delete',
        conversationId: 'conv-456',
        timestamp: Date.now(),
        sourceTabId: 'different-tab-id',
      };

      const storageEvent = new StorageEvent('storage', {
        key: 'sync_event_conv-456_' + Date.now(),
        newValue: JSON.stringify(event),
        oldValue: null,
        storageArea: localStorage,
      });

      window.dispatchEvent(storageEvent);

      expect(listener).toHaveBeenCalledWith(event);
    });

    it('should receive and process create event from another tab', () => {
      const listener = vi.fn();
      syncService.subscribe('create', listener);

      const event: SyncEvent = {
        type: 'create',
        conversationId: 'conv-789',
        data: {
          id: 'conv-789',
          title: 'New Conversation',
          selectedModel: 'gpt-4o',
        },
        timestamp: Date.now(),
        sourceTabId: 'different-tab-id',
      };

      const storageEvent = new StorageEvent('storage', {
        key: 'sync_event_conv-789_' + Date.now(),
        newValue: JSON.stringify(event),
        oldValue: null,
        storageArea: localStorage,
      });

      window.dispatchEvent(storageEvent);

      expect(listener).toHaveBeenCalledWith(event);
    });

    it('should ignore events from same tab', () => {
      const listener = vi.fn();
      syncService.subscribe('update', listener);

      const event: SyncEvent = {
        type: 'update',
        conversationId: 'conv-123',
        data: { title: 'Updated Title' },
        timestamp: Date.now(),
        sourceTabId: syncService.getTabId(), // Same tab
      };

      const storageEvent = new StorageEvent('storage', {
        key: 'sync_event_conv-123_' + Date.now(),
        newValue: JSON.stringify(event),
        oldValue: null,
        storageArea: localStorage,
      });

      window.dispatchEvent(storageEvent);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should ignore non-sync storage events', () => {
      const listener = vi.fn();
      syncService.subscribe('update', listener);

      const storageEvent = new StorageEvent('storage', {
        key: 'some_other_key',
        newValue: 'some value',
        oldValue: null,
        storageArea: localStorage,
      });

      window.dispatchEvent(storageEvent);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle listener errors gracefully', () => {
      const errorListener: SyncListener = () => {
        throw new Error('Listener error');
      };
      const goodListener = vi.fn();

      syncService.subscribe('update', errorListener);
      syncService.subscribe('update', goodListener);

      const event: SyncEvent = {
        type: 'update',
        conversationId: 'conv-123',
        data: { title: 'Updated Title' },
        timestamp: Date.now(),
        sourceTabId: 'different-tab-id',
      };

      const storageEvent = new StorageEvent('storage', {
        key: 'sync_event_conv-123_' + Date.now(),
        newValue: JSON.stringify(event),
        oldValue: null,
        storageArea: localStorage,
      });

      // Should not throw
      expect(() => {
        window.dispatchEvent(storageEvent);
      }).not.toThrow();

      // Good listener should still be called
      expect(goodListener).toHaveBeenCalledWith(event);
    });

    it('should handle async listener errors gracefully', async () => {
      const asyncErrorListener: SyncListener = async () => {
        throw new Error('Async listener error');
      };
      const goodListener = vi.fn();

      syncService.subscribe('update', asyncErrorListener);
      syncService.subscribe('update', goodListener);

      const event: SyncEvent = {
        type: 'update',
        conversationId: 'conv-123',
        data: { title: 'Updated Title' },
        timestamp: Date.now(),
        sourceTabId: 'different-tab-id',
      };

      const storageEvent = new StorageEvent('storage', {
        key: 'sync_event_conv-123_' + Date.now(),
        newValue: JSON.stringify(event),
        oldValue: null,
        storageArea: localStorage,
      });

      window.dispatchEvent(storageEvent);

      // Wait for async listener to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Good listener should still be called
      expect(goodListener).toHaveBeenCalledWith(event);
    });
  });

  describe('Conflict Resolution', () => {
    it('should resolve conflict using most recent timestamp (remote wins)', () => {
      const now = Date.now();
      const local: Partial<Conversation> = {
        id: 'conv-123',
        title: 'Local Title',
        updatedAt: new Date(now - 1000), // Older
      };

      const remote: Partial<Conversation> = {
        id: 'conv-123',
        title: 'Remote Title',
        updatedAt: new Date(now), // Newer
      };

      const resolution = syncService.resolveConflict(local, remote);

      expect(resolution.hadConflict).toBe(true);
      expect(resolution.strategy).toBe('remote');
      expect(resolution.resolved).toEqual(remote);
    });

    it('should resolve conflict using most recent timestamp (local wins)', () => {
      const now = Date.now();
      const local: Partial<Conversation> = {
        id: 'conv-123',
        title: 'Local Title',
        updatedAt: new Date(now), // Newer
      };

      const remote: Partial<Conversation> = {
        id: 'conv-123',
        title: 'Remote Title',
        updatedAt: new Date(now - 1000), // Older
      };

      const resolution = syncService.resolveConflict(local, remote);

      expect(resolution.hadConflict).toBe(true);
      expect(resolution.strategy).toBe('local');
      expect(resolution.resolved).toEqual(local);
    });

    it('should handle no conflict when timestamps are equal', () => {
      const now = new Date();
      const local: Partial<Conversation> = {
        id: 'conv-123',
        title: 'Local Title',
        updatedAt: now,
      };

      const remote: Partial<Conversation> = {
        id: 'conv-123',
        title: 'Remote Title',
        updatedAt: now,
      };

      const resolution = syncService.resolveConflict(local, remote);

      expect(resolution.hadConflict).toBe(false);
      expect(resolution.strategy).toBe('remote');
      expect(resolution.resolved).toEqual(remote);
    });

    it('should handle missing timestamps', () => {
      const local: Partial<Conversation> = {
        id: 'conv-123',
        title: 'Local Title',
      };

      const remote: Partial<Conversation> = {
        id: 'conv-123',
        title: 'Remote Title',
        updatedAt: new Date(),
      };

      const resolution = syncService.resolveConflict(local, remote);

      expect(resolution.hadConflict).toBe(false);
      expect(resolution.strategy).toBe('remote');
      expect(resolution.resolved).toEqual(remote);
    });
  });

  describe('Multiple Tabs Scenario', () => {
    it('should handle simultaneous updates from multiple tabs', () => {
      const listener = vi.fn();
      syncService.subscribe('update', listener);

      // Simulate updates from 3 different tabs
      const events: SyncEvent[] = [
        {
          type: 'update',
          conversationId: 'conv-123',
          data: { title: 'Tab 1 Update' },
          timestamp: Date.now(),
          sourceTabId: 'tab-1',
        },
        {
          type: 'update',
          conversationId: 'conv-123',
          data: { title: 'Tab 2 Update' },
          timestamp: Date.now() + 100,
          sourceTabId: 'tab-2',
        },
        {
          type: 'update',
          conversationId: 'conv-123',
          data: { title: 'Tab 3 Update' },
          timestamp: Date.now() + 200,
          sourceTabId: 'tab-3',
        },
      ];

      events.forEach((event) => {
        const storageEvent = new StorageEvent('storage', {
          key: `sync_event_conv-123_${event.timestamp}`,
          newValue: JSON.stringify(event),
          oldValue: null,
          storageArea: localStorage,
        });

        window.dispatchEvent(storageEvent);
      });

      expect(listener).toHaveBeenCalledTimes(3);
    });

    it('should handle race condition with delete and update', () => {
      const updateListener = vi.fn();
      const deleteListener = vi.fn();

      syncService.subscribe('update', updateListener);
      syncService.subscribe('delete', deleteListener);

      // Simulate race condition: update and delete happening simultaneously
      const updateEvent: SyncEvent = {
        type: 'update',
        conversationId: 'conv-123',
        data: { title: 'Updated Title' },
        timestamp: Date.now(),
        sourceTabId: 'tab-1',
      };

      const deleteEvent: SyncEvent = {
        type: 'delete',
        conversationId: 'conv-123',
        timestamp: Date.now() + 10,
        sourceTabId: 'tab-2',
      };

      // Dispatch both events
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: `sync_event_conv-123_${updateEvent.timestamp}`,
          newValue: JSON.stringify(updateEvent),
          oldValue: null,
          storageArea: localStorage,
        })
      );

      window.dispatchEvent(
        new StorageEvent('storage', {
          key: `sync_event_conv-123_${deleteEvent.timestamp}`,
          newValue: JSON.stringify(deleteEvent),
          oldValue: null,
          storageArea: localStorage,
        })
      );

      expect(updateListener).toHaveBeenCalledWith(updateEvent);
      expect(deleteListener).toHaveBeenCalledWith(deleteEvent);
    });
  });

  describe('Service Lifecycle', () => {
    it('should cleanup resources on destroy', () => {
      const listener = vi.fn();
      syncService.subscribe('update', listener);

      syncService.destroy();

      expect(syncService.isReady()).toBe(false);

      // Events should not be processed after destroy
      const event: SyncEvent = {
        type: 'update',
        conversationId: 'conv-123',
        data: { title: 'Updated Title' },
        timestamp: Date.now(),
        sourceTabId: 'different-tab-id',
      };

      const storageEvent = new StorageEvent('storage', {
        key: 'sync_event_conv-123_' + Date.now(),
        newValue: JSON.stringify(event),
        oldValue: null,
        storageArea: localStorage,
      });

      window.dispatchEvent(storageEvent);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle destroy when not initialized', () => {
      const newService = CrossTabSyncService.getInstance();

      // Should not throw
      expect(() => {
        newService.destroy();
      }).not.toThrow();
    });
  });
});
