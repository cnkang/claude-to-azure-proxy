/**
 * Enhanced security middleware with comprehensive protection
 * Builds upon existing security infrastructure with additional protections
 */

import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import {
  AuthenticationError,
  RateLimitError,
  ValidationError,
} from '../errors/index';
import type {
  RequestWithCorrelationId,
  SecurityAuditLog,
} from '../types/index';
import { resolveCorrelationId } from '../utils/correlation-id';
import { normalizeHeaderValue } from '../utils/http-headers';
import { logger } from './logging';

/**
 * Enhanced rate limiting configurations
 */
export const enhancedRateLimitConfigs = {
  // Strict rate limiting for authentication endpoints
  authentication: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Very strict for auth attempts
    message: 'Too many authentication attempts. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  },

  // Rate limiting for completion requests
  completions: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // Allow reasonable usage
    message:
      'Rate limit exceeded for completion requests. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  },

  // Rate limiting for streaming requests
  streaming: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 50, // Lower limit for streaming due to resource usage
    message:
      'Rate limit exceeded for streaming requests. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  },

  // Rate limiting for health checks
  healthCheck: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // Reasonable for monitoring
    message: 'Rate limit exceeded for health check requests.',
    standardHeaders: true,
    legacyHeaders: false,
  },

  // Global rate limiting
  global: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // High limit for global protection
    message: 'Global rate limit exceeded. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  },
} as const;

/**
 * Create enhanced rate limiter with security logging
 */
function createEnhancedRateLimit(
  config: (typeof enhancedRateLimitConfigs)[keyof typeof enhancedRateLimitConfigs],
  name: string
) {
  return rateLimit({
    ...config,
    keyGenerator: (req: Request): string => {
      // Use real client IP from CloudFront headers
      const clientIp = getClientIp(req);
      return clientIp;
    },
    handler: (req: Request, res: Response) => {
      const correlationId = getCorrelationId(req);
      const clientIp = getClientIp(req);
      const userAgent = normalizeHeaderValue(req.headers['user-agent']);

      // Log security event
      logSecurityEvent({
        timestamp: new Date().toISOString(),
        correlationId,
        eventType: 'rate_limit',
        clientInfo: {
          ipAddress: clientIp,
          userAgent,
          clientType: 'unknown',
        },
        details: {
          rateLimitType: name,
          path: req.path,
          method: req.method,
          windowMs: config.windowMs,
          maxRequests: config.max,
        },
      });

      const rateLimitError = new RateLimitError(
        config.message,
        correlationId,
        Math.ceil(config.windowMs / 1000), // Convert to seconds
        req.path
      );

      res.status(429).json({
        error: {
          type: 'rate_limit_error',
          message: rateLimitError.message,
          correlationId,
          retryAfter: rateLimitError.retryAfter,
        },
      });
    },
  });
}

/**
 * Enhanced rate limiters
 */
export const enhancedRateLimiters = {
  authentication: createEnhancedRateLimit(
    enhancedRateLimitConfigs.authentication,
    'authentication'
  ),
  completions: createEnhancedRateLimit(
    enhancedRateLimitConfigs.completions,
    'completions'
  ),
  streaming: createEnhancedRateLimit(
    enhancedRateLimitConfigs.streaming,
    'streaming'
  ),
  healthCheck: createEnhancedRateLimit(
    enhancedRateLimitConfigs.healthCheck,
    'healthCheck'
  ),
  global: createEnhancedRateLimit(enhancedRateLimitConfigs.global, 'global'),
};

/**
 * API key validation middleware with enhanced security
 */
