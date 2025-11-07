/**
 * Accessibility Provider Component
 *
 * Central provider for accessibility features including screen reader support,
 * keyboard navigation, high contrast mode, and WCAG compliance utilities.
 *
 * Requirements: 1.5, 10.4
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { useI18n } from '../../contexts/I18nContext';
import { ScreenReaderAnnouncer } from './ScreenReaderAnnouncer';
import { HighContrastMode } from './HighContrastMode';
import { FocusManager } from './FocusManager';

interface AccessibilityState {
  // Screen reader support
  screenReaderEnabled: boolean;
  announcements: boolean;

  // Keyboard navigation
  keyboardNavigation: boolean;
  focusVisible: boolean;

  // High contrast mode
  highContrastMode: boolean;
  systemPrefersHighContrast: boolean;

  // Reduced motion
  reducedMotion: boolean;
  systemPrefersReducedMotion: boolean;

  // Font size and zoom
  fontSize: 'small' | 'medium' | 'large' | 'extra-large';
  zoomLevel: number;

  // WCAG compliance level
  wcagLevel: 'A' | 'AA' | 'AAA';
}

interface AccessibilityActions {
  // Screen reader
  announce: (message: string, priority?: 'polite' | 'assertive') => void;
  toggleAnnouncements: () => void;

  // Keyboard navigation
  toggleKeyboardNavigation: () => void;
  setFocusVisible: (visible: boolean) => void;

  // High contrast
  toggleHighContrast: () => void;
  resetHighContrast: () => void;

  // Reduced motion
  toggleReducedMotion: () => void;
  resetReducedMotion: () => void;

  // Font size and zoom
  setFontSize: (size: AccessibilityState['fontSize']) => void;
  setZoomLevel: (level: number) => void;

  // WCAG compliance
  setWcagLevel: (level: AccessibilityState['wcagLevel']) => void;
}

interface AccessibilityContextType
  extends AccessibilityState,
    AccessibilityActions {}

const AccessibilityContext = createContext<AccessibilityContextType | null>(
  null
);

export interface AccessibilityProviderProps {
  children: ReactNode;
  wcagLevel?: 'A' | 'AA' | 'AAA';
}

/**
 * Accessibility provider component
 */
