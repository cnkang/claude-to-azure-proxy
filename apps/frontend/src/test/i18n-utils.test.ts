import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n, { i18nUtils, SUPPORTED_LANGUAGES } from '../i18n/index.js';
import { frontendLogger } from '../utils/logger.js';

describe('i18n utilities', () => {
  beforeEach(() => {
    vi.spyOn(frontendLogger, 'info').mockImplementation(() => {});
    vi.spyOn(frontendLogger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes supported languages', () => {
    expect(SUPPORTED_LANGUAGES).toContain('en');
    expect(SUPPORTED_LANGUAGES).toContain('zh');
  });

  it('validates supported languages', () => {
    expect(i18nUtils.isLanguageSupported('en')).toBe(true);
    expect(i18nUtils.isLanguageSupported('zh')).toBe(true);
    expect(i18nUtils.isLanguageSupported('fr')).toBe(false);
  });

  it('changes language through i18n instance', async () => {
    const changeSpy = vi.spyOn(i18n, 'changeLanguage');
    await i18nUtils.changeLanguage('zh');
    expect(changeSpy).toHaveBeenCalledWith('zh');
    changeSpy.mockRestore();
  });

  it('propagates errors when language change fails', async () => {
    const changeSpy = vi
      .spyOn(i18n, 'changeLanguage')
      .mockRejectedValue(new Error('network'));
    await expect(i18nUtils.changeLanguage('en')).rejects.toThrow('network');
    changeSpy.mockRestore();
  });

  it('returns current language when supported', () => {
    const languageSpy = vi.spyOn(i18n, 'language', 'get').mockReturnValue('zh');
    expect(i18nUtils.getCurrentLanguage()).toBe('zh');
    languageSpy.mockRestore();
  });

  // Additional configuration events are exercised indirectly via integration suites.
});
