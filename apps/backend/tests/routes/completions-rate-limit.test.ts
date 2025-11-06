import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import { completionsRateLimitHandler } from '../../src/routes/completions-rate-limit-handler';

vi.mock('../../src/middleware/logging.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const { logger: loggerMock } = await import('../../src/middleware/logging.js');

const createResponse = (): Response => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
  return res as unknown as Response;
};

describe('completionsRateLimitHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs warnings with provided correlation IDs', () => {
    const req = {
      correlationId: 'corr-rate-1',
      ip: '127.0.0.1',
      headers: { 'user-agent': 'vitest' },
      method: 'POST',
      url: '/v1/completions',
    } as unknown as Request;
    const res = createResponse();

    completionsRateLimitHandler(req, res);

    expect(loggerMock.warn).toHaveBeenCalledWith(
      'Completions rate limit exceeded',
      'corr-rate-1',
      expect.objectContaining({ ip: '127.0.0.1' })
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          correlationId: 'corr-rate-1',
        }),
      })
    );
  });

  it('falls back to unknown correlation ID when header is missing', () => {
    const req = {
      ip: '10.0.0.5',
      headers: { 'user-agent': 'vitest' },
      method: 'POST',
      url: '/v1/completions',
    } as unknown as Request;
    const res = createResponse();

    completionsRateLimitHandler(req, res);

    expect(loggerMock.warn).toHaveBeenCalledWith(
      'Completions rate limit exceeded',
      'unknown',
      expect.any(Object)
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          correlationId: 'unknown',
        }),
      })
    );
  });
});
