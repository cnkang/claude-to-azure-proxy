/**
 * Graceful degradation strategies for partial service failures
 * Provides fallback mechanisms and service continuity during failures
 */

import express from 'express';
import { logger } from '../middleware/logging.js';
import { ServiceUnavailableError } from '../errors/index.js';
import type { RequestWithCorrelationId } from '../types/index.js';
import { circuitBreakerRegistry } from './circuit-breaker.js';

export interface DegradationStrategy {
  readonly name: string;
  readonly priority: number;
  readonly condition: (context: DegradationContext) => boolean;
  readonly execute: (context: DegradationContext) => Promise<DegradationResult>;
}

export interface DegradationContext {
  readonly correlationId: string;
  readonly operation: string;
  readonly error?: Error;
  readonly attempt: number;
  readonly metadata?: Record<string, unknown>;
}

export interface DegradationResult {
  readonly success: boolean;
  readonly data?: unknown;
  readonly fallbackUsed: string;
  readonly degraded: boolean;
  readonly message?: string;
}

export interface ServiceLevel {
  readonly name: string;
  readonly features: readonly string[];
  readonly description: string;
}

/**
 * Graceful degradation manager
 */
export class GracefulDegradationManager {
  private readonly strategies = new Map<string, DegradationStrategy>();
  private readonly serviceLevels: ServiceLevel[] = [];
  private currentServiceLevel: ServiceLevel;

  constructor() {
    // Define service levels from full to minimal
    this.serviceLevels = [
      {
        name: 'full',
        features: ['completions', 'models', 'streaming', 'health', 'metrics'],
        description: 'Full service with all features available',
      },
      {
        name: 'degraded',
        features: ['completions', 'models', 'health'],
        description: 'Core functionality with reduced features',
      },
      {
        name: 'minimal',
        features: ['health'],
        description: 'Health checks only, service unavailable',
      },
    ];

    this.currentServiceLevel = this.serviceLevels[0]; // Start with full service
    this.registerDefaultStrategies();
  }

  /**
   * Register default degradation strategies
   */
  private registerDefaultStrategies(): void {
    // Cached response strategy
    this.registerStrategy({
      name: 'cached_response',
      priority: 1,
      condition: (context) => {
        return context.operation === 'completions' && context.attempt > 1;
      },
      execute: async (context) => {
        // In a real implementation, this would check a cache
        await new Promise((resolve) => setTimeout(resolve, 0)); // Minimal async operation
        logger.info('Using cached response fallback', context.correlationId, {
          operation: context.operation,
          attempt: context.attempt,
        });

        return {
          success: true,
          data: {
            id: `cached_${Date.now()}`,
            type: 'completion',
            completion:
              "I apologize, but I'm experiencing temporary difficulties. Please try again in a moment.",
            model: 'claude-3-5-sonnet-20241022',
            stop_reason: 'stop_sequence',
          },
          fallbackUsed: 'cached_response',
          degraded: true,
          message: 'Using cached response due to service issues',
        };
      },
    });

    // Static response strategy
    this.registerStrategy({
      name: 'static_response',
      priority: 2,
      condition: (context) => {
        return context.operation === 'completions';
      },
      execute: async (context) => {
        await new Promise((resolve) => setTimeout(resolve, 0)); // Minimal async operation
        logger.warn('Using static response fallback', context.correlationId, {
          operation: context.operation,
          error: context.error?.message,
        });

        return {
          success: true,
          data: {
            id: `static_${Date.now()}`,
            type: 'completion',
            completion:
              'The service is temporarily experiencing issues. Please try again later.',
            model: 'claude-3-5-sonnet-20241022',
            stop_reason: 'stop_sequence',
          },
          fallbackUsed: 'static_response',
          degraded: true,
          message: 'Using static response due to service unavailability',
        };
      },
    });

    // Service unavailable strategy
    this.registerStrategy({
      name: 'service_unavailable',
      priority: 10,
      condition: () => true, // Always applicable as last resort
      execute: async (context) => {
        await new Promise((resolve) => setTimeout(resolve, 0)); // Minimal async operation
        logger.error(
          'Service unavailable fallback triggered',
          context.correlationId,
          {
            operation: context.operation,
            error: context.error?.message,
          }
        );

        throw new ServiceUnavailableError(
          'Service is temporarily unavailable. Please try again later.',
          context.correlationId,
          300, // Retry after 5 minutes
          context.operation
        );
      },
    });
  }

  /**
   * Register a degradation strategy
   */
  public registerStrategy(strategy: DegradationStrategy): void {
    this.strategies.set(strategy.name, strategy);
    logger.info('Degradation strategy registered', '', {
      name: strategy.name,
      priority: strategy.priority,
    });
  }

