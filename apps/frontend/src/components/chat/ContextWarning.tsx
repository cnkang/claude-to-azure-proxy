/**
 * Context Warning Component
 *
 * Displays context usage warnings and provides options for context extension
 * and conversation compression when approaching model limits.
 *
 * Requirements: 16.1, 16.2, 16.3
 */

import type React from 'react';
import { useTranslation } from 'react-i18next';
import type { ContextUsage } from '../../types/index.js';
import { cn } from '../ui/Glass.js';
import {
  formatTokenCount,
  getIndicatorBarColorClasses,
  getIndicatorColorClasses,
  getIndicatorLevel,
  getWarningColorClasses,
} from './contextWarningHelpers.js';

export interface ContextWarningProps {
  contextUsage: ContextUsage;
  warningLevel: 'warning' | 'critical';
  onExtendContext: () => void;
  onCompressContext: () => void;
  onDismiss: () => void;
  isExtending?: boolean;
  isCompressing?: boolean;
  canExtend?: boolean;
}

/**
 * Context warning component with usage indicators and action buttons
 */
export const ContextWarning: React.FC<ContextWarningProps> = ({
  contextUsage,
  warningLevel,
  onExtendContext,
  onCompressContext,
  onDismiss,
  isExtending = false,
  isCompressing = false,
  canExtend = false,
}) => {
  const { t } = useTranslation();

  const usagePercentage = Math.round(
    (contextUsage.currentTokens / contextUsage.maxTokens) * 100
  );
  const isCritical = warningLevel === 'critical';
  const colors = getWarningColorClasses(isCritical);

  return (
    <div
      className={cn(
        'rounded-xl p-4 border shadow-lg animate-in slide-in-from-bottom-2 duration-300',
        colors.container
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden="true">
            {isCritical ? '🚨' : '⚠️'}
          </span>
          <h4 className={cn('font-semibold', colors.title)}>
            {t(`context.warning.${warningLevel}.title`)}
          </h4>
        </div>
        <button
          onClick={onDismiss}
          className={cn('p-1 rounded-full transition-colors', colors.button)}
          aria-label={t('common.close')}
          type="button"
        >
          ✕
        </button>
      </div>

      <div className="space-y-4">
        <div className="space-y-1">
          <div className="h-2 bg-white/50 dark:bg-black/20 rounded-full overflow-hidden">
            <div
              className={cn('h-full transition-all duration-500', colors.progress)}
              style={{ width: `${Math.min(usagePercentage, 100)}%` }}
              role="progressbar"
              tabIndex={0}
              aria-valuenow={usagePercentage}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t('context.usage.label')}
            />
          </div>
          <div className={cn('flex justify-between text-xs font-medium', colors.text)}>
            <span>{usagePercentage}%</span>
            <span>
              {formatTokenCount(contextUsage.currentTokens)} /{' '}
              {formatTokenCount(contextUsage.maxTokens)} {t('context.tokens')}
            </span>
          </div>
        </div>

        <p className={cn('text-sm', colors.text)}>
          {t(`context.warning.${warningLevel}.message`, {
            percentage: usagePercentage,
            current: formatTokenCount(contextUsage.currentTokens),
            max: formatTokenCount(contextUsage.maxTokens),
          })}
        </p>

        <div className="flex flex-wrap gap-2">
          {canExtend && !contextUsage.isExtended && (
            <button
              onClick={onExtendContext}
              disabled={isExtending || isCompressing}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-2',
                colors.actionButton,
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
              type="button"
            >
              {isExtending ? (
                <>
                  <div
                    className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"
                    aria-hidden="true"
                  />
                  {t('context.actions.extending')}
                </>
              ) : (
                <>
                  {t('context.actions.extend')}
                  {typeof contextUsage.extendedMaxTokens === 'number' && (
                    <span className="opacity-75 text-xs ml-1">
                      ({formatTokenCount(contextUsage.extendedMaxTokens)}{' '}
                      {t('context.tokens')})
                    </span>
                  )}
                </>
              )}
            </button>
          )}

          <button
            onClick={onCompressContext}
            disabled={isExtending || isCompressing}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-2',
              colors.secondaryButton,
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            type="button"
          >
            {isCompressing ? (
              <>
                <div
                  className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"
                  aria-hidden="true"
                />
                {t('context.actions.compressing')}
              </>
            ) : (
              t('context.actions.compress')
            )}
          </button>
        </div>

        {contextUsage.isExtended && (
          <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-200 bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg">
            <span aria-hidden="true">ℹ️</span>
            <span>{t('context.warning.extended')}</span>
          </div>
        )}

        <div className={cn('flex items-start gap-2 text-xs p-2 rounded-lg', colors.tip)}>
          <span aria-hidden="true">💡</span>
          <span>{t(`context.warning.${warningLevel}.tip`)}</span>
        </div>
      </div>
    </div>
  );
};

/**
 * Compact context usage indicator for the chat header
 */
export interface ContextUsageIndicatorProps {
  contextUsage: ContextUsage;
  onClick?: () => void;
  className?: string;
}

export const ContextUsageIndicator: React.FC<ContextUsageIndicatorProps> = ({
  contextUsage,
  onClick,
  className = '',
}) => {
  const { t } = useTranslation();

  const usagePercentage = Math.round(
    (contextUsage.currentTokens / contextUsage.maxTokens) * 100
  );

  const level = getIndicatorLevel(usagePercentage);

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
        getIndicatorColorClasses(level),
        className
      )}
      title={t('context.usage.tooltip', {
        current: formatTokenCount(contextUsage.currentTokens),
        max: formatTokenCount(contextUsage.maxTokens),
        percentage: usagePercentage,
      })}
      type="button"
      aria-label={t('context.usage.label')}
    >
      <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full transition-all duration-300',
            getIndicatorBarColorClasses(level)
          )}
          style={{ width: `${Math.min(usagePercentage, 100)}%` }}
        />
      </div>
      <span className="text-xs font-medium font-mono">{usagePercentage}%</span>
      {contextUsage.isExtended && (
        <span className="text-xs" title={t('context.extended.tooltip')}>
          ↗️
        </span>
      )}
    </button>
  );
};
