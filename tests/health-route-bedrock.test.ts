/**
 * @fileoverview Tests for health route with Bedrock integration.
 *
 * This test suite validates that the health endpoint properly integrates
 * with AWS Bedrock monitoring and provides comprehensive health status
 * for both Azure OpenAI and AWS Bedrock services.
 *
 * @author Claude-to-Azure Proxy Team
 * @version 1.0.0
 * @since 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { healthCheckHandler } from '../src/routes/health.js';
import type { ServerConfig } from '../src/types/index.js';

// Mock the health monitor
vi.mock('../src/monitoring/health-monitor.js', () => ({
  getHealthMonitor: vi.fn(() => ({
    getBedrockMonitor: vi.fn(() => ({
      checkBedrockHealth: vi.fn(),
    })),
  })),
}));

// Mock axios for Azure OpenAI health checks
vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

// Mock the logger
vi.mock('../src/middleware/logging.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock resilience modules
vi.mock('../src/resilience/index.js', () => ({
  circuitBreakerRegistry: {
    getAllMetrics: vi.fn(() => ({})),
  },
  retryStrategyRegistry: {
    getAllMetrics: vi.fn(() => ({})),
  },
  gracefulDegradationManager: {
    getCurrentServiceLevel: vi.fn(() => 'full'),
  },
}));

// Mock correlation ID middleware
vi.mock('../src/middleware/correlation-id.js', () => ({
  correlationIdMiddleware: (req: any, res: any, next: any) => {
    req.correlationId = 'test-correlation-id';
    next();
  },
}));

describe('Health Route with Bedrock Integration', () => {
  let app: express.Application;
  let mockConfig: ServerConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    
    app = express();
    
    // Add correlation ID middleware
    app.use((req: any, res, next) => {
      req.correlationId = 'test-correlation-id';
      next();
    });

    mockConfig = {
      port: 8080,
      nodeEnv: 'test',
      proxyApiKey: 'test-proxy-key',
      azureOpenAI: {
        endpoint: 'https://test.openai.azure.com',
        apiKey: 'test-azure-key',
        model: 'gpt-4',
      },
    };

    app.get('/health', healthCheckHandler(mockConfig) as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Bedrock Health Integration', () => {
    it('should include Bedrock health status when Bedrock is configured', async () => {
      // Requirement 4.3: Extend health check endpoint to include AWS Bedrock service status validation
      const { getHealthMonitor } = await import('../src/monitoring/health-monitor.js');
      const mockHealthMonitor = {
        getBedrockMonitor: vi.fn(() => ({
          checkBedrockHealth: vi.fn().mockResolvedValue({
            status: 'connected',
            responseTime: 150,
          }),
        })),
      };
      
      vi.mocked(getHealthMonitor).mockReturnValue(mockHealthMonitor as any);

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: expect.any(String),
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        memory: expect.objectContaining({
          used: expect.any(Number),
          total: expect.any(Number),
          percentage: expect.any(Number),
        }),
        awsBedrock: {
          status: 'connected',
          responseTime: 150,
        },
      });
    });

    it('should handle Bedrock health check failure gracefully', async () => {
      const { getHealthMonitor } = await import('../src/monitoring/health-monitor.js');
      const mockHealthMonitor = {
        getBedrockMonitor: vi.fn(() => ({
          checkBedrockHealth: vi.fn().mockResolvedValue({
            status: 'disconnected',
          }),
        })),
      };
      
      vi.mocked(getHealthMonitor).mockReturnValue(mockHealthMonitor as any);

      const response = await request(app).get('/health');

      expect(response.body.awsBedrock).toEqual({
        status: 'disconnected',
      });
    });

    it('should handle missing Bedrock monitor gracefully', async () => {
      const { getHealthMonitor } = await import('../src/monitoring/health-monitor.js');
      const mockHealthMonitor = {
        getBedrockMonitor: vi.fn(() => null), // No Bedrock monitor available
      };
      
      vi.mocked(getHealthMonitor).mockReturnValue(mockHealthMonitor as any);

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.awsBedrock).toBeUndefined();
    });

    it('should handle Bedrock monitor initialization error', async () => {
      const { getHealthMonitor } = await import('../src/monitoring/health-monitor.js');
      const mockHealthMonitor = {
        getBedrockMonitor: vi.fn(() => {
          throw new Error('Bedrock monitor initialization failed');
        }),
      };
      
      vi.mocked(getHealthMonitor).mockReturnValue(mockHealthMonitor as any);

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.awsBedrock).toEqual({
        status: 'disconnected',
      });
    });
  });

  describe('Multi-Service Health Status', () => {
    it('should be healthy when both Azure and Bedrock are connected', async () => {
      // Mock successful Azure OpenAI
      const mockedAxios = await import('axios');
      vi.mocked(mockedAxios.default.get).mockResolvedValue({
        status: 200,
        data: { object: 'list', data: [] },
      });

      // Mock successful Bedrock
      const { getHealthMonitor } = await import('../src/monitoring/health-monitor.js');
      const mockHealthMonitor = {
        getBedrockMonitor: vi.fn(() => ({
          checkBedrockHealth: vi.fn().mockResolvedValue({
            status: 'connected',
            responseTime: 100,
          }),
        })),
      };
      
      vi.mocked(getHealthMonitor).mockReturnValue(mockHealthMonitor as any);

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.azureOpenAI.status).toBe('connected');
      expect(response.body.awsBedrock.status).toBe('connected');
    });

    it('should be healthy when only Azure is connected (Bedrock not configured)', async () => {
      // Mock successful Azure OpenAI
      const mockedAxios = await import('axios');
      vi.mocked(mockedAxios.default.get).mockResolvedValue({
        status: 200,
        data: { object: 'list', data: [] },
      });

      // Mock no Bedrock monitor
      const { getHealthMonitor } = await import('../src/monitoring/health-monitor.js');
      const mockHealthMonitor = {
        getBedrockMonitor: vi.fn(() => null),
      };
      
      vi.mocked(getHealthMonitor).mockReturnValue(mockHealthMonitor as any);

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.azureOpenAI.status).toBe('connected');
      expect(response.body.awsBedrock).toBeUndefined();
    });

    it('should be healthy when only Bedrock is connected (Azure disconnected)', async () => {
      // Mock failed Azure OpenAI
      const mockedAxios = await import('axios');
      vi.mocked(mockedAxios.default.get).mockRejectedValue(new Error('Azure connection failed'));

      // Mock successful Bedrock
      const { getHealthMonitor } = await import('../src/monitoring/health-monitor.js');
      const mockHealthMonitor = {
        getBedrockMonitor: vi.fn(() => ({
          checkBedrockHealth: vi.fn().mockResolvedValue({
            status: 'connected',
            responseTime: 120,
          }),
        })),
      };
      
      vi.mocked(getHealthMonitor).mockReturnValue(mockHealthMonitor as any);

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy'); // Should be healthy because Bedrock is available
      expect(response.body.azureOpenAI.status).toBe('disconnected');
      expect(response.body.awsBedrock.status).toBe('connected');
    });

    it('should be unhealthy when both services are disconnected', async () => {
      // Use production config to avoid test environment bypass
      const prodConfig: ServerConfig = {
        port: 8080,
        nodeEnv: 'production',
        proxyApiKey: 'test-proxy-key',
        azureOpenAI: {
          endpoint: 'https://prod.openai.azure.com', // Non-test endpoint
          apiKey: 'test-azure-key',
          model: 'gpt-4',
        },
      };

      // Create new app with production config
      const prodApp = express();
      prodApp.use((req: any, res, next) => {
        req.correlationId = 'test-correlation-id';
        next();
      });
      prodApp.get('/health', healthCheckHandler(prodConfig) as any);

      // Mock failed Azure OpenAI
      const mockedAxios = await import('axios');
      vi.mocked(mockedAxios.default.get).mockRejectedValue(new Error('Azure connection failed'));

      // Mock failed Bedrock
      const { getHealthMonitor } = await import('../src/monitoring/health-monitor.js');
      const mockHealthMonitor = {
        getBedrockMonitor: vi.fn(() => ({
          checkBedrockHealth: vi.fn().mockResolvedValue({
            status: 'disconnected',
          }),
        })),
      };
      
      vi.mocked(getHealthMonitor).mockReturnValue(mockHealthMonitor as any);

      const response = await request(prodApp).get('/health');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('unhealthy');
      expect(response.body.azureOpenAI.status).toBe('disconnected');
      expect(response.body.awsBedrock.status).toBe('disconnected');
    });
  });

  describe('Structured Logging', () => {
    it('should log health check completion with service status information', async () => {
      // Requirement 4.4: Add structured logging for Bedrock operations without exposing sensitive data
      const { logger } = await import('../src/middleware/logging.js');
      
      // Mock successful services
      const mockedAxios = await import('axios');
      vi.mocked(mockedAxios.default.get).mockResolvedValue({
        status: 200,
        data: { object: 'list', data: [] },
      });

      const { getHealthMonitor } = await import('../src/monitoring/health-monitor.js');
      const mockHealthMonitor = {
        getBedrockMonitor: vi.fn(() => ({
          checkBedrockHealth: vi.fn().mockResolvedValue({
            status: 'connected',
            responseTime: 95,
          }),
        })),
      };
      
      vi.mocked(getHealthMonitor).mockReturnValue(mockHealthMonitor as any);

      await request(app).get('/health');

      expect(logger.info).toHaveBeenCalledWith(
        'Health check completed',
        'test-correlation-id',
        expect.objectContaining({
          status: 'healthy',
          responseTime: expect.any(Number),
          memoryUsage: expect.any(Number),
          azureStatus: 'connected',
          bedrockStatus: 'connected',
          servicesChecked: {
            azure: true,
            bedrock: true,
          },
        })
      );

      // Verify no sensitive data is logged
      const logCalls = vi.mocked(logger.info).mock.calls;
      const loggedData = logCalls.map(call => JSON.stringify(call));
      const combinedLogs = loggedData.join(' ');
      
      expect(combinedLogs).not.toContain('test-azure-key');
      expect(combinedLogs).not.toContain('test-proxy-key');
    });

    it('should log Bedrock debug information when available', async () => {
      const { logger } = await import('../src/middleware/logging.js');
      
      const { getHealthMonitor } = await import('../src/monitoring/health-monitor.js');
      const mockHealthMonitor = {
        getBedrockMonitor: vi.fn(() => ({
          checkBedrockHealth: vi.fn().mockResolvedValue({
            status: 'connected',
            responseTime: 200,
          }),
        })),
      };
      
      vi.mocked(getHealthMonitor).mockReturnValue(mockHealthMonitor as any);

      await request(app).get('/health');

      expect(logger.debug).toHaveBeenCalledWith(
        'Bedrock health check completed',
        'test-correlation-id',
        expect.objectContaining({
          serviceId: 'bedrock',
          status: 'connected',
          responseTime: 200,
        })
      );
    });
  });
});