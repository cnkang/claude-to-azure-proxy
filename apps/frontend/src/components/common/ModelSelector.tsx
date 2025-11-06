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
import type { EnhancedModelInfo, ModelSelectionCriteria } from '../../services/models';
import { getModelService, MODEL_CATEGORIES } from '../../services/models';
import { useScreenReaderAnnouncer } from '../accessibility';
import './ModelSelector.css';

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
  onValidationResult?: (result: { compatible: boolean; warnings: string[]; errors: string[] }) => void;
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
  const [, setGroupedModels] = useState<Record<string, EnhancedModelInfo[]>>({});
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
      const errorMessage = err instanceof Error ? err.message : 'Failed to load models';
      setError(errorMessage);
      // Development logging disabled for production
    } finally {
      setIsLoading(false);
    }
  }, [modelService, criteria]);

  /**
   * Handle model selection with validation
   */
  const handleModelSelect = useCallback(async (_modelId: string) => {
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
      const selectedModelInfo = models.find(m => m.id === _modelId);
      if (selectedModelInfo) {
        announce('model.selected', 'polite', { model: selectedModelInfo.name });
      }
    } catch (_err) {
      // Error handling: validation failed
    }
  }, [disabled, selectedModel, contextTokens, onValidationResult, modelService, onModelChange, models, announce]);

  /**
   * Filter models based on search query and category
   */
  const filteredModels = useMemo(() => {
    let filtered = models;

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(model => model.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(model =>
        model.name.toLowerCase().includes(query) ||
        model.description.toLowerCase().includes(query) ||
        model.capabilities.some(cap => cap.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [models, selectedCategory, searchQuery]);

  /**
   * Get the currently selected model info
   */
  const selectedModelInfo = useMemo(() => {
    return models.find(model => model.id === selectedModel);
  }, [models, selectedModel]);

  // Load models on mount
  useEffect(() => {
    loadModels();
  }, [loadModels]);

  /**
   * Render model capability badges
   */
  const renderCapabilities = (capabilities: string[]): React.ReactElement => (
    <div className="model-capabilities">
      {capabilities.slice(0, 3).map(capability => (
        <span key={capability} className="capability-badge">
          {t(`model.capability.${capability}`, capability)}
        </span>
      ))}
      {capabilities.length > 3 && (
        <span className="capability-badge capability-more">
          +{capabilities.length - 3}
        </span>
      )}
    </div>
  );

  /**
   * Render model performance indicator
   */
  const renderPerformanceIndicator = (rating: 'high' | 'medium' | 'low'): React.ReactElement => (
    <div className={`performance-indicator performance-${rating}`}>
      <div className="performance-dots">
        <div className="dot active" />
        <div className={`dot ${rating === 'high' || rating === 'medium' ? 'active' : ''}`} />
        <div className={`dot ${rating === 'high' ? 'active' : ''}`} />
      </div>
      <span className="performance-label">
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
      className={`model-item ${model.id === selectedModel ? 'selected' : ''} ${!model.isAvailable ? 'unavailable' : ''}`}
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
      <div className="model-header">
        <div className="model-title">
          <span className="model-name">{model.name}</span>
          <span className="provider-icon" title={model.providerInfo.name}>
            {model.providerInfo.icon}
          </span>
          {model.isRecommended && (
            <span className="recommended-badge" title={t('model.recommended')}>
              ⭐
            </span>
          )}
        </div>
        {!model.isAvailable && (
          <span className="unavailable-badge">
            {t('model.unavailable')}
          </span>
        )}
      </div>

      {showDetails && (
        <div className="model-details">
          <p className="model-description" id={`model-${model.id}-description`}>
            {model.description}
          </p>
          
          <div className="model-info">
            <div className="model-info-item">
              <span className="info-label">{t('model.contextLimit')}:</span>
              <span className="info-value">{model.contextLimitFormatted}</span>
            </div>
            
            <div className="model-info-item">
              <span className="info-label">{t('model.provider')}:</span>
              <span className="info-value">{model.providerInfo.name}</span>
            </div>
            
            <div className="model-info-item">
              <span className="info-label">{t('model.category')}:</span>
              <span className="info-value">{model.categoryLabel}</span>
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
    <div className="category-tabs" role="tablist">
      <button
        className={`category-tab ${selectedCategory === 'all' ? 'active' : ''}`}
        onClick={() => setSelectedCategory('all')}
        role="tab"
        aria-selected={selectedCategory === 'all'}
      >
        {t('model.category.all')}
      </button>
      {Object.entries(MODEL_CATEGORIES).map(([key, label]) => (
        <button
          key={key}
          className={`category-tab ${selectedCategory === key ? 'active' : ''}`}
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
    <div className="model-search">
      <input
        type="text"
        placeholder={t('model.search.placeholder')}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="search-input"
        aria-label={t('model.search.label')}
      />
      <span className="search-icon">🔍</span>
    </div>
  );

  if (isLoading) {
    return (
      <div className={`model-selector ${compact ? 'compact' : ''} ${disabled ? 'disabled' : ''}`}>
        <div className="model-selector-loading">
          <div className="loading-spinner" />
          <span>{t('model.loading')}</span>
        </div>
      </div>
    );
  }

  if (error !== null && error.length > 0) {
    return (
      <div className={`model-selector ${compact ? 'compact' : ''} ${disabled ? 'disabled' : ''}`}>
        <div className="model-selector-error">
          <span className="error-icon">⚠️</span>
          <span>{t('model.error', { error })}</span>
          <button onClick={() => void loadModels()} className="retry-button">
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`model-selector ${compact ? 'compact' : ''} ${disabled ? 'disabled' : ''}`}>
      {/* Selected model display */}
      <div
        className={`selected-model ${isOpen ? 'open' : ''}`}
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
        <div className="selected-model-content">
          {selectedModelInfo ? (
            <>
              <div className="selected-model-main">
                <span className="selected-model-name">{selectedModelInfo.name}</span>
                <span className="selected-provider-icon" title={selectedModelInfo.providerInfo.name}>
                  {selectedModelInfo.providerInfo.icon}
                </span>
              </div>
              {!compact && (
                <div className="selected-model-details">
                  <span className="selected-model-context">
                    {selectedModelInfo.contextLimitFormatted}
                  </span>
                  <span className="selected-model-category">
                    {selectedModelInfo.categoryLabel}
                  </span>
                </div>
              )}
            </>
          ) : (
            <span className="no-model-selected">{t('model.noSelection')}</span>
          )}
        </div>
        <span className={`dropdown-arrow ${isOpen ? 'open' : ''}`}>▼</span>
      </div>

      {/* Dropdown panel */}
      {isOpen && (
        <div id="model-dropdown" className="model-dropdown" role="listbox">
          {showCategories && renderCategoryTabs()}
          {renderSearchInput()}
          
          <div className="model-list">
            {filteredModels.length > 0 ? (
              filteredModels.map(renderModelItem)
            ) : (
              <div className="no-models-found">
                {t('model.noModelsFound')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="model-selector-overlay"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}
    </div>
  );
};

export default ModelSelector;
