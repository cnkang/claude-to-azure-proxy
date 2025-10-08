import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GracefulDegradationManager,
  gracefulDegradationManager,
  checkFeatureAvailability,
} from '../src/resilience/graceful-degradation.js';
import { ServiceUnavailableError } from '../src/errors/index.js';
import { circuitBreakerRegistry } from '../src/resilience/circuit-breaker.js';

// Mock the logger
vi.mock('../src/middleware/logging.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Graceful Degradation Manager', () => {
  let manager: GracefulDegradationManager;

  beforeEach(() => {
    manager = new GracefulDegradationManager();
  });

  describe('Service Levels', () => {
    it('should start with full service level', () => {
      const currentLevel = manager.getCurrentServiceLevel();

      expect(currentLevel.name).toBe('full');
      expect(currentLevel.features).toContain('completions');
      expect(currentLevel.features).toContain('models');
      expect(currentLevel.features).toContain('streaming');
      expect(currentLevel.features).toContain('health');
      expect(currentLevel.features).toContain('metrics');
    });

    it('should check feature availability correctly', () => {
      expect(manager.isFeatureAvailable('completions')).toBe(true);
      expect(manager.isFeatureAvailable('streaming')).toBe(true);
      expect(manager.isFeatureAvailable('nonexistent')).toBe(false);
    });

    it('should degrade service level', () => {
      manager.degradeServiceLevel('Test degradation', 'test-correlation-id');

      const currentLevel = manager.getCurrentServiceLevel();
      expect(currentLevel.name).toBe('degraded');
      expect(currentLevel.features).toContain('completions');
      expect(currentLevel.features).toContain('models');
      expect(currentLevel.features).toContain('health');
      expect(currentLevel.features).not.toContain('streaming');
      expect(currentLevel.features).not.toContain('metrics');
    });

    it('should restore service level', () => {
      // First degrade
      manager.degradeServiceLevel('Test degradation', 'test-correlation-id');
      expect(manager.getCurrentServiceLevel().name).toBe('degraded');

      // Then restore
      manager.restoreServiceLevel('test-correlation-id');
      expect(manager.getCurrentServiceLevel().name).toBe('full');
    });

    it('should not degrade beyond minimal level', () => {
      // Degrade to degraded
      manager.degradeServiceLevel('First degradation', 'test-correlation-id');
      expect(manager.getCurrentServiceLevel().name).toBe('degraded');

      // Degrade to minimal
      manager.degradeServiceLevel('Second degradation', 'test-correlation-id');
      expect(manager.getCurrentServiceLevel().name).toBe('minimal');

      // Try to degrade further (should stay at minimal)
      manager.degradeServiceLevel('Third degradation', 'test-correlation-id');
      expect(manager.getCurrentServiceLevel().name).toBe('minimal');
    });

    it('should not restore beyond full level', () => {
      // Try to restore when already at full
      manager.restoreServiceLevel('test-correlation-id');
      expect(manager.getCurrentServiceLevel().name).toBe('full');
    });

    it('should reset to full service', () => {
      // Degrade to minimal
      manager.degradeServiceLevel('Test degradation 1', 'test-correlation-id');
      manager.degradeServiceLevel('Test degradation 2', 'test-correlation-id');
      expect(manager.getCurrentServiceLevel().name).toBe('minimal');

      // Reset to full
      manager.resetToFullService('test-correlation-id');
      expect(manager.getCurrentServiceLevel().name).toBe('full');
    });
  });

  describe('Degradation Strategies', () => {
    it('should register custom strategies', () => {
      const customStrategy = {
        name: 'custom_test',
        priority: 1,
        condition: (context: any) => context.operation === 'test',
        execute: async (context: any) => ({
          success: true,
          data: 'custom_result',
          fallbackUsed: 'custom_test',
          degraded: true,
        }),
      };

      manager.registerStrategy(customStrategy);

      const stats = manager.getStatistics();
      expect(stats.registeredStrategies).toBeGreaterThan(3); // Default + custom
    });

    it('should execute cached response strategy', async () => {
      const context = {
        correlationId: 'test-correlation-id',
        operation: 'completions',
        attempt: 2, // Second attempt triggers cached response
        error: new Error('Service unavailable'),
      };

      const result = await manager.executeGracefulDegradation(context);

      expect(result.success).toBe(true);
      expect(result.fallbackUsed).toBe('cached_response');
      expect(result.degraded).toBe(true);
      expect(result.data).toHaveProperty('type', 'completion');
      expect(result.data).toHaveProperty('completion');
    });

    it('should execute static response strategy', async () => {
      const context = {
        correlationId: 'test-correlation-id',
        operation: 'completions',
        attempt: 1, // First attempt, cached response not applicable
        error: new Error('Service unavailable'),
      };

      const result = await manager.executeGracefulDegradation(context);

      expect(result.success).toBe(true);
      expect(result.fallbackUsed).toBe('static_response');
      expect(result.degraded).toBe(true);
      expect(result.data).toHaveProperty('type', 'completion');
    });

    it('should fall back to service unavailable strategy', async () => {
      const context = {
        correlationId: 'test-correlation-id',
        operation: 'unsupported_operation',
        attempt: 1,
        error: new Error('Service unavailable'),
      };

      await expect(manager.executeGracefulDegradation(context)).rejects.toThrow(
        ServiceUnavailableError
      );
    });

    it('should execute strategies in priority order', async () => {
      const executionOrder: string[] = [];

      // Register strategies with different priorities
      manager.registerStrategy({
        name: 'high_priority',
        priority: 1,
        condition: () => true,
        execute: async () => {
          executionOrder.push('high_priority');
          return {
            success: true,
            data: 'high_priority_result',
            fallbackUsed: 'high_priority',
            degraded: true,
          };
        },
      });

      manager.registerStrategy({
        name: 'low_priority',
        priority: 5,
        condition: () => true,
        execute: async () => {
          executionOrder.push('low_priority');
          return {
            success: true,
            data: 'low_priority_result',
            fallbackUsed: 'low_priority',
            degraded: true,
          };
        },
      });

      const context = {
        correlationId: 'test-correlation-id',
        operation: 'test',
        attempt: 1,
      };

      const result = await manager.executeGracefulDegradation(context);

      expect(result.fallbackUsed).toBe('high_priority');
      expect(executionOrder).toEqual(['high_priority']);
    });

    it('should try next strategy if current one fails', async () => {
      const executionOrder: string[] = [];

      manager.registerStrategy({
        name: 'failing_strategy',
        priority: 1,
        condition: () => true,
        execute: async () => {
          executionOrder.push('failing_strategy');
          throw new Error('Strategy failed');
        },
      });

      manager.registerStrategy({
        name: 'working_strategy',
        priority: 2,
        condition: () => true,
        execute: async () => {
          executionOrder.push('working_strategy');
          return {
            success: true,
            data: 'working_result',
            fallbackUsed: 'working_strategy',
            degraded: true,
          };
        },
      });

      const context = {
        correlationId: 'test-correlation-id',
        operation: 'test',
        attempt: 1,
      };

      const result = await manager.executeGracefulDegradation(context);

      expect(result.fallbackUsed).toBe('working_strategy');
      expect(executionOrder).toEqual(['failing_strategy', 'working_strategy']);
    });
  });

  describe('Auto-Adjustment Based on Circuit Breakers', () => {
    beforeEach(() => {
      // Mock circuit breaker registry
      vi.spyOn(circuitBreakerRegistry, 'getHealthStatus');
    });

    it('should degrade when more than 50% circuit breakers are unhealthy', () => {
      (circuitBreakerRegistry.getHealthStatus as any).mockReturnValue({
        service1: false,
        service2: false,
        service3: true,
      });

      manager.autoAdjustServiceLevel('test-correlation-id');

      expect(manager.getCurrentServiceLevel().name).toBe('degraded');
    });

    it('should degrade to minimal when more than 80% circuit breakers are unhealthy', () => {
      // First degrade to degraded level
      manager.degradeServiceLevel('Initial degradation', 'test-correlation-id');
      expect(manager.getCurrentServiceLevel().name).toBe('degraded');

      (circuitBreakerRegistry.getHealthStatus as any).mockReturnValue({
        service1: false,
        service2: false,
        service3: false,
        service4: false,
        service5: true,
      });

      manager.autoAdjustServiceLevel('test-correlation-id');

      // Should degrade further to minimal
      expect(manager.getCurrentServiceLevel().name).toBe('minimal');
    });

    it('should restore when all circuit breakers are healthy', () => {
      // First degrade
      manager.degradeServiceLevel('Test degradation', 'test-correlation-id');
      expect(manager.getCurrentServiceLevel().name).toBe('degraded');

      (circuitBreakerRegistry.getHealthStatus as any).mockReturnValue({
        service1: true,
        service2: true,
        service3: true,
      });

      manager.autoAdjustServiceLevel('test-correlation-id');

      expect(manager.getCurrentServiceLevel().name).toBe('full');
    });

    it('should not adjust when no circuit breakers exist', () => {
      (circuitBreakerRegistry.getHealthStatus as any).mockReturnValue({});

      manager.autoAdjustServiceLevel('test-correlation-id');

      expect(manager.getCurrentServiceLevel().name).toBe('full');
    });
  });

  describe('Statistics and Information', () => {
    it('should provide current statistics', () => {
      const stats = manager.getStatistics();

      expect(stats).toHaveProperty('currentLevel');
      expect(stats).toHaveProperty('registeredStrategies');
      expect(stats).toHaveProperty('availableFeatures');
      expect(stats.currentLevel).toBe('full');
      expect(stats.registeredStrategies).toBeGreaterThan(0);
      expect(Array.isArray(stats.availableFeatures)).toBe(true);
    });

    it('should provide all service levels', () => {
      const levels = manager.getServiceLevels();

      expect(levels).toHaveLength(3);
      expect(levels[0].name).toBe('full');
      expect(levels[1].name).toBe('degraded');
      expect(levels[2].name).toBe('minimal');
    });

    it('should provide current service level details', () => {
      const level = manager.getCurrentServiceLevel();

      expect(level).toHaveProperty('name');
      expect(level).toHaveProperty('features');
      expect(level).toHaveProperty('description');
      expect(Array.isArray(level.features)).toBe(true);
    });
  });
});

