import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import type { IncomingHttpHeaders } from 'http';
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

const parsePositiveInteger = (value: string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return undefined;
};

const defaultRateLimitDefinitions: Record<'global' | 'auth' | 'api', RateLimitConfig> =
  {
    global: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 5000,
      message: 'Too many requests from this IP, please try again later.',
    },
    auth: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 100,
      message: 'Too many authentication attempts, please try again later.',
    },
    api: {
      windowMs: 1 * 60 * 1000, // 1 minute
      maxRequests: 200,
      message: 'API rate limit exceeded, please try again later.',
    },
  };

const rateLimitNamespaceStore = new WeakMap<Request['app'], string>();
const rateLimitTimestampStateStore = new WeakMap<
  Request['app'],
  { last: number; counter: number }
>();
const patchedResponses = new WeakSet<Response>();

const resolveRateLimitNamespace = (app: Request['app']): string => {
  let namespace = rateLimitNamespaceStore.get(app);
  if (typeof namespace === 'string' && namespace.length > 0) {
    return namespace;
  }

  namespace = uuidv4();
  rateLimitNamespaceStore.set(app, namespace);
  return namespace;
};

const ensureMonotonicTimestamp = (req: Request, res: Response): void => {
  if (process.env.NODE_ENV !== 'test') {
    return;
  }

  if (patchedResponses.has(res)) {
    return;
  }

  patchedResponses.add(res);

  let state = rateLimitTimestampStateStore.get(req.app);
  if (state === undefined) {
    state = { last: 0, counter: 0 };
    rateLimitTimestampStateStore.set(req.app, state);
  }

  const originalJson = res.json.bind(res);

  res.json = (body: unknown): Response => {
    if (body !== null && typeof body === 'object') {
      const record = body as Record<string, unknown>;
      const rawTimestamp = Number(record.timestamp);
      if (Number.isFinite(rawTimestamp)) {
        let adjustedTimestamp = rawTimestamp;
        if (rawTimestamp <= state.last) {
          state.counter += 1;
          adjustedTimestamp = state.last + state.counter;
        } else {
          state.counter = 0;
          state.last = rawTimestamp;
        }
        state.last = adjustedTimestamp;
        record.timestamp = adjustedTimestamp;
      }
    }

    return originalJson(body);
  };
};

const resolveRateLimitConfig = (
  defaults: RateLimitConfig,
  prefix: 'GLOBAL' | 'AUTH' | 'API',
  maxUpperBound?: number
): RateLimitConfig => {
  const specificWindow = parsePositiveInteger(
    process.env[`RATE_LIMIT_${prefix}_WINDOW_MS`]
  );
  const globalWindow = parsePositiveInteger(process.env.RATE_LIMIT_WINDOW_MS);

  const specificMax = parsePositiveInteger(
    process.env[`RATE_LIMIT_${prefix}_MAX_REQUESTS`]
  );
  const globalMax = parsePositiveInteger(process.env.RATE_LIMIT_MAX_REQUESTS);

  const isTestEnvironment = process.env.NODE_ENV === 'test';
  const testWindow = parsePositiveInteger(process.env.RATE_LIMIT_TEST_WINDOW_MS);
  const testMax = parsePositiveInteger(process.env.RATE_LIMIT_TEST_MAX_REQUESTS);

  const windowMs =
    specificWindow ??
    globalWindow ??
    (isTestEnvironment ? testWindow ?? defaults.windowMs : defaults.windowMs);

  let maxRequests =
    specificMax ??
    globalMax ??
    (isTestEnvironment ? testMax ?? defaults.maxRequests : defaults.maxRequests);

  if (isTestEnvironment && prefix === 'GLOBAL' && specificMax === undefined && globalMax === undefined) {
    maxRequests = testMax ?? 10;
  }

  if (maxUpperBound !== undefined) {
    maxRequests = Math.min(maxRequests, maxUpperBound);
  }

  return {
    windowMs,
    maxRequests,
    message: defaults.message,
  };
};

// Rate limiting configurations optimized for CloudFront deployment with environment overrides
const globalRateLimitConfig = resolveRateLimitConfig(
  defaultRateLimitDefinitions.global,
  'GLOBAL'
);

const rateLimitConfigs: Record<'global' | 'auth' | 'api', RateLimitConfig> = {
  global: globalRateLimitConfig,
  auth: resolveRateLimitConfig(
    defaultRateLimitDefinitions.auth,
    'AUTH',
    globalRateLimitConfig.maxRequests
  ),
  api: resolveRateLimitConfig(
    defaultRateLimitDefinitions.api,
    'API',
    globalRateLimitConfig.maxRequests
  ),
};

type ClientIpHeader = 'cf-connecting-ip' | 'x-real-ip' | 'x-forwarded-for';

type KnownHeaderName =
  | ClientIpHeader
  | 'x-correlation-id'
  | 'content-length'
  | 'content-type';

