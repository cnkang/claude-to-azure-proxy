/**
 * Model Switch Confirmation Dialog
 *
 * Provides a confirmation dialog for model switching with validation
 * results, warnings, and context preservation options.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4
 */

import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { EnhancedModelInfo } from '../../services/models';
import type { ModelSwitchValidation } from '../../hooks/useModelSelection';
import './ModelSwitchDialog.css';

export interface ModelSwitchDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Current model */
  currentModel: EnhancedModelInfo;
  /** Target model */
  targetModel: EnhancedModelInfo;
  /** Validation results */
  validation: ModelSwitchValidation;
  /** Current context tokens */
  contextTokens: number;
  /** Callback when confirmed */
  onConfirm: (_options: {
    preserveContext: boolean;
    createNew: boolean;
  }) => void;
  /** Callback when cancelled */
  onCancel: () => void;
  /** Whether the switch is in progress */
  isLoading?: boolean;
}

/**
 * Model switch confirmation dialog with validation display
 */
export const ModelSwitchDialog: React.FC<ModelSwitchDialogProps> = ({
  isOpen,
  currentModel,
  targetModel,
  validation,
  contextTokens,
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  const { t } = useTranslation();
  const [preserveContext, setPreserveContext] = useState(true);
  const [createNew, setCreateNew] = useState(false);

  /**
   * Handle confirmation
   */
  const handleConfirm = useCallback((): void => {
    onConfirm({ preserveContext, createNew });
  }, [onConfirm, preserveContext, createNew]);

  /**
   * Render validation messages
   */
  const renderValidationMessages = () => (
    <div className="validation-messages">
      {/* Errors */}
      {validation.errors.length > 0 !== null && undefined !== 0 && (
        <div className="validation-section error-section">
          <div className="section-header">
            <span className="section-icon">❌</span>
            <h4 className="section-title">{t('model.switch.errors')}</h4>
          </div>
          <ul className="message-list">
            {validation.errors.map((error, index) => (
              <li key={index} className="message-item error-message">
                {error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {validation.warnings.length > 0 !== null && undefined !== 0 && (
        <div className="validation-section warning-section">
          <div className="section-header">
            <span className="section-icon">⚠️</span>
            <h4 className="section-title">{t('model.switch.warnings')}</h4>
          </div>
          <ul className="message-list">
            {validation.warnings.map((warning, index) => (
              <li key={index} className="message-item warning-message">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggestions */}
      {validation.suggestions.length > 0 !== null && undefined !== 0 && (
        <div className="validation-section suggestion-section">
          <div className="section-header">
            <span className="section-icon">💡</span>
            <h4 className="section-title">{t('model.switch.suggestions')}</h4>
          </div>
          <ul className="message-list">
            {validation.suggestions.map((suggestion, index) => (
              <li key={index} className="message-item suggestion-message">
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  /**
   * Render model comparison
   */
  const renderModelComparison = () => (
    <div className="model-comparison">
      <div className="comparison-header">
        <h4 className="comparison-title">{t('model.switch.comparison')}</h4>
      </div>

      <div className="comparison-grid">
        {/* Current Model */}
        <div className="model-column current-model">
          <div className="model-header">
            <span className="model-label">{t('model.switch.current')}</span>
            <div className="model-info">
              <span className="model-name">{currentModel.name}</span>
              <span className="provider-icon">
                {currentModel.providerInfo.icon}
              </span>
            </div>
          </div>

          <div className="model-details">
            <div className="detail-item">
              <span className="detail-label">{t('model.contextLimit')}:</span>
              <span className="detail-value">
                {currentModel.contextLimitFormatted}
              </span>
            </div>

            <div className="detail-item">
              <span className="detail-label">{t('model.category')}:</span>
              <span className="detail-value">{currentModel.categoryLabel}</span>
            </div>

            <div className="detail-item">
              <span className="detail-label">{t('model.performance')}:</span>
              <span
                className={`detail-value performance-${currentModel.performanceRating}`}
              >
                {t(`model.performance.${currentModel.performanceRating}`)}
              </span>
            </div>
          </div>
        </div>

        {/* Arrow */}
        <div className="comparison-arrow">
          <span className="arrow-icon">→</span>
        </div>

        {/* Target Model */}
        <div className="model-column target-model">
          <div className="model-header">
            <span className="model-label">{t('model.switch.target')}</span>
            <div className="model-info">
              <span className="model-name">{targetModel.name}</span>
              <span className="provider-icon">
                {targetModel.providerInfo.icon}
              </span>
            </div>
          </div>

          <div className="model-details">
            <div className="detail-item">
              <span className="detail-label">{t('model.contextLimit')}:</span>
              <span className="detail-value">
                {targetModel.contextLimitFormatted}
              </span>
            </div>

            <div className="detail-item">
              <span className="detail-label">{t('model.category')}:</span>
              <span className="detail-value">{targetModel.categoryLabel}</span>
            </div>

            <div className="detail-item">
              <span className="detail-label">{t('model.performance')}:</span>
              <span
                className={`detail-value performance-${targetModel.performanceRating}`}
              >
                {t(`model.performance.${targetModel.performanceRating}`)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  /**
   * Render context information
   */
  const renderContextInfo = () => (
    <div className="context-info">
      <div className="context-header">
        <h4 className="context-title">{t('model.switch.contextInfo')}</h4>
      </div>

      <div className="context-details">
        <div className="context-item">
          <span className="context-label">
            {t('model.switch.currentTokens')}:
          </span>
          <span className="context-value">
            {contextTokens.toLocaleString()}
          </span>
        </div>

        <div className="context-item">
          <span className="context-label">
            {t('model.switch.targetLimit')}:
          </span>
          <span className="context-value">
            {targetModel.contextLength.toLocaleString()}
          </span>
        </div>

        <div className="context-item">
          <span className="context-label">
            {t('model.switch.utilization')}:
          </span>
          <span
            className={`context-value ${contextTokens / targetModel.contextLength > 0.8 ? 'high-usage' : ''}`}
          >
            {((contextTokens / targetModel.contextLength) * 100).toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );

  /**
   * Render options
   */
  const renderOptions = () => (
    <div className="switch-options">
      <div className="options-header">
        <h4 className="options-title">{t('model.switch.options')}</h4>
      </div>

      <div className="option-group">
        <label
          className="option-item"
          htmlFor="preserve-context-checkbox"
          aria-label={t('model.switch.preserveContext')}
        >
          <input
            id="preserve-context-checkbox"
            type="checkbox"
            checked={preserveContext}
            onChange={(e) => setPreserveContext(e.target.checked)}
            disabled={!validation.compatible}
            className="option-checkbox"
            aria-label={t('model.switch.preserveContext')}
          />
          <div className="option-content">
            <span className="option-label">
              {t('model.switch.preserveContext')}
            </span>
            <span className="option-description">
              {t('model.switch.preserveContext.description')}
            </span>
          </div>
        </label>

        <label
          className="option-item"
          htmlFor="create-new-checkbox"
          aria-label={t('model.switch.createNew')}
        >
          <input
            id="create-new-checkbox"
            type="checkbox"
            checked={createNew}
            onChange={(e) => setCreateNew(e.target.checked)}
            className="option-checkbox"
            aria-label={t('model.switch.createNew')}
          />
          <div className="option-content">
            <span className="option-label">{t('model.switch.createNew')}</span>
            <span className="option-description">
              {t('model.switch.createNew.description')}
            </span>
          </div>
        </label>
      </div>
    </div>
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="model-switch-dialog-overlay"
      onClick={onCancel}
      role="presentation"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onCancel();
        }
      }}
    >
      <div
        className="model-switch-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        tabIndex={-1}
      >
        <div className="dialog-header">
          <h3 id="dialog-title" className="dialog-title">
            {t('model.switch.title')}
          </h3>
          <button
            onClick={onCancel}
            className="close-button"
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>

        <div className="dialog-content">
          {renderModelComparison()}
          {renderContextInfo()}
          {renderValidationMessages()}

          {validation.compatible && renderOptions()}
        </div>

        <div className="dialog-footer">
          <div className="footer-actions">
            <button
              onClick={onCancel}
              className="cancel-button"
              disabled={isLoading}
            >
              {t('common.cancel')}
            </button>

            <button
              onClick={handleConfirm}
              disabled={!validation.compatible || isLoading}
              className={`confirm-button ${validation.compatible ? 'compatible' : 'incompatible'}`}
            >
              {isLoading ? (
                <>
                  <span className="loading-spinner" />
                  {t('model.switch.switching')}
                </>
              ) : validation.compatible ? (
                t('model.switch.confirm')
              ) : (
                t('model.switch.cannotSwitch')
              )}
            </button>
          </div>

          {!validation.compatible && (
            <div className="footer-note">
              <span className="note-icon">ℹ️</span>
              <span className="note-text">
                {t('model.switch.incompatibleNote')}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModelSwitchDialog;