export const AccessibilityProvider: React.FC<AccessibilityProviderProps> = ({
  children,
  wcagLevel = 'AAA',
}) => {
  const { t } = useI18n();

  // State
  const [state, setState] = useState<AccessibilityState>({
    screenReaderEnabled: false,
    announcements: true,
    keyboardNavigation: true,
    focusVisible: false,
    highContrastMode: false,
    systemPrefersHighContrast: false,
    reducedMotion: false,
    systemPrefersReducedMotion: false,
    fontSize: 'medium',
    zoomLevel: 1,
    wcagLevel,
  });

  /**
   * Detect screen reader usage
   */
  const detectScreenReader = (): boolean => {
    // Check for common screen reader indicators
    if (typeof window === 'undefined') {
      return false;
    }

    const userAgent =
      typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const hasKnownScreenReaderUA =
      userAgent.includes('NVDA') ||
      userAgent.includes('JAWS') ||
      userAgent.includes('VoiceOver');

    const hasSpeechSynthesis = typeof window.speechSynthesis !== 'undefined';
    const hasLiveRegion =
      document.querySelector('[aria-live]') !== null ||
      document.querySelector('[role="alert"]') !== null;

    return hasSpeechSynthesis || hasKnownScreenReaderUA || hasLiveRegion;
  };

  /**
   * Check system preferences
   */
  const checkSystemPreferences = (): void => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }

    // High contrast preference
    const highContrastQuery = window.matchMedia('(prefers-contrast: high)');
    setState((prev) => ({
      ...prev,
      systemPrefersHighContrast: highContrastQuery.matches,
    }));

    // Reduced motion preference
    const reducedMotionQuery = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    );
    setState((prev) => ({
      ...prev,
      systemPrefersReducedMotion: reducedMotionQuery.matches,
    }));

    // Listen for changes
    highContrastQuery.addEventListener(
      'change',
      (event: MediaQueryListEvent) => {
        setState((prev) => ({
          ...prev,
          systemPrefersHighContrast: event.matches,
        }));
      }
    );

    reducedMotionQuery.addEventListener(
      'change',
      (event: MediaQueryListEvent) => {
        setState((prev) => ({
          ...prev,
          systemPrefersReducedMotion: event.matches,
        }));
      }
    );
  };

  /**
   * Load saved preferences
   */
  const loadPreferences = (): void => {
    try {
      const saved = localStorage.getItem('accessibilityPreferences');
      if (saved !== null) {
        const preferences = JSON.parse(saved) as Partial<AccessibilityState>;
        setState((prev) => ({ ...prev, ...preferences }));
      }
    } catch {
      // Ignore localStorage errors
    }
  };

  /**
   * Save preferences
   */
  const savePreferences = (newState: Partial<AccessibilityState>): void => {
    try {
      const current = localStorage.getItem('accessibilityPreferences');
      const existing =
        current !== null
          ? (JSON.parse(current) as Record<string, unknown>)
          : {};
      const updated: Record<string, unknown> = { ...existing, ...newState };
      localStorage.setItem('accessibilityPreferences', JSON.stringify(updated));
    } catch {
      // Ignore localStorage errors
    }
  };

  const clearPreference = (key: keyof AccessibilityState): void => {
    try {
      const current = localStorage.getItem('accessibilityPreferences');
      if (current === null) {
        return;
      }

      const parsed: unknown = JSON.parse(current);
      if (typeof parsed !== 'object' || parsed === null) {
        localStorage.removeItem('accessibilityPreferences');
        return;
      }

      const existing = parsed as Record<string, unknown>;
      const sanitizedEntries = Object.entries(existing).filter(
        ([entryKey, value]) => {
          if (entryKey === key) {
            return false;
          }
          return value !== undefined;
        }
      );
      if (sanitizedEntries.length === 0) {
        localStorage.removeItem('accessibilityPreferences');
        return;
      }

      const sanitizedPreferences = Object.fromEntries(sanitizedEntries);
      localStorage.setItem(
        'accessibilityPreferences',
        JSON.stringify(sanitizedPreferences)
      );
    } catch {
      // Ignore localStorage errors
    }
  };

  /**
   * Actions
   */
  const announce = (
    message: string,
    priority: 'polite' | 'assertive' = 'polite'
  ): void => {
    const announcer = (
      window as typeof window & {
        announceToScreenReader?: (
          _msg: string,
          announcePriority: 'polite' | 'assertive'
        ) => void;
      }
    ).announceToScreenReader;

    if (state.announcements && typeof announcer === 'function') {
      announcer(message, priority);
    }
  };

  const toggleAnnouncements = (): void => {
    const newValue = !state.announcements;
    setState((prev) => ({ ...prev, announcements: newValue }));
    savePreferences({ announcements: newValue });

    announce(
      newValue
        ? t('accessibility.announcements.enabled')
        : t('accessibility.announcements.disabled'),
      'assertive'
    );
  };

  const toggleKeyboardNavigation = (): void => {
    const newValue = !state.keyboardNavigation;
    setState((prev) => ({ ...prev, keyboardNavigation: newValue }));
    savePreferences({ keyboardNavigation: newValue });

    announce(
      newValue
        ? t('accessibility.keyboardNavigation.enabled')
        : t('accessibility.keyboardNavigation.disabled'),
      'polite'
    );
  };

  const setFocusVisible = (visible: boolean): void => {
    setState((prev) => ({ ...prev, focusVisible: visible }));
  };

  const toggleHighContrast = (): void => {
    const newValue = !state.highContrastMode;
    setState((prev) => ({ ...prev, highContrastMode: newValue }));
    savePreferences({ highContrastMode: newValue });

    announce(
      newValue
        ? t('accessibility.highContrast.enabled')
        : t('accessibility.highContrast.disabled'),
      'polite'
    );
  };

  const resetHighContrast = (): void => {
    setState((prev) => ({
      ...prev,
      highContrastMode: prev.systemPrefersHighContrast,
    }));
    clearPreference('highContrastMode');
    announce(t('accessibility.highContrast.resetToSystem'), 'polite');
  };

  const toggleReducedMotion = (): void => {
    const newValue = !state.reducedMotion;
    setState((prev) => ({ ...prev, reducedMotion: newValue }));
    savePreferences({ reducedMotion: newValue });

    announce(
      newValue
        ? t('accessibility.reducedMotion.enabled')
        : t('accessibility.reducedMotion.disabled'),
      'polite'
    );
  };

  const resetReducedMotion = (): void => {
    setState((prev) => ({
      ...prev,
      reducedMotion: prev.systemPrefersReducedMotion,
    }));
    clearPreference('reducedMotion');
    announce(t('accessibility.reducedMotion.resetToSystem'), 'polite');
  };

  const setFontSize = (size: AccessibilityState['fontSize']): void => {
    setState((prev) => ({ ...prev, fontSize: size }));
    savePreferences({ fontSize: size });
    announce(t('accessibility.fontSize.changed', { size }), 'polite');
  };

  const setZoomLevel = (level: number): void => {
    const clampedLevel = Math.max(0.5, Math.min(3, level));
    setState((prev) => ({ ...prev, zoomLevel: clampedLevel }));
    savePreferences({ zoomLevel: clampedLevel });
    announce(
      t('accessibility.zoom.changed', {
        level: Math.round(clampedLevel * 100),
      }),
      'polite'
    );
  };

  const setWcagLevel = (level: AccessibilityState['wcagLevel']): void => {
    setState((prev) => ({ ...prev, wcagLevel: level }));
    savePreferences({ wcagLevel: level });
    announce(t('accessibility.wcag.levelChanged', { level }), 'polite');
  };

  /**
   * Initialize accessibility features
   */
  useEffect(() => {
    // Detect screen reader
    setState((prev) => ({
      ...prev,
      screenReaderEnabled: detectScreenReader(),
    }));

    // Check system preferences
    checkSystemPreferences();

    // Load saved preferences
    loadPreferences();
  }, []);

  /**
   * Apply accessibility settings to document
   */
  useEffect(() => {
    const root = document.documentElement;

    // High contrast mode
    if (state.highContrastMode) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }

    // Reduced motion
    if (state.reducedMotion) {
      root.classList.add('reduced-motion');
    } else {
      root.classList.remove('reduced-motion');
    }

    // Font size
    root.setAttribute('data-font-size', state.fontSize);

    // Zoom level
    root.style.setProperty('--zoom-level', state.zoomLevel.toString());

    // WCAG level
    root.setAttribute('data-wcag-level', state.wcagLevel);

    // Focus visible
    if (state.focusVisible) {
      root.classList.add('focus-visible');
    } else {
      root.classList.remove('focus-visible');
    }
  }, [state]);

  /**
   * Context value
   */
  const contextValue: AccessibilityContextType = {
    ...state,
    announce,
    toggleAnnouncements,
    toggleKeyboardNavigation,
    setFocusVisible,
    toggleHighContrast,
    resetHighContrast,
    toggleReducedMotion,
    resetReducedMotion,
    setFontSize,
    setZoomLevel,
    setWcagLevel,
  };

  return (
    <AccessibilityContext.Provider value={contextValue}>
      <HighContrastMode>
        <FocusManager>
          <ScreenReaderAnnouncer />
          {children}
        </FocusManager>
      </HighContrastMode>
    </AccessibilityContext.Provider>
  );
};

