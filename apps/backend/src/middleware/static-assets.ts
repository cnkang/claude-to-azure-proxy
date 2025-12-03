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

import { promises as fs } from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
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

const LONG_CACHE_EXTENSIONS = new Set([
  '.js',
  '.css',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
]);

const SHORT_CACHE_EXTENSIONS = new Set(['.html', '.json']);

const IMAGE_CACHE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
]);

const applyCustomHeaders = (
  res: Response,
  headers?: Record<string, string>
): void => {
  if (!headers) {
    return;
  }

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
};

const setCacheControlHeader = (
  res: Response,
  ext: string,
  maxAge: number
): void => {
  if (LONG_CACHE_EXTENSIONS.has(ext)) {
    res.setHeader('Cache-Control', `public, max-age=${maxAge}, immutable`);
    return;
  }

  if (SHORT_CACHE_EXTENSIONS.has(ext)) {
    res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
    return;
  }

  if (IMAGE_CACHE_EXTENSIONS.has(ext)) {
    res.setHeader('Cache-Control', `public, max-age=${Math.floor(maxAge / 12)}`);
  }
};

const applyContentSecurityPolicy = (res: Response, ext: string): void => {
  if (ext !== '.html') {
    return;
  }

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
};

const shouldBypassSpaRequest = (req: Request): boolean => {
  if (
    req.path.startsWith('/api/') ||
    req.path.startsWith('/v1/') ||
    req.path === '/health' ||
    req.path === '/metrics'
  ) {
    return true;
  }

  if (path.extname(req.path) !== '') {
    return true;
  }

  return req.path.startsWith('/assets/') || req.path.startsWith('/static/');
};

const ensureIndexExists = async (
  indexPath: string,
  correlationId: string,
  requestPath: string
): Promise<boolean> => {
  try {
    await fs.access(indexPath);
    return true;
  } catch (error) {
    logger.warn('SPA index file not found', correlationId, {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestPath,
      indexPath,
    });
    return false;
  }
};

const shouldServeSpaResponse = async (
  req: Request,
  indexPath: string,
  correlationId: string,
  next: NextFunction
): Promise<boolean> => {
  if (shouldBypassSpaRequest(req)) {
    next();
    return false;
  }

  const indexExists = await ensureIndexExists(indexPath, correlationId, req.path);
  if (!indexExists) {
    next();
    return false;
  }

  return true;
};

const processSpaFallback = async (
  req: Request,
  res: Response,
  next: NextFunction,
  indexPath: string,
  correlationId: string,
  customHeaders?: Record<string, string>
): Promise<void> => {
  const shouldServe = await shouldServeSpaResponse(
    req,
    indexPath,
    correlationId,
    next
  );
  if (!shouldServe) {
    return;
  }

  logger.debug('Serving SPA fallback for frontend route', correlationId, {
    requestPath: req.path,
    indexPath,
  });

  applySpaHeaders(res, customHeaders);
  await sendSpaIndexFile(res, req, indexPath, correlationId);
};

const handleSpaError = (
  error: unknown,
  req: Request,
  res: Response,
  indexPath: string,
  correlationId: string,
  next: NextFunction
): void => {
  logger.error('Error serving SPA fallback', correlationId, {
    error: error instanceof Error ? error.message : 'Unknown error',
    requestPath: req.path,
    indexPath,
  });

  if (!res.headersSent && !res.finished) {
    next(error);
  }
};

const applySpaHeaders = (
  res: Response,
  customHeaders?: Record<string, string>
): void => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
  applyCustomHeaders(res, customHeaders);
  applyContentSecurityPolicy(res, '.html');
};

const sendSpaIndexFile = async (
  res: Response,
  req: Request,
  indexPath: string,
  correlationId: string
): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    res.sendFile(indexPath, (err) => {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  }).catch((err) => {
    logger.error('Error sending index.html', correlationId, {
      error: err instanceof Error ? err.message : 'Unknown error',
      requestPath: req.path,
      indexPath,
      headersSent: res.headersSent,
    });

    if (!res.headersSent && !res.finished) {
      throw err;
    }
  });
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
    fallthrough: true, // Allow other middleware to handle if file not found
    setHeaders: (res: Response, filePath: string) => {
      // Check if headers already sent to prevent errors
      if (res.headersSent) {
        return;
      }

      const ext = path.extname(filePath).toLowerCase();

      applyCustomHeaders(res, finalConfig.customHeaders);

      // Set appropriate cache headers based on file type
      setCacheControlHeader(res, ext, finalConfig.maxAge);

      applyContentSecurityPolicy(res, ext);
    },
  });

  // Wrap the static middleware to prevent calling next() after response is sent
  return (req: Request, res: Response, next: NextFunction): void => {
    // Track if response was sent by this middleware
    const originalEnd = res.end.bind(res);
    let responseSent = false;

    // Override res.end to track when response is sent
    res.end = function (this: Response, ...args: unknown[]): Response {
      responseSent = true;
      // @ts-expect-error - originalEnd has complex overloads
      return originalEnd(...args);
    };

    // Call the static middleware
    staticMiddleware(req, res, (err?: unknown) => {
      // Only call next if response wasn't sent
      if (!responseSent && !res.headersSent && !res.finished) {
        next(err);
      }
    });
  };
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

    if (res.headersSent || res.finished) {
      return;
    }

    await processSpaFallback(
      req,
      res,
      next,
      indexPath,
      correlationId,
      finalConfig.customHeaders
    ).catch((error) =>
      handleSpaError(error, req, res, indexPath, correlationId, next)
    );
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

    if (res.headersSent) {
      next();
      return;
    }

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
