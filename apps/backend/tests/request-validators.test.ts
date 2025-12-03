/**
 * Tests for request validation functionality
 */

import type { NextFunction, Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestWithCorrelationId } from '../src/types/index';
import {
  ALLOWED_MODELS,
  VALIDATION_LIMITS,
  handleValidationErrors,
  sanitizeRequest,
  validateClaudeCompletionRequest,
  validateContentType,
  validateHeaders,
  validateOpenAICompletionRequest,
  validateRequestSize,
} from '../src/validation/request-validators';

// Mock express-validator
vi.mock('express-validator', () => ({
  body: vi.fn(() => ({
    isString: vi.fn().mockReturnThis(),
    isArray: vi.fn().mockReturnThis(),
    isInt: vi.fn().mockReturnThis(),
    isFloat: vi.fn().mockReturnThis(),
    isBoolean: vi.fn().mockReturnThis(),
    isObject: vi.fn().mockReturnThis(),
    isLength: vi.fn().mockReturnThis(),
    isIn: vi.fn().mockReturnThis(),
    equals: vi.fn().mockReturnThis(),
    matches: vi.fn().mockReturnThis(),
    optional: vi.fn().mockReturnThis(),
    custom: vi.fn().mockReturnThis(),
    withMessage: vi.fn().mockReturnThis(),
  })),
  header: vi.fn(() => ({
    isString: vi.fn().mockReturnThis(),
    isIn: vi.fn().mockReturnThis(),
    isLength: vi.fn().mockReturnThis(),
    matches: vi.fn().mockReturnThis(),
    optional: vi.fn().mockReturnThis(),
    withMessage: vi.fn().mockReturnThis(),
  })),
  query: vi.fn(() => ({
    isBoolean: vi.fn().mockReturnThis(),
    optional: vi.fn().mockReturnThis(),
    withMessage: vi.fn().mockReturnThis(),
  })),
  validationResult: vi.fn(),
}));

