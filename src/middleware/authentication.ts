import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import rateLimit from 'express-rate-limit';
import config from '../config/index.js';
import { logger } from './logging.js';
import type { RequestWithCorrelationId } from '../types/index.js';

/**
 * Authentication middleware with TypeScript types and security best practices
 */

// TypeScript enums for authentication result types
export enum AuthenticationResult {
  SUCCESS = 'success',
  MISSING_CREDENTIALS = 'missing_credentials',
  INVALID_CREDENTIALS = 'invalid_credentials',
  RATE_LIMITED = 'rate_limited'
}

export enum AuthenticationMethod {
  BEARER_TOKEN = 'bearer_token',
  API_KEY_HEADER = 'api_key_header'
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
export const authenticationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 authentication attempts per windowMs
  message: {
    error: {
      type: 'auth_rate_limit_exceeded',
      message: 'Too many authentication attempts, please try again later.',
      correlationId: '',
      timestamp: new Date().toISOString()
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    const correlationId = (req as AuthenticationRequest).correlationId || 'unknown';
    const authError: AuthenticationResponse = {
      error: {
        type: 'auth_rate_limit_exceeded',
        message: 'Too many authentication attempts, please try again later.',
        correlationId,
        timestamp: new Date().toISOString()
      }
    };

    // Log rate limiting event (without exposing sensitive data)
    logger.warn('Authentication rate limit exceeded', correlationId, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      method: req.method,
      url: req.url
    });

    res.status(429).json(authError);
  }
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
  } catch (error) {
    // Log error but don't expose details
    logger.error('Error during credential comparison', '', {
      error: 'Credential comparison failed'
    });
    return false;
  }
}

/**
 * Extract credentials from request headers
 * @param req - Express request object
 * @returns Object containing credentials and method, or null if none found
 */
function extractCredentials(req: Request): { credentials: string; method: AuthenticationMethod } | null {
  // Check for Authorization Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === 'string') {
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (bearerMatch && bearerMatch[1]) {
      return {
        credentials: bearerMatch[1].trim(),
        method: AuthenticationMethod.BEARER_TOKEN
      };
    }
  }
  
  // Check for x-api-key header
  const apiKeyHeader = req.headers['x-api-key'];
  if (apiKeyHeader && typeof apiKeyHeader === 'string') {
    return {
      credentials: apiKeyHeader.trim(),
      method: AuthenticationMethod.API_KEY_HEADER
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
function createAuthErrorResponse(result: AuthenticationResult, correlationId: string): AuthenticationResponse {
  const timestamp = new Date().toISOString();
  
  switch (result) {
    case AuthenticationResult.MISSING_CREDENTIALS:
      return {
        error: {
          type: 'authentication_required',
          message: 'Authentication required. Provide credentials via Authorization Bearer token or x-api-key header.',
          correlationId,
          timestamp
        }
      };
    
    case AuthenticationResult.INVALID_CREDENTIALS:
      return {
        error: {
          type: 'authentication_failed',
          message: 'Invalid credentials provided.',
          correlationId,
          timestamp
        }
      };
    
    default:
      return {
        error: {
          type: 'authentication_error',
          message: 'Authentication failed.',
          correlationId,
          timestamp
        }
      };
  }
}

/**
 * Main authentication middleware function
 * Validates Authorization Bearer tokens and x-api-key headers with type safety
 */
export const authenticationMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authReq = req as AuthenticationRequest;
  const correlationId = authReq.correlationId || 'unknown';
  
  try {
    // Extract credentials from request headers
    const credentialData = extractCredentials(req);
    
    if (!credentialData) {
      // No credentials provided
      authReq.authResult = AuthenticationResult.MISSING_CREDENTIALS;
      
      // Log authentication attempt (without exposing sensitive data)
      logger.warn('Authentication failed - missing credentials', correlationId, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        method: req.method,
        url: req.url,
        hasAuthHeader: !!req.headers.authorization,
        hasApiKeyHeader: !!req.headers['x-api-key']
      });
      
      const errorResponse = createAuthErrorResponse(AuthenticationResult.MISSING_CREDENTIALS, correlationId);
      res.status(401).json(errorResponse);
      return;
    }
    
    // Store authentication method for logging
    authReq.authMethod = credentialData.method;
    
    // Compare client credentials against PROXY_API_KEY with constant-time comparison
    const isValidCredential = constantTimeCompare(credentialData.credentials, config.PROXY_API_KEY);
    
    if (!isValidCredential) {
      // Invalid credentials
      authReq.authResult = AuthenticationResult.INVALID_CREDENTIALS;
      
      // Log authentication failure (without exposing sensitive data)
      logger.warn('Authentication failed - invalid credentials', correlationId, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        method: req.method,
        url: req.url,
        authMethod: credentialData.method,
        credentialLength: credentialData.credentials.length
      });
      
      const errorResponse = createAuthErrorResponse(AuthenticationResult.INVALID_CREDENTIALS, correlationId);
      res.status(401).json(errorResponse);
      return;
    }
    
    // Authentication successful
    authReq.authResult = AuthenticationResult.SUCCESS;
    
    // Log successful authentication (without exposing sensitive data)
    logger.info('Authentication successful', correlationId, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      method: req.method,
      url: req.url,
      authMethod: credentialData.method
    });
    
    // Continue to next middleware
    next();
    
  } catch (error) {
    // Handle unexpected errors during authentication
    logger.error('Authentication middleware error', correlationId, {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip,
      method: req.method,
      url: req.url
    });
    
    const errorResponse = createAuthErrorResponse(AuthenticationResult.INVALID_CREDENTIALS, correlationId);
    res.status(401).json(errorResponse);
  }
};

/**
 * Combined authentication middleware with rate limiting
 * Apply rate limiting before authentication to prevent brute force attacks
 */
export const secureAuthenticationMiddleware = [
  authenticationRateLimit,
  authenticationMiddleware
];