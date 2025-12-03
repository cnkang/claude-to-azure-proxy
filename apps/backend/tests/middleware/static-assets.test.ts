/**
 * @fileoverview Tests for static assets middleware
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkFrontendBuildExists,
  createDevelopmentProxyMiddleware,
  createSPAFallbackMiddleware,
  createStaticAssetsMiddleware,
  logFrontendBuildStatus,
} from '../../src/middleware/static-assets.js';

// Mock fs promises
vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../src/middleware/logging.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Static Assets Middleware', () => {
  let app: express.Application;
  const mockBuildPath = '/test/build/path';

  beforeEach(() => {
    app = express();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createStaticAssetsMiddleware', () => {
    it('should create middleware with default configuration', () => {
      const middleware = createStaticAssetsMiddleware();
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });

    it('should create middleware with custom configuration', () => {
      const config = {
        buildPath: mockBuildPath,
        maxAge: 3600,
        enableCompression: false,
        enableETag: false,
      };

      const middleware = createStaticAssetsMiddleware(config);
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });
  });

  describe('createSPAFallbackMiddleware', () => {
    it('should create SPA fallback middleware', () => {
      const middleware = createSPAFallbackMiddleware();
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });

    it('should skip API routes', async () => {
      const middleware = createSPAFallbackMiddleware({
        buildPath: mockBuildPath,
      });

      app.use((req, res, next) => {
        (req as any).correlationId = 'test-correlation-id';
        next();
      });
      app.use(middleware);
      app.use('/api/test', (req, res) => {
        res.json({ message: 'API endpoint' });
      });

      const response = await request(app).get('/api/test');
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('API endpoint');
    });

    it('should skip routes with file extensions', async () => {
      const middleware = createSPAFallbackMiddleware({
        buildPath: mockBuildPath,
      });

      app.use((req, res, next) => {
        (req as any).correlationId = 'test-correlation-id';
        next();
      });
      app.use(middleware);
      app.use('/test.js', (req, res) => {
        res.send('JavaScript file');
      });

      const response = await request(app).get('/test.js');
      expect(response.status).toBe(200);
      expect(response.text).toBe('JavaScript file');
    });

    it('should handle missing index.html gracefully', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('File not found'));

      const middleware = createSPAFallbackMiddleware({
        buildPath: mockBuildPath,
      });

      app.use((req, res, next) => {
        (req as any).correlationId = 'test-correlation-id';
        next();
      });
      app.use(middleware);
      app.use((req, res) => {
        res.status(404).send('Not found');
      });

      const response = await request(app).get('/some-route');
      expect(response.status).toBe(404);
    });
  });

  describe('createDevelopmentProxyMiddleware', () => {
    it('should create development proxy middleware', () => {
      const middleware = createDevelopmentProxyMiddleware();
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });

    it('should skip in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const middleware = createDevelopmentProxyMiddleware();

      app.use((req, res, next) => {
        (req as any).correlationId = 'test-correlation-id';
        next();
      });
      app.use(middleware);
      app.use((req, res) => {
        res.json({ env: process.env.NODE_ENV });
      });

      const response = await request(app).get('/test');
      expect(response.status).toBe(200);
      expect(response.body.env).toBe('production');

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle OPTIONS requests in development', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const middleware = createDevelopmentProxyMiddleware();

      app.use((req, res, next) => {
        (req as any).correlationId = 'test-correlation-id';
        next();
      });
      app.use(middleware);

      const response = await request(app)
        .options('/test')
        .set('Origin', 'http://localhost:3000');

      expect(response.status).toBe(200);

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('checkFrontendBuildExists', () => {
    it('should return true when build exists', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await checkFrontendBuildExists(mockBuildPath);
      expect(result).toBe(true);
      expect(fs.access).toHaveBeenCalledWith(mockBuildPath);
      expect(fs.access).toHaveBeenCalledWith(
        path.join(mockBuildPath, 'index.html')
      );
    });

    it('should return false when build does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('File not found'));

      const result = await checkFrontendBuildExists(mockBuildPath);
      expect(result).toBe(false);
    });
  });

  describe('logFrontendBuildStatus', () => {
    it('should log success when build exists', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      const { logger } = await import('../../src/middleware/logging.js');

      await logFrontendBuildStatus(mockBuildPath);

      expect(logger.info).toHaveBeenCalledWith(
        'Frontend build detected, serving React application',
        '',
        expect.objectContaining({
          buildPath: mockBuildPath,
          indexPath: path.join(mockBuildPath, 'index.html'),
        })
      );
    });

    it('should log warning when build does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('File not found'));
      const { logger } = await import('../../src/middleware/logging.js');

      await logFrontendBuildStatus(mockBuildPath);

      expect(logger.warn).toHaveBeenCalledWith(
        'Frontend build not found, API-only mode',
        '',
        expect.objectContaining({
          buildPath: mockBuildPath,
          suggestion:
            'Run "pnpm build" in apps/frontend to build the React application',
        })
      );
    });
  });
});
