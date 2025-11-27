/**
 * Context Warning Component
 *
 * Displays context usage warnings and provides options for context extension
 * and conversation compression when approaching model limits.
 *
 * Requirements: 16.1, 16.2, 16.3
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ContextUsage } from '../../types/index.js';
import { cn } from '../ui/Glass.js';

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

  const formatTokenCount = (tokens: number): string => {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(1)}M`;
    }
    if (tokens >= 1_000) {
      return `${(tokens / 1_000).toFixed(0)}K`;
    }
    return tokens.toLocaleString();
  };

  return (
    <div
      className={cn(
        "rounded-xl p-4 border shadow-lg animate-in slide-in-from-bottom-2 duration-300",
        isCritical 
          ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" 
          : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden="true">{isCritical ? '🚨' : '⚠️'}</span>
          <h4 className={cn(
            "font-semibold",
            isCritical ? "text-red-900 dark:text-red-100" : "text-amber-900 dark:text-amber-100"
          )}>
            {t(`context.warning.${warningLevel}.title`)}
          </h4>
        </div>
        <button
          onClick={onDismiss}
          className={cn(
            "p-1 rounded-full transition-colors",
            isCritical 
              ? "text-red-700 hover:bg-red-100 dark:hover:bg-red-800/50" 
              : "text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-800/50"
          )}
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
              className={cn(
                "h-full transition-all duration-500",
                isCritical ? "bg-red-500" : "bg-amber-500"
              )}
              style={{ width: `${Math.min(usagePercentage, 100)}%` }}
              role="progressbar"
              aria-valuenow={usagePercentage}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t('context.usage.label')}
            />
          </div>
          <div className={cn(
            "flex justify-between text-xs font-medium",
            isCritical ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"
          )}>
            <span>{usagePercentage}%</span>
            <span>
              {formatTokenCount(contextUsage.currentTokens)} /{' '}
              {formatTokenCount(contextUsage.maxTokens)} {t('context.tokens')}
            </span>
          </div>
        </div>

        <p className={cn(
          "text-sm",
          isCritical ? "text-red-800 dark:text-red-200" : "text-amber-800 dark:text-amber-200"
        )}>
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
                "px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-2",
                isCritical
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-amber-600 text-white hover:bg-amber-700",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
              type="button"
            >
              {isExtending ? (
                <>
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
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
              "px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-2",
              isCritical
                ? "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-100 dark:hover:bg-red-900/60"
                : "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
            type="button"
          >
            {isCompressing ? (
              <>
                <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
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

        <div className={cn(
          "flex items-start gap-2 text-xs p-2 rounded-lg",
          isCritical 
            ? "bg-red-100/50 dark:bg-red-900/30 text-red-800 dark:text-red-200" 
            : "bg-amber-100/50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200"
        )}>
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

  const getIndicatorLevel = (): 'normal' | 'warning' | 'critical' => {
    if (usagePercentage >= 95) {
      return 'critical';
    }
    if (usagePercentage >= 80) {
      return 'warning';
    }
    return 'normal';
  };

  const level = getIndicatorLevel();

  const formatTokenCount = (tokens: number): string => {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(1)}M`;
    }
    if (tokens >= 1_000) {
      return `${(tokens / 1_000).toFixed(0)}K`;
    }
    return tokens.toLocaleString();
  };

  const getColorClasses = (level: 'normal' | 'warning' | 'critical') => {
    switch (level) {
      case 'critical':
        return "text-red-700 dark:text-red-200";
      case 'warning':
        return "text-amber-600 dark:text-amber-400";
      default:
        return "text-gray-700 dark:text-gray-300";
    }
  };

  const getBarColorClasses = (level: 'normal' | 'warning' | 'critical') => {
    switch (level) {
      case 'critical':
        return "bg-red-500";
      case 'warning':
        return "bg-amber-500";
      default:
        return "bg-blue-500";
    }
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors",
        getColorClasses(level),
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
          className={cn("h-full transition-all duration-300", getBarColorClasses(level))}
          style={{ width: `${Math.min(usagePercentage, 100)}%` }}
        />
      </div>
      <span className="text-xs font-medium font-mono">{usagePercentage}%</span>
      {contextUsage.isExtended && (
        <span
          className="text-xs"
          title={t('context.extended.tooltip')}
        >
          ↗️
        </span>
      )}
    </button>
  );
};
