/**
 * Model Selection Hook
 *
 * Provides model selection state management, validation, and configuration
 * handling with context preservation for conversation model switching.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 12.1, 12.2, 12.3, 12.4
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import type { Conversation, ModelChange } from '../types/index.js';
import type {
  EnhancedModelInfo,
  ModelSelectionCriteria,
  ModelSwitchOptions,
  ModelConfiguration,
} from '../services/models.js';
import { getModelService, modelUtils } from '../services/models.js';
import { getSessionManager } from '../services/session.js';

export interface ModelSelectionState {
  /** Available models */
  models: EnhancedModelInfo[];
  /** Currently selected model */
  selectedModel: EnhancedModelInfo | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: string | null;
  /** Model categories */
  categories: Record<string, EnhancedModelInfo[]>;
  /** Recommended models */
  recommended: EnhancedModelInfo[];
}

export interface ModelSwitchValidation {
  /** Whether the switch is compatible */
  compatible: boolean;
  /** Warning messages */
  warnings: string[];
  /** Error messages */
  errors: string[];
  /** Suggested actions */
  suggestions: string[];
}

export interface UseModelSelectionOptions {
  /** Filter criteria for models */
  criteria?: ModelSelectionCriteria;
  /** Auto-refresh interval in milliseconds */
  refreshInterval?: number;
  /** Enable automatic model recommendations */
  enableRecommendations?: boolean;
}

export interface UseModelSelectionReturn {
  /** Model selection state */
  state: ModelSelectionState;
  /** Select a model */
  selectModel: (
    _modelId: string,
    options?: ModelSwitchOptions
  ) => Promise<boolean>;
  /** Validate model switch */
  validateModelSwitch: (
    fromModelId: string,
    toModelId: string,
    contextTokens: number
  ) => Promise<ModelSwitchValidation>;
  /** Get model configuration */
  getModelConfiguration: (_modelId: string) => ModelConfiguration;
  /** Update model configuration */
  updateModelConfiguration: (
    _modelId: string,
    config: Partial<ModelConfiguration>
  ) => void;
  /** Refresh models */
  refreshModels: () => Promise<void>;
  /** Get recommended model for task */
  getRecommendedModel: (
    task: 'coding' | 'reasoning' | 'conversation'
  ) => EnhancedModelInfo | null;
  /** Check if model supports capability */
  hasCapability: (_modelId: string, capability: string) => boolean;
  /** Get model by ID */
  getModelById: (_modelId: string) => EnhancedModelInfo | null;
  /** Switch model in conversation */
  switchConversationModel: (
    conversation: Conversation,
    newModelId: string,
    options?: ModelSwitchOptions
  ) => Promise<{
    success: boolean;
    updatedConversation?: Conversation;
    error?: string;
  }>;
}

/**
 * Hook for managing model selection and configuration
 */