export function enhancedApiKeyValidation(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const correlationId = getCorrelationId(req);
  const clientIp = getClientIp(req);
  const userAgent = normalizeHeaderValue(req.headers['user-agent']);

  try {
    // Extract API key from various sources
    const apiKey = extractApiKey(req);

    if (typeof apiKey !== 'string') {
      logSecurityEvent({
        timestamp: new Date().toISOString(),
        correlationId,
        eventType: 'authentication',
        clientInfo: {
          ipAddress: clientIp,
          userAgent,
          clientType: 'unknown',
        },
        details: {
          result: 'missing_credentials',
          path: req.path,
          method: req.method,
        },
      });

      const authError = new AuthenticationError(
        'API key is required. Provide via Authorization header or x-api-key header.',
        correlationId,
        req.path
      );

      res.status(401).json({
        error: {
          type: 'authentication_error',
          message: authError.message,
          correlationId,
        },
      });
      return;
    }

    // Validate API key format
    if (!isValidApiKeyFormat(apiKey)) {
      logSecurityEvent({
        timestamp: new Date().toISOString(),
        correlationId,
        eventType: 'authentication',
        clientInfo: {
          ipAddress: clientIp,
          userAgent: userAgent ?? undefined,
          clientType: 'unknown' as const,
        },
        details: {
          result: 'invalid_format',
          path: req.path,
          method: req.method,
          keyLength: apiKey.length,
        },
      });

      const authError = new AuthenticationError(
        'Invalid API key format.',
        correlationId,
        req.path
      );

      res.status(401).json({
        error: {
          type: 'authentication_error',
          message: authError.message,
          correlationId,
        },
      });
      return;
    }

    // Store sanitized API key info for logging
    (req as RequestWithCorrelationId & { apiKeyInfo?: unknown }).apiKeyInfo = {
      length: apiKey.length,
      prefix: `${apiKey.substring(0, 8)}...`,
      source: getApiKeySource(req),
    };

    logSecurityEvent({
      timestamp: new Date().toISOString(),
      correlationId,
      eventType: 'authentication',
      clientInfo: {
        ipAddress: clientIp,
        userAgent: userAgent ?? undefined,
        clientType: 'unknown' as const,
      },
      details: {
        result: 'success',
        path: req.path,
        method: req.method,
        keySource: getApiKeySource(req),
      },
    });

    next();
  } catch (error) {
    logger.error('API key validation error', correlationId, {
      path: req.path,
      method: req.method,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    const authError = new AuthenticationError(
      'Authentication failed due to internal error.',
      correlationId,
      req.path
    );

    res.status(401).json({
      error: {
        type: 'authentication_error',
        message: authError.message,
        correlationId,
      },
    });
  }
}

/**
 * Request origin validation middleware
 */
export function validateRequestOrigin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const correlationId = getCorrelationId(req);
  const origin = normalizeHeaderValue(req.headers.origin);
  const referer = normalizeHeaderValue(req.headers.referer);
  const userAgent = normalizeHeaderValue(req.headers['user-agent']);

  // Log request origin for security monitoring
  logger.debug('Request origin validation', correlationId, {
    origin,
    referer,
    userAgent,
    path: req.path,
    method: req.method,
  });

  // Check for suspicious patterns
  if (userAgent !== undefined && isSuspiciousUserAgent(userAgent)) {
    logSecurityEvent({
      timestamp: new Date().toISOString(),
      correlationId,
      eventType: 'suspicious_activity',
      clientInfo: {
        ipAddress: getClientIp(req),
        userAgent,
        clientType: 'unknown',
      },
      details: {
        reason: 'suspicious_user_agent',
        path: req.path,
        method: req.method,
      },
    });

    logger.warn('Suspicious user agent detected', correlationId, {
      userAgent,
      path: req.path,
      method: req.method,
    });
  }

  next();
}

/**
 * Send validation error response
 */
function sendValidationError(
  res: Response,
  validationError: ValidationError,
  correlationId: string
): void {
  res.status(400).json({
    error: {
      type: 'invalid_request_error',
      message: validationError.message,
      correlationId,
    },
  });
}

/**
 * Validate request body is an object
 */
function validateBodyIsObject(
  body: unknown,
  correlationId: string,
  path: string
): ValidationError | null {
  if (typeof body !== 'object' || body === null) {
    return new ValidationError(
      'Request body must be a valid JSON object',
      correlationId,
      'body',
      typeof body,
      true,
      path
    );
  }
  return null;
}

/**
 * Validate object depth
 */
function validateObjectDepth(
  body: object,
  correlationId: string,
  path: string
): ValidationError | null {
  const maxDepth = 10;
  if (getObjectDepth(body) > maxDepth) {
    return new ValidationError(
      `Request body exceeds maximum nesting depth of ${maxDepth}`,
      correlationId,
      'body',
      'nested_object',
      true,
      path
    );
  }
  return null;
}

/**
 * Validate array lengths
 */
function validateArrayLengths(
  body: object,
  correlationId: string,
  path: string
): ValidationError | null {
  const maxArrayLength = 1000;
  if (hasExcessiveArrays(body, maxArrayLength)) {
    return new ValidationError(
      `Request body contains arrays exceeding maximum length of ${maxArrayLength}`,
      correlationId,
      'body',
      'large_array',
      true,
      path
    );
  }
  return null;
}

/**
 * Validate POST request body
 */
function validatePostRequestBody(
  req: Request,
  res: Response,
  correlationId: string
): boolean {
  if (req.method !== 'POST' || req.body === undefined || req.body === null) {
    return true;
  }

  const bodyError = validateBodyIsObject(req.body, correlationId, req.path);
  if (bodyError) {
    sendValidationError(res, bodyError, correlationId);
    return false;
  }

  const depthError = validateObjectDepth(req.body, correlationId, req.path);
  if (depthError) {
    sendValidationError(res, depthError, correlationId);
    return false;
  }

  const arrayError = validateArrayLengths(req.body, correlationId, req.path);
  if (arrayError) {
    sendValidationError(res, arrayError, correlationId);
    return false;
  }

  return true;
}

/**
 * Request integrity validation middleware
 */
export function validateRequestIntegrity(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const correlationId = getCorrelationId(req);

  try {
    if (!validatePostRequestBody(req, res, correlationId)) {
      return;
    }

    next();
  } catch (error) {
    logger.error('Request integrity validation failed', correlationId, {
      path: req.path,
      method: req.method,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    const validationError = new ValidationError(
      'Request integrity validation failed',
      correlationId,
      undefined,
      undefined,
      true,
      req.path
    );

    sendValidationError(res, validationError, correlationId);
  }
}

/**
 * Security headers middleware (enhanced version)
 */
export function enhancedSecurityHeaders(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Enhanced security headers
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'Content-Security-Policy':
      "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; media-src 'none'; child-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  });

  next();
}

/**
 * Helper functions
 */

function getCorrelationId(req: Request): string {
  const candidate = (req as Partial<RequestWithCorrelationId>).correlationId;
  return resolveCorrelationId(candidate, uuidv4);
}

function getClientIp(req: Request): string {
  const cfConnectingIp = normalizeHeaderValue(req.headers['cf-connecting-ip']);
  if (cfConnectingIp !== undefined && cfConnectingIp.trim().length > 0) {
    return cfConnectingIp.trim();
  }

  const xRealIp = normalizeHeaderValue(req.headers['x-real-ip']);
  if (xRealIp !== undefined && xRealIp.trim().length > 0) {
    return xRealIp.trim();
  }

  const xForwardedFor = normalizeHeaderValue(req.headers['x-forwarded-for']);
  if (xForwardedFor !== undefined && xForwardedFor.length > 0) {
    const [firstIp] = xForwardedFor.split(',');
    return firstIp?.trim() ?? 'unknown';
  }

  const fallbackIp = typeof req.ip === 'string' ? req.ip.trim() : '';
  return fallbackIp.length > 0 ? fallbackIp : 'unknown';
}

function extractApiKey(req: Request): string | undefined {
  // Check Authorization header
  const authHeader = normalizeHeaderValue(req.headers.authorization);
  if (authHeader !== undefined) {
    const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader);
    if (bearerMatch?.[1] !== undefined) {
      return bearerMatch[1].trim();
    }
  }

  // Check x-api-key header
  const apiKeyHeader = normalizeHeaderValue(req.headers['x-api-key']);
  if (apiKeyHeader !== undefined) {
    return apiKeyHeader.trim();
  }

  return undefined;
}

function getApiKeySource(req: Request): string {
  if (normalizeHeaderValue(req.headers.authorization) !== undefined) {
    return 'authorization_header';
  }
  if (normalizeHeaderValue(req.headers['x-api-key']) !== undefined) {
    return 'x_api_key_header';
  }
  return 'unknown';
}

function isValidApiKeyFormat(apiKey: string): boolean {
  // Basic format validation
  if (apiKey.length < 16 || apiKey.length > 256) {
    return false;
  }

  // Check for reasonable character set
  if (!/^[a-zA-Z0-9_-]+$/.test(apiKey)) {
    return false;
  }

  return true;
}

function isSuspiciousUserAgent(userAgent: string): boolean {
  const suspiciousPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python/i,
    /java/i,
    /go-http-client/i,
    /^$/,
  ];

  return suspiciousPatterns.some((pattern) => pattern.test(userAgent));
}

function getObjectDepth(obj: unknown, depth = 0): number {
  if (depth > 20) {
    return depth; // Prevent stack overflow
  }

  if (typeof obj !== 'object' || obj === null) {
    return depth;
  }

  if (Array.isArray(obj)) {
    return Math.max(
      depth,
      ...obj.map((item) => getObjectDepth(item, depth + 1))
    );
  }

  const objRecord = obj as Record<string, unknown>;
  const values = Object.values(objRecord);
  if (values.length === 0) {
    return depth;
  }

  return Math.max(
    depth,
    ...values.map((value) => getObjectDepth(value, depth + 1))
  );
}

function hasExcessiveArrays(obj: unknown, maxLength: number): boolean {
  if (Array.isArray(obj)) {
    if (obj.length > maxLength) {
      return true;
    }
    return obj.some((item) => hasExcessiveArrays(item, maxLength));
  }

  if (typeof obj === 'object' && obj !== null) {
    const objRecord = obj as Record<string, unknown>;
    return Object.values(objRecord).some((value) =>
      hasExcessiveArrays(value, maxLength)
    );
  }

  return false;
}

function logSecurityEvent(event: SecurityAuditLog): void {
  logger.warn('Security event', event.correlationId, {
    eventType: event.eventType,
    clientIp: event.clientInfo.ipAddress,
    userAgent: event.clientInfo.userAgent,
    details: event.details,
  });

  // In a production environment, you might want to send this to a
  // dedicated security monitoring system
}

/**
 * Comprehensive security middleware stack
 */
export const securityMiddlewareStack = [
  enhancedSecurityHeaders,
  validateRequestOrigin,
  validateRequestIntegrity,
];

/**
 * Authentication middleware stack
 */
export const authenticationMiddlewareStack = [
  enhancedRateLimiters.authentication,
  enhancedApiKeyValidation,
];
