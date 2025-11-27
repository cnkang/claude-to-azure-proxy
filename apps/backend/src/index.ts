import express from 'express';
import cors from 'cors';
import { json, urlencoded } from 'express';
import { performance } from 'node:perf_hooks';
import { getHeapStatistics } from 'node:v8';
import path from 'path';
import fs from 'fs';
import { parseEnvInt } from '@repo/shared-utils';
import type { Request, Response } from 'express';
import type { ServerConfig, RequestWithCorrelationId } from './types/index';
import loadedConfig, {
  sanitizedConfig,
  createAzureOpenAIConfig,
} from './config/index';
import type { Config } from './config/index';
import {
  helmetConfig,
  globalRateLimit,
  correlationIdMiddleware,
  timeoutMiddleware,
  corsOptions,
} from './middleware/security';
import {
  requestLoggingMiddleware,
  errorLoggingMiddleware,
  logger,
} from './middleware/logging';
import {
  enhancedErrorHandler,
  memoryManagementMiddleware,
  responseGuard,
  loadShedding,
} from './middleware/index';
import { secureAuthenticationMiddleware } from './middleware/authentication';
import {
  createStaticAssetsMiddleware,
  createSPAFallbackMiddleware,
  createDevelopmentProxyMiddleware,
  logFrontendBuildStatus,
} from './middleware/static-assets';
import { healthCheckHandler } from './routes/health';
import {
  modelsHandler,
  getModelsHandler,
  getModelDetailsHandler,
  checkModelHealthHandler,
} from './routes/models';
import { metricsHandler, detailedMetricsHandler } from './routes/metrics';
import { completionsRateLimit, completionsHandler } from './routes/completions';
import {
  uploadFileHandler,
  getFileHandler,
  deleteFileHandler,
} from './routes/upload';
import { getClientConfig } from './routes/config';
import {
  createSessionHandler,
  getSessionHandler,
  validateSessionMiddleware,
  getSessionStatsHandler,
} from './routes/session';
import {
  getConversationsHandler,
  createConversationHandler,
  getConversationHandler,
  updateConversationHandler,
  deleteConversationHandler,
  addMessageHandler,
  getConversationStatsHandler,
} from './routes/conversations';
import {
  chatSSEHandler,
  sendChatMessageHandler,
  getConnectionsHandler,
  closeConnectionHandler,
  getChatStatsHandler,
} from './routes/chat-stream';
import { simpleChatHandler } from './routes/chat-simple.js';
import {
  getContextUsageHandler,
  extendContextHandler,
  compressContextHandler,
  createCompressedConversationHandler,
  getContextStatsHandler,
} from './routes/context';
import { getHealthMonitor } from './monitoring/health-monitor';
import { checkFeatureAvailability } from './resilience/graceful-degradation';
import { memoryManager, startMemoryMonitoring } from './utils/memory-manager';
import { StructuredLogger } from './utils/structured-logger';
import {
  resourceManager,
  createHTTPConnectionResource,
} from './runtime/resource-manager';
import {
  initializePerformanceOptimizations,
  performanceMonitor,
  memoryPressureHandler,
} from './config/performance';
import {
  getOptimizedHTTPClient,
  cleanupGlobalHTTPClient,
} from './runtime/optimized-http-client';
import {
  getOptimizedSSEHandler,
  cleanupGlobalSSEHandler,
} from './runtime/optimized-streaming-handler';
import {
  getPerformanceAlertSystem,
  cleanupGlobalPerformanceAlerts,
  type PerformanceAlert,
} from './monitoring/performance-alerts';
import {
  getServerHealthMonitor,
  cleanupServerHealthMonitor,
} from './monitoring/server-health';

/**
 * @fileoverview Main application entry point for the Claude-to-Azure OpenAI Proxy Server.
 *
 * This module implements a hardened TypeScript Express server that acts as an API gateway,
 * translating requests from Claude Code CLI format to Azure OpenAI v1 API format.
 * The server provides comprehensive security, monitoring, and resilience features
 * designed for production deployment on AWS App Runner.
 *
 * @author Claude-to-Azure Proxy Team
 * @version 2.0.0
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * // Basic usage
 * const config = createServerConfig(loadedConfig);
 * const server = new ProxyServer(config);
 * await server.start();
 * ```
 *
 * @example
 * ```bash
 * # Environment variables required
 * export PROXY_API_KEY="your-proxy-api-key"
 * export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com"
 * export AZURE_OPENAI_API_KEY="your-azure-api-key"
 * export AZURE_OPENAI_MODEL="your-model-deployment"
 * export PORT=8080
 * ```
 */

/**
 * Main proxy server class that handles HTTP requests and provides API gateway functionality.
 *
 * This class implements a comprehensive Express.js server with the following features:
 * - Type-safe request/response handling with TypeScript
 * - Comprehensive security middleware (Helmet, CORS, rate limiting)
 * - Authentication and authorization
 * - Request/response transformation between Claude and Azure OpenAI formats
 * - Health monitoring and graceful degradation
 * - Structured logging with correlation IDs
 * - Graceful shutdown handling
 *
 * @public
 * @class ProxyServer
 *
 * @example
 * ```typescript
 * const config: ServerConfig = {
 *   port: 8080,
 *   nodeEnv: 'production',
 *   proxyApiKey: 'secure-api-key',
 *   azureOpenAI: {
 *     endpoint: 'https://your-resource.openai.azure.com',
 *     apiKey: 'azure-api-key',
 *     model: 'gpt-4'
 *   }
 * };
 *
 * const server = new ProxyServer(config);
 * await server.start();
 * ```
 */
