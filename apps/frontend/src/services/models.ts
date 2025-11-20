/**
 * Model Management Service
 *
 * Provides model information management with provider routing,
 * model categorization, and configuration handling.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 12.1, 12.2, 12.3, 12.4
 */

import type { ModelInfo, ClientConfig } from '../types/index.js';

// API endpoints
const MODELS_ENDPOINT = '/api/models';
const CONFIG_ENDPOINT = '/api/config';

const DEFAULT_API_KEY = 'dev-proxy-key-123456789012345678901234';

const resolveApiKey = (): string | undefined => {
  if (typeof window !== 'undefined') {
    const e2eKey = (window as Window & { __E2E_PROXY_API_KEY__?: string })
      .__E2E_PROXY_API_KEY__;
    if (typeof e2eKey === 'string' && e2eKey.trim().length > 0) {
      return e2eKey.trim();
    }
  }

  const envKey = (import.meta as unknown as { env?: Record<string, unknown> })
    .env?.VITE_PROXY_API_KEY;
  if (typeof envKey === 'string' && envKey.trim().length > 0) {
    return envKey.trim();
  }

  return DEFAULT_API_KEY;
};

const getAuthHeaders = (): Record<string, string> => {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    return {};
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    'x-api-key': apiKey,
  };
};

/**
 * Model categories for UI organization
 */
export const MODEL_CATEGORIES = {
  general: 'General Purpose',
  coding: 'Code & Development',
  reasoning: 'Advanced Reasoning',
} as const;

/**
 * Provider information for display
 */
export const PROVIDER_INFO = {
  'azure-openai': {
    name: 'Azure OpenAI',
    description: 'Microsoft Azure OpenAI Service',
    icon: '🔷',
  },
  'aws-bedrock': {
    name: 'AWS Bedrock',
    description: 'Amazon Bedrock AI Service',
    icon: '🟠',
  },
} as const;

/**
 * Model capability descriptions
 */
export const CAPABILITY_DESCRIPTIONS = {
  'text-generation': 'Generate and complete text',
  'code-generation': 'Write and debug code',
  'code-analysis': 'Analyze and review code',
  reasoning: 'Complex logical reasoning',
  conversation: 'Natural conversation',
  'file-upload': 'Process uploaded files',
  'image-analysis': 'Analyze images',
  'context-extension': 'Extended context support',
  streaming: 'Real-time streaming responses',
} as const;

/**
 * Enhanced model information with computed properties
 */
export interface EnhancedModelInfo extends ModelInfo {
  readonly providerInfo: (typeof PROVIDER_INFO)[keyof typeof PROVIDER_INFO];
  readonly categoryLabel: string;
  readonly capabilityDescriptions: string[];
  readonly contextLimitFormatted: string;
  readonly isRecommended: boolean;
  readonly performanceRating: 'high' | 'medium' | 'low';
}

/**
 * Model selection criteria
 */
export interface ModelSelectionCriteria {
  readonly category?: keyof typeof MODEL_CATEGORIES;
  readonly provider?: ModelInfo['provider'];
  readonly minContextLength?: number;
  readonly requiredCapabilities?: string[];
  readonly excludeUnavailable?: boolean;
}

/**
 * Model switching options
 */
export interface ModelSwitchOptions {
  readonly preserveContext: boolean;
  readonly notifyUser: boolean;
  readonly validateCompatibility: boolean;
}

/**
 * Model configuration for specific use cases
 */
export interface ModelConfiguration {
  readonly modelId: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly topP?: number;
  readonly frequencyPenalty?: number;
  readonly presencePenalty?: number;
  readonly stopSequences?: string[];
  readonly systemPrompt?: string;
}

/**
 * Model service class for managing AI models
 */
