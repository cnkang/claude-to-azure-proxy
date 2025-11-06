import type { Response } from 'express';
import type {
  RequestWithCorrelationId,
  ModelProvider,
} from '../types/index.js';
import { logger } from '../middleware/logging';
import config, { isAWSBedrockConfigured } from '../config/index';
import { ValidationError } from '../errors/index';

/**
 * Enhanced /api/models endpoints for frontend model routing and configuration
 * Provides comprehensive model information including capabilities, context limits, and health status
 */

// Enhanced model interface with comprehensive metadata
export interface ModelInfo {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly provider: ModelProvider;
  readonly contextLength: number;
  readonly extendedContextLength?: number;
  readonly capabilities: readonly string[];
  readonly category: 'general' | 'coding' | 'reasoning';
  readonly isAvailable: boolean;
  readonly healthStatus: 'healthy' | 'degraded' | 'unavailable';
  readonly lastHealthCheck: string;
  readonly pricing?: {
    readonly inputTokens: number; // Cost per 1M input tokens
    readonly outputTokens: number; // Cost per 1M output tokens
  };
  readonly features: {
    readonly streaming: boolean;
    readonly functionCalling: boolean;
    readonly imageInput: boolean;
    readonly contextExtension: boolean;
  };
}

// Claude API compatible model interface with provider metadata (for backward compatibility)
export interface ClaudeModel {
  readonly id: string;
  readonly object: 'model';
  readonly created: number;
  readonly owned_by: string;
  readonly provider?: ModelProvider;
}

// Claude API compatible models list response
export interface ClaudeModelsResponse {
  readonly object: 'list';
  readonly data: readonly ClaudeModel[];
}

// Enhanced models response for frontend
export interface ModelsResponse {
  readonly models: readonly ModelInfo[];
  readonly categories: {
    readonly general: readonly string[];
    readonly coding: readonly string[];
    readonly reasoning: readonly string[];
  };
  readonly defaultModel: string;
  readonly correlationId: string;
}

/**
 * Model health check cache to avoid excessive health checks
 */
const modelHealthCache = new Map<
  string,
  {
    status: 'healthy' | 'degraded' | 'unavailable';
    lastCheck: Date;
    responseTime?: number;
  }
>();
const HEALTH_CHECK_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Comprehensive model configuration with all available models
 */
const MODEL_CONFIGURATIONS: readonly ModelInfo[] = [
  // Azure OpenAI Models
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'Most capable model for complex reasoning and analysis',
    provider: 'azure',
    contextLength: 128000,
    capabilities: ['text', 'images', 'code', 'reasoning', 'function_calling'],
    category: 'general',
    isAvailable: true,
    healthStatus: 'healthy',
    lastHealthCheck: new Date().toISOString(),
    pricing: {
      inputTokens: 2.5,
      outputTokens: 10.0,
    },
    features: {
      streaming: true,
      functionCalling: true,
      imageInput: true,
      contextExtension: false,
    },
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Fast and efficient model for everyday tasks',
    provider: 'azure',
    contextLength: 128000,
    capabilities: ['text', 'images', 'code'],
    category: 'general',
    isAvailable: true,
    healthStatus: 'healthy',
    lastHealthCheck: new Date().toISOString(),
    pricing: {
      inputTokens: 0.15,
      outputTokens: 0.6,
    },
    features: {
      streaming: true,
      functionCalling: true,
      imageInput: true,
      contextExtension: false,
    },
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    description: 'Advanced model with large context window',
    provider: 'azure',
    contextLength: 128000,
    capabilities: ['text', 'images', 'code', 'reasoning'],
    category: 'general',
    isAvailable: true,
    healthStatus: 'healthy',
    lastHealthCheck: new Date().toISOString(),
    pricing: {
      inputTokens: 10.0,
      outputTokens: 30.0,
    },
    features: {
      streaming: true,
      functionCalling: true,
      imageInput: true,
      contextExtension: false,
    },
  },
  {
    id: 'o1-preview',
    name: 'o1 Preview',
    description: 'Advanced reasoning model for complex problems',
    provider: 'azure',
    contextLength: 128000,
    capabilities: ['text', 'reasoning', 'mathematics'],
    category: 'reasoning',
    isAvailable: true,
    healthStatus: 'healthy',
    lastHealthCheck: new Date().toISOString(),
    pricing: {
      inputTokens: 15.0,
      outputTokens: 60.0,
    },
    features: {
      streaming: false,
      functionCalling: false,
      imageInput: false,
      contextExtension: false,
    },
  },
  {
    id: 'o1-mini',
    name: 'o1 Mini',
    description: 'Efficient reasoning model for coding and math',
    provider: 'azure',
    contextLength: 65536,
    capabilities: ['text', 'reasoning', 'code', 'mathematics'],
    category: 'reasoning',
    isAvailable: true,
    healthStatus: 'healthy',
    lastHealthCheck: new Date().toISOString(),
    pricing: {
      inputTokens: 3.0,
      outputTokens: 12.0,
    },
    features: {
      streaming: false,
      functionCalling: false,
      imageInput: false,
      contextExtension: false,
    },
  },
  // AWS Bedrock Models (conditionally available)
  {
    id: 'qwen-3-coder',
    name: 'Qwen 3 Coder',
    description: 'Specialized coding model with extended context support',
    provider: 'bedrock',
    contextLength: 256000,
    extendedContextLength: 1000000,
    capabilities: ['text', 'code', 'reasoning'],
    category: 'coding',
    isAvailable: false, // Will be updated based on configuration
    healthStatus: 'unavailable',
    lastHealthCheck: new Date().toISOString(),
    pricing: {
      inputTokens: 1.0,
      outputTokens: 3.0,
    },
    features: {
      streaming: true,
      functionCalling: false,
      imageInput: false,
      contextExtension: true,
    },
  },
  {
    id: 'qwen.qwen3-coder-480b-a35b-v1:0',
    name: 'Qwen 3 Coder (Full ID)',
    description: 'Direct access to Qwen 3 Coder model via full model ID',
    provider: 'bedrock',
    contextLength: 256000,
    extendedContextLength: 1000000,
    capabilities: ['text', 'code', 'reasoning'],
    category: 'coding',
    isAvailable: false, // Will be updated based on configuration
    healthStatus: 'unavailable',
    lastHealthCheck: new Date().toISOString(),
    pricing: {
      inputTokens: 1.0,
      outputTokens: 3.0,
    },
    features: {
      streaming: true,
      functionCalling: false,
      imageInput: false,
      contextExtension: true,
    },
  },
];

