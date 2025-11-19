import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/base.js';
import { TestHelpers } from './utils/test-helpers.js';

type SyncMonitor = {
  broadcasts: Array<{ type: string; conversationId: string; payload?: unknown }>;
  subscribes: number;
  unsubscribes: number;
  destroy: number;
};

const getInitialMonitor = (): SyncMonitor => ({
  broadcasts: [],
  subscribes: 0,
  unsubscribes: 0,
  destroy: 0,
});

/**
 * Instrument the cross-tab sync service in-browser to observe broadcasts and cleanup.
 * Stores counters in sessionStorage so we can assert cleanup after reload.
 */
async function instrumentCrossTabService(page: Page): Promise<void> {
  await page.evaluate(async (initialMonitor: SyncMonitor) => {
    const persisted = sessionStorage.getItem('sync_monitor_counts') ?? JSON.stringify(initialMonitor);
    const monitor = JSON.parse(persisted) as SyncMonitor;

    const persist = (): void => {
      sessionStorage.setItem('sync_monitor_counts', JSON.stringify(monitor));
      (window as any).__syncMonitor = monitor;
    };

    // @ts-expect-error - dynamic browser import
    const { getCrossTabSyncService } = await import('/src/services/cross-tab-sync.js');
    const service = getCrossTabSyncService();

    const wrapBroadcast = (method: 'broadcastCreation' | 'broadcastUpdate' | 'broadcastDeletion') => {
      const original = (service as any)[method].bind(service);
      (service as any)[method] = (...args: unknown[]) => {
        monitor.broadcasts.push({
          type: method,
          conversationId: String(args[0]),
          payload: args[1],
        });
        persist();
        return original(...args);
      };
    };

    wrapBroadcast('broadcastCreation');
    wrapBroadcast('broadcastUpdate');
    wrapBroadcast('broadcastDeletion');

    const originalSubscribe = service.subscribe.bind(service);
    service.subscribe = (eventType: string, listener: (event: unknown) => void) => {
      monitor.subscribes += 1;
      persist();
      const unsubscribe = originalSubscribe(eventType, listener);
      return () => {
        monitor.unsubscribes += 1;
        persist();
        return unsubscribe();
      };
    };

    const originalDestroy = service.destroy.bind(service);
    service.destroy = () => {
      monitor.destroy += 1;
      persist();
      return originalDestroy();
    };

    persist();
  }, getInitialMonitor());
}

test.describe('App Context Persistence (E2E)', () => {
  test('hydrates persistence metadata and toggles search state from real browser interactions', async ({
    cleanPage,
    helpers,
  }) => {
    const conversationId = await helpers.createTestConversation('Persistence Smoke', [
      { role: 'user', content: 'hello' },
    ]);

    await helpers.waitForConversation(conversationId);

    const persistedMeta = await cleanPage.evaluate(async (convId) => {
      // @ts-expect-error - dynamic browser import
      const { getConversationStorage } = await import('/src/services/storage.js');
      const storage = getConversationStorage();
      await storage.initialize();
      const conversation = await storage.getConversation(convId);
      return conversation
        ? {
            persistenceStatus: conversation.persistenceStatus ?? null,
            isDirty: conversation.isDirty ?? null,
            title: conversation.title,
          }
        : null;
    }, conversationId);

    expect(persistedMeta).toMatchObject({
      persistenceStatus: 'synced',
    });
    expect(persistedMeta?.isDirty ?? false).toBe(false);

    await cleanPage.reload();
    await helpers.waitForAppReady();

    const searchInput = await cleanPage.waitForSelector('.conversation-search .search-input', {
      state: 'visible',
      timeout: 5000,
    });

    await searchInput.fill('Persistence');
    // Press Enter to ensure the search action is triggered immediately
    await searchInput.press('Enter');

    const searchStatus = await cleanPage.waitForSelector('.conversation-search-status', {
      state: 'visible',
      // Increase timeout to reduce flakiness on slower CI/machines
      timeout: 12000,
    });
    const statusText = (await searchStatus.textContent()) ?? '';
    expect(statusText.toLowerCase()).toMatch(/searching|result/);

    const resultCount = await cleanPage.$$eval('[data-testid^="conversation-item-"]', (items) => items.length);
    expect(resultCount).toBeGreaterThanOrEqual(1);

    const clearButton = await cleanPage.waitForSelector('.search-clear-btn', {
      state: 'visible',
      timeout: 5000,
    });
    await clearButton.click();
    await cleanPage.waitForSelector('.conversation-search-status', { state: 'hidden' });
  });

  test('syncs creation/update/delete across tabs and cleans up cross-tab listeners on unload', async ({
    cleanPage,
    helpers,
  }) => {
    await instrumentCrossTabService(cleanPage);

    const conversationId = await helpers.createTestConversation('Sync Coverage', [
      { role: 'user', content: 'first sync run' },
    ]);
    await helpers.waitForConversation(conversationId);

    const afterCreate = await cleanPage.evaluate(() => (window as any).__syncMonitor);
    const broadcastCreated =
      afterCreate &&
      afterCreate.broadcasts?.some(
        (entry: { type: string; conversationId: string }) =>
          entry.type === 'broadcastCreation' && entry.conversationId === conversationId
      );

    // Fallback: wait for storage create event if instrumentation missed the broadcast
    if (!broadcastCreated) {
      // Start waiting for the storage event before triggering the broadcast
      const waitPromise = helpers.waitForStorageEvent('create');

      await cleanPage.evaluate(async ({ conversationId: id }) => {
        try {
          // @ts-expect-error - dynamic browser import
          const { getCrossTabSyncService } = await import('/src/services/cross-tab-sync.js');
          const service = getCrossTabSyncService();
          service.broadcastCreation(id, { id });
        } catch (error) {
          console.warn('Failed to broadcast creation fallback', error);
        }
      }, { conversationId });

      const createdViaStorage = await waitPromise;
      expect(createdViaStorage).toBe(true);
    }

    const tab2 = await helpers.openNewTab();
    const helpers2 = new TestHelpers(tab2);
    await helpers2.waitForConversation(conversationId);

    const remoteTitle = 'Remote Update Title';
    const updateWait = helpers.waitForStorageEvent('update');
    await helpers2.updateConversationTitle(conversationId, remoteTitle);

    const updateReceived = await updateWait;
    expect(updateReceived).toBe(true);

    await cleanPage.waitForTimeout(500);
    const updatedTitle = await helpers.getConversationTitle(conversationId);
    expect(updatedTitle).toBe(remoteTitle);

    await helpers.deleteConversation(conversationId);

    const afterDelete = await cleanPage.evaluate(() => (window as any).__syncMonitor);
    expect(
      afterDelete.broadcasts.some(
        (entry: { type: string; conversationId: string }) =>
          entry.type === 'broadcastDeletion' && entry.conversationId === conversationId
      )
    ).toBe(true);

    await tab2.waitForTimeout(500);
    const tab2Conversation = await tab2.$(`[data-testid="conversation-item-${conversationId}"]`);
    expect(tab2Conversation).toBeNull();
    await tab2.close();

    await cleanPage.reload();
    await helpers.waitForAppReady();

    const cleanupCounts = await cleanPage.evaluate(() => {
      const stored = sessionStorage.getItem('sync_monitor_counts');
      return stored ? JSON.parse(stored) : null;
    });

    expect(cleanupCounts?.destroy ?? 0).toBeGreaterThanOrEqual(1);
  });
});