describe('Global Graceful Degradation Manager', () => {
  it('should be available as singleton', () => {
    expect(gracefulDegradationManager).toBeDefined();
    expect(gracefulDegradationManager).toBeInstanceOf(
      GracefulDegradationManager
    );
  });

  it('should maintain state across imports', () => {
    const initialLevel = gracefulDegradationManager.getCurrentServiceLevel();
    gracefulDegradationManager.degradeServiceLevel('Test', 'test-id');

    const degradedLevel = gracefulDegradationManager.getCurrentServiceLevel();
    expect(degradedLevel.name).not.toBe(initialLevel.name);

    // Reset for other tests
    gracefulDegradationManager.resetToFullService('test-id');
  });
});

describe('Feature Availability Middleware', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(() => {
    mockReq = {
      correlationId: 'test-correlation-id',
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    mockNext = vi.fn();
  });

  it('should allow request when feature is available', () => {
    const middleware = checkFeatureAvailability('completions');

    // Ensure feature is available
    gracefulDegradationManager.resetToFullService('test-correlation-id');

    middleware(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledOnce();
    expect(mockRes.status).not.toHaveBeenCalled();
    expect(mockRes.json).not.toHaveBeenCalled();
  });

  it('should block request when feature is unavailable', () => {
    const middleware = checkFeatureAvailability('streaming');

    // Degrade to level where streaming is not available
    gracefulDegradationManager.degradeServiceLevel(
      'Test degradation',
      'test-correlation-id'
    );

    middleware(mockReq, mockRes, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: {
        type: 'service_unavailable',
        message: "Feature 'streaming' is temporarily unavailable",
        correlationId: 'test-correlation-id',
        serviceLevel: 'degraded',
      },
    });

    // Reset for other tests
    gracefulDegradationManager.resetToFullService('test-correlation-id');
  });

  it('should handle missing correlation ID', () => {
    const middleware = checkFeatureAvailability('streaming');

    delete mockReq.correlationId;
    gracefulDegradationManager.degradeServiceLevel(
      'Test degradation',
      'test-correlation-id'
    );

    middleware(mockReq, mockRes, mockNext);

    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          correlationId: 'unknown',
        }),
      })
    );

    // Reset for other tests
    gracefulDegradationManager.resetToFullService('test-correlation-id');
  });
});

describe('Integration with Circuit Breakers', () => {
  beforeEach(() => {
    vi.spyOn(circuitBreakerRegistry, 'getHealthStatus');
  });

  it('should integrate with circuit breaker health status', () => {
    (circuitBreakerRegistry.getHealthStatus as any).mockReturnValue({
      'azure-openai': false,
      'health-check': false,
      metrics: true,
    });

    gracefulDegradationManager.autoAdjustServiceLevel('test-correlation-id');

    // Should degrade due to 2/3 circuit breakers being unhealthy
    expect(gracefulDegradationManager.getCurrentServiceLevel().name).toBe(
      'degraded'
    );

    // Reset for other tests
    gracefulDegradationManager.resetToFullService('test-correlation-id');
  });

  it('should handle empty circuit breaker registry', () => {
    (circuitBreakerRegistry.getHealthStatus as any).mockReturnValue({});

    const initialLevel =
      gracefulDegradationManager.getCurrentServiceLevel().name;
    gracefulDegradationManager.autoAdjustServiceLevel('test-correlation-id');

    // Should not change service level
    expect(gracefulDegradationManager.getCurrentServiceLevel().name).toBe(
      initialLevel
    );
  });
});