export class ModelService {
  private static instance: ModelService | null = null;
  private modelsCache: ModelInfo[] | null = null;
  private configCache: ClientConfig | null = null;
  private cacheTimestamp: number = 0;
  private readonly cacheTimeout = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): ModelService {
    ModelService.instance ??= new ModelService();
    return ModelService.instance;
  }

  /**
   * Fetch available models from the API
   */
  public async fetchModels(forceRefresh = false): Promise<ModelInfo[]> {
    const now = Date.now();

    // Return cached data if valid and not forcing refresh
    if (
      !forceRefresh &&
      this.modelsCache !== null &&
      now - this.cacheTimestamp < this.cacheTimeout
    ) {
      return this.modelsCache;
    }

    try {
      const response = await fetch(MODELS_ENDPOINT, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch models: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as {
        data?: Array<{ id: string; provider: string }>;
      };

      // Transform Claude API format to our ModelInfo format
      const models: ModelInfo[] =
        data.data?.map((model) => ({
          id: model.id,
          name: this.getModelDisplayName(model.id),
          description: this.getModelDescription(model.id),
          capabilities: this.getModelCapabilities(model.id),
          contextLength: this.getModelContextLength(model.id),
          isAvailable: true,
          provider: model.provider === 'azure' ? 'azure-openai' : 'aws-bedrock',
          category: this.getModelCategory(model.id),
        })) ?? [];

      // Cache the results
      this.modelsCache = models;
      this.cacheTimestamp = now;

      return models;
    } catch (_error) {
      if (import.meta.env.DEV) {
        // console.error('Failed to fetch models:', error);
      }

      // Return cached data if available, otherwise return default models
      if (this.modelsCache) {
        return this.modelsCache;
      }

      return this.getDefaultModels();
    }
  }

  /**
   * Fetch client configuration from the API
   */
  public async fetchConfig(forceRefresh = false): Promise<ClientConfig> {
    const now = Date.now();

    // Return cached data if valid and not forcing refresh
    if (
      !forceRefresh &&
      this.configCache !== null &&
      now - this.cacheTimestamp < this.cacheTimeout
    ) {
      return this.configCache;
    }

    try {
      const response = await fetch(CONFIG_ENDPOINT, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch config: ${response.status} ${response.statusText}`
        );
      }

      const config: ClientConfig = await response.json();

      // Cache the results
      this.configCache = config;
      this.cacheTimestamp = now;

      return config;
    } catch (_error) {
      if (import.meta.env.DEV) {
        // console.error('Failed to fetch config:', error);
      }

      // Return cached data if available, otherwise return default config
      if (this.configCache) {
        return this.configCache;
      }

      return this.getDefaultConfig();
    }
  }

  /**
   * Get enhanced model information with computed properties
   */
  public async getEnhancedModels(
    criteria?: ModelSelectionCriteria
  ): Promise<EnhancedModelInfo[]> {
    const models = await this.fetchModels();

    let filteredModels = models;

    // Apply filtering criteria
    if (criteria) {
      filteredModels = models.filter((model) => {
        if (criteria.category && model.category !== criteria.category) {
          return false;
        }

        if (criteria.provider && model.provider !== criteria.provider) {
          return false;
        }

        if (
          criteria.minContextLength &&
          model.contextLength < criteria.minContextLength
        ) {
          return false;
        }

        if (criteria.requiredCapabilities) {
          const hasAllCapabilities = criteria.requiredCapabilities.every(
            (capability) => model.capabilities.includes(capability)
          );
          if (!hasAllCapabilities) {
            return false;
          }
        }

        if (criteria.excludeUnavailable && !model.isAvailable) {
          return false;
        }

        return true;
      });
    }

    // Enhance models with computed properties
    return filteredModels.map((model) => this.enhanceModelInfo(model));
  }

  /**
   * Get model by ID
   */
  public async getModelById(
    _modelId: string
  ): Promise<EnhancedModelInfo | null> {
    const models = await this.getEnhancedModels();
    return models.find((model) => model.id === _modelId) ?? null;
  }

  /**
   * Get models grouped by category
   */
  public async getModelsByCategory(): Promise<
    Record<string, EnhancedModelInfo[]>
  > {
    const models = await this.getEnhancedModels();

    const grouped: Record<string, EnhancedModelInfo[]> = {};

    for (const category of Object.keys(MODEL_CATEGORIES)) {
      grouped[category] = models.filter((model) => model.category === category);
    }

    return grouped;
  }

  /**
   * Get recommended models for a specific use case
   */
  public async getRecommendedModels(
    useCase: 'general' | 'coding' | 'reasoning'
  ): Promise<EnhancedModelInfo[]> {
    const models = await this.getEnhancedModels({ category: useCase });

    // Sort by recommendation score (availability, performance, context length)
    return models
      .filter((model) => model.isRecommended)
      .sort((a, b) => {
        // Prioritize available models
        if (a.isAvailable !== b.isAvailable) {
          return a.isAvailable ? -1 : 1;
        }

        // Then by performance rating
        const performanceOrder = { high: 0, medium: 1, low: 2 };
        const aPerfScore = performanceOrder[a.performanceRating];
        const bPerfScore = performanceOrder[b.performanceRating];

        if (aPerfScore !== bPerfScore) {
          return aPerfScore - bPerfScore;
        }

        // Finally by context length
        return b.contextLength - a.contextLength;
      });
  }

  /**
   * Validate model compatibility for switching
   */
  public async validateModelSwitch(
    fromModelId: string,
    toModelId: string,
    contextTokens: number
  ): Promise<{ compatible: boolean; warnings: string[]; errors: string[] }> {
    const fromModel = await this.getModelById(fromModelId);
    const toModel = await this.getModelById(toModelId);

    const warnings: string[] = [];
    const errors: string[] = [];

    if (!fromModel) {
      errors.push(`Source model "${fromModelId}" not found`);
    }

    if (!toModel) {
      errors.push(`Target model "${toModelId}" not found`);
      return { compatible: false, warnings, errors };
    }

    // Check availability
    if (!toModel.isAvailable) {
      errors.push(`Model "${toModel.name}" is currently unavailable`);
    }

    // Check context length compatibility
    if (contextTokens > toModel.contextLength) {
      errors.push(
        `Current conversation context (${contextTokens.toLocaleString()} tokens) ` +
          `exceeds target model's limit (${toModel.contextLength.toLocaleString()} tokens)`
      );
    }

    // Check capability differences
    if (fromModel) {
      const lostCapabilities = fromModel.capabilities.filter(
        (cap) => !toModel.capabilities.includes(cap)
      );

      if (lostCapabilities.length > 0) {
        warnings.push(
          `Target model lacks some capabilities: ${lostCapabilities.join(', ')}`
        );
      }
    }

    // Check provider differences
    if (fromModel && fromModel.provider !== toModel.provider) {
      warnings.push(
        `Switching from ${fromModel.providerInfo.name} to ${toModel.providerInfo.name}`
      );
    }

    return {
      compatible: errors.length === 0,
      warnings,
      errors,
    };
  }

  /**
   * Get default model configuration for a specific model
   */
  public getDefaultModelConfiguration(modelId: string): ModelConfiguration {
    // Model-specific default configurations
    const configurations: Record<string, Partial<ModelConfiguration>> = {
      'gpt-5-codex': {
        temperature: 0.1,
        maxTokens: 4096,
        topP: 0.95,
        frequencyPenalty: 0.0,
        presencePenalty: 0.0,
      },
      'gpt-4': {
        temperature: 0.7,
        maxTokens: 2048,
        topP: 1.0,
        frequencyPenalty: 0.0,
        presencePenalty: 0.0,
      },
      'qwen-3-coder': {
        temperature: 0.2,
        maxTokens: 8192,
        topP: 0.9,
        frequencyPenalty: 0.1,
        presencePenalty: 0.0,
      },
    };

    const modelConfig = configurations[modelId] ?? {};

    return {
      modelId,
      temperature: 0.7,
      maxTokens: 2048,
      topP: 1.0,
      frequencyPenalty: 0.0,
      presencePenalty: 0.0,
      stopSequences: [],
      ...modelConfig,
    };
  }

  /**
   * Enhance model info with computed properties
   */
  private enhanceModelInfo(model: ModelInfo): EnhancedModelInfo {
    const providerInfo = PROVIDER_INFO[model.provider];
    const categoryLabel = MODEL_CATEGORIES[model.category];

    const capabilityDescriptions = model.capabilities
      .map(
        (cap) =>
          CAPABILITY_DESCRIPTIONS[cap as keyof typeof CAPABILITY_DESCRIPTIONS]
      )
      .filter(Boolean);

    const contextLimitFormatted = this.formatContextLength(model.contextLength);

    // Determine if model is recommended based on various factors
    const isRecommended =
      model.isAvailable &&
      model.contextLength >= 32000 &&
      model.capabilities.length >= 3;

    // Determine performance rating based on model characteristics
    const performanceRating = this.getPerformanceRating(model);

    return {
      ...model,
      providerInfo,
      categoryLabel,
      capabilityDescriptions,
      contextLimitFormatted,
      isRecommended,
      performanceRating,
    };
  }

  /**
   * Get display name for a model
   */
  private getModelDisplayName(modelId: string): string {
    const displayNames: Record<string, string> = {
      'gpt-5-codex': 'GPT-5 Codex',
      'gpt-4': 'GPT-4',
      'gpt-3.5-turbo': 'GPT-3.5 Turbo',
      'qwen-3-coder': 'Qwen 3 Coder',
      'qwen.qwen3-coder-480b-a35b-v1:0': 'Qwen 3 Coder 480B',
    };

    return displayNames[modelId] ?? modelId;
  }

  /**
   * Get description for a model
   */
  private getModelDescription(modelId: string): string {
    const descriptions: Record<string, string> = {
      'gpt-5-codex':
        'Advanced coding model with superior code generation and analysis capabilities',
      'gpt-4':
        'Powerful general-purpose model for complex reasoning and conversation',
      'gpt-3.5-turbo':
        'Fast and efficient model for general tasks and conversation',
      'qwen-3-coder':
        'Specialized coding model with excellent programming language support',
      'qwen.qwen3-coder-480b-a35b-v1:0':
        'Large-scale coding model with extensive context and advanced capabilities',
    };

    return descriptions[modelId] ?? 'AI language model';
  }

  /**
   * Get capabilities for a model
   */
  private getModelCapabilities(modelId: string): string[] {
    const capabilities: Record<string, string[]> = {
      'gpt-5-codex': [
        'text-generation',
        'code-generation',
        'code-analysis',
        'reasoning',
        'conversation',
        'file-upload',
        'streaming',
      ],
      'gpt-4': [
        'text-generation',
        'reasoning',
        'conversation',
        'file-upload',
        'image-analysis',
        'streaming',
      ],
      'gpt-3.5-turbo': ['text-generation', 'conversation', 'streaming'],
      'qwen-3-coder': [
        'text-generation',
        'code-generation',
        'code-analysis',
        'reasoning',
        'conversation',
        'context-extension',
        'streaming',
      ],
      'qwen.qwen3-coder-480b-a35b-v1:0': [
        'text-generation',
        'code-generation',
        'code-analysis',
        'reasoning',
        'conversation',
        'context-extension',
        'streaming',
      ],
    };

    return capabilities[modelId] ?? ['text-generation', 'conversation'];
  }

  /**
   * Get context length for a model
   */
  private getModelContextLength(modelId: string): number {
    const contextLengths: Record<string, number> = {
      'gpt-5-codex': 128000,
      'gpt-4': 128000,
      'gpt-3.5-turbo': 16385,
      'qwen-3-coder': 256000,
      'qwen.qwen3-coder-480b-a35b-v1:0': 1000000,
    };

    return contextLengths[modelId] ?? 32000;
  }

  /**
   * Get category for a model
   */
  private getModelCategory(
    modelId: string
  ): 'general' | 'coding' | 'reasoning' {
    if (modelId.includes('codex') || modelId.includes('coder')) {
      return 'coding';
    }

    if (modelId.includes('gpt-5') || modelId.includes('qwen')) {
      return 'reasoning';
    }

    return 'general';
  }

  /**
   * Format context length for display
   */
  private formatContextLength(contextLength: number): string {
    if (contextLength >= 1000000) {
      return `${(contextLength / 1000000).toFixed(1)}M tokens`;
    }

    if (contextLength >= 1000) {
      return `${(contextLength / 1000).toFixed(0)}K tokens`;
    }

    return `${contextLength} tokens`;
  }

  /**
   * Get performance rating for a model
   */
  private getPerformanceRating(model: ModelInfo): 'high' | 'medium' | 'low' {
    // Rate based on context length and capabilities
    const capabilityScore = model.capabilities.length;
    const contextScore =
      model.contextLength >= 100000 ? 2 : model.contextLength >= 32000 ? 1 : 0;

    const totalScore = capabilityScore + contextScore;

    if (totalScore >= 8) {
      return 'high';
    }
    if (totalScore >= 5) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Get default models when API is unavailable
   */
  private getDefaultModels(): ModelInfo[] {
    return [
      {
        id: 'gpt-4',
        name: 'GPT-4',
        description:
          'Powerful general-purpose model for complex reasoning and conversation',
        capabilities: [
          'text-generation',
          'reasoning',
          'conversation',
          'streaming',
        ],
        contextLength: 128000,
        isAvailable: true,
        provider: 'azure-openai',
        category: 'general',
      },
    ];
  }

  /**
   * Get default config when API is unavailable
   */
  private getDefaultConfig(): ClientConfig {
    return {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      supportedFileTypes: [
        '.txt',
        '.md',
        '.js',
        '.ts',
        '.py',
        '.java',
        '.cpp',
        '.c',
        '.h',
      ],
      availableModels: this.getDefaultModels(),
      features: {
        fileUpload: true,
        imageUpload: false,
        codeHighlighting: true,
        streamingResponses: true,
      },
      maxConversations: 100,
      maxMessagesPerConversation: 1000,
      defaultModel: 'gpt-4',
      modelCategories: {
        general: ['gpt-4'],
        coding: [],
        reasoning: [],
      },
    };
  }

  /**
   * Clear cache
   */
  public clearCache(): void {
    this.modelsCache = null;
    this.configCache = null;
    this.cacheTimestamp = 0;
  }
}

/**
 * Get the global model service instance
 */
export function getModelService(): ModelService {
  return ModelService.getInstance();
}

/**
 * Model utility functions
 */
export const modelUtils = {
  /**
   * Check if a model supports a specific capability
   */
  hasCapability(model: ModelInfo, capability: string): boolean {
    return model.capabilities.includes(capability);
  },

  /**
   * Compare two models for compatibility
   */
  areModelsCompatible(model1: ModelInfo, model2: ModelInfo): boolean {
    // Models are compatible if they share at least 50% of capabilities
    const sharedCapabilities = model1.capabilities.filter((cap) =>
      model2.capabilities.includes(cap)
    );

    const minCapabilities = Math.min(
      model1.capabilities.length,
      model2.capabilities.length
    );
    return sharedCapabilities.length >= minCapabilities * 0.5;
  },

  /**
   * Get the best model for a specific task
   */
  getBestModelForTask(
    models: ModelInfo[],
    task: 'coding' | 'reasoning' | 'conversation'
  ): ModelInfo | null {
    const taskCapabilities: Record<string, string[]> = {
      coding: ['code-generation', 'code-analysis'],
      reasoning: ['reasoning'],
      conversation: ['conversation', 'text-generation'],
    };

    const requiredCapabilities = taskCapabilities[task] ?? [];

    const suitableModels = models.filter(
      (model) =>
        model.isAvailable &&
        requiredCapabilities.some((cap) => model.capabilities.includes(cap))
    );

    if (suitableModels.length === 0) {
      return null;
    }

    // Sort by context length (higher is better) and capability count
    return suitableModels.sort((a, b) => {
      const aScore = a.contextLength + a.capabilities.length * 1000;
      const bScore = b.contextLength + b.capabilities.length * 1000;
      return bScore - aScore;
    })[0];
  },

  /**
   * Estimate tokens for text (rough approximation)
   */
  estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  },

  /**
   * Check if context fits within model limits
   */
  canFitContext(
    model: ModelInfo,
    contextTokens: number,
    bufferPercentage = 0.1
  ): boolean {
    const maxTokens = model.contextLength * (1 - bufferPercentage);
    return contextTokens <= maxTokens;
  },
};