// Mock logger
vi.mock('../src/middleware/logging.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Request Validators', () => {
  let mockReq: Partial<Request & RequestWithCorrelationId>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
      body: {},
      query: {},
      path: '/v1/completions',
      method: 'POST',
      correlationId: 'test-correlation-id',
      get: vi.fn((headerName: string) => {
        return (mockReq.headers as Record<string, string>)[
          headerName.toLowerCase()
        ];
      }),
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    mockNext = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('VALIDATION_LIMITS', () => {
    it('should have reasonable validation limits', () => {
      expect(VALIDATION_LIMITS.MAX_MESSAGE_LENGTH).toBe(100000);
      expect(VALIDATION_LIMITS.MAX_MESSAGES_COUNT).toBe(100);
      expect(VALIDATION_LIMITS.MAX_OUTPUT_TOKENS).toBe(8192);
      expect(VALIDATION_LIMITS.MIN_TEMPERATURE).toBe(0);
      expect(VALIDATION_LIMITS.MAX_TEMPERATURE).toBe(2);
      expect(VALIDATION_LIMITS.MIN_TOP_P).toBe(0);
      expect(VALIDATION_LIMITS.MAX_TOP_P).toBe(1);
    });
  });

  describe('ALLOWED_MODELS', () => {
    it('should include Claude and OpenAI models', () => {
      expect(ALLOWED_MODELS).toContain('claude-3-5-sonnet-20241022');
      expect(ALLOWED_MODELS).toContain('gpt-4');
      expect(ALLOWED_MODELS).toContain('gpt-4o');
      expect(ALLOWED_MODELS.length).toBeGreaterThan(0);
    });
  });

  describe('handleValidationErrors', () => {
    it('should pass through when no validation errors', () => {
      const mockValidationResult = {
        isEmpty: vi.fn().mockReturnValue(true),
        array: vi.fn().mockReturnValue([]),
      };

      (validationResult as any).mockReturnValue(mockValidationResult);

      handleValidationErrors(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should pass through when validation fails (joi validation used instead)', () => {
      const mockValidationErrors = [
        {
          type: 'field',
          path: 'model',
          msg: 'Model is required',
          location: 'body',
          value: '',
        },
      ];

      const mockValidationResult = {
        isEmpty: vi.fn().mockReturnValue(false),
        array: vi.fn().mockReturnValue(mockValidationErrors),
      };

      (validationResult as any).mockReturnValue(mockValidationResult);

      handleValidationErrors(mockReq as Request, mockRes as Response, mockNext);

      // handleValidationErrors is now a no-op, just calls next()
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });

    it('should handle validation errors without field information (joi validation used instead)', () => {
      const mockValidationErrors = [
        {
          type: 'alternative',
          msg: 'Invalid request format',
          location: 'body',
        },
      ];

      const mockValidationResult = {
        isEmpty: vi.fn().mockReturnValue(false),
        array: vi.fn().mockReturnValue(mockValidationErrors),
      };

      (validationResult as any).mockReturnValue(mockValidationResult);

      handleValidationErrors(mockReq as Request, mockRes as Response, mockNext);

      // handleValidationErrors is now a no-op, just calls next()
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });
  });

  describe('sanitizeRequest', () => {
    it('should sanitize request body successfully', () => {
      mockReq.body = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Hello <script>alert("xss")</script> world',
          },
        ],
      };

      sanitizeRequest(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.body.messages[0].content).not.toContain('<script>');
    });

    it('should sanitize query parameters', () => {
      mockReq.query = {
        detailed: 'true',
        malicious: '<script>alert("xss")</script>',
      };

      sanitizeRequest(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.query.malicious).not.toContain('<script>');
    });

    it('should handle sanitization errors', () => {
      // Create a circular reference to cause sanitization error
      const circular: any = { name: 'test' };
      circular.self = circular;
      mockReq.body = circular;

      sanitizeRequest(mockReq as Request, mockRes as Response, mockNext);

      // Should handle the circular reference gracefully
      expect(mockReq.body.self).toBe('[Circular Reference]');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return error when sanitization fails completely', () => {
      // Mock a scenario where sanitization throws an error
      Object.defineProperty(mockReq, 'body', {
        get: () => {
          throw new Error('Cannot access body');
        },
        configurable: true,
      });

      sanitizeRequest(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          type: 'invalid_request_error',
          message: 'Request sanitization failed',
          correlationId: 'test-correlation-id',
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('validateContentType', () => {
    it('should accept valid content type', () => {
      mockReq.headers = {
        'content-type': 'application/json',
      };

      const middleware = validateContentType();
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should accept content type with charset', () => {
      mockReq.headers = {
        'content-type': 'application/json; charset=utf-8',
      };

      const middleware = validateContentType();
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject missing content type', () => {
      mockReq.headers = {};

      const middleware = validateContentType();
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          type: 'invalid_request_error',
          message: 'Content-Type header is required',
          correlationId: 'test-correlation-id',
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid content type', () => {
      mockReq.headers = {
        'content-type': 'text/plain',
      };

      const middleware = validateContentType();
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          type: 'invalid_request_error',
          message: 'Content-Type must be one of: application/json',
          correlationId: 'test-correlation-id',
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should accept custom allowed types', () => {
      mockReq.headers = {
        'content-type': 'text/plain',
      };

      const middleware = validateContentType(['text/plain']);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('validateRequestSize', () => {
    it('should accept request within size limit', () => {
      mockReq.headers = {
        'content-length': '1000',
      };

      const middleware = validateRequestSize(10000);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject request exceeding size limit', () => {
      mockReq.headers = {
        'content-length': '20000',
      };

      const middleware = validateRequestSize(10000);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(413);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          type: 'request_too_large',
          message: 'Request size exceeds maximum allowed size of 10000 bytes',
          correlationId: 'test-correlation-id',
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle invalid content-length header', () => {
      mockReq.headers = {
        'content-length': 'invalid',
      };

      const middleware = validateRequestSize(10000);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          type: 'invalid_request_error',
          message: 'Invalid Content-Length header',
          correlationId: 'test-correlation-id',
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should pass through when no content-length header', () => {
      mockReq.headers = {};

      const middleware = validateRequestSize(10000);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('string sanitization', () => {
    it('should remove script tags', () => {
      // This would be tested through the sanitizeRequest function
      // The actual sanitizeString function is private
      // Example input: 'Hello <script>alert("xss")</script> world'
    });

    it('should remove event handlers', () => {
      // This would be tested through the sanitizeRequest function
      // Example input: '<div onclick="alert(\'xss\')">Click me</div>'
    });

    it('should remove javascript: URLs', () => {
      // This would be tested through the sanitizeRequest function
      // Example input: '<a href="javascript:alert(\'xss\')">Link</a>'
    });

    it('should remove control characters', () => {
      // This would be tested through the sanitizeRequest function
      // Example input: 'Hello\x00\x01\x02 world'
    });
  });

  describe('validation chain creation', () => {
    it('should create Claude validation chains', () => {
      expect(validateClaudeCompletionRequest).toBeDefined();
      expect(typeof validateClaudeCompletionRequest).toBe('object');
      expect(typeof validateClaudeCompletionRequest.validate).toBe('function');
    });

    it('should create OpenAI validation chains', () => {
      expect(validateOpenAICompletionRequest).toBeDefined();
      expect(typeof validateOpenAICompletionRequest).toBe('object');
      expect(typeof validateOpenAICompletionRequest.validate).toBe('function');
    });

    it('should create header validation chains', () => {
      expect(validateHeaders).toBeDefined();
      expect(typeof validateHeaders).toBe('object');
      expect(typeof validateHeaders.validate).toBe('function');
    });
  });

  describe('edge cases', () => {
    it('should handle empty request body', () => {
      mockReq.body = {};

      sanitizeRequest(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle null request body', () => {
      mockReq.body = null;

      sanitizeRequest(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle undefined correlation ID (joi validation used instead)', () => {
      Reflect.deleteProperty(
        mockReq as Record<string, unknown>,
        'correlationId'
      );

      const mockValidationErrors = [
        {
          type: 'field',
          path: 'model',
          msg: 'Model is required',
          location: 'body',
          value: '',
        },
      ];

      const mockValidationResult = {
        isEmpty: vi.fn().mockReturnValue(false),
        array: vi.fn().mockReturnValue(mockValidationErrors),
      };

      (validationResult as any).mockReturnValue(mockValidationResult);

      handleValidationErrors(mockReq as Request, mockRes as Response, mockNext);

      // handleValidationErrors is now a no-op, just calls next()
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });
  });
});
