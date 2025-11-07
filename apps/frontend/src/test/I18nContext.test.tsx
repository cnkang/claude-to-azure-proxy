import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../contexts/AppContext.js';
import { SessionProvider } from '../contexts/SessionContext.js';
import {
  I18nProvider,
  LanguageSelector,
  TextDirection,
  useI18n,
  withI18n,
} from '../contexts/I18nContext.js';
import { TestWrapper } from './test-wrapper.js';
import { createUseSessionMock } from './mocks/session-context.js';

const useSessionMock = createUseSessionMock();
const updatePreferencesSpy = useSessionMock.updatePreferences;

vi.mock('../hooks/useSession.js', () => ({
  useSession: () => useSessionMock,
}));

const translations: Record<string, string> = {
  'app.title': 'AI Chat Assistant',
  'language.select': 'Select language',
  'fileUpload.preview.loading': 'Loading preview…',
  'fileUpload.preview.unknownType': 'Unknown type',
  'common.close': 'Close',
  'common.retry': 'Retry',
};

const changeLanguageSpy = vi
  .fn()
  .mockImplementation(async (language: string) => {
    activeLanguage = language;
  });

let activeLanguage: 'en' | 'zh' = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => {
      if (key === 'chat.showAllLines') {
        return `Show all (${options?.count ?? 0} lines)`;
      }
      return translations[key] ?? key;
    },
    i18n: {
      language: activeLanguage,
      changeLanguage: changeLanguageSpy,
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
}));

beforeEach(() => {
  activeLanguage = 'en';
  changeLanguageSpy.mockClear();
  updatePreferencesSpy.mockClear();
  useSessionMock.session = {
    ...useSessionMock.session!,
    preferences: {
      ...useSessionMock.session!.preferences,
      language: 'en',
      theme: 'light',
    },
  };
  useSessionMock.sessionId = useSessionMock.session!.sessionId;
});

const I18nConsumer: React.FC = () => {
  const {
    language,
    languageInfo,
    supportedLanguages,
    t,
    setLanguage,
    formatDate,
    formatNumber,
    formatFileSize,
    formatRelativeTime,
  } = useI18n();

  return (
    <div>
      <span data-testid="language-code">{language}</span>
      <span data-testid="language-flag">{languageInfo.flag}</span>
      <span data-testid="supported-count">{supportedLanguages.length}</span>
      <span data-testid="translated-text">{t('app.title')}</span>
      <span data-testid="formatted-date">
        {formatDate(new Date('2024-01-15T10:00:00.000Z'))}
      </span>
      <span data-testid="formatted-number">{formatNumber(1234.56)}</span>
      <span data-testid="formatted-size">{formatFileSize(2048)}</span>
      <span data-testid="relative-time">
        {formatRelativeTime(new Date(Date.now() - 60_000))}
      </span>
      <button
        type="button"
        data-testid="switch-language"
        onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
      >
        Switch
      </button>
    </div>
  );
};

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <SessionProvider>
      <AppProvider>
        <I18nProvider>{ui}</I18nProvider>
      </AppProvider>
    </SessionProvider>
  );
};

describe('I18nProvider and context', () => {
  it('provides translations and formatting helpers', () => {
    render(
      <TestWrapper>
        <I18nConsumer />
      </TestWrapper>
    );

    expect(screen.getByTestId('language-code').textContent).toBe('en');
    expect(screen.getByTestId('language-flag').textContent).toBe('EN');
    expect(screen.getByTestId('supported-count').textContent).toBe('2');
    expect(screen.getByTestId('translated-text').textContent).toBe(
      'AI Chat Assistant'
    );
    expect(screen.getByTestId('formatted-date').textContent).toContain('2024');
    expect(screen.getByTestId('formatted-number').textContent).not.toHaveLength(
      0
    );
    expect(screen.getByTestId('formatted-size').textContent).toContain('KB');
    expect(screen.getByTestId('relative-time').textContent).not.toHaveLength(0);
  });

  it('switches language and syncs session preferences', async () => {
    render(
      <TestWrapper>
        <I18nConsumer />
      </TestWrapper>
    );

    fireEvent.click(screen.getByTestId('switch-language'));

    await waitFor(() => {
      expect(screen.getByTestId('language-code').textContent).toBe('zh');
    });

    expect(changeLanguageSpy).toHaveBeenCalledWith('zh');
    expect(updatePreferencesSpy).toHaveBeenCalledWith({ language: 'zh' });
  });

  it('renders language selector and handles changes', async () => {
    render(
      <TestWrapper>
        <LanguageSelector showFlag showNativeName />
      </TestWrapper>
    );

    const select = screen.getByRole('combobox', { name: /select language/i });
    expect(select).not.toBeNull();
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);

    fireEvent.change(select, { target: { value: 'zh' } });

    await waitFor(() => {
      expect(changeLanguageSpy).toHaveBeenCalledWith('zh');
    });
  });

  it('applies text direction attributes', () => {
    render(
      <TestWrapper>
        <TextDirection>
          <div data-testid="direction-content">Content</div>
        </TextDirection>
      </TestWrapper>
    );

    const container = screen.getByTestId('direction-content').parentElement;
    expect(container).not.toBeNull();
    if (container) {
      expect(container.getAttribute('dir')).toBe('ltr');
    }
  });

  it('withI18n HOC wraps components with provider', () => {
    const BareComponent: React.FC<{ label: string }> = ({ label }) => (
      <div data-testid="hoc-content">{label}</div>
    );
    const Wrapped = withI18n(BareComponent);

    renderWithProviders(<Wrapped label="wrapped" />);

    expect(screen.getByTestId('hoc-content').textContent).toBe('wrapped');
  });
});
