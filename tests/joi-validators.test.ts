import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { claudeCompletionSchema, createJoiValidator, validateHeadersWithJoi } from '../src/validation/joi-validators.js';
import type { RequestWithCorrelationId } from '../src/types/index.js';
import { createMockResponse } from './types.js';

const { loggerWarn } = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
}));

type ChainableResponse = Response & {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};

const createChainableResponse = (): ChainableResponse => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };

  return res as ChainableResponse;
};

vi.mock('../src/middleware/logging.js', () => ({
  logger: {
    warn: loggerWarn,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const buildRequest = (body: Record<string, unknown>): Request & RequestWithCorrelationId => {
  return {
    body,
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
    path: '/v1/completions',
    correlationId: 'joi-validation-test',
  } as Request & RequestWithCorrelationId;
};

describe('Joi validators', () => {
  it('accepts valid Claude completion payloads', () => {
    const payload = {
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        {
          role: 'user',
          content: 'Explain observability best practices.',
        },
      ],
      max_tokens: 512,
      tools: [
        {
          name: 'search_docs',
          description: 'search knowledge base',
          input_schema: {},
        },
      ],
    };

    const { error, value } = claudeCompletionSchema.validate(payload);
    expect(error).toBeUndefined();
    expect(value).toMatchObject(payload);
  });

  it('rejects invalid model identifiers', () => {
    const payload = {
      model: 'unsupported-model',
      messages: [{ role: 'user', content: 'hi' }],
    };

    const { error } = claudeCompletionSchema.validate(payload);
    expect(error).toBeDefined();
  });

  it('invokes next middleware when validation succeeds', () => {
    const validator = createJoiValidator(claudeCompletionSchema, 'body');
    const req = buildRequest({
      model: 'claude-3-5-haiku-20241022',
      messages: [{ role: 'user', content: 'test' }],
    });
    const res = createMockResponse();
    const next = vi.fn();

    validator(req as Request, res as unknown as Response, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns structured errors for invalid payloads', () => {
    const validator = createJoiValidator(claudeCompletionSchema, 'body');
    const req = buildRequest({ model: 'gpt-5', messages: [] });
    const res = createChainableResponse();
    const next = vi.fn();

    validator(req as Request, res as unknown as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0]?.[0]).toMatchObject({
      error: {
        type: 'invalid_request_error',
        correlationId: 'joi-validation-test',
      },
    });
    expect(loggerWarn).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('validates headers consistently', () => {
    const req = {
      headers: {
        'content-type': 'text/plain',
      },
      method: 'POST',
      path: '/v1/completions',
      correlationId: 'header-validation',
    } as Request & RequestWithCorrelationId;

    const res = createChainableResponse();
    const next = vi.fn();

    validateHeadersWithJoi(req as Request, res as unknown as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(loggerWarn).toHaveBeenCalled();
  });
});
