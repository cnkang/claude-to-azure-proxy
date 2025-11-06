import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n, {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  handleFailedLoading,
  handleLanguageChanged,
  i18nUtils,
} from '../i18n/index.js';
import { frontendLogger } from '../utils/logger.js';

const resetDocumentLanguage = (): void => {
  document.documentElement.lang = DEFAULT_LANGUAGE;
  document.documentElement.dir = 'ltr';
};

const setI18nLanguage = (language: string): void => {
  Object.defineProperty(i18n, 'language', {
    configurable: true,
    writable: true,
    value: language,
  });
};

describe('i18n core configuration', () => {
  beforeEach(() => {
    resetDocumentLanguage();
    setI18nLanguage(DEFAULT_LANGUAGE);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    setI18nLanguage(DEFAULT_LANGUAGE);
  });

  it('updates document attributes and logs when language changes', () => {
    const infoSpy = vi.spyOn(frontendLogger, 'info');

    handleLanguageChanged('zh');

    expect(document.documentElement.lang).toBe('zh');
    expect(document.documentElement.dir).toBe('ltr');
    expect(infoSpy).toHaveBeenCalledWith(
      'Language changed',
      expect.objectContaining({ metadata: { language: 'zh' } })
    );

    handleLanguageChanged('ar');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('logs failures to load namespaces', () => {
    const errorSpy = vi.spyOn(frontendLogger, 'error');
    handleFailedLoading('en', 'translation', 'network-error');

    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to load translation namespace',
      expect.objectContaining({
        metadata: {
          language: 'en',
          namespace: 'translation',
          message: 'network-error',
        },
      })
    );
  });

  it('exposes language utility helpers with proper fallbacks', async () => {
    expect(i18nUtils.isLanguageSupported('en')).toBe(true);
    expect(i18nUtils.isLanguageSupported('fr')).toBe(false);

    const changeSpy = vi
      .spyOn(i18n, 'changeLanguage')
      .mockImplementation(async (language) => {
        setI18nLanguage(language);
      });

    await i18nUtils.changeLanguage('zh');
    expect(changeSpy).toHaveBeenCalledWith('zh');
    expect(i18nUtils.getCurrentLanguage()).toBe('zh');

    const originalLangDescriptor = Object.getOwnPropertyDescriptor(
      i18n,
      'language'
    );
    Object.defineProperty(i18n, 'language', {
      configurable: true,
      writable: true,
      value: 'unsupported',
    });

    expect(i18nUtils.getCurrentLanguage()).toBe(DEFAULT_LANGUAGE);

    if (originalLangDescriptor) {
      Object.defineProperty(i18n, 'language', originalLangDescriptor);
    } else {
      setI18nLanguage(DEFAULT_LANGUAGE);
    }

    changeSpy.mockRestore();

    const allLanguages = i18nUtils.getAvailableLanguages();
    expect(allLanguages).toHaveLength(SUPPORTED_LANGUAGES.length);
    expect(allLanguages.map((lang) => lang.code)).toEqual(
      Array.from(SUPPORTED_LANGUAGES)
    );
  });

  it('formats numbers, dates, and relative times consistently', () => {
    const formattedNumber = i18nUtils.formatNumber(1234.5, 'en');
    expect(formattedNumber).toContain('1');

    const formattedDate = i18nUtils.formatDate(
      new Date('2024-03-01T00:00:00Z'),
      undefined,
      'en'
    );
    expect(formattedDate).toContain('2024');

    const justNow = i18nUtils.formatRelativeTime(
      new Date(Date.now() - 20_000),
      'en'
    );
    const minutesAgo = i18nUtils.formatRelativeTime(
      new Date(Date.now() - 10 * 60_000),
      'en'
    );
    const hoursAgo = i18nUtils.formatRelativeTime(
      new Date(Date.now() - 3 * 60 * 60_000),
      'en'
    );
    const daysAgo = i18nUtils.formatRelativeTime(
      new Date(Date.now() - 3 * 24 * 60 * 60_000),
      'en'
    );
    const fallback = i18nUtils.formatRelativeTime(
      new Date(Date.now() - 14 * 24 * 60 * 60_000),
      'en'
    );

    expect(justNow).toBe(i18n.t('time.justNow'));
    expect(minutesAgo).toBe(i18n.t('time.minutesAgo', { count: 10 }));
    expect(hoursAgo).toBe(i18n.t('time.hoursAgo', { count: 3 }));
    expect(daysAgo).toBe(i18n.t('time.daysAgo', { count: 3 }));
    expect(fallback).toContain('202');
  });

  it('rethrows when changeLanguage rejects', async () => {
    const changeSpy = vi
      .spyOn(i18n, 'changeLanguage')
      .mockRejectedValue(new Error('denied'));

    await expect(i18nUtils.changeLanguage('en')).rejects.toThrow('denied');
    expect(changeSpy).toHaveBeenCalledWith('en');

    changeSpy.mockRestore();
  });
});
