import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthMonitor } from '../src/monitoring/health-monitor';
import type { ServerConfig } from '../src/types/index';

// Mock axios for Azure OpenAI health checks
vi.mock('axios');
const mockedAxios = vi.mocked(await import('axios'));

describe('Health Monitor', () => {
  let healthMonitor: HealthMonitor;
  const mockConfig = {
    azureOpenAI: {
      endpoint: 'https://test.openai.azure.com',
      apiKey: 'test-api-key',
      model: 'gpt-4',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    healthMonitor = new HealthMonitor(mockConfig);
  });

  describe('Basic Health Check', () => {
    it('should return healthy status when all checks pass', async () => {
      // Mock successful Azure OpenAI response
      const mockAxiosInstance = {
        get: vi.fn().mockResolvedValue({
          status: 200,
          data: { object: 'list', data: [] },
        }),
      };
      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const result = await healthMonitor.getHealthStatus();

      expect(result.status).toBe('healthy');
      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeGreaterThan(0);
      expect(result.memory).toBeDefined();
      expect(result.memory.used).toBeGreaterThan(0);
      expect(result.memory.total).toBeGreaterThan(0);
      expect(result.memory.percentage).toBeGreaterThanOrEqual(0);
      expect(result.memory.percentage).toBeLessThanOrEqual(100);
    });

    it('should include Azure OpenAI status when available', async () => {
      const mockAxiosInstance = {
        get: vi.fn().mockResolvedValue({
          status: 200,
          data: { object: 'list', data: [] },
        }),
      };
      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const result = await healthMonitor.getHealthStatus();

      expect(result.azureOpenAI).toBeDefined();
      expect(result.azureOpenAI!.status).toBe('connected');
      expect(result.azureOpenAI!.responseTime).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy status when Azure OpenAI is down', async () => {
      const mockAxiosInstance = {
        get: vi.fn().mockRejectedValue(new Error('Connection failed')),
      };
      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const result = await healthMonitor.getHealthStatus();

      expect(result.status).toBe('unhealthy');
      expect(result.azureOpenAI).toBeDefined();
      expect(result.azureOpenAI!.status).toBe('disconnected');
      expect(result.azureOpenAI!.responseTime).toBeUndefined();
    });
  });

  describe('Memory Monitoring', () => {
    it('should calculate memory usage correctly', async () => {
      const mockAxiosInstance = {
        get: vi.fn().mockResolvedValue({
          status: 200,
          data: { object: 'list', data: [] },
        }),
      };
      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const result = await healthMonitor.getHealthStatus();

      expect(result.memory.used).toBeGreaterThan(0);
      expect(result.memory.total).toBeGreaterThan(result.memory.used);
      expect(result.memory.percentage).toBe(
        Math.round((result.memory.used / result.memory.total) * 100)
      );
    });

    it('should detect high memory usage', async () => {
      // Mock high memory usage
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = vi.fn().mockReturnValue({
        rss: 1000000000, // 1GB
        heapTotal: 800000000, // 800MB
        heapUsed: 750000000, // 750MB
        external: 50000000, // 50MB
        arrayBuffers: 10000000, // 10MB
      });

      const mockAxiosInstance = {
        get: vi.fn().mockResolvedValue({
          status: 200,
          data: { object: 'list', data: [] },
        }),
      };
      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const result = await healthMonitor.getHealthStatus();

      expect(result.memory.percentage).toBeGreaterThan(50);

      // Restore original function
      process.memoryUsage = originalMemoryUsage;
    });
  });

  describe('Azure OpenAI Health Check', () => {
    it('should handle successful Azure OpenAI connection', async () => {
      const mockAxiosInstance = {
        get: vi.fn().mockResolvedValue({
          status: 200,
          data: { object: 'list', data: [{ id: 'gpt-4' }] },
        }),
      };
      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const result = await healthMonitor.getHealthStatus();

      expect(result.azureOpenAI!.status).toBe('connected');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/models', {
        timeout: 5000,
      });
    });

    it('should handle Azure OpenAI timeout', async () => {
      const mockAxiosInstance = {
        get: vi.fn().mockRejectedValue({
          code: 'ECONNABORTED',
          message: 'timeout of 5000ms exceeded',
        }),
      };
      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const result = await healthMonitor.getHealthStatus();

      expect(result.status).toBe('unhealthy');
      expect(result.azureOpenAI!.status).toBe('disconnected');
    });

    it('should handle Azure OpenAI authentication errors', async () => {
      const mockAxiosInstance = {
        get: vi.fn().mockRejectedValue({
          response: {
            status: 401,
            data: { error: { message: 'Invalid API key' } },
          },
        }),
      };
      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const result = await healthMonitor.getHealthStatus();

      expect(result.status).toBe('unhealthy');
      expect(result.azureOpenAI!.status).toBe('disconnected');
    });

    it('should handle Azure OpenAI rate limiting', async () => {
      const mockAxiosInstance = {
        get: vi.fn().mockRejectedValue({
          response: {
            status: 429,
            data: { error: { message: 'Rate limit exceeded' } },
          },
        }),
      };
      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const result = await healthMonitor.getHealthStatus();

      expect(result.status).toBe('unhealthy');
      expect(result.azureOpenAI!.status).toBe('disconnected');
    });

    it('should measure response time accurately', async () => {
      const mockAxiosInstance = {
        get: vi.fn().mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    status: 200,
                    data: { object: 'list', data: [] },
                  }),
                100
              )
            )
        ),
      };
      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const result = await healthMonitor.getHealthStatus();

      expect(result.azureOpenAI!.responseTime).toBeGreaterThanOrEqual(90);
      expect(result.azureOpenAI!.responseTime).toBeLessThan(200);
    });
  });

  describe('Health Check Caching', () => {
    it('should cache health check results', async () => {
      const mockAxiosInstance = {
        get: vi.fn().mockResolvedValue({
          status: 200,
          data: { object: 'list', data: [] },
        }),
      };
      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      // First call
      const result1 = await healthMonitor.getHealthStatus();

      // Second call immediately after
      const result2 = await healthMonitor.getHealthStatus();

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
      expect(result1.timestamp).toBe(result2.timestamp);
    });

    it('should refresh cache after expiry', async () => {
      const mockAxiosInstance = {
        get: vi.fn().mockResolvedValue({
          status: 200,
          data: { object: 'list', data: [] },
        }),
      };
      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      // Create health monitor with short cache duration
      const shortCacheMonitor = new HealthMonitor(mockConfig, 100); // 100ms cache

      // First call
      await shortCacheMonitor.getHealthStatus();

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Second call after cache expiry
      await shortCacheMonitor.getHealthStatus();

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const mockAxiosInstance = {
        get: vi.fn().mockRejectedValue(new Error('ENOTFOUND')),
      };
      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const result = await healthMonitor.getHealthStatus();

      expect(result.status).toBe('unhealthy');
      expect(result.azureOpenAI!.status).toBe('disconnected');
    });

    it('should handle malformed Azure OpenAI responses', async () => {
      const mockAxiosInstance = {
        get: vi.fn().mockResolvedValue({
          status: 200,
          data: 'invalid json response',
        }),
      };
      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const result = await healthMonitor.getHealthStatus();

      // Should still be healthy as the request succeeded
      expect(result.status).toBe('healthy');
      expect(result.azureOpenAI!.status).toBe('connected');
    });

    it('should handle axios creation errors', async () => {
      mockedAxios.create = vi.fn().mockImplementation(() => {
        throw new Error('Failed to create axios instance');
      });

      const result = await healthMonitor.getHealthStatus();

      expect(result.status).toBe('unhealthy');
      expect(result.azureOpenAI!.status).toBe('disconnected');
    });
  });

  describe('Uptime Tracking', () => {
    it('should track uptime correctly', async () => {
      const mockAxiosInstance = {
        get: vi.fn().mockResolvedValue({
          status: 200,
          data: { object: 'list', data: [] },
        }),
      };
      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const result1 = await healthMonitor.getHealthStatus();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result2 = await healthMonitor.getHealthStatus();

      expect(result2.uptime).toBeGreaterThanOrEqual(result1.uptime);
    });

    it('should start uptime from monitor creation', async () => {
      const mockAxiosInstance = {
        get: vi.fn().mockResolvedValue({
          status: 200,
          data: { object: 'list', data: [] },
        }),
      };
      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      // Wait a bit after creation
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await healthMonitor.getHealthStatus();

      expect(result.uptime).toBeGreaterThan(0);
    });
  });

  describe('Configuration Validation', () => {
    it('should handle missing Azure OpenAI config', async () => {
      const incompleteConfig = {} as Partial<ServerConfig>;
      const monitor = new HealthMonitor(incompleteConfig as ServerConfig);

      const result = await monitor.getHealthStatus();

      expect(result.status).toBe('healthy'); // Basic health should still work
      expect(result.azureOpenAI).toBeUndefined();
    });

    it('should handle invalid Azure OpenAI endpoint', async () => {
      const invalidConfig = {
        azureOpenAI: {
          endpoint: 'invalid-url',
          apiKey: 'test-key',
          model: 'gpt-4',
        },
      };
      const monitor = new HealthMonitor(invalidConfig);

      const result = await monitor.getHealthStatus();

      expect(result.status).toBe('unhealthy');
      expect(result.azureOpenAI!.status).toBe('disconnected');
    });
  });

  describe('Health Status Determination', () => {
    it('should be healthy when memory is normal and Azure OpenAI is connected', async () => {
      const mockAxiosInstance = {
        get: vi.fn().mockResolvedValue({
          status: 200,
          data: { object: 'list', data: [] },
        }),
      };
      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const result = await healthMonitor.getHealthStatus();

      expect(result.status).toBe('healthy');
    });

    it('should be unhealthy when Azure OpenAI is disconnected', async () => {
      const mockAxiosInstance = {
        get: vi.fn().mockRejectedValue(new Error('Connection failed')),
      };
      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const result = await healthMonitor.getHealthStatus();

      expect(result.status).toBe('unhealthy');
    });

    it('should be unhealthy when memory usage is critical', async () => {
      // Mock critical memory usage
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = vi.fn().mockReturnValue({
        rss: 2000000000, // 2GB
        heapTotal: 1800000000, // 1.8GB
        heapUsed: 1750000000, // 1.75GB (very high usage)
        external: 100000000, // 100MB
        arrayBuffers: 50000000, // 50MB
      });

      const mockAxiosInstance = {
        get: vi.fn().mockResolvedValue({
          status: 200,
          data: { object: 'list', data: [] },
        }),
      };
      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const result = await healthMonitor.getHealthStatus();

      // Should be unhealthy due to high memory usage
      expect(result.status).toBe('unhealthy');
      expect(result.memory.percentage).toBeGreaterThan(90);

      // Restore original function
      process.memoryUsage = originalMemoryUsage;
    });
  });

  describe('Timestamp and Formatting', () => {
    it('should provide ISO timestamp', async () => {
      const mockAxiosInstance = {
        get: vi.fn().mockResolvedValue({
          status: 200,
          data: { object: 'list', data: [] },
        }),
      };
      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const result = await healthMonitor.getHealthStatus();

      expect(result.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
      expect(new Date(result.timestamp).getTime()).toBeCloseTo(Date.now(), -3);
    });

    it('should format memory values correctly', async () => {
      const mockAxiosInstance = {
        get: vi.fn().mockResolvedValue({
          status: 200,
          data: { object: 'list', data: [] },
        }),
      };
      mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);

      const result = await healthMonitor.getHealthStatus();

      expect(typeof result.memory.used).toBe('number');
      expect(typeof result.memory.total).toBe('number');
      expect(typeof result.memory.percentage).toBe('number');
      expect(Number.isInteger(result.memory.percentage)).toBe(true);
    });
  });
});