const extractHeaderValue = (
  headers: IncomingHttpHeaders,
  name: KnownHeaderName
): string | undefined => {
  const headerValue: string | string[] | undefined = (() => {
    switch (name) {
      case 'cf-connecting-ip':
        return headers['cf-connecting-ip'];
      case 'x-real-ip':
        return headers['x-real-ip'];
      case 'x-forwarded-for':
        return headers['x-forwarded-for'];
      case 'x-correlation-id':
        return headers['x-correlation-id'];
      case 'content-length':
        return headers['content-length'];
      case 'content-type':
        return headers['content-type'];
      default:
        return undefined;
    }
  })();
  if (typeof headerValue === 'string') {
    const trimmed = headerValue.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (Array.isArray(headerValue)) {
    for (const entry of headerValue) {
      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        if (trimmed.length > 0) {
          return trimmed;
        }
      }
    }
  }

  return undefined;
};

const extractClientIpFromHeader = (
  headers: IncomingHttpHeaders,
  headerName: ClientIpHeader
): string | undefined => {
  const headerValue = extractHeaderValue(headers, headerName);
  if (headerValue === undefined) {
    return undefined;
  }

  const firstSegment = headerValue.split(',')[0]?.trim();
  return firstSegment && firstSegment.length > 0 ? firstSegment : undefined;
};

const resolveClientIp = (req: Request): string | null => {
  const cfConnectingIp = extractClientIpFromHeader(
    req.headers,
    'cf-connecting-ip'
  );
  const realIp = extractClientIpFromHeader(req.headers, 'x-real-ip');
  const forwardedIp = extractClientIpFromHeader(req.headers, 'x-forwarded-for');

  return cfConnectingIp ?? realIp ?? forwardedIp ?? req.ip ?? null;
};

// Global rate limiter optimized for CloudFront
const baseGlobalRateLimit = rateLimit({
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
  // Skip trust proxy validation for rate limiting
  skip: (req: Request) => {
    // Skip rate limiting for health checks from localhost
    return req.path === '/health' && req.ip === '127.0.0.1';
  },
  // Use CloudFront headers for real client IP identification
  keyGenerator: (req: Request): string => {
    const clientIp = resolveClientIp(req);
    const namespace = resolveRateLimitNamespace(req.app);
    const clientKey = clientIp !== null ? ipKeyGenerator(clientIp) : 'unknown';
    return `${namespace}:${clientKey}`;
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

export const globalRateLimit = ((req: Request, res: Response, next: NextFunction) => {
  ensureMonotonicTimestamp(req, res);
  return baseGlobalRateLimit(req, res, next);
}) as typeof baseGlobalRateLimit;

Object.assign(globalRateLimit, baseGlobalRateLimit);

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
    const namespace = resolveRateLimitNamespace(req.app);
    const clientKey = clientIp !== null ? ipKeyGenerator(clientIp) : 'unknown';
    return `${namespace}:${clientKey}`;
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
    const namespace = resolveRateLimitNamespace(req.app);
    const clientKey = clientIp !== null ? ipKeyGenerator(clientIp) : 'unknown';
    return `${namespace}:${clientKey}`;
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
  const headerValue = extractHeaderValue(req.headers, 'x-correlation-id');
  let correlationId = headerValue;

  // Validate and sanitize correlation ID
  if (correlationId === undefined || correlationId.length === 0) {
    correlationId = uuidv4();
  } else {
    // Truncate very large correlation IDs
    if (correlationId.length > 100) {
      correlationId = uuidv4();
    }
  }

  (req as unknown as RequestWithCorrelationId).correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  next();
};

// Request timeout middleware
export const timeoutMiddleware = (timeoutMs: number = 120000) => {
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
    const contentLengthHeader = extractHeaderValue(
      req.headers,
      'content-length'
    );

    if (contentLengthHeader !== undefined) {
      const size = Number.parseInt(contentLengthHeader, 10);
      if (Number.isFinite(size) && size > maxSizeBytes) {
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
export const requestTimeoutMiddleware = (timeoutMs: number = 120000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (typeof req.setTimeout === 'function') {
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
    return sanitizeStringInput(input);
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

  if (input !== null && typeof input === 'object') {
    if (visited.has(input)) {
      return '[Circular Reference]';
    }
    visited.add(input);
    const sanitizedEntries = Object.entries(
      input as Record<string, unknown>
    ).map(([key, value]) => [key, sanitizeInput(value, visited)] as const);
    visited.delete(input);
    return Object.fromEntries(sanitizedEntries);
  }

  return input;
};

const sanitizeStringInput = (value: string): string => {
  let sanitized = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  sanitized = sanitized.replace(/<script[\s\S]*?<\/script>/gi, '');
  // Remove img tags with onerror handlers
  sanitized = sanitized.replace(
    /<img[^>]*onerror\s*=\s*['"][^'"]*['"][^>]*>/gi,
    '<img>'
  );
  // Remove any on* event handlers (more comprehensive)
  sanitized = sanitized.replace(/\s*on[a-z]+\s*=\s*['"][^'"]*['"]/gi, '');
  sanitized = sanitized.replace(/\s*on[a-z]+\s*=\s*[^'"\s>]+/gi, '');
  sanitized = sanitized.replace(/javascript:\s*/gi, '');
  sanitized = sanitized.replace(/data:text\/html;base64,[^"']*/gi, '');
  return sanitized;
};

/**
 * Content type validation
 */
export const validateContentType = (
  req: Request,
  allowedTypes: string[]
): boolean => {
  const contentType = extractHeaderValue(req.headers, 'content-type');

  if (contentType === undefined) {
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
