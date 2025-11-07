/**
 * High Contrast Mode Component
 *
 * Provides high contrast mode support for users with visual impairments.
 * Includes automatic detection and manual toggle functionality.
 *
 * Requirements: 1.5, 10.4
 */

import React, { useState, useCallback, useEffect, type ReactNode } from 'react';
import { useI18n } from '../../contexts/I18nContext';
import { useScreenReaderAnnouncer } from './ScreenReaderAnnouncer';

declare global {
  interface Window {
    highContrastMode?: {
      isEnabled: boolean;
      isSystemPreferred: boolean;
      hasManualOverride: boolean;
      toggle: () => void;
      reset: () => void;
    };
  }
}

export interface HighContrastProps {
  enabled: boolean;
  onToggle: () => void;
  className?: string;
}

interface HighContrastModeProps {
  children: ReactNode;
  className?: string;
}

/**
 * High contrast mode provider component
 */
export const HighContrastMode: React.FC<HighContrastModeProps> = ({
  children,
  className = '',
}) => {
  const [isHighContrast, setIsHighContrast] = useState<boolean>(false);
  const [systemPrefersHighContrast, setSystemPrefersHighContrast] =
    useState<boolean>(false);
  const [manualOverride, setManualOverride] = useState<boolean | null>(null);
  const { announce } = useScreenReaderAnnouncer();

  /**
   * Check system preference for high contrast
   */
  const checkSystemPreference = useCallback((): boolean => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      setSystemPrefersHighContrast(false);
      return false;
    }

    const mediaQuery = window.matchMedia('(prefers-contrast: high)');
    const matches = mediaQuery.matches;
    setSystemPrefersHighContrast(matches);
    return matches;
  }, []);

  /**
   * Load saved preference from localStorage
   */
  const loadSavedPreference = useCallback((): boolean | null => {
    try {
      const saved = localStorage.getItem('highContrastMode');
      if (saved === 'true') {
        return true;
      }
      if (saved === 'false') {
        return false;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  /**
   * Save preference to localStorage
   */
  const savePreference = useCallback((enabled: boolean | null): void => {
    try {
      if (enabled === null) {
        localStorage.removeItem('highContrastMode');
      } else {
        localStorage.setItem('highContrastMode', enabled.toString());
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  /**
   * Toggle high contrast mode
   */
  const toggleHighContrast = useCallback((): void => {
    const newManualOverride =
      manualOverride === null ? !systemPrefersHighContrast : !manualOverride;
    setManualOverride(newManualOverride);
    savePreference(newManualOverride);

    // Announce the change to screen readers
    announce(
      newManualOverride
        ? 'accessibility.highContrast.enabled'
        : 'accessibility.highContrast.disabled',
      'polite'
    );
  }, [manualOverride, systemPrefersHighContrast, savePreference, announce]);

  /**
   * Reset to system preference
   */
  const resetToSystemPreference = useCallback((): void => {
    setManualOverride(null);
    savePreference(null);
    announce('accessibility.highContrast.resetToSystem', 'polite');
  }, [savePreference, announce]);

  /**
   * Initialize high contrast mode
   */
  useEffect(() => {
    const systemPrefers = checkSystemPreference();
    const savedPreference = loadSavedPreference();

    setManualOverride(savedPreference);
    setIsHighContrast(savedPreference ?? systemPrefers);
  }, [checkSystemPreference, loadSavedPreference]);

  /**
   * Listen for system preference changes
   */
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-contrast: high)');

    const handleChange = (event: MediaQueryListEvent): void => {
      setSystemPrefersHighContrast(event.matches);

      // If no manual override, follow system preference
      if (manualOverride === null) {
        setIsHighContrast(event.matches);
      }
    };

    mediaQuery.addEventListener('change', handleChange);

    return (): void => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [manualOverride]);

  /**
   * Update high contrast state when manual override changes
   */
  useEffect(() => {
    if (manualOverride !== null) {
      setIsHighContrast(manualOverride);
    } else {
      setIsHighContrast(systemPrefersHighContrast);
    }
  }, [manualOverride, systemPrefersHighContrast]);

  /**
   * Apply high contrast class to document
   */
  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const root = document.documentElement;

    if (isHighContrast) {
      root.classList.add('high-contrast');
      root.setAttribute('data-high-contrast', 'true');
    } else {
      root.classList.remove('high-contrast');
      root.removeAttribute('data-high-contrast');
    }
  }, [isHighContrast]);

  // Expose high contrast utilities globally
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.highContrastMode = {
      isEnabled: isHighContrast,
      isSystemPreferred: systemPrefersHighContrast,
      hasManualOverride: manualOverride !== null,
      toggle: toggleHighContrast,
      reset: resetToSystemPreference,
    };

    return (): void => {
      if (window.highContrastMode) {
        delete window.highContrastMode;
      }
    };
  }, [
    isHighContrast,
    systemPrefersHighContrast,
    manualOverride,
    toggleHighContrast,
    resetToSystemPreference,
  ]);

  return (
    <div
      className={`high-contrast-mode ${isHighContrast ? 'high-contrast-enabled' : ''} ${className}`}
      data-high-contrast={isHighContrast}
    >
      {children}
    </div>
  );
};

/**
 * High contrast toggle button component
 */
export const HighContrastToggle: React.FC<HighContrastProps> = ({
  enabled,
  onToggle,
  className = '',
}) => {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`high-contrast-toggle ${enabled ? 'enabled' : 'disabled'} ${className}`}
      aria-pressed={enabled}
      aria-label={t(
        enabled
          ? 'accessibility.highContrast.disable'
          : 'accessibility.highContrast.enable'
      )}
      title={t(
        enabled
          ? 'accessibility.highContrast.disable'
          : 'accessibility.highContrast.enable'
      )}
    >
      <span className="toggle-icon" aria-hidden="true">
        {enabled ? '🔆' : '🔅'}
      </span>
      <span className="toggle-text">
        {t(
          enabled
            ? 'accessibility.highContrast.on'
            : 'accessibility.highContrast.off'
        )}
      </span>
    </button>
  );
};

