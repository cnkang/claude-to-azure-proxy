import { describe, expect, it } from 'vitest';
import i18n, { i18nUtils, DEFAULT_LANGUAGE } from '../i18n/index';

describe('i18n Utilities', () => {
  it('returns supported languages list', () => {
    const languages = i18nUtils.getAvailableLanguages();
    expect(Array.isArray(languages)).toBe(true);
    expect(languages.some((item) => item.code === DEFAULT_LANGUAGE)).toBe(true);
  });

  it('exposes the current language', () => {
    expect(typeof i18n.language).toBe('string');
  });
});
