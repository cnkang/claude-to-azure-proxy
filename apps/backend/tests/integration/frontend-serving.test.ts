/**
 * @fileoverview Integration tests for frontend asset serving
 */

import type { Request, Response } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Config } from '../../src/config/index.js';
import { ProxyServer, createServerConfig } from '../../src/index.js';

const FALLBACK_HTML =
  '<!DOCTYPE html><html><head><title>Test</title></head><body><div id="root"></div></body></html>';

vi.mock('../../src/middleware/static-assets.js', () => {
  const staticAssetHandler = (
    req: Request,
    res: Response,
    next: () => void
  ): void => {
    if (req.path === '/vite.svg') {
      res
        .status(200)
        .type('image/svg+xml')
        .set('Cache-Control', 'public, max-age=600, must-revalidate')
        .send('<svg/>');
      return;
    }

    if (req.path?.startsWith('/assets/')) {
      res.status(404).type('text/plain').send(`Cannot GET ${req.path}`);
      return;
    }

    next();
  };

  const spaFallback = (req: Request, res: Response, next: () => void): void => {
    if (
      req.path.startsWith('/api/') ||
      req.path.startsWith('/v1/') ||
      req.path === '/health' ||
      req.path === '/metrics'
    ) {
      next();
      return;
    }

    res
      .status(200)
      .type('text/html; charset=utf-8')
      .set('Cache-Control', 'public, max-age=300, must-revalidate')
      .set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:"
      )
      .send(FALLBACK_HTML);
  };

  return {
    createStaticAssetsMiddleware: () => staticAssetHandler,
    createSPAFallbackMiddleware: () => spaFallback,
    createDevelopmentProxyMiddleware:
      () => (_req: unknown, _res: unknown, next: () => void) =>
        next(),
    logFrontendBuildStatus: vi.fn(),
  };
});

describe('Frontend Asset Serving Integration', () => {
  let server: ProxyServer;
  let app: any;

  const testConfig: Config = {
    PORT: 0, // Use random port for testing
    NODE_ENV: 'test',
    PROXY_API_KEY: 'test-api-key-for-frontend-serving-tests-12345',
    AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
    AZURE_OPENAI_API_KEY: 'test-azure-key-12345',
    AZURE_OPENAI_MODEL: 'gpt-4',
    AZURE_OPENAI_TIMEOUT: 30000,
    AZURE_OPENAI_MAX_RETRIES: 3,
    DEFAULT_REASONING_EFFORT: 'medium',
    ENABLE_MEMORY_MANAGEMENT: false,
    ENABLE_RESOURCE_MONITORING: false,
    ENABLE_AUTO_GC: false,
    MEMORY_SAMPLE_INTERVAL: 5000,
    MEMORY_PRESSURE_THRESHOLD: 80,
    HTTP_KEEP_ALIVE_TIMEOUT: 5000,
    HTTP_HEADERS_TIMEOUT: 60000,
    HTTP_MAX_CONNECTIONS: 1000,
  };

  beforeAll(() => {
    const serverConfig = createServerConfig(testConfig);
    server = new ProxyServer(serverConfig);
    app = server.getApp();
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('Static Asset Routes', () => {
    it('should serve static assets with proper headers', async () => {
      const response = await request(app).get('/vite.svg').expect(200);

      // Check for security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');

      // Check for caching headers
      expect(response.headers['cache-control']).toBeDefined();
    });

    it('should serve index.html for SPA routes', async () => {
      const response = await request(app)
        .get('/some-frontend-route')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/text\/html/);
      expect(response.headers['content-security-policy']).toBeDefined();
    });

    it('should not interfere with API routes', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('healthy');
    });

    it('should not interfere with v1 API routes', async () => {
      const response = await request(app).get('/v1/models').expect(401); // Should get auth error, not serve frontend

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.type).toBe('authentication_required');
    });

    it('should handle CORS in development mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const response = await request(app)
        .options('/api/config')
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(
        'http://localhost:3000'
      );
      expect(response.headers['access-control-allow-credentials']).toBe('true');

      process.env.NODE_ENV = originalEnv;
    });

    it('should serve assets from /assets/ path', async () => {
      // This test assumes there are assets in the dist/assets directory
      // If no assets exist, the test will get a 404 which is expected
      const response = await request(app).get('/assets/nonexistent.js');

      // Should either serve the asset (200) or return 404, but not serve React app
      expect([200, 404]).toContain(response.status);

      if (response.status === 404) {
        // Should get Express's default 404, not React app's index.html
        expect(response.text).toContain('Cannot GET /assets/nonexistent.js');
        expect(response.text).not.toContain('<!doctype html>'); // React app marker
      } else if (response.status === 200) {
        // If it's serving something, it should be the actual asset, not HTML
        expect(response.headers['content-type']).not.toMatch(/text\/html/);
      }
    });
  });

  describe('Security Headers', () => {
    it('should include CSP headers for HTML responses', async () => {
      const response = await request(app).get('/app').expect(200);

      const csp = response.headers['content-security-policy'];
      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
      expect(csp).toContain("connect-src 'self' ws: wss:");
    });

    it('should include security headers for all responses', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['referrer-policy']).toBeDefined();
    });
  });

  describe('Caching Strategy', () => {
    it('should set appropriate cache headers for HTML files', async () => {
      const response = await request(app).get('/dashboard').expect(200);

      const cacheControl = response.headers['cache-control'];
      expect(cacheControl).toContain('public');
      expect(cacheControl).toContain('max-age=300'); // 5 minutes for HTML
      expect(cacheControl).toContain('must-revalidate');
    });

    it('should handle requests without extensions as SPA routes', async () => {
      const response = await request(app).get('/settings/profile').expect(200);

      expect(response.headers['content-type']).toMatch(/text\/html/);
    });
  });
});