/**
 * Hook for using accessibility context
 */
export const useAccessibility = (): AccessibilityContextType => {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error(
      'useAccessibility must be used within an AccessibilityProvider'
    );
  }
  return context;
};

/**
 * Hook for WCAG compliance utilities
 */
export const useWCAGCompliance = (): {
  wcagLevel: AccessibilityState['wcagLevel'];
  getContrastRatio: (foreground: string, background: string) => number;
  meetsContrastRequirement: (foreground: string, background: string) => boolean;
  getMinimumContrastRatio: () => number;
} => {
  const { wcagLevel } = useAccessibility();

  const getContrastRatio = (foreground: string, background: string): number => {
    // Simplified contrast ratio calculation
    // In a real implementation, you'd use a proper color contrast library
    const getLuminance = (color: string): number => {
      // This is a simplified version - use a proper color library in production
      const rgb = color.match(/\d+/g);
      if (!rgb) {
        return 0;
      }

      const [r, g, b] = rgb.map((c) => {
        const val = parseInt(c, 10) / 255;
        return val <= 0.03928
          ? val / 12.92
          : Math.pow((val + 0.055) / 1.055, 2.4);
      });

      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const l1 = getLuminance(foreground);
    const l2 = getLuminance(background);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);

    return (lighter + 0.05) / (darker + 0.05);
  };

  const meetsContrastRequirement = (
    foreground: string,
    background: string
  ): boolean => {
    const ratio = getContrastRatio(foreground, background);

    switch (wcagLevel) {
      case 'AAA':
        return ratio >= 7;
      case 'AA':
        return ratio >= 4.5;
      case 'A':
        return ratio >= 3;
      default:
        return false;
    }
  };

  const getMinimumContrastRatio = (): number => {
    switch (wcagLevel) {
      case 'AAA':
        return 7;
      case 'AA':
        return 4.5;
      case 'A':
        return 3;
      default:
        return 3;
    }
  };

  return {
    wcagLevel,
    getContrastRatio,
    meetsContrastRequirement,
    getMinimumContrastRatio,
  };
};

export default AccessibilityProvider;