export class ProxyServer {
  /**
   * Express application instance with configured middleware and routes.
   * @private
   * @readonly
   */
  private readonly app: express.Application;

  /**
   * Server configuration containing all necessary settings for operation.
   * @private
   * @readonly
   */
  private readonly config: ServerConfig;

  /**
   * HTTP server instance, null until server is started.
   * @private
   */
  private server: import('http').Server | null = null;

  /**
   * Server startup timestamp for performance monitoring.
   * @private
   */
  private readonly startupTime: number;

  /**
   * Creates a new ProxyServer instance with the provided configuration.
   *
   * Initializes the Express application and sets up all middleware, routes,
   * and error handling. The server is not started until start() is called.
   *
   * @param config - Server configuration object containing all necessary settings
   *
   * @throws {Error} If configuration is invalid or middleware setup fails
   *
   * @example
   * ```typescript
   * const config: ServerConfig = {
   *   port: 8080,
   *   nodeEnv: 'production',
   *   proxyApiKey: 'secure-key',
   *   azureOpenAI: {
   *     endpoint: 'https://resource.openai.azure.com',
   *     apiKey: 'azure-key',
   *     model: 'gpt-4'
   *   }
   * };
   * const server = new ProxyServer(config);
   * ```
   */
  constructor(config: ServerConfig) {
    this.config = config;
    this.startupTime = performance.now();
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
    this.setupNodeJS24Optimizations();
  }

  /**
   * Sets up all Express middleware in the correct order for security and functionality.
   *
   * Middleware is applied in the following order:
   * 1. Trust proxy settings for AWS App Runner
   * 2. Security middleware (Helmet, CORS)
   * 3. Request processing (correlation ID, timeout, rate limiting)
   * 4. Resource management middleware
   * 5. Body parsing with size limits
   * 6. Request logging
   *
   * @private
   * @throws {Error} If middleware configuration fails
   */
  private setupMiddleware(): void {
    // Trust proxy for AWS App Runner and CloudFront
    // Use specific proxy configuration instead of trusting all proxies
    // This is more secure than 'trust proxy: true'
    this.app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

    // Disable unnecessary Express features for Node.js 24 optimization
    this.app.disable('x-powered-by');
    this.app.disable('etag');

    // Security middleware
    this.app.use(helmetConfig);
    this.app.use(cors(corsOptions));

    // Request processing middleware
    this.app.use(correlationIdMiddleware);
    
    // Response guard middleware to prevent duplicate header sends (Requirement 8.2)
    this.app.use(responseGuard);
    
    // Load shedding middleware for graceful degradation (Requirement 8.4)
    this.app.use(loadShedding);
    
    const configuredTimeout = this.config.azureOpenAI?.timeout;
    const timeoutMs =
      typeof configuredTimeout === 'number'
        ? configuredTimeout
        : parseEnvInt(
            typeof configuredTimeout === 'string'
              ? configuredTimeout
              : undefined,
            120000
          );

    this.app.use(timeoutMiddleware(timeoutMs)); // Use configured timeout
    this.app.use(globalRateLimit);

    // Memory management middleware for Node.js 24
    this.app.use(memoryManagementMiddleware);

    // Resource management middleware for Node.js 24
    this.app.use(this.resourceManagementMiddleware);

    // Body parsing with size limits
    this.app.use(
      json({
        limit: '10mb', // Allow larger payloads for AI requests with long context
        strict: true,
        type: 'application/json',
      })
    );

    this.app.use(
      (
        error: unknown,
        req: Request,
        res: Response,
        next: (err?: unknown) => void
      ) => {
        if (
          error !== null &&
          typeof error === 'object' &&
          'type' in error &&
          (error as { type?: string }).type === 'entity.too.large'
        ) {
          const requestWithCorrelationId = req as RequestWithCorrelationId;
          const correlationId = requestWithCorrelationId.correlationId;

          res.status(413).json({
            error: {
              type: 'request_entity_too_large',
              message: 'Request payload exceeds the allowed size limit',
              correlationId,
              timestamp: new Date().toISOString(),
            },
          });
          return;
        }

        next(error);
      }
    );

    this.app.use(
      urlencoded({
        extended: false,
        limit: '1mb',
        parameterLimit: 100, // Limit number of parameters
      })
    );

    // Logging middleware
    this.app.use(requestLoggingMiddleware);

    // Development proxy middleware (for CORS in development)
    this.app.use(createDevelopmentProxyMiddleware());
  }

