/**
 * Health monitoring system for the Claude-to-Azure proxy
 * Provides comprehensive health checks including Azure OpenAI connectivity
 */

import type { AxiosInstance, AxiosStatic } from 'axios';
import type { HealthCheckResult, ServerConfig } from '../types/index.js';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  azureOpenAI?: {
    status: 'connected' | 'disconnected';
    responseTime?: number;
  };
}

export class HealthMonitor {
  private config: ServerConfig;
  private startTime: number;
  private axiosInstance?: AxiosInstance;
  private lastHealthCheck?: HealthStatus;
  private cacheTimeout: number;
  private lastCheckTime: number = 0;
  private readonly hasAzureConfig: boolean;
  private readonly azureEndpoint?: string;
  private readonly azureApiKey?: string;
  private azureInitAttempted = false;
  private healthChecks: Map<string, any> = new Map();
  private monitoringInterval?: NodeJS.Timeout;

  constructor(config: ServerConfig, cacheTimeoutMs: number = 30000) {
    this.config = config;
    this.startTime = Date.now();
    this.cacheTimeout = cacheTimeoutMs;
    this.azureEndpoint = config.azureOpenAI?.endpoint;
    this.azureApiKey = config.azureOpenAI?.apiKey;
    this.hasAzureConfig = Boolean(this.azureEndpoint && this.azureApiKey);
  }

  async getHealthStatus(): Promise<HealthStatus> {
    const now = Date.now();
    
    // Return cached result if within cache timeout
    if (this.lastHealthCheck && (now - this.lastCheckTime) < this.cacheTimeout) {
      return this.lastHealthCheck;
    }

    const memory = this.getMemoryUsage();
    const uptimeSeconds = (now - this.startTime) / 1000;
    const uptime = uptimeSeconds > 0 ? uptimeSeconds : Number.EPSILON;

    // Lazily initialize Azure OpenAI client when needed
    await this.initializeAzureClient();

    let azureOpenAIStatus: HealthStatus['azureOpenAI'];
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
      azureOpenAI: azureOpenAIStatus
    };

    this.lastHealthCheck = healthStatus;
    this.lastCheckTime = now;

    return healthStatus;
  }

  private getMemoryUsage() {
    const memUsage = process.memoryUsage();
    const totalMemory = memUsage.heapTotal || memUsage.rss;
    const usedMemory = memUsage.heapUsed;
    
    return {
      used: usedMemory,
      total: totalMemory,
      percentage: Math.round((usedMemory / totalMemory) * 100)
    };
  }

  private async checkAzureOpenAI(): Promise<HealthStatus['azureOpenAI']> {
    if (!this.axiosInstance) {
      return {
        status: 'disconnected'
      };
    }

    try {
      const startTime = Date.now();
      await this.axiosInstance.get('/models', {
        timeout: 5000
      });
      const responseTime = Date.now() - startTime;

      return {
        status: 'connected',
        responseTime
      };
    } catch (error) {
      return {
        status: 'disconnected'
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
      const factory = typeof axiosModule.create === 'function'
        ? axiosModule.create.bind(axiosModule)
        : undefined;

      if (!factory) {
        throw new Error('Axios create factory is unavailable');
      }

      const endpointUrl = new URL(this.azureEndpoint!);
      if (endpointUrl.protocol !== 'https:') {
        throw new Error('Azure OpenAI endpoint must use HTTPS');
      }

      this.axiosInstance = factory({
        baseURL: endpointUrl.toString(),
        headers: {
          'api-key': this.azureApiKey!,
          'Content-Type': 'application/json'
        }
      });
    } catch {
      this.axiosInstance = undefined;
    }
  }

  /**
   * Register a health check function
   */
  registerHealthCheck(check: any): void {
    this.healthChecks.set(check.name, check);
  }

  /**
   * Start monitoring with the given interval
   */
  startMonitoring(intervalMs: number): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    this.monitoringInterval = setInterval(async () => {
      await this.getHealthStatus();
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
    return this.getHealthStatus();
  }

  /**
   * Trigger an alert (placeholder implementation)
   */
  async triggerAlert(alert: any): Promise<void> {
    // Placeholder implementation
    console.warn('Health alert triggered:', alert);
  }
}

// Global health monitor instance - will be initialized when needed
export let healthMonitor: HealthMonitor;
