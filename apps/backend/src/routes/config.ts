/**
 * Configuration Route Handler
 *
 * Provides client configuration including file upload settings,
 * available models, and feature flags.
 *
 * Requirements: 4.1, 4.2, 2.1, 2.2
 */

import type { Request, Response } from 'express';
import { logger } from '../middleware/logging.js';
import type { RequestWithCorrelationId } from '../types/index.js';

/**
 * Client configuration interface
 */
export interface ClientConfig {
  readonly maxFileSize: number;
  readonly supportedFileTypes: string[];
  readonly availableModels: ModelInfo[];
  readonly features: FeatureFlags;
  readonly maxConversations: number;
  readonly maxMessagesPerConversation: number;
  readonly defaultModel: string;
  readonly modelCategories: {
    readonly general: string[];
    readonly coding: string[];
    readonly reasoning: string[];
  };
}

/**
 * Model information interface
 */
export interface ModelInfo {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly provider: 'azure' | 'aws';
  readonly contextLength: number;
  readonly capabilities: string[];
  readonly category: 'general' | 'coding' | 'reasoning';
}

/**
 * Feature flags interface
 */
export interface FeatureFlags {
  readonly fileUpload: boolean;
  readonly imageUpload: boolean;
  readonly streamingResponses: boolean;
  readonly codeHighlighting: boolean;
  readonly conversationExport: boolean;
  readonly contextExtension: boolean;
  readonly multipleConversations: boolean;
}

/**
 * File upload configuration from upload route
 */
const FILE_UPLOAD_CONFIG = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  supportedFileTypes: [
    // Text files
    '.txt',
    '.md',
    '.json',
    '.xml',
    '.csv',
    '.yaml',
    '.yml',
    // Code files
    '.js',
    '.ts',
    '.jsx',
    '.tsx',
    '.py',
    '.java',
    '.cpp',
    '.c',
    '.h',
    '.css',
    '.html',
    '.php',
    '.rb',
    '.go',
    '.rs',
    '.swift',
    '.kt',
    '.scala',
    '.clj',
    '.hs',
    '.ml',
    '.r',
    '.sql',
    '.sh',
    '.bat',
    // Image files
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.svg',
  ],
};

/**
 * Available models configuration
 */
const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'Most capable model for complex reasoning and analysis',
    provider: 'azure',
    contextLength: 128000,
    capabilities: ['text', 'images', 'code', 'reasoning'],
    category: 'general',
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Fast and efficient model for everyday tasks',
    provider: 'azure',
    contextLength: 128000,
    capabilities: ['text', 'images', 'code'],
    category: 'general',
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    description: 'Advanced model with large context window',
    provider: 'azure',
    contextLength: 128000,
    capabilities: ['text', 'images', 'code', 'reasoning'],
    category: 'general',
  },
  {
    id: 'o1-preview',
    name: 'o1 Preview',
    description: 'Advanced reasoning model for complex problems',
    provider: 'azure',
    contextLength: 128000,
    capabilities: ['text', 'reasoning', 'mathematics'],
    category: 'reasoning',
  },
  {
    id: 'o1-mini',
    name: 'o1 Mini',
    description: 'Efficient reasoning model for coding and math',
    provider: 'azure',
    contextLength: 65536,
    capabilities: ['text', 'reasoning', 'code', 'mathematics'],
    category: 'reasoning',
  },
];

/**
 * Feature flags configuration
 */
const FEATURE_FLAGS: FeatureFlags = {
  fileUpload: true,
  imageUpload: true,
  streamingResponses: true,
  codeHighlighting: true,
  conversationExport: true,
  contextExtension: true,
  multipleConversations: true,
};

/**
 * Model categories configuration
 */
const MODEL_CATEGORIES = {
  general: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  coding: ['gpt-4o', 'o1-mini', 'gpt-4-turbo'],
  reasoning: ['o1-preview', 'o1-mini', 'gpt-4o'],
};

/**
 * Get client configuration endpoint
 */
export async function getClientConfig(
  req: Request,
  res: Response
): Promise<void> {
  const correlationId = (req as RequestWithCorrelationId).correlationId;

  try {
    logger.info('Serving client configuration', correlationId);

    const config: ClientConfig = {
      maxFileSize: FILE_UPLOAD_CONFIG.maxFileSize,
      supportedFileTypes: FILE_UPLOAD_CONFIG.supportedFileTypes,
      availableModels: AVAILABLE_MODELS,
      features: FEATURE_FLAGS,
      maxConversations: 100,
      maxMessagesPerConversation: 1000,
      defaultModel: 'gpt-4o-mini',
      modelCategories: MODEL_CATEGORIES,
    };

    res.json({
      config,
      correlationId,
    });
  } catch (error) {
    logger.error('Failed to get client configuration', correlationId, {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      error: {
        type: 'config_error',
        message: 'Failed to retrieve configuration',
        correlationId,
      },
    });
  }
}
