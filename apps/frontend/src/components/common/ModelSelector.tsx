/**
 * Model Selector Component
 *
 * Provides model selection with categorization, provider information,
 * and capability display. Supports model switching with context preservation.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 12.1, 12.2, 12.3, 12.4
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  EnhancedModelInfo,
  ModelSelectionCriteria,
} from '../../services/models';
import { getModelService, MODEL_CATEGORIES } from '../../services/models';
import { useScreenReaderAnnouncer } from '../accessibility';
import { Glass, cn } from '../ui/Glass.js';

export interface ModelSelectorProps {
  /** Currently selected model ID */
  selectedModel: string;
  /** Callback when model selection changes */
  onModelChange: (_modelId: string) => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Filter criteria for available models */
  criteria?: ModelSelectionCriteria;
  /** Show detailed model information */
  showDetails?: boolean;
  /** Show model categories */
  showCategories?: boolean;
  /** Compact display mode */
  compact?: boolean;
  /** Current conversation context tokens (for compatibility checking) */
  contextTokens?: number;
  /** Callback for model switch validation */
  onValidationResult?: (result: {
    compatible: boolean;
    warnings: string[];
    errors: string[];
  }) => void;
}

/**
 * Model selector component with categorization and detailed information
 */
export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  onModelChange,
  disabled = false,
  criteria,
  showDetails = true,
  showCategories = true,
  compact = false,
  contextTokens = 0,
  onValidationResult,
}) => {
  const { t } = useTranslation();
  const { announce } = useScreenReaderAnnouncer();
  const [models, setModels] = useState<EnhancedModelInfo[]>([]);
  const [, setGroupedModels] = useState<Record<string, EnhancedModelInfo[]>>(
    {}
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const modelService = useMemo(() => getModelService(), []);

  /**
   * Load models from the service
   */
  const loadModels = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [enhancedModels, modelsByCategory] = await Promise.all([
        modelService.getEnhancedModels(criteria),
        modelService.getModelsByCategory(),
      ]);

      setModels(enhancedModels);
      setGroupedModels(modelsByCategory);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load models';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [modelService, criteria]);

  /**
   * Handle model selection with validation
   */
  const handleModelSelect = useCallback(
    async (_modelId: string) => {
      if (disabled || _modelId === selectedModel) {
        return;
      }

      try {
        // Validate model switch if context tokens are provided
        if (contextTokens > 0 && onValidationResult) {
          const validation = await modelService.validateModelSwitch(
            selectedModel,
            _modelId,
            contextTokens
          );

          onValidationResult(validation);

          // Don't proceed if there are errors
          if (!validation.compatible) {
            return;
          }
        }

        onModelChange(_modelId);
        setIsOpen(false);

        // Announce model selection to screen readers
        const selectedModelInfo = models.find((m) => m.id === _modelId);
        if (selectedModelInfo) {
          announce('model.selected', 'polite', {
            model: selectedModelInfo.name,
          });
        }
      } catch (_err) {
        // Error handling: validation failed
      }
    },
    [
      disabled,
      selectedModel,
      contextTokens,
      onValidationResult,
      modelService,
      onModelChange,
      models,
      announce,
    ]
  );

  /**
   * Filter models based on search query and category
   */
  const filteredModels = useMemo(() => {
    let filtered = models;

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(
        (model) => model.category === selectedCategory
      );
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (model) =>
          model.name.toLowerCase().includes(query) ||
          model.description.toLowerCase().includes(query) ||
          model.capabilities.some((cap) => cap.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [models, selectedCategory, searchQuery]);

  /**
   * Get the currently selected model info
   */
  const selectedModelInfo = useMemo(() => {
    return models.find((model) => model.id === selectedModel);
  }, [models, selectedModel]);

  // Load models on mount
  useEffect(() => {
    loadModels();
  }, [loadModels]);

  /**
   * Render model capability badges
   */
  const renderCapabilities = (capabilities: string[]): React.ReactElement => (
    <div className="flex flex-wrap gap-1 mt-2">
      {capabilities.slice(0, 3).map((capability) => (
        <span key={capability} className="px-2 py-0.5 text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full border border-blue-100 dark:border-blue-800">
          {t(`model.capability.${capability}`, capability)}
        </span>
      ))}
      {capabilities.length > 3 && (
        <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full">
          +{capabilities.length - 3}
        </span>
      )}
    </div>
  );

  /**
   * Render model performance indicator
   */
  const renderPerformanceIndicator = (
    rating: 'high' | 'medium' | 'low'
  ): React.ReactElement => (
    <div className="flex items-center gap-1.5 mt-2">
      <div className="flex gap-0.5">
        <div className={cn("w-1.5 h-1.5 rounded-full", rating ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600")} />
        <div className={cn("w-1.5 h-1.5 rounded-full", rating === 'high' || rating === 'medium' ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600")} />
        <div className={cn("w-1.5 h-1.5 rounded-full", rating === 'high' ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600")} />
      </div>
      <span className="text-xs text-gray-700 dark:text-gray-300">
        {t(`model.performance.${rating}`)}
      </span>
    </div>
  );

  /**
   * Render model item
   */
  const renderModelItem = (model: EnhancedModelInfo): React.ReactElement => (
    <div
      key={model.id}
      className={cn(
        "p-3 rounded-lg border transition-all cursor-pointer",
        model.id === selectedModel 
          ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-900"
          : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700",
        !model.isAvailable && "opacity-50 cursor-not-allowed"
      )}
      onClick={() => void handleModelSelect(model.id)}
      role="option"
      aria-selected={model.id === selectedModel}
      aria-disabled={!model.isAvailable}
      aria-describedby={`model-${model.id}-description`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void handleModelSelect(model.id);
        }
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 flex-1">
          <span className="font-medium text-gray-900 dark:text-gray-100">{model.name}</span>
          <span className="text-base" title={model.providerInfo.name}>
            {model.providerInfo.icon}
          </span>
          {model.isRecommended && (
            <span className="text-yellow-700" title={t('model.recommended')}>
              ⭐
            </span>
          )}
        </div>
        {!model.isAvailable && (
          <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full">
            {t('model.unavailable')}
          </span>
        )}
      </div>

      {showDetails && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-gray-700 dark:text-gray-300" id={`model-${model.id}-description`}>
            {model.description}
          </p>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-gray-700 dark:text-gray-300">{t('model.contextLimit')}:</span>
              <div className="font-medium text-gray-900 dark:text-gray-100">{model.contextLimitFormatted}</div>
            </div>

            <div>
              <span className="text-gray-700 dark:text-gray-300">{t('model.provider')}:</span>
              <div className="font-medium text-gray-900 dark:text-gray-100">{model.providerInfo.name}</div>
            </div>

            <div>
              <span className="text-gray-700 dark:text-gray-300">{t('model.category')}:</span>
              <div className="font-medium text-gray-900 dark:text-gray-100">{model.categoryLabel}</div>
            </div>
          </div>

          {renderCapabilities(model.capabilities)}
          {renderPerformanceIndicator(model.performanceRating)}
        </div>
      )}
    </div>
  );

  /**
   * Render category tabs
   */
  const renderCategoryTabs = (): React.ReactElement => (
    <div className="flex gap-2 mb-3 overflow-x-auto pb-2 custom-scrollbar" role="tablist">
      <button
        className={cn(
          "px-3 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap",
          selectedCategory === 'all' 
            ? "bg-blue-600 text-white"
            : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
        )}
        onClick={() => setSelectedCategory('all')}
        role="tab"
        aria-selected={selectedCategory === 'all'}
      >
        {t('model.category.all')}
      </button>
      {Object.entries(MODEL_CATEGORIES).map(([key, label]) => (
        <button
          key={key}
          className={cn(
            "px-3 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap",
            selectedCategory === key 
              ? "bg-blue-600 text-white"
              : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
          )}
          onClick={() => setSelectedCategory(key)}
          role="tab"
          aria-selected={selectedCategory === key}
        >
          {t(`model.category.${key}`, label)}
        </button>
      ))}
    </div>
  );

  /**
   * Render search input
   */
  const renderSearchInput = (): React.ReactElement => (
    <div className="relative mb-3">
      <input
        type="text"
        placeholder={t('model.search.placeholder')}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full pl-10 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
        aria-label={t('model.search.label')}
      />
      <span className="absolute left-3 top-2.5 text-gray-700">🔍</span>
    </div>
  );

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center p-8", compact && "p-4", disabled && "opacity-50")}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-700 dark:text-gray-300">{t('model.loading')}</span>
        </div>
      </div>
    );
  }

  if (error !== null && error.length > 0) {
    return (
      <div className={cn("flex items-center justify-center p-8", compact && "p-4", disabled && "opacity-50")}>
        <div className="flex flex-col items-center gap-3 text-red-700">
          <span className="text-3xl">⚠️</span>
          <span className="text-sm">{t('model.error', { error })}</span>
          <button 
            onClick={() => void loadModels()} 
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative", compact && "text-sm", disabled && "opacity-50 pointer-events-none")}>
      {/* Selected model display */}
      <div
        className={cn(
          "p-3 bg-white dark:bg-gray-800 border rounded-lg cursor-pointer transition-all",
          isOpen ? "border-blue-500 ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-900" : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
        )}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls="model-dropdown"
        aria-label={t('model.selector.label')}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
      >
        <div className="flex items-center justify-between">
          {selectedModelInfo ? (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                  {selectedModelInfo.name}
                </span>
                <span
                  className="text-base"
                  title={selectedModelInfo.providerInfo.name}
                >
                  {selectedModelInfo.providerInfo.icon}
                </span>
              </div>
              {!compact && (
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-700 dark:text-gray-300">
                  <span>{selectedModelInfo.contextLimitFormatted}</span>
                  <span>•</span>
                  <span>{selectedModelInfo.categoryLabel}</span>
                </div>
              )}
            </div>
          ) : (
            <span className="text-gray-700 dark:text-gray-300">{t('model.noSelection')}</span>
          )}
          <span className={cn("ml-2 text-gray-700 transition-transform duration-200", isOpen && "rotate-180")}>▼</span>
        </div>
      </div>

      {/* Dropdown panel */}
      {isOpen && (
        <Glass 
          id="model-dropdown" 
          className="absolute z-50 top-full mt-2 w-full max-h-96 overflow-y-auto custom-scrollbar p-3 shadow-xl"
          intensity="high"
          role="listbox"
        >
          {showCategories && renderCategoryTabs()}
          {renderSearchInput()}

          <div className="space-y-2">
            {filteredModels.length > 0 ? (
              filteredModels.map(renderModelItem)
            ) : (
              <div className="text-center py-8 text-sm text-gray-700 dark:text-gray-300">
                {t('model.noModelsFound')}
              </div>
            )}
          </div>
        </Glass>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}
    </div>
  );
};

export default ModelSelector;
