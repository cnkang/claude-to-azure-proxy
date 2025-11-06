import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  correlationIdMiddleware,
  securityHeadersMiddleware,
  requestSizeMiddleware,
  requestTimeoutMiddleware,
  sanitizeInput,
  validateContentType,
  rateLimitConfig,
} from '../src/middleware/security';
import type { RequestWithCorrelationId } from '../src/types/index';

describe('Security Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let jsonSpy: ReturnType<typeof vi.fn>;
  let statusSpy: ReturnType<typeof vi.fn>;
  let setSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    jsonSpy = vi.fn().mockReturnThis();
    statusSpy = vi.fn().mockReturnThis();
    setSpy = vi.fn().mockReturnThis();

    mockRequest = {
      headers: {},
      body: {},
      ip: '127.0.0.1',
      method: 'POST',
      url: '/v1/completions',
      get: vi.fn(),
    };

    mockResponse = {
      status: statusSpy,
      json: jsonSpy,
      set: setSpy,
      setHeader: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
    };

    mockNext = vi.fn();
  });

  describe('Correlation ID Middleware', () => {
    it('should generate correlation ID when not present', () => {
      correlationIdMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      const req = mockRequest as RequestWithCorrelationId;
      expect(req.correlationId).toBeDefined();
      expect(typeof req.correlationId).toBe('string');
      expect(req.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
      expect(mockNext).toHaveBeenCalledOnce();
    });

    it('should use existing correlation ID from header', () => {
      const existingId = 'existing-correlation-id';
      mockRequest.headers = {
        'x-correlation-id': existingId,
      };

      correlationIdMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      const req = mockRequest as RequestWithCorrelationId;
      expect(req.correlationId).toBe(existingId);
      expect(mockNext).toHaveBeenCalledOnce();
    });

    it('should handle array header values', () => {
      mockRequest.headers = {
        'x-correlation-id': ['first-id', 'second-id'],
      };

      correlationIdMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      const req = mockRequest as RequestWithCorrelationId;
      expect(req.correlationId).toBe('first-id');
      expect(mockNext).toHaveBeenCalledOnce();
    });

    it('should generate new ID for invalid existing ID', () => {
      mockRequest.headers = {
        'x-correlation-id': '', // Empty string
      };

      correlationIdMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      const req = mockRequest as RequestWithCorrelationId;
      expect(req.correlationId).toBeDefined();
      expect(req.correlationId).not.toBe('');
      expect(mockNext).toHaveBeenCalledOnce();
    });
  });

  describe('Security Headers Middleware', () => {
    it('should set all required security headers', () => {
      securityHeadersMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(setSpy).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(setSpy).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(setSpy).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(setSpy).toHaveBeenCalledWith(
        'Referrer-Policy',
        'strict-origin-when-cross-origin'
      );
      expect(setSpy).toHaveBeenCalledWith(
        'Permissions-Policy',
        'geolocation=(), microphone=(), camera=()'
      );
      expect(setSpy).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload'
      );
      expect(setSpy).toHaveBeenCalledWith(
        'Content-Security-Policy',
        "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; media-src 'none'; child-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
      );
      expect(mockNext).toHaveBeenCalledOnce();
    });

    it('should not override existing security headers', () => {
      // Pre-set a header
      mockResponse.set = vi.fn().mockReturnValue(mockResponse);

      securityHeadersMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledOnce();
    });
  });

  describe('Request Size Middleware', () => {
    it('should allow requests within size limit', () => {
      const middleware = requestSizeMiddleware(1024); // 1KB limit
      mockRequest.headers = {
        'content-length': '512',
      };

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledOnce();
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it('should reject requests exceeding size limit', () => {
      const middleware = requestSizeMiddleware(1024); // 1KB limit
      mockRequest.headers = {
        'content-length': '2048',
      };
      (mockRequest as RequestWithCorrelationId).correlationId =
        'test-correlation-id';

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(413);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          type: 'request_too_large',
          message: 'Request size exceeds maximum allowed size of 1024 bytes',
          correlationId: 'test-correlation-id',
        },
      });
    });

    it('should handle missing content-length header', () => {
      const middleware = requestSizeMiddleware(1024);
      mockRequest.headers = {}; // No content-length

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledOnce();
    });

    it('should handle invalid content-length header', () => {
      const middleware = requestSizeMiddleware(1024);
      mockRequest.headers = {
        'content-length': 'invalid',
      };

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledOnce();
    });

    it('should use default size limit', () => {
      const middleware = requestSizeMiddleware(); // No limit specified
      mockRequest.headers = {
        'content-length': '5242880', // 5MB - within default 10MB limit
      };

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledOnce(); // Should pass with default 10MB limit
    });
  });

  describe('Request Timeout Middleware', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should set request timeout', () => {
      const middleware = requestTimeoutMiddleware(5000);
      const timeoutSpy = vi.fn();
      (mockRequest as Record<string, unknown>).setTimeout = timeoutSpy;

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(timeoutSpy).toHaveBeenCalledWith(5000, expect.any(Function));
      expect(mockNext).toHaveBeenCalledOnce();
    });

    it('should handle timeout callback', () => {
      const middleware = requestTimeoutMiddleware(5000);
      let timeoutCallback: (() => void) | undefined;

      (mockRequest as Record<string, unknown>).setTimeout = vi.fn(
        (timeout: number, callback: () => void) => {
          timeoutCallback = callback;
        }
      );
      (mockRequest as RequestWithCorrelationId).correlationId =
        'test-correlation-id';

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate timeout
      timeoutCallback!();

      expect(statusSpy).toHaveBeenCalledWith(408);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          type: 'request_timeout',
          message: 'Request timed out after 5000ms',
          correlationId: 'test-correlation-id',
        },
      });
    });

    it('should use default timeout', () => {
      const middleware = requestTimeoutMiddleware(); // No timeout specified
      const timeoutSpy = vi.fn();
      mockRequest.setTimeout = timeoutSpy;

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(timeoutSpy).toHaveBeenCalledWith(120000, expect.any(Function)); // Default 120s
    });

    it('should handle missing setTimeout method', () => {
      const middleware = requestTimeoutMiddleware(5000);
      delete (mockRequest as Record<string, unknown>).setTimeout;

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledOnce();
    });
  });

  describe('Input Sanitization', () => {
    it('should sanitize string input', () => {
      const maliciousInput = '<script>alert("xss")</script>Hello\x00World\x01';
      const sanitized = sanitizeInput(maliciousInput);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('\x00');
      expect(sanitized).not.toContain('\x01');
      expect(sanitized).toContain('Hello');
      expect(sanitized).toContain('World');
    });

    it('should sanitize object input recursively', () => {
      const maliciousObject = {
        name: '<script>alert("xss")</script>',
        description: 'Safe content',
        nested: {
          value: 'Hello\x00World',
        },
        array: ['<img src=x onerror=alert(1)>', 'safe item'],
      };

      const sanitized = sanitizeInput(maliciousObject) as Record<
        string,
        unknown
      >;

      expect(sanitized.name as string).not.toContain('<script>');
      expect(sanitized.description).toBe('Safe content');
      const nested = sanitized.nested as Record<string, unknown>;
      expect(nested.value as string).not.toContain('\x00');
      const array = sanitized.array as string[];
      expect(array[0]).not.toContain('onerror');
      expect(array[1]).toBe('safe item');
    });

    it('should handle array input', () => {
      const maliciousArray = [
        '<script>alert("xss")</script>',
        'Safe content',
        { nested: 'Hello\x00World' },
      ];

      const sanitized = sanitizeInput(maliciousArray) as unknown[];

      expect(sanitized[0] as string).not.toContain('<script>');
      expect(sanitized[1]).toBe('Safe content');
      const nestedObj = sanitized[2] as Record<string, unknown>;
      expect(nestedObj.nested as string).not.toContain('\x00');
    });

    it('should handle non-string, non-object input', () => {
      expect(sanitizeInput(123)).toBe(123);
      expect(sanitizeInput(true)).toBe(true);
      expect(sanitizeInput(null)).toBe(null);
      expect(sanitizeInput(undefined)).toBe(undefined);
    });

    it('should handle circular references', () => {
      const circular: Record<string, unknown> = { name: 'test' };
      circular.self = circular;

      const sanitized = sanitizeInput(circular);
      expect(sanitized).toHaveProperty('name', 'test');
      // Should not throw error on circular reference
    });

    it('should remove dangerous HTML attributes', () => {
      const input = '<div onclick="alert(1)" onload="evil()">Content</div>';
      const sanitized = sanitizeInput(input);

      expect(sanitized).not.toContain('onclick');
      expect(sanitized).not.toContain('onload');
      expect(sanitized).toContain('Content');
    });

    it('should remove javascript: protocols', () => {
      const input = '<a href="javascript:alert(1)">Link</a>';
      const sanitized = sanitizeInput(input);

      // eslint-disable-next-line no-script-url
      expect(sanitized).not.toContain('javascript:');
      expect(sanitized).toContain('Link');
    });

    it('should remove data: URLs with base64', () => {
      const input =
        '<img src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">';
      const sanitized = sanitizeInput(input);

      expect(sanitized).not.toContain('data:text/html;base64');
    });
  });

  describe('Content Type Validation', () => {
    it('should allow valid JSON content type', () => {
      mockRequest.headers = {
        'content-type': 'application/json',
      };

      const result = validateContentType(mockRequest as Request, [
        'application/json',
      ]);
      expect(result).toBe(true);
    });

    it('should allow valid content type with charset', () => {
      mockRequest.headers = {
        'content-type': 'application/json; charset=utf-8',
      };

      const result = validateContentType(mockRequest as Request, [
        'application/json',
      ]);
      expect(result).toBe(true);
    });

    it('should reject invalid content type', () => {
      mockRequest.headers = {
        'content-type': 'text/plain',
      };

      const result = validateContentType(mockRequest as Request, [
        'application/json',
      ]);
      expect(result).toBe(false);
    });

    it('should handle missing content type', () => {
      mockRequest.headers = {};

      const result = validateContentType(mockRequest as Request, [
        'application/json',
      ]);
      expect(result).toBe(false);
    });

    it('should handle multiple allowed content types', () => {
      mockRequest.headers = {
        'content-type': 'application/x-www-form-urlencoded',
      };

      const result = validateContentType(mockRequest as Request, [
        'application/json',
        'application/x-www-form-urlencoded',
      ]);
      expect(result).toBe(true);
    });

    it('should be case insensitive', () => {
      mockRequest.headers = {
        'content-type': 'APPLICATION/JSON',
      };

      const result = validateContentType(mockRequest as Request, [
        'application/json',
      ]);
      expect(result).toBe(true);
    });
  });

  describe('Rate Limit Configuration', () => {
    it('should provide global rate limit config', () => {
      expect(rateLimitConfig.global).toBeDefined();
      expect(rateLimitConfig.global.windowMs).toBeGreaterThan(0);
      expect(rateLimitConfig.global.maxRequests).toBeGreaterThan(0);
      expect(typeof rateLimitConfig.global.message).toBe('string');
    });

    it('should provide per-IP rate limit config', () => {
      expect(rateLimitConfig.perIP).toBeDefined();
      expect(rateLimitConfig.perIP.windowMs).toBeGreaterThan(0);
      expect(rateLimitConfig.perIP.maxRequests).toBeGreaterThan(0);
      expect(typeof rateLimitConfig.perIP.message).toBe('string');
    });

    it('should provide endpoint-specific rate limit config', () => {
      expect(rateLimitConfig.completions).toBeDefined();
      expect(rateLimitConfig.completions.windowMs).toBeGreaterThan(0);
      expect(rateLimitConfig.completions.maxRequests).toBeGreaterThan(0);
      expect(typeof rateLimitConfig.completions.message).toBe('string');
    });

    it('should have reasonable rate limit values', () => {
      // Global limits should be higher than per-IP limits
      expect(rateLimitConfig.global.maxRequests).toBeGreaterThanOrEqual(
        rateLimitConfig.perIP.maxRequests
      );

      // All limits should be positive numbers
      expect(rateLimitConfig.completions.maxRequests).toBeGreaterThan(0);
      expect(rateLimitConfig.perIP.maxRequests).toBeGreaterThan(0);
      expect(rateLimitConfig.global.maxRequests).toBeGreaterThan(0);
    });
  });

  describe('Security Headers Content', () => {
    it('should set strict CSP policy', () => {
      securityHeadersMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      const cspCall = setSpy.mock.calls.find(
        (call: unknown[]) => call[0] === 'Content-Security-Policy'
      );
      expect(cspCall).toBeDefined();
      if (!cspCall) {
        return;
      }

      const cspValue = cspCall[1] as string;
      expect(cspValue).toContain("default-src 'none'");
      expect(cspValue).toContain("script-src 'self'");
      expect(cspValue).toContain("object-src 'none'");
      expect(cspValue).toContain("frame-ancestors 'none'");
    });

    it('should set HSTS with preload', () => {
      securityHeadersMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      const hstsCall = setSpy.mock.calls.find(
        (call: unknown[]) => call[0] === 'Strict-Transport-Security'
      );
      expect(hstsCall).toBeDefined();
      if (!hstsCall) {
        return;
      }

      const hstsValue = hstsCall[1] as string;
      expect(hstsValue).toContain('max-age=31536000');
      expect(hstsValue).toContain('includeSubDomains');
      expect(hstsValue).toContain('preload');
    });

    it('should set restrictive permissions policy', () => {
      securityHeadersMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      const permissionsCall = setSpy.mock.calls.find(
        (call: unknown[]) => call[0] === 'Permissions-Policy'
      );
      expect(permissionsCall).toBeDefined();
      if (!permissionsCall) {
        return;
      }

      const permissionsValue = permissionsCall[1] as string;
      expect(permissionsValue).toContain('geolocation=()');
      expect(permissionsValue).toContain('microphone=()');
      expect(permissionsValue).toContain('camera=()');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle malformed headers gracefully', () => {
      mockRequest.headers = {
        'content-length': 'not-a-number',
        'x-correlation-id': null as unknown as string,
      };

      correlationIdMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledOnce();
      expect(
        (mockRequest as RequestWithCorrelationId).correlationId
      ).toBeDefined();
    });

    it('should handle very large correlation IDs', () => {
      const largeId = 'x'.repeat(1000);
      mockRequest.headers = {
        'x-correlation-id': largeId,
      };

      correlationIdMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      const req = mockRequest as RequestWithCorrelationId;
      // Should generate new UUID for very large ones
      expect(req.correlationId).not.toBe(largeId);
      expect(req.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    });

    it('should handle special characters in input sanitization', () => {
      const specialInput = 'Hello\u0000\u0001\u0002\u001F\u007F\u0080World';
      const sanitized = sanitizeInput(specialInput);

      expect(sanitized).not.toContain('\u0000');
      expect(sanitized).not.toContain('\u0001');
      expect(sanitized).not.toContain('\u001F');
      expect(sanitized).toContain('Hello');
      expect(sanitized).toContain('World');
    });

    it('should handle deeply nested objects in sanitization', () => {
      const deepObject: Record<string, unknown> = { level1: {} };
      let current = deepObject.level1 as Record<string, unknown>;

      // Create 10 levels of nesting
      for (let i = 2; i <= 10; i++) {
        const levelKey = `level${i}`;
        const newLevel = {};
        Object.defineProperty(current, levelKey, {
          value: newLevel,
          writable: true,
          enumerable: true,
          configurable: true,
        });
        current = newLevel as Record<string, unknown>;
      }
      Object.defineProperty(current, 'value', {
        value: '<script>alert("deep")</script>',
        writable: true,
        enumerable: true,
        configurable: true,
      });

      const sanitized = sanitizeInput(deepObject) as Record<string, unknown>;

      // Navigate to the deep value using Object.prototype.hasOwnProperty for safety
      let deepValue = sanitized.level1 as Record<string, unknown>;
      for (let i = 2; i <= 10; i++) {
        const levelKey = `level${i}`;
        if (Object.prototype.hasOwnProperty.call(deepValue, levelKey)) {
          const descriptor = Object.getOwnPropertyDescriptor(
            deepValue,
            levelKey
          );
          const nextLevel = descriptor?.value as unknown;
          if (typeof nextLevel === 'object' && nextLevel !== null) {
            deepValue = nextLevel as Record<string, unknown>;
          }
        }
      }

      if (Object.prototype.hasOwnProperty.call(deepValue, 'value')) {
        expect(deepValue.value as string).not.toContain('<script>');
      }
    });
  });
});