/**
 * Performs health check for a specific model
 */
async function checkModelHealth(
  modelId: string,
  provider: ModelProvider
): Promise<{
  status: 'healthy' | 'degraded' | 'unavailable';
  responseTime?: number;
}> {
  const cacheKey = `${provider}:${modelId}`;
  const cached = modelHealthCache.get(cacheKey);

  // Return cached result if still valid
  if (
    cached &&
    Date.now() - cached.lastCheck.getTime() < HEALTH_CHECK_CACHE_TTL
  ) {
    return { status: cached.status, responseTime: cached.responseTime };
  }

  const startTime = Date.now();

  try {
    // For Azure models, check if Azure OpenAI is configured
    if (provider === 'azure') {
      if (!config.AZURE_OPENAI_ENDPOINT || !config.AZURE_OPENAI_API_KEY) {
        const result = { status: 'unavailable' as const };
        modelHealthCache.set(cacheKey, { ...result, lastCheck: new Date() });
        return result;
      }

      // TODO: Implement actual health check by making a minimal request to Azure OpenAI
      // For now, assume healthy if configured
      const responseTime = Date.now() - startTime;
      const result = { status: 'healthy' as const, responseTime };
      modelHealthCache.set(cacheKey, { ...result, lastCheck: new Date() });
      return result;
    }

    // For Bedrock models, check if AWS Bedrock is configured
    if (provider === 'bedrock') {
      if (!isAWSBedrockConfigured(config)) {
        const result = { status: 'unavailable' as const };
        modelHealthCache.set(cacheKey, { ...result, lastCheck: new Date() });
        return result;
      }

      // TODO: Implement actual health check by making a minimal request to AWS Bedrock
      // For now, assume healthy if configured
      const responseTime = Date.now() - startTime;
      const result = { status: 'healthy' as const, responseTime };
      modelHealthCache.set(cacheKey, { ...result, lastCheck: new Date() });
      return result;
    }

    const result = { status: 'unavailable' as const };
    modelHealthCache.set(cacheKey, { ...result, lastCheck: new Date() });
    return result;
  } catch (_error) {
    const responseTime = Date.now() - startTime;
    const result = { status: 'degraded' as const, responseTime };
    modelHealthCache.set(cacheKey, { ...result, lastCheck: new Date() });
    return result;
  }
}

/**
 * Gets available models with current health status and configuration
 */
