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
    description: 'OpenAI\'s flagship multimodal model with omnichannel capabilities. Processes text, images, and audio with 128K context window. Excels at real-time interactions, multimodal reasoning, and complex problem-solving. Average response time of 320ms for audio. Ideal for customer support, content creation, and interactive applications.',
    provider: 'azure',
    contextLength: 128000,
    capabilities: ['text', 'images', 'audio', 'code', 'reasoning', 'function_calling', 'real-time', 'multimodal'],
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
    description: 'Cost-efficient small model that outperforms GPT-3.5 Turbo. 60% cheaper with 128K context window. Scores 82% on MMLU benchmark. Ideal for high-volume API calls, customer support, receipt processing, and email responses. Balances intelligence with speed and affordability.',
    provider: 'azure',
    contextLength: 128000,
    capabilities: ['text', 'images', 'code', 'vision'],
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
    id: 'gpt-4.1',
    name: 'GPT-4.1',
    description: 'Latest GPT-4 series with major improvements in coding and instruction following. Scores 54.6% on SWE-bench Verified (21.4% improvement over GPT-4o). 88% on Aider polyglot coding. 1M token context window with improved long-context comprehension. 10.5% better instruction following. Ideal for complex coding tasks, repository analysis, and agentic workflows.',
    provider: 'azure',
    contextLength: 1000000,
    capabilities: ['text', 'images', 'code', 'reasoning', 'function_calling', 'long-context'],
    category: 'coding',
    isAvailable: true,
    healthStatus: 'healthy',
    lastHealthCheck: new Date().toISOString(),
    pricing: {
      inputTokens: 2.0,
      outputTokens: 8.0,
    },
    features: {
      streaming: true,
      functionCalling: true,
      imageInput: true,
      contextExtension: true,
    },
  },
  {
    id: 'gpt-5',
    name: 'GPT-5',
    description: 'OpenAI\'s most advanced model for coding and agentic tasks. State-of-the-art: 74.9% on SWE-bench Verified, 88% on Aider polyglot. Excels at frontend development (70% preferred over o3), bug fixing, and complex codebase analysis. 400K context length with 128K max output. Supports hybrid reasoning modes (minimal/low/medium/high) and verbosity control. Ideal for production coding, autonomous agents, and complex problem-solving.',
    provider: 'azure',
    contextLength: 400000,
    capabilities: ['text', 'images', 'code', 'reasoning', 'function_calling', 'agentic', 'frontend', 'long-context'],
    category: 'coding',
    isAvailable: true,
    healthStatus: 'healthy',
    lastHealthCheck: new Date().toISOString(),
    pricing: {
      inputTokens: 1.25,
      outputTokens: 10.0,
    },
    features: {
      streaming: true,
      functionCalling: true,
      imageInput: true,
      contextExtension: true,
    },
  },
  {
    id: 'gpt-5-codex',
    name: 'GPT-5 Codex',
    description: 'Specialized coding variant of GPT-5 optimized for software development. Enhanced code generation, debugging, and repository-scale analysis. Supports custom tools with plaintext input (no JSON escaping required). Ideal for IDE integrations, code review, and automated refactoring.',
    provider: 'azure',
    contextLength: 400000,
    capabilities: ['text', 'code', 'reasoning', 'function_calling', 'agentic', 'custom-tools'],
    category: 'coding',
    isAvailable: true,
    healthStatus: 'healthy',
    lastHealthCheck: new Date().toISOString(),
    pricing: {
      inputTokens: 1.25,
      outputTokens: 10.0,
    },
    features: {
      streaming: true,
      functionCalling: true,
      imageInput: false,
      contextExtension: true,
    },
  },
  {
    id: 'gpt-5-pro',
    name: 'GPT-5 Pro',
    description: 'Premium GPT-5 variant with enhanced reasoning and factuality. 80% fewer factual errors than o3. Excels at health questions, legal analysis, and decision-making. Supports advanced agentic workflows with multi-step tool calling. Ideal for enterprise applications requiring highest accuracy and reliability.',
    provider: 'azure',
    contextLength: 400000,
    capabilities: ['text', 'images', 'code', 'reasoning', 'function_calling', 'agentic', 'factuality', 'health'],
    category: 'reasoning',
    isAvailable: true,
    healthStatus: 'healthy',
    lastHealthCheck: new Date().toISOString(),
    pricing: {
      inputTokens: 2.5,
      outputTokens: 15.0,
    },
    features: {
      streaming: true,
      functionCalling: true,
      imageInput: true,
      contextExtension: true,
    },
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    description: 'Advanced GPT-4 model with 128K context window and enhanced vision capabilities. Includes Dall-E 3 integration for image generation. Supports comprehensive multimodal processing. Knowledge cutoff: December 2023.',
    provider: 'azure',
    contextLength: 128000,
    capabilities: ['text', 'images', 'code', 'reasoning', 'image-generation'],
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
    id: 'qwen.qwen3-coder-480b-a35b-v1:0',
    name: 'Qwen3-Coder-480B-A35B',
    description: 'Alibaba\'s flagship MoE coding model with 480B total parameters and 35B active. Optimized for agentic coding, browser use, and tool orchestration. Native 256K context (extensible to 1M tokens) enables repository-scale analysis. Excels at code generation, debugging, and multi-step workflows across Python, JavaScript, Java, C++, Go, and Rust. Supports advanced function calling and tool integration. Ideal for autonomous coding agents and complex software engineering tasks.',
    provider: 'bedrock',
    contextLength: 256000,
    extendedContextLength: 1000000,
    capabilities: ['text', 'code', 'reasoning', 'agentic', 'tool-calling', 'multilingual', 'long-context'],
    category: 'coding',
    isAvailable: false, // Will be updated based on configuration
    healthStatus: 'unavailable',
    lastHealthCheck: new Date().toISOString(),
    pricing: {
      inputTokens: 1.5,
      outputTokens: 7.5,
    },
    features: {
      streaming: true,
      functionCalling: true,
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
 * Parse configured model IDs from environment variables
 */
function getConfiguredModelIds(): {
  azureModels: string[];
  bedrockModels: string[];
} {
  const azureModels: string[] = [];
  const bedrockModels: string[] = [];

  // Parse Azure OpenAI models from AZURE_OPENAI_MODEL
  if (config.AZURE_OPENAI_MODEL?.trim()) {
    const models = config.AZURE_OPENAI_MODEL.split(',')
      .map((m) => m.trim())
      .filter((m) => m.length > 0);
    azureModels.push(...models);
  }

  // Parse AWS Bedrock models from AWS_BEDROCK_MODELS
  if (config.AWS_BEDROCK_MODELS?.trim()) {
    const models = config.AWS_BEDROCK_MODELS.split(',')
      .map((m) => m.trim())
      .filter((m) => m.length > 0);
    bedrockModels.push(...models);
  }

  return { azureModels, bedrockModels };
}

/**
 * Create a default ModelInfo for models not in MODEL_CONFIGURATIONS
 */
function createDefaultModelInfo(
  modelId: string,
  provider: ModelProvider
): ModelInfo {
  return {
    id: modelId,
    name: modelId
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' '),
    description: `${provider === 'azure' ? 'Azure OpenAI' : 'AWS Bedrock'} model`,
    provider,
    contextLength: 128000, // Default context length
    capabilities: ['text', 'code'],
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
      functionCalling: false,
      imageInput: false,
      contextExtension: false,
    },
  };
}

