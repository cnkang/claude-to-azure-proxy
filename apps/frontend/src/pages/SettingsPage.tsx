/**
 * Settings Page Component
 * 
 * Application settings page with theme, language, and data management options.
 * 
 * Requirements: 1.1, 5.1, 5.2, 5.3, 10.1
 */

import React, { useState, useCallback } from 'react';
import { isNonEmptyString } from '@repo/shared-utils';
import { useTheme } from '../contexts/ThemeContext.js';
import { useI18n, type SupportedLanguage } from '../contexts/I18nContext.js';
import { useSessionContext } from '../contexts/SessionContext.js';
import { useConversations } from '../hooks/useConversations.js';
import { useStorage } from '../hooks/useStorage.js';
import { LayoutContainer } from '../components/layout/AppLayout.js';
import { frontendLogger } from '../utils/logger.js';

/**
 * Settings page component
 */
export function SettingsPage(): React.JSX.Element {
  const { themeMode, setThemeMode, systemPrefersDark } = useTheme();
  const { language, setLanguage, supportedLanguages, t } = useI18n();
  const { session, storageUsage, resetSession } = useSessionContext();
  const { conversations, deleteMultipleConversations, exportConversations } = useConversations();
  const { clearAllData, state: _storageState } = useStorage();
  const [showConfirmDialog, setShowConfirmDialog] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingMessage, setProcessingMessage] = useState<string>('');

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'auto'): void => {
    setThemeMode(newTheme);
  };

  const handleLanguageChange = (newLanguage: SupportedLanguage): void => {
    setLanguage(newLanguage);
  };

  const formatStorageSize = (bytes: number): string => {
    if (bytes === 0) {
      return '0 B';
    }
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const sizeIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return `${parseFloat((bytes / Math.pow(k, sizeIndex)).toFixed(2))} ${sizes[sizeIndex]}`;
  };

  const getStoragePercentage = (): number => {
    if (storageUsage.quota <= 0) {
      return 0;
    }
    return (storageUsage.used / storageUsage.quota) * 100;
  };

  /**
   * Handle data export functionality
   */
  const handleExportData = useCallback(async (): Promise<void> => {
    try {
      setIsProcessing(true);
      setProcessingMessage(t('settings.data.exporting'));

      // Export all conversations
      const exportData = await exportConversations();
      
      // Create and download file
      const blob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `conversations-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      frontendLogger.info('Data export completed successfully');
    } catch (error) {
      frontendLogger.error('Data export failed', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      // Show error to user (could be enhanced with toast notifications)
    } finally {
      setIsProcessing(false);
      setProcessingMessage('');
    }
  }, [exportConversations, t]);

  /**
   * Handle clearing all conversations
   */
  const handleClearConversations = useCallback(async (): Promise<void> => {
    try {
      setIsProcessing(true);
      setProcessingMessage(t('settings.data.clearingConversations'));

      // Get all conversation IDs
      const conversationIds = conversations.map(conv => conv.id);
      
      // Delete all conversations
      await deleteMultipleConversations(conversationIds);

      frontendLogger.info('All conversations cleared successfully');
    } catch (error) {
      frontendLogger.error('Failed to clear conversations', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
    } finally {
      setIsProcessing(false);
      setProcessingMessage('');
      setShowConfirmDialog(null);
    }
  }, [conversations, deleteMultipleConversations, t]);

  /**
   * Handle session reset
   */
  const handleResetSession = useCallback(async (): Promise<void> => {
    try {
      setIsProcessing(true);
      setProcessingMessage(t('settings.data.resettingSession'));

      // Reset the session
      await resetSession();

      frontendLogger.info('Session reset successfully');
    } catch (error) {
      frontendLogger.error('Failed to reset session', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
    } finally {
      setIsProcessing(false);
      setProcessingMessage('');
      setShowConfirmDialog(null);
    }
  }, [resetSession, t]);

  /**
   * Handle clearing all data
   */
  const handleClearAllData = useCallback(async (): Promise<void> => {
    try {
      setIsProcessing(true);
      setProcessingMessage(t('settings.data.clearingAllData'));

      // Clear all storage data
      await clearAllData();
      
      // Reset session as well
      await resetSession();

      frontendLogger.info('All data cleared successfully');
    } catch (error) {
      frontendLogger.error('Failed to clear all data', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
    } finally {
      setIsProcessing(false);
      setProcessingMessage('');
      setShowConfirmDialog(null);
    }
  }, [clearAllData, resetSession, t]);

  /**
   * Handle confirmation dialog actions
   */
  const handleConfirmAction = useCallback(async (): Promise<void> => {
    if (!showConfirmDialog) {
    return;
  }

    switch (showConfirmDialog) {
      case 'clearConversations':
        await handleClearConversations();
        break;
      case 'resetSession':
        await handleResetSession();
        break;
      case 'clearAll':
        await handleClearAllData();
        break;
      default:
        setShowConfirmDialog(null);
    }
  }, [showConfirmDialog, handleClearConversations, handleResetSession, handleClearAllData]);

  const hasConfirmDialog = showConfirmDialog !== null;
  const sessionIdDisplay = isNonEmptyString(session?.sessionId) ? session.sessionId : null;
  const sessionCreatedAtDisplay =
    session?.createdAt instanceof Date ? session.createdAt.toLocaleString() : 'N/A';

  return (
    <LayoutContainer className="settings-page" maxWidth="lg" padding="lg">
      <div className="settings-content">
        <header className="settings-header">
          <h1 className="settings-title">
            {t('settings.title')}
          </h1>
          <p className="settings-description">
            {t('settings.description')}
          </p>
        </header>

        <div className="settings-sections">
          {/* Appearance Section */}
          <section className="settings-section">
            <h2 className="section-title">
              {t('settings.appearance.title')}
            </h2>
            <p className="section-description">
              {t('settings.appearance.description')}
            </p>

            <div className="setting-group">
              <label className="setting-label">
                {t('settings.appearance.theme')}
              </label>
              <div className="theme-options">
                <label className="theme-option" htmlFor="theme-light" aria-label={t('settings.appearance.light')}>
                  <input
                    id="theme-light"
                    type="radio"
                    name="theme"
                    value="light"
                    checked={themeMode === 'light'}
                    onChange={() => handleThemeChange('light')}
                    aria-label={t('settings.appearance.light')}
                  />
                  <span className="theme-option-content">
                    <span className="theme-icon">☀️</span>
                    <span className="theme-label">
                      {t('settings.appearance.light')}
                    </span>
                  </span>
                </label>

                <label className="theme-option" htmlFor="theme-dark" aria-label={t('settings.appearance.dark')}>
                  <input
                    id="theme-dark"
                    type="radio"
                    name="theme"
                    value="dark"
                    checked={themeMode === 'dark'}
                    onChange={() => handleThemeChange('dark')}
                    aria-label={t('settings.appearance.dark')}
                  />
                  <span className="theme-option-content">
                    <span className="theme-icon">🌙</span>
                    <span className="theme-label">
                      {t('settings.appearance.dark')}
                    </span>
                  </span>
                </label>

                <label className="theme-option" htmlFor="theme-auto" aria-label={t('settings.appearance.auto')}>
                  <input
                    id="theme-auto"
                    type="radio"
                    name="theme"
                    value="auto"
                    checked={themeMode === 'auto'}
                    aria-label={t('settings.appearance.auto')}
                    onChange={() => handleThemeChange('auto')}
                  />
                  <span className="theme-option-content">
                    <span className="theme-icon">🌓</span>
                    <span className="theme-label">
                      {t('settings.appearance.auto')}
                    </span>
                  </span>
                </label>
              </div>
              {themeMode === 'auto' && (
                <p className="setting-hint">
                  {t('settings.appearance.autoHint', {
                    current: systemPrefersDark ? t('settings.appearance.dark') : t('settings.appearance.light')
                  })}
                </p>
              )}
            </div>
          </section>

          {/* Language Section */}
          <section className="settings-section">
            <h2 className="section-title">
              {t('settings.language.title')}
            </h2>
            <p className="section-description">
              {t('settings.language.description')}
            </p>

            <div className="setting-group">
              <label className="setting-label" htmlFor="language-select">
                {t('settings.language.select')}
              </label>
              <select
                id="language-select"
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value as SupportedLanguage)}
                className="language-select"
              >
                {supportedLanguages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.nativeName} ({lang.name})
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* Storage Section */}
          <section className="settings-section">
            <h2 className="section-title">
              {t('settings.storage.title')}
            </h2>
            <p className="section-description">
              {t('settings.storage.description')}
            </p>

            <div className="setting-group">
              <div className="storage-info">
                <div className="storage-usage">
                  <div className="usage-bar">
                    <div 
                      className="usage-fill"
                      style={{ width: `${Math.min(getStoragePercentage(), 100)}%` }}
                    />
                  </div>
                  <div className="usage-text">
                    {formatStorageSize(storageUsage.used)} / {formatStorageSize(storageUsage.quota)}
                    {' '}({Math.round(getStoragePercentage())}%)
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Session Section */}
          <section className="settings-section">
            <h2 className="section-title">
              {t('settings.session.title')}
            </h2>
            <p className="section-description">
              {t('settings.session.description')}
            </p>

            <div className="setting-group">
              <div className="session-info">
                <div className="info-item">
                  <span className="info-label">
                    {t('settings.session.id')}:
                  </span>
                  <code className="info-value">
                    {sessionIdDisplay ?? 'N/A'}
                  </code>
                </div>
                <div className="info-item">
                  <span className="info-label">
                    {t('settings.session.created')}:
                  </span>
                  <span className="info-value">
                    {sessionCreatedAtDisplay}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Data Management Section */}
          <section className="settings-section danger-section">
            <h2 className="section-title">
              {t('settings.data.title')}
            </h2>
            <p className="section-description">
              {t('settings.data.description')}
            </p>

            <div className="setting-group">
              <div className="storage-stats">
                <div className="stats-item">
                  <span className="stats-label">
                    {t('settings.storage.conversations')}:
                  </span>
                  <span className="stats-value">
                    {conversations.length}
                  </span>
                </div>
                <div className="stats-item">
                  <span className="stats-label">
                    {t('settings.storage.messages')}:
                  </span>
                  <span className="stats-value">
                    {conversations.reduce((total, conv) => total + conv.messages.length, 0)}
                  </span>
                </div>
              </div>

              <div className="data-actions">
                <button
                  type="button"
                  className="data-button secondary"
                  onClick={handleExportData}
                  disabled={isProcessing || conversations.length === 0}
                >
                  {isProcessing && showConfirmDialog === null ? t('settings.data.exporting') : t('settings.data.export')}
                </button>

                <button
                  type="button"
                  className="data-button warning"
                  onClick={() => setShowConfirmDialog('clearConversations')}
                  disabled={isProcessing || conversations.length === 0}
                >
                  {t('settings.data.clearConversations')}
                </button>

                <button
                  type="button"
                  className="data-button warning"
                  onClick={() => setShowConfirmDialog('resetSession')}
                  disabled={isProcessing}
                >
                  {t('settings.data.resetSession')}
                </button>

                <button
                  type="button"
                  className="data-button danger"
                  onClick={() => setShowConfirmDialog('clearAll')}
                  disabled={isProcessing}
                >
                  {t('settings.data.clearAll')}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {hasConfirmDialog && showConfirmDialog !== null !== null && undefined !== null && (
        <div 
          className="dialog-overlay" 
          onClick={() => !isProcessing && setShowConfirmDialog(null)}
          role="presentation"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !isProcessing) {
              setShowConfirmDialog(null);
            }
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true">
            <h3 className="dialog-title">
              {isProcessing ? t('settings.processing.title') : t(`settings.confirm.${showConfirmDialog}.title`)}
            </h3>
            <p className="dialog-message">
              {isProcessing ? processingMessage : t(`settings.confirm.${showConfirmDialog}.message`)}
            </p>
            {isProcessing !== null && isProcessing !== undefined && (
              <div className="processing-indicator">
                <div className="spinner" />
              </div>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                className="dialog-button secondary"
                onClick={() => setShowConfirmDialog(null)}
                disabled={isProcessing}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="dialog-button danger"
                onClick={handleConfirmAction}
                disabled={isProcessing}
              >
                {isProcessing ? t('common.processing') : t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </LayoutContainer>
  );
}
