/**
 * Health monitoring system for the Claude-to-Azure proxy
 * Provides comprehensive health checks including Azure OpenAI connectivity
 */

import type { AxiosInstance, AxiosStatic } from 'axios';
import { ConfigurationError } from '../errors/index';
import { logger } from '../middleware/logging';
import type { HealthCheckResult, ServerConfig } from '../types/index';

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
  private lastCheckTime = 0;
  private readonly hasAzureConfig: boolean;
  private readonly azureEndpoint: string;
  private readonly azureApiKey: string;
  private azureInitAttempted = false;
  private readonly hasBedrockConfig: boolean;
  private bedrockMonitor?: import('./bedrock-monitor.js').BedrockMonitor;
  private readonly healthChecks: Map<string, RegisteredHealthCheck> = new Map();
  private monitoringInterval?: NodeJS.Timeout;

  constructor(config: ServerConfig, cacheTimeoutMs = 30000) {
    this.config = config;
    this.startTime = Date.now();
    this.cacheTimeout = cacheTimeoutMs;

    // Handle Azure OpenAI config
    const azureConfig = config.azureOpenAI;
    if (
      typeof azureConfig?.endpoint === 'string' &&
      azureConfig.endpoint.length > 0
    ) {
      this.azureEndpoint = azureConfig.endpoint.trim();
      this.azureApiKey = azureConfig.apiKey.trim();
      this.hasAzureConfig =
        this.azureEndpoint.length > 0 && this.azureApiKey.length > 0;
    } else {
      this.azureEndpoint = '';
      this.azureApiKey = '';
      this.hasAzureConfig = false;
    }

    // Handle AWS Bedrock config - check if Bedrock is configured
    this.hasBedrockConfig = this.isBedrockConfigured(config);
    if (this.hasBedrockConfig) {
      this.initializeBedrockMonitor(config).catch(() => {
        // Log error silently - console.error disabled by ESLint
      });
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

    // Check AWS Bedrock connectivity (Requirement 4.3)
    let awsBedrockStatus: HealthStatus['awsBedrock'] = undefined;
    if (this.hasBedrockConfig && this.bedrockMonitor) {
      awsBedrockStatus = await this.bedrockMonitor.checkBedrockHealth();
    }

    const isHealthy = this.determineHealthStatus(
      memory,
      azureOpenAIStatus,
      awsBedrockStatus
    );

    const healthStatus: HealthStatus = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime,
      memory,
      azureOpenAI: azureOpenAIStatus,
      awsBedrock: awsBedrockStatus,
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
    azureOpenAI?: HealthStatus['azureOpenAI'],
    awsBedrock?: HealthStatus['awsBedrock']
  ): boolean {
    // Check memory usage - unhealthy if over 90%
    if (memory.percentage > 90) {
      return false;
    }

    // Check Azure OpenAI connection (if configured)
    if (this.hasAzureConfig && azureOpenAI?.status === 'disconnected') {
      return false;
    }

    // Check AWS Bedrock connection (if configured)
    if (this.hasBedrockConfig && awsBedrock?.status === 'disconnected') {
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
        throw new ConfigurationError(
          'Axios create factory is unavailable',
          'health-monitor-init',
          'health_monitor_initialization'
        );
      }

      const endpointUrl = new URL(this.azureEndpoint);
      if (endpointUrl.protocol !== 'https:') {
        throw new ConfigurationError(
          'Azure OpenAI endpoint must use HTTPS',
          'health-monitor-init',
          'health_monitor_initialization'
        );
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

  /**
   * Gets the Bedrock monitor instance for external access.
   */
  getBedrockMonitor():
    | import('./bedrock-monitor.js').BedrockMonitor
    | undefined {
    return this.bedrockMonitor;
  }

  /**
   * Checks if Bedrock is configured by checking environment variables.
   *
   * @private
   * @param _config - Server configuration (unused but required for interface consistency)
   * @returns True if Bedrock is configured
   */

  private isBedrockConfigured(_config: ServerConfig): boolean {
    // Check if AWS Bedrock API key is configured in environment
    const apiKey = process.env.AWS_BEDROCK_API_KEY;
    return apiKey !== undefined && apiKey.length > 0;
  }

  /**
   * Initializes the Bedrock monitor if Bedrock is configured.
   *
   * @private
   * @param _config - Server configuration (unused but required for interface consistency)
   */

  private async initializeBedrockMonitor(_config: ServerConfig): Promise<void> {
    try {
      // Import Bedrock monitor dynamically to avoid circular dependencies
      const { BedrockMonitor } = await import('./bedrock-monitor.js');

      // Get Bedrock configuration from environment variables
      const apiKey = process.env.AWS_BEDROCK_API_KEY;
      const region = process.env.AWS_BEDROCK_REGION ?? 'us-west-2';

      if (apiKey === undefined || apiKey.length === 0) {
        logger.warn('Bedrock API key not found in environment', '', {
          hasApiKey: false,
        });
        return;
      }

      const bedrockConfig = {
        baseURL: `https://bedrock-runtime.${region}.amazonaws.com`,
        apiKey,
        region,
        timeout: Number.parseInt(process.env.AWS_BEDROCK_TIMEOUT ?? '5000', 10),
        maxRetries: Number.parseInt(
          process.env.AWS_BEDROCK_MAX_RETRIES ?? '1',
          10
        ),
      };

      this.bedrockMonitor = new BedrockMonitor(bedrockConfig);

      logger.info('Bedrock monitor initialized', '', {
        region,
        hasApiKey: true,
      });
    } catch (error) {
      logger.warn('Failed to initialize Bedrock monitor', '', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

// Global health monitor instance - will be initialized when needed
let healthMonitorInstance: HealthMonitor | null = null;

export const getHealthMonitor = (config?: ServerConfig): HealthMonitor => {
  if (!healthMonitorInstance && config) {
    healthMonitorInstance = new HealthMonitor(config);
  }
  if (!healthMonitorInstance) {
    throw new ConfigurationError(
      'Health monitor not initialized. Call getHealthMonitor with config first.',
      'health-monitor-access',
      'health_monitor_access'
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
