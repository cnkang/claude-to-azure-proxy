/**
 * Accessibility Settings Component
 *
 * Provides a comprehensive settings interface for accessibility features
 * including high contrast mode, font size, reduced motion, and WCAG compliance.
 *
 * Requirements: 1.5, 10.4
 */

import React, { useState } from 'react';
import { useI18n } from '../../contexts/I18nContext';
import { useAccessibility, useWCAGCompliance } from './AccessibilityProvider';
import { HighContrastToggle } from './HighContrastMode';
import { useScreenReaderAnnouncer } from './ScreenReaderAnnouncer';
import './AccessibilitySettings.css';

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
    <div className={`accessibility-settings ${className}`}>
      <div className="settings-header">
        <h2 className="settings-title">{t('accessibility.settings.title')}</h2>
        <p className="settings-description">
          {t('accessibility.settings.description')}
        </p>
      </div>

      <div className="settings-sections">
        {/* Screen Reader Support */}
        <section className="settings-section">
          <h3 className="section-title">
            {t('accessibility.screenReader.title')}
          </h3>
          <p className="section-description">
            {t('accessibility.screenReader.description')}
          </p>

          <div className="setting-group">
            <div className="setting-item">
              <span className="setting-status">
                {screenReaderEnabled
                  ? t('accessibility.screenReader.detected')
                  : t('accessibility.screenReader.notDetected')}
              </span>
            </div>

            <div className="setting-item">
              <label className="setting-label">
                <input
                  type="checkbox"
                  checked={announcements}
                  onChange={toggleAnnouncements}
                  aria-describedby="announcements-description"
                />
                {t('accessibility.announcements.enable')}
              </label>
              <p id="announcements-description" className="setting-hint">
                {t('accessibility.announcements.description')}
              </p>
            </div>
          </div>
        </section>

        {/* Visual Accessibility */}
        <section className="settings-section">
          <h3 className="section-title">{t('accessibility.visual.title')}</h3>
          <p className="section-description">
            {t('accessibility.visual.description')}
          </p>

          <div className="setting-group">
            {/* High Contrast Mode */}
            <div className="setting-item">
              <label className="setting-label">
                {t('accessibility.highContrast.title')}
              </label>
              <div className="setting-controls">
                <HighContrastToggle
                  enabled={highContrastMode}
                  onToggle={toggleHighContrast}
                />
                {systemPrefersHighContrast !== highContrastMode && (
                  <button
                    type="button"
                    onClick={resetHighContrast}
                    className="reset-button"
                    aria-label={t('accessibility.highContrast.resetToSystem')}
                  >
                    {t('common.reset')}
                  </button>
                )}
              </div>
              <p className="setting-hint">
                {systemPrefersHighContrast
                  ? t('accessibility.highContrast.systemEnabled')
                  : t('accessibility.highContrast.systemDisabled')}
              </p>
            </div>

            {/* Font Size */}
            <div className="setting-item">
              <label className="setting-label">
                {t('accessibility.fontSize.title')}
              </label>
              <div className="font-size-options">
                {(['small', 'medium', 'large', 'extra-large'] as const).map(
                  (size) => (
                    <label key={size} className="font-size-option">
                      <input
                        type="radio"
                        name="fontSize"
                        value={size}
                        checked={fontSize === size}
                        onChange={() => handleFontSizeChange(size)}
                      />
                      <span className="option-label">
                        {t(`accessibility.fontSize.${size}`)}
                      </span>
                    </label>
                  )
                )}
              </div>
            </div>

            {/* Zoom Level */}
            <div className="setting-item">
              <label className="setting-label" htmlFor="zoom-slider">
                {t('accessibility.zoom.title')}: {Math.round(zoomLevel * 100)}%
              </label>
              <input
                id="zoom-slider"
                type="range"
                min="0.5"
                max="3"
                step="0.1"
                value={zoomLevel}
                onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                className="zoom-slider"
                aria-describedby="zoom-description"
              />
              <p id="zoom-description" className="setting-hint">
                {t('accessibility.zoom.description')}
              </p>
            </div>
          </div>
        </section>

        {/* Motion and Animation */}
        <section className="settings-section">
          <h3 className="section-title">{t('accessibility.motion.title')}</h3>
          <p className="section-description">
            {t('accessibility.motion.description')}
          </p>

          <div className="setting-group">
            <div className="setting-item">
              <label className="setting-label">
                <input
                  type="checkbox"
                  checked={reducedMotion}
                  onChange={toggleReducedMotion}
                  aria-describedby="reduced-motion-description"
                />
                {t('accessibility.reducedMotion.enable')}
              </label>
              <div className="setting-controls">
                {systemPrefersReducedMotion !== reducedMotion && (
                  <button
                    type="button"
                    onClick={resetReducedMotion}
                    className="reset-button"
                    aria-label={t('accessibility.reducedMotion.resetToSystem')}
                  >
                    {t('common.reset')}
                  </button>
                )}
              </div>
              <p id="reduced-motion-description" className="setting-hint">
                {systemPrefersReducedMotion
                  ? t('accessibility.reducedMotion.systemEnabled')
                  : t('accessibility.reducedMotion.systemDisabled')}
              </p>
            </div>
          </div>
        </section>

        {/* Keyboard Navigation */}
        <section className="settings-section">
          <h3 className="section-title">{t('accessibility.keyboard.title')}</h3>
          <p className="section-description">
            {t('accessibility.keyboard.description')}
          </p>

          <div className="setting-group">
            <div className="setting-item">
              <label className="setting-label">
                <input
                  type="checkbox"
                  checked={keyboardNavigation}
                  onChange={toggleKeyboardNavigation}
                  aria-describedby="keyboard-description"
                />
                {t('accessibility.keyboardNavigation.enable')}
              </label>
              <p id="keyboard-description" className="setting-hint">
                {t('accessibility.keyboardNavigation.instructions')}
              </p>
            </div>
          </div>
        </section>

        {/* Advanced Settings */}
        <section className="settings-section">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="section-toggle"
            aria-expanded={showAdvanced}
            aria-controls="advanced-settings"
          >
            <h3 className="section-title">
              {t('accessibility.advanced.title')}
              <span className="toggle-icon" aria-hidden="true">
                {showAdvanced ? '▼' : '▶'}
              </span>
            </h3>
          </button>

          {showAdvanced && (
            <div id="advanced-settings" className="advanced-settings">
              <p className="section-description">
                {t('accessibility.advanced.description')}
              </p>

              <div className="setting-group">
                {/* WCAG Compliance Level */}
                <div className="setting-item">
                  <label className="setting-label">
                    {t('accessibility.wcag.title')}
                  </label>
                  <div className="wcag-options">
                    {(['A', 'AA', 'AAA'] as const).map((level) => (
                      <label key={level} className="wcag-option">
                        <input
                          type="radio"
                          name="wcagLevel"
                          value={level}
                          checked={wcagLevel === level}
                          onChange={() => handleWcagLevelChange(level)}
                        />
                        <span className="option-label">WCAG {level}</span>
                        <span className="option-description">
                          {t(
                            `accessibility.wcag.${level.toLowerCase()}.description`
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="setting-hint">
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
