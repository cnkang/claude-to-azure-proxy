/**
 * Internationalization Configuration
 *
 * Sets up i18next with language detection and resource loading.
 * Supports English and Chinese with automatic browser language detection.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { frontendLogger } from '../utils/logger.js';

// Import translation resources
import enTranslations from './locales/en.js';
import zhTranslations from './locales/zh.js';

/**
 * Supported languages
 */
export const SUPPORTED_LANGUAGES = ['en', 'zh'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * Default language
 */
export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

/**
 * Language resources
 */
const resources = {
  en: {
    translation: enTranslations,
  },
  zh: {
    translation: zhTranslations,
  },
};

/**
 * Language detection configuration
 */
const detectionOptions = {
  // Detection order
  order: [
    'localStorage', // Check localStorage first
    'sessionStorage', // Then sessionStorage
    'navigator', // Then browser language
    'htmlTag', // Then html lang attribute
    'path', // Then URL path
    'subdomain', // Then subdomain
  ],

  // Cache user language
  caches: ['localStorage', 'sessionStorage'],

  // Exclude certain detection methods
  excludeCacheFor: ['cimode'],

  // Check for supported languages only
  checkWhitelist: true,
};

/**
 * i18next configuration
 */
const i18nConfig = {
  // Resources
  resources,

  // Default language
  fallbackLng: DEFAULT_LANGUAGE,

  // Supported languages
  supportedLngs: SUPPORTED_LANGUAGES,

  // Language detection
  detection: detectionOptions,

  // Interpolation options
  interpolation: {
    escapeValue: false, // React already escapes values
  },

  // React options
  react: {
    useSuspense: false, // We handle loading states manually
  },

  // Debug mode (only in development)
  debug: import.meta.env.DEV,

  // Namespace
  defaultNS: 'translation',

  // Key separator
  keySeparator: '.',

  // Nested separator
  nsSeparator: ':',

  // Pluralization
  pluralSeparator: '_',

  // Context separator
  contextSeparator: '_',

  // Return objects for nested keys
  returnObjects: false,

  // Return empty string for missing keys in production
  returnEmptyString: !import.meta.env.DEV,

  // Return null for missing keys in development
  returnNull: import.meta.env.DEV,

  // Join arrays
  joinArrays: ' ',

  // Load path for additional resources (if needed)
  // backend: {
  //   loadPath: '/locales/{{lng}}/{{ns}}.json',
  // },
};

/**
 * Initialize i18next
 */
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init(i18nConfig)
  .catch((error) => {
    frontendLogger.error('Failed to initialize i18n', {
      error: error instanceof Error ? error : new Error(String(error)),
    });
  });

/**
 * Handle document updates when the language changes.
 */
export const handleLanguageChanged = (lng: string): void => {
  document.documentElement.lang = lng;
  const isRTL = ['ar', 'he', 'fa'].includes(lng);
  document.documentElement.dir = isRTL ? 'rtl' : 'ltr';

  frontendLogger.info('Language changed', {
    metadata: { language: lng },
  });
};

/**
 * Handle logging when a namespace fails to load.
 */
export const handleFailedLoading = (
  lng: string,
  ns: string,
  msg: string
): void => {
  frontendLogger.error('Failed to load translation namespace', {
    metadata: {
      language: lng,
      namespace: ns,
      message: msg,
    },
  });
};

/**
 * Language change handler
 */
i18n.on('languageChanged', handleLanguageChanged);

/**
 * Error handler
 */
i18n.on('failedLoading', handleFailedLoading);

/**
 * Utility functions
 */
export const i18nUtils = {
  /**
   * Check if a language is supported
   */
  isLanguageSupported: (language: string): language is SupportedLanguage => {
    return SUPPORTED_LANGUAGES.includes(language as SupportedLanguage);
  },

  /**
   * Get the current language
   */
  getCurrentLanguage: (): SupportedLanguage => {
    const current = i18n.language;
    return i18nUtils.isLanguageSupported(current) ? current : DEFAULT_LANGUAGE;
  },

  /**
   * Change language
   */
  changeLanguage: async (language: SupportedLanguage): Promise<void> => {
    await i18n.changeLanguage(language);
  },

  /**
   * Get available languages
   */
  getAvailableLanguages: (): Array<{
    code: SupportedLanguage;
    name: string;
    nativeName: string;
  }> => {
    return SUPPORTED_LANGUAGES.map((code) => ({
      code,
      name: i18n.t(`languages.${code}`, { _lng: 'en' }),
      nativeName: i18n.t(`languages.${code}`, { _lng: code }),
    }));
  },

  /**
   * Format number with locale
   */
  formatNumber: (number: number, locale?: string): string => {
    const currentLocale = locale ?? i18nUtils.getCurrentLanguage();
    return new Intl.NumberFormat(currentLocale).format(number);
  },

  /**
   * Format date with locale
   */
  formatDate: (
    date: Date,
    options?: Intl.DateTimeFormatOptions,
    locale?: string
  ): string => {
    const currentLocale = locale ?? i18nUtils.getCurrentLanguage();
    return new Intl.DateTimeFormat(currentLocale, options).format(date);
  },

  /**
   * Format relative time
   */
  formatRelativeTime: (date: Date, locale?: string): string => {
    const currentLocale = locale ?? i18nUtils.getCurrentLanguage();
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) {
      return i18n.t('time.justNow');
    } else if (diffMinutes < 60) {
      return i18n.t('time.minutesAgo', { count: diffMinutes });
    } else if (diffHours < 24) {
      return i18n.t('time.hoursAgo', { count: diffHours });
    } else if (diffDays < 7) {
      return i18n.t('time.daysAgo', { count: diffDays });
    } else {
      return i18nUtils.formatDate(
        date,
        {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        },
        currentLocale
      );
    }
  },
};

export default i18n;
