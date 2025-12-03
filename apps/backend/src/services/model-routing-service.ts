/**
 * Model Routing Service
 *
 * Provides centralized model routing, provider management, and request transformation
 * for different AI model providers (Azure OpenAI, AWS Bedrock).
 *
 * Requirements: 2.5, 12.5
 */

import config, { isAWSBedrockConfigured } from '../config/index.js';
import {
  ValidationError,
  InternalServerError as _InternalServerError,
} from '../errors/index.js';
import { logger } from '../middleware/logging.js';
import type {
  ModelProvider,
  ModelRoutingConfig,
  ModelRoutingDecision,
  UniversalRequest,
  RequestWithCorrelationId as _RequestWithCorrelationId,
  ResponsesCreateParams as _ResponsesCreateParams,
} from '../types/index.js';

/**
 * Model capability information
 */
export interface ModelCapabilities {
  readonly maxContextLength: number;
  readonly extendedContextLength?: number;
  readonly supportsStreaming: boolean;
  readonly supportsFunctionCalling: boolean;
  readonly supportsImageInput: boolean;
  readonly supportsContextExtension: boolean;
  readonly supportedFormats: readonly string[];
}

/**
 * Model routing result with transformation parameters
 */
export interface ModelRoutingResult {
  readonly decision: ModelRoutingDecision;
  readonly capabilities: ModelCapabilities;
  readonly transformationParams: {
    readonly maxTokens?: number;
    readonly temperature?: number;
    readonly topP?: number;
    readonly stream?: boolean;
  };
  readonly providerEndpoint: string;
  readonly providerHeaders: Record<string, string>;
}

/**
 * Model routing service class
 */
export class ModelRoutingService {
  private readonly routingConfig: ModelRoutingConfig;
  private readonly modelCapabilitiesMap: Map<string, ModelCapabilities>;
  private readonly providerHealthStatus: Map<
    ModelProvider,
    { status: 'healthy' | 'degraded' | 'unavailable'; lastCheck: Date }
  >;

  constructor(routingConfig: ModelRoutingConfig) {
    this.routingConfig = routingConfig;
    this.modelCapabilitiesMap = this.initializeModelCapabilities();
    this.providerHealthStatus = new Map();
  }

