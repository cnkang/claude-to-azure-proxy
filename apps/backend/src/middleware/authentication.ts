import { timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import config from '../config/index';
import type { Mutable, RequestWithCorrelationId } from '../types/index';
import { resolveCorrelationId } from '../utils/correlation-id';
import { normalizeHeaderValue } from '../utils/http-headers';
import { logger } from './logging';

/**
 * Authentication middleware with TypeScript types and security best practices
 */

// TypeScript enums for authentication result types
export enum AuthenticationResult {
  SUCCESS = 'success',
  MISSING_CREDENTIALS = 'missing_credentials',
  INVALID_CREDENTIALS = 'invalid_credentials',
  RATE_LIMITED = 'rate_limited',
}

export enum AuthenticationMethod {
  BEARER_TOKEN = 'bearer_token',
  API_KEY_HEADER = 'api_key_header',
}

// TypeScript interfaces for authentication request/response types
export interface AuthenticationRequest extends RequestWithCorrelationId {
  authMethod?: AuthenticationMethod;
  authResult?: AuthenticationResult;
}

export interface AuthenticationError {
  readonly type: string;
  readonly message: string;
  readonly correlationId: string;
  readonly timestamp: string;
}

export interface AuthenticationResponse {
  readonly error: AuthenticationError;
}

// Helper to check if request is allowed to bypass auth (E2E only)
const isE2EMode = (): boolean =>
  config.E2E_AUTH_BYPASS_ENABLED === true &&
  config.NODE_ENV !== 'production' &&
  isTestOrDev;

export const isE2EBypassRequest = (req: Request): boolean => {
  if (!isE2EMode()) {
    return false;
  }

  const bypassHeader = normalizeHeaderValue(req.headers['x-e2e-auth-bypass']);
  if (
    typeof bypassHeader === 'string' &&
    typeof config.E2E_AUTH_BYPASS_TOKEN === 'string' &&
    constantTimeCompare(bypassHeader, config.E2E_AUTH_BYPASS_TOKEN)
  ) {
    return true;
  }

  // Fall back to allow bypass when token is not set (dev-only) to avoid flakiness
  return typeof config.E2E_AUTH_BYPASS_TOKEN !== 'string';
};

// Rate limiting specifically for authentication attempts
// More lenient in test/development environments to support E2E testing
const isTestOrDev = ['test', 'development'].includes(
  config.NODE_ENV || 'production'
);

export const authenticationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  // Higher limit for test/dev environments to support E2E testing
  // Production: 50 requests per 15 minutes
  // Test/Dev: 1000 requests per 15 minutes
  max: isTestOrDev ? 1000 : 50,
  message: {
    error: {
      type: 'auth_rate_limit_exceeded',
      message: 'Too many authentication attempts, please try again later.',
      correlationId: '',
      timestamp: new Date().toISOString(),
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Readonly<Request>) => {
    // Skip rate limiting for health checks
    if (req.path === '/health') {
      return true;
    }

    // Allow bypass in test/dev when explicitly enabled
    if (isE2EMode()) {
      return true;
    }

    return false;
  },
  handler: (req: Readonly<Request>, res: Readonly<Response>) => {
    const mutableRequest = req as Mutable<AuthenticationRequest>;
    const correlationId = resolveCorrelationId(
      mutableRequest.correlationId,
      () => 'unknown'
    );
    const userAgent = normalizeHeaderValue(req.headers['user-agent']);
    const authError: AuthenticationResponse = {
      error: {
        type: 'auth_rate_limit_exceeded',
        message: 'Too many authentication attempts, please try again later.',
        correlationId,
        timestamp: new Date().toISOString(),
      },
    };

    // Log rate limiting event (without exposing sensitive data)
    logger.warn('Authentication rate limit exceeded', correlationId, {
      ip: req.ip,
      userAgent,
      method: req.method,
      url: req.url,
    });

    res.status(429).json(authError);
  },
});

/**
 * Constant-time string comparison to prevent timing attacks
 * @param provided - The provided credential from the client
 * @param expected - The expected credential from configuration
 * @returns boolean indicating if credentials match
 */