/**
 * Gets available models with current health status and configuration
 */
async function getAvailableModels(): Promise<readonly ModelInfo[]> {
  const models: ModelInfo[] = [];
  const { azureModels, bedrockModels } = getConfiguredModelIds();

  // Create a map of predefined models for quick lookup
  const predefinedModels = new Map<string, ModelInfo>();
  for (const model of MODEL_CONFIGURATIONS) {
    predefinedModels.set(model.id, model);
  }

  // Process Azure OpenAI models
  for (const modelId of azureModels) {
    // Use predefined config if available, otherwise create default
    const baseModel =
      predefinedModels.get(modelId) ?? createDefaultModelInfo(modelId, 'azure');

    // Check if model should be available based on provider configuration
    const isAvailable = !!(
      config.AZURE_OPENAI_ENDPOINT && config.AZURE_OPENAI_API_KEY
    );

    // Perform health check
    const healthResult = await checkModelHealth(modelId, 'azure');

    models.push({
      ...baseModel,
      id: modelId, // Ensure we use the configured ID
      isAvailable,
      healthStatus: healthResult.status,
      lastHealthCheck: new Date().toISOString(),
    });
  }

  // Process AWS Bedrock models
  for (const modelId of bedrockModels) {
    // Use predefined config if available, otherwise create default
    const baseModel =
      predefinedModels.get(modelId) ??
      createDefaultModelInfo(modelId, 'bedrock');

    // Check if model should be available based on provider configuration
    const isAvailable = isAWSBedrockConfigured(config);

    // Perform health check
    const healthResult = await checkModelHealth(modelId, 'bedrock');

    models.push({
      ...baseModel,
      id: modelId, // Ensure we use the configured ID
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
  const models: ClaudeModel[] = [];
  const { azureModels, bedrockModels } = getConfiguredModelIds();

  // Add configured Azure OpenAI models
  for (const modelId of azureModels) {
    models.push({
      id: modelId,
      object: 'model',
      created: 1640995200, // Unix timestamp
      owned_by: 'openai',
      provider: 'azure',
    });
  }

  // Add configured Bedrock models if Bedrock is configured
  if (isAWSBedrockConfigured(config)) {
    for (const modelId of bedrockModels) {
      models.push({
        id: modelId,
        object: 'model',
        created: 1640995200,
        owned_by: 'alibaba',
        provider: 'bedrock',
      });
    }
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
