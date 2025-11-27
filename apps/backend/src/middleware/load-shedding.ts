/**
 * Load shedding middleware for graceful degradation under high load
 * Implements Requirement 8.4: Graceful degradation under load
 */

import type { Request, Response, NextFunction } from 'express';
import type { RequestWithCorrelationId } from '../types/index.js';
import { logger } from './logging.js';
import loadedConfig from '../config/index.js';

/**
 * Active request counter
 */
let activeRequests = 0;

/**
 * Maximum concurrent requests (configurable via environment)
 */
const MAX_CONCURRENT_REQUESTS = loadedConfig.HTTP_MAX_CONNECTIONS || 1000;

/**
 * Get current active request count
 */
export function getActiveRequestCount(): number {
  return activeRequests;
}

/**
 * Increment active request counter
 */
function incrementActiveRequests(): void {
  activeRequests++;
}

/**
 * Decrement active request counter
 */
function decrementActiveRequests(): void {
  activeRequests = Math.max(0, activeRequests - 1);
}

/**
 * Load shedding middleware that implements graceful degradation under high load.
 * 
 * When the server is overloaded (too many concurrent requests), this middleware
 * returns a 503 Service Unavailable response with a Retry-After header, allowing
 * clients to back off and retry later.
 * 
 * This prevents the server from becoming completely unresponsive under load.
 * 
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 * 
 * @example
 * ```typescript
 * app.use(loadShedding);
 * ```
 */
export function loadShedding(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { correlationId } = req as RequestWithCorrelationId;
  
  // Check if server is overloaded (Requirement 8.4)
  if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    logger.warn('Load shedding activated - server overloaded', correlationId, {
      activeRequests,
      maxRequests: MAX_CONCURRENT_REQUESTS,
      url: req.url,
      method: req.method,
    });
    
    // Return 503 Service Unavailable with Retry-After header (Requirement 8.4)
    res.status(503)
      .set('Retry-After', '5') // Retry after 5 seconds
      .json({
        error: {
          type: 'service_unavailable',
          message: 'Service temporarily unavailable due to high load',
          correlationId,
          retryAfter: 5,
          timestamp: new Date().toISOString(),
        },
      });
    return;
  }
  
  // Increment active request count
  incrementActiveRequests();
  
  // Decrement on response finish
  res.on('finish', () => {
    decrementActiveRequests();
  });
  
  // Decrement on response close (connection closed before finish)
  res.on('close', () => {
    decrementActiveRequests();
  });
  
  next();
}

/**
 * Reset active request counter (for testing)
 */
export function resetActiveRequestCount(): void {
  activeRequests = 0;
}
