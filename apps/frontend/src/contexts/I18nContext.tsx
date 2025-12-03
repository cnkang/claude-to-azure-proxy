/**
 * Internationalization Context Provider
 *
 * Provides i18n functionality with automatic browser language detection
 * and manual language switching with persistence.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

import type { TFunction } from 'i18next';
import type React from 'react';
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from './AppContext.js';

/**
 * Supported languages
 */
export type SupportedLanguage = 'en' | 'zh';

/**
 * Language info
 */
export interface LanguageInfo {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  flag: string;
  rtl: boolean;
}

/**
 * Available languages
 */
export const SUPPORTED_LANGUAGES: Record<SupportedLanguage, LanguageInfo> = {
  en: {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    flag: 'EN',
    rtl: false,
  },
  zh: {
    code: 'zh',
    name: 'Chinese',
    nativeName: '中文',
    flag: '中',
    rtl: false,
  },
};

/**
 * I18n context type
 */
export interface I18nContextType {
  // Current language
  language: SupportedLanguage;
  languageInfo: LanguageInfo;

  // Translation function
  t: TFunction;

  // Language actions
  setLanguage: (language: SupportedLanguage) => void;

  // Available languages
  supportedLanguages: LanguageInfo[];

  // Utilities
  isRTL: boolean;
  formatDate: (date: Date) => string;
  formatTime: (date: Date) => string;
  formatDateTime: (date: Date) => string;
  formatNumber: (number: number) => string;
  formatFileSize: (bytes: number) => string;
  formatRelativeTime: (date: Date) => string;
}

/**
 * I18n context
 */
const I18nContext = createContext<I18nContextType | null>(null);

/**
 * I18n provider props
 */
export interface I18nProviderProps {
  children: ReactNode;
}

/**
 * I18n provider component
 */
export function I18nProvider({
  children,
}: I18nProviderProps): React.JSX.Element {
  const { state, setLanguage: setAppLanguage } = useAppContext();
  const { t, i18n } = useTranslation();
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [isChanging, setIsChanging] = useState<boolean>(false);

  // Initialize i18n with app language
  useEffect(() => {
    const initializeLanguage = async (): Promise<void> => {
      try {
        const targetLanguage = state.ui.language;

        if (i18n.language !== targetLanguage) {
          await i18n.changeLanguage(targetLanguage);
        }

        setIsInitialized(true);
      } catch (_error) {
        setIsInitialized(true);
      }
    };

    initializeLanguage();
  }, [state.ui.language, i18n]);

  // Set language
  const setLanguage = (language: SupportedLanguage): void => {
    // Prevent multiple simultaneous language changes
    if (isChanging) {
      return;
    }

    // Prevent layout shift by batching updates
    void (async (): Promise<void> => {
      try {
        setIsChanging(true);

        // Update document attributes first to prevent flash
        document.documentElement.lang = language;

        // Change language
        await i18n.changeLanguage(language);

        // Update app state
        setAppLanguage(language);

        // Force a single reflow after all updates
        requestAnimationFrame(() => {
          // Trigger reflow by reading layout property
          void document.body.offsetHeight;
          setIsChanging(false);
        });
      } catch (_error) {
        setIsChanging(false);
      }
    })();
  };

  // Get current language info
  const currentLanguage: SupportedLanguage =
    i18n.language === 'zh' ? 'zh' : 'en';

  const languageInfo = SUPPORTED_LANGUAGES[currentLanguage];

  // Format utilities
  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat(currentLanguage, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  };

  const formatTime = (date: Date): string => {
    return new Intl.DateTimeFormat(currentLanguage, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const formatDateTime = (date: Date): string => {
    return new Intl.DateTimeFormat(currentLanguage, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const formatNumber = (number: number): string => {
    return new Intl.NumberFormat(currentLanguage).format(number);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) {
      return '0 B';
    }

    const k = 1024;
    const sizes =
      currentLanguage === 'zh'
        ? ['字节', 'KB', 'MB', 'GB', 'TB']
        : ['B', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const size = Number.parseFloat((bytes / k ** i).toFixed(2));

    const unit = sizes[i];
    if (!unit) {
      return `${formatNumber(size)} B`;
    }
    return `${formatNumber(size)} ${unit}`;
  };

  const formatRelativeTime = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) {
      return currentLanguage === 'zh' ? '刚刚' : 'Just now';
    } else if (diffMinutes < 60) {
      return currentLanguage === 'zh'
        ? `${diffMinutes}分钟前`
        : `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      return currentLanguage === 'zh'
        ? `${diffHours}小时前`
        : `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return currentLanguage === 'zh' ? `${diffDays}天前` : `${diffDays}d ago`;
    } else {
      return formatDate(date);
    }
  };

  const contextValue: I18nContextType = {
    language: currentLanguage,
    languageInfo,
    t,
    setLanguage,
    supportedLanguages: Object.values(SUPPORTED_LANGUAGES),
    isRTL: languageInfo.rtl,
    formatDate,
    formatTime,
    formatDateTime,
    formatNumber,
    formatFileSize,
    formatRelativeTime,
  };

  // Don't render until initialized
  if (!isInitialized) {
    return <div>Loading...</div>;
  }

  return (
    <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>
  );
}

/**
 * Hook to use i18n context
 */
export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }

  return context;
}

