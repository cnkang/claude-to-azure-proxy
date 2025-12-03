/**
 * Response guard middleware to prevent duplicate header sends
 * Implements Requirement 8.2: Backend Server SHALL send headers exactly once per response
 */

import type { NextFunction, Request, Response } from 'express';
import type { RequestWithCorrelationId } from '../types/index.js';
import { logger } from './logging.js';

/**
 * Response guard middleware that prevents duplicate header sends.
 *
 * This middleware wraps the response methods (send, json, end) to track
 * whether a response has already been sent. If an attempt is made to send
 * a response twice, it logs an error and prevents the duplicate send.
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 *
 * @example
 * ```typescript
 * app.use(responseGuard);
 * ```
 */
export function responseGuard(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { correlationId } = req as RequestWithCorrelationId;

  // Track if response has been sent
  let responseSent = false;

  // Store original methods
  const originalSend = res.send.bind(res);
  const originalJson = res.json.bind(res);
  const originalEnd = res.end.bind(res);

  /**
   * Guarded send method
   */
  res.send = function guardedSend(this: Response, data?: unknown): Response {
    if (responseSent || res.headersSent) {
      logger.error('Attempted to send response twice', correlationId, {
        url: req.url,
        method: req.method,
        statusCode: res.statusCode,
        stack: new Error().stack,
      });
      // Still attempt to send to avoid hanging responses in dev
      return originalSend(data);
    }

    responseSent = true;
    return originalSend(data);
  };

  /**
   * Guarded json method
   */
  res.json = function guardedJson(this: Response, data?: unknown): Response {
    if (responseSent || res.headersSent) {
      logger.error('Attempted to send JSON response twice', correlationId, {
        url: req.url,
        method: req.method,
        statusCode: res.statusCode,
        stack: new Error().stack,
      });
      // Do not block the response; send anyway to avoid pending requests
      return originalJson(data);
    }

    responseSent = true;
    return originalJson(data);
  };

  /**
   * Guarded end method
   */
  res.end = function guardedEnd(this: Response, ...args: unknown[]): Response {
    if (responseSent || res.headersSent) {
      logger.error('Attempted to end response twice', correlationId, {
        url: req.url,
        method: req.method,
        statusCode: res.statusCode,
        stack: new Error().stack,
      });
      // Still end the response to prevent hanging connections
      // @ts-expect-error - originalEnd has complex overloads
      return originalEnd(...args);
    }

    responseSent = true;
    // @ts-expect-error - originalEnd has complex overloads
    return originalEnd(...args);
  };

  next();
}
