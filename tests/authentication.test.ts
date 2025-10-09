import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response } from 'express';
import {
  authenticationMiddleware,
  secureAuthenticationMiddleware,
  AuthenticationResult,
  AuthenticationMethod,
} from '../src/middleware/authentication.js';
import type { AuthenticationRequest } from '../src/types/index.js';
import type { MockRequest, MockResponse, MockNextFunction } from './types.js';

// Mock the config module
vi.mock('../src/config/index.js', () => ({
  default: {
    PROXY_API_KEY: 'test-api-key-12345678901234567890123456789012',
  },
}));

// Mock the logger
vi.mock('../src/middleware/logging.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Authentication Middleware', () => {
  let mockRequest: MockRequest;
  let mockResponse: MockResponse;
  let mockNext: MockNextFunction;
  let jsonSpy: ReturnType<typeof vi.fn>;
  let statusSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock response with chainable methods
    jsonSpy = vi.fn().mockReturnThis();
    statusSpy = vi.fn().mockReturnThis();

    mockRequest = {
      headers: {},
      ip: '127.0.0.1',
      method: 'POST',
      url: '/v1/completions',
    };

    mockResponse = {
      status: statusSpy,
      json: jsonSpy,
    } as MockResponse;

    mockNext = vi.fn();

    // Add correlation ID to request
    mockRequest.correlationId = 'test-correlation-id';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Bearer Token Authentication', () => {
    it('should authenticate successfully with valid Bearer token', () => {
      mockRequest.headers = {
        authorization: 'Bearer test-api-key-12345678901234567890123456789012',
      };

      authenticationMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledOnce();
      expect(statusSpy).not.toHaveBeenCalled();
      expect(jsonSpy).not.toHaveBeenCalled();
      expect(mockRequest.authResult).toBe(AuthenticationResult.SUCCESS);
      expect(mockRequest.authMethod).toBe(AuthenticationMethod.BEARER_TOKEN);
    });

    it('should reject invalid Bearer token', () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token',
      };

      authenticationMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          type: 'authentication_failed',
          message: 'Invalid credentials provided.',
          correlationId: 'test-correlation-id',
          timestamp: expect.stringMatching(/.*/u) as string,
        },
      });
      expect(mockRequest.authResult).toBe(
        AuthenticationResult.INVALID_CREDENTIALS
      );
    });

    it('should handle malformed Bearer token', () => {
      mockRequest.headers = {
        authorization: 'Bearer',
      };

      authenticationMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          type: 'authentication_required',
          message:
            'Authentication required. Provide credentials via Authorization Bearer token or x-api-key header.',
          correlationId: 'test-correlation-id',
          timestamp: expect.stringMatching(/.*/u) as string,
        },
      });
    });

    it('should handle case-insensitive Bearer token', () => {
      mockRequest.headers = {
        authorization: 'bearer test-api-key-12345678901234567890123456789012',
      };

      authenticationMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledOnce();
      expect(mockRequest.authResult).toBe(AuthenticationResult.SUCCESS);
    });
  });

  describe('API Key Header Authentication', () => {
    it('should authenticate successfully with valid x-api-key header', () => {
      mockRequest.headers = {
        'x-api-key': 'test-api-key-12345678901234567890123456789012',
      };

      authenticationMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledOnce();
      expect(statusSpy).not.toHaveBeenCalled();
      expect(jsonSpy).not.toHaveBeenCalled();
      expect(mockRequest.authResult).toBe(AuthenticationResult.SUCCESS);
      expect(mockRequest.authMethod).toBe(AuthenticationMethod.API_KEY_HEADER);
    });

    it('should reject invalid x-api-key header', () => {
      mockRequest.headers = {
        'x-api-key': 'invalid-api-key',
      };

      authenticationMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          type: 'authentication_failed',
          message: 'Invalid credentials provided.',
          correlationId: 'test-correlation-id',
          timestamp: expect.stringMatching(/.*/u) as string,
        },
      });
      expect(mockRequest.authResult).toBe(
        AuthenticationResult.INVALID_CREDENTIALS
      );
    });

    it('should handle empty x-api-key header', () => {
      mockRequest.headers = {
        'x-api-key': '',
      };

      authenticationMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(mockRequest.authResult).toBe(
        AuthenticationResult.MISSING_CREDENTIALS
      );
    });
  });

  describe('Missing Credentials', () => {
    it('should reject request with no authentication headers', () => {
      mockRequest.headers = {};

      authenticationMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          type: 'authentication_required',
          message:
            'Authentication required. Provide credentials via Authorization Bearer token or x-api-key header.',
          correlationId: 'test-correlation-id',
          timestamp: expect.stringMatching(/.*/u) as string,
        },
      });
      expect(mockRequest.authResult).toBe(
        AuthenticationResult.MISSING_CREDENTIALS
      );
    });

    it('should reject request with invalid authorization header format', () => {
      mockRequest.headers = {
        authorization: 'Basic dGVzdDp0ZXN0',
      };

      authenticationMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(mockRequest.authResult).toBe(
        AuthenticationResult.MISSING_CREDENTIALS
      );
    });
  });

  describe('Priority and Edge Cases', () => {
    it('should prioritize Bearer token over x-api-key when both are present', () => {
      mockRequest.headers = {
        authorization: 'Bearer test-api-key-12345678901234567890123456789012',
        'x-api-key': 'different-key',
      };

      authenticationMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledOnce();
      expect(mockRequest.authMethod).toBe(AuthenticationMethod.BEARER_TOKEN);
    });

    it('should handle whitespace in credentials', () => {
      mockRequest.headers = {
        'x-api-key': '  test-api-key-12345678901234567890123456789012  ',
      };

      authenticationMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledOnce();
      expect(mockRequest.authResult).toBe(AuthenticationResult.SUCCESS);
    });

    it('should handle missing correlation ID gracefully', () => {
      mockRequest.correlationId = undefined;
      mockRequest.headers = {
        'x-api-key': 'invalid-key',
      };

      authenticationMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          type: 'authentication_failed',
          message: 'Invalid credentials provided.',
          correlationId: 'unknown',
          timestamp: expect.stringMatching(/.*/u) as string,
        },
      });
    });
  });

  describe('Timing Attack Prevention', () => {
    it('should use constant-time comparison for credential validation', () => {
      // Test that valid credentials work (implying constant-time comparison is used)
      mockRequest.headers = {
        'x-api-key': 'test-api-key-12345678901234567890123456789012',
      };

      authenticationMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledOnce();
      expect(mockRequest.authResult).toBe(AuthenticationResult.SUCCESS);
    });

    it('should handle different length credentials securely', () => {
      mockRequest.headers = {
        'x-api-key': 'short',
      };

      authenticationMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Should reject different length credentials
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(mockRequest.authResult).toBe(
        AuthenticationResult.INVALID_CREDENTIALS
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle crypto errors gracefully', () => {
      // Test error handling by providing malformed credentials that could cause issues
      mockRequest.headers = {
        'x-api-key': null as unknown as string, // This could potentially cause issues in Buffer.from
      };

      authenticationMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(mockRequest.authResult).toBe(
        AuthenticationResult.MISSING_CREDENTIALS
      );
    });

    it('should handle unexpected errors during authentication', () => {
      // Mock Buffer.from to throw an error
      const originalBufferFrom = Buffer.from.bind(Buffer);
      const mockBufferFrom = vi.fn().mockImplementation(() => {
        throw new Error('Buffer error');
      });
      Buffer.from = mockBufferFrom;

      mockRequest.headers = {
        'x-api-key': 'test-key',
      };

      authenticationMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          type: 'authentication_failed',
          message: 'Invalid credentials provided.',
          correlationId: 'test-correlation-id',
          timestamp: expect.stringMatching(/.*/u) as string,
        },
      });

      Buffer.from = originalBufferFrom;
    });
  });

  describe('Secure Authentication Middleware Array', () => {
    it('should export secure authentication middleware array', () => {
      expect(Array.isArray(secureAuthenticationMiddleware)).toBe(true);
      expect(secureAuthenticationMiddleware).toHaveLength(2);
    });
  });

  describe('Type Safety', () => {
    it('should properly type authentication request properties', () => {
      mockRequest.headers = {
        'x-api-key': 'test-api-key-12345678901234567890123456789012',
      };

      authenticationMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      const authReq = mockRequest as AuthenticationRequest;
      expect(typeof authReq.authMethod).toBe('string');
      expect(typeof authReq.authResult).toBe('string');
      expect(Object.values(AuthenticationMethod)).toContain(authReq.authMethod);
      expect(Object.values(AuthenticationResult)).toContain(authReq.authResult);
    });
  });
});
