import express from 'express';
import cors from 'cors';
import { json, urlencoded } from 'express';
import type { Request, Response } from 'express';
import type { ServerConfig, RequestWithCorrelationId } from './types/index.js';
import loadedConfig, {
  sanitizedConfig,
  createAzureOpenAIConfig,
} from './config/index.js';
import type { Config } from './config/index.js';
import {
  helmetConfig,
  globalRateLimit,
  correlationIdMiddleware,
  timeoutMiddleware,
  corsOptions,
} from './middleware/security.js';
import {
  requestLoggingMiddleware,
  errorLoggingMiddleware,
  logger,
} from './middleware/logging.js';
import { enhancedErrorHandler } from './middleware/error-handler.js';
import { secureAuthenticationMiddleware } from './middleware/authentication.js';
import { healthCheckHandler } from './routes/health.js';
import { modelsHandler } from './routes/models.js';
import {
  completionsRateLimit,
  completionsHandler,
} from './routes/completions.js';
import { getHealthMonitor } from './monitoring/health-monitor.js';
import { checkFeatureAvailability } from './resilience/graceful-degradation.js';

/**
 * @fileoverview Main application entry point for the Claude-to-Azure OpenAI Proxy Server.
 *
 * This module implements a hardened TypeScript Express server that acts as an API gateway,
 * translating requests from Claude Code CLI format to Azure OpenAI v1 API format.
 * The server provides comprehensive security, monitoring, and resilience features
 * designed for production deployment on AWS App Runner.
 *
 * @author Claude-to-Azure Proxy Team
 * @version 1.0.0
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
class ProxyServer {
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
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Sets up all Express middleware in the correct order for security and functionality.
   *
   * Middleware is applied in the following order:
   * 1. Trust proxy settings for AWS App Runner
   * 2. Security middleware (Helmet, CORS)
   * 3. Request processing (correlation ID, timeout, rate limiting)
   * 4. Body parsing with size limits
   * 5. Request logging
   *
   * @private
   * @throws {Error} If middleware configuration fails
   */
  private setupMiddleware(): void {
    // Trust proxy for AWS App Runner and CloudFront
    // Use specific proxy configuration instead of trusting all proxies
    // This is more secure than 'trust proxy: true'
    this.app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

    // Disable unnecessary Express features
    this.app.disable('x-powered-by');
    this.app.disable('etag');

    // Security middleware
    this.app.use(helmetConfig);
    this.app.use(cors(corsOptions));

    // Request processing middleware
    this.app.use(correlationIdMiddleware);
    this.app.use(timeoutMiddleware(
      typeof this.config.azureOpenAI?.timeout === 'number' 
        ? this.config.azureOpenAI.timeout 
        : parseInt(String(this.config.azureOpenAI?.timeout || '120000'), 10)
    )); // Use configured timeout
    this.app.use(globalRateLimit);

    // Body parsing with size limits
    this.app.use(
      json({
        limit: '10mb', // Allow larger payloads for AI requests with long context
        strict: true,
        type: 'application/json',
      })
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

    // Root endpoint
    this.app.get('/', (req: Readonly<Request>, res: Readonly<Response>) => {
      const correlationId = (req as unknown as RequestWithCorrelationId)
        .correlationId;
      logger.info('Root endpoint accessed', correlationId);

      res.json({
        service: 'Claude-to-Azure Proxy',
        version: '1.0.0',
        status: 'running',
        correlationId,
      });
    });

    // Claude API compatible endpoints with authentication and feature availability checks
    this.app.get(
      '/v1/models',
      secureAuthenticationMiddleware,
      checkFeatureAvailability('models') as express.RequestHandler,
      modelsHandler as unknown as express.RequestHandler
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
   * Starts the HTTP server and begins accepting connections.
   *
   * This method:
   * 1. Binds the server to the configured port on all interfaces (0.0.0.0)
   * 2. Sets up error handling for server startup failures
   * 3. Initializes health monitoring
   * 4. Logs successful startup with configuration details
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
            logger.info('Server started successfully', '', {
              port: this.config.port,
              nodeEnv: this.config.nodeEnv,
              azureEndpoint:
                this.config.azureOpenAI?.endpoint ?? 'not-configured',
              model: this.config.azureOpenAI?.model ?? 'not-configured',
            });

            // Start health monitoring
            this.setupHealthMonitoring();

            resolve();
          }
        );

        this.server = serverInstance;

        // Handle server errors
        serverInstance.on('error', (error: Readonly<Error>) => {
          logger.error('Server error', '', { error: error.message });
          reject(error);
        });
      } catch (error) {
        const failure =
          error instanceof Error
            ? error
            : new Error('Failed to start server due to unknown error');

        logger.error('Failed to start server', '', {
          error: failure.message,
        });
        reject(failure);
      }
    });
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
   * Gracefully stops the HTTP server and cleans up resources.
   *
   * This method:
   * 1. Stops health monitoring
   * 2. Closes the HTTP server gracefully
   * 3. Waits for existing connections to complete
   * 4. Forces shutdown after timeout if necessary
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
    return new Promise((resolve) => {
      const serverInstance = this.server;
      if (serverInstance === null) {
        resolve();
        return;
      }

      logger.info('Shutting down server gracefully');

      // Stop health monitoring
      getHealthMonitor().stopMonitoring();

      serverInstance.close(() => {
        logger.info('Server shutdown complete');
        resolve();
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.warn('Forcing server shutdown');
        process.exit(1);
      }, 10000);
    });
  }
}

// Graceful shutdown handling
const setupGracefulShutdown = (server: ProxyServer): void => {
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
const createServerConfig = (config: Readonly<Config>): ServerConfig => ({
  port: config.PORT,
  nodeEnv: config.NODE_ENV,
  proxyApiKey: config.PROXY_API_KEY,
  azureOpenAI: {
    endpoint: config.AZURE_OPENAI_ENDPOINT,
    apiKey: config.AZURE_OPENAI_API_KEY,
    baseURL: createAzureOpenAIConfig(config).baseURL,
    apiVersion: config.AZURE_OPENAI_API_VERSION,
    model: config.AZURE_OPENAI_MODEL,
    deployment: config.AZURE_OPENAI_MODEL,
    timeout: config.AZURE_OPENAI_TIMEOUT,
    maxRetries: config.AZURE_OPENAI_MAX_RETRIES,
  },
});

// Main application entry point
const main = async (): Promise<void> => {
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
