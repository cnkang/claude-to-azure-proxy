/**
 * Accessibility Settings Component
 *
 * Provides a comprehensive settings interface for accessibility features
 * including high contrast mode, font size, reduced motion, and WCAG compliance.
 *
 * Requirements: 1.5, 10.4
 */

import type React from 'react';
import { useState } from 'react';
import { useI18n } from '../../contexts/I18nContext.js';
import { cn } from '../ui/Glass.js';
import {
  useAccessibility,
  useWCAGCompliance,
} from './AccessibilityProvider.js';
import { HighContrastToggle } from './HighContrastMode.js';
import { useScreenReaderAnnouncer } from './ScreenReaderAnnouncer.js';

interface AccessibilitySettingsProps {
  className?: string;
}

/**
 * Accessibility settings component
 */
export const AccessibilitySettings: React.FC<AccessibilitySettingsProps> = ({
  className = '',
}) => {
  const { t } = useI18n();
  const { announce } = useScreenReaderAnnouncer();
  const {
    screenReaderEnabled,
    announcements,
    keyboardNavigation,
    highContrastMode,
    systemPrefersHighContrast,
    reducedMotion,
    systemPrefersReducedMotion,
    fontSize,
    zoomLevel,
    wcagLevel,
    toggleAnnouncements,
    toggleKeyboardNavigation,
    toggleHighContrast,
    resetHighContrast,
    toggleReducedMotion,
    resetReducedMotion,
    setFontSize,
    setZoomLevel,
    setWcagLevel,
  } = useAccessibility();

  const { getMinimumContrastRatio } = useWCAGCompliance();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleFontSizeChange = (size: typeof fontSize): void => {
    setFontSize(size);
    announce('accessibility.fontSize.changed', 'polite', {
      size: t(`accessibility.fontSize.${size}`),
    });
  };

  const handleZoomChange = (level: number): void => {
    setZoomLevel(level);
    announce('accessibility.zoom.changed', 'polite', {
      level: Math.round(level * 100),
    });
  };

  const handleWcagLevelChange = (level: typeof wcagLevel): void => {
    setWcagLevel(level);
    announce('accessibility.wcag.levelChanged', 'polite', { level });
  };

  return (
    <div className={cn('flex flex-col gap-8 p-6', className)}>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('accessibility.settings.title')}
        </h2>
        <p className="text-gray-700 dark:text-gray-300">
          {t('accessibility.settings.description')}
        </p>
      </div>

      <div className="space-y-8">
        {/* Screen Reader Support */}
        <section className="space-y-4">
          <div className="border-b border-gray-200 dark:border-gray-700 pb-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('accessibility.screenReader.title')}
            </h3>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {t('accessibility.screenReader.description')}
            </p>
          </div>

          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <span
                className={cn(
                  'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium',
                  screenReaderEnabled
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                )}
              >
                {screenReaderEnabled
                  ? t('accessibility.screenReader.detected')
                  : t('accessibility.screenReader.notDetected')}
              </span>
            </div>

            <div className="flex items-start gap-3 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
              <input
                id="announcements-toggle"
                type="checkbox"
                checked={announcements}
                onChange={toggleAnnouncements}
                aria-describedby="announcements-description"
                className="mt-1 w-4 h-4 text-blue-700 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
              />
              <div>
                <label
                  className="block text-sm font-medium text-gray-900 dark:text-gray-100"
                  htmlFor="announcements-toggle"
                >
                  {t('accessibility.announcements.enable')}
                </label>
                <p
                  id="announcements-description"
                  className="text-xs text-gray-700 dark:text-gray-300 mt-1"
                >
                  {t('accessibility.announcements.description')}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Visual Accessibility */}
        <section className="space-y-4">
          <div className="border-b border-gray-200 dark:border-gray-700 pb-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('accessibility.visual.title')}
            </h3>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {t('accessibility.visual.description')}
            </p>
          </div>

          <div className="space-y-6">
            {/* High Contrast Mode */}
            <div className="space-y-3">
              <p className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                {t('accessibility.highContrast.title')}
              </p>
              <div className="flex items-center gap-4">
                <HighContrastToggle
                  enabled={highContrastMode}
                  onToggle={toggleHighContrast}
                />
                {systemPrefersHighContrast !== highContrastMode && (
                  <button
                    type="button"
                    onClick={resetHighContrast}
                    className="text-sm text-blue-700 dark:text-blue-200 hover:underline"
                    aria-label={t('accessibility.highContrast.resetToSystem')}
                  >
                    {t('common.reset')}
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-700 dark:text-gray-300">
                {systemPrefersHighContrast
                  ? t('accessibility.highContrast.systemEnabled')
                  : t('accessibility.highContrast.systemDisabled')}
              </p>
            </div>

            {/* Font Size */}
            <div className="space-y-3">
              <p className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                {t('accessibility.fontSize.title')}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(['small', 'medium', 'large', 'extra-large'] as const).map(
                  (size) => (
                    <label
                      key={size}
                      className={cn(
                        'flex items-center justify-center p-3 border rounded-xl cursor-pointer transition-all',
                        fontSize === size
                          ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300 ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-900'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700'
                      )}
                    >
                      <input
                        type="radio"
                        name="fontSize"
                        value={size}
                        checked={fontSize === size}
                        onChange={() => handleFontSizeChange(size)}
                        className="sr-only"
                      />
                      <span className="text-sm font-medium">
                        {t(`accessibility.fontSize.${size}`)}
                      </span>
                    </label>
                  )
                )}
              </div>
            </div>

            {/* Zoom Level */}
            <div className="space-y-3">
              <div className="flex justify-between">
                <label
                  className="text-sm font-medium text-gray-900 dark:text-gray-100"
                  htmlFor="zoom-slider"
                >
                  {t('accessibility.zoom.title')}
                </label>
                <span className="text-sm font-mono text-gray-700 dark:text-gray-300">
                  {Math.round(zoomLevel * 100)}%
                </span>
              </div>
              <input
                id="zoom-slider"
                type="range"
                min="0.5"
                max="3"
                step="0.1"
                value={zoomLevel}
                onChange={(e) =>
                  handleZoomChange(Number.parseFloat(e.target.value))
                }
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                aria-describedby="zoom-description"
              />
              <p
                id="zoom-description"
                className="text-xs text-gray-700 dark:text-gray-300"
              >
                {t('accessibility.zoom.description')}
              </p>
            </div>
          </div>
        </section>

        {/* Motion and Animation */}
        <section className="space-y-4">
          <div className="border-b border-gray-200 dark:border-gray-700 pb-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('accessibility.motion.title')}
            </h3>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {t('accessibility.motion.description')}
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
              <input
                id="reduced-motion-toggle"
                type="checkbox"
                checked={reducedMotion}
                onChange={toggleReducedMotion}
                aria-describedby="reduced-motion-description"
                className="mt-1 w-4 h-4 text-blue-700 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <label
                    className="block text-sm font-medium text-gray-900 dark:text-gray-100"
                    htmlFor="reduced-motion-toggle"
                  >
                    {t('accessibility.reducedMotion.enable')}
                  </label>
                  {systemPrefersReducedMotion !== reducedMotion && (
                    <button
                      type="button"
                      onClick={resetReducedMotion}
                      className="text-xs text-blue-700 dark:text-blue-200 hover:underline"
                      aria-label={t(
                        'accessibility.reducedMotion.resetToSystem'
                      )}
                    >
                      {t('common.reset')}
                    </button>
                  )}
                </div>
                <p
                  id="reduced-motion-description"
                  className="text-xs text-gray-700 dark:text-gray-300 mt-1"
                >
                  {systemPrefersReducedMotion
                    ? t('accessibility.reducedMotion.systemEnabled')
                    : t('accessibility.reducedMotion.systemDisabled')}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Keyboard Navigation */}
        <section className="space-y-4">
          <div className="border-b border-gray-200 dark:border-gray-700 pb-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('accessibility.keyboard.title')}
            </h3>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {t('accessibility.keyboard.description')}
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
              <input
                id="keyboard-navigation-toggle"
                type="checkbox"
                checked={keyboardNavigation}
                onChange={toggleKeyboardNavigation}
                aria-describedby="keyboard-description"
                className="mt-1 w-4 h-4 text-blue-700 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
              />
              <div>
                <label
                  className="block text-sm font-medium text-gray-900 dark:text-gray-100"
                  htmlFor="keyboard-navigation-toggle"
                >
                  {t('accessibility.keyboardNavigation.enable')}
                </label>
                <p
                  id="keyboard-description"
                  className="text-xs text-gray-700 dark:text-gray-300 mt-1"
                >
                  {t('accessibility.keyboardNavigation.instructions')}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Advanced Settings */}
        <section className="space-y-4">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-700 dark:hover:text-blue-400 transition-colors w-full text-left"
            aria-expanded={showAdvanced}
            aria-controls="advanced-settings"
          >
            {t('accessibility.advanced.title')}
            <span
              className={`transform transition-transform duration-200 ${showAdvanced ? 'rotate-90' : ''}`}
              aria-hidden="true"
            >
              ▶
            </span>
          </button>

          {showAdvanced && (
            <div
              id="advanced-settings"
              className="space-y-4 animate-in slide-in-from-top-2 duration-200"
            >
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {t('accessibility.advanced.description')}
              </p>

              <div className="space-y-4">
                {/* WCAG Compliance Level */}
                <div className="space-y-3">
                  <p className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                    {t('accessibility.wcag.title')}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(['A', 'AA', 'AAA'] as const).map((level) => (
                      <label
                        key={level}
                        className={cn(
                          'flex flex-col p-3 border rounded-xl cursor-pointer transition-all',
                          wcagLevel === level
                            ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-900'
                            : 'bg-white border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700'
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <input
                            type="radio"
                            name="wcagLevel"
                            value={level}
                            checked={wcagLevel === level}
                            onChange={() => handleWcagLevelChange(level)}
                            className="sr-only"
                          />
                          <span
                            className={cn(
                              'text-sm font-bold',
                              wcagLevel === level
                                ? 'text-blue-700 dark:text-blue-300'
                                : 'text-gray-900 dark:text-gray-100'
                            )}
                          >
                            WCAG {level}
                          </span>
                        </div>
                        <span className="text-xs text-gray-700 dark:text-gray-300">
                          {t(
                            `accessibility.wcag.${level.toLowerCase()}.description`
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-700 dark:text-gray-300">
                    {t('accessibility.wcag.currentRatio', {
                      ratio: getMinimumContrastRatio(),
                    })}
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default AccessibilitySettings;
