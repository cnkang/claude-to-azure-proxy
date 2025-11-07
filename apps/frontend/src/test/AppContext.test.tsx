import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation } from '../types/index.js';
import {
  AppProvider,
  useAppContext,
  useConfig,
  useUI,
} from '../contexts/AppContext.js';

const updatePreferencesSpy = vi.fn();

const mockSession = {
  sessionId: 'session-123',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  preferences: {
    theme: 'dark',
    language: 'zh',
    selectedModel: 'gpt-4o',
  },
} as const;

beforeEach(() => {
  updatePreferencesSpy.mockReset();
});

vi.mock('../contexts/SessionContext.js', () => ({
  useSessionContext: () => ({
    session: mockSession,
    updatePreferences: updatePreferencesSpy,
  }),
}));

const createConversation = (
  overrides: Partial<Conversation> = {}
): Conversation => {
  const timestamp = new Date('2024-02-10T10:00:00.000Z');
  return {
    id: 'conv-1',
    title: 'First conversation',
    createdAt: timestamp,
    updatedAt: timestamp,
    sessionId: 'session-123',
    selectedModel: 'gpt-4o',
    isStreaming: false,
    messages: [],
    modelHistory: [],
    contextUsage: {
      currentTokens: 0,
      maxTokens: 128000,
      warningThreshold: 80,
      canExtend: false,
      isExtended: false,
    },
    compressionHistory: [],
    ...overrides,
  };
};

const renderUseAppContext = () => {
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <AppProvider>{children}</AppProvider>
  );

  return renderHook(() => useAppContext(), { wrapper });
};

const renderAppAndConfig = () => {
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <AppProvider>{children}</AppProvider>
  );

  return renderHook(
    () => ({
      app: useAppContext(),
      config: useConfig(),
    }),
    { wrapper }
  );
};

describe('AppContext', () => {
  it('throws when useAppContext is used outside the provider', () => {
    expect(() => renderHook(() => useAppContext())).toThrow(
      'useAppContext must be used within an AppProvider'
    );
  });

  it('syncs session preferences and forwards preference updates', async () => {
    const { result } = renderUseAppContext();

    await waitFor(() => {
      expect(result.current.state.ui.theme).toBe('dark');
      expect(result.current.state.ui.language).toBe('zh');
    });

    act(() => {
      result.current.setTheme('light');
      result.current.setLanguage('en');
    });

    expect(updatePreferencesSpy).toHaveBeenCalledWith({ theme: 'light' });
    expect(updatePreferencesSpy).toHaveBeenCalledWith({ language: 'en' });

    act(() => {
      result.current.setSidebarOpen(false);
      result.current.setLoading(true);
      result.current.setError('failure');
    });

    expect(result.current.state.ui.sidebarOpen).toBe(false);
    expect(result.current.state.ui.isLoading).toBe(true);
    expect(result.current.state.ui.error).toBe('failure');
  });

  it('exposes UI helpers with direct state bindings', () => {
    const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
      <AppProvider>{children}</AppProvider>
    );

    const { result } = renderHook(() => useUI(), { wrapper });

    act(() => {
      result.current.setLoading(true);
      result.current.setSidebarOpen(false);
    });

    expect(result.current.ui.isLoading).toBe(true);
    expect(result.current.ui.sidebarOpen).toBe(false);

    act(() => {
      result.current.setError('ui-error');
    });

    expect(result.current.ui.error).toBe('ui-error');
  });

  it('manages conversation lifecycle and sorting', () => {
    const { result } = renderUseAppContext();
    const firstConversation = createConversation();
    const updatedTimestamp = new Date('2024-02-11T12:00:00.000Z');

    act(() => {
      result.current.addConversation(firstConversation);
    });

    expect(result.current.conversationsList).toHaveLength(1);

    act(() => {
      result.current.setActiveConversation('conv-1');
    });

    expect(result.current.activeConversation?.id).toBe('conv-1');

    act(() => {
      result.current.updateConversation('conv-1', {
        title: 'Renamed',
        updatedAt: updatedTimestamp,
      });
    });

    expect(result.current.activeConversation?.title).toBe('Renamed');
    const latestUpdate = result.current.conversationsList[0]?.updatedAt;
    expect(latestUpdate).toBeInstanceOf(Date);
    expect(latestUpdate?.getTime()).toBeGreaterThanOrEqual(
      firstConversation.updatedAt.getTime()
    );

    act(() => {
      result.current.deleteConversation('conv-1');
    });

    expect(result.current.conversationsList).toHaveLength(0);
  });

  it('updates configuration and resets state', () => {
    const { result } = renderAppAndConfig();

    act(() => {
      result.current.config.setConfig({ availableModels: ['gpt-4', 'gpt-4o'] });
      result.current.app.setError('temporary');
    });

    expect(result.current.app.state.config.availableModels).toEqual([
      'gpt-4',
      'gpt-4o',
    ]);
    expect(result.current.app.state.ui.error).toBe('temporary');

    act(() => {
      result.current.app.resetState();
    });

    expect(result.current.app.state.ui.error).toBeUndefined();
    expect(result.current.app.state.ui.isLoading).toBe(false);
    expect(result.current.app.state.conversations.conversations.size).toBe(0);
    expect(result.current.app.state.ui.sidebarOpen).toBe(true);
  });
});
