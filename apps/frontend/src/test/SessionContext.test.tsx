import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SessionProvider,
  SessionGuard,
  SessionDebugInfo,
  useSessionContext,
  useSessionError,
  useSessionPreferences,
  withSession,
} from '../contexts/SessionContext.js';
import { createUseSessionMock } from './mocks/session-context.js';

const { useSessionMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
}));

vi.mock('../hooks/useSession.js', () => ({
  useSession: useSessionMock,
}));

const createSessionValue = (
  overrides?: Parameters<typeof createUseSessionMock>[0]
) =>
  createUseSessionMock({
    isLoading: false,
    isSessionValid: true,
    session: {
      sessionId: 'session-ctx',
      preferences: {
        theme: 'auto',
        language: 'en',
        selectedModel: 'gpt-4o',
      },
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    },
    sessionId: 'session-ctx',
    storageAvailable: {
      sessionStorage: true,
      localStorage: true,
    },
    storageUsage: {
      used: 512,
      quota: 1024,
    },
    ...overrides,
  });

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <SessionProvider>{children}</SessionProvider>
);

describe('SessionContext', () => {
  beforeEach(() => {
    useSessionMock.mockReturnValue(createSessionValue());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('exposes session context values', () => {
    const { result } = renderHook(() => useSessionContext(), { wrapper });

    expect(result.current.isInitialized).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.sessionId).toBe('session-ctx');
    expect(result.current.isSessionValid).toBe(true);
  });

  it('reports storage availability errors when session storage missing', () => {
    useSessionMock.mockReturnValue(
      createSessionValue({
        storageAvailable: {
          sessionStorage: false,
          localStorage: true,
        },
      })
    );

    const { result } = renderHook(() => useSessionContext(), { wrapper });
    expect(result.current.error).toContain('Session storage is not available');
  });

  it('SessionGuard renders fallback during initialization and invalid state', () => {
    useSessionMock.mockReturnValue(
      createSessionValue({
        isLoading: true,
      })
    );
    render(
      <SessionProvider>
        <SessionGuard fallback={<span>loading</span>}>
          <span>content</span>
        </SessionGuard>
      </SessionProvider>
    );
    expect(screen.getByText('loading')).toBeInTheDocument();

    useSessionMock.mockReturnValue(
      createSessionValue({
        isSessionValid: false,
      })
    );
    render(
      <SessionProvider>
        <SessionGuard fallback={<span>fallback</span>}>
          <span>content</span>
        </SessionGuard>
      </SessionProvider>
    );
    expect(screen.getByText('fallback')).toBeInTheDocument();
  });

  it('SessionDebugInfo renders details in development mode', () => {
    vi.stubEnv('DEV', 'true');

    render(
      <SessionProvider>
        <SessionDebugInfo />
      </SessionProvider>
    );

    expect(screen.getByText(/Session Debug Info/)).toBeInTheDocument();
    expect(screen.getByText(/Session ID/)).toBeInTheDocument();
  });

  it('SessionDebugInfo returns null outside development', () => {
    vi.stubEnv('DEV', '');

    const { container } = render(
      <SessionProvider>
        <SessionDebugInfo />
      </SessionProvider>
    );

    expect(container.firstChild).toBeNull();
  });

  it('withSession wraps component in provider', () => {
    const Probe: React.FC = () => {
      const context = useSessionContext();
      return <span data-testid="session-id">{context.sessionId}</span>;
    };

    const Wrapped = withSession(Probe);

    render(<Wrapped />);
    expect(screen.getByTestId('session-id').textContent).toBe('session-ctx');
  });

  it('useSessionError triggers reset for invalid sessions', () => {
    const resetSpy = vi.fn();
    useSessionMock.mockReturnValue(
      createSessionValue({
        isSessionValid: false,
        resetSession: resetSpy,
        error: 'validation error',
      })
    );

    const { result } = renderHook(() => useSessionError(), { wrapper });
    expect(result.current.hasSessionError).toBe(true);

    act(() => {
      result.current.handleSessionError('validation error');
    });

    expect(resetSpy).toHaveBeenCalled();
  });

  it('useSessionPreferences proxies preference updates', () => {
    const updatePreferencesSpy = vi.fn();
    useSessionMock.mockReturnValue(
      createSessionValue({
        updatePreferences: updatePreferencesSpy,
      })
    );

    const { result } = renderHook(() => useSessionPreferences(), { wrapper });
    expect(result.current.preferences?.theme).toBe('auto');

    act(() => {
      result.current.setTheme('dark');
      result.current.setLanguage('zh');
      result.current.setSelectedModel('gpt-4o-mini');
      result.current.updatePreferences({ theme: 'light' });
    });

    expect(updatePreferencesSpy).toHaveBeenCalledTimes(4);
    expect(updatePreferencesSpy).toHaveBeenCalledWith({ theme: 'dark' });
    expect(updatePreferencesSpy).toHaveBeenCalledWith({ language: 'zh' });
    expect(updatePreferencesSpy).toHaveBeenCalledWith({
      selectedModel: 'gpt-4o-mini',
    });
    expect(updatePreferencesSpy).toHaveBeenCalledWith({ theme: 'light' });
  });

  it('useSessionPreferences handles missing session gracefully', () => {
    const base = createSessionValue();
    useSessionMock.mockReturnValue({
      ...base,
      session: null,
      sessionId: null,
    });

    const { result } = renderHook(() => useSessionPreferences(), { wrapper });
    expect(result.current.preferences).toBeUndefined();
  });
});
