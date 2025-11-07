/**
 * Model Demo Component
 *
 * A demo component to test and showcase the model selection functionality.
 * This can be used for development and testing purposes.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 12.1, 12.2, 12.3, 12.4
 */

import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ModelSelector } from './ModelSelector';
import { ModelConfiguration } from './ModelConfiguration';
import { ModelSwitchDialog } from './ModelSwitchDialog';
import { useModelSelection } from '../../hooks/useModelSelection';
import type {
  EnhancedModelInfo,
  ModelConfiguration as ModelConfig,
} from '../../services/models';
import type { ModelSwitchValidation } from '../../hooks/useModelSelection';
import './ModelDemo.css';

/**
 * Demo component for testing model selection features
 */
export const ModelDemo: React.FC = () => {
  const { t } = useTranslation();
  const [selectedModelId, setSelectedModelId] = useState<string>('gpt-4');
  const [showConfiguration, setShowConfiguration] = useState(false);
  const [showSwitchDialog, setShowSwitchDialog] = useState(false);
  const [targetModel, setTargetModel] = useState<EnhancedModelInfo | null>(
    null
  );
  const [switchValidation, setSwitchValidation] =
    useState<ModelSwitchValidation | null>(null);
  const [contextTokens] = useState(15000); // Mock context tokens

  const {
    state,
    selectModel,
    validateModelSwitch,
    getModelConfiguration,
    updateModelConfiguration,
    getModelById,
  } = useModelSelection({
    enableRecommendations: true,
  });

  /**
   * Handle model selection
   */
  const handleModelChange = useCallback(
    async (_modelId: string) => {
      if (_modelId === selectedModelId) {
        return;
      }

      const model = getModelById(_modelId);
      if (!model) {
        return;
      }

      // If we have a current model, validate the switch
      if (selectedModelId && contextTokens > 0) {
        const validation = await validateModelSwitch(
          selectedModelId,
          _modelId,
          contextTokens
        );

        if (!validation.compatible || validation.warnings.length > 0) {
          setTargetModel(model);
          setSwitchValidation(validation);
          setShowSwitchDialog(true);
          return;
        }
      }

      // Direct switch if no validation needed or validation passed
      const success = await selectModel(_modelId);
      if (success === true) {
        setSelectedModelId(_modelId);
      }
    },
    [
      selectedModelId,
      contextTokens,
      validateModelSwitch,
      selectModel,
      getModelById,
    ]
  );

  /**
   * Handle switch confirmation
   */
  const handleSwitchConfirm = useCallback(
    async (options: { preserveContext: boolean; createNew: boolean }) => {
      if (!targetModel) {
        return;
      }

      const success = await selectModel(targetModel.id, {
        preserveContext: options.preserveContext,
        notifyUser: true,
        validateCompatibility: false, // Already validated
      });

      if (success === true) {
        setSelectedModelId(targetModel.id);
      }

      setShowSwitchDialog(false);
      setTargetModel(null);
      setSwitchValidation(null);
    },
    [targetModel, selectModel]
  );

  /**
   * Handle switch cancellation
   */
  const handleSwitchCancel = useCallback((): void => {
    setShowSwitchDialog(false);
    setTargetModel(null);
    setSwitchValidation(null);
  }, []);

  /**
   * Handle configuration change
   */
  const handleConfigurationChange = useCallback(
    (config: ModelConfig): void => {
      updateModelConfiguration(selectedModelId, config);
    },
    [selectedModelId, updateModelConfiguration]
  );

  const selectedModel = getModelById(selectedModelId);
  const configuration = getModelConfiguration(selectedModelId);

  if (state.isLoading) {
    return (
      <div className="model-demo">
        <div className="demo-loading">
          <div className="loading-spinner" />
          <span>{t('model.loading')}</span>
        </div>
      </div>
    );
  }

  if (state.error !== null) {
    return (
      <div className="model-demo">
        <div className="demo-error">
          <span className="error-icon">⚠️</span>
          <span>{t('model.error', { _error: state.error })}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="model-demo">
      <div className="demo-header">
        <h2 className="demo-title">Model Selection Demo</h2>
        <p className="demo-description">
          Test the model selection, configuration, and switching functionality.
        </p>
      </div>

      <div className="demo-content">
        {/* Model Selector */}
        <div className="demo-section">
          <h3 className="section-title">Model Selector</h3>
          <div className="section-content">
            <ModelSelector
              selectedModel={selectedModelId}
              onModelChange={(_modelId: string) => handleModelChange(_modelId)}
              showDetails={true}
              showCategories={true}
              contextTokens={contextTokens}
            />
          </div>
        </div>

        {/* Model Information */}
        {selectedModel !== null && selectedModel !== undefined && (
          <div className="demo-section">
            <h3 className="section-title">Selected Model Information</h3>
            <div className="section-content">
              <div className="model-info-card">
                <div className="model-header">
                  <div className="model-title">
                    <span className="model-name">{selectedModel.name}</span>
                    <span className="provider-badge">
                      {selectedModel.providerInfo.icon}{' '}
                      {selectedModel.providerInfo.name}
                    </span>
                  </div>
                  <span
                    className={`performance-badge performance-${selectedModel.performanceRating}`}
                  >
                    {t(`model.performance.${selectedModel.performanceRating}`)}
                  </span>
                </div>

                <p className="model-description">{selectedModel.description}</p>

                <div className="model-stats">
                  <div className="stat-item">
                    <span className="stat-label">
                      {t('model.contextLimit')}:
                    </span>
                    <span className="stat-value">
                      {selectedModel.contextLimitFormatted}
                    </span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">{t('model.category')}:</span>
                    <span className="stat-value">
                      {selectedModel.categoryLabel}
                    </span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Context Usage:</span>
                    <span className="stat-value">
                      {contextTokens.toLocaleString()} /{' '}
                      {selectedModel.contextLength.toLocaleString()}(
                      {(
                        (contextTokens / selectedModel.contextLength) *
                        100
                      ).toFixed(1)}
                      %)
                    </span>
                  </div>
                </div>

                <div className="capabilities-section">
                  <span className="capabilities-label">
                    {t('model.capabilities')}:
                  </span>
                  <div className="capabilities-list">
                    {selectedModel.capabilities.map((capability) => (
                      <span key={capability} className="capability-tag">
                        {t(`model.capability.${capability}`, capability)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Model Configuration */}
        {selectedModel !== null && selectedModel !== undefined && (
          <div className="demo-section">
            <div className="section-header">
              <h3 className="section-title">Model Configuration</h3>
              <button
                onClick={() => setShowConfiguration(!showConfiguration)}
                className="toggle-button"
              >
                {showConfiguration
                  ? 'Hide Configuration'
                  : 'Show Configuration'}
              </button>
            </div>

            {showConfiguration !== null && showConfiguration !== undefined && (
              <div className="section-content">
                <ModelConfiguration
                  model={selectedModel}
                  configuration={configuration}
                  onConfigurationChange={handleConfigurationChange}
                  showAdvanced={true}
                />
              </div>
            )}
          </div>
        )}

        {/* Model Statistics */}
        <div className="demo-section">
          <h3 className="section-title">Available Models</h3>
          <div className="section-content">
            <div className="models-stats">
              <div className="stat-card">
                <span className="stat-number">{state.models.length}</span>
                <span className="stat-label">Total Models</span>
              </div>
              <div className="stat-card">
                <span className="stat-number">
                  {state.models.filter((m) => m.isAvailable).length}
                </span>
                <span className="stat-label">Available</span>
              </div>
              <div className="stat-card">
                <span className="stat-number">{state.recommended.length}</span>
                <span className="stat-label">Recommended</span>
              </div>
              <div className="stat-card">
                <span className="stat-number">
                  {Object.keys(state.categories).length}
                </span>
                <span className="stat-label">Categories</span>
              </div>
            </div>

            <div className="categories-overview">
              {Object.entries(state.categories).map(([category, models]) => (
                <div key={category} className="category-card">
                  <h4 className="category-title">
                    {t(`model.category.${category}`, category)}
                  </h4>
                  <div className="category-models">
                    {models.slice(0, 3).map((model) => (
                      <div key={model.id} className="model-chip">
                        <span className="chip-icon">
                          {model.providerInfo.icon}
                        </span>
                        <span className="chip-name">{model.name}</span>
                      </div>
                    ))}
                    {models.length > 3 !== null && undefined !== 3 && (
                      <div className="model-chip more">
                        +{models.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Model Switch Dialog */}
      {showSwitchDialog &&
        selectedModel &&
        targetModel &&
        switchValidation !== null &&
        switchValidation !== undefined && (
          <ModelSwitchDialog
            isOpen={showSwitchDialog}
            currentModel={selectedModel}
            targetModel={targetModel}
            validation={switchValidation}
            contextTokens={contextTokens}
            onConfirm={handleSwitchConfirm}
            onCancel={handleSwitchCancel}
          />
        )}
    </div>
  );
};

export default ModelDemo;