  /**
   * Sets up all application routes with proper authentication and feature availability checks.
   *
   * Routes configured:
   * - GET /health - Health check endpoint for AWS App Runner
   * - GET / - Root endpoint with service information
   * - GET /v1/models - Claude API compatible models endpoint
   * - POST /v1/completions - Claude API compatible completions endpoint
   * - * - Catch-all for undefined routes (404 handler)
   *
   * All API routes require authentication and feature availability checks.
   *
   * @private
   * @throws {Error} If route configuration fails
   */
  private setupRoutes(): void {
    // Health check endpoint for AWS App Runner
    this.app.get(
      '/health',
      healthCheckHandler(this.config) as unknown as express.RequestHandler
    );

    // Metrics endpoints for monitoring (Requirement 4.5)
    this.app.get(
      '/metrics',
      secureAuthenticationMiddleware,
      metricsHandler as unknown as express.RequestHandler
    );

    this.app.get(
      '/metrics/detailed',
      secureAuthenticationMiddleware,
      detailedMetricsHandler as unknown as express.RequestHandler
    );

    // API info endpoint moved to /api/info to avoid conflict with frontend root
    this.app.get(
      '/api/info',
      (req: Readonly<Request>, res: Readonly<Response>) => {
        const { correlationId } = req as unknown as RequestWithCorrelationId;
        logger.info('API info endpoint accessed', correlationId);

        res.json({
          service: 'Claude-to-Azure Proxy',
          version: '1.0.0',
          status: 'running',
          correlationId,
        });
      }
    );

    // Claude API compatible endpoints with authentication and feature availability checks
    this.app.get(
      '/v1/models',
      secureAuthenticationMiddleware,
      checkFeatureAvailability('models') as express.RequestHandler,
      modelsHandler as unknown as express.RequestHandler
    );

    // Enhanced model routing endpoints for frontend
    this.app.get(
      '/api/models',
      secureAuthenticationMiddleware,
      getModelsHandler as unknown as express.RequestHandler
    );

    this.app.get(
      '/api/models/:modelId',
      secureAuthenticationMiddleware,
      getModelDetailsHandler as unknown as express.RequestHandler
    );

    this.app.post(
      '/api/models/:modelId/health',
      secureAuthenticationMiddleware,
      checkModelHealthHandler as unknown as express.RequestHandler
    );
    this.app.post(
      '/v1/completions',
      secureAuthenticationMiddleware,
      checkFeatureAvailability('completions') as express.RequestHandler,
      completionsRateLimit,
      completionsHandler(this.config) as unknown as express.RequestHandler
    );

    // Chat completions endpoint (modern Claude API compatibility)
    this.app.post(
      '/v1/chat/completions',
      secureAuthenticationMiddleware,
      checkFeatureAvailability('completions') as express.RequestHandler,
      completionsRateLimit,
      completionsHandler(this.config) as unknown as express.RequestHandler
    );

    // Messages endpoint (Claude Responses API compatibility)
    this.app.post(
      '/v1/messages',
      secureAuthenticationMiddleware,
      checkFeatureAvailability('completions') as express.RequestHandler,
      completionsRateLimit,
      completionsHandler(this.config) as unknown as express.RequestHandler
    );

    // Configuration endpoint
    this.app.get(
      '/api/config',
      secureAuthenticationMiddleware,
      getClientConfig as unknown as express.RequestHandler
    );

    // File upload endpoints
    this.app.post(
      '/api/upload',
      secureAuthenticationMiddleware,
      checkFeatureAvailability('fileUpload') as express.RequestHandler,
      uploadFileHandler as unknown as express.RequestHandler[]
    );

    this.app.get(
      '/api/files/:fileId',
      secureAuthenticationMiddleware,
      getFileHandler as unknown as express.RequestHandler
    );

    this.app.delete(
      '/api/files/:fileId',
      secureAuthenticationMiddleware,
      deleteFileHandler as unknown as express.RequestHandler
    );

    // Session management endpoints (no authentication required for session creation)
    this.app.post(
      '/api/session',
      secureAuthenticationMiddleware,
      createSessionHandler as unknown as express.RequestHandler[]
    );

    this.app.get(
      '/api/session/:sessionId',
      secureAuthenticationMiddleware,
      getSessionHandler as unknown as express.RequestHandler[]
    );

    this.app.get(
      '/api/session-stats',
      secureAuthenticationMiddleware,
      getSessionStatsHandler as unknown as express.RequestHandler
    );

    // Conversation management endpoints (require session validation)
    this.app.get(
      '/api/conversations',
      secureAuthenticationMiddleware,
      validateSessionMiddleware as unknown as express.RequestHandler,
      getConversationsHandler as unknown as express.RequestHandler[]
    );

    this.app.post(
      '/api/conversations',
      secureAuthenticationMiddleware,
      validateSessionMiddleware as unknown as express.RequestHandler,
      createConversationHandler as unknown as express.RequestHandler[]
    );

    this.app.get(
      '/api/conversations/:conversationId',
      secureAuthenticationMiddleware,
      validateSessionMiddleware as unknown as express.RequestHandler,
      getConversationHandler as unknown as express.RequestHandler[]
    );

    this.app.put(
      '/api/conversations/:conversationId',
      secureAuthenticationMiddleware,
      validateSessionMiddleware as unknown as express.RequestHandler,
      updateConversationHandler as unknown as express.RequestHandler[]
    );

    this.app.delete(
      '/api/conversations/:conversationId',
      secureAuthenticationMiddleware,
      validateSessionMiddleware as unknown as express.RequestHandler,
      deleteConversationHandler as unknown as express.RequestHandler[]
    );

    this.app.post(
      '/api/conversations/:conversationId/messages',
      secureAuthenticationMiddleware,
      validateSessionMiddleware as unknown as express.RequestHandler,
      addMessageHandler as unknown as express.RequestHandler[]
    );

    this.app.get(
      '/api/conversation-stats',
      secureAuthenticationMiddleware,
      getConversationStatsHandler as unknown as express.RequestHandler
    );

    // Chat streaming endpoints (require session validation)
    this.app.get(
      '/api/chat/stream/:conversationId',
      secureAuthenticationMiddleware,
      validateSessionMiddleware as unknown as express.RequestHandler,
      chatSSEHandler as unknown as express.RequestHandler[]
    );

    this.app.post(
      '/api/chat/send',
      secureAuthenticationMiddleware,
      validateSessionMiddleware as unknown as express.RequestHandler,
      sendChatMessageHandler as unknown as express.RequestHandler[]
    );

    // Simple chat endpoint (without SSE) for testing
    this.app.post(
      '/api/chat/simple',
      secureAuthenticationMiddleware,
      validateSessionMiddleware as unknown as express.RequestHandler,
      simpleChatHandler as unknown as express.RequestHandler[]
    );

    this.app.get(
      '/api/chat/connections',
      secureAuthenticationMiddleware,
      validateSessionMiddleware as unknown as express.RequestHandler,
      getConnectionsHandler as unknown as express.RequestHandler
    );

    this.app.delete(
      '/api/chat/connections/:connectionId',
      secureAuthenticationMiddleware,
      validateSessionMiddleware as unknown as express.RequestHandler,
      closeConnectionHandler as unknown as express.RequestHandler[]
    );

    // Task 7.2: Comprehensive chat statistics endpoint
    this.app.get(
      '/api/chat-stats',
      getChatStatsHandler as unknown as express.RequestHandler
    );

    // Context management endpoints (require session validation)
    this.app.get(
      '/api/conversations/:conversationId/context',
      secureAuthenticationMiddleware,
      validateSessionMiddleware as unknown as express.RequestHandler,
      getContextUsageHandler as unknown as express.RequestHandler[]
    );

    this.app.post(
      '/api/conversations/:conversationId/extend-context',
      secureAuthenticationMiddleware,
      validateSessionMiddleware as unknown as express.RequestHandler,
      extendContextHandler as unknown as express.RequestHandler[]
    );

    this.app.post(
      '/api/conversations/:conversationId/compress',
      secureAuthenticationMiddleware,
      validateSessionMiddleware as unknown as express.RequestHandler,
      compressContextHandler as unknown as express.RequestHandler[]
    );

    this.app.post(
      '/api/conversations/:conversationId/create-compressed',
      secureAuthenticationMiddleware,
      validateSessionMiddleware as unknown as express.RequestHandler,
      createCompressedConversationHandler as unknown as express.RequestHandler[]
    );

    this.app.get(
      '/api/context-stats',
      secureAuthenticationMiddleware,
      getContextStatsHandler as unknown as express.RequestHandler
    );

    // Static asset serving for React frontend
    this.setupFrontendServing();

    // Catch-all for undefined routes - temporarily disabled for Express 5.x compatibility
    // this.app.all('*', (req, res) => {
    //   const correlationId = (req as unknown as RequestWithCorrelationId).correlationId;
    //
    //   logger.warn('Route not found', correlationId, {
    //     method: req.method,
    //     url: req.originalUrl
    //   });
    //
    //   const errorResponse: ErrorResponse = {
    //     error: {
    //       type: 'not_found',
    //       message: 'The requested endpoint was not found',
    //       correlationId
    //     }
    //   };
    //
    //   res.status(404).json(errorResponse);
    // });
  }

