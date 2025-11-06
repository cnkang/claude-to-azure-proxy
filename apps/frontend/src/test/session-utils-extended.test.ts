import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionManager, sessionUtils } from '../services/session.js';
import type { SessionState, UserPreferences } from '../types/index.js';

const recreateManager = (): SessionManager => {
  const existing = SessionManager.getInstance();
  existing.destroy();
  return SessionManager.getInstance();
};

const clearStorage = (): void => {
  sessionStorage.clear();
  localStorage.clear();
};

beforeEach(() => {
  clearStorage();
});

afterEach(() => {
  clearStorage();
  SessionManager.getInstance().destroy();
  // Rehydrate a clean singleton for other suites
  SessionManager.getInstance();
  vi.restoreAllMocks();
});

describe('SessionManager internal behaviour', () => {
  it('validates session integrity using fingerprint comparisons', () => {
    const manager = recreateManager();
    const internal = manager as unknown as {
      fingerprint: Record<string, unknown>;
      validateSessionIntegrity: (
        session: SessionState,
        validation: Record<string, unknown>
      ) => boolean;
      isScreenResolutionSimilar: (current: string, stored: string) => boolean;
      loadPreferences: () => UserPreferences;
    };

    const currentSession = manager.getCurrentSession();
    expect(currentSession).not.toBeNull();
    if (!currentSession) {
      throw new Error('Session should be initialised for integrity validation');
    }

    const baseValidation = {
      sessionId: currentSession.sessionId,
      fingerprint: internal.fingerprint,
      createdAt: Date.now(),
      lastValidated: Date.now(),
      isValid: true,
    };

    expect(
      internal.validateSessionIntegrity(currentSession, baseValidation)
    ).toBe(true);

    const mismatchedValidation = {
      ...baseValidation,
      fingerprint: {
        ...internal.fingerprint,
        userAgent: 'different-agent',
      },
    };
    expect(
      internal.validateSessionIntegrity(currentSession, mismatchedValidation)
    ).toBe(false);

    expect(internal.isScreenResolutionSimilar('1920x1080', '1920x1080')).toBe(
      true
    );
    expect(internal.isScreenResolutionSimilar('1920x1080', '1280x720')).toBe(
      false
    );
  });

  it('loads stored preferences and falls back to defaults when unavailable', () => {
    const manager = recreateManager();
    const internal = manager as unknown as {
      loadPreferences: () => UserPreferences;
    };

    localStorage.setItem(
      'claude-proxy-preferences',
      JSON.stringify({
        theme: 'dark',
        language: 'en',
        selectedModel: 'gpt-4o-mini',
      })
    );

    const persisted = internal.loadPreferences();
    expect(persisted.theme).toBe('dark');
    expect(persisted.selectedModel).toBe('gpt-4o-mini');

    localStorage.removeItem('claude-proxy-preferences');
    const languageSpy = vi
      .spyOn(navigator, 'language', 'get')
      .mockReturnValue('zh-CN');
    const fallback = internal.loadPreferences();
    expect(fallback.language).toBe('zh');
    languageSpy.mockRestore();
  });

  it('updates preferences, generates conversation IDs, and enforces session requirements', () => {
    const manager = recreateManager();
    const currentSession = manager.getCurrentSession();
    expect(currentSession).not.toBeNull();
    if (!currentSession) {
      throw new Error('Missing session for preference update test');
    }

    manager.updatePreferences({ theme: 'dark', language: 'zh' });
    const updated = manager.getCurrentSession();
    expect(updated?.preferences.theme).toBe('dark');
    expect(updated?.preferences.language).toBe('zh');

    const convoId = manager.generateConversationId();
    expect(convoId).toContain(currentSession.sessionId);
    expect(convoId.startsWith('conv_')).toBe(true);
    expect(manager.getSessionStoragePrefix()).toContain(
      currentSession.sessionId
    );

    (
      manager as unknown as { currentSession: SessionState | null }
    ).currentSession = null;
    expect(() => manager.generateConversationId()).toThrow('No active session');
    expect(() => manager.getSessionStoragePrefix()).toThrow(
      'No active session'
    );
  });
});

describe('sessionUtils helpers', () => {
  it('detects storage availability and handles failures', () => {
    expect(sessionUtils.isSessionStorageAvailable()).toBe(true);
    const originalSetItem = sessionStorage.setItem;
    sessionStorage.setItem = () => {
      throw new Error('quota');
    };
    expect(sessionUtils.isSessionStorageAvailable()).toBe(false);
    sessionStorage.setItem = originalSetItem;

    expect(sessionUtils.isLocalStorageAvailable()).toBe(true);
    const originalLocalSet = localStorage.setItem;
    localStorage.setItem = () => {
      throw new Error('quota');
    };
    expect(sessionUtils.isLocalStorageAvailable()).toBe(false);
    localStorage.setItem = originalLocalSet;
  });

  it('calculates storage usage and clears session-scoped entries', () => {
    sessionStorage.setItem('key', 'value');
    localStorage.setItem('claude-proxy-preferences', 'persisted');
    localStorage.setItem('session_other', 'value');

    const usage = sessionUtils.getSessionStorageUsage();
    expect(usage.used).toBeGreaterThanOrEqual(0);
    expect(usage.quota).toBe(5 * 1024 * 1024);

    sessionUtils.clearAllSessionData();
    expect(sessionStorage.getItem('key')).toBeNull();
  });
});