/**
 * Hook for localized formatting
 */
export function useLocalization(): {
  language: SupportedLanguage;
  formatDate: (date: Date) => string;
  formatTime: (date: Date) => string;
  formatDateTime: (date: Date) => string;
  formatNumber: (number: number) => string;
  formatFileSize: (bytes: number) => string;
  formatRelativeTime: (date: Date) => string;
} {
  const {
    formatDate,
    formatTime,
    formatDateTime,
    formatNumber,
    formatFileSize,
    language,
  } = useI18n();

  return {
    language,
    formatDate,
    formatTime,
    formatDateTime,
    formatNumber,
    formatFileSize,

    // Relative time formatting
    formatRelativeTime: (date: Date): string => {
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMinutes < 1) {
        return language === 'zh' ? '刚刚' : 'Just now';
      } else if (diffMinutes < 60) {
        return language === 'zh'
          ? `${diffMinutes}分钟前`
          : `${diffMinutes}m ago`;
      } else if (diffHours < 24) {
        return language === 'zh' ? `${diffHours}小时前` : `${diffHours}h ago`;
      } else if (diffDays < 7) {
        return language === 'zh' ? `${diffDays}天前` : `${diffDays}d ago`;
      } else {
        return formatDate(date);
      }
    },
  };
}

/**
 * Language selector component
 */
export interface LanguageSelectorProps {
  className?: string;
  showFlag?: boolean;
  showNativeName?: boolean;
  compact?: boolean;
}

export function LanguageSelector({
  className,
  showFlag = true,
  showNativeName = false,
  compact = false,
}: LanguageSelectorProps): React.JSX.Element {
  const { language, supportedLanguages, setLanguage, t } = useI18n();

  // Get display text for current language
  const getDisplayText = (lang: (typeof supportedLanguages)[0]): string => {
    if (compact) {
      // In compact mode, just show the flag (which is already short: "EN", "中")
      return lang.flag;
    }
    return `${showFlag ? `${lang.flag} ` : ''}${showNativeName ? lang.nativeName : lang.name}`;
  };

  return (
    <select
      value={language}
      onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
      className={className}
      aria-label={t('language.select')}
    >
      {supportedLanguages.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {getDisplayText(lang)}
        </option>
      ))}
    </select>
  );
}

/**
 * Text direction component
 */
export interface TextDirectionProps {
  children: ReactNode;
  className?: string;
}

export function TextDirection({
  children,
  className,
}: TextDirectionProps): React.JSX.Element {
  const { isRTL } = useI18n();

  return (
    <div
      className={className}
      dir={isRTL ? 'rtl' : 'ltr'}
      style={{ textAlign: isRTL ? 'right' : 'left' }}
    >
      {children}
    </div>
  );
}

/**
 * HOC for i18n-aware components
 */
export function withI18n<P extends object>(
  Component: React.ComponentType<
    P & { t: TFunction; language: SupportedLanguage }
  >
): React.ComponentType<P> {
  const WrappedComponent = (props: P): React.JSX.Element => {
    const { t, language } = useI18n();

    return <Component {...props} t={t} language={language} />;
  };

  WrappedComponent.displayName = `withI18n(${Component.displayName ?? Component.name})`;

  return WrappedComponent;
}
