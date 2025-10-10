/**
 * Health monitoring system for the Claude-to-Azure proxy
 * Provides comprehensive health checks including Azure OpenAI connectivity
 */

import type { AxiosInstance, AxiosStatic } from 'axios';
import type { HealthCheckResult, ServerConfig } from '../types/index.js';
import { logger } from '../middleware/logging.js';

type HealthStatus = HealthCheckResult;

export interface RegisteredHealthCheck {
  readonly name: string;
  readonly timeout: number;
  readonly critical: boolean;
  readonly check: () => Promise<RegisteredHealthCheckResult>;
}

export interface RegisteredHealthCheckResult {
  readonly status: string;
  readonly responseTime: number;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export interface HealthAlert {
  readonly name: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly details?: Record<string, unknown>;
}

export class HealthMonitor {
  private readonly config: ServerConfig;
  private readonly startTime: number;
  private axiosInstance?: AxiosInstance;
  private lastHealthCheck?: HealthStatus;
  private readonly cacheTimeout: number;
  private lastCheckTime: number = 0;
  private readonly hasAzureConfig: boolean;
  private readonly azureEndpoint: string;
  private readonly azureApiKey: string;
  private azureInitAttempted = false;
  private readonly healthChecks: Map<string, RegisteredHealthCheck> = new Map();
  private monitoringInterval?: NodeJS.Timeout;

  constructor(config: ServerConfig, cacheTimeoutMs: number = 30000) {
    this.config = config;
    this.startTime = Date.now();
    this.cacheTimeout = cacheTimeoutMs;
    
    // Handle Azure OpenAI config
    const azureConfig = config.azureOpenAI;
    if (azureConfig) {
      this.azureEndpoint = azureConfig.endpoint.trim();
      this.azureApiKey = azureConfig.apiKey.trim();
      this.hasAzureConfig =
        this.azureEndpoint.length > 0 && this.azureApiKey.length > 0;
    } else {
      this.azureEndpoint = '';
      this.azureApiKey = '';
      this.hasAzureConfig = false;
    }
  }

  async getHealthStatus(): Promise<HealthStatus> {
    const now = Date.now();

    // Return cached result if within cache timeout
    if (this.lastHealthCheck && now - this.lastCheckTime < this.cacheTimeout) {
      return this.lastHealthCheck;
    }

    const memory = this.getMemoryUsage();
    const uptimeSeconds = (now - this.startTime) / 1000;
    const uptime = uptimeSeconds > 0 ? uptimeSeconds : Number.EPSILON;

    // Lazily initialize Azure OpenAI client when needed
    await this.initializeAzureClient();

    let azureOpenAIStatus: HealthStatus['azureOpenAI'] = undefined;
    if (this.hasAzureConfig) {
      azureOpenAIStatus = this.axiosInstance
        ? await this.checkAzureOpenAI()
        : { status: 'disconnected' };
    }

    const isHealthy = this.determineHealthStatus(memory, azureOpenAIStatus);

    const healthStatus: HealthStatus = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime,
      memory,
      azureOpenAI: azureOpenAIStatus,
    };

    this.lastHealthCheck = healthStatus;
    this.lastCheckTime = now;

    return healthStatus;
  }

  private getMemoryUsage(): HealthStatus['memory'] {
    const memUsage = process.memoryUsage();
    const heapTotal = memUsage.heapTotal;
    const totalMemory = heapTotal > 0 ? heapTotal : memUsage.rss;
    const usedMemory = memUsage.heapUsed;
    const percentage =
      totalMemory > 0 ? Math.round((usedMemory / totalMemory) * 100) : 0;

    return {
      used: usedMemory,
      total: totalMemory,
      percentage,
    };
  }

  private async checkAzureOpenAI(): Promise<HealthStatus['azureOpenAI']> {
    if (!this.axiosInstance) {
      return {
        status: 'disconnected',
      };
    }

    try {
      const startTime = Date.now();
      await this.axiosInstance.get('/models', {
        timeout: 5000,
      });
      const responseTime = Date.now() - startTime;

      return {
        status: 'connected',
        responseTime,
      };
    } catch (error) {
      logger.warn('Azure OpenAI health check request failed', '', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        status: 'disconnected',
      };
    }
  }

  private determineHealthStatus(
    memory: HealthStatus['memory'],
    azureOpenAI?: HealthStatus['azureOpenAI']
  ): boolean {
    // Check memory usage - unhealthy if over 90%
    if (memory.percentage > 90) {
      return false;
    }

    // Check Azure OpenAI connection
    if (azureOpenAI && azureOpenAI.status === 'disconnected') {
      return false;
    }

    return true;
  }

  private async initializeAzureClient(): Promise<void> {
    if (!this.hasAzureConfig || this.axiosInstance || this.azureInitAttempted) {
      return;
    }

    this.azureInitAttempted = true;

    try {
      const axiosModule = (await import('axios')) as unknown as AxiosStatic;
      const factory =
        typeof axiosModule.create === 'function'
          ? axiosModule.create.bind(axiosModule)
          : undefined;

      if (!factory) {
        throw new Error('Axios create factory is unavailable');
      }

      const endpointUrl = new URL(this.azureEndpoint);
      if (endpointUrl.protocol !== 'https:') {
        throw new Error('Azure OpenAI endpoint must use HTTPS');
      }

      this.axiosInstance = factory({
        baseURL: endpointUrl.toString(),
        headers: {
          'api-key': this.azureApiKey,
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      this.axiosInstance = undefined;
      logger.warn('Failed to initialize Azure health client', '', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Register a health check function
   */
  registerHealthCheck(check: RegisteredHealthCheck): void {
    this.healthChecks.set(check.name, check);
  }

  /**
   * Start monitoring with the given interval
   */
  startMonitoring(intervalMs: number): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(() => {
      this.getHealthStatus().catch((error: unknown) => {
        logger.warn('Scheduled health check failed', '', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }

  /**
   * Check health with correlation ID
   */
  async checkHealth(correlationId: string): Promise<HealthStatus> {
    logger.debug('Health status requested', correlationId, {
      cached: this.lastHealthCheck !== undefined,
    });
    return this.getHealthStatus();
  }

  /**
   * Trigger an alert (placeholder implementation)
   */
  triggerAlert(alert: HealthAlert): Promise<void> {
    logger.warn('Health alert triggered', '', {
      alert,
    });
    return Promise.resolve();
  }
}

// Global health monitor instance - will be initialized when needed
let healthMonitorInstance: HealthMonitor | null = null;

export const getHealthMonitor = (config?: ServerConfig): HealthMonitor => {
  if (!healthMonitorInstance && config) {
    healthMonitorInstance = new HealthMonitor(config);
  }
  if (!healthMonitorInstance) {
    throw new Error(
      'Health monitor not initialized. Call getHealthMonitor with config first.'
    );
  }
  return healthMonitorInstance;
};

// For backward compatibility
export const healthMonitor = {
  registerHealthCheck: (check: RegisteredHealthCheck) =>
    getHealthMonitor().registerHealthCheck(check),
  startMonitoring: (intervalMs: number) =>
    getHealthMonitor().startMonitoring(intervalMs),
  stopMonitoring: () => getHealthMonitor().stopMonitoring(),
  checkHealth: (correlationId: string) =>
    getHealthMonitor().checkHealth(correlationId),
  getHealthStatus: () => getHealthMonitor().getHealthStatus(),
  triggerAlert: (alert: HealthAlert) => getHealthMonitor().triggerAlert(alert),
};
