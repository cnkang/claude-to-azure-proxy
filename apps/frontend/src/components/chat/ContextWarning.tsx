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
import type { ContextUsage } from '../../types/index';
import './ContextWarning.css';

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
  
  const usagePercentage = Math.round((contextUsage.currentTokens / contextUsage.maxTokens) * 100);
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
    <div className={`context-warning ${warningLevel}`} role="alert" aria-live="polite">
      <div className="context-warning__header">
        <div className="context-warning__icon">
          {isCritical ? '🚨' : '⚠️'}
        </div>
        <div className="context-warning__title">
          <h4>{t(`context.warning.${warningLevel}.title`)}</h4>
          <button
            onClick={onDismiss}
            className="context-warning__close"
            aria-label={t('common.close')}
            type="button"
          >
            ×
          </button>
        </div>
      </div>
      
      <div className="context-warning__content">
        <div className="context-usage-bar">
          <div className="context-usage-bar__track">
            <div 
              className={`context-usage-bar__fill context-usage-bar__fill--${warningLevel}`}
              style={{ width: `${Math.min(usagePercentage, 100)}%` }}
              role="progressbar"
              aria-valuenow={usagePercentage}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t('context.usage.label')}
            />
          </div>
          <div className="context-usage-bar__text">
            <span className="context-usage-bar__percentage">
              {usagePercentage}%
            </span>
            <span className="context-usage-bar__tokens">
              {formatTokenCount(contextUsage.currentTokens)} / {formatTokenCount(contextUsage.maxTokens)} {t('context.tokens')}
            </span>
          </div>
        </div>

        <p className="context-warning__message">
          {t(`context.warning.${warningLevel}.message`, { 
            percentage: usagePercentage,
            current: formatTokenCount(contextUsage.currentTokens),
            max: formatTokenCount(contextUsage.maxTokens),
          })}
        </p>

        <div className="context-warning__actions">
          {canExtend && !contextUsage.isExtended && (
            <button
              onClick={onExtendContext}
              disabled={isExtending || isCompressing}
              className="context-warning__action context-warning__action--primary"
              type="button"
            >
              {isExtending ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  {t('context.actions.extending')}
                </>
              ) : (
                <>
                  {t('context.actions.extend')}
                  {typeof contextUsage.extendedMaxTokens === 'number' && (
                    <span className="context-warning__action-detail">
                      ({formatTokenCount(contextUsage.extendedMaxTokens)} {t('context.tokens')})
                    </span>
                  )}
                </>
              )}
            </button>
          )}
          
          <button
            onClick={onCompressContext}
            disabled={isExtending || isCompressing}
            className="context-warning__action context-warning__action--secondary"
            type="button"
          >
            {isCompressing ? (
              <>
                <span className="spinner" aria-hidden="true" />
                {t('context.actions.compressing')}
              </>
            ) : (
              t('context.actions.compress')
            )}
          </button>
        </div>

        {contextUsage.isExtended && (
          <div className="context-warning__note context-warning__note--info">
            <span className="context-warning__note-icon">ℹ️</span>
            <span>{t('context.warning.extended')}</span>
          </div>
        )}

        <div className="context-warning__note">
          <span className="context-warning__note-icon">💡</span>
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
  
  const usagePercentage = Math.round((contextUsage.currentTokens / contextUsage.maxTokens) * 100);
  
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

  return (
    <button
      onClick={onClick}
      className={`context-usage-indicator context-usage-indicator--${level} ${className}`}
      title={t('context.usage.tooltip', {
        current: formatTokenCount(contextUsage.currentTokens),
        max: formatTokenCount(contextUsage.maxTokens),
        percentage: usagePercentage,
      })}
      type="button"
      aria-label={t('context.usage.label')}
    >
      <div className="context-usage-indicator__bar">
        <div 
          className={`context-usage-indicator__fill context-usage-indicator__fill--${level}`}
          style={{ width: `${Math.min(usagePercentage, 100)}%` }}
        />
      </div>
      <span className="context-usage-indicator__text">
        {usagePercentage}%
      </span>
      {contextUsage.isExtended && (
        <span className="context-usage-indicator__badge" title={t('context.extended.tooltip')}>
          ↗️
        </span>
      )}
    </button>
  );
};