async function getAvailableModels(): Promise<readonly ModelInfo[]> {
  const models: ModelInfo[] = [];

  for (const model of MODEL_CONFIGURATIONS) {
    // Check if model should be available based on configuration
    let isAvailable = model.isAvailable;

    if (model.provider === 'bedrock') {
      isAvailable = isAWSBedrockConfigured(config);
    } else if (model.provider === 'azure') {
      isAvailable = !!(
        config.AZURE_OPENAI_ENDPOINT && config.AZURE_OPENAI_API_KEY
      );
    }

    // Perform health check
    const healthResult = await checkModelHealth(model.id, model.provider);

    models.push({
      ...model,
      isAvailable,
      healthStatus: healthResult.status,
      lastHealthCheck: new Date().toISOString(),
    });
  }

  return models;
}

/**
 * Creates the models list based on current configuration
 * Includes Azure OpenAI models and conditionally includes Bedrock models
 */
function createModelsResponse(): ClaudeModelsResponse {
  const models: ClaudeModel[] = [
    // Azure OpenAI model (always included)
    {
      id: 'gpt-5-codex',
      object: 'model',
      created: 1640995200, // Unix timestamp
      owned_by: 'openai',
      provider: 'azure',
    },
  ];

  // Add Bedrock models if configured (Requirements 5.1, 5.4)
  if (isAWSBedrockConfigured(config)) {
    // User-friendly model name (Requirement 5.2)
    models.push({
      id: 'qwen-3-coder',
      object: 'model',
      created: 1640995200,
      owned_by: 'alibaba',
      provider: 'bedrock',
    });

    // Full model ID for direct specification (Requirement 5.2)
    models.push({
      id: 'qwen.qwen3-coder-480b-a35b-v1:0',
      object: 'model',
      created: 1640995200,
      owned_by: 'alibaba',
      provider: 'bedrock',
    });
  }

  return {
    object: 'list',
    data: models,
  };
}

/**
 * Creates enhanced models response for frontend
 */
async function createEnhancedModelsResponse(
  correlationId: string
): Promise<ModelsResponse> {
  const models = await getAvailableModels();

  // Categorize models
  const categories = {
    general: models
      .filter((m) => m.category === 'general' && m.isAvailable)
      .map((m) => m.id),
    coding: models
      .filter((m) => m.category === 'coding' && m.isAvailable)
      .map((m) => m.id),
    reasoning: models
      .filter((m) => m.category === 'reasoning' && m.isAvailable)
      .map((m) => m.id),
  };

  // Determine default model (prefer available general models)
  const defaultModel =
    models.find((m) => m.isAvailable && m.category === 'general')?.id ||
    models.find((m) => m.isAvailable)?.id ||
    'gpt-4o-mini';

  return {
    models,
    categories,
    defaultModel,
    correlationId,
  };
}

/**
 * Handler for GET /v1/models endpoint (Claude API compatibility)
 * Returns model information compatible with Claude API format
 * Includes Azure OpenAI models and conditionally includes Bedrock models when configured
 * Maintains Claude API format for models endpoint response (Requirement 5.3)
 */
export const modelsHandler = (
  req: RequestWithCorrelationId,
  res: Response
): void => {
  const { correlationId } = req;

  try {
    logger.info('Models endpoint accessed', correlationId, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      bedrockConfigured: isAWSBedrockConfigured(config),
    });

    // Create dynamic models response based on configuration
    const modelsResponse = createModelsResponse();

    logger.info('Models response generated', correlationId, {
      modelCount: modelsResponse.data.length,
      modelIds: modelsResponse.data.map((model) => model.id),
      providers: [
        ...new Set(modelsResponse.data.map((model) => model.provider)),
      ],
    });

    // Return models response (Requirements 5.1, 5.3)
    res.status(200).json(modelsResponse);
  } catch (error) {
    logger.error('Models endpoint error', correlationId, {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip,
    });

    // Return error response in Claude API format
    res.status(500).json({
      error: {
        type: 'internal_server_error',
        message: 'Failed to retrieve models',
        correlationId,
      },
    });
  }
};

/**
 * Handler for GET /api/models endpoint (Enhanced frontend API)
 * Returns comprehensive model information including capabilities, health status, and context limits
 * Requirements: 2.5, 12.5
 */