function constantTimeCompare(provided: string, expected: string): boolean {
  try {
    // Convert strings to buffers for constant-time comparison
    const providedBuffer = Buffer.from(provided, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');

    // If lengths don't match, still perform comparison to prevent timing attacks
    if (providedBuffer.length !== expectedBuffer.length) {
      // Create dummy buffer of same length as expected for comparison
      const dummyBuffer = Buffer.alloc(expectedBuffer.length);
      timingSafeEqual(dummyBuffer, expectedBuffer);
      return false;
    }

    return timingSafeEqual(providedBuffer, expectedBuffer);
  } catch (unknownError: unknown) {
    const sanitizedError =
      unknownError instanceof Error ? unknownError.message : 'Unknown error';
    logger.error('Error during credential comparison', '', {
      error: 'Credential comparison failed',
      details: sanitizedError,
    });
    return false;
  }
}

/**
 * Extract credentials from request headers
 * @param req - Express request object
 * @returns Object containing credentials and method, or null if none found
 */
function extractCredentials(
  req: Request
): { credentials: string; method: AuthenticationMethod } | null {
  // Check for Authorization Bearer token
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string') {
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (bearerMatch?.[1] !== undefined && bearerMatch[1].trim().length > 0) {
      return {
        credentials: bearerMatch[1].trim(),
        method: AuthenticationMethod.BEARER_TOKEN,
      };
    }
  }

  // Check for x-api-key header
  const apiKeyHeader = normalizeHeaderValue(req.headers['x-api-key']);
  if (typeof apiKeyHeader === 'string' && apiKeyHeader.trim().length > 0) {
    return {
      credentials: apiKeyHeader.trim(),
      method: AuthenticationMethod.API_KEY_HEADER,
    };
  }

  return null;
}

/**
 * Create typed error response for authentication failures
 * @param result - Authentication result enum
 * @param correlationId - Request correlation ID
 * @returns Typed authentication error response
 */
function createAuthErrorResponse(
  result: AuthenticationResult,
  correlationId: string
): AuthenticationResponse {
  const timestamp = new Date().toISOString();

  switch (result) {
    case AuthenticationResult.MISSING_CREDENTIALS:
      return {
        error: {
          type: 'authentication_required',
          message:
            'Authentication required. Provide credentials via Authorization Bearer token or x-api-key header.',
          correlationId,
          timestamp,
        },
      };

    case AuthenticationResult.INVALID_CREDENTIALS:
      return {
        error: {
          type: 'authentication_failed',
          message: 'Invalid credentials provided.',
          correlationId,
          timestamp,
        },
      };

    default:
      return {
        error: {
          type: 'authentication_error',
          message: 'Authentication failed.',
          correlationId,
          timestamp,
        },
      };
  }
}

/**
 * Handle E2E bypass authentication
 */
function handleE2EBypass(
  mutableRequest: Mutable<AuthenticationRequest>,
  correlationId: string,
  req: Readonly<Request>,
  next: NextFunction
): void {
  mutableRequest.authResult = AuthenticationResult.SUCCESS;
  mutableRequest.authMethod = AuthenticationMethod.API_KEY_HEADER;
  logger.debug('E2E authentication bypass applied', correlationId, {
    method: req.method,
    url: req.url,
  });
  next();
}

/**
 * Handle missing credentials
 */
function handleMissingCredentials(
  mutableRequest: Mutable<AuthenticationRequest>,
  correlationId: string,
  req: Readonly<Request>,
  res: Readonly<Response>,
  userAgent: string | undefined,
  hasAuthHeader: boolean,
  hasApiKeyHeader: boolean
): void {
  mutableRequest.authResult = AuthenticationResult.MISSING_CREDENTIALS;

  const logLevel = isTestOrDev ? 'debug' : 'warn';
  logger[logLevel](
    'Authentication failed - missing credentials',
    correlationId,
    {
      ip: req.ip,
      userAgent,
      method: req.method,
      url: req.url,
      hasAuthHeader,
      hasApiKeyHeader,
      requestFormat: detectRequestFormatFromHeaders(req.headers),
    }
  );

  const errorResponse = createAuthErrorResponse(
    AuthenticationResult.MISSING_CREDENTIALS,
    correlationId
  );
  res.status(401).json(errorResponse);
}

/**
 * Handle invalid credentials
 */
function handleInvalidCredentials(
  mutableRequest: Mutable<AuthenticationRequest>,
  correlationId: string,
  req: Readonly<Request>,
  res: Readonly<Response>,
  userAgent: string | undefined,
  credentialData: { credentials: string; method: AuthenticationMethod }
): void {
  mutableRequest.authResult = AuthenticationResult.INVALID_CREDENTIALS;

  const logLevel = isTestOrDev ? 'debug' : 'warn';
  logger[logLevel](
    'Authentication failed - invalid credentials',
    correlationId,
    {
      ip: req.ip,
      userAgent,
      method: req.method,
      url: req.url,
      authMethod: credentialData.method,
      credentialLength: credentialData.credentials.length,
      requestFormat: detectRequestFormatFromHeaders(req.headers),
    }
  );

  const errorResponse = createAuthErrorResponse(
    AuthenticationResult.INVALID_CREDENTIALS,
    correlationId
  );
  res.status(401).json(errorResponse);
}