/**
 * Hook for using high contrast mode
 */
export const useHighContrastMode = (): {
  isHighContrast: boolean;
  systemPrefersHighContrast: boolean;
  toggle: () => void;
  reset: () => void;
} => {
  const [isHighContrast, setIsHighContrast] = useState<boolean>(false);
  const [systemPrefersHighContrast, setSystemPrefersHighContrast] =
    useState<boolean>(false);

  useEffect(() => {
    // Check if high contrast mode utilities are available
    const checkHighContrast = (): void => {
      if (typeof window === 'undefined') {
        return;
      }

      if (window.highContrastMode) {
        setIsHighContrast(window.highContrastMode.isEnabled);
        setSystemPrefersHighContrast(window.highContrastMode.isSystemPreferred);
        return;
      }

      if (typeof window.matchMedia === 'function') {
        const mediaQuery = window.matchMedia('(prefers-contrast: high)');
        setSystemPrefersHighContrast(mediaQuery.matches);
        setIsHighContrast(mediaQuery.matches);
      }
    };

    checkHighContrast();

    // Set up interval to check for changes
    const intervalId =
      typeof window !== 'undefined'
        ? window.setInterval(checkHighContrast, 1000)
        : undefined;

    return (): void => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  const toggle = useCallback((): void => {
    if (typeof window !== 'undefined') {
      window.highContrastMode?.toggle();
    }
  }, []);

  const reset = useCallback((): void => {
    if (typeof window !== 'undefined') {
      window.highContrastMode?.reset();
    }
  }, []);

  return {
    isHighContrast,
    systemPrefersHighContrast,
    toggle,
    reset,
  };
};

export default HighContrastMode;
