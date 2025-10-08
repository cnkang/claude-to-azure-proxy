import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type {
  RateLimitConfig,
  RequestWithCorrelationId,
} from '../types/index.js';

/**
 * Security middleware configuration for production-ready Express server
 */

// Helmet configuration with strict Content Security Policy
export const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: [
        "'self'",
        'https://api.openai.com',
        'https://*.openai.azure.com',
      ],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  dnsPrefetchControl: true,
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: false,
  referrerPolicy: { policy: 'no-referrer' },
  xssFilter: true,
});

// Rate limiting configurations optimized for CloudFront deployment
const rateLimitConfigs: Record<string, RateLimitConfig> = {
  global: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5000, // Higher limit as CloudFront will aggregate requests
    message: 'Too many requests from this IP, please try again later.',
  },
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100, // More lenient for legitimate auth attempts through CloudFront
    message: 'Too many authentication attempts, please try again later.',
  },
  api: {
    windowMs: 1 * 60 * 1000, // 1 minute
    maxRequests: 200, // Higher limit for API calls through CloudFront
    message: 'API rate limit exceeded, please try again later.',
  },
};

const resolveClientIp = (req: Request): string | null => {
  const cfConnectingIp = req.headers['cf-connecting-ip'] as string | undefined;
  const realIp = req.headers['x-real-ip'] as string | undefined;
  const xForwardedFor = req.headers['x-forwarded-for'] as string | undefined;
  const firstForwardedIp = xForwardedFor?.split(',')[0]?.trim();

  return cfConnectingIp || realIp || firstForwardedIp || req.ip || null;
};

// Global rate limiter optimized for CloudFront
export const globalRateLimit = rateLimit({
  windowMs: rateLimitConfigs.global.windowMs,
  max: rateLimitConfigs.global.maxRequests,
  message: {
    error: {
      type: 'rate_limit_exceeded',
      message: rateLimitConfigs.global.message,
      correlationId: '',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use CloudFront headers for real client IP identification
  keyGenerator: (req: Request): string => {
    const clientIp = resolveClientIp(req);
    return clientIp ? ipKeyGenerator(clientIp) : 'unknown';
  },
  handler: (req: Request, res: Response) => {
    const correlationId =
      (req as unknown as RequestWithCorrelationId).correlationId || uuidv4();
    res.status(429).json({
      error: {
        type: 'rate_limit_exceeded',
        message: rateLimitConfigs.global.message,
        correlationId,
      },
    });
  },
});

// Authentication rate limiter optimized for CloudFront
export const authRateLimit = rateLimit({
  windowMs: rateLimitConfigs.auth.windowMs,
  max: rateLimitConfigs.auth.maxRequests,
  message: {
    error: {
      type: 'auth_rate_limit_exceeded',
      message: rateLimitConfigs.auth.message,
      correlationId: '',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    const clientIp = resolveClientIp(req);
    return clientIp ? ipKeyGenerator(clientIp) : 'unknown';
  },
  handler: (req: Request, res: Response) => {
    const correlationId =
      (req as unknown as RequestWithCorrelationId).correlationId || uuidv4();
    res.status(429).json({
      error: {
        type: 'auth_rate_limit_exceeded',
        message: rateLimitConfigs.auth.message,
        correlationId,
      },
    });
  },
});

// API rate limiter optimized for CloudFront
export const apiRateLimit = rateLimit({
  windowMs: rateLimitConfigs.api.windowMs,
  max: rateLimitConfigs.api.maxRequests,
  message: {
    error: {
      type: 'api_rate_limit_exceeded',
      message: rateLimitConfigs.api.message,
      correlationId: '',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    const clientIp = resolveClientIp(req);
    return clientIp ? ipKeyGenerator(clientIp) : 'unknown';
  },
  handler: (req: Request, res: Response) => {
    const correlationId =
      (req as unknown as RequestWithCorrelationId).correlationId || uuidv4();
    res.status(429).json({
      error: {
        type: 'api_rate_limit_exceeded',
        message: rateLimitConfigs.api.message,
        correlationId,
      },
    });
  },
});

// Correlation ID middleware
export const correlationIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let correlationId = req.headers['x-correlation-id'];

  // Handle array headers (take first value)
  if (Array.isArray(correlationId)) {
    correlationId = correlationId[0];
  }

  // Validate and sanitize correlation ID
  if (
    !correlationId ||
    typeof correlationId !== 'string' ||
    correlationId.trim() === ''
  ) {
    correlationId = uuidv4();
  } else {
    // Truncate very large correlation IDs
    correlationId = correlationId.trim();
    if (correlationId.length > 100) {
      correlationId = uuidv4();
    }
  }

  (req as unknown as RequestWithCorrelationId).correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  next();
};

// Request timeout middleware
export const timeoutMiddleware = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        const correlationId =
          (req as unknown as RequestWithCorrelationId).correlationId ||
          uuidv4();
        res.status(408).json({
          error: {
            type: 'request_timeout',
            message: 'Request timeout exceeded',
            correlationId,
          },
        });
      }
    }, timeoutMs);

    res.on('finish', () => {
      clearTimeout(timeout);
    });

    res.on('close', () => {
      clearTimeout(timeout);
    });

    next();
  };
};