  /**
   * Routes a model request to the appropriate provider
   */
  public async routeModelRequest(
    modelId: string,
    request: UniversalRequest,
    correlationId: string
  ): Promise<ModelRoutingResult> {
    try {
      // Determine model routing
      const decision = this.determineModelRouting(modelId, correlationId);

      // Get model capabilities
      const capabilities = this.getModelCapabilities(decision.backendModel);

      // Validate request against model capabilities
      this.validateRequestCapabilities(request, capabilities, correlationId);

      // Get provider configuration
      const providerConfig = await this.getProviderConfiguration(
        decision.provider,
        correlationId
      );

      // Create transformation parameters
      const transformationParams = this.createTransformationParams(
        request,
        capabilities
      );

      logger.info('Model request routed successfully', correlationId, {
        requestedModel: modelId,
        routedProvider: decision.provider,
        backendModel: decision.backendModel,
        capabilities: {
          maxContext: capabilities.maxContextLength,
          streaming: capabilities.supportsStreaming,
          functionCalling: capabilities.supportsFunctionCalling,
        },
      });

      return {
        decision,
        capabilities,
        transformationParams,
        providerEndpoint: providerConfig.endpoint,
        providerHeaders: providerConfig.headers,
      };
    } catch (error) {
      logger.error('Model routing failed', correlationId, {
        modelId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Gets available models with their capabilities
   */
  public getAvailableModels(): Array<{
    id: string;
    provider: ModelProvider;
    capabilities: ModelCapabilities;
  }> {
    const models: Array<{
      id: string;
      provider: ModelProvider;
      capabilities: ModelCapabilities;
    }> = [];

    for (const entry of this.routingConfig.entries) {
      const capabilities = this.getModelCapabilities(entry.backendModel);

      // Add the backend model
      models.push({
        id: entry.backendModel,
        provider: entry.provider,
        capabilities,
      });

      // Add all aliases
      for (const alias of entry.aliases) {
        models.push({
          id: alias,
          provider: entry.provider,
          capabilities,
        });
      }
    }

    return models;
  }

  /**
   * Checks if a model supports context extension
   */
  public supportsContextExtension(modelId: string): boolean {
    const decision = this.determineModelRouting(modelId, 'context-check');
    const capabilities = this.getModelCapabilities(decision.backendModel);
    return capabilities.supportsContextExtension;
  }

  /**
   * Gets the maximum context length for a model
   */
  public getModelContextLength(modelId: string, extended = false): number {
    const decision = this.determineModelRouting(
      modelId,
      'context-length-check'
    );
    const capabilities = this.getModelCapabilities(decision.backendModel);

    if (extended && capabilities.extendedContextLength) {
      return capabilities.extendedContextLength;
    }

    return capabilities.maxContextLength;
  }

  /**
   * Determines model routing based on configuration
   */
  private determineModelRouting(
    modelId: string,
    correlationId: string
  ): ModelRoutingDecision {
    if (
      !modelId ||
      typeof modelId !== 'string' ||
      modelId.trim().length === 0
    ) {
      throw new ValidationError(
        'Model ID is required for routing',
        correlationId,
        'modelId',
        modelId
      );
    }

    const normalizedModelId = modelId.trim().toLowerCase();

    // Find matching routing entry
    for (const entry of this.routingConfig.entries) {
      // Check if it matches the backend model
      if (entry.backendModel.toLowerCase() === normalizedModelId) {
        return {
          provider: entry.provider,
          requestedModel: modelId,
          backendModel: entry.backendModel,
          isSupported: true,
        };
      }

      // Check if it matches any alias
      for (const alias of entry.aliases) {
        if (alias.toLowerCase() === normalizedModelId) {
          return {
            provider: entry.provider,
            requestedModel: modelId,
            backendModel: entry.backendModel,
            isSupported: true,
          };
        }
      }
    }

    // Model not found in routing configuration
    const availableModels = this.getAvailableModels().map((m) => m.id);
    throw new ValidationError(
      `Unsupported model "${modelId}". Available models: ${availableModels.join(', ')}`,
      correlationId,
      'modelId',
      modelId
    );
  }

  /**
   * Gets model capabilities for a backend model
   */
  private getModelCapabilities(backendModel: string): ModelCapabilities {
    const capabilities = this.modelCapabilitiesMap.get(backendModel);

    if (!capabilities) {
      // Return default capabilities for unknown models
      return {
        maxContextLength: 128000,
        supportsStreaming: true,
        supportsFunctionCalling: false,
        supportsImageInput: false,
        supportsContextExtension: false,
        supportedFormats: ['text'],
      };
    }

    return capabilities;
  }

  /**
   * Initializes model capabilities map
   */
  private initializeModelCapabilities(): Map<string, ModelCapabilities> {
    const capabilitiesMap = new Map<string, ModelCapabilities>();

    // Azure OpenAI Models
    capabilitiesMap.set('gpt-5-codex', {
      maxContextLength: 128000,
      supportsStreaming: true,
      supportsFunctionCalling: true,
      supportsImageInput: false,
      supportsContextExtension: false,
      supportedFormats: ['text', 'code'],
    });

    capabilitiesMap.set('gpt-4o', {
      maxContextLength: 128000,
      supportsStreaming: true,
      supportsFunctionCalling: true,
      supportsImageInput: true,
      supportsContextExtension: false,
      supportedFormats: ['text', 'code', 'image'],
    });

    capabilitiesMap.set('gpt-4o-mini', {
      maxContextLength: 128000,
      supportsStreaming: true,
      supportsFunctionCalling: true,
      supportsImageInput: true,
      supportsContextExtension: false,
      supportedFormats: ['text', 'code', 'image'],
    });

    capabilitiesMap.set('gpt-4-turbo', {
      maxContextLength: 128000,
      supportsStreaming: true,
      supportsFunctionCalling: true,
      supportsImageInput: true,
      supportsContextExtension: false,
      supportedFormats: ['text', 'code', 'image'],
    });

    capabilitiesMap.set('o1-preview', {
      maxContextLength: 128000,
      supportsStreaming: false,
      supportsFunctionCalling: false,
      supportsImageInput: false,
      supportsContextExtension: false,
      supportedFormats: ['text', 'reasoning'],
    });

    capabilitiesMap.set('o1-mini', {
      maxContextLength: 65536,
      supportsStreaming: false,
      supportsFunctionCalling: false,
      supportsImageInput: false,
      supportsContextExtension: false,
      supportedFormats: ['text', 'reasoning', 'code'],
    });

    // AWS Bedrock Models
    capabilitiesMap.set('qwen.qwen3-coder-480b-a35b-v1:0', {
      maxContextLength: 256000,
      extendedContextLength: 1000000,
      supportsStreaming: true,
      supportsFunctionCalling: false,
      supportsImageInput: false,
      supportsContextExtension: true,
      supportedFormats: ['text', 'code'],
    });

    return capabilitiesMap;
  }

  /**
   * Validates request against model capabilities
   */
  private validateRequestCapabilities(
    request: UniversalRequest,
    capabilities: ModelCapabilities,
    correlationId: string
  ): void {
    // Check if streaming is requested but not supported
    if (
      'stream' in request &&
      request.stream &&
      !capabilities.supportsStreaming
    ) {
      throw new ValidationError(
        'Streaming is not supported by this model',
        correlationId,
        'stream',
        request.stream
      );
    }

    // Check if function calling is requested but not supported
    if (
      'tools' in request &&
      request.tools &&
      request.tools.length > 0 &&
      !capabilities.supportsFunctionCalling
    ) {
      throw new ValidationError(
        'Function calling is not supported by this model',
        correlationId,
        'tools',
        request.tools
      );
    }

    // Check for image content if not supported
    if (
      'messages' in request &&
      request.messages &&
      !capabilities.supportsImageInput
    ) {
      for (const message of request.messages) {
        if ('content' in message && Array.isArray(message.content)) {
          for (const content of message.content) {
            if (
              typeof content === 'object' &&
              content !== null &&
              'type' in content &&
              content.type === 'image'
            ) {
              throw new ValidationError(
                'Image input is not supported by this model',
                correlationId,
                'messages',
                'Image content detected'
              );
            }
          }
        }
      }
    }
  }

  /**
   * Gets provider configuration for routing
   */
  private async getProviderConfiguration(
    provider: ModelProvider,
    correlationId: string
  ): Promise<{ endpoint: string; headers: Record<string, string> }> {
    switch (provider) {
      case 'azure':
        if (!config.AZURE_OPENAI_ENDPOINT || !config.AZURE_OPENAI_API_KEY) {
          throw new _InternalServerError(
            'Azure OpenAI configuration is missing',
            correlationId,
            'ModelRoutingService.getProviderConfiguration'
          );
        }

        return {
          endpoint: config.AZURE_OPENAI_ENDPOINT,
          headers: {
            Authorization: `Bearer ${config.AZURE_OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
            'api-key': config.AZURE_OPENAI_API_KEY,
          },
        };

      case 'bedrock':
        if (!isAWSBedrockConfigured(config)) {
          throw new _InternalServerError(
            'AWS Bedrock configuration is missing',
            correlationId,
            'ModelRoutingService.getProviderConfiguration'
          );
        }

        // AWS Bedrock configuration would be handled here
        // For now, return placeholder configuration
        return {
          endpoint: 'https://bedrock-runtime.us-west-2.amazonaws.com',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'AWS4-HMAC-SHA256 ...', // AWS signature would be calculated
          },
        };

      default:
        throw new ValidationError(
          `Unsupported provider: ${provider}`,
          correlationId,
          'provider',
          provider
        );
    }
  }

  /**
   * Creates transformation parameters based on request and capabilities
   */
  private createTransformationParams(
    request: UniversalRequest,
    capabilities: ModelCapabilities
  ): {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    stream?: boolean;
  } {
    const params: {
      maxTokens?: number;
      temperature?: number;
      topP?: number;
      stream?: boolean;
    } = {};

    // Extract common parameters
    if ('max_tokens' in request && request.max_tokens) {
      params.maxTokens = request.max_tokens;
    } else if (
      'max_completion_tokens' in request &&
      request.max_completion_tokens
    ) {
      params.maxTokens = request.max_completion_tokens;
    }

    if ('temperature' in request && request.temperature !== undefined) {
      params.temperature = request.temperature;
    }

    if ('top_p' in request && request.top_p !== undefined) {
      params.topP = request.top_p;
    }

    if ('stream' in request && request.stream !== undefined) {
      params.stream = request.stream && capabilities.supportsStreaming;
    }

    return params;
  }
}

/**
 * Default model routing configuration
 */
const DEFAULT_MODEL_ROUTING_CONFIG: ModelRoutingConfig = {
  defaultProvider: 'azure',
  defaultModel: 'gpt-4o',
  entries: [
    {
      provider: 'azure',
      backendModel: 'gpt-4o',
      aliases: ['gpt-4o', 'gpt-4', 'gpt-4-turbo'],
    },
    {
      provider: 'azure',
      backendModel: 'gpt-5-codex',
      aliases: ['gpt-5-codex'],
    },
    {
      provider: 'azure',
      backendModel: 'gpt-4o-mini',
      aliases: ['gpt-4o-mini'],
    },
    {
      provider: 'azure',
      backendModel: 'o1-preview',
      aliases: ['o1-preview'],
    },
    {
      provider: 'azure',
      backendModel: 'o1-mini',
      aliases: ['o1-mini'],
    },
    {
      provider: 'bedrock',
      backendModel: 'qwen.qwen3-coder-480b-a35b-v1:0',
      aliases: ['qwen-3-coder', 'qwen.qwen3-coder-480b-a35b-v1:0'],
    },
  ],
};

/**
 * Global model routing service instance
 */
let modelRoutingService: ModelRoutingService | null = null;

/**
 * Gets the global model routing service instance
 */
export function getModelRoutingService(): ModelRoutingService {
  if (!modelRoutingService) {
    modelRoutingService = new ModelRoutingService(DEFAULT_MODEL_ROUTING_CONFIG);
  }
  return modelRoutingService;
}

/**
 * Creates a new model routing service with custom configuration
 */
export function createModelRoutingService(
  config: ModelRoutingConfig
): ModelRoutingService {
  return new ModelRoutingService(config);
}
