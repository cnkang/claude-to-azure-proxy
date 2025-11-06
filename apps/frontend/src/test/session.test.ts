import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionManager } from '../services/session.js';
import { useSession, useSessionStorage } from '../hooks/useSession.js';

describe('SessionManager', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    SessionManager.getInstance().resetSession();
  });

  it('creates isolated sessions and manages preferences securely', () => {
    const manager = SessionManager.getInstance();
    const sessionId = manager.getSessionId();
    expect(sessionId).not.toBeNull();
    if (sessionId === null) {
      throw new Error('Session ID should not be null');
    }
    expect(sessionId).toMatch(/^session_/);

    const conversationId = manager.generateConversationId();
    expect(conversationId).toContain(sessionId);
    expect(manager.validateConversationAccess(sessionId)).toBe(true);
    expect(manager.validateConversationAccess('session-other')).toBe(false);

    manager.updatePreferences({ theme: 'dark' });
    const storedPreferences = localStorage.getItem('claude-proxy-preferences');
    expect(storedPreferences).toContain('"theme":"dark"');

    manager.resetSession();
    const newSessionId = manager.getSessionId();
    expect(newSessionId).not.toBeNull();
    expect(newSessionId).not.toBe(sessionId);
  });
});

describe('useSession hook', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    SessionManager.getInstance().resetSession();
  });

  it('exposes reactive session state and responds to resets', async () => {
    const manager = SessionManager.getInstance();
    const initialSessionId = manager.getSessionId();

    const { result } = renderHook(() => useSession());

    await act(async () => {});
    expect(result.current.isLoading).toBe(false);
    expect(result.current.sessionId).toBe(initialSessionId);

    act(() => {
      result.current.updatePreferences({ language: 'zh' });
    });

    await waitFor(() => {
      expect(result.current.session?.preferences.language).toBe('zh');
    });

    act(() => {
      manager.resetSession();
    });

    await waitFor(() => {
      expect(result.current.sessionId).not.toBe(initialSessionId);
    });
  });

  it('handles invalidation events and storage helpers', async () => {
    vi.useFakeTimers();
    const manager = SessionManager.getInstance();
    const { result } = renderHook(() => useSession());

    await act(async () => {});
    expect(result.current.isLoading).toBe(false);

    act(() => {
      window.dispatchEvent(new CustomEvent('sessionInvalidated'));
    });

    expect(result.current.isSessionValid).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(result.current.isSessionValid).toBe(true);

    act(() => {
      result.current.clearAllSessionData();
    });

    expect(manager.getCurrentSession()).not.toBeNull();
    vi.useRealTimers();
  });

  it('provides session-scoped storage utilities', async () => {
    const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
      children as React.ReactElement;
    const { result } = renderHook(
      () => useSessionStorage('setting', 'default'),
      { wrapper }
    );

    expect(result.current[0]).toBe('default');

    act(() => {
      result.current[1]('updated');
    });

    expect(result.current[0]).toBe('updated');
  });
});
