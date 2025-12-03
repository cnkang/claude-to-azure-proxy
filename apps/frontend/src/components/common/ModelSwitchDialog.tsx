/**
 * Model Switch Confirmation Dialog
 *
 * Provides a confirmation dialog for model switching with validation
 * results, warnings, and context preservation options.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4
 */

import type React from 'react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModelSwitchValidation } from '../../hooks/useModelSelection.js';
import type { EnhancedModelInfo } from '../../services/models.js';
import { Glass, cn } from '../ui/Glass.js';

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
    <div className="space-y-4">
      {/* Errors */}
      {validation.errors.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">❌</span>
            <h4 className="font-semibold text-red-900 dark:text-red-100">
              {t('model.switch.errors')}
            </h4>
          </div>
          <ul className="list-disc list-inside space-y-1 text-sm text-red-800 dark:text-red-200">
            {validation.errors.map((error, index) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {validation.warnings.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">⚠️</span>
            <h4 className="font-semibold text-amber-900 dark:text-amber-100">
              {t('model.switch.warnings')}
            </h4>
          </div>
          <ul className="list-disc list-inside space-y-1 text-sm text-amber-800 dark:text-amber-200">
            {validation.warnings.map((warning, index) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggestions */}
      {validation.suggestions.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">💡</span>
            <h4 className="font-semibold text-blue-900 dark:text-blue-100">
              {t('model.switch.suggestions')}
            </h4>
          </div>
          <ul className="list-disc list-inside space-y-1 text-sm text-blue-800 dark:text-blue-200">
            {validation.suggestions.map((suggestion, index) => (
              <li key={suggestion}>{suggestion}</li>
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-gray-900 dark:text-gray-100">
          {t('model.switch.comparison')}
        </h4>
      </div>

      <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-center">
        {/* Current Model */}
        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="flex flex-col gap-2 mb-3">
            <span className="text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              {t('model.switch.current')}
            </span>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {currentModel.name}
              </span>
              <span className="text-lg">{currentModel.providerInfo.icon}</span>
            </div>
          </div>

          <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <div className="flex justify-between">
              <span className="text-gray-700 dark:text-gray-300">
                {t('model.contextLimit')}:
              </span>
              <span className="font-medium">
                {currentModel.contextLimitFormatted}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700 dark:text-gray-300">
                {t('model.category')}:
              </span>
              <span className="font-medium">{currentModel.categoryLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700 dark:text-gray-300">
                {t('model.performance')}:
              </span>
              <span
                className={cn(
                  'font-medium',
                  currentModel.performanceRating === 'high'
                    ? 'text-green-700 dark:text-green-200'
                    : currentModel.performanceRating === 'medium'
                      ? 'text-blue-700 dark:text-blue-200'
                      : 'text-amber-600 dark:text-amber-400'
                )}
              >
                {t(`model.performance.${currentModel.performanceRating}`)}
              </span>
            </div>
          </div>
        </div>

        {/* Arrow */}
        <div className="text-gray-700 dark:text-gray-300 text-xl">→</div>

        {/* Target Model */}
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
          <div className="flex flex-col gap-2 mb-3">
            <span className="text-xs text-blue-700 dark:text-blue-200 uppercase tracking-wider">
              {t('model.switch.target')}
            </span>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {targetModel.name}
              </span>
              <span className="text-lg">{targetModel.providerInfo.icon}</span>
            </div>
          </div>

          <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <div className="flex justify-between">
              <span className="text-gray-700 dark:text-gray-300">
                {t('model.contextLimit')}:
              </span>
              <span className="font-medium">
                {targetModel.contextLimitFormatted}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700 dark:text-gray-300">
                {t('model.category')}:
              </span>
              <span className="font-medium">{targetModel.categoryLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700 dark:text-gray-300">
                {t('model.performance')}:
              </span>
              <span
                className={cn(
                  'font-medium',
                  targetModel.performanceRating === 'high'
                    ? 'text-green-700 dark:text-green-200'
                    : targetModel.performanceRating === 'medium'
                      ? 'text-blue-700 dark:text-blue-200'
                      : 'text-amber-600 dark:text-amber-400'
                )}
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
    <div className="space-y-4">
      <h4 className="font-semibold text-gray-900 dark:text-gray-100">
        {t('model.switch.contextInfo')}
      </h4>

      <div className="grid grid-cols-3 gap-4 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col items-center text-center">
          <span className="text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
            {t('model.switch.currentTokens')}
          </span>
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {contextTokens.toLocaleString()}
          </span>
        </div>

        <div className="flex flex-col items-center text-center">
          <span className="text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
            {t('model.switch.targetLimit')}
          </span>
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {targetModel.contextLength.toLocaleString()}
          </span>
        </div>

        <div className="flex flex-col items-center text-center">
          <span className="text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
            {t('model.switch.utilization')}
          </span>
          <span
            className={cn(
              'text-lg font-semibold',
              contextTokens / targetModel.contextLength > 0.8
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-green-700 dark:text-green-200'
            )}
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
    <div className="space-y-4">
      <h4 className="font-semibold text-gray-900 dark:text-gray-100">
        {t('model.switch.options')}
      </h4>

      <div className="space-y-3">
        <label
          htmlFor="preserve-context-checkbox"
          className={cn(
            'flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer',
            preserveContext
              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700',
            !validation.compatible && 'opacity-50 cursor-not-allowed'
          )}
        >
          <input
            id="preserve-context-checkbox"
            type="checkbox"
            checked={preserveContext}
            onChange={(e) => setPreserveContext(e.target.checked)}
            disabled={!validation.compatible}
            aria-label={t('model.switch.preserveContext')}
            className="mt-1 w-4 h-4 text-blue-700 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
          />
          <div>
            <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
              {t('model.switch.preserveContext')}
            </span>
            <span className="block text-xs text-gray-700 dark:text-gray-300 mt-1">
              {t('model.switch.preserveContext.description')}
            </span>
          </div>
        </label>

        <label
          htmlFor="create-new-checkbox"
          className={cn(
            'flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer',
            createNew
              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
          )}
        >
          <input
            id="create-new-checkbox"
            type="checkbox"
            checked={createNew}
            onChange={(e) => setCreateNew(e.target.checked)}
            aria-label={t('model.switch.createNew')}
            className="mt-1 w-4 h-4 text-blue-700 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
          />
          <div>
            <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
              {t('model.switch.createNew')}
            </span>
            <span className="block text-xs text-gray-700 dark:text-gray-300 mt-1">
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onCancel}
      role="presentation"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onCancel();
        }
      }}
    >
      <Glass
        className="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
        intensity="high"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        tabIndex={-1}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 backdrop-blur-md">
          <h3
            id="dialog-title"
            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
          >
            {t('model.switch.title')}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-700 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-200"
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white dark:bg-gray-900">
          {renderModelComparison()}
          {renderContextInfo()}
          {renderValidationMessages()}

          {validation.compatible && renderOptions()}
        </div>

        <div className="flex flex-col gap-4 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              disabled={isLoading}
            >
              {t('common.cancel')}
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={!validation.compatible || isLoading}
              className={cn(
                'px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors flex items-center gap-2',
                validation.compatible
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-gray-400 cursor-not-allowed'
              )}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
            <div className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 p-2 rounded-lg">
              <span aria-hidden="true">ℹ️</span>
              <span>{t('model.switch.incompatibleNote')}</span>
            </div>
          )}
        </div>
      </Glass>
    </div>
  );
};

export default ModelSwitchDialog;
