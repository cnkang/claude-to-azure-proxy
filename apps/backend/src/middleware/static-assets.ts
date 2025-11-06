/**
 * @fileoverview Static asset serving middleware for React frontend integration.
 *
 * This module provides middleware for serving the React frontend application
 * built assets with proper caching headers, security configurations, and
 * fallback handling for single-page application routing.
 *
 * @author Claude-to-Azure Proxy Team
 * @version 2.0.0
 * @since 1.0.0
 */

import express from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import type { Request, Response, NextFunction } from 'express';
import type { RequestWithCorrelationId } from '../types/index.js';
import { logger } from './logging.js';

/**
 * Configuration for static asset serving.
 */
interface StaticAssetsConfig {
  /** Path to the frontend build directory */
  buildPath: string;
  /** Maximum age for static assets in seconds */
  maxAge: number;
  /** Whether to enable compression */
  enableCompression: boolean;
  /** Whether to enable ETag generation */
  enableETag: boolean;
  /** Custom headers to add to static assets */
  customHeaders?: Record<string, string>;
}

/**
 * Default configuration for static assets.
 */
const DEFAULT_CONFIG: StaticAssetsConfig = {
  buildPath: path.resolve(process.cwd(), 'apps/frontend/dist'),
  maxAge: 31536000, // 1 year for static assets
  enableCompression: true,
  enableETag: true,
  customHeaders: {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
  },
};

/**
 * Creates middleware for serving static assets with proper caching and security headers.
 *
 * @param config - Configuration for static asset serving
 * @returns Express middleware function
 */
export const createStaticAssetsMiddleware = (
  config: Partial<StaticAssetsConfig> = {}
): express.RequestHandler => {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  // Create Express static middleware with optimized settings
  const staticMiddleware = express.static(finalConfig.buildPath, {
    maxAge: finalConfig.maxAge * 1000, // Convert to milliseconds
    etag: finalConfig.enableETag,
    lastModified: true,
    immutable: true, // Assets are immutable (have hash in filename)
    setHeaders: (res: Response, filePath: string) => {
      // Add security headers
      if (finalConfig.customHeaders) {
        Object.entries(finalConfig.customHeaders).forEach(([key, value]) => {
          res.setHeader(key, value);
        });
      }

      // Set appropriate cache headers based on file type
      const ext = path.extname(filePath).toLowerCase();

      if (['.js', '.css', '.woff', '.woff2', '.ttf', '.eot'].includes(ext)) {
        // Long cache for versioned assets
        res.setHeader(
          'Cache-Control',
          `public, max-age=${finalConfig.maxAge}, immutable`
        );
      } else if (['.html', '.json'].includes(ext)) {
        // Short cache for HTML and JSON files
        res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
      } else if (
        ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'].includes(ext)
      ) {
        // Medium cache for images
        res.setHeader(
          'Cache-Control',
          `public, max-age=${Math.floor(finalConfig.maxAge / 12)}`
        );
      }

      // Add Content-Security-Policy for HTML files
      if (ext === '.html') {
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: blob:; " +
            "font-src 'self' data:; " +
            "connect-src 'self' ws: wss:; " +
            "media-src 'self'; " +
            "object-src 'none'; " +
            "base-uri 'self'; " +
            "form-action 'self'"
        );
      }
    },
  });

  return staticMiddleware;
};

/**
 * Creates middleware for serving the React application with SPA fallback.
 *
 * This middleware serves the index.html file for any request that doesn't
 * match a static asset or API route, enabling client-side routing.
 *
 * @param config - Configuration for static asset serving
 * @returns Express middleware function
 */
export const createSPAFallbackMiddleware = (
  config: Partial<StaticAssetsConfig> = {}
): express.RequestHandler => {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const indexPath = path.join(finalConfig.buildPath, 'index.html');

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const { correlationId } = req as RequestWithCorrelationId;

    try {
      // Skip if this is an API request
      if (
        req.path.startsWith('/api/') ||
        req.path.startsWith('/v1/') ||
        req.path === '/health' ||
        req.path === '/metrics'
      ) {
        next();
        return;
      }

      // Skip if this is a request for a static asset with extension
      const hasExtension = path.extname(req.path) !== '';
      if (hasExtension) {
        next();
        return;
      }

      // Skip if this is a request for assets directory
      if (req.path.startsWith('/assets/') || req.path.startsWith('/static/')) {
        next();
        return;
      }

      // Check if index.html exists
      try {
        await fs.access(indexPath);
      } catch {
        logger.warn(
          'Frontend index.html not found, skipping SPA fallback',
          correlationId,
          {
            indexPath,
            requestPath: req.path,
          }
        );
        next();
        return;
      }

      // Serve index.html for SPA routing
      logger.debug('Serving SPA fallback for frontend route', correlationId, {
        requestPath: req.path,
        indexPath,
      });

      // Set appropriate headers for HTML
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');

      // Add security headers
      if (finalConfig.customHeaders) {
        Object.entries(finalConfig.customHeaders).forEach(([key, value]) => {
          res.setHeader(key, value);
        });
      }

      // Add CSP header for the main application
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: blob:; " +
          "font-src 'self' data:; " +
          "connect-src 'self' ws: wss:; " +
          "media-src 'self'; " +
          "object-src 'none'; " +
          "base-uri 'self'; " +
          "form-action 'self'"
      );

      res.sendFile(indexPath);
    } catch (error) {
      logger.error('Error serving SPA fallback', correlationId, {
        error: error instanceof Error ? error.message : 'Unknown error',
        requestPath: req.path,
        indexPath,
      });
      next(error);
    }
  };
};

/**
 * Creates middleware for development API proxy configuration.
 *
 * This middleware adds CORS headers and other development-specific
 * configurations when running in development mode.
 *
 * @returns Express middleware function
 */
export const createDevelopmentProxyMiddleware = (): express.RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { correlationId } = req as RequestWithCorrelationId;

    // Only apply in development mode
    if (process.env.NODE_ENV !== 'development') {
      next();
      return;
    }

    logger.debug('Applying development proxy configuration', correlationId, {
      method: req.method,
      path: req.path,
      origin: req.get('Origin'),
    });

    // Add development-specific CORS headers
    const originHeader = req.get('Origin');
    if (
      typeof originHeader === 'string' &&
      (originHeader.includes('localhost') || originHeader.includes('127.0.0.1'))
    ) {
      res.setHeader('Access-Control-Allow-Origin', originHeader);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS'
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-api-key, x-session-id'
      );
    }

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    next();
  };
};

/**
 * Checks if the frontend build directory exists and contains the necessary files.
 *
 * @param buildPath - Path to the frontend build directory
 * @returns Promise that resolves to true if build exists, false otherwise
 */
export const checkFrontendBuildExists = async (
  buildPath: string
): Promise<boolean> => {
  try {
    // Check if build directory exists
    await fs.access(buildPath);

    // Check if index.html exists
    const indexPath = path.join(buildPath, 'index.html');
    await fs.access(indexPath);

    return true;
  } catch {
    return false;
  }
};

/**
 * Logs information about the frontend build status.
 *
 * @param buildPath - Path to the frontend build directory
 */
export const logFrontendBuildStatus = async (
  buildPath: string
): Promise<void> => {
  const buildExists = await checkFrontendBuildExists(buildPath);

  if (buildExists) {
    logger.info('Frontend build detected, serving React application', '', {
      buildPath,
      indexPath: path.join(buildPath, 'index.html'),
    });
  } else {
    logger.warn('Frontend build not found, API-only mode', '', {
      buildPath,
      suggestion:
        'Run "pnpm build" in apps/frontend to build the React application',
    });
  }
};
