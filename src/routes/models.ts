import { Response } from 'express';
import type { RequestWithCorrelationId } from '../types/index.js';
import { logger } from '../middleware/logging.js';
import config, { isAWSBedrockConfigured } from '../config/index.js';

/**
 * Static /v1/models endpoint compatible with Claude API format
 * Returns hardcoded model information (gpt-5-codex) but maintains Claude API compatibility
 */

// Claude API compatible model interface with provider metadata
export interface ClaudeModel {
  readonly id: string;
  readonly object: 'model';
  readonly created: number;
  readonly owned_by: string;
  readonly provider?: 'azure' | 'bedrock'; // New field for service identification
}

// Claude API compatible models list response
export interface ClaudeModelsResponse {
  readonly object: 'list';
  readonly data: readonly ClaudeModel[];
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
 * Handler for GET /v1/models endpoint
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