  /**
   * Sets up frontend asset serving with proper caching and security headers.
   *
   * This method configures static asset serving for the React frontend application
   * with appropriate caching strategies, security headers, and SPA fallback routing.
   *
   * @private
   */
  private setupFrontendServing(): void {
    // Resolve frontend build path - works in both development and Docker
    // In Docker: /app/apps/frontend/dist
    // In development: ../frontend/dist (from apps/backend)
    const frontendBuildPath = fs.existsSync(
      path.resolve(process.cwd(), 'apps/frontend/dist')
    )
      ? path.resolve(process.cwd(), 'apps/frontend/dist')
      : path.resolve(process.cwd(), '../frontend/dist');

    // Log frontend build status
    logFrontendBuildStatus(frontendBuildPath).catch((error: unknown) => {
      logger.warn('Failed to check frontend build status', '', {
        error: error instanceof Error ? error.message : 'Unknown error',
        buildPath: frontendBuildPath,
      });
    });

    // Serve static assets with caching headers
    this.app.use(
      '/static',
      createStaticAssetsMiddleware({
        buildPath: path.join(frontendBuildPath, 'static'),
        maxAge: 31536000, // 1 year for static assets with hashes
        enableCompression: true,
        enableETag: true,
      })
    );

    // Serve assets from the root of the build directory
    this.app.use(
      createStaticAssetsMiddleware({
        buildPath: frontendBuildPath,
        maxAge: 300, // 5 minutes for HTML and other root assets
        enableCompression: true,
        enableETag: true,
      })
    );

    // SPA fallback for client-side routing (must be last)
    this.app.use(
      createSPAFallbackMiddleware({
        buildPath: frontendBuildPath,
      })
    );

    logger.info('Frontend serving configured', '', {
      buildPath: frontendBuildPath,
      staticPath: path.join(frontendBuildPath, 'static'),
      spaFallbackEnabled: true,
    });
  }

  /**
   * Sets up comprehensive error handling middleware.
   *
   * Error handling includes:
   * - Error logging with correlation IDs
   * - Enhanced error handler with resilience features
   * - Proper HTTP status code mapping
   * - Error sanitization to prevent information leakage
   *
   * @private
   */
  private setupErrorHandling(): void {
    // Error logging middleware
    this.app.use(errorLoggingMiddleware);

    // Enhanced error handler with resilience features
    this.app.use(enhancedErrorHandler);
  }

