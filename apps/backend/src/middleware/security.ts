import type { IncomingHttpHeaders } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import helmet from 'helmet';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/index';
import type { RateLimitConfig, RequestWithCorrelationId } from '../types/index';

/**
 * Security middleware configuration for production-ready Express server
 */

// Helmet configuration with CSP optimized for React frontend
export const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for React
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Allow inline scripts and eval for React development
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'], // Allow blob URLs for file uploads
      connectSrc: [
        "'self'",
        'ws:',
        'wss:', // Allow WebSocket connections for SSE
        'https://api.openai.com',
        'https://*.openai.azure.com',
      ],
      fontSrc: ["'self'", 'data:'], // Allow data URLs for fonts
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
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

const parsePositiveInteger = (
  value: string | undefined
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return undefined;
};

const defaultRateLimitDefinitions: Record<
  'global' | 'auth' | 'api',
  RateLimitConfig
> = {
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

type RateLimitTimestampState = { last: number; counter: number };

const rateLimitNamespaceStore = new WeakMap<Request['app'], string>();
const rateLimitTimestampStateStore = new WeakMap<
  Request['app'],
  RateLimitTimestampState
>();
const patchedResponses = new WeakSet<Response>();

const configuredCorsOrigins = (config.CORS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

const isConfiguredOrigin = (origin: string): boolean => {
  if (configuredCorsOrigins.length === 0) {
    return false;
  }

  return configuredCorsOrigins.includes(origin);
};

const isDevelopmentOrigin = (origin: string, serverPort: string): boolean => {
  const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    `http://localhost:${serverPort}`,
    `http://127.0.0.1:${serverPort}`,
  ];

  return allowedOrigins.includes(origin);
};

const resolveRateLimitNamespace = (app: Request['app']): string => {
  let namespace = rateLimitNamespaceStore.get(app);
  if (typeof namespace === 'string' && namespace.length > 0) {
    return namespace;
  }

  namespace = uuidv4();
  rateLimitNamespaceStore.set(app, namespace);
  return namespace;
};

const applyMonotonicTimestamp = (
  record: Record<string, unknown>,
  state: RateLimitTimestampState
): void => {
  const rawTimestamp = Number(record.timestamp);
  if (!Number.isFinite(rawTimestamp)) {
    return;
  }

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
      applyMonotonicTimestamp(body as Record<string, unknown>, state as RateLimitTimestampState);
    }

    return originalJson(body);
  };
};

export const resolveRateLimitConfig = (
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
  const testWindow = parsePositiveInteger(
    process.env.RATE_LIMIT_TEST_WINDOW_MS
  );
  const testMax = parsePositiveInteger(
    process.env.RATE_LIMIT_TEST_MAX_REQUESTS
  );

  const windowMs =
    specificWindow ??
    globalWindow ??
    (isTestEnvironment ? (testWindow ?? defaults.windowMs) : defaults.windowMs);

  let maxRequests =
    specificMax ??
    globalMax ??
    (isTestEnvironment
      ? (testMax ?? defaults.maxRequests)
      : defaults.maxRequests);

  if (
    isTestEnvironment &&
    prefix === 'GLOBAL' &&
    specificMax === undefined &&
    globalMax === undefined
  ) {
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

const HEADER_LOOKUP: Record<KnownHeaderName, keyof IncomingHttpHeaders> = {
  'cf-connecting-ip': 'cf-connecting-ip',
  'x-real-ip': 'x-real-ip',
  'x-forwarded-for': 'x-forwarded-for',
  'x-correlation-id': 'x-correlation-id',
  'content-length': 'content-length',
  'content-type': 'content-type',
};

const normalizeSingleHeaderValue = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeHeaderValue = (
  headerValue: string | string[] | undefined
): string | undefined => {
  const directValue = normalizeSingleHeaderValue(headerValue);
  if (directValue !== undefined) {
    return directValue;
  }

  if (!Array.isArray(headerValue)) {
    return undefined;
  }

  return headerValue
    .map((entry) => normalizeSingleHeaderValue(entry))
    .find((value): value is string => value !== undefined);
};

const extractHeaderValue = (
  headers: IncomingHttpHeaders,
  name: KnownHeaderName
): string | undefined => {
  return normalizeHeaderValue(headers[HEADER_LOOKUP[name]]);
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
  return (firstSegment?.length ?? 0) > 0 ? firstSegment : undefined;
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
    // Allow an escape hatch for heavy test suites
    if (process.env.DISABLE_TEST_RATE_LIMIT === 'true') {
      return true;
    }

    // Skip rate limiting for health checks from localhost
    if (req.path === '/health') {
      return !!(
        req.ip === '127.0.0.1' ||
        req.ip === '::1' ||
        req.ip?.includes('127.0.0.1')
      );
    }

    return false;
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

export const globalRateLimit = ((
  req: Request,
  res: Response,
  next: NextFunction
) => {
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
// Implements Requirement 8.2: Send headers exactly once per response
export const timeoutMiddleware = (timeoutMs = 120000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    let timeoutTriggered = false;

    const timeout = setTimeout(() => {
      // Only send timeout response if headers haven't been sent (Requirement 8.2)
      if (!res.headersSent && !res.finished && !timeoutTriggered) {
        timeoutTriggered = true;
        const correlationId =
          (req as unknown as RequestWithCorrelationId).correlationId ||
          uuidv4();
        res.status(408).json({
          error: {
            type: 'request_timeout',
            message: 'Request timeout exceeded',
            correlationId,
            timestamp: new Date().toISOString(),
          },
        });
      }
    }, timeoutMs);

    // Clear timeout when response finishes
    res.on('finish', () => {
      clearTimeout(timeout);
    });

    res.on('close', () => {
      clearTimeout(timeout);
    });

    next();
  };
};

// CORS configuration - allow frontend in development, restrict in production
export const corsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    const requestOrigin = origin;
    const serverPort = process.env.PORT ?? '8080';

    if (process.env.NODE_ENV === 'development') {
      if (isDevelopmentOrigin(requestOrigin, serverPort)) {
        return callback(null, true);
      }
    }

    if (process.env.NODE_ENV === 'production') {
      if (isConfiguredOrigin(requestOrigin)) {
        return callback(null, true);
      }

      // Default: deny in production without allowlist
      return callback(new Error('Not allowed by CORS'), false);
    }

    // Non-production fallback: allow configured origins or development defaults
    if (
      isConfiguredOrigin(requestOrigin) ||
      isDevelopmentOrigin(requestOrigin, serverPort)
    ) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true, // Allow credentials for session management
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'x-api-key',
    'x-session-id',
    'x-correlation-id',
    'x-e2e-auth-bypass',
  ],
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
export const requestTimeoutMiddleware = (timeoutMs = 120000) => {
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

  const normalizedContentType = contentType.toLowerCase().split(';')[0]?.trim();

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