export const getModelsHandler = async (
  req: RequestWithCorrelationId,
  res: Response
): Promise<void> => {
  const { correlationId } = req;

  try {
    logger.info('Enhanced models endpoint accessed', correlationId, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      bedrockConfigured: isAWSBedrockConfigured(config),
    });

    // Create enhanced models response with health checks
    const modelsResponse = await createEnhancedModelsResponse(correlationId);

    logger.info('Enhanced models response generated', correlationId, {
      modelCount: modelsResponse.models.length,
      availableModels: modelsResponse.models.filter((m) => m.isAvailable)
        .length,
      categories: modelsResponse.categories,
      defaultModel: modelsResponse.defaultModel,
    });

    res.status(200).json(modelsResponse);
  } catch (error) {
    logger.error('Enhanced models endpoint error', correlationId, {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip,
    });

    res.status(500).json({
      error: {
        type: 'internal_server_error',
        message: 'Failed to retrieve model information',
        correlationId,
      },
    });
  }
};

/**
 * Handler for GET /api/models/:modelId endpoint
 * Returns detailed information about a specific model
 * Requirements: 2.5, 12.5
 */
export const getModelDetailsHandler = async (
  req: RequestWithCorrelationId,
  res: Response
): Promise<void> => {
  const { correlationId } = req;
  const { modelId } = req.params;

  try {
    if (!modelId || typeof modelId !== 'string') {
      throw new ValidationError(
        'Model ID is required',
        correlationId,
        'modelId',
        modelId
      );
    }

    logger.info('Model details endpoint accessed', correlationId, {
      modelId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Get all available models
    const models = await getAvailableModels();

    // Find the requested model
    const model = models.find((m) => m.id === modelId);

    if (!model) {
      logger.warn('Model not found', correlationId, {
        requestedModelId: modelId,
        availableModels: models.map((m) => m.id),
      });

      res.status(404).json({
        error: {
          type: 'model_not_found',
          message: `Model '${modelId}' not found`,
          correlationId,
        },
      });
      return;
    }

    // Perform fresh health check for the specific model
    const healthResult = await checkModelHealth(model.id, model.provider);

    const modelDetails: ModelInfo = {
      ...model,
      healthStatus: healthResult.status,
      lastHealthCheck: new Date().toISOString(),
    };

    logger.info('Model details retrieved', correlationId, {
      modelId,
      provider: model.provider,
      isAvailable: model.isAvailable,
      healthStatus: healthResult.status,
    });

    res.status(200).json({
      model: modelDetails,
      correlationId,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({
        error: {
          type: 'validation_error',
          message: error.message,
          correlationId,
        },
      });
      return;
    }

    logger.error('Model details endpoint error', correlationId, {
      modelId,
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip,
    });

    res.status(500).json({
      error: {
        type: 'internal_server_error',
        message: 'Failed to retrieve model details',
        correlationId,
      },
    });
  }
};

/**
 * Handler for POST /api/models/:modelId/health endpoint
 * Performs a health check for a specific model
 * Requirements: 2.5, 12.5
 */
export const checkModelHealthHandler = async (
  req: RequestWithCorrelationId,
  res: Response
): Promise<void> => {
  const { correlationId } = req;
  const { modelId } = req.params;

  try {
    if (!modelId || typeof modelId !== 'string') {
      throw new ValidationError(
        'Model ID is required',
        correlationId,
        'modelId',
        modelId
      );
    }

    logger.info('Model health check requested', correlationId, {
      modelId,
      ip: req.ip,
    });

    // Find the model configuration
    const modelConfig = MODEL_CONFIGURATIONS.find((m) => m.id === modelId);

    if (!modelConfig) {
      res.status(404).json({
        error: {
          type: 'model_not_found',
          message: `Model '${modelId}' not found`,
          correlationId,
        },
      });
      return;
    }

    // Force a fresh health check by clearing cache
    const cacheKey = `${modelConfig.provider}:${modelId}`;
    modelHealthCache.delete(cacheKey);

    // Perform health check
    const healthResult = await checkModelHealth(modelId, modelConfig.provider);

    logger.info('Model health check completed', correlationId, {
      modelId,
      provider: modelConfig.provider,
      status: healthResult.status,
      responseTime: healthResult.responseTime,
    });

    res.status(200).json({
      modelId,
      provider: modelConfig.provider,
      status: healthResult.status,
      responseTime: healthResult.responseTime,
      timestamp: new Date().toISOString(),
      correlationId,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({
        error: {
          type: 'validation_error',
          message: error.message,
          correlationId,
        },
      });
      return;
    }

    logger.error('Model health check error', correlationId, {
      modelId,
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip,
    });

    res.status(500).json({
      error: {
        type: 'internal_server_error',
        message: 'Failed to perform health check',
        correlationId,
      },
    });
  }
};