// CORS configuration
export const corsOptions = {
  origin: false, // Disable CORS for security - API should be accessed directly
  credentials: false,
  optionsSuccessStatus: 200,
};

/**
 * Security headers middleware
 */
export const securityHeadersMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Set security headers
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('X-XSS-Protection', '1; mode=block');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  );
  res.set(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; media-src 'none'; child-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );

  next();
};

/**
 * Request size middleware
 */
export const requestSizeMiddleware = (
  maxSizeBytes: number = 10 * 1024 * 1024
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = req.headers['content-length'];

    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (!isNaN(size) && size > maxSizeBytes) {
        const correlationId =
          (req as unknown as RequestWithCorrelationId).correlationId ||
          'unknown';
        res.status(413).json({
          error: {
            type: 'request_too_large',
            message: `Request size exceeds maximum allowed size of ${maxSizeBytes} bytes`,
            correlationId,
          },
        });
        return;
      }
    }

    next();
  };
};

/**
 * Request timeout middleware
 */
export const requestTimeoutMiddleware = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.setTimeout) {
      req.setTimeout(timeoutMs, () => {
        const correlationId =
          (req as unknown as RequestWithCorrelationId).correlationId ||
          'unknown';
        if (!res.headersSent) {
          res.status(408).json({
            error: {
              type: 'request_timeout',
              message: `Request timed out after ${timeoutMs}ms`,
              correlationId,
            },
          });
        }
      });
    }

    next();
  };
};

/**
 * Input sanitization function with circular reference protection
 */
export const sanitizeInput = (
  input: unknown,
  visited = new WeakSet()
): unknown => {
  if (typeof input === 'string') {
    return (
      input
        // Remove control characters except newlines and tabs
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        // Remove script tags
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        // Remove img tags with event handlers
        .replace(/<img[^>]*onerror[^>]*>/gi, '')
        // Remove event handlers
        .replace(/\son\w+\s*=/gi, '')
        // Remove javascript: protocols
        .replace(/javascript:/gi, '')
        // Remove data URLs with base64
        .replace(/data:text\/html;base64,[^"']*/gi, '')
    );
  }

  if (Array.isArray(input)) {
    if (visited.has(input)) {
      return '[Circular Reference]';
    }
    visited.add(input);
    const result = input.map((item) => sanitizeInput(item, visited));
    visited.delete(input);
    return result;
  }

  if (input && typeof input === 'object') {
    if (visited.has(input)) {
      return '[Circular Reference]';
    }
    visited.add(input);
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeInput(value, visited);
    }
    visited.delete(input);
    return sanitized;
  }

  return input;
};

/**
 * Content type validation
 */
export const validateContentType = (
  req: Request,
  allowedTypes: string[]
): boolean => {
  const contentType = req.headers['content-type'];

  if (!contentType) {
    return false;
  }

  const normalizedContentType = contentType.toLowerCase().split(';')[0].trim();

  return allowedTypes.some(
    (type) => normalizedContentType === type.toLowerCase()
  );
};

/**
 * Rate limit configuration export
 */
export const rateLimitConfig = {
  global: rateLimitConfigs.global,
  perIP: rateLimitConfigs.auth,
  completions: rateLimitConfigs.api,
};