/**
 * Handle successful authentication
 */
function handleSuccessfulAuth(
  mutableRequest: Mutable<AuthenticationRequest>,
  correlationId: string,
  req: Readonly<Request>,
  userAgent: string | undefined,
  credentialData: { credentials: string; method: AuthenticationMethod },
  next: NextFunction
): void {
  mutableRequest.authResult = AuthenticationResult.SUCCESS;

  logger.info('Authentication successful', correlationId, {
    ip: req.ip,
    userAgent,
    method: req.method,
    url: req.url,
    authMethod: credentialData.method,
    requestFormat: detectRequestFormatFromHeaders(req.headers),
  });

  next();
}

/**
 * Main authentication middleware function
 * Validates Authorization Bearer tokens and x-api-key headers with type safety
 * Now supports multi-format requests (Claude and OpenAI)
 */
export const authenticationMiddleware = (
  req: Readonly<Request>,
  res: Readonly<Response>,
  next: NextFunction
): void => {
  const mutableRequest = req as Mutable<AuthenticationRequest>;
  const correlationId = resolveCorrelationId(
    mutableRequest.correlationId,
    () => 'unknown'
  );
  const userAgent = normalizeHeaderValue(req.headers['user-agent']);
  const hasAuthHeader =
    typeof req.headers.authorization === 'string' &&
    req.headers.authorization.trim().length > 0;
  const hasApiKeyHeader =
    typeof normalizeHeaderValue(req.headers['x-api-key']) === 'string';

  const canBypassAuth = isE2EBypassRequest(req as Request) || isE2EMode();

  try {
    if (canBypassAuth) {
      handleE2EBypass(mutableRequest, correlationId, req, next);
      return;
    }

    const credentialData = extractCredentials(req);

    if (credentialData === null) {
      handleMissingCredentials(
        mutableRequest,
        correlationId,
        req,
        res,
        userAgent,
        hasAuthHeader,
        hasApiKeyHeader
      );
      return;
    }

    mutableRequest.authMethod = credentialData.method;

    const isValidCredential = constantTimeCompare(
      credentialData.credentials,
      config.PROXY_API_KEY
    );

    if (!isValidCredential) {
      handleInvalidCredentials(
        mutableRequest,
        correlationId,
        req,
        res,
        userAgent,
        credentialData
      );
      return;
    }

    handleSuccessfulAuth(
      mutableRequest,
      correlationId,
      req,
      userAgent,
      credentialData,
      next
    );
  } catch (error: unknown) {
    const failure =
      error instanceof Error
        ? error.message
        : 'Unknown error during authentication';

    logger.error('Authentication middleware error', correlationId, {
      error: failure,
      ip: req.ip,
      method: req.method,
      url: req.url,
    });

    const errorResponse = createAuthErrorResponse(
      AuthenticationResult.INVALID_CREDENTIALS,
      correlationId
    );
    res.status(401).json(errorResponse);
  }
};

/**
 * Combined authentication middleware with rate limiting
 * Apply rate limiting before authentication to prevent brute force attacks
 */
export const secureAuthenticationMiddleware = [
  authenticationRateLimit,
  authenticationMiddleware,
];

/**
 * Detect request format from headers for logging purposes
 * This is a simplified detection based on common header patterns
 */
function detectRequestFormatFromHeaders(headers: IncomingHttpHeaders): string {
  const userAgent = normalizeHeaderValue(headers['user-agent']);
  const normalizedUserAgent = userAgent?.toLowerCase() ?? '';

  // Check for common Claude client indicators
  if (
    normalizedUserAgent.includes('claude') ||
    normalizedUserAgent.includes('anthropic')
  ) {
    return 'claude';
  }

  // Check for OpenAI client indicators
  if (
    normalizedUserAgent.includes('openai') ||
    normalizedUserAgent.includes('chatgpt')
  ) {
    return 'openai';
  }

  // Check for Xcode indicators (typically uses OpenAI format)
  if (normalizedUserAgent.includes('xcode')) {
    return 'openai';
  }

  // Default to unknown for logging
  return 'unknown';
}