  /**
   * Sets up Node.js 24 specific optimizations and features.
   *
   * @private
   */
  private setupNodeJS24Optimizations(): void {
    // Configure Node.js 24 specific settings
    if (process.versions.node.startsWith('24.')) {
      // Initialize comprehensive performance optimizations
      const perfConfig = initializePerformanceOptimizations();

      // Mark application initialization start
      performanceMonitor.mark('app-init-start');

      // Enable enhanced performance monitoring
      this.enablePerformanceMonitoring();

      // Start memory monitoring with Node.js 24 features
      this.startMemoryManagement();

      // Configure optimal garbage collection settings
      this.configureGarbageCollection();

      // Initialize optimized HTTP client
      getOptimizedHTTPClient();

      // Initialize optimized SSE handler
      getOptimizedSSEHandler();

      // Set up memory pressure monitoring
      this.setupMemoryPressureMonitoring();

      // Initialize performance alert system
      this.setupPerformanceAlerts();

      logger.info('Node.js 24 performance optimizations initialized', '', {
        nodeVersion: process.version,
        gcConfig: perfConfig.gc,
        httpConfig: perfConfig.http,
        streamingConfig: perfConfig.streaming,
      });
    } else {
      logger.warn('Node.js 24 optimizations not available', '', {
        currentVersion: process.version,
        recommendedVersion: '24.x.x',
      });
    }
  }

