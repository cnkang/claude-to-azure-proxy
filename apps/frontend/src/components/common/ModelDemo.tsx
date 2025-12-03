/**
 * Model Demo Component
 *
 * A demo component to test and showcase the model selection functionality.
 * This can be used for development and testing purposes.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 12.1, 12.2, 12.3, 12.4
 */

import type React from 'react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useModelSelection } from '../../hooks/useModelSelection.js';
import type { ModelSwitchValidation } from '../../hooks/useModelSelection.js';
import type {
  EnhancedModelInfo,
  ModelConfiguration as ModelConfig,
} from '../../services/models.js';
import { cn } from '../ui/Glass.js';
import { ModelConfiguration } from './ModelConfiguration.js';
import { ModelSelector } from './ModelSelector.js';
import { ModelSwitchDialog } from './ModelSwitchDialog.js';

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
      <div className="flex items-center justify-center h-full p-8">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('model.loading')}
          </span>
        </div>
      </div>
    );
  }

  if (state.error !== null) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="flex flex-col items-center gap-4 text-red-700">
          <span className="text-4xl">⚠️</span>
          <span className="text-lg font-medium">
            {t('model.error', { _error: state.error })}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Model Selection Demo
        </h2>
        <p className="text-gray-700 dark:text-gray-300">
          Test the model selection, configuration, and switching functionality.
        </p>
      </div>

      <div className="grid gap-8">
        {/* Model Selector */}
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Model Selector
          </h3>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <ModelSelector
              selectedModel={selectedModelId}
              onModelChange={(_modelId: string) => handleModelChange(_modelId)}
              showDetails={true}
              showCategories={true}
              contextTokens={contextTokens}
            />
          </div>
        </section>

        {/* Model Information */}
        {selectedModel && (
          <section className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Selected Model Information
            </h3>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="space-y-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold text-gray-900 dark:text-gray-100">
                        {selectedModel.name}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                        {selectedModel.providerInfo.icon}{' '}
                        {selectedModel.providerInfo.name}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 max-w-2xl">
                      {selectedModel.description}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'px-3 py-1 rounded-full text-sm font-medium',
                      selectedModel.performanceRating === 'high'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                        : selectedModel.performanceRating === 'medium'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
                    )}
                  >
                    {t(`model.performance.${selectedModel.performanceRating}`)}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <span className="block text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                      {t('model.contextLimit')}
                    </span>
                    <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {selectedModel.contextLimitFormatted}
                    </span>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <span className="block text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                      {t('model.category')}
                    </span>
                    <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {selectedModel.categoryLabel}
                    </span>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <span className="block text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                      Context Usage
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {contextTokens.toLocaleString()}
                      </span>
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        / {selectedModel.contextLength.toLocaleString()}
                      </span>
                      <span
                        className={cn(
                          'text-sm font-medium ml-auto',
                          contextTokens / selectedModel.contextLength > 0.8
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-green-700 dark:text-green-200'
                        )}
                      >
                        (
                        {(
                          (contextTokens / selectedModel.contextLength) *
                          100
                        ).toFixed(1)}
                        %)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    {t('model.capabilities')}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {selectedModel.capabilities.map((capability) => (
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
            </div>
          </section>
        )}

        {/* Model Configuration */}
        {selectedModel && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Model Configuration
              </h3>
              <button
                type="button"
                onClick={() => setShowConfiguration(!showConfiguration)}
                className="text-sm font-medium text-blue-700 dark:text-blue-200 hover:text-blue-700 dark:hover:text-blue-300"
              >
                {showConfiguration
                  ? 'Hide Configuration'
                  : 'Show Configuration'}
              </button>
            </div>

            {showConfiguration && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in slide-in-from-top-2 duration-200">
                <ModelConfiguration
                  model={selectedModel}
                  configuration={configuration}
                  onConfigurationChange={handleConfigurationChange}
                  showAdvanced={true}
                />
              </div>
            )}
          </section>
        )}

        {/* Model Statistics */}
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Available Models
          </h3>
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 text-center">
                <span className="block text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {state.models.length}
                </span>
                <span className="text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Total Models
                </span>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 text-center">
                <span className="block text-2xl font-bold text-green-700 dark:text-green-200">
                  {state.models.filter((m) => m.isAvailable).length}
                </span>
                <span className="text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Available
                </span>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 text-center">
                <span className="block text-2xl font-bold text-blue-700 dark:text-blue-200">
                  {state.recommended.length}
                </span>
                <span className="text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Recommended
                </span>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 text-center">
                <span className="block text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {Object.keys(state.categories).length}
                </span>
                <span className="text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Categories
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.entries(state.categories).map(([category, models]) => (
                <div
                  key={category}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3"
                >
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-2">
                    {t(`model.category.${category}`, category)}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {models.slice(0, 3).map((model) => (
                      <div
                        key={model.id}
                        className="flex items-center gap-1 px-2 py-1 bg-gray-50 dark:bg-gray-700 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600"
                      >
                        <span>{model.providerInfo.icon}</span>
                        <span className="truncate max-w-[120px]">
                          {model.name}
                        </span>
                      </div>
                    ))}
                    {models.length > 3 && (
                      <div className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                        +{models.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Model Switch Dialog */}
      {showSwitchDialog && selectedModel && targetModel && switchValidation && (
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
