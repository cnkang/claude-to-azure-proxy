import { vi } from 'vitest';
import type { UseSessionReturn } from '../../hooks/useSession.js';
import type { SessionState, UserPreferences } from '../../types/index.js';

const createSessionState = (
  overrides?: Partial<SessionState>
): SessionState => ({
  sessionId: overrides?.sessionId ?? 'session-test',
  preferences: {
    theme: overrides?.preferences?.theme ?? 'light',
    language: overrides?.preferences?.language ?? 'en',
    selectedModel: overrides?.preferences?.selectedModel ?? 'gpt-4o',
  },
  createdAt: overrides?.createdAt ?? new Date('2024-01-01T00:00:00.000Z'),
});

/**
 * Factory for a mock implementation of UseSessionReturn that can be
 * reused across tests requiring a stable session context.
 */
export const createUseSessionMock = (
  overrides?: Partial<UseSessionReturn>
): UseSessionReturn => {
  const sessionState =
    overrides?.session ?? createSessionState(overrides?.session ?? undefined);

  const base: UseSessionReturn = {
    session: sessionState,
    sessionId: sessionState.sessionId,
    isSessionValid: true,
    isLoading: false,
    updatePreferences: vi.fn<(preferences: Partial<UserPreferences>) => void>(),
    resetSession: vi.fn(),
    validateConversationAccess: vi.fn().mockReturnValue(true),
    generateConversationId: vi.fn().mockReturnValue('conv-mock'),
    getSessionStoragePrefix: vi
      .fn()
      .mockReturnValue(`${sessionState.sessionId}-`),
    storageAvailable: { sessionStorage: true, localStorage: true },
    storageUsage: { used: 0, quota: 1024 },
    clearAllSessionData: vi.fn(),
  };

  if (overrides === undefined) {
    return base;
  }

  return {
    ...base,
    ...overrides,
    session: overrides.session ?? base.session,
    sessionId: overrides.sessionId ?? base.sessionId,
    storageAvailable: overrides.storageAvailable ?? base.storageAvailable,
    storageUsage: overrides.storageUsage ?? base.storageUsage,
    updatePreferences: overrides.updatePreferences ?? base.updatePreferences,
    resetSession: overrides.resetSession ?? base.resetSession,
    validateConversationAccess:
      overrides.validateConversationAccess ?? base.validateConversationAccess,
    generateConversationId:
      overrides.generateConversationId ?? base.generateConversationId,
    getSessionStoragePrefix:
      overrides.getSessionStoragePrefix ?? base.getSessionStoragePrefix,
    clearAllSessionData:
      overrides.clearAllSessionData ?? base.clearAllSessionData,
  };
};