  /**
   * Resource management middleware for automatic cleanup.
   *
   * @private
   */
  private readonly resourceManagementMiddleware = (
    req: Request,
    res: Response,
    next: () => void
  ): void => {
    // Create HTTP connection resource for automatic cleanup
    const connectionResource = createHTTPConnectionResource(
      req,
      res,
      req.socket
    );

    // Clean up resource when response finishes
    res.on('finish', () => {
      if (!connectionResource.disposed) {
        connectionResource[Symbol.asyncDispose]().catch((error: unknown) => {
          logger.warn('HTTP connection resource cleanup failed', '', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      }
    });

    // Clean up resource on connection close
    res.on('close', () => {
      if (!connectionResource.disposed) {
        connectionResource[Symbol.asyncDispose]().catch((error: unknown) => {
          logger.warn('HTTP connection resource cleanup failed on close', '', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      }
    });

    next();
  };

  /**
   * Enables performance monitoring using Node.js 24 features.
   *
   * @private
   */
  private enablePerformanceMonitoring(): void {
    // Mark server startup performance
    performance.mark('server-startup-begin');

    // Monitor HTTP request performance
    this.app.use((req: Request, res: Response, next: () => void) => {
      const startTime = performance.now();
      const { correlationId } = req as RequestWithCorrelationId;
      
      // Track request in server health monitor (Requirement 8)
      const serverHealthMonitor = getServerHealthMonitor();
      serverHealthMonitor.recordRequest();

      res.on('finish', () => {
        const duration = performance.now() - startTime;

        // Log slow requests
        if (duration > 1000) {
          // Log requests slower than 1 second
          logger.warn('Slow request detected', correlationId, {
            method: req.method,
            url: req.originalUrl,
            duration: Math.round(duration),
            statusCode: res.statusCode,
          });
        }

        // Track performance metrics
        performance.measure(`request-${correlationId}`, {
          start: startTime,
          duration,
        });
      });

      next();
    });

    logger.info(
      'Performance monitoring enabled with Node.js 24 features',
      '',
      {}
    );
  }

  /**
   * Starts memory management with Node.js 24 enhanced features.
   *
   * @private
   */
  private startMemoryManagement(): void {
    const config = loadedConfig;

    if (!config.ENABLE_MEMORY_MANAGEMENT) {
      logger.info('Memory management disabled by configuration', '', {});
      return;
    }

    // Start memory monitoring with Node.js 24 GC features using configuration
    startMemoryMonitoring({
      maxSamples: 200,
      sampleInterval: config.MEMORY_SAMPLE_INTERVAL,
      enableLeakDetection: config.ENABLE_RESOURCE_MONITORING,
      enableGCSuggestions: config.ENABLE_AUTO_GC,
      pressureThresholds: {
        medium: Math.max(50, config.MEMORY_PRESSURE_THRESHOLD - 10),
        high: config.MEMORY_PRESSURE_THRESHOLD,
        critical: Math.min(95, config.MEMORY_PRESSURE_THRESHOLD + 10),
      },
    });

    logger.info('Memory management started with Node.js 24 features', '', {
      sampleInterval: config.MEMORY_SAMPLE_INTERVAL,
      pressureThreshold: config.MEMORY_PRESSURE_THRESHOLD,
      autoGcEnabled: config.ENABLE_AUTO_GC,
      resourceMonitoringEnabled: config.ENABLE_RESOURCE_MONITORING,
    });
  }

  /**
   * Configures optimal garbage collection settings for Node.js 24.
   *
   * @private
   */
  private configureGarbageCollection(): void {
    const config = loadedConfig;

    // Log GC configuration
    logger.info('Garbage collection configured for Node.js 24', '', {
      heapSizeLimit: this.getHeapSizeLimit(),
      gcExposed: typeof global.gc === 'function',
      autoGcEnabled: config.ENABLE_AUTO_GC,
      memoryPressureThreshold: config.MEMORY_PRESSURE_THRESHOLD,
    });

    if (!config.ENABLE_AUTO_GC) {
      logger.info(
        'Automatic garbage collection disabled by configuration',
        '',
        {}
      );
      return;
    }

    // Set up periodic GC suggestions based on memory pressure
    setInterval(() => {
      const memoryMetrics = memoryManager.getMemoryMetrics();

      if (
        memoryMetrics.pressure.level === 'high' ||
        memoryMetrics.pressure.level === 'critical'
      ) {
        if (typeof global.gc === 'function') {
          logger.info(
            'Triggering garbage collection due to memory pressure',
            '',
            {
              pressureLevel: memoryMetrics.pressure.level,
              heapUsage: memoryMetrics.heap.percentage,
              threshold: config.MEMORY_PRESSURE_THRESHOLD,
            }
          );

          global.gc();
        } else {
          logger.warn(
            'High memory pressure detected but GC not available',
            '',
            {
              pressureLevel: memoryMetrics.pressure.level,
              heapUsage: memoryMetrics.heap.percentage,
              threshold: config.MEMORY_PRESSURE_THRESHOLD,
              suggestion: 'Consider running with --expose-gc flag',
            }
          );
        }
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Sets up memory pressure monitoring with Node.js 24 optimizations.
   *
   * @private
   */
  private setupMemoryPressureMonitoring(): void {
    // Set up periodic memory pressure monitoring
    setInterval(() => {
      memoryPressureHandler.handleMemoryPressure().catch((error: unknown) => {
        logger.error('Memory pressure handling failed', '', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    }, 15000); // Check every 15 seconds

    logger.info('Memory pressure monitoring initialized', '', {
      checkInterval: '15s',
      nodeVersion: process.version,
    });
  }

  /**
   * Sets up performance alert system with Node.js 24 optimizations.
   *
   * @private
   */
  private setupPerformanceAlerts(): void {
    const alertSystem = getPerformanceAlertSystem();

    // Start monitoring
    alertSystem.startMonitoring();

    // Set up request tracking middleware
    this.app.use((req: Request, res: Response, next: () => void) => {
      const startTime = performance.now();

      res.on('finish', () => {
        const responseTime = performance.now() - startTime;
        const isError = res.statusCode >= 400;

        alertSystem.recordRequest(responseTime, isError);
      });

      next();
    });

    // Handle performance alerts
    alertSystem.on('alert', (alert: PerformanceAlert) => {
      logger.warn('Performance alert', '', {
        metric: alert.metric,
        level: alert.level,
        value: alert.value,
        threshold: alert.threshold,
        message: alert.message,
      });
    });

    logger.info('Performance alert system initialized', '', {
      nodeVersion: process.version,
      alertsEnabled: true,
    });
  }

  /**
   * Gets the current heap size limit.
   *
   * @private
   * @returns Heap size limit in bytes
   */
  private getHeapSizeLimit(): number {
    try {
      const heapStats = getHeapStatistics();
      return heapStats.heap_size_limit;
    } catch {
      // Fallback to default Node.js heap limit
      return 1.4 * 1024 * 1024 * 1024; // ~1.4GB default for 64-bit systems
    }
  }

  /**
   * Starts the HTTP server and begins accepting connections with Node.js 24 optimizations.
   *
   * This method:
   * 1. Creates optimized HTTP server using Node.js 24 features
   * 2. Binds the server to the configured port on all interfaces (0.0.0.0)
   * 3. Sets up error handling for server startup failures
   * 4. Initializes health monitoring
   * 5. Logs successful startup with performance metrics
   *
   * @public
   * @async
   * @returns Promise that resolves when server is successfully started
   * @throws {Error} If server fails to start or bind to port
   *
   * @example
   * ```typescript
   * const server = new ProxyServer(config);
   * try {
   *   await server.start();
   *   console.log('Server started successfully');
   * } catch (error) {
   *   console.error('Failed to start server:', error);
   * }
   * ```
   */
  public getApp(): express.Application {
    return this.app;
  }

  /**
   * Starts the HTTP server and begins listening for incoming requests.
   *
   * This method starts the Express server on the configured port and sets up
   * graceful shutdown handlers. It also initializes health monitoring and
   * performance tracking.
   *
   * @public
   * @async
   * @returns Promise that resolves when server is successfully started
   * @throws {Error} If server fails to start or bind to port
   *
   * @example
   * ```typescript
   * const server = new ProxyServer(config);
   * try {
   *   await server.start();
   *   console.log('Server started successfully');
   * } catch (error) {
   *   console.error('Failed to start server:', error);
   * }
   * ```
   */
  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const serverInstance = this.app.listen(
          this.config.port,
          '0.0.0.0',
          () => {
            const startupDuration = performance.now() - this.startupTime;
            const hasStartupBeginMark =
              performance.getEntriesByName('server-startup-begin', 'mark')
                .length > 0;

            if (!hasStartupBeginMark) {
              StructuredLogger.mark('server-startup-begin');
            }

            StructuredLogger.mark('server-startup-complete');
            const startupPerformanceDuration = StructuredLogger.measure(
              'server-startup-total',
              'server-startup-begin',
              'server-startup-complete'
            );

            logger.info(
              'Server started successfully with Node.js 24 optimizations',
              '',
              {
                port: this.config.port,
                nodeEnv: this.config.nodeEnv,
                nodeVersion: process.version,
                startupTime: Math.round(startupDuration),
                startupPerformanceDuration: Math.round(
                  startupPerformanceDuration
                ),
                azureEndpoint:
                  this.config.azureOpenAI?.endpoint ?? 'not-configured',
                model: this.config.azureOpenAI?.model ?? 'not-configured',
                memoryMonitoring: true,
                resourceManagement: true,
              }
            );

            this.setupHealthMonitoring();

            resolve();
          }
        );

        this.server = serverInstance;
        this.configureServerOptimizations(serverInstance);

        // Start server health monitoring (Requirement 8)
        const serverHealthMonitor = getServerHealthMonitor();
        serverHealthMonitor.startMonitoring(serverInstance);

        serverInstance.on('error', (error: Readonly<Error>) => {
          logger.error('Server error', '', {
            error: error.message,
            stack: error.stack,
            nodeVersion: process.version,
          });
          serverHealthMonitor.recordError(error);
          reject(error);
        });

        serverInstance.on('connection', (socket) => {
          const connectionResource = createHTTPConnectionResource(
            undefined,
            undefined,
            socket
          );

          socket.on('close', () => {
            if (!connectionResource.disposed) {
              connectionResource[Symbol.asyncDispose]().catch(
                (cleanupError: unknown) => {
                  logger.debug(
                    'Socket connection resource cleanup failed',
                    '',
                    {
                      error:
                        cleanupError instanceof Error
                          ? cleanupError.message
                          : 'Unknown error',
                    }
                  );
                }
              );
            }
          });
        });
      } catch (error) {
        const failure =
          error instanceof Error
            ? error
            : new Error('Failed to start server due to unknown error');

        logger.error('Failed to start server', '', {
          error: failure.message,
          nodeVersion: process.version,
        });
        reject(new Error(failure.message));
      }
    });
  }

  /**
   * Configures HTTP server optimizations for Node.js 24.
   *
   * @private
   * @param server - HTTP server instance
   */
  private configureServerOptimizations(server: import('http').Server): void {
    // Use configuration values for HTTP server settings
    const config = loadedConfig;

    // Configure keep-alive settings for better connection reuse
    server.keepAliveTimeout = config.HTTP_KEEP_ALIVE_TIMEOUT;
    server.headersTimeout = config.HTTP_HEADERS_TIMEOUT;

    // Configure request timeout
    server.requestTimeout = Number(this.config.azureOpenAI?.timeout ?? 120000);

    // Configure maximum connections
    server.maxConnections = config.HTTP_MAX_CONNECTIONS;

    // Enable TCP_NODELAY for lower latency
    server.on('connection', (socket) => {
      socket.setNoDelay(true);
      socket.setKeepAlive(true, 30000); // 30 second keep-alive
    });

    logger.debug(
      'HTTP server optimizations configured with Node.js 24 settings',
      '',
      {
        keepAliveTimeout: server.keepAliveTimeout,
        headersTimeout: server.headersTimeout,
        requestTimeout: server.requestTimeout,
        maxConnections: server.maxConnections,
        memoryManagementEnabled: config.ENABLE_MEMORY_MANAGEMENT,
        resourceMonitoringEnabled: config.ENABLE_RESOURCE_MONITORING,
      }
    );
  }

  /**
   * Sets up comprehensive health monitoring for the application.
   *
   * Registers health checks for:
   * - Memory usage monitoring with thresholds
   * - System resource monitoring
   * - External service connectivity
   *
   * Health checks run continuously and provide status information
   * for the /health endpoint and operational monitoring.
   *
   * @private
   */
  private setupHealthMonitoring(): void {
    // Initialize health monitor with config
    const healthMonitor = getHealthMonitor(this.config);

    // Register basic health checks
    healthMonitor.registerHealthCheck({
      name: 'memory',
      timeout: 5000,
      critical: true,
      check: (): Promise<{
        status: string;
        responseTime: number;
        message: string;
        details?: Record<string, unknown>;
      }> => {
        const memoryUsage = process.memoryUsage();
        const memoryUsagePercent = memoryUsage.heapUsed / memoryUsage.heapTotal;

        let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
        let message = `Memory usage: ${(memoryUsagePercent * 100).toFixed(1)}%`;
        let details: Record<string, unknown> = { memoryUsage };

        if (memoryUsagePercent > 0.9) {
          status = 'unhealthy';
          message = `High memory usage: ${(memoryUsagePercent * 100).toFixed(1)}%`;
          details = { memoryUsage, threshold: 0.9 };
        } else if (memoryUsagePercent > 0.8) {
          status = 'degraded';
          message = `Elevated memory usage: ${(memoryUsagePercent * 100).toFixed(1)}%`;
          details = { memoryUsage, threshold: 0.8 };
        }

        return Promise.resolve({
          status,
          responseTime: 0,
          message,
          details,
        });
      },
    });

    // Start continuous monitoring
    healthMonitor.startMonitoring(60000); // Check every minute
  }

  /**
   * Gracefully stops the HTTP server and cleans up resources with Node.js 24 features.
   *
   * This method:
   * 1. Stops health monitoring
   * 2. Stops memory monitoring
   * 3. Cleans up all managed resources
   * 4. Closes the HTTP server gracefully
   * 5. Waits for existing connections to complete
   * 6. Forces shutdown after timeout if necessary
   *
   * @public
   * @async
   * @returns Promise that resolves when server is fully stopped
   *
   * @example
   * ```typescript
   * // Graceful shutdown
   * process.on('SIGTERM', async () => {
   *   await server.stop();
   *   process.exit(0);
   * });
   * ```
   */
  public async stop(): Promise<void> {
    const serverInstance = this.server;
    if (serverInstance === null) {
      return;
    }

    logger.info('Shutting down server gracefully with resource cleanup');

    try {
      // Stop health monitoring
      getHealthMonitor().stopMonitoring();

      // Stop memory monitoring
      memoryManager.stopMonitoring();

      // Clean up all managed resources
      await resourceManager[Symbol.asyncDispose]();

      // Clean up performance optimization resources
      cleanupGlobalHTTPClient();
      cleanupGlobalSSEHandler();
      cleanupGlobalPerformanceAlerts();
      cleanupServerHealthMonitor();

      // Clear performance monitoring data
      performanceMonitor.clear();

      // Force garbage collection before shutdown if available
      if (typeof global.gc === 'function') {
        logger.info('Performing final garbage collection');
        global.gc();
      }

      // Close server gracefully
      await new Promise<void>((resolve) => {
        serverInstance.close(() => {
          logger.info('Server shutdown complete', '', {
            resourcesCleanedUp: true,
            memoryMonitoringStopped: true,
          });
          resolve();
        });

        // Force shutdown after 10 seconds
        setTimeout(() => {
          logger.warn('Forcing server shutdown after timeout');
          process.exit(1);
        }, 10000);
      });
    } catch (error) {
      logger.error('Error during graceful shutdown', '', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Still attempt to close the server
      await new Promise<void>((resolve) => {
        serverInstance.close(() => {
          resolve();
        });
      });
    }
  }
}

// Graceful shutdown handling
export const setupGracefulShutdown = (server: ProxyServer): void => {
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, starting graceful shutdown`);

    try {
      await server.stop();
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', '', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch((error: unknown) => {
      logger.error('Error during shutdown', '', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      process.exit(1);
    });
  });
  process.on('SIGINT', () => {
    shutdown('SIGINT').catch((error: unknown) => {
      logger.error('Error during shutdown', '', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      process.exit(1);
    });
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Readonly<Error>) => {
    logger.error('Uncaught exception', '', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('Unhandled promise rejection', '', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    process.exit(1);
  });
};

// Convert loaded config to ServerConfig format
export const createServerConfig = (config: Readonly<Config>): ServerConfig => ({
  port: config.PORT,
  nodeEnv: config.NODE_ENV,
  proxyApiKey: config.PROXY_API_KEY,
  azureOpenAI: {
    endpoint: config.AZURE_OPENAI_ENDPOINT,
    apiKey: config.AZURE_OPENAI_API_KEY,
    baseURL: createAzureOpenAIConfig(config).baseURL,

    model: config.AZURE_OPENAI_MODEL,
    deployment: config.AZURE_OPENAI_MODEL,
    timeout: config.AZURE_OPENAI_TIMEOUT,
    maxRetries: config.AZURE_OPENAI_MAX_RETRIES,
  },
});

export interface CreateServerOptions {
  readonly configOverride?: Partial<Config>;
  readonly serverConfigOverride?: Partial<ServerConfig>;
}

/**
 * Lightweight factory for integration tests and local tooling.
 * Returns an Express app configured with the current environment or
 * provided overrides without starting the HTTP listener.
 */
export async function createServer(
  options?: CreateServerOptions
): Promise<express.Application> {
  const baseConfig = options?.configOverride
    ? createServerConfig({
        ...loadedConfig,
        ...options.configOverride,
      })
    : createServerConfig(loadedConfig);

  let mergedAzureConfig: ServerConfig['azureOpenAI'] | undefined;
  if (baseConfig.azureOpenAI) {
    mergedAzureConfig = {
      ...baseConfig.azureOpenAI,
      ...(options?.serverConfigOverride?.azureOpenAI ?? {}),
      apiKey:
        options?.serverConfigOverride?.azureOpenAI?.apiKey ??
        baseConfig.azureOpenAI.apiKey,
    };
  } else if (options?.serverConfigOverride?.azureOpenAI) {
    const overrideAzure = options.serverConfigOverride.azureOpenAI;
    if (!overrideAzure.apiKey) {
      throw new Error('Azure OpenAI API key override must include apiKey');
    }
    mergedAzureConfig = { ...overrideAzure } as ServerConfig['azureOpenAI'];
  }

  const mergedConfig: ServerConfig = {
    ...baseConfig,
    ...(options?.serverConfigOverride ?? {}),
    azureOpenAI: mergedAzureConfig,
  };

  const server = new ProxyServer(mergedConfig);
  return server.getApp();
}

// Main application entry point
export const main = async (): Promise<void> => {
  try {
    // Load and validate configuration
    const config = createServerConfig(loadedConfig);
    logger.info('Configuration loaded successfully', '', {
      config: sanitizedConfig,
    });

    // Create and start server
    const server = new ProxyServer(config);

    // Setup graceful shutdown
    setupGracefulShutdown(server);

    // Start the server
    await server.start();
  } catch (error) {
    logger.error('Failed to start application', '', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exit(1);
  }
};

// Start the application
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const fatalError =
      error instanceof Error ? error : new Error('Unknown fatal error');
    logger.error(
      'Fatal error during startup',
      '',
      { error: fatalError.message },
      fatalError
    );
    process.exit(1);
  });
}
