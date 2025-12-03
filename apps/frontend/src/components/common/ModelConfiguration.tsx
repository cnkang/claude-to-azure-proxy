/**
 * Model Configuration Component
 *
 * Provides advanced model configuration settings including temperature,
 * max tokens, and other model-specific parameters.
 *
 * Requirements: 2.4, 2.5, 12.4
 */

import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModelConfiguration as ModelConfig } from '../../services/models.js';
import type { EnhancedModelInfo } from '../../services/models.js';
import { cn } from '../ui/Glass.js';

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
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label
          className="text-sm font-medium text-gray-700 dark:text-gray-200"
          htmlFor={`${parameter}-slider`}
        >
          {label}
        </label>
        <span className="text-sm font-mono text-gray-700 dark:text-gray-300">
          {value}
        </span>
      </div>
      {description && (
        <p className="text-xs text-gray-700 dark:text-gray-300">
          {description}
        </p>
      )}
      <div className="space-y-1">
        <input
          id={`${parameter}-slider`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) =>
            handleParameterChange(parameter, Number.parseFloat(e.target.value))
          }
          disabled={disabled}
          className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
          aria-label={`${label}: ${value}`}
        />
        <div className="flex justify-between text-xs text-gray-700 dark:text-gray-300 font-mono">
          <span>{min}</span>
          <span>{max}</span>
        </div>
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
    <div className="space-y-2">
      <label
        className="block text-sm font-medium text-gray-700 dark:text-gray-200"
        htmlFor={`${parameter}-input`}
      >
        {label}
      </label>
      {description && (
        <p className="text-xs text-gray-700 dark:text-gray-300">
          {description}
        </p>
      )}
      <input
        id={`${parameter}-input`}
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) =>
          handleParameterChange(parameter, Number.parseInt(e.target.value, 10))
        }
        disabled={disabled}
        className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
        aria-label={label}
      />
    </div>
  );

  /**
   * Render text area for stop sequences
   */
  const renderStopSequences = () => (
    <div className="space-y-2">
      <label
        className="block text-sm font-medium text-gray-700 dark:text-gray-200"
        htmlFor="stop-sequences"
      >
        {t('model.config.stopSequences')}
      </label>
      <p className="text-xs text-gray-700 dark:text-gray-300">
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
        className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
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
    <div className="space-y-2">
      <label
        className="block text-sm font-medium text-gray-700 dark:text-gray-200"
        htmlFor="system-prompt"
      >
        {t('model.config.systemPrompt')}
      </label>
      <p className="text-xs text-gray-700 dark:text-gray-300">
        {t('model.config.systemPrompt.description')}
      </p>
      <textarea
        id="system-prompt"
        value={localConfig.systemPrompt ?? ''}
        onChange={(e) => handleParameterChange('systemPrompt', e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
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
      className={cn(
        'flex flex-col gap-6',
        compact ? 'p-4' : 'p-6',
        disabled && 'opacity-50 pointer-events-none'
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t('model.config.title', { modelName: model.name })}
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
            className="text-sm text-blue-700 dark:text-blue-200 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
            aria-expanded={showAdvancedSettings}
          >
            {showAdvancedSettings
              ? t('model.config.hideAdvanced')
              : t('model.config.showAdvanced')}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={disabled}
            className="text-sm text-gray-700 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-200"
          >
            {t('model.config.reset')}
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {/* Basic Parameters */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-2">
            {t('model.config.basic')}
          </h4>

          <div className="grid gap-6">
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
        </div>

        {/* Advanced Parameters */}
        {showAdvancedSettings && (
          <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-2">
              {t('model.config.advanced')}
            </h4>

            <div className="grid gap-6">
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
          </div>
        )}

        {/* Model Information */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-2">
            {t('model.config.modelInfo')}
          </h4>

          <div className="grid grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                {t('model.contextLimit')}
              </span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {model.contextLimitFormatted}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                {t('model.provider')}
              </span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1">
                {model.providerInfo.icon} {model.providerInfo.name}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                {t('model.category')}
              </span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {model.categoryLabel}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                {t('model.performance')}
              </span>
              <span
                className={cn(
                  'font-medium',
                  model.performanceRating === 'high'
                    ? 'text-green-700 dark:text-green-200'
                    : model.performanceRating === 'medium'
                      ? 'text-blue-700 dark:text-blue-200'
                      : 'text-amber-600 dark:text-amber-400'
                )}
              >
                {t(`model.performance.${model.performanceRating}`)}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              {t('model.capabilities')}:
            </span>
            <div className="flex flex-wrap gap-2">
              {model.capabilities.map((capability) => (
                <span
                  key={capability}
                  className="px-2 py-1 text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full border border-blue-100 dark:border-blue-800"
                >
                  {t(`model.capability.${capability}`, capability)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Configuration Summary */}
        {!compact && (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-2">
              {t('model.config.summary')}
            </h4>

            <div className="grid grid-cols-3 gap-4 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="flex flex-col items-center text-center gap-1">
                <span className="text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  {t('model.config.creativity')}
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {localConfig.temperature && localConfig.temperature > 1.0
                    ? t('model.config.creativity.high')
                    : localConfig.temperature && localConfig.temperature > 0.5
                      ? t('model.config.creativity.medium')
                      : t('model.config.creativity.low')}
                </span>
              </div>

              <div className="flex flex-col items-center text-center gap-1">
                <span className="text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  {t('model.config.responseLength')}
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {t('model.config.responseLength.tokens', {
                    tokens: localConfig.maxTokens?.toLocaleString() ?? '0',
                  })}
                </span>
              </div>

              <div className="flex flex-col items-center text-center gap-1">
                <span className="text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  {t('model.config.diversity')}
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
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
