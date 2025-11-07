/**
 * Context Compression Dialog Component
 *
 * Provides a dialog interface for configuring and confirming
 * AI-powered conversation compression with preview and options.
 *
 * Requirements: 16.4, 16.5
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { CompressionOptions } from '../../hooks/useContextManagement';
import { frontendLogger } from '../../utils/logger';
import './ContextCompressionDialog.css';

export interface CompressionResult {
  compressedContext: string;
  compressionEvent: {
    id: string;
    timestamp: Date;
    originalTokens: number;
    compressedTokens: number;
    compressionRatio: number;
    method: string;
  };
  estimatedTokens: number;
  compressionRatio: number;
}

export interface ContextCompressionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (_options: CompressionOptions) => Promise<void>;
  onCreateCompressed: () => Promise<void>;
  compressionResult?: CompressionResult | null;
  isCompressing?: boolean;
  originalTokens: number;
  conversationTitle: string;
}

/**
 * Context compression dialog with options and preview
 */
export const ContextCompressionDialog: React.FC<
  ContextCompressionDialogProps
> = ({
  isOpen,
  onClose,
  onConfirm,
  onCreateCompressed,
  compressionResult,
  isCompressing = false,
  originalTokens,
  conversationTitle,
}) => {
  const { t } = useTranslation();

  const [options, setOptions] = useState<CompressionOptions>({
    method: 'ai-summary',
    targetReduction: 0.5,
    preserveCodeBlocks: true,
    preserveRecentMessages: 3,
  });

  const [step, setStep] = useState<'configure' | 'preview' | 'creating'>(
    'configure'
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen === true) {
      setStep('configure');
      setShowAdvanced(false);
    }
  }, [isOpen]);

  // Update step based on compression result
  useEffect(() => {
    if (compressionResult && step === 'configure') {
      setStep('preview');
    }
  }, [compressionResult, step]);

  const formatTokenCount = (tokens: number): string => {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(1)}M`;
    }
    if (tokens >= 1_000) {
      return `${(tokens / 1_000).toFixed(0)}K`;
    }
    return tokens.toLocaleString();
  };

  const estimatedTokensAfterCompression = Math.round(
    originalTokens * (1 - options.targetReduction)
  );

  const handleCompress = useCallback(async (): Promise<void> => {
    try {
      await onConfirm(options);
    } catch (error) {
      frontendLogger.error('Compression failed', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }, [onConfirm, options]);

  const handleCreateCompressed = useCallback(async (): Promise<void> => {
    setStep('creating');
    try {
      await onCreateCompressed();
      onClose();
    } catch (error) {
      frontendLogger.error('Failed to create compressed conversation', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      setStep('preview');
    }
  }, [onCreateCompressed, onClose]);

  const handleCompressClick = useCallback((): void => {
    handleCompress().catch(() => undefined);
  }, [handleCompress]);

  const handleCreateCompressedClick = useCallback((): void => {
    handleCreateCompressed().catch(() => undefined);
  }, [handleCreateCompressed]);

  if (!isOpen) {
    return null;
  }

  const renderConfigureStep = (): React.JSX.Element => (
    <div className="compression-dialog__content">
      <div className="compression-dialog__header">
        <h3>{t('context.compression.title')}</h3>
        <button
          onClick={onClose}
          className="compression-dialog__close"
          aria-label={t('common.close')}
          type="button"
        >
          ×
        </button>
      </div>

      <div className="compression-dialog__body">
        <div className="compression-info">
          <p className="compression-info__description">
            {t('context.compression.description')}
          </p>

          <div className="compression-stats">
            <div className="compression-stat">
              <span className="compression-stat__label">
                {t('context.compression.current')}:
              </span>
              <span className="compression-stat__value">
                {formatTokenCount(originalTokens)}
              </span>
            </div>
            <div className="compression-stat">
              <span className="compression-stat__label">
                {t('context.compression.estimated')}:
              </span>
              <span className="compression-stat__value">
                {formatTokenCount(estimatedTokensAfterCompression)}
              </span>
            </div>
            <div className="compression-stat">
              <span className="compression-stat__label">
                {t('context.compression.reduction')}:
              </span>
              <span className="compression-stat__value compression-stat__value--highlight">
                {Math.round(options.targetReduction * 100)}%
              </span>
            </div>
          </div>
        </div>

        <div className="compression-options">
          <div className="compression-option">
            <label
              htmlFor="compression-method"
              className="compression-option__label"
            >
              {t('context.compression.method.label')}
            </label>
            <select
              id="compression-method"
              value={options.method}
              onChange={(e) =>
                setOptions((prev) => ({
                  ...prev,
                  method: e.target.value as CompressionOptions['method'],
                }))
              }
              className="compression-option__select"
            >
              <option value="ai-summary">
                {t('context.compression.method.aiSummary')}
              </option>
              <option value="selective-removal">
                {t('context.compression.method.selectiveRemoval')}
              </option>
              <option value="hierarchical">
                {t('context.compression.method.hierarchical')}
              </option>
            </select>
            <p className="compression-option__description">
              {t(`context.compression.method.${options.method}.description`)}
            </p>
          </div>

          <div className="compression-option">
            <label
              htmlFor="target-reduction"
              className="compression-option__label"
            >
              {t('context.compression.targetReduction.label')} (
              {Math.round(options.targetReduction * 100)}%)
            </label>
            <input
              id="target-reduction"
              type="range"
              min="0.2"
              max="0.8"
              step="0.1"
              value={options.targetReduction}
              onChange={(e) =>
                setOptions((prev) => ({
                  ...prev,
                  targetReduction: parseFloat(e.target.value),
                }))
              }
              className="compression-option__range"
            />
            <div className="compression-option__range-labels">
              <span>20%</span>
              <span>50%</span>
              <span>80%</span>
            </div>
          </div>

          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="compression-advanced-toggle"
            type="button"
          >
            {t('context.compression.advancedOptions')}
            <span
              className={`compression-advanced-toggle__icon ${showAdvanced ? 'expanded' : ''}`}
            >
              ▼
            </span>
          </button>

          {showAdvanced && (
            <div className="compression-advanced">
              <div className="compression-option">
                <label className="compression-option__checkbox">
                  <input
                    type="checkbox"
                    checked={options.preserveCodeBlocks}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        preserveCodeBlocks: e.target.checked,
                      }))
                    }
                  />
                  <span className="compression-option__checkbox-label">
                    {t('context.compression.preserveCodeBlocks')}
                  </span>
                </label>
                <p className="compression-option__description">
                  {t('context.compression.preserveCodeBlocks.description')}
                </p>
              </div>

              <div className="compression-option">
                <label
                  htmlFor="preserve-recent"
                  className="compression-option__label"
                >
                  {t('context.compression.preserveRecent.label')}
                </label>
                <input
                  id="preserve-recent"
                  type="number"
                  min="1"
                  max="10"
                  value={options.preserveRecentMessages}
                  onChange={(e) =>
                    setOptions((prev) => ({
                      ...prev,
                      preserveRecentMessages: parseInt(e.target.value, 10),
                    }))
                  }
                  className="compression-option__number"
                />
                <p className="compression-option__description">
                  {t('context.compression.preserveRecent.description')}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="compression-benefits">
          <h4>{t('context.compression.benefits.title')}</h4>
          <ul>
            <li>{t('context.compression.benefits.preserve')}</li>
            <li>{t('context.compression.benefits.reduce')}</li>
            <li>{t('context.compression.benefits.continue')}</li>
            <li>{t('context.compression.benefits.performance')}</li>
          </ul>
        </div>
      </div>

      <div className="compression-dialog__footer">
        <button
          onClick={onClose}
          className="compression-dialog__button compression-dialog__button--secondary"
          type="button"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={handleCompressClick}
          disabled={isCompressing}
          className="compression-dialog__button compression-dialog__button--primary"
          type="button"
        >
          {isCompressing ? (
            <>
              <span className="spinner" aria-hidden="true" />
              {t('context.compression.compressing')}
            </>
          ) : (
            t('context.compression.startCompression')
          )}
        </button>
      </div>
    </div>
  );

  const renderPreviewStep = (): React.JSX.Element | null => {
    if (!compressionResult) {
      return null;
    }

    return (
      <div className="compression-dialog__content">
        <div className="compression-dialog__header">
          <h3>{t('context.compression.preview.title')}</h3>
          <button
            onClick={onClose}
            className="compression-dialog__close"
            aria-label={t('common.close')}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="compression-dialog__body">
          <div className="compression-preview">
            <div className="compression-preview__stats">
              <div className="compression-stat">
                <span className="compression-stat__label">
                  {t('context.compression.original')}:
                </span>
                <span className="compression-stat__value">
                  {formatTokenCount(
                    compressionResult.compressionEvent.originalTokens
                  )}
                </span>
              </div>
              <div className="compression-stat">
                <span className="compression-stat__label">
                  {t('context.compression.compressed')}:
                </span>
                <span className="compression-stat__value">
                  {formatTokenCount(
                    compressionResult.compressionEvent.compressedTokens
                  )}
                </span>
              </div>
              <div className="compression-stat">
                <span className="compression-stat__label">
                  {t('context.compression.reduction')}:
                </span>
                <span className="compression-stat__value compression-stat__value--success">
                  {Math.round(compressionResult.compressionRatio * 100)}%
                </span>
              </div>
            </div>

            <div className="compression-preview__content">
              <h4>{t('context.compression.preview.content')}</h4>
              <div className="compression-preview__text">
                {compressionResult.compressedContext.substring(0, 500)}
                {compressionResult.compressedContext.length > 500 && '...'}
              </div>
            </div>

            <div className="compression-preview__info">
              <p>{t('context.compression.preview.description')}</p>
              <p>
                <strong>{t('context.compression.newConversation')}:</strong>{' '}
                {conversationTitle} ({t('context.compression.compressed')})
              </p>
            </div>
          </div>
        </div>

        <div className="compression-dialog__footer">
          <button
            onClick={() => setStep('configure')}
            className="compression-dialog__button compression-dialog__button--secondary"
            type="button"
          >
            {t('common.back')}
          </button>
          <button
            onClick={handleCreateCompressedClick}
            className="compression-dialog__button compression-dialog__button--primary"
            type="button"
          >
            {t('context.compression.createConversation')}
          </button>
        </div>
      </div>
    );
  };

  const renderCreatingStep = (): React.JSX.Element => (
    <div className="compression-dialog__content">
      <div className="compression-dialog__header">
        <h3>{t('context.compression.creating.title')}</h3>
      </div>

      <div className="compression-dialog__body">
        <div className="compression-creating">
          <div className="compression-creating__spinner">
            <span className="spinner spinner--large" aria-hidden="true" />
          </div>
          <p className="compression-creating__message">
            {t('context.compression.creating.message')}
          </p>
        </div>
      </div>
    </div>
  );

  const handleOverlayClick = (
    event: React.MouseEvent<HTMLDivElement>
  ): void => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleOverlayKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>
  ): void => {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="compression-dialog-overlay"
      role="button"
      tabIndex={0}
      aria-label={t('common.close')}
      onClick={handleOverlayClick}
      onKeyDown={handleOverlayKeyDown}
    >
      <div
        className="compression-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="compression-dialog-title"
      >
        {step === 'configure' && renderConfigureStep()}
        {step === 'preview' && renderPreviewStep()}
        {step === 'creating' && renderCreatingStep()}
      </div>
    </div>
  );
};
