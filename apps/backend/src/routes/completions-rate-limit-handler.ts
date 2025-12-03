import type { Request, Response } from 'express';
import { logger } from '../middleware/logging';
import type { RequestWithCorrelationId } from '../types/index.js';

/**
 * Shared handler for completions-specific rate limiting so we can test the security behavior
 * without invoking the entire completions stack.
 */
export const completionsRateLimitHandler = (
  req: Readonly<Request>,
  res: Response
): void => {
  const correlationId =
    (req as RequestWithCorrelationId).correlationId || 'unknown';

  logger.warn('Completions rate limit exceeded', correlationId, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    method: req.method,
    url: req.url,
  });

  res.status(429).json({
    error: {
      type: 'rate_limit_exceeded',
      message: 'Too many completion requests, please try again later.',
      correlationId,
      timestamp: new Date().toISOString(),
    },
  });
};
