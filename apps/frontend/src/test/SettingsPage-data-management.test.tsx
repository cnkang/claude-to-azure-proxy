import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from '../pages/SettingsPage.js';

const setThemeMode = vi.fn();
const setLanguage = vi.fn();
const resetSession = vi.fn().mockResolvedValue(undefined);
const deleteMultipleConversations = vi.fn().mockResolvedValue(undefined);
const exportConversations = vi.fn().mockResolvedValue(
  JSON.stringify({ conversations: [], exportedAt: '2024-01-01' })
);
const clearAllData = vi.fn().mockResolvedValue(undefined);

const translationMap: Record<string, string> = {
  'settings.title': 'Settings',
  'settings.description': 'Configure your experience.',
  'settings.appearance.title': 'Theme',
  'settings.appearance.description': 'Choose theme.',
  'settings.appearance.theme': 'Theme mode',
  'settings.appearance.light': 'Light',
  'settings.appearance.dark': 'Dark',
  'settings.appearance.auto': 'Auto',
  'settings.appearance.autoHint': 'Auto uses {{current}} mode',
  'settings.language.title': 'Language',
  'settings.language.description': 'Select language.',
  'settings.language.select': 'Language',
  'settings.storage.title': 'Storage',
  'settings.storage.description': 'Usage',
  'settings.storage.conversations': 'Conversations',
  'settings.storage.messages': 'Messages',
  'settings.session.title': 'Session',
  'settings.session.description': 'Session info',
  'settings.session.id': 'Session ID',
  'settings.session.created': 'Created',
  'settings.data.title': 'Data Management',
  'settings.data.description': 'Manage stored data',
  'settings.data.export': 'Export data',
  'settings.data.exporting': 'Exporting…',
  'settings.data.clearConversations': 'Clear conversations',
  'settings.data.resetSession': 'Reset session',
  'settings.data.clearAll': 'Clear all data',
  'settings.data.clearingConversations': 'Clearing conversations…',
  'settings.data.resettingSession': 'Resetting session…',
  'settings.data.clearingAllData': 'Clearing all data…',
  'settings.confirm.clearConversations.title': 'Confirm clear',
  'settings.confirm.clearConversations.message':
    'Are you sure you want to remove all conversations?',
  'settings.confirm.resetSession.title': 'Confirm reset',
  'settings.confirm.resetSession.message': 'Reset current session?',
  'settings.confirm.clearAll.title': 'Confirm clear all',
  'settings.confirm.clearAll.message': 'Remove all stored data?',
  'settings.processing.title': 'Processing',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.processing': 'Working…',
};

vi.mock('../contexts/ThemeContext.js', () => ({
  useTheme: () => ({
    themeMode: 'auto' as const,
    setThemeMode,
    systemPrefersDark: false,
  }),
}));

vi.mock('../contexts/I18nContext.js', () => ({
  useI18n: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const template = translationMap[key] ?? key;
      if (!options) {
        return template;
      }
      return template.replace(/{{(.*?)}}/g, (_, token: string) =>
        String(options[token.trim() as keyof typeof options] ?? '')
      );
    },
    language: 'en',
    setLanguage,
    supportedLanguages: [
      { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸', rtl: false },
      { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳', rtl: false },
    ],
    formatFileSize: (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`,
  }),
}));

vi.mock('../contexts/SessionContext.js', () => ({
  useSessionContext: () => ({
    session: {
      sessionId: 'session-123',
      preferences: {
        theme: 'auto',
        language: 'en',
        selectedModel: 'gpt-4o',
      },
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    },
    storageUsage: {
      used: 2048,
      quota: 8192,
    },
    resetSession,
  }),
}));

vi.mock('../hooks/useConversations.js', () => ({
  useConversations: () => ({
    conversations: [
      {
        id: 'conv-1',
        title: 'Conversation 1',
        selectedModel: 'gpt-4o',
        createdAt: new Date('2024-02-01T10:00:00.000Z'),
        updatedAt: new Date('2024-02-01T10:00:00.000Z'),
        sessionId: 'session-123',
        isStreaming: false,
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Hello',
            timestamp: new Date(),
            correlationId: 'corr-1',
            conversationId: 'conv-1',
            isComplete: true,
          },
        ],
        modelHistory: [],
        contextUsage: {
          currentTokens: 0,
          maxTokens: 128000,
          warningThreshold: 80,
          canExtend: false,
          isExtended: false,
        },
        compressionHistory: [],
      },
    ],
    deleteMultipleConversations,
    exportConversations,
  }),
}));

vi.mock('../hooks/useStorage.js', () => ({
  useStorage: () => ({
    clearAllData,
    state: {
      isClearing: false,
    },
  }),
}));

vi.mock('../components/layout/AppLayout.js', () => ({
  LayoutContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout">{children}</div>
  ),
}));

vi.mock('../utils/logger.js', () => ({
  frontendLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('SettingsPage data management', () => {
  const originalCreateElement = document.createElement.bind(document);
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    deleteMultipleConversations.mockClear();
    exportConversations.mockClear();
    resetSession.mockClear();
    clearAllData.mockClear();
    setLanguage.mockClear();
    setThemeMode.mockClear();
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('exports conversations and triggers file download', async () => {
    const anchor = originalCreateElement('a');
    const clickSpy = vi.spyOn(anchor, 'click').mockImplementation(() => {});

    URL.createObjectURL = vi.fn().mockReturnValue('blob://export');
    URL.revokeObjectURL = vi.fn();
    document.createElement = vi.fn().mockImplementation((tag: string) => {
      if (tag === 'a') {
        return anchor;
      }
      return originalCreateElement(tag);
    });

    render(<SettingsPage />);

    const exportButton = screen.getByRole('button', { name: /export data/i });
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(exportConversations).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob://export');
    });
  });

  it('clears conversations after confirmation', async () => {
    render(<SettingsPage />);

    const clearButton = screen.getByRole('button', { name: /clear conversations/i });
    fireEvent.click(clearButton);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /confirm clear/i })).toBeDefined()
    );

    const confirmButton = screen.getByRole('button', { name: /confirm/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(deleteMultipleConversations).toHaveBeenCalledWith(['conv-1']);
    });
  });

  it('clears all data and resets session', async () => {
    render(<SettingsPage />);

    const clearAllButton = screen.getByRole('button', { name: /clear all data/i });
    fireEvent.click(clearAllButton);

    const confirmButton = await screen.findByRole('button', { name: /confirm/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(clearAllData).toHaveBeenCalledTimes(1);
      expect(resetSession).toHaveBeenCalledTimes(1);
    });
  });
});