  /**
   * Execute degradation strategies for a failed operation
   */
  public async executeGracefulDegradation(
    context: DegradationContext
  ): Promise<DegradationResult> {
    // Get applicable strategies sorted by priority
    const applicableStrategies = Array.from(this.strategies.values())
      .filter((strategy) => strategy.condition(context))
      .sort((a, b) => a.priority - b.priority);

    logger.info('Executing graceful degradation', context.correlationId, {
      operation: context.operation,
      applicableStrategies: applicableStrategies.length,
      attempt: context.attempt,
    });

    // Try each strategy in order
    for (const strategy of applicableStrategies) {
      try {
        const result = await strategy.execute(context);

        logger.info('Degradation strategy succeeded', context.correlationId, {
          strategy: strategy.name,
          operation: context.operation,
          degraded: result.degraded,
        });

        return result;
      } catch (error) {
        logger.warn('Degradation strategy failed', context.correlationId, {
          strategy: strategy.name,
          operation: context.operation,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        // If this is the last strategy, re-throw the error
        if (
          strategy === applicableStrategies[applicableStrategies.length - 1]
        ) {
          throw error;
        }
      }
    }

    // This should never be reached due to the service_unavailable strategy
    throw new ServiceUnavailableError(
      'No degradation strategies available',
      context.correlationId,
      300,
      context.operation
    );
  }

  /**
   * Check if a feature is available at current service level
   */
  public isFeatureAvailable(feature: string): boolean {
    return this.currentServiceLevel.features.includes(feature);
  }

  /**
   * Degrade service level based on system health
   */
  public degradeServiceLevel(reason: string, correlationId: string): void {
    const currentIndex = this.serviceLevels.indexOf(this.currentServiceLevel);

    if (currentIndex < this.serviceLevels.length - 1) {
      const newLevel = this.serviceLevels[currentIndex + 1];

      logger.warn('Service level degraded', correlationId, {
        from: this.currentServiceLevel.name,
        to: newLevel.name,
        reason,
        availableFeatures: newLevel.features,
      });

      this.currentServiceLevel = newLevel;
    }
  }

  /**
   * Restore service level when system recovers
   */
  public restoreServiceLevel(correlationId: string): void {
    const currentIndex = this.serviceLevels.indexOf(this.currentServiceLevel);

    if (currentIndex > 0) {
      const newLevel = this.serviceLevels[currentIndex - 1];

      logger.info('Service level restored', correlationId, {
        from: this.currentServiceLevel.name,
        to: newLevel.name,
        availableFeatures: newLevel.features,
      });

      this.currentServiceLevel = newLevel;
    }
  }

  /**
   * Auto-adjust service level based on circuit breaker states
   */
  public autoAdjustServiceLevel(correlationId: string): void {
    const circuitBreakerHealth = circuitBreakerRegistry.getHealthStatus();
    const unhealthyBreakers = Object.values(circuitBreakerHealth).filter(
      (healthy) => !healthy
    ).length;
    const totalBreakers = Object.keys(circuitBreakerHealth).length;

    if (totalBreakers === 0) {
      return; // No circuit breakers to check
    }

    const unhealthyRatio = unhealthyBreakers / totalBreakers;

    // Degrade to minimal if more than 80% are unhealthy
    if (unhealthyRatio >= 0.8 && this.currentServiceLevel.name !== 'minimal') {
      // Set directly to minimal level
      const minimalLevel = this.serviceLevels.find(
        (level) => level.name === 'minimal'
      );
      if (minimalLevel) {
        logger.warn('Service level degraded to minimal', correlationId, {
          from: this.currentServiceLevel.name,
          to: minimalLevel.name,
          reason: 'Majority of circuit breakers open',
          unhealthyRatio,
          availableFeatures: minimalLevel.features,
        });
        this.currentServiceLevel = minimalLevel;
      }
    }
    // Degrade if more than 50% of circuit breakers are unhealthy
    else if (unhealthyRatio > 0.5 && this.currentServiceLevel.name === 'full') {
      this.degradeServiceLevel('Multiple circuit breakers open', correlationId);
    }
    // Restore if all circuit breakers are healthy
    else if (unhealthyRatio === 0 && this.currentServiceLevel.name !== 'full') {
      this.restoreServiceLevel(correlationId);
    }
  }

  /**
   * Get current service level information
   */
  public getCurrentServiceLevel(): ServiceLevel {
    return { ...this.currentServiceLevel };
  }

  /**
   * Get all available service levels
   */
  public getServiceLevels(): ServiceLevel[] {
    return [...this.serviceLevels];
  }

  /**
   * Get degradation statistics
   */
  public getStatistics(): {
    currentLevel: string;
    registeredStrategies: number;
    availableFeatures: readonly string[];
  } {
    return {
      currentLevel: this.currentServiceLevel.name,
      registeredStrategies: this.strategies.size,
      availableFeatures: this.currentServiceLevel.features,
    };
  }

  /**
   * Reset to full service level
   */
  public resetToFullService(correlationId: string): void {
    const fullService = this.serviceLevels[0];

    if (this.currentServiceLevel !== fullService) {
      logger.info('Service level reset to full', correlationId, {
        from: this.currentServiceLevel.name,
        to: fullService.name,
      });

      this.currentServiceLevel = fullService;
    }
  }
}

// Global graceful degradation manager instance
export const gracefulDegradationManager = new GracefulDegradationManager();

/**
 * Middleware to check feature availability
 */
export function checkFeatureAvailability(feature: string) {
  return (
    req: RequestWithCorrelationId,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (!gracefulDegradationManager.isFeatureAvailable(feature)) {
      const correlationId = req.correlationId || 'unknown';

      logger.warn(
        'Feature unavailable at current service level',
        correlationId,
        {
          feature,
          currentLevel:
            gracefulDegradationManager.getCurrentServiceLevel().name,
        }
      );

      return res.status(503).json({
        error: {
          type: 'service_unavailable',
          message: `Feature '${feature}' is temporarily unavailable`,
          correlationId,
          serviceLevel:
            gracefulDegradationManager.getCurrentServiceLevel().name,
        },
      });
    }

    next();
  };
}
