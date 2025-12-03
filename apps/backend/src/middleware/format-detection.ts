/**
 * Format detection middleware for identifying Claude vs OpenAI request formats
 * Adds format information to request object for downstream processing
 */

import type { NextFunction, Request, Response } from 'express';
import type {
  IncomingRequest,
  RequestFormat,
  RequestWithCorrelationId,
  ResponseFormat,
} from '../types/index';
import {
  detectRequestFormat,
  getResponseFormat,
} from '../utils/format-detection';
import { logger } from './logging';

/**
 * Extended request interface with format detection information
 */
export interface RequestWithFormat extends RequestWithCorrelationId {
  readonly requestFormat: RequestFormat;
  readonly responseFormat: ResponseFormat;
  readonly formatDetectionTime: number;
}

/**
 * Format detection middleware that analyzes incoming requests
 * and determines the appropriate request/response format
 */
export const formatDetectionMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();
  const correlationId =
    (req as RequestWithCorrelationId).correlationId || 'unknown';

  try {
    // Create incoming request object for format detection
    const incomingRequest: IncomingRequest = {
      headers: req.headers as Record<string, string>,
      body: req.body,
      path: req.path,
      userAgent: req.headers['user-agent'] ?? undefined,
    };

    // Detect request format
    const requestFormat = detectRequestFormat(incomingRequest);
    const responseFormat = getResponseFormat(requestFormat);
    const formatDetectionTime = Date.now() - startTime;

    // Add format information to request object
    const requestWithFormat = req as unknown as RequestWithFormat;
    (requestWithFormat as { requestFormat: RequestFormat }).requestFormat =
      requestFormat;
    (requestWithFormat as { responseFormat: ResponseFormat }).responseFormat =
      responseFormat;
    (requestWithFormat as { formatDetectionTime: number }).formatDetectionTime =
      formatDetectionTime;

    logger.debug('Request format detected', correlationId, {
      requestFormat,
      responseFormat,
      formatDetectionTime,
      path: req.path,
      method: req.method,
    });

    next();
  } catch (error) {
    const formatDetectionTime = Date.now() - startTime;

    logger.error('Format detection failed', correlationId, {
      error: error instanceof Error ? error.message : 'Unknown error',
      formatDetectionTime,
      path: req.path,
      method: req.method,
    });

    // Default to Claude format on error for backward compatibility
    const requestWithFormat = req as unknown as RequestWithFormat;
    (requestWithFormat as { requestFormat: RequestFormat }).requestFormat =
      'claude';
    (requestWithFormat as { responseFormat: ResponseFormat }).responseFormat =
      'claude';
    (requestWithFormat as { formatDetectionTime: number }).formatDetectionTime =
      formatDetectionTime;

    next();
  }
};

/**
 * Type guard to check if request has format detection information
 */
export function hasFormatDetection(req: Request): req is RequestWithFormat {
  const requestWithFormat = req as RequestWithFormat;
  return (
    typeof requestWithFormat.requestFormat === 'string' &&
    typeof requestWithFormat.responseFormat === 'string' &&
    typeof requestWithFormat.formatDetectionTime === 'number'
  );
}
