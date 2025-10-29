/**
 * Tests for format detection middleware
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  formatDetectionMiddleware,
  hasFormatDetection,
} from '../../src/middleware/format-detection.js';

// Mock logger
vi.mock('../../src/middleware/logging.js', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Format Detection Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
      body: {},
      path: '/v1/completions',
      method: 'POST',
    };
    mockRes = {};
    mockNext = vi.fn();
  });

  describe('Claude Format Detection', () => {
    it('should detect Claude format with system message', () => {
      mockReq.body = {
        model: 'claude-3-5-sonnet-20241022',
        system: 'You are a helpful assistant',
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
        max_tokens: 100,
      };
      (mockReq as any).correlationId = 'test-correlation-id';

      formatDetectionMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).requestFormat).toBe('claude');
      expect((mockReq as any).responseFormat).toBe('claude');
      expect(typeof (mockReq as any).formatDetectionTime).toBe('number');
    });

    it('should detect Claude format with content blocks', () => {
      mockReq.body = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Hello',
              },
            ],
          },
        ],
        max_tokens: 100,
      };
      (mockReq as any).correlationId = 'test-correlation-id';

      formatDetectionMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).requestFormat).toBe('claude');
      expect((mockReq as any).responseFormat).toBe('claude');
    });

    it('should detect Claude format with anthropic-version header', () => {
      mockReq.body = {
        model: 'claude-3-5-sonnet-20241022',
        'anthropic-version': '2023-06-01',
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
        max_tokens: 100,
      };
      (mockReq as any).correlationId = 'test-correlation-id';

      formatDetectionMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).requestFormat).toBe('claude');
      expect((mockReq as any).responseFormat).toBe('claude');
    });
  });

  describe('OpenAI Format Detection', () => {
    it('should detect OpenAI format with max_completion_tokens', () => {
      mockReq.body = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
        max_completion_tokens: 100,
      };
      (mockReq as any).correlationId = 'test-correlation-id';

      formatDetectionMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).requestFormat).toBe('openai');
      expect((mockReq as any).responseFormat).toBe('openai');
    });

    it('should detect OpenAI format with OpenAI tools', () => {
      mockReq.body = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather information',
              parameters: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                },
              },
            },
          },
        ],
      };
      (mockReq as any).correlationId = 'test-correlation-id';

      formatDetectionMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).requestFormat).toBe('openai');
      expect((mockReq as any).responseFormat).toBe('openai');
    });

    it('should detect OpenAI format with tool role', () => {
      mockReq.body = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'What is the weather?',
          },
          {
            role: 'tool',
            content: 'Weather data...',
            tool_call_id: 'call_123',
          },
        ],
        max_completion_tokens: 100, // Add this to make it clearly OpenAI format
      };
      (mockReq as any).correlationId = 'test-correlation-id';

      formatDetectionMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).requestFormat).toBe('openai');
      expect((mockReq as any).responseFormat).toBe('openai');
    });
  });

  describe('Default Behavior', () => {
    it('should default to Claude format for ambiguous requests', () => {
      mockReq.body = {
        model: 'some-model',
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
        max_tokens: 100,
      };
      (mockReq as any).correlationId = 'test-correlation-id';

      formatDetectionMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).requestFormat).toBe('claude');
      expect((mockReq as any).responseFormat).toBe('claude');
    });

    it('should default to Claude format on detection error', () => {
      mockReq.body = null; // Invalid body that will cause error
      (mockReq as any).correlationId = 'test-correlation-id';

      formatDetectionMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).requestFormat).toBe('claude');
      expect((mockReq as any).responseFormat).toBe('claude');
      expect(typeof (mockReq as any).formatDetectionTime).toBe('number');
    });
  });

  describe('Type Guard', () => {
    it('should correctly identify requests with format detection', () => {
      const reqWithFormat = {
        requestFormat: 'claude',
        responseFormat: 'claude',
        formatDetectionTime: 10,
      } as any;

      expect(hasFormatDetection(reqWithFormat)).toBe(true);
    });

    it('should correctly identify requests without format detection', () => {
      const reqWithoutFormat = {} as any;

      expect(hasFormatDetection(reqWithoutFormat)).toBe(false);
    });
  });

  describe('Performance', () => {
    it('should complete format detection quickly', () => {
      mockReq.body = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
        max_tokens: 100,
      };
      (mockReq as any).correlationId = 'test-correlation-id';

      const startTime = Date.now();
      formatDetectionMiddleware(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );
      const endTime = Date.now();

      expect(mockNext).toHaveBeenCalled();
      expect(endTime - startTime).toBeLessThan(100); // Should complete in under 100ms
      expect((mockReq as any).formatDetectionTime).toBeLessThan(100);
    });
  });
});
