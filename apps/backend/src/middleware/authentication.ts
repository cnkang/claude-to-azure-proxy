import type { Request, Response, NextFunction } from 'express';
import type { IncomingHttpHeaders } from 'http';
import { timingSafeEqual } from 'crypto';
import rateLimit from 'express-rate-limit';
import config from '../config/index';
import { logger } from './logging';
import type { RequestWithCorrelationId, Mutable } from '../types/index';
import { normalizeHeaderValue } from '../utils/http-headers';
import { resolveCorrelationId } from '../utils/correlation-id';

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
    return req.path === '/health';
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

  try {
    // Extract credentials from request headers
    const credentialData = extractCredentials(req);

    if (credentialData === null) {
      // No credentials provided
      mutableRequest.authResult = AuthenticationResult.MISSING_CREDENTIALS;

      // Log authentication attempt (without exposing sensitive data)
      // Use debug level in test/dev to reduce noise in E2E tests
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
      return;
    }

    // Store authentication method for logging
    mutableRequest.authMethod = credentialData.method;

    // Compare client credentials against PROXY_API_KEY with constant-time comparison
    const isValidCredential = constantTimeCompare(
      credentialData.credentials,
      config.PROXY_API_KEY
    );

    if (!isValidCredential) {
      // Invalid credentials
      mutableRequest.authResult = AuthenticationResult.INVALID_CREDENTIALS;

      // Log authentication failure (without exposing sensitive data)
      // Use debug level in test/dev to reduce noise in E2E tests
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
      return;
    }

    // Authentication successful
    mutableRequest.authResult = AuthenticationResult.SUCCESS;

    // Log successful authentication (without exposing sensitive data)
    logger.info('Authentication successful', correlationId, {
      ip: req.ip,
      userAgent,
      method: req.method,
      url: req.url,
      authMethod: credentialData.method,
      requestFormat: detectRequestFormatFromHeaders(req.headers),
    });

    // Continue to next middleware
    next();
  } catch (error: unknown) {
    // Handle unexpected errors during authentication
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
