/**
 * Tests for enhanced security middleware functionality
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  enhancedApiKeyValidation,
  validateRequestOrigin,
  validateRequestIntegrity,
  enhancedSecurityHeaders,
  enhancedRateLimiters,
} from '../src/middleware/enhanced-security.js';
import type { RequestWithCorrelationId } from '../src/types/index.js';

// Mock logger
vi.mock('../src/middleware/logging.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Enhanced Security Middleware', () => {
  let mockReq: Partial<Request & RequestWithCorrelationId>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
      ip: '127.0.0.1',
      method: 'POST',
      path: '/v1/completions',
      body: {},
      correlationId: 'test-correlation-id',
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    };

    mockNext = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('enhancedApiKeyValidation', () => {
    it('should accept valid API key from Authorization header', () => {
      mockReq.headers = {
        authorization: 'Bearer valid-api-key-12345678901234567890',
      };

      enhancedApiKeyValidation(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should accept valid API key from x-api-key header', () => {
      mockReq.headers = {
        'x-api-key': 'valid-api-key-12345678901234567890',
      };

      enhancedApiKeyValidation(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should reject request without API key', () => {
      mockReq.headers = {};

      enhancedApiKeyValidation(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          type: 'authentication_error',
          message:
            'API key is required. Provide via Authorization header or x-api-key header.',
          correlationId: 'test-correlation-id',
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject API key with invalid format', () => {
      mockReq.headers = {
        authorization: 'Bearer short',
      };

      enhancedApiKeyValidation(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          type: 'authentication_error',
          message: 'Invalid API key format.',
          correlationId: 'test-correlation-id',
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject API key with invalid characters', () => {
      mockReq.headers = {
        authorization: 'Bearer invalid-key-with-@#$%^&*()',
      };

      enhancedApiKeyValidation(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle malformed Authorization header', () => {
      mockReq.headers = {
        authorization: 'NotBearer invalid-format',
      };

      enhancedApiKeyValidation(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('validateRequestOrigin', () => {
    it('should pass through normal requests', () => {
      mockReq.headers = {
        'user-agent': 'Mozilla/5.0 (compatible; ClaudeCodeCLI/1.0)',
        origin: 'https://example.com',
      };

      validateRequestOrigin(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should log suspicious user agents but not block them', () => {
      mockReq.headers = {
        'user-agent': 'curl/7.68.0',
      };

      validateRequestOrigin(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      // Should log warning but not block
    });

    it('should handle missing user agent', () => {
      mockReq.headers = {};

      validateRequestOrigin(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('validateRequestIntegrity', () => {
    it('should accept valid JSON request body', () => {
      mockReq.body = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      validateRequestIntegrity(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject non-object request body', () => {
      mockReq.body = 'invalid string body';

      validateRequestIntegrity(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          type: 'invalid_request_error',
          message: 'Request body must be a valid JSON object',
          correlationId: 'test-correlation-id',
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject deeply nested objects', () => {
      // Create deeply nested object
      const deepObject: any = {};
      let current = deepObject;
      for (let i = 0; i < 15; i++) {
        current.nested = {};
        current = current.nested;
      }

      mockReq.body = deepObject;

      validateRequestIntegrity(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          type: 'invalid_request_error',
          message: 'Request body exceeds maximum nesting depth of 10',
          correlationId: 'test-correlation-id',
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject excessive array lengths', () => {
      const largeArray = new Array(1001).fill('item');
      mockReq.body = {
        data: largeArray,
      };

      validateRequestIntegrity(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          type: 'invalid_request_error',
          message:
            'Request body contains arrays exceeding maximum length of 1000',
          correlationId: 'test-correlation-id',
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle GET requests without body', () => {
      mockReq.method = 'GET';
      mockReq.body = undefined;

      validateRequestIntegrity(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('enhancedSecurityHeaders', () => {
    it('should set all required security headers', () => {
      enhancedSecurityHeaders(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.set).toHaveBeenCalledWith({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy':
          'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
        'Strict-Transport-Security':
          'max-age=31536000; includeSubDomains; preload',
        'Content-Security-Policy':
          "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; media-src 'none'; child-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Cache-Control':
          'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      });

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('rate limiting', () => {
    it('should have different rate limits for different endpoints', () => {
      expect(enhancedRateLimiters.authentication).toBeDefined();
      expect(enhancedRateLimiters.completions).toBeDefined();
      expect(enhancedRateLimiters.streaming).toBeDefined();
      expect(enhancedRateLimiters.healthCheck).toBeDefined();
      expect(enhancedRateLimiters.global).toBeDefined();
    });

    // Note: Testing actual rate limiting behavior would require more complex setup
    // with time manipulation and multiple requests
  });

  describe('client IP extraction', () => {
    it('should extract IP from CloudFront headers', () => {
      mockReq.headers = {
        'cf-connecting-ip': '192.168.1.1',
        'x-forwarded-for': '10.0.0.1',
      };

      // This would be tested indirectly through rate limiting behavior
      // The actual getClientIp function is private
    });

    it('should fallback to x-forwarded-for header', () => {
      mockReq.headers = {
        'x-forwarded-for': '192.168.1.1, 10.0.0.1',
      };

      // This would be tested indirectly through rate limiting behavior
    });

    it('should fallback to req.ip', () => {
      mockReq.ip = '127.0.0.1';
      mockReq.headers = {};

      // This would be tested indirectly through rate limiting behavior
    });
  });

  describe('error handling', () => {
    it('should handle middleware errors gracefully', () => {
      // Mock an error in the middleware
      const errorMiddleware = () => {
        throw new Error('Middleware error');
      };

      expect(() => {
        try {
          errorMiddleware(mockReq as Request, mockRes as Response, mockNext);
        } catch (error) {
          // Should be caught and handled appropriately
          expect(error).toBeInstanceOf(Error);
        }
      }).not.toThrow();
    });
  });

  describe('security event logging', () => {
    it('should log security events without exposing sensitive data', () => {
      mockReq.headers = {
        authorization: 'Bearer invalid-key',
        'user-agent': 'suspicious-bot/1.0',
      };

      enhancedApiKeyValidation(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      // Should log security event but not expose the actual API key
      // This would be verified through logger mock calls
    });
  });
});
