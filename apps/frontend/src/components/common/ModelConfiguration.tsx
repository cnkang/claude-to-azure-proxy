/**
 * Model Configuration Component
 *
 * Provides advanced model configuration settings including temperature,
 * max tokens, and other model-specific parameters.
 *
 * Requirements: 2.4, 2.5, 12.4
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModelConfiguration as ModelConfig } from '../../services/models';
import type { EnhancedModelInfo } from '../../services/models';
import './ModelConfiguration.css';

export interface ModelConfigurationProps {
  /** Model information */
  model: EnhancedModelInfo;
  /** Current configuration */
  configuration: ModelConfig;
  /** Callback when configuration changes */
  onConfigurationChange: (config: ModelConfig) => void;
  /** Whether the configuration is disabled */
  disabled?: boolean;
  /** Show advanced settings */
  showAdvanced?: boolean;
  /** Compact display mode */
  compact?: boolean;
}

/**
 * Model configuration component with parameter controls
 */
export const ModelConfiguration: React.FC<ModelConfigurationProps> = ({
  model,
  configuration,
  onConfigurationChange,
  disabled = false,
  showAdvanced = false,
  compact = false,
}) => {
  const { t } = useTranslation();
  const [localConfig, setLocalConfig] = useState<ModelConfig>(configuration);
  const [showAdvancedSettings, setShowAdvancedSettings] =
    useState(showAdvanced);

  // Update local config when prop changes
  useEffect(() => {
    setLocalConfig(configuration);
  }, [configuration]);

  /**
   * Handle configuration parameter change
   */
  const handleParameterChange = useCallback(
    (parameter: keyof ModelConfig, value: number | string | string[]): void => {
      const updatedConfig = { ...localConfig, [parameter]: value };
      setLocalConfig(updatedConfig);
      onConfigurationChange(updatedConfig);
    },
    [localConfig, onConfigurationChange]
  );

  /**
   * Reset to default configuration
   */
  const handleReset = useCallback((): void => {
    // This would typically come from the model service
    const defaultConfig: ModelConfig = {
      modelId: model.id,
      temperature: 0.7,
      maxTokens: Math.min(2048, Math.floor(model.contextLength * 0.5)),
      topP: 1.0,
      frequencyPenalty: 0.0,
      presencePenalty: 0.0,
      stopSequences: [],
    };

    setLocalConfig(defaultConfig);
    onConfigurationChange(defaultConfig);
  }, [model, onConfigurationChange]);

  /**
   * Render parameter slider
   */
  const renderSlider = (
    parameter: keyof ModelConfig,
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    description?: string
  ) => (
    <div className="config-parameter">
      <div className="parameter-header">
        <label className="parameter-label" htmlFor={`${parameter}-slider`}>
          {label}
        </label>
        <span className="parameter-value">{value}</span>
      </div>
      {description !== null && description !== undefined && (
        <p className="parameter-description">{description}</p>
      )}
      <div className="slider-container">
        <input
          id={`${parameter}-slider`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) =>
            handleParameterChange(parameter, parseFloat(e.target.value))
          }
          disabled={disabled}
          className="parameter-slider"
          aria-label={`${label}: ${value}`}
        />
        <div className="slider-track">
          <div
            className="slider-fill"
            style={{ width: `${((value - min) / (max - min)) * 100}%` }}
          />
        </div>
      </div>
      <div className="slider-labels">
        <span className="slider-label-min">{min}</span>
        <span className="slider-label-max">{max}</span>
      </div>
    </div>
  );

  /**
   * Render number input
   */
  const renderNumberInput = (
    parameter: keyof ModelConfig,
    label: string,
    value: number,
    min?: number,
    max?: number,
    description?: string
  ) => (
    <div className="config-parameter">
      <label className="parameter-label" htmlFor={`${parameter}-input`}>
        {label}
      </label>
      {description !== null && description !== undefined && (
        <p className="parameter-description">{description}</p>
      )}
      <input
        id={`${parameter}-input`}
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) =>
          handleParameterChange(parameter, parseInt(e.target.value, 10))
        }
        disabled={disabled}
        className="parameter-input"
        aria-label={label}
      />
    </div>
  );

  /**
   * Render text area for stop sequences
   */
  const renderStopSequences = () => (
    <div className="config-parameter">
      <label className="parameter-label" htmlFor="stop-sequences">
        {t('model.config.stopSequences')}
      </label>
      <p className="parameter-description">
        {t('model.config.stopSequences.description')}
      </p>
      <textarea
        id="stop-sequences"
        value={localConfig.stopSequences?.join('\n') ?? ''}
        onChange={(e) => {
          const sequences = e.target.value
            .split('\n')
            .map((seq) => seq.trim())
            .filter((seq) => seq.length > 0);
          handleParameterChange('stopSequences', sequences);
        }}
        disabled={disabled}
        className="parameter-textarea"
        placeholder={t('model.config.stopSequences.placeholder')}
        rows={3}
        aria-label={t('model.config.stopSequences')}
      />
    </div>
  );

  /**
   * Render system prompt input
   */
  const renderSystemPrompt = () => (
    <div className="config-parameter">
      <label className="parameter-label" htmlFor="system-prompt">
        {t('model.config.systemPrompt')}
      </label>
      <p className="parameter-description">
        {t('model.config.systemPrompt.description')}
      </p>
      <textarea
        id="system-prompt"
        value={localConfig.systemPrompt ?? ''}
        onChange={(e) => handleParameterChange('systemPrompt', e.target.value)}
        disabled={disabled}
        className="parameter-textarea"
        placeholder={t('model.config.systemPrompt.placeholder')}
        rows={4}
        aria-label={t('model.config.systemPrompt')}
      />
    </div>
  );

  /**
   * Get recommended max tokens based on model context length
   */
  const getRecommendedMaxTokens = () => {
    return Math.min(4096, Math.floor(model.contextLength * 0.5));
  };

  return (
    <div
      className={`model-configuration ${compact ? 'compact' : ''} ${disabled ? 'disabled' : ''}`}
    >
      <div className="config-header">
        <h3 className="config-title">
          {t('model.config.title', { modelName: model.name })}
        </h3>
        <div className="config-actions">
          <button
            onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
            className="toggle-advanced-button"
            aria-expanded={showAdvancedSettings}
          >
            {showAdvancedSettings
              ? t('model.config.hideAdvanced')
              : t('model.config.showAdvanced')}
          </button>
          <button
            onClick={handleReset}
            disabled={disabled}
            className="reset-button"
          >
            {t('model.config.reset')}
          </button>
        </div>
      </div>

      <div className="config-content">
        {/* Basic Parameters */}
        <div className="config-section">
          <h4 className="section-title">{t('model.config.basic')}</h4>

          {renderSlider(
            'temperature',
            t('model.config.temperature'),
            0,
            2,
            0.1,
            localConfig.temperature ?? 0.7,
            t('model.config.temperature.description')
          )}

          {renderNumberInput(
            'maxTokens',
            t('model.config.maxTokens'),
            localConfig.maxTokens ?? getRecommendedMaxTokens(),
            1,
            Math.min(8192, model.contextLength),
            t('model.config.maxTokens.description', {
              recommended: getRecommendedMaxTokens(),
              max: Math.min(8192, model.contextLength),
            })
          )}
        </div>

        {/* Advanced Parameters */}
        {showAdvancedSettings !== null &&
          showAdvancedSettings !== undefined && (
            <div className="config-section">
              <h4 className="section-title">{t('model.config.advanced')}</h4>

              {renderSlider(
                'topP',
                t('model.config.topP'),
                0,
                1,
                0.05,
                localConfig.topP ?? 1.0,
                t('model.config.topP.description')
              )}

              {renderSlider(
                'frequencyPenalty',
                t('model.config.frequencyPenalty'),
                -2,
                2,
                0.1,
                localConfig.frequencyPenalty ?? 0.0,
                t('model.config.frequencyPenalty.description')
              )}

              {renderSlider(
                'presencePenalty',
                t('model.config.presencePenalty'),
                -2,
                2,
                0.1,
                localConfig.presencePenalty ?? 0.0,
                t('model.config.presencePenalty.description')
              )}

              {renderStopSequences()}
              {renderSystemPrompt()}
            </div>
          )}

        {/* Model Information */}
        <div className="config-section">
          <h4 className="section-title">{t('model.config.modelInfo')}</h4>

          <div className="model-info-grid">
            <div className="info-item">
              <span className="info-label">{t('model.contextLimit')}:</span>
              <span className="info-value">{model.contextLimitFormatted}</span>
            </div>

            <div className="info-item">
              <span className="info-label">{t('model.provider')}:</span>
              <span className="info-value">
                {model.providerInfo.icon} {model.providerInfo.name}
              </span>
            </div>

            <div className="info-item">
              <span className="info-label">{t('model.category')}:</span>
              <span className="info-value">{model.categoryLabel}</span>
            </div>

            <div className="info-item">
              <span className="info-label">{t('model.performance')}:</span>
              <span
                className={`info-value performance-${model.performanceRating}`}
              >
                {t(`model.performance.${model.performanceRating}`)}
              </span>
            </div>
          </div>

          <div className="capabilities-section">
            <span className="capabilities-label">
              {t('model.capabilities')}:
            </span>
            <div className="capabilities-list">
              {model.capabilities.map((capability) => (
                <span key={capability} className="capability-tag">
                  {t(`model.capability.${capability}`, capability)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Configuration Summary */}
        {!compact !== null && compact !== undefined && (
          <div className="config-section">
            <h4 className="section-title">{t('model.config.summary')}</h4>

            <div className="config-summary">
              <div className="summary-item">
                <span className="summary-label">
                  {t('model.config.creativity')}:
                </span>
                <span className="summary-value">
                  {localConfig.temperature && localConfig.temperature > 1.0
                    ? t('model.config.creativity.high')
                    : localConfig.temperature && localConfig.temperature > 0.5
                      ? t('model.config.creativity.medium')
                      : t('model.config.creativity.low')}
                </span>
              </div>

              <div className="summary-item">
                <span className="summary-label">
                  {t('model.config.responseLength')}:
                </span>
                <span className="summary-value">
                  {t('model.config.responseLength.tokens', {
                    tokens: localConfig.maxTokens?.toLocaleString() ?? '0',
                  })}
                </span>
              </div>

              <div className="summary-item">
                <span className="summary-label">
                  {t('model.config.diversity')}:
                </span>
                <span className="summary-value">
                  {localConfig.topP && localConfig.topP < 0.5
                    ? t('model.config.diversity.low')
                    : localConfig.topP && localConfig.topP < 0.9
                      ? t('model.config.diversity.medium')
                      : t('model.config.diversity.high')}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ModelConfiguration;
