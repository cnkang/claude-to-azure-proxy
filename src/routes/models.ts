import { Request, Response } from 'express';
import type { RequestWithCorrelationId } from '../types/index.js';
import { logger } from '../middleware/logging.js';

/**
 * Static /v1/models endpoint compatible with Claude API format
 * Returns hardcoded model information (gpt-5-codex) but maintains Claude API compatibility
 */

// Claude API compatible model interface
export interface ClaudeModel {
  readonly id: string;
  readonly object: 'model';
  readonly created: number;
  readonly owned_by: string;
}

// Claude API compatible models list response
export interface ClaudeModelsResponse {
  readonly object: 'list';
  readonly data: readonly ClaudeModel[];
}

// Static models response compatible with Claude API format
const STATIC_MODELS_RESPONSE: ClaudeModelsResponse = {
  object: 'list',
  data: [
    {
      id: 'gpt-5-codex',
      object: 'model',
      created: 1640995200, // Unix timestamp
      owned_by: 'openai',
    },
  ],
} as const;

/**
 * Handler for GET /v1/models endpoint
 * Returns static model information compatible with Claude API format
 * Model name is gpt-5-codex but response format follows Claude API standards
 */
export const modelsHandler = (req: RequestWithCorrelationId, res: Response): void => {
  const { correlationId } = req;

  try {
    logger.info('Models endpoint accessed', correlationId, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Return static models response
    res.status(200).json(STATIC_MODELS_RESPONSE);
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