export function useModelSelection(
  options: UseModelSelectionOptions = {}
): UseModelSelectionReturn {
  const {
    criteria,
    refreshInterval = 5 * 60 * 1000, // 5 minutes
    enableRecommendations = true,
  } = options;

  const [state, setState] = useState<ModelSelectionState>({
    models: [],
    selectedModel: null,
    isLoading: true,
    error: null,
    categories: {},
    recommended: [],
  });

  const [modelConfigurations, setModelConfigurations] = useState<
    Map<string, ModelConfiguration>
  >(new Map());

  const modelService = useMemo(() => getModelService(), []);
  const sessionManager = useMemo(() => getSessionManager(), []);

  /**
   * Load models from the service
   */
  const loadModels = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const [models, categories] = await Promise.all([
        modelService.getEnhancedModels(criteria),
        modelService.getModelsByCategory(),
      ]);

      let recommended: EnhancedModelInfo[] = [];
      if (enableRecommendations === true) {
        const [generalRec, codingRec, reasoningRec] = await Promise.all([
          modelService.getRecommendedModels('general'),
          modelService.getRecommendedModels('coding'),
          modelService.getRecommendedModels('reasoning'),
        ]);

        // Combine and deduplicate recommendations
        const allRecommended = [...generalRec, ...codingRec, ...reasoningRec];
        recommended = Array.from(
          new Map(allRecommended.map((model) => [model.id, model])).values()
        );
      }

      // Get currently selected model from session preferences
      const session = sessionManager.getCurrentSession();
      const selectedModelId = session?.preferences.selectedModel;
      const selectedModel = selectedModelId
        ? (models.find((model) => model.id === selectedModelId) ?? null)
        : null;

      setState({
        models,
        selectedModel,
        isLoading: false,
        error: null,
        categories,
        recommended,
      });
    } catch (_error) {
      const errorMessage =
        _error instanceof Error ? _error.message : 'Failed to load models';
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
    }
  }, [modelService, criteria, enableRecommendations, sessionManager]);

  /**
   * Select a model with validation and persistence
   */
  const selectModel = useCallback(
    async (
      modelId: string,
      _selectionOptions: ModelSwitchOptions = {
        preserveContext: true,
        notifyUser: true,
        validateCompatibility: true,
      }
    ): Promise<boolean> => {
      try {
        const model = state.models.find((item) => item.id === modelId);
        if (!model) {
          if (import.meta.env.DEV) {
            // Model not found
          }
          return false;
        }

        if (!model.isAvailable) {
          if (import.meta.env.DEV) {
            // Model not available
          }
          return false;
        }

        // Update session preferences
        sessionManager.updatePreferences({ selectedModel: modelId });

        // Update state
        setState((prev) => ({ ...prev, selectedModel: model }));

        return true;
      } catch (_error) {
        if (import.meta.env.DEV) {
          // Failed to select model
        }
        return false;
      }
    },
    [state.models, sessionManager]
  );

  /**
   * Validate model switch with detailed analysis
   */
  const validateModelSwitch = useCallback(
    async (
      fromModelId: string,
      toModelId: string,
      contextTokens: number
    ): Promise<ModelSwitchValidation> => {
      try {
        const validation = await modelService.validateModelSwitch(
          fromModelId,
          toModelId,
          contextTokens
        );

        const suggestions: string[] = [];

        // Add suggestions based on validation results
        if (!validation.compatible) {
          if (validation.errors.some((err) => err.includes('context'))) {
            suggestions.push('Consider compressing the conversation context');
            suggestions.push(
              'Start a new conversation with the selected model'
            );
          }

          if (validation.errors.some((err) => err.includes('unavailable'))) {
            suggestions.push('Try selecting a different model');
            suggestions.push('Check model availability status');
          }
        }

        if (validation.warnings.length > 0) {
          suggestions.push('Review capability differences before switching');
        }

        return {
          ...validation,
          suggestions,
        };
      } catch (_error) {
        if (import.meta.env.DEV) {
          // Model switch validation failed
        }
        return {
          compatible: false,
          warnings: [],
          errors: ['Validation failed'],
          suggestions: ['Try again later'],
        };
      }
    },
    [modelService]
  );

  /**
   * Get model configuration
   */
  const getModelConfiguration = useCallback(
    (modelId: string): ModelConfiguration => {
      const cached = modelConfigurations.get(modelId);
      if (cached) {
        return cached;
      }

      const defaultConfig = modelService.getDefaultModelConfiguration(modelId);
      modelConfigurations.set(modelId, defaultConfig);
      return defaultConfig;
    },
    [modelConfigurations, modelService]
  );

  /**
   * Update model configuration
   */
  const updateModelConfiguration = useCallback(
    (modelId: string, config: Partial<ModelConfiguration>): void => {
      const currentConfig = getModelConfiguration(modelId);
      const updatedConfig = { ...currentConfig, ...config };
      setModelConfigurations((prev) => {
        const next = new Map(prev);
        next.set(modelId, updatedConfig);
        return next;
      });
    },
    [getModelConfiguration]
  );

  /**
   * Refresh models
   */
  const refreshModels = useCallback(async () => {
    modelService.clearCache();
    await loadModels();
  }, [modelService, loadModels]);

  /**
   * Get recommended model for a specific task
   */
  const getRecommendedModel = useCallback(
    (
      task: 'coding' | 'reasoning' | 'conversation'
    ): EnhancedModelInfo | null => {
      const bestModel = modelUtils.getBestModelForTask(state.models, task);
      return bestModel as EnhancedModelInfo | null;
    },
    [state.models]
  );

  /**
   * Check if model supports a capability
   */
  const hasCapability = useCallback(
    (modelId: string, capability: string): boolean => {
      const model = state.models.find((m) => m.id === modelId);
      return model ? modelUtils.hasCapability(model, capability) : false;
    },
    [state.models]
  );

  /**
   * Get model by ID
   */
  const getModelById = useCallback(
    (modelId: string): EnhancedModelInfo | null => {
      return state.models.find((model) => model.id === modelId) ?? null;
    },
    [state.models]
  );

  /**
   * Switch model in a conversation with context preservation
   */
  const switchConversationModel = useCallback(
    async (
      conversation: Conversation,
      newModelId: string,
      options: ModelSwitchOptions = {
        preserveContext: true,
        notifyUser: true,
        validateCompatibility: true,
      }
    ): Promise<{
      success: boolean;
      updatedConversation?: Conversation;
      error?: string;
    }> => {
      try {
        const newModel = getModelById(newModelId);
        if (!newModel) {
          return { success: false, error: `Model not found: ${newModelId}` };
        }

        if (!newModel.isAvailable) {
          return {
            success: false,
            error: `Model not available: ${newModel.name}`,
          };
        }

        // Validate switch if requested
        if (options.validateCompatibility) {
          const validation = await validateModelSwitch(
            conversation.selectedModel,
            newModelId,
            conversation.contextUsage?.currentTokens ?? 0
          );

          if (!validation.compatible) {
            return {
              success: false,
              error: validation.errors.join('; '),
            };
          }
        }

        // Create model change record
        const modelChange: ModelChange = {
          messageId:
            conversation.messages[conversation.messages.length - 1]?.id ?? '',
          fromModel: conversation.selectedModel,
          toModel: newModelId,
          timestamp: new Date(),
        };

        // Update conversation
        const updatedConversation: Conversation = {
          ...conversation,
          selectedModel: newModelId,
          updatedAt: new Date(),
          modelHistory: [...conversation.modelHistory, modelChange],
        };

        // Update context usage for new model
        if (options.preserveContext && conversation.contextUsage) {
          const contextTokens = conversation.contextUsage.currentTokens;
          const canFit = modelUtils.canFitContext(newModel, contextTokens);

          if (!canFit) {
            return {
              success: false,
              error: `Context too large for ${newModel.name}. Consider compressing the conversation.`,
            };
          }

          updatedConversation.contextUsage = {
            currentTokens: conversation.contextUsage.currentTokens,
            maxTokens: newModel.contextLength,
            warningThreshold: conversation.contextUsage.warningThreshold,
            canExtend: newModel.capabilities.includes('context-extension'),
            isExtended: conversation.contextUsage.isExtended,
            extendedMaxTokens: newModel.capabilities.includes(
              'context-extension'
            )
              ? newModel.contextLength * 2
              : undefined,
          };
        }

        return { success: true, updatedConversation };
      } catch (_error) {
        const errorMessage =
          _error instanceof Error ? _error.message : 'Failed to switch model';
        if (import.meta.env.DEV) {
          // Model switch failed
        }
        return { success: false, error: errorMessage };
      }
    },
    [getModelById, validateModelSwitch]
  );

  // Load models on mount and set up refresh interval
  useEffect(() => {
    loadModels();

    if (refreshInterval > 0) {
      const interval = setInterval(() => {
        loadModels();
      }, refreshInterval);
      return () => clearInterval(interval);
    }

    return undefined;
  }, [loadModels, refreshInterval]);

  return {
    state,
    selectModel,
    validateModelSwitch,
    getModelConfiguration,
    updateModelConfiguration,
    refreshModels,
    getRecommendedModel,
    hasCapability,
    getModelById,
    switchConversationModel,
  };
}

export default useModelSelection;
