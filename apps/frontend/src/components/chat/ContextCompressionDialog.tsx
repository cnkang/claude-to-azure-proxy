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
import type { CompressionOptions } from '../../hooks/useContextManagement.js';
import { frontendLogger } from '../../utils/logger.js';
import { Glass } from '../ui/Glass.js';

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
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('context.compression.title')}</h3>
        <button
          onClick={onClose}
          className="text-gray-700 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-200"
          aria-label={t('common.close')}
          type="button"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {t('context.compression.description')}
          </p>

          <div className="grid grid-cols-3 gap-4 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl">
            <div className="flex flex-col items-center text-center">
              <span className="text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                {t('context.compression.current')}
              </span>
              <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {formatTokenCount(originalTokens)}
              </span>
            </div>
            <div className="flex flex-col items-center text-center">
              <span className="text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                {t('context.compression.estimated')}
              </span>
              <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {formatTokenCount(estimatedTokensAfterCompression)}
              </span>
            </div>
            <div className="flex flex-col items-center text-center">
              <span className="text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                {t('context.compression.reduction')}
              </span>
              <span className="text-lg font-semibold text-blue-700 dark:text-blue-200">
                {Math.round(options.targetReduction * 100)}%
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <label
              htmlFor="compression-method"
              className="block text-sm font-medium text-gray-700 dark:text-gray-200"
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
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
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
            <p className="text-xs text-gray-700 dark:text-gray-300">
              {t(`context.compression.method.${options.method}.description`)}
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="target-reduction"
              className="block text-sm font-medium text-gray-700 dark:text-gray-200"
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
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-700 dark:text-gray-300">
              <span>20%</span>
              <span>50%</span>
              <span>80%</span>
            </div>
          </div>

          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-200 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
            type="button"
          >
            {t('context.compression.advancedOptions')}
            <span
              className={`transform transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}
            >
              ▼
            </span>
          </button>

          {showAdvanced && (
            <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl animate-in slide-in-from-top-2 duration-200">
              <div className="space-y-2">
                <label htmlFor="preserve-code-blocks" className="flex items-start gap-3 cursor-pointer">
                  <input
                    id="preserve-code-blocks"
                    type="checkbox"
                    checked={options.preserveCodeBlocks}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        preserveCodeBlocks: e.target.checked,
                      }))
                    }
                    aria-label={t('context.compression.preserveCodeBlocks')}
                    className="mt-1 w-4 h-4 text-blue-700 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <div>
                    <span className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                      {t('context.compression.preserveCodeBlocks')}
                    </span>
                    <span className="block text-xs text-gray-700 dark:text-gray-300 mt-1">
                      {t('context.compression.preserveCodeBlocks.description')}
                    </span>
                  </div>
                </label>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="preserve-recent"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-200"
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
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
                <p className="text-xs text-gray-700 dark:text-gray-300">
                  {t('context.compression.preserveRecent.description')}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl">
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">{t('context.compression.benefits.title')}</h4>
          <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-200 list-disc list-inside">
            <li>{t('context.compression.benefits.preserve')}</li>
            <li>{t('context.compression.benefits.reduce')}</li>
            <li>{t('context.compression.benefits.continue')}</li>
            <li>{t('context.compression.benefits.performance')}</li>
          </ul>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          type="button"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={handleCompressClick}
          disabled={isCompressing}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          type="button"
        >
          {isCompressing ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
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
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('context.compression.preview.title')}</h3>
          <button
            onClick={onClose}
            className="text-gray-700 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-200"
            aria-label={t('common.close')}
            type="button"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl">
              <div className="flex flex-col items-center text-center">
                <span className="text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                  {t('context.compression.original')}
                </span>
                <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {formatTokenCount(
                    compressionResult.compressionEvent.originalTokens
                  )}
                </span>
              </div>
              <div className="flex flex-col items-center text-center">
                <span className="text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                  {t('context.compression.compressed')}
                </span>
                <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {formatTokenCount(
                    compressionResult.compressionEvent.compressedTokens
                  )}
                </span>
              </div>
              <div className="flex flex-col items-center text-center">
                <span className="text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                  {t('context.compression.reduction')}
                </span>
                <span className="text-lg font-semibold text-green-700 dark:text-green-200">
                  {Math.round(compressionResult.compressionRatio * 100)}%
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">{t('context.compression.preview.content')}</h4>
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm text-gray-700 dark:text-gray-300 font-mono h-48 overflow-y-auto border border-gray-200 dark:border-gray-700">
                {compressionResult.compressedContext.substring(0, 500)}
                {compressionResult.compressedContext.length > 500 && '...'}
              </div>
            </div>

            <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <p>{t('context.compression.preview.description')}</p>
              <p>
                <strong className="text-gray-900 dark:text-gray-100">{t('context.compression.newConversation')}:</strong>{' '}
                {conversationTitle} ({t('context.compression.compressed')})
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <button
            onClick={() => setStep('configure')}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            type="button"
          >
            {t('common.back')}
          </button>
          <button
            onClick={handleCreateCompressedClick}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            type="button"
          >
            {t('context.compression.createConversation')}
          </button>
        </div>
      </div>
    );
  };

  const renderCreatingStep = (): React.JSX.Element => (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
      <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" aria-hidden="true" />
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('context.compression.creating.title')}</h3>
      <p className="text-sm text-gray-700 dark:text-gray-300 max-w-xs">
        {t('context.compression.creating.message')}
      </p>
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      role="button"
      tabIndex={0}
      aria-label={t('common.close')}
      onClick={handleOverlayClick}
      onKeyDown={handleOverlayKeyDown}
    >
      <Glass 
        className="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl" 
        intensity="high"
        role="dialog"
        aria-modal="true"
        aria-labelledby="compression-dialog-title"
      >
        {step === 'configure' && renderConfigureStep()}
        {step === 'preview' && renderPreviewStep()}
        {step === 'creating' && renderCreatingStep()}
      </Glass>
    </div>
  );
};
