import { Request, Response } from 'express';
import axios from 'axios';
import type {
  HealthCheckResult,
  RequestWithCorrelationId,
  ServerConfig,
} from '../types/index.js';
import { logger } from '../middleware/logging.js';
import { healthMonitor } from '../monitoring/health-monitor.js';
import {
  circuitBreakerRegistry,
  retryStrategyRegistry,
  gracefulDegradationManager,
} from '../resilience/index.js';

/**
 * Health check endpoint for AWS App Runner and monitoring
 */

// Check Azure OpenAI connectivity
const checkAzureOpenAI = async (
  config: ServerConfig
): Promise<{
  status: 'connected' | 'disconnected';
  responseTime?: number;
}> => {
  try {
    const startTime = Date.now();

    // Simple connectivity check to Azure OpenAI models endpoint
    const response = await axios.get(
      `${config.azureOpenAI.endpoint}/openai/v1/models`,
      {
        headers: {
          Authorization: `Bearer ${config.azureOpenAI.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 5000, // 5 second timeout for health check
      }
    );

    const responseTime = Date.now() - startTime;

    if (response.status === 200) {
      return {
        status: 'connected',
        responseTime,
      };
    } else {
      return { status: 'disconnected' };
    }
  } catch (error) {
    return { status: 'disconnected' };
  }
};

// Get memory usage information
const getMemoryUsage = (): HealthCheckResult['memory'] => {
  const memUsage = process.memoryUsage();
  const totalMemory = memUsage.heapTotal;
  const usedMemory = memUsage.heapUsed;

  return {
    used: usedMemory,
    total: totalMemory,
    percentage: Math.round((usedMemory / totalMemory) * 100),
  };
};

// Health check handler
export const healthCheckHandler = (config: ServerConfig) => {
  return async (req: Request, res: Response): Promise<void> => {
    const correlationId = (req as unknown as RequestWithCorrelationId)
      .correlationId;
    const startTime = Date.now();

    try {
      // Get basic health information
      const memory = getMemoryUsage();
      const uptime = process.uptime();

      // Check Azure OpenAI connectivity (optional for basic health check)
      let azureOpenAIStatus: HealthCheckResult['azureOpenAI'];

      try {
        azureOpenAIStatus = await checkAzureOpenAI(config);
      } catch (error) {
        // Don't fail health check if Azure OpenAI is temporarily unavailable
        azureOpenAIStatus = { status: 'disconnected' };
        logger.warn('Azure OpenAI health check failed', correlationId, {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Determine overall health status
      const isHealthy = memory.percentage < 90; // Consider unhealthy if memory usage > 90%

      // Get resilience metrics
      const circuitBreakerMetrics = circuitBreakerRegistry.getAllMetrics();
      const retryMetrics = retryStrategyRegistry.getAllMetrics();
      const serviceLevel = gracefulDegradationManager.getCurrentServiceLevel();
      const systemHealth = await healthMonitor.checkHealth(correlationId);

      const healthResult: HealthCheckResult & {
        resilience?: {
          circuitBreakers: typeof circuitBreakerMetrics;
          retryStrategies: typeof retryMetrics;
          serviceLevel: typeof serviceLevel;
          systemHealth: typeof systemHealth;
        };
      } = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime,
        memory,
        azureOpenAI: azureOpenAIStatus,
        resilience: {
          circuitBreakers: circuitBreakerMetrics,
          retryStrategies: retryMetrics,
          serviceLevel,
          systemHealth,
        },
      };

      const statusCode = isHealthy ? 200 : 503;

      logger.info('Health check completed', correlationId, {
        status: healthResult.status,
        responseTime: Date.now() - startTime,
        memoryUsage: memory.percentage,
      });

      res.status(statusCode).json(healthResult);
    } catch (error) {
      logger.error('Health check failed', correlationId, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      const errorResult: HealthCheckResult = {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: getMemoryUsage(),
      };

      res.status(503).json(errorResult);
    }
  };
};
